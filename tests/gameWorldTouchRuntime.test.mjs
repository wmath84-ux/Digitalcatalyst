import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const out = path.resolve('node_modules/.cache/game-world-mobile/touch.cjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
buildSync({ entryPoints: ['vendor/threejs-world/src/core/TouchControls.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: out });
const { installTouchControls } = require(out);

test('original camera touch controls support simultaneous move/look and release safely', () => {
  const dom = new JSDOM('<!doctype html><body><canvas></canvas></body>');
  const w = dom.window;
  for (const [key, value] of Object.entries({ window: w, document: w.document, AbortController: w.AbortController })) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const canvas = w.document.querySelector('canvas');
  canvas.setPointerCapture = () => {};
  const rig = { enabled: true, touchX: 0, touchY: 0, yaw: 0, pitch: 0, mode: 'walk', jumps: 0,
    jump() { this.jumps++; }, setMode(mode) { this.mode = mode; } };
  const dispose = installTouchControls(rig, canvas);
  const pointer = (type, id, x, y) => {
    const e = new w.MouseEvent(type, { clientX: x, clientY: y, cancelable: true });
    Object.defineProperties(e, { pointerId: { value: id }, pointerType: { value: 'touch' } });
    canvas.dispatchEvent(e);
  };
  pointer('pointerdown', 1, 100, 400);
  pointer('pointermove', 1, 100, 372.5);
  assert.equal(rig.touchY, 0.5);
  pointer('pointerdown', 2, 800, 400);
  pointer('pointermove', 2, 850, 425);
  assert.equal(rig.yaw, -0.2);
  assert.equal(rig.pitch, -0.1);
  assert.equal(rig.touchY, 0.5, 'look does not clear movement');
  pointer('pointercancel', 1, 100, 350);
  assert.equal(rig.touchY, 0);
  pointer('lostpointercapture', 2, 850, 425);
  pointer('pointermove', 2, 900, 450);
  assert.equal(rig.yaw, -0.2, 'lost capture cannot keep turning');
  w.document.querySelector('[aria-label="Jump"]').click();
  assert.equal(rig.jumps, 1);
  w.document.querySelector('[aria-label="Toggle walk or fly"]').click();
  assert.equal(rig.mode, 'fly');
  pointer('pointerdown', 3, 100, 400);
  pointer('pointermove', 3, 100, 345);
  assert.equal(rig.touchY, 1);
  w.dispatchEvent(new w.Event('blur'));
  assert.equal(rig.touchY, 0);
  rig.enabled = false;
  pointer('pointerdown', 4, 100, 400);
  pointer('pointermove', 4, 100, 345);
  assert.equal(rig.touchY, 0);
  dispose();
  assert.equal(w.document.querySelector('.world-touch-controls'), null);
  rig.enabled = true;
  pointer('pointerdown', 5, 100, 400);
  pointer('pointermove', 5, 100, 345);
  assert.equal(rig.touchY, 0, 'disposed listeners cannot drive camera');
  dom.window.close();
});
