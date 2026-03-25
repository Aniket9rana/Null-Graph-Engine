struct Camera {
    viewProj: mat4x4<f32>,
    position: vec3<f32>,
}
@group(0) @binding(0) var<uniform> camera: Camera;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
    // Generate a huge quad at y=0 (-200 to 200 is visually infinite with our camera parameters)
    var pos = array<vec3<f32>, 6>(
        vec3<f32>(-2000.0, 0.0, -2000.0),
        vec3<f32>( 2000.0, 0.0, -2000.0),
        vec3<f32>( 2000.0, 0.0,  2000.0),
        vec3<f32>(-2000.0, 0.0, -2000.0),
        vec3<f32>( 2000.0, 0.0,  2000.0),
        vec3<f32>(-2000.0, 0.0,  2000.0)
    );
    let p = pos[VertexIndex];
    var out: VertexOutput;
    out.clip_position = camera.viewProj * vec4<f32>(p, 1.0);
    out.world_pos = p;
    return out;
}

struct GBufferOutput {
    @location(0) albedo: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) metalRough: vec4<f32>,
    @location(3) velocity: vec4<f32>,
}

@fragment
fn fs_main(in: VertexOutput) -> GBufferOutput {
    let p = in.world_pos.xz;
    
    // Calculate 1-unit minor grid lines
    let grid = abs(fract(p - 0.5) - 0.5) / fwidth(p);
    let line = min(grid.x, grid.y);
    let color = 1.0 - min(line, 1.0);

    // Calculate 10-unit major grid lines
    let p10 = p / 10.0;
    let grid10 = abs(fract(p10 - 0.5) - 0.5) / fwidth(p10);
    let line10 = min(grid10.x, grid10.y);
    let color10 = 1.0 - min(line10, 1.0);

    // Fade out based on distance from camera
    let dist = distance(in.world_pos, camera.position);
    let fade = 1.0 - smoothstep(100.0, 600.0, dist);

    let gridIntensity = max(color * 0.15, color10 * 0.4);
    let finalColor = mix(0.06, 0.25, gridIntensity * fade);

    var out: GBufferOutput;
    out.albedo = vec4<f32>(finalColor, finalColor, finalColor, 1.0);
    
    // Normal (0,1,0) mapped to unorm is (0.5, 1.0, 0.5)
    out.normal = vec4<f32>(0.5, 1.0, 0.5, 0.0);
    
    // Metalness 0.1, Roughness 0.8
    out.metalRough = vec4<f32>(0.1, 0.8, 0.0, 0.0); 
    
    out.velocity = vec4<f32>(0.5, 0.5, 0.0, 0.0);
    return out;
}
