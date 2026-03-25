// Constants
const PI = 3.14159265359;

// Bindings for G-Buffer, lights, and camera
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var t_albedo: texture_2d<f32>;
@group(0) @binding(2) var t_normal: texture_2d<f32>;
@group(0) @binding(3) var t_depth: texture_depth_2d;
@group(0) @binding(4) var t_metalRough: texture_2d<f32>;

struct Light {
  position:  vec4<f32>,
  color:     vec3<f32>,
  intensity: f32,
  direction: vec3<f32>,
  range:     f32,
  spotAngle: f32,
  _pad:      vec3<f32>,
}

struct Camera {
    pos: vec3<f32>,
    _pad: f32, // for 16-byte alignment
    inverseViewProjection: mat4x4<f32>,
};

struct ShadowUniforms {
    matrices: array<mat4x4<f32>, 4>,
    splits: array<f32, 4>,
};

@group(0) @binding(5) var<storage, read> lights: array<Light>;
@group(0) @binding(6) var<uniform> lightCount: u32;
@group(0) @binding(7) var<uniform> camera: Camera;
@group(0) @binding(8) var shadowMap: texture_depth_2d_array;
@group(0) @binding(9) var shadowSampler: sampler_comparison;
@group(0) @binding(10) var<uniform> shadowUniforms: ShadowUniforms;

// ... (VS and PBR functions) ...

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4<f32> {
    let albedo_ao = textureSample(t_albedo, s, in.uv);
    let albedo = albedo_ao.rgb;
    let ao = albedo_ao.a;
    
    let normal_data = textureSample(t_normal, s, in.uv);
    let N = normalize(normal_data.xyz);

    let metalRough = textureSample(t_metalRough, s, in.uv);
    let metallic = metalRough.r;
    let roughness = metalRough.g;
    
    let depth = textureSample(t_depth, s, in.uv);
    
    let clip_space_pos = vec4(in.uv * 2.0 - 1.0, depth, 1.0);
    var world_pos_h = camera.inverseViewProjection * clip_space_pos;
    let world_pos = world_pos_h.xyz / world_pos_h.w;

    let V = normalize(camera.pos - world_pos);
    
    var F0 = vec3(0.04);
    F0 = mix(F0, albedo, metallic);

    var Lo = vec3(0.0);
    for (var i = 0u; i < lightCount; i = i + 1u) {
        let light = lights[i];
        
        let L = normalize(light.position.xyz - world_pos);
        let H = normalize(V + L);
        let distance = length(light.position.xyz - world_pos);
        let attenuation = 1.0 / (distance * distance);
        let radiance = light.color * light.intensity * attenuation;
        
        // Shadow calculation
        let view_depth = length(world_pos - camera.pos);
        let shadowFactor = sampleShadow(
            world_pos,
            view_depth,
            shadowMap,
            shadowSampler,
            shadowUniforms.matrices,
            shadowUniforms.splits,
            2048.0 // resolution
        );
        let final_radiance = radiance * shadowFactor;

        let NDF = ndf_ggx(N, H, roughness);
        let G = geometry_smith(N, V, L, roughness);
        let F = fresnel_schlick(max(dot(H, V), 0.0), F0);
        
        let kD = (vec3(1.0) - F) * (1.0 - metallic);
        
        let numerator = NDF * G * F;
        let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.001;
        let specular = numerator / denominator;
        
        let NoL = max(dot(N, L), 0.0);
        Lo = Lo + (kD * albedo / PI + specular) * final_radiance * NoL;
    }
    
    let ambient = vec3(0.03) * albedo * ao;
    let color = Lo + ambient;
    
    return vec4(color, 1.0);
}
