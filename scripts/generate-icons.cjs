/**
 * Generates every raster brand icon the app ships, from the ONE master logo
 * (public/branding/logo-source.png):
 *
 *   · public/icons/icon-192x192.png, icon-512x512.png   → PWA "any"
 *   · public/icons/maskable-icon-512x512.png            → PWA "maskable"
 *   · public/icons/badge-96x96.png                      → notification badge
 *   · android mipmap-*\/ic_launcher.png, ic_launcher_round.png
 *   · android mipmap-*\/ic_launcher_foreground.png      → adaptive foreground
 *
 * ── Why the artwork is placed by measurement, not by eye ────────────────────
 * The brand mark is a DIAGONAL glyph (two strokes crossing), so its extreme
 * pixels sit at the CORNERS of its own bounding box. Every icon mask the
 * platforms apply — round, squircle, rounded-square, the 80 % maskable safe
 * circle, Android's 66 dp adaptive safe circle — cuts those corners first.
 * The old generator pasted the master 1:1 (85 % coverage, tips 34 px from a
 * 512 px edge), which is precisely the reported "icon bahut zoom dikhta hai,
 * side se cut raha hai".
 *
 * So this script measures the master's opaque bounding box, crops to it, and
 * re-places the glyph on each canvas at a coverage that is provably inside the
 * mask that canvas will meet:
 *
 *   canvas                       mask it must survive            coverage
 *   ───────────────────────────  ──────────────────────────────  ────────
 *   PWA "any" (192/512)          rounded-square / circle         0.68
 *   PWA "maskable" (512)         80 % safe circle (radius 0.40)  0.56
 *   Android legacy launcher      round mask (radius 0.50)        0.62
 *   Android adaptive foreground  circular mask (radius 0.333)    0.44
 *
 * A diagonal glyph whose bounding box is `coverage × canvas` reaches
 * `0.5 × coverage × √2` from the centre (its tips), so each value above keeps
 * the tips inside the mask radius with a small safety margin. The numbers are
 * exported so `tests/appIconSafeZone.test.mjs` can assert the committed PNGs
 * still obey them — a hand-edited asset can no longer silently regress.
 *
 * Run:  node scripts/generate-icons.cjs           (regenerates every asset)
 *       node scripts/generate-icons.cjs --check   (verify only, exit 1 on drift)
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC_MASTER = path.join(ROOT, 'public', 'branding', 'logo-source.png');
const ICON_DIR = path.join(ROOT, 'public', 'icons');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

/**
 * Glyph bounding-box side as a fraction of the canvas, per icon kind. The
 * invariant every value must hold: `0.5 * coverage * Math.SQRT2 <= maskRadius`.
 */
const COVERAGE = {
  /** PWA `purpose: "any"` — 0.68 → tips at 0.481 of the canvas. */
  any: 0.68,
  /** PWA `purpose: "maskable"` — 0.56 → tips at 0.396 < 0.40 (the safe circle). */
  maskable: 0.56,
  /** Legacy Android launcher (square + round PNG) — 0.62 → tips at 0.438. */
  launcher: 0.62,
  /**
   * Adaptive-icon foreground. The invariant is `coverage × √2 ≤ mask radius in
   * half-canvas units`, because a glyph that reaches the CORNERS of its own
   * bounding box puts its tips at `coverage × √2` of the half-canvas. Android's
   * guaranteed "always visible" circle is 33 dp of the 108 dp layer = 0.611, so
   * 0.42 → tips at 0.594 (the old 0.44 reached 0.622 and was only safe for a
   * glyph whose bbox corners happened to carry no ink — the live brand logo's
   * do, and its tips were being shaved).
   */
  adaptiveForeground: 0.42,
  /** Notification badge — near full-bleed on purpose (rendered ~24 dp). */
  badge: 0.86,
};

/** Android density buckets: mdpi … xxxhdpi. */
const DENSITIES = [
  { name: 'mdpi', launcher: 48, adaptive: 108 },
  { name: 'hdpi', launcher: 72, adaptive: 162 },
  { name: 'xhdpi', launcher: 96, adaptive: 216 },
  { name: 'xxhdpi', launcher: 144, adaptive: 324 },
  { name: 'xxxhdpi', launcher: 192, adaptive: 432 },
];

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
/** The app's white theme — the adaptive background is #FFFFFF, so a maskable
 *  icon with the same plate looks identical on both install paths. */
const BRAND_PLATE = { r: 255, g: 255, b: 255, alpha: 1 };
/**
 * The fallback plate for a LIGHT logo. An admin-uploaded brand mark is very
 * often white artwork on transparency (it is designed to sit on the app's dark
 * chrome), and white artwork composited on the white plate is a BLANK icon —
 * the launcher shows an empty white square. So the plate follows the artwork:
 * a near-white glyph gets the app's dark slate, everything else keeps white.
 */
const DARK_PLATE = { r: 15, g: 23, b: 42, alpha: 1 };
/** Mean luminance at/above which the artwork counts as "light". */
const LIGHT_ARTWORK_LUMINANCE = 200;

// ---------------------------------------------------------------- PNG encode
function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- measuring
/**
 * Opaque bounding box of an RGBA buffer, as { left, top, width, height }.
 * `alphaFloor` sits below the anti-aliased edge so a soft 1-pixel halo cannot
 * inflate the box (which would silently shrink the placed glyph).
 */
function opaqueBounds(data, width, height, alphaFloor = 16) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < alphaFloor) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { left: 0, top: 0, width, height };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Mean luminance (0–255) of the artwork's OWN opaque pixels — the number that
 * decides which plate it is composited on. Sampled over the glyph's bounding
 * box only, so the transparent padding cannot drag a dark logo down or a light
 * one up.
 */
function glyphLuminance(data, width, bounds, alphaFloor = 16) {
  let total = 0;
  let counted = 0;
  for (let y = bounds.top; y < bounds.top + bounds.height; y += 1) {
    for (let x = bounds.left; x < bounds.left + bounds.width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < alphaFloor) continue;
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      counted += 1;
    }
  }
  return counted ? total / counted : 0;
}

/** The plate a logo of this luminance must sit on to stay visible. */
function plateFor(luminance) {
  return luminance >= LIGHT_ARTWORK_LUMINANCE ? DARK_PLATE : BRAND_PLATE;
}

/** The master logo, cropped to its own glyph so padding is decided here. */
async function readGlyph(source = SRC_MASTER) {
  const original = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = original.info;
  const corners = [0, width - 1, (height - 1) * width, width * height - 1].map((i) => i * 4);
  const uniformOpaquePlate = corners.every((i) => original.data[i + 3] >= 250 &&
    [0, 1, 2].every((c) => Math.abs(original.data[i + c] - original.data[c]) <= 10));
  // Uploaded JPG/opaque PNG logos have padding too. Alpha-only bounds treated
  // that whole plate as artwork and silently shrank maskable/Android icons.
  const prepared = uniformOpaquePlate
    ? await sharp(source).trim({ background: { r: original.data[0], g: original.data[1], b: original.data[2] }, threshold: 40 }).png().toBuffer()
    : source;
  const { data, info } = await sharp(prepared).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = opaqueBounds(data, info.width, info.height);
  const glyph = await sharp(prepared)
    .ensureAlpha()
    .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
    .png()
    .toBuffer();
  return { glyph, bounds, masterSize: width, luminance: glyphLuminance(data, info.width, bounds) };
}

/**
 * One icon canvas: `glyph` centred on a `size × size` plate, its longer side
 * equal to `coverage × size`. Returns the PNG bytes.
 */
async function composeIcon(glyph, size, coverage, background) {
  const inner = Math.max(1, Math.round(size * coverage));
  const scaled = await sharp(glyph)
    .resize(inner, inner, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const meta = await sharp(scaled).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([
      {
        input: scaled,
        left: Math.round((size - meta.width) / 2),
        top: Math.round((size - meta.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/**
 * Notification badge: the master's alpha IS the silhouette (the OS renders only
 * alpha), forced to pure white with faint halo pixels dropped.
 */
async function makeBadge(glyph, size, coverage) {
  const placed = await composeIcon(glyph, size, coverage, TRANSPARENT);
  const { data, info } = await sharp(placed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0; p < info.width * info.height; p += 1) {
    const src = p * 4;
    const dst = p * 4;
    let alpha = data[src + 3];
    if (alpha < 16) alpha = 0;
    out[dst] = 255;
    out[dst + 1] = 255;
    out[dst + 2] = 255;
    out[dst + 3] = alpha;
  }
  return encodePNG(info.width, info.height, out);
}

/** Every file this script owns, as { file, kind, size } — used by --check too. */
function targets() {
  const list = [
    { file: path.join(ICON_DIR, 'icon-192x192.png'), kind: 'any', size: 192 },
    { file: path.join(ICON_DIR, 'icon-512x512.png'), kind: 'any', size: 512 },
    { file: path.join(ICON_DIR, 'maskable-icon-512x512.png'), kind: 'maskable', size: 512 },
    { file: path.join(ICON_DIR, 'badge-96x96.png'), kind: 'badge', size: 96 },
  ];
  for (const density of DENSITIES) {
    const dir = path.join(ANDROID_RES, `mipmap-${density.name}`);
    list.push({ file: path.join(dir, 'ic_launcher.png'), kind: 'launcher', size: density.launcher });
    list.push({ file: path.join(dir, 'ic_launcher_round.png'), kind: 'launcher', size: density.launcher });
    list.push({
      file: path.join(dir, 'ic_launcher_foreground.png'),
      kind: 'adaptiveForeground',
      size: density.adaptive,
    });
  }
  return list;
}

async function build(glyph, target, plate = BRAND_PLATE) {
  const coverage = COVERAGE[target.kind];
  if (target.kind === 'badge') return makeBadge(glyph, target.size, coverage);
  // "any" stays transparent (a mark, not a tile). Everything Android shows on
  // its own launcher plate — maskable, legacy launcher, adaptive foreground —
  // is composited on `plate`: white for a dark logo, the app's dark slate for a
  // light one (a white logo on a white plate is a blank icon).
  const background = target.kind === 'any' ? TRANSPARENT : plate;
  return composeIcon(glyph, target.size, coverage, background);
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  if (!fs.existsSync(SRC_MASTER)) {
    console.error(`Master logo not found at ${SRC_MASTER}.`);
    console.error('Save the brand logo there (square, transparent PNG) and re-run this script.');
    process.exit(1);
  }

  const { glyph, bounds, masterSize, luminance } = await readGlyph();
  const plate = plateFor(luminance);
  const measured = (bounds.width / masterSize) * 100;
  console.log(
    `Master ${masterSize}×${masterSize}: glyph ${bounds.width}×${bounds.height} ` +
      `(${measured.toFixed(1)}% of the canvas, luminance ${luminance.toFixed(0)}) — ` +
      `cropped, then re-placed per mask on a ${plate === DARK_PLATE ? 'dark' : 'white'} plate.`,
  );

  let drift = 0;
  for (const target of targets()) {
    const bytes = await build(glyph, target, plate);
    const rel = path.relative(ROOT, target.file);
    if (checkOnly) {
      const current = fs.existsSync(target.file) ? fs.readFileSync(target.file) : null;
      if (!current || !current.equals(bytes)) {
        drift += 1;
        console.error(`drift: ${rel}`);
      }
      continue;
    }
    fs.mkdirSync(path.dirname(target.file), { recursive: true });
    fs.writeFileSync(target.file, bytes);
    console.log(`wrote ${rel} (${target.kind}, ${target.size}px, coverage ${COVERAGE[target.kind]})`);
  }

  if (checkOnly) {
    if (drift) {
      console.error(`${drift} icon file(s) differ from the master logo. Run: node scripts/generate-icons.cjs`);
      process.exit(1);
    }
    console.log('All brand icons match the master logo and their mask-safe coverage.');
    return;
  }
  console.log('Done — PWA + Android icons regenerated from the master logo.');
}

// Exported for scripts/sync-android-icon.mjs (live branding → APK icon).
module.exports = {
  COVERAGE,
  DENSITIES,
  TRANSPARENT,
  BRAND_PLATE,
  DARK_PLATE,
  LIGHT_ARTWORK_LUMINANCE,
  opaqueBounds,
  glyphLuminance,
  plateFor,
  readGlyph,
  composeIcon,
  makeBadge,
  targets,
  build,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
