// Corresponds to the Light struct in lighting.wgsl
// All properties are in world-space.
export interface Light {
    // w=0 for directional, w=1 for point, w=2 for spot
    position: [number, number, number, number]; 
    color: [number, number, number];
    intensity: number;
    direction: [number, number, number]; // For directional/spot lights
    range: number; // For point/spot lights
    spotAngle: number; // For spot lights (cosine of half-angle)
    _pad: [number, number, number];
}

export type LightHandle = number;

/**
 * Manages a GPU buffer containing up to 1024 dynamic lights.
 */
export class LightBuffer {
    private device: GPUDevice;
    private lights: Map<LightHandle, Light> = new Map();
    private buffer: GPUBuffer;
    private dirtyHandles: Set<LightHandle> = new Set();
    private nextHandle: LightHandle = 0 as LightHandle;

    public static readonly MAX_LIGHTS = 1024;
    // The stride of the Light struct in bytes, must match WGSL struct layout.
    // vec4<f32> = 16, vec3<f32> = 12, f32 = 4
    // position:  16
    // color:     12 + intensity: 4 = 16
    // direction: 12 + range: 4 = 16
    // spotAngle: 4 + _pad: 12 = 16
    // Total = 64 bytes
    public static readonly LIGHT_SIZE_IN_BYTES = 64;

    private stagingBuffer: Float32Array;
    private lightCountBuffer: GPUBuffer;
    private lightCountArray = new Uint32Array(4); // 16 bytes aligned

    constructor(device: GPUDevice) {
        this.device = device;
        this.buffer = device.createBuffer({
            label: 'Light Buffer',
            size: LightBuffer.MAX_LIGHTS * LightBuffer.LIGHT_SIZE_IN_BYTES,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.stagingBuffer = new Float32Array(LightBuffer.MAX_LIGHTS * (LightBuffer.LIGHT_SIZE_IN_BYTES / 4));
        this.lightCountBuffer = device.createBuffer({
            label: 'Light Count Buffer',
            size: 16, // 4 x u32 to meet 16-byte alignment
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    addLight(lightData: Partial<Omit<Light, '_pad'>>): LightHandle {
        if (this.lights.size >= LightBuffer.MAX_LIGHTS) {
            console.warn(`Cannot add more lights. Maximum of ${LightBuffer.MAX_LIGHTS} reached.`);
            // Find a way to return a failure, for now we will just return an invalid handle.
            return -1 as LightHandle;
        }

        const handle = this.nextHandle++;
        
        const defaultLight: Light = {
            position: [0, 0, 0, 1],
            color: [1, 1, 1],
            intensity: 1,
            direction: [0, -1, 0],
            range: 10,
            spotAngle: Math.cos(Math.PI / 4),
            _pad: [0, 0, 0]
        };

        const newLight = { ...defaultLight, ...lightData };
        this.lights.set(handle, newLight);
        this.dirtyHandles.add(handle);
        return handle;
    }

    removeLight(handle: LightHandle): void {
        if (this.lights.has(handle)) {
            const light = this.lights.get(handle)!;
            light.intensity = 0; // Effectively disable the light
            this.dirtyHandles.add(handle);
            this.lights.delete(handle);
        }
    }

    updateLight(handle: LightHandle, partial: Partial<Omit<Light, '_pad'>>): void {
        if (this.lights.has(handle)) {
            const light = this.lights.get(handle)!;
            Object.assign(light, partial);
            this.dirtyHandles.add(handle);
        }
    }

    public clear(): void {
        this.lights.clear();
        this.dirtyHandles.clear();
        this.nextHandle = 0 as LightHandle;
    }

    /**
     * Uploads any changed light data to the GPU buffer.
     * This should be called once per frame before the lighting pass.
     */
    upload(): void {
        if (this.dirtyHandles.size > 0) {
            for (const handle of this.dirtyHandles) {
                const light = this.lights.get(handle);
                if (!light) continue;

                const offset = handle * (LightBuffer.LIGHT_SIZE_IN_BYTES / 4);
                this.stagingBuffer.set(light.position, offset);
                this.stagingBuffer.set(light.color, offset + 4);
                this.stagingBuffer[offset + 7] = light.intensity;
                this.stagingBuffer.set(light.direction, offset + 8);
                this.stagingBuffer[offset + 11] = light.range;
                this.stagingBuffer[offset + 12] = light.spotAngle;
            }
            
            // This is inefficient as it uploads the whole buffer.
            // A better approach would be to only upload the dirty ranges.
            // However, for a reasonable number of dirty lights, this is fine.
            this.device.queue.writeBuffer(this.buffer, 0, this.stagingBuffer.buffer);

            this.dirtyHandles.clear();
        }

        if (this.lightCountArray[0] !== this.lights.size) {
            this.lightCountArray[0] = this.lights.size;
            this.device.queue.writeBuffer(this.lightCountBuffer, 0, this.lightCountArray.buffer);
        }
    }
    
    public get lightCount(): number {
        return this.lights.size;
    }

    public getBuffer(): GPUBuffer {
        return this.buffer;
    }

    public getLightCountBuffer(): GPUBuffer {
        return this.lightCountBuffer;
    }
}
