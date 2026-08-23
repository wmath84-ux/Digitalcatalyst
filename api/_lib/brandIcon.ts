import type { VercelRequest, VercelResponse } from "./firebaseAdmin.js";
import { DEFAULT_ICONS, getBranding, normalizeImageUrl } from "./branding.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB cap on the upstream fetch

const isImageContentType = (type: string | null): boolean => {
  if (!type) return false;
  const value = type.toLowerCase().split(";")[0].trim();
  return value.startsWith("image/") || value === "application/octet-stream";
};

const permanentRedirect = (res: VercelResponse, location: string) => {
  // 308 lets the browser/CDN cache the fallback mapping while the logo stays
  // at its default. When a custom logo is uploaded the manifest swaps the URL
  // (versioned), so this redirect is not hit.
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  res.status(308).end();
};

/**
 * Serves the live brand logo as a PWA-installable raster icon.
 *
 * Mounted at /api/brand-icon via the shared referral-leaderboard function.
 * With a custom logo it proxies that image (Cloudinary/Firebase URL) with the
 * correct content-type and CORS header Android/Chrome require to mask/install
 * it; without one it 308-redirects to the shipped static default.
 */
export async function handleBrandIcon(req: VercelRequest, res: VercelResponse) {
  const size = String(req.query?.size || "512") === "192" ? 192 : 512;
  const maskable = String(req.query?.maskable || "") === "1";

  const { logoUrl } = await getBranding();
  const defaultIcon = maskable ? DEFAULT_ICONS.maskable : DEFAULT_ICONS[size];

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

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  const finalType =
    contentType && contentType.toLowerCase().startsWith("image/")
      ? contentType
      : "image/png";
  res.setHeader("Content-Type", finalType);
  res.setHeader(
    "Cache-Control",
    "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
  );

  const arrayBuffer = await upstream.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    return permanentRedirect(res, defaultIcon);
  }
  res.status(200).end(Buffer.from(arrayBuffer));
}
