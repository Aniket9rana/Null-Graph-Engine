// Opaque handles to internal resources
export type PassHandle = number & { __pass: never };
export type ResourceHandle = number & { __resource: never };

export interface VirtualTextureDesc {
  format: GPUTextureFormat;
  width: number | 'full' | 'half';
  height: number | 'full' | 'half';
  usage: GPUTextureUsageFlags;
  mips?: number;
  layers?: number;
}

export interface VirtualBufferDesc {
    size: number;
    usage: GPUBufferUsageFlags;
}

export interface PassContext {
  commandEncoder: GPUCommandEncoder;
  device: GPUDevice;
  getTexture(handle: ResourceHandle): GPUTexture;
  getBuffer(handle: ResourceHandle): GPUBuffer;
  getTextureView(handle: ResourceHandle, descriptor?: GPUTextureViewDescriptor): GPUTextureView;
}

export interface PassDescriptor {
  reads: ResourceHandle[];
  writes: ResourceHandle[];
  execute: (ctx: PassContext) => void;
}

// Internal representation of a pass
interface Pass {
    name: string;
    descriptor: PassDescriptor;
    reads: ResourceHandle[];
    writes: ResourceHandle[];
}

// Internal representation of a resource
type VirtualResource =
    | ({ type: 'texture'; name: string } & VirtualTextureDesc)
    | ({ type: 'buffer'; name: string } & VirtualBufferDesc);

export class RenderGraph {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;

    private passes: Pass[] = [];
    private resources: VirtualResource[] = [];
    private compiledOrder: number[] = [];

    private realTextures: Map<ResourceHandle, GPUTexture> = new Map();
    private realBuffers: Map<ResourceHandle, GPUBuffer> = new Map();
    private resourceNames: Map<string, ResourceHandle> = new Map();

    constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
        this.device = device;
        this.canvas = canvas;
    }

    addPass(name: string, desc: PassDescriptor): PassHandle {
        const handle = this.passes.length as PassHandle;
        this.passes.push({
            name,
            descriptor: desc,
            reads: desc.reads,
            writes: desc.writes,
        });
        return handle;
    }

    addTexture(name: string, desc: VirtualTextureDesc): ResourceHandle {
        if (this.resourceNames.has(name)) {
            throw new Error(`Resource with name ${name} already exists.`);
        }
        const handle = this.resources.length as ResourceHandle;
        this.resources.push({ type: 'texture', name, ...desc });
        this.resourceNames.set(name, handle);
        return handle;
    }

    addBuffer(name: string, desc: VirtualBufferDesc): ResourceHandle {
        if (this.resourceNames.has(name)) {
            throw new Error(`Resource with name ${name} already exists.`);
        }
        const handle = this.resources.length as ResourceHandle;
        this.resources.push({ type: 'buffer', name, ...desc });
        this.resourceNames.set(name, handle);
        return handle;
    }

    compile(): void {
        const passCount = this.passes.length;
        const resourceRead: Map<ResourceHandle, number[]> = new Map();
        const resourceWrite: Map<ResourceHandle, number> = new Map();

        for (let i = 0; i < this.resources.length; i++) {
            resourceRead.set(i as ResourceHandle, []);
        }

        for (let i = 0; i < passCount; i++) {
            const pass = this.passes[i];
            for (const read of pass.reads) {
                resourceRead.get(read)!.push(i);
            }
            for (const write of pass.writes) {
                resourceWrite.set(write, i);
            }
        }

        // 1. Cull unused passes by working backwards from passes with side effects.
        const finalPasses = this.passes.map((_, i) => i).filter(passIndex => {
            // A pass is considered "final" if any of its outputs are not read by any other pass.
            // This is a heuristic for now. A better system might have explicit 'final' resource marking.
            return this.passes[passIndex].writes.some(resourceHandle => {
                const readers = resourceRead.get(resourceHandle) || [];
                return readers.length === 0;
            });
        });

        if (finalPasses.length === 0 && this.passes.length > 0) {
             // If no pass has unread outputs, something is likely wrong, or it's a simple chain.
             // As a fallback, we can assume the last added pass is the one we care about.
            finalPasses.push(this.passes.length - 1);
        }

        const usedPasses = new Set<number>();
        const queue = [...finalPasses];

        while (queue.length > 0) {
            const passIndex = queue.shift()!;
            if (usedPasses.has(passIndex)) {
                continue;
            }
            usedPasses.add(passIndex);

            // Add the writers of the resources this pass reads to the queue.
            const pass = this.passes[passIndex];
            for (const resourceHandle of pass.reads) {
                const writerPassIndex = resourceWrite.get(resourceHandle);
                if (writerPassIndex !== undefined) {
                    queue.push(writerPassIndex);
                }
            }
        }
        
        const activePassIndices = Array.from(usedPasses);

        // 2. Topologically sort the used passes.
        const inDegree = new Map<number, number>();
        const adj = new Map<number, number[]>();

        for (const passIndex of activePassIndices) {
            inDegree.set(passIndex, 0);
            adj.set(passIndex, []);
        }

        for (const passIndex of activePassIndices) {
            const pass = this.passes[passIndex];
            for (const resource of pass.writes) {
                const readers = resourceRead.get(resource) || [];
                for (const readerIndex of readers) {
                    // Check if the reader is an active pass and there's a dependency.
                    if(usedPasses.has(readerIndex) && passIndex !== readerIndex) {
                        // This creates a directed edge from writer (passIndex) to reader (readerIndex).
                        adj.get(passIndex)!.push(readerIndex);
                        inDegree.set(readerIndex, (inDegree.get(readerIndex) || 0) + 1);
                    }
                }
            }
        }
        
        const sortQueue: number[] = [];
        for (const passIndex of activePassIndices) {
            if (inDegree.get(passIndex) === 0) {
                sortQueue.push(passIndex);
            }
        }
        
        this.compiledOrder = [];
        while (sortQueue.length > 0) {
            const u = sortQueue.shift()!;
            this.compiledOrder.push(u);

            for (const v of adj.get(u)!) {
                inDegree.set(v, inDegree.get(v)! - 1);
                if (inDegree.get(v) === 0) {
                    sortQueue.push(v);
                }
            }
        }

        // 3. Detect read-after-write hazards (cycles).
        if (this.compiledOrder.length !== activePassIndices.length) {
            throw new Error("Cycle detected in render graph. This indicates a read-after-write hazard where passes have circular dependencies.");
        }
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        const passContext: PassContext = {
            commandEncoder,
            device: this.device,
            getTexture: (handle: ResourceHandle): GPUTexture => {
                let texture = this.realTextures.get(handle);
                if (!texture) {
                    const resource = this.resources[handle as number];
                    if (resource.type !== 'texture') {
                        throw new Error(`Resource ${(handle as number)} is not a texture.`);
                    }
                    const desc = this.resolveTextureDesc(resource);
                    texture = this.device.createTexture(desc);
                    texture.label = resource.name;
                    this.realTextures.set(handle, texture);
                }
                return texture;
            },
            getBuffer: (handle: ResourceHandle): GPUBuffer => {
                let buffer = this.realBuffers.get(handle);
                 if (!buffer) {
                    const resource = this.resources[handle as number];
                    if (resource.type !== 'buffer') {
                        throw new Error(`Resource ${(handle as number)} is not a buffer.`);
                    }
                    buffer = this.device.createBuffer({
                        label: resource.name,
                        size: resource.size,
                        usage: resource.usage
                    });
                    this.realBuffers.set(handle, buffer);
                }
                return buffer;
            },
            getTextureView: (handle: ResourceHandle, descriptor?: GPUTextureViewDescriptor): GPUTextureView => {
                const texture = passContext.getTexture(handle);
                const label = descriptor?.label ? `${texture.label}-view-${descriptor.label}` : `${texture.label}-view`;
                return texture.createView({ label, ...descriptor });
            }
        };

        for (const passIndex of this.compiledOrder) {
            const pass = this.passes[passIndex];
            pass.descriptor.execute(passContext);
        }
    }
    
    private resolveTextureDesc(desc: VirtualTextureDesc): GPUTextureDescriptor {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const width = desc.width === 'full' ? canvasWidth : desc.width === 'half' ? canvasWidth / 2 : desc.width;
        const height = desc.height === 'full' ? canvasHeight : desc.height === 'half' ? canvasHeight / 2 : desc.height;

        return {
            size: [width, height, desc.layers || 1],
            format: desc.format,
            usage: desc.usage,
            mipLevelCount: desc.mips,
        };
    }

    destroy(): void {
        this.realTextures.forEach(texture => texture.destroy());
        this.realBuffers.forEach(buffer => buffer.destroy());
        this.realTextures.clear();
        this.realBuffers.clear();
        this.resourceNames.clear();
        this.passes = [];
        this.resources = [];
        this.compiledOrder = [];
    }
}
