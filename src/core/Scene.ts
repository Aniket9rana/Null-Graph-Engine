import { Mesh } from './Mesh';
import { Camera } from '../renderer/Camera';
import { AnyLight } from './Lights';

export class Scene {
    public meshes: Mesh[] = [];
    public lights: AnyLight[] = [];
    public camera: Camera;

    constructor() {
        this.camera = new Camera();
    }

    public add(mesh: Mesh): void {
        this.meshes.push(mesh);
    }

    public remove(mesh: Mesh): void {
        this.meshes = this.meshes.filter(m => m !== mesh);
    }

    public addLight(light: AnyLight): void {
        this.lights.push(light);
    }

    public removeLight(light: AnyLight): void {
        this.lights = this.lights.filter(l => l !== light);
    }
}
