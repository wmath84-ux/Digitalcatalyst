// Live Sanctuary boards: stable DOM + a depth-tested WebGL aperture.
// Camera changes are presentation changes, never media lifecycle changes.
// Each host and its React portal remain connected until Sanctuary is disposed.
// The canvas above these faces supplies per-pixel occlusion (including leaves
// and building openings), instead of hiding an entire board after one ray hit.
import * as THREE from "three";
import { CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";
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
  /** Stable projection wrapper; only its styles change during navigation. */
  host: HTMLDivElement;
  /**
   * The board's panel surface — the element React portals into, the root the
   * input bridge (scene.ts) walks. It never leaves its host.
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
  /** Frame one board as a 2D face without moving its DOM subtree. */
  setReadSlot(slot: LecternSlot | null): void;
  /** Frost the perimeter without changing content, hit targets or CSS3D poses. */
  setWinter(enabled: boolean): void;
  /** Relayout the trio at `scale` × the pinned 30 m face. */
  setScale(scale: number): void;
  /**
   * Distance smoke on the CSS3D board faces.
   * DOM sits below the WebGL canvas and does not receive scene.fog, so the
   * engine pushes the same near/far/colour the world uses and each face gets
   * a translucent overlay that matches THREE.Fog's smoothstep ramp.
   */
  setFog(near: number, far: number, color: THREE.Color): void;
  render(camera: THREE.PerspectiveCamera, force?: boolean): void;
  dispose(): void;
}

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

    // Physical backing, visible when the live face is culled or viewed from behind.
    const back = new THREE.Mesh(backGeo, backing);
    back.position.z = -0.01;
    board.add(back);

    // Write transparent colour AND depth at the live face. The canvas sits
    // ABOVE the DOM: geometry in front draws normally, geometry behind fails
    // the depth test. No centre-ray/all-or-nothing occlusion heuristics.
    const aperture = new THREE.Mesh(backGeo, new THREE.ShaderMaterial({
      // MeshBasicMaterial in the opaque pass forces alpha to 1. A minimal
      // shader writes zero alpha while staying in that pass, before glass.
      vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "void main() { gl_FragColor = vec4(0.0); }",
      blending: THREE.NoBlending,
      depthTest: true, depthWrite: true, fog: false, toneMapped: false,
    }));
    aperture.name = "board-aperture";
    aperture.visible = false;
    board.add(aperture);

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
  domElement.style.position = "absolute";
  domElement.style.zIndex = "0";
  domElement.style.inset = "0";
  // The layer itself must never eat pointer events — only the boards do, and
  // they re-enable it on their own elements. Without this the whole canvas
  // would stop receiving the orbit/look drags.
  domElement.style.pointerEvents = "none";
  domElement.style.overflow = "hidden";

  const screens: BoardScreen[] = placements.map((placement) => {
    // This wrapper stays connected in both world and framed views.
    const host = document.createElement("div");
    host.className = "nature3d-board-screen nature3d-board-host";
    host.style.position = "absolute";
    host.style.left = "0";
    host.style.top = "0";
    host.style.transformOrigin = "0 0";
    host.style.visibility = "hidden";
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
    // Panel coordinates remain unchanged when the host projection changes.
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
    fogVeil.style.transition = "opacity 80ms linear";
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
    // Mount once, before React portals add any iframe. Never reparent on a
    // camera/view change: appendChild reloads iframe browsing contexts.
    domElement.appendChild(host);

    return { slot: placement.slot, host, element, object, placement };
  });

  const shells = createBoardShells(placements, shadows);

  // Distance smoke parameters — mirrored from scene.fog each daylight tick.
  let fogNear = 16;
  let fogFar = 420;
  let fogColorCss = "rgb(180, 204, 228)";

  let viewW = 1;
  let viewH = 1;
  let faceScale = 1;
  let readSlot: LecternSlot | null = null;
  let dirty = true;
  const lastView = new THREE.Matrix4();
  const lastProjection = new THREE.Matrix4();
  const vp = new THREE.Matrix4();
  const pixelToLocal = new THREE.Matrix4();
  const viewport = new THREE.Matrix4();
  const projected = new THREE.Matrix4();
  const corner = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const depthOrder = screens.slice();
  const frustum = new THREE.Frustum();
  const sphere = new THREE.Sphere();

  return {
    screens, cssScene, domElement, shells,
    byId(slot) { return screens.find((screen) => screen.slot === slot); },
    setSize(width, height) {
      viewW = Math.max(1, width);
      viewH = Math.max(1, height);
      dirty = true;
    },
    setWinter(enabled) {
      for (const screen of screens) {
        if (enabled) screen.element.dataset.iceAge = "true";
        else delete screen.element.dataset.iceAge;
      }
    },
    setReadSlot(slot) { readSlot = slot; dirty = true; },
    setScale(scale) {
      faceScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      const placements = lecternPlacementsAt(faceScale);
      screens.forEach((screen, i) => {
        const p = placements[i];
        screen.placement = p;
        screen.object.position.copy(p.position);
        screen.object.rotation.y = p.yaw;
        screen.object.scale.setScalar(PX_TO_M * faceScale);
        const shell = shells.children[i];
        shell.position.copy(p.position);
        shell.rotation.y = p.yaw;
        shell.scale.setScalar(faceScale);
      });
      dirty = true;
    },
    setFog(near, far, color) {
      fogNear = Math.max(0.5, near);
      fogFar = Math.max(fogNear + 1, far);
      fogColorCss = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
      for (const screen of screens) {
        const veil = screen.host.querySelector<HTMLElement>(".nature3d-board-fog");
        if (veil) veil.style.background = fogColorCss;
      }
      dirty = true;
    },
    render(camera, force = false) {
      camera.updateMatrixWorld();
      if (!force && !dirty && lastView.equals(camera.matrixWorldInverse) &&
          lastProjection.equals(camera.projectionMatrix)) return;
      dirty = false;
      lastView.copy(camera.matrixWorldInverse);
      lastProjection.copy(camera.projectionMatrix);
      cssScene.updateMatrixWorld(true);
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(vp);
      // Flat DOM siblings need the same far-to-near ordering as the world
      // when projected boards overlap. Changing z-index never moves a node.
      const eye = camera.matrixWorldInverse.elements;
      const eyeZ = (s: BoardScreen) => eye[2] * s.placement.position.x +
        eye[6] * s.placement.position.y + eye[10] * s.placement.position.z;
      depthOrder.sort((a, b) => eyeZ(a) - eyeZ(b));
      depthOrder.forEach((screen, rank) => { screen.host.style.zIndex = String(rank); });
      // DOM pixels use +Y down; the board's local coordinates use +Y up.
      pixelToLocal.set(1, 0, 0, -SCREEN_PX_WIDTH / 2,
        0, -1, 0, SCREEN_PX_HEIGHT / 2, 0, 0, 1, 0, 0, 0, 0, 1);
      // Homogeneous clip -> screen pixels, retaining W for perspective.
      // Keep Z invertible: CSS refuses to paint singular transforms. The
      // tiny NDC Z does not affect X/Y on this flat DOM layer.
      viewport.set(viewW / 2, 0, 0, viewW / 2,
        0, -viewH / 2, 0, viewH / 2, 0, 0, 1, 0, 0, 0, 0, 1);
      screens.forEach((screen, i) => {
        const p = screen.placement;
        sphere.center.copy(p.position);
        sphere.radius = Math.hypot(LECTERN_BOARD_WIDTH, LECTERN_BOARD_HEIGHT) * faceScale / 2;
        const inView = frustum.intersectsSphere(sphere);
        normal.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
        toCamera.copy(camera.position).sub(p.position);
        let visible = inView && normal.dot(toCamera) > 0;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const x of [-SCREEN_PX_WIDTH / 2, SCREEN_PX_WIDTH / 2]) {
          for (const y of [-SCREEN_PX_HEIGHT / 2, SCREEN_PX_HEIGHT / 2]) {
            corner.set(x, y, 0).applyMatrix4(screen.object.matrixWorld)
              .applyMatrix4(camera.matrixWorldInverse);
            // Avoid exploded CSS projections as the eye crosses a face.
            if (-corner.z < camera.near || -corner.z > camera.far) visible = false;
            corner.applyMatrix4(camera.projectionMatrix);
            const sx = (corner.x + 1) * viewW / 2;
            const sy = (1 - corner.y) * viewH / 2;
            minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
            minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
          }
        }
        const w = maxX - minX, h = maxY - minY;
        // Pin only at the settled, square-on camera. It is a style override
        // on the SAME host, not a DOM move, and the next world matrix always
        // replaces it (no CSS3DRenderer transform cache to fight).
        const squareOn = Math.abs(normal.dot(camera.getWorldDirection(corner))) > 0.999999;
        const pinned = visible && screen.slot === readSlot && squareOn &&
          w > 8 && h > 8 && w <= viewW * 1.6 && h <= viewH * 1.6;
        if (pinned) {
          screen.host.style.transform = `translate(${minX}px, ${minY}px) scale(${w / SCREEN_PX_WIDTH}, ${h / SCREEN_PX_HEIGHT})`;
        } else if (visible) {
          projected.copy(viewport).multiply(vp).multiply(screen.object.matrixWorld).multiply(pixelToLocal);
          screen.host.style.transform = `matrix3d(${projected.elements.join(",")})`;
        }
        // Hide paint/hit-testing, never detach or change iframe src. Playback
        // remains owned by the player, even when looking away or at the desk.
        screen.host.style.visibility = visible ? "visible" : "hidden";
        screen.object.visible = visible;
        const shell = shells.children[i];
        shell.visible = inView;
        shell.getObjectByName("board-aperture")!.visible = visible;
        const veil = screen.host.querySelector<HTMLElement>(".nature3d-board-fog");
        let t = Math.max(0, Math.min(1,
          (camera.position.distanceTo(p.position) - fogNear) / (fogFar - fogNear)));
        t = Math.min(0.82, t * t * (3 - 2 * t));
        if (veil) veil.style.opacity = pinned ? "0" : String(t);
      });
    },
    dispose() {
      for (const screen of screens) {
        cssScene.remove(screen.object);
        screen.host.remove();
      }
      domElement.remove();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      shells.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        geometries.add(mesh.geometry);
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(mat);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
