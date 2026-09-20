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

export interface BoardScreen {
  slot: LecternSlot;
  /** The div React portals its panel into. */
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

    const object = new CSS3DObject(element);
    object.position.copy(placement.position);
    object.rotation.y = placement.yaw;
    object.scale.setScalar(PX_TO_M);
    cssScene.add(object);

    return { slot: placement.slot, element, object, placement };
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
  const visibility = new Map<LecternSlot, boolean>();
  const pinCorner = new THREE.Vector3();
  let viewW = 1;
  let viewH = 1;
  let faceScale = 1;
  let readSlot: LecternSlot | null = null;
  let pinnedSlot: LecternSlot | null = null;
  let liftedSlot: LecternSlot | null = null;

  const clearPin = (screen: BoardScreen) => {
    const el = screen.element;
    el.style.left = "";
    el.style.top = "";
    el.style.right = "";
    el.style.bottom = "";
    el.style.width = `${SCREEN_PX_WIDTH}px`;
    el.style.height = `${SCREEN_PX_HEIGHT}px`;
    el.style.transform = "";
    el.style.transformOrigin = "";
    el.style.position = "absolute";
    el.style.zIndex = "";
  };

  const pinFace = (screen: BoardScreen, camera: THREE.PerspectiveCamera) => {
    const p = screen.placement;
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const hw = (LECTERN_BOARD_WIDTH * faceScale) / 2;
    const hh = (LECTERN_BOARD_HEIGHT * faceScale) / 2;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        pinCorner.set(p.position.x + sx * hw * c, p.position.y + sy * hh, p.position.z - sx * hw * s).project(camera);
        if (pinCorner.z < -1.05 || pinCorner.z > 1.05) return false;
        const x = (pinCorner.x * 0.5 + 0.5) * viewW;
        const y = (-pinCorner.y * 0.5 + 0.5) * viewH;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    const w = maxX - minX;
    const h = maxY - minY;
    // Behind the camera (or a pinched-out sky view) NDC explodes and this
    // 2D face would paint a giant page across the heavens. Refuse it.
    if (!(w > 8 && h > 8) || w > viewW * 1.6 || h > viewH * 1.6) return false;
    const el = screen.element;
    // Lift once onto the untransformed layer so left/top are layer pixels.
    // Do not do this every frame — moving an iframe reloads it.
    if (el.parentElement !== domElement) domElement.appendChild(el);
    el.style.position = "absolute";
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.transformOrigin = "0 0";
    el.style.transform = `scale(${w / SCREEN_PX_WIDTH}, ${h / SCREEN_PX_HEIGHT})`;
    el.style.pointerEvents = "auto";
    el.style.zIndex = "2";
    pinnedSlot = screen.slot;
    return true;
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

    setReadSlot(slot) {
      if (readSlot === slot) return;
      if (liftedSlot) {
        const prev = screens.find((s) => s.slot === liftedSlot);
        if (prev) {
          clearPin(prev);
          if (prev.object.parent !== cssScene) cssScene.add(prev.object);
          prev.object.visible = true;
          prev.element.style.display = "";
        }
        liftedSlot = null;
        pinnedSlot = null;
      }
      readSlot = slot;
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
        sphere.center.copy(screen.placement.position);
        let visible = frustum.intersectsSphere(sphere);

        if (visible) {
          // Back-face cull. A board's face normal is +Z rotated by its yaw;
          // if the camera is behind that plane the learner is looking at the
          // back of the board and the DOM is pure cost.
          boardNormal.set(Math.sin(screen.placement.yaw), 0, Math.cos(screen.placement.yaw));
          toCamera.copy(camera.position).sub(screen.placement.position);
          visible = boardNormal.dot(toCamera) > 0;
        }
        if (visible) {
          // A board whose centre projects behind the camera (or far outside
          // NDC) is the CSS3D "giant page in the sky" — hide it.
          pinCorner.copy(screen.placement.position).project(camera);
          if (pinCorner.z < -1 || pinCorner.z > 1 || Math.abs(pinCorner.x) > 2 || Math.abs(pinCorner.y) > 2) {
            visible = false;
          }
        }

        if (visibility.get(screen.slot) !== visible) {
          visibility.set(screen.slot, visible);
          // `display:none` (not `visibility:hidden`) — this is what actually
          // stops an off-screen YouTube iframe from decoding video and the
          // mind-map canvas from compositing.
          screen.element.style.display = visible ? "" : "none";
          screen.object.visible = visible;
          changed = true;
        }
      }

      // Fit-screen clicks need a 2D face (CSS3D drops the centre). Lift ONLY
      // the framed board out of the CSS3D scene so the other two keep their
      // live pages — hiding them is what painted the neighbour boards black.
      if (readSlot) {
        const live = screens.find((s) => s.slot === readSlot);
        if (live && (moved || pinnedSlot !== readSlot)) {
          if (live.object.parent === cssScene) cssScene.remove(live.object);
          liftedSlot = live.slot;
          live.element.style.display = "";
          if (!pinFace(live, camera)) {
            // Do not hand it back to CSS3D — that is the sky billboard.
            clearPin(live);
            live.element.style.display = "none";
            pinnedSlot = null;
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
        screen.element.remove();
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
