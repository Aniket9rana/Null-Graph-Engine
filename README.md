# 🌌 Null Graph Engine v2.0

**Null Graph Engine** is a high-performance, modular 3D graphics library and interactive scene editor built with **WebGPU**. It is designed for developers who need a professional-grade, deferred-rendering pipeline with the latest web standards.

![Engine Preview](/C:/Users/anike/.gemini/antigravity/brain/137bdc2c-70bd-4bb9-93be-3f867e230cd5/final_ui_state_1774440270633.png)

## ✨ Core Features

### 🚀 High-Performance Rendering
- **Modern Deferred Shading**: Support for complex lighting scenes with thousands of lights using a 5-channel G-Buffer.
- **WebGPU Native**: Leveraging the latest GPU API for low-overhead, multi-threaded rendering.
- **Automatic Batching**: Transparent instancing for identical geometries to minimize draw calls.

### 📦 Robust Asset Pipeline
- **GLB (glTF Binary) Support**: Built-in binary parser for the industry-standard 3D format.
- **Wavefront OBJ Support**: Fast text-based parsing for legacy and simple static meshes.
- **Drag-and-Drop Editor**: Drop any `.obj` or `.glb` file directly into the editor to instantiate it.

### 🛠️ Integrated Scene Editor
- **Glassmorphism UI**: A premium, responsive dark-mode HUD.
- **Real-time Transform Editing**: Modify position, rotation, and scale with immediate GPU constant buffer synchronization.
- **Scene Hierarchy**: Manage complex scenes via a structured tree view.
- **Infinite Procedural Grid**: A distance-faded, anti-aliased ground grid for spatial reference.

## 🏗️ Technical Architecture

The engine is built around a **Render Graph** system that manages resource dependencies and minimizes GPU state changes:

- **Geometry Pass**: Populates the G-Buffer (Albedo, Normal, MetalRough, Velocity, Depth).
- **Grid Pass**: Procedural overlay integrated directly into the geometry pass.
- **Lighting Pass**: Deferred point and directional lighting with HDR.
- **Blit Pass**: Screen-space tone mapping and final output.

## 🛠️ Getting Started

### Installation
```bash
npm install
```

### Dev Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

## 📜 Usage Example

```typescript
import { Engine, Scene, Mesh, ObjLoader } from 'null-graph-engine';

const engine = new Engine(canvas);
await engine.init();

const scene = new Scene();
const mesh = new Mesh({ 
    geometry: await ObjLoader.load('./model.obj'),
    color: [1, 1, 1, 1] 
});

scene.add(mesh);
engine.run((dt) => {
    engine.renderer.render(scene);
});
```

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

---
Created by [Aniket Rana](https://github.com/Aniket9rana). Built for the future of the web.
