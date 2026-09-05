/**
 * Generates the app's raster notification/PWA icon assets.
 *
 * The full-colour web/PWA icons (icon-192x192, icon-512x512 and the maskable
 * icon) are produced by resizing the brand's master logo
 * (public/branding/logo-source.png) with `sharp`. This replaces the old
 * hand-drawn book-shaped placeholder that used to be rendered pixel-by-pixel
 * in pure JS.
 *
 * The `badge` is DIFFERENT on purpose: Web Push `badge` and local-notification
 * badges are rendered by the OS using only the alpha channel, so they must stay
 * a monochrome white glyph on a transparent background (Android shows any
 * opaque area as a solid white blob). We therefore keep the simple white
 * open-book glyph for the badge and never put the full-colour logo there.
 *
 * Run: node scripts/generate-icons.cjs
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC_MASTER = path.join(ROOT, 'public', 'branding', 'logo-source.png');
const outDir = path.join(ROOT, 'public', 'icons');

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

// ---------------------------------------------------------------- geometry
const inRounded = (px, py, x0, y0, x1, y1, r) => {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.max(x0 + r, Math.min(px, x1 - r));
  const cy = Math.max(y0 + r, Math.min(py, y1 - r));
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
};

const segDist = (px, py, ax, ay, bx, by) => {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.sqrt(dx * dx + dy * dy);
};

// Sample a cubic bezier into points (inclusive of endpoints).
const cubic = (x0, y0, x1, y1, x2, y2, x3, y3, steps = 16) => {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
    const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
    pts.push([x, y]);
  }
  return pts;
};

// ---------------------------------------------------------------- badge
// Open-book outline in 192-space, shared by the badge only (kept as the simple
// monochrome notification glyph — see header note).
const bookOutlinePaths = () => {
  const path1 = [
    ...cubic(40, 58, 40, 48, 48, 40, 58, 40),
    [96, 40], [96, 152], [58, 152],
    ...cubic(58, 152, 48, 152, 40, 144, 40, 134),
    [40, 58],
  ];
  const path2 = [
    ...cubic(152, 58, 152, 48, 144, 40, 134, 40),
    [96, 40], [96, 152], [134, 152],
    ...cubic(134, 152, 144, 152, 152, 144, 152, 134),
    [152, 58],
  ];
  return [path1, path2];
};

const distanceToBookOutline = (px, py, scale, paths) => {
  let min = Infinity;
  for (const pts of paths) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const d = segDist(px, py, pts[i][0] * scale, pts[i][1] * scale, pts[i + 1][0] * scale, pts[i + 1][1] * scale);
      if (d < min) min = d;
    }
  }
  return min;
};

function makeBadge(size) {
  const buf = Buffer.alloc(size * size * 4);
  // Android badges are rendered through the alpha channel only, so the glyph
  // must be white on transparent. Zoom the book mark slightly past its icon
  // bounds so it stays legible in the status bar, and stroke it much bolder
  // than the app-icon stroke.
  const zoom = 1.22;
  const k = size / 192;
  const zoomAt = (v) => (96 + (v - 96) * zoom) * k; // 192-space → badge px, zoomed about the centre
  const scaled = bookOutlinePaths().map((pts) => pts.map(([x, y]) => [zoomAt(x), zoomAt(y)]));
  const strokeHalf = 8 * k; // ≈16 units wide in 192-space — bold on small screens
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * size + x) * 4;
      if (distanceToBookOutline(px, py, 1, scaled) <= strokeHalf) {
        buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
      }
    }
  }
  return encodePNG(size, size, buf);
}

// ---------------------------------------------------------------- main logo icons
/**
 * Resize the full-colour master logo into a plain square PNG at the requested
 * size. The master already carries transparent padding around the emblem so the
 * art is never clipped when the OS applies a rounded/square mask.
 */
async function makeLogoPng(size) {
  const png = await sharp(SRC_MASTER)
    .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  return png;
}

/**
 * Maskable icon. `fit: cover` fills the whole canvas with the master, but OS
 * icon masks (Circle, Squircle, Rounded-square) crop the outer ~20% of the
 * safe zone. To keep the emblem inside the visible safe area we scale the
 * master logo down to ~80% of the canvas and centre it on the transparent
 * canvas, so the mask never clips the artwork.
 */
async function makeMaskablePng(size = 512, scale = 0.8) {
  const inner = Math.round(size * scale);
  const logo = await sharp(SRC_MASTER)
    .resize(inner, inner, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const offset = Math.round((size - inner) / 2);
  const composed = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png()
    .toBuffer();
  return composed;
}

async function main() {
  if (!fs.existsSync(SRC_MASTER)) {
    console.error(`Master logo not found at ${SRC_MASTER}.`);
    console.error('Save the brand logo there (square, transparent PNG) and re-run this script.');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  // Notification badge — keep the existing monochrome white book glyph. A
  // full-colour logo would be flattened to an opaque blob by the OS badge
  // renderer, so we intentionally do NOT reuse the logo for this asset.
  fs.writeFileSync(path.join(outDir, 'badge-96x96.png'), makeBadge(96));

  // Full-colour web/PWA icons from the master logo.
  fs.writeFileSync(path.join(outDir, 'icon-192x192.png'), await makeLogoPng(192));
  fs.writeFileSync(path.join(outDir, 'icon-512x512.png'), await makeLogoPng(512));

  // Maskable PNG (logo scaled to ~80% with safe padding). Replaces the old
  // maskable SVG so the installed PWA icon shows the new brand logo.
  fs.writeFileSync(path.join(outDir, 'maskable-icon-512x512.png'), await makeMaskablePng(512, 0.8));

  console.log('Wrote badge-96x96.png, icon-192x192.png, icon-512x512.png, maskable-icon-512x512.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
