import path from "path";
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
        server.middlewares.use("/api/embed-proxy", (req, res) => {
          const safe = (new URL(req.url || "/", "http://localhost").searchParams.get("url") || "").trim();
          const link = safe.startsWith("https://")
            ? `<a href="${safe.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">Open the original page ↗</a>`
            : "";
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GitHub embed</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090912;color:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif;text-align:center;padding:32px}.card{max-width:340px}h1{font-size:18px;font-weight:800;margin:0 0 8px}p{color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 20px}a{display:inline-block;background:linear-gradient(90deg,#7c3aed,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:12px;padding:10px 18px;border-radius:12px}</style></head><body><div class="card"><h1>GitHub embeds open on the deployed site</h1><p>The local dev server has no proxy backend, so this placeholder keeps the player layout accurate.</p>${link}</div></body></html>`);
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
