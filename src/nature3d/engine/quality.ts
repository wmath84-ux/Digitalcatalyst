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
  /** Far plane / fog density pair. */
  farPlane: number;
  fogDensity: number;
}

const BASE: Record<QualityTier, QualityBudget> = {
  low: {
    tier: "low",
    grassNear: 14000,
    grassFar: 6000,
    grassNearRadius: 26,
    grassFarRadius: 58,
    treeCount: 14,
    leavesPerTree: 10,
    animalCount: 22,
    perchedBirds: 8,
    flyingBirds: 4,
    butterflies: 4,
    driftingLeaves: 18,
    waterfallParticles: 140,
    flowers: 140,
    rocks: 40,
    shadowMapSize: 0,
    richBoardMaterial: false,
    antialias: false,
    maxPixelRatio: 1,
    minPixelRatio: 0.6,
    sunShafts: false,
    farPlane: 520,
    fogDensity: 0.011,
  },
  medium: {
    tier: "medium",
    grassNear: 34000,
    grassFar: 16000,
    grassNearRadius: 32,
    grassFarRadius: 72,
    treeCount: 20,
    leavesPerTree: 14,
    animalCount: 34,
    perchedBirds: 12,
    flyingBirds: 6,
    butterflies: 6,
    driftingLeaves: 28,
    waterfallParticles: 220,
    flowers: 220,
    rocks: 56,
    shadowMapSize: 1024,
    richBoardMaterial: false,
    antialias: false,
    maxPixelRatio: 1.35,
    minPixelRatio: 0.7,
    sunShafts: true,
    farPlane: 620,
    fogDensity: 0.0092,
  },
  high: {
    tier: "high",
    grassNear: 68000,
    grassFar: 30000,
    grassNearRadius: 38,
    grassFarRadius: 86,
    treeCount: 26,
    leavesPerTree: 18,
    animalCount: 46,
    perchedBirds: 18,
    flyingBirds: 8,
    butterflies: 9,
    driftingLeaves: 42,
    waterfallParticles: 320,
    flowers: 320,
    rocks: 70,
    shadowMapSize: 2048,
    richBoardMaterial: true,
    antialias: true,
    maxPixelRatio: 1.75,
    minPixelRatio: 0.8,
    sunShafts: true,
    farPlane: 780,
    fogDensity: 0.0078,
  },
  ultra: {
    tier: "ultra",
    grassNear: 110000,
    grassFar: 46000,
    grassNearRadius: 44,
    grassFarRadius: 100,
    treeCount: 32,
    leavesPerTree: 22,
    animalCount: 58,
    perchedBirds: 24,
    flyingBirds: 10,
    butterflies: 12,
    driftingLeaves: 56,
    waterfallParticles: 420,
    flowers: 420,
    rocks: 84,
    shadowMapSize: 2048,
    richBoardMaterial: true,
    antialias: true,
    maxPixelRatio: 2,
    minPixelRatio: 0.85,
    sunShafts: true,
    farPlane: 900,
    fogDensity: 0.0072,
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

  if (software || weakIntel || cores <= 2 || memory <= 2) return "low";

  let score = 0;
  score += cores >= 16 ? 3 : cores >= 8 ? 2 : cores >= 6 ? 1 : 0;
  score += memory >= 16 ? 3 : memory >= 8 ? 2 : 0;
  if (/rtx|radeon rx|geforce gtx 1[06-9]|geforce rtx|apple m[1-9]|arc a\d/.test(gpu)) score += 3;
  else if (/geforce|radeon|quadro|iris xe|apple gpu/.test(gpu)) score += 1;
  if (mobileGpu) score -= 2;
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
 * Dynamic resolution scaler.
 *
 * Keeps a rolling average of the frame time. Above the "too slow" threshold it
 * drops the render scale by 8 %; when the scene has been comfortably fast for
 * a while it gives 5 % back. The steps are small and rate limited so the
 * viewer never notices a resolution "pump".
 */
export class AdaptiveResolution {
  private samples: number[] = [];
  private scale: number;
  private lastChange = 0;
  private readonly min: number;
  private readonly max: number;

  constructor(budget: QualityBudget, deviceRatio: number) {
    this.max = Math.min(deviceRatio || 1, budget.maxPixelRatio);
    this.min = Math.min(this.max, budget.minPixelRatio);
    this.scale = this.max;
  }

  get pixelRatio(): number {
    return this.scale;
  }

  /** Feed one frame (ms). Returns the new pixel ratio when it changed. */
  sample(frameMs: number, now: number): number | null {
    // Ignore absurd deltas (tab restore, debugger pause, first frames).
    if (frameMs > 0 && frameMs < 400) this.samples.push(frameMs);
    if (this.samples.length < 45) return null;

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
    if (now - this.lastChange < 900) return null;

    // 60 fps = 16.6 ms. Give ourselves room: trim above 22 ms (~45 fps),
    // restore below 13.5 ms (~74 fps).
    if (avg > 22 && this.scale > this.min) {
      this.scale = Math.max(this.min, this.scale * 0.92);
      this.lastChange = now;
      return this.scale;
    }
    if (avg < 13.5 && this.scale < this.max) {
      this.scale = Math.min(this.max, this.scale * 1.05);
      this.lastChange = now;
      return this.scale;
    }
    return null;
  }
}
