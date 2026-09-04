/**
 * The pinned glass "sensitivity" — the exact playground config shown on
 * websiteglass.com/docs/components/glass (owner-approved reference screenshot,
 * 2026-09-04). Every portal chrome surface (dock, header) and every glass card
 * on Home / Store / PDP reads these numbers; do not tune them per surface.
 *
 * This lives in its OWN module (not src/lib/glass.ts) on purpose:
 * scripts/glass-coverage.mjs resolves registry imports by path basename, so a
 * `from "@/lib/glass"` import would be mis-counted as adoption of the registry
 * `glass` item. Keep the constants here; import them as `@/lib/glassDocs`.
 *
 *   radius 24 · strength 0.5 · dome 0.1 · blur 0 (owner override)
 *
 * `Glass` takes them verbatim. `GlassSurface` has no displacement, so the
 * pack-equivalent numbers for the same config are derived with its own
 * formulas (see GlassSurface in components/ui/glass.tsx):
 *
 *   tint alpha = 0.25 * 0.42 = 0.105
 *   blur       = 0 — OWNER OVERRIDE (2026-09-04, "background blur ekadam
 *   hata do"): no glass surface frosts the background any more; glass is
 *   tint + rim + refraction only. The docs' blur 4 is recorded below so the
 *   origin of the pin stays traceable.
 *   saturate   = 1 + (1.6 - 1) * max(0.25,0.25) = 1.15
 */
export const GLASS_DOCS = {
  radius: 24,
  strength: 0.5,
  blur: 0, // docs ship 4 — removed app-wide on owner direction
  tint: 0.25,
  dome: 0.1,
} as const;

/** GlassSurface-equivalents of GLASS_DOCS (the values its layers actually paint). */
export const GLASS_DOCS_SURFACE = {
  tintAlpha: 0.105,
  blurPx: 0,
  saturate: 1.15,
} as const;
