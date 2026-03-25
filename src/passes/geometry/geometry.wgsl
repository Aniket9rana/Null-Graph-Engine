// Per-vertex attributes from vertex buffer
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

// Per-instance attributes from instance buffer, matching RenderBatch layout
struct InstanceInput {
    @location(3) instance_pos: vec3<f32>,
    @location(4) instance_rot: vec4<f32>, // Quaternion
    @location(5) instance_scale: vec3<f32>,
    @location(6) instance_color: vec4<f32>,
};

struct VSOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: mat4x4<f32>; // View-projection matrix

// Function to create a model matrix from position, rotation (quaternion), and scale
fn create_model_matrix(pos: vec3<f32>, rot: vec4<f32>, scale: vec3<f32>) -> mat4x4<f32> {
    let x = rot.x;
    let y = rot.y;
    let z = rot.z;
    let w = rot.w;

    let x2 = x + x;
    let y2 = y + y;
    let z2 = z + z;
    
    let xx = x * x2;
    let xy = x * y2;
    let xz = x * z2;
    
    let yy = y * y2;
    let yz = y * z2;
    let zz = z * z2;
    
    let wx = w * x2;
    let wy = w * y2;
    let wz = w * z2;

    var m: mat4x4<f32>;
    m[0][0] = (1.0 - (yy + zz)) * scale.x;
    m[0][1] = (xy + wz) * scale.x;
    m[0][2] = (xz - wy) * scale.x;
    m[0][3] = 0.0;

    m[1][0] = (xy - wz) * scale.y;
    m[1][1] = (1.0 - (xx + zz)) * scale.y;
    m[1][2] = (yz + wx) * scale.y;
    m[1][3] = 0.0;

    m[2][0] = (xz + wy) * scale.z;
    m[2][1] = (yz - wx) * scale.z;
    m[2][2] = (1.0 - (xx + yy)) * scale.z;
    m[2][3] = 0.0;

    m[3][0] = pos.x;
    m[3][1] = pos.y;
    m[3][2] = pos.z;
    m[3][3] = 1.0;
    
    return m;
}

@vertex
fn vs_main(vert: VertexInput, instance: InstanceInput) -> VSOutput {
    let model_matrix = create_model_matrix(instance.instance_pos, instance.instance_rot, instance.instance_scale);
    
    var out: VSOutput;
    let world_pos_4 = model_matrix * vec4<f32>(vert.position, 1.0);
    out.world_position = world_pos_4.xyz;
    out.world_normal = (model_matrix * vec4<f32>(vert.normal, 0.0)).xyz; // Needs inverse transpose for non-uniform scale
    out.uv = vert.uv;
    out.clip_position = camera * world_pos_4;
    out.color = instance.instance_color;
    return out;
}

struct GBufferOutput {
    @location(0) albedo: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) metalRough: vec4<f32>,
    @location(3) velocity: vec4<f32>,
};

@fragment
fn fs_main(in: VSOutput) -> GBufferOutput {
    var out: GBufferOutput;
    
    out.albedo = in.color; // Use instance color for albedo
    out.normal = vec4<f32>(normalize(in.world_normal), 0.0);
    out.metalRough = vec4<f32>(0.1, 0.8, 0.0, 0.0); // low metallic, high roughness
    out.velocity = vec4<f32>(0.0, 0.0, 0.0, 0.0);   // No velocity yet
    return out;
}
