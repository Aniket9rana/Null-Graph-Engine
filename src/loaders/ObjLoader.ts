import { Geometry } from '../core/Geometry';

export class ObjLoader {
    /**
     * Parses an OBJ string into a Geometry object.
     */
    public static parse(objText: string): Geometry {
        const positions: number[][] = [];
        const normals: number[][] = [];
        const uvs: number[][] = [];

        const vertices: number[] = [];
        const indices: number[] = [];
        
        // Map "v/vt/vn" string to an index
        const indexMap: Record<string, number> = {};
        let nextIndex = 0;

        const lines = objText.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;

            const parts = line.split(/\s+/);
            const type = parts[0];

            if (type === 'v') {
                positions.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
            } else if (type === 'vn') {
                normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
            } else if (type === 'vt') {
                uvs.push([parseFloat(parts[1]), parseFloat(parts[2])]);
            } else if (type === 'f') {
                const faceVertices = parts.slice(1);
                // simple fan triangulation for polygons (quads etc)
                for (let i = 1; i < faceVertices.length - 1; i++) {
                    const v1 = faceVertices[0];
                    const v2 = faceVertices[i];
                    const v3 = faceVertices[i + 1];

                    const processVertex = (vData: string) => {
                        if (indexMap[vData] !== undefined) {
                            return indexMap[vData];
                        }

                        const parts = vData.split('/');
                        const vIdx = parseInt(parts[0], 10) - 1;
                        const vtIdx = parts.length > 1 && parts[1] ? parseInt(parts[1], 10) - 1 : -1;
                        const vnIdx = parts.length > 2 && parts[2] ? parseInt(parts[2], 10) - 1 : -1;
                        
                        const pos = positions[vIdx] || [0, 0, 0];
                        const uv = vtIdx >= 0 && uvs[vtIdx] ? uvs[vtIdx] : [0, 0];
                        const norm = vnIdx >= 0 && normals[vnIdx] ? normals[vnIdx] : [0, 1, 0];

                        // Interleaved Geometry layout: pos(3) + normal(3) + uv(2) = 8 floats per vertex
                        vertices.push(
                            pos[0], pos[1], pos[2],
                            norm[0], norm[1], norm[2],
                            uv[0], uv[1]
                        );

                        const newIndex = nextIndex++;
                        indexMap[vData] = newIndex;
                        return newIndex;
                    };

                    indices.push(processVertex(v1), processVertex(v2), processVertex(v3));
                }
            }
        }

        return new Geometry(new Float32Array(vertices), new Uint32Array(indices));
    }

    /**
     * Fetches and parses an OBJ file from a URL.
     */
    public static async load(url: string): Promise<Geometry> {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        const text = await res.text();
        return ObjLoader.parse(text);
    }
}
