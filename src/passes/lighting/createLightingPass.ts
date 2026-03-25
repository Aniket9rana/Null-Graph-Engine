import type { PassDescriptor, ResourceHandle } from "../../rendergraph/RenderGraph";
import type { LightBuffer } from "./LightBuffer";
import type { CascadedShadowSystem } from "../shadow/CascadedShadowSystem";
import lightingShader from './lighting.wgsl?raw';
import shadowSampleShader from '../shadow/shadow_sample.wgsl?raw';

type mat4 = Float32Array | number[];

/**
 * Creates a descriptor for the deferred lighting pass.
 * This pass reads the G-Buffer textures and applies PBR lighting calculations
 * based on a list of dynamic lights and a cascaded shadow map.
 */
export function createLightingPass(
    albedo: ResourceHandle,
    normal: ResourceHandle,
    depth: ResourceHandle,
    metalRough: ResourceHandle,
    lightBuffer: LightBuffer,
    cameraPos: [number, number, number],
    inverseViewProjectionMatrix: mat4,
    hdrColor: ResourceHandle,
    shadowMap: ResourceHandle,
    cascadedShadowSystem: CascadedShadowSystem
): PassDescriptor {
    let pipeline: GPURenderPipeline | undefined;
    let bindGroup: GPUBindGroup | undefined;
    let cameraUniformBuffer: GPUBuffer | undefined;
    let shadowUniformBuffer: GPUBuffer | undefined;

    const cameraUniformData = new Float32Array(4 + 16); // vec3 + padding + mat4
    const shadowUniformData = new Float32Array(4 * 16 + 4); // 4 mat4s + 4 floats for splits

    return {
        reads: [albedo, normal, depth, metalRough, shadowMap],
        writes: [hdrColor],
        execute: (ctx) => {
            const { commandEncoder, device } = ctx;

            if (!pipeline) {
                cameraUniformBuffer = device.createBuffer({
                    label: 'Lighting Camera Uniforms',
                    size: cameraUniformData.byteLength,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
                shadowUniformBuffer = device.createBuffer({
                    label: 'Shadow Uniforms',
                    size: shadowUniformData.byteLength,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });

                const shaderModule = device.createShaderModule({
                    label: 'Lighting Pass Shader',
                    code: lightingShader + "\n" + shadowSampleShader, // Combine shaders
                });
                
                const bindGroupLayout = device.createBindGroupLayout({
                    label: 'Lighting BGL',
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
                        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                        { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, // Lights
                        { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Light Count
                        { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Camera Uniforms
                        { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', viewDimension: '2d-array' } },
                        { binding: 9, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
                        { binding: 10, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Shadow Uniforms
                    ],
                });
                
                const pipelineLayout = device.createPipelineLayout({
                    bindGroupLayouts: [bindGroupLayout],
                });

                pipeline = device.createRenderPipeline({
                    label: 'Lighting Pass Pipeline',
                    layout: pipelineLayout,
                    vertex: { module: shaderModule, entryPoint: 'vs_main' },
                    fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format: ctx.getTexture(hdrColor).format }] },
                    primitive: { topology: 'triangle-list' },
                });
            }
            
            // Update camera uniforms
            cameraUniformData.set(cameraPos);
            cameraUniformData.set(inverseViewProjectionMatrix, 4);
            device.queue.writeBuffer(cameraUniformBuffer!, 0, cameraUniformData);

            // Update shadow uniforms
            for (let i = 0; i < cascadedShadowSystem.lightSpaceMatrices.length; i++) {
                shadowUniformData.set(cascadedShadowSystem.lightSpaceMatrices[i], i * 16);
            }
            shadowUniformData.set(cascadedShadowSystem.cascadeSplits, 4 * 16);
            device.queue.writeBuffer(shadowUniformBuffer!, 0, shadowUniformData);
            
            // Re-create bind group every frame
            bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
                    { binding: 1, resource: ctx.getTextureView(albedo) },
                    { binding: 2, resource: ctx.getTextureView(normal) },
                    { binding: 3, resource: ctx.getTextureView(depth) },
                    { binding: 4, resource: ctx.getTextureView(metalRough) },
                    { binding: 5, resource: { buffer: lightBuffer.getBuffer() } },
                    { binding: 6, resource: { buffer: lightBuffer.getLightCountBuffer() } },
                    { binding: 7, resource: { buffer: cameraUniformBuffer! } },
                    { binding: 8, resource: ctx.getTextureView(shadowMap) },
                    { binding: 9, resource: device.createSampler({ compare: 'less' }) },
                    { binding: 10, resource: { buffer: shadowUniformBuffer! } },
                ],
            });

            const passEncoder = commandEncoder.beginRenderPass({
                label: 'Lighting Pass',
                colorAttachments: [{ view: ctx.getTextureView(hdrColor), clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, loadOp: 'clear', storeOp: 'store' }],
            });
            
            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.draw(3);
            
            passEncoder.end();
        }
    };
}
