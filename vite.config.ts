import path from "path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
            name: "Eduvora | Digital Catalyst",
            short_name: "Eduvora",
            description: "Student learning app for notes, courses, and digital study resources.",
            start_url: "/#/home",
            scope: "/",
            display: "standalone",
            orientation: "any",
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
  server: {
    allowedHosts: true,
    host: "0.0.0.0",
  },
});
