import type { VercelRequest, VercelResponse } from "./_lib/firebaseAdmin.js";
import { DEFAULT_ICONS, getBranding } from "./_lib/branding.js";

/**
 * Dynamic PWA web app manifest.
 *
 * The static /manifest.webmanifest ships hardcoded name + icons, so branding
 * changes made in the admin panel never reached the installed PWA /
 * "Add to Home screen". This endpoint reads the live `settings/branding` doc
 * and emits the configured name, description and icons. Icons point at the
 * brand-icon proxy, which serves the uploaded image (or the built-in default)
 * with permissive CORS + long-lived caching.
 *
 * The client cache-busts this URL (see applyDocumentBranding) whenever the
 * branding changes, forcing browsers to re-read it; installed PWAs refresh
 * their name/icon on the next launch / manifest update.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { logoUrl, appName, tagline, description, version } = await getBranding();

  const versioned = (path: string) => `${path}${path.includes("?") ? "&" : "?"}v=${version}`;

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
    name: tagline ? `${appName} | ${tagline}` : appName,
    short_name: appName,
    description,
    start_url: "/#/home",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#2563eb",
    background_color: "#ffffff",
    categories: ["education", "productivity"],
    icons,
  };

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  res.status(200).end(JSON.stringify(manifest));
}
