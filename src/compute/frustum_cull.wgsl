struct AABB {
    min: vec3<f32>,
    _pad1: f32,
    max: vec3<f32>,
    _pad2: f32,
};

@group(0) @binding(0) var<storage, read> bounding_boxes: array<AABB>;
@group(0) @binding(1) var<uniform> frustum_planes: array<vec4<f32>, 6>;
@group(0) @binding(2) var<storage, read_write> visible_instances: array<u32>;

struct DrawArgs {
    index_count: u32,
    instance_count: atomic<u32>,
    first_index: u32,
    base_vertex: u32,
    first_instance: u32,
};
@group(0) @binding(3) var<storage, read_write> draw_args: DrawArgs;

/**
 * Tests an AABB against a single plane using the "p-vertex/n-vertex" method.
 * @param aabb The axis-aligned bounding box to test.
 * @param plane The plane to test against.
 * @returns True if the AABB is at least partially on the positive side of the plane.
 */
fn test_aabb_plane(aabb: AABB, plane: vec4<f32>) -> bool {
    // Find the p-vertex (the corner of the AABB most in the direction of the plane's normal)
    var p_vertex: vec3<f32>;
    if (plane.x > 0.0) { p_vertex.x = aabb.max.x; } else { p_vertex.x = aabb.min.x; }
    if (plane.y > 0.0) { p_vertex.y = aabb.max.y; } else { p_vertex.y = aabb.min.y; }
    if (plane.z > 0.0) { p_vertex.z = aabb.max.z; } else { p_vertex.z = aabb.min.z; }
    
    // If the p-vertex is on the negative side, the entire box is outside.
    return dot(plane.xyz, p_vertex) + plane.w >= 0.0;
}

/**
 * Tests an AABB against the 6 planes of a frustum.
 * @param aabb The AABB to test.
 * @returns True if the AABB is inside or intersecting the frustum.
 */
fn test_frustum(aabb: AABB) -> bool {
    for (var i = 0u; i < 6u; i = i + 1u) {
        if (!test_aabb_plane(aabb, frustum_planes[i])) {
            return false;
        }
    }
    return true;
}

@compute @workgroup_size(64)
fn cull(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    let max_objects = arrayLength(&bounding_boxes);
    if (i >= max_objects) {
        return;
    }
    
    // NOTE: The instance_count in draw_args must be reset to 0 each frame before this pass.
    
    let aabb = bounding_boxes[i];
    if (test_frustum(aabb)) {
        // This object is visible. Atomically increment the instance count and
        // write the object's original index to the visible_instances buffer.
        let slot = atomicAdd(&draw_args.instance_count, 1u);
        visible_instances[slot] = i;
    }
}
