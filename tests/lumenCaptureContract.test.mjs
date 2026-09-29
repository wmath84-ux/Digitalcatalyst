// tests/lumenCaptureContract.test.mjs
//
// Source contracts for the capture → vision path. React components have no
// jsdom harness in this repo, so — like the other UI contracts here — these
// pin the load-bearing source facts instead of rendering:
//
//   1. The selection overlay coalesces pointermove to one render per frame
//      (unthrottled setState per event was the resize lag).
//   2. Captures use CORS-safe loading, crop natively, blank-detect, and NEVER
//      file a fake placeholder image (the old silent blue-dot fallback) — a
//      failed capture explains itself in a notice instead.
//   3. Chat attachments actually reach the model as vision inputs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const overlay = read("src/lumen/components/ScreenshotOverlay.tsx");
const app = read("src/lumen/App.tsx");
const productionAi = read("src/lumen/productionAi.ts");
const lumenUtils = read("src/lumen/lib/utils.ts");

test("the overlay commits at most one render per animation frame", () => {
  assert.match(overlay, /requestAnimationFrame/, "pointer updates must coalesce to frame rate");
  assert.match(overlay, /cancelAnimationFrame/, "the queued frame must flush on pointerup and unmount");
  // The move handler's own body (up to the pointerup handler): every position
  // update queues a frame — a raw setState here reintroduces event-rate
  // renders (the lag). The pointerdown mount below it intentionally commits
  // once per gesture, not per event.
  const moveBody = overlay.slice(overlay.indexOf("const onMove = "), overlay.indexOf("const onUp = "));
  assert.match(moveBody, /queueRect\(/, "draw/move/resize positions queue a frame");
  assert.match(moveBody, /queueGuide\(/, "the idle crosshair queues a frame too");
  assert.doesNotMatch(moveBody, /setRect\(/, "no raw setState inside the move handler");
  assert.doesNotMatch(moveBody, /setGuide\(/, "no raw setState inside the move handler");
});

test("captures are CORS-safe, natively cropped and blank-detected", () => {
  assert.match(app, /useCORS:\s*true/, "cross-origin lesson images must not taint the canvas (toDataURL throws on taint)");
  assert.match(app, /windowWidth: document\.documentElement\.clientWidth/, "render the viewport, not the whole document");
  assert.match(app, /x: Math\.max\(0, Math\.round\(r\.x\)\)/, "crop in viewport coordinates — no scroll-offset math");
  assert.match(app, /isBlankCanvas\(out\)/, "a flat field (protected video/embed pixels) must be caught");
});

test("a failed capture explains itself — it never files a fake image", () => {
  assert.doesNotMatch(app, /fallbackShot/, "the silent placeholder factory must stay deleted");
  assert.match(app, /failCapture\(/, "every failure path reports through the honest notice");
  assert.match(app, /captureNotice/, "the notice state and banner must exist");
  assert.match(app, /attach it with \+ instead/, "the notice must name the action that actually works");
});

test("attachments reach the model as vision inputs, rasterized and bounded", () => {
  assert.match(lumenUtils, /export async function toVisionImage/, "GIF/SVG attachments must rasterize to model-readable JPEG");
  assert.match(lumenUtils, /1568/, "vision payloads stay bounded for the request body");
  assert.match(productionAi, /toVisionImage\(a\.src, a\.name\)/, "every attachment is converted before the ask");
  assert.match(productionAi, /images,\n    history: historyOf\(chat\)/, "the converted images ride the ask payload");
});
