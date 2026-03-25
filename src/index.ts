export { Engine } from './core/Engine';
export { Renderer } from './core/Renderer';
export { Scene } from './core/Scene';
export { Mesh } from './core/Mesh';
export { PointLight, DirectionalLight } from './core/Lights';
export type { AnyLight } from './core/Lights';

export { ObjLoader } from './loaders/ObjLoader';
export { GlbLoader } from './loaders/GlbLoader';

// The camera is also part of the public API structure
export { Camera } from './renderer/Camera';

// For advanced developers who want low-level access
export { RenderGraph } from './rendergraph/RenderGraph';
export type { ResourceHandle, PassDescriptor } from './rendergraph/RenderGraph';
