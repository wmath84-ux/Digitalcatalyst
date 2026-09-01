import path from "path";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import browserslist from "browserslist";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ── CSS support floor (Liquid Glass v2, Wave 0) ─────────────────────────────
   Tailwind v4 emits oklch() for its entire default palette. Nothing in this
   toolchain lowers it by default:

     · @tailwindcss/vite calls Tailwind's own lightningcss `optimize()` with no
       targets, so it only minifies;
     · Vite's default `build.cssMinify` is esbuild, which passes oklch()
       through verbatim.

   So on any engine older than Chrome 111 / Safari 15.4 / Firefox 113 the whole
   declaration is dropped and the gradient silently vanishes — the backdrop
   disappears with no error. (docs/liquid-glass-v2-brief.md §9, trap 8.)

   `browserslist` in package.json is the single source of truth for the floor.
   Vite does not read it, so resolve it here and hand the result to Lightning
   CSS, which lowers every oklch() to a plain hex fallback plus a lab()
   upgrade for engines that have it. Gate: after `npm run build`,
   `grep -c "oklch(" dist/index.html` must be 0. */
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as {
  browserslist?: string[];
};

/**
 * browserslist browser ids → the esbuild-style prefixes that Vite's cssTarget
 * table accepts. Anything unmapped (node, op_mini, kaios, …) has no CSS target
 * and is skipped.
 *
 * `samsung` is deliberately skipped: Samsung Internet's own version numbers are
 * not Chromium's (Samsung 17 ≈ Chromium 96), so translating them would pin the
 * CSS target absurdly low. Its engine floor is already covered by the `chrome`
 * entry above.
 */
const CSS_TARGET_FAMILY: Record<string, string | undefined> = {
  chrome: "chrome",
  and_chr: "chrome", // Chrome for Android — versions track desktop Chrome
  edge: "edge",
  firefox: "firefox",
  and_ff: "firefox",
  safari: "safari",
  ios_saf: "ios",
  opera: "opera",
  op_mob: "opera",
  ie: "ie",
};

/** Lowest version per engine family, as `chrome96` / `safari15` / `ios15` strings. */
function resolveCssTarget(): string[] | undefined {
  const queries = pkg.browserslist;
  if (!queries || queries.length === 0) return undefined;
  const lowest = new Map<string, { major: number; minor: number }>();
  for (const entry of browserslist(queries)) {
    const space = entry.lastIndexOf(" ");
    const name = entry.slice(0, space);
    // "15.0-15.1" is how browserslist reports an iOS version *range*.
    const [major, minor = "0"] = entry.slice(space + 1).split("-")[0].split(".");
    const family = CSS_TARGET_FAMILY[name];
    if (!family) continue;
    const version = { major: Number(major), minor: Number(minor) };
    if (!Number.isFinite(version.major)) continue;
    const current = lowest.get(family);
    if (
      !current ||
      version.major < current.major ||
      (version.major === current.major && version.minor < current.minor)
    ) {
      lowest.set(family, version);
    }
  }
  const targets = [...lowest.entries()].map(
    ([family, { major, minor }]) => `${family}${major}${minor ? `.${minor}` : ""}`,
  );
  return targets.length > 0 ? targets.sort() : undefined;
}

const cssTarget = resolveCssTarget();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
    // GitHub embeds are served by /api/embed-proxy on the deployed site
    // (Vercel serverless). The local dev server has no backend, so this
    // stub answers the route with a small placeholder instead of Vite's
    // SPA fallback — which would nest the whole app inside the iframe.
    {
      name: "embed-proxy-dev-stub",
      configureServer(server) {
        const revisionApiUnavailable = (_req: IncomingMessage, res: ServerResponse) => {
          res.statusCode = 501;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, code: "dev_no_api", error: "Local dev has no serverless Revision API." }));
        };
        server.middlewares.use("/api/revision/generate", revisionApiUnavailable);
        server.middlewares.use("/api/revision/data", revisionApiUnavailable);
        server.middlewares.use("/api/embed-proxy", (req, res) => {
          const safe = (new URL(req.url || "/", "http://localhost").searchParams.get("url") || "").trim();
          const link = safe.startsWith("https://")
            ? `<a href="${safe.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">Open the original page ↗</a>`
            : "";
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GitHub embed</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090912;color:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif;text-align:center;padding:32px}.card{max-width:340px}h1{font-size:18px;font-weight:800;margin:0 0 8px}p{color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 20px}a{display:inline-block;background:linear-gradient(90deg,#7c3aed,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:12px;padding:10px 18px;border-radius:12px}</style></head><body><div class="card"><h1>GitHub embeds open on the deployed site</h1><p>The local dev server has no proxy backend, so this placeholder keeps the player layout accurate.</p>${link}</div></body></html>`);
        });

        // Local dev mirrors of the dynamic PWA branding endpoints. In
        // production these are Vercel functions (/api/manifest,
        // /api/brand-icon) that read the live logo from Firestore. The dev
        // server has no serverless runtime, so serve the shipped default
        // manifest + icons here — enough to test installability and routing.
        server.middlewares.use("/api/manifest", (_req: IncomingMessage, res: ServerResponse) => {
          const manifest = {
            id: "/",
            name: "Eduvora | Digital Catalyst",
            short_name: "Eduvora",
            description: "Student learning app for notes, courses, and digital study resources.",
            start_url: "/#/home",
            scope: "/",
            display: "standalone",
            orientation: "portrait",
            theme_color: "#2563eb",
            background_color: "#ffffff",
            categories: ["education", "productivity"],
            icons: [
              { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
              { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
              { src: "/icons/maskable-icon-512x512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
            ],
          };
          res.setHeader("content-type", "application/manifest+json; charset=utf-8");
          res.end(JSON.stringify(manifest));
        });
        server.middlewares.use("/api/brand-icon", (req: IncomingMessage, res: ServerResponse) => {
          const size = (new URL(req.url || "/", "http://localhost").searchParams.get("size") || "512") === "192" ? "192" : "512";
          res.statusCode = 308;
          res.setHeader("location", `/icons/icon-${size}x${size}.png`);
          res.end();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    /* Route the final stylesheet through Lightning CSS so the oklch()
       downlevelling described above actually happens, and target it at the
       `browserslist` floor. esbuild — Vite's default cssMinify — would leave
       every oklch() in place. */
    cssMinify: "lightningcss",
    ...(cssTarget ? { cssTarget } : {}),
  },
  css: {
    lightningcss: {
      /* The repo hand-writes CSS for old engines on purpose (the `100vh`
         fallbacks upgraded inside `@supports (height: 100dvh)`); never let a
         legacy-syntax parse failure abort the build over them. */
      errorRecovery: true,
    },
  },
  server: {
    allowedHosts: true,
    host: "0.0.0.0",
  },
});
