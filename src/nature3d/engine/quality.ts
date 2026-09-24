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
   * THE HILL COVER (three belts, see `hillGrass.ts`).
   *
   * Where the two fields above dress the meadow the learner stands in, these
   * three counts dress the world AROUND it: the foothills (wind-swayed),
   * the ridges behind them, and the mountain ranges on the horizon — every
   * hill, slope and pahad the camera can see, in the recipe measured off
   * `pahadon ke upar gras replace hill.blend`.
   *
   * One clump is 2–3 alpha-tested blade cards (4–6 triangles), so a belt is
   * cheap per instance and the budget is spent on how far the cover reaches,
   * not on how many triangles a clump has.
   */
  hillGrassNear: number;
  hillGrassFar: number;
  hillGrassHaze: number;
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
   * Far plane / fog density pair.
   *
   * Both are sized against the ZOOMED-OUT view, not the walking view. With
   * the orbit distance now capped so the camera stays over its own terrain
   * (see `OrbitRig.maxDistance`), the furthest thing that can ever be on
   * screen is the opposite corner of the plate — about 3310 m away — so every
   * tier's far plane must clear that or the far hills get sliced off.
   *
   * Fog is exponential in the SQUARE of distance, which is why 0.0006 looked
   * fine up close and turned the fully zoomed-out world into a grey-out: it
   * obscured 49 % of the far rim. 0.00028 keeps the same haze near the meadow
   * while leaving the rim ~9 % obscured, so pulling all the way back shows
   * the world instead of fog.
   */
  farPlane: number;
  fogDensity: number;

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
  // GPU, a 30 fps cadence, fp16 fragments, HALF the pixel ratio.
  low: {
    tier: "low",
    grassNear: 11000,
    grassFar: 15000,
    grassNearRadius: 28,
    grassFarRadius: 145,
    hillGrassNear: 9000,
    hillGrassFar: 3000,
    hillGrassHaze: 1200,
    treeCount: 105,
    leavesPerTree: 9,
    animalCount: 54,
    perchedBirds: 7,
    flyingBirds: 3,
    butterflies: 3,
    driftingLeaves: 12,
    waterfallParticles: 100,
    flowers: 115,
    rocks: 95,
    shadowMapSize: 0,
    richBoardMaterial: false,
    antialias: false,
    maxPixelRatio: 0.85,
    minPixelRatio: 0.5,
    sunShafts: false,
    farPlane: 3500,
    fogDensity: 0.00028,
    halfPrecision: true,
    fpsCap: 30,
    cheapPlants: true,
    plantTextureDetail: "1k",
    maxAniso: 1,
  },
  medium: {
    tier: "medium",
    grassNear: 36000,
    grassFar: 46000,
    grassNearRadius: 38,
    grassFarRadius: 240,
    hillGrassNear: 18000,
    hillGrassFar: 8000,
    hillGrassHaze: 3500,
    treeCount: 240,
    leavesPerTree: 14,
    animalCount: 34,
    perchedBirds: 12,
    flyingBirds: 6,
    butterflies: 6,
    driftingLeaves: 28,
    waterfallParticles: 220,
    flowers: 220,
    rocks: 190,
    shadowMapSize: 1024,
    richBoardMaterial: false,
    antialias: false,
    maxPixelRatio: 1.35,
    minPixelRatio: 0.7,
    sunShafts: true,
    farPlane: 3600,
    fogDensity: 0.00028,
    halfPrecision: false,
    fpsCap: 0,
    cheapPlants: false,
    plantTextureDetail: "full",
    maxAniso: 4,
  },
  high: {
    tier: "high",
    grassNear: 72000,
    grassFar: 88000,
    grassNearRadius: 46,
    grassFarRadius: 330,
    hillGrassNear: 27000,
    hillGrassFar: 15000,
    hillGrassHaze: 7000,
    treeCount: 380,
    leavesPerTree: 18,
    animalCount: 78,
    perchedBirds: 18,
    flyingBirds: 8,
    butterflies: 9,
    driftingLeaves: 42,
    waterfallParticles: 320,
    flowers: 320,
    rocks: 260,
    shadowMapSize: 2048,
    richBoardMaterial: true,
    antialias: true,
    maxPixelRatio: 1.75,
    minPixelRatio: 0.8,
    sunShafts: true,
    farPlane: 4000,
    fogDensity: 0.00028,
    halfPrecision: false,
    fpsCap: 0,
    cheapPlants: false,
    plantTextureDetail: "full",
    maxAniso: 8,
  },
  ultra: {
    tier: "ultra",
    grassNear: 115000,
    grassFar: 130000,
    grassNearRadius: 54,
    grassFarRadius: 420,
    hillGrassNear: 36000,
    hillGrassFar: 21000,
    hillGrassHaze: 11000,
    treeCount: 520,
    leavesPerTree: 22,
    animalCount: 104,
    perchedBirds: 24,
    flyingBirds: 10,
    butterflies: 12,
    driftingLeaves: 56,
    waterfallParticles: 420,
    flowers: 420,
    rocks: 340,
    shadowMapSize: 2048,
    richBoardMaterial: true,
    antialias: true,
    maxPixelRatio: 2,
    minPixelRatio: 0.85,
    sunShafts: true,
    farPlane: 4400,
    fogDensity: 0.00028,
    halfPrecision: false,
    fpsCap: 0,
    cheapPlants: false,
    plantTextureDetail: "full",
    maxAniso: 8,
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
  // and low is tuned for genuinely low-end parts (it starts at 0.85× pixels).
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
  private scale: number;
  private lastChange = 0;
  private readonly min: number;
  private readonly max: number;
  /** Frame budget in ms (30 fps tier → 33.3). */
  private readonly targetMs: number;
  /** Consecutive trims that bottomed out at the floor. */
  private floorTrims = 0;

  constructor(budget: QualityBudget, deviceRatio: number) {
    this.max = Math.min(deviceRatio || 1, budget.maxPixelRatio);
    this.min = Math.min(this.max, budget.minPixelRatio);
    this.scale = this.max;
    this.targetMs = budget.fpsCap > 0 ? 1000 / budget.fpsCap : 1000 / 60;
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
  consumeThermalHot(): boolean {
    if (this.floorTrims < 3) return false;
    this.floorTrims = 0;
    return true;
  }

  /**
   * Feed one rendered frame's wall-clock span (ms). Returns the new pixel
   * ratio when it changed.
   */
  sample(frameMs: number, now: number): number | null {
    // Ignore absurd deltas (tab restore, debugger pause, first frames).
    if (frameMs > 0 && frameMs < 500) this.samples.push(frameMs);
    if (this.samples.length < 36) return null;

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
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
 * `FORCE_MEDIUMP_SHADER_PRECISION`, web edition.
 *
 * Chains onto a material's existing `onBeforeCompile` (the grass wind uses
 * that hook too — composition, never replacement, the same discipline the
 * atmosphere pass applies) and re-declares the default float precision as
 * MEDIUMP at the top of the FRAGMENT shader string. Everything three.js
 * declares after that point — varyings, uniforms, locals — lands in fp16,
 * which on Mali/Adreno tile GPUs means double ALU rate and half the register
 * pressure for exactly the shaders that fill the screen (grass, plants,
 * water, sky).
 *
 * The VERTEX stage is deliberately untouched: world coordinates span
 * ±1.7 km, and fp16 vertex math would make distant geometry visibly jitter.
 * Interpolated varyings still arrive from highp vertex outputs — only the
 * fragment-side arithmetic goes half rate, which is where the fill-rate cost
 * actually lives.
 */
export function halfPrecisionMaterial(material: THREE.Material): void {
  const previous = material.onBeforeCompile as unknown as
    ((shader: { fragmentShader: string; vertexShader: string }, renderer: unknown) => void)
    | undefined;
  material.onBeforeCompile = ((shader: { fragmentShader: string; vertexShader: string }, renderer: unknown) => {
    previous?.call(material, shader, renderer);
    if (!shader.fragmentShader.startsWith("precision mediump")) {
      shader.fragmentShader =
        "precision mediump float;\nprecision mediump int;\n" + shader.fragmentShader;
    }
  }) as THREE.Material["onBeforeCompile"];
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : "dc"}-fp16`;
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
