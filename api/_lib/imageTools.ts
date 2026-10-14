// api/_lib/imageTools.ts
//
// Turns an admin-uploaded logo into a PWA-INSTALLABLE icon, server-side, with
// the same mask-safe geometry the build-time generator uses
// (scripts/generate-icons.cjs).
//
// Why this exists: /api/brand-icon used to proxy the uploaded file byte for
// byte. A tight-cropped logo therefore became a `purpose: "maskable"` icon that
// Chrome/Android cut on every diagonal, and the camera-mask preview in the
// admin panel showed exactly that — "icon bahut zoom dikhta hai, side se cut
// raha hai". The uploaded image is a MARK, not a launcher icon; something has
// to place it on a canvas at a coverage the launcher mask cannot reach.
//
// Two shapes are supported, detected automatically:
//
//   · a MARK  (the image has transparency) — cropped to its own opaque
//     bounding box and re-centred at the mask-safe coverage for the variant,
//     on a transparent canvas ("any") or the brand plate ("maskable").
//   · a TILE  (the image is opaque to its edges) — passed through full bleed,
//     because an opaque design deliberately fills the canvas and every mask
//     only trims its edges. Shrinking a tile would add a border it never had.
//
// The geometry lives in pure functions so it is unit-testable without sharp or
// a network (tests/brandIconEndpointContract.test.mjs).

import { createHash } from "node:crypto";

/** Bump when the placement maths or composition changes, to bust icon caches. */
export const BRAND_ICON_LAYOUT_VERSION = "brand-icon-layout-v2";

/** Glyph side as a fraction of the canvas, per icon variant. A diagonal glyph
 *  whose bounding box is `coverage × size` reaches `0.5 × coverage × √2` from
 *  the centre; both values stay inside the mask each variant meets. */
export const ICON_COVERAGE = {
  /** `purpose: "any"` — 0.68 → tips at 0.481 of the canvas (inside a circle). */
  any: 0.68,
  /** `purpose: "maskable"` — 0.56 → tips at 0.396 < 0.40 (the 80 % safe circle). */
  maskable: 0.56,
} as const;

export type IconVariant = keyof typeof ICON_COVERAGE;

/** The plate a transparent MARK sits on for the maskable variant. White so the
 *  installed PWA icon matches the Android adaptive icon beside it. */
export const ICON_PLATE = { r: 255, g: 255, b: 255, alpha: 1 } as const;

/**
 * The plate for a LIGHT logo. Uploaded brand marks are very often white artwork
 * on transparency, and white artwork on `ICON_PLATE` installs as a BLANK icon
 * (an empty white square on the home screen). So the plate follows the artwork,
 * exactly like scripts/generate-icons.cjs does at build time.
 */
export const ICON_DARK_PLATE = { r: 15, g: 23, b: 42, alpha: 1 } as const;

/** Mean luminance at/above which artwork counts as "light". */
export const LIGHT_ARTWORK_LUMINANCE = 200;

export type IconPlate = typeof ICON_PLATE | typeof ICON_DARK_PLATE;

/** Alpha at or below this counts as "outside the artwork". */
export const ALPHA_FLOOR = 16;

export type RgbaImage = {
  data: Buffer;
  width: number;
  height: number;
  /** Always 4 — callers decode with ensureAlpha(). */
  channels: 4;
};

export type Bounds = { left: number; top: number; width: number; height: number };

/**
 * Opaque bounding box of an RGBA image. `null` when the image is entirely
 * transparent (nothing to place) — the caller falls back to the original file.
 */
export function measureAlphaBounds(image: RgbaImage, alphaFloor = ALPHA_FLOOR): Bounds | null {
  const { data, width, height } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x * 4 + 3] < alphaFloor) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * True when every pixel is opaque (the artwork runs to all four edges), i.e.
 * the upload is a TILE rather than a MARK. Sampled rather than exhaustive: the
 * border ring is what decides, and a 2-pixel ring read on a 1024 px image is
 * already 4000+ samples.
 */
export function isOpaqueTile(image: RgbaImage, alphaFloor = ALPHA_FLOOR): boolean {
  const { data, width, height } = image;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 256));
  const opaque = (x: number, y: number) => data[(y * width + x) * 4 + 3] >= alphaFloor;
  for (let x = 0; x < width; x += step) {
    if (!opaque(x, 0) || !opaque(x, height - 1)) return false;
  }
  for (let y = 0; y < height; y += step) {
    if (!opaque(0, y) || !opaque(width - 1, y)) return false;
  }
  return true;
}

/**
 * Mean luminance (0–255) of the opaque pixels inside `bounds` — the number that
 * decides the plate. Sampled with a step so a 4000 px upload stays cheap.
 */
export function inkLuminance(image: RgbaImage, bounds: Bounds, alphaFloor = ALPHA_FLOOR): number {
  const { data, width } = image;
  const stepX = Math.max(1, Math.floor(bounds.width / 256));
  const stepY = Math.max(1, Math.floor(bounds.height / 256));
  let total = 0;
  let counted = 0;
  for (let y = bounds.top; y < bounds.top + bounds.height; y += stepY) {
    const row = y * width * 4;
    for (let x = bounds.left; x < bounds.left + bounds.width; x += stepX) {
      const i = row + x * 4;
      if (data[i + 3] < alphaFloor) continue;
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      counted += 1;
    }
  }
  return counted ? total / counted : 0;
}

/** White for a dark mark, the app's dark slate for a light one. */
export function plateForLuminance(luminance: number): IconPlate {
  return luminance >= LIGHT_ARTWORK_LUMINANCE ? ICON_DARK_PLATE : ICON_PLATE;
}

export type IconPlan =
  | { kind: "passthrough"; reason: "opaque-tile"; size: number }
  | { kind: "mark"; size: number; coverage: number; bounds: Bounds; left: number; top: number; width: number; height: number; plate: IconPlate | null };

/**
 * The placement decision for one variant. Pure: same inputs → same plan, so
 * the admin preview, the endpoint and the tests all agree.
 */
export function planBrandIconImage(input: {
  image: RgbaImage;
  size: number;
  variant: IconVariant;
}): IconPlan {
  const { image, size, variant } = input;
  // An opaque upload fills the canvas on purpose: no cropping, no shrinking.
  if (isOpaqueTile(image)) return { kind: "passthrough", reason: "opaque-tile", size };

  const bounds = measureAlphaBounds(image) ?? { left: 0, top: 0, width: image.width, height: image.height };
  const coverage = ICON_COVERAGE[variant];
  const longest = Math.max(bounds.width, bounds.height);
  const scale = longest > 0 ? (size * coverage) / longest : 1;
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));
  return {
    kind: "mark",
    size,
    coverage,
    bounds,
    left: Math.round((size - width) / 2),
    top: Math.round((size - height) / 2),
    width,
    height,
    plate: variant === "maskable" ? plateForLuminance(inkLuminance(image, bounds)) : null,
  };
}

/**
 * Content-addressed cache key for a rendered icon. Derived from the source URL,
 * the variant and the layout version, so a deployed change to the placement
 * maths can never be served from a stale CDN entry — and the browser can hold
 * the result for a year (`immutable`).
 */
export function brandIconCacheKey(input: { logoUrl: string; size: number; variant: IconVariant; version?: string }): string {
  return createHash("sha256")
    .update([BRAND_ICON_LAYOUT_VERSION, input.version || "", input.logoUrl, String(input.size), input.variant].join("|"))
    .digest("hex")
    .slice(0, 20);
}

/**
 * Raster types the icon endpoint re-renders. SVG is deliberately excluded: an
 * SVG logo is served through unchanged (it scales, so it needs no placement),
 * and rasterising untrusted SVG server-side is a liability we do not need.
 */
export const RASTER_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "image/avif",
] as const;

export function isRasterContentType(type: string | null): boolean {
  if (!type) return false;
  const value = type.toLowerCase().split(";")[0].trim();
  return (RASTER_CONTENT_TYPES as readonly string[]).includes(value) || value === "application/octet-stream";
}
