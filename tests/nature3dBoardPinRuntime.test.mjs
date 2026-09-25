// tests/nature3dBoardPinRuntime.test.mjs
//
// Runtime contract for the study-board FACES in the 3D Sanctuary
// (`src/nature3d/engine/boardScreens.ts`) — the "board switch karne ke baad
// board black / bada board" report (owner, 2026-09-21) and the "camera switch
// karte hi chalta hua video reset ho jata hai" report (owner, 2026-09-25).
//
// Both reports are one failure. The pin used to lift a board's DOM face out of
// its CSS3D host and onto the untransformed layer so its buttons would hit-test
// natively, and put it back on release. Re-parenting an `<iframe>` — or a
// `<video>`, or a scrolled module library — makes the browser destroy and
// rebuild it, so every board switch and every camera switch restarted whatever
// was playing on the board. The fix is that NOTHING moves any more: each board
// is one layer, created once, whose transform the engine writes itself (see the
// module header and tests/nature3dBoardFaceMatrix.test.mjs for the matrix).
//
// A source-shape test cannot see any of that: the strings all look fine. So
// this file mounts the REAL module (bundled with the repo's own esbuild,
// exactly like tests/useDragScrollRuntime.test.mjs) over a real DOM in jsdom
// and checks the invariants that keep boards honest:
//
//   • the face element NEVER changes parent — not on a pin, not on a release,
//     not across any number of board switches, not on disposal (this is the
//     one that stops the resets);
//   • every layer carries a real 3D matrix while it is a 3D board, and the
//     framed one carries a screen-pixel scale on the untransformed layer;
//   • a face that cannot be projected as a 2D rectangle stays a live 3D board
//     with its page painted — never a black slab;
//   • a hill or a house in the way hides the SCREEN, never the board;
//   • a tree in the way hides NOTHING (2026-09-25: a swaying canopy must not
//     blank a study board), and partial occlusion cannot strobe a screen;
//   • frost, disposal and the winter dataset survive every transition.

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

export { THREE, terrainHeight };

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

/** Every board's layer / face / shell, for assertions in the test. */
export function boards(screens: any) {
  return screens.screens.map((s: any) => ({
    slot: s.slot,
    layer: s.layer,
    face: s.element,
    layerTransform: s.layer.style.transform,
    layerDisplay: s.layer.style.display,
    faceTransform: s.element.style.transform,
    faceDisplay: s.element.style.display,
    // THE invariant: the panel surface is a child of its layer for the board's
    // whole life. If this ever stops being true, an iframe inside the panel is
    // being detached and rebuilt — the video/module reset report.
    faceInsideLayer: s.element.parentElement === s.layer,
    layerConnected: s.layer.isConnected,
    layerInDom: s.layer.parentElement === screens.domElement,
    touchable: s.touchable,
    // The WebGL shell — frame, backing plate and legs. This is the PHYSICAL
    // board: it must survive every pose the screen cannot (looking at a
    // board's back, a hill in the way, the eye standing in the face's plane).
    shellVisible: Boolean(screens.shells.children[screens.screens.indexOf(s)]?.visible),
  }));
}
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "nature3d-board-pin");

function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.ts");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  execFileSync(
    require.resolve("esbuild/bin/esbuild"),
    [entry, "--bundle", "--format=cjs", "--platform=node", "--target=node20", `--outfile=${out}`, "--log-level=error"],
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

// A controllable clock: the occlusion hysteresis is measured in seconds, and a
// test that wants to see a screen come back after a hill has to be able to
// advance time without sleeping.
const clock = { now: 0 };
define("performance", { now: () => clock.now });

const fixture = require(bundle);
const page = window.document.getElementById("page");
const { screens, camera } = fixture.boot(page);

const boards = () => fixture.boards(screens);

/** The old failure, stated as an invariant: a board in the layer needs a pose. */
function assertLayersArePosed(state, when) {
  for (const b of state) {
    assert.ok(b.layerConnected, `${b.slot}: the layer must stay in the DOM layer (${when})`);
    assert.ok(
      b.layerInDom,
      `${b.slot}: the layer must stay a child of the untransformed layer (${when}) — ` +
        `re-parenting it is what detaches (and therefore reloads) its iframes`,
    );
    assert.match(
      b.layerTransform,
      /matrix3d\(|translate\(/,
      `${b.slot}: the layer lost its transform (${when}) — ` +
        `an untransformed 1920×1080 element in the layer is a board-sized page in the middle of the world`,
    );
  }
}

/**
 * The stray-board signature, stated directly: a face may only be on the
 * untransformed layer while it is a *sized* page — the 2D pin's
 * `scale(w/1920, h/1080)`, and never wider than the pin allows. A layer with
 * no transform, or with one that would paint the panel's full 1920×1080 px as
 * world units, is the board-sized page hanging in the sky.
 */
function assertNoStrayPage(state, when) {
  for (const b of state) {
    const m = /^translate\(-?[\d.]+px, -?[\d.]+px\) scale\(([-\d.e]+), ([-\d.e]+)\)$/.exec(b.layerTransform);
    if (!m) continue;
    const w = Number(m[1]) * 1920;
    const h = Number(m[2]) * 1080;
    assert.ok(
      w <= 1600 * 1.6 + 1 && h <= 900 * 1.6 + 1,
      `${b.slot}: a 2D face may never exceed the viewport (${when}) — got ${w}×${h} px`,
    );
  }
}

function assertFacesNeverMove(state, when) {
  for (const b of state) {
    assert.ok(
      b.faceInsideLayer,
      `${b.slot}: the panel surface must stay inside its own layer (${when}) — ` +
        `this is the invariant that keeps a playing video, an open module and a ` +
        `scrolled library alive across board and camera switches`,
    );
  }
}

/** Render a frame, advancing the controllable clock by `ms`. */
function step(ms = 16) {
  clock.now += ms;
  screens.render(camera, true);
}

/* ── 1. the world view: everything is a 3D board ──────────────────────────── */

test("with no board framed, all three boards are live 3D boards", () => {
  camera.position.set(0, 30, 60);
  camera.lookAt(0, 12, 0);
  camera.updateMatrixWorld(true);
  step();

  const state = boards();
  assert.equal(state.length, 3);
  assertLayersArePosed(state, "no board framed");
  assertFacesNeverMove(state, "no board framed");
  for (const b of state) {
    assert.match(b.layerTransform, /matrix3d\(/, `${b.slot}: a 3D board carries the camera's projection`);
    assert.equal(b.layerDisplay, "", `${b.slot}: the page must be painted`);
    assert.equal(b.touchable, true, `${b.slot}: a painted board is touchable`);
  }
});

/* ── 2. framing one board, and only its face ──────────────────────────────── */

test("framing a board writes a 2D face and leaves its layer in place", () => {
  fixture.frame(screens, camera, "reading");
  step();
  screens.setReadSlot("reading");
  step();

  const state = boards();
  const reading = state.find((b) => b.slot === "reading");
  assert.match(
    reading.layerTransform,
    /^translate\(/,
    "the framed face must be written as a screen-pixel rectangle",
  );
  assert.equal(reading.layerDisplay, "", "the framed face must be painted");
  assert.ok(reading.faceInsideLayer, "the framed face must stay inside its layer");
  assert.ok(reading.layerInDom, "the framed layer must stay on the untransformed layer");

  // …and the two boards beside it stay in the world, as 3D boards.
  for (const b of state.filter((x) => x.slot !== "reading")) {
    assert.equal(b.layerDisplay, "", `${b.slot}: the neighbours stay up while a board is framed`);
    assert.match(b.layerTransform, /matrix3d\(/, `${b.slot}: a neighbour stays a 3D board`);
    assert.ok(b.faceInsideLayer, `${b.slot}: the neighbour's face never moves either`);
  }
  assertNoStrayPage(state, "one board framed");
});

/* ── 3. THE RESET REPORT: nothing is ever re-parented ─────────────────────── */

test("no board or camera switch ever moves a panel surface", () => {
  const before = boards().map((b) => b.face);
  const layers = boards().map((b) => b.layer);

  // The learner's whole session, in the order the owner reported it: desk →
  // Read → Notes → Mind map → a scenery view → back to Read, with a resize
  // and a board-scale change thrown in. Every one of these used to detach the
  // YouTube iframe (and the module library's scroll position).
  const script = [
    () => {
      // The desk view: seated at the chair, all three boards in frame.
      camera.position.set(0, fixture.terrainHeight(0, 2.6) + 1.6, 24);
      camera.lookAt(0, 12, -5.4);
      camera.updateMatrixWorld(true);
      screens.setReadSlot(null);
    },
    () => {
      fixture.frame(screens, camera, "reading");
      screens.setReadSlot("reading");
    },
    () => {
      fixture.frame(screens, camera, "notes");
      screens.setReadSlot("notes");
    },
    () => {
      fixture.frame(screens, camera, "mindmap");
      screens.setReadSlot("mindmap");
    },
    () => {
      camera.position.set(0, 30, 60);
      camera.lookAt(0, 12, 0);
      camera.updateMatrixWorld(true);
      screens.setReadSlot(null);
    },
    () => {
      fixture.frame(screens, camera, "reading");
      screens.setReadSlot("reading");
    },
    () => {
      screens.setSize(900, 1600);
    },
    () => {
      screens.setScale(1.5);
    },
    () => {
      screens.setScale(1);
      screens.setSize(1600, 900);
    },
    () => {
      screens.setReadSlot(null);
    },
  ];

  for (const [i, act] of script.entries()) {
    act();
    step(32);
    step(32);
    const state = boards();
    assertFacesNeverMove(state, `after step ${i}`);
    assertNoStrayPage(state, `after step ${i}`);
    state.forEach((b, j) => {
      assert.equal(b.face, before[j], `step ${i}: ${b.slot}'s surface was replaced`);
      assert.equal(b.layer, layers[j], `step ${i}: ${b.slot}'s layer was replaced`);
    });
  }

  // …and the content living on a face survives all of it: React's portal
  // target is the same node, so a mounted iframe/video/list is never detached.
  const reading = screens.byId("reading");
  const button = window.document.createElement("button");
  button.textContent = "Continue lesson";
  let clicked = 0;
  button.addEventListener("click", () => (clicked += 1));
  reading.element.appendChild(button);
  for (const act of script) {
    act();
    step(32);
    assert.ok(reading.element.contains(button), "the panel's own content survives every switch");
  }
  button.click();
  button.click();
  assert.equal(clicked, 2, "the content is still live after every switch");
  button.remove();
});

/* ── 4. a face that cannot be projected stays a live 3D board ─────────────── */

test("a pin that cannot be projected leaves the board a live 3D board", () => {
  screens.setReadSlot(null);
  screens.setScale(1);
  screens.setSize(1600, 900);

  // First a REAL pin at a sane distance.
  fixture.frame(screens, camera, "reading");
  step();
  screens.setReadSlot("reading");
  step();
  let reading = boards().find((b) => b.slot === "reading");
  assert.match(reading.layerTransform, /^translate\(/, "precondition: the reading board is framed");

  // 10 m out the board is visible (the cull keeps it) but its projected face is
  // 1.7× the viewport wide, so the 2D face must be refused rather than
  // half-made: the page stays where it is instead of being hidden behind a
  // black slab.
  fixture.frame(screens, camera, "reading", 10);
  step();
  step();
  reading = boards().find((b) => b.slot === "reading");
  assert.match(reading.layerTransform, /matrix3d\(/, "a refused pin must fall back to the 3D pose");
  assert.equal(reading.layerDisplay, "", "a refused pin must never hide the page (the black slab)");
  assert.equal(reading.touchable, true, "a refused pin leaves the board touchable");

  // …and back to a sane distance the 2D face returns.
  fixture.frame(screens, camera, "reading", 26);
  step();
  reading = boards().find((b) => b.slot === "reading");
  assert.match(reading.layerTransform, /^translate\(/, "the 2D face comes back when it can be drawn");
  assertNoStrayPage(boards(), "after a refused pin");
});

/* ── 5. the hill between the eye and the board ────────────────────────────── */

test("a hill in the way hides the screen, not the board", () => {
  // The page is painted by the browser, over the canvas: there is no depth
  // buffer between the two, so a board behind a hill used to hang on the
  // hillside ("pahad ke piche se bhi dikhte hain, jaise board pahad par aa
  // gaye ho"). The engine asks the ground itself — the same height field the
  // mesh is built from — whether it stands in the way.
  screens.setReadSlot(null);
  const reading = () => boards().find((b) => b.slot === "reading");
  const board = screens.byId("reading").placement.position;

  const standAt = (z) => {
    // Eye height of the walker, standing on the ground at this azimuth. A
    // dozen frames: the cull's hysteresis is measured in seconds, and a page
    // that has just been released by the hill must be given its 120 ms to
    // come back rather than being declared missing.
    camera.position.set(0, fixture.terrainHeight(0, z) + 1.7, z);
    camera.lookAt(board.x, board.y, board.z);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 12; i += 1) step(16);
  };

  // Square on, inside the study clearing: nothing can be in the way.
  standAt(100 - 5.4);
  assert.equal(reading().layerDisplay, "", "in the clearing the page must be up");
  assert.equal(reading().shellVisible, true, "the board itself must be up");

  // 460 m out the sanctuary's hill rim stands between the eye and the board
  // (the analytic clearance there is metres, not centimetres).
  standAt(460 - 5.4);
  assert.equal(
    reading().layerDisplay,
    "none",
    "the page must not be painted through the hill standing in front of it",
  );
  assert.equal(
    reading().shellVisible,
    true,
    "the WebGL shell is depth-tested by the GPU — it must be left alone",
  );
  assert.equal(reading().touchable, false, "a hidden screen cannot be touched");

  // …and back in the clearing the page returns: the test must not be hiding
  // boards for good.
  standAt(100 - 5.4);
  assert.equal(reading().layerDisplay, "", "the page must come back in the open");
});

/* ── 6. a tree in the way hides NOTHING (2026-09-25) ──────────────────────── */

test("a tree standing in front of a board never blanks the screen", () => {
  // The 2026-09-24 directive asked for trees to be visible in front of the
  // boards. The DOM layer has no depth buffer, so "the tree in front of the
  // board" cannot be drawn — the only available answers are "board" or "black
  // rectangle", and hiding a 30 m study surface because a branch crossed its
  // corner is what produced the owner's "screen black ho jaati hai, kuchh
  // dikhta nahin aur flicker bhi karti hai" report. Trees are therefore not
  // occluders for a screen at all.
  const source = fs.readFileSync(path.join(ROOT, "src/nature3d/engine/boardScreens.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /treesBlockSight/, "a tree must never be able to hide a board screen");
  assert.doesNotMatch(code, /from ["']\.\/flora["']/, "the face cull must not consult the tree registry");

  // Behaviourally: stand the eye right where a trunk would be, and the page
  // must stay up. (A real tree registry is not needed — the point is that the
  // cull has no tree term left to fire.)
  screens.setReadSlot(null);
  const board = screens.byId("reading").placement.position;
  const normal = new fixture.THREE.Vector3(
    Math.sin(screens.byId("reading").placement.yaw),
    0,
    Math.cos(screens.byId("reading").placement.yaw),
  );
  for (const d of [12, 18, 26, 40]) {
    camera.position.copy(board).addScaledVector(normal, d);
    camera.position.y = fixture.terrainHeight(camera.position.x, camera.position.z) + 1.7;
    camera.lookAt(board.x, board.y, board.z);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 30; i += 1) step(16);
    const reading = boards().find((b) => b.slot === "reading");
    assert.equal(reading.layerDisplay, "", `at ${d} m the page must stay up (a tree may not hide it)`);
    assert.equal(reading.touchable, true, `at ${d} m the board must stay touchable`);
  }
});

/* ── 7. partial occlusion cannot strobe a screen ──────────────────────────── */

test("borderline occlusion is hysteretic — it cannot flicker", () => {
  // A sightline that grazes the grass line flips between blocked and clear on
  // every tiny camera movement. The cull therefore integrates over time: the
  // screen only goes away once a solid occluder has covered at least half the
  // face for a quarter of a second, and comes back as soon as the face is
  // mostly clear. Checked here by walking the eye back and forth across the
  // threshold and requiring the painted state to hold.
  screens.setReadSlot(null);
  const board = screens.byId("reading").placement.position;
  const z0 = 100 - 5.4;

  const at = (z) => {
    camera.position.set(0, fixture.terrainHeight(0, z) + 1.7, z);
    camera.lookAt(board.x, board.y, board.z);
    camera.updateMatrixWorld(true);
    step(16);
  };

  // Park just inside the clearing: the page is up and must STAY up across a
  // long run of frames, however the sightline grazes the ground.
  at(z0);
  let flips = 0;
  let last = boards().find((b) => b.slot === "reading").layerDisplay;
  for (let i = 0; i < 60; i += 1) {
    // ±2 cm of drift — far below anything a learner would notice.
    camera.position.y += i % 2 === 0 ? 0.01 : -0.01;
    camera.updateMatrixWorld(true);
    step(16);
    const now = boards().find((b) => b.slot === "reading").layerDisplay;
    if (now !== last) flips += 1;
    last = now;
  }
  assert.equal(last, "", "the page must be painted in the clearing");
  assert.equal(flips, 0, `a grazing sightline must not strobe the screen (${flips} flips)`);
});

/* ── 8. the same board, seen from behind ──────────────────────────────────── */

test("walking round to a board's back leaves the board standing", () => {
  // The screen faces one way: you cannot read it from behind, and hiding it
  // is right. Hiding the whole BOARD with it was not — the frame, backing
  // plate and legs disappeared the moment the camera crossed the face, which
  // is the owner's "board cut ho gaya, pura board dikhta hi nahin piche se".
  screens.setReadSlot(null);
  const p = screens.byId("notes").placement;
  const normal = new fixture.THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  const notes = () => boards().find((b) => b.slot === "notes");

  camera.position.copy(p.position).addScaledVector(normal, 30);
  camera.lookAt(p.position);
  camera.updateMatrixWorld(true);
  step(16);
  assert.equal(notes().layerDisplay, "", "in front, the page is up");
  assert.equal(notes().shellVisible, true, "in front, the board is up");

  camera.position.copy(p.position).addScaledVector(normal, -30);
  camera.lookAt(p.position);
  camera.updateMatrixWorld(true);
  step(16);

  assert.equal(notes().layerDisplay, "none", "from behind, the page must not be painted");
  assert.equal(notes().touchable, false, "from behind, the screen is not touchable");
  assert.equal(
    notes().shellVisible,
    true,
    "from behind, the BOARD must still be there — a physical board is not hidden by facing away",
  );
  assert.ok(notes().faceInsideLayer, "even hidden, the face stays inside its layer");
});

/* ── 9. a page is never painted with a corner behind the eye ──────────────── */

test("no camera pose paints a page the eye has stepped into", () => {
  // The board's own plane is the one place a CSS3D page cannot be trusted:
  // with corners behind the eye, one matrix turns into tens of thousands of
  // pixels sliced across the view — the "board cut ho gaya / 60 m board"
  // symptom. The engine now refuses to let the layer paint such a face. Swept
  // here over a full orbit grid: any page that IS up must have all four of its
  // corners in front of the eye.
  screens.setReadSlot(null);
  const corner = new fixture.THREE.Vector3();
  let painted = 0;

  for (const d of [6, 12, 20, 30, 45, 80, 200, 600, 1200]) {
    for (let deg = 0; deg < 360; deg += 15) {
      const yaw = (deg * Math.PI) / 180;
      for (const pitch of [0.12, 0.6, 1.2]) {
        camera.position.set(
          Math.sin(yaw) * Math.cos(pitch) * d,
          12 + Math.sin(pitch) * d,
          Math.cos(yaw) * Math.cos(pitch) * d - 5.4,
        );
        camera.lookAt(0, 12, -5.4);
        camera.updateMatrixWorld(true);
        step(16);

        for (const b of boards()) {
          if (b.layerDisplay === "none") continue;
          painted += 1;
          const p = screens.byId(b.slot).placement;
          const c = Math.cos(p.yaw);
          const sn = Math.sin(p.yaw);
          for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
              corner
                .set(p.position.x + sx * 15 * c, p.position.y + sy * 8.4375, p.position.z - sx * 15 * sn)
                .project(camera);
              assert.ok(
                corner.z >= -1.05 && corner.z <= 1.05,
                `${b.slot} at ${d} m / ${deg} deg / pitch ${pitch}: a page painted with a corner ` +
                  `behind the eye (ndc z ${corner.z.toFixed(2)}) — that is the sliced, board-sized page`,
              );
            }
          }
        }
      }
    }
  }

  assert.ok(painted >= 100, `the sweep must actually paint pages (painted ${painted})`);
});

/* ── 10. frost ────────────────────────────────────────────────────────────── */

test("board frost survives pin/switch/unpin without obscuring or replacing content", () => {
  screens.setReadSlot(null);
  const reading = screens.byId("reading");
  const content = window.document.createElement("button");
  content.textContent = "Continue lesson";
  let clicked = 0;
  content.addEventListener("click", () => (clicked += 1));
  reading.element.appendChild(content);
  const originals = boards().map((b) => b.layer.style.transform);
  screens.setWinter(true);
  for (const [i, b] of boards().entries()) {
    assert.equal(b.face.dataset.iceAge, "true");
    assert.equal(b.layer.style.transform, originals[i], "winter never changes the engine's pose");
  }
  for (const slot of ["reading", "notes", null]) {
    if (slot) fixture.frame(screens, camera, slot);
    screens.setReadSlot(slot);
    step(16);
    assert.equal(reading.element.dataset.iceAge, "true");
    assert.ok(reading.element.contains(content));
    assert.ok(reading.element.parentElement === reading.layer, "the face is home");
    content.click();
    assertNoStrayPage(boards(), `winter: ${slot}`);
  }
  assert.equal(clicked, 3);
  screens.setWinter(false);
  for (const b of boards()) assert.equal(b.face.dataset.iceAge, undefined);
  assert.equal(reading.element.firstChild, content);
  const css = fs.readFileSync(path.join(ROOT, "src/nature3d/winter.css"), "utf8");
  assert.match(css, /pointer-events: none/);
  assert.doesNotMatch(css, /backdrop-filter|filter:|transform:/, "frost must not blur lessons or alter poses");
  content.remove();
});

/* ── 11. disposal ─────────────────────────────────────────────────────────── */

test("disposal removes every board element, pinned or not", () => {
  screens.setReadSlot(null);
  fixture.frame(screens, camera, "notes");
  step(16);
  screens.setReadSlot("notes");
  step(16);
  assert.ok(boards().some((b) => /^translate\(/.test(b.layerTransform)), "precondition: a face is framed");

  screens.dispose();
  assert.equal(
    window.document.querySelectorAll(".nature3d-board-screen").length,
    0,
    "no board element may survive disposal",
  );
  assert.equal(window.document.querySelectorAll(".nature3d-board-layer-face").length, 0, "no layer may survive");
});
