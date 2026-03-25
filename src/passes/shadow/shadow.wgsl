// Uniform buffer with the light-space view-projection matrix for a single cascade.
// This matrix transforms model-space vertices directly to the light's clip space.
@group(0) @binding(0) var<uniform> lightMatrix: mat4x4<f32>;

// Input from the vertex buffer.
// TODO: This needs to be expanded to match the full vertex layout of engine meshes
// when instancing and other attributes are added.
struct VertexInput {
    @location(0) position: vec3<f32>,
};

/**
 * Vertex shader for the shadow depth pass.
 * It's a minimal shader that transforms vertices into the light's clip space.
 * No fragment shader is needed as we're only writing to the depth buffer.
 */
@vertex
fn vs_main(in: VertexInput) -> @builtin(position) vec4<f32> {
    return lightMatrix * vec4<f32>(in.position, 1.0);
}
