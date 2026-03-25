struct Particle {
    pos: vec3<f32>,
    // 16 byte alignment
    vel: vec3<f32>,
    life: f32,
    max_life: f32,
    color: vec4<f32>,
};

@group(0) @binding(0) var<storage, read> particles_in: array<Particle>;
@group(0) @binding(1) var<storage, read_write> particles_out: array<Particle>;

struct DrawArgs {
    index_count: u32,
    instance_count: atomic<u32>,
    first_index: u32,
    base_vertex: u32,
    first_instance: u32,
};
@group(0) @binding(2) var<storage, read_write> draw_args: DrawArgs;

struct Emitter {
    pos: vec3<f32>,
    emit_rate: f32,
    gravity: vec3<f32>,
    drag: f32,
};
@group(0) @binding(3) var<uniform> emitter: Emitter;

// TODO: Pass delta time as a uniform.
const dt = 0.016;

// A simple random function (pseudo-random)
fn rand(co: vec2<f32>) -> f32 {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    let max_particles = arrayLength(&particles_in);
    if (i >= max_particles) {
        return;
    }
    
    var p = particles_in[i];

    p.life = p.life - dt;
    
    if (p.life <= 0.0) {
        // Respawn particle at the emitter position
        p.pos = emitter.pos;
        // Give it some random upward velocity
        let r1 = rand(vec2(f32(i), 0.0));
        let r2 = rand(vec2(0.0, f32(i)));
        p.vel = vec3<f32>((r1 - 0.5) * 5.0, 10.0, (r2 - 0.5) * 5.0);
        p.life = 2.0; // seconds
        p.max_life = 2.0;
        p.color = vec4(1.0, 0.5, 0.1, 1.0);
    } else {
        // Update particle
        p.vel = p.vel + emitter.gravity * dt;
        p.vel = p.vel * (1.0 - emitter.drag);
        p.pos = p.pos + p.vel * dt;
        p.color.a = p.life / p.max_life;
    }
    
    particles_out[i] = p;

    // If the particle is alive, increment the instance count for the indirect draw.
    // NOTE: The instance_count in the draw_args buffer must be reset to 0 each frame
    // before this compute shader runs. This is typically done with a clearBuffer call
    // on the command encoder before the compute pass.
    if (p.life > 0.0) {
        atomicAdd(&draw_args.instance_count, 1u);
    }
}
