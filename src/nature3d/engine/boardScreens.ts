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
// So the screens are CSS3D. `CSS3DRenderer` applies the camera's projection to
// a plain DOM element as a CSS `matrix3d`, which means the browser rasterises
// the page itself, at device resolution, AFTER the transform. Text stays
// vector-sharp whether the board fills the screen or sits 300 m away, video
// decodes on the compositor, and every DOM behaviour works because it IS the
// DOM. This is the only approach that satisfies "chahe jitna bada ya chhota
// board ho, sab kuchh clearly aur smooth dikhna chahiye".
//
// ── How the two renderers are kept in lockstep ─────────────────────────
//
// The CSS3D layer sits on top of the WebGL canvas and shares its camera. Both
// are driven from the same `PerspectiveCamera` every frame, so the DOM boards
// track the 3D world exactly. In the WebGL scene each board also gets a frame
// + backing panel (see `createBoardShells`) so the board has physical presence
// — thickness, an edge, a shadow — with a hole where the DOM shows through.
//
// ── WHY A BOARD IS TWO ELEMENTS, NOT ONE ───────────────────────────────
//
// `CSS3DRenderer` writes each object's `transform` itself and CACHES the
// string it wrote per object: if the string it would write is the one it
// wrote last time, it skips the write entirely (three's `cache.objects`).
//
// The pin below has to take a board's surface out of the renderer's hands for
// a moment — it lifts it onto the untransformed layer and scales it in screen
// pixels so its buttons hit-test natively — and an element that was handed
// back with the pin's styles still on it, or with its transform cleared, was
// therefore NOT corrected by the next render: the cache hit, the write was
// skipped, and a 1920×1080 element with no matrix at all was left inside the
// 3D layer. That is a page the size of the world hanging where no board ever
// stands — the "board switch karne ke baad ek bada board centre me" report —
// and the same mechanism shows a board's own dark page instead of the board.
//
// So the renderer owns `host`, and the ENGINE owns `element`, one level
// inside it. The pin only ever moves and styles `element`; `host` is written
// exclusively by the renderer (plus the `display` toggles the renderer itself
// uses for culled objects). Handing a board back is then a plain DOM move
// inside `host`, and the 3D pose it returns to has been correct the whole
// time — there is no cached string to fight.
//
// ── The performance rules that keep it free ────────────────────────────
//
// BGMI's renderer earns its frame budget by never doing work it can avoid, and
// the same three ideas apply here:
//
//   1. STATE CHANGES ARE THE COST, NOT PIXELS. `CSS3DRenderer` writes a style
//      string per object per frame. Three objects is nothing, but the layer is
//      skipped wholesale when the camera has not moved (see `render`), so an
//      idle scene costs zero style recalcs.
//   2. DON'T RENDER WHAT YOU CANNOT SEE. Each board is frustum-culled against
//      the camera by hand and, crucially, back-face culled: a board behind the
//      viewer has its host element set to `display:none`, which takes its
//      entire subtree — iframes, video, the mind-map canvas — out of the
//      browser's layout, paint and compositing work. Looking away from a
//      board genuinely stops paying for it.
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

import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { terrainHeight } from "./terrain";
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

/**
 * ── THE SCREEN HAS NO DEPTH BUFFER, THE WORLD DOES ─────────────────────
 *
 * A board's page is painted by the BROWSER, in a DOM layer that sits over the
 * WebGL canvas. Nothing in that layer knows the hill is there, so a board
 * behind a hill used to hang in mid-air on the hillside — walking round the
 * back of the sanctuary made all three boards look like they had been planted
 * on the mountain ("pahad ke piche se bhi dikhte hain").
 *
 * The ground is an analytic height field (`terrain.ts`), and the mesh the
 * learner sees is built from that same function, so the sight line can be
 * tested directly against it: march from the eye towards the board and watch
 * for terrain standing above the line. Only the SCREEN is hidden this way —
 * the WebGL shell (frame, plate, legs) is depth-tested by the GPU and is
 * already occluded correctly.
 *
 * `OCCLUSION_MARGIN` is how far the terrain must stand above the line before
 * the board is put away: the mesh is a coarse sampling of this same function,
 * and a board flickering on the crest would be worse than the bug. Boards
 * closer than `OCCLUSION_MIN_DISTANCE` skip the test — nothing in the study
 * clearing can hide a board from inside it, and that is the common case.
 */
const OCCLUSION_MARGIN = 1.5;
const OCCLUSION_MIN_DISTANCE = 60;
const OCCLUSION_STEP = 30;

/** Is the terrain standing between the eye and the board? */
function terrainBlocksSight(eye: THREE.Vector3, target: THREE.Vector3): boolean {
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const dz = target.z - eye.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < OCCLUSION_MIN_DISTANCE) return false;
  const steps = Math.min(24, Math.max(6, Math.round(length / OCCLUSION_STEP)));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const y = eye.y + dy * t;
    if (terrainHeight(eye.x + dx * t, eye.z + dz * t) - y > OCCLUSION_MARGIN) return true;
  }
  return false;
}

export interface BoardScreen {
  slot: LecternSlot;
  /**
   * The renderer-owned wrapper. `CSS3DRenderer` writes THIS element's
   * `transform` (and its `display`, for culled objects) and caches that
   * string per object — so nothing in this file may ever write a transform to
   * it, or the cache would skip the correction and leave the board with no
   * matrix at all. See the header.
   */
  host: HTMLDivElement;
  /**
   * The board's panel surface — the element React portals into, the root the
   * input bridge (scene.ts) walks, and the ONLY element the pin touches.
   */
  element: HTMLDivElement;
  object: CSS3DObject;
  placement: LecternPlacement;
}

export interface BoardScreensHandle {
  screens: BoardScreen[];
  /** The scene the CSS3D objects live in (separate from the WebGL scene). */
  cssScene: THREE.Scene;
  /** The DOM layer, to be appended beside the canvas. */
  domElement: HTMLElement;
  /** WebGL-side frames/backings, added to the main scene. */
  shells: THREE.Group;
  byId(slot: LecternSlot): BoardScreen | undefined;
  setSize(width: number, height: number): void;
  /** Pin one board as a 2D face for native clicks; CSS3D resumes when null. */
  setReadSlot(slot: LecternSlot | null): void;
  /** Frost the perimeter without changing content, hit targets or CSS3D poses. */
  setWinter(enabled: boolean): void;
  /** Relayout the trio at `scale` × the pinned 30 m face. */
  setScale(scale: number): void;
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
  const frame = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.55, metalness: 0.35 });
  const backing = new THREE.MeshBasicMaterial({ color: 0x05070c });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x141b26, roughness: 0.6, metalness: 0.4 });

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
  const cssScene = new THREE.Scene();

  const renderer = new CSS3DRenderer();
  const domElement = renderer.domElement;
  domElement.style.position = "absolute";
  domElement.style.inset = "0";
  // The layer itself must never eat pointer events — only the boards do, and
  // they re-enable it on their own elements. Without this the whole canvas
  // would stop receiving the orbit/look drags.
  domElement.style.pointerEvents = "none";
  domElement.style.overflow = "hidden";

  const screens: BoardScreen[] = placements.map((placement) => {
    // The renderer-owned host. Every style on it belongs to CSS3DRenderer —
    // with ONE exception the engine is allowed: `display`, which is exactly
    // the property the renderer itself uses to stop a culled board's iframes
    // and canvases from doing any work.
    const host = document.createElement("div");
    host.className = "nature3d-board-screen nature3d-board-host";
    host.style.width = `${SCREEN_PX_WIDTH}px`;
    host.style.height = `${SCREEN_PX_HEIGHT}px`;
    host.style.overflow = "hidden";
    host.style.background = "#070b12";
    host.style.borderRadius = "6px";

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
    // Positioned against the host's own origin, which is the board's centre —
    // so this is where the face sits while the board is a 3D board, and the
    // pin (see `pinFace`) is a pure override of left/top/transform.
    element.style.position = "absolute";
    element.style.left = "0px";
    element.style.top = "0px";
    host.appendChild(element);

    // The engine's orbit/look handlers live on the shared host element, and
    // the board is a CHILD of it, so without this every click inside a panel
    // would also spin the camera and every text selection would drag the
    // world. Stopping propagation at the board's own root lets the panel
    // behave like an ordinary web page while the meadow around it still
    // responds to drags.
    for (const type of ["pointerdown", "pointermove", "pointerup", "wheel"]) {
      element.addEventListener(type, (event) => {
        // A hit on the BOARD ROOT (not a nested control) means CSS3D
        // hit-testing missed the button the learner actually tapped —
        // the classic "centre of the editor is dead" failure. Let it
        // bubble so the engine's geometric bridge can re-aim it.
        if (event.target === element) return;
        event.stopPropagation();
      });
    }
    // A cancelled touch (system gesture, call arriving) must not leak to the
    // camera rig either, or the world would lurch at the moment a touch dies.
    element.addEventListener("pointercancel", (event) => event.stopPropagation());

    const object = new CSS3DObject(host);
    object.position.copy(placement.position);
    object.rotation.y = placement.yaw;
    object.scale.setScalar(PX_TO_M);
    cssScene.add(object);

    return { slot: placement.slot, host, element, object, placement };
  });

  const shells = createBoardShells(placements, shadows);

  // ── Culling scratch (hoisted — the render path allocates nothing) ─────
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), LECTERN_BOARD_WIDTH * 0.62);
  const boardNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const lastCamPos = new THREE.Vector3(1e9, 1e9, 1e9);
  const lastCamQuat = new THREE.Quaternion(2, 2, 2, 2);
  const visibility = new Map<LecternSlot, number>();
  const occluded = new Map<LecternSlot, boolean>();
  const pinCorner = new THREE.Vector3();
  let viewW = 1;
  let viewH = 1;
  let faceScale = 1;
  let readSlot: LecternSlot | null = null;
  let liftedSlot: LecternSlot | null = null;
  let lastCamera: THREE.PerspectiveCamera | null = null;

  /**
   * The face's projected screen rectangle, taken from its four corners.
   *
   * `ok` is false when any corner leaves the near/far range, i.e. when the
   * camera stands in — or has crossed — the board's own plane. There the board
   * is no longer a rectangle in front of the eye at all, and one CSS3D matrix
   * becomes a page of tens of thousands of pixels sliced into the view: the
   * "board cut ho gaya, pura board dikhta hi nahin" report. Callers that can
   * live with a partial view (the pin) refuse such a face instead.
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
   * Hand a board's surface home to its renderer-owned host.
   *
   * This is a plain DOM move plus the removal of the pin's own styles. It
   * deliberately does NOT touch the host's transform: the host has carried the
   * correct 3D matrix since the last time the renderer wrote it, so the board
   * reappears in exactly the right place with no intermediate frame at the
   * wrong size (which is what the old `transform = ""` left behind — see the
   * header for why CSS3D never corrected it).
   */
  const clearPin = (screen: BoardScreen) => {
    const el = screen.element;
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.right = "";
    el.style.bottom = "";
    el.style.width = `${SCREEN_PX_WIDTH}px`;
    el.style.height = `${SCREEN_PX_HEIGHT}px`;
    el.style.transform = "";
    el.style.transformOrigin = "";
    el.style.position = "absolute";
    el.style.zIndex = "";
    if (el.parentElement !== screen.host) screen.host.appendChild(el);
  };

  /**
   * Lift the face onto the untransformed layer and size it in screen pixels,
   * so its panels hit-test natively (this is the click guarantee).
   *
   * Returns false when the projection is not a sane on-screen rectangle
   * (mid-flight, edge-on, behind the near plane, a sliver after a resize).
   * A refusal changes NOTHING — the board simply stays a 3D board and the pin
   * is retried next frame. The old code removed the board from CSS3D first and
   * hid its page on a refusal, which left a black slab standing in the meadow.
   */
  const pinFace = (screen: BoardScreen, camera: THREE.PerspectiveCamera) => {
    const rect = projectFace(screen, camera);
    // Behind the camera (or a pinched-out sky view) NDC explodes and this
    // 2D face would paint a giant page across the heavens. Refuse it.
    if (!rect.ok) return false;
    const { minX, minY, w, h } = rect;
    if (!(w > 8 && h > 8) || w > viewW * 1.6 || h > viewH * 1.6) return false;
    const el = screen.element;
    // Lift once onto the untransformed layer so left/top are layer pixels.
    // Do not do this every frame — moving an iframe reloads it.
    if (el.parentElement !== domElement) domElement.appendChild(el);
    el.style.position = "absolute";
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${SCREEN_PX_WIDTH}px`;
    el.style.height = `${SCREEN_PX_HEIGHT}px`;
    el.style.transformOrigin = "0 0";
    el.style.transform = `scale(${w / SCREEN_PX_WIDTH}, ${h / SCREEN_PX_HEIGHT})`;
    el.style.pointerEvents = "auto";
    el.style.zIndex = "2";
    // The board's 3D host is out of the picture for the whole pin: its surface
    // is the 2D face now, and an empty host would only be a black plate
    // standing behind the page.
    screen.host.style.display = "none";
    return true;
  };

  /**
   * Put one board back into CSS3D: host visible, object in the scene and
   * visible, its WebGL shell drawn. Used when a pin is released, and by the
   * refusal path above when a lifted face stops being projectable.
   */
  const releaseBoard = (screen: BoardScreen) => {
    clearPin(screen);
    screen.host.style.display = "";
    if (screen.object.parent !== cssScene) cssScene.add(screen.object);
    screen.object.visible = true;
    const shell = shells.children[screens.indexOf(screen)];
    if (shell) shell.visible = true;
    visibility.delete(screen.slot);
  };

  return {
    screens,
    cssScene,
    domElement,
    shells,

    byId(slot) {
      return screens.find((s) => s.slot === slot);
    },

    setSize(width, height) {
      viewW = width;
      viewH = height;
      renderer.setSize(width, height);
    },

    setWinter(enabled) {
      for (const screen of screens) {
        if (enabled) screen.element.dataset.iceAge = "true";
        else delete screen.element.dataset.iceAge;
      }
    },

    setReadSlot(slot) {
      if (readSlot === slot) return;

      // Every board returns to CSS3D, whole: the framed one through the same
      // release path the refusal below uses (its surface goes home into its
      // host, and the host's matrix — the one the renderer has been keeping
      // all along — is what puts it back in the world), and the other two onto
      // the pose they never left. Nothing here re-writes a transform, so a
      // board can never come back from a pin with a stale or missing one: the
      // "switch ke baad board black / centre me bada board" pair came from
      // exactly that.
      for (const screen of screens) releaseBoard(screen);
      if (lastCamera) renderer.render(cssScene, lastCamera);
      visibility.clear();
      readSlot = slot;
      liftedSlot = null;
      lastCamPos.set(1e9, 1e9, 1e9);
    },

    setScale(scale) {
      const s = scale > 0 ? scale : 1;
      faceScale = s;
      const placements = lecternPlacementsAt(s);
      screens.forEach((screen, i) => {
        const p = placements[i];
        if (!p) return;
        screen.placement = p;
        screen.object.position.copy(p.position);
        screen.object.rotation.y = p.yaw;
        screen.object.scale.setScalar(PX_TO_M * s);
      });
      shells.children.forEach((board, i) => {
        const p = placements[i];
        if (!p) return;
        board.position.copy(p.position);
        board.rotation.y = p.yaw;
        board.scale.setScalar(s);
      });
      sphere.radius = LECTERN_BOARD_WIDTH * s * 0.62;
    },

    render(camera, force = false) {
      // Rule 1: an idle camera costs nothing. The CSS transforms are already
      // correct, so re-writing identical style strings would only burn style
      // recalcs — the single most expensive thing this layer can do.
      const moved =
        force ||
        lastCamPos.distanceToSquared(camera.position) > 1e-8 ||
        Math.abs(lastCamQuat.dot(camera.quaternion)) < 0.9999999;

      // Rules 2 and 3: cull per board, and cull by REMOVING it from layout.
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);

      let changed = false;
      for (const screen of screens) {
        // The framed board is lifted onto the 2D layer for the whole pin: its
        // host is parked `display:none` by the pin itself, and its object is
        // out of the CSS3D scene, so the cull has no business writing to it.
        if (screen.slot === liftedSlot) continue;
        sphere.center.copy(screen.placement.position);
        // Is the board in the frustum at all? This one drives the WebGL SHELL
        // — frame, backing plate and the legs. The shell is a PHYSICAL object,
        // so it stays visible from every side: walk round the lectern and you
        // are looking at the back of three boards. Hiding the shell with the
        // screen (the two used to share one flag) took the whole board out of
        // the world the moment the camera crossed its face — the owner's
        // "board cut ho gaya, pura board dikhta hi nahin piche se".
        const inView = frustum.intersectsSphere(sphere);
        let visible = inView;

        if (visible) {
          // Back-face cull of the SCREEN. A board's face normal is +Z rotated
          // by its yaw; if the camera is behind that plane the learner is
          // looking at the back of the board and the DOM is pure cost.
          boardNormal.set(Math.sin(screen.placement.yaw), 0, Math.cos(screen.placement.yaw));
          toCamera.copy(camera.position).sub(screen.placement.position);
          visible = boardNormal.dot(toCamera) > 0;
        }
        if (visible) {
          // The WHOLE face has to project inside the near/far range, not just
          // the board's centre. A camera standing in the board's own plane
          // leaves corners behind the eye, where one CSS3D matrix turns into a
          // page of tens of thousands of pixels sliced across the view — the
          // "board cut ho gaya / 60 m board" the owner kept meeting. A board
          // the eye has walked into shows its shell instead.
          visible = projectFace(screen, camera).ok;
        }
        if (visible) {
          // The screen is painted by the browser, over the canvas, with no
          // depth buffer between them — so a hill cannot hide a board on its
          // own. Ask the ground itself (same height field the mesh is built
          // from) whether it stands in the way. Sticky while the camera is
          // still, because sampling the terrain is the one costly step here.
          if (moved) occluded.set(screen.slot, terrainBlocksSight(camera.position, screen.placement.position));
          if (occluded.get(screen.slot) === true) visible = false;
        }

        // One number per board — bit 0 the screen, bit 1 the shell — so an
        // idle camera still writes nothing (see the early return below).
        const shown = (visible ? 1 : 0) | (inView ? 2 : 0);
        if (visibility.get(screen.slot) !== shown) {
          visibility.set(screen.slot, shown);
          // `display:none` (not `visibility:hidden`) — this is what actually
          // stops an off-screen YouTube iframe from decoding video and the
          // mind-map canvas from compositing. It goes on the HOST: the host is
          // the element CSS3DRenderer owns, and hiding it takes the whole
          // panel subtree out of layout with it.
          screen.host.style.display = visible ? "" : "none";
          screen.object.visible = visible;
          const shell = shells.children[screens.indexOf(screen)];
          if (shell) shell.visible = inView;
          changed = true;
        }
      }

      // Fit-screen clicks need a 2D face (CSS3D drops the centre). Lift ONLY
      // the framed board's surface out of the CSS3D layer — the board itself,
      // and the two boards beside it, stay exactly where they are.
      //
      // The neighbours used to be put away here ("at this close square-on
      // camera CSS3D-explode into a 60 m page"), which is why framing one
      // board made the whole lectern vanish — the owner's "kisi bhi board par
      // shift hota hun to baaki sab boards hide ho jaate hain". That hiding
      // was a workaround for the projection bug the cull now owns: a page is
      // only ever painted while its whole face is in front of the eye (see
      // `projectFace`), so a neighbour the framed camera cannot describe
      // honestly puts its own screen away and nothing else has to be touched.
      lastCamera = camera;
      if (readSlot) {
        const live = screens.find((s) => s.slot === readSlot);
        if (live) {
          if (pinFace(live, camera)) {
            if (liftedSlot !== live.slot) {
              liftedSlot = live.slot;
              // The surface is on the 2D layer now, so the renderer must stop
              // owning the host it came out of: take the object out of the
              // scene (its `removed` listener detaches the host), leaving the
              // pinned face — and every live iframe inside it — untouched.
              if (live.object.parent === cssScene) cssScene.remove(live.object);
            }
            // The framed board is the one being read: its shell is the frame
            // around the pinned page, so make sure it is drawn.
            const shell = shells.children[screens.indexOf(live)];
            if (shell) shell.visible = true;
          } else if (liftedSlot === live.slot) {
            // A face that was lifted stopped being projectable (a resize to a
            // sliver, the board behind the near plane…). Put the board back
            // whole rather than leaving a half-pinned one: a live 3D board is
            // always better than a page hidden behind a black slab. The pin is
            // retried next frame.
            releaseBoard(live);
            liftedSlot = null;
            // The lifted board's entry was written before the pin took its
            // object out of the scene, so let the next cull re-decide the
            // whole trio from scratch.
            visibility.clear();
          }
          lastCamPos.copy(camera.position);
          lastCamQuat.copy(camera.quaternion);
        }
      }

      if (!moved && !changed) return;

      lastCamPos.copy(camera.position);
      lastCamQuat.copy(camera.quaternion);
      renderer.render(cssScene, camera);
    },

    dispose() {
      for (const screen of screens) {
        cssScene.remove(screen.object);
        // A pinned face lives on the 2D layer, outside its host — remove both
        // so nothing is left behind either way.
        screen.element.remove();
        screen.host.remove();
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
