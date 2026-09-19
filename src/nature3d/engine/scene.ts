// src/nature3d/engine/scene.ts
//
// THE SANCTUARY RUNTIME.
//
// One class owns the renderer, the scene graph, the camera rigs and the frame
// loop. React never touches Three.js objects directly — it calls the small
// imperative API at the bottom (`setMode`, `setWind`, `focus`, `nudgeBoard`,
// …) and reads stats through a callback. That separation is what keeps the
// React tree from re-rendering during the animation loop, which is the single
// most common cause of jank in React + WebGL apps.
//
// FRAME BUDGET DISCIPLINE (the "no lag on any device" contract):
//   * The loop allocates NOTHING. Every vector/quaternion is hoisted.
//   * Heavy subsystems are updated on a staggered schedule, not every frame:
//     wildlife AI runs at ~30 Hz, the sky/cloud drift at ~20 Hz, the water
//     particles every frame (they are one typed-array pass).
//   * `AdaptiveResolution` trims the render scale when frames get long.
//   * The loop pauses completely when the tab is hidden or the canvas scrolls
//     out of view (IntersectionObserver), so the panel costs 0 % CPU when the
//     learner is reading something else.
//   * `renderer.info.reset()` is never needed — no per-frame object churn.

import * as THREE from "three";
import { AdaptiveResolution, budgetFor, detectTier, type QualityBudget, type QualityTier } from "./quality";
import { createTextures, type TextureSet } from "./textures";
import { buildTerrain, terrainHeight } from "./terrain";
import { createGrassField, type GrassField } from "./grass";
import { createFlora, createBirds, type Flora, type BirdColony } from "./flora";
import { createWildlife, type Wildlife } from "./wildlife";
import { createWater, type WaterSystem } from "./water";
import { createSky, type SkySystem } from "./sky";
import { createBoard, BoardController, loadBoardPlacement, type BoardHandle, BOARD_HEIGHT } from "./board";
import { createStudent, type StudentRig } from "./student";
import { FirstPersonRig, KeyboardInput, OrbitRig, type VirtualStick } from "./controls";
import { createDesk, disposeGroup, lecternPlacements, LECTERN_BOARD_HEIGHT, LECTERN_BOARD_WIDTH, type LecternSlot } from "./lectern";
import { createBoardScreens, type BoardScreensHandle } from "./boardScreens";
import { createSafariDistrict, setSafariCamera, type SafariDistrict } from "./safariDistrict";
import { createTrekAvatar, TrekPlayer, type TrekAvatar } from "./trekAvatar";
import { SAFARI, TREK, WORLD_REACH } from "./regions";

export type CameraMode = "orbit" | "fpp";
/**
 * Air left around a board when it is framed on its own, in metres. The brief
 * asks for "thoda sa area bhi halka sa 1/2 meter ka" — the board fills the
 * view but a sliver of the meadow still shows, so it never reads as a flat
 * fullscreen page that has lost its place in the world.
 */
const BOARD_VIEW_MARGIN = 0.5;

export type ViewPreset =
  | "sanctuary" | "board" | "student" | "waterfall" | "wildlife"
  | "safari" | "trek" | "world"
  // The three study boards. Each frames ONE board edge-to-edge.
  | "reading" | "notes" | "mindmap";

export interface SceneStats {
  fps: number;
  tier: QualityTier;
  pixelRatio: number;
  draws: number;
  triangles: number;
}

export interface SanctuaryOptions {
  canvas: HTMLCanvasElement;
  /** Element the pointer handlers attach to (usually the canvas wrapper). */
  dom: HTMLElement;
  onStats?: (stats: SceneStats) => void;
  onBoardTap?: () => void;
  onBoardGrab?: (grabbed: boolean) => void;
  onReady?: () => void;
  /** Force a tier (dev/debug); defaults to auto-detect. */
  tier?: QualityTier;
}

export class Sanctuary {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly budget: QualityBudget;

  private textures: TextureSet;
  private grass: GrassField;
  private flora: Flora;
  private birds: BirdColony;
  private wildlife: Wildlife;
  private water: WaterSystem;
  private sky: SkySystem;
  private board: BoardHandle;
  private student: StudentRig;
  private boardCtl: BoardController;
  private keyboard: KeyboardInput;
  private safari: SafariDistrict;
  private avatar: TrekAvatar;
  private trek = new TrekPlayer();
  /** The three live course-player boards + their WebGL frames. */
  private screens: BoardScreensHandle;
  private desk: THREE.Group;

  private orbit = new OrbitRig();
  private fpp = new FirstPersonRig();
  private mode: CameraMode = "orbit";

  private moveStick: VirtualStick = { x: 0, y: 0, active: false };

  private clock = new THREE.Clock();
  private adaptive: AdaptiveResolution;
  private raf = 0;
  private running = false;
  private visible = true;
  private wind = 1;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private lastStats = 0;
  private aiClock = 0;
  private skyClock = 0;
  private ambientClock = 0;
  /** True while the camera is parked on one study board (see the frame loop). */
  private studyFocus = false;
  private disposed = false;

  // Hoisted scratch — the loop never allocates.
  private tmpV = new THREE.Vector3();
  private lastShadowCam = new THREE.Vector3(1e9, 1e9, 1e9);
  private pointerPrev = { x: 0, y: 0, id: -1, down: false };
  private pinchPrev = 0;
  private pointers = new Map<number, { x: number; y: number }>();

  constructor(private opts: SanctuaryOptions) {
    const tier = opts.tier ?? detectTier();
    this.budget = budgetFor(tier);

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: this.budget.antialias,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    if (this.budget.shadowMapSize > 0) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false; // refreshed on demand only
    }

    this.adaptive = new AdaptiveResolution(this.budget, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.adaptive.pixelRatio);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, this.budget.farPlane);
    this.camera.position.set(-6, 5.2, 12);

    this.scene.fog = new THREE.FogExp2(0xbcd9ef, this.budget.fogDensity);

    const aniso = Math.min(this.renderer.capabilities.getMaxAnisotropy(), this.budget.tier === "low" ? 2 : 8);
    this.textures = createTextures(aniso);

    // ── Build the world ────────────────────────────────────────────────
    this.sky = createSky(this.textures, this.budget);
    this.scene.add(this.sky.group);

    this.scene.add(buildTerrain(this.budget, this.textures.ground));

    this.grass = createGrassField(this.textures.grassBlade, this.budget);
    this.scene.add(this.grass.group);

    this.flora = createFlora(this.textures, this.budget);
    this.scene.add(this.flora.group);

    this.birds = createBirds(this.flora.perches, this.textures, this.budget);
    this.scene.add(this.birds.group);

    // ── The grazing herd is not built ────────────────────────────────
    //
    // Every animal that stood on the meadow floor — the buffalo, cows, deer,
    // sheep and goats — is gone at the owner's request. Birds stay: they are
    // in the trees and in the air, not on the ground.
    //
    // The system is still CONSTRUCTED, with a zero animal budget, rather than
    // deleted. `createWildlife` owns the fur material and the shared species
    // geometry banks, and `Sanctuary` calls `update`/`dispose` on it in three
    // places; keeping the object means those paths stay honest and re-enabling
    // the herd later is a one-line budget change instead of a re-import.
    this.wildlife = createWildlife({ ...this.budget, animalCount: 0 }, this.textures.fur);
    this.scene.add(this.wildlife.group);

    this.water = createWater(this.textures, this.budget);
    this.scene.add(this.water.group);

    this.student = createStudent(this.budget);
    this.scene.add(this.student.group);

    // ── The study lectern: a desk and three 30 m boards ───────────────
    //
    // The desk goes between the chair and the boards; the three boards stand
    // in a solved arc around the chair (see `lectern.ts` for why the layout
    // has to be root-found rather than placed on a circle). Each board's face
    // is a LIVE DOM surface rendered by CSS3D, so the course-player panels
    // run on them for real — video plays, PDFs scroll, the editor takes a
    // caret — and stay sharp at any board size.
    this.desk = createDesk(this.budget.shadowMapSize > 0);
    this.scene.add(this.desk);

    this.screens = createBoardScreens(this.budget.shadowMapSize > 0);
    this.scene.add(this.screens.shells);
    // The CSS3D layer is a sibling of the canvas, sharing its camera. It is
    // inserted BEFORE the HUD so the glass controls stay on top of it.
    opts.dom.appendChild(this.screens.domElement);

    this.board = createBoard(this.budget);
    this.board.group.position.set(0, terrainHeight(0, -1.4) + BOARD_HEIGHT * 0.5 + 1.55, -1.4);
    this.scene.add(this.board.group, this.board.plinth);
    this.board.plinth.position.set(0, terrainHeight(0, -1.4), -1.4);

    this.boardCtl = new BoardController({
      board: this.board.group,
      panel: this.board.panel,
      camera: this.camera,
      dom: opts.dom,
      enabled: () => true,
      onGrabChange: (g) => {
        opts.onBoardGrab?.(g);
      },
    });

    // Restore the learner's own board placement, if they made one. This runs
    // AFTER the controller exists because restore() goes through setScale(),
    // which needs the controller's clamp. If there is nothing saved the board
    // simply keeps the default position set above.
    this.boardCtl.restore(loadBoardPlacement());

    // ── The other two districts of the same world ────────────────────
    //
    // The safari is built into the SAME scene, 900 m east, so walking there
    // is just walking. Its models stream in asynchronously.
    setSafariCamera(this.camera);
    this.safari = createSafariDistrict();
    this.scene.add(this.safari.group);

    // The walking character. It starts seated on the study chair, and stands
    // up the moment the learner takes control in walk mode.
    this.avatar = createTrekAvatar(this.budget.shadowMapSize > 0);
    this.scene.add(this.avatar.group);
    this.trek.reset(0, 3.4);
    this.avatar.setSeated(true, new THREE.Vector3(0, terrainHeight(0, 2.6), 2.6));

    this.keyboard = new KeyboardInput();

    // OPENING SHOT: a wide establishing view. You arrive high and far enough
    // back to read the whole valley — the herds, the river, the hills on the
    // skyline — and can then orbit in towards the board or the student. The
    // old default sat almost on top of the board, which hid the world.
    // OPENING SHOT: the whole connected world in one frame. The camera pulls
    // back far enough along the district chain that the TerrainTrek highlands
    // (west), the Sanctuary meadow (centre) and the Clay Safari valley (east)
    // are all on screen together, which is how the learner discovers there
    // is somewhere to walk to.
    this.orbit.panTo(new THREE.Vector3(0, 30, 0), 1500, -0.30, 0.34);
    this.fpp.reset(0, 3.4, Math.PI);

    this.attachPointer(opts.dom);
    this.requestShadowRefresh();
    opts.onReady?.();
  }

  // ───────────────────────────────────────────────────────────────────
  //  Camera / input
  // ───────────────────────────────────────────────────────────────────

  private attachPointer(dom: HTMLElement) {
    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("pointercancel", this.onPointerUp);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
    dom.addEventListener("contextmenu", this.onContextMenu);
  }

  private detachPointer(dom: HTMLElement) {
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointermove", this.onPointerMove);
    dom.removeEventListener("pointerup", this.onPointerUp);
    dom.removeEventListener("pointercancel", this.onPointerUp);
    dom.removeEventListener("wheel", this.onWheel);
    dom.removeEventListener("contextmenu", this.onContextMenu);
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  private onPointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // The board controller claims the gesture first (it hit-tests the panel).
    if (this.boardCtl.isDragging) return;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchPrev = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    this.pointerPrev = { x: e.clientX, y: e.clientY, id: e.pointerId, down: true };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.boardCtl.isDragging) return;

    if (this.pointers.size >= 2 && this.mode === "orbit") {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchPrev > 0) this.orbit.zoom(this.pinchPrev / Math.max(dist, 1));
      this.pinchPrev = dist;
      return;
    }

    if (!this.pointerPrev.down || e.pointerId !== this.pointerPrev.id) return;
    const dx = (e.clientX - this.pointerPrev.x) * 0.005;
    const dy = (e.clientY - this.pointerPrev.y) * 0.005;
    this.pointerPrev.x = e.clientX;
    this.pointerPrev.y = e.clientY;
    if (this.mode === "orbit") this.orbit.rotate(dx, dy);
    // In walk mode the swipe orbits TerrainTrek's third-person camera around
    // the character, which is also what steers them: its theta is the heading.
    else this.trek.look(dx * 0.9, dy * 0.9);
  };

  private onPointerUp = (e: PointerEvent) => {
    const start = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchPrev = 0;
    if (e.pointerId === this.pointerPrev.id) this.pointerPrev.down = false;

    // A tap (no drag, no board move) on the board opens the lesson modal.
    if (start && !this.boardCtl.gestureMoved) {
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved < 6) this.maybeTapBoard(e);
    }
  };

  private tapRay = new THREE.Raycaster();
  private tapVec = new THREE.Vector2();

  private maybeTapBoard(e: PointerEvent) {
    const rect = this.opts.dom.getBoundingClientRect();
    this.tapVec.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.tapRay.setFromCamera(this.tapVec, this.camera);
    if (this.tapRay.intersectObject(this.board.panel, false).length > 0) this.opts.onBoardTap?.();
  }

  private onWheel = (e: WheelEvent) => {
    if (this.mode !== "orbit") return;
    e.preventDefault();
    this.orbit.zoom(1 + Math.sign(e.deltaY) * 0.1);
  };

  // ───────────────────────────────────────────────────────────────────
  //  Public API used by React
  // ───────────────────────────────────────────────────────────────────

  setMode(mode: CameraMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.keyboard.enabled = mode === "fpp";
    this.studyFocus = false;
    if (mode === "fpp") {
      // Take control of the walking character. They get up from the chair and
      // the camera drops in behind them — this is a third-person walk, so the
      // seated student model steps aside and the avatar becomes the body.
      this.student.setVisible(false);
      this.avatar.setSeated(false);
      this.trek.reset(this.student.eyePosition.x, this.student.eyePosition.z + 1.4);
      this.avatar.group.position.copy(this.trek.position);
      this.applyFov();
    } else {
      // Hand the world back: the character returns to the chair and sits.
      this.student.setVisible(true);
      this.avatar.setSeated(true, this.tmpV.set(0, terrainHeight(0, 2.6), 2.6).clone());
      this.camera.rotation.set(0, 0, 0);
      this.applyFov();
      this.orbit.panTo(this.tmpV.copy(this.board.group.position).setY(2.2), 13.5);
    }
    this.camera.updateProjectionMatrix();
    this.requestShadowRefresh();
  }

  getMode(): CameraMode {
    return this.mode;
  }

  /**
   * The DOM elements the three boards' faces are made of, so React can portal
   * the course-player panels into them. Handing out the elements (rather than
   * letting the engine know about React) keeps `engine/` framework-free.
   */
  boardHosts(): Record<LecternSlot, HTMLElement> {
    return {
      mindmap: this.screens.byId("mindmap")!.element,
      reading: this.screens.byId("reading")!.element,
      notes: this.screens.byId("notes")!.element,
    };
  }

  setMoveStick(x: number, y: number, active: boolean) {
    this.moveStick.x = x;
    this.moveStick.y = y;
    this.moveStick.active = active;
  }

  private hudSprint = false;

  setSprint(on: boolean) {
    this.hudSprint = on;
  }

  setWind(multiplier: number) {
    this.wind = multiplier;
  }

  setAutoOrbit(on: boolean) {
    this.orbit.autoRotate = on;
  }

  getAutoOrbit(): boolean {
    return this.orbit.autoRotate;
  }

  /** Move the board with the HUD arrows (keeps the ground clamp). */
  nudgeBoard(dx: number, dy: number, dz: number) {
    this.boardCtl.nudge(dx, dy, dz);
  }

  /** Push/pull the board along the view ray (HUD zoom buttons / slider). */
  zoomBoard(factor: number) {
    const depth = this.board.group.position.distanceTo(this.camera.position);
    this.boardCtl.setDepth(depth * factor);
  }

  /** Scale the board from the HUD (edge-drag does the same thing by gesture). */
  scaleBoard(factor: number) {
    const { w, h } = this.boardCtl.getScale();
    this.boardCtl.setScale(w * factor, h * factor);
  }

  resetBoard() {
    this.board.group.position.set(0, terrainHeight(0, -1.4) + BOARD_HEIGHT * 0.5 + 1.55, -1.4);
    this.boardCtl.resetScale();
    this.boardCtl.clamp();
  }

  focus(preset: ViewPreset) {
    if (this.mode === "fpp") this.setMode("orbit");
    // Any view that is not a single board puts the full world back on budget.
    this.studyFocus = false;
    switch (preset) {
      case "board":
        this.orbit.panTo(this.tmpV.copy(this.board.group.position), 6.4, Math.PI, 0.12);
        break;
      case "student":
        // Sitting at the desk: all three boards in frame, none cut off — and
        // the only view from which you can tip your head back to the sky.
        this.focusStudentDesk();
        break;
      case "waterfall":
        this.orbit.panTo(this.tmpV.set(18, 5, -34), 20, 0.5, 0.25);
        break;
      case "safari":
        this.orbit.panTo(this.tmpV.set(SAFARI.centerX, 6, SAFARI.centerZ), 210, -0.5, 0.34);
        break;
      case "trek":
        this.orbit.panTo(this.tmpV.set(TREK.centerX, 30, TREK.centerZ), 320, 0.6, 0.30);
        break;
      case "world":
        this.orbit.panTo(this.tmpV.set(0, 30, 0), 1500, -0.30, 0.34);
        break;
      case "wildlife": {
        this.orbit.panTo(this.tmpV.set(-14, 1.6, -8), 15, 1.1, 0.16);
        break;
      }
      case "reading":
      case "notes":
      case "mindmap":
        this.focusBoard(preset);
        break;
      default:
        // "Sanctuary" is the wide establishing view you land on.
        this.orbit.panTo(this.tmpV.set(0, 6, -6), 86, -0.5, 0.36);
    }
    this.requestShadowRefresh();
  }

  /**
   * Frame ONE board, edge to edge, with a small margin of world showing.
   *
   * The distance is COMPUTED from the live projection rather than stored as a
   * magic number, because the fov is aspect-dependent (see `applyFov`). A
   * fixed distance that framed the board at 16:9 would crop it on a narrow
   * window — the exact failure this brief calls out. Here the board is fitted
   * against both the horizontal and the vertical half-angles and the larger
   * requirement wins, so it fits at every aspect.
   *
   * `BOARD_VIEW_MARGIN` is the 0.5 m of air asked for on each side: the board
   * fills the frame but never bleeds off it.
   */
  private focusBoard(slot: LecternSlot) {
    const placement = lecternPlacements().find((p) => p.slot === slot);
    if (!placement) return;
    this.studyFocus = true;

    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const needW = LECTERN_BOARD_WIDTH + BOARD_VIEW_MARGIN * 2;
    const needH = LECTERN_BOARD_HEIGHT + BOARD_VIEW_MARGIN * 2;
    const distance = Math.max(
      needH / 2 / Math.tan(vFov / 2),
      needW / 2 / Math.tan(hFov / 2),
    );

    // Square on to the board: the orbit yaw that puts the camera on the board's
    // face normal is its yaw, and the pitch is level so the page is not
    // read at a slant.
    this.orbit.panTo(this.tmpV.copy(placement.position), distance, placement.yaw, 0);
  }

  /**
   * Frame ALL THREE boards from the student's seat — the "Student" preset.
   * Same fitting maths, but against the full width of the trio (the outer
   * corner of a side board, mirrored) so nothing is cut off.
   */
  private focusStudentDesk() {
    const placements = lecternPlacements();
    let halfSpan = 0;
    let sumZ = 0;
    for (const p of placements) {
      const ax = Math.cos(p.yaw);
      const az = -Math.sin(p.yaw);
      const half = LECTERN_BOARD_WIDTH / 2;
      halfSpan = Math.max(
        halfSpan,
        Math.abs(p.position.x + half * ax),
        Math.abs(p.position.x - half * ax),
      );
      sumZ += p.position.z + half * Math.abs(az) * 0;
    }
    const centreZ = sumZ / placements.length;

    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const needW = halfSpan * 2 + BOARD_VIEW_MARGIN * 2;
    const needH = LECTERN_BOARD_HEIGHT + BOARD_VIEW_MARGIN * 2;
    const distance = Math.max(
      needH / 2 / Math.tan(vFov / 2),
      needW / 2 / Math.tan(hFov / 2),
    );

    const target = this.tmpV.set(0, placements[1].position.y, centreZ);
    this.orbit.panTo(target, distance, 0, 0.06);
  }

  resize(width: number, height: number) {
    if (width === 0 || height === 0) return;
    const aspect = width / height;
    this.camera.aspect = aspect;

    // KEEP THE WORLD IN FRAME ON NARROW SCREENS.
    //
    // A PerspectiveCamera's fov is VERTICAL, so the horizontal field shrinks
    // as the window narrows. At 16:9 the establishing shot holds all three
    // districts; at 0.86:1 the horizontal half-angle covers only 627 m and
    // the districts 700 m out fall off both edges — which is why shrinking
    // the window made everything disappear.
    //
    // The fix is the standard "horizontal-locked" projection: below a
    // reference aspect, widen the vertical fov so the HORIZONTAL extent stays
    // constant. The framing then depends on the scene, not on the window.
    this.applyFov();

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.screens.setSize(width, height);
    // The CSS layer caches the last camera pose, so a resize has to force one
    // render — the pose is unchanged but the projection is not.
    this.screens.render(this.camera, true);
    this.requestShadowRefresh();
  }

  /** The fov the current mode wants before the aspect correction. */
  private get baseFovForMode() {
    return this.mode === "fpp" ? 60 : 52;
  }

  /**
   * Apply the mode's fov with the narrow-screen correction folded in, and
   * push it to the projection. Called on resize AND on every mode change, so
   * switching modes can never silently undo the correction.
   */
  private applyFov() {
    const REFERENCE_ASPECT = 16 / 9;
    const base = this.baseFovForMode;
    let fov = base;
    if (this.camera.aspect < REFERENCE_ASPECT) {
      const halfH = (Math.tan((base * Math.PI) / 360) * REFERENCE_ASPECT) / this.camera.aspect;
      fov = (Math.atan(halfH) * 360) / Math.PI;
    }
    // Never let the correction run away on an extremely tall viewport.
    this.camera.fov = Math.min(fov, 100);
    this.camera.updateProjectionMatrix();
  }

  /** Shadows are static: re-render the map only when the world changes. */
  private shadowDirty = 2;
  private requestShadowRefresh() {
    this.shadowDirty = 2;
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (v && this.running && !this.raf) {
      this.clock.getDelta();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.start();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // ───────────────────────────────────────────────────────────────────
  //  Frame loop
  // ───────────────────────────────────────────────────────────────────

  private tick = () => {
    if (!this.running || this.disposed) return;
    if (!this.visible) {
      this.raf = 0; // parked — setVisible(true) restarts it
      return;
    }
    this.raf = requestAnimationFrame(this.tick);

    const frameStart = performance.now();
    // Clamp dt so a long stall (tab restore, GC) can never teleport the world.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    // ── Camera ────────────────────────────────────────────────────────
    if (this.mode === "fpp") {
      // Keyboard and the on-screen stick are summed, so a desktop user can
      // use either (or both) without a mode switch.
      const kb = this.keyboard.stick;
      const mx = THREE.MathUtils.clamp(this.moveStick.x + kb.x, -1, 1);
      const my = THREE.MathUtils.clamp(this.moveStick.y + kb.y, -1, 1);
      const active = this.moveStick.active || kb.active;
      // Sprint is the OR of the keyboard modifier and the HUD toggle, recomputed
      // every frame — never latched, or the learner could not stop running.
      this.fpp.sprint = this.keyboard.sprint || this.hudSprint;
      // Walking is TerrainTrek's character: a visible body running across the
      // ground with the camera orbiting behind it, not a floating viewpoint.
      // Taking control stands them up off the chair.
      if (this.avatar.seated && active) this.avatar.setSeated(false);
      this.trek.boost = this.keyboard.sprint || this.hudSprint;
      this.trek.update(dt, { x: mx, y: my, active }, this.camera, WORLD_REACH);
      if (!this.avatar.seated) {
        this.avatar.group.position.copy(this.trek.position);
        this.avatar.group.rotation.y = this.trek.rotation;
      }
      this.avatar.setVisible(true);
    } else {
      this.orbit.update(dt, this.camera);
      this.avatar.setVisible(true);
    }

    // ── World (staggered) ─────────────────────────────────────────────
    //
    // STUDY MODE — the biggest single saving in this scene.
    //
    // When the learner is reading one board, the camera is locked square onto
    // it 18 m away and the meadow is a few pixels at the edges. Simulating the
    // whole valley for that is pure waste, and it competes for the main thread
    // with the very DOM work (video decode, text layout, the mind-map canvas)
    // that has to stay smooth. This is the same trade BGMI makes when it drops
    // world detail the instant you open the scope: spend the frame on what the
    // player is actually looking at.
    //
    // So while a single board is framed, the ambient world animation runs at a
    // quarter rate. Nothing is hidden and nothing pops — the grass still
    // sways, just on fewer ticks — and the frame budget goes to the board.
    const study = this.studyFocus;
    this.ambientClock += dt;
    const ambientStep = study ? 1 / 15 : 0;
    const runAmbient = this.ambientClock >= ambientStep;
    if (runAmbient) {
      const adt = this.ambientClock;
      this.ambientClock = 0;
      this.grass.update(time, this.wind);
      this.flora.update(time, this.wind);
      this.water.update(adt, time);
      // The safari district animates on the same budget as the herds.
      this.safari.update(adt, time);
    }

    this.aiClock += dt;
    if (this.aiClock >= (study ? 1 / 12 : 1 / 30)) {
      this.wildlife.update(this.aiClock, time, this.camera.position);
      this.birds.update(this.aiClock, time, this.wind);
      this.student.update(time);
      this.aiClock = 0;
    }

    this.skyClock += dt;
    if (this.skyClock >= (study ? 1 / 8 : 1 / 20)) {
      this.sky.update(this.skyClock, time, this.wind);
      this.skyClock = 0;
    }

    // Keep the sun's shadow frustum centred on the viewer so a 2 k map covers
    // the visible area instead of the whole 180 m meadow. The map is STATIC
    // (autoUpdate off) and re-rendered only when the viewer has actually moved
    // far enough for the old map to be wrong — a panning camera therefore costs
    // one shadow pass every ~0.4 m instead of one every single frame.
    if (this.budget.shadowMapSize > 0) {
      if (this.camera.position.distanceToSquared(this.lastShadowCam) > 0.16) {
        this.lastShadowCam.copy(this.camera.position);
        this.requestShadowRefresh();
      }
      this.sky.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z);
      this.sky.sun.position.set(
        this.camera.position.x + 44,
        48,
        this.camera.position.z - 50,
      );
      this.sky.sun.target.updateMatrixWorld();
      if (this.shadowDirty > 0) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowDirty -= 1;
      }
    }

    this.boardCtl.update(dt);

    this.renderer.render(this.scene, this.camera);
    // The DOM boards share this camera. The call is a no-op unless the camera
    // actually moved or a board crossed a cull boundary, so a still frame
    // costs nothing here.
    this.screens.render(this.camera);

    // ── Adaptive resolution + stats ───────────────────────────────────
    const frameMs = performance.now() - frameStart;
    const newRatio = this.adaptive.sample(frameMs, frameStart);
    if (newRatio !== null) {
      this.renderer.setPixelRatio(newRatio);
      this.requestShadowRefresh();
    }

    this.fpsAccum += dt;
    this.fpsFrames += 1;
    if (frameStart - this.lastStats > 500 && this.opts.onStats) {
      this.opts.onStats({
        fps: this.fpsFrames / Math.max(this.fpsAccum, 0.001),
        tier: this.budget.tier,
        pixelRatio: Math.round(this.adaptive.pixelRatio * 100) / 100,
        draws: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
      });
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.lastStats = frameStart;
    }
  };

  dispose() {
    this.disposed = true;
    this.stop();
    this.detachPointer(this.opts.dom);
    this.boardCtl.dispose();
    this.screens.dispose();
    disposeGroup(this.desk);
    this.safari.dispose();
    this.avatar.dispose();
    this.keyboard.dispose();
    this.grass.dispose();
    this.flora.dispose();
    this.birds.dispose();
    this.wildlife.dispose();
    this.water.dispose();
    this.sky.dispose();
    this.board.dispose();
    this.student.dispose();
    this.textures.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.scene.clear();
    this.renderer.dispose();
  }
}
