import * as THREE from 'three';
import { createTerrain } from './upstream/scenes/reefscape/src/terrain.js';
import { createCorals } from './upstream/scenes/reefscape/src/corals.js';
import { createAnemone } from './upstream/scenes/reefscape/src/anemone.js';
import { createEnvironment, createCaustics, waterTime, LAMP, LAMP_RANGE, ACTINIC } from './upstream/scenes/reefscape/src/water.js';

// Thin demo-only adapter: upstream geometry/materials, project-owned lifecycle.
// No background colour, backdrop mesh, full-screen post process, fish simulation, or RAF.
export function createReefLayer(canvas, report) {
  let active = false, visible = false, ready = false, loading = null, failed = false, disposed = false;
  let coverage = 0.32, renderer, scene, camera, caustics, environment, width = 0, height = 0;
  let frames = 0, cpuMs = 0, lastNow = 0, elapsed = 0;
  const resources = new Set();

  function collectResources() {
    scene?.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) {
        resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
    });
  }
  function release() {
    collectResources(); for (const resource of resources) resource.dispose?.(); resources.clear();
    caustics?.dispose(); environment?.dispose(); renderer?.dispose();
    caustics = environment = renderer = scene = camera = null;
  }
  async function init() {
    if (ready || loading || failed || disposed) return loading;
    report('首次载入珊瑚与海葵…');
    loading = (async () => {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
      renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.75;
      scene = new THREE.Scene(); scene.background = null;
      camera = new THREE.PerspectiveCamera(22, 1, 0.1, 80);
      camera.position.set(0, 4.5, 22); camera.lookAt(0, 2.15, 0);
      scene.add(new THREE.HemisphereLight('#3d7fd6', '#8a7c62', 0.7));
      const sun = new THREE.DirectionalLight('#f2f5ff', 4.2);
      sun.position.set(LAMP.x, LAMP.y, LAMP.z).multiplyScalar(LAMP_RANGE); scene.add(sun);
      const actinic = new THREE.DirectionalLight(new THREE.Color().setRGB(...ACTINIC.color, THREE.LinearSRGBColorSpace), ACTINIC.intensity);
      actinic.position.set(ACTINIC.x, ACTINIC.y, ACTINIC.z).multiplyScalar(LAMP_RANGE); scene.add(actinic);
      environment = createEnvironment(); scene.environment = environment;
      caustics = createCaustics(); caustics.setQuality('eco');
      await createTerrain(scene);
      if (disposed) { release(); return; }
      const corals = createCorals(scene); corals.setQuality('eco');
      const anemone = createAnemone(scene); anemone.setQuality('eco');
      collectResources();
      ready = true;
      canvas.hidden = !visible;
      report(visible ? '珊瑚礁已开启 · 仅覆盖底部局部' : '造景未开启 · 背景完整显示');
    })().catch(error => {
      failed = true; canvas.hidden = true; release();
      report('珊瑚礁载入失败，动物与背景仍可体验：' + String(error.message).slice(0,100));
      console.warn('Reef demo initialization failed', error);
    }).finally(() => { loading = null; });
    return loading;
  }

  function frame(options) {
    if (!active || !visible || !ready || disposed || failed || document.hidden) return;
    const now = options.now;
    if (lastNow && now - lastNow < 1000 / 24) return;
    const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0;
    lastNow = now; elapsed += dt;
    const w = Math.max(1, Math.round(options.width)), h = Math.max(1, Math.round(options.height * coverage));
    if (w !== width || h !== height) {
      width = w; height = h;
      canvas.style.height = `${h}px`;
      // Bound pixel work while retaining the entire horizontal reef composition.
      const scale = Math.min(1.25, Math.sqrt(650000 / (w * h)));
      renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
      canvas.style.width = `${w}px`;
      camera.aspect = w / h;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(0.60 / camera.aspect));
      camera.updateProjectionMatrix();
    }
    try {
      const before = performance.now(); waterTime.value = elapsed;
      caustics.render(renderer); renderer.setRenderTarget(null); renderer.clear(true,true,true);
      renderer.render(scene,camera); frames++;
      cpuMs = performance.now() - before;
    } catch (error) {
      failed = true; canvas.hidden = true;
      report('造景渲染已停止，可继续体验背景与动物。');
      console.warn('Reef demo rendering failed', error);
    }
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); failed = true; canvas.hidden = true;
    report('图形上下文已丢失，请重置演示重新载入造景。');
  });
  return {
    start() { active = true; },
    stop() { active = false; lastNow = 0; canvas.hidden = true; },
    isActive: () => active && visible && ready && !failed && !disposed,
    frame,
    shore: () => null,
    setVisible(value) {
      visible = value === true; lastNow = 0; canvas.hidden = !visible || !ready || failed;
      if (visible && !ready) void init();
      else report(visible ? '珊瑚礁已开启 · 仅覆盖底部局部' : '造景未开启 · 背景完整显示');
    },
    setCoverage(value) { coverage = Math.max(0.20, Math.min(0.42, value)); },
    diagnostics: () => ({ ready, visible, failed, loading: !!loading, active, frames, cpuMs, coverage, three: THREE.REVISION, pixelWidth: canvas.width, pixelHeight: canvas.height, geometries: renderer?.info.memory.geometries || 0, textures: renderer?.info.memory.textures || 0 }),
    dispose() { disposed = true; active = false; visible = false; canvas.hidden = true; if (!loading) release(); },
  };
}
