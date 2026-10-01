// Actual WebGL2 linking/pixel readback + real React touch controls and engine
// input integration. Install Playwright Chromium, or supply its executable via
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. Everything is local; no live account.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { characterFixtureJson, encodeGlb, MAPPING } from './fixtures/sanctuaryCharacterGlb.mjs';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);
// A headless Chromium that cannot create a WebGL2 context (no GPU and no
// working SwiftShader) must SKIP with that reason, not time out on a page that
// can never finish booting the renderer.
const browserTest = (name, fn) => test(name, { timeout: 180000 }, async (t) => {
  if (!enabled) return t.skip('Install Chromium to run the real WebGL2/controls regression');
  if (!webgl) return t.skip('Chromium cannot create a WebGL2 context here; no GPU/SwiftShader in this environment');
  return fn(t);
});
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'node_modules/.cache/sanctuary-world-browser');
let browser, server, page, origin, webgl = false;
const errors = [];

before(async () => {
  if (!enabled) return;
  fs.mkdirSync(DIR, { recursive: true });
  await build({
    stdin: { resolveDir: ROOT, loader: 'tsx', contents: `
import * as THREE from 'three';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Sanctuary } from './src/nature3d/engine/scene';
import CharacterControls from './src/nature3d/CharacterControls';
import { FALLBACK_CHARACTER_STATUS } from './src/nature3d/engine/characterManifest';
import { loadCharacterAvatar } from './src/nature3d/engine/characterAsset';
import { DAY_BED_SCALE } from './src/nature3d/engine/dayBed';
const stage = document.querySelector<HTMLElement>('#stage')!;
const world = document.querySelector<HTMLElement>('#world')!;
const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const react = createRoot(document.querySelector('#controls')!);
let mode: any = 'orbit', status = FALLBACK_CHARACTER_STATUS, paused = false;
let engine: Sanctuary;
const engineRef = { current: null as Sanctuary | null };
function ui() { react.render(<CharacterControls engineRef={engineRef} mode={mode} status={status} paused={paused} hidden={false} onStart={() => engine.setCharacterMode('third-person')} onOverview={() => engine.focus('world')} />); }
engine = new Sanctuary({ canvas, dom: world, tier: 'low', onCharacterMode: m => { mode = m; ui(); }, onCharacterAsset: s => { status = s; ui(); } });
engineRef.current = engine;
const e = engine as any;
engine.setDaylightMode('midday');
let clock = 0, iframeLoads = 0;
const iframe = document.createElement('iframe'); iframe.srcdoc = '<!doctype html><body style="background:#18352a">Persistent lesson</body>';
iframe.addEventListener('load', () => iframeLoads++); e.screens.byId('reading').element.appendChild(iframe);
const parents = e.screens.screens.map((s: any) => [s.host.parentNode, s.element.parentNode]);
function resize(w: number, h: number, rotate = false) {
  stage.style.cssText = rotate ? 'position:absolute;left:50%;top:50%;width:'+w+'px;height:'+h+'px;transform:translate(-50%,-50%) rotate(90deg);overflow:hidden' : 'position:relative;width:'+w+'px;height:'+h+'px;overflow:hidden';
  engine.resize(w, h); e.renderer.setPixelRatio(0.7); e.renderer.setSize(w, h, false);
}
function sync(dt: number) {
  e.avatar.group.position.copy(e.character.position); e.avatar.group.rotation.y = e.character.rotation;
  e.avatar.setVisible(e.character.mode === 'orbit' || e.character.cameraRig.bodyVisible);
  if (!paused) e.avatar.update(dt, clock, e.character, e.camera);
}
function advance(seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    clock += 1/60;
    if (e.character.enabled) {
      if (!paused) e.characterInput(1/60);
      e.character.update(1/60, e.camera, paused);
    } else e.orbit.update(1/60, e.camera);
    if (e.pendingReadSlot) {
      e.pendingPinAge += 1/60;
      if (e.orbit.settled() || e.pendingPinAge > 0.85) { e.screens.setReadSlot(e.pendingReadSlot); e.pendingReadSlot = null; e.pendingPinAge = 0; }
    }
    sync(1/60);
  }
  e.camera.updateMatrixWorld(true); e.screens.render(e.camera, true);
  return engine.getCharacterSnapshot();
}
function render() {
  if (!e.character.enabled) e.orbit.update(5, e.camera);
  sync(1/60); e.camera.updateMatrixWorld(true);
  e.sky.update(1/60, clock, 1, e.camera);
  e.renderer.render(e.scene, e.camera); e.screens.render(e.camera, true);
  const gl = e.renderer.getContext();
  const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let magenta = 0, green = 0; const colors = new Set();
  for (let i = 0; i < pixels.length; i+=4) {
    const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
    if (r > 210 && g < 70 && b > 180) magenta++;
    if (g > r * 1.04 && g > b * 1.04) green++;
    colors.add((r>>4)*256 + (g>>4)*16 + (b>>4));
  }
  return { magenta, green, colors: colors.size, draws: e.renderer.info.render.calls, programFailures: e.renderer.info.programs.filter((p: any) => p.diagnostics && !p.diagnostics.runnable).length };
}
resize(800,500); engine.focus('world'); ui();
(window as any).fx = {
 engine, e, render, advance, resize, snapshot: () => engine.getCharacterSnapshot(),
 stats: () => {
   const instanceErrors: string[] = [];
   e.scene.traverse((m: any) => { if (m.isInstancedMesh && (m.count <= 0 || m.count > m.instanceMatrix.count || m.instanceColor && m.count > m.instanceColor.count)) instanceErrors.push(m.name || m.uuid); });
   return { instanceErrors, sofaScale: e.dayBed?.group.children[0].scale.x, expectedScale: DAY_BED_SCALE,
    groups: e.scene.children.map((g: any) => g.name), height: e.avatar.group.userData.characterHeight,
    sameBoards: e.screens.screens.every((s: any,i: number) => s.host.isConnected && s.host.parentNode === parents[i][0] && s.element.parentNode === parents[i][1]),
    iframeConnected: iframe.isConnected, iframeLoads };
 },
 boardsInteractive: () => e.screens.screens.some((s: any) => !s.host.inert && s.host.style.pointerEvents !== 'none'),
 overlay: (open: boolean) => { paused = open; engine.setOverlayOpen(open); ui(); },
 loadTestAvatar: async () => { const loaded = await loadCharacterAvatar(false, (window as any).testMapping); (window as any).testAvatar = loaded; return loaded!.status; },
 testAvatarState: () => {
   const v = (window as any).testAvatar.avatar; const p = e.character;
   v.group.position.set(0,0,0); v.group.rotation.y = 0; p.reset(0,0); p.lookYaw = 0.5; p.lookPitch = 0.2;
   e.camera.position.set(0,2,4);
   let before: number[] = [], after: number[] = [];
   const head = v.group.getObjectByName(THREE.PropertyBinding.sanitizeNodeName((window as any).testMapping.boneMap.head));
   for (let i = 0; i < 120; i++) { v.update(1/60,i/60,p,e.camera); if(i===30) before=head.quaternion.toArray(); }
   after = head.quaternion.toArray();
   const height = new THREE.Box3().setFromObject(v.group).getSize(new THREE.Vector3()).y;
   v.dispose(); return { before, after, height, source:v.group.userData.characterSource };
 },
 dispose: () => { react.unmount(); engine.dispose(); return e.scene.children.length; },
};
` },
    outfile: path.join(DIR, 'fixture.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
    define: { 'import.meta.env.BASE_URL': '"/"' },
  });
  const { json, binary } = characterFixtureJson();
  // Loader names are sanitized by Three, while manifests/installer refer
  // to raw glTF joint names. Exercise Blender-style punctuation too.
  json.nodes[1].name = 'Actor:Rig.Main'; json.nodes[3].name = 'Head.001';
  const mapping = { ...MAPPING, boneMap: { ...MAPPING.boneMap, head: 'Head.001' } };
  const testGlb = encodeGlb(json, binary);
  const mime = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.js': 'text/javascript', '.css': 'text/css' };
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture');
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#081519;font-family:system-ui}#world,#controls{position:absolute;inset:0}#controls{pointer-events:none}canvas{display:block;width:100%;height:100%}#world{touch-action:none}</style></head><body><div id="stage" data-sanctuary-root><div id="world"><canvas tabindex="0"></canvas></div><div id="controls"></div></div><script>window.testMapping=${JSON.stringify(mapping)}</script><script src="/fixture.js"></script></body></html>`); return;
    }
    // Keep synthetic/guide regressions independent of deployed paid assets.
    // Original asset import is exercised in sanctuaryOriginalCharacter.test.mjs.
    if (url.pathname === '/sanctuary/character/manifest.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...MAPPING, modelUrl: null, licenseConfirmed: false })); return; }
    if (url.pathname === '/sanctuary/character/character.glb') { res.setHeader('Content-Type', 'model/gltf-binary'); res.end(testGlb); return; }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const filename = url.pathname === '/fixture.js' || url.pathname === '/fixture.css' ? path.join(DIR, url.pathname.slice(1)) : path.resolve(ROOT, 'public', '.' + url.pathname);
    if (!filename.startsWith(path.join(ROOT, 'public') + path.sep) && !filename.startsWith(DIR + path.sep)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', mime[path.extname(filename)] ?? 'application/octet-stream'); fs.createReadStream(filename).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--no-zygote', '--disable-gpu-sandbox'] });
  page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => errors.push(`Network: ${r.url()} ${r.failure()?.errorText}`));
  webgl = await page.evaluate(() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } });
  if (!webgl) return;
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.fx && ['grass-tuft-field', 'vintage-day-bed', 'rusty-roof-villa', 'mountain-forest-ring', 'beach-houses'].every(name => window.fx.e.scene.getObjectByName(name)), null, { timeout: 120000 });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function screenshot(name) {
  if (!process.env.SANCTUARY_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.SANCTUARY_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.SANCTUARY_SCREENSHOT_DIR, name + '.png'), timeout: 120000 });
}

browserTest('low-tier world truly links and paints ground/houses/mountains without invalid instances or magenta spikes', async () => {
  const metadata = await page.evaluate(() => fx.stats());
  for (const name of ['terrain', 'far-range', 'flora', 'beach-houses', 'rusty-roof-villa', 'vintage-day-bed', 'sanctuary-character']) assert.ok(metadata.groups.includes(name), name);
  assert.deepEqual(metadata.instanceErrors, []); assert.ok(Math.abs(metadata.height - 5.4864) < 1e-6, String(metadata.height));
  assert.equal(metadata.sofaScale, metadata.expectedScale);
  assert.ok(!metadata.groups.includes('student') && !metadata.groups.includes('seated-student'));
  const pixels = await page.evaluate(() => fx.render());
  assert.equal(pixels.programFailures, 0); assert.equal(pixels.magenta, 0);
  assert.ok(pixels.green > 1000 && pixels.colors > 60 && pixels.draws > 30, JSON.stringify(pixels));
  assert.deepEqual(errors, []);
  await screenshot('sanctuary-world');
});

browserTest('real keyboard/HUD drives an 18ft player; camera switches preserve input; pause/blur/reset and boards are safe', async () => {
  await page.getByRole('button', { name: /Explore on foot/ }).click();
  const start = await page.evaluate(() => fx.snapshot());
  await page.getByRole('button', { name: 'Run toggle' }).click();
  assert.equal(await page.getByRole('button', { name: 'Run toggle' }).getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('r');
  assert.equal(await page.getByRole('button', { name: 'Run toggle' }).getAttribute('aria-pressed'), 'false');
  await page.keyboard.down('w'); await page.keyboard.down('Shift');
  const running = await page.evaluate(() => fx.advance(0.8));
  assert.ok(running.speed > 4.9 && running.position[2] < start.position[2] - 2.8, JSON.stringify(running));
  await page.keyboard.press('v');
  const fpp = await page.evaluate(() => fx.advance(0.2));
  assert.equal(fpp.mode, 'first-person'); assert.equal(fpp.bodyVisible, false); assert.ok(fpp.speed > 4.9);
  await page.keyboard.up('w'); await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'Respawn character' }).click();
  await page.evaluate(() => fx.advance(0.4));
  await page.keyboard.press('v'); await page.evaluate(() => fx.advance(0.1));
  await page.keyboard.down('Space'); const jump = await page.evaluate(() => fx.advance(0.25)); await page.keyboard.up('Space');
  assert.ok(!jump.grounded && jump.position[1] > jump.spawn[1] + 0.6, JSON.stringify(jump));
  await page.evaluate(() => fx.advance(1));
  await page.getByRole('button', { name: 'Crouch toggle' }).click(); assert.equal((await page.evaluate(() => fx.advance(0.4))).crouched, true);
  await page.getByRole('button', { name: 'Crouch toggle' }).click(); await page.evaluate(() => fx.advance(0.4));
  await page.keyboard.down('w'); await page.evaluate(() => fx.advance(0.3));
  const frozen = await page.evaluate(() => { fx.overlay(true); return fx.snapshot(); });
  assert.deepEqual((await page.evaluate(() => fx.advance(1))).position, frozen.position);
  await page.keyboard.up('w'); await page.evaluate(() => fx.overlay(false));
  assert.equal((await page.evaluate(() => fx.advance(0.5))).speed, 0);
  await page.keyboard.down('w'); await page.evaluate(() => fx.advance(0.3));
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('w');
  assert.equal((await page.evaluate(() => fx.advance(0.4))).speed, 0);
  const boards = await page.evaluate(() => fx.stats());
  assert.ok(boards.sameBoards && boards.iframeConnected && boards.iframeLoads === 1);
  assert.equal(await page.evaluate(() => fx.boardsInteractive()), false);
  await page.evaluate(() => fx.render()); await screenshot('sanctuary-third-person');
  await page.evaluate(() => fx.engine.focus('reading')); await page.evaluate(() => fx.advance(2));
  assert.equal((await page.evaluate(() => fx.snapshot())).mode, 'orbit'); assert.equal(await page.evaluate(() => fx.boardsInteractive()), true);
  assert.equal((await page.evaluate(() => fx.stats())).iframeLoads, 1); assert.deepEqual(errors, []);
});

browserTest('mobile sticks and scene drags undo rotated landscape coordinates, clean up cancelled pointers, and support gamepad', async () => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.evaluate(() => { fx.resize(800,400,true); fx.engine.setCharacterMode('third-person'); fx.engine.characterAction('reset'); });
  await page.waitForSelector('[data-character-stick="move"]');
  const start = await page.evaluate(() => fx.snapshot());
  const rect = await page.locator('[data-character-stick="move"]').boundingBox();
  // Stage +90° maps LOCAL up (forward) to CLIENT right.
  await page.mouse.move(rect.x + rect.width/2, rect.y + rect.height/2); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width/2 + 30, rect.y + rect.height/2);
  const moving = await page.evaluate(() => fx.advance(0.5)); assert.ok(moving.position[2] < start.position[2] - 0.7 && Math.abs(moving.position[0] - start.position[0]) < 0.05);
  await page.mouse.up(); assert.equal((await page.evaluate(() => fx.advance(0.4))).speed, 0);
  const look = await page.locator('[data-character-stick="look"]').boundingBox();
  const yaw = await page.evaluate(() => fx.e.character.cameraRig.yaw);
  // LOCAL right maps to CLIENT down, and must rotate yaw, not pitch.
  await page.mouse.move(look.x + look.width/2, look.y + look.height/2); await page.mouse.down();
  await page.mouse.move(look.x + look.width/2, look.y + look.height/2 + 25); await page.evaluate(() => fx.advance(0.4)); await page.mouse.up();
  assert.ok((await page.evaluate(() => fx.e.character.cameraRig.yaw)) < yaw - 0.4);
  await page.evaluate(() => fx.engine.characterAction('reset')); const before = await page.evaluate(() => fx.e.character.cameraRig.yaw);
  await page.mouse.move(180,390); await page.mouse.down(); await page.mouse.move(180,420); await page.mouse.up(); await page.evaluate(() => fx.advance(0.4));
  assert.ok((await page.evaluate(() => fx.e.character.cameraRig.yaw)) < before - 0.1);
  await page.evaluate(() => {
    const stick = document.querySelector('[data-character-stick="move"]'); const r = stick.getBoundingClientRect();
    stick.dispatchEvent(new PointerEvent('pointerdown',{pointerId:9,clientX:r.x+r.width/2+25,clientY:r.y+r.height/2,bubbles:true}));
    stick.dispatchEvent(new PointerEvent('pointercancel',{pointerId:9,bubbles:true}));
  });
  assert.equal((await page.evaluate(() => fx.advance(0.4))).speed, 0);
  await page.evaluate(() => {
    fx.engine.characterAction('reset');
    window.pad = { connected:true,mapping:'standard',axes:[0,-1,0,0],buttons:Array.from({length:12},(_,i)=>({pressed:i===10,value:i===10?1:0})) };
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.pad]});
  });
  assert.ok((await page.evaluate(() => fx.advance(0.8))).speed > 4.9);
  await page.evaluate(() => { window.pad = null; window.dispatchEvent(new Event('blur')); });
  assert.equal((await page.evaluate(() => fx.advance(0.4))).speed, 0);
  await page.getByRole('button', { name: 'Run toggle' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.getByRole('button', { name: 'Run toggle' }).getAttribute('aria-pressed'), 'false');
  await page.locator('[data-character-help] > summary').click();
  const help = await page.locator('.sanctuary-character-help-panel').boundingBox();
  assert.ok(help.x >= -1 && help.y >= -1 && help.x + help.width <= 401 && help.y + help.height <= 801, JSON.stringify(help));
  await page.locator('[data-character-help] > summary').click();
  await page.evaluate(() => fx.render()); await screenshot('sanctuary-mobile-landscape');
  await page.setViewportSize({ width:800,height:500 }); await page.evaluate(() => fx.resize(800,500,false));
  assert.deepEqual(errors, []);
});

browserTest('licensed character-only GLB loader normalizes to 18ft and does not accumulate aim on unanimated bones', async () => {
  const status = await page.evaluate(() => fx.loadTestAvatar()); assert.equal(status.kind, 'imported');
  const loaded = await page.evaluate(() => fx.testAvatarState());
  assert.equal(loaded.source, 'imported'); assert.ok(Math.abs(loaded.height - 5.4864) < 0.005, String(loaded.height));
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(loaded.before[i] - loaded.after[i]) < 1e-5);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => fx.dispose()), 0);
});
