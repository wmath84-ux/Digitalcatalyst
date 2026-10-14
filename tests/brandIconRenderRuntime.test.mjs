// tests/brandIconRenderRuntime.test.mjs
//
// End-to-end test of the icon the installed PWA actually receives: a real logo
// goes through the REAL composition path (api/_lib/brandIconRender.ts, sharp and
// all) and the returned PNG is decoded and measured.
//
// It exists because the geometry unit tests cannot prove the composition: a
// logo that is resized but composed at the wrong offset, or a maskable icon
// without its plate, would pass those and still ship a clipped icon.
//
// The two modules use `.js` relative specifiers (Vercel's ESM resolver needs
// them, Node cannot resolve them from TypeScript), so they are bundled with
// esbuild first — the same bundler Vite uses in the app build.
//
// Skips (never fails) when sharp/esbuild are unavailable, e.g. a stripped
// install: the runtime's own fallback is "serve the original image".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

async function loadRenderer() {
  let esbuild;
  let sharp;
  try {
    esbuild = await import("esbuild");
    sharp = (await import("sharp")).default;
  } catch {
    return null;
  }
  const outfile = path.join(os.tmpdir(), `brand-icon-render-${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.resolve("api/_lib/brandIconRender.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    external: ["sharp"],
    logLevel: "silent",
  });
  const module = await import(`file://${outfile}`);
  fs.rmSync(outfile, { force: true });
  return { renderBrandIcon: module.renderBrandIcon, sharp };
}

/** Minimal PNG reader (8-bit RGBA, filter types 0-4). */
function decodePng(buffer) {
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
 * Ink geometry of a decoded icon: how far the artwork reaches from the centre
 * (in half-canvas units — 1 is the canvas mid-edge) and how big it is.
 * `plate` is any pixel that is opaque but pure white: the maskable pack's
 * background, which is NOT artwork.
 */
function measure(png, { whiteIsBackground = true } = {}) {
  const { width, height, channels, data } = png;
  const radius = (width - 1) / 2;
  let ink = 0;
  let maxRadius = 0;
  let minX = width;
  let maxX = -1;
  let plate = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const alpha = channels === 4 ? data[i + 3] : 255;
      if (alpha > 0) plate += 1;
      const r = data[i];
      const g = channels >= 3 ? data[i + 1] : data[i];
      const b = channels >= 3 ? data[i + 2] : data[i];
      if (alpha < 32 || (whiteIsBackground && r >= 240 && g >= 240 && b >= 240)) continue;
      ink += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      const distance = Math.hypot(x - radius, y - radius) / radius;
      if (distance > maxRadius) maxRadius = distance;
    }
  }
  return { width, height, ink, coverage: ink ? (maxX - minX + 1) / width : 0, maxRadius, plate };
}

/** A diagonal X on a transparent canvas — the shipped brand mark's shape. */
async function brandLikeLogo(sharp) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <g stroke="#4f46e5" stroke-width="150" stroke-linecap="round">
      <line x1="170" y1="170" x2="854" y2="854" />
      <line x1="854" y1="170" x2="170" y2="854" />
    </g>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const renderer = await loadRenderer();

test("a transparent logo becomes a mask-safe PNG at the declared size", { skip: !renderer && "sharp/esbuild unavailable" }, async () => {
  const { renderBrandIcon, sharp } = renderer;
  const logo = await brandLikeLogo(sharp);

  for (const size of [192, 512]) {
    for (const variant of ["any", "maskable"]) {
      const rendered = await renderBrandIcon(sharp, logo, { size, variant });
      assert.ok(rendered, `${variant} ${size} must render (not fall back)`);
      assert.equal(rendered.contentType, "image/png");
      const png = decodePng(rendered.body);
      // Exactly the size the manifest promises Chrome.
      assert.equal(png.width, size);
      assert.equal(png.height, size);

      const stats = measure(png);
      assert.ok(stats.ink > 0, "the artwork survived the composition");
      // The mask radii this icon must survive: an inscribed circle for `any`,
      // the 80 % safe circle for `maskable` (see imageTools.ts).
      const maskRadius = variant === "maskable" ? 0.8 : 1.0;
      assert.ok(
        stats.maxRadius <= maskRadius + 0.005,
        `${variant} @${size}: the artwork reaches ${stats.maxRadius.toFixed(3)} of the half-canvas, outside the ${maskRadius} mask`,
      );
      // …and it is not shrinking to nothing either.
      assert.ok(stats.coverage > 0.4, `${variant} @${size}: coverage ${stats.coverage.toFixed(3)}`);

      if (variant === "maskable") {
        // A white plate fills the canvas, so the mask cuts a plate and never
        // the mark (the same look as the Android adaptive icon).
        assert.equal(stats.plate, size * size, "every pixel of a maskable icon is opaque");
        const corner = decodePng(rendered.body);
        const cornerIndex = 0;
        assert.equal(corner.data[cornerIndex], 255, "the plate is white");
        assert.equal(corner.data[cornerIndex + 3], 255, "…and opaque");
      } else {
        // `any` keeps the transparent background the shipped icon has, so the
        // mark floats on the launcher exactly like the brand asset does.
        const transparentCorner = png.channels === 4 && png.data[3] === 0;
        assert.ok(transparentCorner, "an `any` icon keeps a transparent corner");
      }
    }
  }
});

test("a tight-cropped logo is centred, not left in its corner", { skip: !renderer && "sharp/esbuild unavailable" }, async () => {
  const { renderBrandIcon, sharp } = renderer;
  // A 60×60 mark in the TOP-LEFT of a 900×900 canvas — the classic upload.
  const logo = await sharp({
    create: { width: 900, height: 900, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#4f46e5"/></svg>')).png().toBuffer(),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

  const rendered = await renderBrandIcon(sharp, logo, { size: 512, variant: "maskable" });
  const png = decodePng(rendered.body);
  // Find the ink (non-white, opaque) box: a square mark must come out centred.
  let minX = png.width;
  let maxX = -1;
  let minY = png.height;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * 4;
      const white = png.data[i] >= 240 && png.data[i + 1] >= 240 && png.data[i + 2] >= 240;
      if (white || png.data[i + 3] < 32) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  assert.ok(Math.abs(centreX - 255.5) <= 2, `centred horizontally (got ${centreX})`);
  assert.ok(Math.abs(centreY - 255.5) <= 2, `centred vertically (got ${centreY})`);
  // The mark is scaled to the maskable coverage (0.56 → 287 px on 512), NOT to
  // the 900 px canvas it was uploaded in (which would be ~57 px).
  const side = maxX - minX + 1;
  assert.ok(side > 512 * 0.5 && side < 512 * 0.6, `mark side ${side} must be ~${Math.round(512 * 0.56)}`);
});

test("an opaque logo is resized to the declared size without padding", { skip: !renderer && "sharp/esbuild unavailable" }, async () => {
  const { renderBrandIcon, sharp } = renderer;
  const tile = await sharp({
    create: { width: 300, height: 200, channels: 4, background: { r: 17, g: 24, b: 39, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const rendered = await renderBrandIcon(sharp, tile, { size: 512, variant: "any" });
  const png = decodePng(rendered.body);
  assert.equal(png.width, 512);
  assert.equal(png.height, 512);
  // Full bleed: the corner keeps the uploaded colour, so no plate/margin was
  // added to a design that filled its own canvas (`cover` crops, never pads).
  assert.equal(png.data[0], 17);
  assert.equal(png.data[3], 255);
});

// ───────────────────────────── the endpoint itself ──────────────────────────
// The handler is what the installed PWA actually calls, so it is driven here
// end to end: a stubbed Firestore branding document + a stubbed upstream logo
// in, the bytes Chrome would receive out. `api/_lib/firebaseAdmin.js` is
// resolved to a stub by the bundler (the real module needs Vercel's runtime).

async function loadHandler() {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch {
    return null;
  }
  // The bundle must live INSIDE the repo: `sharp` is kept external (it is a
  // native module), and the runtime `import("sharp")` then resolves from the
  // outfile's own directory. In os.tmpdir() it would silently fall back to the
  // un-resized bytes — the exact case the fallback test covers.
  const outfile = path.resolve(`.brand-icon-handler-${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.resolve("api/_lib/brandIcon.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    external: ["sharp"],
    logLevel: "silent",
    plugins: [
      {
        name: "stub-firebase-admin",
        setup(build) {
          build.onResolve({ filter: /^\.\/firebaseAdmin\.js$/ }, () => ({ path: "firebase-admin-stub", namespace: "stub" }));
          build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents:
              "export const adminDb = () => globalThis.__brandIconTestDb();\n" +
              "export const errorResponse = () => undefined;\n",
            loader: "js",
          }));
        },
      },
    ],
  });
  const module = await import(`file://${outfile}`);
  fs.rmSync(outfile, { force: true });
  return module.handleBrandIcon;
}

const handleBrandIcon = await loadHandler();

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    jsonBody: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(body) {
      this.body = body ?? null;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      this.statusCode = this.statusCode || 200;
      return this;
    },
  };
}

async function withBranding(logoUrl, run) {
  const previousDb = globalThis.__brandIconTestDb;
  const previousFetch = globalThis.fetch;
  globalThis.__brandIconTestDb = () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({ logoUrl, appName: "Eduvora", tagline: "Digital Catalyst", updatedAt: null }),
        }),
      }),
    }),
  });
  try {
    return await run();
  } finally {
    globalThis.__brandIconTestDb = previousDb;
    globalThis.fetch = previousFetch;
  }
}

test("the endpoint returns a mask-safe PNG at the declared size", { skip: !handleBrandIcon && "esbuild unavailable" }, async () => {
  const sharp = (await import("sharp")).default;
  const logo = await brandLikeLogo(sharp);

  await withBranding("https://cdn.example/brand/logo.png", async () => {
    globalThis.fetch = async () =>
      new Response(logo, { status: 200, headers: { "content-type": "image/png", "content-length": String(logo.length) } });

    for (const [query, size, variant] of [
      [{ size: "192" }, 192, "any"],
      [{ size: "512" }, 512, "any"],
      [{ size: "512", maskable: "1" }, 512, "maskable"],
    ]) {
      const res = fakeRes();
      await handleBrandIcon({ method: "GET", query }, res);
      assert.equal(res.statusCode, 200, `size=${size} maskable=${variant}`);
      assert.equal(res.headers["content-type"], "image/png");
      assert.equal(res.headers["access-control-allow-origin"], "*");
      assert.equal(res.headers["cross-origin-resource-policy"], "cross-origin");
      assert.match(res.headers.etag, /^"[0-9a-f]{20}"$/);
      // Content-addressed (branding version + layout version), so the browser
      // may keep it for a year: the install prompt refetches once per change.
      assert.match(res.headers["cache-control"], /max-age=31536000, immutable/);

      const png = decodePng(res.body);
      assert.equal(png.width, size);
      assert.equal(png.height, size);
      const stats = measure(png);
      const maskRadius = variant === "maskable" ? 0.8 : 1.0;
      assert.ok(stats.maxRadius <= maskRadius + 0.005, `${variant}: artwork reaches ${stats.maxRadius.toFixed(3)}`);
      if (variant === "maskable") {
        assert.equal(stats.plate, size * size, "maskable icons carry the white plate");
      } else {
        assert.equal(png.data[3], 0, "the `any` icon keeps its transparent corner");
      }
    }
  });
});

test("the endpoint keeps its old fallbacks", { skip: !handleBrandIcon && "esbuild unavailable" }, async () => {
  // 1 · no custom logo (the shipped relative default) → 308 to the static icon.
  await withBranding("/icons/icon-512x512.png", async () => {
    const res = fakeRes();
    await handleBrandIcon({ method: "GET", query: { size: "512" } }, res);
    assert.equal(res.statusCode, 308);
    assert.equal(res.headers.location, "/icons/icon-512x512.png");
    assert.match(res.headers["cache-control"], /max-age=300/);
  });

  // 2 · the upstream logo is unreachable → 308 rather than a broken icon.
  await withBranding("https://cdn.example/brand/logo.png", async () => {
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    const res = fakeRes();
    await handleBrandIcon({ method: "GET", query: { size: "512", maskable: "1" } }, res);
    assert.equal(res.statusCode, 308);
    assert.equal(res.headers.location, "/icons/maskable-icon-512x512.png");
  });

  // 3 · the upstream file is not an image (a release PAGE, an HTML error page)
  //     → 308, never a broken <img>.
  await withBranding("https://cdn.example/brand/logo.png", async () => {
    globalThis.fetch = async () => new Response("<html>nope</html>", { status: 200, headers: { "content-type": "text/html" } });
    const res = fakeRes();
    await handleBrandIcon({ method: "GET", query: { size: "512" } }, res);
    assert.equal(res.statusCode, 308);
    assert.equal(res.headers.location, "/icons/icon-512x512.png");
  });

  // 4 · a corrupt image that passes the content-type check (sharp cannot decode
  //     it) is served as-is with a short TTL — a 500 is never the answer.
  await withBranding("https://cdn.example/brand/logo.png", async () => {
    globalThis.fetch = async () =>
      new Response(Buffer.from("not really a png"), { status: 200, headers: { "content-type": "image/png" } });
    const res = fakeRes();
    await handleBrandIcon({ method: "GET", query: { size: "192" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "image/png");
    assert.match(res.headers["cache-control"], /max-age=0, s-maxage=60, must-revalidate/);
    assert.equal(res.body.toString(), "not really a png");
  });
});
