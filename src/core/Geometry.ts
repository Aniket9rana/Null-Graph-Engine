export class Geometry {
    public readonly vertices: Float32Array;
    public readonly indices: Uint32Array;
    // Bounding volume for frustum culling
    public readonly boundingSphereRadius: number;

    constructor(vertices: Float32Array, indices: Uint32Array) {
        this.vertices = vertices;
        this.indices = indices;
        
        // Calculate conservative bounding sphere radius from origin
        let maxDistSq = 0;
        // Vertex stride is 8 floats (pos[3], normal[3], uv[2])
        for (let i = 0; i < vertices.length; i += 8) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = vertices[i + 2];
            const distSq = x*x + y*y + z*z;
            if (distSq > maxDistSq) maxDistSq = distSq;
        }
        this.boundingSphereRadius = Math.sqrt(maxDistSq);
    }

    // Default built-in
    private static cubeInstance: Geometry | null = null;
    
    public static createCube(): Geometry {
        if (!Geometry.cubeInstance) {
            const CUBE_VERTICES = new Float32Array([
              // Front
              -1,-1, 1,   0, 0, 1,   0,0,
               1,-1, 1,   0, 0, 1,   1,0,
               1, 1, 1,   0, 0, 1,   1,1,
              -1, 1, 1,   0, 0, 1,   0,1,
              // Back
               1,-1,-1,   0, 0,-1,   0,0,
              -1,-1,-1,   0, 0,-1,   1,0,
              -1, 1,-1,   0, 0,-1,   1,1,
               1, 1,-1,   0, 0,-1,   0,1,
              // Top
              -1, 1, 1,   0, 1, 0,   0,0,
               1, 1, 1,   0, 1, 0,   1,0,
               1, 1,-1,   0, 1, 0,   1,1,
              -1, 1,-1,   0, 1, 0,   0,1,
              // Bottom
              -1,-1,-1,   0,-1, 0,   0,0,
               1,-1,-1,   0,-1, 0,   1,0,
               1,-1, 1,   0,-1, 0,   1,1,
              -1,-1, 1,   0,-1, 0,   0,1,
              // Right
               1,-1, 1,   1, 0, 0,   0,0,
               1,-1,-1,   1, 0, 0,   1,0,
               1, 1,-1,   1, 0, 0,   1,1,
               1, 1, 1,   1, 0, 0,   0,1,
              // Left
              -1,-1,-1,  -1, 0, 0,   0,0,
              -1,-1, 1,  -1, 0, 0,   1,0,
              -1, 1, 1,  -1, 0, 0,   1,1,
              -1, 1,-1,  -1, 0, 0,   0,1,
            ]);

            const CUBE_INDICES = new Uint32Array([
               0, 1, 2,  0, 2, 3,
               4, 5, 6,  4, 6, 7,
               8, 9,10,  8,10,11,
              12,13,14, 12,14,15,
              16,17,18, 16,18,19,
              20,21,22, 20,22,23,
            ]);
            
            Geometry.cubeInstance = new Geometry(CUBE_VERTICES, CUBE_INDICES);
        }
        return Geometry.cubeInstance;
    }
}
