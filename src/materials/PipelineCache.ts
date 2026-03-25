/**
 * Caches compiled GPURenderPipelines to avoid expensive recompilation.
 * A pipeline is uniquely identified by a hash generated from its state
 * (shader code, vertex layouts, render target formats, etc.).
 */
export class PipelineCache {
    private device: GPUDevice;
    private cache: Map<number, GPURenderPipeline> = new Map();
    // For async creation
    private pending: Map<number, Promise<GPURenderPipeline>> = new Map();

    constructor(device: GPUDevice) {
        this.device = device;
    }

    /**
     * Retrieves a pipeline from the cache.
     * @param hash The hash key for the pipeline.
     * @returns The cached pipeline, or undefined if it's not in the cache.
     */
    public get(hash: number): GPURenderPipeline | undefined {
        return this.cache.get(hash);
    }

    /**
     * Stores a pipeline in the cache.
     * @param hash The hash key for the pipeline.
     * @param pipeline The pipeline to cache.
     */
    public set(hash: number, pipeline: GPURenderPipeline): void {
        this.cache.set(hash, pipeline);
    }
    
    /**
     * Gets a pipeline from the cache or creates it if it doesn't exist.
     * This is a synchronous operation and can cause stutter.
     * Prefer getOrCreateAsync for a better user experience.
     * @param hash A hash representing the pipeline state.
     * @param descriptor The descriptor to use for creating the pipeline if it's not cached.
     * @returns The existing or newly created pipeline.
     */
    public getOrCreate(hash: number, descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
        let pipeline = this.get(hash);
        if (!pipeline) {
            pipeline = this.device.createRenderPipeline(descriptor);
            this.set(hash, pipeline);
        }
        return pipeline;
    }

    /**
     * Gets a pipeline from the cache or creates it asynchronously if it doesn't exist.
     * This is the preferred method to avoid blocking the main thread.
     * @param hash A hash representing the pipeline state.
     * @param descriptor The descriptor to use for creating the pipeline.
     * @returns A promise that resolves to the pipeline.
     */
    public async getOrCreateAsync(hash: number, descriptor: GPURenderPipelineDescriptor): Promise<GPURenderPipeline> {
        let pipeline = this.get(hash);
        if (pipeline) {
            return Promise.resolve(pipeline);
        }

        // If a pipeline with this hash is already being compiled, return the existing promise.
        if (this.pending.has(hash)) {
            return this.pending.get(hash)!;
        }

        const promise = this.device.createRenderPipelineAsync(descriptor).then(p => {
            this.set(hash, p);
            this.pending.delete(hash); // Clean up the pending promise
            return p;
        }).catch(err => {
            console.error(`Failed to create pipeline with hash ${hash}`, err);
            this.pending.delete(hash);
            throw err;
        });

        this.pending.set(hash, promise);
        return promise;
    }

    public clear(): void {
        this.cache.clear();
        this.pending.clear();
    }
}
