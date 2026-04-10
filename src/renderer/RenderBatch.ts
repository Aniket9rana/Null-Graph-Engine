export class RenderBatch {
    public vertexBuffers: {
        buffer: GPUBuffer;
        layout: GPUVertexBufferLayout;
    }[];
    public indexBuffer: GPUBuffer;
    public indexCount: number;
    public instanceCount: number = 0;
    public scratchBuffer: Float32Array;

    private device: GPUDevice;
    private instanceBuffer: GPUBuffer;

    constructor(
        device: GPUDevice,
        vertexBuffers: { buffer: GPUBuffer; layout: GPUVertexBufferLayout }[],
        indexBuffer: GPUBuffer,
        indexCount: number,
        maxInstances: number,
        instanceStride: number,
    ) {
        this.device = device;
        this.vertexBuffers = vertexBuffers;
        this.indexBuffer = indexBuffer;
        this.indexCount = indexCount;

        this.scratchBuffer = new Float32Array(maxInstances * instanceStride);
        this.instanceBuffer = device.createBuffer({
            label: 'Instance Buffer',
            size: this.scratchBuffer.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // Add the instance buffer to the list of vertex buffers.
        this.vertexBuffers.push({
            buffer: this.instanceBuffer,
            layout: {
                arrayStride: instanceStride * 4,
                stepMode: 'instance',
                attributes: [
                    // pos (3), rot (4), scale (3), color (4), pbr (2) = 16 floats
                    { shaderLocation: 3, offset: 0, format: 'float32x3' }, // pos
                    { shaderLocation: 4, offset: 12, format: 'float32x4' }, // rot
                    { shaderLocation: 5, offset: 28, format: 'float32x3' }, // scale
                    { shaderLocation: 6, offset: 40, format: 'float32x4' }, // color
                    { shaderLocation: 7, offset: 56, format: 'float32x2' }, // pbr
                ],
            },
        });
    }

    public updateInstances(data: Float32Array): void {
        this.device.queue.writeBuffer(this.instanceBuffer, 0, data.buffer);
    }
}
