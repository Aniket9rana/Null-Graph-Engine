import { Geometry } from './Geometry';

export class Mesh {
    public geometry: Geometry;
    public position: [number, number, number] = [0, 0, 0];
    
    // Quaternion: [x, y, z, w]. Default is identity.
    public rotation: [number, number, number, number] = [0, 0, 0, 1];
    
    public scale: [number, number, number] = [1, 1, 1];
    
    // RGBA
    public color: [number, number, number, number] = [1, 1, 1, 1];
    
    constructor(options?: { geometry?: Geometry; color?: [number, number, number, number]; position?: [number, number, number]; scale?: [number, number, number] }) {
        this.geometry = options?.geometry ?? Geometry.createCube();
        if (options?.color) this.color = options.color;
        if (options?.position) this.position = options.position;
        if (options?.scale) this.scale = options.scale;
    }
}
