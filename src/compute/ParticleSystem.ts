import particleSimulateShader from './particle_simulate.wgsl?raw';

export interface ComputeSystem {
  init(device: GPUDevice, maxParticles: number): Promise<void>;
  dispatch(encoder: GPUCommandEncoder): void;
  getOutputBuffer(): GPUBuffer;
  getDrawArgsBuffer(): GPUBuffer;
}

/**
 * Manages a GPU-driven particle simulation using a ping-pong buffer strategy.
 * The CPU is not involved in the per-frame simulation logic.
 */
export class ParticleSystem implements ComputeSystem {
    private device!: GPUDevice;
    private computePipeline!: GPUComputePipeline;

    private particleStateA!: GPUBuffer;
    private particleStateB!: GPUBuffer;
    private drawArgsBuffer!: GPUBuffer;
    private emitterBuffer!: GPUBuffer;
    
    private maxParticles: number = 0;
    private frame: number = 0;

    async init(device: GPUDevice, maxParticles: number): Promise<void> {
        this.device = device;
        this.maxParticles = maxParticles;

        // Each particle has: pos (3), vel (3), life (1), maxLife (1), color (4) = 12 floats
        const particleStructSize = 12 * 4;
        this.particleStateA = device.createBuffer({
            label: 'Particle State A',
            size: maxParticles * particleStructSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.particleStateB = device.createBuffer({
            label: 'Particle State B',
            size: maxParticles * particleStructSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
        });

        // Indirect draw buffer: indexCount, instanceCount, firstIndex, baseVertex, firstInstance
        this.drawArgsBuffer = device.createBuffer({
            label: 'Particle Draw Args',
            size: 5 * 4,
            usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        // Initialize instance count to 0.
        device.queue.writeBuffer(this.drawArgsBuffer, 4, new Uint32Array([0]));

        this.emitterBuffer = device.createBuffer({
            label: 'Particle Emitter Uniforms',
            size: 16 + 16, // emitterPos, emitRate, gravity, drag etc.
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const shaderModule = device.createShaderModule({
            label: 'Particle Simulate Shader',
            code: particleSimulateShader,
        });

        this.computePipeline = await device.createComputePipelineAsync({
            label: 'Particle Simulate Pipeline',
            layout: 'auto',
            compute: {
                module: shaderModule,
                entryPoint: 'simulate',
            },
        });
    }

    dispatch(encoder: GPUCommandEncoder): void {
        const passEncoder = encoder.beginComputePass({ label: 'Particle Simulation Pass' });
        passEncoder.setPipeline(this.computePipeline);
        
        const readBuffer = this.frame % 2 === 0 ? this.particleStateA : this.particleStateB;
        const writeBuffer = this.frame % 2 === 0 ? this.particleStateB : this.particleStateA;

        const bindGroup = this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: readBuffer } },
                { binding: 1, resource: { buffer: writeBuffer } },
                { binding: 2, resource: { buffer: this.drawArgsBuffer } },
                { binding: 3, resource: { buffer: this.emitterBuffer } },
            ],
        });
        passEncoder.setBindGroup(0, bindGroup);
        
        passEncoder.dispatchWorkgroups(Math.ceil(this.maxParticles / 64));
        
        passEncoder.end();
        
        this.frame++;
    }

    getOutputBuffer(): GPUBuffer {
        // Return the buffer that was written to in the last frame, which is now the read buffer for rendering.
        return this.frame % 2 === 0 ? this.particleStateA : this.particleStateB;
    }

    getDrawArgsBuffer(): GPUBuffer {
        return this.drawArgsBuffer;
    }
}
