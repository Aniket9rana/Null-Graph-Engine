import { create, perspective, lookAt, multiply, mat4 } from '../math/mat4';

export class Camera {
    private projectionMatrix: mat4 = create();
    private viewMatrix: mat4 = create();
    private viewProjectionMatrix: mat4 = create();

    public position: [number, number, number] = [0, 0, 5];
    public target: [number, number, number] = [0, 0, 0];
    public up: [number, number, number] = [0, 1, 0];

    public fovy: number = Math.PI / 4;
    public aspect: number = 1;
    public near: number = 0.1;
    public far: number = 1000;

    constructor() {
        this.updateProjectionMatrix();
        this.updateViewMatrix();
    }

    public updateProjectionMatrix(): void {
        perspective(this.projectionMatrix, this.fovy, this.aspect, this.near, this.far);
        this.updateViewProjectionMatrix();
    }

    public updateViewMatrix(): void {
        lookAt(this.viewMatrix, this.position, this.target, this.up);
        this.updateViewProjectionMatrix();
    }

    private updateViewProjectionMatrix(): void {
        multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
    }

    public getViewProjectionMatrix(): mat4 {
        return this.viewProjectionMatrix;
    }

    public getProjectionMatrix(): mat4 {
        return this.projectionMatrix;
    }

    public getViewMatrix(): mat4 {
        return this.viewMatrix;
    }
}
