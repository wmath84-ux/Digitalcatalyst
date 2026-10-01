// src/nature3d/engine/scene.ts
//
// THE SANCTUARY RUNTIME.
//
// One class owns the renderer, the scene graph, the camera rig and the frame
// loop. React never touches Three.js objects directly — it calls the small
// imperative API at the bottom (`setWind`, `focus`, …) and reads stats
// through a callback. That separation is what keeps the
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
import {
  AdaptiveResolution,
  budgetFor,
  detectTier,
  halfPrecisionMaterial,
  halfPrecisionTree,
  type QualityBudget,
  type QualityTier,
} from "./quality";
import { createTextures, halveTextureSet, patchGroundPhoto, loadWaterPhotos, GROUND_PHOTO_URL, type TextureSet } from "./textures";
import { buildTerrain, coastWeight, FLY_LIMIT_RADIUS, insideRiver, OCEAN_LEVEL, terrainHeight, WATER_LEVEL, WORLD_HALF } from "./terrain";
import { createGrassField, type GrassField } from "./grass";
import { createHillGrassField, type HillGrassField } from "./hillGrass";
import { canopyShadowDiscs, createFlora, getTreeObstacles, type Flora } from "./flora";
import { createSorrelField, type SorrelField } from "./sorrel";
import { createGrassTuftField, type GrassTuftField } from "./grassTufts";
import { createMossBank, type MossBank } from "./moss";
import { createTropicalField, type TropicalField } from "./tropicalFlora";
import { createAtmosphere, type Atmosphere } from "./atmosphere";
import { createWeathering, type Weathering } from "./weathering";
import { createWinter, winterDaylight, type WinterSystem } from "./winter";
import { createRockField, type RockField } from "./rocks";
import { createWildlife, type Wildlife } from "./wildlife";
import { createMountainForest, type MountainForest } from "./mountainForest";
import { createFarRange, type FarRange } from "./farRange";
import { createFarImpostorForest, type FarImpostorForest } from "./farImpostors";
import { createWater, type WaterSystem } from "./water";
import { createSky, type SkySystem } from "./sky";
import { daylightAt, hourForMode, type DaylightMode, type DaylightState } from "./daylight";
import { createBoard, createBoardStand, BOARD_HILL, type BoardHandle } from "./board";
import { createDayBed, type DayBed } from "./dayBed";
import { createWarehouse, type Warehouse } from "./warehouse";
import {
  createBeachHouses,
  ensureBeachHouseSites,
  type BeachHouses,
} from "./beachHouses";
import { WAREHOUSE_HALF_X, WAREHOUSE_HALF_Z, WAREHOUSE_HEIGHT, WAREHOUSE_X, WAREHOUSE_YAW, WAREHOUSE_Z } from "./warehouseSite";
import { HOUSE_RIDGE, beachHouseSites, type BeachHouseSite } from "./beachHouseSite";
import { OrbitRig } from "./controls";
import { stageLocalDelta } from "../stagePointer";
import { createDesk, disposeGroup, LECTERN_BOARD_HEIGHT, LECTERN_BOARD_WIDTH, type LecternSlot } from "./lectern";
import {
  createBoardScreens,
  PX_TO_M,
  SCREEN_PX_HEIGHT,
  SCREEN_PX_WIDTH,
  studyLetterbox,
  type BoardScreen,
  type BoardScreensHandle,
} from "./boardScreens";
import { createEmptyAvatar, type TrekAvatar } from "./characterPlayer";
import { CharacterController } from "./characterController";
import { CharacterCollisionWorld, type CharacterCollider } from "./characterCollision";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS, CHARACTER_SCALE, CHARACTER_SPAWN, characterEyeHeight, type CharacterCameraMode } from "./characterConfig";
import { FALLBACK_CHARACTER_STATUS, readCharacterManifest, type CharacterAssetStatus } from "./characterManifest";
import { createStructures, type Structures } from "./structures";
import { TREK } from "./regions";
import { cullDistanceForPx } from "./cull";

/**
 * Air left around a board when it is framed on its own, in metres. The brief
 * asks for "thoda sa area bhi halka sa 1/2 meter ka" — the board fills the
 * view but a sliver of the meadow still shows, so it never reads as a flat
 * fullscreen page that has lost its place in the world.
 */
const BOARD_VIEW_MARGIN = 0.5;

/** The anime skybox panorama (equirect JPEG extracted from the Sketchfab GLB). */
const ANIME_SKY_URL = "sanctuary/skybox_anime_sky.jpg";

/** PUBG/BGMI-style fixed noon: one sun angle, one sky grade, no dynamic day/night. */
const FIXED_PUBG_DAYLIGHT_HOUR = 12.35;
/** Vegetation is static in the reconstructed mobile world; no wind sway ticks. */
const STATIC_VEGETATION_WORLD = true;

export type ViewPreset =
  | "sanctuary" | "board" | "student" | "waterfall"
  | "trek" | "world" | "warehouse" | "houses"
  // The three study boards. Each frames ONE board edge-to-edge.
  | "reading" | "notes" | "mindmap";

export interface SceneStats {
  fps: number;
  tier: QualityTier;
  pixelRatio: number;
  draws: number;
  triangles: number;
  /**
   * The frame cadence the pacer is currently holding (60 or the tier's
   * fallback, 30 on low). Surfaced so a device stuck at 30 can be told apart
   * from one that is simply GPU-bound below both: if `fps` sits near
   * `cadence`, the engine is pacing; if it sits well below, the GPU is.
   */
  cadence: number;
  /** Thermal shed rung, 0…4. Anything above 0 means the GPU was drowning. */
  shed: number;
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
  /** Discrete changes only; no React updates in the movement/render loop. */
  onCharacterMode?: (mode: CharacterCameraMode) => void;
  onCharacterAsset?: (status: CharacterAssetStatus) => void;
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
  /**
   * GRASS ON EVERY HILL — the world-wide sward covering every hill, stone
   * and mountain across the full 360° circle (see `hillGrass.ts` and the
   * owner's reference blend, `pahadon ke upar gras replace hill.blend`).
   */
  private hillGrass: HillGrassField;
  private flora: Flora;
  /**
   * The 360° mountain-forest ring — the owner's uploaded "landscape is a
   * forest in the mountains" diorama instanced around the world's edge
   * (see `mountainForest.ts`). Like the sorrel field it loads
   * asynchronously: null until the glTF resolves, and a failed load simply
   * leaves the terrain's own 150 m hills on skyline duty.
   */
  private mountainForest: MountainForest | null = null;
  /**
   * THE FAR RANGE — distant mountains on the open sea, far out beyond the
   * world's edge (see `farRange.ts`). Built synchronously at boot (one
   * ~1.4 k-vertex mesh, one draw call); static for the life of the scene.
   */
  private farRange: FarRange | null = null;
  /** PUBG-style far forest HLOD: static alpha-card buckets at the skyline. */
  private farImpostors: FarImpostorForest | null = null;
  /**
   * The sorrel field (the meadow's real 3D ground plants). Its asset is
   * loaded asynchronously — it is the only world piece that is — so this
   * stays null until the load resolves, and a failed load leaves it null
   * instead of taking the sanctuary down.
   */
  private sorrel: SorrelField | null = null;
  /** Real 3D grass clumps (Grass Medium 02, five variants) — see `grassTufts.ts`. */
  private grassTufts: GrassTuftField | null = null;
  /** The mossy edge lining both banks of the river — see `moss.ts`. */
  private mossBank: MossBank | null = null;
  /**
   * The tropical jungle — the owner's six-variant low-poly plant set
   * (palms, banana, fern, three leaf species), 310–1130 instances of
   * 7–20 m scattered over the WHOLE world (meadow, plains, trek, mountain
   * ring) plus six hand-placed at the villa — see `tropicalFlora.ts`.
   */
  private tropical: TropicalField | null = null;
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
  /**
   * The anime skybox (see `sky.ts`): the wanted state, and the lazily-loaded
   * panorama shared for the life of the scene so toggling never re-downloads.
   * A failed load resolves to null and the procedural dome simply stays.
   */
  private animeSkyWanted = false;
  private animeSkyTexture: Promise<THREE.Texture | null> | null = null;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private rocks: RockField;
  private wildlife: Wildlife;
  private water: WaterSystem;
  private sky: SkySystem;
  /** The bay district: tropical-modern buildings, landmark, jetty, props. */
  private structures: Structures;
  private board: BoardHandle;
  /** The Vintage Day Bed — the learner's seat, loaded async (dayBed.ts). */
  private dayBed: DayBed | null = null;
  /** The abandoned warehouse, loaded async (warehouse.ts). */
  private warehouse: Warehouse | null = null;
  /**
   * THE BEACH-HOUSE DISTRICT — the owner's uploaded house, six times over
   * (beachHouses.ts). Its SITES are solved before the first scatter, so
   * the grass, the plants, the trees and the rocks already know the pads
   * are there; the model itself is async and fail-soft.
   */
  private beachHouses: BeachHouses | null = null;
  /** One standing playable character; no seated student is constructed. */
  private avatar: TrekAvatar;
  private characterWorld: CharacterCollisionWorld;
  private character: CharacterController;
  private characterPaused = false;
  private characterStarted = false;
  private characterSpawn = new THREE.Vector3(CHARACTER_SPAWN.x, 0, CHARACTER_SPAWN.z);
  private characterAssetStatus: CharacterAssetStatus = FALLBACK_CHARACTER_STATUS;
  private movementStick = new THREE.Vector2();
  private gamepadJumpHeld = false;
  private gamepadCoverHeld = false;
  private gamepadCameraHeld = false;
  /** The three live course-player boards + their WebGL frames. */
  private screens: BoardScreensHandle;
  private desk: THREE.Group;

  private orbit = new OrbitRig();

  /** The HUD chrome keeps a board framing away from the trays (see focusBoard). */
  private hudInsets: HudInsets = { top: 48, bottom: 80, left: 12, right: 12 };
  /** Last viewport size, for the safe-rect maths in focusBoard. */
  private viewW = 1;
  private viewH = 1;
  /**
   * The fit-controlled study camera currently selected. Keeping this in the
   * engine (rather than only in React) lets resize/orientation changes and HUD
   * inset changes recompute the projection immediately — essential on phones,
   * where browser chrome and landscape rotation change the usable rectangle.
   */
  private fittedStudyPreset: "student" | LecternSlot | null = null;

  private clock = new THREE.Clock();
  private adaptive: AdaptiveResolution;
  private raf = 0;
  private running = false;
  private visible = true;
  private wind = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private lastStats = 0;
  /**
   * The one stats payload, mutated in place. ZERO-ALLOCATION rule: the loop
   * is not allowed to hand a fresh object to onStats twice a second for the
   * life of the scene — GC pressure is exactly what the research bans, so
   * the same reference is reused forever (the page only reads it).
   */
  private readonly statsObj: SceneStats = {
    fps: 0,
    tier: "low",
    pixelRatio: 1,
    draws: 0,
    triangles: 0,
    cadence: 60,
    shed: 0,
  };
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
  /** Seconds since the world-streaming radii were last re-evaluated. */
  private streamClock = 0;
  /** The sunny-afternoon brightness push applied on top of the per-hour curve. */
  private gradeExposure = 1.52;
  /** True while the camera (or the walker) is under the water line. */
  private submerged = false;
  private pointerPrev = { x: 0, y: 0, id: -1, down: false };
  private pinchPrev = 0;
  private pinchMid = { x: 0, y: 0, ready: false };
  /**
   * Where each finger went DOWN. Tap detection must measure movement
   * against this, not against the last move event: `pointers` tracks the
   * live position, so a finger that paused before lifting measured
   * ~0 px of movement and EVERY drag that ended in a stillness fired a
   * phantom tap.
   */
  private downPos: { x: number; y: number; id: number } | null = null;
  /**
   * The pointers that took part in a two-finger pinch. A pinch is NEVER a
   * tap: lifting the two fingers of a pinch-out lands inside the 340 ms
   * double-tap window, and the ground-double-tap used to fire — the drone
   * "flew" to the spot under the fingers at a fixed 42 m the instant the
   * user let go. That is the reported "pinch out, lift, zoom snaps back"
   * bug.
   */
  private pinchTainted = new Set<number>();
  private pointers = new Map<number, { x: number; y: number }>();
  private keys = new Set<string>();
  private lastGroundTap = 0;
  private pointerDelta = new THREE.Vector2();
  /**
   * Foliage atmosphere registration option. On the plant-diet tier the
   * per-fragment sun-transmission chain (one pow + several dot products over
   * every grass/leaf pixel) is the meadow's most expensive shader feature,
   * so foliage registers as a plain solid instead — haze kept, glow dropped.
   * Assigned in the constructor (field initializers run before `budget`).
   */
  private foliageOpts: { foliage: true } | undefined;
  /**
   * Thermal fail-safe ladder (0–2): raised one rung at a time by the DRS
   * scaler's `consumeThermalHot` signal, applied to every sheddable field.
   * See SANCTUARY_MOBILE_PERFORMANCE.md (ACTIVATE_THERMAL_DRS_PACING).
   */
  private shedLevel = 0;
  /** Wall-clock gate for the tier's fps cap (the Swappy-style pacer). */
  private paceNext = 0;
  /** Previous rendered frame's start time — the DRS's wall-clock signal. */
  private lastTickStart = 0;

  // ── The board input bridge (see localOnBoard) ─────────────────────────
  /** The synthetic gesture currently being replayed into a board, if any. */
  private bridge: BoardBridge | null = null;
  /** One world-space plane per study board front face — the bridge's ray targets. */
  private boardPlanes: THREE.Plane[] = [];

  constructor(private opts: SanctuaryOptions) {
    const tier = opts.tier ?? detectTier();
    this.budget = budgetFor(tier);
    this.foliageOpts = this.budget.cheapPlants ? undefined : { foliage: true };

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

    // SMOKE FOG — three.js manual (https://threejs.org/manual/#en/fog):
    // THREE.Fog(color, near, far) is the standard open-world distance fog.
    // Closer than near = clear; further than far = full smoke colour;
    // between = smooth fade. FogExp2 cannot express "clear for 20 m then
    // thicken" — that is exactly what linear Fog is for.
    this.scene.fog = new THREE.Fog(
      0xb8d0e8,
      this.budget.fogNear,
      this.budget.fogFar,
    );
    // Clear colour = fog/horizon blue. Any pixel the sky dome misses (far
    // clip, first frame before update) must NOT flash pure black — that was
    // the rotating black circle on zoom-out.
    this.renderer.setClearColor(0xb8d0e8, 1);

    // Anisotropy is a bandwidth consumer on tile GPUs — the budget owns the
    // cap now (1 on low, 4 medium, 8 desktop), not a one-off low/else split.
    const aniso = Math.min(this.renderer.capabilities.getMaxAnisotropy(), this.budget.maxAniso);
    this.textures = createTextures(aniso);
    // The aerial farmland scan streams in over the procedural grit (frame one
    // is already dressed; the photo simply gains its fields). Low tier takes a
    // 1024 px copy — the full 2048 scan is a bandwidth consumer it skipped
    // for every procedural map above.
    patchGroundPhoto(this.textures.ground, GROUND_PHOTO_URL, this.budget.cheapPlants ? 1024 : 2048);
    // MIPMAP BIAS diet, low tier: every procedural texture repainted at half
    // size before its first upload — a quarter of the VRAM and of the
    // per-frame texture bandwidth (see textures.ts#halveTextureSet).
    if (this.budget.cheapPlants) halveTextureSet(this.textures);

    // AIR + WEATHERING are built before any geometry, because every material
    // created from here on is offered to them as it is made (see below). Both
    // are pure shader injections with shared uniforms: no passes, no render
    // targets, no per-frame CPU work.
    this.atmosphere = createAtmosphere(this.budget);
    this.weathering = createWeathering(this.textures.weather, this.budget.tier);
    this.winter = createWinter(this.budget.tier);
    this.scene.add(this.winter.group);

    // ── Build the world ────────────────────────────────────────────────
    //
    // THE BEACH-HOUSE PADS COME FIRST. `ensureBeachHouseSites()` solves the
    // six placements against the NATURAL height field and installs them into
    // `beachHouseSite.ts`; from this line on, `terrainHeight` levels a yard
    // under every one of them. It has to happen before the ground mesh is
    // built (150 000 samples), before the grass and before the tropical
    // field, or those passes would describe a world that never exists —
    // grass standing where a floor is, houses floating over a green hollow.
    // Deterministic and idempotent: the same six sites on every machine.
    ensureBeachHouseSites();
    const waterAt = (x: number, z: number) => insideRiver(x, z) ? WATER_LEVEL : coastWeight(x, z) > 0.42 ? OCEAN_LEVEL : -Infinity;
    this.characterWorld = new CharacterCollisionWorld(
      (x, z) => this.iceAge ? Math.max(terrainHeight(x, z), waterAt(x, z)) : terrainHeight(x, z),
      FLY_LIMIT_RADIUS - 12,
      waterAt,
    );
    this.character = new CharacterController(this.characterWorld);

    this.sky = createSky(this.textures, this.budget);
    this.scene.add(this.sky.group);
    // Procedural gradient dome is the default sky. Anime panorama is opt-in
    // via the Scene menu (`setAnimeSky(true)`). Boot never auto-loads the
    // 2.5 MB equirect — keeps first paint light and the sky natural.
    this.setAnimeSky(false);
    // The sky dome fills the whole screen every frame — one of the best
    // fp16 candidates on the diet tier.
    if (this.budget.halfPrecision) halfPrecisionTree(this.sky.group);

    // Tree shadow discs are computed here, BEFORE the terrain, because the
    // terrain bakes them into its vertex colours during the build. `treeLayout`
    // is pure and seeded, so this yields exactly the trees createFlora will
    // place a few lines later.
    const bakedObjectShadows = [
      ...canopyShadowDiscs(this.budget.treeCount),
      ...beachHouseSites().map((site) => ({
        // Fixed fake shadow/contact grounding for instanced houses. A circular
        // AO proxy is intentionally cheap; the sun angle is fixed, so this is
        // the baked-shadow replacement for runtime shadow maps.
        x: site.x - Math.sin(site.yaw) * site.halfZ * 0.42,
        z: site.z - Math.cos(site.yaw) * site.halfZ * 0.42,
        r: Math.max(site.halfX, site.halfZ) * 1.55,
      })),
      { x: WAREHOUSE_X - 4, z: WAREHOUSE_Z - 7, r: Math.max(WAREHOUSE_HEIGHT * 0.62, 18) },
    ];
    const terrain = buildTerrain(
      this.budget,
      this.textures.ground,
      bakedObjectShadows,
    );
    this.scene.add(terrain);
    // The ground takes the atmosphere pass but NOT the transmission term —
    // soil does not translucently glow when the sun is behind it.
    this.atmosphere.registerTree(terrain);
    this.winter.registerTree(terrain, "ground");
    if (this.budget.halfPrecision) halfPrecisionTree(terrain);

    // THE FAR RANGE — "out of the world bhi expand karo … dur pahad bhi
    // dikhte hain bahut dur, to vah aur bhi real lagenge" (owner brief
    // 2026-09-29). A ridged mountain chain standing on the open sea way past
    // the island edge, registered with the SAME atmosphere pass as the
    // island: the reduced daytime smoke (fogFar 420 → 4200) is what makes it
    // visible, and the time-of-day smoke curve is what buries it again in
    // the dawn haze and the night — the range breathes with the day.
    this.farRange = createFarRange(this.budget);
    this.scene.add(this.farRange.group);
    this.atmosphere.registerTree(this.farRange.group);
    if (this.budget.halfPrecision) halfPrecisionTree(this.farRange.group);

    this.farImpostors = createFarImpostorForest(this.textures, this.budget);
    this.scene.add(this.farImpostors.group);
    this.farImpostors.materials.forEach((m) => this.atmosphere.register(m));
    if (this.budget.halfPrecision) halfPrecisionTree(this.farImpostors.group);

    // ROCKS BEFORE GRASS: the rock kit publishes the base of every boulder it
    // places, and the grass field plants a skirt of blades around each one
    // (principle 50 — a rock with nothing growing at its base reads as pasted
    // on, however good the rock is).
    this.rocks = createRockField(this.textures, this.budget, this.weathering);
    this.scene.add(this.rocks.group);
    this.installRockColliders();
    this.atmosphere.registerTree(this.rocks.group);
    this.winter.registerTree(this.rocks.group);
    if (this.budget.halfPrecision) halfPrecisionTree(this.rocks.group);

    this.grass = createGrassField(this.textures.grassBlade, this.budget, this.rocks.skirtPoints);
    this.scene.add(this.grass.group);
    // Grass IS foliage: it gets the backlit transmission term — except on the
    // plant-diet tier, where the transmission chain is the single most
    // expensive fragment feature in the meadow (one pow + several dots over
    // tens of thousands of grass pixels). There the foliage registers as a
    // plain solid: it keeps the distance haze, drops the glow.
    this.grass.materials.forEach((m) => this.atmosphere.register(m, this.foliageOpts));
    this.grass.materials.forEach((m) => this.winter.register(m, "foliage"));
    if (this.budget.halfPrecision) this.grass.materials.forEach(halfPrecisionMaterial);

    // GRASS ON EVERY HILL — the owner's directive ("jitne bhi hills aur
    // stones aur pahadiya hai sabhi per ghas ... 360 degree all around"):
    // one dense sward over every mountain flank, ridge and boulder, built
    // from the same shared height field and leaning with every slope. It
    // glows backlit exactly like the meadow grass it continues.
    this.hillGrass = createHillGrassField(this.textures.grassBlade, this.budget, this.rocks.skirtPoints);
    this.scene.add(this.hillGrass.group);
    this.hillGrass.materials.forEach((m) => this.atmosphere.register(m, this.foliageOpts));
    this.hillGrass.materials.forEach((m) => this.winter.register(m, "foliage"));
    if (this.budget.halfPrecision) this.hillGrass.materials.forEach(halfPrecisionMaterial);

    // THE REAL MOUNTAIN RING — the owner's uploaded forest-in-the-mountains
    // diorama ("maine upload kar diya hai ... isko exactly implement karo
    // charon taraf, purane hills ko replace karo"), instanced around
    // the world's edge on the 150 m arc. Async like the other model fields:
    // it lands a beat after boot, and a failed load leaves the terrain's
    // own hills carrying the skyline.
    void createMountainForest(this.budget).then((forest) => {
      if (this.disposed) {
        forest.dispose();
        return;
      }
      this.mountainForest = forest;
      this.scene.add(forest.group);
      forest.foliageMaterials.forEach((m) => this.atmosphere.register(m, this.foliageOpts));
      forest.solidMaterials.forEach((m) => this.atmosphere.register(m));
      forest.foliageMaterials.forEach((m) => this.winter.register(m, "foliage"));
      forest.solidMaterials.forEach((m) => this.winter.register(m));
      if (this.budget.halfPrecision) {
        forest.foliageMaterials.forEach(halfPrecisionMaterial);
        forest.solidMaterials.forEach(halfPrecisionMaterial);
      }
    }).catch(() => { /* createMountainForest already degraded to an empty group */ });

    this.flora = createFlora(this.textures, this.budget);
    this.scene.add(this.flora.group);
    this.syncTreeColliders();
    // Leaves glow when the sun is behind them; bark, shrubs and flower stems do
    // not. The factory publishes the two lists rather than leaving the scene to
    // guess which material is which.
    this.flora.foliageMaterials.forEach((m) => this.atmosphere.register(m, this.foliageOpts));
    this.flora.solidMaterials.forEach((m) => this.atmosphere.register(m));
    this.flora.foliageMaterials.forEach((m) => this.winter.register(m, "foliage"));
    this.flora.solidMaterials.forEach((m) => this.winter.register(m));
    if (this.budget.halfPrecision) {
      this.flora.foliageMaterials.forEach(halfPrecisionMaterial);
      this.flora.solidMaterials.forEach(halfPrecisionMaterial);
    }

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
      // FIX: prevent initial overload pop-in near board — start hidden, apply final shed, then show only final state
      field.group.visible = false;
      this.scene.add(field.group);
      // Thin leaves glow when the sun is behind them, like the grass —
      // except on the plant-diet tier (see foliageOpts).
      field.materials.forEach((m) => this.atmosphere.register(m, this.foliageOpts));
      field.materials.forEach((m) => this.winter.register(m, "foliage"));
      if (this.budget.halfPrecision) field.materials.forEach(halfPrecisionMaterial);
      // A shed that fired while the asset was still loading lands now — apply final state before showing
      field.setShed(this.shedLevel);
      // Show only after final count is applied, no overload flash
      requestAnimationFrame(() => { field.group.visible = true; });
    }).catch((err) => {
      // createSorrelField already warns on a load failure; this catches
      // anything later in the wiring so a broken field is never silent.
      console.warn("[sanctuary] sorrel field failed", err);
    });

    // THE GRASS TUFT FIELD — real 3D clumps (Grass Medium 02, all five
    // variants) decorating the meadow between the blades and the sorrel.
    createGrassTuftField(this.budget, aniso, this.rocks.grassPoints).then((field) => {
      if (this.disposed) {
        field.dispose();
        return;
      }
      this.grassTufts = field;
      field.group.visible = false;
      this.scene.add(field.group);
      field.materials.forEach((m) => this.atmosphere.register(m, this.foliageOpts));
      field.materials.forEach((m) => this.winter.register(m, "foliage"));
      if (this.budget.halfPrecision) field.materials.forEach(halfPrecisionMaterial);
      field.setShed(this.shedLevel);
      requestAnimationFrame(() => { field.group.visible = true; });
    }).catch((err) => {
      // createGrassTuftField already warns per failed variant; this catches
      // anything later in the wiring so a broken field is never silent.
      console.warn("[sanctuary] grass tuft field failed", err);
    });

    // THE MOSS BANK — twelve moss variants lining both banks of the river,
    // at least a clump per metre of bank.
    createMossBank(this.budget, aniso).then((field) => {
      if (this.disposed) {
        field.dispose();
        return;
      }
      this.mossBank = field;
      field.group.visible = false;
      this.scene.add(field.group);
      field.materials.forEach((m) => this.atmosphere.register(m, this.foliageOpts));
      field.materials.forEach((m) => this.winter.register(m, "foliage"));
      if (this.budget.halfPrecision) field.materials.forEach(halfPrecisionMaterial);
      field.setShed(this.shedLevel);
      requestAnimationFrame(() => { field.group.visible = true; });
    }).catch((err) => {
      // createMossBank already warns on a load failure; this catches
      // anything later in the wiring so a broken field is never silent.
      console.warn("[sanctuary] moss bank failed", err);
    });

    // THE TROPICAL JUNGLE — the owner's low-poly tropical set (six variants,
    // all of them), passed 2: scattered over the WHOLE world — the study
    // meadow, the plains, the trek district and the mountain ring — 310 to
    // 1130 plants of 7–20 m per tier, plus a hand-placed cluster of six at
    // the villa's foundation. The cards' transparent padding is measured
    // and trimmed so every plant's base sits on the ground. Same async,
    // fail-soft load as the other plant fields: a failed download degrades
    // to the grass + sorrel meadow instead of breaking the scene.
    createTropicalField(this.budget, aniso).then((field) => {
      if (this.disposed) {
        field.dispose();
        return;
      }
      this.tropical = field;
      this.syncTreeColliders();
      field.group.visible = false;
      this.scene.add(field.group);
      field.materials.forEach((m) => this.atmosphere.register(m, this.foliageOpts));
      field.materials.forEach((m) => this.winter.register(m, "foliage"));
      if (this.budget.halfPrecision) field.materials.forEach(halfPrecisionMaterial);
      // A shed that fired while the asset was still loading lands now — apply final state before showing
      field.setShed(this.shedLevel);
      requestAnimationFrame(() => { field.group.visible = true; });
      console.info(`[sanctuary] tropical jungle planted: ${field.count} plants (7–20 m)`);
    }).catch((err) => {
      console.warn("[sanctuary] tropical jungle failed", err);
    });

    // ── No wildlife at all ─────────────────────────────────────────────
    //
    // Every animal is gone at the owner's request: the buffalo, cows, deer,
    // sheep and goats that stood on the meadow floor, AND the birds that
    // perched in the canopies and circled overhead. None of them read as
    // anything but noise at the scale they were drawn, and together they cost
    // ~30 draw calls plus a per-frame matrix update for every body, wing and
    // leg pivot — real frame time spent on silhouettes nobody could make out.
    //
    // The grazing herd is still CONSTRUCTED with a zero animal budget rather
    // than deleted: `createWildlife` builds its species geometry and fur
    // material LAZILY (both are Maps, filled on first `pieceSet` call), so at
    // `animalCount: 0` it allocates nothing and its `update` walks an empty
    // array. Keeping the object means `Sanctuary`'s update/dispose paths stay
    // honest and re-enabling the herd later is a one-line budget change.
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
    if (this.budget.halfPrecision) {
      this.water.materials.forEach(halfPrecisionMaterial);
      this.water.iceMaterials.forEach(halfPrecisionMaterial);
    }

    // USER DIRECTIVE (the "small flat cube of water" GLB): its exact baked
    // water maps — caustics, roughness glint, photographic surface — stream
    // onto EVERY water (the centre river, the ocean, the fall) with the
    // procedural water as the instant frame-one look and the permanent
    // fallback. Pure shader-side animation; nothing new on the CPU.
    void loadWaterPhotos(aniso).then((photos) => {
      if (photos) this.water.setPhotos(photos);
    });

    // THE BAY DISTRICT — jetty, props, distant islands.
    // Built from the same height field everything else reads, so the bay
    // furniture sits on the measured shoreline. Its materials join the air
    // like every other solid: the far islands fade into the haze exactly as
    // the mountains do (Phase 19 — no full-contrast pastes).
    this.structures = createStructures(this.budget);
    this.scene.add(this.structures.group);
    this.atmosphere.registerTree(this.structures.group);
    this.winter.registerTree(this.structures.group);
    if (this.budget.halfPrecision) halfPrecisionTree(this.structures.group);

    // Light the world for the current moment before the first frame, so the
    // sanctuary never flashes the authored midday look and then correct
    // itself.
    this.applyDaylight();
    this.scene.add(this.water.group);

    // Only the sofa remains at the seat. No createStudent(), hidden figure,
    // breathing animation or student-owned furniture is mounted here.
    // The sofa is exactly 2× its PREVIOUS rendered dimensions (dayBed.ts).
    createDayBed(this.budget, aniso)
      .then((bed) => {
        if (this.disposed) {
          bed.dispose();
          return;
        }
        this.dayBed = bed;
        this.scene.add(bed.group);
        this.installPropCollider("sofa", bed.group);
        this.winter.registerTree(bed.group);
      })
      .catch((err) => console.warn("[sanctuary] day bed failed", err));

    // THE RUSTY-ROOF VILLA. Same async, fail-soft load as the day bed.
    // It stands behind the student; the warehouse it replaced is gone.
    // Its shadow hull lives on layer 1 so the colour camera never draws it.
    // three r180's shadow walk tests the COLOUR camera's layers, not the
    // light's shadow camera, so layer 1 is enabled only for that walk and
    // cleared before the colour pass — two bit flips, no extra draw.
    if (this.budget.shadowMapSize > 0) {
      const shadowMap = this.renderer.shadowMap;
      const renderShadows = shadowMap.render;
      shadowMap.render = (lights, scene, camera) => {
        camera.layers.enable(1);
        try {
          renderShadows.call(shadowMap, lights, scene, camera);
        } finally {
          camera.layers.disable(1);
        }
      };
    }
    createWarehouse(this.budget, aniso)
      .then((building) => {
        if (this.disposed) {
          building.dispose();
          return;
        }
        this.warehouse = building;
        this.scene.add(building.group);
        // PUBG-style explorable villa: proper simple wall hitboxes instead of one
        // sealed footprint. The front has a doorway gap, so the character can go
        // inside while still colliding with the outer shell.
        this.installVillaInteriorColliders();
        building.group.updateMatrixWorld(true);
        this.atmosphere.registerTree(building.group);
        this.winter.registerTree(building.group);
        if (this.budget.halfPrecision) halfPrecisionTree(building.group);
        building.update(this.camera.position);
      })
      .catch((err) => console.warn("[sanctuary] warehouse failed", err));

    // THE BEACH-HOUSE DISTRICT — the owner's uploaded house, standing six
    // times across the sanctuary's own fields (see `beachHouses.ts` for the
    // site solve and `beachHouseSite.ts` for the pads the scatter already
    // respects). Same async, fail-soft load as the villa and the day bed: a
    // dropped download leaves six levelled yards and warns once.
    createBeachHouses(this.budget, aniso)
      .then((district) => {
        if (this.disposed) {
          district.dispose();
          return;
        }
        this.beachHouses = district;
        this.scene.add(district.group);
        // PUBG-style explorable homesteads: simple wall hitboxes instead of one
        // sealed footprint. Each house gets four wall segments with a front door
        // gap, so the character can enter while walls still feel solid.
        this.installBeachHouseInteriorColliders(district.sites);
        district.group.updateMatrixWorld(true);
        this.atmosphere.registerTree(district.group);
        this.winter.registerTree(district.group);
        if (this.budget.halfPrecision) halfPrecisionTree(district.group);
        console.info(
          `[sanctuary] beach houses placed: ${district.count} sites (` +
          district.sites
            .map((s) => `${Math.round(s.x)},${Math.round(s.z)}`)
            .join(" · ") +
          ")",
        );
      })
      .catch((err) => console.warn("[sanctuary] beach houses failed", err));

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
    this.installPropCollider("desk", this.desk);
    this.winter.registerTree(this.desk);

    this.screens = createBoardScreens(this.budget.shadowMapSize > 0);
    this.screens.setHudInsets(this.hudInsets);
    this.scene.add(this.screens.shells);
    // Board shells must take the same distance smoke as terrain/trees —
    // without atmosphere registration the stock fog_fragment never runs
    // on materials that only have the default chunk, and without fog:true
    // they skip it entirely. Register so far boards haze into the air.
    this.atmosphere.registerTree(this.screens.shells);
    this.winter.registerTree(this.screens.shells);
    // Boot applied daylight before screens existed — push the current fog
    // ramp onto the CSS3D faces now that the hosts are live.
    {
      const fog = this.scene.fog as THREE.Fog;
      this.screens.setFog(fog.near, fog.far, fog.color);
    }
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
    // Distance smoke on the lesson board + stand (same air as the hills).
    this.atmosphere.registerTree(this.board.group);
    // The lesson face gets frost at its edges, not over the readable text.
    const boardMaterials = this.board.panel.material as THREE.Material[];
    this.winter.register(boardMaterials[4], "board");
    this.winter.registerTree(this.board.group);
    const boardStand = createBoardStand(BOARD_HILL, this.budget.shadowMapSize > 0);
    this.scene.add(boardStand);
    this.atmosphere.registerTree(boardStand);
    this.winter.registerTree(boardStand);

// The board is scenery now: no controller, no drag, no resize, no
    // persistence. Nothing to restore either — its place is fixed in code.

    this.syncStudyColliders();
    // No procedural stand-in. The Sanctuary shows the authorized character
    // or no character at all — never a substitute that hides a failed import.
    this.avatar = createEmptyAvatar();
    this.avatar.group.position.copy(this.character.position);
    this.avatar.setLowEnd(this.budget.tier === "low");
    this.scene.add(this.avatar.group);
    opts.onCharacterAsset?.(this.characterAssetStatus);
    // Local, character-only licensed export; never load the reference map.
    // No export configured yet => the explicitly labelled web guide remains.
    void readCharacterManifest(import.meta.env.BASE_URL).then(async (manifest) => {
      if (!manifest.modelUrl || this.disposed) return null;
      const { loadCharacterAvatar } = await import("./characterAsset");
      return loadCharacterAvatar(this.budget.shadowMapSize > 0, manifest);
    }).then((loaded) => {
      if (!loaded) return;
      if (this.disposed) { loaded.avatar.dispose(); return; }
      this.avatar.group.removeFromParent();
      this.avatar.dispose();
      this.avatar = loaded.avatar;
      this.avatar.setLowEnd(this.budget.tier === "low");
      this.avatar.group.position.copy(this.character.position);
      this.avatar.group.rotation.y = this.character.rotation;
      this.scene.add(this.avatar.group);
      this.atmosphere.registerTree(this.avatar.group);
      this.characterAssetStatus = loaded.status;
      opts.onCharacterAsset?.(loaded.status);
      this.requestShadowRefresh();
    }).catch((err) => {
      if (this.disposed) return;
      this.characterAssetStatus = { ...FALLBACK_CHARACTER_STATUS, kind: "error", detail: `Character import failed; web guide retained. ${String(err)}` };
      opts.onCharacterAsset?.(this.characterAssetStatus);
      console.warn("[sanctuary] character export unavailable — web guide retained", err);
    });

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
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearCharacterInput);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("mousemove", this.onLockedMouseMove);
  }

  private detachPointer(dom: HTMLElement) {
    dom.removeEventListener("pointerdown", this.onPointerDown, true);
    dom.removeEventListener("pointermove", this.onPointerMove, true);
    dom.removeEventListener("pointerup", this.onPointerUp, true);
    dom.removeEventListener("pointercancel", this.onPointerUp, true);
    dom.removeEventListener("wheel", this.onWheel);
    dom.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearCharacterInput);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("mousemove", this.onLockedMouseMove);
    this.releaseCharacterMouse();
    this.keys.clear();
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
    if (this.character.enabled) {
      if (this.characterPaused) return;
      e.preventDefault();
      e.stopPropagation();
      if (document.pointerLockElement === this.opts.canvas) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { this.opts.dom.setPointerCapture(e.pointerId); } catch { /* drag fallback */ }
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.armPinch(a.x, a.y, b.x, b.y);
      } else this.pointerPrev = { x: e.clientX, y: e.clientY, id: e.pointerId, down: true };
      return;
    }
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
      this.armPinch(a.x, a.y, c.x, c.y);
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
      this.armPinch(a.x, a.y, b.x, b.y);
      return;
    }
    this.downPos = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this.pointerPrev = { x: e.clientX, y: e.clientY, id: e.pointerId, down: true };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.character.enabled && (this.characterPaused || document.pointerLockElement === this.opts.canvas)) return;
    // A finger being replayed into a board follows the bridge, not the rig.
    if (this.bridge && e.pointerId === this.bridge.pointerId) {
      this.moveBridge(e);
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size >= 2) {
      if (this.studyFocus) return;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      if (this.pinchPrev > 0) {
        const ratio = this.pinchPrev / Math.max(dist, 1);
        // A pure slide barely changes the finger gap. Ignore that noise so
        // flying does not also zoom.
        if (ratio > 1.012 || ratio < 0.988) {
          if (this.character.enabled) this.character.cameraRig.zoom(ratio);
          else this.orbit.zoom(ratio);
        }
      }
      if (this.pinchMid.ready) {
        const delta = stageLocalDelta(this.opts.dom, midX - this.pinchMid.x, midY - this.pinchMid.y, this.pointerDelta);
        if (this.character.enabled) this.character.rotateCamera(delta.x * 0.005, delta.y * 0.005);
        else this.orbit.flyByDrag(delta.x, delta.y);
      }
      this.pinchPrev = dist;
      this.pinchMid.x = midX;
      this.pinchMid.y = midY;
      this.pinchMid.ready = true;
      return;
    }

    if (!this.pointerPrev.down || e.pointerId !== this.pointerPrev.id) return;
    const delta = stageLocalDelta(this.opts.dom, e.clientX - this.pointerPrev.x, e.clientY - this.pointerPrev.y, this.pointerDelta);
    const dx = delta.x * 0.005, dy = delta.y * 0.005;
    this.pointerPrev.x = e.clientX;
    this.pointerPrev.y = e.clientY;
    if (this.studyFocus) return;
    if (this.character.enabled) this.character.rotateCamera(dx, dy);
    else this.orbit.rotate(dx, dy);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.bridge && e.pointerId === this.bridge.pointerId) {
      this.endBridge(e);
      return;
    }
    if (this.character.enabled) {
      this.pointers.delete(e.pointerId);
      this.pinchTainted.delete(e.pointerId);
      if (this.pointers.size < 2) { this.pinchPrev = 0; this.pinchMid.ready = false; }
      if (this.pointerPrev.id === e.pointerId) this.pointerPrev.down = false;
      try { this.opts.dom.releasePointerCapture(e.pointerId); } catch { /* no capture */ }
      // The remaining pinch finger starts a NEW drag, never a ground tap.
      const remaining = this.pointers.entries().next().value;
      if (remaining) this.pointerPrev = { x: remaining[1].x, y: remaining[1].y, id: remaining[0], down: true };
      return;
    }
    const start = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.pinchPrev = 0;
      this.pinchMid.ready = false;
    }
    if (e.pointerId === this.pointerPrev.id) this.pointerPrev.down = false;

    // A tap on the board opens the lesson. A double tap on the ground flies
    // the drone there — the far village is a kilometre out, and orbiting the
    // study can never reach it.
    //
    // Two guards before a lifted finger may count as a tap:
    //   * a PINCH finger is never a tap — lifting the two fingers of a
    //     pinch-out inside the 340 ms double-tap window used to fire the
    //     ground fly, and the drone flew back to 42 m the moment the user
    //     let go (the "zoom snaps back" bug);
    //   * "moved" is measured against POINTER DOWN (downPos), not the last
    //     move event, so a drag that ends in a pause is not a tap either.
    if (start && !this.pinchTainted.delete(e.pointerId)) {
      const down = this.downPos;
      if (down && down.id === e.pointerId) {
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        if (moved < 8) this.onTap(e);
      }
    }
    if (this.downPos && this.downPos.id === e.pointerId) this.downPos = null;
  };

  private tapRay = new THREE.Raycaster();
  private tapVec = new THREE.Vector2();

  private armPinch(ax: number, ay: number, bx: number, by: number) {
    // Both fingers are now camera-pinch, never taps (see pinchTainted).
    for (const id of this.pointers.keys()) this.pinchTainted.add(id);
    this.pinchPrev = Math.hypot(ax - bx, ay - by);
    this.pinchMid.x = (ax + bx) * 0.5;
    this.pinchMid.y = (ay + by) * 0.5;
    this.pinchMid.ready = true;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (this.characterPaused || this.boardTarget(t) || t instanceof HTMLElement && t.closest("[data-character-help]") || t instanceof HTMLElement && t.closest("button, select") && (e.code === "Space" || e.code === "Enter")) return;
    if (e.code === "Space" || e.code.startsWith("Arrow") || this.character.enabled && ["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyV", "KeyQ", "KeyR", "ControlLeft", "ControlRight"].includes(e.code)) e.preventDefault();
    if (this.character.enabled && !e.repeat) {
      switch (e.code) {
        case "Space": this.character.jump(); break;
        case "KeyE": this.character.toggleCover(); break;
        case "KeyV": this.toggleCharacterCamera(); break;
        case "KeyQ": this.character.cameraRig.swapShoulder(); break;
        case "KeyR": this.characterAction("reset"); break;
        case "Escape": this.clearCharacterInput(); break;
      }
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (this.character.enabled && e.code === "Space") this.character.releaseJump();
  };

  private clearCharacterInput = () => {
    this.keys.clear();
    this.movementStick.set(0, 0);
    this.character.clearInput();
    this.pointers.clear();
    this.pinchTainted.clear();
    this.pointerPrev.down = false;
    this.pinchPrev = 0;
    this.pinchMid.ready = false;
    this.gamepadJumpHeld = this.gamepadCoverHeld = this.gamepadCameraHeld = false;
  };

  private onPointerLockChange = () => {
    if (document.pointerLockElement !== this.opts.canvas) this.clearCharacterInput();
  };

  private onLockedMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === this.opts.canvas && this.character.enabled && !this.characterPaused) {
      const delta = stageLocalDelta(this.opts.dom, e.movementX, e.movementY, this.pointerDelta);
      this.character.rotateCamera(delta.x * 0.003, delta.y * 0.003);
    }
  };

  /** Standard-mapping pads: left move, right look, A jump, B crouch, X cover. */
  private characterInput(dt: number) {
    let x = this.movementStick.x;
    let y = this.movementStick.y;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y++;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y--;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x++;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x--;
    let run = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    let crouch = this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    if (typeof navigator.getGamepads === "function") {
      const pads = navigator.getGamepads();
      let pad: Gamepad | null = null;
      for (let i = 0; i < pads.length; i++) if (pads[i]?.connected && pads[i]?.mapping === "standard") { pad = pads[i]; break; }
      if (pad) {
        const axis = (v: number) => Math.abs(v) < 0.14 ? 0 : Math.sign(v) * (Math.abs(v) - 0.14) / 0.86;
        x += axis(pad.axes[0] ?? 0); y -= axis(pad.axes[1] ?? 0);
        this.character.rotateCamera(axis(pad.axes[2] ?? 0) * dt * 2.2, axis(pad.axes[3] ?? 0) * dt * 1.7);
        run ||= pad.buttons[10]?.pressed ?? false;
        crouch ||= pad.buttons[1]?.pressed ?? false;
        const jump = pad.buttons[0]?.pressed ?? false;
        const cover = pad.buttons[2]?.pressed ?? false;
        const camera = pad.buttons[3]?.pressed ?? false;
        if (jump && !this.gamepadJumpHeld) this.character.jump();
        if (!jump && this.gamepadJumpHeld) this.character.releaseJump();
        if (cover && !this.gamepadCoverHeld) this.character.toggleCover();
        if (camera && !this.gamepadCameraHeld) this.toggleCharacterCamera();
        this.gamepadJumpHeld = jump; this.gamepadCoverHeld = cover; this.gamepadCameraHeld = camera;
      } else this.gamepadJumpHeld = this.gamepadCoverHeld = this.gamepadCameraHeld = false;
    }
    this.character.setInput(x, y, run, crouch);
  }

  /** WASD / arrows fly, Q and E climb. Held keys, so it rides the frame. */
  private flyKeys(dt: number) {
    if (this.studyFocus || this.keys.size === 0) return;
    let ahead = 0;
    let strafe = 0;
    let lift = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) ahead += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) ahead -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) strafe += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) strafe -= 1;
    if (this.keys.has("KeyE") || this.keys.has("Space")) lift += 1;
    if (this.keys.has("KeyQ")) lift -= 1;
    if (ahead === 0 && strafe === 0 && lift === 0) return;
    const boost = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 2.6 : 1;
    const speed = Math.max(this.orbit.distance, 8) * 0.62 * boost;
    this.orbit.autoRotate = false;
    this.orbit.fly(strafe * speed * dt, ahead * speed * dt, lift * speed * dt);
  }

  private onTap(e: PointerEvent) {
    if (this.studyFocus) return;
    if (this.tapHitsBoard(e)) {
      this.opts.onBoardTap?.();
      return;
    }
    const now = performance.now();
    if (now - this.lastGroundTap < 340) {
      this.lastGroundTap = 0;
      this.flyToGround(e);
      return;
    }
    this.lastGroundTap = now;
  }

  private tapHitsBoard(e: PointerEvent): boolean {
    const rect = this.opts.dom.getBoundingClientRect();
    this.tapVec.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.tapRay.setFromCamera(this.tapVec, this.camera);
    return this.tapRay.intersectObject(this.board.panel, false).length > 0;
  }

  /**
   * Double-tap the ground and the drone flies there. Analytic march against
   * `terrainHeight` — no mesh pick, no allocation, so a tap cannot hitch.
   */
  private flyToGround(e: PointerEvent) {
    this.tapHitsBoard(e);
    const origin = this.tapRay.ray.origin;
    const dir = this.tapRay.ray.direction;
    let t = 2;
    let px = origin.x;
    let py = origin.y;
    let pz = origin.z;
    let ph = terrainHeight(px, pz);
    for (let i = 0; i < 56; i += 1) {
      t += Math.max(3, t * 0.32);
      if (t > 6000) break;
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) break;
      const h = terrainHeight(x, z);
      if (py > ph && y <= h) {
        const span = (py - ph) - (y - h);
        const u = span !== 0 ? (py - ph) / span : 0;
        const hx = px + (x - px) * u;
        const hz = pz + (z - pz) * u;
        const hh = terrainHeight(hx, hz);
        this.orbit.autoRotate = false;
        this.orbit.panTo(this.tmpV.set(hx, hh + 1.8, hz), 42, this.orbit.yaw, 0.38);
        return;
      }
      px = x;
      py = y;
      pz = z;
      ph = h;
    }
  }

  private onWheel = (e: WheelEvent) => {
    if (this.character.enabled) {
      e.preventDefault();
      if (!this.characterPaused) this.character.cameraRig.zoom(1 + Math.sign(e.deltaY) * 0.1);
      return;
    }
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

  // ── Player collision data: installed once, not rebuilt per frame ─────
  private installPropCollider(id: string, root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    if (bounds.isEmpty()) return;
    this.characterWorld.setGroup(id, [{
      id, kind: "box", x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2,
      halfX: (bounds.max.x - bounds.min.x) / 2, halfZ: (bounds.max.z - bounds.min.z) / 2, yaw: 0,
      baseY: bounds.min.y, height: bounds.max.y - bounds.min.y, cover: true,
    }]);
  }

  private wallCollider(
    id: string,
    cx: number,
    cz: number,
    yaw: number,
    lx: number,
    lz: number,
    halfX: number,
    halfZ: number,
    baseY: number,
    height: number,
  ): CharacterCollider {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return {
      id, kind: "box", yaw,
      x: cx + cos * lx + sin * lz,
      z: cz - sin * lx + cos * lz,
      halfX, halfZ, baseY, height, cover: height > 1.4,
    };
  }

  private installVillaInteriorColliders() {
    const baseY = terrainHeight(WAREHOUSE_X, WAREHOUSE_Z);
    const t = 0.55;
    const door = 7.5;
    const wallH = Math.min(WAREHOUSE_HEIGHT * 0.46, 14);
    const hx = WAREHOUSE_HALF_X;
    const hz = WAREHOUSE_HALF_Z;
    this.characterWorld.setGroup("villa-walls", [
      this.wallCollider("villa-back", WAREHOUSE_X, WAREHOUSE_Z, WAREHOUSE_YAW, 0, -hz, hx, t, baseY, wallH),
      this.wallCollider("villa-left", WAREHOUSE_X, WAREHOUSE_Z, WAREHOUSE_YAW, -hx, 0, t, hz, baseY, wallH),
      this.wallCollider("villa-right", WAREHOUSE_X, WAREHOUSE_Z, WAREHOUSE_YAW, hx, 0, t, hz, baseY, wallH),
      this.wallCollider("villa-front-l", WAREHOUSE_X, WAREHOUSE_Z, WAREHOUSE_YAW, -(hx + door) * 0.5, hz, Math.max(0.4, (hx - door) * 0.5), t, baseY, wallH),
      this.wallCollider("villa-front-r", WAREHOUSE_X, WAREHOUSE_Z, WAREHOUSE_YAW, (hx + door) * 0.5, hz, Math.max(0.4, (hx - door) * 0.5), t, baseY, wallH),
    ]);
  }

  private installBeachHouseInteriorColliders(sites: readonly BeachHouseSite[]) {
    const walls: CharacterCollider[] = [];
    const t = 0.38;
    for (let i = 0; i < sites.length; i += 1) {
      const site = sites[i];
      const hx = Math.max(2, site.halfX * 0.92);
      const hz = Math.max(2, site.halfZ * 0.92);
      const door = Math.min(hx * 0.72, 3.8 * site.scale);
      const wallH = Math.min(HOUSE_RIDGE * site.scale * 0.62, 12);
      walls.push(
        this.wallCollider(`house-${i}-back`, site.x, site.z, site.yaw, 0, -hz, hx, t, site.padY, wallH),
        this.wallCollider(`house-${i}-left`, site.x, site.z, site.yaw, -hx, 0, t, hz, site.padY, wallH),
        this.wallCollider(`house-${i}-right`, site.x, site.z, site.yaw, hx, 0, t, hz, site.padY, wallH),
        this.wallCollider(`house-${i}-front-l`, site.x, site.z, site.yaw, -(hx + door) * 0.5, hz, Math.max(0.35, (hx - door) * 0.5), t, site.padY, wallH),
        this.wallCollider(`house-${i}-front-r`, site.x, site.z, site.yaw, (hx + door) * 0.5, hz, Math.max(0.35, (hx - door) * 0.5), t, site.padY, wallH),
      );
    }
    this.characterWorld.setGroup("houses", walls);
  }

  private installRockColliders() {
    const boxes: CharacterCollider[] = [];
    const matrix = new THREE.Matrix4();
    const instance = new THREE.Matrix4();
    const bounds = new THREE.Box3();
    this.rocks.group.updateMatrixWorld(true);
    this.rocks.group.traverse(o => {
      const mesh = o as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh || !mesh.name.startsWith("rock-master") || mesh.name.endsWith("-far")) return;
      mesh.geometry.computeBoundingBox();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, instance);
        matrix.multiplyMatrices(mesh.matrixWorld, instance);
        bounds.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix);
        boxes.push({ id: `${mesh.name}-${i}`, kind: "box", x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2,
          halfX: (bounds.max.x - bounds.min.x) / 2, halfZ: (bounds.max.z - bounds.min.z) / 2, yaw: 0,
          baseY: bounds.min.y, height: bounds.max.y - bounds.min.y, cover: bounds.max.y - bounds.min.y > 0.65 });
      }
    });
    this.characterWorld.setGroup("rocks", boxes);
  }

  private syncTreeColliders() {
    this.characterWorld.setGroup("trunks", getTreeObstacles().map((t, i) => ({
      id: `trunk-${i}`, kind: "circle", x: t.x, z: t.z, baseY: t.baseY, height: t.height,
      // The board registry describes CROWNS, not trunks. Do not erect
      // invisible 6 m-wide walls around every tree's leaves.
      radius: Math.max(0.15, Math.min(0.65, t.radius * 0.12)),
    })));
  }

  private syncStudyColliders() {
    this.characterWorld.setGroup("study-boards", this.screens.screens.map((s, i) => ({
      id: `study-board-${i}`, kind: "box", x: s.placement.position.x, z: s.placement.position.z,
      halfX: LECTERN_BOARD_WIDTH * this.boardScale / 2, halfZ: 0.22, yaw: s.placement.yaw,
      baseY: terrainHeight(s.placement.position.x, s.placement.position.z),
      height: s.placement.position.y + LECTERN_BOARD_HEIGHT * this.boardScale / 2 - terrainHeight(s.placement.position.x, s.placement.position.z), cover: true,
    })));
  }

  /** Pick an OPEN patch from this world, not an imported reference spawn.
   * The original vegetation is 7–20 m tall: spawning inside a random leaf
   * card made the guide disappear even with a correctly working camera.
   * Every probe below scales with the body, so an 18 ft character is tested
   * against the clearance IT needs, not the clearance a 6 ft one needed.
   * This is a one-shot placement query on entry/reset, never a frame loop. */
  private resetCharacterAtClearSpawn() {
    const S = CHARACTER_SCALE;
    const probeRadius = CHARACTER_RADIUS + 0.05 * S;
    const eye = characterEyeHeight();
    const candidates = [
      [CHARACTER_SPAWN.x, CHARACTER_SPAWN.z], [-10, 0], [-12, -6], [-8, -8],
      [0, -10], [8, -8], [12, -6], [10, 0], [-14, 12], [0, 14], [14, 12],
    ];
    const crowns = getTreeObstacles();
    let best = -Infinity;
    for (const [x, z] of candidates) {
      const y = this.characterWorld.terrainAt(x, z);
      // Hard requirement: standable, dry and clear of props for the whole
      // body plus a jump of headroom. Everything else only prefers a spot.
      if (this.characterWorld.waterAt(x, z) - y > 0.65 * S ||
          !this.characterWorld.canOccupy(x, y, z, probeRadius, CHARACTER_HEIGHT + 1.5 * S) ||
          !this.characterWorld.canOccupy(x, y, z - 3.5 * S, probeRadius, CHARACTER_HEIGHT)) continue;
      // An entry point should also be camera-visible, not on a steep river
      // bank whose foreground ridge hides the character's lower half.
      const ground = this.characterWorld.terrainAt;
      const relief = Math.max(Math.abs(ground(x + 0.5 * S, z) - y), Math.abs(ground(x - 0.5 * S, z) - y),
        Math.abs(ground(x, z + 0.5 * S) - y), Math.abs(ground(x, z - 0.5 * S) - y));
      const visible = relief <= 0.12 * S && Math.abs(ground(x + 0.32 * S, z + 4 * S) - y) <= 0.4 * S &&
        !this.characterWorld.cameraBlocked(x + 0.32 * S, y + eye, z + 4 * S, 0.2 * S);
      let clearance = Infinity;
      for (const crown of crowns) {
        if (y + eye < crown.baseY - 0.5 * S || y > crown.baseY + crown.height) continue;
        const margin = crown.radius * 1.5 + CHARACTER_RADIUS * 2.5;
        clearance = Math.min(clearance, Math.hypot(x - crown.x, z - crown.z) - margin,
          Math.hypot(x + 0.32 * S - crown.x, z + 4 * S - crown.z) - margin);
      }
      // Ranked, not rejected: a visible opening always beats a hidden one, but
      // an 18 ft body that cannot find a perfect ledge still gets the most open
      // standable ground instead of silently keeping a buried default.
      const score = (visible ? 1e4 : 0) + Math.max(clearance, -1e3);
      if (score > best) { best = score; this.characterSpawn.set(x, y, z); }
    }
    this.character.reset(this.characterSpawn.x, this.characterSpawn.z, CHARACTER_SPAWN.yaw);
  }

  setCharacterMode(mode: CharacterCameraMode) {
    if (mode === this.character.mode) return;
    const entering = !this.character.enabled;
    const leaving = mode === "orbit";
    this.cancelBridge();
    if (entering || leaving) this.clearCharacterInput();
    if (entering && !this.characterStarted) { this.resetCharacterAtClearSpawn(); this.characterStarted = true; }
    if (leaving) this.releaseCharacterMouse();
    this.character.setMode(mode);
    this.orbit.autoRotate = false;
    this.studyFocus = false;
    this.pendingReadSlot = null;
    this.fittedStudyPreset = null;
    this.screens.setReadSlot(null);
    this.screens.setInteractive(leaving);
    this.camera.clearViewOffset();
    this.applyFov();
    if (leaving) {
      this.orbit.target.copy(this.character.position); this.orbit.target.y += 1.35;
      this.orbit.setFromCamera(this.camera);
      this.orbit.panTo(this.orbit.target, 12, this.character.cameraRig.yaw, 0.25);
    } else {
      if (entering) this.character.cameraRig.reset(this.character.rotation);
      this.opts.canvas.tabIndex = 0;
      this.opts.canvas.focus({ preventScroll: true });
    }
    this.opts.onCharacterMode?.(mode);
    this.requestShadowRefresh();
  }

  toggleCharacterCamera() {
    this.setCharacterMode(this.character.mode === "first-person" ? "third-person" : "first-person");
  }

  setCharacterMove(strafe: number, forward: number) { this.movementStick.set(strafe, forward).clampLength(0, 1); }
  setCharacterLook(x: number, y: number) { this.character.setLookStick(x, y); }

  characterAction(action: "jump" | "jump-release" | "run" | "crouch" | "cover" | "reset" | "shoulder") {
    if (!this.character.enabled || this.characterPaused) return;
    switch (action) {
      case "jump": this.character.jump(); break;
      case "jump-release": this.character.releaseJump(); break;
      case "run": this.character.toggleRun(); break;
      case "crouch": this.character.toggleCrouch(); break;
      case "cover": this.character.toggleCover(); break;
      case "reset": this.clearCharacterInput(); this.resetCharacterAtClearSpawn(); break;
      case "shoulder": this.character.cameraRig.swapShoulder(); break;
    }
  }

  /** Optional mouse capture; dragging the scene always works if denied. */
  captureCharacterMouse() {
    if (!this.character.enabled || this.characterPaused || !this.opts.canvas.requestPointerLock) return;
    try {
      const request = this.opts.canvas.requestPointerLock();
      if (request && typeof request.catch === "function") void request.catch(() => { /* iframe/mobile: use drag + right stick */ });
    } catch { /* Drag remains available on WebView / restricted previews. */ }
  }

  private releaseCharacterMouse() {
    if (document.pointerLockElement === this.opts.canvas) document.exitPointerLock();
  }

  getCharacterSnapshot() {
    return { mode: this.character.mode, state: this.character.state, height: CHARACTER_HEIGHT,
      position: this.character.position.toArray(), spawn: this.characterSpawn.toArray(), speed: this.character.speed, grounded: this.character.grounded,
      inCover: this.character.inCover, crouched: this.character.crouched,
      runLatched: this.character.runLatched, crouchLatched: this.character.crouchLatched,
      source: this.characterAssetStatus.kind, bodyVisible: this.avatar.group.children.some(c => c.visible) };
  }

  // ───────────────────────────────────────────────────────────────────
  //  Public API used by React
  // ───────────────────────────────────────────────────────────────────

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

  setWind(multiplier: number) {
    this.wind = multiplier;
  }

  setAutoOrbit(on: boolean) {
    this.orbit.autoRotate = on && !this.character.enabled;
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
    // Fixed bright noon replaces the dynamic day/night path. This keeps lighting,
    // water glint, fog and fake/baked shadows stable like a PUBG mobile map.
    const state = daylightAt(FIXED_PUBG_DAYLIGHT_HOUR);
    if (this.iceAge) winterDaylight(state);
    this.daylight = state;
    this.sky.applyDaylight(state);
    const fog = this.scene.fog as THREE.Fog;
    // three.js rule: fog colour AND clear-colour must match or the horizon
    // seams against the sky. Daylight fog colour drives both; the sky dome
    // still paints the upper sky, the fog colour fills the distant air.
    fog.color.copy(state.fog);
    // ── TIME-OF-DAY SMOKE (owner brief 2026-09-29) ──────────────────────
    // "Subah ke samay thoda sa smoke … jaise-jaise sun aata hai smoke gayab
    //  hone lagte hain … din mein hat jaaye, aur shaam aur raat mein rahe."
    //
    // `state.smoke` is that curve (daylight.ts): ~0.75 at dawn, burning off
    // to 0.14 by late morning, back up to ~0.6 through the evening and
    // ~0.68 overnight. The smoke moves the RAMP, not a global tint: a hazy
    // dawn pulls the full-smoke line in to ~2.2 km (the far range melts
    // away), a clear midday pushes it out to 4.2 km (the whole island, the
    // sea and the distant mountains resolve), and the night keeps the air
    // thick again. In Auto mode the clock re-reads every 20 s, so the haze
    // visibly burns off in a time-lapse as the sun climbs.
    const smoke = state.smoke;
    fog.near = this.budget.fogNear * (1.5 - 0.9 * smoke) * (this.iceAge ? 0.75 : 1);
    fog.far = this.budget.fogFar * (1 - 0.58 * smoke) * (this.iceAge ? 0.72 : 1);
    // CSS3D board faces sit above the canvas — push the same smoke ramp so
    // black boards haze into the air just like terrain and trees.
    // Guard: applyDaylight runs once before createBoardScreens during boot.
    this.screens?.setFog(fog.near, fog.far, fog.color);
    // The air is lit by the same sun as the ground: its colour, its in-scatter
    // and the strength of the foliage transmission term all follow the hour.
    // Reading `sunDir.y` gives the elevation directly — it is a unit vector
    // towards the sun, so its Y component IS the sine of the elevation.
    this.atmosphere.update(state.sunDir.y, state.sunDir, state.sunColor, state.fog);
    this.scene.background = null;
    // Keep the GL clear colour locked to the live fog so a missed sky pixel
    // is haze-blue, never black (zoom-out / rotate black-circle fix).
    this.renderer.setClearColor(fog.color, 1);
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
    // Underwater: tight linear fog so the water column is immediate and blue.
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(0x0a58b8);
    fog.near = 0.4;
    fog.far = 8;
    this.screens?.setFog(fog.near, fog.far, fog.color);
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

  /**
   * Swap the procedural sky dome for the baked anime panorama
   * (`sanctuary/skybox_anime_sky.jpg`, extracted from the Sketchfab
   * "free - skybox anime sky" GLB). Daylight keeps grading it, so this is
   * safe with any hour and with the Ice Age. The first enable starts one
   * 2.5 MB download; every later toggle is instant.
   */
  setAnimeSky(enabled: boolean) {
    this.animeSkyWanted = enabled;
    if (enabled && !this.animeSkyTexture) {
      this.animeSkyTexture = new THREE.TextureLoader()
        .loadAsync(ANIME_SKY_URL)
        .then((t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.mapping = THREE.EquirectangularReflectionMapping;
          // GLB-extracted equirect (glTF V). flipY=true put the painted
          // islands on the zenith — sky.ts also pins this when the dome
          // is built, but set it here so the first upload is already right.
          t.flipY = false;
          t.wrapS = THREE.RepeatWrapping;
          t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
          return t;
        })
        .catch((err) => {
          // A missing skybox is cosmetic — the procedural dome carries on.
          console.warn("[sanctuary] anime skybox failed to load:", err);
          return null;
        });
    }
    if (!this.animeSkyTexture) {
      this.sky.setAnimeSkybox(null);
      return;
    }
    void this.animeSkyTexture.then((t) => {
      // Honour the LAST wish, not the wish at call time (fast toggles while
      // the texture is still in flight).
      this.sky.setAnimeSkybox(this.animeSkyWanted ? t : null);
    });
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
    if (this.character.enabled) this.setCharacterMode("orbit");
    // Any view that is not a single board puts the full world back on budget.
    this.studyFocus = false;
    this.pendingReadSlot = null;
    this.pendingPinAge = 0;
    this.screens.setReadSlot(null);
    this.camera.clearViewOffset();
    // Only these four views own a projection-aware "fit". Scenery views and
    // manual exploration must not suddenly snap back after a later resize.
    this.fittedStudyPreset =
      preset === "student" || preset === "reading" || preset === "notes" || preset === "mindmap"
        ? preset
        : null;
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
      case "houses": {
        // The homestead row, from above the meadow: whichever house the site
        // solve put nearest the study clearing is the one in frame.
        const site = this.focusHouseSite();
        this.orbit.autoRotate = false;
        this.orbit.panTo(
          this.tmpV.set(site.x, terrainHeight(site.x, site.z) + HOUSE_RIDGE * 0.45, site.z),
          46,
          site.yaw + Math.PI,
          0.22,
        );
        break;
      }
      case "warehouse":
        // Behind the student, from the chair side. A 30 m house at 58 m
        // fills the frame without standing on the roof. Yaw π puts the
        // camera south of the villa, looking at the face the student sees.
        this.orbit.autoRotate = false;
        this.orbit.panTo(
          this.tmpV.set(
            WAREHOUSE_X,
            terrainHeight(WAREHOUSE_X, WAREHOUSE_Z) + WAREHOUSE_HEIGHT * 0.42,
            WAREHOUSE_Z,
          ),
          58,
          Math.PI,
          0.22,
        );
        break;
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
    const next = {
      top: Math.max(0, insets.top),
      bottom: Math.max(0, insets.bottom),
      left: Math.max(0, insets.left),
      right: Math.max(0, insets.right),
    };
    const old = this.hudInsets;
    const changed =
      Math.abs(old.top - next.top) > 0.5 ||
      Math.abs(old.bottom - next.bottom) > 0.5 ||
      Math.abs(old.left - next.left) > 0.5 ||
      Math.abs(old.right - next.right) > 0.5;
    this.hudInsets = next;
    this.screens.setHudInsets(next);
    // Hiding/showing the bottom-right eye changes the free rectangle. Re-fit
    // here, synchronously, so every study camera uses that newly available
    // space instead of retaining one shared/stale mobile zoom.
    if (changed && this.fittedStudyPreset) this.focus(this.fittedStudyPreset);
  }

  /**
   * Grow or shrink the three study boards. Width, gap and reading radius
   * scale together; the camera must be re-framed by the caller (`focus`)
   * so a 3× board still fits the desk view with no crop.
   */
  /**
   * Hide the study boards while a full-screen HUD panel (Settings, My modules)
   * owns the screen. The boards are a DOM layer above the canvas, so without
   * this they draw over the panel the learner just opened.
   */
  setOverlayOpen(open: boolean) {
    this.screens.setOverlayOpen(open);
    this.characterPaused = open;
    if (open) { this.clearCharacterInput(); this.releaseCharacterMouse(); }
  }

  setBoardScale(scale: number) {
    const s = scale < 1.25 ? 1 : scale < 1.75 ? 1.5 : scale < 2.5 ? 2 : 3;
    if (s === this.boardScale) return;
    this.boardScale = s;
    this.screens.setScale(s);
    this.syncBoardPlanes();
    this.syncStudyColliders();
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

    const compact = this.viewW < 960 || this.viewH < 520;
    const margin = compact ? 0.08 : BOARD_VIEW_MARGIN;
    const needW = LECTERN_BOARD_WIDTH * this.boardScale + margin * 2;
    const needH = LECTERN_BOARD_HEIGHT * this.boardScale + margin * 2;
    const distance = this.fitStudyDistance(needW, needH);

    // The orbit target is the board's own centre: with pitch 0 the camera
    // sits exactly on the face normal, square on the page, at every size.
    // View-offset (inside fitStudyDistance) then slides that rectangle into
    // the HUD-free stage so a landscape phone is not cropped by the tray.
    this.orbit.panTo(this.tmpV.copy(placement.position), distance, placement.yaw, 0);
  }

  /**
   * Distance + film-gate offset so a study board (or the desk triptych)
   * letterboxes into the HUD-free rectangle — the same rect the pinned
   * floating page uses. Replaces the old "clear each chrome edge by a HALF
   * board from screen centre", which on a 390 px-tall landscape phone left
   * a shrunk overlay in front of a still-visible 3D shell.
   */
  private fitStudyDistance(needW: number, needH: number): number {
    const box = studyLetterbox(this.viewW, this.viewH, this.hudInsets, 8, needW / needH);
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const pinW = Math.max(1, box.w);
    const pinH = Math.max(1, box.h);
    const distance = Math.max(
      (needH / 2 / Math.tan(vFov / 2)) * (this.viewH / pinH),
      (needW / 2 / Math.tan(hFov / 2)) * (this.viewW / pinW),
    );
    if (this.viewW > 1 && this.viewH > 1) {
      this.camera.setViewOffset(
        this.viewW,
        this.viewH,
        this.viewW / 2 - (box.x + pinW / 2),
        this.viewH / 2 - (box.y + pinH / 2),
        this.viewW,
        this.viewH,
      );
    }
    return distance;
  }

  /**
   * Frame ALL THREE boards from the student's seat — the "Student" preset.
   * Same fitting maths, but against the full width of the trio (the outer
   * corner of a side board, mirrored) so nothing is cut off.
   */
  /**
   * The beach house nearest the study clearing — the one the "houses" camera
   * preset frames. Falls back to the origin if the sites were never solved
   * (which can only happen if the camera preset is used before the world is
   * built, i.e. never).
   */
  private focusHouseSite(): { x: number; z: number; yaw: number } {
    const sites = this.beachHouses?.sites ?? beachHouseSites();
    let best = sites[0];
    let bestD = Infinity;
    for (let i = 0; i < sites.length; i += 1) {
      const d = sites[i].x * sites[i].x + sites[i].z * sites[i].z;
      if (d < bestD) {
        bestD = d;
        best = sites[i];
      }
    }
    return best ?? { x: 0, z: 0, yaw: 0 };
  }

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

    const compact = this.viewW < 960 || this.viewH < 520;
    const margin = compact ? 0.08 : BOARD_VIEW_MARGIN;
    const needW = halfSpan * 2 + margin * 2;
    const needH = LECTERN_BOARD_HEIGHT * this.boardScale + margin * 2;
    // Desk is a fit camera too — same HUD-free letterbox as a single board
    // so the eye toggle and a rotation share one zoom on phones.
    const boardDistance = this.fitStudyDistance(needW, needH);
    // A hair of extra air on mobile keeps the curved outer boards from
    // kissing a rounded screen corner; desktop retains the exact fit.
    const distance = boardDistance * (compact ? 1.02 : 1);

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
    // Rotation, split-screen resizing and mobile browser-bar changes all alter
    // the projection. Recompute the selected study fit against the new aspect
    // instead of carrying over a desktop/portrait distance.
    if (this.fittedStudyPreset) this.focus(this.fittedStudyPreset);
    this.requestShadowRefresh();
  }

  /** The fov before the aspect correction (one camera: orbit only). */
  private get baseFovForMode() {
    return this.character.mode === "first-person" ? 74 : this.character.mode === "third-person" ? 62 : 52;
  }

  /**
   * Apply the base fov with the narrow-screen correction folded in, and push
   * it to the projection. Called on resize (and whenever a view change needs
   * a fresh projection).
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

  /**
   * The thermal fail-safe ladder (ACTIVATE_THERMAL_DRS_PACING, fail-safe
   * half). Two rungs, both allocation-free:
   *
   *   Rung 1 — the far plant rings vanish: sorrel far ring, grass-tuft far
   *            ring, far grass ring trimmed to 60 %. The meadow around the
   *            learner is untouched; the fog already softens the distance.
   *   Rung 2 — the moss bank hides, near rings trim (tufts 50 %, sorrel
   *            60 %, near grass 85 %, far grass 40 %).
   *
   * Trimming an InstancedMesh's `count` or flipping a group's `visible` is
   * free — buffers stay allocated, so shedding can never itself cause the
   * stutter it is treating (the ENFORCE_STRICT_OBJECT_POOLING rule applies
   * to fail-safes too), and the ladder can relax back without re-scattering.
   */
  private applyShed() {
    this.grass.setDetail(this.shedLevel);
    this.hillGrass.setShed(this.shedLevel);
    this.sorrel?.setShed(this.shedLevel);
    this.grassTufts?.setShed(this.shedLevel);
    this.mossBank?.setShed(this.shedLevel);
    this.tropical?.setShed(this.shedLevel);
  }

  private shedOneLevel() {
    // Four rungs, not two. The old ladder stopped at level 2 (45 % of the
    // sward), which still submitted ~266 k verts/frame on the low tier —
    // about 4x a comfortable mobile budget — so a genuinely drowning device
    // hit the bottom of the ladder and stayed stuck at 20 fps with nowhere
    // left to go. Levels 3 and 4 keep thinning (28 %, then 16 %) so the
    // fail-safe can actually rescue the frame.
    if (this.shedLevel >= 4) return;
    this.shedLevel += 1;
    this.applyShed();
    // Loud in the console on purpose: if a QA device reports a "sparse"
    // meadow, this line says why (hot GPU, not a content bug).
    console.info(
      `[sanctuary] thermal fail-safe: shedding environment detail to level ${this.shedLevel}/4 ` +
        `(far rings ${this.shedLevel >= 1 ? "hidden" : "shown"}, near rings ${this.shedLevel >= 2 ? "trimmed" : "full"}, ` +
        `sward ${this.shedLevel >= 3 ? "sparse" : "full"})`,
    );
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (!v) { this.clearCharacterInput(); this.releaseCharacterMouse(); }
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
    this.clearCharacterInput();
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

    // ── Frame pacing (ACTIVATE_THERMAL_DRS_PACING, pacing half) ───────
    //
    // On capped tiers (30 fps on low) a rAF that arrives EARLIER than the
    // frame budget is skipped wholesale — the browser keeps scheduling ticks
    // at the panel's refresh rate, we simply render every other one. The
    // simulation loses nothing: THREE.Clock accumulates the skipped span, so
    // the next rendered frame receives the full ~33 ms of dt and the world
    // moves at true speed. A fixed 30 Hz cadence on a tile GPU is smoother
    // than a jagged 38–50 fps oscillation (this is why the consoles and
    // Swappy pace instead of free-running), and it halves the thermal load
    // that triggers Android's sustained-performance throttle.
    // The interval now comes from the adaptive scaler, which starts every
    // tier at 60 and only falls back to the tier's cadence (30 on low) once
    // two 36-frame windows have proven 60 is unreachable — then climbs back
    // as soon as there is headroom again. Reading `budget.fpsCap` directly
    // here is what used to make 60 impossible on a phone.
    const paceMs = this.adaptive.paceIntervalMs;
    if (paceMs > 0) {
      if (frameStart < this.paceNext) return;
      this.paceNext = Math.max(frameStart, this.paceNext) + paceMs;
    }

    // The DRS signal is the WALL-CLOCK span since the last rendered frame,
    // never the tick's CPU time: on a GPU-bound phone the CPU work below is
    // a calm few ms while the GPU drowns — the only place that shows is the
    // browser vsync-throttling the rAF, i.e. this interval.
    const wallMs = this.lastTickStart > 0 ? frameStart - this.lastTickStart : 0;
    this.lastTickStart = frameStart;

    // Clamp dt so a long stall (tab restore, GC) can never teleport the world.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    // ── Camera + authoritative player simulation ────────────────────
    if (this.character.enabled) {
      if (!this.characterPaused) this.characterInput(dt);
      this.character.update(dt, this.camera, this.characterPaused);
      if (!this.characterPaused && (this.character.speed > 0.01 || !this.character.grounded)) this.requestShadowRefresh();
    } else {
      this.flyKeys(dt);
      this.orbit.update(dt, this.camera);
      this.character.update(dt);
    }
    if (this.pendingReadSlot) {
      this.pendingPinAge += dt;
      if (this.orbit.settled() || this.pendingPinAge > 0.85) {
        this.screens.setReadSlot(this.pendingReadSlot);
        this.pendingReadSlot = null;
        this.pendingPinAge = 0;
      }
    }
    this.avatar.group.position.copy(this.character.position);
    this.avatar.group.rotation.y = this.character.rotation;
    this.avatar.setVisible(!this.character.enabled || this.character.cameraRig.bodyVisible);
    if (!this.characterPaused) this.avatar.update(dt, time, this.character, this.camera);

    // Underwater: when the camera dips under the waterline the whole view
    // goes saturated blue so it reads as being inside the water, not as a
    // transparent sheet.
    {
      const cx = this.camera.position.x;
      const cy = this.camera.position.y;
      const cz = this.camera.position.z;
      const under =
        (insideRiver(cx, cz) && cy < WATER_LEVEL + 0.15) ||
        (coastWeight(cx, cz) > 0.42 && cy < OCEAN_LEVEL + 0.15);
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
      if (!STATIC_VEGETATION_WORLD) {
        this.grass.update(time, this.wind);
        this.hillGrass.update(time, this.wind);
        this.flora.update(time, this.wind);
        this.sorrel?.update(time, this.wind);
        this.grassTufts?.update(time, this.wind);
        this.mossBank?.update(time, this.wind);
        this.tropical?.update(time, this.wind);
      }
      // The camera position lets the water cull its plunge-pool debris when
      // the learner is nowhere near it (interest management, see water.ts).
      this.water.update(adt, time, this.camera.position);
      // The bay's idle motion (boat, umbrellas) rides the same budget.
      this.structures.update(time);
      // One squared-distance compare. Hidden meshes are skipped by the
      // renderer entirely, so a far warehouse is a single impostor draw
      // and an off-screen one is nothing.
      this.warehouse?.update(this.camera.position);
      // The homesteads are static; the call exists so the loop reads alike.
      this.beachHouses?.update(this.camera.position);
      this.farImpostors?.update(this.camera.position);
    }

    this.aiClock += dt;
    if (this.aiClock >= (study ? 1 / 12 : 1 / 30)) {
      // Screen-size culling, the UE "Cull Distance Volume" rule computed live
      // (research doc §4): things projecting under ~3–4 px cannot be read, so
      // they sleep. Smaller viewports cull CLOSER — exactly right for phones.
      const fov = this.camera.fov;
      const viewH = this.viewH;
      const herdCull = cullDistanceForPx(1.1, 3.2, fov, viewH);
      if (this.budget.animalCount > 0 || this.budget.perchedBirds > 0 || this.budget.flyingBirds > 0) {
        this.wildlife.update(this.aiClock, time, this.camera.position, herdCull * herdCull);
      }
      this.aiClock = 0;
    }

    // In auto mode the clock is re-read every 20 s. The sun crosses the sky in
    // 12.5 hours, so that is under a tenth of a degree per step — far below
    // what the eye can catch, while still costing nothing: one date read and a
    // handful of colour lerps, three times a minute.
    // Dynamic day/night is disabled in the PUBG-style world; fixed noon stays
    // valid until the scene is rebuilt. The HUD may still expose labels, but
    // the render path does not chase the wall clock.
    if (false && this.daylightMode === "auto") {
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

    // ── World streaming ─────────────────────────────────────────────────
    //
    // The "load only the grids around you" half of spatial partitioning.
    // Frustum culling already drops what is outside the view cone; this drops
    // what is inside the cone but too far to be worth resident vertex work.
    // It is what makes the SIZE of the world stop mattering — resident cost is
    // capped at a fixed radius whether the sward spans 1 km or 8 km.
    //
    // Throttled to ~8 Hz: the camera would have to move several metres inside
    // one frame to outrun it, and every cell already carries half a cell of
    // slack so nothing blinks at the boundary. The call itself is a boolean
    // flip with no allocation and no GPU upload.
    //
    // Radii are tiered so a weak phone streams tighter. Distant hills stay
    // green regardless, because the terrain bakes true-green vertex colours
    // (terrain.ts -> groundColorAt) — the grass cards past the radius were
    // contributing sub-pixel detail over an already-green hill.
    this.streamClock += dt;
    if (this.streamClock >= 0.125) {
      this.streamClock = 0;
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      const hillR =
        this.budget.tier === "low" ? 520
        : this.budget.tier === "medium" ? 700
        : this.budget.tier === "high" ? 900
        : 1150;
      const meadowR =
        this.budget.tier === "low" ? 200
        : this.budget.tier === "medium" ? 260
        : 340;
      this.hillGrass.stream(cx, cz, hillR);
      this.grass.stream(cx, cz, meadowR);
    }


    this.winter.update(dt, this.camera, 0, true);
    this.renderer.render(this.scene, this.camera);
    // The DOM boards share this camera. The call is a no-op unless the camera
    // actually moved or a board crossed a cull boundary, so a still frame
    // costs nothing here.
    this.screens.render(this.camera);

    // ── Adaptive resolution + thermal fail-safe + stats ───────────────
    const frameMs = performance.now() - frameStart;
    // The wall-clock span drives RESOLUTION (it is the honest "is the GPU
    // keeping up" signal); the tick's own production time drives the CADENCE,
    // because at a paced 30 fps the wall gap is ~33 ms by construction and
    // can never report whether 60 was actually within reach.
    const newRatio = this.adaptive.sample(wallMs > 0 ? wallMs : frameMs, frameStart, frameMs);
    if (newRatio !== null) {
      this.renderer.setPixelRatio(newRatio);
      this.requestShadowRefresh();
    }
    // Resolution alone could not save the frame (three floor-level trims) —
    // shed CONTENT instead of softening pixels any further. Each rung of the
    // ladder is allocation-free (instance-count trims + ring visibility), so
    // the shed itself never hitches. See applyShed().
    if (this.adaptive.consumeThermalHot()) this.shedOneLevel();

    this.fpsAccum += dt;
    this.fpsFrames += 1;
    if (frameStart - this.lastStats > 500 && this.opts.onStats) {
      const s = this.statsObj;
      s.fps = this.fpsFrames / Math.max(this.fpsAccum, 0.001);
      s.tier = this.budget.tier;
      s.pixelRatio = Math.round(this.adaptive.pixelRatio * 100) / 100;
      s.draws = this.renderer.info.render.calls;
      s.triangles = this.renderer.info.render.triangles;
      s.cadence = this.adaptive.cadence;
      s.shed = this.shedLevel;
      this.opts.onStats(s);
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
    this.characterWorld.dispose();
    this.grass.dispose();
    this.hillGrass.dispose();
    this.rocks.dispose();
    this.flora.dispose();
    this.sorrel?.dispose();
    this.grassTufts?.dispose();
    this.mossBank?.dispose();
    this.tropical?.dispose();
    this.wildlife.dispose();
    this.mountainForest?.dispose();
    this.farRange?.dispose();
    this.farImpostors?.dispose();
    this.water.dispose();
    this.structures.dispose();
    this.sky.dispose();
    // The anime panorama is scene-owned (cached for instant re-toggles).
    void this.animeSkyTexture?.then((t) => t?.dispose());
    this.board.dispose();
    this.dayBed?.dispose();
    this.warehouse?.dispose();
    this.beachHouses?.dispose();
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
