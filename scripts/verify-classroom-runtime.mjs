#!/usr/bin/env node
// Browser regression checks against a built player, with deterministic remote
// fixtures. This is NOT a real YouTube decoder or Google editor test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { prepareClassroomBenchmark, installClassroomFixtures } from './classroom-performance-probe.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/, '').split('='); return [key, value.join('=') || 'true'];
}));
const url = args.url || 'http://127.0.0.1:4174';
const output = args.out || 'scratch/classroom-perf/runtime.json';
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'],
});
const results = { date: new Date().toISOString(), url, fixtures: true, assertions: [], visual: [], memory: [] };
await fs.mkdir(path.dirname(output), { recursive: true });
const pass = name => { results.assertions.push(name); console.log('PASS', name); };
async function open(origin, { tier = 'low', dpr = 2 } = {}) {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: dpr, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepareClassroomBenchmark(page, { tier, fixed: true });
  await installClassroomFixtures(page, origin);
  await page.goto(`${origin}/?opening=off#/dev/classroom-3d`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__classroomProbe?.scene?.__r3f, null, { timeout: 45000 });
  await page.waitForTimeout(2500);
  return { context, page, errors };
}
const waitDpr = (page, value) => page.waitForFunction(value => Math.abs(window.__classroomProbe.renderer.getPixelRatio() - value) < .001, value);
const setPerformance = (page, current) => page.evaluate(current => {
  const state = window.__classroomProbe.scene.__r3f.root.getState();
  state.set({ performance: { ...state.performance, current } });
}, current);
const focus = (page, label) => page.locator('.dc-classroom-hud').getByRole('button', { name: label, exact: true }).click();

try {
  const { context, page, errors } = await open(url);
  assert.equal(await page.locator('[data-classroom-surface-panel]').count(), 4);
  assert.equal(await page.locator('[data-classroom-surface-error]').count(), 0);
  assert.deepEqual(errors, []);
  pass('All four existing surfaces mount without an application error');
  await waitDpr(page, .84);
  assert.equal(await page.evaluate(() => window.__classroomProbe.scene.__r3f.root.getState().viewport.initialDpr), 2);
  assert.equal(await page.evaluate(() => window.__classroomProbe.scene.__r3f.root.getState().performance.min), .42);
  pass('Weak startup uses .84 DPR but retains the recoverable 2 DPR ceiling');

  await page.evaluate(() => { window.__retainedFrame = document.querySelector('[data-classroom-wall="board"] iframe'); });
  const frame = page.frames().find(frame => frame.url().includes('youtube-nocookie.com/embed/'));
  assert.ok(frame, 'YouTube fixture is booted through the real ResourceViewer');
  await frame.evaluate(() => { document.querySelector('textarea').value = 'Retained iframe draft / playback stand-in'; });

  await setPerformance(page, .7); await waitDpr(page, 1.4);
  await focus(page, 'Notes'); await page.waitForTimeout(600); await waitDpr(page, 1.4);
  pass('Focus/portal rerenders do not reset an adaptive DPR');
  await page.evaluate(() => {
    const canvas = window.__classroomProbe.renderer.domElement;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 300, clientY: 200, bubbles: true }));
  });
  await waitDpr(page, 1);
  await setPerformance(page, .42); await waitDpr(page, .84);
  await page.evaluate(() => window.__classroomProbe.renderer.domElement.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })));
  await waitDpr(page, .84);
  pass('A governor decline during a drag wins over the stale drag snapshot');
  await setPerformance(page, 1); await waitDpr(page, 2);
  await setPerformance(page, .42); await waitDpr(page, .84);
  pass('Recovery can reach the full area-capped DPR after a weak start');

  await focus(page, 'Notes'); await page.waitForTimeout(1200);
  await page.locator('[data-classroom-new-note]').evaluate(element => element.click());
  const editor = page.locator('[data-course-notes-input]');
  await editor.fill('Unsaved classroom regression draft');
  await focus(page, 'Mind map'); await page.waitForTimeout(600);
  await focus(page, 'Board'); await page.waitForTimeout(600);
  await focus(page, 'Notes'); await page.waitForTimeout(1000);
  assert.equal(await editor.innerText(), 'Unsaved classroom regression draft');
  await page.locator('[data-course-notes-save]').evaluate(element => element.click());
  await page.waitForFunction(() => document.querySelector('[data-course-notes-panel]')?.getAttribute('data-course-notes-mode') === 'list');
  assert.ok((await page.locator('[data-classroom-wall="notes"]').innerText()).includes('Unsaved classroom regression draft'));
  pass('An unsaved note survives wall focus changes and still saves through NotesPanel');

  await focus(page, 'Board'); await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => window.__retainedFrame === document.querySelector('[data-classroom-wall="board"] iframe')), true);
  assert.equal(await frame.evaluate(() => document.querySelector('textarea').value), 'Retained iframe draft / playback stand-in');
  pass('The iframe node and its internal state survive movement and focus-away/back');
  const complete = page.locator('[data-classroom-control-tray] [data-done]');
  await complete.click(); assert.equal(await complete.getAttribute('data-done'), 'true');
  await complete.click(); assert.equal(await complete.getAttribute('data-done'), 'false');
  const fit = page.locator('[data-classroom-fit-fill]');
  await fit.click(); assert.equal(await fit.getAttribute('data-filled'), 'true');
  await fit.click(); assert.equal(await fit.getAttribute('data-filled'), 'false');
  pass('Completion toggling and FIT/FILL controls preserve their existing behavior');

  await page.locator('[data-classroom-board-panel]').evaluate(element => element.requestFullscreen());
  await page.waitForFunction(() => document.fullscreenElement && window.__classroomProbe.scene.__r3f.root.getState().frameloop === 'demand');
  await page.waitForTimeout(1000);
  const frameBefore = await page.evaluate(() => window.__classroomProbe.renderer.info.render.frame);
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => window.__classroomProbe.renderer.info.render.frame), frameBefore);
  assert.equal(await frame.evaluate(() => document.querySelector('textarea').value), 'Retained iframe draft / playback stand-in');
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(frameBefore => window.__classroomProbe.scene.__r3f.root.getState().frameloop === 'always' && window.__classroomProbe.renderer.info.render.frame > frameBefore, frameBefore);
  assert.equal(await page.evaluate(() => window.__retainedFrame === document.querySelector('[data-classroom-wall="board"] iframe')), true);
  pass('Native fullscreen sleeps hidden WebGL, keeps the iframe, and resumes the same Canvas on exit');

  // Actual production scene census after repeated wall/quality changes.
  const inventory = await page.evaluate(() => window.__classroomProbe.inventory());
  assert.equal(inventory.shadow.type, 1); assert.equal(inventory.shadow.autoUpdate, false);
  assert.equal(inventory.geometries, 55); assert.equal(inventory.materials, 59);
  results.memory.push({ description: 'after interaction regression checks', geometries: inventory.geometries, materials: inventory.materials, geometryBytes: inventory.geometryBytes, heapBytes: inventory.heapBytes });
  assert.deepEqual(errors, []);
  pass('Baked PCF shadows and shared-resource counts remain stable after interactions');
  const cycles = Number(args['memory-cycles'] || 0);
  if (cycles) {
    const cdp = await context.newCDPSession(page);
    await page.evaluate(() => { delete window.__retainedFrame; });
    let headGeometry;
    for (let cycle = 0; cycle <= cycles; cycle++) {
      if (cycle) {
        await page.evaluate(() => { window.location.hash = '#/login'; });
        await page.waitForFunction(() => !document.querySelector('[data-classroom-cycle-focus]'));
        await page.waitForFunction(() => window.__classroomProbe.renderer.getContext().isContextLost());
        await page.evaluate(() => { window.location.hash = '#/dev/classroom-3d'; });
        await page.waitForFunction(() => document.querySelector('[data-classroom-cycle-focus]') && !window.__classroomProbe.renderer.getContext().isContextLost());
        await page.waitForTimeout(1500);
      }
      await cdp.send('HeapProfiler.collectGarbage');
      const sample = await page.evaluate(() => {
        const probe = window.__classroomProbe, info = probe.inventory();
        return { heapBytes: performance.memory.usedJSHeapSize, geometries: info.geometries, materials: info.materials, textures: probe.renderer.info.memory.textures, headDisposeListeners: probe.scene.getObjectByName('Classmate-0').children[0].children[2].geometry._listeners?.dispose?.length ?? 0, headGeometry: probe.scene.getObjectByName('Classmate-0').children[0].children[2].geometry.uuid };
      });
      headGeometry ??= sample.headGeometry;
      assert.equal(sample.headGeometry, headGeometry, 'CPU geometry cache survives renderer replacement');
      assert.equal(sample.headDisposeListeners, 1, 'old renderer listeners are released, not accumulated');
      assert.equal(sample.geometries, 55); assert.equal(sample.materials, 59); assert.equal(sample.textures, 3);
      results.memory.push({ cycle, afterForcedGC: true, ...sample });
    }
    pass(`Shared assets and GPU resource counts stay bounded across ${cycles} leave/re-enter cycles`);
  }
  await context.close();

  // Optional same-pose GL captures. Random weather is excluded on BOTH sides
  // only for pixel comparison (not for FPS runs). No screenshot/readback code
  // runs in the production application.
  for (const [label, origin] of [['before', args['baseline-url']], ['after', url]]) {
    if (!origin) continue;
    const { context, page, errors } = await open(origin, { tier: 'high', dpr: 1 });
    for (const pose of ['seat', 'rear']) {
      const capture = await page.evaluate(pose => {
        const probe = window.__classroomProbe, state = probe.scene.__r3f.root.getState();
        state.setFrameloop('never');
        const index = state.internal.subscribers.findIndex(entry => entry.ref.current.toString().includes('Math.pow(.0016'));
        if (index < 0) throw new Error('SeatRig not found');
        const override = { priority: 0, store: probe.scene.__r3f.root, ref: { current: state => {
          if (pose === 'rear') {
            state.camera.position.set(0, 2.6, 9); state.camera.rotation.set(-.13, 0, 0, 'YXZ'); state.camera.fov = 75;
          } else {
            state.camera.position.set(.15, 1.24, 2.62); state.camera.rotation.set(.0946, .0254, 0, 'YXZ'); state.camera.fov = 55;
          }
          state.camera.updateProjectionMatrix(); state.camera.updateMatrixWorld();
        } } };
        state.internal.subscribers.splice(index + 1, 0, override);
        probe.renderer.shadowMap.type = 1;
        probe.renderer.shadowMap.needsUpdate = true;
        state.advance(pose === 'seat' ? 10 : 10.01, false);
        // A second frame selects distance LOD after the full-detail bake.
        state.advance(pose === 'seat' ? 10.04 : 10.05, false);
        probe.scene.traverse(object => { if (object.isPoints) object.material.visible = false; });
        probe.renderer.render(probe.scene, state.camera);
        const png = probe.renderer.domElement.toDataURL('image/png');
        state.internal.subscribers.splice(state.internal.subscribers.indexOf(override), 1);
        return { png, calls: probe.renderer.info.render.calls, triangles: probe.renderer.info.render.triangles };
      }, pose);
      const file = `${output}.${label}-${pose}.png`;
      await fs.writeFile(file, Buffer.from(capture.png.split(',')[1], 'base64'));
      results.visual.push({ label, pose, file, calls: capture.calls, triangles: capture.triangles });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await fs.writeFile(output, JSON.stringify(results, null, 2));
  console.log(`Saved ${output}`);
} finally { await browser.close(); }
