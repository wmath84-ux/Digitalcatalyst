// tests/profileRevisionGlassContract.test.mjs
//
// OWNER BRIEF (2026-09-29):
//
//   "Revision ki progress page per maine dekha ki jo card ka background,
//    blur, frost, tint etc. aur jo usper likhi text hai — unke koi shadow
//    bhi nahin hai, lekin text bhi aur saari cheezen properly dikh rahi
//    hain. Kya tum exactly vahi setting sensitivity apply kar sakte ho
//    profile page ke sabhi cards per?"
//
// The Revision Progress page's cards wear ONE material: `.dc-rev-glass`
// (src/revision-glass.css) — frost blur 18.4px + saturate 1.3, flat
// rgba(173,216,255,0.26) tint, a quiet 14%/6% sheen, inset hairline rim, and
// a single soft lift. No text scrim, no per-card shadows — the copy reads on
// the material alone. The profile page's cards wore the older store-glass
// treatment PLUS the `.dc-scene-ink` dark text scrim; they now wear the EXACT
// same `.dc-rev-glass` material — same file, same tokens, zero drift.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const PROFILE_FILES = [
  "src/profile/ProfileLayout.tsx",
  "src/profile/ProfilePreview.tsx",
];

test("every profile card wears the Revision card material (dc-rev-glass)", () => {
  const layout = read(PROFILE_FILES[0]);
  const preview = read(PROFILE_FILES[1]);
  for (const file of PROFILE_FILES) {
    const src = read(file);
    assert.ok(
      src.includes("dc-rev-glass"),
      `${file}: no card carries the revision glass material`,
    );
    // The old store treatment AND the text scrim are fully gone — the brief
    // is the Progress page's exact setting, and that page has no scrim.
    assert.doesNotMatch(src, /dc-store-glass/, `${file}: store glass left`);
    assert.doesNotMatch(src, /dc-scene-ink/, `${file}: text scrim left`);
  }
  // The hero, membership, upgrade, referral, library, preferences, renewal
  // and quick-stat cards are all GlassCards — count the CLASS USAGE (a
  // leading quote), not the doc comment: ProfileLayout 9 + ProfilePreview 2
  // = 11 card surfaces, every one converted.
  const countClass = (src) => (src.match(/"dc-rev-glass/g) || []).length;
  const total = countClass(layout) + countClass(preview);
  assert.equal(total, 11, `expected 11 converted card surfaces, found ${total}`);
});

test("the shared material still comes from ONE file — revision-glass.css", () => {
  // Frost / tint / sheen / rim / lift are the revision page's own rules; the
  // profile contributes nothing of its own, so the two pages can never drift.
  const css = read("src/revision-glass.css");
  assert.match(css, /\.dc-rev-glass\) > div\[aria-hidden\]:nth-of-type\(1\)/, "frost rule");
  assert.match(css, /--dc-store-glass-blur/, "the pinned 18.4px frost token");
  assert.match(css, /--dc-store-glass-tint/, "the pinned 26% light-blue tint token");
  assert.match(css, /nth-of-type\(4\)/, "the rim rule");
  assert.match(css, /0 14px 34px -18px rgba\(2, 6, 16, 0\.85\)/, "the single soft lift");
  // And it is loaded in the app entry, after glass.css / store-glass.css.
  const main = read("src/main.tsx");
  assert.match(main, /import "\.\/revision-glass\.css"/);
});

test("the glass kill switch still covers the profile cards", () => {
  // `?glass=off` (and WebViews without backdrop-filter) get the navy plate
  // fallback from the same file — the profile keeps a readable card when the
  // lens is off, exactly like every revision page.
  const css = read("src/revision-glass.css");
  assert.match(css, /html\[data-glass="off"\] :where\(\.dc-rev-glass\)/);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
});
