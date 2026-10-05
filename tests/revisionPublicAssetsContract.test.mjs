import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── Revision / Recall PNG reliability contract ───────────────────────────
// The Revision incident: small PNGs were referenced at runtime but the files
// never existed in `public/`, so browsers painted broken-image boxes in some
// environments while committed assets (`/icons/*`, `/images/*`) worked. This
// contract pins BOTH halves of the fix:
//
//   1. every `publicAssetUrl("<path>")` call in `src/` must point at a file
//      that actually exists under `public/` (no more dangling references);
//   2. the Recall surfaces resolve their brand mark through the shared
//      resolver instead of string-concatenating `import.meta.env.BASE_URL`
//      onto a file name;
//   3. the lumen sample images no longer hard-code a leading-slash path that
//      breaks under a non-root BASE_URL (Netlify sub-path / Capacitor).

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = path.join(ROOT, "src");
const PUBLIC = path.join(ROOT, "public");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const source = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

// Collect every publicAssetUrl("...") reference.
const referenced = [];
for (const [file, text] of source) {
  for (const match of text.matchAll(/publicAssetUrl\(\s*["'`]([^"'`]+)["'`]/g)) {
    referenced.push({ file, rel: match[1] });
  }
}

test("every publicAssetUrl reference resolves to a committed public file", () => {
  assert.ok(referenced.length > 0, "expected at least one publicAssetUrl reference");
  for (const { file, rel } of referenced) {
    const clean = rel.replace(/^\/+/, "");
    const target = path.join(PUBLIC, clean);
    assert.ok(
      fs.existsSync(target),
      `${path.relative(ROOT, file)} references "${rel}" but ${path.relative(ROOT, target)} does not exist`,
    );
  }
});

test("the Recall brand mark is a real committed asset resolved by the shared resolver", () => {
  const pub = fs.readFileSync(path.join(SRC, "utils/publicAsset.ts"), "utf8");
  const match = pub.match(/REVISION_BRAND_MARK\s*=\s*["'`]([^"'`]+)["'`]/);
  assert.ok(match, "REVISION_BRAND_MARK constant must exist");
  assert.ok(fs.existsSync(path.join(PUBLIC, match[1])), `brand mark ${match[1]} missing from public/`);

  const logo = fs.readFileSync(path.join(SRC, "revision/recall/components/recall-logo.tsx"), "utf8");
  const mascot = fs.readFileSync(path.join(SRC, "revision/recall/components/mascot.tsx"), "utf8");
  // Both surfaces resolve through the shared resolver, not BASE_URL concat.
  assert.match(logo, /revisionBrandMarkUrl\(/);
  assert.match(mascot, /revisionBrandMarkUrl\(/);
  assert.doesNotMatch(logo, /import\.meta\.env\.BASE_URL\}/);
  assert.doesNotMatch(mascot, /import\.meta\.env\.BASE_URL\}/);
});

test("lumen sample images use the resolver, never a hard-coded leading slash", () => {
  for (const rel of ["src/lumen/lib/data.ts", "src/lumen/lib/engine.ts"]) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.doesNotMatch(text, /src:\s*"\/images\//, `${rel} must not hard-code /images/ paths`);
    assert.match(text, /publicAssetUrl\("\/images\//, `${rel} must resolve images via publicAssetUrl`);
  }
});
