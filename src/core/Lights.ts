export class PointLight {
    public readonly type = 'point';
    public position: [number, number, number] = [0, 0, 0];
    public color: [number, number, number] = [1, 1, 1];
    public intensity: number = 1.0;
    public range: number = 20.0;

    constructor(options?: Partial<PointLight>) {
        if (options) Object.assign(this, options);
    }
}

export class DirectionalLight {
    public readonly type = 'directional';
    public direction: [number, number, number] = [0, -1, 0];
    public color: [number, number, number] = [1, 1, 1];
    public intensity: number = 1.0;

    constructor(options?: Partial<DirectionalLight>) {
        if (options) Object.assign(this, options);
    }
}

export type AnyLight = PointLight | DirectionalLight;
