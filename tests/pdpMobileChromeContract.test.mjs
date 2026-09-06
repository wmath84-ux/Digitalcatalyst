// tests/pdpMobileChromeContract.test.mjs
//
// Contract for the 2026-09-06 owner follow-up:
//
//   "Now optimise product detail page and footer navigation for mobile users."
//
// Two surfaces, one bug each.
//
// THE PRODUCT PAGE. Every surface on it asks for the pinned docs sensitivity
// (radius 24 · tint 0.25 · blur 0) — i.e. the pack's ~10% frost — and its two
// gallery badges, its sticky tab bar and the mobile thumb-zone CTA paint
// `--dc-chrome-glass`, the same 10% token. Over the fixed winter scene that is
// white ink on nothing, exactly what Home and the store had before the plate.
// The page also had two hidden-scrollbar rails (gallery thumbs, detail tabs)
// that a mouse could not move.
//
// THE FOOTER, FOR MOBILE. Six 44px tabs + five 8px gaps + the panel's 16px
// padding + the nav's 12px gutter = exactly 360px, the width of the most common
// phone, with zero slack. `[data-glass-dock]` opts out of `max-width` so the
// magnification spring is never frozen — which also means nothing clips it: on a
// 320px handset the first and last tab simply hang off-screen, untappable. The
// fix tightens the rhythm (gaps + paddings) and never the tap targets.
//
// Rules this contract holds the line on:
//   1. material stays CSS in src/glass.css behind `html[data-glass="on"]`, so
//      `?glass=off` restores the published material;
//   2. the pinned docs sensitivity in TS never moves to gain contrast;
//   3. every hook other contracts measure the page by survives
//      (`data-pdp-tabbar`, `rounded-t-[23px]`, `data-pdp-thumb-bar`,
//      `dc-thumb-bar`, `md:hidden`, `data-pdp-curriculum*`, `backdrop-blur-xl`);
//   4. the dock's own files stay byte-comparable, and its 44px target does not
//      shrink to make the row fit.
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

test("every pack surface on the product page takes the shared plate", () => {
  const surfaces = [
    /<GlassSurface radius=\{24\} tint=\{0\.25\} blur=\{0\} className="dc-scene-plate group relative overflow-hidden"/, // gallery
    /<GlassSurface data-pdp-meta radius=\{24\} tint=\{0\.25\} blur=\{0\} className="dc-scene-plate text-white\/85"/,
    /<GlassSurface data-pdp-upgrade-box radius=\{24\} tint=\{0\.25\} blur=\{0\} className="dc-scene-plate relative overflow-hidden text-white"/,
    /<GlassSurface radius=\{24\} tint=\{0\.25\} blur=\{0\} className="dc-scene-plate relative overflow-visible text-white"/, // buy box
    /<GlassSurface data-product-share radius=\{20\} className="dc-scene-plate absolute right-0 top-12/,
    /<GlassSurface radius=\{24\} tint=\{0\.25\} blur=\{0\} className="dc-scene-plate text-white" contentClassName="p-4">/, // coupon
    /<GlassSurface data-pdp-details radius=\{24\} tint=\{0\.25\} blur=\{0\} className="dc-scene-plate overflow-hidden text-white"/,
    /<GlassSurface data-pdp-reviews id="product-reviews" radius=\{24\} tint=\{0\.25\} blur=\{0\} className="dc-scene-plate scroll-mt-36 text-white"/,
    /<GlassSurface data-pdp-related radius=\{24\} className="dc-scene-plate text-white"/,
  ];
  for (const surface of surfaces) assert.match(pdp, surface, `missing plate: ${surface}`);
  // No surface on the page is left unplated.
  assert.doesNotMatch(pdp, /<GlassSurface (?![^>]*dc-scene-plate)/, "a GlassSurface on the PDP has no plate");
  // The pinned sensitivity is untouched — the plate is the fix, not a re-tune.
  assert.equal(pdp.match(/tint=\{0\.25\} blur=\{0\}/g).length, 7);
  assert.doesNotMatch(pdp, /tint=\{0\.[3-9]/);
});

test("the chrome-token pills, the stuck tab bar and the mobile CTA take the bar plate", () => {
  // The two gallery badges are plain divs painted with the 10% chrome token.
  assert.equal(
    pdp.match(/className="dc-scene-plate dc-scene-plate--bar absolute (?:left-3 top-3|bottom-3 right-3) flex|className="dc-scene-plate dc-scene-plate--bar absolute bottom-3 right-3 rounded-full/g)?.length,
    2,
    "both gallery badges are plated",
  );
  // The sticky tab bar is plated only in its stuck state, and its geometry —
  // which other contracts measure the scroll maths by — is untouched.
  assert.match(
    pdp,
    /\$\{tabBarStuck \? "dc-scene-plate dc-scene-plate--bar bg-\[var\(--dc-chrome-glass\)\]" : "rounded-t-\[23px\]"\}/,
  );
  assert.match(pdp, /data-pdp-tabbar/);
  assert.match(pdp, /sticky top-0 z-30 px-3 pb-2 pt-3 transition-shadow duration-200/);

  // The thumb-zone CTA is the mobile-only purchase bar (`md:hidden`) that parks
  // above the dock; `.dc-thumb-bar` paints the 10% token from a layer, which the
  // unlayered bar plate out-ranks.
  assert.match(pdp, /<div data-pdp-thumb-bar className="dc-scene-plate dc-scene-plate--bar dc-thumb-bar flex items-center gap-3 md:hidden">/);
  assert.match(indexCss, /\.dc-thumb-bar \{[\s\S]{0,240}?background: var\(--dc-chrome-glass\);/);
});

test("the copy that sits on the scene with no surface under it takes the scrim", () => {
  assert.match(pdp, /<nav data-pdp-loose className="dc-scene-ink flex flex-wrap items-center gap-1\.5 px-4 pt-4 text-\[11px\] text-white\/55">/);
  assert.match(pdp, /<h2 className="dc-scene-ink text-lg font-black dc-ink-1">Build your purchase<\/h2>/);
  assert.match(pdp, /<p className="dc-scene-ink text-xs dc-ink-3">/);
  assert.match(pdp, /<div className="dc-scene-ink rounded-2xl border border-amber-400\/30 bg-amber-500\/15/);
  // Labels INSIDE a plated card need nothing: the plate re-pins --dc-ink-3.
  assert.match(css, /:where\(\.dc-scene-plate\) \{\s*\n\s*--dc-ink-1: rgba\(255, 255, 255, 0\.97\);[\s\S]{0,120}?--dc-ink-3: rgba\(255, 255, 255, 0\.64\);/);
});

/* ------------------------------------------------------------------ */
/* 2. The two rails take the mouse drag                               */
/* ------------------------------------------------------------------ */

test("the gallery thumbs and the tab strip take the mouse drag", () => {
  assert.match(pdp, /import \{ useDragScroll \} from "@\/hooks\/useDragScroll";/);
  assert.equal(pdp.match(/useDragScroll<HTMLDivElement>\(\)/g)?.length, 2);
  assert.match(pdp, /<div data-pdp-thumbs ref=\{thumbs\.ref\} onPointerDown=\{thumbs\.onPointerDown\} className="flex gap-2 overflow-x-auto pb-1">/);
  assert.match(pdp, /<div ref=\{tabStrip\.ref\} onPointerDown=\{tabStrip\.onPointerDown\} className="flex overflow-x-auto/);
  // Both hooks are declared before any early return in their own component.
  const content = pdp.slice(pdp.indexOf("function PremiumProductContent"), pdp.indexOf("function DetailsCard"));
  assert.ok(content.indexOf("const thumbs = useDragScroll") < content.indexOf("if ("), "thumbs hook must precede the first early return");
  const details = pdp.slice(pdp.indexOf("function DetailsCard"), pdp.indexOf("function CurriculumModuleRow"));
  assert.ok(details.indexOf("const tabStrip = useDragScroll") < details.indexOf("return ("), "tabStrip hook must precede the render");
  // A thumb-sized target on the tab strip: `min-h-[38px]`, and the drag never
  // switches a tab (useDragScroll swallows the click a drag ends with).
  assert.match(pdp, /className="whitespace-nowrap px-3\.5 py-2 text-xs font-semibold min-h-\[38px\]"/);
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
  assert.match(read("src/components/BottomNav.tsx"), /pb-\[max\(env\(safe-area-inset-bottom\),10px\)\]/);
  // The mobile CTA parks above that measured height, never under the dock.
  assert.match(indexCss, /bottom: calc\(var\(--dc-footer-nav-h, 0px\) \+ 8px\);/);
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
    "backdrop-blur-xl",
  ]) {
    assert.ok(pdp.includes(hook), `PDP must keep ${hook}`);
  }
  // The material is still CSS behind the gate, never painted from index.css.
  assert.doesNotMatch(indexCss, /dc-scene-plate/);
});
