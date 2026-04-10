let nextMaterialId = 0;

export class Material {
    public readonly id = nextMaterialId++;
    
    // Base Color (RGBA)
    public color: [number, number, number, number] = [1, 1, 1, 1];
    
    // PBR Properties
    public metallic: number = 0.5;
    public roughness: number = 0.5;
    
    // Future expansion:
    // public albedoTexture?: GPUTexture;
    // public normalTexture?: GPUTexture;
    // public metalRoughTexture?: GPUTexture;

    constructor(options?: {
        color?: [number, number, number, number];
        metallic?: number;
        roughness?: number;
    }) {
        if (options?.color) this.color = options.color;
        if (options?.metallic !== undefined) this.metallic = options.metallic;
        if (options?.roughness !== undefined) this.roughness = options.roughness;
    }
}
