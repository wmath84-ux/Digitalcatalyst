import { PROFILE, PROFILING, cappedDpr } from './DeviceProfile';
import { AdaptiveResolution, FramePacer, FrameWindow } from './FrameBudget';
/**
 * Engine — owns the WebGPURenderer, camera, frame loop, time, and stats.
 * All subsystems hook in via onUpdate(); per-frame stats are mirrored to
 * `window.__laas.stats` for the verification harness.
 */

import { ACESFilmicToneMapping, PerspectiveCamera, Scene } from 'three';
import { TimestampQuery, WebGPURenderer } from 'three/webgpu';
import { createWorldDevice, failLoud } from './Diagnostics';
import { installMaterialKeyMemo } from '../render/ThreePatches';
import { installPositionInvariance } from '../render/VegPrepass';
import { GpuProfiler } from './GpuProfiler';
import type { EngineStats, LaasHooks } from './Hooks';
import type { LaasParams } from './Params';

export type UpdateFn = (dt: number, worldTime: number) => void;


export class Engine {
  readonly renderer: WebGPURenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly params: LaasParams;
  readonly hooks: LaasHooks;
  readonly stats: EngineStats;

  /** world-simulation time (sec) — frozen when ?freeze=1 */
  worldTime = 0;
  /** wall-clock elapsed (sec) since start */
  elapsed = 0;

  /** when set, the frame loop renders through this instead of renderer.render */
  post: { render(): void; meter(renderer: WebGPURenderer): void } | null = null;

  private updateFns: UpdateFn[] = [];
  private lastT: number | null = null;
  private frameWindow = new FrameWindow();
  private pacer = new FramePacer(PROFILE.targetFps);
  private adaptive = new AdaptiveResolution(1000 / (PROFILE.targetFps || 60), PROFILE.minDpr / PROFILE.maxDpr);
  private suspended = false;
  private applyResolution(): void {
    const base = cappedDpr(window.innerWidth, window.innerHeight,
      this.params.dpr ?? window.devicePixelRatio);
    this.renderer.setPixelRatio(base * this.adaptive.scale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.stats.counters['budget.dpr100'] = Math.round(base * this.adaptive.scale * 100);
  }
  private fpsEma = 0;
  private frameCounter = 0;
  private settleWaiters: { frames: number; resolve: () => void }[] = [];
  private timestampsSupported = false;
  private timestampPending = false;
  private profiler: GpuProfiler | null = null;

  private constructor(renderer: WebGPURenderer, params: LaasParams, hooks: LaasHooks) {
    this.renderer = renderer;
    this.params = params;
    this.hooks = hooks;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.3,
      // far clip sized for the miniature world (far vista ≈3.5 km) — tighter
      // than the original 30 km for better depth precision near placed models
      8000,
    );
    this.camera.position.set(0, 10, 30);
    this.stats = {
      fps: 0,
      frameMs: 0,
      frameMsP95: 0,
      drawCalls: 0,
      triangles: 0,
      frame: 0,
      counters: {},
      gpuPasses: {},
    };
    hooks.stats = this.stats;
  }

  static async create(params: LaasParams, hooks: LaasHooks): Promise<Engine> {
    const worldDevice = await createWorldDevice(hooks.diag, PROFILING);
    const renderer = new WebGPURenderer({
      device: worldDevice,
      antialias: false,
      trackTimestamp: PROFILING,
    });
    await renderer.init();
    // fail-loud: surface WebGPU validation errors (otherwise: silent black frames)
    const device = (renderer.backend as unknown as { device?: GPUDevice }).device;
    if (device) {
      let reported = 0;
      device.onuncapturederror = (e: GPUUncapturedErrorEvent): void => {
        if (reported++ < 8) {
          // eslint-disable-next-line no-console
          console.error('[laas] WebGPU uncaptured error:', e.error.message);
          failLoud('GPU rendering failed', [e.error.message, 'This browser/GPU may not support the world’s resource requirements. Close Game and try a compatible device.']);
        }
      };
    }
    const dprCap = cappedDpr(window.innerWidth, window.innerHeight, params.dpr ?? window.devicePixelRatio);
    renderer.setPixelRatio(dprCap);
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Temporary Phase-0 output transform; replaced by the post stack (Phase 2).
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;

    const container = document.getElementById('app');
    if (!container) throw new Error('#app container missing in index.html');
    container.appendChild(renderer.domElement);

    const engine = new Engine(renderer, params, hooks);
    if (device) void device.lost.then((info) => {
      if (info.reason === 'destroyed') return;
      engine.suspended = true;
      void renderer.setAnimationLoop(null);
      failLoud('GPU connection lost', [info.message, 'Close and reopen Game to retry.']);
    });
    engine.timestampsSupported = PROFILING && (hooks.diag?.features ?? []).includes('timestamp-query');
    if (engine.timestampsSupported) engine.profiler = new GpuProfiler(renderer);
    // depth-prepass correctness (see VegPrepass): position math must land
    // on identical depths across the depth-only and shaded pipelines
    installPositionInvariance(renderer);
    // shadow-pass render objects re-hash their material node graph every
    // frame (see ThreePatches) — memoize per material
    installMaterialKeyMemo(renderer);

    window.addEventListener('resize', () => {
      engine.camera.aspect = window.innerWidth / window.innerHeight;
      engine.camera.updateProjectionMatrix();
      engine.applyResolution();
    });
    engine.stats.counters['budget.targetFps'] = PROFILE.targetFps;
    engine.stats.counters['budget.mobileTier'] = PROFILE.name === 'mobile-low' ? 1 : PROFILE.mobile ? 2 : 0;
    engine.stats.counters['budget.shadowCascades'] = PROFILE.cascades;
    engine.stats.counters['budget.shadowSize'] = PROFILE.shadowSize;
    engine.stats.counters['budget.maxPixels'] = Number.isFinite(PROFILE.maxPixels) ? PROFILE.maxPixels : 0;
    return engine;
  }

  onUpdate(fn: UpdateFn): void {
    this.updateFns.push(fn);
  }

  /** resolves after `frames` additional frames have been rendered */
  settle(frames = 8): Promise<void> {
    return new Promise((resolve) => {
      this.settleWaiters.push({ frames, resolve });
    });
  }

  start(): void {
    const resume = (): void => {
      this.suspended = document.hidden;
      this.lastT = null;
      this.pacer.reset();
      this.adaptive.reset();
      void this.renderer.setAnimationLoop(this.suspended ? null : (timeMs) => this.frame(timeMs));
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pagehide', () => {
      this.suspended = true;
      void this.renderer.setAnimationLoop(null);
    });
    window.addEventListener('pageshow', resume);
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted) {
        // The device is app-owned (passed to Three), so explicitly release it.
        const device = (this.renderer.backend as unknown as { device?: GPUDevice }).device;
        device?.destroy();
      }
    });
    resume();
  }

  private frame(timeMs: number): void {
    if (this.hooks.error) { void this.renderer.setAnimationLoop(null); return; }
    if (this.suspended || !this.pacer.shouldRender(timeMs)) return;
    const t = timeMs / 1000;
    const rawDt = this.lastT === null ? 1 / (PROFILE.targetFps || 60) : t - this.lastT;
    this.lastT = t;
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    this.elapsed += dt;
    if (!this.params.freeze) this.worldTime += dt;

    // CPU attribution (Phase 7): update = app-side per-frame work,
    // submit = three render+encode (excl. GPU; backpressure shows as the
    // gap between frameMs and cpu.update+cpu.submit)
    const c0 = performance.now();
    for (const fn of this.updateFns) fn(dt, this.worldTime);
    const c1 = performance.now();

    if (this.post) {
      this.post.meter(this.renderer); // exposure feedback from last frame's pass
      this.post.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    const c2 = performance.now();
    this.stats.counters['cpu.updateMs100'] = Math.round((c1 - c0) * 100);
    this.stats.counters['cpu.submitMs100'] = Math.round((c2 - c1) * 100);
    this.collectStats(rawDt);
    if (PROFILE.mobile && this.frameCounter > 30 && !this.params.freeze
      && this.adaptive.sample(rawDt * 1000, c2 - c0, timeMs)) this.applyResolution();

    if (this.settleWaiters.length > 0) {
      for (const w of this.settleWaiters) w.frames -= 1;
      const done = this.settleWaiters.filter((w) => w.frames <= 0);
      this.settleWaiters = this.settleWaiters.filter((w) => w.frames > 0);
      for (const w of done) w.resolve();
    }
  }

  private collectStats(rawDt: number): void {
    const s = this.stats;
    const ms = rawDt * 1000;
    this.frameWindow.push(ms);
    const fpsNow = rawDt > 0 ? 1 / rawDt : 0;
    this.fpsEma = this.fpsEma === 0 ? fpsNow : this.fpsEma * 0.95 + fpsNow * 0.05;

    s.fps = this.fpsEma;
    s.frameMs = ms;
    s.frameMsP95 = this.frameWindow.p95;
    s.drawCalls = this.renderer.info.render.drawCalls;
    s.triangles = this.renderer.info.render.triangles;
    s.frame = this.frameCounter++;

    // resolve EVERY frame: the 2048-query pool only resets its write index
    // on resolve — the old every-10-frames cadence overflowed it (≈100
    // timed contexts/frame), killing per-pass attribution and warning once
    if (this.timestampsSupported && !this.timestampPending) {
      this.timestampPending = true;
      Promise.all([
        this.renderer.resolveTimestampsAsync(TimestampQuery.RENDER),
        this.renderer.resolveTimestampsAsync(TimestampQuery.COMPUTE),
      ])
        .then(() => {
          if (this.profiler) {
            this.profiler.collect(s.gpuPasses);
          } else {
            s.gpuPasses['render'] = this.renderer.info.render.timestamp;
            s.gpuPasses['compute'] = this.renderer.info.compute.timestamp;
          }
        })
        .catch(() => {
          /* timestamps unsupported mid-run — ignore */
        })
        .finally(() => {
          this.timestampPending = false;
        });
    }
  }
}
