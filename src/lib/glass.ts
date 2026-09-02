/**
 * Glass runtime glue for the website-glass rollout (`src/lib/glass.ts`).
 *
 * The vendored registry components (`src/components/ui/glass*.tsx`) are kept
 * byte-comparable to the upstream files — so everything app-specific lives
 * here instead of inside them:
 *
 *   • the quality tier (full / lite / flat / off) from device capability + user override
 *   • the one-line kill switch (`data-glass` on <html>, persisted)
 *   • brand accent -> `tintColor` ("r,g,b") that the components accept
 *   • the per-screen lens budget that keeps mid-range Android at 60fps
 *
 * Nothing is wired into a page yet: Wave 0 is install-only, and the default
 * tier resolves to `off` until Wave 1 flips it on.
 */

export type GlassTier = "full" | "lite" | "flat" | "off";
export type GlassRole = "chrome" | "control" | "panel";

/** Strength per role; `lite` is what a low-end device or Safari gets. */
const STRENGTH: Record<GlassTier, Record<GlassRole, number>> = {
  full: { chrome: 0.5, control: 0.32, panel: 0.22 },
  lite: { chrome: 0.26, control: 0.16, panel: 0.1 },
  // `flat` keeps every shape, tint and rim but runs ZERO live blur anywhere —
  // no backdrop-filter on chrome, controls or panels. It is the tier for
  // `prefers-reduced-transparency: reduce` and for `?glass=flat`, and unlike
  // `off` it still shows the Black Ice backdrop (which carries no blur by
  // design) and still keeps the glass surfaces legible.
  flat: { chrome: 0, control: 0, panel: 0 },
  off: { chrome: 0, control: 0, panel: 0 },
};

/** Max simultaneously refracting lenses per screen (phones). Chrome only. */
export const GLASS_LENS_BUDGET_PHONE = 12;
export const GLASS_LENS_BUDGET_DESKTOP = 24;

const STORAGE_KEY = "dc.glass.tier";

const TIERS: readonly GlassTier[] = ["full", "lite", "flat", "off"];

/** Narrow an untrusted string (query param, localStorage) to a known tier. */
function asTier(value: string | null | undefined): GlassTier | null {
  return TIERS.find((t) => t === value) ?? null;
}

function readOverride(): GlassTier | null {
  if (typeof window === "undefined") return null;
  // ?glass=off is the escape hatch QA + the admin panel use (no deploy).
  // ?glass=flat is the zero-blur tier; both persist nothing.
  const fromUrl = asTier(new URLSearchParams(window.location.search).get("glass"));
  if (fromUrl) return fromUrl;
  try {
    const stored = asTier(window.localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    /* private mode / capacitor prefs may throw — fall through to auto */
  }
  return null;
}

/**
 * Capability probe. Chromium is required for real refraction (`backdrop-filter:
 * url()`); Safari/Firefox still get the frost material, which is why "lite" is
 * a look, not a broken state. Weak devices drop to lite regardless of engine.
 * A user who asked the OS to reduce transparency gets "flat" — every shape and
 * tint, no live blur at all.
 */
export function detectGlassTier(): GlassTier {
  if (typeof window === "undefined" || typeof document === "undefined") return "off";
  const override = readOverride();
  if (override) return override;
  if (window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches) return "flat";
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return "lite";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  if (cores <= 4 || mem <= 3) return "lite";
  const chromium = /\b(Chrome|Chromium|Edg|OPR)\//.test(navigator.userAgent);
  const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  return chromium && !safari ? "full" : "lite";
}

/** Apply the tier to <html> (CSS gates every glass rule on `data-glass`). */
export function applyGlassTier(tier: GlassTier, persist = false): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.glass = tier === "off" ? "off" : "on";
  root.dataset.glassTier = tier;
  // Phase A (owner direction): the pack components must render exactly as on
  // websiteglass.com — over its dark backdrop. The vendored files read their
  // scheme from `html.dark` / `data-theme`, and our Black Ice backdrop is
  // always dark, so the scheme is pinned to dark whenever glass is on. Off
  // (admin, ?glass=off) restores the device preference.
  if (tier === "off") root.classList.remove("dark");
  else root.classList.add("dark");
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, tier);
    } catch {
      /* ignore */
    }
  }
}

export function strengthFor(role: GlassRole, tier: GlassTier = readTier()): number {
  return STRENGTH[tier][role];
}

export function readTier(): GlassTier {
  if (typeof document === "undefined") return "off";
  return asTier(document.documentElement.dataset.glassTier) ?? "off";
}

/** "#38bdf8" | "rgb(56 189 248)" | "56,189,248" -> "56,189,248" (the prop form). */
export function toGlassRgb(color: string | null | undefined, fallback = "56,189,248"): string {
  const raw = (color || "").trim();
  if (!raw) return fallback;
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    const n = parseInt(h, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  const nums = raw.match(/[\d.]+/g);
  if (nums && nums.length >= 3) return `${Math.round(+nums[0])},${Math.round(+nums[1])},${Math.round(+nums[2])}`;
  return fallback;
}

/**
 * Lens budget. Chrome (header/dialog/dock/command) registers freely; page-level
 * surfaces call this before mounting a refracting lens and fall back to
 * `GlassSurface` (frost, zero cost) once the screen is over budget.
 */
const live = new Set<symbol>();
export function claimLens(id: symbol, budget: number): boolean {
  if (live.has(id)) return true;
  if (live.size >= budget) return false;
  live.add(id);
  return true;
}
export function releaseLens(id: symbol): void {
  live.delete(id);
}
export function liveLensCount(): number {
  return live.size;
}
