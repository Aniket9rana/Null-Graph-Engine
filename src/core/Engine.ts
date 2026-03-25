export class Engine {
    public canvas: HTMLCanvasElement;
    public device!: GPUDevice;
    public gpuCtx!: GPUCanvasContext;
    public presentFormat!: GPUTextureFormat;
    
    private isRunning = false;
    private lastTime = performance.now();
    public time = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    /**
     * Bootstraps WebGPU. Must be called before creating the Renderer.
     */
    public async init(): Promise<void> {
        if (!navigator.gpu) {
            throw new Error('WebGPU is not supported.');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('No GPU adapter found');
        
        this.device = await adapter.requestDevice();
        this.gpuCtx = this.canvas.getContext('webgpu') as GPUCanvasContext;
        this.presentFormat = navigator.gpu.getPreferredCanvasFormat();
        
        this.gpuCtx.configure({
            device: this.device,
            format: this.presentFormat,
            alphaMode: 'premultiplied'
        });
    }

    /**
     * Starts the rendering loop.
     * @param renderLoop Callback fired every frame with delta time and total elapsed time.
     */
    public run(renderLoop: (deltaTime: number, totalTime: number) => void): void {
        if (!this.device) throw new Error("Engine.init() must be called before run()");
        
        this.isRunning = true;
        this.lastTime = performance.now();

        const frame = (now: number) => {
            if (!this.isRunning) return;
            
            const dt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            this.time += dt;

            renderLoop(dt, this.time);

            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }
    
    public stop(): void {
        this.isRunning = false;
    }
}
