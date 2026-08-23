import type { VercelRequest, VercelResponse } from "./_lib/firebaseAdmin.js";
import { DEFAULT_ICONS, getBranding } from "./_lib/branding.js";

const APP_NAME = "Eduvora";

/**
 * Dynamic PWA web app manifest.
 *
 * The static /manifest.webmanifest ships hardcoded icons, so a logo uploaded
 * in the admin branding page never reached the installed PWA / "Add to Home
 * screen" icon. This endpoint reads the live `settings/branding` doc and emits
 * icon src points at the brand-icon proxy, which serves the uploaded image
 * (or the built-in default) with permissive CORS + long-lived caching.
 *
 * The client cache-busts this URL (see applyDocumentBrandIcons) whenever the
 * logo changes, forcing browsers to re-read it; installed PWAs refresh their
 * icon on the next launch / manifest update.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { logoUrl, version } = await getBranding();

  const versioned = (path: string) => `${path}${path.includes("?") ? "&" : "?"}v=${version}`;

  // With a custom logo, point every purpose at the uploaded image. The
  // brand-icon proxy serves it with the correct content-type and CORS headers
  // so Chrome/Android can fetch and mask it. Without one, use the shipped
  // raster + SVG defaults.
  const icons = logoUrl
    ? [
        {
          src: versioned(`/api/brand-icon?size=192`),
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: versioned(`/api/brand-icon?size=512`),
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: versioned(`/api/brand-icon?size=512&maskable=1`),
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ]
    : [
        { src: DEFAULT_ICONS[192], sizes: "192x192", type: "image/png" },
        { src: DEFAULT_ICONS[512], sizes: "512x512", type: "image/png" },
        { src: DEFAULT_ICONS.maskable, sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
      ];

  const manifest = {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Eduvora student learning app for notes, courses, and digital study resources.",
    start_url: "/#/home",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#2563eb",
    background_color: "#ffffff",
    categories: ["education", "productivity"],
    icons,
  };

  // Manifest must be served with its official content type and CORS so the
  // browser will fetch cross-origin icons. Cache aggressively at the edge but
  // revalidate on every request so logo swaps propagate within a minute.
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  res.status(200).end(JSON.stringify(manifest));
}
