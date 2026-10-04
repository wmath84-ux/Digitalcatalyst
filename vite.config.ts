import path from "path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import browserslist from "browserslist";
import { defineConfig } from "vite";

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

/* ── Excalidraw fonts, self-hosted (Course Player → Sketch tab) ──────────────
   @excalidraw/excalidraw does not bundle its hand-drawn fonts into the JS
   chunk: at runtime it builds `<EXCALIDRAW_ASSET_PATH>/fonts/<Family>/*.woff2`
   URLs and, when that variable is unset, falls back to the public esm.sh CDN.
   Two problems with the fallback: a third-party font request every time a
   learner opens a sketch, and NO text at all inside the Capacitor build, whose
   WebView serves the app from a local origin that may be offline.

   `src/course/excalidrawAssets.ts` points the editor at `/excalidraw-assets/`;
   this plugin is what actually serves that path — straight out of
   node_modules in dev, and copied into `dist/excalidraw-assets/fonts/` at
   build time so the folder ships inside the APK and the service worker.

   `Xiaolai` (the CJK family) is deliberately excluded: it is 13 MB on its own
   — 26× the other eight families combined — for a script this catalogue does
   not teach in. If a learner ever types CJK text, Excalidraw's own CDN
   fallback still resolves it. */
const EXCALIDRAW_FONT_DIR = path.resolve(
  __dirname,
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
);
const EXCALIDRAW_SKIPPED_FONTS = new Set(["Xiaolai"]);
const EXCALIDRAW_ASSET_ROUTE = "/excalidraw-assets/";

function excalidrawAssets(): import("vite").Plugin {
  return {
    name: "excalidraw-assets",
    configureServer(server) {
      server.middlewares.use(EXCALIDRAW_ASSET_ROUTE, (req, res, next) => {
        // `req.url` is already relative to the mount point here.
        const rel = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "");
        const file = path.resolve(EXCALIDRAW_FONT_DIR, "..", rel);
        // Never let a `..` escape the package's own dist folder.
        const root = path.resolve(EXCALIDRAW_FONT_DIR, "..");
        if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader("content-type", file.endsWith(".woff2") ? "font/woff2" : "application/octet-stream");
        res.setHeader("cache-control", "public, max-age=31536000, immutable");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      if (!existsSync(EXCALIDRAW_FONT_DIR)) {
        this.warn("@excalidraw/excalidraw fonts not found — the Sketch tab will fall back to the CDN.");
        return;
      }
      for (const family of readdirSync(EXCALIDRAW_FONT_DIR)) {
        if (EXCALIDRAW_SKIPPED_FONTS.has(family)) continue;
        const dir = path.join(EXCALIDRAW_FONT_DIR, family);
        if (!statSync(dir).isDirectory()) continue;
        for (const name of readdirSync(dir)) {
          const source = path.join(dir, name);
          if (!statSync(source).isFile()) continue;
          this.emitFile({
            type: "asset",
            fileName: `excalidraw-assets/fonts/${family}/${name}`,
            source: readFileSync(source),
          });
        }
      }
    },
  };
}

const PDFJS_VERSION = "6.3.289";
const PDFJS_VIEWER_PACKAGE = path.resolve(__dirname, "node_modules/pdfjs-viewer-element/dist");
const PDFJS_DIST_PACKAGE = path.resolve(__dirname, "node_modules/pdfjs-dist");

/**
 * Locally host the PDF.js Generic Viewer and every runtime support asset it
 * can request. The web component itself is still a dynamic import; these files
 * are emitted as versioned static assets so Vite dev, production and Capacitor
 * all use the same same-origin paths.
 */
function pdfjsViewerAssets(): import("vite").Plugin {
  const contentType = (file: string) => {
    const lower = file.toLowerCase();
    if (lower.endsWith(".mjs") || lower.endsWith(".js")) return "text/javascript; charset=utf-8";
    if (lower.endsWith(".css")) return "text/css; charset=utf-8";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".wasm")) return "application/wasm";
    if (lower.endsWith(".bcmap")) return "application/octet-stream";
    if (lower.endsWith(".icc")) return "application/vnd.iccprofile";
    if (lower.endsWith(".otf")) return "font/otf";
    if (lower.endsWith(".pfb")) return "application/octet-stream";
    return "application/octet-stream";
  };
  const sendPackageFile = (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
    packageRoot: string,
  ) => {
    const raw = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "");
    const versionPrefix = `${PDFJS_VERSION}/`;
    if (!raw.startsWith(versionPrefix)) return next();
    const relative = raw.slice(versionPrefix.length);
    const root = path.resolve(packageRoot);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader("content-type", contentType(file));
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.end(readFileSync(file));
  };
  const copyTree = (
    emit: (asset: { type: "asset"; fileName: string; source: Uint8Array }) => unknown,
    sourceRoot: string,
    outputRoot: string,
  ) => {
    if (!existsSync(sourceRoot)) return;
    const visit = (directory: string, relative = "") => {
      for (const name of readdirSync(directory)) {
        const source = path.join(directory, name);
        const childRelative = path.posix.join(relative, name);
        const stat = statSync(source);
        if (stat.isDirectory()) {
          visit(source, childRelative);
        } else if (stat.isFile() && !name.endsWith(".map") && !name.endsWith(".ts")) {
          emit({ type: "asset", fileName: `${outputRoot}/${childRelative}`, source: readFileSync(source) });
        }
      }
    };
    visit(sourceRoot);
  };

  return {
    name: "pdfjs-viewer-assets",
    configureServer(server) {
      server.middlewares.use("/pdfjs-viewer/", (req, res, next) => sendPackageFile(req, res, next, PDFJS_VIEWER_PACKAGE));
      server.middlewares.use("/pdfjs-data/", (req, res, next) => sendPackageFile(req, res, next, PDFJS_DIST_PACKAGE));
    },
    generateBundle() {
      if (!existsSync(PDFJS_VIEWER_PACKAGE) || !existsSync(PDFJS_DIST_PACKAGE)) {
        this.error("PDF.js packages are missing. Install pdfjs-viewer-element and pdfjs-dist before building.");
      }
      const emit = (asset: { type: "asset"; fileName: string; source: Uint8Array }) => this.emitFile(asset);
      copyTree(emit, PDFJS_VIEWER_PACKAGE, `pdfjs-viewer/${PDFJS_VERSION}`);
      for (const directory of ["cmaps", "iccs", "image_decoders", "standard_fonts", "wasm"]) {
        copyTree(emit, path.join(PDFJS_DIST_PACKAGE, directory), `pdfjs-data/${PDFJS_VERSION}/${directory}`);
      }
      const sandbox = path.join(PDFJS_DIST_PACKAGE, "build/pdf.sandbox.min.mjs");
      if (!existsSync(sandbox)) this.error("The pinned PDF.js sandbox bundle was not found.");
      this.emitFile({
        type: "asset",
        fileName: `pdfjs-data/${PDFJS_VERSION}/build/pdf.sandbox.min.mjs`,
        source: readFileSync(sandbox),
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
              { src: "/icons/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
    excalidrawAssets(),
    pdfjsViewerAssets(),
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
    /* ── Code splitting (perf pass 2026-09-08) ────────────────────────────
       `vite-plugin-singlefile` used to inline the ENTIRE app (3.3 MB raw /
       919 kB gzip) into `dist/index.html`. That is one blocking parse +
       compile of every route — admin, course player, revision, mind map — on
       every cold start, including a low-RAM Android WebView that only wanted
       the landing page. docs/part16 §3 measured it and laid out this exact
       plan; `src/main.tsx` now lazy-loads every route behind React.lazy, so
       Rollup can emit one small shell + per-route chunks.

       Capacitor keeps working: `webDir` (dist/) ships every chunk inside the
       APK and the WebView serves them from its own local origin, so dynamic
       `import()` resolves exactly like it does online (docs/part16 §3).
       `public/sw.js` precaches the emitted chunk list at runtime so offline
       mode still boots. */
    rollupOptions: {
      output: {
        /* Only leaf vendor libraries are pinned into stable chunks. Grouping
           by package (never by route) keeps module init order deterministic
           and gives the browser cache a long-lived, rarely-changing file.
           Everything else — including `@xyflow/react`, which only the course
           player's mind map imports — is left to Rollup so it lands inside
           the lazy chunk that actually needs it. */
        manualChunks(id) {
          /* The Sketch tab (Excalidraw) is pinned to one named chunk.
             Rollup would otherwise name it after whichever vendor module it
             happened to hash first — the first build called it
             `percentages-BXMCSKIN.js`, after a diagram module deep inside
             Excalidraw's own tree, which makes the single heaviest lazy
             chunk in the app unreadable in a build report and in the service
             worker's precache list. `course-sketch` says what it is: ~1.1 MB
             (371 kB gzip) + its stylesheet, downloaded the first time a
             learner opens the Sketch tab and never for anyone else.
             (Excalidraw's Mermaid import dialog stays behind its own dynamic
             import — a separate chunk this one does not pull in.) */
          if (/[\\/]src[\\/]course[\\/](SketchPanel|excalidrawAssets)\./.test(id)) return "course-sketch";
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (/[\\/]node_modules[\\/](@firebase|firebase|idb)[\\/]/.test(id)) return "vendor-firebase";
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return "vendor-motion";
          return undefined;
        },
      },
    },
    /* The shell + vendor chunks are the only ones on the critical path; the
       lazy route chunks are allowed to be chunky without failing the build. */
    chunkSizeWarningLimit: 900,
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
