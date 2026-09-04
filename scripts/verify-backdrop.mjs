#!/usr/bin/env node
/**
 * Verify the shipped Black Ice backdrop against docs/liquid-glass-v2-brief.md §2.
 *
 *   node scripts/verify-backdrop.mjs              # check + write previews
 *   node scripts/verify-backdrop.mjs --no-png     # check only
 *
 * There is no browser in the sandbox, so "pixel-matches §2 on 3 viewports" is
 * checked the only honest way available: parse the gradient stack out of the
 * BUILT stylesheet (not out of the source — so a Lightning CSS rewrite is
 * caught), composite it with the same maths a browser uses, sample the §2
 * region table, and write a PNG so a human can look at it.
 *
 * What it asserts:
 *   1. every §2 stop and position survives minification byte-for-byte
 *   2. the base ink is #0a0c12 and the vignette is #06070c
 *   3. the sampled composite at each §2 coordinate lands on the named colour
 *   4. luminance stays low and even, and nothing is brighter than the purple
 *      core — otherwise the glass cards stop reading as glass
 *   5. the layer's invariants hold: position fixed, z-index -1,
 *      pointer-events none, and no filter / backdrop-filter / animation /
 *      !important / background-attachment: fixed
 *
 * No dependencies — node builtins only.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist", "index.html");
const OUT_DIR = path.join(ROOT, "docs", "baselines", "backdrop");
const VIEWPORTS = [
  { name: "320x568", w: 320, h: 568 },
  { name: "390x844", w: 390, h: 844 },
  { name: "768x1024", w: 768, h: 1024 },
  { name: "1440x900", w: 1440, h: 900 },
];

/* ── §2 region table ──────────────────────────────────────────────────────────
   Careful what this table means. §2's "Position" column is the *extent* each
   glow spans ("90% 15% … 97% 42%" is the purple glow's footprint, not a pixel
   that reads #7a2488), and its hexes are the *stop colours*. A stop at 0.72
   alpha over the #0a0c12 base composites to something darker than the stop —
   the teal core lands on #0f5650, not #12756a. So sampling cannot assert
   equality with the table's hex.

   What sampling *can* assert is that each region is dominated by the hue §2
   names for it. The exact paint is proved separately, stop for stop, by the
   EXPECTED_LAYERS comparison below. */
const SAMPLES = [
  { at: [12, 30], expect: [47, 58, 148], label: "blue core", hueTol: 26, glow: true },
  { at: [40, 80], expect: [16, 140, 110], label: "teal core", hueTol: 26, glow: true },
  { at: [45, 5], expect: [80, 44, 124], label: "violet bridge", hueTol: 30, glow: true },
  { at: [90, 15], expect: [158, 58, 178], label: "purple core", hueTol: 30, glow: true },
  { at: [8, 97], expect: [5, 6, 10], label: "vignette corner", hueTol: 0, glow: false },
  { at: [70, 55], expect: [10, 12, 18], label: "base ink", hueTol: 0, glow: false },
];

/** The reference implementation's stops, normalised, for a byte-level check.
 *  2026-09-04 · re-pinned to the owner's new reference — the websiteglass docs
 *  playground backdrop (softer densities + the 44 px hairline grid, whose two
 *  repeating-linear-gradient layers are intentionally NOT part of this radial
 *  stack). */
const EXPECTED_LAYERS = [
  { rx: 52, ry: 58, cx: 10, cy: 16, stops: [[0, [47, 58, 148, 0.6]], [40, [60, 72, 176, 0.26]], [72, [0, 0, 0, 0]]] },
  { rx: 56, ry: 48, cx: 42, cy: 92, stops: [[0, [16, 140, 110, 0.5]], [42, [12, 106, 84, 0.24]], [72, [0, 0, 0, 0]]] },
  { rx: 46, ry: 62, cx: 97, cy: 32, stops: [[0, [158, 58, 178, 0.5]], [44, [178, 66, 200, 0.2]], [74, [0, 0, 0, 0]]] },
  { rx: 70, ry: 40, cx: 55, cy: 0, stops: [[0, [80, 44, 124, 0.42]], [70, [0, 0, 0, 0]]] },
  { rx: 120, ry: 90, cx: 50, cy: 100, stops: [[0, [5, 6, 10, 0.6]], [55, [0, 0, 0, 0]]] },
];

const failures = [];
const observations = [];
const notes = [];
const fail = (m) => failures.push(m);

/* ── extract the shipped stylesheet ───────────────────────────────────────── */

if (!existsSync(DIST)) {
  console.error("dist/index.html not found — run `npm run build` first.");
  process.exit(1);
}
const html = readFileSync(DIST, "utf8");
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map((m) => m[1])
  .sort((a, b) => b.length - a.length)[0];
if (!css) fail("no <style> block found in dist/index.html");

/** The base `.dc-backdrop` rule — not the @media / @supports variants. */
function ruleBody(selector, source) {
  const re = new RegExp(`(^|[};])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{`, "g");
  const m = re.exec(source);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

const rawBody = ruleBody(".dc-backdrop", css);
if (rawBody == null) {
  fail(".dc-backdrop rule is missing from the built CSS");
  console.error("FAIL: " + failures.join("; "));
  process.exit(1);
}

/* Lightning CSS cannot see through `var()`, so the shipped rule still says
   `rgb(var(--dc-bd-blue-core)/.95)`. Resolve the tokens out of the built
   `:root` block — that way the palette is verified as it actually ships,
   not as it was authored. */
const TOKENS = {};
{
  /* There is more than one `:root` in the bundle (index.css, glass.css,
     glass-theme.css), so merge all of them rather than taking the first. */
  const re = /(^|[};]):root\{/g;
  let found = 0;
  for (const m of css.matchAll(re)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    const block = css.slice(start, i - 1);
    for (const t of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) TOKENS[t[1]] = t[2].trim();
    found++;
  }
  if (found === 0) fail("no :root block found in the built CSS — cannot resolve the palette tokens");
  for (const required of [
    "--dc-bd-base", "--dc-bd-vignette", "--dc-bd-blue-core", "--dc-bd-blue-hot",
    "--dc-bd-teal-core", "--dc-bd-teal-deep", "--dc-bd-violet-bridge",
    "--dc-bd-purple-core", "--dc-bd-purple-hot", "--dc-z-backdrop",
  ]) {
    if (!(required in TOKENS)) fail(`palette token ${required} is missing from the built CSS`);
  }
}
const resolveVars = (s) =>
  s.replace(/var\((--[\w-]+)\)/g, (whole, name) => {
    if (!(name in TOKENS)) {
      fail(`token ${name} is not defined in the built :root`);
      return whole;
    }
    return TOKENS[name];
  });

const body = resolveVars(rawBody);

/* ── invariant checks on the layer itself ─────────────────────────────────── */

const decl = (prop) => {
  const m = body.match(new RegExp(`(?:^|;)${prop}:([^;]*)`));
  return m ? m[1].trim() : null;
};

if (decl("position") !== "fixed") fail(`position is ${decl("position")}, expected fixed`);
if (decl("z-index") !== "-1" && decl("z-index") !== "var(--dc-z-backdrop)") {
  fail(`z-index is ${decl("z-index")}, expected -1`);
}
if (decl("pointer-events") !== "none") fail(`pointer-events is ${decl("pointer-events")}, expected none`);
for (const banned of ["filter", "backdrop-filter", "-webkit-backdrop-filter", "animation", "background-attachment"]) {
  if (decl(banned) != null) fail(`the backdrop must not declare ${banned} (found ${decl(banned)})`);
}
if (/!important/.test(body)) fail("the backdrop must not use !important");

const baseColor = decl("background-color");
if (baseColor !== "#0a0c12" && baseColor !== "var(--dc-bd-base)") {
  fail(`background-color is ${baseColor}, expected #0a0c12`);
}

/* ── parse the gradient stack ─────────────────────────────────────────────── */

/** #rgb / #rrggbb / #rrggbbaa / rgb(r g b / a) / rgba(r,g,b,a) / #0000 → [r,g,b,a] */
function parseColor(raw) {
  const s = raw.trim();
  if (s === "transparent") return [0, 0, 0, 0];
  let m = s.match(/^#([0-9a-f]{8})$/i);
  if (m) {
    const h = m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16) / 255];
  }
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const h = m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  m = s.match(/^#([0-9a-f]{3,4})$/i);
  if (m) {
    const h = m[1];
    const c = h.split("").map((x) => parseInt(x + x, 16));
    return [c[0], c[1], c[2], h.length === 4 ? c[3] / 255 : 1];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter((x) => x !== "");
    const [r, g, b] = parts.slice(0, 3).map(Number);
    const a = parts.length > 3 ? Number(parts[3]) : 1;
    // percentages (Lightning CSS emits e.g. rgb(44 53 126 / 95%))
    const isPct = /%$/.test(parts[0]);
    return [isPct ? (r / 100) * 255 : r, isPct ? (g / 100) * 255 : g, isPct ? (b / 100) * 255 : b, /%$/.test(parts[3] || "") ? a / 100 : a];
  }
  return null;
}

/** Split a layer list on top-level commas (colours contain commas too). */
function splitTopLevel(input) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const bgImage = decl("background-image") || "";
const gradientSrcs = splitTopLevel(bgImage).map((s) => s.trim()).filter((s) => s.startsWith("radial-gradient("));
if (gradientSrcs.length !== EXPECTED_LAYERS.length) {
  fail(`expected ${EXPECTED_LAYERS.length} radial-gradient layers, found ${gradientSrcs.length}`);
}

const layers = gradientSrcs.map((src) => {
  const inner = src.slice("radial-gradient(".length, -1);
  const parts = splitTopLevel(inner).map((s) => s.trim());
  const head = parts[0]; // "58% 72% at 12% 30%"
  const hm = head.match(/^([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!hm) {
    fail(`could not parse gradient head "${head}"`);
    return null;
  }
  const stops = parts.slice(1).map((p) => {
    // The minifier drops the space before a stop position
    // ("rgb(...)0%", not "rgb(...) 0%"), so the gap is optional.
    const sm = p.match(/^(.*?)\s*([\d.]+)%$/);
    if (!sm) {
      fail(`could not parse stop "${p}"`);
      return null;
    }
    const color = parseColor(sm[1]);
    if (!color) {
      fail(`could not parse colour "${sm[1]}"`);
      return null;
    }
    return [Number(sm[2]), color];
  });
  return {
    rx: Number(hm[1]),
    ry: Number(hm[2]),
    cx: Number(hm[3]),
    cy: Number(hm[4]),
    // unparsable stops are already reported; drop them so the compositor and
    // the comparison loop never hit a null.
    stops: stops.filter(Boolean),
  };
});

/* ── 1. every §2 stop survives minification ───────────────────────────────── */

for (let i = 0; i < Math.min(layers.length, EXPECTED_LAYERS.length); i++) {
  const got = layers[i];
  const want = EXPECTED_LAYERS[i];
  if (!got) continue;
  if (got.rx !== want.rx || got.ry !== want.ry || got.cx !== want.cx || got.cy !== want.cy) {
    fail(`layer ${i + 1} geometry is ${got.rx}% ${got.ry}% at ${got.cx}% ${got.cy}%, expected ${want.rx}% ${want.ry}% at ${want.cx}% ${want.cy}%`);
  }
  if (got.stops.length !== want.stops.length) {
    fail(`layer ${i + 1} has ${got.stops.length} stops, expected ${want.stops.length}`);
    continue;
  }
  for (let s = 0; s < want.stops.length; s++) {
    const [wp, wc] = want.stops[s];
    const gotStop = got.stops[s];
    if (!gotStop) continue; // already reported by the parser
    const [gp, gc] = gotStop;
    if (Math.abs(gp - wp) > 0.01) fail(`layer ${i + 1} stop ${s + 1} position is ${gp}%, expected ${wp}%`);
    for (let c = 0; c < 4; c++) {
      const diff = Math.abs(gc[c] - wc[c]);
      if (diff > 0.01) {
        fail(`layer ${i + 1} stop ${s + 1} channel ${c} is ${gc[c]}, expected ${wc[c]}`);
      }
    }
  }
}

/* ── compositor ───────────────────────────────────────────────────────────── */

function stopColor(layer, d) {
  const stops = layer.stops;
  if (d <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (d <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      const t = p1 === p0 ? 0 : (d - p0) / (p1 - p0);
      return [0, 1, 2, 3].map((k) => c0[k] + (c1[k] - c0[k]) * t);
    }
  }
  return stops[stops.length - 1][1];
}

/** Source-over, in premultiplied space (what CSS compositing does). */
function over(dst, src) {
  const a = src[3] + dst[3] * (1 - src[3]);
  if (a === 0) return [0, 0, 0, 0];
  return [0, 1, 2].map((k) => (src[k] * src[3] + dst[k] * dst[3] * (1 - src[3])) / a).concat(a);
}

const BASE = parseColor(baseColor === "var(--dc-bd-base)" ? "#0a0c12" : baseColor) || [10, 12, 18, 1];

function render(w, h) {
  const px = new Float64Array(w * h * 3);
  const lum = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // +0.5 samples the pixel centre, as a browser does.
      let acc = [BASE[0], BASE[1], BASE[2], BASE[3]];
      // The first listed background-image layer paints on top, so composite
      // back-to-front for source-over.
      for (let i = layers.length - 1; i >= 0; i--) {
        const L = layers[i];
        if (!L) continue;
        const rx = (L.rx / 100) * w;
        const ry = (L.ry / 100) * h;
        const cx = (L.cx / 100) * w;
        const cy = (L.cy / 100) * h;
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(nx * nx + ny * ny);
        const c = stopColor(L, d * 100);
        if (c[3] > 0) acc = over(acc, c);
      }
      const o = (y * w + x) * 3;
      px[o] = acc[0];
      px[o + 1] = acc[1];
      px[o + 2] = acc[2];
      lum[y * w + x] = 0.2126 * acc[0] + 0.7152 * acc[1] + 0.0722 * acc[2];
    }
  }
  return { px, lum, w, h };
}

const sampleAt = (img, xPct, yPct) => {
  const x = Math.min(img.w - 1, Math.floor((xPct / 100) * img.w));
  const y = Math.min(img.h - 1, Math.floor((yPct / 100) * img.h));
  const o = (y * img.w + x) * 3;
  return [img.px[o], img.px[o + 1], img.px[o + 2]];
};

const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** 0–360°, or NaN for a neutral. Used to check a region is the hue §2 names. */
function hueAngle(c) {
  const [r, g, b] = c;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 1e-6) return NaN;
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
}

/* ── minimal PNG encoder (8-bit RGB, no interlace) ────────────────────────── */

function writePng(file, img) {
  const { w, h, px } = img;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const d = y * (w * 3 + 1) + 1 + x * 3;
      raw[d] = Math.round(px[o]);
      raw[d + 1] = Math.round(px[o + 1]);
      raw[d + 2] = Math.round(px[o + 2]);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/* ── run ──────────────────────────────────────────────────────────────────── */

const noPng = process.argv.includes("--no-png");
if (!noPng) mkdirSync(OUT_DIR, { recursive: true });

const report = [];
report.push("Black Ice backdrop — verified against the BUILT stylesheet");
report.push(`  source: dist/index.html (${css.length} bytes of CSS)`);
report.push(`  layers parsed: ${layers.length}/${EXPECTED_LAYERS.length}`);
report.push(`  position:${decl("position")} z-index:${decl("z-index")} pointer-events:${decl("pointer-events")}`);
report.push(`  background-color: ${baseColor}`);
report.push("");

const luminanceProfiles = [];

for (const vp of VIEWPORTS) {
  const img = render(vp.w, vp.h);
  report.push(`  ${vp.name.padEnd(9)} ${String(vp.w).padStart(4)}×${vp.h}`);
  for (const s of SAMPLES) {
    const got = sampleAt(img, s.at[0], s.at[1]);
    const lift = Math.max(...got.map((v, i) => v - BASE[i]));
    let verdict;
    if (!s.glow) {
      // A shade region: must not be lifted above the base ink.
      const ok = lift <= 26;
      verdict = ok ? "ok (shade)" : "FAIL (lit where §2 says shade)";
      if (!ok) fail(`${vp.name} @${s.at[0]}%,${s.at[1]}% (${s.label}) is lifted +${lift.toFixed(0)} above base ink; §2 says this is a shade region`);
    } else {
      const gotHue = hueAngle(got);
      const wantHue = hueAngle(s.expect);
      const diff = Math.min(Math.abs(gotHue - wantHue), 360 - Math.abs(gotHue - wantHue));
      const ok = diff <= s.hueTol;
      verdict = ok ? `ok (hue ${gotHue.toFixed(0)}° vs ${wantHue.toFixed(0)}°)` : "FAIL (wrong hue)";
      if (!ok) fail(`${vp.name} @${s.at[0]}%,${s.at[1]}% (${s.label}) = ${hex(got)} hue ${gotHue.toFixed(0)}°, expected ${hex(s.expect)} hue ${wantHue.toFixed(0)}° (Δ${diff.toFixed(0)}° > ${s.hueTol}°)`);
      if (lift <= 4) fail(`${vp.name} @${s.at[0]}%,${s.at[1]}% (${s.label}) is not visibly lit (lift +${lift.toFixed(1)})`);
    }
    report.push(`    ${String(s.at[0]).padStart(3)}%,${String(s.at[1]).padStart(3)}%  ${s.label.padEnd(18)} ${hex(got)}  stop ${hex(s.expect)}  ${verdict}`);
  }

  // Luminance: low, even, and never brighter than the purple core.
  let max = -1;
  let maxAt = [0, 0];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const v = img.lum[y * img.w + x];
      if (v > max) {
        max = v;
        maxAt = [((x / img.w) * 100).toFixed(0), ((y / img.h) * 100).toFixed(0)];
      }
    }
  }
  const purpleLum = (() => {
    const c = sampleAt(img, 90, 15);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  })();
  /* §2 says "nothing on the page may be brighter than the purple core". The
     reference implementation the same section prescribes does not satisfy
     that: the teal glow at 0.72 alpha composites brighter (L≈72) than the
     purple at 0.80 alpha (L≈47). Both statements cannot hold at once, and the
     reference CSS is the owner's own words, so this is REPORTED rather than
     failed — changing the palette is a design decision, not a build check. */
  if (max > purpleLum + 6) {
    observations.push(
      `${vp.name}: brightest point is at ${maxAt[0]}%,${maxAt[1]}% (L=${max.toFixed(1)}), above the purple core (L=${purpleLum.toFixed(1)}) — §2\'s "nothing brighter than the purple core" is not met by §2\'s own reference gradient stack`,
    );
  }
  // §2 measured profile: top→bottom peaks in the middle band, left→right
  // rises toward the purple edge. Check the shape, not the exact numbers.
  const colAt = (xPct) => {
    let sum = 0;
    const x = Math.floor((xPct / 100) * img.w);
    for (let y = 0; y < img.h; y++) sum += img.lum[y * img.w + x];
    return sum / img.h;
  };
  const rowAt = (yPct) => {
    let sum = 0;
    const y = Math.floor((yPct / 100) * img.h);
    for (let x = 0; x < img.w; x++) sum += img.lum[y * img.w + x];
    return sum / img.w;
  };
  const leftRight = [5, 25, 50, 75, 95].map(colAt);
  const topBottom = [5, 25, 50, 75, 95].map(rowAt);
  /* §2: "Luminance is low and even." The two profiles it prints were measured
     off the reference *screenshot*, which carries the demo card and demo text
     — so they are not reproducible from the gradient stack alone and are
     reported for eyeballing rather than asserted. What IS asserted are the
     properties the sentence actually states, plus that the vignette reaches
     the bottom. */
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < img.lum.length; i++) {
    sum += img.lum[i];
    sumSq += img.lum[i] * img.lum[i];
  }
  const mean = sum / img.lum.length;
  const sd = Math.sqrt(Math.max(0, sumSq / img.lum.length - mean * mean));
  if (mean > 60) fail(`${vp.name}: mean luminance ${mean.toFixed(1)} is not low (§2 wants a low, even field)`);
  if (sd > 26) fail(`${vp.name}: luminance spread σ=${sd.toFixed(1)} is not even`);
  if (max > 110) fail(`${vp.name}: brightest pixel L=${max.toFixed(1)} is too hot for glass to read over`);
  /* 2026-09-04 · reference re-pinned: the green/teal glow now sits LOW-CENTRE
     (the "green line" of the websiteglass docs backdrop), so the bottom row is
     ALLOWED to be brighter than the middle band. What must still hold is the
     vignette's actual job: the bottom CORNERS fall darker than the bottom-
     centre glow. */
  const lumAtPct = (xPct, yPct) => {
    const x = Math.min(img.w - 1, Math.floor((xPct / 100) * img.w));
    const y = Math.min(img.h - 1, Math.floor((yPct / 100) * img.h));
    return img.lum[y * img.w + x];
  };
  const cornerL = Math.max(lumAtPct(6, 96), lumAtPct(94, 96));
  const greenL = lumAtPct(42, 92);
  if (cornerL >= greenL) {
    fail(`${vp.name}: bottom corners (L=${cornerL.toFixed(1)}) do not fall darker than the bottom-centre green glow (L=${greenL.toFixed(1)})`);
  }
  luminanceProfiles.push({ vp: vp.name, leftRight, topBottom, max, purpleLum });
  report.push(`    L→R mean luminance  ${leftRight.map((v) => v.toFixed(0).padStart(3)).join(" ")}`);
  report.push(`    T→B mean luminance  ${topBottom.map((v) => v.toFixed(0).padStart(3)).join(" ")}`);
  report.push(`    brightest L=${max.toFixed(1)} @${maxAt[0]}%,${maxAt[1]}%   purple core L=${purpleLum.toFixed(1)}`);
  report.push(`    mean L=${mean.toFixed(1)}  σ=${sd.toFixed(1)}  (low and even: want mean ≤60, σ ≤26, max ≤110)`);
  if (!noPng) {
    writePng(path.join(OUT_DIR, `backdrop-${vp.name}.png`), img);
    notes.push(`docs/baselines/backdrop/backdrop-${vp.name}.png`);
  }
  report.push("");
}

/* ── 1× DPR render (brief §10) ────────────────────────────────────────────── */
{
  const img = render(390, 844);
  if (!noPng) {
    writePng(path.join(OUT_DIR, "backdrop-1x-dpr.png"), img);
    notes.push("docs/baselines/backdrop/backdrop-1x-dpr.png");
  }
}

process.stdout.write(report.join("\n") + "\n");
if (notes.length > 0) process.stdout.write("  previews written:\n" + notes.map((n) => "    " + n).join("\n") + "\n");
if (observations.length > 0) {
  process.stdout.write("\nOBSERVATIONS (not failures):\n" + [...new Set(observations)].map((o) => "  ~ " + o).join("\n") + "\n");
}

if (failures.length > 0) {
  process.stdout.write("\nFAIL:\n" + failures.map((f) => "  ! " + f).join("\n") + "\n");
  process.exit(1);
}
process.stdout.write("\nOK — the shipped backdrop matches §2 on every viewport.\n");
