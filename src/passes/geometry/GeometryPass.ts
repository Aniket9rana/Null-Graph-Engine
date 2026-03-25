import type { PassDescriptor, ResourceHandle } from "../../rendergraph/RenderGraph";
import type { RenderBatch } from "../../renderer/RenderBatch";
import { Camera } from "../../renderer/Camera";
import geometryShader from './geometry.wgsl?raw';
import gridShader from '../grid/grid.wgsl?raw';

export function createGeometryPass(
    batches: RenderBatch[],
    albedo: ResourceHandle,
    normal: ResourceHandle,
    depth: ResourceHandle,
    metalRough: ResourceHandle,
    velocity: ResourceHandle,
    camera: Camera
): PassDescriptor {
    let pipeline: GPURenderPipeline | undefined;
    let bindGroup: GPUBindGroup | undefined;
    let cameraBuffer: GPUBuffer | undefined;

    // Grid specific
    let gridPipeline: GPURenderPipeline | undefined;
    let gridBindGroup: GPUBindGroup | undefined;
    let gridCameraBuffer: GPUBuffer | undefined;

    return {
        reads: [],
        writes: [albedo, normal, depth, metalRough, velocity],
        execute: (ctx) => {
            const { commandEncoder, device } = ctx;

            // ─── Initialize Geometry Pipeline ─────────────────
            if (!pipeline && (batches.length > 0)) {
                const shaderModule = device.createShaderModule({ label: 'Geometry Shader', code: geometryShader });
                const bgl = device.createBindGroupLayout({
                    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }]
                });

                pipeline = device.createRenderPipeline({
                    label: 'GBuffer Pipeline',
                    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
                    vertex: {
                        module: shaderModule,
                        entryPoint: 'vs_main',
                        buffers: batches[0].vertexBuffers.map(vb => vb.layout),
                    },
                    fragment: {
                        module: shaderModule,
                        entryPoint: 'fs_main',
                        targets: [
                            { format: ctx.getTexture(albedo).format },
                            { format: ctx.getTexture(normal).format },
                            { format: ctx.getTexture(metalRough).format },
                            { format: ctx.getTexture(velocity).format },
                        ],
                    },
                    depthStencil: {
                        format: ctx.getTexture(depth).format,
                        depthWriteEnabled: true,
                        depthCompare: 'less',
                    },
                    primitive: { topology: 'triangle-list' },
                });
                
                cameraBuffer = device.createBuffer({
                    size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
                bindGroup = device.createBindGroup({
                    layout: pipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: { buffer: cameraBuffer } }]
                });
            }

            // ─── Initialize Grid Pipeline ─────────────────────
            if (!gridPipeline) {
                const module = device.createShaderModule({ label: 'Grid Shader', code: gridShader });
                const bgl = device.createBindGroupLayout({
                    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }]
                });

                gridPipeline = device.createRenderPipeline({
                    label: 'Grid Pipeline',
                    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
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

                gridCameraBuffer = device.createBuffer({
                    label: 'Grid Camera UB',
                    size: 80, // mat4x4 + vec3+padding
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });

                gridBindGroup = device.createBindGroup({
                    layout: gridPipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: { buffer: gridCameraBuffer } }]
                });
            }

            // ─── Update Uniforms ──────────────────────────────
            const viewProj = camera.getViewProjectionMatrix();
            if (cameraBuffer) device.queue.writeBuffer(cameraBuffer, 0, viewProj.buffer);
            if (gridCameraBuffer) {
                device.queue.writeBuffer(gridCameraBuffer, 0, viewProj.buffer, viewProj.byteOffset, 64);
                const pos = camera.position;
                device.queue.writeBuffer(gridCameraBuffer, 64, new Float32Array([pos[0], pos[1], pos[2], 0]));
            }
            
            // ─── Render Pass ──────────────────────────────────
            const passEncoder = commandEncoder.beginRenderPass({
                label: 'Combined Geometry & Grid Pass',
                colorAttachments: [
                    { view: ctx.getTextureView(albedo), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
                    { view: ctx.getTextureView(normal), clearValue: { r: 0.5, g: 0.5, b: 1, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                    { view: ctx.getTextureView(metalRough), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                    { view: ctx.getTextureView(velocity), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }
                ],
                depthStencilAttachment: {
                    view: ctx.getTextureView(depth),
                    depthClearValue: 1.0,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store',
                },
            });

            // 1. Draw Geometry
            if (pipeline && bindGroup) {
                passEncoder.setPipeline(pipeline);
                passEncoder.setBindGroup(0, bindGroup);

                for (const batch of batches) {
                    batch.vertexBuffers.forEach((vb, i) => passEncoder.setVertexBuffer(i, vb.buffer));
                    passEncoder.setIndexBuffer(batch.indexBuffer, 'uint32');
                    passEncoder.drawIndexed(batch.indexCount, batch.instanceCount, 0, 0, 0);
                }
            }

            // 2. Draw Grid (Always draws after geometry for correct depth testing)
            if (gridPipeline && gridBindGroup) {
                passEncoder.setPipeline(gridPipeline);
                passEncoder.setBindGroup(0, gridBindGroup);
                passEncoder.draw(6, 1, 0, 0);
            }
            
            passEncoder.end();
        }
    };
}
