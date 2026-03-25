export type MaterialId = number;

export interface MaterialDescriptor {
  albedoColor?: [number, number, number, number];
  roughness?: number;
  metallic?: number;
  // TODO: Add texture properties (albedoTexture, normalTexture, etc.)
  // TODO: Add alphaMode, alphaCutoff, doubleSided
}

// This interface corresponds to the layout of the material struct in the GPU buffer.
// It must be padded correctly to match shader layout rules (e.g., std140/std430).
export interface Material {
    albedoColor: [number, number, number, number]; // 16 bytes
    roughness: number;   // 4 bytes
    metallic: number;    // 4 bytes
    _pad1: number;       // 4 bytes
    _pad2: number;       // 4 bytes
} // Total: 32 bytes

/**
 * Manages all materials in the scene.
 * This system owns a large GPU buffer where all material properties are stored.
 * Materials are referenced by a simple MaterialId index.
 */
export class MaterialSystem {
    private device: GPUDevice;
    private materials: Map<MaterialId, Material> = new Map();
    private buffer: GPUBuffer;
    private dirtyHandles: Set<MaterialId> = new Set();
    private nextHandle: MaterialId = 0;

    public static readonly MAX_MATERIALS = 4096;
    public static readonly MATERIAL_SIZE_IN_BYTES = 32;

    private stagingBuffer: Float32Array;

    constructor(device: GPUDevice) {
        this.device = device;
        this.buffer = device.createBuffer({
            label: 'Material Buffer',
            size: MaterialSystem.MAX_MATERIALS * MaterialSystem.MATERIAL_SIZE_IN_BYTES,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.stagingBuffer = new Float32Array(MaterialSystem.MAX_MATERIALS * (MaterialSystem.MATERIAL_SIZE_IN_BYTES / 4));
    }

    createMaterial(desc: MaterialDescriptor): MaterialId {
        if (this.materials.size >= MaterialSystem.MAX_MATERIALS) {
            throw new Error(`Maximum number of materials (${MaterialSystem.MAX_MATERIALS}) reached.`);
        }

        const handle = this.nextHandle++;
        
        const newMaterial: Material = {
            albedoColor: desc.albedoColor ?? [1, 1, 1, 1],
            roughness: desc.roughness ?? 0.5,
            metallic: desc.metallic ?? 0.0,
            _pad1: 0,
            _pad2: 0,
        };

        this.materials.set(handle, newMaterial);
        this.dirtyHandles.add(handle);
        return handle;
    }
    
    /**
     * Uploads any changed material data to the GPU buffer.
     */
    uploadDirty(): void {
        if (this.dirtyHandles.size === 0) {
            return;
        }

        for (const handle of this.dirtyHandles) {
            const material = this.materials.get(handle);
            if (!material) continue;

            const offsetInFloats = handle * (MaterialSystem.MATERIAL_SIZE_IN_BYTES / 4);
            this.stagingBuffer.set(material.albedoColor, offsetInFloats);
            this.stagingBuffer[offsetInFloats + 4] = material.roughness;
            this.stagingBuffer[offsetInFloats + 5] = material.metallic;
        }
        
        // In a real scenario, you might only write the ranges that are dirty.
        this.device.queue.writeBuffer(this.buffer, 0, this.stagingBuffer.buffer);

        this.dirtyHandles.clear();
    }

    public getBuffer(): GPUBuffer {
        return this.buffer;
    }
}
