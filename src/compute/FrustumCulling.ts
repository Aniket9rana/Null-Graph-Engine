import frustumCullShader from './frustum_cull.wgsl?raw';

export interface ComputeSystem {
  init(device: GPUDevice, maxObjects: number): Promise<void>;
  dispatch(encoder: GPUCommandEncoder): void;
  getOutputBuffer(): GPUBuffer;
}

/**
 * Performs frustum culling on the GPU.
 * Takes a buffer of object bounding boxes and a set of frustum planes,
 * and produces a compacted list of visible instance indices.
 */
export class FrustumCulling implements ComputeSystem {
    private device!: GPUDevice;
    private pipeline!: GPUComputePipeline;

    // A buffer containing an AABB for each object in the scene.
    private boundingBoxBuffer!: GPUBuffer;
    // A buffer containing the 6 planes of the camera frustum.
    private frustumPlanesBuffer!: GPUBuffer;
    // The output buffer containing the indices of visible instances.
    private visibleInstanceBuffer!: GPUBuffer;
    // A buffer to hold arguments for an indirect draw call, with the instance count
    // written by the compute shader.
    private drawArgsBuffer!: GPUBuffer;

    private maxObjects: number = 0;

    async init(device: GPUDevice, maxObjects: number): Promise<void> {
        this.device = device;
        this.maxObjects = maxObjects;

        // AABB: 2x vec3<f32> = 8 floats (min/max) = 32 bytes
        this.boundingBoxBuffer = device.createBuffer({
            label: 'Bounding Box Buffer',
            size: maxObjects * 32,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        // 6 planes, each a vec4<f32> (normal + distance) = 6 * 16 = 96 bytes
        this.frustumPlanesBuffer = device.createBuffer({
            label: 'Frustum Planes Buffer',
            size: 96,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.visibleInstanceBuffer = device.createBuffer({
            label: 'Visible Instance Buffer',
            size: maxObjects * 4, // array<u32>
            usage: GPUBufferUsage.STORAGE,
        });
        
        // This would be more complex for multiple batches. For now, one buffer for one batch.
        this.drawArgsBuffer = device.createBuffer({
            label: 'Culling Draw Args',
            size: 5 * 4,
            usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE,
        });
        
        const shaderModule = device.createShaderModule({
            label: 'Frustum Cull Shader',
            code: frustumCullShader,
        });

        this.pipeline = await device.createComputePipelineAsync({
            label: 'Frustum Cull Pipeline',
            layout: 'auto',
            compute: {
                module: shaderModule,
                entryPoint: 'cull',
            },
        });
    }

    // TODO: Need a method to update the bounding box and frustum planes buffers.

    dispatch(encoder: GPUCommandEncoder): void {
        const passEncoder = encoder.beginComputePass({ label: 'Frustum Culling Pass' });
        passEncoder.setPipeline(this.pipeline);
        
        const bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.boundingBoxBuffer } },
                { binding: 1, resource: { buffer: this.frustumPlanesBuffer } },
                { binding: 2, resource: { buffer: this.visibleInstanceBuffer } },
                { binding: 3, resource: { buffer: this.drawArgsBuffer } },
            ],
        });
        passEncoder.setBindGroup(0, bindGroup);
        
        passEncoder.dispatchWorkgroups(Math.ceil(this.maxObjects / 64));
        
        passEncoder.end();
    }

    getOutputBuffer(): GPUBuffer {
        return this.visibleInstanceBuffer;
    }
}
