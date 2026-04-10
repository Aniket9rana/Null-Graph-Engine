import { Engine } from './Engine';
import { Scene } from './Scene';
import { RenderGraph, ResourceHandle } from '../rendergraph/RenderGraph';
import { RenderBatch } from '../renderer/RenderBatch';
import { Mesh } from './Mesh';
import { Geometry } from './Geometry';
import { Material } from './Material';
import { createGeometryPass } from '../passes/geometry/GeometryPass';
import { createSimpleLightingPass } from '../passes/lighting/createSimpleLightingPass';
import { LightBuffer } from '../passes/lighting/LightBuffer';
import { create, multiply, invert4x4 } from '../math/mat4';
import { PointLight, DirectionalLight } from './Lights';

// Removed unused CUBE geometry arrays

const BLIT_SHADER = /* wgsl */ `
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var t: texture_2d<f32>;

struct VSOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex fn vs_main(@builtin(vertex_index) i: u32) -> VSOutput {
  var pos = array<vec2<f32>, 3>(
    vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0),
  );
  var uv = array<vec2<f32>, 3>(
    vec2(0.0, 1.0), vec2(2.0, 1.0), vec2(0.0, -1.0),
  );
  var out: VSOutput;
  out.pos = vec4(pos[i], 0.0, 1.0);
  out.uv = uv[i];
  return out;
}

@fragment fn fs_main(in: VSOutput) -> @location(0) vec4<f32> {
  let color = textureSample(t, s, in.uv).rgb;
  return vec4(color, 1.0);
}
`;

export class Renderer {
    private engine: Engine;
    private renderGraph: RenderGraph | null = null;
    
    // Geometry & Material batching
    private geometryBatches = new Map<Geometry, Map<Material, RenderBatch>>();
    private activeBatches: RenderBatch[] = [];
    
    private lightBuffer: LightBuffer;
    
    private blitBG: GPUBindGroup | null = null;
    private hHDRHandle: ResourceHandle = -1 as ResourceHandle;
    private lastWidth = 0;
    private lastHeight = 0;

    private invVpMatrix = create();
    private vpMatrix = create();
    private cameraPos: [number, number, number] = [0, 0, 0];

    private blitPipeline!: GPURenderPipeline;
    private blitBGL!: GPUBindGroupLayout;
    private blitSampler!: GPUSampler;

    constructor(engine: Engine) {
        this.engine = engine;
        this.initBlitPass();
        this.lightBuffer = new LightBuffer(engine.device);
    }

    private getOrCreateBatch(geometry: Geometry, material: Material): RenderBatch {
        let matMap = this.geometryBatches.get(geometry);
        if (!matMap) {
            matMap = new Map<Material, RenderBatch>();
            this.geometryBatches.set(geometry, matMap);
        }
        let batch = matMap.get(material);
        if (batch) return batch;

        const { device } = this.engine;
        const vertexBuffer = device.createBuffer({
            label: 'Geometry VB', size: geometry.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices as any);

        const indexBuffer = device.createBuffer({
            label: 'Geometry IB', size: geometry.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indexBuffer, 0, geometry.indices as any);

        const vertexLayout: GPUVertexBufferLayout = {
            arrayStride: 32, stepMode: 'vertex',
            attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' },
                { shaderLocation: 1, offset: 12, format: 'float32x3' },
                { shaderLocation: 2, offset: 24, format: 'float32x2' },
            ],
        };

        const MAX_INSTANCES = 1000;
        const INSTANCE_STRIDE = 16; 
        batch = new RenderBatch(
            device,
            [{ buffer: vertexBuffer, layout: vertexLayout }],
            indexBuffer, geometry.indices.length,
            MAX_INSTANCES, INSTANCE_STRIDE,
        );
        
        matMap.set(material, batch);
        return batch;
    }

    private initBlitPass() {
        const { device } = this.engine;
        const blitModule = device.createShaderModule({ label: 'Blit', code: BLIT_SHADER });
        this.blitBGL = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float'} },
            ],
        });
        this.blitPipeline = device.createRenderPipeline({
            label: 'Blit Pipeline',
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.blitBGL] }),
            vertex: { module: blitModule, entryPoint: 'vs_main' },
            fragment: { module: blitModule, entryPoint: 'fs_main', targets: [{ format: this.engine.presentFormat }] },
            primitive: { topology: 'triangle-list' },
        });
        this.blitSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    }

    private rebuildGraph(scene: Scene) {
        if (this.renderGraph) this.renderGraph.destroy();
        
        const canvas = this.engine.canvas;
        this.renderGraph = new RenderGraph(this.engine.device, canvas);

        const tUsage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        const albedoDesc = { format: 'rgba8unorm' as GPUTextureFormat, width: 'full' as const, height: 'full' as const, usage: tUsage };
        const normalDesc = { format: 'rgba16float' as GPUTextureFormat, width: 'full' as const, height: 'full' as const, usage: tUsage };
        const depthDesc = { format: 'depth32float' as GPUTextureFormat, width: 'full' as const, height: 'full' as const, usage: tUsage };
        const metalRoughDesc = { format: 'rgba8unorm' as GPUTextureFormat, width: 'full' as const, height: 'full' as const, usage: tUsage };
        const velocityDesc = { format: 'rgba16float' as GPUTextureFormat, width: 'full' as const, height: 'full' as const, usage: tUsage };
        const hdrDesc = { format: 'rgba16float' as GPUTextureFormat, width: 'full' as const, height: 'full' as const, usage: tUsage, persistence: 'persistent' as const };

        const hAlbedo = this.renderGraph.addTexture('Albedo', albedoDesc);
        const hNormal = this.renderGraph.addTexture('Normal', normalDesc);
        const hDepth = this.renderGraph.addTexture('Depth', depthDesc);
        const hMetalRough = this.renderGraph.addTexture('MetalRough', metalRoughDesc);
        const hVelocity = this.renderGraph.addTexture('Velocity', velocityDesc);
        this.hHDRHandle = this.renderGraph.addTexture('HDR', hdrDesc);

        this.renderGraph.addPass('Geometry', createGeometryPass(
            this.activeBatches, hAlbedo, hNormal, hDepth, hMetalRough, hVelocity, scene.camera,
        ));

        this.renderGraph.addPass('Lighting', createSimpleLightingPass(
            hAlbedo, hNormal, hDepth, hMetalRough,
            this.lightBuffer, this.cameraPos, this.invVpMatrix, this.hHDRHandle,
        ));

        this.renderGraph.compile();
        this.blitBG = null; 
    }

    public render(scene: Scene) {
        const { canvas, device, gpuCtx } = this.engine;

        if (canvas.width !== this.lastWidth || canvas.height !== this.lastHeight) {
            this.rebuildGraph(scene);
            this.lastWidth = canvas.width;
            this.lastHeight = canvas.height;
        }

        // Camera Uniforms
        this.cameraPos[0] = scene.camera.position[0];
        this.cameraPos[1] = scene.camera.position[1];
        this.cameraPos[2] = scene.camera.position[2];

        multiply(this.vpMatrix, scene.camera.getProjectionMatrix(), scene.camera.getViewMatrix());
        invert4x4(this.invVpMatrix, this.vpMatrix);

        // Sync lights
        // Simple strategy: hacky clear by manually overriding count 
        // We will implement \`clear\` on \`LightBuffer\` next.
        this.lightBuffer.clear();
        for (const light of scene.lights) {
            if (light.type === 'directional') {
                this.lightBuffer.addLight({
                    position: [0, 0, 0, 0],
                    direction: (light as DirectionalLight).direction,
                    color: light.color,
                    intensity: light.intensity,
                    range: 100 
                });
            } else {
                const pLight = light as PointLight;
                this.lightBuffer.addLight({
                    position: [pLight.position[0], pLight.position[1], pLight.position[2], 1],
                    color: pLight.color,
                    intensity: pLight.intensity,
                    range: pLight.range,
                    direction: [0, -1, 0]
                });
            }
        }
        this.lightBuffer.upload();

        // Sync meshes (Group by Geometry and Material)
        const groups = new Map<Geometry, Map<Material, Mesh[]>>();
        for (let i = 0; i < scene.meshes.length; i++) {
            const m = scene.meshes[i];
            
            // Frustum Culling
            const maxScale = Math.max(m.scale[0], Math.max(m.scale[1], m.scale[2]));
            const worldRadius = m.geometry.boundingSphereRadius * maxScale;
            if (!scene.camera.isSphereInFrustum(m.position, worldRadius)) {
                continue; // Cull invisible geometry
            }

            let matMap = groups.get(m.geometry);
            if (!matMap) {
                matMap = new Map<Material, Mesh[]>();
                groups.set(m.geometry, matMap);
            }
            let list = matMap.get(m.material);
            if (!list) {
                list = [];
                matMap.set(m.material, list);
            }
            list.push(m);
        }

        this.activeBatches.length = 0;

        for (const [geometry, matMap] of groups) {
            for (const [material, meshes] of matMap) {
                const batch = this.getOrCreateBatch(geometry, material);
                this.activeBatches.push(batch);

                const maxInstances = 1000;
                const instanceCount = Math.min(meshes.length, maxInstances);
                const instanceData = batch.scratchBuffer;

                for (let i = 0; i < instanceCount; i++) {
                    const m = meshes[i];
                    const offset = i * 16;
                    
                    instanceData[offset + 0] = m.position[0];
                    instanceData[offset + 1] = m.position[1];
                    instanceData[offset + 2] = m.position[2];
                    
                    instanceData[offset + 3] = m.rotation[0];
                    instanceData[offset + 4] = m.rotation[1];
                    instanceData[offset + 5] = m.rotation[2];
                    instanceData[offset + 6] = m.rotation[3];
                    
                    instanceData[offset + 7] = m.scale[0];
                    instanceData[offset + 8] = m.scale[1];
                    instanceData[offset + 9] = m.scale[2];
                    
                    instanceData[offset + 10] = m.material.color[0];
                    instanceData[offset + 11] = m.material.color[1];
                    instanceData[offset + 12] = m.material.color[2];
                    instanceData[offset + 13] = m.material.color[3];
                    
                    instanceData[offset + 14] = m.material.metallic;
                    instanceData[offset + 15] = m.material.roughness;
                }
                batch.instanceCount = instanceCount;
                batch.updateInstances(instanceData);
            }
        }

        // Execute render graph
        const commandEncoder = device.createCommandEncoder();
        this.renderGraph!.execute(commandEncoder);

        if (!this.blitBG) {
            const hdrTexture = this.renderGraph!.getTexture(this.hHDRHandle)!;
            this.blitBG = device.createBindGroup({
                layout: this.blitBGL,
                entries: [
                    { binding: 0, resource: this.blitSampler },
                    { binding: 1, resource: hdrTexture.createView() },
                ],
            });
        }

        const blitPass = commandEncoder.beginRenderPass({
            label: 'Blit to Screen',
            colorAttachments: [{
                view: gpuCtx.getCurrentTexture().createView(),
                clearValue: { r: 0.02, g: 0.02, b: 0.04, a: 1 },
                loadOp: 'clear', storeOp: 'store',
            }],
        });
        blitPass.setPipeline(this.blitPipeline);
        blitPass.setBindGroup(0, this.blitBG);
        blitPass.draw(3);
        blitPass.end();

        device.queue.submit([commandEncoder.finish()]);
    }
}
