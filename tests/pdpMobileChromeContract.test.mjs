// Mobile PDP contract: readable plain sections, one primary action, a bounded
// details switcher, the pinned gallery material, and the unchanged 44px dock.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const pdp = read("src/PdpApp.tsx");
const css = read("src/glass.css");
const indexCss = read("src/index.css");
const dock = read("src/components/glass-dock/GlassDock.tsx");

/* ------------------------------------------------------------------ */
/* 1. The product page wears the plate                                */
/* ------------------------------------------------------------------ */

test("the actual gallery keeps its pinned glass settings; copy is not nested in cards", () => {
  assert.match(pdp, /<GlassSurface radius=\{24\} tint=\{0\.25\} blur=\{0\} className="dc-scene-plate group relative overflow-hidden"/);
  assert.equal(pdp.match(/tint=\{0\.25\}/g)?.length, 1);
  assert.equal(pdp.match(/blur=\{0\}/g)?.length, 1);
  assert.match(pdp, /<dl data-pdp-meta/);
  assert.match(pdp, /<section data-pdp-price-box/);
  assert.match(pdp, /<section data-pdp-details/);
  assert.match(pdp, /<section data-pdp-reviews/);
  assert.doesNotMatch(pdp, /<GlassSurface[^>]*data-pdp-(meta|details|reviews|price-box|related)/);
});

test("the product page removes decorative badges and duplicate thumb purchase controls", () => {
  assert.doesNotMatch(pdp, /Live catalog|EmojiBurst|data-pdp-thumb-bar|data-pdp-thumb-checkout|Build your purchase/);
  assert.match(pdp, /hasPurchaseBuilder \? \([\s\S]*?<PdpPurchaseBuilder\s+compact[\s\S]*?\) : \(/);
  assert.match(pdp, /aria-label="View product image fullscreen"/);
  assert.match(pdp, /data-pdp-tabbar className="dc-pdp-tabs"/);
});

test("desktop breadcrumbs survive and plain product copy has a readable backing", () => {
  const minimalCss = read("src/pdp-minimal.css");
  assert.match(pdp, /<nav aria-label="Breadcrumb" data-pdp-loose className="dc-scene-ink hidden[^"]*sm:flex"/);
  assert.match(minimalCss, /\[data-pdp-root\] \{[\s\S]*?background: rgba\(10, 14, 24, 0\.96\)/);
  assert.match(minimalCss, /\.dc-pdp-description \{[^}]*color: #d0d7e3/);
  assert.match(css, /:where\(\.dc-scene-plate\) \{\s*\n\s*--dc-ink-1: rgba\(255, 255, 255, 0\.97\);/);
});

test("only gallery thumbs need drag scrolling; detail choices are bounded buttons", () => {
  assert.match(pdp, /import \{ useDragScroll \} from "@\/hooks\/useDragScroll";/);
  assert.equal(pdp.match(/useDragScroll<HTMLDivElement>\(\)/g)?.length, 1);
  assert.match(pdp, /<div data-pdp-thumbs ref=\{thumbs\.ref\} onPointerDown=\{thumbs\.onPointerDown\}/);
  assert.match(pdp, /aria-pressed=\{tab === item\.value\} onClick=\{\(\) => onTab\(item\.value\)\}/);
  assert.doesNotMatch(pdp, /tabStrip|GlassToggleGroup/);
  assert.match(read("src/pdp-minimal.css"), /\.dc-pdp-tabs \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
});

/* ------------------------------------------------------------------ */
/* 3. The footer fits a 320px phone without shrinking its targets     */
/* ------------------------------------------------------------------ */

test("the dock's narrow-phone fit tightens the rhythm, not the tap targets", () => {
  const block = /@media \(max-width: 380px\) \{\s*\n\s*\[data-site-footer-nav\]:has\(\[data-glass-dock\]\) \{\s*\n\s*padding-inline: 8px;\s*\n\s*\}\s*\n\s*\n\s*\[data-glass-dock\] \{\s*\n\s*gap: 4px;\s*\n\s*padding-inline: 8px;\s*\n\s*\}\s*\n\}/.exec(indexCss);
  assert.ok(block, "expected the narrow-phone dock rule in index.css");

  // The arithmetic the rule exists for, computed from the dock's real constants.
  const tabs = 6;
  const target = Number(/const ICON_SIZE = (\d+)/.exec(dock)[1]);
  assert.equal(target, 44, "ICON_SIZE must stay a 44px tap target");
  const at = (gap, panelPad, navPad) => tabs * target + (tabs - 1) * gap + 2 * panelPad + 2 * navPad;
  assert.equal(at(8, 16, 12), 360, "the published rhythm needs exactly a 360px phone");
  assert.ok(at(4, 8, 8) <= 320, `the tightened rhythm needs ${at(4, 8, 8)}px — it must fit a 320px handset`);

  // The block touches the rhythm and nothing else: no box size, no height (the
  // measured `--dc-footer-nav-h` clearance depends on the dock's real height).
  const body = block[0].slice(block[0].indexOf(") {") + 3); // past `max-width: 380px`
  assert.doesNotMatch(body, /width|height|scale|padding-block|transform/);
  // And the dock still opts out of max-width, so the magnification spring is
  // never frozen — which is also why nothing clips the row.
  assert.match(indexCss, /\[data-glass-dock\],\s*\n\[data-glass-dock\] \*\s*\{\s*\n\s*max-width: none !important;/);
});

test("the dock's mobile clearance and safe-area gutter are still in place", () => {
  assert.match(indexCss, /--dc-footer-nav-h: 0px;/);
  assert.match(indexCss, /height: var\(--dc-footer-nav-h, 0px\);/);
  // The gutter lives on the shared footer wrapper every screen renders now.
  assert.match(read("src/components/BottomNav.tsx"), /<SiteFooterNav/);
  assert.match(read("src/components/SiteFooterNav.tsx"), /pb-\[max\(env\(safe-area-inset-bottom\),10px\)\]/);
  // The product page clears the dock without adding a second checkout CTA.
  assert.match(read("src/pdp-minimal.css"), /padding-bottom: calc\(1\.5rem \+ var\(--dc-footer-nav-h, 0px\)/);
  assert.doesNotMatch(pdp, /data-pdp-thumb-checkout/);
});

/* ------------------------------------------------------------------ */
/* 4. Nothing frozen moved, and the hooks other tests measure survive */
/* ------------------------------------------------------------------ */

test("the dock's files stay byte-comparable and the pinned hooks survive", () => {
  assert.doesNotMatch(dock, /dc-scene-(plate|ink|field)/);
  assert.doesNotMatch(read("src/components/glass-dock/GlassMaterial.tsx"), /dc-scene-(plate|ink|field)/);
  assert.doesNotMatch(read("src/components/BottomNav.tsx"), /dc-scene-(plate|ink|field)/);
  for (const hook of [
    "data-pdp-curriculum",
    "data-pdp-curriculum-mode",
    "data-pdp-curriculum-module",
    "data-pdp-curriculum-upgrade-hint",
    "data-pdp-hero-img",
    "data-pdp-scroll",
    "data-pdp-body",
    "data-pdp-gallery",
  ]) {
    assert.ok(pdp.includes(hook), `PDP must keep ${hook}`);
  }
  // The material is still CSS behind the gate, never painted from index.css.
  assert.doesNotMatch(indexCss, /dc-scene-plate/);
});
