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
  persistence?: 'transient' | 'persistent';
}

export interface VirtualBufferDesc {
    size: number;
    usage: GPUBufferUsageFlags;
    persistence?: 'transient' | 'persistent';
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
    private isDirty: boolean = true;

    // Object Pooling for transient memory reuse
    private texturePool: Map<string, GPUTexture[]> = new Map();
    private bufferPool: Map<string, GPUBuffer[]> = new Map();

    private activeTextures: Map<ResourceHandle, GPUTexture> = new Map();
    private activeBuffers: Map<ResourceHandle, GPUBuffer> = new Map();

    private persistentTextures: Map<ResourceHandle, GPUTexture> = new Map();
    private persistentBuffers: Map<ResourceHandle, GPUBuffer> = new Map();

    private resourceNames: Map<string, ResourceHandle> = new Map();
    private resourceLifespans: Map<ResourceHandle, number> = new Map(); // Death pass (compiled index)

    private lastCanvasWidth = 0;
    private lastCanvasHeight = 0;

    constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
        this.device = device;
        this.canvas = canvas;
        this.lastCanvasWidth = canvas.width;
        this.lastCanvasHeight = canvas.height;
    }

    addPass(name: string, desc: PassDescriptor): PassHandle {
        const handle = this.passes.length as PassHandle;
        this.passes.push({
            name,
            descriptor: desc,
            reads: desc.reads,
            writes: desc.writes,
        });
        this.isDirty = true;
        return handle;
    }

    addTexture(name: string, desc: VirtualTextureDesc): ResourceHandle {
        if (this.resourceNames.has(name)) {
            throw new Error(`Resource with name ${name} already exists.`);
        }
        const handle = this.resources.length as ResourceHandle;
        this.resources.push({ type: 'texture', name, persistence: 'transient', ...desc });
        this.resourceNames.set(name, handle);
        this.isDirty = true;
        return handle;
    }

    addBuffer(name: string, desc: VirtualBufferDesc): ResourceHandle {
        if (this.resourceNames.has(name)) {
            throw new Error(`Resource with name ${name} already exists.`);
        }
        const handle = this.resources.length as ResourceHandle;
        this.resources.push({ type: 'buffer', name, persistence: 'transient', ...desc });
        this.resourceNames.set(name, handle);
        this.isDirty = true;
        return handle;
    }

    compile(): void {
        // Cache compilation if nothing has changed structurally
        if (!this.isDirty && this.compiledOrder.length > 0) {
            return; 
        }

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
            return this.passes[passIndex].writes.some(resourceHandle => {
                const readers = resourceRead.get(resourceHandle) || [];
                return readers.length === 0;
            });
        });

        if (finalPasses.length === 0 && this.passes.length > 0) {
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
                    if (usedPasses.has(readerIndex) && passIndex !== readerIndex) {
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

        // 3. Detect cycles
        if (this.compiledOrder.length !== activePassIndices.length) {
            throw new Error("Cycle detected in render graph. This indicates a read-after-write hazard where passes have circular dependencies.");
        }

        // 4. Calculate Resource Lifespans for Memory Pooling
        this.resourceLifespans.clear();
        for (let i = 0; i < this.compiledOrder.length; i++) {
            const passIndex = this.compiledOrder[i];
            const pass = this.passes[passIndex];
            
            for (const handle of pass.reads) {
                this.resourceLifespans.set(handle, i); 
            }
            for (const handle of pass.writes) {
                if (!this.resourceLifespans.has(handle)) {
                    this.resourceLifespans.set(handle, i); 
                } else {
                    this.resourceLifespans.set(handle, Math.max(this.resourceLifespans.get(handle)!, i));
                }
            }
        }

        this.isDirty = false;
    }

    private getTextureHash(desc: GPUTextureDescriptor): string {
        const size = desc.size as any;
        const w = Array.isArray(size) ? size[0] : size.width;
        const h = Array.isArray(size) ? size[1] : size.height;
        const d = Array.isArray(size) ? size[2] : size.depthOrArrayLayers;
        return `${w}_${h}_${d}_${desc.format}_${desc.usage}_${desc.mipLevelCount || 1}`;
    }

    private getBufferHash(desc: GPUBufferDescriptor): string {
        return `${desc.size}_${desc.usage}`;
    }

    public getTexture(handle: ResourceHandle): GPUTexture | undefined {
        return this.persistentTextures.get(handle) || this.activeTextures.get(handle);
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        this.compile(); // Guaranteed up to date with fast early-out

        // Handle window resizes gracefully to avoid leaking VRAM
        if (this.canvas.width !== this.lastCanvasWidth || this.canvas.height !== this.lastCanvasHeight) {
            this.texturePool.forEach(pool => pool.forEach(t => t.destroy()));
            this.texturePool.clear();
            
            // Recreate persistent screen-size textures
            this.persistentTextures.forEach(t => t.destroy()); 
            this.persistentTextures.clear();
            
            this.lastCanvasWidth = this.canvas.width;
            this.lastCanvasHeight = this.canvas.height;
        }

        const passContext: PassContext = {
            commandEncoder,
            device: this.device,
            getTexture: (handle: ResourceHandle): GPUTexture => {
                const resource = this.resources[handle as number];
                if (resource.type !== 'texture') throw new Error(`Resource ${handle} is not a texture.`);
                
                if (resource.persistence === 'persistent') {
                    let tex = this.persistentTextures.get(handle);
                    if (!tex) {
                        const desc = this.resolveTextureDesc(resource);
                        tex = this.device.createTexture(desc);
                        tex.label = `[Persistent] ${resource.name}`;
                        this.persistentTextures.set(handle, tex);
                    }
                    return tex;
                }

                let tex = this.activeTextures.get(handle);
                if (!tex) {
                    const desc = this.resolveTextureDesc(resource);
                    const hash = this.getTextureHash(desc);
                    const pool = this.texturePool.get(hash);
                    
                    if (pool && pool.length > 0) {
                        tex = pool.pop()!;
                        tex.label = `[Pooled] ${resource.name}`;
                    } else {
                        tex = this.device.createTexture(desc);
                        tex.label = `[Transient] ${resource.name}`;
                    }
                    this.activeTextures.set(handle, tex);
                }
                return tex;
            },
            getBuffer: (handle: ResourceHandle): GPUBuffer => {
                const resource = this.resources[handle as number];
                if (resource.type !== 'buffer') throw new Error(`Resource ${handle} is not a buffer.`);
                
                if (resource.persistence === 'persistent') {
                    let buffer = this.persistentBuffers.get(handle);
                    if (!buffer) {
                        buffer = this.device.createBuffer({
                            label: `[Persistent] ${resource.name}`,
                            size: resource.size,
                            usage: resource.usage
                        });
                        this.persistentBuffers.set(handle, buffer);
                    }
                    return buffer;
                }

                let buffer = this.activeBuffers.get(handle);
                if (!buffer) {
                    const desc = { label: resource.name, size: resource.size, usage: resource.usage };
                    const hash = this.getBufferHash(desc);
                    const pool = this.bufferPool.get(hash);
                    
                    if (pool && pool.length > 0) {
                        buffer = pool.pop()!;
                        buffer.label = `[Pooled] ${resource.name}`;
                    } else {
                        buffer = this.device.createBuffer(desc);
                        buffer.label = `[Transient] ${resource.name}`;
                    }
                    this.activeBuffers.set(handle, buffer);
                }
                return buffer;
            },
            getTextureView: (handle: ResourceHandle, descriptor?: GPUTextureViewDescriptor): GPUTextureView => {
                const texture = passContext.getTexture(handle);
                const label = descriptor?.label ? `${texture.label}-view-${descriptor.label}` : `${texture.label}-view`;
                return texture.createView({ label, ...descriptor });
            }
        };

        for (let i = 0; i < this.compiledOrder.length; i++) {
            const passIndex = this.compiledOrder[i];
            const pass = this.passes[passIndex];

            // Wrap each pass in a GPU Debug Marker automatically
            if (commandEncoder.pushDebugGroup) commandEncoder.pushDebugGroup(pass.name);
            
            pass.descriptor.execute(passContext);
            
            if (commandEncoder.popDebugGroup) commandEncoder.popDebugGroup();

            // Release transient textures that reached end of life
            for (const handle of this.activeTextures.keys()) {
                const deathTime = this.resourceLifespans.get(handle);
                if (deathTime === i) {
                    const tex = this.activeTextures.get(handle)!;
                    const resource = this.resources[handle as number] as VirtualTextureDesc & {type: 'texture'};
                    const hash = this.getTextureHash(this.resolveTextureDesc(resource));
                    
                    if (!this.texturePool.has(hash)) this.texturePool.set(hash, []);
                    this.texturePool.get(hash)!.push(tex);
                    
                    this.activeTextures.delete(handle);
                }
            }

            // Release transient buffers that reached end of life
            for (const handle of this.activeBuffers.keys()) {
                const deathTime = this.resourceLifespans.get(handle);
                if (deathTime === i) {
                    const buf = this.activeBuffers.get(handle)!;
                    const resource = this.resources[handle as number] as VirtualBufferDesc & {type: 'buffer'};
                    const hash = this.getBufferHash({ size: resource.size, usage: resource.usage });
                    
                    if (!this.bufferPool.has(hash)) this.bufferPool.set(hash, []);
                    this.bufferPool.get(hash)!.push(buf);
                    
                    this.activeBuffers.delete(handle);
                }
            }
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
        // Destroy transient pools
        this.texturePool.forEach(pool => pool.forEach(t => t.destroy()));
        this.bufferPool.forEach(pool => pool.forEach(b => b.destroy()));
        
        // Destroy active but un-pooled resources
        this.activeTextures.forEach(texture => texture.destroy());
        this.activeBuffers.forEach(buffer => buffer.destroy());
        
        // Destroy persistent resources
        this.persistentTextures.forEach(texture => texture.destroy());
        this.persistentBuffers.forEach(buffer => buffer.destroy());

        this.texturePool.clear();
        this.bufferPool.clear();
        this.activeTextures.clear();
        this.activeBuffers.clear();
        this.persistentTextures.clear();
        this.persistentBuffers.clear();
        
        this.resourceNames.clear();
        this.resourceLifespans.clear();
        this.passes = [];
        this.resources = [];
        this.compiledOrder = [];
        this.isDirty = true;
    }
}
