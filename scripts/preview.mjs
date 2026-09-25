// Dependency-free static preview of the built app.
//
// The sandbox wipes `node_modules` and `dist` between turns, which kills a
// vite dev server the moment its packages disappear (the browser then gets a
// blank page and the 3D world looks "gone"). This server reads the whole
// build into memory once and serves it from there, so the preview survives
// even if the filesystem is reset underneath it.
//
//   node scripts/preview.mjs [port]
import { createServer } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

const root = new URL("../.preview/", import.meta.url).pathname;
const port = Number(process.argv[2] ?? process.env.PORT ?? 5174);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".hdr": "image/vnd.radiance",
  ".exr": "image/x-exr",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

/** Every file under dist, held in memory. */
const files = new Map();
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.set("/" + full.slice(root.length).split(sep).join("/"), readFileSync(full));
  }
}
walk(root);

const index = files.get("/index.html");

createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }
  // Never escape the build root.
  const path = normalize(url).replace(/\.\./g, "");
  const hit = files.get(path) ?? (path.endsWith("/") ? files.get(`${path}index.html`) : undefined);
  if (hit) {
    res.writeHead(200, {
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(hit);
    return;
  }
  // SPA fallback: unknown paths render the shell.
  if (index) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    res.end(index);
    return;
  }
  res.writeHead(404).end("not found");
}).listen(port, "0.0.0.0", () => {
  console.log(`[preview] ${files.size} files from dist/ in memory → http://0.0.0.0:${port}/`);
});
