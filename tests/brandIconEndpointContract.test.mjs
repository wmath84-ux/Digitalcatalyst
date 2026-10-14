// tests/brandIconEndpointContract.test.mjs
//
// /api/brand-icon is what the installed PWA asks for its launcher icon. It used
// to proxy the uploaded file byte for byte — so a tight-cropped logo became the
// `purpose: "maskable"` icon, and Chrome/Android cut it on every diagonal
// ("icon bahut zoom dikhta hai, side se cut raha hai").
//
// The geometry is pure, so it is unit-tested here for real (imported from
// api/_lib/imageTools.ts, which has no relative imports and therefore runs
// under Node's type stripping); the sharp-backed composition is verified in
// tests/brandIconRenderRuntime.test.mjs. This block additionally pins the
// wiring: the route, the manifest, the header names and the fallbacks.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ALPHA_FLOOR,
  BRAND_ICON_LAYOUT_VERSION,
  ICON_COVERAGE,
  brandIconCacheKey,
  isOpaqueTile,
  isRasterContentType,
  measureAlphaBounds,
  planBrandIconImage,
} from "../api/_lib/imageTools.ts";

/** A synthetic RGBA image: `ink` marks whole pixels, transparent elsewhere. */
function image(width, height, ink) {
  const data = Buffer.alloc(width * height * 4);
  for (const [x, y, alpha = 255] of ink) {
    const offset = (y * width + x) * 4;
    data[offset] = 79;
    data[offset + 1] = 70;
    data[offset + 2] = 229;
    data[offset + 3] = alpha;
  }
  return { data, width, height, channels: 4 };
}

test("a transparent logo is cropped to its artwork, then re-centred", () => {
  // A 4 px mark floating in the top-left corner of a 20×20 canvas (the shape of
  // every tight-cropped upload).
  const mark = image(20, 20, [
    [1, 1],
    [2, 1],
    [1, 2],
  ]);
  const bounds = measureAlphaBounds(mark);
  assert.deepEqual(bounds, { left: 1, top: 1, width: 2, height: 2 });
  assert.equal(isOpaqueTile(mark), false, "…and it is a MARK, not a tile");

  for (const [variant, coverage] of Object.entries(ICON_COVERAGE)) {
    const plan = planBrandIconImage({ image: mark, size: 512, variant });
    assert.equal(plan.kind, "mark");
    if (plan.kind !== "mark") continue;
    assert.equal(plan.coverage, coverage);
    // The artwork is scaled to `coverage × size` on its LONGEST side…
    assert.equal(Math.max(plan.width, plan.height), Math.round(512 * coverage));
    // …and centred, whatever the crop was.
    assert.equal(plan.left, Math.round((512 - plan.width) / 2));
    assert.equal(plan.top, Math.round((512 - plan.height) / 2));
    // Only the maskable variant gets the plate; `any` keeps transparency.
    assert.equal(plan.plate === null, variant !== "maskable");
  }

  // A rectangular logo keeps its aspect ratio (fit on the long side) and is
  // centred on the square canvas — no stretch, no accidental crop.
  const wide = image(40, 20, [[0, 0], [39, 0], [0, 19], [39, 19], [20, 10]]);
  const widePlan = planBrandIconImage({ image: wide, size: 192, variant: "any" });
  assert.equal(widePlan.kind, "mark");
  if (widePlan.kind === "mark") {
    assert.equal(widePlan.width, Math.round(192 * ICON_COVERAGE.any));
    assert.equal(widePlan.height, Math.round((192 * ICON_COVERAGE.any) / 2));
    assert.ok(Math.abs(widePlan.top - (192 - widePlan.height) / 2) <= 1);
  }
});

test("an opaque logo is treated as a finished tile, never shrunk", () => {
  // A full-bleed design (a photo-ish logo with no transparency) already fills
  // the canvas on purpose; adding the mark padding would put a border around it
  // that the owner never designed.
  const tile = image(32, 32, Array.from({ length: 32 * 32 }, (_, index) => [index % 32, Math.floor(index / 32)]));
  assert.equal(isOpaqueTile(tile), true);
  for (const variant of Object.keys(ICON_COVERAGE)) {
    const plan = planBrandIconImage({ image: tile, size: 512, variant });
    assert.equal(plan.kind, "passthrough");
    assert.equal(plan.reason, "opaque-tile");
    assert.equal(plan.size, 512);
  }
  // …and the renderer resizes it to the declared size instead of passing the
  // raw file through (the manifest's `sizes` is a promise to Chrome).
  const renderer = fs.readFileSync("api/_lib/brandIconRender.ts", "utf8");
  assert.match(renderer, /resize\(plan\.size, plan\.size, \{ fit: "cover", kernel: "lanczos3" \}\)/);
});

test("alpha below the floor is not artwork (no halo-driven boxes)", () => {
  // (0,0) and (7,7) are faint halos; only (3,3) is artwork.
  const faint = image(8, 8, [[0, 0, ALPHA_FLOOR - 1], [7, 7, ALPHA_FLOOR - 1], [3, 3]]);
  assert.deepEqual(measureAlphaBounds(faint), { left: 3, top: 3, width: 1, height: 1 });
  // A fully transparent image has no bounds at all.
  assert.equal(measureAlphaBounds(image(4, 4, [])), null);
  // planBrandIconImage still answers with a usable plan for it (the handler
  // falls back to the shipped icon before that can matter).
  const plan = planBrandIconImage({ image: image(4, 4, []), size: 192, variant: "any" });
  assert.equal(plan.kind, "mark");
});

test("rendered icons are content-addressed, so the cache can be immutable", () => {
  const base = { logoUrl: "https://cdn.example/logo.png", size: 512, variant: "any" };
  const key = brandIconCacheKey(base);
  assert.equal(key, brandIconCacheKey({ ...base }));
  assert.notEqual(key, brandIconCacheKey({ ...base, size: 192 }));
  assert.notEqual(key, brandIconCacheKey({ ...base, variant: "maskable" }));
  assert.notEqual(key, brandIconCacheKey({ ...base, logoUrl: "https://cdn.example/other.png" }));
  // A new branding save (new version) and a layout change both bust it.
  assert.notEqual(key, brandIconCacheKey({ ...base, version: "1700000000000" }));
  assert.equal(BRAND_ICON_LAYOUT_VERSION, "brand-icon-layout-v2");
  assert.match(key, /^[0-9a-f]{20}$/);
});

test("only raster images are re-rendered; SVG is served through", () => {
  assert.equal(isRasterContentType("image/png"), true);
  assert.equal(isRasterContentType("image/jpeg; charset=binary"), true);
  assert.equal(isRasterContentType("image/webp"), true);
  assert.equal(isRasterContentType("application/octet-stream"), true);
  assert.equal(isRasterContentType("image/svg+xml"), false);
  assert.equal(isRasterContentType("text/html"), false);
  assert.equal(isRasterContentType(null), false);
});

test("the endpoint and the dev generator agree on the mask-safe coverages", async () => {
  // scripts/generate-icons.cjs (build-time, shipped assets) and
  // api/_lib/imageTools.ts (runtime, uploaded logo) must place artwork the same
  // way, or the installed PWA icon would differ from the APK's launcher icon.
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const icons = require("../scripts/generate-icons.cjs");
  assert.equal(ICON_COVERAGE.any, icons.COVERAGE.any);
  assert.equal(ICON_COVERAGE.maskable, icons.COVERAGE.maskable);
});

test("the route is wired: rewrite, handler, manifest icons, fallbacks", () => {
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const rewrite = vercel.rewrites.find((entry) => entry.source === "/api/brand-icon");
  assert.ok(rewrite, "/api/brand-icon must stay rewritten to a real function");
  assert.match(rewrite.destination, /referral-leaderboard/);

  const entry = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
  assert.match(entry, /import \{ handleBrandIcon \} from "\.\/_lib\/brandIcon\.js";/);
  assert.match(entry, /handleBrandIcon/);

  const handler = fs.readFileSync("api/_lib/brandIcon.ts", "utf8");
  // Three fallbacks, all of them preserving the old behaviour:
  assert.match(handler, /if \(!logoUrl\) \{\s*\n\s*return permanentRedirect\(res, defaultIcon\);/);
  assert.match(handler, /if \(!isImageContentType\(contentType\)\) \{\s*\n\s*return permanentRedirect\(res, defaultIcon\);/);
  // Unknown sizes still resolve to a real icon (the manifest only asks 192/512).
  assert.match(handler, /String\(req\.query\?\.size \|\| "512"\) === "192" \? 192 : 512/);
  // A decode failure degrades to the original bytes, never a 500.
  assert.match(handler, /could not compose the icon — serving the original/);
  assert.match(handler, /"public, max-age=0, s-maxage=60, must-revalidate"/);
  assert.match(handler, /"public, max-age=31536000, immutable, stale-while-revalidate=86400"/);

  const manifest = fs.readFileSync("api/_lib/manifest.ts", "utf8");
  assert.match(manifest, /purpose: "maskable"/);
  assert.match(manifest, /`\/api\/brand-icon\?size=512&maskable=1`/);
  // sharp is a RUNTIME dependency now — a dev-only sharp would leave the
  // function proxying the raw file on the deployed runtime.
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.ok(pkg.dependencies.sharp, "sharp must be in dependencies for the API functions");
  assert.equal(pkg.devDependencies?.sharp, undefined, "…and not only in devDependencies");
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  assert.ok(lock.packages[""].dependencies.sharp);
  const pnpmLock = fs.readFileSync("pnpm-lock.yaml", "utf8");
  assert.match(pnpmLock, /\n {6}sharp:\n {8}specifier: \^0\.34\.5/);
  assert.doesNotMatch(pnpmLock.split("devDependencies:")[1]?.slice(0, 4000) || "", /sharp:/);
});
