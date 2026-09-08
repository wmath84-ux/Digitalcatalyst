// Executable performance/correctness contracts, not FPS assertions against
// a CI machine. Browser timings are collected from the production build by
// scripts/benchmark-classroom.mjs. These tests pin the work being eliminated.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as THREE from 'three';

const require = createRequire(import.meta.url);
const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
function evaluate(source, globals = {}, customRequire = require) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, require: customRequire, console, performance, ...globals });
  return module.exports;
}
const quality = evaluate(read('src/classroom3d/quality.ts'));
const activity = evaluate(read('src/classroom3d/objectActivity.ts'));
const assetsModule = evaluate(read('src/classroom3d/classmateAssets.ts'));

// Exercise the INSTALLED monitor, including its N/elapsed FPS estimator and
// flipped counter. Mock only hooks + the clock; execute its real frame body.
function monitorHarness({ factor = 1, budget = new quality.ClassroomFrameBudget() } = {}) {
  let callback, time = 0, api;
  const changes = [];
  const react = {
    createContext: () => ({ Provider: {} }), createElement: () => null,
    useState: init => [typeof init === 'function' ? init() : init, () => {}],
  };
  const source = fs.readFileSync(require.resolve('@react-three/drei/core/PerformanceMonitor.js'), 'utf8');
  const { PerformanceMonitor } = evaluate(source, { performance: { now: () => time } }, name => {
    if (name === 'react') return react;
    if (name === '@react-three/fiber') return { useFrame: frame => { callback = frame; } };
    return require(name);
  });
  PerformanceMonitor({
    factor, ms: quality.CLASSROOM_SAMPLE_MS, iterations: 6, step: .05,
    bounds: () => quality.classroomFrameBounds(budget.target), flipflops: Infinity,
    onIncline(value) { api = value; budget.observe(value.factor, value.averages); },
    onDecline(value) { api = value; budget.observe(value.factor, value.averages); },
    onChange(value) { api = value; changes.push(value.factor); },
  });
  return {
    frames(count, ms = 1000 / 60) { for (let i = 0; i < count; i++) { time += ms; callback(); } },
    get api() { return api; }, changes, budget,
  };
}

test('healthy 60 Hz never trips a permanent low-quality fallback', () => {
  const monitor = monitorHarness();
  monitor.frames(3600);
  assert.equal(monitor.api.factor, 1);
  assert.ok(monitor.api.flipped > 6, 'installed drei really counts healthy windows as flips');
  assert.equal(monitor.api.fallback, false);
  assert.equal(monitor.budget.target, 60);
});

test('one GC-sized frame does not reduce quality', () => {
  const monitor = monitorHarness();
  monitor.frames(200);
  monitor.frames(1, 180);
  monitor.frames(600);
  assert.ok(monitor.changes.every(factor => factor === 1));
});

test('sustained 50 fps triggers resolution reduction, then sustained 60 recovers', () => {
  const monitor = monitorHarness();
  monitor.frames(600, 20);
  assert.ok(monitor.api.factor < .8, 'old 40–60 dead band would not decline here');
  monitor.frames(1800);
  assert.equal(monitor.api.factor, 1);
  assert.equal(monitor.api.fallback, false);
});

test('a sustained weak device can use a 30 Hz budget; real recovery restores 60', () => {
  const monitor = monitorHarness({ factor: .4 });
  monitor.frames(600, 1000 / 30);
  assert.equal(monitor.budget.target, 30);
  assert.ok(monitor.api.factor > .4, 'stable 30 Hz can restore detail, not stay at the floor forever');
  monitor.frames(1800, 1000 / 60);
  assert.equal(monitor.budget.target, 60);
  assert.equal(monitor.api.factor, 1);
});

test('frame-budget changes require sustained windows, never one spike or burst', () => {
  const budget = new quality.ClassroomFrameBudget();
  for (let i = 0; i < 3; i++) assert.equal(budget.observe(.4, [35, 35, 35, 35, 35, 35]), false);
  assert.equal(budget.target, 60);
  budget.resetSamples();
  for (let i = 0; i < 3; i++) budget.observe(.4, [35, 35, 35, 35, 35, 35]);
  assert.equal(budget.target, 60);
  assert.equal(budget.observe(.4, [35, 35, 35, 35, 35, 35]), true);
  assert.equal(budget.target, 30);
  assert.equal(budget.observe(.4, [65, 65, 65, 65, 65, 65]), false);
  assert.equal(budget.observe(.4, [65, 65, 65, 65, 65, 65]), true);
  assert.equal(budget.target, 60);
});

test('quality tiers have stateful enter/leave hysteresis', () => {
  assert.equal(quality.qualityForFactor(.79, 'high'), 'high');
  assert.equal(quality.qualityForFactor(.69, 'high'), 'medium');
  assert.equal(quality.qualityForFactor(.79, 'medium'), 'medium');
  assert.equal(quality.qualityForFactor(.85, 'medium'), 'high');
  assert.equal(quality.qualityForFactor(.49, 'medium'), 'medium');
  assert.equal(quality.qualityForFactor(.39, 'medium'), 'low');
  assert.equal(quality.qualityForFactor(.59, 'low'), 'low');
  assert.equal(quality.qualityForFactor(.61, 'low'), 'medium');
});

test('DPR interpolates gradually, has a floor, and can recover to the high ceiling', () => {
  assert.equal(quality.performanceForFactor(.4), .42);
  assert.equal(quality.performanceForFactor(.65), .638);
  assert.equal(quality.performanceForFactor(1), 1);
  assert.equal(quality.performanceForFactor(-10), .42);
  assert.equal(quality.performanceForFactor(NaN), .42);
  let previous = .42;
  for (let factor = 0; factor <= 1.001; factor += .05) {
    const value = quality.performanceForFactor(factor);
    assert.ok(value >= previous && value - previous <= .053);
    previous = value;
  }
  assert.ok(quality.computeInitialDpr(1280, 720, 2, 'low') < quality.computeInitialDpr(1280, 720, 2, 'high'));
});

function camera() {
  const camera = new THREE.PerspectiveCamera(60, 1.5, .05, 60);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  return camera;
}

test('off-camera updates sleep, wake immediately, and never omit shadow-bake casters', () => {
  const eye = camera(), gate = new activity.ObjectActivity();
  const front = new THREE.Sphere(new THREE.Vector3(0, 0, -14), .9);
  const back = new THREE.Sphere(new THREE.Vector3(0, 0, 14), .9);
  assert.equal(gate.shouldUpdate(eye, 1, front), true);
  assert.equal(gate.shouldUpdate(eye, 1.001, front), false);
  assert.equal(gate.shouldUpdate(eye, 1.002, back), false);
  assert.equal(gate.visible, false);
  assert.equal(gate.shouldUpdate(eye, 1.003, front), true, 'wake cannot wait for the old cadence');
  assert.equal(gate.shouldUpdate(eye, 1.004, back, true), true);
  assert.equal(gate.visible, true);
});

test('near / medium / far animation cadences are full / 30 / 15 Hz', () => {
  for (const [distance, expected] of [[2, 60], [7, 30], [14, 15]]) {
    const eye = camera(), gate = new activity.ObjectActivity();
    const bounds = new THREE.Sphere(new THREE.Vector3(0, 0, -distance), .5);
    let updates = 0;
    for (let i = 0; i < 60; i++) if (gate.shouldUpdate(eye, 1 + i / 60, bounds)) updates++;
    assert.equal(updates, expected);
  }
});

test('LOD hysteresis prevents popping when hovering around distance boundaries', () => {
  assert.equal(activity.classmateLod(5.3 ** 2, 0), 0);
  assert.equal(activity.classmateLod(5.7 ** 2, 0), 1);
  assert.equal(activity.classmateLod(5.3 ** 2, 1), 1);
  assert.equal(activity.classmateLod(4.3 ** 2, 1), 0);
  assert.equal(activity.classmateLod(9.7 ** 2, 1), 2);
  assert.equal(activity.classmateLod(8.5 ** 2, 2), 2);
  assert.equal(activity.classmateLod(8.3 ** 2, 2), 1);
  assert.equal(activity.classmateLod(10000, 0), 2);
  assert.equal(activity.classmateLod(1, 2), 0);
});

test('near student geometry is byte-identical to the original procedural models', () => {
  const originals = [
    new THREE.CapsuleGeometry(.19, .34, 4, 12), new THREE.TorusGeometry(.15, .045, 8, 18),
    new THREE.SphereGeometry(.145, 20, 16), new THREE.SphereGeometry(.152, 18, 14, 0, Math.PI * 2, 0, Math.PI * .62),
    new THREE.CapsuleGeometry(.052, .34, 4, 8), new THREE.CapsuleGeometry(.052, .3, 4, 8), new THREE.CapsuleGeometry(.075, .34, 4, 8),
  ];
  const assets = assetsModule.getClassmateAssets();
  for (let i = 0; i < originals.length; i++) {
    for (const name of ['position', 'normal', 'uv']) assert.deepEqual(assets.levels[0][i].attributes[name].array, originals[i].attributes[name].array);
    assert.deepEqual(assets.levels[0][i].index.array, originals[i].index.array);
    originals[i].dispose();
  }
  assert.equal(assets.materials.head.color.getHexString(), 'c89272');
  assert.equal(assets.materials.head.roughness, .75);
  assert.equal(assets.materials.scarf.color.getHexString(), 'e2506a');
});

test('shared geometry/material pool is bounded and LOD only reduces curved detail', () => {
  const assets = assetsModule.getClassmateAssets();
  assert.equal(assetsModule.getClassmateAssets(), assets);
  const geometries = new Set(assets.levels.flat());
  assert.equal(geometries.size, 15, '7 near + 4 medium + 4 low, not 49 duplicated near geometries');
  assert.equal(assets.materials.jackets.length + 4, 11, 'not 49 duplicated materials');
  for (let i = 0; i < 4; i++) {
    assert.ok(assets.levels[1][i].index.count < assets.levels[0][i].index.count);
    assert.ok(assets.levels[2][i].index.count < assets.levels[1][i].index.count);
  }
  for (let i = 4; i < 7; i++) assert.equal(assets.levels[0][i], assets.levels[2][i]);
});

test('classmate bounds contain the entire original breathing/writing animation', () => {
  const assets = assetsModule.getClassmateAssets();
  const root = new THREE.Group(), torso = new THREE.Group(), arm = new THREE.Group();
  root.add(torso); torso.add(arm); arm.position.set(.17, .76, .06);
  const positions = [[0,.62,0],[0,.86,.01],[0,1.05,0],[0,1.11,-.01],[0,-.02,.2],[-.2,.66,.12],[0,.24,.16]];
  const meshes = assets.levels[0].map((geometry, i) => {
    const mesh = new THREE.Mesh(geometry, assets.materials.head);
    mesh.position.fromArray(positions[i]);
    (i === 4 ? arm : i === 6 ? root : torso).add(mesh);
    if (i === 4) mesh.rotation.x = Math.PI / 2;
    if (i === 5) mesh.rotation.x = 1.15;
    if (i === 6) mesh.rotation.x = 1.35;
    return mesh;
  });
  const bounds = assetsModule.classmateBounds(0, 0), point = new THREE.Vector3();
  for (let t = 0; t < 20; t += .137) {
    torso.rotation.x = Math.sin(t * .7) * .022; torso.position.y = Math.sin(t * 1.1) * .012;
    arm.rotation.x = -.9 + Math.sin(t * 3.1) * .14; arm.rotation.z = Math.sin(t * 2.4) * .09;
    root.updateMatrixWorld(true);
    for (const mesh of meshes) for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      point.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld);
      assert.ok(bounds.containsPoint(point), `animated vertex outside conservative bound at ${t}`);
    }
  }
});

test('freezing local matrices does not freeze animated parents or their child world matrices', () => {
  const root = new THREE.Group(), moving = new THREE.Group(), child = new THREE.Object3D();
  root.add(moving); moving.add(child); moving.userData.classroomAnimated = true; child.position.x = 2;
  activity.freezeStaticLocalMatrices(root);
  assert.equal(root.matrixAutoUpdate, false); assert.equal(child.matrixAutoUpdate, false);
  assert.equal(moving.matrixAutoUpdate, true); assert.equal(child.matrixWorldAutoUpdate, true);
  moving.rotation.z = Math.PI / 2; root.updateMatrixWorld(true);
  const position = child.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(position.x) < 1e-10 && Math.abs(position.y - 2) < 1e-10);
  child.position.x = 3; activity.freezeStaticLocalMatrices(root); root.updateMatrixWorld(true);
  assert.ok(Math.abs(child.getWorldPosition(position).y - 3) < 1e-10, 'tier-edge transforms can be refreshed');
});

test('motion debounce keeps one timer and the exact last-report + 200 ms quiet deadline', () => {
  let time = 0, nextId = 0, created = 0;
  const timers = new Map();
  const motion = evaluate(read('src/classroom3d/embedMotion.ts'), {
    performance: { now: () => time },
    setTimeout(callback, delay) { const id = ++nextId; created++; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  function advance(to) {
    while (true) {
      const ready = [...timers].filter(([, timer]) => timer.at <= to).sort((a,b) => a[1].at - b[1].at)[0];
      if (!ready) break;
      time = ready[1].at; timers.delete(ready[0]); ready[1].callback();
    }
    time = to;
  }
  const edges = [], off = motion.subscribeEmbedMotion(value => edges.push(value));
  for (let i = 0; i < 60; i++) {
    advance(i * (1000 / 60)); motion.reportEmbedMotion(); assert.equal(timers.size, 1);
  }
  const last = time;
  assert.ok(created < 10, `only ${created} timers for 60 reports (not 60)`);
  advance(last + 199); assert.equal(motion.isEmbedMoving(), true);
  advance(last + 201); assert.equal(motion.isEmbedMoving(), false);
  assert.deepEqual(edges, [true, false]);
  motion.reportEmbedMotion(); motion.resetEmbedMotion();
  assert.equal(timers.size, 0); assert.equal(motion.isEmbedMoving(), false);
  off(); motion.reportEmbedMotion(); motion.resetEmbedMotion();
  assert.deepEqual(edges, [true, false, true, false]);
});

test('identical playback polls skip serialization without delaying real seeks/scrolls', () => {
  let writes = 0;
  const playback = evaluate(read('src/course/playbackState.ts'), { localStorage: { setItem() { writes++; } } });
  const store = {};
  const report = patch => {
    if (!playback.playbackPatchChanged(store.file, patch)) return;
    playback.mergePlaybackEntry(store, 'file', patch);
    playback.persistPlaybackStore('user', 'course', store);
  };
  for (let i = 0; i < 1000; i++) report({ position: 60, duration: 300 });
  assert.equal(writes, 1);
  report({ position: 61 }); assert.equal(writes, 2); assert.equal(store.file.position, 61);
  report({ position: 40 }); assert.equal(writes, 3); assert.equal(store.file.position, 40);
  report({ scrollTop: 120, page: 3 }); assert.equal(writes, 4); assert.equal(store.file.page, 3);
  report({ offsetX: 8, offsetY: 4, scale: 1.4 }); assert.equal(writes, 5); assert.equal(store.file.scale, 1.4);
});

test('Canvas uses effective PCF and mirrors live DPR rather than undoing the governor', () => {
  const classroom = read('src/classroom3d/Classroom3D.tsx');
  const canvas = read('src/classroom3d/ClassroomCanvas.tsx');
  assert.match(classroom, /shadows="percentage"/);
  assert.match(classroom, /maxDpr=\{maximumDpr\}/);
  assert.match(canvas, /return store\.subscribe/);
  assert.match(canvas, /dpr=\{liveDpr\}/);
  assert.match(canvas, /initialDpr: maxDpr/);
  assert.match(read('src/classroom3d/SeatRig.tsx'), /\}, -2\)/);
  assert.ok(!read('src/classroom3d/DeskConsole.tsx').includes('<StaticInstances'), 'measured culling regression must not return');
});


test('shared resources release GPU listeners only when their final owner leaves', () => {
  const { retainSharedResources } = evaluate(read('src/classroom3d/resourceLifetime.ts'));
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const positions = geometry.attributes.position.array;
  let geometryDisposals = 0, materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++);
  material.addEventListener('dispose', () => materialDisposals++);
  const first = retainSharedResources([geometry, geometry, material]);
  const second = retainSharedResources([geometry, material]);
  first(); first();
  assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0);
  second(); assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
  assert.equal(geometry.attributes.position.array, positions, 'CPU cache remains reusable');
  const nextVisit = retainSharedResources([geometry, material]);
  nextVisit(); assert.equal(geometryDisposals, 2); assert.equal(materialDisposals, 2);
});
