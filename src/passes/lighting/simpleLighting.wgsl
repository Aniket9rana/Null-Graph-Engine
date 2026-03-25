// ──────────────────────────────────────────────────────────
// Simplified Deferred Lighting Shader (no shadows)
// PBR Cook-Torrance BRDF with multiple point/directional lights
// ──────────────────────────────────────────────────────────

const PI = 3.14159265359;

// No sampler needed for exact texel loads
@group(0) @binding(1) var t_albedo:     texture_2d<f32>;
@group(0) @binding(2) var t_normal:     texture_2d<f32>;
@group(0) @binding(3) var t_depth:      texture_depth_2d;
@group(0) @binding(4) var t_metalRough: texture_2d<f32>;

struct Light {
  position:  vec4<f32>,   // w=0 directional, w=1 point
  color:     vec3<f32>,
  intensity: f32,
  direction: vec3<f32>,
  range:     f32,
  spotAngle: f32,
  _pad:      vec3<f32>,
};

struct CameraUniforms {
  pos: vec3<f32>,
  _pad: f32,
  inverseViewProjection: mat4x4<f32>,
};

@group(0) @binding(5) var<storage, read> lights: array<Light>;
@group(0) @binding(6) var<uniform> lightCountParams: vec4<u32>;
@group(0) @binding(7) var<uniform> camera: CameraUniforms;

// ── Vertex shader: full-screen triangle ──────────────────
struct VSOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0)       uv:  vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VSOutput {
  var positions = array<vec2<f32>, 3>(
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0),
  );
  var uvs = array<vec2<f32>, 3>(
    vec2(0.0, 1.0),
    vec2(2.0, 1.0),
    vec2(0.0,-1.0),
  );
  var out: VSOutput;
  out.pos = vec4(positions[i], 0.0, 1.0);
  out.uv  = uvs[i];
  return out;
}

// ── PBR Helper Functions ─────────────────────────────────

// Normal Distribution Function – GGX / Trowbridge-Reitz
fn ndf_ggx(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a  = roughness * roughness;
  let a2 = a * a;
  let NdH = max(dot(N, H), 0.0);
  let d  = NdH * NdH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

// Geometry function – Schlick-GGX
fn geometry_schlick_ggx(NdV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdV / (NdV * (1.0 - k) + k);
}

// Geometry function – Smith's method
fn geometry_smith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdV = max(dot(N, V), 0.0);
  let NdL = max(dot(N, L), 0.0);
  let ggx1 = geometry_schlick_ggx(NdV, roughness);
  let ggx2 = geometry_schlick_ggx(NdL, roughness);
  return ggx1 * ggx2;
}

// Fresnel – Schlick approximation
fn fresnel_schlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// ACES Filmic Tone Mapping
fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3(0.0), vec3(1.0));
}

// ── Fragment shader ──────────────────────────────────────
@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4<f32> {
  // Read G-Buffer exactly per texel
  let texCoord = vec2<i32>(in.pos.xy);
  
  let albedo_ao = textureLoad(t_albedo, texCoord, 0);
  let albedo = albedo_ao.rgb;
  let ao = albedo_ao.a;

  let normal_data = textureLoad(t_normal, texCoord, 0);
  let N = normalize(normal_data.xyz);

  let metalRough = textureLoad(t_metalRough, texCoord, 0);
  let metallic  = metalRough.r;
  let roughness = metalRough.g;

  let depth = textureLoad(t_depth, texCoord, 0);

  // Reconstruct world position from depth
  let ndc = vec2(in.uv.x * 2.0 - 1.0, (1.0 - in.uv.y) * 2.0 - 1.0);
  var world_pos_h = camera.inverseViewProjection * vec4(ndc, depth, 1.0);
  let world_pos = world_pos_h.xyz / world_pos_h.w;

  let V = normalize(camera.pos - world_pos);

  // Base reflectivity
  var F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);

  var Lo = vec3(0.0);

  let lightCount = lightCountParams.x;
  for (var i = 0u; i < lightCount; i = i + 1u) {
    let light = lights[i];

    var L: vec3<f32>;
    var attenuation: f32;

    if (light.position.w < 0.5) {
      // Directional light
      L = normalize(-light.direction);
      attenuation = 1.0;
    } else {
      // Point light
      let toLight = light.position.xyz - world_pos;
      let distance = length(toLight);
      L = toLight / distance;
      // Smooth distance attenuation with range falloff
      let rangeFactor = clamp(1.0 - pow(distance / light.range, 4.0), 0.0, 1.0);
      attenuation = (rangeFactor * rangeFactor) / (distance * distance + 1.0);
    }

    let H = normalize(V + L);
    let radiance = light.color * light.intensity * attenuation;

    // Cook-Torrance BRDF
    let NDF = ndf_ggx(N, H, roughness);
    let G   = geometry_smith(N, V, L, roughness);
    let F   = fresnel_schlick(max(dot(H, V), 0.0), F0);

    let kD = (vec3(1.0) - F) * (1.0 - metallic);

    let numerator   = NDF * G * F;
    let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    let specular = numerator / denominator;

    let NoL = max(dot(N, L), 0.0);
    Lo = Lo + (kD * albedo / PI + specular) * radiance * NoL;
  }

  // Ambient occlusion
  let ambient = vec3(0.03) * albedo * ao;
  var color = Lo + ambient;

  // Tone mapping (ACES filmic)
  color = aces_tonemap(color);

  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));

  return vec4(color, 1.0);
}
