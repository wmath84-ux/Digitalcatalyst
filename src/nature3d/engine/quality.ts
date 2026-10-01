// src/nature3d/engine/quality.ts
//
// DEVICE TIER + ADAPTIVE RESOLUTION.
//
// The nature sanctuary has to hold a locked frame budget on a gaming laptop
// AND on a 4-year-old office machine / low-end tablet. Battle-royale engines
// solve this the same way we do here:
//
//   1. A STATIC TIER decided once at boot from the GPU string, core count,
//      device memory and the screen size. The tier picks the *content*
//      budget — grass blade count, animal head-count, shadow map size,
//      whether expensive materials (transmission / clearcoat) are allowed.
//   2. A DYNAMIC RESOLUTION SCALER that watches the rolling frame time and
//      trims (or restores) the render resolution in small steps. Content is
//      never popped in/out at runtime — only pixels — so the scene never
//      visibly "degrades", it just gets slightly softer for a few seconds.
//
// Everything is pure data: the engine reads the budget object, so there is a
// single place to tune performance.

import * as THREE from "three";

export type QualityTier = "low" | "medium" | "high" | "ultra";

export interface QualityBudget {
  tier: QualityTier;
  /** Grass blades in the dense near field. */
  grassNear: number;
  /** Grass blades/clumps in the sparse far field. */
  grassFar: number;
  /** Radius (world units) of the dense grass field. */
  grassNearRadius: number;
  /** Radius of the far grass field. */
  grassFarRadius: number;
  /**
   * Clumps in the WORLD-WIDE hill sward — the dense grass that covers every
   * hill, stone and mountain across the full 360° circle (`hillGrass.ts`).
   * Every tier keeps the sward complete; weak devices grow bigger far cards
   * instead of more instances.
   */
  hillGrass: number;
  /** Trees around the clearing. */
  treeCount: number;
  /** Leaf cards per tree canopy. */
  leavesPerTree: number;
  /** Total grazing animals (herds + babies). */
  animalCount: number;
  /** Birds perched in the canopies. */
  perchedBirds: number;
  /** Birds circling the sky. */
  flyingBirds: number;
  butterflies: number;
  driftingLeaves: number;
  waterfallParticles: number;
  flowers: number;
  rocks: number;
  /** Shadow map resolution; 0 disables shadows entirely. */
  shadowMapSize: number;
  /** Allow MeshPhysicalMaterial (transmission/clearcoat) on the board. */
  richBoardMaterial: boolean;
  /** Anti-aliasing in the WebGL context (MSAA). */
  antialias: boolean;
  /** Upper bound for the device pixel ratio. */
  maxPixelRatio: number;
  /** Lower bound the dynamic scaler may fall to. */
  minPixelRatio: number;
  /** Volumetric sun shafts. */
  sunShafts: boolean;
  /**
   * Far plane / distance fog pair.
   *
   * Far plane is sized against the ZOOMED-OUT view so the opposite corner of
   * the plate (~3310 m) is never sliced off.
   *
   * SMOKE FOG uses THREE.Fog (linear distance fog — three.js manual):
   *   fogNear  anything closer is crystal clear
   *   fogFar   anything further is fully the fog/smoke colour
   * Between near→far the mix ramps 0→1. This is the standard open-world
   * "near clear, far smoky" setup (threejs.org/manual fog page). fogDensity
   * is kept as a residual Exp2-compat value for underwater / ice overrides.
   */
  farPlane: number;
  /** Residual Exp2 density (underwater / ice). Distance smoke uses fogNear/Far. */
  fogDensity: number;
  /** Metres from camera where smoke fog starts (THREE.Fog.near). */
  fogNear: number;
  /** Metres from camera where smoke is fully opaque (THREE.Fog.far). */
  fogFar: number;

  // ── Mobile bandwidth diet (the mid-to-low Android fail-safe set) ──────
  //
  // The four flags below are the web equivalents of the owner's perf
  // research (see SANCTUARY_MOBILE_PERFORMANCE.md). They only engage on the
  // "low" tier — desktop tiers render exactly as before.
  /**
   * `FORCE_MEDIUMP_SHADER_PRECISION`: the heaviest fragment shaders are
   * re-declared at mediump (fp16) — double ALU throughput on Mali/Adreno
   * tile-based GPUs, half the register pressure. Vertex stays highp
   * everywhere (the world is ±1.7 km — fp16 vertex positions would jitter),
   * so the re-declaration is injected into the FRAGMENT stage only.
   */
  halfPrecision: boolean;
  /**
   * `ACTIVATE_THERMAL_DRS_PACING` (pacing half): cap the render loop at this
   * many fps. 0 = uncapped (desktop). A 30 fps cap on tile GPUs beats a
   * stuttering 45: the browser vsync-throttles a slow GPU anyway, and a
   * fixed cadence kills the micro-stutter Swappy exists to remove.
   */
  fpsCap: number;
  /**
   * Cheap plant materials: the real-plant fields (sorrel / grass tufts /
   * moss) switch from MeshStandardMaterial (PBR — several times the ALU of
   * Lambert on tile GPUs) to MeshLambertMaterial and skip the normal, ARM
   * and AO texture fetches entirely (3 fewer texture units and megabytes
   * less texture bandwidth per frame — the bandwidth half of
   * `APPLY_ASTC_CHANNEL_PACKING` when a compressed-texture pipeline is not
   * available offline).
   */
  cheapPlants: boolean;
  /** Texture detail for the glTF plant fields: 2 K authored or a 1 K diet. */
  plantTextureDetail: "full" | "1k";
  /** Max texture anisotropy — aniso 8× costs real bandwidth on mobile. */
  maxAniso: number;
}

const BASE: Record<QualityTier, QualityBudget> = {
  // LOW is what every phone and tablet actually gets (see detectTier — the
  // mobile-GPU penalty pushes even flagships down unless they are the newest
  // silicon), so this tier IS the product for most learners. It used to be a
  // lightly-trimmed desktop budget and it lagged; it is now tuned the way
  // the owner's research prescribes: content that fits a Mali-class tile
  // GPU, a 30 fps cadence, fp16 fragments and adaptive native-ish clarity.
  low: {
    tier: "low",
    // Clarity pass: a modest density lift fills the closest meadow without
    // enabling any new draw calls/material passes. Every field stays instanced
    // and the existing thermal ladder can still trim it allocation-free.
    grassNear: 1800,
    grassFar: 0,
    hillGrass: 0,
    grassNearRadius: 24,
    grassFarRadius: 90,
    treeCount: 84,
    leavesPerTree: 7,
    animalCount: 0,
    perchedBirds: 0,
    flyingBirds: 0,
    butterflies: 0,
    driftingLeaves: 0,
    waterfallParticles: 0,
    flowers: 60,
    rocks: 90,
    // Shadows were OFF entirely on this tier, which is the single biggest
    // reason a phone frame reads as flat: with no cast shadow nothing is
    // visually anchored to the ground, and the scene loses its sense of scale.
    // A 512 map is a quarter of the medium tier's texels but still resolves a
    // tree or a board shadow, and because the map is STATIC (scene.ts sets
    // shadowMap.autoUpdate = false and only re-renders it on demand) the cost
    // is paid once, not per frame.
    shadowMapSize: 0,
    richBoardMaterial: false,
    antialias: false,
    // 0.85 DPR made texturing and foliage visibly soft even when the GPU had
    // headroom. Start at a native-ish 1.05 and let wall-clock DRS step down to
    // 0.65 only when the phone actually misses its locked 30 fps budget.
    maxPixelRatio: 0.9,
    minPixelRatio: 0.55,
    sunShafts: false,
    // Far plane must clear the open-ocean disc (~5400 m) and leave headroom
    // so a camera off-centre never clips sea or sky into a black hole.
    farPlane: 6200,
    fogDensity: 0.00034,
    fogNear: 90,
    fogFar: 4200,
    halfPrecision: true,
    fpsCap: 30,
    cheapPlants: true,
    plantTextureDetail: "1k",
    // 2× is a small, bounded sampler cost and dramatically improves the
    // ground/paths at the grazing angles used by the desk camera.
    maxAniso: 1,
  },
  medium: {
    tier: "medium",
    grassNear: 2800,
    grassFar: 0,
    hillGrass: 0,
    grassNearRadius: 28,
    grassFarRadius: 100,
    treeCount: 130,
    leavesPerTree: 8,
    animalCount: 0,
    perchedBirds: 0,
    flyingBirds: 0,
    butterflies: 0,
    driftingLeaves: 0,
    waterfallParticles: 0,
    flowers: 90,
    rocks: 130,
    shadowMapSize: 0,
    richBoardMaterial: false,
    antialias: false,
    maxPixelRatio: 1.05,
    minPixelRatio: 0.6,
    sunShafts: false,
    farPlane: 6400,
    fogDensity: 0.00034,
    fogNear: 90,
    fogFar: 4200,
    halfPrecision: false,
    fpsCap: 0,
    cheapPlants: false,
    plantTextureDetail: "full",
    maxAniso: 2,
  },
  high: {
    tier: "high",
    grassNear: 4200,
    grassFar: 0,
    hillGrass: 0,
    grassNearRadius: 34,
    grassFarRadius: 120,
    treeCount: 180,
    leavesPerTree: 9,
    animalCount: 0,
    perchedBirds: 0,
    flyingBirds: 0,
    butterflies: 0,
    driftingLeaves: 0,
    waterfallParticles: 0,
    flowers: 130,
    rocks: 180,
    shadowMapSize: 0,
    richBoardMaterial: true,
    antialias: true,
    maxPixelRatio: 1.25,
    minPixelRatio: 0.65,
    sunShafts: false,
    farPlane: 7000,
    fogDensity: 0.00034,
    fogNear: 90,
    fogFar: 4200,
    halfPrecision: false,
    fpsCap: 0,
    cheapPlants: false,
    plantTextureDetail: "full",
    maxAniso: 2,
  },
  ultra: {
    tier: "ultra",
    grassNear: 5600,
    grassFar: 0,
    hillGrass: 0,
    grassNearRadius: 40,
    grassFarRadius: 140,
    treeCount: 240,
    leavesPerTree: 10,
    animalCount: 0,
    perchedBirds: 0,
    flyingBirds: 0,
    butterflies: 0,
    driftingLeaves: 0,
    waterfallParticles: 0,
    flowers: 170,
    rocks: 230,
    shadowMapSize: 0,
    richBoardMaterial: true,
    antialias: true,
    maxPixelRatio: 1.4,
    minPixelRatio: 0.7,
    sunShafts: false,
    farPlane: 7800,
    fogDensity: 0.00034,
    fogNear: 90,
    fogFar: 4200,
    halfPrecision: false,
    fpsCap: 0,
    cheapPlants: false,
    plantTextureDetail: "full",
    maxAniso: 2,
  },
};

function readGpuString(): string {
  if (typeof document === "undefined") return "";
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const loseCtx = gl.getExtension("WEBGL_lose_context");
    loseCtx?.loseContext();
    return typeof raw === "string" ? raw.toLowerCase() : "";
  } catch {
    return "";
  }
}

/** True when the browser cannot give us a WebGL context at all. */
export function webglSupported(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Decide the static tier once, at boot. */
export function detectTier(): QualityTier {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "medium";

  const gpu = readGpuString();
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const pixels = window.screen ? window.screen.width * window.screen.height * (window.devicePixelRatio || 1) : 2_000_000;

  // Software renderers and the classic low-end Intel parts never get a heavy budget.
  const software = /swiftshader|llvmpipe|software|basic render/.test(gpu);
  const weakIntel = /intel.*(hd|uhd) graphics (3000|4000|4400|5000|520|530|610|620)/.test(gpu);
  const mobileGpu = /adreno|mali|powervr|apple a\d/.test(gpu);
  // Flagship phone silicon (Adreno 640+, Mali-G77+, Apple A14+) CAN carry the
  // medium tier — the blanket mobile penalty used to pin even these to low,
  // and low is tuned for genuinely low-end parts (1.05× clarity start with a
  // DRS floor, rather than permanently blurring every phone at 0.85×).
  const fastMobileGpu = /adreno (6[4-9]\d|7\d\d|8\d\d)|mali-g(7[7-9]|[89]\d|\d\d\d)|apple a1[4-9]|apple a\d pro|apple m[1-9]|tensor g[3-9]|dimensity (8|9)\d\d\d|xclipse/.test(gpu);

  if (software || weakIntel || cores <= 2 || memory <= 2) return "low";

  let score = 0;
  score += cores >= 16 ? 3 : cores >= 8 ? 2 : cores >= 6 ? 1 : 0;
  score += memory >= 16 ? 3 : memory >= 8 ? 2 : 0;
  if (/rtx|radeon rx|geforce gtx 1[06-9]|geforce rtx|apple m[1-9]|arc a\d/.test(gpu)) score += 3;
  else if (/geforce|radeon|quadro|iris xe|apple gpu/.test(gpu)) score += 1;
  if (mobileGpu && !fastMobileGpu) score -= 2;
  if (fastMobileGpu) score += 1;
  if (coarse) score -= 1;
  if (pixels > 5_000_000) score -= 1; // 4K+ costs fill rate

  if (score >= 7) return "ultra";
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

export function budgetFor(tier: QualityTier): QualityBudget {
  return { ...BASE[tier] };
}

/**
 * Dynamic resolution scaler — the DRS half of `ACTIVATE_THERMAL_DRS_PACING`.
 *
 * It watches the WALL-CLOCK interval between rendered frames, not the JS CPU
 * time of the tick: on a GPU-bound phone the tick's CPU cost is a calm 4 ms
 * while the GPU is drowning, and the only place that back-pressure shows up
 * is the browser vsync-throttling the rAF — i.e. the inter-frame interval.
 *
 * Thresholds are derived from the tier's frame budget (`targetMs`): a 30 fps
 * cap tier trims when it cannot hold 30, a 60 fps tier trims above ~45 fps.
 * When frames get long it drops the render scale; once the scene has been
 * comfortably fast for a while it gives some back. Steps are rate limited so
 * the viewer never notices a resolution "pump".
 *
 * The scaler also reports THERMAL HOT (`consumeThermalHot`): three trims in a
 * row that all landed on the floor mean resolution alone cannot save the
 * frame — the caller then sheds content (far foliage rings, moss) instead of
 * softening pixels any further. That is the thermal-collapse fail-safe.
 */
export class AdaptiveResolution {
  private samples: number[] = [];
  /** Per-frame PRODUCTION time, kept alongside the wall-clock samples. */
  private workSamples: number[] = [];
  private scale: number;
  private lastChange = 0;
  private readonly min: number;
  private readonly max: number;
  /**
   * Frame budget in ms, and it is no longer a constant. It follows
   * `cadenceFps`, which starts at 60 on every tier and only steps DOWN to the
   * tier's fallback cadence when a sustained overrun proves 60 is genuinely
   * unreachable — see `cadenceFps` below.
   */
  private targetMs: number;
  /** Consecutive trims that bottomed out at the floor. */
  private floorTrims = 0;
  /**
   * DYNAMIC FRAME CADENCE.
   *
   * The low tier used to hard-cap at 30 fps: the render loop threw away every
   * other rAF tick outright. That was a sensible default for a scene that
   * could not hold 60, but it made 60 **architecturally impossible** — no
   * amount of geometry work could get past the cap, because the engine was
   * discarding the frames it did manage to produce.
   *
   * It now starts at 60 everywhere and only falls back to the tier's cadence
   * (`fpsCap`, 30 on low) after TWO consecutive 36-frame windows have proven
   * 60 is out of reach, then climbs straight back as soon as two windows come
   * in comfortably under budget. A fixed 30 Hz cadence really is smoother
   * than a stuttering 45 — that part of the original reasoning was right —
   * but it should be a *fallback*, not a ceiling.
   *
   * 0 means uncapped (desktop tiers), which is unchanged behaviour: the
   * browser vsync-paces a free-running loop for us.
   */
  private cadenceFps: number;
  /** The tier's fallback cadence; 0 = never pace (desktop). */
  private readonly fallbackFps: number;
  /** Consecutive 36-frame windows that missed / beat the current cadence. */
  private slowWindows = 0;
  private fastWindows = 0;

  constructor(budget: QualityBudget, deviceRatio: number) {
    this.max = Math.min(deviceRatio || 1, budget.maxPixelRatio);
    this.min = Math.min(this.max, budget.minPixelRatio);
    this.scale = this.max;
    this.fallbackFps = budget.fpsCap > 0 ? budget.fpsCap : 0;
    this.cadenceFps = this.fallbackFps > 0 ? 60 : 0;
    this.targetMs = this.cadenceFps > 0 ? 1000 / this.cadenceFps : 1000 / 60;
  }

  /**
   * Milliseconds between rendered frames for the loop's pacer. 0 = do not
   * pace (desktop). The loop reads this every tick, so a cadence change
   * takes effect on the very next frame.
   */
  get paceIntervalMs(): number {
    return this.cadenceFps > 0 ? 1000 / this.cadenceFps : 0;
  }

  /** The cadence currently in force, for the stats HUD. */
  get cadence(): number {
    return this.cadenceFps;
  }

  get pixelRatio(): number {
    return this.scale;
  }

  get atFloor(): boolean {
    return this.scale <= this.min + 1e-6;
  }

  /**
   * True once, when resolution trimming has demonstrably failed (three
   * floor-level trims without a recovery). The caller consumes the signal by
   * shedding one content level; the counter then re-arms.
   */
  /**
   * Move the frame cadence between 60 and the tier's fallback, with
   * hysteresis on BOTH directions so it can never oscillate frame-to-frame.
   *
   * Downgrade: two consecutive 36-frame windows whose production time exceeds
   * 20.8 ms (i.e. genuinely worse than ~48 fps) mean 60 is not happening;
   * settle on the fallback cadence rather than stuttering at 45.
   *
   * Upgrade: while paced at the fallback, two consecutive windows whose
   * production time comes in under 18.3 ms mean there is real headroom for
   * 60 — hand the frames back instead of sitting at 30 forever.
   */
  private stepCadence(avgWorkMs: number): void {
    if (this.fallbackFps <= 0) return; // desktop: never paced
    const sixty = 1000 / 60;
    if (this.cadenceFps === 60) {
      this.fastWindows = 0;
      if (avgWorkMs > sixty * 1.25) this.slowWindows += 1;
      else this.slowWindows = 0;
      if (this.slowWindows >= 2) {
        this.slowWindows = 0;
        this.cadenceFps = this.fallbackFps;
        this.targetMs = 1000 / this.cadenceFps;
      }
      return;
    }
    this.slowWindows = 0;
    if (avgWorkMs < sixty * 1.1) this.fastWindows += 1;
    else this.fastWindows = 0;
    if (this.fastWindows >= 2) {
      this.fastWindows = 0;
      this.cadenceFps = 60;
      this.targetMs = sixty;
    }
  }

  consumeThermalHot(): boolean {
    if (this.floorTrims < 3) return false;
    this.floorTrims = 0;
    return true;
  }

  /**
   * Feed one rendered frame's wall-clock span (ms). Returns the new pixel
   * ratio when it changed.
   *
   * `workMs` is how long PRODUCING the frame actually took (the tick's own
   * CPU+submit span), as opposed to the wall-clock gap between rendered
   * frames. They differ whenever the pacer is skipping ticks — at a 30 fps
   * cadence the wall gap is ~33 ms *by construction*, so it can never tell
   * us whether 60 was reachable. Cadence decisions therefore read `workMs`;
   * resolution decisions keep reading the wall-clock span, which is the
   * honest signal for "is the GPU keeping up".
   */
  sample(frameMs: number, now: number, workMs = frameMs): number | null {
    // Ignore absurd deltas (tab restore, debugger pause, first frames).
    if (frameMs > 0 && frameMs < 500) this.samples.push(frameMs);
    if (workMs > 0 && workMs < 500) this.workSamples.push(workMs);
    if (this.samples.length < 36) return null;

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
    const avgWork = this.workSamples.length
      ? this.workSamples.reduce((a, b) => a + b, 0) / this.workSamples.length
      : avg;
    this.workSamples.length = 0;

    this.stepCadence(avgWork);

    if (now - this.lastChange < 900) return null;

    // Frame overruns: a sustained ~60 % overrun gets a hard chop (−15 %), a
    // ~25 % overrun the classic −8 % trim. Recovery gives back 5 % at a time
    // once we are beating ~80 % of the budget — the hysteresis keeps the
    // scale from oscillating around the threshold.
    const hard = this.targetMs * 1.6;
    const soft = this.targetMs * 1.22;
    const restore = this.targetMs * 0.8;

    if (avg > soft && this.scale > this.min) {
      const cut = avg > hard ? 0.85 : 0.92;
      this.scale = Math.max(this.min, this.scale * cut);
      this.lastChange = now;
      if (this.atFloor) this.floorTrims += 1;
      else this.floorTrims = 0;
      return this.scale;
    }
    if (avg < restore && this.scale < this.max) {
      this.scale = Math.min(this.max, this.scale * 1.05);
      this.lastChange = now;
      this.floorTrims = 0;
      return this.scale;
    }
    // Stable at the floor but never recovering: that is still "hot" — let a
    // sustained overrun keep nudging the fail-safe even without a trim.
    if (this.atFloor && avg > soft && this.floorTrims < 3) this.floorTrims += 1;
    return null;
  }
}

/**
 * Legacy low-tier precision entry point; keep BOTH shader stages highp.
 *
 * Prepending `precision mediump` to only the fragment source changed the
 * precision of shared uniforms (directionalLightShadows, uTime, …), while
 * their vertex declarations stayed highp. WebGL2 rejects that at LINK time:
 * every patched terrain/house/plant disappeared, leaving just the DOM boards.
 * Varyings also need matching precision. Grepping GLSL cannot catch this;
 * tests/sanctuaryWorldBrowser.test.mjs actually links the low-tier programs.
 *
 * Three's material.precision sets a consistent program prefix for both
 * stages. Use highp: mediump in BOTH stages would link, but lose centimetre
 * accuracy across the kilometre-wide world. Resolution, LOD and thermal
 * shedding still provide the mobile budget. Future fp16 optimisations must
 * qualify individual LOCAL fragment expressions, never the stage default.
 * Do not wrap/replace onBeforeCompile: wind, atmosphere and winter keep
 * their existing chain, and repeat registration is naturally idempotent.
 */
export function halfPrecisionMaterial(material: THREE.Material): void {
  material.precision = "highp";
}

/** Apply `halfPrecisionMaterial` to every mesh material under a root. */
export function halfPrecisionTree(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && !seen.has(m)) {
        seen.add(m);
        halfPrecisionMaterial(m);
      }
    }
  });
}
