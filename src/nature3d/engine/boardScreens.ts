// src/nature3d/engine/boardScreens.ts
//
// THE THREE LIVE BOARD SCREENS.
//
// Each of the lectern's 30 m boards shows a REAL, LIVE web page — the same
// course-player panels the 2D app renders, not a picture of them. A YouTube
// embed plays, a PDF scrolls, the mind-map canvas pans, the notes editor takes
// a caret. That rules out the obvious implementations:
//
//   • drawing to a canvas and using it as a texture — a `<canvas>` cannot host
//     an `<iframe>`, so YouTube and Google Docs are impossible from the start,
//     and every DOM feature (text selection, scrolling, focus) would have to
//     be re-implemented by hand;
//   • html2canvas-style rasterising — one static frame per repaint, no video,
//     no interaction, and a full re-raster on every keystroke;
//   • a 4096² render target — even at 4 K a 30 m board is ~7 px per cm, so body
//     text turns to mush, which is exactly what the brief says must not happen.
//
// So the screens are CSS3D: the camera's projection is applied to a plain DOM
// element as a CSS `matrix3d`, which means the browser rasterises the page
// itself, at device resolution, AFTER the transform. Text stays vector-sharp
// whether the board fills the screen or sits 300 m away, video decodes on the
// compositor, and every DOM behaviour works because it IS the DOM. This is the
// only approach that satisfies "chahe jitna bada ya chhota board ho, sab kuchh
// clearly aur smooth dikhna chahiye".
//
// ── THE FACE NEVER MOVES (owner report, 2026-09-25) ────────────────────
//
//   "desk camera par hun aur Read par click karta hun to ja zoom in fit hota
//    hai, us par chalta hua video reset hokar fir se chalta hai … camera
//    alag-alag board par switch karne per bhi yahi reset problem aata hai …
//    koi bhi module play ho raha ho, module library mein ho, camera switch
//    karke dekho — reset hoga."
//
// Every one of those resets had the SAME cause: the board's surface was
// RE-PARENTED in the DOM. The old pin lifted a board's face out of its CSS3D
// host and onto the untransformed layer so its buttons would hit-test
// natively, and put it back on release — and an `<iframe>` (or a `<video>`,
// or a scrolled panel) that is detached from the document is destroyed and
// rebuilt by the browser. Clicking "Read" from the desk therefore reloaded
// the YouTube embed mid-lesson; switching board reloaded it twice more
// (release + pin); jumping to any scenery view reloaded it again. The module
// library lost its scroll position for the same reason.
//
// So the engine no longer moves anything. Each board is built ONCE, as one
// layer that is never re-parented:
//
//     domElement            untransformed, pointer-events:none, overflow:hidden
//       └── layer           1920×1080, transform-origin 0 0 — the engine writes
//            │              its transform and NOTHING else ever touches it
//            ├── element    the panel surface React portals into
//            └── fogVeil    the distance-smoke overlay (rides the same pose)
//
// The engine writes `layer`'s transform itself, from the very same matrices
// the camera uses, so the 3D pose is bit-for-bit the pose CSS3DRenderer would
// have written (verified against three's own `project()` in
// tests/nature3dBoardFaceMatrix.test.mjs). When one board is framed it gets a
// pure 2D `translate() scale()` instead — the same screen-pixel rectangle the
// pin always used, on the same untransformed layer, so its buttons hit-test
// natively exactly as before. The difference is that it is a STYLE WRITE, not
// a DOM move: the iframe, the video, the caret and the scroll offsets all
// survive every board switch, every camera switch and every resize.
//
// ── The performance rules that keep it free ────────────────────────────
//
// BGMI's renderer earns its frame budget by never doing work it can avoid, and
// the same three ideas apply here:
//
//   1. STATE CHANGES ARE THE COST, NOT PIXELS. A transform string is written
//      per board per frame, but only when the string actually differs from the
//      one already on the element — an idle camera writes nothing at all, so a
//      still scene costs zero style recalcs.
//   2. DON'T RENDER WHAT YOU CANNOT SEE. Each board is frustum-culled against
//      the camera by hand and, crucially, back-face culled: a board behind the
//      viewer has its layer set to `display:none`, which takes its entire
//      subtree — iframes, video, the mind-map canvas — out of the browser's
//      layout, paint and compositing work. Looking away from a board genuinely
//      stops paying for it.
//
//      That cull is about the SCREEN. The WebGL SHELL (frame, backing plate,
//      legs) is a physical object and follows the frustum alone: walk round
//      the lectern and you must still see three boards standing there. The two
//      used to share one flag, so crossing a board's face deleted the whole
//      board from the world — the owner's "board cut ho gaya, pura board dikhta
//      hi nahin piche se".
//
//      A screen is also only ever painted while the WHOLE face projects in
//      front of the eye (all four corners inside the near/far range). With
//      only the board's centre tested, a camera standing in the board's own
//      plane left corners behind the eye, where one CSS3D matrix is a page of
//      tens of thousands of pixels sliced across the view — the "board cut ho
//      gaya" the owner met when walking up to a board. And because the DOM
//      layer has no depth buffer, a hill cannot hide a board by itself: the
//      sight line is tested against the same height field the ground mesh is
//      built from (see `terrainBlocksSight`), so boards are not painted on the
//      hillside when the learner walks behind it.
//   3. OFF-SCREEN CONTENT IS SUSPENDED, NOT HIDDEN. `visibility:hidden` keeps
//      a YouTube iframe decoding video forever. `display:none` does not, and
//      that is the difference between one live video and three.
//
// ── WHAT MAY HIDE A SCREEN (owner report, 2026-09-25) ──────────────────
//
//   "jab board ke samne koi ped ya kuchh bhi aata hai to screen … black ho
//    jaati hai, kuchh dikhta nahin aur flicker bhi karti hai."
//
// The 2026-09-24 directive ("ped ke samne aaye to vahi dikhe") was implemented
// by hiding the WHOLE board whenever any tree crossed any sightline to any
// part of its 30 m face. A tree is modelled as a solid 3.6 m cylinder 10 m
// tall, so one trunk near the board's edge blanked the entire screen — the
// board the learner is reading went black, and because the tree's crown
// crosses the sightline differently as the camera drifts, it came back and
// went away again: flicker.
//
// The DOM layer has no depth buffer, so "the tree in front of the board" is
// not a thing that can be drawn — the only available answers are "board" or
// "black rectangle". A 30 m UI surface that vanishes because a branch crossed
// its corner is the wrong trade, so:
//
//   • TREES never hide a board screen. They are leaves and trunks, not walls;
//     the board stays readable and the tree simply reads as being behind it.
//   • TERRAIN and BUILDINGS (the villa, the beach houses) still do — a hill or
//     a house genuinely stands between the viewer and the board, and both are
//     large and static, so the transition is a clean swap, never a flicker.
//   • Partial occlusion is hysteretic: a board only goes away when a solid
//     occluder covers at least half its face for a quarter of a second, and
//     comes back as soon as the face is mostly clear. Borderline grass lines
//     and drifting edges can no longer strobe a screen on and off.

import * as THREE from "three";
import { terrainHeight } from "./terrain";
import { WAREHOUSE_X, WAREHOUSE_Z } from "./warehouseSite";
import { beachHouseSites } from "./beachHouseSite";
import {
  LECTERN_BOARD_HEIGHT,
  LECTERN_BOARD_WIDTH,
  lecternPlacements,
  lecternPlacementsAt,
  type LecternPlacement,
  type LecternSlot,
} from "./lectern";

/**
 * Layout resolution of a board's DOM element, in CSS pixels.
 *
 * The element is authored at 1920×1080 and then scaled down to world metres,
 * so every panel lays itself out exactly as it would on a 1080p desktop —
 * which is what makes the ported course-player panels look right without a
 * single style override. Crispness does NOT come from this number (the
 * browser rasterises after the 3D transform, at whatever the screen needs);
 * it only decides how much "desk space" the page thinks it has.
 */
export const SCREEN_PX_WIDTH = 1920;
export const SCREEN_PX_HEIGHT = 1080;

/** CSS pixels → world metres. 1920 px across a 30 m board. */
export const PX_TO_M = LECTERN_BOARD_WIDTH / SCREEN_PX_WIDTH;

/** Half of the face, in layout px — used by the box↔object conversions. */
const HALF_W = SCREEN_PX_WIDTH / 2;
const HALF_H = SCREEN_PX_HEIGHT / 2;

// ── Occlusion ───────────────────────────────────────────────────────────
//
// Only SOLID world geometry may hide a screen (see the header). Trees are
// deliberately absent: a swaying canopy must never blank a study board.

const OCCLUSION_MARGIN = 0.15;
const OCCLUSION_MIN_DISTANCE = 2;

/** Fraction of the face a solid occluder must cover to hide the screen. */
const OCCLUDE_ENTER = 0.5;
/** …and the fraction below which the screen comes straight back. */
const OCCLUDE_EXIT = 0.15;
/** How long the face must stay covered before the screen goes away (s). */
const OCCLUDE_ENTER_S = 0.25;
/** …and how long it must stay clear before it comes back (s). */
const OCCLUDE_EXIT_S = 0.12;

/** Is the sightline between eye and target blocked by terrain, grass, the villa or a beach house? */
function terrainBlocksSight(eye: THREE.Vector3, target: THREE.Vector3): boolean {
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const dz = target.z - eye.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < OCCLUSION_MIN_DISTANCE) return false;

  // 1. Villa obstruction (with sloped gable roof)
  const lenXZ = Math.hypot(dx, dz);
  if (lenXZ > 1e-4) {
    const vSteps = Math.min(32, Math.max(6, Math.round(length / 2.0)));
    const vTh = terrainHeight(WAREHOUSE_X, WAREHOUSE_Z);
    for (let i = 1; i < vSteps; i += 1) {
      const t = i / vSteps;
      const px = eye.x + dx * t;
      const py = eye.y + dy * t;
      const pz = eye.z + dz * t;
      const vx = px - WAREHOUSE_X;
      const vz = pz - WAREHOUSE_Z;
      if (Math.abs(vx) <= 18.1 && Math.abs(vz) <= 21.4) {
        const roofY = vTh + 30.4 - (Math.abs(vx) / 18.1) * 18.0;
        if (py >= vTh && py <= roofY) return true;
      }
    }
  }

  // 2. Beach houses obstruction (all 6 houses with gable roof)
  const sites = beachHouseSites();
  if (sites.length > 0) {
    const hSteps = Math.min(32, Math.max(6, Math.round(length / 2.0)));
    for (let i = 1; i < hSteps; i += 1) {
      const t = i / hSteps;
      const px = eye.x + dx * t;
      const py = eye.y + dy * t;
      const pz = eye.z + dz * t;
      for (let k = 0; k < sites.length; k += 1) {
        const s = sites[k];
        const hx = px - s.x;
        const hz = pz - s.z;
        const lx = s.cos * hx - s.sin * hz;
        const lz = s.sin * hx + s.cos * hz;
        if (Math.abs(lx) <= s.halfX && Math.abs(lz) <= s.halfZ) {
          const roofY = s.padY + 30.0 - (Math.abs(lx) / s.halfX) * 18.0;
          if (py >= s.padY && py <= roofY) return true;
        }
      }
    }
  }

  // 3. Terrain & grass raymarch: ~2.5 m resolution
  const steps = Math.min(48, Math.max(8, Math.round(length / 2.5)));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const px = eye.x + dx * t;
    const py = eye.y + dy * t;
    const pz = eye.z + dz * t;
    const th = terrainHeight(px, pz);
    // Grass is ~0.45 m tall on the ground
    const surfaceH = th + 0.45;
    if (surfaceH - py > OCCLUSION_MARGIN) return true;
  }

  return false;
}

/**
 * How much of a board's face a solid occluder covers, 0…1, plus whether the
 * CENTRE — the part the learner is actually reading — is blocked outright.
 *
 * Sampling the face (rather than testing one ray) is what keeps a board that
 * is merely *near* an occluder painted: the answer is a fraction, and only a
 * substantial, sustained fraction hides the screen.
 */
function boardOcclusion(
  eye: THREE.Vector3,
  screen: BoardScreen,
  scale: number,
): { ratio: number; centre: boolean } {
  const p = screen.placement;
  const length = eye.distanceTo(p.position);
  if (length < OCCLUSION_MIN_DISTANCE) return { ratio: 0, centre: false };

  const centre = terrainBlocksSight(eye, p.position);
  if (centre) return { ratio: 1, centre: true };

  const cos = Math.cos(p.yaw);
  const sin = Math.sin(p.yaw);
  const halfW = (LECTERN_BOARD_WIDTH * scale) / 2;
  const halfH = (LECTERN_BOARD_HEIGHT * scale) / 2;

  // Perimeter + inner samples across the face: bottom-centre (grass, ground
  // rises), the four corners and the mid-edges, and the top centre.
  const samples: THREE.Vector3[] = [
    new THREE.Vector3(p.position.x, p.position.y - halfH * 0.7, p.position.z),
    new THREE.Vector3(p.position.x - halfW * 0.65 * cos, p.position.y, p.position.z + halfW * 0.65 * sin),
    new THREE.Vector3(p.position.x + halfW * 0.65 * cos, p.position.y, p.position.z - halfW * 0.65 * sin),
    new THREE.Vector3(p.position.x - halfW * 0.6 * cos, p.position.y - halfH * 0.65, p.position.z + halfW * 0.6 * sin),
    new THREE.Vector3(p.position.x + halfW * 0.6 * cos, p.position.y - halfH * 0.65, p.position.z - halfW * 0.6 * sin),
    new THREE.Vector3(p.position.x, p.position.y + halfH * 0.65, p.position.z),
    new THREE.Vector3(p.position.x - halfW * cos, p.position.y + halfH * 0.35, p.position.z + halfW * sin),
    new THREE.Vector3(p.position.x + halfW * cos, p.position.y + halfH * 0.35, p.position.z - halfW * sin),
  ];

  let blocked = 0;
  for (let i = 0; i < samples.length; i += 1) {
    if (terrainBlocksSight(eye, samples[i])) blocked += 1;
  }
  return { ratio: blocked / samples.length, centre: false };
}

export interface BoardScreen {
  slot: LecternSlot;
  /**
   * The layer the engine writes the transform to. Created once, appended to
   * `domElement` once, and NEVER re-parented — see the header. Everything the
   * old renderer-owned `host` was (the cull's `display`, the fog veil, the
   * box the panel is laid out in) is this element now.
   */
  layer: HTMLDivElement;
  /**
   * The board's panel surface — the element React portals into, the root the
   * input bridge (scene.ts) walks, and the element the frost is painted on.
   * It is a child of `layer` for the board's whole life.
   */
  element: HTMLDivElement;
  /** The distance-smoke overlay, above the panel and out of the way of clicks. */
  veil: HTMLDivElement;
  /** The board's world pose. The engine keeps this fresh; nobody else reads it. */
  object: THREE.Object3D;
  placement: LecternPlacement;
  /** True while the face is painted and can be touched (the input bridge asks). */
  touchable: boolean;
  /** Last transform string written to `layer`, so an idle camera writes nothing. */
  transform: string;
  /** Last display value written to `layer`. */
  shown: boolean;
  /** Smoothed occlusion state — see the header's "what may hide a screen". */
  occludedFor: number;
  clearFor: number;
  hidden: boolean;
}

export interface BoardScreensHandle {
  screens: BoardScreen[];
  /** The DOM layer, to be appended beside the canvas. */
  domElement: HTMLElement;
  /** WebGL-side frames/backings, added to the main scene. */
  shells: THREE.Group;
  byId(slot: LecternSlot): BoardScreen | undefined;
  setSize(width: number, height: number): void;
  /** Frame one board as a 2D face for native clicks; null returns it to 3D. */
  setReadSlot(slot: LecternSlot | null): void;
  /** Frost the perimeter without changing content, hit targets or poses. */
  setWinter(enabled: boolean): void;
  /** Relayout the trio at `scale` × the pinned 30 m face. */
  setScale(scale: number): void;
  /**
   * Distance smoke on the board faces.
   * The DOM layer sits above the WebGL canvas and does not receive scene.fog,
   * so the engine pushes the same near/far/colour the world uses and each face
   * gets a translucent overlay that matches THREE.Fog's smoothstep ramp.
   */
  setFog(near: number, far: number, color: THREE.Color): void;
  render(camera: THREE.PerspectiveCamera, force?: boolean): void;
  dispose(): void;
}

/**
 * The physical board in the WebGL scene: a dark backing panel, a bright frame
 * and two legs. The DOM screen floats a few millimetres in front of the
 * backing, so the board reads as a real object with a lit screen in it.
 */
function createBoardShells(placements: LecternPlacement[], shadows: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = "lectern-shells";

  const W = LECTERN_BOARD_WIDTH;
  const H = LECTERN_BOARD_HEIGHT;
  const BEZEL = 0.5;
  const DEPTH = 0.32;

  // One material set shared by all three boards — three boards then batch into
  // the same buckets instead of forcing a state change per board.
  // fog: true (default on Standard/Lambert) so distance smoke hits the
  // board shells the same way it hits trees and terrain. BasicMaterial
  // also supports fog — keep it on so the black backing fades into haze.
  const frame = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.55, metalness: 0.35, fog: true });
  const backing = new THREE.MeshBasicMaterial({ color: 0x05070c, fog: true });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x141b26, roughness: 0.6, metalness: 0.4, fog: true });

  const frameGeo = new THREE.BoxGeometry(W + BEZEL * 2, H + BEZEL * 2, DEPTH);
  const backGeo = new THREE.PlaneGeometry(W, H);

  for (const p of placements) {
    const board = new THREE.Group();
    board.position.copy(p.position);
    board.rotation.y = p.yaw;

    const shell = new THREE.Mesh(frameGeo, frame);
    shell.position.z = -DEPTH / 2 - 0.02;
    shell.castShadow = shadows;
    shell.receiveShadow = shadows;
    board.add(shell);

    // Pure black backing directly behind the DOM screen. The CSS layer is
    // composited over the canvas, so this is what the screen's own
    // transparent pixels resolve against — without it the meadow would show
    // through the gaps between paragraphs.
    const back = new THREE.Mesh(backGeo, backing);
    back.position.z = -0.01;
    board.add(back);

    // Legs down to the ground, so a 20 m board is not floating. The boards
    // all share one datum (see `lecternPlacements`), but the ground under
    // each one does not, so the leg length is measured per board — that is
    // what absorbs the slope without staggering the screens.
    const legH = p.position.y - H / 2 - terrainHeight(p.position.x, p.position.z);
    if (legH > 0.5) {
      const legGeo = new THREE.CylinderGeometry(0.22, 0.3, legH, 8);
      for (const x of [-W * 0.32, W * 0.32]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(x, -H / 2 - legH / 2, -DEPTH / 2);
        leg.castShadow = shadows;
        board.add(leg);
      }
    }

    group.add(board);
  }

  return group;
}

export function createBoardScreens(shadows: boolean): BoardScreensHandle {
  const placements = lecternPlacements();

  // The untransformed layer the faces live on for their whole life. It is a
  // sibling of the canvas, sized to the viewport, and it never eats a pointer
  // event itself — only the boards do, and they re-enable it on their own
  // elements. Without this the whole canvas would stop receiving the
  // orbit/look drags.
  const domElement = document.createElement("div");
  domElement.className = "nature3d-board-layer";
  domElement.style.position = "absolute";
  domElement.style.inset = "0";
  domElement.style.pointerEvents = "none";
  domElement.style.overflow = "hidden";

  const screens: BoardScreen[] = placements.map((placement) => {
    // The layer: the board's 1920×1080 box in world space. The engine writes
    // its transform (and its `display`, for culled boards) and nothing else.
    const layer = document.createElement("div");
    layer.className = "nature3d-board-screen nature3d-board-layer-face";
    layer.dataset.slot = placement.slot;
    layer.style.position = "absolute";
    layer.style.left = "0px";
    layer.style.top = "0px";
    layer.style.width = `${SCREEN_PX_WIDTH}px`;
    layer.style.height = `${SCREEN_PX_HEIGHT}px`;
    layer.style.overflow = "hidden";
    layer.style.background = "#070b12";
    layer.style.borderRadius = "6px";
    layer.style.transformOrigin = "0 0";
    layer.style.pointerEvents = "auto";
    layer.style.willChange = "transform";
    domElement.appendChild(layer);

    const element = document.createElement("div");
    element.className = "nature3d-board-screen";
    element.dataset.slot = placement.slot;
    element.style.width = `${SCREEN_PX_WIDTH}px`;
    element.style.height = `${SCREEN_PX_HEIGHT}px`;
    element.style.overflow = "hidden";
    element.style.background = "#070b12";
    element.style.pointerEvents = "auto";
    // A tap must land IMMEDIATELY and a list must SCROLL on touch.
    // `pan-y` keeps native vertical scrolling of the panels (notes list,
    // library, …) but gives the browser no business doing double-tap zoom
    // or pinch INSIDE the board — those delays and page-level gestures are
    // exactly what made the board's buttons feel dead ("click kabhi hota
    // hai kabhi nahin"). Horizontal gestures and the mind-map's pan/zoom
    // are pointer-event driven in JS, so they are unaffected. When the
    // device's 3D hit-test drops a touch entirely, the engine's input
    // bridge (scene.ts) replays the same gesture into this element.
    element.style.touchAction = "pan-y";
    // The DOM board is a screen, not a window: nothing inside it should be
    // able to spill past the bezel painted in the WebGL scene.
    element.style.borderRadius = "6px";
    element.style.position = "absolute";
    element.style.left = "0px";
    element.style.top = "0px";
    layer.appendChild(element);

    // Fog veil — sits above the live DOM face, ignores pointer events so
    // buttons/scroll still work. Opacity is driven each frame from camera
    // distance using the same smoothstep(near, far) as THREE.Fog.
    const veil = document.createElement("div");
    veil.className = "nature3d-board-fog";
    veil.style.position = "absolute";
    veil.style.inset = "0";
    veil.style.pointerEvents = "none";
    veil.style.borderRadius = "6px";
    veil.style.opacity = "0";
    veil.style.background = "rgb(180, 204, 228)";
    veil.style.transition = "opacity 80ms linear";
    veil.style.zIndex = "20";
    layer.appendChild(veil);

    // The engine's orbit/look handlers live on the shared host element, and
    // the board is a CHILD of it, so without this every click inside a panel
    // would also spin the camera and every text selection would drag the
    // world. Stopping propagation at the board's own root lets the panel
    // behave like an ordinary web page while the meadow around it still
    // responds to drags.
    for (const type of ["pointerdown", "pointermove", "pointerup", "wheel"]) {
      element.addEventListener(type, (event) => {
        // A hit on the BOARD ROOT (not a nested control) means the device's
        // hit-test missed the button the learner actually tapped — the
        // classic "centre of the editor is dead" failure. Let it bubble so
        // the engine's geometric bridge can re-aim it.
        if (event.target === element) return;
        event.stopPropagation();
      });
    }
    // A cancelled touch (system gesture, call arriving) must not leak to the
    // camera rig either, or the world would lurch at the moment a touch dies.
    element.addEventListener("pointercancel", (event) => event.stopPropagation());

    const object = new THREE.Object3D();
    object.position.copy(placement.position);
    object.rotation.y = placement.yaw;
    object.scale.setScalar(PX_TO_M);
    object.updateMatrixWorld(true);

    return {
      slot: placement.slot,
      layer,
      element,
      veil,
      object,
      placement,
      touchable: true,
      transform: "",
      shown: true,
      occludedFor: 0,
      clearFor: 0,
      hidden: false,
    };
  });

  const shells = createBoardShells(placements, shadows);

  // Distance smoke parameters — mirrored from scene.fog each daylight tick.
  let fogNear = 16;
  let fogFar = 420;
  let fogColorCss = "rgb(180, 204, 228)";

  // ── Culling scratch (hoisted — the render path allocates nothing) ─────
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), LECTERN_BOARD_WIDTH * 0.62);
  const boardNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const lastCamPos = new THREE.Vector3(1e9, 1e9, 1e9);
  const lastCamQuat = new THREE.Quaternion(2, 2, 2, 2);
  const pinCorner = new THREE.Vector3();
  let viewW = 1;
  let viewH = 1;
  let faceScale = 1;
  let readSlot: LecternSlot | null = null;
  /** Set whenever something other than the camera changed the faces' pose. */
  let poseDirty = true;
  /** Wall clock of the last rendered frame, for the occlusion hysteresis. */
  let lastFrameMs = 0;

  // ── The face's pose, as the camera sees it ────────────────────────────
  //
  // `viewport · projection · view · model · flip` is EXACTLY the transform
  // CSS3DRenderer applies to a board's host, expressed in one matrix:
  //
  //   • `flip` takes the layer's box coordinates (origin top-left, y down) to
  //     the object's local space (origin at the board's centre, y up);
  //   • `model` is the board's placement (position, yaw, PX_TO_M scale);
  //   • `view` / `projection` are the live camera's;
  //   • `viewport` maps NDC to CSS pixels, flipping y back down.
  //
  // Written straight onto the layer with `transform-origin: 0 0`, so the
  // browser applies the very projection the WebGL canvas is using. The
  // equivalence is pinned by tests/nature3dBoardFaceMatrix.test.mjs, which
  // projects the board's four corners through three's own camera and compares.
  const viewportMatrix = new THREE.Matrix4();
  const flipMatrix = new THREE.Matrix4().fromArray([
    1, 0, 0, 0,
    0, -1, 0, 0,
    0, 0, 1, 0,
    -HALF_W, HALF_H, 0, 1,
  ]);
  const faceMatrix = new THREE.Matrix4();

  /**
   * Serialise a matrix for CSS.
   *
   * Nine decimals, with the tiny terms snapped to zero. The perspective row
   * is divided into screen coordinates of ~1000 px, so it needs far more
   * precision than the rest of the matrix (a 1e-6 error there is a visible
   * fraction of a pixel on a near board). Nine decimals is well inside a
   * double, keeps the string STABLE — an unchanged camera produces a
   * bit-identical matrix, so the "write only when it differs" rule below
   * really does write nothing on an idle frame — and costs a few hundred
   * bytes of string.
   */
  function matrixCss(m: THREE.Matrix4): string {
    const e = m.elements;
    let out = "matrix3d(";
    for (let i = 0; i < 16; i += 1) {
      const r = Math.round(e[i] * 1e9) / 1e9;
      out += (i ? "," : "") + (r === 0 ? 0 : r);
    }
    return out + ")";
  }

  /** Write the board's 3D pose onto its layer (a no-op when unchanged). */
  const writePose = (screen: BoardScreen, camera: THREE.PerspectiveCamera) => {
    faceMatrix.multiplyMatrices(viewportMatrix, camera.projectionMatrix);
    faceMatrix.multiply(camera.matrixWorldInverse);
    faceMatrix.multiply(screen.object.matrixWorld);
    faceMatrix.multiply(flipMatrix);
    const css = matrixCss(faceMatrix);
    if (screen.transform !== css) {
      screen.layer.style.transform = css;
      screen.transform = css;
    }
  };

  /**
   * The face's projected screen rectangle, taken from its four corners.
   *
   * `ok` is false when any corner leaves the near/far range, i.e. when the
   * camera stands in — or has crossed — the board's own plane. There the board
   * is no longer a rectangle in front of the eye at all, and one CSS3D matrix
   * becomes a page of tens of thousands of pixels sliced into the view: the
   * "board cut ho gaya, pura board dikhta hi nahin" report. Callers that can
   * live with a partial view (the 2D face) refuse such a face instead.
   *
   * The numbers are written into one shared record, because this runs in the
   * render path and must not allocate.
   */
  const faceRect = { ok: true, minX: 0, minY: 0, w: 0, h: 0 };
  const projectFace = (screen: BoardScreen, camera: THREE.PerspectiveCamera) => {
    const p = screen.placement;
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const hw = (LECTERN_BOARD_WIDTH * faceScale) / 2;
    const hh = (LECTERN_BOARD_HEIGHT * faceScale) / 2;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let ok = true;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        pinCorner.set(p.position.x + sx * hw * c, p.position.y + sy * hh, p.position.z - sx * hw * s).project(camera);
        if (pinCorner.z < -1.05 || pinCorner.z > 1.05) ok = false;
        const x = (pinCorner.x * 0.5 + 0.5) * viewW;
        const y = (-pinCorner.y * 0.5 + 0.5) * viewH;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    faceRect.ok = ok;
    faceRect.minX = minX;
    faceRect.minY = minY;
    faceRect.w = maxX - minX;
    faceRect.h = maxY - minY;
    return faceRect;
  };

  /**
   * Write the framed board's face as a 2D screen-pixel rectangle.
   *
   * This is what makes a full-screen board's buttons hit-test natively: the
   * layer is a direct child of the untransformed `domElement`, carrying a
   * plain `translate() scale()`, so the browser's own touch and layout paths
   * see ordinary 2D boxes (a child's `getBoundingClientRect` is the truth,
   * which is what the input bridge's `elementFromPoint` query needs).
   *
   * Returns false when the projection is not a sane on-screen rectangle
   * (mid-flight, edge-on, behind the near plane, a sliver after a resize).
   * A refusal changes NOTHING — the board simply stays a 3D board and the 2D
   * face is retried next frame. The old code removed the board from CSS3D
   * first and hid its page on a refusal, which left a black slab standing in
   * the meadow.
   */
  const pinFace = (screen: BoardScreen, camera: THREE.PerspectiveCamera) => {
    const rect = projectFace(screen, camera);
    // Behind the camera (or a pinched-out sky view) NDC explodes and this
    // 2D face would paint a giant page across the heavens. Refuse it.
    if (!rect.ok) return false;
    const { minX, minY, w, h } = rect;
    if (!(w > 8 && h > 8) || w > viewW * 1.6 || h > viewH * 1.6) return false;
    const css =
      `translate(${Math.round(minX * 100) / 100}px, ${Math.round(minY * 100) / 100}px) ` +
      `scale(${Math.round((w / SCREEN_PX_WIDTH) * 1e5) / 1e5}, ${Math.round((h / SCREEN_PX_HEIGHT) * 1e5) / 1e5})`;
    if (screen.transform !== css) {
      screen.layer.style.transform = css;
      screen.transform = css;
    }
    return true;
  };

  return {
    screens,
    domElement,
    shells,

    byId(slot) {
      return screens.find((s) => s.slot === slot);
    },

    setSize(width, height) {
      viewW = Math.max(1, width);
      viewH = Math.max(1, height);
      domElement.style.width = `${viewW}px`;
      domElement.style.height = `${viewH}px`;
      // NDC → CSS px, y down: x' = (W/2)x + W/2, y' = -(H/2)y + H/2.
      viewportMatrix.fromArray([
        viewW / 2, 0, 0, 0,
        0, -viewH / 2, 0, 0,
        0, 0, 1, 0,
        viewW / 2, viewH / 2, 0, 1,
      ]);
      poseDirty = true;
    },

    setWinter(enabled) {
      for (const screen of screens) {
        if (enabled) screen.element.dataset.iceAge = "true";
        else delete screen.element.dataset.iceAge;
      }
    },

    setReadSlot(slot) {
      if (readSlot === slot) return;

      // Nothing is re-parented and no transform is cleared: a framed board is
      // a STYLE on a layer that never moved, so switching boards cannot
      // disturb the page living on either of them (the 2026-09-25 reset
      // report). All this does is forget the cached camera so the next frame
      // re-decides every face from scratch.
      readSlot = slot;
      lastCamPos.set(1e9, 1e9, 1e9);
      poseDirty = true;
    },

    setScale(scale) {
      const s = scale > 0 ? scale : 1;
      if (s === faceScale) return;
      faceScale = s;
      const placements = lecternPlacementsAt(s);
      screens.forEach((screen, i) => {
        const p = placements[i];
        if (!p) return;
        screen.placement = p;
        screen.object.position.copy(p.position);
        screen.object.rotation.y = p.yaw;
        screen.object.scale.setScalar(PX_TO_M * s);
        screen.object.updateMatrixWorld(true);
      });
      shells.children.forEach((board, i) => {
        const p = placements[i];
        if (!p) return;
        board.position.copy(p.position);
        board.rotation.y = p.yaw;
        board.scale.setScalar(s);
      });
      sphere.radius = LECTERN_BOARD_WIDTH * s * 0.62;
      poseDirty = true;
    },

    setFog(near, far, color) {
      fogNear = Math.max(0.5, near);
      fogFar = Math.max(fogNear + 1, far);
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      fogColorCss = `rgb(${r}, ${g}, ${b})`;
      for (const screen of screens) {
        screen.veil.style.background = fogColorCss;
      }
      poseDirty = true;
    },

    render(camera, force = false) {
      // Rule 1: an idle camera costs nothing. The transforms are already
      // correct, so re-writing identical style strings would only burn style
      // recalcs — the single most expensive thing this layer can do.
      const moved =
        force ||
        poseDirty ||
        lastCamPos.distanceToSquared(camera.position) > 1e-8 ||
        Math.abs(lastCamQuat.dot(camera.quaternion)) < 0.9999999;
      if (!moved) return;
      poseDirty = false;

      const now = performance.now();
      const dt = lastFrameMs > 0 ? Math.min(0.25, (now - lastFrameMs) / 1000) : 0;
      lastFrameMs = now;

      // Rules 2 and 3: cull per board, and cull by REMOVING it from layout.
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);

      // Depth order for the three layers. CSS3D used to get this for free from
      // `preserve-3d`; plain layers stack in DOM order, so the nearer board is
      // lifted above the farther one by hand (three boards, one sort).
      const painted: { screen: BoardScreen; dist: number }[] = [];

      for (const screen of screens) {
        // The framed board is the one being read: it is never culled, exactly
        // as the old lifted face was exempt. Its pose is written below.
        const framed = screen.slot === readSlot;
        sphere.center.copy(screen.placement.position);
        // Is the board in the frustum at all? This one drives the WebGL SHELL
        // — frame, backing plate and the legs. The shell is a PHYSICAL object,
        // so it stays visible from every side: walk round the lectern and you
        // are looking at the back of three boards. Hiding the shell with the
        // screen (the two used to share one flag) took the whole board out of
        // the world the moment the camera crossed its face — the owner's
        // "board cut ho gaya, pura board dikhta hi nahin piche se".
        const inView = frustum.intersectsSphere(sphere);
        let visible = framed || inView;

        if (!framed && visible) {
          // Back-face cull of the SCREEN. A board's face normal is +Z rotated
          // by its yaw; if the camera is behind that plane the learner is
          // looking at the back of the board and the DOM is pure cost.
          boardNormal.set(Math.sin(screen.placement.yaw), 0, Math.cos(screen.placement.yaw));
          toCamera.copy(camera.position).sub(screen.placement.position);
          visible = boardNormal.dot(toCamera) > 0;
        }
        if (!framed && visible) {
          // The WHOLE face has to project inside the near/far range, not just
          // the board's centre. A camera standing in the board's own plane
          // leaves corners behind the eye, where one CSS3D matrix turns into a
          // page of tens of thousands of pixels sliced across the view — the
          // "board cut ho gaya / 60 m board" the owner kept meeting. A board
          // the eye has walked into shows its shell instead.
          visible = projectFace(screen, camera).ok;
        }
        if (!framed && visible) {
          // The screen is painted by the browser, over the canvas, with no
          // depth buffer between them — so a hill, the villa or a beach house
          // cannot hide a board on their own. Test sightlines across the
          // board's face against them (see the header: trees deliberately do
          // NOT count, and partial occlusion is hysteretic).
          const occ = boardOcclusion(camera.position, screen, faceScale);
          if (occ.centre) {
            screen.hidden = true;
            screen.occludedFor = OCCLUDE_ENTER_S;
            screen.clearFor = 0;
          } else if (occ.ratio >= OCCLUDE_ENTER) {
            screen.occludedFor += dt;
            screen.clearFor = 0;
            if (screen.occludedFor >= OCCLUDE_ENTER_S) screen.hidden = true;
          } else if (occ.ratio <= OCCLUDE_EXIT) {
            screen.clearFor += dt;
            screen.occludedFor = 0;
            if (screen.clearFor >= OCCLUDE_EXIT_S) screen.hidden = false;
          }
          visible = !screen.hidden;
        }
        if (framed) {
          screen.hidden = false;
          screen.occludedFor = 0;
          screen.clearFor = 0;
        }

        // One write per board per state change — `display:none` (not
        // `visibility:hidden`) is what actually stops an off-screen YouTube
        // iframe from decoding video and the mind-map canvas from
        // compositing. It goes on the LAYER, which takes the whole panel
        // subtree out of layout with it.
        if (screen.shown !== visible) {
          screen.layer.style.display = visible ? "" : "none";
          screen.shown = visible;
        }
        screen.touchable = visible;

        if (visible) {
          if (framed) {
            // Fit-screen clicks need a 2D face. A refusal leaves the board a
            // live 3D board — always better than a page hidden behind a black
            // slab — and is retried next frame.
            if (!pinFace(screen, camera)) writePose(screen, camera);
          } else {
            writePose(screen, camera);
          }
          painted.push({ screen, dist: camera.position.distanceToSquared(screen.placement.position) });
        }

        // The shell follows the frustum alone: a physical board is not hidden
        // by facing away, by a hill, or by being the one on screen.
        const shell = shells.children[screens.indexOf(screen)];
        if (shell) shell.visible = inView;
      }

      // Nearer layer on top. Written only when the order actually changes.
      if (painted.length > 1) {
        painted.sort((a, b) => b.dist - a.dist);
        for (let i = 0; i < painted.length; i += 1) {
          const z = String(painted.length - i);
          if (painted[i].screen.layer.style.zIndex !== z) painted[i].screen.layer.style.zIndex = z;
        }
      }

      // Distance smoke on every live face (WebGL shells get scene.fog for
      // free; DOM faces need this overlay). Same smoothstep as THREE.Fog.
      const span = Math.max(1e-3, fogFar - fogNear);
      for (const screen of screens) {
        if (!screen.shown) continue;
        // A framed full-bleed board stays fully readable — no fog veil.
        if (screen.slot === readSlot) {
          if (screen.veil.style.opacity !== "0") screen.veil.style.opacity = "0";
          continue;
        }
        const dist = camera.position.distanceTo(screen.placement.position);
        let t = (dist - fogNear) / span;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        // smoothstep
        t = t * t * (3 - 2 * t);
        // Cap so a far board never fully disappears into a grey slab.
        t = Math.min(0.82, t);
        const v = String(Math.round(t * 100) / 100);
        if (screen.veil.style.opacity !== v) screen.veil.style.opacity = v;
      }

      lastCamPos.copy(camera.position);
      lastCamQuat.copy(camera.quaternion);
    },

    dispose() {
      for (const screen of screens) {
        // The layer, the panel surface and the veil are one subtree and are
        // removed together — nothing is ever left behind, pinned or not.
        screen.layer.remove();
      }
      domElement.remove();
      shells.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    },
  };
}
