import type { PassDescriptor, ResourceHandle } from "../../rendergraph/RenderGraph";
import type { LightBuffer } from "./LightBuffer";
import simpleLightingShader from './simpleLighting.wgsl?raw';

type mat4 = Float32Array | number[];

/**
 * Creates a deferred lighting pass without shadow map dependency.
 * Uses PBR Cook-Torrance BRDF with point & directional lights.
 */
export function createSimpleLightingPass(
    albedo: ResourceHandle,
    normal: ResourceHandle,
    depth: ResourceHandle,
    metalRough: ResourceHandle,
    lightBuffer: LightBuffer,
    cameraPos: [number, number, number],
    inverseViewProjectionMatrix: mat4,
    hdrColor: ResourceHandle,
): PassDescriptor {
    let pipeline: GPURenderPipeline | undefined;
    let bindGroup: GPUBindGroup | undefined;
    let cameraUniformBuffer: GPUBuffer | undefined;

    const cameraUniformData = new Float32Array(4 + 16); // vec3 + padding + mat4

    return {
        reads: [albedo, normal, depth, metalRough],
        writes: [hdrColor],
        execute: (ctx) => {
            const { commandEncoder, device } = ctx;

            if (!pipeline) {
                cameraUniformBuffer = device.createBuffer({
                    label: 'Simple Lighting Camera Uniforms',
                    size: cameraUniformData.byteLength,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });

                const shaderModule = device.createShaderModule({
                    label: 'Simple Lighting Shader',
                    code: simpleLightingShader,
                });

                const bindGroupLayout = device.createBindGroupLayout({
                    label: 'Simple Lighting BGL',
                    entries: [
                        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },          // albedo
                        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },          // normal
                        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } }, // depth
                        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },          // metalRough
                        { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // lights
                        { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // light count
                        { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // camera
                    ],
                });

                const pipelineLayout = device.createPipelineLayout({
                    bindGroupLayouts: [bindGroupLayout],
                });

                pipeline = device.createRenderPipeline({
                    label: 'Simple Lighting Pipeline',
                    layout: pipelineLayout,
                    vertex: { module: shaderModule, entryPoint: 'vs_main' },
                    fragment: {
                        module: shaderModule,
                        entryPoint: 'fs_main',
                        targets: [{ format: ctx.getTexture(hdrColor).format }],
                    },
                    primitive: { topology: 'triangle-list' },
                });
            }

            // Update camera uniforms
            cameraUniformData.set(cameraPos);
            cameraUniformData.set(inverseViewProjectionMatrix as ArrayLike<number>, 4);
            device.queue.writeBuffer(cameraUniformBuffer!, 0, cameraUniformData);

            // Recreate bind group every frame (textures from graph may change)
            bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 1, resource: ctx.getTextureView(albedo) },
                    { binding: 2, resource: ctx.getTextureView(normal) },
                    { binding: 3, resource: ctx.getTextureView(depth) },
                    { binding: 4, resource: ctx.getTextureView(metalRough) },
                    { binding: 5, resource: { buffer: lightBuffer.getBuffer() } },
                    { binding: 6, resource: { buffer: lightBuffer.getLightCountBuffer() } },
                    { binding: 7, resource: { buffer: cameraUniformBuffer! } },
                ],
            });

            const passEncoder = commandEncoder.beginRenderPass({
                label: 'Simple Lighting Pass',
                colorAttachments: [{
                    view: ctx.getTextureView(hdrColor),
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });

            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.draw(3); // Full-screen triangle
            passEncoder.end();
        },
    };
}
