import type { Banner } from "../types";

/**
 * Curated gradient palette for the home hero slides.
 *
 * The class strings MUST stay as source literals (exactly as written here) so
 * Tailwind compiles them into the stylesheet — the admin stores one of these
 * values per banner and the carousel renders it dynamically.
 */
export const BANNER_GRADIENTS: Array<{ id: string; label: string; classes: string }> = [
  { id: "violet", label: "Violet pop", classes: "from-violet-600 via-fuchsia-500 to-pink-500" },
  { id: "sunset", label: "Sunset", classes: "from-orange-500 via-rose-500 to-red-500" },
  { id: "ocean", label: "Ocean", classes: "from-cyan-500 via-sky-500 to-blue-600" },
  { id: "emerald", label: "Emerald", classes: "from-emerald-500 via-teal-500 to-cyan-600" },
  { id: "indigo", label: "Indigo", classes: "from-indigo-600 via-blue-600 to-cyan-500" },
  { id: "berry", label: "Berry", classes: "from-rose-500 via-pink-500 to-fuchsia-600" },
  { id: "gold", label: "Gold", classes: "from-amber-500 via-orange-500 to-red-500" },
  { id: "graphite", label: "Graphite", classes: "from-slate-700 via-slate-800 to-slate-900" },
];

export const DEFAULT_BANNER_GRADIENT = BANNER_GRADIENTS[0].classes;

/** True when `classes` is one of the curated presets. */
export function isKnownBannerGradient(classes: string): boolean {
  return BANNER_GRADIENTS.some((preset) => preset.classes === classes);
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
    gradient: isKnownBannerGradient(str(raw.gradient, ""))
      ? str(raw.gradient, DEFAULT_BANNER_GRADIENT)
      : DEFAULT_BANNER_GRADIENT,
    linkType,
    // A link is only valid with a real product id (and module id for modules).
    productId: linkType !== "none" && productId ? productId : undefined,
    moduleId: linkType === "module" && productId && moduleId ? moduleId : undefined,
  };
}
