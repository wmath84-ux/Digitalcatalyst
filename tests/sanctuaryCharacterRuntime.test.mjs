// Runs the actual six-foot controller, collision world and articulated guide,
// not a copied formula or source-code regex. No DOM, account, GPU or paid asset.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

let api;
let dir;
before(async () => {
  await fs.mkdir('node_modules/.cache', { recursive: true });
  dir = await fs.mkdtemp('node_modules/.cache/sanctuary-character-');
  const outfile = path.resolve(dir, 'entry.mjs');
  await build({
    stdin: { resolveDir: process.cwd(), contents: `
      export * from './src/nature3d/engine/characterController';
      export * from './src/nature3d/engine/characterCollision';
      export * from './src/nature3d/engine/characterConfig';
      export * from './src/nature3d/engine/characterManifest';
      export * from './src/nature3d/engine/characterAsset';
      export * from './src/nature3d/engine/trekAvatar';
      export * from './src/nature3d/engine/dayBed';
      export * from './src/nature3d/engine/quality';
      export * from './src/nature3d/engine/atmosphere';
    ` },
    outfile, bundle: true, format: 'esm', platform: 'node', external: ['three'], logLevel: 'silent',
    define: { 'import.meta.env.BASE_URL': '"/"' },
  });
  api = await import(pathToFileURL(outfile));
});
after(async () => { if (dir) await fs.rm(dir, { recursive: true, force: true }); });

function player(terrain = () => 0, radius = 1100, water = () => -Infinity) {
  const world = new api.CharacterCollisionWorld(terrain, radius, water);
  const p = new api.CharacterController(world);
  p.reset(0, 0, 0);
  p.setMode('third-person');
  return p;
}
function advance(p, seconds, fps = 60, camera) {
  for (let i = 0; i < Math.round(seconds * fps); i++) p.update(1 / fps, camera);
}
function box(id, x, z, halfX, halfZ, height, baseY = 0, yaw = 0, cover = false) {
  return { kind: 'box', id, x, z, halfX, halfZ, height, baseY, yaw, cover };
}
function close(a, b, epsilon = 1e-6) { assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`); }


test('guide neutral bounds measure exactly 6 ft, with feet at the terrain origin', () => {
  const v = api.createTrekAvatar(false);
  const b = new THREE.Box3().setFromObject(v.group);
  close(api.CHARACTER_HEIGHT, 1.8288);
  close(b.max.y - b.min.y, api.CHARACTER_HEIGHT);
  close(b.min.y, 0);
  assert.equal(v.seated, false);
  assert.equal(v.group.userData.characterSource, 'procedural');
  assert.match(api.FALLBACK_CHARACTER_STATUS.detail, /not installed/);
  v.dispose();
});

test('sofa is exactly 2x its previous rendered scale, preserving the front edge', () => {
  close(api.DAY_BED_SCALE / api.PREVIOUS_DAY_BED_SCALE, 2);
  const oldFront = 3.6 - 0.855 * api.PREVIOUS_DAY_BED_SCALE / 2;
  const newFront = api.DAY_BED_Z - 0.855 * api.DAY_BED_SCALE / 2;
  close(newFront, oldFront);
});

test('120 Hz fixed physics produces identical walk/run travel at 30, 60 and 144 render Hz', () => {
  for (const run of [false, true]) {
    const results = [30, 60, 144].map(fps => {
      const p = player(); p.setInput(0, 1, run, false); advance(p, 2, fps); return p;
    });
    for (const p of results) {
      close(p.position.z, results[0].position.z);
      close(p.speed, run ? api.CHARACTER_TUNING.runSpeed : api.CHARACTER_TUNING.walkSpeed);
      assert.ok(p.position.z < -3, 'forward must follow camera -Z');
    }
  }
});

test('analog movement has a dead-zone upstream; diagonal input cannot give a speed boost', () => {
  const fwd = player(), diagonal = player(), analog = player();
  fwd.setInput(0, 1, false, false); diagonal.setInput(1, 1, false, false); analog.setInput(0, 0.4, false, false);
  for (const p of [fwd, diagonal, analog]) advance(p, 2);
  close(Math.hypot(diagonal.position.x, diagonal.position.z), -fwd.position.z);
  close(analog.speed, api.CHARACTER_TUNING.walkSpeed * 0.4);
  for (let degrees = 0; degrees < 360; degrees += 30) {
    const yaw = degrees * Math.PI / 180;
    const p = player(); p.reset(0, 0, yaw); p.setInput(0, 1, false, false); advance(p, 1);
    const direction = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    assert.ok(p.position.dot(direction) > 1.9);
  }
});

test('acceleration/braking are smooth, and gait phase advances by actual travel rather than time', () => {
  const p = player(); p.setInput(0, 1, false, false);
  p.update(1 / 120);
  assert.ok(p.speed > 0 && p.speed < api.CHARACTER_TUNING.walkSpeed);
  for (let i = 0; i < 100; i++) {
    const z = p.position.z, phase = p.gaitPhase;
    p.update(1 / 120);
    let dPhase = p.gaitPhase - phase; if (dPhase < 0) dPhase += Math.PI * 2;
    close(dPhase / (Math.PI * 2) * p.strideLen, Math.abs(z - p.position.z));
  }
  p.setInput(0, 0, false, false); p.update(1 / 120);
  assert.ok(p.speed > 0 && p.speed < api.CHARACTER_TUNING.walkSpeed);
  advance(p, 0.3); close(p.speed, 0);
});

test('jump visits takeoff, fall, land and idle; releasing early reduces height', () => {
  let fullHeight;
  for (const short of [false, true]) {
    const p = player(); p.jump(); const states = new Set(); let max = 0;
    for (let i = 0; i < 120; i++) {
      p.update(1 / 60); if (short && i === 4) p.releaseJump();
      max = Math.max(max, p.position.y); states.add(p.state);
    }
    for (const state of ['jump', 'fall', 'land', 'idle']) assert.ok(states.has(state), state);
    assert.equal(p.grounded, true); close(p.position.y, 0);
    if (short) assert.ok(max < fullHeight * 0.7); else { fullHeight = max; assert.ok(max > 1.2 && max < 1.5); }
  }
});

test('a jump buffered just before landing is consumed on the next ground step', () => {
  const p = player(); p.jump(); let queued = false, tookBufferedJump = false;
  for (let i = 0; i < 120; i++) {
    if (!queued && !p.grounded && p.velocity.y < 0 && p.position.y < 0.22) { p.jump(); queued = true; }
    p.update(1 / 120);
    if (queued && p.velocity.y > 6) tookBufferedJump = true;
  }
  assert.equal(queued, true); assert.equal(tookBufferedJump, true);
});

test('coyote time allows a jump just after walking off a ledge', () => {
  const p = player((_x, z) => z < -0.5 ? -2 : 0);
  p.setInput(0, 1, false, false);
  for (let i = 0; i < 100 && p.grounded; i++) p.update(1 / 120);
  assert.equal(p.grounded, false); const y = p.position.y;
  p.jump(); advance(p, 0.06, 100);
  assert.ok(p.position.y > y + 0.2 && p.velocity.y > 5);
});

test('capsule stops at walls/trunks, slides along walls and respects rotated footprints', () => {
  for (const obstacle of [
    box('wall', 0, -2, 3, 0.2, 3),
    { kind: 'circle', id: 'tree', x: 0, z: -2, radius: 0.8, baseY: 0, height: 3 },
  ]) {
    const p = player(); p.world.setGroup('solid', [obstacle]); p.setInput(0, 1, true, false); advance(p, 3);
    assert.ok(p.position.z >= (obstacle.kind === 'circle' ? -0.9001 : -1.5001));
  }
  const p = player(); p.world.setGroup('solid', [box('wall', 0, -2, 3, 0.2, 3)]);
  p.setInput(0.35, 1, false, false); advance(p, 2);
  assert.ok(p.position.x > 1 && p.position.z >= -1.5001, 'must slide tangentially');
  const w = player().world;
  w.setGroup('rotated', [box('rotated', 0, 0, 2, 0.2, 3, 0, Math.PI / 2)]);
  assert.equal(w.canOccupy(0, 1, 0, 0.3, 1.8288), false);
  assert.equal(w.canOccupy(1, 0, 0, 0.3, 1.8288), true);
  w.removeGroup('rotated'); assert.equal(w.canOccupy(0, 1, 0, 0.3, 1.8288), true);
});

test('steps <= 35 cm are climbable without jumping, while taller steps are solid', () => {
  for (const height of [0.25, 0.6]) {
    const p = player(); p.world.setGroup('step', [box('step', 0, -2, 2, 0.2, height)]);
    p.setInput(0, 1, false, false); let max = 0;
    for (let i = 0; i < 120; i++) { p.update(1 / 60); max = Math.max(max, p.position.y); }
    if (height < api.CHARACTER_TUNING.stepHeight) { close(max, height); assert.ok(p.position.z < -3); }
    else { close(max, 0); assert.ok(p.position.z > -1.6); }
  }
});

test('crouching fits under a low ceiling and cannot stand until clear of it', () => {
  const p = player(); const ceiling = api.CROUCH_HEIGHT + 0.12;
  p.world.setGroup('ceiling', [box('ceiling', 0, -2, 2, 1, 0.2, ceiling)]);
  p.setInput(0, 1, false, true); advance(p, 2);
  assert.equal(p.crouched, true); assert.ok(p.position.z < -1.2);
  p.setInput(0, 0, false, false); advance(p, 0.2); assert.equal(p.crouched, true);
  p.setInput(0, 1, false, false); advance(p, 2); assert.equal(p.crouched, false);
});

test('water boundary, slope limit and world boundary prevent walking out of the Sanctuary', () => {
  const wet = player(() => 0, 100, (_x, z) => z < -1 ? 1 : -Infinity);
  wet.setInput(0, 1, true, false); advance(wet, 2); assert.ok(wet.position.z >= -1.001);
  const steep = player((_x, z) => z < -1 ? (-z - 1) * 2 : 0);
  steep.setInput(0, 1, true, false); advance(steep, 2); assert.ok(steep.position.z > -1.15);
  const boundary = player(() => 0, 2);
  boundary.setInput(0, 1, true, false); advance(boundary, 2);
  assert.ok(Math.hypot(boundary.position.x, boundary.position.z) <= 2 - api.CHARACTER_RADIUS + 1e-6);
});

test('cover enter/move/end lean/exit and height-based posture use existing-world colliders', () => {
  for (const height of [1.35, 3]) {
    const p = player(); p.world.setGroup('cover', [box('cover', 0, -1.1, 0.7, 0.2, height, 0, 0, true)]);
    assert.equal(p.toggleCover(), true);
    p.setInput(1, 0, false, false); advance(p, 1.6);
    assert.equal(p.inCover, true); assert.ok(Math.abs(p.coverLean) > 0.4);
    assert.equal(p.crouched, height < 1.45);
    assert.ok(p.state.startsWith('cover'));
    p.setInput(0, -1, false, false); advance(p, 0.5);
    assert.equal(p.inCover, false, 'backward input away from the wall must exit');
  }
  assert.equal(player().toggleCover(), false, 'no nearby cover is safe/no-op');
});

test('TPP camera boom collides with walls/terrain; FPP uses an eye camera and hides the body', () => {
  const p = player(), c = new THREE.PerspectiveCamera(52, 16 / 9);
  p.world.setGroup('behind', [box('behind', 0, 2, 3, 0.3, 3)]);
  p.update(1 / 60, c); assert.ok(c.position.z < 1.7, 'spring arm must retract before wall');
  assert.ok(c.position.y >= 0.16);
  p.setMode('first-person'); advance(p, 0.5, 60, c);
  assert.equal(p.cameraRig.bodyVisible, false); assert.equal(c.fov, 74);
  close(c.position.y, api.CHARACTER_HEIGHT - 0.13);
  assert.ok(Math.hypot(c.position.x, c.position.z) < 0.15);
  p.setMode('third-person'); advance(p, 0.5, 60, c);
  assert.equal(c.fov, 62); assert.equal(p.cameraRig.bodyVisible, true);
  p.rotateCamera(0.8, -50); advance(p, 0.5, 60, c);
  assert.ok(c.position.y >= 0.16 && Number.isFinite(c.position.length()));
});

test('idle turn waits 0.5s beyond 60 degrees, and aim/head follows camera within bounds', () => {
  const p = player(), c = new THREE.PerspectiveCamera(52, 16 / 9); p.rotateCamera(-Math.PI / 2, 0.1);
  advance(p, 0.3, 60, c); close(p.rotation, 0);
  advance(p, 1, 60, c); assert.ok(p.rotation > 0.2);
  assert.ok(Math.abs(p.lookYaw) <= 1.2 && Math.abs(p.lookPitch) <= 0.8);
});

test('TPP/FPP switching preserves held movement; blur/pause/reset/orbit clear it safely', () => {
  const p = player(); p.setInput(0, 1, true, false); advance(p, 0.5);
  p.setMode('first-person'); advance(p, 0.5); close(p.speed, api.CHARACTER_TUNING.runSpeed);
  const before = p.position.clone();
  p.update(0.05, undefined, true); assert.ok(p.position.equals(before));
  advance(p, 0.3); close(p.speed, 0);
  p.setInput(0, 1, false, false); p.setMode('orbit'); advance(p, 1); assert.ok(p.position.equals(before));
  p.reset(); assert.equal(p.state, 'idle'); assert.equal(p.runLatched, false);
  close(p.position.x, api.CHARACTER_SPAWN.x); close(p.position.z, api.CHARACTER_SPAWN.z);
});

test('leaving character mode mid-jump parks the guide on the ground, never seated or floating', () => {
  const p = player(); p.jump(); advance(p, 0.2); assert.ok(p.position.y > 0.5);
  p.setMode('orbit'); advance(p, 1);
  close(p.position.y, 0); assert.equal(p.grounded, true); assert.equal(p.state, 'idle');
});

test('standing/crouching/running/strafe rig stays finite, with crouched boots and knees above flat ground', () => {
  for (const [x, y, run, crouch] of [[0, 0, false, true], [0, 1, false, true], [1, 0, false, true], [0, 1, true, false]]) {
    const v = api.createTrekAvatar(false), p = player(), c = new THREE.PerspectiveCamera(52, 16 / 9);
    for (let i = 0; i < 180; i++) {
      p.setInput(x, y, run, crouch); p.update(1 / 60);
      v.group.position.copy(p.position); v.group.rotation.y = p.rotation;
      c.position.copy(p.position).add(new THREE.Vector3(0, 2, 4)); v.update(1 / 60, i / 60, p, c);
      const b = new THREE.Box3().setFromObject(v.group);
      assert.ok(Number.isFinite(b.max.length() + b.min.length()));
      if (crouch && i > 60) assert.ok(b.min.y >= -0.05, `crouch foot/knee clipping: ${b.min.y}`);
      if (crouch && i > 60) assert.ok(b.max.y < api.CROUCH_HEIGHT + 0.04);
      v.group.traverse(o => { if (o.name === 'kneeL' || o.name === 'kneeR') assert.ok(o.rotation.x <= 0.05); });
    }
    v.dispose();
  }
});

test('low-tier precision keeps both stages highp without replacing/changing shader hooks or cache keys', () => {
  const m = new THREE.MeshStandardMaterial(); let calls = 0;
  m.onBeforeCompile = function () { assert.equal(this, m); calls++; };
  const hook = m.onBeforeCompile, key = m.customProgramCacheKey();
  api.halfPrecisionMaterial(m); api.halfPrecisionMaterial(m);
  assert.equal(m.precision, 'highp'); assert.equal(m.onBeforeCompile, hook); assert.equal(m.customProgramCacheKey(), key);
  m.onBeforeCompile({}, {}); assert.equal(calls, 1); m.dispose();
});

test('manifest rejects unlicensed/remote/traversal/broken animation or bone mappings', () => {
  const valid = { version: 1, label: 'Owned export', modelUrl: '/sanctuary/character/character.glb', modelForward: '-Z', licenseConfirmed: true, animationMap: { idle: 'Idle' }, boneMap: { head: 'head' } };
  assert.equal(api.parseCharacterManifest(valid).label, 'Owned export');
  for (const patch of [
    { licenseConfirmed: false }, { modelUrl: 'https://other.test/model.glb' }, { modelUrl: '/sanctuary/character/../world.glb' },
    { version: 2 }, { modelForward: '+X' }, { animationMap: { typo: 'Idle' } }, { animationMap: { idle: '' } },
    { boneMap: [] }, { boneMap: { head: 99 } }, { boneMap: { random: 'head' } },
  ]) assert.throws(() => api.parseCharacterManifest({ ...valid, ...patch }));
  assert.equal(api.parseCharacterManifest({ ...valid, modelUrl: null, licenseConfirmed: false }).modelUrl, null);
});

test('root motion stripping preserves vertical jump/bob and original animation data', () => {
  const track = new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 4, 0.5, -6]);
  const clip = new THREE.AnimationClip('WalkRoot', 1, [track]); const inPlace = api.inPlaceClip(clip);
  assert.deepEqual([...inPlace.tracks[0].values], [0, 0, 0, 0, 0.5, 0]);
  assert.deepEqual([...clip.tracks[0].values], [0, 0, 0, 4, 0.5, -6]);
});

test('root-motion stripping also honors actual DCC skeleton/wrapper names', () => {
  const source = new THREE.AnimationClip('NativeRig', 1, [new THREE.VectorKeyframeTrack('Armature.position', [0,1], [0,0,0,3,0.2,4])]);
  const local = api.inPlaceClip(source, new Set(['Armature']));
  assert.deepEqual([...local.tracks[0].values], [0,0,0,0,source.tracks[0].values[4],0]);
  assert.equal(source.tracks[0].values[3], 3);
});

test('first person looks almost vertically up/down without gimbal flip; switching back clamps a safe boom', () => {
  const p = player(); const cam = new THREE.PerspectiveCamera(52, 16/9, 0.1, 4000); const dir = new THREE.Vector3();
  p.setMode('first-person'); p.rotateCamera(0,-10); advance(p,0.5,60,cam); cam.getWorldDirection(dir);
  assert.ok(dir.y > 0.999); p.rotateCamera(0,20); advance(p,0.5,60,cam); cam.getWorldDirection(dir); assert.ok(dir.y < -0.999);
  p.setMode('third-person'); advance(p,0.2,60,cam); assert.ok(p.cameraRig.pitch <= 1.35 && p.cameraRig.pitch >= -1.25);
});
