// Browser-side, opt-in instrumentation for scripts/benchmark-classroom.mjs.
// Injected by Playwright BEFORE the unmodified production bundle. Nothing in
// src imports this file; normal learners pay zero profiling overhead.
export function installClassroomProbe() {
  if (window.top !== window) return;
  const probe = window.__classroomProbe = {
    renderer: null, scene: null, camera: null, firstFrameMs: null,
    recording: false, frames: [], tasks: [], commits: {}, updates: [],
    renderedObjects: new Set(), lastFrame: 0, startMs: 0,
  };
  let rendererId = 0;
  // Production React disables <Profiler> timings, but still publishes root
  // commits to DevTools. Count commits, NOT guessed component render counts.
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject() { return ++rendererId; },
    onCommitFiberRoot(id) {
      if (probe.recording) probe.commits[id] = (probe.commits[id] || 0) + 1;
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
  };
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail: object }) => {
    if (!object.isWebGLRenderer) return;
    probe.renderer = object;
    const render = object.render;
    object.render = function (scene, camera) {
      // Exclude drei's cube-map prewarm (six small renders, not display frames).
      if (!scene.__r3f || camera.isArrayCamera || camera.parent?.type === 'CubeCamera') {
        return render.call(this, scene, camera);
      }
      const now = performance.now();
      if (probe.firstFrameMs === null) probe.firstFrameMs = now;
      probe.scene = scene;
      probe.camera = camera;
      if (!probe.recording) return render.call(this, scene, camera);
      probe.renderedObjects.clear();
      const context = this.getContext();
      if (probe.gpuExtension && probe.gpuQueries.length < 8) {
        const query = context.createQuery();
        context.beginQuery(probe.gpuExtension.TIME_ELAPSED_EXT, query);
        probe.activeQuery = query;
      }
      const shadowNeedsUpdate = this.shadowMap.needsUpdate;
      const shadowType = this.shadowMap.type;
      const start = performance.now();
      const result = render.call(this, scene, camera);
      const cpuMs = performance.now() - start;
      if (probe.activeQuery) {
        context.endQuery(probe.gpuExtension.TIME_ELAPSED_EXT);
        probe.gpuQueries.push(probe.activeQuery);
        probe.activeQuery = null;
      }
      if (probe.gpuExtension) {
        const disjoint = context.getParameter(probe.gpuExtension.GPU_DISJOINT_EXT);
        while (probe.gpuQueries.length && (disjoint || context.getQueryParameter(probe.gpuQueries[0], context.QUERY_RESULT_AVAILABLE))) {
          const query = probe.gpuQueries.shift();
          if (!disjoint) probe.gpuMs.push(context.getQueryParameter(query, context.QUERY_RESULT) / 1e6);
          context.deleteQuery(query);
        }
      }
      probe.frames.push({
        time: now - probe.startMs,
        delta: probe.lastFrame ? now - probe.lastFrame : 0,
        renderCpuMs: cpuMs,
        calls: this.info.render.calls,
        triangles: this.info.render.triangles,
        points: this.info.render.points,
        geometries: this.info.memory.geometries,
        textures: this.info.memory.textures,
        programs: this.info.programs.length,
        shadowNeedsUpdate,
        shadowType,
        frameBudgetMs: scene.userData.classroomFrameBudgetMs ?? null,
        objects: probe.detailed ? probe.renderedObjects.size : null,
        dpr: this.getPixelRatio(),
        tier: sessionStorage.getItem('dc.classroomQualityTier'),
      });
      probe.lastFrame = now;
      return result;
    };
  });
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver(list => {
        if (!probe.recording) return;
        for (const entry of list.getEntries()) {
          probe.tasks.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: 'longtask', buffered: false });
    } catch { /* longtask not supported by every browser */ }
  }
  probe.inventory = () => {
    const geometries = new Map(), materials = new Map(), lights = [], objects = [];
    probe.scene.traverse(object => {
      if (object.geometry) geometries.set(object.geometry.uuid, object.geometry);
      for (const material of [].concat(object.material || [])) materials.set(material.uuid, material);
      if (object.isLight) lights.push({ type: object.type, intensity: object.intensity, castShadow: object.castShadow, visible: object.visible });
      objects.push({ type: object.type, name: object.name, triangles: object.geometry ? (object.geometry.index?.count || object.geometry.attributes.position?.count || 0) / 3 : 0 });
    });
    let geometryBytes = 0;
    const buffers = new Set();
    for (const geometry of geometries.values()) {
      for (const attribute of [...Object.values(geometry.attributes), geometry.index]) {
        const buffer = attribute?.array?.buffer;
        if (buffer && !buffers.has(buffer)) { buffers.add(buffer); geometryBytes += buffer.byteLength; }
      }
    }
    const gl = probe.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuTimerQuerySupported: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
      parallelShaderCompileSupported: !!gl.getExtension('KHR_parallel_shader_compile'),
      firstFrameMs: probe.firstFrameMs,
      nodes: objects.length, geometries: geometries.size, materials: materials.size, geometryBytes,
      materialTypes: [...materials.values()].map(m => ({ type: m.type, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, precision: m.precision })),
      lights, objects,
      shadow: { autoUpdate: probe.renderer.shadowMap.autoUpdate, needsUpdate: probe.renderer.shadowMap.needsUpdate, type: probe.renderer.shadowMap.type },
      initialDpr: probe.scene.__r3f.root.getState().viewport.initialDpr,
      liveDpr: probe.renderer.getPixelRatio(), tier: sessionStorage.getItem('dc.classroomQualityTier'),
      rendererMemory: { ...probe.renderer.info.memory }, programs: probe.renderer.info.programs.length,
      performance: probe.scene.__r3f.root.getState().performance.current,
      frameBudgetMs: probe.scene.userData.classroomFrameBudgetMs ?? null,
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      resourceTimings: performance.getEntriesByType('resource').map(r => ({ name: r.name, duration: r.duration, bytes: r.transferSize, type: r.initiatorType })),
    };
  };
  probe.start = ({ detail = false } = {}) => {
    probe.frames = []; probe.tasks = []; probe.commits = {}; probe.updates = [];
    probe.lastFrame = 0; probe.startMs = performance.now();
    probe.detailed = detail;
    probe.gpuExtension = detail ? probe.renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2') : null;
    probe.gpuQueries = []; probe.gpuMs = [];
    const restores = [];
    // Detailed CPU/visibility census is a SEPARATE run, not a headline FPS
    // sample: per-callback clocks/onBeforeRender add measurable overhead.
    probe.slowGLCalls = [];
    if (detail) {
      const context = probe.renderer.getContext();
      const methods = new Set();
      for (let prototype = Object.getPrototypeOf(context); prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
        for (const name of Object.getOwnPropertyNames(prototype)) if (name !== 'constructor') methods.add(name);
      }
      for (const name of methods) {
        const original = context[name];
        if (typeof original !== 'function') continue;
        context[name] = function (...args) {
          const start = performance.now();
          const value = original.apply(this, args);
          const duration = performance.now() - start;
          if (duration > 4) probe.slowGLCalls.push({ name, duration, time: start - probe.startMs });
          return value;
        };
        restores.push(() => { context[name] = original; });
      }
      probe.scene.traverse(object => {
        if (!object.isMesh && !object.isPoints) return;
        const before = object.onBeforeRender;
        object.onBeforeRender = function (...args) {
          probe.renderedObjects.add(object.id);
          return before.apply(this, args);
        };
        restores.push(() => { object.onBeforeRender = before; });
      });
      for (const entry of probe.scene.__r3f.root.getState().internal.subscribers) {
        const callback = entry.ref.current;
        const update = { source: callback.toString().slice(0, 250), calls: 0, totalMs: 0, maxMs: 0 };
        probe.updates.push(update);
        const timed = (...args) => {
          const start = performance.now();
          const value = callback(...args);
          const duration = performance.now() - start;
          update.calls++; update.totalMs += duration; update.maxMs = Math.max(update.maxMs, duration);
          return value;
        };
        entry.ref.current = timed;
        restores.push(() => { if (entry.ref.current === timed) entry.ref.current = callback; });
      }
    }
    probe.restore = () => { for (const restore of restores) restore(); };
    probe.recording = true;
  };
  probe.stop = () => {
    probe.recording = false;
    probe.restore?.();
    for (const query of probe.gpuQueries) probe.renderer.getContext().deleteQuery(query);
    probe.gpuQueries = [];
    return { frames: probe.frames, longTasks: probe.tasks, rootCommits: probe.commits, updates: probe.updates, slowGLCalls: probe.slowGLCalls, gpuMs: probe.gpuMs, inventory: probe.inventory() };
  };
}

// Only used by the harness, never by the player. Keep actual remote decode
// results separate from these deterministic shell/iframe-state fixtures.
const fixtureHTML = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111827;color:#d1d5db;font:18px system-ui;padding:24px}textarea{width:90%;height:180px}</style><h1>Deterministic embed fixture</h1><p>Real third-party network/decode is not measured in this run.</p><textarea aria-label="Fixture draft">Retained iframe state</textarea>';
const fixtureAPI = `window.YT={loaded:1,Player:class {
  constructor(host, options){this.time=0;this.quality='default';this.paused=false;
    const frame=document.createElement('iframe');frame.src='https://www.youtube-nocookie.com/embed/'+options.videoId+'?enablejsapi=1';frame.title='YouTube fixture';frame.style='width:100%;height:100%;border:0';host.replaceWith(frame);this.frame=frame;
    this.listener=e=>{try{const m=JSON.parse(e.data);if(m.func==='pauseVideo')this.paused=true;if(m.func==='playVideo')this.paused=false;}catch{}};window.addEventListener('message',this.listener);
    setTimeout(()=>options.events?.onReady?.(),0);
  }
  getCurrentTime(){return this.time} getDuration(){return 180} pauseVideo(){this.paused=true}
  getPlaybackQuality(){return this.quality} setPlaybackQuality(q){this.quality=q}
  destroy(){window.removeEventListener('message',this.listener);this.frame.remove()}
}};window.onYouTubeIframeAPIReady?.();`;

export async function installClassroomFixtures(page, origin) {
  await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(origin).origin) {
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"offline":true}' });
        return route.continue();
      }
      if (url.pathname === '/iframe_api') return route.fulfill({ contentType: 'text/javascript', body: fixtureAPI });
      if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: fixtureHTML });
      return route.abort('blockedbyclient');
    });
}

function configureClassroomBenchmark({ tier, fixed }) {
      if (window.top !== window) return;
      sessionStorage.setItem('dc.classroomQualityTier', tier);
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      let seed = 0x12345678;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
      if (fixed) window.__THREE_DEVTOOLS__.addEventListener('observe', ({detail: renderer}) => {
        if (!renderer.isWebGLRenderer) return;
        const render = renderer.render;
        const pinned = new WeakSet();
        renderer.render = function(scene, camera) {
          if (scene.__r3f && camera.parent?.type !== 'CubeCamera' && !pinned.has(scene)) {
            pinned.add(scene);
            const state = scene.__r3f.root.getState();
            // Keep stock scene/tier/DPR; suppress only sampling decisions for
            // apples-to-apples scene benchmarks. Live runs leave this alone.
            state.internal.subscribers = state.internal.subscribers.filter(entry => !entry.ref.current.toString().includes('averages'));
          }
          return render.call(this, scene, camera);
        };
      });
    }

export async function prepareClassroomBenchmark(page, options) {
  // One script establishes ordering, and never installs renderer hooks in
  // third-party iframe globals. Both sides get the same deterministic seed.
  await page.addInitScript({ content: `(${installClassroomProbe.toString()})();(${configureClassroomBenchmark.toString()})(${JSON.stringify(options)})` });
}
