import type { PassDescriptor, ResourceHandle } from "../../rendergraph/RenderGraph";
import { Camera } from "../../renderer/Camera";
import gridShader from './grid.wgsl?raw';

export function createGridPass(
    albedo: ResourceHandle,
    normal: ResourceHandle,
    depth: ResourceHandle,
    metalRough: ResourceHandle,
    velocity: ResourceHandle,
    camera: Camera,
): PassDescriptor {
    let pipeline: GPURenderPipeline | undefined;
    let bindGroup: GPUBindGroup | undefined;
    let cameraBuffer: GPUBuffer | undefined;

    return {
        reads: [albedo, normal, depth, metalRough, velocity],
        writes: [albedo, normal, depth, metalRough, velocity],
        execute: (ctx) => {
            const { commandEncoder, device } = ctx;

            if (!pipeline) {
                const module = device.createShaderModule({ label: 'Grid Shader', code: gridShader });

                const bindGroupLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
                    ]
                });

                pipeline = device.createRenderPipeline({
                    label: 'Grid Pipeline',
                    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
                    vertex: { module, entryPoint: 'vs_main' },
                    fragment: {
                        module, entryPoint: 'fs_main',
                        targets: [
                            { format: ctx.getTexture(albedo).format },
                            { format: ctx.getTexture(normal).format },
                            { format: ctx.getTexture(metalRough).format },
                            { format: ctx.getTexture(velocity).format },
                        ]
                    },
                    depthStencil: {
                        format: ctx.getTexture(depth).format,
                        depthWriteEnabled: true,
                        depthCompare: 'less',
                    },
                    primitive: { topology: 'triangle-list' },
                });

                // Camera uniform: mat4x4 (64 bytes) + vec3 padded to 16 bytes = 80 bytes
                cameraBuffer = device.createBuffer({
                    label: 'Grid Camera UB',
                    size: 80,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });

                bindGroup = device.createBindGroup({
                    layout: pipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: { buffer: cameraBuffer } }]
                });
            }

            if (cameraBuffer) {
                const vp = camera.getViewProjectionMatrix();
                device.queue.writeBuffer(cameraBuffer, 0, vp.buffer, vp.byteOffset, 64);
                const pos = camera.position;
                device.queue.writeBuffer(cameraBuffer, 64, new Float32Array([pos[0], pos[1], pos[2], 0.0]));
            }

            // We load (not clear) the G-Buffer so we render on top of geometry
            const passEncoder = commandEncoder.beginRenderPass({
                label: 'Grid Pass',
                colorAttachments: [
                    { view: ctx.getTextureView(albedo), loadOp: 'load', storeOp: 'store' },
                    { view: ctx.getTextureView(normal), loadOp: 'load', storeOp: 'store' },
                    { view: ctx.getTextureView(metalRough), loadOp: 'load', storeOp: 'store' },
                    { view: ctx.getTextureView(velocity), loadOp: 'load', storeOp: 'store' },
                ],
                depthStencilAttachment: {
                    view: ctx.getTextureView(depth),
                    depthLoadOp: 'load', depthStoreOp: 'store',
                },
            });

            passEncoder.setPipeline(pipeline!);
            passEncoder.setBindGroup(0, bindGroup!);
            passEncoder.draw(6, 1, 0, 0); // 6 vertices = 2 triangles = one fullscreen-large quad
            passEncoder.end();
        }
    };
}
