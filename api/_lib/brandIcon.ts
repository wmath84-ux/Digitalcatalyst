import type { VercelRequest, VercelResponse } from "./firebaseAdmin.js";
import { DEFAULT_ICONS, getBranding, normalizeImageUrl } from "./branding.js";
import { brandIconCacheKey, isRasterContentType, type IconVariant } from "./imageTools.js";
import { loadSharp, renderBrandIcon } from "./brandIconRender.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB cap on the upstream fetch

const permanentRedirect = (res: VercelResponse, location: string) => {
  // 308 lets the browser/CDN cache the fallback mapping while the logo stays
  // at its default. When a custom logo is uploaded the manifest swaps the URL
  // (versioned), so this redirect is not hit.
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  res.status(308).end();
};

const sendImage = (
  res: VercelResponse,
  body: Buffer,
  contentType: string,
  cacheControl: string,
) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  res.status(200).end(body);
};

/**
 * Serves the live brand logo as a PWA-installable raster icon.
 *
 * Mounted at /api/brand-icon via the shared referral-leaderboard function.
 *
 *   · no custom logo        → 308 to the shipped static icon (unchanged)
 *   · a MARK  (transparency) → cropped to its artwork and re-centred at the
 *                             mask-safe coverage for the variant, so no
 *                             launcher mask can slice it (imageTools.ts has
 *                             the geometry and the reasoning)
 *   · a TILE  (fully opaque) → served full bleed, because an opaque design
 *                             fills the canvas on purpose
 *   · sharp unavailable      → the original file, with `no-store` so a later
 *                             deploy can still take over
 *
 * Rendered icons are content-addressed (`?v=` comes from the branding version
 * and the layout version), so they are immutable for a year — the install
 * prompt re-fetches exactly once per logo change and never shows a stale crop.
 */
export async function handleBrandIcon(req: VercelRequest, res: VercelResponse) {
  const size = String(req.query?.size || "512") === "192" ? 192 : 512;
  const variant: IconVariant = String(req.query?.maskable || "") === "1" ? "maskable" : "any";

  const { logoUrl, version } = await getBranding();
  const defaultIcon = variant === "maskable" ? DEFAULT_ICONS.maskable : DEFAULT_ICONS[size];

  if (!logoUrl) {
    return permanentRedirect(res, defaultIcon);
  }

  const target = normalizeImageUrl(logoUrl);
  if (!target) {
    return permanentRedirect(res, defaultIcon);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      redirect: "follow",
      headers: { Accept: "image/*" },
    });
  } catch {
    return permanentRedirect(res, defaultIcon);
  }

  if (!upstream.ok || !upstream.body) {
    return permanentRedirect(res, defaultIcon);
  }

  const contentType = upstream.headers.get("content-type");
  if (!isImageContentType(contentType)) {
    return permanentRedirect(res, defaultIcon);
  }

  const contentLength = Number(upstream.headers.get("content-length") || 0);
  if (contentLength && contentLength > MAX_IMAGE_BYTES) {
    return permanentRedirect(res, defaultIcon);
  }

  const arrayBuffer = await upstream.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    return permanentRedirect(res, defaultIcon);
  }
  // One copy, one type: `Uint8Array` view → Buffer (no `Buffer.from(ArrayBuffer)`
  // overload ambiguity under @types/node 22 / TS 5.9).
  const originalBytes = Buffer.from(new Uint8Array(arrayBuffer));
  const originalType =
    contentType && contentType.toLowerCase().startsWith("image/")
      ? contentType.split(";")[0].trim().toLowerCase()
      : "image/png";

  // SVG (and anything sharp cannot decode) is served through: an SVG logo
  // already scales to any icon size, and it needs no mask-safe placement.
  const sharp = isRasterContentType(contentType) ? await loadSharp() : null;
  if (sharp) {
    try {
      const rendered = await renderBrandIcon(sharp, originalBytes, { size, variant });
      if (rendered) {
        // Exactly `size × size` (see renderBrandIcon): the manifest's declared
        // sizes are a promise to Chrome, and a mismatch blocks installation.
        const key = brandIconCacheKey({ logoUrl: target, size, variant, version });
        res.setHeader("ETag", `"${key}"`);
        return sendImage(
          res,
          rendered.body,
          rendered.contentType,
          "public, max-age=31536000, immutable, stale-while-revalidate=86400",
        );
      }
    } catch (error) {
      // A corrupt or unexpected file must not turn into a 500: fall through to
      // the original bytes below, which is exactly what this route did before.
      console.warn("[brand-icon] could not compose the icon — serving the original", error);
    }
  }

  // Not composed (SVG, sharp missing in this runtime, or a decode failure).
  // The bytes are still the admin's current logo, but they may be the wrong
  // size and are not mask-safe, so they must not be cached for a year: a short
  // TTL lets the next deploy (or the next logo) take effect quickly.
  res.setHeader("ETag", `"raw-${brandIconCacheKey({ logoUrl: target, size, variant, version })}"`);
  return sendImage(res, originalBytes, originalType, "public, max-age=0, s-maxage=60, must-revalidate");
}

const isImageContentType = (type: string | null): boolean => {
  if (!type) return false;
  const value = type.toLowerCase().split(";")[0].trim();
  return value.startsWith("image/") || value === "application/octet-stream";
};
