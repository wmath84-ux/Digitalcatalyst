// Runtime regressions: stable iframe identity, projection, pinning and depth apertures.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real board-screen module ────────────────────────────────── */

const FIXTURE = `
import * as THREE from "three";
import { createBoardScreens } from ${JSON.stringify(path.join(ROOT, "src/nature3d/engine/boardScreens.ts"))};
import { terrainHeight } from ${JSON.stringify(path.join(ROOT, "src/nature3d/engine/terrain.ts"))};
import { OrbitRig } from ${JSON.stringify(path.join(ROOT, "src/nature3d/engine/controls.ts"))};
import { FramePacing } from ${JSON.stringify(path.join(ROOT, "src/nature3d/engine/framePacing.ts"))};

export { terrainHeight, OrbitRig, FramePacing };

export function boot(host: HTMLElement) {
  const screens = createBoardScreens(false);
  host.appendChild(screens.domElement);
  screens.setSize(1600, 900);
  const camera = new THREE.PerspectiveCamera(52, 1600 / 900, 0.1, 4000);
  return { screens, camera };
}

/** Park the camera square-on one board's face at \`distance\` metres. */
export function frame(screens: any, camera: any, slot: string, distance = 60) {
  const p = screens.byId(slot).placement;
  const normal = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  camera.position.copy(p.position).addScaledVector(normal, distance);
  camera.lookAt(p.position);
  camera.updateMatrixWorld(true);
}

export { THREE };
export { StudyWorldPacer } from ${JSON.stringify(path.join(ROOT, "src/nature3d/engine/studyWorldPacer.ts"))};
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "nature3d-board-pin");

function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.ts");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  execFileSync(
    require.resolve("esbuild/bin/esbuild"),
    [
      entry,
      "--bundle",
      "--format=cjs",
      "--platform=node",
      "--target=node20",
      `--outfile=${out}`,
      "--log-level=error",
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}

/* ── DOM + globals ────────────────────────────────────────────────────────── */

const bundle = buildFixture();

const dom = new JSDOM(`<!doctype html><html><body><div id="page"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;

// Node 22 exposes `navigator` as a getter-only global, so the jsdom one has to
// be defined rather than assigned.
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
for (const key of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "getComputedStyle"]) {
  define(key, window[key]);
}

const fixture = require(bundle);
const page = window.document.getElementById("page");
const { screens, camera } = fixture.boot(page);

test("low-tier frame cap is bypassed during camera input and resumes on release", () => {
  const { FramePacing } = fixture;
  const pacer = new FramePacing();
  assert.equal(pacer.shouldSkip(0, 30, false), false);
  assert.equal(pacer.shouldSkip(16, 30, false), true);
  for (const t of [32, 48, 64, 80, 96, 112]) {
    assert.equal(pacer.shouldSkip(t, 30, true), false, "do not skip an active camera gesture frame");
  }
  assert.equal(pacer.shouldSkip(128, 30, false), false, "release gets an immediate frame");
  assert.equal(pacer.shouldSkip(144, 30, false), true, "thermal cap resumes after the gesture");
});

test("camera drag stops at the current pose when the final finger lifts", () => {
  const { THREE, OrbitRig } = fixture;
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 4000);
  const rig = new OrbitRig();
  rig.update(1 / 60, camera);
  rig.rotate(0.9, 0.35);
  rig.update(1 / 60, camera);
  const movingYaw = rig.yaw;
  const movingPitch = rig.pitch;
  assert.notEqual(movingYaw, -0.35, "camera responds while the drag is active");

  rig.stopInertia();
  for (let i = 0; i < 180; i++) rig.update(1 / 60, camera);
  assert.ok(Math.abs(rig.yaw - movingYaw) < 1e-12, "yaw must not coast after release");
  assert.ok(Math.abs(rig.pitch - movingPitch) < 1e-12, "pitch must not coast after release");

  // Pinch zoom also uses a damped distance target; release must not leave a
  // stale zoom target slowly pulling the camera for seconds.
  rig.zoom(0.65);
  rig.update(1 / 60, camera);
  const releasedDistance = rig.distance;
  rig.stopInertia();
  for (let i = 0; i < 180; i++) rig.update(1 / 60, camera);
  assert.ok(Math.abs(rig.distance - releasedDistance) < 1e-12);
});

test("camera navigation never disconnects or reparents a live iframe", () => {
  const board = screens.byId("reading");
  const iframe = document.createElement("iframe");
  board.element.appendChild(iframe);
  const browsingContext = iframe.contentWindow;
  browsingContext.playbackPosition = 137;
  const observer = new window.MutationObserver(() => {});
  observer.observe(screens.domElement, { childList: true, subtree: true });
  for (const slot of ["reading", "notes", "mindmap", null, "reading", null]) {
    screens.setReadSlot(slot);
    for (const distance of [60, 200, 600, 60]) {
      fixture.frame(screens, camera, slot ?? "reading", distance);
      screens.render(camera, true);
      assert.equal(board.element.parentElement, board.host);
      assert.equal(board.host.parentElement, screens.domElement);
      assert.equal(iframe.contentWindow, browsingContext);
      assert.equal(iframe.contentWindow.playbackPosition, 137);
    }
  }
  assert.equal(observer.takeRecords().length, 0, "navigation must only change styles");
  observer.disconnect();
});

test("world projection agrees with Three's projected corners, including resize and scale", () => {
  const { THREE } = fixture;
  screens.setReadSlot(null);
  for (const scale of [1, 0.5, 2]) {
    screens.setScale(scale);
    for (const [w, h] of [[1600, 900], [900, 1600]]) {
      screens.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fixture.frame(screens, camera, "reading", 80);
      camera.position.x += 10;
      camera.updateMatrixWorld(true);
      screens.render(camera);
      const b = screens.byId("reading");
      const values = b.host.style.transform.match(/^matrix3d\((.*)\)$/)[1].split(",").map(Number);
      const matrix = new THREE.Matrix4().fromArray(values);
      for (const [x, y] of [[0, 0], [1920, 0], [0, 1080], [1920, 1080], [960, 540]]) {
        const actual = new THREE.Vector3(x, y, 0).applyMatrix4(matrix);
        const ndc = new THREE.Vector3(x - 960, 540 - y, 0).applyMatrix4(b.object.matrixWorld).project(camera);
        assert.ok(Math.abs(actual.x - (ndc.x + 1) * w / 2) < 1e-7);
        assert.ok(Math.abs(actual.y - (1 - ndc.y) * h / 2) < 1e-7);
      }
    }
  }
  screens.setScale(1);
  screens.setSize(1600, 900);
  camera.aspect = 1600 / 900;
  camera.updateProjectionMatrix();
});

test("pin/unpin always replaces the host pose, with native 2D sizing at rest", () => {
  for (const slot of ["reading", "notes", "mindmap", "reading"]) {
    fixture.frame(screens, camera, slot);
    screens.setReadSlot(slot);
    screens.render(camera);
    const b = screens.byId(slot);
    assert.match(b.host.style.transform, /^translate\(.*scale\(/);
    assert.equal(b.host.style.visibility, "visible");
    assert.equal(b.element.style.transform, "");
    screens.setReadSlot(null);
    screens.render(camera);
    assert.match(b.host.style.transform, /^matrix3d\(/);
    assert.equal(b.object.parent, screens.cssScene);
  }
});

test("culling hides paint, not the iframe lifecycle; shell remains from behind", () => {
  fixture.frame(screens, camera, "reading", -60);
  screens.render(camera, true);
  const b = screens.byId("reading");
  const shell = screens.shells.children[0];
  assert.equal(b.host.style.visibility, "hidden");
  assert.notEqual(b.host.style.display, "none");
  assert.equal(b.host.isConnected, true);
  assert.equal(shell.visible, true);
  assert.equal(shell.getObjectByName("board-aperture").visible, false);
  fixture.frame(screens, camera, "reading", 60);
  screens.render(camera);
  assert.equal(b.host.style.visibility, "visible");
  assert.equal(shell.getObjectByName("board-aperture").visible, true);
});

test("all boards use depth-tested zero-alpha apertures, not whole-board occlusion", () => {
  for (const shell of screens.shells.children) {
    const aperture = shell.getObjectByName("board-aperture");
    assert.equal(aperture.material.depthTest, true);
    assert.equal(aperture.material.depthWrite, true);
    assert.equal(aperture.material.transparent, false, "must render before transparent foliage/glass");
    assert.equal(aperture.material.blending, fixture.THREE.NoBlending);
    assert.match(aperture.material.fragmentShader, /vec4\(uBoardFogColor \* uBoardFogOpacity, uBoardFogOpacity\)/);
  }
});

test("idle setters and sub-pixel orbit damping do not mutate any board styles", () => {
  const { THREE } = fixture;
  fixture.frame(screens, camera, "reading");
  screens.setReadSlot("reading");
  screens.setFog(16, 420, new THREE.Color(0.7, 0.8, 0.9));
  screens.render(camera, true);
  const observer = new window.MutationObserver(() => {});
  observer.observe(screens.domElement, { attributes: true, subtree: true });
  for (let frame = 0; frame < 120; frame++) {
    screens.setSize(1600, 900);
    screens.setScale(1);
    screens.setReadSlot("reading");
    screens.setFog(16, 420, new THREE.Color(0.7, 0.8, 0.9));
    camera.position.x += 1e-8;
    assert.equal(screens.render(camera), false);
  }
  assert.equal(observer.takeRecords().length, 0, "settled boards must do zero DOM writes");
  // Motion is compared against the last rendered pose, not the previous
  // sample: small movements accumulate, so slow panning never gets stuck.
  camera.position.x += 0.001;
  assert.equal(screens.render(camera), true);
  assert.ok(observer.takeRecords().length > 0);
  observer.disconnect();
});

test("visible pages use bounded compositor layers and hidden pages release the hint", () => {
  const b = screens.byId("reading");
  fixture.frame(screens, camera, "reading"); screens.render(camera);
  assert.equal(b.host.style.willChange, "transform");
  assert.equal(b.host.style.contain, "layout paint");
  fixture.frame(screens, camera, "reading", -60); screens.render(camera);
  assert.equal(b.host.style.willChange, "auto");
  assert.equal(b.element.parentElement, b.host);
});

test("unchanged forced renders do not restart fog or rewrite transforms", () => {
  fixture.frame(screens, camera, "reading"); screens.render(camera, true);
  const observer = new window.MutationObserver(() => {});
  observer.observe(screens.domElement, { attributes: true, subtree: true });
  for (let i = 0; i < 30; i++) screens.render(camera, true);
  assert.equal(observer.takeRecords().length, 0);
  assert.equal(screens.byId("reading").host.querySelector(".nature3d-board-fog"), null,
    "fog belongs in the existing aperture shader, not another full-board DOM layer");
  observer.disconnect();
});

test("FOV, resize, scale and read slot changes bypass the idle cache", () => {
  fixture.frame(screens, camera, "reading"); screens.render(camera, true);
  camera.fov += 1; camera.updateProjectionMatrix();
  assert.equal(screens.render(camera), true);
  screens.setSize(1200, 800); assert.equal(screens.render(camera), true);
  screens.setScale(1.5); assert.equal(screens.render(camera), true);
  screens.setReadSlot("notes"); assert.equal(screens.render(camera), true);
  assert.equal(screens.render(camera), false);
});

test("parked study world keeps 30 Hz minimum and never paces camera movement or Desk", () => {
  for (const hz of [30, 60, 120]) {
    const pacer = new fixture.StudyWorldPacer();
    let draws = 0;
    for (let frame = 0; frame < hz; frame++) {
      if (pacer.shouldRender(frame * 1000 / hz, true, false)) draws++;
    }
    assert.equal(draws, 30);
    for (let frame = hz; frame < hz * 2; frame++) {
      assert.equal(pacer.shouldRender(frame * 1000 / hz, true, true), true);
    }
    assert.equal(pacer.shouldRender(2001, false, false), true, "Desk restores full cadence immediately");
    pacer.invalidate();
    assert.equal(pacer.shouldRender(2002, true, false), true, "resize/DRS clears must repaint immediately");
  }
});

test("disposal removes the permanent hosts", () => {
  screens.dispose();
  assert.equal(screens.domElement.isConnected, false);
  for (const b of screens.screens) assert.equal(b.host.isConnected, false);
});
