import { create, perspective, lookAt, multiply, mat4 } from '../math/mat4';

export class Camera {
    private projectionMatrix: mat4 = create();
    private viewMatrix: mat4 = create();
    private viewProjectionMatrix: mat4 = create();

    public frustumPlanes: Float32Array[] = [
        new Float32Array(4), new Float32Array(4), new Float32Array(4), 
        new Float32Array(4), new Float32Array(4), new Float32Array(4)
    ];

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
        this.updateFrustumPlanes();
    }

    private updateFrustumPlanes(): void {
        const m = this.viewProjectionMatrix;
        // Left
        this.frustumPlanes[0][0] = m[3] + m[0];
        this.frustumPlanes[0][1] = m[7] + m[4];
        this.frustumPlanes[0][2] = m[11] + m[8];
        this.frustumPlanes[0][3] = m[15] + m[12];
        // Right
        this.frustumPlanes[1][0] = m[3] - m[0];
        this.frustumPlanes[1][1] = m[7] - m[4];
        this.frustumPlanes[1][2] = m[11] - m[8];
        this.frustumPlanes[1][3] = m[15] - m[12];
        // Bottom
        this.frustumPlanes[2][0] = m[3] + m[1];
        this.frustumPlanes[2][1] = m[7] + m[5];
        this.frustumPlanes[2][2] = m[11] + m[9];
        this.frustumPlanes[2][3] = m[15] + m[13];
        // Top
        this.frustumPlanes[3][0] = m[3] - m[1];
        this.frustumPlanes[3][1] = m[7] - m[5];
        this.frustumPlanes[3][2] = m[11] - m[9];
        this.frustumPlanes[3][3] = m[15] - m[13];
        // Near (WebGPU is [0, 1] clip space Z)
        this.frustumPlanes[4][0] = m[2];
        this.frustumPlanes[4][1] = m[6];
        this.frustumPlanes[4][2] = m[10];
        this.frustumPlanes[4][3] = m[14];
        // Far
        this.frustumPlanes[5][0] = m[3] - m[2];
        this.frustumPlanes[5][1] = m[7] - m[6];
        this.frustumPlanes[5][2] = m[11] - m[10];
        this.frustumPlanes[5][3] = m[15] - m[14];

        for (let i = 0; i < 6; i++) {
            const p = this.frustumPlanes[i];
            const length = Math.sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]);
            if (length > 0) {
                p[0] /= length; p[1] /= length; p[2] /= length; p[3] /= length;
            }
        }
    }

    public isSphereInFrustum(center: [number, number, number], radius: number): boolean {
        for (let i = 0; i < 6; i++) {
            const p = this.frustumPlanes[i];
            const dist = p[0] * center[0] + p[1] * center[1] + p[2] * center[2] + p[3];
            if (dist < -radius) return false;
        }
        return true;
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
