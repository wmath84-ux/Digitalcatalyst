// src/nature3d/engine/scene.ts
//
// THE SANCTUARY RUNTIME.
//
// One class owns the renderer, the scene graph, the camera rigs and the frame
// loop. React never touches Three.js objects directly — it calls the small
// imperative API at the bottom (`setMode`, `setWind`, `focus`,
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
import { buildTerrain, coastWeight, insideRiver, OCEAN_LEVEL, terrainHeight, WATER_LEVEL } from "./terrain";
import { createGrassField, type GrassField } from "./grass";
import { createFlora, createBirds, type Flora, type BirdColony } from "./flora";
import { createSorrelField, type SorrelField } from "./sorrel";
import { createAtmosphere, type Atmosphere } from "./atmosphere";
import { createWeathering, type Weathering } from "./weathering";
import { createWinter, winterDaylight, type WinterSystem } from "./winter";
import { createRockField, type RockField } from "./rocks";
import { createWildlife, type Wildlife } from "./wildlife";
import { createWater, type WaterSystem } from "./water";
import { createSky, type SkySystem } from "./sky";
import { daylightAt, hourForMode, type DaylightMode, type DaylightState } from "./daylight";
import { createBoard, createBoardStand, BOARD_HILL, type BoardHandle } from "./board";
import { createStudent, type StudentRig } from "./student";
import { FirstPersonRig, KeyboardInput, OrbitRig, type VirtualStick } from "./controls";
import { createDesk, disposeGroup, LECTERN_BOARD_HEIGHT, LECTERN_BOARD_WIDTH, type LecternSlot } from "./lectern";
import {
  createBoardScreens,
  PX_TO_M,
  SCREEN_PX_HEIGHT,
  SCREEN_PX_WIDTH,
  type BoardScreen,
  type BoardScreensHandle,
} from "./boardScreens";
import { createTrekAvatar, TrekPlayer, type TrekAvatar } from "./trekAvatar";
import { createStructures, type Structures } from "./structures";
import { TREK, WORLD_REACH } from "./regions";

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
  | "trek" | "world"
  // The three study boards. Each frames ONE board edge-to-edge.
  | "reading" | "notes" | "mindmap";

export interface SceneStats {
  fps: number;
  tier: QualityTier;
  pixelRatio: number;
  draws: number;
  triangles: number;
}

/**
 * Screen space the HUD chrome occupies, in CSS px. When a board is framed it
 * must fit INSIDE the rect these insets leave free — otherwise the board's
 * bottom rows land behind the trays and its buttons cannot be clicked.
 */
export interface HudInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * One synthetic gesture being replayed into a board by the input bridge.
 * The real finger drives the camera's ray; this struct remembers where the
 * replayed touch is, so the sequence (down → moves → up/click) stays
 * faithful to the finger's path.
 */
interface BoardBridge {
  pointerId: number;
  screen: BoardScreen;
  /** The deepest board element under the finger — where the events land. */
  target: Element;
  /** Cached rect of `target`; re-lookup only when the finger leaves it. */
  targetRect: DOMRect;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** Last point on the board, in its 1920×1080 layout px. */
  lastLocalX: number;
  lastLocalY: number;
  startedAt: number;
  /** Overflow boxes under the finger, innermost first — the bridge scrolls these. */
  scrollers: HTMLElement[];
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
  /**
   * The sorrel field (the meadow's real 3D ground plants). Its asset is
   * loaded asynchronously — it is the only world piece that is — so this
   * stays null until the load resolves, and a failed load leaves it null
   * instead of taking the sanctuary down.
   */
  private sorrel: SorrelField | null = null;
  /**
   * Air, weathering and the rock kit — the three systems that carry the
   * research pass (see `atmosphere.ts`, `weathering.ts`, `rocks.ts`). The
   * atmosphere owns no geometry: it is a set of shared uniforms and a shader
   * injection every other material opts into.
   */
  private atmosphere: Atmosphere;
  private weathering: Weathering;
  private winter: WinterSystem;
  private iceAge = false;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private rocks: RockField;
  private birds: BirdColony;
  private wildlife: Wildlife;
  private water: WaterSystem;
  private sky: SkySystem;
  /** The bay district: tropical-modern buildings, landmark, jetty, props. */
  private structures: Structures;
  private board: BoardHandle;
  private student: StudentRig;
  private keyboard: KeyboardInput;
  private avatar: TrekAvatar;
  private trek = new TrekPlayer();
  /** The three live course-player boards + their WebGL frames. */
  private screens: BoardScreensHandle;
  private desk: THREE.Group;

  private orbit = new OrbitRig();
  private fpp = new FirstPersonRig();
  private mode: CameraMode = "orbit";

  private moveStick: VirtualStick = { x: 0, y: 0, active: false };

  /** The HUD chrome keeps a board framing away from the trays (see focusBoard). */
  private hudInsets: HudInsets = { top: 84, bottom: 152, left: 84, right: 20 };
  /** Last viewport size, for the safe-rect maths in focusBoard. */
  private viewW = 1;
  private viewH = 1;

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
  /** Which lighting the learner chose; "auto" follows the device clock. */
  private daylightMode: DaylightMode = "auto";
  private daylight: DaylightState = daylightAt(hourForMode("auto"));
  /** Seconds since the auto clock was last re-read. */
  private daylightClock = 0;
  private ambientClock = 0;
  /** True while the camera is parked on one study board (see the frame loop). */
  private studyFocus = false;
  /** Board to pin once the orbit pan has settled square-on. */
  private pendingReadSlot: LecternSlot | null = null;
  private pendingPinAge = 0;
  /** Face-size multiplier vs the pinned 30 m board. 1 / 1.5 / 2 / 3. */
  private boardScale = 1;
  private disposed = false;

  // Hoisted scratch — the loop never allocates.
  private tmpV = new THREE.Vector3();
  private lastShadowCam = new THREE.Vector3(1e9, 1e9, 1e9);
  /** The sunny-afternoon brightness push applied on top of the per-hour curve. */
  private gradeExposure = 1.52;
  /** True while the camera (or the walker) is under the water line. */
  private submerged = false;
  private pointerPrev = { x: 0, y: 0, id: -1, down: false };
  private pinchPrev = 0;
  private pointers = new Map<number, { x: number; y: number }>();

  // ── The board input bridge (see localOnBoard) ─────────────────────────
  /** The synthetic gesture currently being replayed into a board, if any. */
  private bridge: BoardBridge | null = null;
  /** One world-space plane per study board front face — the bridge's ray targets. */
  private boardPlanes: THREE.Plane[] = [];

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
    // USER DIRECTIVE (full daylight): the per-hour curve in `daylight.ts`
    // is contract-fixed, so the final brightness push lives here — +52 % on
    // top of it. The land was still reading as dusk even at midday; this is
    // the grade that makes every surface readable as a clear sunny day.
    this.gradeExposure = 1.52;
    this.renderer.toneMappingExposure = 1.08 * this.gradeExposure;
    if (this.budget.shadowMapSize > 0) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false; // refreshed on demand only
    }

    this.adaptive = new AdaptiveResolution(this.budget, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.adaptive.pixelRatio);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, this.budget.farPlane);
    this.camera.position.set(-6, 5.2, 12);

    this.scene.fog = new THREE.FogExp2(0xaedcfa, this.budget.fogDensity);

    const aniso = Math.min(this.renderer.capabilities.getMaxAnisotropy(), this.budget.tier === "low" ? 2 : 8);
    this.textures = createTextures(aniso);

    // AIR + WEATHERING are built before any geometry, because every material
    // created from here on is offered to them as it is made (see below). Both
    // are pure shader injections with shared uniforms: no passes, no render
    // targets, no per-frame CPU work.
    this.atmosphere = createAtmosphere(this.budget);
    this.weathering = createWeathering(this.textures.weather, this.budget.tier);
    this.winter = createWinter(this.budget.tier);
    this.scene.add(this.winter.group);

    // ── Build the world ────────────────────────────────────────────────
    this.sky = createSky(this.textures, this.budget);
    this.scene.add(this.sky.group);

    const terrain = buildTerrain(this.budget, this.textures.ground);
    this.scene.add(terrain);
    // The ground takes the atmosphere pass but NOT the transmission term —
    // soil does not translucently glow when the sun is behind it.
    this.atmosphere.registerTree(terrain);
    this.winter.registerTree(terrain, "ground");

    // ROCKS BEFORE GRASS: the rock kit publishes the base of every boulder it
    // places, and the grass field plants a skirt of blades around each one
    // (principle 50 — a rock with nothing growing at its base reads as pasted
    // on, however good the rock is).
    this.rocks = createRockField(this.textures, this.budget, this.weathering);
    this.scene.add(this.rocks.group);
    this.atmosphere.registerTree(this.rocks.group);
    this.winter.registerTree(this.rocks.group);

    this.grass = createGrassField(this.textures.grassBlade, this.budget, this.rocks.skirtPoints);
    this.scene.add(this.grass.group);
    // Grass IS foliage: it gets the backlit transmission term.
    this.grass.materials.forEach((m) => this.atmosphere.register(m, { foliage: true }));
    this.grass.materials.forEach((m) => this.winter.register(m, "foliage"));

    this.flora = createFlora(this.textures, this.budget);
    this.scene.add(this.flora.group);
    // Leaves glow when the sun is behind them; bark, shrubs and flower stems do
    // not. The factory publishes the two lists rather than leaving the scene to
    // guess which material is which.
    this.flora.foliageMaterials.forEach((m) => this.atmosphere.register(m, { foliage: true }));
    this.flora.solidMaterials.forEach((m) => this.atmosphere.register(m));
    this.flora.foliageMaterials.forEach((m) => this.winter.register(m, "foliage"));
    this.flora.solidMaterials.forEach((m) => this.winter.register(m));

    // THE SORREL FIELD — the meadow's real 3D ground plants. The only
    // asynchronous piece of the world: the glTF + textures ship in
    // `public/sanctuary/models/` and land a beat after the rest of the
    // build. Until then the meadow is simply grass + wildflowers, and a
    // failed load degrades to exactly that instead of breaking the scene.
    createSorrelField(this.budget, aniso).then((field) => {
      if (this.disposed) {
        field.dispose();
        return;
      }
      this.sorrel = field;
      this.scene.add(field.group);
      // Thin leaves glow when the sun is behind them, like the grass.
      field.materials.forEach((m) => this.atmosphere.register(m, { foliage: true }));
      field.materials.forEach((m) => this.winter.register(m, "foliage"));
    }).catch(() => {
      // createSorrelField already warns; the field stays null.
    });

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

    // The river is handed the atmosphere's OWN colour objects, and its
    // materials are registered with the same air the ground breathes: the
    // reflection tracks the real sky (a 6 pm river reflects a 6 pm sky) and
    // the far bend of the channel fades into the haze instead of staying a
    // full-contrast blue ribbon pasted over the hills (research §15, §16).
    this.water = createWater(this.textures, this.budget, this.sky.sunDir, {
      sky: this.atmosphere.uniforms.uDcHazeColor.value,
      sun: this.atmosphere.uniforms.uDcSunColor.value,
    });
    this.water.materials.forEach((m) => this.atmosphere.register(m));
    this.water.iceMaterials.forEach((m) => this.winter.register(m, "ice"));

    // THE BAY DISTRICT — buildings, beacon, jetty, props, distant islands.
    // Built from the same height field everything else reads, so the village
    // sits on the measured shoreline. Its materials join the air like every
    // other solid: the far islands and the white tower fade into the haze
    // exactly as the mountains do (Phase 19 — no full-contrast pastes).
    this.structures = createStructures(this.budget);
    this.scene.add(this.structures.group);
    this.atmosphere.registerTree(this.structures.group);
    this.winter.registerTree(this.structures.group);

    // Light the world for the current moment before the first frame, so the
    // sanctuary never flashes the authored midday look and then correct
    // itself.
    this.applyDaylight();
    this.scene.add(this.water.group);

    this.student = createStudent(this.budget);
    this.scene.add(this.student.group);
    this.winter.registerTree(this.student.chair);

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
    this.winter.registerTree(this.desk);

    this.screens = createBoardScreens(this.budget.shadowMapSize > 0);
    this.scene.add(this.screens.shells);
    this.winter.registerTree(this.screens.shells);
    // The CSS3D layer is a sibling of the canvas, sharing its camera. It is
    // inserted BEFORE the HUD so the glass controls stay on top of it.
    opts.dom.appendChild(this.screens.domElement);

    // One world-space plane per board front face. The input bridge raycasts
    // against these instead of trusting the device's 3D hit-test (the part
    // of the browser that drops board taps at full size — see there).
    for (const s of this.screens.screens) {
      const n = new THREE.Vector3(Math.sin(s.placement.yaw), 0, Math.cos(s.placement.yaw));
      this.boardPlanes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(n, s.placement.position));
    }

    // ── The lesson board, planted on the hillside ────────────────────────
    //
    // This is the small "Morning Nature Study" board. It used to float in
    // front of the learner and be draggable, resizable and pushable — which
    // fought the three study boards for the same space and the same gestures.
    // It is now scenery: fixed on the hill crest the seated learner can see
    // BETWEEN the boards, standing on its own posts, and it accepts no input
    // at all.
    //
    // The crest is chosen by measurement, not by eye (see BOARD_HILL below):
    // the three 30 m boards cover -41.3 deg .. +41.3 deg of the learner's view,
    // so the board has to sit outside that fan or it would be hidden behind
    // one of them.
    this.board = createBoard(this.budget);
    this.board.group.position.copy(BOARD_HILL.position);
    this.board.group.rotation.y = BOARD_HILL.yaw;
    this.board.group.scale.setScalar(BOARD_HILL.scale);
    this.scene.add(this.board.group);
    // The lesson face gets frost at its edges, not over the readable text.
    const boardMaterials = this.board.panel.material as THREE.Material[];
    this.winter.register(boardMaterials[4], "board");
    this.winter.registerTree(this.board.group);
    const boardStand = createBoardStand(BOARD_HILL, this.budget.shadowMapSize > 0);
    this.scene.add(boardStand);
    this.winter.registerTree(boardStand);

// The board is scenery now: no controller, no drag, no resize, no
    // persistence. Nothing to restore either — its place is fixed in code.

    // The walking character. It starts seated on the study chair, and stands
    // up the moment the learner takes control in walk mode.
    this.avatar = createTrekAvatar(this.budget.shadowMapSize > 0);
    this.avatar.setLowEnd(this.budget.tier === "low");
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
    // (west) and the Sanctuary meadow (centre)
    // are both on screen together, which is how the learner discovers there
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
    // Capture phase: full-screen boards swallow nested clicks in CSS3D
    // hit-testing (the centre of the notes/mind-map editor). Seeing the
    // event BEFORE the board's stopPropagation lets the geometric bridge
    // re-aim those taps. Native iframe hits are left alone (see onPointerDown).
    dom.addEventListener("pointerdown", this.onPointerDown, true);
    dom.addEventListener("pointermove", this.onPointerMove, true);
    dom.addEventListener("pointerup", this.onPointerUp, true);
    dom.addEventListener("pointercancel", this.onPointerUp, true);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
    dom.addEventListener("contextmenu", this.onContextMenu);
  }

  private detachPointer(dom: HTMLElement) {
    dom.removeEventListener("pointerdown", this.onPointerDown, true);
    dom.removeEventListener("pointermove", this.onPointerMove, true);
    dom.removeEventListener("pointerup", this.onPointerUp, true);
    dom.removeEventListener("pointercancel", this.onPointerUp, true);
    dom.removeEventListener("wheel", this.onWheel);
    dom.removeEventListener("contextmenu", this.onContextMenu);
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  /**
   * True when the event's target is a board screen or anything inside one of
   * the panels. The board elements already stop propagation on themselves,
   * but some device browsers deliver board touches to the host ANYWAY (their
   * hit-test of the large 3D-transformed element is unreliable), so the rig
   * double-checks the target instead of trusting the event path.
   */
  private boardTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(".nature3d-board-screen") !== null;
  }

  private onPointerDown = (e: PointerEvent) => {
    // FULL-SCREEN BOARD: the framed face is pinned as a 2D rectangle, so
    // nested controls (notes heading/body, mind-map +, YouTube iframe)
    // hit-test natively. Synthetic events cannot enter an iframe or place
    // a caret — never steal those. Capture only when CSS3D / the canvas
    // ate the tap, then the geometric bridge re-aims it.
    if (this.studyFocus) {
      const nativeNested =
        e.target instanceof Element &&
        this.boardTarget(e.target) &&
        !e.target.classList.contains("nature3d-board-screen");
      if (nativeNested) return;

      const framed = this.localOnBoard(e);
      if (framed) {
        const hit = this.boardTargetAt(framed.screen, e.clientX, e.clientY, framed.x, framed.y);
        if (hit instanceof HTMLIFrameElement || hit.tagName === "IFRAME" || hit.closest("iframe")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.startBridge(e, framed, hit);
        return;
      }
    }
    // A hit on the board ROOT (no nested control) is CSS3D missing the
    // button — re-aim with the geometric bridge before the native path
    // swallows it.
    if (e.target instanceof Element && e.target.classList.contains("nature3d-board-screen")) {
      const onRoot = this.localOnBoard(e);
      if (onRoot) {
        e.preventDefault();
        this.startBridge(e, onRoot);
        return;
      }
    }
    // When the device's hit-test works, the board's own stopPropagation
    // listeners swallow the touch before these host handlers ever see it —
    // so reaching this line with a board-area touch is PROOF the device's
    // 3D hit-test dropped it, and the bridge below re-aims it with geometry.
    if (this.boardTarget(e.target)) return;
    // A second finger landing while a board gesture is being replayed turns
    // it into a camera pinch: cancel the synthetic sequence and hand BOTH
    // fingers to the rig (finger one rejoins at its last known point).
    if (this.bridge) {
      // Framed board: a second finger must not become a camera pinch.
      // Zooming the rig while the page is pinned is what painted a giant
      // board into the sky.
      if (this.studyFocus) return;
      const b = this.bridge;
      this.cancelBridge();
      this.pointers.set(b.pointerId, { x: b.lastX, y: b.lastY });
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, c] = [...this.pointers.values()];
      this.pinchPrev = Math.hypot(a.x - c.x, a.y - c.y);
      return;
    }
    // THE CLICKS-MUST-WORK FIX. On some device browsers a tap that visually
    // lands on a full-size board is delivered here addressed to the canvas
    // (the "first tap nudges the camera" symptom). Re-aim it: a ray from the
    // camera through the EXACT touch point, tested against the board faces.
    const onBoard = this.localOnBoard(e);
    if (onBoard) {
      e.preventDefault();
      this.startBridge(e, onBoard);
      return;
    }
    // Framed board: do not orbit. Dragging the camera is what made the 2D
    // page look like it was spinning on the lectern.
    if (this.studyFocus) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // A second finger turns the gesture into a pinch-zoom of the camera.
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchPrev = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    this.pointerPrev = { x: e.clientX, y: e.clientY, id: e.pointerId, down: true };
  };

  private onPointerMove = (e: PointerEvent) => {
    // A finger being replayed into a board follows the bridge, not the rig.
    if (this.bridge && e.pointerId === this.bridge.pointerId) {
      this.moveBridge(e);
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size >= 2 && this.mode === "orbit") {
      if (this.studyFocus) return;
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
    if (this.studyFocus) return;
    if (this.mode === "orbit") this.orbit.rotate(dx, dy);
    // In walk mode the swipe orbits TerrainTrek's third-person camera around
    // the character, which is also what steers them: its theta is the heading.
    else this.trek.look(dx * 0.9, dy * 0.9);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.bridge && e.pointerId === this.bridge.pointerId) {
      this.endBridge(e);
      return;
    }
    const start = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchPrev = 0;
    if (e.pointerId === this.pointerPrev.id) this.pointerPrev.down = false;

    // A tap (no drag, no board move) on the board opens the lesson modal.
    if (start) {
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved < 6) this.maybeTapBoard(e);
    }
  };

  private tapRay = new THREE.Raycaster();
  private tapVec = new THREE.Vector2();

  private maybeTapBoard(e: PointerEvent) {
    // While a study board is framed, a background tap is almost always a
    // mistap at the board's edge — firing the lesson-board raycast here
    // opened the modal ON TOP of the board and made the board look dead.
    if (this.studyFocus) return;
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
    // Wheeling inside a board scrolls the panel — it must never zoom the rig.
    if (this.boardTarget(e.target)) return;
    if (this.studyFocus) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    this.orbit.zoom(1 + Math.sign(e.deltaY) * 0.1);
  };

  // ───────────────────────────────────────────────────────────────────
  //  The board input bridge
  //
  //  WHY IT EXISTS. Three rounds of device reports pin the failure on the
  //  browser, not the app: on the learner's phone the hit-test of a large
  //  3D-transformed element is unreliable — a tap that visually lands on a
  //  full-screen board is delivered to the CANVAS instead (that is the
  //  "first tap nudges the camera" symptom), so the board's buttons cannot
  //  be clicked at the default framing, while the same boards hit-test fine
  //  once pinched smaller. The 3D board stays the experience — the learner
  //  looks at the board itself — but the engine stops trusting that hit-test.
  //
  //  THE BRIDGE. The two input paths are mutually exclusive BY CONSTRUCTION:
  //  when the device's hit-test works, the board's own stopPropagation
  //  listeners swallow the touch before the host handlers run, so the bridge
  //  stays dormant and the board is touched natively (zero behaviour change
  //  on desktop, and iframes keep their native events). When the hit-test
  //  drops the touch, the event arrives at the host addressed to the canvas
  //  — the only case in which these handlers run for a board-area touch —
  //  and the bridge re-aims it with pure geometry: a ray from the camera
  //  through the exact touch point, the board's world-space face plane, and
  //  the board's 1920×1080 layout box. Nothing in the path relies on the
  //  device's 3D hit-test, so the click lands EXACTLY where the finger was,
  //  at any camera angle, distance or orientation — the non-negotiable.
  //
  //  The replay is faithful to the gesture:
  //    • tap  → pointerdown + pointerup + click on the deepest element under
  //             the finger (buttons, cards, toolbar — the panel's own React
  //             handlers fire, exactly as in the 2D player);
  //    • drag → a pointermove stream (the mind-map's JS pan/zoom runs) plus
  //             the bridge scrolling the panel's overflow boxes itself,
  //             because native touch scroll is a compositor gesture a
  //             synthetic event cannot drive;
  //    • a second finger cancels the replay and takes over as a pinch.

  private bridgeRay = new THREE.Raycaster();
  private bridgeVec = new THREE.Vector2();
  private bridgeHit = new THREE.Vector3();

  /**
   * The board the camera ray through (clientX, clientY) lands on, with the
   * point's position in that board's 1920×1080 layout px — or null.
   *
   * The px mapping is the exact inverse of CSS3DRenderer's transform: the
   * object's local +X is the element's right, its local +Y is the element's
   * TOP (CSS y grows downward, and the renderer flips the matrix's y column
   * to compensate), and 1 layout px = PX_TO_M world metres.
   */
  private localOnBoard(
    e: { clientX: number; clientY: number },
    restrict?: BoardScreen,
  ): { screen: BoardScreen; x: number; y: number } | null {
    const rect = this.opts.dom.getBoundingClientRect();
    this.bridgeVec.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.bridgeRay.setFromCamera(this.bridgeVec, this.camera);
    const ray = this.bridgeRay.ray;
    let best: { screen: BoardScreen; x: number; y: number; t: number } | null = null;
    this.screens.screens.forEach((screen, i) => {
      if (restrict && screen !== restrict) return;
      if (!screen.object.visible) return; // culled boards cannot be touched
      const plane = this.boardPlanes[i];
      if (plane.distanceToPoint(this.camera.position) < 0) return; // camera behind the face
      if (!ray.intersectPlane(plane, this.bridgeHit)) return;
      const p = screen.placement;
      const dx = this.bridgeHit.x - p.position.x;
      const dy = this.bridgeHit.y - p.position.y;
      const dz = this.bridgeHit.z - p.position.z;
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      const lx = c * dx - s * dz;
      const x = lx / PX_TO_M + SCREEN_PX_WIDTH / 2;
      const y = -dy / PX_TO_M + SCREEN_PX_HEIGHT / 2;
      const scale = this.boardScale;
      const localX = SCREEN_PX_WIDTH / 2 + (x - SCREEN_PX_WIDTH / 2) / scale;
      const localY = SCREEN_PX_HEIGHT / 2 + (y - SCREEN_PX_HEIGHT / 2) / scale;
      if (localX < 0 || localX > SCREEN_PX_WIDTH || localY < 0 || localY > SCREEN_PX_HEIGHT) return;
      const t = ray.origin.distanceToSquared(this.bridgeHit);
      if (!best || t < best.t) best = { screen, x: localX, y: localY, t };
    });
    return best;
  }

  /**
   * The deepest board element under (x, y) in SCREEN space — the touch's
   * true target.
   *
   * Primary: the browser's own `elementFromPoint`. Unlike the compositor
   * touch path that failed on the device, this is a main-thread layout
   * query — it honours z-index, absolutely-positioned overlays and
   * pointer-events, it sees elements the document-order scan below never
   * could (the editor's dropdown menus are PORTALLED to <body>, outside the
   * board element entirely), and it is reliable under the 3D transform.
   *
   * Fallback: the geometric scan, kept for the case elementFromPoint returns
   * nothing usable (a hit over bare canvas). Last document-order win: a
   * child's rect follows its parent's (or sits above it), so the last
   * containing element is the one painted on top where the finger was.
   */
  private boardTargetAt(screen: BoardScreen, x: number, y: number, localX?: number, localY?: number): Element {
    const root = screen.element;
    // Layout-space search first when we have the ray's 1920×1080 point:
    // getBoundingClientRect of a CSS3D child is the flattened AABB, which
    // is exactly what misses buttons in the centre of a full-size board.
    if (localX !== undefined && localY !== undefined) {
      const flat = this.elementAtBoardFlat(screen, x, y);
      if (flat && flat !== root) return this.preferInteractive(flat, root, localX, localY);
      const laid = this.elementAtBoardLayout(root, localX, localY);
      if (laid !== root) return laid;
    }
    const hit = document.elementFromPoint(x, y);
    if (hit && this.bridgeMayTarget(screen, hit)) return hit;
    let best: Element = root;
    for (const node of root.querySelectorAll("*")) {
      const el = node as Element;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) best = el;
    }
    return best;
  }

  private isBoardInteractive(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "LABEL") {
      return true;
    }
    if (el.isContentEditable) return true;
    const role = el.getAttribute("role");
    return role === "button" || role === "textbox" || role === "menuitem";
  }

  /**
   * CSS3D hit-testing of a full-size board drops the CENTRE (notes +, rename,
   * heading/body). Flatten the 1920×1080 element onto its visual rectangle
   * for one layout query so elementFromPoint sees ordinary 2D boxes, then
   * restore the 3D matrix before the next frame paints.
   */
  private elementAtBoardFlat(screen: BoardScreen, clientX: number, clientY: number): Element | null {
    // The HOST is the element CSS3DRenderer gives the 3D matrix to — the
    // board's box in the world. Flattening it (rather than the panel surface
    // inside it) keeps this query measuring exactly what it measured before
    // the pin started lifting a separate surface: the host is the node whose
    // transform is the projection, and the panel that fills it rides along.
    const root = screen.host;
    const visual = root.getBoundingClientRect();
    if (visual.width < 2 || visual.height < 2) return null;
    const prevTransform = root.style.transform;
    const prevOrigin = root.style.transformOrigin;
    const prevPosition = root.style.position;
    const prevLeft = root.style.left;
    const prevTop = root.style.top;
    const prevWidth = root.style.width;
    const prevHeight = root.style.height;
    const prevZ = root.style.zIndex;
    root.style.position = "fixed";
    root.style.left = `${visual.left}px`;
    root.style.top = `${visual.top}px`;
    root.style.width = `${SCREEN_PX_WIDTH}px`;
    root.style.height = `${SCREEN_PX_HEIGHT}px`;
    root.style.transformOrigin = "0 0";
    root.style.transform = `scale(${visual.width / SCREEN_PX_WIDTH}, ${visual.height / SCREEN_PX_HEIGHT})`;
    root.style.zIndex = "2147483646";
    let hit: Element | null = null;
    try {
      hit = document.elementFromPoint(clientX, clientY);
    } finally {
      root.style.transform = prevTransform;
      root.style.transformOrigin = prevOrigin;
      root.style.position = prevPosition;
      root.style.left = prevLeft;
      root.style.top = prevTop;
      root.style.width = prevWidth;
      root.style.height = prevHeight;
      root.style.zIndex = prevZ;
    }
    return hit && root.contains(hit) ? hit : null;
  }

  private preferInteractive(hit: Element, root: HTMLElement, lx: number, ly: number): Element {
    if (this.isBoardInteractive(hit)) return hit;
    const laid = this.elementAtBoardLayout(root, lx, ly);
    if (laid !== root) return laid;
    return hit;
  }

  /**
   * Deepest descendant of `root` whose LAYOUT box (offset chain, not the
   * CSS3D screen rect) contains (lx, ly) in the board's 1920×1080 space.
   * Interactive controls win over the large wrappers that fill the centre.
   */
  private elementAtBoardLayout(root: HTMLElement, lx: number, ly: number): Element {
    let best: Element = root;
    let bestArea = Infinity;
    let bestInteractive: Element | null = null;
    let bestInteractiveArea = Infinity;
    for (const node of root.querySelectorAll("*")) {
      const el = node as HTMLElement;
      if (!(el instanceof HTMLElement)) continue;
      const w = Math.max(el.offsetWidth, el.clientWidth);
      const h = Math.max(el.offsetHeight, el.clientHeight);
      if (w <= 1 || h <= 1) continue;
      let x = 0;
      let y = 0;
      let cur: HTMLElement | null = el;
      while (cur && cur !== root) {
        x += cur.offsetLeft - cur.scrollLeft;
        y += cur.offsetTop - cur.scrollTop;
        const next = cur.offsetParent as HTMLElement | null;
        cur = next && (root === next || root.contains(next)) ? next : cur.parentElement;
      }
      if (lx >= x && lx <= x + w && ly >= y && ly <= y + h) {
        const area = w * h;
        if (area <= bestArea) {
          best = el;
          bestArea = area;
        }
        if (this.isBoardInteractive(el) && area <= bestInteractiveArea) {
          bestInteractive = el;
          bestInteractiveArea = area;
        }
      }
    }
    return bestInteractive ?? best;
  }

  /**
   * May the bridged gesture target this element? YES: anything inside the
   * board itself, or inside the CSS3D layer. YES, also: page-level UI that a
   * panel PORTALLED outside the board (dropdown menus, dialogs — they live
   * under <body>, past both the board and the app root), because that is
   * exactly what a native tap at this point would have hit. NO: the app's own
   * chrome (HUD trays, joystick) — those sit beside the canvas inside the app
   * root, and a bridged board tap must never click them by accident.
   */
  private bridgeMayTarget(screen: BoardScreen, hit: Element): boolean {
    if (screen.element.contains(hit)) return true;
    if (this.screens.domElement.contains(hit)) return true;
    if (hit === document.body || hit === document.documentElement) return false;
    const appRoot = this.opts.dom.parentElement;
    if (appRoot && appRoot.contains(hit)) return false;
    return hit instanceof HTMLElement;
  }

  /** The overflow boxes under the target, innermost first. */
  private scrollersUnder(target: Element, root: Element): HTMLElement[] {
    const chain: HTMLElement[] = [];
    let n: Element | null = target;
    while (n && n !== root) {
      if (n instanceof HTMLElement && (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth)) {
        chain.unshift(n);
      }
      n = n.parentElement;
    }
    return chain;
  }

  /**
   * Dispatch one synthetic event into the board. `clientX/Y` are the
   * FINGER's own screen coordinates, so every handler in the panel sees the
   * touch at exactly the place it happened. Returns the event so the caller
   * can honour `preventDefault` (a panel that cancels mousedown is managing
   * focus itself — the bridge must not fight it).
   */
  private synthetic(
    type: string,
    target: Element,
    x: number,
    y: number,
    pointerId: number,
  ): PointerEvent {
    const init: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      detail: 1,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: type === "pointerup" || type === "click" || type === "pointercancel" ? 0 : 1,
      pointerId,
      pointerType: "touch",
      isPrimary: true,
    };
    const event = new PointerEvent(type, init);
    target.dispatchEvent(event);
    return event;
  }

  /**
   * The legacy MOUSE half of the stream. A native gesture delivers
   * pointerdown → mousedown → … → pointerup → mouseup → click; the bridge
   * used to replay only the pointer half, so every control wired to
   * `onMouseDown` — the notes editor's whole formatting toolbar — was dead
   * under the bridge while working when the same board was pinched out
   * (where the device's native path runs). The mouse events ride along at
   * the native moments; handlers that only listen for click see no change.
   */
  private syntheticMouse(type: string, target: Element, x: number, y: number): MouseEvent {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      detail: 1,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: type === "mousedown" ? 1 : 0,
    });
    target.dispatchEvent(event);
    return event;
  }

  /**
   * A native pointerdown's default action moves FOCUS and places the caret.
   * Synthetic events carry no default actions — which is why typing in the
   * notes editor never worked under the bridge ("likha nahi hota"): the
   * writing surface never got the caret. This reproduces the default action
   * by hand for editable targets: focus the field the finger touched and put
   * the caret exactly at the finger's coordinates.
   */
  private focusTapTarget(target: Element, screen: BoardScreen, x: number, y: number) {
    // A layout miss lands on a wrapper around the heading/body. Walk DOWN
    // into the editable if the target itself isn't one.
    if (target instanceof HTMLElement && !target.isContentEditable && target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
      const inner = target.querySelector("[contenteditable], input, textarea");
      if (inner) target = inner;
    }
    let el: Element | null = target;
    while (el && screen.element.contains(el)) {
      if (el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
        el.focus({ preventScroll: true });
        const sel = window.getSelection();
        if (el.isContentEditable && sel) {
          const doc = document as Document & {
            caretRangeFromPoint?(x: number, y: number): Range | null;
            caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
          };
          let range: Range | null = null;
          if (doc.caretRangeFromPoint) {
            range = doc.caretRangeFromPoint(x, y);
          } else if (doc.caretPositionFromPoint) {
            const pos = doc.caretPositionFromPoint(x, y);
            if (pos) {
              range = document.createRange();
              range.setStart(pos.offsetNode, pos.offset);
            }
          }
          if (range) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
        return;
      }
      el = el.parentElement;
    }
  }

  private startBridge(e: PointerEvent, onBoard: { screen: BoardScreen; x: number; y: number }, preset?: Element) {
    const screen = onBoard.screen;
    const target = preset ?? this.boardTargetAt(screen, e.clientX, e.clientY, onBoard.x, onBoard.y);
    this.bridge = {
      pointerId: e.pointerId,
      screen,
      target,
      targetRect: target.getBoundingClientRect(),
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      lastLocalX: onBoard.x,
      lastLocalY: onBoard.y,
      startedAt: performance.now(),
      scrollers: this.scrollersUnder(target, screen.element),
    };
    this.synthetic("pointerdown", target, e.clientX, e.clientY, e.pointerId);
    const mouse = this.syntheticMouse("mousedown", target, e.clientX, e.clientY);
    // The pointerdown default action (focus + caret), reproduced unless the
    // panel cancelled the mousedown to manage focus itself.
    if (!mouse.defaultPrevented) this.focusTapTarget(target, screen, e.clientX, e.clientY);
  }

  private moveBridge(e: PointerEvent) {
    const b = this.bridge;
    if (!b) return;
    b.lastX = e.clientX;
    b.lastY = e.clientY;
    const now = this.localOnBoard(e, b.screen);
    if (!now) return; // the finger left the board face mid-gesture
    let dlx = now.x - b.lastLocalX;
    let dly = now.y - b.lastLocalY;
    b.lastLocalX = now.x;
    b.lastLocalY = now.y;

    // The board's own JS gestures (the mind-map pan/zoom) are pointer-driven,
    // so they receive a real move stream — addressed to whatever is under the
    // finger now, exactly like native hit-testing would.
    const r = b.targetRect;
    if (e.clientX < r.left - 2 || e.clientX > r.right + 2 || e.clientY < r.top - 2 || e.clientY > r.bottom + 2) {
      b.target = this.boardTargetAt(b.screen, e.clientX, e.clientY);
      b.targetRect = b.target.getBoundingClientRect();
    }
    this.synthetic("pointermove", b.target, e.clientX, e.clientY, b.pointerId);

    // Native touch scroll is a browser-compositor gesture — a synthetic
    // pointermove cannot drive it — so the bridge scrolls the panel's own
    // overflow boxes: the innermost one that can move on each axis.
    for (const el of b.scrollers) {
      if (dlx !== 0 && el.scrollWidth > el.clientWidth) {
        el.scrollLeft = THREE.MathUtils.clamp(el.scrollLeft - dlx, 0, el.scrollWidth - el.clientWidth);
        dlx = 0;
      }
      if (dly !== 0 && el.scrollHeight > el.clientHeight) {
        el.scrollTop = THREE.MathUtils.clamp(el.scrollTop - dly, 0, el.scrollHeight - el.clientHeight);
        dly = 0;
      }
      if (dlx === 0 && dly === 0) break;
    }
  }

  private endBridge(e: PointerEvent) {
    const b = this.bridge;
    if (!b) return;
    this.bridge = null;
    const cancelled = e.type === "pointercancel";
    const wasTap = !cancelled
      && Math.hypot(e.clientX - b.startX, e.clientY - b.startY) < 10
      && performance.now() - b.startedAt < 600;
    this.synthetic(cancelled ? "pointercancel" : "pointerup", b.target, e.clientX, e.clientY, b.pointerId);
    if (!cancelled) this.syntheticMouse("mouseup", b.target, e.clientX, e.clientY);
    // A tap: the click lands on the element under the finger, at the finger's
    // own coordinates — exactly where the learner touched.
    if (wasTap) this.synthetic("click", b.target, e.clientX, e.clientY, b.pointerId);
  }

  private cancelBridge() {
    const b = this.bridge;
    if (!b) return;
    this.bridge = null;
    this.synthetic("pointercancel", b.target, b.lastX, b.lastY, b.pointerId);
  }

  // ───────────────────────────────────────────────────────────────────
  //  Public API used by React
  // ───────────────────────────────────────────────────────────────────

  setMode(mode: CameraMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.keyboard.enabled = mode === "fpp";
    this.studyFocus = false;
    this.pendingReadSlot = null;
    this.pendingPinAge = 0;
    this.screens.setReadSlot(null);
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

  /**
   * Queue a jump for the walking character (HUD jump button).
   * Edge-triggered and consumed by the next player update — safe to call in
   * any mode; outside walk mode the flag is simply cleared, never latched.
   */
  queueJump() {
    this.trek.jumpQueued = true;
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

/**
   * Push the current daylight state into the sky, the fog and the exposure.
   *
   * The water needs nothing here: its shader holds the very Vector3 the sky
   * writes, so the glint has already moved by the time this returns.
   */
  private applyDaylight() {
    const state = daylightAt(hourForMode(this.daylightMode));
    if (this.iceAge) winterDaylight(state);
    this.daylight = state;
    this.sky.applyDaylight(state);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(state.fog);
    fog.density = this.budget.fogDensity * (this.iceAge ? 1.18 : 1);
    // The air is lit by the same sun as the ground: its colour, its in-scatter
    // and the strength of the foliage transmission term all follow the hour.
    // Reading `sunDir.y` gives the elevation directly — it is a unit vector
    // towards the sun, so its Y component IS the sine of the elevation.
    this.atmosphere.update(state.sunDir.y, state.sunDir, state.sunColor, state.fog);
    this.scene.background = null;
    this.renderer.toneMappingExposure = state.exposure * this.gradeExposure;
    // The sun moved, so every shadow in the world is now wrong.
    this.requestShadowRefresh();
    if (this.submerged) this.applyUnderwater();
  }

  /**
   * Full blue when the camera (or the walker) is inside the river / ocean.
   * Fog density here is runtime-only — the quality-tier values stay pinned.
   */
  private applyUnderwater() {
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(0x0a58b8);
    fog.density = 0.06;
    this.scene.background = fog.color;
    this.renderer.toneMappingExposure = 0.78;
  }

  /** Season and daylight are independent: keep the selected hour when toggling. */
  setIceAge(enabled: boolean) {
    if (this.iceAge === enabled) return;
    this.iceAge = enabled;
    this.winter.setEnabled(enabled);
    this.water.setFrozen(enabled);
    this.sky.setWinter(enabled);
    this.screens.setWinter(enabled);
    this.applyDaylight();
  }

  /** Morning / midday / evening, or "auto" to follow the real clock. */
  setDaylightMode(mode: DaylightMode) {
    this.daylightMode = mode;
    this.daylightClock = 0;
    this.applyDaylight();
  }

  getDaylightMode(): DaylightMode {
    return this.daylightMode;
  }

  /** Decimal hour currently being rendered (for the HUD readout). */
  getDaylightHour(): number {
    return this.daylight.hour;
  }

    focus(preset: ViewPreset) {
    if (this.mode === "fpp") this.setMode("orbit");
    // Any view that is not a single board puts the full world back on budget.
    this.studyFocus = false;
    this.pendingReadSlot = null;
    this.pendingPinAge = 0;
    this.screens.setReadSlot(null);
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
   * Set the screen area the HUD chrome occupies, in CSS px.
   *
   * The next board framing (`focusBoard`) will fit the board inside the rect
   * this leaves free. The page measures its real trays and pushes the numbers
   * here — the engine stays free of any knowledge of the HUD layout.
   */
  setHudInsets(insets: HudInsets) {
    this.hudInsets = { ...insets };
  }

  /**
   * Grow or shrink the three study boards. Width, gap and reading radius
   * scale together; the camera must be re-framed by the caller (`focus`)
   * so a 3× board still fits the desk view with no crop.
   */
  setBoardScale(scale: number) {
    const s = scale < 1.25 ? 1 : scale < 1.75 ? 1.5 : scale < 2.5 ? 2 : 3;
    if (s === this.boardScale) return;
    this.boardScale = s;
    this.screens.setScale(s);
    this.syncBoardPlanes();
    this.requestShadowRefresh();
  }

  private syncBoardPlanes() {
    this.screens.screens.forEach((s, i) => {
      const plane = this.boardPlanes[i];
      if (!plane) return;
      this.tmpV.set(Math.sin(s.placement.yaw), 0, Math.cos(s.placement.yaw));
      plane.setFromNormalAndCoplanarPoint(this.tmpV, s.placement.position);
    });
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
   *
   * THE CLICKS-MUST-WORK RULE. The board is fitted against the part of the
   * viewport the HUD does NOT cover (see `hudInsets`). Fitting against the
   * full viewport used to park the board's bottom rows behind the tray
   * buttons — the buttons there could never be clicked, which is exactly the
   * "kabhi kabhi click nahi hota, zoom out karo to chalta hai" bug.
   *
   * SQUARE-ON IS LOAD-BEARING. The camera is parked ON THE BOARD'S FACE
   * NORMAL — the orbit target is the board's own centre, pitch 0 — so the
   * board projects as a perfect rectangle centred on the screen. Off-axis
   * full-screen boards shear into a trapezoid, and the input bridge's
   * screen-space target lookup (see localOnBoard) is at its most exact on a
   * level rectangle. With the camera square-on the board stays screen-
   * centred, so it clears each chrome edge by a HALF board — the symmetric
   * limits below — and every pixel of it stays reachable at any device size.
   */
  private focusBoard(slot: LecternSlot) {
    const placement = this.screens.byId(slot)?.placement;
    if (!placement) return;
    this.studyFocus = true;
    this.orbit.autoRotate = false;
    // Pin AFTER the pan lands. Unpinning the live board while the camera is
    // still looking at it is what painted the previous page black, and pinning
    // the next one off-axis is what spawned the 60 m sky page.
    this.pendingReadSlot = slot;
    this.pendingPinAge = 0;

    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const needW = LECTERN_BOARD_WIDTH * this.boardScale + BOARD_VIEW_MARGIN * 2;
    const needH = LECTERN_BOARD_HEIGHT * this.boardScale + BOARD_VIEW_MARGIN * 2;

    // The board projects to the screen centre, so each side has to clear the
    // chrome from the centre line: the nearer edge on that axis wins. The 8 px
    // floor is a numeric guard only — it must NEVER push the limit past the
    // chrome, or the board's rows sit under a tray again (the original bug).
    const ins = this.hudInsets;
    const limitH = Math.max(8, Math.min(this.viewH / 2 - ins.top, this.viewH / 2 - ins.bottom));
    const limitW = Math.max(8, Math.min(this.viewW / 2 - ins.left, this.viewW / 2 - ins.right));
    const distance = Math.max(
      (needH / 2 / Math.tan(vFov / 2)) / (2 * limitH / this.viewH),
      (needW / 2 / Math.tan(hFov / 2)) / (2 * limitW / this.viewW),
    );

    // The orbit target is the board's own centre: with pitch 0 the camera
    // sits exactly on the face normal, square on the page, at every size.
    this.orbit.panTo(this.tmpV.copy(placement.position), distance, placement.yaw, 0);
  }

  /**
   * Frame ALL THREE boards from the student's seat — the "Student" preset.
   * Same fitting maths, but against the full width of the trio (the outer
   * corner of a side board, mirrored) so nothing is cut off.
   */
  private focusStudentDesk() {
    const placements = this.screens.screens.map((s) => s.placement);
    let halfSpan = 0;
    let sumZ = 0;
    const half = (LECTERN_BOARD_WIDTH * this.boardScale) / 2;
    for (const p of placements) {
      const ax = Math.cos(p.yaw);
      const az = -Math.sin(p.yaw);
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
    const needH = LECTERN_BOARD_HEIGHT * this.boardScale + BOARD_VIEW_MARGIN * 2;
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
    this.viewW = width;
    this.viewH = height;

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
   * The aspect-corrected base fov, as last computed by applyFov.
   *
   * The walk mode's sprint FOV kick is ADDED to this every frame (see the
   * tick), so the kick can never fight the narrow-screen correction — the
   * base stays owned in exactly one place.
   */
  private correctedFov = 52;

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
    this.correctedFov = this.camera.fov;
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
      if (this.keyboard.consumeJump()) this.trek.jumpQueued = true;
      this.trek.update(dt, { x: mx, y: my, active }, this.camera, WORLD_REACH);
      if (!this.avatar.seated) {
        this.avatar.group.position.copy(this.trek.position);
        this.avatar.group.rotation.y = this.trek.rotation;
      }
      this.avatar.setVisible(true);
      // Pose the rig from the locomotion state (gait, lean, IK, landing).
      this.avatar.update(dt, time, this.trek, this.camera);
      // Sprint FOV kick on top of the aspect-corrected base (see applyFov).
      this.camera.fov = this.correctedFov + this.trek.fovKickDegrees();
      this.camera.updateProjectionMatrix();
    } else {
      this.orbit.update(dt, this.camera);
      if (this.pendingReadSlot) {
        this.pendingPinAge += dt;
        if (this.orbit.settled() || this.pendingPinAge > 0.85) {
          this.screens.setReadSlot(this.pendingReadSlot);
          this.pendingReadSlot = null;
          this.pendingPinAge = 0;
        }
      }
      this.avatar.setVisible(true);
      // Seated: breathing only — the folds stay where setSeated put them.
      this.avatar.update(dt, time, this.trek, this.camera);
    }

    // Underwater: the walker is allowed into the river, and when they (or
    // the camera) go under the waterline the whole view goes saturated blue
    // so it reads as being inside the water, not as a transparent sheet.
    {
      const cx = this.camera.position.x;
      const cy = this.camera.position.y;
      const cz = this.camera.position.z;
      const camUnder =
        (insideRiver(cx, cz) && cy < WATER_LEVEL + 0.15) ||
        (coastWeight(cx, cz) > 0.42 && cy < OCEAN_LEVEL + 0.15);
      const walkUnder =
        this.mode === "fpp" &&
        !this.avatar.seated &&
        (insideRiver(this.trek.position.x, this.trek.position.z) ||
          (coastWeight(this.trek.position.x, this.trek.position.z) > 0.42 &&
            this.trek.position.y < OCEAN_LEVEL + 0.4));
      const under = camUnder || walkUnder;
      if (under !== this.submerged) {
        this.submerged = under;
        if (under) this.applyUnderwater();
        else this.applyDaylight();
      }
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
      this.sorrel?.update(time, this.wind);
      this.water.update(adt, time);
      // The bay's idle motion (boat, umbrellas) rides the same budget.
      this.structures.update(time);
    }

    this.aiClock += dt;
    if (this.aiClock >= (study ? 1 / 12 : 1 / 30)) {
      this.wildlife.update(this.aiClock, time, this.camera.position);
      this.birds.update(this.aiClock, time, this.wind);
      this.student.update(time);
      this.aiClock = 0;
    }

    // In auto mode the clock is re-read every 20 s. The sun crosses the sky in
    // 12.5 hours, so that is under a tenth of a degree per step — far below
    // what the eye can catch, while still costing nothing: one date read and a
    // handful of colour lerps, three times a minute.
    if (this.daylightMode === "auto") {
      this.daylightClock += dt;
      if (this.daylightClock >= 20) {
        this.daylightClock = 0;
        this.applyDaylight();
      }
    }

    this.skyClock += dt;
    if (this.skyClock >= (study ? 1 / 8 : 1 / 20)) {
      this.sky.update(this.skyClock, time, this.wind, this.camera);
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
      // Park the light on the REAL sun direction, 70 m from the viewer. The
      // old fixed (+44, 48, -50) offset was a hardcoded morning sun: shadows
      // would have pointed the same way at dusk as at dawn, which is the
      // giveaway that makes a moving sun look fake.
      this.sky.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z);
      this.sky.sun.position.copy(this.sky.sunDir).multiplyScalar(70).add(this.sky.sun.target.position);
      this.sky.sun.target.updateMatrixWorld();
      if (this.shadowDirty > 0) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowDirty -= 1;
      }
    }


    this.winter.update(dt, this.camera, this.wind, this.reducedMotion);
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
    this.screens.dispose();
    disposeGroup(this.desk);
    this.avatar.dispose();
    this.keyboard.dispose();
    this.grass.dispose();
    this.rocks.dispose();
    this.flora.dispose();
    this.sorrel?.dispose();
    this.birds.dispose();
    this.wildlife.dispose();
    this.water.dispose();
    this.structures.dispose();
    this.sky.dispose();
    this.board.dispose();
    this.student.dispose();
    this.atmosphere.dispose();
    this.weathering.dispose();
    this.winter.dispose();
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
