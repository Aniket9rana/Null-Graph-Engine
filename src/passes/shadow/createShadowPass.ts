import type { PassDescriptor, ResourceHandle } from "../../rendergraph/RenderGraph";
import type { RenderBatch } from '../../renderer/RenderBatch';
import shadowShader from './shadow.wgsl?raw';

/**
 * Creates a descriptor for the cascaded shadow map depth pass.
 * This pass renders the scene from the perspective of the light for each cascade,
 * writing depth values to a layer of a texture array.
 *
 * @param batches The scene geometry to render into the shadow map.
 * @param cascadeCount The number of shadow cascades.
 * @param shadowMap The resource handle for the shadow map texture array.
 * @returns A PassDescriptor for the shadow pass.
 */
export function createShadowPass(
    _batches: RenderBatch[],
    cascadeCount: number,
    shadowMap: ResourceHandle
): PassDescriptor {
    let pipeline: GPURenderPipeline | undefined;

    // TODO: We need a way to get the light-space view-projection matrices for each cascade.
    // This will likely come from a CascadedShadowSystem that runs on the CPU before this pass.

    return {
        reads: [], // This pass sources its data from vertex/instance buffers.
        writes: [shadowMap],
        execute: (ctx) => {
            const { commandEncoder, device } = ctx;

            if (!pipeline) {
                const shaderModule = device.createShaderModule({
                    label: 'Shadow Depth Shader',
                    code: shadowShader,
                });
                pipeline = device.createRenderPipeline({
                    label: 'Shadow Depth Pipeline',
                    layout: 'auto', // TODO: Define a layout for the light-space matrix uniform.
                    vertex: {
                        module: shaderModule,
                        entryPoint: 'vs_main',
                        // TODO: Define vertex buffer layouts for scene geometry.
                    },
                    fragment: undefined, // This is a depth-only pass.
                    depthStencil: {
                        format: ctx.getTexture(shadowMap).format,
                        depthWriteEnabled: true,
                        depthCompare: 'less',
                    },
                    primitive: {
                        topology: 'triangle-list',
                    },
                });
            }

            for (let i = 0; i < cascadeCount; i++) {
                const passEncoder = commandEncoder.beginRenderPass({
                    label: `Shadow Pass Cascade ${i}`,
                    colorAttachments: [], // Depth-only
                    depthStencilAttachment: {
                        // The view needs to be for a single layer of the texture array.
                        // Assuming getTextureView is extended to support this.
                        // Let's assume RenderGraph's getTextureView can take view descriptor options.
                        view: ctx.getTextureView(shadowMap, { baseArrayLayer: i, arrayLayerCount: 1 }),
                        depthClearValue: 1.0,
                        depthLoadOp: 'clear',
                        depthStoreOp: 'store',
                    }
                });

                passEncoder.setPipeline(pipeline!);
                
                // TODO: Set a bind group containing the light-space view-projection matrix for this cascade.
                // passEncoder.setBindGroup(0, cascadeMatrixBindGroups[i]);

                // TODO: Iterate through batches and issue draw calls, similar to the G-Buffer pass.
                // for (const batch of batches) { ... }
                
                passEncoder.end();
            }
        }
    };
}
