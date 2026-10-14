// tests/appIconSafeZone.test.mjs
//
// The installed-app icon was reported as "bahut zoom dikhta hai — actual mein
// cut raha hai side se" on BOTH the PWA and the APK. The brand mark is a
// diagonal glyph, so its extreme pixels sit at the corners of its own bounding
// box: any launcher mask (circle, squircle, rounded square, Android's adaptive
// safe circle) shaves those corners first.
//
// This test decodes the COMMITTED PNGs and asserts the geometry, so a
// hand-edited icon — or a re-introduced 1:1 paste of the master at 85 %
// coverage — fails here instead of on a user's home screen. The numbers come
// from scripts/generate-icons.cjs (COVERAGE), which is the single place the
// layout is decided.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const icons = require("../scripts/generate-icons.cjs");
const { COVERAGE, targets } = icons;

/** Minimal PNG reader (8-bit RGB/RGBA, filter types 0-4). */
function decodePng(file) {
  const buffer = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    }
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let p = 0;
  let q = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[p++];
    for (let x = 0; x < stride; x += 1) {
      const current = raw[p++];
      const a = x >= channels ? out[q + x - channels] : 0;
      const b = y > 0 ? out[q - stride + x] : 0;
      const c = x >= channels && y > 0 ? out[q - stride + x - channels] : 0;
      let value;
      switch (filter) {
        case 1: value = current + a; break;
        case 2: value = current + b; break;
        case 3: value = current + ((a + b) >> 1); break;
        case 4: value = current + paeth(a, b, c); break;
        default: value = current;
      }
      out[q + x] = value & 0xff;
    }
    q += stride;
  }
  return { width, height, channels, data: out };
}

/**
 * The artwork of a committed icon, measured against the plate it sits on.
 *
 * What counts as "ink" is derived from the icon itself, never hardcoded — a
 * fixed "white is background" rule broke twice: once for a WHITE brand mark on
 * a transparent plate (it measured anti-aliasing noise and reported a centred
 * icon as off-centre by 1.58 px), and again when the generator started giving a
 * light logo a DARK plate (the plate itself read as "glyph" and reached the
 * corners). So: sample the corners to find the plate, then measure everything
 * that is not the plate.
 *
 *   · a transparent plate ("any", the notification badge) — every opaque pixel
 *     is artwork, whatever its colour;
 *   · an opaque plate (maskable, Android launcher, adaptive foreground) — the
 *     plate is background and the artwork is whatever differs from it.
 */
function inkStats(file) {
  const { width, height, channels, data } = decodePng(file);
  const at = (x, y) => (y * width + x) * channels;
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const plateAlpha = corners.map((i) => (channels === 4 ? data[i + 3] : 255)).sort((a, b) => a - b)[1];
  const transparentPlate = plateAlpha < 32;
  const plate = corners[0];
  const plateRgb = [data[plate], data[plate + 1], data[plate + 2]];
  /** Within 40/255 of the plate on every channel = plate, not artwork. */
  const isPlate = (i) =>
    !transparentPlate &&
    Math.abs(data[i] - plateRgb[0]) <= 40 &&
    Math.abs(data[i + 1] - plateRgb[1]) <= 40 &&
    Math.abs(data[i + 2] - plateRgb[2]) <= 40;

  let ink = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let maxRadius = 0;
  const radius = (width - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = at(x, y);
      const alpha = channels === 4 ? data[i + 3] : 255;
      if (alpha < 32) continue;
      if (isPlate(i)) continue;
      ink += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const distance = Math.hypot(x - radius, y - radius) / radius;
      if (distance > maxRadius) maxRadius = distance;
    }
  }
  return {
    width,
    height,
    ink,
    transparentPlate,
    box: { minX, minY, maxX, maxY },
    coverage: maxX < 0 ? 0 : (maxX - minX + 1) / width,
    centreOffsetPx: maxX < 0 ? 0 : Math.hypot((minX + maxX) / 2 - radius, (minY + maxY) / 2 - radius),
    maxRadius,
  };
}

/**
 * The mask each generated icon has to survive, as a radius in HALF-CANVAS
 * units (1 = the canvas mid-edge, i.e. an inscribed circle):
 *   · "any"      — Chrome/Android apply their own rounded mask; an inscribed
 *                  circle is the tightest shape they use.
 *   · "maskable" — the 80 % safe circle, radius 0.40 of the canvas = 0.8.
 *   · "launcher" — Android's legacy round mask, radius 0.5 of the canvas = 1.0.
 *   · adaptive   — the "always visible" 66 dp circle of the 108 dp layer,
 *                  radius 33 dp of 54 dp = 0.611.
 */
const MASK_RADIUS = {
  any: 1.0,
  maskable: 0.8,
  launcher: 1.0,
  adaptiveForeground: 0.611,
  badge: 2,
};

test("every shipped icon keeps its glyph inside the mask that will be applied", () => {
  for (const target of targets()) {
    const stats = inkStats(target.file);
    const rel = path.relative(process.cwd(), target.file);
    const mask = MASK_RADIUS[target.kind];
    assert.ok(
      stats.maxRadius <= mask + 0.005,
      `${rel}: the glyph reaches ${stats.maxRadius.toFixed(3)} of the half-canvas, ` +
        `outside the ${mask} mask for kind "${target.kind}" — it will be cut.`,
    );
    assert.ok(
      stats.coverage >= COVERAGE[target.kind] - 0.04,
      `${rel}: coverage ${(stats.coverage * 100).toFixed(1)}% is smaller than the ` +
        `configured ${(COVERAGE[target.kind] * 100).toFixed(0)}% — the icon would look shrunken.`,
    );
    assert.ok(
      stats.coverage <= COVERAGE[target.kind] + 0.02,
      `${rel}: coverage ${(stats.coverage * 100).toFixed(1)}% exceeds the mask-safe ` +
        `${(COVERAGE[target.kind] * 100).toFixed(0)}% for kind "${target.kind}".`,
    );
    // Placement is integer-rounded per canvas, so the tolerance is stated in
    // PIXELS: at most one and a half, whatever the density bucket.
    assert.ok(
      stats.centreOffsetPx <= 1.5,
      `${rel}: the glyph is off-centre by ${stats.centreOffsetPx.toFixed(2)}px — ` +
        `an off-centre mark is clipped unevenly by every mask.`,
    );
  }
});

test("the master logo is cropped to its glyph, not pasted 1:1", () => {
  // The regression: the master carries 85 % coverage and was copied verbatim,
  // so the diagonal tips landed 34 px from a 512 px edge and every round mask
  // sliced them. The generator must re-place the glyph instead.
  const source = fs.readFileSync("scripts/generate-icons.cjs", "utf8");
  assert.match(source, /opaqueBounds\(/);
  assert.match(source, /const COVERAGE = \{/);
  assert.match(source, /maskable: 0\.56/);
  assert.match(source, /any: 0\.68/);
  assert.match(source, /adaptiveForeground: 0\.42/);

  // …and the PWA "any" icon really is ~0.68, not the master's 0.85.
  const stats = inkStats("public/icons/icon-512x512.png");
  assert.ok(stats.coverage > 0.64 && stats.coverage < 0.72, `coverage ${stats.coverage}`);
  const master = inkStats("public/branding/logo-source.png");
  assert.ok(master.coverage > 0.8, "the master logo itself still carries its own padding");
});

test("the Android adaptive foreground fits the 66 dp safe circle", () => {
  for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    const file = `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`;
    const stats = inkStats(file);
    // 33 dp of the 54 dp half-layer — the circle Android guarantees is visible.
    assert.ok(stats.maxRadius <= 0.615, `${file} reaches ${stats.maxRadius.toFixed(3)}`);
    // Never smaller than ~55 % of the canvas either: the mark must still read
    // at launcher size on a 108 dp layer.
    assert.ok(stats.coverage >= 0.40, `${file} coverage ${stats.coverage.toFixed(3)}`);
  }
});

test("a light logo is never composited on a plate it disappears into", () => {
  // The regression this guards: the shipped brand mark is WHITE artwork on
  // transparency. Composited on the generator's old always-white plate it became
  // a blank square — the launcher showed an empty white tile and the maskable
  // PWA icon showed nothing. The plate must follow the artwork's luminance.
  const { BRAND_PLATE, DARK_PLATE, LIGHT_ARTWORK_LUMINANCE, plateFor } = icons;
  assert.equal(plateFor(255), DARK_PLATE, "white artwork gets the dark plate");
  assert.equal(plateFor(LIGHT_ARTWORK_LUMINANCE), DARK_PLATE, "the threshold itself counts as light");
  assert.equal(plateFor(40), BRAND_PLATE, "dark artwork keeps the white plate");
  const source = fs.readFileSync("scripts/generate-icons.cjs", "utf8");
  assert.match(source, /glyphLuminance\(/, "the plate is measured, not assumed");
  assert.match(source, /plateFor\(luminance\)/, "main() picks the plate from the master");

  for (const target of targets()) {
    const rel = path.relative(process.cwd(), target.file);
    const stats = inkStats(target.file);
    // Whatever the plate, an icon must contain artwork: a single flat colour is
    // the blank-tile bug this test exists for.
    assert.ok(stats.ink > 100, `${rel}: no artwork found — the logo is invisible on its plate`);
    if (target.kind === "any" || target.kind === "badge") {
      assert.ok(stats.transparentPlate, `${rel}: a mark/badge keeps its transparent plate`);
      continue;
    }
    assert.ok(!stats.transparentPlate, `${rel}: a launcher icon is a full-bleed tile`);

    // THE visibility check: the artwork's own mean colour must sit far from the
    // plate it was composited on. White artwork on a white plate scores ~0 here.
    const { width, height, channels, data } = decodePng(target.file);
    const plate = [data[0], data[1], data[2]];
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * channels;
        if ((channels === 4 ? data[i + 3] : 255) < 32) continue;
        if (
          Math.abs(data[i] - plate[0]) <= 40 &&
          Math.abs(data[i + 1] - plate[1]) <= 40 &&
          Math.abs(data[i + 2] - plate[2]) <= 40
        ) {
          continue;
        }
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n += 1;
      }
    }
    assert.ok(n > 100, `${rel}: no artwork pixels to measure`);
    const contrast = Math.hypot(r / n - plate[0], g / n - plate[1], b / n - plate[2]);
    assert.ok(contrast > 100, `${rel}: the artwork averages only ${contrast.toFixed(0)}/441 away from its plate — it would be invisible`);
  }
});
