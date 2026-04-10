import { Geometry } from './Geometry';
import { Material } from './Material';

export class Mesh {
    public geometry: Geometry;
    public material: Material;
    public position: [number, number, number] = [0, 0, 0];
    
    // Quaternion: [x, y, z, w]. Default is identity.
    public rotation: [number, number, number, number] = [0, 0, 0, 1];
    
    public scale: [number, number, number] = [1, 1, 1];
    
    constructor(options?: { geometry?: Geometry; material?: Material; color?: [number, number, number, number]; position?: [number, number, number]; scale?: [number, number, number] }) {
        this.geometry = options?.geometry ?? Geometry.createCube();
        this.material = options?.material ?? new Material();
        
        if (options?.color) this.material.color = options.color;
        if (options?.position) this.position = options.position;
        if (options?.scale) this.scale = options.scale;
    }
}
