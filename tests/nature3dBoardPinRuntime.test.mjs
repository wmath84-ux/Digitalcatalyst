// tests/nature3dBoardPinRuntime.test.mjs
//
// Runtime contract for the study-board PIN in the 3D Sanctuary
// (`src/nature3d/engine/boardScreens.ts`) — the "board switch karne ke baad
// board black / bada board" report (owner, 2026-09-21):
//
//   "note board se reading board par jate hi note board black dikhne lagta
//    hai … aur zoom out karke world me jate hi centre me ek bada board
//    dikhta hai — vah nahin dikhna chahiye."
//
// Both symptoms are one failure. The pin lifts a board's DOM face onto the
// untransformed layer so its buttons hit-test natively, and the old code
// CLEARED that element's `transform` on the way back. `CSS3DRenderer` caches
// the transform string it wrote per object and skips an identical rewrite, so
// the cleared value was never corrected: the element stayed in the 3D layer
// with no matrix at all, where its 1920×1080 px are read as world units — a
// board a kilometre wide, parked in the middle of the world (and, being the
// panel's own dark page, a black one).
//
// A source-shape test cannot see any of that: the strings all look fine. So
// this file mounts the REAL module (bundled with the repo's own esbuild,
// exactly like tests/useDragScrollRuntime.test.mjs) over a real DOM in jsdom
// and checks the invariant that keeps boards honest:
//
//   • every board's renderer-owned HOST carries a real 3D matrix while it is
//     in the layer — after any number of pin / unpin / switch cycles;
//   • a lifted face sits ON the 2D layer with a screen-pixel scale, and its
//     host is hidden (never an empty black plate behind the page);
//   • releasing a pin puts the face back inside its own host, with the host's
//     matrix untouched by the pin;
//   • a pin that cannot be projected is REFUSED — the board stays a live 3D
//     board instead of ending up with its page hidden.

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

/** Every board's host / face / object, for assertions in the test. */
export function boards(screens: any, THREE_: any) {
  return screens.screens.map((s: any) => ({
    slot: s.slot,
    host: s.host,
    face: s.element,
    hostTransform: s.host.style.transform,
    // The invariant itself, independent of how many elements a board is made
    // of: whatever element CSS3DRenderer owns must carry a live matrix while
    // it is attached, or the layer is painting a board-sized page at the
    // world origin.
    rendererTransform: s.object.element.style.transform,
    rendererDisplay: s.object.element.style.display,
    hostDisplay: s.host.style.display,
    faceTransform: s.element.style.transform,
    faceDisplay: s.element.style.display,
    faceInsideHost: s.element.parentElement === s.host,
    faceInLayer: s.element.parentElement === screens.domElement,
    // A pinned board's host is deliberately taken out of the document (the
    // renderer detaches the object it is no longer drawing), so "in the layer"
    // is asked of the boards that are not framed at the moment.
    hostConnected: s.host.isConnected,
    objectInScene: screens.cssScene.children.includes(s.object),
    objectVisible: s.object.visible,
  }));
}

export { THREE };
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

const boards = () => fixture.boards(screens, fixture.THREE);

/** The old failure, stated as an invariant: a host in the layer needs a pose. */
function assertHostsArePosed(state, when, pinnedSlot = null) {
  for (const b of state) {
    if (b.slot === pinnedSlot) continue;
    assert.ok(
      b.hostConnected,
      `${b.slot}: the host must be back inside the CSS3D layer (${when})`,
    );
    assert.match(
      b.hostTransform,
      /matrix3d\(/,
      `${b.slot}: the renderer-owned host lost its 3D matrix (${when}) — ` +
        `an untransformed 1920×1080 element in the layer is a board-sized page in the middle of the world`,
    );
    assert.match(
      b.rendererTransform,
      /matrix3d\(/,
      `${b.slot}: the element CSS3DRenderer owns is in the layer without a matrix (${when})`,
    );
  }
}

/**
 * The stray-board signature, stated directly: a page may only be on the 2D
 * layer while it is a *sized* page — the pin's `scale(w/1920, h/1080)`, and
 * never wider than the pin allows. A face on that layer with no transform, or
 * with one that would paint the panel's full 1920×1080 px as world units, is
 * the board-sized page hanging in the sky.
 */
function assertNoStrayPage(state, when) {
  for (const b of state) {
    if (!b.faceInLayer) continue;
    const m = /^scale\(([-\d.e]+),\s*([-\d.e]+)\)$/.exec(b.faceTransform);
    assert.ok(
      m,
      `${b.slot}: a face on the 2D layer must carry the pin's screen scale (${when}) — ` +
        `without one its pixels are read as world units, which is the giant board in the middle`,
    );
    const w = Number(m[1]) * 1920;
    const h = Number(m[2]) * 1080;
    assert.ok(
      w <= 1600 * 1.6 + 1 && h <= 900 * 1.6 + 1,
      `${b.slot}: a lifted face may never exceed the viewport (${when}) — got ${w}×${h} px`,
    );
  }
}

function assertFacesAreHome(state, when) {
  for (const b of state) {
    assert.ok(b.faceInsideHost, `${b.slot}: the face must be back inside its host (${when})`);
    assert.equal(
      b.faceTransform,
      "",
      `${b.slot}: the face must carry no screen-space transform once it is home (${when})`,
    );
    assert.equal(b.faceDisplay, "", `${b.slot}: the face must be displayed (${when})`);
    assert.ok(b.objectInScene, `${b.slot}: the object must be back in the CSS3D scene (${when})`);
  }
}

/* ── 1. the world view: everything is a 3D board ──────────────────────────── */

test("with no board framed, all three boards are live 3D boards", () => {
  camera.position.set(0, 30, 60);
  camera.lookAt(0, 12, 0);
  camera.updateMatrixWorld(true);
  screens.render(camera, true);

  const state = boards();
  assert.equal(state.length, 3);
  assertHostsArePosed(state, "no board framed");
  assertFacesAreHome(state, "no board framed");
});

/* ── 2. pinning lifts ONE face, and only onto the 2D layer ────────────────── */

test("framing a board lifts its face onto the layer and hides its 3D host", () => {
  fixture.frame(screens, camera, "reading");
  screens.render(camera, true);
  screens.setReadSlot("reading");
  screens.render(camera, true);

  const state = boards();
  const reading = state.find((b) => b.slot === "reading");
  assert.ok(reading.faceInLayer, "the framed face must be lifted onto the untransformed layer");
  assert.match(
    reading.faceTransform,
    /^scale\(/,
    "the lifted face must be sized in screen pixels",
  );
  assert.equal(reading.hostDisplay, "none", "the framed board's 3D host must be hidden");

  // Neighbours are hidden for the duration of the pin, in both layers.
  for (const b of state.filter((s) => s.slot !== "reading")) {
    assert.equal(b.hostDisplay, "none", `${b.slot} must not paint while reading is framed`);
    assert.equal(b.objectVisible, false, `${b.slot}'s object must be culled while reading is framed`);
  }
});

/* ── 3. THE REGRESSION: switching boards leaves no transformed-less page ──── */

test("switching board after board never leaves a board without a 3D pose", () => {
  // The exact report: note board → reading board → … → world.
  const order = ["notes", "reading", "mindmap", "reading", "notes", null];
  for (const slot of order) {
    if (slot) {
      fixture.frame(screens, camera, slot);
      screens.render(camera, true);
    }
    screens.setReadSlot(slot);
    // Two frames: the switch itself, and the frame after it (the old bug
    // only showed up once the renderer had a chance to skip the rewrite).
    screens.render(camera, true);
    screens.render(camera, true);

    const state = boards();
    assertHostsArePosed(state, `after switching to ${slot ?? "the world"}`, slot);

    if (slot) {
      const framed = state.find((b) => b.slot === slot);
      assert.ok(framed.faceInLayer, `${slot}: the framed board's face must be pinned`);
      assert.equal(framed.hostDisplay, "none", `${slot}: the pinned host must be hidden`);
    } else {
      assertFacesAreHome(state, "after leaving the boards");
    }
  }

  // …and the world view really is the world view: every board is a 3D board in
  // its own place, and nothing of a board is left hanging on the 2D layer.
  camera.position.set(0, 400, 1200);
  camera.lookAt(0, 30, 0);
  camera.updateMatrixWorld(true);
  for (let i = 0; i < 3; i += 1) screens.render(camera, true);

  const state = boards();
  assertHostsArePosed(state, "world view");
  assertFacesAreHome(state, "world view");
  for (const b of state) {
    assert.equal(b.hostDisplay, "", `${b.slot}: the board must be standing in the world view`);
    assert.ok(
      !b.faceInLayer,
      `${b.slot}: a face is still lifted onto the 2D layer in the world view — ` +
        `that is the giant board in the middle of the screen`,
    );
  }
});

/* ── 4. zooming out with a board still framed ─────────────────────────────── */

test("zooming out with a board framed leaves no board-sized page in the world", () => {
  // The owner's second symptom in the order he met it: the reading board is
  // framed, he pulls back to the world — and a board-sized page is hanging in
  // the middle of it. The framed board keeps its read slot for the whole
  // pull-back (nothing in the UI closes it), so the pin has to keep being
  // honest at every distance on the way out: sized to the board's own place,
  // or released back into the world — never a full 1920×1080 px page with
  // nothing scaling it.
  screens.setReadSlot(null);
  fixture.frame(screens, camera, "reading");
  screens.render(camera, true);
  screens.setReadSlot("reading");
  screens.render(camera, true);
  screens.render(camera, true);
  assert.ok(
    boards().find((b) => b.slot === "reading").faceInLayer,
    "precondition: the reading board is framed on the layer",
  );

  // Pull back in steps, rendering the way the tick does.
  const steps = [120, 300, 900, 2000];
  for (const distance of steps) {
    const p = screens.byId("reading").placement;
    camera.position.set(p.position.x, 90 + distance * 0.25, p.position.z + distance);
    camera.lookAt(p.position);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 3; i += 1) screens.render(camera, true);

    const state = boards();
    const lifted = state.find((b) => b.faceInLayer);
    assertNoStrayPage(state, `${distance} m out`);
    assertHostsArePosed(state, `${distance} m out`, lifted ? lifted.slot : null);
  }

  // And when the frame is let go, the world comes back whole: every board a
  // live 3D board, nothing at all left on the 2D layer.
  screens.setReadSlot(null);
  screens.render(camera, true);
  screens.render(camera, true);

  const state = boards();
  assertNoStrayPage(state, "after letting the frame go");
  assertHostsArePosed(state, "after letting the frame go");
  assertFacesAreHome(state, "after letting the frame go");
  for (const b of state) {
    assert.equal(b.faceInLayer, false, `${b.slot}: a page is still lifted in the world view`);
    assert.equal(b.hostDisplay, "", `${b.slot}: the board must be standing in the world view`);
  }
});

/* ── 5. a refused pin changes nothing ─────────────────────────────────────── */

test("a pin that cannot be projected leaves the board a live 3D board", () => {
  screens.setReadSlot(null);

  // First a REAL pin at a sane distance: the neighbours are put away while the
  // reading board is framed (that is the framed mode's own bargain).
  fixture.frame(screens, camera, "reading");
  screens.render(camera, true);
  screens.setReadSlot("reading");
  screens.render(camera, true);
  const framed = boards().find((b) => b.slot === "reading");
  assert.ok(framed.faceInLayer, "precondition: the reading board is framed");
  for (const b of boards().filter((x) => x.slot !== "reading")) {
    assert.equal(b.hostDisplay, "none", `${b.slot}: neighbours start put away`);
  }

  // 10 m out the board is visible (the cull keeps it) but its projected face is
  // 1.7× the viewport wide, so the pin must be refused rather than half-made:
  // the page stays where it is instead of being hidden behind a black slab.
  fixture.frame(screens, camera, "reading", 10);
  screens.render(camera, true);
  screens.render(camera, true);

  const state = boards();
  const reading = state.find((b) => b.slot === "reading");
  assert.equal(reading.faceInLayer, false, "a refused pin must not lift the face");
  assert.equal(reading.faceInsideHost, true, "a refused pin must leave the face in its host");
  assert.equal(reading.faceDisplay, "", "a refused pin must never hide the page (the black slab)");
  assert.ok(reading.objectInScene, "a refused pin must leave the object in the CSS3D scene");
  assert.equal(reading.hostDisplay, "", "a refused pin must leave the 3D board standing");

  // …and the neighbours the pin had put away come back with it — the refusal
  // path must not leave the world two boards short. (They may legitimately be
  // culled at this camera — 10 m from the reading board — so the check moves
  // to a viewpoint where the whole trio is on screen.)
  screens.setReadSlot(null);
  camera.position.set(0, 30, 60);
  camera.lookAt(0, 12, 0);
  camera.updateMatrixWorld(true);
  for (let i = 0; i < 2; i += 1) screens.render(camera, true);

  const world = boards();
  assertHostsArePosed(world, "after a refused pin");
  for (const b of world) {
    assert.equal(b.hostDisplay, "", `${b.slot}: the board must be standing after a refused pin`);
    assert.equal(b.objectVisible, true, `${b.slot}: the object must be visible after a refused pin`);
  }
});

/* ── 6. a face is never left behind when the sanctuary unmounts ───────────── */

test("disposal removes every board element, pinned or not", () => {
  screens.setReadSlot(null);
  fixture.frame(screens, camera, "notes");
  screens.render(camera, true);
  screens.setReadSlot("notes");
  screens.render(camera, true);
  assert.ok(boards().some((b) => b.faceInLayer), "precondition: a face is pinned");

  screens.dispose();
  assert.equal(
    window.document.querySelectorAll(".nature3d-board-screen").length,
    0,
    "no board element may survive disposal",
  );
});
