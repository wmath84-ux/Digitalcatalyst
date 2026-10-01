// Live sanctuary boards: one permanently connected DOM host per surface.
// Camera/fit changes only change a CSS matrix, never move a live iframe.
// WebGL shells still use the world's depth buffer and existing frame budget.

import * as THREE from "three";
import { CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { terrainHeight } from "./terrain";
import { projectBoardMatrix } from "./boardProjection";
import { WAREHOUSE_X, WAREHOUSE_Z } from "./warehouseSite";
import { beachHouseSites } from "./beachHouseSite";
import { treesBlockSight } from "./flora";
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
 * 16:9 letterbox of a study board inside the HUD-free rectangle.
 *
 * Phone landscape used to frame against the SCREEN CENTRE (the nearer chrome
 * half-space). That left a tiny floating page in the middle of a short
 * 390 px-tall view — the 3D shell still filled more of the lectern, so the
 * owner saw "peeche ka board dikhta hai, aage ka floating board shrink/cut
 * ho gaya". Pin and camera now share this same rect so the live page fills
 * the usable stage, edge to edge, at every orientation.
 */
export function studyLetterbox(
  viewW: number,
  viewH: number,
  hud: { top: number; bottom: number; left: number; right: number },
  gutter = 8,
  aspect = SCREEN_PX_WIDTH / SCREEN_PX_HEIGHT,
): { x: number; y: number; w: number; h: number } {
  const padT = Math.max(0, hud.top) + gutter;
  const padB = Math.max(0, hud.bottom) + gutter;
  const padL = Math.max(0, hud.left) + gutter;
  const padR = Math.max(0, hud.right) + gutter;
  const usableW = Math.max(48, viewW - padL - padR);
  const usableH = Math.max(48, viewH - padT - padB);
  let w: number;
  let h: number;
  if (usableW / Math.max(1, usableH) > aspect) {
    h = usableH;
    w = h * aspect;
  } else {
    w = usableW;
    h = w / aspect;
  }
  return {
    x: padL + (usableW - w) / 2,
    y: padT + (usableH - h) / 2,
    w,
    h,
  };
}

/** DOM screens have no shared depth buffer with WebGL. Cull only a fully
 * obstructed face in the open world; a partial leaf/trunk must not blank the
 * whole board. The fitted study surface remains readable regardless of scenery.
 */
const OCCLUSION_MARGIN = 0.15;
const OCCLUSION_MIN_DISTANCE = 2;

/** Is the sightline between eye and target blocked by terrain, grass, villa, beach houses, or trees? */
function terrainBlocksSight(eye: THREE.Vector3, target: THREE.Vector3): boolean {
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const dz = target.z - eye.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < OCCLUSION_MIN_DISTANCE) return false;

  // 1. Trees and plants (flora + tropical)
  if (treesBlockSight(eye, target)) return true;

  // 2. Villa obstruction (with sloped gable roof)
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

  // 3. Beach houses obstruction (all 6 houses with gable roof)
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

  // 4. Terrain & Grass raymarch: ~2.5m resolution
  const steps = Math.min(48, Math.max(8, Math.round(length / 2.5)));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const px = eye.x + dx * t;
    const py = eye.y + dy * t;
    const pz = eye.z + dz * t;
    const th = terrainHeight(px, pz);
    // Grass is ~0.45m tall on the ground
    const surfaceH = th + 0.45;
    if (surfaceH - py > OCCLUSION_MARGIN) return true;
  }

  return false;
}

// Hoisted samples: no arrays/vectors allocated while the camera moves.
const OCCLUSION_SAMPLES = [
  [0, 0], [-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9],
  [0, -0.9], [0, 0.9], [-0.9, 0], [0.9, 0],
] as const;
const CORNER_SIGNS = [-1, 1] as const;

/** Only hide a whole DOM face when ALL sampled sightlines are blocked. */
function boardIsOccluded(
  eye: THREE.Vector3, screen: BoardScreen, scale: number, target: THREE.Vector3,
): boolean {
  const p = screen.placement;
  if (eye.distanceToSquared(p.position) < OCCLUSION_MIN_DISTANCE ** 2) return false;
  const cos = Math.cos(p.yaw);
  const sin = Math.sin(p.yaw);
  const halfW = LECTERN_BOARD_WIDTH * scale / 2;
  const halfH = LECTERN_BOARD_HEIGHT * scale / 2;
  for (const [x, y] of OCCLUSION_SAMPLES) {
    target.set(p.position.x + x * halfW * cos, p.position.y + y * halfH, p.position.z - x * halfW * sin);
    if (!terrainBlocksSight(eye, target)) return false;
  }
  return true;
}

export interface BoardScreen {
  slot: LecternSlot;
  /** Stable viewport-layer host. Only this engine owns its CSS transform. */
  host: HTMLDivElement;
  /** React's portal target. It NEVER leaves its host, even in fit-screen. */
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
  /** HUD chrome the pin must letterbox inside (CSS px). */
  setHudInsets(insets: { top: number; bottom: number; left: number; right: number }): void;
  /** Fit one stable host in 2D for native clicks; world projection resumes at null. */
  setReadSlot(slot: LecternSlot | null): void;
  /** Frost the perimeter without changing content, hit targets or CSS3D poses. */
  setWinter(enabled: boolean): void;
  /** Relayout the trio at `scale` × the pinned 30 m face. */
  setScale(scale: number): void;
  /**
   * Distance smoke on the CSS3D board faces.
   * CSS3D sits above the WebGL canvas and does not receive scene.fog, so the
   * engine pushes the same near/far/colour the world uses and each face gets
   * a translucent overlay that matches THREE.Fog's smoothstep ramp.
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
  const cssScene = new THREE.Scene();

  const domElement = document.createElement("div");
  domElement.className = "nature3d-board-layer";
  domElement.style.position = "absolute";
  domElement.style.inset = "0";
  // The layer itself must never eat pointer events — only the boards do, and
  // they re-enable it on their own elements. Without this the whole canvas
  // would stop receiving the orbit/look drags.
  domElement.style.pointerEvents = "none";
  domElement.style.overflow = "hidden";

  const screens: BoardScreen[] = placements.map((placement) => {
    // This host is attached ONCE. No CSS3DRenderer may reparent it, and no
    // camera transition may detach its iframe's browsing context.
    const host = document.createElement("div");
    host.className = "nature3d-board-screen nature3d-board-host";
    host.style.width = `${SCREEN_PX_WIDTH}px`;
    host.style.height = `${SCREEN_PX_HEIGHT}px`;
    host.style.overflow = "hidden";
    host.style.background = "#070b12";
    host.style.borderRadius = "6px";
    host.style.position = "absolute";
    host.style.left = "0px";
    host.style.top = "0px";
    host.style.transformOrigin = "0 0";
    host.style.opacity = "0";
    host.style.pointerEvents = "none";
    host.inert = true;
    host.setAttribute("aria-hidden", "true");
    domElement.appendChild(host);

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
    // The surface fills a host whose matrix is the complete projection.
    element.style.position = "absolute";
    element.style.left = "0px";
    element.style.top = "0px";
    host.appendChild(element);

    // Fog veil — sits above the live DOM face, ignores pointer events so
    // buttons/scroll still work. Opacity is driven each frame from camera
    // distance using the same smoothstep(near, far) as THREE.Fog.
    const fogVeil = document.createElement("div");
    fogVeil.className = "nature3d-board-fog";
    fogVeil.style.position = "absolute";
    fogVeil.style.inset = "0";
    fogVeil.style.pointerEvents = "none";
    fogVeil.style.borderRadius = "6px";
    fogVeil.style.opacity = "0";
    fogVeil.style.background = "rgb(180, 204, 228)";
    fogVeil.style.zIndex = "20";
    host.appendChild(fogVeil);
    (host as HTMLDivElement & { __fogVeil?: HTMLDivElement }).__fogVeil = fogVeil;

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
  const visibility = new Map<LecternSlot, number>();
  const pinCorner = new THREE.Vector3();
  let viewW = 1;
  let viewH = 1;
  let faceScale = 1;
  let readSlot: LecternSlot | null = null;
  let fittedSlot: LecternSlot | null = null;
  let dirty = true;
  const lastProjection = new THREE.Matrix4();
  const screenMatrix = new THREE.Matrix4();
  const occlusionTarget = new THREE.Vector3();
  let hudInsets = { top: 48, bottom: 80, left: 12, right: 12 };

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
    for (const sx of CORNER_SIGNS) {
      for (const sy of CORNER_SIGNS) {
        pinCorner.set(p.position.x + sx * hw * c, p.position.y + sy * hh, p.position.z - sx * hw * s).project(camera);
        if (!Number.isFinite(pinCorner.x + pinCorner.y + pinCorner.z) || pinCorner.z < -1 || pinCorner.z > 1) ok = false;
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

  /** A fit changes styles, never the parent of the face or its live media. */
  const pinFace = (screen: BoardScreen, camera: THREE.PerspectiveCamera): boolean => {
    const compact = viewW < 960 || viewH < 520;
    const rect = projectFace(screen, camera);
    if (!rect.ok) return false;
    const box = compact ? studyLetterbox(viewW, viewH, hudInsets) : null;
    const x = box ? box.x : rect.minX;
    const y = box ? box.y : rect.minY;
    const w = box ? box.w : rect.w;
    const h = box ? box.h : rect.h;
    if (!(w > 8 && h > 8) || w > viewW * 1.6 || h > viewH * 1.6) return false;
    screen.host.style.transform = `translate(${x}px, ${y}px) scale(${w / SCREEN_PX_WIDTH}, ${h / SCREEN_PX_HEIGHT})`;
    screen.host.style.zIndex = "1000001";
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
      domElement.style.width = `${width}px`;
      domElement.style.height = `${height}px`;
      dirty = true;
    },

    setHudInsets(insets) {
      hudInsets = {
        top: Math.max(0, insets.top),
        bottom: Math.max(0, insets.bottom),
        left: Math.max(0, insets.left),
        right: Math.max(0, insets.right),
      };
      dirty = true;
    },

    setWinter(enabled) {
      for (const screen of screens) {
        if (enabled) screen.element.dataset.iceAge = "true";
        else delete screen.element.dataset.iceAge;
      }
    },

    setReadSlot(slot) {
      if (readSlot === slot) return;
      readSlot = slot;
      dirty = true;
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
      dirty = true;
    },

    setFog(near, far, color) {
      const nextNear = Math.max(0.5, near);
      const nextFar = Math.max(nextNear + 1, far);
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      const css = `rgb(${r}, ${g}, ${b})`;
      if (nextNear === fogNear && nextFar === fogFar && css === fogColorCss) return;
      fogNear = nextNear;
      fogFar = nextFar;
      fogColorCss = css;
      dirty = true;
      for (const screen of screens) {
        const veil = (screen.host as HTMLDivElement & { __fogVeil?: HTMLDivElement }).__fogVeil;
        if (veil) veil.style.background = fogColorCss;
      }
    },

    render(camera, force = false) {
      // Includes projection/view-offset and board-size changes, not just the
      // eye's pose. An idle world does ZERO DOM writes or occlusion tests.
      const moved = force || dirty ||
        lastCamPos.distanceToSquared(camera.position) > 1e-8 ||
        Math.abs(lastCamQuat.dot(camera.quaternion)) < 0.9999999 ||
        !lastProjection.equals(camera.projectionMatrix);
      if (!moved) return;
      dirty = false;
      camera.updateMatrixWorld();
      cssScene.updateMatrixWorld();
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);
      fittedSlot = null;

      for (let i = 0; i < screens.length; i += 1) {
        const screen = screens[i];
        sphere.center.copy(screen.placement.position);
        const inView = frustum.intersectsSphere(sphere);
        boardNormal.set(Math.sin(screen.placement.yaw), 0, Math.cos(screen.placement.yaw));
        toCamera.copy(camera.position).sub(screen.placement.position);
        let visible = inView && boardNormal.dot(toCamera) > 0 && projectFace(screen, camera).ok;
        const fitted = screen.slot === readSlot && pinFace(screen, camera);
        if (fitted) {
          visible = true;
          fittedSlot = screen.slot;
        } else if (visible) {
          // A focused study board is readable through scenery. In the open
          // world only a fully obstructed face is hidden, never one leaf.
          if (screen.slot !== readSlot && boardIsOccluded(camera.position, screen, faceScale, occlusionTarget)) {
            visible = false;
          }
        }

        if (visible && !fitted) {
          projectBoardMatrix(screen.object, camera, viewW, viewH, SCREEN_PX_WIDTH, SCREEN_PX_HEIGHT, screenMatrix);
          screen.host.style.transform = `matrix3d(${screenMatrix.elements.join(",")})`;
          screen.host.style.zIndex = String(Math.max(0, 1000000 - Math.round(toCamera.length() * 10)));
        }
        const shown = (visible ? 1 : 0) | ((inView || fitted) ? 2 : 0);
        if (visibility.get(screen.slot) !== shown) {
          visibility.set(screen.slot, shown);
          // Never display:none/detach the reading iframe: camera angle is NOT
          // a playback command. Opacity zero suppresses paint while keeping
          // its browsing context and user-started media alive. Non-media
          // surfaces can also skip paint via visibility, without a remount.
          screen.host.style.opacity = visible ? "1" : "0";
          screen.host.style.visibility = visible || screen.slot === "reading" ? "visible" : "hidden";
          screen.host.style.pointerEvents = visible ? "auto" : "none";
          screen.element.style.pointerEvents = visible ? "auto" : "none";
          screen.host.inert = !visible;
          screen.host.setAttribute("aria-hidden", String(!visible));
          screen.object.visible = visible;
          const shell = shells.children[i];
          if (shell) shell.visible = inView || fitted;
        }
      }

      const span = Math.max(1e-3, fogFar - fogNear);
      for (const screen of screens) {
        const veil = (screen.host as HTMLDivElement & { __fogVeil?: HTMLDivElement }).__fogVeil;
        if (!veil) continue;
        let t = screen.slot === fittedSlot ? 0 :
          Math.max(0, Math.min(1, (camera.position.distanceTo(screen.placement.position) - fogNear) / span));
        t = Math.min(0.82, t * t * (3 - 2 * t));
        const opacity = String(t);
        if (veil.style.opacity !== opacity) veil.style.opacity = opacity;
      }
      lastCamPos.copy(camera.position);
      lastCamQuat.copy(camera.quaternion);
      lastProjection.copy(camera.projectionMatrix);
    },

    dispose() {
      for (const screen of screens) {
        cssScene.remove(screen.object);
        // Detach live content ONLY when leaving the sanctuary.
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
