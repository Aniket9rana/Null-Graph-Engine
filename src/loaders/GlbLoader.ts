import { Geometry } from '../core/Geometry';

interface GLTF {
    accessors?: any[];
    bufferViews?: any[];
    buffers?: any[];
    meshes?: any[];
    nodes?: any[];
}

export class GlbLoader {
    /**
     * Parses a .glb ArrayBuffer into an array of Geometry objects.
     */
    public static parse(buffer: ArrayBuffer): Geometry[] {
        const dataView = new DataView(buffer);
        let offset = 0;

        // 1. Parse Header
        const magic = dataView.getUint32(offset, true); offset += 4;
        /* version */ dataView.getUint32(offset, true); offset += 4;
        const length = dataView.getUint32(offset, true); offset += 4;

        if (magic !== 0x46546C67) { // "glTF"
            throw new Error("Invalid unexpected magic number. Not a valid GLB file.");
        }

        // 2. Parse Chunk 0 (JSON)
        const chunk0Length = dataView.getUint32(offset, true); offset += 4;
        const chunk0Type = dataView.getUint32(offset, true); offset += 4;

        if (chunk0Type !== 0x4E4F534A) { // "JSON"
            throw new Error("First chunk must be JSON.");
        }

        const jsonBytes = new Uint8Array(buffer, offset, chunk0Length);
        const jsonText = new TextDecoder().decode(jsonBytes);
        const gltf: GLTF = JSON.parse(jsonText);
        offset += chunk0Length;

        // 3. Parse Chunk 1 (BIN)
        let binBuffer: ArrayBuffer | null = null;
        let binOffset = 0;

        if (offset < length) {
            /* chunk1Length */ dataView.getUint32(offset, true); offset += 4;
            const chunk1Type = dataView.getUint32(offset, true); offset += 4;

            if (chunk1Type === 0x004E4942) { // "BIN\0"
                binBuffer = buffer;
                binOffset = offset;
            }
        }

        if (!binBuffer || !gltf.meshes) {
            console.warn("No meshes or BIN chunk found in GLB.");
            return [];
        }

        // Helper to read data from accessor
        const readAccessor = (accessorIdx: number) => {
            const accessor = gltf.accessors![accessorIdx];
            const bufferView = gltf.bufferViews && accessor.bufferView !== undefined ? gltf.bufferViews[accessor.bufferView] : { byteOffset: 0, byteStride: 0 };
            
            const viewByteOffset = bufferView.byteOffset || 0;
            const accByteOffset = accessor.byteOffset || 0;
            const totalOffset = binOffset + viewByteOffset + accByteOffset;

            const count = accessor.count;
            // Determine type size
            let typeSize = 1;
            if (accessor.type === 'VEC2') typeSize = 2;
            else if (accessor.type === 'VEC3') typeSize = 3;
            else if (accessor.type === 'VEC4') typeSize = 4;

            const componentType = accessor.componentType;
            let byteSize = 4;
            if (componentType === 5123) byteSize = 2;
            else if (componentType === 5121) byteSize = 1;

            const stride = bufferView.byteStride || (typeSize * byteSize);

            let data: Float32Array | Uint32Array;

            if (componentType === 5126) { // FLOAT
                data = new Float32Array(count * typeSize);
                for (let i = 0; i < count; i++) {
                    for (let j = 0; j < typeSize; j++) {
                        data[i * typeSize + j] = dataView.getFloat32(totalOffset + i * stride + j * 4, true);
                    }
                }
            } else if (componentType === 5123) { // UNSIGNED_SHORT
                data = new Uint32Array(count * typeSize);
                for (let i = 0; i < count; i++) {
                    for (let j = 0; j < typeSize; j++) {
                        data[i * typeSize + j] = dataView.getUint16(totalOffset + i * stride + j * 2, true);
                    }
                }
            } else if (componentType === 5125) { // UNSIGNED_INT
                data = new Uint32Array(count * typeSize);
                for (let i = 0; i < count; i++) {
                    for (let j = 0; j < typeSize; j++) {
                        data[i * typeSize + j] = dataView.getUint32(totalOffset + i * stride + j * 4, true);
                    }
                }
            } else {
                throw new Error(`Unsupported component type: ${componentType}`);
            }

            return { data, typeSize, count };
        };

        const geometries: Geometry[] = [];

        // 4. Build Engine Geometries
        for (const mesh of gltf.meshes) {
            for (const primitive of (mesh.primitives || [])) {
                if (!primitive.attributes.POSITION) continue;

                const posAccessor = readAccessor(primitive.attributes.POSITION);
                const normAccessor = primitive.attributes.NORMAL ? readAccessor(primitive.attributes.NORMAL) : null;
                const uvAccessor = primitive.attributes.TEXCOORD_0 ? readAccessor(primitive.attributes.TEXCOORD_0) : null;
                const indicesAccessor = primitive.indices !== undefined ? readAccessor(primitive.indices) : null;

                const vertexCount = posAccessor.count;
                // Engine format: [px, py, pz, nx, ny, nz, u, v] (8 floats)
                const interleavedVertices = new Float32Array(vertexCount * 8);

                for (let i = 0; i < vertexCount; i++) {
                    const outIdx = i * 8;
                    
                    // Position
                    interleavedVertices[outIdx + 0] = (posAccessor.data as Float32Array)[i * 3 + 0];
                    interleavedVertices[outIdx + 1] = (posAccessor.data as Float32Array)[i * 3 + 1];
                    interleavedVertices[outIdx + 2] = (posAccessor.data as Float32Array)[i * 3 + 2];

                    // Normal
                    if (normAccessor) {
                        interleavedVertices[outIdx + 3] = (normAccessor.data as Float32Array)[i * 3 + 0];
                        interleavedVertices[outIdx + 4] = (normAccessor.data as Float32Array)[i * 3 + 1];
                        interleavedVertices[outIdx + 5] = (normAccessor.data as Float32Array)[i * 3 + 2];
                    } else {
                        interleavedVertices[outIdx + 3] = 0;
                        interleavedVertices[outIdx + 4] = 1;
                        interleavedVertices[outIdx + 5] = 0;
                    }

                    // UV
                    if (uvAccessor) {
                        interleavedVertices[outIdx + 6] = (uvAccessor.data as Float32Array)[i * 2 + 0];
                        interleavedVertices[outIdx + 7] = (uvAccessor.data as Float32Array)[i * 2 + 1];
                    } else {
                        interleavedVertices[outIdx + 6] = 0;
                        interleavedVertices[outIdx + 7] = 0;
                    }
                }

                let indices: Uint32Array;
                if (indicesAccessor) {
                    indices = indicesAccessor.data as Uint32Array;
                } else {
                    // Auto-generate indices if not provided
                    indices = new Uint32Array(vertexCount);
                    for (let i = 0; i < vertexCount; i++) indices[i] = i;
                }

                geometries.push(new Geometry(interleavedVertices, indices));
            }
        }

        return geometries;
    }

    /**
     * Fetches and parses a GLB file from a URL.
     */
    public static async load(url: string): Promise<Geometry[]> {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        const buffer = await res.arrayBuffer();
        return GlbLoader.parse(buffer);
    }
}
