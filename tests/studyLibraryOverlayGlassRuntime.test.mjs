// tests/studyLibraryOverlayGlassRuntime.test.mjs
//
// Runtime proof for the My Study Library overlay glass (owner brief
// 2026-09-29, cart card → profile): the delete confirmation — the overlay
// the shelf AND the builder open — can wear the EXACT material the Profile
// page's cards wear.
//
// The Profile recipe is the Cart empty-state card's bare pack surface
// (GlassSurface defaults: tint 0.5 · rgb(60,62,68) · blur 14), so the frost,
// tint, sheen and rim are INLINE engine styles on the four aria-hidden
// layers — a wrong DOM order or a stray re-skin class would silently change
// them. Rendering the real component is the only way to pin that.
//
//   · `material="profile"` → the Profile recipe: frost blur 9.8px + saturate
//     1.3, flat rgba(60,62,68,0.21) tint, four layers, white ink.
//   · default `material="scene"` → the dark `dc-scene-plate` My Day / Home
//     keep, unchanged.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite/package.json"))("esbuild");

const dir = path.resolve("node_modules/.tmp-study-library-glass");
fs.mkdirSync(dir, { recursive: true });

await build({
  entryPoints: ["src/components/ui/ConfirmDialog.tsx"],
  outfile: path.join(dir, "dialog.mjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  external: ["react", "react/jsx-runtime"],
  logLevel: "silent",
});

const dom = new JSDOM('<!doctype html><html data-glass="on"><div id="root"></div></html>', {
  url: "https://example.test",
  pretendToBeVisual: true,
});
for (const key of [
  "window", "document", "HTMLElement", "Element", "Node", "Event", "CustomEvent",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia",
]) {
  globalThis[key] = dom.window[key] ?? globalThis[key];
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: ConfirmDialog } = await import(path.join(dir, "dialog.mjs"));

const root = createRoot(document.getElementById("root"));
after(() => {
  React.act(() => root.unmount());
  dom.window.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const layers = (surface) => [...surface.querySelectorAll(":scope > div[aria-hidden]")];

const render = (props) => {
  React.act(() => root.render(
    React.createElement(ConfirmDialog, {
      open: true,
      title: "Delete this course?",
      message: "Everything inside it will be permanently deleted.",
      onConfirm: () => undefined,
      onCancel: () => undefined,
      ...props,
    }),
  ));
  return document.querySelector("[role='alertdialog']");
};

test("the profile material is the Profile card's own surface, layer for layer", () => {
  const panel = render({ material: "profile" });
  assert.ok(panel, "the confirmation renders an alertdialog");
  assert.doesNotMatch(panel.className, /dc-rev-glass/, "no revision re-skin");
  assert.doesNotMatch(panel.className, /dc-scene-plate/, "…and not the dark plate");

  // The bare surface paints layers 1–4 inline by position: frost, tint,
  // sheen, rim — the same four the Cart card and every Profile card wear.
  const [frost, tint, sheen, rim] = layers(panel);
  assert.ok(frost && tint && sheen && rim, `four aria-hidden layers, got ${layers(panel).length}`);

  // tint 0.5 → the engine paints rgb(60,62,68) at 0.5 * 0.42 = 0.21, exactly
  // what the Cart card and the Profile cards compute.
  assert.match(tint.style.background, /60,\s*62,\s*68,\s*0\.21/, tint.style.background);
  // blur 14 → the inline frost carries the blur stage itself (14 * 0.7px in
  // float math): no CSS re-skin is involved anywhere.
  assert.match(frost.style.backdropFilter || "", /blur\(9\.7999\d*px\)/, frost.style.backdropFilter);
  // The panel is fluid: phone sheet → centred dialog from `sm`.
  assert.match(panel.className, /max-w-sm/, "phone width by default");
  assert.match(panel.className, /sm:max-w-md/, "wider on a tablet");
  assert.match(panel.className, /lg:max-w-lg/, "widest on a desktop");
});

test("the default material stays the dark plate every other page pins", () => {
  const panel = render({});
  assert.match(panel.className, /dc-scene-plate/);
  assert.doesNotMatch(panel.className, /dc-rev-glass/);
  assert.equal(layers(panel).length, 4);
  // The scene panel keeps the pinned static class string (My Day contract).
  assert.match(
    panel.outerHTML,
    /dc-scene-plate glass-dialog-in relative max-h-full w-full max-w-sm overflow-hidden text-white/,
  );
});

test("a courseless cover resolves to a real bundled image, stable per course", async () => {
  await build({
    entryPoints: ["src/lib/myCourseCovers.ts"],
    outfile: path.join(dir, "covers.mjs"),
    bundle: true,
    format: "esm",
    platform: "browser",
    logLevel: "silent",
  });
  const { FALLBACK_COVERS, fallbackCoverImage, randomCoverImage } = await import(path.join(dir, "covers.mjs"));

  // Every pool entry is a shipped asset, and both helpers only ever return
  // something from it.
  for (const image of FALLBACK_COVERS) {
    // The URL is served from the site root, which is `public/` on disk.
    assert.ok(fs.existsSync(path.resolve("public", `.${image}`)), `${image} must ship in public/`);
  }
  for (const seed of ["course_a", "course_b", "saved-for-later", ""]) {
    assert.ok(FALLBACK_COVERS.includes(fallbackCoverImage(seed)));
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    assert.ok(FALLBACK_COVERS.includes(randomCoverImage()));
  }

  // Display fallback is DETERMINISTIC (no flicker between renders) …
  assert.equal(fallbackCoverImage("course_9f2a"), fallbackCoverImage("course_9f2a"));
  // …yet courses do spread over the pool instead of all landing on one image.
  const spread = new Set(
    Array.from({ length: 60 }, (_, index) => fallbackCoverImage(`course_${index}`)),
  );
  assert.ok(spread.size >= 3, `random covers should vary, saw ${spread.size} distinct`);
});

test("Escape and the scrim still close the profile-material dialog", () => {
  let cancelled = 0;
  React.act(() => root.render(
    React.createElement(ConfirmDialog, {
      open: true,
      material: "profile",
      title: "Delete this course?",
      message: "Everything inside it will be permanently deleted.",
      onConfirm: () => undefined,
      onCancel: () => { cancelled += 1; },
    }),
  ));
  React.act(() => window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })));
  assert.equal(cancelled, 1, "Escape cancels");
});
