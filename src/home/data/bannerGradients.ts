import type { Banner } from "../types";

/**
 * Curated accent palette for the home hero slides.
 *
 * Phase A7: the slides sit on the pack GlassSurface (websiteglass.com
 * defaults) and each preset is a single translucent colour wash — no
 * `from/via/to` gradient plates anywhere on the home page. The class strings
 * MUST stay as source literals (exactly as written here) so Tailwind compiles
 * them into the stylesheet — the admin stores one of these values per banner
 * and the carousel renders it dynamically.
 */
export const BANNER_GRADIENTS: Array<{ id: string; label: string; classes: string }> = [
  { id: "violet", label: "Violet pop", classes: "bg-violet-500/30" },
  { id: "sunset", label: "Sunset", classes: "bg-orange-500/30" },
  { id: "ocean", label: "Ocean", classes: "bg-sky-500/30" },
  { id: "emerald", label: "Emerald", classes: "bg-emerald-500/30" },
  { id: "indigo", label: "Indigo", classes: "bg-indigo-500/30" },
  { id: "berry", label: "Berry", classes: "bg-rose-500/30" },
  { id: "gold", label: "Gold", classes: "bg-amber-500/30" },
  { id: "graphite", label: "Graphite", classes: "bg-slate-500/30" },
];

/**
 * Banners saved before A7 carry the old three-stop gradient strings; map each
 * one onto the matching accent so an admin's earlier choice survives.
 */
const LEGACY_BANNER_GRADIENTS: Record<string, string> = {
  "from-violet-600 via-fuchsia-500 to-pink-500": "bg-violet-500/30",
  "from-orange-500 via-rose-500 to-red-500": "bg-orange-500/30",
  "from-cyan-500 via-sky-500 to-blue-600": "bg-sky-500/30",
  "from-emerald-500 via-teal-500 to-cyan-600": "bg-emerald-500/30",
  "from-indigo-600 via-blue-600 to-cyan-500": "bg-indigo-500/30",
  "from-rose-500 via-pink-500 to-fuchsia-600": "bg-rose-500/30",
  "from-amber-500 via-orange-500 to-red-500": "bg-amber-500/30",
  "from-slate-700 via-slate-800 to-slate-900": "bg-slate-500/30",
};

export const DEFAULT_BANNER_GRADIENT = BANNER_GRADIENTS[0].classes;

/** True when `classes` is one of the curated presets. */
export function isKnownBannerGradient(classes: string): boolean {
  return BANNER_GRADIENTS.some((preset) => preset.classes === classes);
}

/** Preset, legacy gradient → preset, or the default accent. */
export function resolveBannerGradient(classes: string): string {
  if (isKnownBannerGradient(classes)) return classes;
  return LEGACY_BANNER_GRADIENTS[classes] ?? DEFAULT_BANNER_GRADIENT;
}

/**
 * Normalise a raw Firestore banner entry into a renderable `Banner`.
 * Unknown link targets degrade to "none" so a bad admin entry can never
 * produce a broken card.
 */
export function normalizeBanner(raw: Record<string, unknown>, fallbackIndex: number): Banner {
  const str = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

  const linkTypeRaw = String(raw.linkType ?? "none");
  const linkType: Banner["linkType"] =
    linkTypeRaw === "product" || linkTypeRaw === "module" ? linkTypeRaw : "none";
  const productId = typeof raw.productId === "string" && raw.productId.trim()
    ? raw.productId.trim()
    : undefined;
  const moduleId = typeof raw.moduleId === "string" && raw.moduleId.trim()
    ? raw.moduleId.trim()
    : undefined;

  return {
    id: str(raw.id, `banner-${fallbackIndex + 1}`),
    image: str(raw.image, "/images/hero-1.jpg"),
    eyebrow: str(raw.eyebrow, "FEATURED"),
    title: str(raw.title, "Welcome back"),
    subtitle: str(raw.subtitle, ""),
    cta: str(raw.cta, "Explore Now"),
    gradient: resolveBannerGradient(str(raw.gradient, "")),
    linkType,
    // A link is only valid with a real product id (and module id for modules).
    productId: linkType !== "none" && productId ? productId : undefined,
    moduleId: linkType === "module" && productId && moduleId ? moduleId : undefined,
  };
}
