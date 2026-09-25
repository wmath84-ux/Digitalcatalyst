// tests/nature3dBoardFaceMatrix.test.mjs
//
// The face-pose contract for the 3D Sanctuary's study boards
// (`src/nature3d/engine/boardScreens.ts`).
//
// Since 2026-09-25 the engine no longer hands a board's DOM surface to
// CSS3DRenderer — that renderer RE-PARENTS the element (into its own camera
// layer, and back out again when a board is framed), and re-parenting an
// `<iframe>` destroys and rebuilds it: the "Read par click karte hi chalta hua
// video reset ho jata hai" report. Instead the engine writes the projection
// itself, onto a layer that is created once and never moved.
//
// That makes the matrix the load-bearing part, and a matrix is exactly the
// kind of thing a source-shape test cannot check. So this file mounts the REAL
// module (bundled with the repo's own esbuild, exactly like
// tests/nature3dBoardPinRuntime.test.mjs) over a real DOM in jsdom, renders,
// and asks three's own camera where the board's four corners should land:
//
//   • the layer's transform, applied to the face's 1920×1080 box, must put
//     every corner exactly where `Vector3.project(camera)` puts the
//     corresponding world point — i.e. the engine's matrix IS the camera's
//     projection, not an approximation of it;
//   • it must hold at every camera distance, yaw and pitch, and at every
//     board scale;
//   • an idle camera must not rewrite the transform (the frame-budget rule);
//   • a camera that HAS moved must rewrite it.
//
// If this test passes, the hand-written matrix is interchangeable with
// CSS3DRenderer's — which is what makes the no-move architecture safe.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

const FIXTURE = `
import * as THREE from "three";
import { createBoardScreens, SCREEN_PX_WIDTH, SCREEN_PX_HEIGHT } from ${JSON.stringify(path.join(ROOT, "src/nature3d/engine/boardScreens.ts"))};

export { THREE, SCREEN_PX_WIDTH, SCREEN_PX_HEIGHT };

export function boot(host: HTMLElement, w = 1600, h = 900) {
  const screens = createBoardScreens(false);
  host.appendChild(screens.domElement);
  screens.setSize(w, h);
  const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 4000);
  return { screens, camera, w, h };
}

/** Park the camera square-on one board's face at \`distance\` metres. */
export function frame(screens: any, camera: any, slot: string, distance = 60) {
  const p = screens.byId(slot).placement;
  const normal = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  camera.position.copy(p.position).addScaledVector(normal, distance);
  camera.lookAt(p.position);
  camera.updateMatrixWorld(true);
}
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "nature3d-board-face-matrix");

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

const bundle = buildFixture();

const dom = new JSDOM(`<!doctype html><html><body><div id="page"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
for (const key of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "getComputedStyle", "CSSStyleDeclaration"]) {
  define(key, window[key]);
}

const fixture = require(bundle);
const page = window.document.getElementById("page");
const { screens, camera } = fixture.boot(page);
const THREE = fixture.THREE;

/** The face's box corners in the layer's own coordinate space. */
const BOX_CORNERS = [
  [0, 0],
  [fixture.SCREEN_PX_WIDTH, 0],
  [fixture.SCREEN_PX_WIDTH, fixture.SCREEN_PX_HEIGHT],
  [0, fixture.SCREEN_PX_HEIGHT],
];

/** Parse the `matrix3d(...)` on a layer into a column-major 4×4. */
function parseMatrix(css) {
  const nums = css
    .replace(/^matrix3d\(|\)$/g, "")
    .split(",")
    .map(Number);
  assert.equal(nums.length, 16, `a 4×4 matrix, got: ${css.slice(0, 80)}`);
  return nums;
}

/** Apply a column-major 4×4 to a box point, with the perspective divide. */
function apply(nums, x, y) {
  const px = nums[0] * x + nums[4] * y + nums[12];
  const py = nums[1] * x + nums[5] * y + nums[13];
  const pw = nums[3] * x + nums[7] * y + nums[15];
  return [px / pw, py / pw];
}

/**
 * The engine's pose for `slot`, checked against three's own projection of the
 * board's four world corners. Returns the worst deviation in CSS pixels.
 */
function poseDeviation(slot, scale = 1) {
  const screen = screens.byId(slot);
  const p = screen.placement;
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const hw = (30 * scale) / 2;
  const hh = ((30 * 9) / 16 * scale) / 2;
  const nums = parseMatrix(screen.layer.style.transform);
  let worst = 0;
  BOX_CORNERS.forEach(([bx, by], i) => {
    const sx = i === 1 || i === 2 ? 1 : -1;
    const sy = i >= 2 ? -1 : 1;
    // The same corner in world space: the board's own face, half a millimetre
    // in front of the DOM layer so both describe the same rectangle.
    const world = new THREE.Vector3(
      p.position.x + sx * hw * c,
      p.position.y + sy * hh,
      p.position.z - sx * hw * s,
    );
    const ndc = world.clone().project(camera);
    const expected = [((ndc.x + 1) / 2) * 1600, ((1 - ndc.y) / 2) * 900];
    const got = apply(nums, bx, by);
    worst = Math.max(worst, Math.hypot(expected[0] - got[0], expected[1] - got[1]));
  });
  return worst;
}

test("the engine's matrix is the camera's own projection, at every pose", () => {
  let painted = 0;
  let worst = 0;
  for (const slot of ["reading", "notes", "mindmap"]) {
    for (const distance of [10, 26, 45, 90, 300, 1200]) {
      for (const deg of [0, 25, 90, 140, 210, 300]) {
        for (const pitch of [0, 0.3, -0.45]) {
          for (const scale of [1, 2]) {
            screens.setReadSlot(null);
            screens.setScale(scale);
            const p = screens.byId(slot).placement;
            const yaw = (deg * Math.PI) / 180;
            camera.position.set(
              p.position.x + Math.sin(yaw) * Math.cos(pitch) * distance,
              p.position.y + Math.sin(pitch) * distance,
              p.position.z + Math.cos(yaw) * Math.cos(pitch) * distance,
            );
            camera.lookAt(p.position);
            camera.updateMatrixWorld(true);
            screens.render(camera, true);
            const screen = screens.byId(slot);
            if (screen.layer.style.display === "none") continue;
            painted += 1;
            const d = poseDeviation(slot, scale);
            worst = Math.max(worst, d);
            assert.ok(
              d < 0.05,
              `${slot} at ${distance} m / ${deg}° / pitch ${pitch} / scale ${scale}: ` +
                `the engine's matrix lands ${d.toFixed(3)} px away from three's own projection`,
            );
          }
        }
      }
    }
  }
  assert.ok(painted >= 20, `the sweep must actually paint faces (painted ${painted})`);
  assert.ok(worst < 0.02, `worst deviation across the whole sweep was ${worst.toFixed(4)} px`);
});

test("a framed board is written as a 2D screen rectangle, not a 3D matrix", () => {
  screens.setReadSlot(null);
  screens.setScale(1);
  fixture.frame(screens, camera, "reading", 26);
  screens.render(camera, true);
  screens.setReadSlot("reading");
  screens.render(camera, true);

  const reading = screens.byId("reading");
  assert.match(
    reading.layer.style.transform,
    /^translate\(-?[\d.]+px, -?[\d.]+px\) scale\([\d.]+, [\d.]+\)$/,
    "the framed face must carry the pin's screen-pixel transform",
  );
  const m = /scale\(([\d.]+), ([\d.]+)\)/.exec(reading.layer.style.transform);
  const w = Number(m[1]) * fixture.SCREEN_PX_WIDTH;
  const h = Number(m[2]) * fixture.SCREEN_PX_HEIGHT;
  assert.ok(w > 8 && h > 8, "the framed face must be a real rectangle");
  assert.ok(w <= 1600 * 1.6 + 1 && h <= 900 * 1.6 + 1, `the framed face must fit the viewport (${w}×${h})`);
  assert.notEqual(reading.layer.style.display, "none", "the framed face must be painted");
});

test("an idle camera writes nothing; a moving one rewrites the pose", () => {
  screens.setReadSlot(null);
  screens.setScale(1);
  fixture.frame(screens, camera, "reading", 40);
  screens.render(camera, true);
  const before = screens.byId("reading").layer.style.transform;
  assert.match(before, /matrix3d\(/, "a 3D board carries a matrix");

  // Same camera, same everything: the style string must not be rewritten.
  const el = screens.byId("reading").layer;
  let writes = 0;
  let value = el.style.transform;
  Object.defineProperty(el.style, "transform", {
    configurable: true,
    get: () => value,
    set: (v) => {
      writes += 1;
      value = v;
    },
  });
  screens.render(camera);
  screens.render(camera);
  assert.equal(writes, 0, "an idle camera must not rewrite a transform");

  camera.position.x += 0.5;
  camera.updateMatrixWorld(true);
  screens.render(camera, true);
  assert.notEqual(screens.byId("reading").layer.style.transform, before, "a moved camera must re-pose the face");
});
