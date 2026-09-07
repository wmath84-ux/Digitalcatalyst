// src/classroom3d/quality.ts
//
// Adaptive rendering quality for the 3D classroom (Part 13) — the room's
// auto-graphics-settings, like a real-time game's.
//
// Who owns what (a single controller per actuator — two systems must never
// fight over the same knob):
//
//   · INITIAL dpr      → `computeInitialDpr` (mount only). Caps EFFECTIVE
//     shaded pixels from viewport area + devicePixelRatio: a large desktop
//     viewport starts LOWER than a small phone viewport, not higher.
//   · RUNTIME dpr      → drei's <AdaptiveDpr>, fed by QualityGovernor: the
//     governor maps <PerformanceMonitor>'s factor to a tier and writes the
//     tier's scale into the fiber store (drei 10's monitor no longer writes
//     it itself), so resolution steps down smoothly with the tier.
//   · Lights / snow    → the quality TIER below (low/medium/high), stepped by
//     the same PerformanceMonitor factor with hysteresis bands, so the room
//     never flickers between levels.
//   · Shadows          → baked once (<BakeShadows>), so per-frame shadow cost
//     is ~zero on every tier and shadows need no step in the ladder at all.
//
// The initial tier comes from a one-time static probe (viewport + dpr + CPU
// + memory) and is persisted for the session, so the room never starts at
// max quality on a weak device and never re-probes on every focus change.
// PerformanceMonitor's first averaging window is the warm-up fps sample that
// corrects the probe within ~a second when it guessed wrong.

/** The room's graphics preset. */
export type ClassroomQuality = "low" | "medium" | "high";

/** What a tier actually changes (dpr is owned by AdaptiveDpr, not the tier). */
export interface ClassroomQualitySettings {
  tier: ClassroomQuality;
  /** Snowfall particle count outside the windows. */
  snow: number;
  /** Warm ceiling lights (consolidated from the original six). */
  lampLights: 1 | 2;
  /** Wall light-spill: every wall, or only the focused wall (+ desk spill off on low). */
  spillLights: "active" | "all";
}

export const QUALITY_SETTINGS: Record<ClassroomQuality, Omit<ClassroomQualitySettings, "tier">> = {
  high: { snow: 420, lampLights: 2, spillLights: "all" },
  medium: { snow: 240, lampLights: 2, spillLights: "all" },
  low: { snow: 120, lampLights: 1, spillLights: "active" },
};

/** Starting PerformanceMonitor factor per tier (1 = full AdaptiveDpr resolution). */
export const QUALITY_FACTOR: Record<ClassroomQuality, number> = {
  high: 1,
  medium: 0.65,
  low: 0.4,
};

/**
 * Factor → tier with hysteresis bands: climbing back to high needs a
 * convincingly recovered factor (≥ 0.8), while sinking to low needs a
 * genuinely bad one (< 0.5). Together with PerformanceMonitor's averaged
 * windows this keeps the room from flickering between levels.
 */
export const qualityForFactor = (factor: number): ClassroomQuality =>
  factor >= 0.8 ? "high" : factor >= 0.5 ? "medium" : "low";

/** Session-persisted tier — probed once, reused until the tab closes. */
const TIER_STORAGE_KEY = "dc.classroomQualityTier";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Mount-time device pixel ratio. Caps EFFECTIVE shaded pixels rather than
 * the ratio: huge viewports get a lower ceiling even on modest devicePixel-
 * Ratios, while small phone screens may keep their crisp native ratio —
 * they shade far fewer pixels overall.
 */
export function computeInitialDpr(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  tier: ClassroomQuality,
): number {
  const area = Math.max(1, viewportWidth * viewportHeight);
  let dpr = Math.min(Math.max(1, devicePixelRatio || 1), 2);
  if (area >= 8_000_000) dpr = Math.min(dpr, 1); // 4K and beyond: native pixels are plenty
  else if (area >= 3_700_000) dpr = Math.min(dpr, 1.25); // 1440p class
  else if (area >= 2_000_000) dpr = Math.min(dpr, 1.5); // 1080p class
  const tierScale = tier === "high" ? 1 : tier === "medium" ? 0.85 : 0.7;
  return Math.round(clamp(dpr * tierScale, 0.65, 2) * 100) / 100;
}

interface ProbeInput {
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  deviceMemory: number;
}

const readProbeInput = (): ProbeInput => ({
  viewportWidth: typeof window === "undefined" ? 1280 : window.innerWidth,
  viewportHeight: typeof window === "undefined" ? 720 : window.innerHeight,
  devicePixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  hardwareConcurrency:
    typeof navigator === "undefined" ? 8 : navigator.hardwareConcurrency || 8,
  // Chrome-only; everyone else reports 8 (unknown) and is judged on the rest.
  deviceMemory:
    typeof navigator === "undefined"
      ? 8
      : (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8,
});

/**
 * One-time static probe → initial tier. Weak CPUs and thin devices start
 * low, huge/high-dpi screens start medium (they shade the most pixels), and
 * small screens start high. A stored session choice always wins so the room
 * never re-probes (and never visibly pops quality) on remount.
 */
export function pickInitialTier(input: ProbeInput = readProbeInput()): ClassroomQuality {
  try {
    const stored = sessionStorage.getItem(TIER_STORAGE_KEY);
    if (stored === "low" || stored === "medium" || stored === "high") return stored;
  } catch {
    /* private mode — probe fresh every mount */
  }
  const area = Math.max(1, input.viewportWidth * input.viewportHeight);
  let tier: ClassroomQuality = "high";
  if (input.hardwareConcurrency <= 4 || input.deviceMemory <= 4) tier = "low";
  else if (area >= 8_000_000) tier = "medium";
  else if (input.devicePixelRatio >= 3 && area >= 1_000_000) tier = "medium";
  else if (input.hardwareConcurrency <= 6 && area >= 2_000_000) tier = "medium";
  rememberTier(tier);
  return tier;
}

/** Persist the live tier so a remount (flat ⇄ room) resumes where it settled. */
export function rememberTier(tier: ClassroomQuality): void {
  try {
    sessionStorage.setItem(TIER_STORAGE_KEY, tier);
  } catch {
    /* private mode — the tier simply won't persist */
  }
}

/** Full settings for a tier (dpr lives outside the tier — see above). */
export function qualitySettings(tier: ClassroomQuality): ClassroomQualitySettings {
  return { tier, ...QUALITY_SETTINGS[tier] };
}
