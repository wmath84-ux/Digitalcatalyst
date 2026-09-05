import type { VercelRequest, VercelResponse } from "./firebaseAdmin.js";
import { DEFAULT_ICONS, getBranding } from "./branding.js";

/**
 * Dynamic PWA web app manifest handler.
 *
 * Mounted via /api/manifest (rewritten to the shared referral-leaderboard
 * function in vercel.json) because the Vercel Hobby plan caps serverless
 * functions at 12 and the project is already at that limit. It reads the live
 * settings/branding doc and emits the configured name, description and
 * icons. The client cache-busts this URL whenever branding changes.
 */
export async function handleManifest(_req: VercelRequest, res: VercelResponse) {
  const { logoUrl, appName, tagline, description, version } = await getBranding();

  const versioned = (path: string) =>
    `${path}${path.includes("?") ? "&" : "?"}v=${version}`;

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
        {
          src: DEFAULT_ICONS.maskable,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ];

  const manifest = {
    id: "/",
    name: tagline ? `${appName} | ${tagline}` : appName,
    short_name: appName,
    description,
    start_url: "/#/home",
    scope: "/",
    display: "standalone",
    // HARD RULE: Portrait by default everywhere. Course player unlocks rotation via JS.
    orientation: "portrait",
    theme_color: "#2563eb",
    background_color: "#ffffff",
    categories: ["education", "productivity"],
    icons,
  };

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  );
  res.status(200).end(JSON.stringify(manifest));
}
