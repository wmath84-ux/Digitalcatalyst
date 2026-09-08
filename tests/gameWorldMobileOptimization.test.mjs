import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
const require = createRequire(import.meta.url);
const base = path.resolve('vendor/threejs-world/src');
const cache = path.resolve('node_modules/.cache/game-world-mobile');
fs.mkdirSync(cache, { recursive: true });
const out = path.join(cache, 'pure.cjs');
buildSync({ stdin: { contents: `export * from ${JSON.stringify(base + '/core/DeviceProfile.ts')}; export * from ${JSON.stringify(base + '/core/FrameBudget.ts')};`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', outfile: out });
const { selectProfile, cappedDpr, effectExclusions, FramePacer, AdaptiveResolution, FrameWindow } = require(out);
const phone = { userAgent: 'Android Mobile Chrome', maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 4 };
const low = selectProfile(phone);
const balanced = selectProfile({ ...phone, deviceMemory: 8 });
const desktop = selectProfile({ userAgent: 'Chrome Linux x86_64', maxTouchPoints: 0 });
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

test('conservative phone/tablet profiles; desktop and explicit A/B override remain available', () => {
  assert.equal(low.name, 'mobile-low');
  assert.equal(balanced.name, 'mobile-balanced');
  assert.equal(selectProfile({ userAgent: 'Macintosh Safari', maxTouchPoints: 5 }).name, 'mobile-low');
  assert.equal(selectProfile({ ...phone, deviceMemory: undefined }).name, 'mobile-low');
  assert.equal(desktop.name, 'desktop');
  assert.equal(selectProfile(phone, 'desktop').name, 'desktop');
  assert.equal(selectProfile(phone, '__proto__').name, 'mobile-low');
});

test('render-target area is bounded even on high-DPR large tablets', () => {
  for (const p of [low, balanced]) for (const [w, h] of [[390, 844], [2560, 1600], [820, 1180]]) {
    const ratio = cappedDpr(w, h, 3, p);
    assert.ok(ratio <= p.maxDpr);
    assert.ok(w * h * ratio ** 2 <= p.maxPixels + 0.01);
    assert.ok(ratio > 0);
  }
  assert.equal(cappedDpr(390, 844, NaN, low), 1);
});

for (const refresh of [60, 90, 120]) test(`30 FPS target paces evenly on a ${refresh} Hz display`, () => {
  const pacer = new FramePacer(30);
  const frames = [];
  for (let i = 0; i < refresh * 10; i++) if (pacer.shouldRender(i * 1000 / refresh)) frames.push(i * 1000 / refresh);
  assert.equal(frames.length, 300);
  for (let i = 1; i < frames.length; i++) assert.ok(Math.abs(frames[i] - frames[i - 1] - 1000 / 30) < 0.01);
  assert.equal(pacer.shouldRender(60000), true);
  assert.equal(pacer.shouldRender(60001), false, 'no catch-up burst after a stall');
  pacer.reset();
  assert.equal(pacer.shouldRender(60002), true);
});

test('adaptive resolution has sustained-pressure threshold, cooldown, floor and slow recovery', () => {
  const adaptive = new AdaptiveResolution(1000 / 30, 0.5);
  for (let i = 0; i < 20; i++) adaptive.sample(90, 60, 10000 + i * 34);
  assert.equal(adaptive.scale, 1, 'isolated spike must not reallocate render targets');
  for (let i = 0; i < 40; i++) adaptive.sample(60, 35, 11000 + i * 34);
  assert.equal(adaptive.scale, 0.9);
  for (let i = 0; i < 100; i++) adaptive.sample(60, 35, 13000 + i * 34);
  assert.equal(adaptive.scale, 0.9, '8-second cooldown');
  for (let i = 0; i < 3000; i++) adaptive.sample(60, 35, 20000 + i * 34);
  assert.equal(adaptive.scale, 0.5);
  for (let i = 0; i < 1000; i++) adaptive.sample(33.33, 8, 140000 + i * 34);
  assert.ok(adaptive.scale > 0.5 && adaptive.scale < 1, 'recovery is deliberately slower');
});

test('P95 telemetry uses a bounded rolling sample window', () => {
  const window = new FrameWindow();
  for (let i = 0; i < 120; i++) window.push(33.3);
  assert.ok(Math.abs(window.p95 - 33.3) < 0.01);
  for (let i = 0; i < 120; i++) window.push(20);
  assert.equal(window.p95, 20);
});

test('mobile effect budget keeps the original world, water, sky and vegetation', () => {
  const excluded = effectExclusions('', low);
  for (const name of ['froxels', 'caustics', 'bounce', 'bloom', 'ao', 'taa']) assert.ok(excluded.has(name));
  for (const name of ['water', 'veg', 'grass', 'clouds', 'gi']) assert.equal(excluded.has(name), false);
  assert.equal(effectExclusions('', balanced).has('taa'), false);
  assert.equal(effectExclusions('', desktop).has('bloom'), false);
});

test('reduced cascades share a single allocation budget with their caster groups', () => {
  assert.match(read('vegetation/Forests.ts'), /const CASCADES = PROFILE.cascades/);
  assert.match(read('vegetation/Forests.ts'), /Math.min\(2, CASCADES\)/);
  assert.match(read('render/ShadowSetup.ts'), /Math.min\(PROFILE.cascades/);
  assert.match(read('render/ShadowSetup.ts'), /mapSize.set\(PROFILE.shadowSize, PROFILE.shadowSize\)/);
  assert.ok(low.cascades * low.shadowSize ** 2 < desktop.cascades * desktop.shadowSize ** 2 / 32);
});

test('hero pools are never built on mobile and R1 covers the camera without a hole', () => {
  assert.match(read('vegetation/VegLibrary.ts'), /PROFILE.mobile \? null : buildTree/);
  assert.match(read('vegetation/Forests.ts'), /R0_FAR = PROFILE.mobile \? -5 : 26/);
  assert.match(read('vegetation/Forests.ts'), /const BAND0 = 5/);
  assert.match(read('vegetation/Forests.ts'), /desktopCapOf\(g\) \* PROFILE.compactScale/);
});

test('boot-baked SH probes refresh only on invalidation on mobile; diagnostics readback is optional', () => {
  assert.match(read('gpu/passes/ProbeGI.ts'), /PROFILE.mobile && this.boost === 0/);
  assert.match(read('gpu/passes/ProbeGI.ts'), /this.blend.value = PROFILE.mobile \? 1 : 0.6/);
  assert.match(read('vegetation/GroundRing.ts'), /if \(PROFILING &&/);
  assert.match(read('vegetation/Forests.ts'), /if \(PROFILING &&/);
  assert.match(read('core/Engine.ts'), /trackTimestamp: PROFILING/);
});

test('background rendering pauses, shader warm-up stays under loading UI, same rig gets touch input', () => {
  assert.match(read('core/Engine.ts'), /setAnimationLoop\(this.suspended \? null/);
  assert.match(read('core/Engine.ts'), /device.lost.then/);
  assert.match(read('main.ts'), /await engine.renderer.compileAsync/);
  assert.match(read('main.ts'), /installTouchControls\(fly, engine.renderer.domElement\)/);
  assert.match(read('core/TouchControls.ts'), /pointercancel/);
  assert.match(read('core/TouchControls.ts'), /lostpointercapture/);
  assert.match(read('core/FlyCamera.ts'), /addScaledVector\(FORWARD, this.touchY\)/);
});

test('cloud volumes use portable filterable storage formats, not unsupported R16Float writes', () => {
  const clouds = read('sky/Clouds.ts');
  assert.match(clouds, /this.baseNoise.format = RGBAFormat/);
  assert.match(clouds, /this.detailNoise.format = RGBAFormat/);
  assert.doesNotMatch(clouds, /format = RedFormat/);
});
