#!/usr/bin/env node
// Production-only regression harness. See docs/classroom-performance-audit.md.
// Uses the EXISTING #/dev/classroom-3d route; adds no runtime UI or app hooks.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { prepareClassroomBenchmark, installClassroomFixtures } from './classroom-performance-probe.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.length ? value.join('=') : 'true'];
}));
const origin = args.url || 'http://127.0.0.1:4173';
const seconds = Number(args.seconds || 10);
const repeats = Number(args.repeats || 1);
const output = args.out || 'scratch/classroom-perf/latest.json';
const fixed = args.governor !== 'live';
const detail = args.detail === 'true';
const fixtures = args.network !== 'live';
const scenarios = (args.scenarios || 'A,B,C,D,E,F,G,H,I,J').split(',');
const executablePath = process.env.CHROMIUM_PATH;
const html = await (await fetch(origin)).text();
if (html.includes('src="/@vite/client"') || html.includes('src="/src/main.tsx"')) throw new Error('Serve npm run build with vite preview; development FPS is not a production benchmark.');
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info', ...(args.gpu === 'hardware' ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])],
});
const report = {
  date: new Date().toISOString(), url: origin, browser: await browser.version(),
  production: true, governor: fixed ? 'fixed (sampling disabled ONLY in harness for equal-quality comparisons)' : 'live',
  network: fixtures ? 'deterministic iframe/API fixtures; NOT actual YouTube decode or Google document performance' : 'live (availability must be checked)',
  detailedInstrumentation: detail, ablation: args.ablation || null,
  notes: ['Frame intervals are display-render entry times, not GPU timer results.', 'Dropped frames are estimated against 60 Hz, not compositor telemetry.', 'H is a diagnostic back-of-room camera, not an added player control.', 'I is CPU-throttled mobile-like viewport, NOT an actual old phone.', 'Normal app-opening video is excluded with the existing ?opening=off override.'],
  samples: [],
};
const descriptions = {
  A: 'Classroom idle, seat facing board', B: 'Camera movement via focus shortcuts',
  C: 'Fast canvas pointer drag', D: 'Board fill/zoom', E: 'Notes / mind map focus',
  F: 'YouTube wall active (fixture if network=fixtures)', G: 'Docs wall active (fixture if network=fixtures)',
  H: 'All-object diagnostic view from rear of room', I: 'Mobile-like 640x360, low tier, 4x CPU throttle',
  J: 'Desktop 1280x720, high tier', P: 'PDF wall active (fixture if network=fixtures)', K: 'Native board fullscreen (WebGL not visible)',
};
const percentile = (values, p) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
};
const mean = values => values.reduce((sum, x) => sum + x, 0) / Math.max(1, values.length);
const summary = raw => {
  const frames = raw.frames.filter(frame => frame.delta > 0);
  const deltas = frames.map(frame => frame.delta);
  return {
    frames: frames.length, fps: frames.length ? 1000 / mean(deltas) : null,
    frameMs: { mean: mean(deltas), p50: percentile(deltas, .5), p95: percentile(deltas, .95), p99: percentile(deltas, .99), max: Math.max(0, ...deltas) },
    jank: { over25ms: deltas.filter(x => x > 25).length, over50ms: deltas.filter(x => x > 50).length, estimatedMissed60Hz: deltas.reduce((n, x) => n + Math.max(0, Math.round(x / (1000 / 60)) - 1), 0), longTasks: raw.longTasks.length },
    calls: { median: percentile(frames.map(f => f.calls), .5), max: Math.max(0, ...frames.map(f => f.calls)) },
    triangles: { median: percentile(frames.map(f => f.triangles), .5), max: Math.max(0, ...frames.map(f => f.triangles)) },
    renderCpuMs: { mean: mean(frames.map(f => f.renderCpuMs)), p95: percentile(frames.map(f => f.renderCpuMs), .95) },
    gpuMs: raw.gpuMs?.length ? { samples: raw.gpuMs.length, mean: mean(raw.gpuMs), p95: percentile(raw.gpuMs, .95) } : null,
    shadowRebakes: frames.filter(f => f.shadowNeedsUpdate).length,
    dpr: frames.length ? [...new Set(frames.map(f => f.dpr))] : [raw.inventory.liveDpr],
    tier: frames.length ? [...new Set(frames.map(f => f.tier))] : [raw.inventory.tier],
    frameBudgetMs: [...new Set(frames.map(f => f.frameBudgetMs))],
    visibleDrawObjects: detail ? { median: percentile(frames.map(f => f.objects), .5), max: Math.max(0, ...frames.map(f => f.objects)) } : null,
    geometries: raw.inventory.geometries, materials: raw.inventory.materials, geometryBytes: raw.inventory.geometryBytes,
    rendererGeometries: raw.frames.at(-1)?.geometries ?? raw.inventory.rendererMemory.geometries, textures: raw.frames.at(-1)?.textures ?? raw.inventory.rendererMemory.textures,
    heapBytes: raw.inventory.heapBytes, rootCommits: raw.rootCommits,
  };
};

try {
  for (let repeat = 0; repeat < repeats; repeat++) for (const id of scenarios) {
    const mobile = id === 'I';
    const viewport = id === 'J' ? { width: 1280, height: 720 } : { width: 640, height: 360 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], failedRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    await prepareClassroomBenchmark(page, { tier: mobile ? 'low' : 'high', fixed });
    if (fixtures) await installClassroomFixtures(page, origin);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(`${origin}/?opening=off#/dev/classroom-3d`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__classroomProbe?.scene?.__r3f, null, { timeout: 45000 });
    // Warm shaders / portal roots / layout, explicitly excluded from samples.
    await page.waitForTimeout(2500);
    if (id === 'D') { await page.keyboard.press('f'); await page.waitForTimeout(1600); }
    if (id === 'E') { await page.keyboard.press('2'); await page.waitForTimeout(1600); }
    if (id === 'K') {
      await page.locator('[data-classroom-board-panel]').evaluate(el => el.requestFullscreen());
      await page.waitForFunction(() => document.fullscreenElement);
      await page.waitForTimeout(1600);
    }
    if (id === 'G' || id === 'P') {
      // Select the existing Docs demo through the existing module chooser.
      await page.locator('[data-classroom-open-modules]').click();
      await page.getByRole('button', { name: id === 'G' ? /Google Docs — Study Notes/ : /PDF Notes & Handouts/ }).last().click();
      await page.getByRole('button', { name: id === 'G' ? /Google Doc — Study Guide/ : /W3C — Sample PDF Document/ }).last().click();
      await page.waitForTimeout(1600);
    }
    await page.evaluate(({ id }) => {
      const probe = window.__classroomProbe;
      if (id === 'H') {
        const state = probe.scene.__r3f.root.getState();
        const index = state.internal.subscribers.findIndex(entry => entry.ref.current.toString().includes('Math.pow(.0016'));
        if (index < 0) throw new Error('SeatRig callback not found; update diagnostic adapter');
        state.internal.subscribers.splice(index + 1, 0, { priority: 0, store: probe.scene.__r3f.root, ref: { current: state => {
          state.camera.position.set(0, 2.6, 9);
          state.camera.rotation.set(-.13, 0, 0, 'YXZ');
          state.camera.fov = 75;
          state.camera.updateProjectionMatrix(); state.camera.updateMatrixWorld();
        } } });
      }
    }, { id });
    if (args.ablation === 'prime-compiled') await page.evaluate(() => new Promise(resolve => {
      const pending = window.__classroomProbe.renderer.info.programs.slice();
      const start = performance.now();
      function prime() {
        for (let i = pending.length - 1; i >= 0; i--) {
          if (pending[i].isReady()) { pending[i].getUniforms(); pending.splice(i, 1); }
        }
        if (!pending.length || performance.now() - start > 10000) resolve();
        else setTimeout(prime, 20);
      }
      prime();
    }));
    if (args.ablation) await page.evaluate(ablation => {
      if (ablation === 'hide-dom') {
        const style = document.createElement('style');
        style.textContent = '.dc-classroom-surface,.dc-classroom-hud,.dc-classroom-control-tray,.dc-classroom-hint{display:none!important}';
        document.head.append(style);
      }
      if (ablation === 'tiny-dpr') window.__classroomProbe.scene.__r3f.root.getState().setDpr(.25);
      if (ablation === 'no-shader-debug') window.__classroomProbe.renderer.debug.checkShaderErrors = false;
    }, args.ablation);
    await page.waitForTimeout(800);
    const initial = await page.evaluate(() => window.__classroomProbe.inventory());
    const metricsBefore = await cdp.send('Performance.getMetrics');
    if (args['cpu-profile'] === 'true') { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
    let trace;
    if (args.trace === 'true') {
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,disabled-by-default-v8.gc', transferMode: 'ReturnAsStream' });
    }
    await page.evaluate(({ id, detail }) => {
      const probe = window.__classroomProbe;
      probe.start({ detail });
      const start = performance.now();
      let lastFocus = -1;
      const canvas = probe.renderer.domElement;
      // Pointer events drive the actual rig, not a replacement camera path.
      if (id === 'C') canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 320, clientY: 150, bubbles: true }));
      function move() {
        if (!probe.recording) return;
        const t = (performance.now() - start) / 1000;
        if (id === 'B' || id === 'E') {
          const phase = Math.floor(t / 1.4) % 3;
          if (phase !== lastFocus) {
            lastFocus = phase;
            window.dispatchEvent(new KeyboardEvent('keydown', { key: String((phase + 1)), bubbles: true }));
          }
        }
        if (id === 'C') canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 320 + Math.sin(t * 4) * 280, clientY: 150 + Math.sin(t * 2) * 30, bubbles: true }));
        probe.motionFrame = requestAnimationFrame(move);
      }
      if (['B', 'C', 'E'].includes(id)) probe.motionFrame = requestAnimationFrame(move);
    }, { id, detail });
    await page.waitForTimeout(seconds * 1000);
    const raw = await page.evaluate(() => {
      const probe = window.__classroomProbe;
      const raw = probe.stop();
      cancelAnimationFrame(probe.motionFrame);
      probe.renderer.domElement.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
      return raw;
    });
    const metricsAfter = await cdp.send('Performance.getMetrics');
    if (args['cpu-profile'] === 'true') {
      const { profile } = await cdp.send('Profiler.stop');
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(`${output}.${id}.${repeat}.cpuprofile`, JSON.stringify(profile));
    }
    if (args.trace === 'true') {
      const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      const { stream } = await done;
      let text = '';
      while (true) {
        const chunk = await cdp.send('IO.read', { handle: stream }); text += chunk.data;
        if (chunk.eof) break;
      }
      await cdp.send('IO.close', { handle: stream });
      trace = `${output}.${id}.${repeat}.trace.json`;
      await fs.mkdir(path.dirname(trace), { recursive: true }); await fs.writeFile(trace, text);
    }
    const snapshot = await page.evaluate(() => ({
      panels: document.querySelectorAll('[data-classroom-surface-panel]').length,
      panelErrors: [...document.querySelectorAll('[data-classroom-surface-error]')].map(e => e.textContent),
      iframes: [...document.querySelectorAll('[data-classroom-wall] iframe')].map(e => ({ src: e.src, title: e.title })),
      quality: sessionStorage.getItem('dc.classroomQualityTier'),
    }));
    if (errors.length || snapshot.panelErrors.length) throw new Error(`Broken benchmark scene: ${JSON.stringify({ errors, panelErrors: snapshot.panelErrors })}`);
    if (args.screenshots === 'true') await page.screenshot({ path: `${output}.${id}.${repeat}.png` });
    const sample = { id, description: descriptions[id], repeat, viewport, cpuThrottle: mobile ? 4 : 1, summary: summary(raw), initial, metricsBefore, metricsAfter, snapshot, errors, failedRequests, trace, raw };
    report.samples.push(sample);
    console.log(id, repeat, JSON.stringify(sample.summary));
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2));
    await context.close();
  }
} finally { await browser.close(); }
console.log(`Saved ${output}`);
