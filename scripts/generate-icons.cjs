/**
 * Generates the app's raster notification/PWA icon assets from vector specs.
 *
 * Why these exist: Web Push `badge` and `icon` are rendered by the OS, not the
 * browser canvas, so they must be PNG (Android rejects SVG badges and shows a
 * solid white placeholder instead — the "white circle" bug). The `badge` is a
 * monochrome glyph on a transparent background; Android draws it using only the
 * alpha channel, so any opaque background turns into a solid white shape.
 *
 * Run: node scripts/generate-icons.cjs
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

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
// Open-book outline in 192-space, shared by the app icon and the badge so the
// notification small-icon matches the app icon instead of a plain letter.
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

// ---------------------------------------------------------------- app icon
const GRAD_A = [79, 70, 229];  // #4f46e5
const GRAD_B = [124, 58, 237]; // #7c3aed

function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size / 192; // scale from 192-space
  // gradient anchors (192-space)
  const gx0 = 24 * s; const gy0 = 16 * s; const gx1 = 168 * s; const gy1 = 176 * s;
  const gdx = gx1 - gx0; const gdy = gy1 - gy0; const gLen2 = gdx * gdx + gdy * gdy;
  // rounded-rect background (192-space: x8..184, y8..184, rx44)
  const bx0 = 8 * s; const by0 = 8 * s; const bx1 = 184 * s; const by1 = 184 * s; const br = 44 * s;

  // book outline paths in 192-space (stroked white, width 10)
  const paths = bookOutlinePaths();
  const strokeHalf = 5 * s;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * size + x) * 4;
      if (!inRounded(px, py, bx0, by0, bx1, by1, br)) continue; // transparent outside
      // linear gradient along the diagonal
      let t = 0;
      if (gLen2 > 0) t = Math.max(0, Math.min(1, ((px - gx0) * gdx + (py - gy0) * gdy) / gLen2));
      const r = Math.round(GRAD_A[0] + (GRAD_B[0] - GRAD_A[0]) * t);
      const g = Math.round(GRAD_A[1] + (GRAD_B[1] - GRAD_A[1]) * t);
      const b = Math.round(GRAD_A[2] + (GRAD_B[2] - GRAD_A[2]) * t);
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
      if (distanceToBookOutline(px, py, s, paths) <= strokeHalf) {
        buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255;
      }
    }
  }
  return encodePNG(size, size, buf);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'badge-96x96.png'), makeBadge(96));
fs.writeFileSync(path.join(outDir, 'icon-192x192.png'), makeIcon(192));
fs.writeFileSync(path.join(outDir, 'icon-512x512.png'), makeIcon(512));
console.log('Wrote badge-96x96.png, icon-192x192.png, icon-512x512.png');
