import { Engine } from './core/Engine';
import { Renderer } from './core/Renderer';
import { Scene } from './core/Scene';
import { Mesh } from './core/Mesh';
import { PointLight, DirectionalLight } from './core/Lights';
import { ObjLoader } from './loaders/ObjLoader';
import { GlbLoader } from './loaders/GlbLoader';


// ─── Orbit Camera Controller ────────────────────────────
class OrbitController {
  azimuth = -0.5;
  elevation = 0.45;
  distance = 15;
  target: [number, number, number] = [0, 0, 0];

  private isDragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.azimuth -= dx * 0.006;
      this.elevation = Math.max(-1.4, Math.min(1.4, this.elevation + dy * 0.006));
    });

    canvas.addEventListener('pointerup', (e) => {
      this.isDragging = false;
      canvas.releasePointerCapture(e.pointerId);
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance = Math.max(3, Math.min(40, this.distance + e.deltaY * 0.015));
    }, { passive: false });
  }

  getPosition(): [number, number, number] {
    const cosEl = Math.cos(this.elevation);
    return [
      this.target[0] + this.distance * cosEl * Math.sin(this.azimuth),
      this.target[1] + this.distance * Math.sin(this.elevation),
      this.target[2] + this.distance * cosEl * Math.cos(this.azimuth),
    ];
  }
}

// Removed obsolete UI setup function

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

// ─── Main Application ───────────────────────────────────
// ─── Math Utilities ───────────────────────────────────────
function eulerToQuaternion(rx: number, ry: number, rz: number): [number, number, number, number] {
  // Convert degrees to radians
  const x = rx * Math.PI / 180;
  const y = ry * Math.PI / 180;
  const z = rz * Math.PI / 180;
  
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);

  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n * 255))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── Main Application ───────────────────────────────────
async function main() {
  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas not found');

  const engine = new Engine(canvas);
  try {
    await engine.init();
  } catch(e) {
    document.body.innerHTML = `<p style="color:#fff;font-family:sans-serif;padding:2rem;">${e}</p>`;
    return;
  }

  const scene = new Scene();
  const orbit = new OrbitController(canvas);

  // Default Lights
  const dirLight = new DirectionalLight({
    color: [1.0, 0.95, 0.88], intensity: 2.5, direction: [-0.5, -0.8, -0.3]
  });
  scene.addLight(dirLight);
  scene.addLight(new PointLight({ color: [0.6, 0.8, 1.0], intensity: 12, range: 20, position: [4, 3, 4] }));
  scene.addLight(new PointLight({ color: [1.0, 0.6, 0.3], intensity: 10, range: 18, position: [-4, 2, -3] }));

  const renderer = new Renderer(engine);

  // ─── Editor State ───────────────────────────────────────
  type EditorMesh = Mesh & { _name: string; _euler: [number, number, number] };
  let selectedMesh: EditorMesh | null = null;
  let meshCounter = 1;

  // Load Default Model
  try {
    const url = 'https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/suzanne.obj';
    const geom = await ObjLoader.load(url);
    const mesh = new Mesh({ geometry: geom, color: [0.8, 0.8, 0.9, 1.0] }) as EditorMesh;
    mesh._name = 'Suzanne 1';
    mesh._euler = [0, 180, 0];
    scene.add(mesh);
  } catch(e) {
    console.warn("Failed to load default OBJ", e);
  }

  const dropzone = document.getElementById('dropzone')!;
  const sceneList = document.getElementById('scene-list')!;
  const transformEditor = document.getElementById('transform-editor')!;
  const transformEmpty = document.getElementById('transform-empty')!;

  // ─── Drag & Drop Handlers ───────────────────────────────
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('active');
  });

  document.body.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (e.target === dropzone) dropzone.classList.remove('active');
  });

  // ─── Shared File Import ─────────────────────────────────
  async function importFile(file: File) {
    const isObj = file.name.toLowerCase().endsWith('.obj');
    const isGlb = file.name.toLowerCase().endsWith('.glb');
    if (!isObj && !isGlb) { alert('Please use a .obj or .glb file!'); return; }
    try {
      if (isObj) {
        const text = await file.text();
        const geom = ObjLoader.parse(text);
        const mesh = new Mesh({ geometry: geom, color: [0.8, 0.8, 0.8, 1.0] }) as EditorMesh;
        mesh._name = file.name.replace('.obj', '') + ` ${meshCounter++}`;
        mesh._euler = [0, 0, 0];
        scene.add(mesh);
      } else {
        const buffer = await file.arrayBuffer();
        const geometries = GlbLoader.parse(buffer);
        for (let i = 0; i < geometries.length; i++) {
          const mesh = new Mesh({ geometry: geometries[i], color: [0.8, 0.8, 0.8, 1.0] }) as EditorMesh;
          mesh._name = file.name.replace('.glb', '') + (geometries.length > 1 ? ` Part ${i+1}` : '') + ` ${meshCounter++}`;
          mesh._euler = [0, 0, 0];
          scene.add(mesh);
        }
      }
      updateSceneGraph();
    } catch(err) {
      console.error(err);
      alert('Failed to parse 3D file: ' + (err as Error).message);
    }
  }

  document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('active');
    const file = e.dataTransfer?.files[0];
    if (file) importFile(file);
  });

  // Import button wires to a hidden <input type="file">
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  document.getElementById('btn-import')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) importFile(file);
    fileInput.value = ''; // reset so the same file can be re-picked
  });

  // ─── Scene Graph UI ─────────────────────────────────────
  function updateSceneGraph() {
    sceneList.innerHTML = '';
    scene.meshes.forEach((mesh) => {
      const m = mesh as EditorMesh;
      const el = document.createElement('div');
      el.className = `scene-item ${m === selectedMesh ? 'active' : ''}`;
      el.textContent = m._name;
      el.onclick = () => selectMesh(m);
      sceneList.appendChild(el);
    });
  }

  function selectMesh(m: EditorMesh | null) {
    selectedMesh = m;
    updateSceneGraph();

    if (m) {
      transformEmpty.style.display = 'none';
      transformEditor.style.display = 'block';
      
      const px = document.getElementById('t-px') as HTMLInputElement;
      const py = document.getElementById('t-py') as HTMLInputElement;
      const pz = document.getElementById('t-pz') as HTMLInputElement;
      px.value = m.position[0].toFixed(2);
      py.value = m.position[1].toFixed(2);
      pz.value = m.position[2].toFixed(2);
      
      const rx = document.getElementById('t-rx') as HTMLInputElement;
      const ry = document.getElementById('t-ry') as HTMLInputElement;
      const rz = document.getElementById('t-rz') as HTMLInputElement;
      rx.value = m._euler[0].toFixed(1);
      ry.value = m._euler[1].toFixed(1);
      rz.value = m._euler[2].toFixed(1);

      const sx = document.getElementById('t-sx') as HTMLInputElement;
      const sy = document.getElementById('t-sy') as HTMLInputElement;
      const sz = document.getElementById('t-sz') as HTMLInputElement;
      sx.value = m.scale[0].toFixed(2);
      sy.value = m.scale[1].toFixed(2);
      sz.value = m.scale[2].toFixed(2);

      const col = document.getElementById('t-color') as HTMLInputElement;
      col.value = rgbToHex(m.color[0], m.color[1], m.color[2]);
    } else {
      transformEmpty.style.display = 'block';
      transformEditor.style.display = 'none';
    }
  }

  // ─── Transform Inputs Event Listeners ───────────────────
  function bindInput(id: string, callback: (v: number) => void) {
    document.getElementById(id)!.addEventListener('input', (e) => {
      if (selectedMesh) callback(parseFloat((e.target as HTMLInputElement).value) || 0);
    });
  }

  bindInput('t-px', v => selectedMesh!.position[0] = v);
  bindInput('t-py', v => selectedMesh!.position[1] = v);
  bindInput('t-pz', v => selectedMesh!.position[2] = v);

  bindInput('t-rx', v => { selectedMesh!._euler[0] = v; syncRot(); });
  bindInput('t-ry', v => { selectedMesh!._euler[1] = v; syncRot(); });
  bindInput('t-rz', v => { selectedMesh!._euler[2] = v; syncRot(); });

  function syncRot() {
    selectedMesh!.rotation = eulerToQuaternion(selectedMesh!._euler[0], selectedMesh!._euler[1], selectedMesh!._euler[2]);
  }

  bindInput('t-sx', v => selectedMesh!.scale[0] = v);
  bindInput('t-sy', v => selectedMesh!.scale[1] = v);
  bindInput('t-sz', v => selectedMesh!.scale[2] = v);

  document.getElementById('t-color')!.addEventListener('input', (e) => {
    if (selectedMesh) {
      const hex = (e.target as HTMLInputElement).value;
      const rgb = hexToRgb(hex);
      selectedMesh.color = [rgb[0], rgb[1], rgb[2], 1.0];
    }
  });

  document.getElementById('btn-delete')!.addEventListener('click', () => {
    if (selectedMesh) {
      scene.remove(selectedMesh);
      selectMesh(null);
    }
  });

  // ─── Render Loop ────────────────────────────────────────
  let frameCount = 0;
  let fpsTimer = performance.now();
  let currentFps = 0;

  // Add Cube button
  document.getElementById('btn-add-cube')!.addEventListener('click', () => {
    const mesh = new Mesh({ color: [0.78, 0.8, 0.95, 1.0] }) as EditorMesh;
    mesh._name = `Cube ${meshCounter++}`;
    mesh._euler = [0, 0, 0];
    scene.add(mesh);
    updateSceneGraph();
    selectMesh(mesh);
  });

  window.addEventListener('resize', () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = canvas.clientWidth  * dpr;
    canvas.height = canvas.clientHeight * dpr;
    scene.camera.aspect = canvas.width / canvas.height;
    scene.camera.updateProjectionMatrix();
  });
  window.dispatchEvent(new Event('resize'));
  updateSceneGraph();
  engine.run((dt) => {
    // Update camera
    scene.camera.position = orbit.getPosition();
    scene.camera.target = orbit.target;
    scene.camera.updateViewMatrix();

    // Render Scene (meshes are now statically editable via UI)
    renderer.render(scene);

    // Stats
    frameCount++;
    const now = performance.now();
    if (now - fpsTimer >= 500) {
      currentFps = Math.round(frameCount / ((now - fpsTimer) / 1000));
      frameCount = 0;
      fpsTimer = now;
    }

    const fpsBadge = document.getElementById('stat-fps')!;
    fpsBadge.textContent = `${currentFps} FPS`;
    fpsBadge.className = 'fps-badge ' + (currentFps >= 55 ? '' : currentFps >= 30 ? 'warn' : 'bad');
    document.getElementById('stat-frametime')!.textContent = `${(dt * 1000).toFixed(1)}ms`;
    document.getElementById('stat-draws')!.textContent = '4';
    document.getElementById('stat-instances')!.textContent = `${scene.meshes.length}`;
    document.getElementById('stat-lights')!.textContent = `${scene.lights.length}`;
    document.getElementById('cam-distance')!.textContent = orbit.distance.toFixed(1);
    document.getElementById('cam-azimuth')!.textContent = `${((orbit.azimuth * 180 / Math.PI) % 360).toFixed(0)}°`;
    document.getElementById('cam-elevation')!.textContent = `${(orbit.elevation * 180 / Math.PI).toFixed(0)}°`;
  });
}

main().catch(err => console.error(err));
