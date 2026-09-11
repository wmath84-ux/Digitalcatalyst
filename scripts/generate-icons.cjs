/**
 * Generates the app's raster notification/PWA icon assets.
 *
 * The full-colour web/PWA icons (icon-192x192, icon-512x512 and the maskable
 * icon) are produced by resizing the brand's master logo
 * (public/branding/logo-source.png) with `sharp`. This replaces the old
 * hand-drawn book-shaped placeholder that used to be rendered pixel-by-pixel
 * in pure JS.
 *
 * The `badge` is monochrome on purpose: Web Push `badge`, local-notification
 * badges AND the Android status-bar small icon are rendered by the OS using
 * only the alpha channel — any opaque area shows up as a solid white blob,
 * and colour is ignored. We therefore derive the badge from the SAME master
 * logo: take its alpha (silhouette), flatten the RGB to pure white, and keep
 * a transparent background. The matching Android vector lives at
 * android/app/src/main/res/drawable/ic_stat_eduvora.xml, so native FCM/local
 * notifications and web push show the same brand glyph.
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

// ---------------------------------------------------------------- badge
/**
 * Build the monochrome notification badge from the master logo's alpha
 * channel. The master is the brand glyph on a transparent background, so its
 * alpha IS the silhouette: we resize it to the badge canvas and then force
 * every pixel's RGB to white while preserving its alpha. The OS renders only
 * that alpha, so the result is a crisp white brand mark on transparent —
 * exactly what Android/Chrome require for the status-bar small icon / Web
 * Push badge, with no risk of an opaque square blob.
 */
async function makeBadge(size) {
  const { data, info } = await sharp(SRC_MASTER)
    .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0; p < info.width * info.height; p += 1) {
    const src = p * 4;
    const dst = p * 4;
    let alpha = data[src + 3];
    // Drop faint halo pixels (<6% opacity) so resizing never leaves a ghost
    // outline around the glyph; keep the rest anti-aliased for crisp edges.
    if (alpha < 16) alpha = 0;
    out[dst] = 255;
    out[dst + 1] = 255;
    out[dst + 2] = 255;
    out[dst + 3] = alpha;
  }
  return encodePNG(info.width, info.height, out);
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

  // Notification badge — white-on-transparent silhouette OF THE BRAND LOGO
  // (derived from its alpha channel). A full-colour image would be flattened
  // to an opaque blob by the OS badge renderer; the silhouette matches the
  // Android status-bar vector (res/drawable/ic_stat_eduvora.xml).
  fs.writeFileSync(path.join(outDir, 'badge-96x96.png'), await makeBadge(96));

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
