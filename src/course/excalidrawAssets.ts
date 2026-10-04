// src/course/excalidrawAssets.ts
//
// Where Excalidraw loads its FONTS from.
//
// Excalidraw ships its hand-drawn fonts (Excalifont, Nunito, Comic Shanns,
// Liberation, Lilita, Assistant, Cascadia, Virgil) as separate woff2 files and
// fetches them at runtime. With no instruction it falls back to a PUBLIC CDN
// (`https://esm.sh/@excalidraw/excalidraw@…/dist/prod/fonts/…`), which would
// mean: a third-party request on every sketch open, and NO text rendering at
// all inside the offline Android (Capacitor) build, whose WebView serves the
// app from a local origin with no network.
//
// `window.EXCALIDRAW_ASSET_PATH` is the official way to self-host them. The
// Vite plugin in vite.config.ts serves this folder from the package in dev and
// copies the font families into `dist/excalidraw-assets/` for every build (the
// 13 MB Xiaolai CJK family is deliberately left out — it is loaded on demand
// from the fallback only if a learner actually types CJK text).
//
// This module MUST be imported before `@excalidraw/excalidraw` so the value is
// in place before the editor's font loader runs. `src/course/SketchPanel.tsx`
// imports it on the line above the editor import for exactly that reason.

export const EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

if (typeof window !== "undefined" && !window.EXCALIDRAW_ASSET_PATH) {
  window.EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_PATH;
}

export default EXCALIDRAW_ASSET_PATH;
