// This file is intended to be included in other shaders (like lighting.wgsl)
// It provides functions for sampling from a cascaded shadow map.

// These resources need to be bound by the pass that includes this file.
// @group(0) @binding(8) var shadowMap: texture_depth_2d_array;
// @group(0) @binding(9) var shadowSampler: sampler_comparison;
// @group(0) @binding(10) var<uniform> shadowMatrices: array<mat4x4<f32>, 4>;
// @group(0) @binding(11) var<uniform> shadowSplits: array<f32, 4>;

/**
 * Selects the appropriate cascade index for a given depth in view space.
 * @param viewDepth The linear depth from the camera's perspective.
 * @param shadowSplits An array of cascade split distances.
 * @returns The index of the cascade to sample from.
 */
fn selectCascade(viewDepth: f32, shadowSplits: array<f32, 4>) -> u32 {
    // This is a simplified linear search.
    for (var i = 0u; i < 4u; i = i + 1u) {
        if (viewDepth < shadowSplits[i]) {
            return i;
        }
    }
    return 3u; // Default to the last cascade if beyond the final split.
}

/**
 * Samples the shadow map with a 3x3 PCF kernel.
 * @param worldPos The world-space position of the fragment being shaded.
 * @param viewDepth The linear view-space depth of the fragment.
 * @param shadowMap The cascaded shadow map texture array.
 * @param shadowSampler The comparison sampler for the shadow map.
 * @param shadowMatrices The array of light-space view-projection matrices.
 * @param shadowSplits The array of cascade split distances.
 * @param resolution The resolution of a single cascade map, for calculating texel size.
 * @returns A shadow factor, where 1.0 is fully lit and 0.0 is fully shadowed.
 */
fn sampleShadow(
    worldPos: vec3<f32>,
    viewDepth: f32,
    shadowMap: texture_depth_2d_array,
    shadowSampler: sampler_comparison,
    shadowMatrices: array<mat4x4<f32>, 4>,
    shadowSplits: array<f32, 4>,
    resolution: f32
) -> f32 {
    let cascadeIndex = selectCascade(viewDepth, shadowSplits);
    
    let lightSpacePos = shadowMatrices[cascadeIndex] * vec4<f32>(worldPos, 1.0);
    
    // Perform perspective divide
    let shadowPos = lightSpacePos.xyz / lightSpacePos.w;
    
    // Transform from clip space [-1, 1] to texture space [0, 1]
    // and flip Y for texture coordinates.
    let shadowUv = shadowPos.xy * vec2(0.5, -0.5) + vec2(0.5, 0.5);

    // If the fragment is outside the light's frustum for this cascade, it's not shadowed.
    if (shadowUv.x < 0.0 || shadowUv.x > 1.0 || shadowUv.y < 0.0 || shadowUv.y > 1.0) {
        return 1.0;
    }

    // 3x3 PCF sampling
    var shadowFactor = 0.0;
    let texelSize = 1.0 / resolution;
    for (var y = -1; y <= 1; y = y + 1) {
        for (var x = -1; x <= 1; x = x + 1) {
            let offset = vec2<f32>(f32(x), f32(y)) * texelSize;
            // The shadowPos.z is adjusted slightly by a depth bias to prevent shadow acne.
            // A proper implementation would use depthBias and normalBias from the system config.
            let depthBias = 0.005;
            shadowFactor = shadowFactor + textureSampleCompare(
                shadowMap,
                shadowSampler,
                shadowUv + offset,
                cascadeIndex,
                shadowPos.z - depthBias
            );
        }
    }
    
    return shadowFactor / 9.0;
}
