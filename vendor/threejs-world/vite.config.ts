import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const entry = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(() => ({
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      // Ship only the full world. The unrelated upstream mobile demo is not deployed.
      input: {
        main: entry("./index.html"),
      },
    },
  },
  server: {
    // no fixed port — Vite picks the first free port (default 5173, then
    // increments). strictPort:false makes the fallback automatic.
    strictPort: false,
    // tool-driven file writes are missed by fsevents on this setup; poll so
    // the module graph never serves stale code (cost: dev-only CPU)
    watch: { usePolling: true, interval: 200 },
  },
  esbuild: {
    target: "esnext",
  },
  // served from the domain root (Vercel). For a subpath deploy (e.g. GitHub
  // Pages under /laas/), set this to that subpath instead.
  base: "/",
}));
