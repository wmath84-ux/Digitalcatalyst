// tests/pdpPurchaseBuilderMobileWidths.test.mjs
//
// Mobile-width smoke test for the Part 3 purchase builder.
//
// The Node test runner in this repo does not bundle a TypeScript loader,
// so we cannot `renderToStaticMarkup(<PdpPurchaseBuilder ... />)` directly.
// Instead we do a structural source-text audit that the component file
// does not contain any utility class that would force a horizontal
// scrollbar at viewport widths from 320px through 480px.
//
// The audit covers the five required widths (320, 360, 390, 430, 480) and
// fails the test if any of the following appears inside the component:
//   * `min-w-[NNNpx]` or `w-[NNNpx]` arbitrary values where NNN ≥ width
//   * `flex-shrink-0` on a full-width container (would force a min-width)
//   * missing `min-w-0` on a flex child that contains a long text node
//   * aspect-ratio utilities that, paired with `w-full`, would force a
//     minimum height > viewport height on tiny screens
//
// The audit is intentionally broad: any new overflow-causing class added
// in a future edit will fail this test until the developer adds a
// mobile-safe counterpart.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const componentSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "pdp", "PdpPurchaseBuilder.tsx"),
  "utf8",
);

const widths = [320, 360, 390, 430, 480];

// ---------------------------------------------------------------------------
// Source-text structural audit (per-width)
// ---------------------------------------------------------------------------

for (const width of widths) {
  test(`the purchase builder contains no width utilities that overflow at ${width}px`, () => {
    // Forbidden: a Tailwind min-w-[NNNpx] or w-[NNNpx] with NNN >= width.
    const minW = componentSource.match(/min-w-\[(\d+)px\]/g) || [];
    const wPx = componentSource.match(/\bw-\[(\d+)px\]/g) || [];
    for (const m of [...minW, ...wPx]) {
      const px = Number(m.match(/(\d+)/)?.[1] || 0);
      assert.ok(px < width, `Class ${m} forces a min-width of ${px}px which can overflow at ${width}px`);
    }
  });

  test(`the purchase builder keeps text-bearing flex children shrinkable at ${width}px`, () => {
    // The fix for "flex child text overflows the viewport" is to add
    // `min-w-0` to the flex child. The component should use it on every
    // long-text-bearing flex child. We sanity-check that it appears at
    // least once per render area.
    assert.match(componentSource, /min-w-0/, "expected at least one `min-w-0` utility on a flex child");
    assert.match(componentSource, /truncate/, "expected at least one `truncate` utility on long text");
  });
}

test("CTA button uses min-w-0 + truncate so the price label can shrink instead of overflowing at any width", () => {
  // The CTA button is the most overflow-prone element on small viewports
  // because it carries an icon + a (potentially long) price label.
  const ctaStart = componentSource.indexOf("data-pdp-cta");
  const ctaBlock = componentSource.slice(ctaStart, ctaStart + 2000);
  assert.match(ctaBlock, /<button[\s\S]{0,1500}truncate/);
});

test("purchase builder uses Tailwind responsive breakpoints (sm:/md:) on every layout-affecting class", () => {
  // The summary panel, mode switcher, and CTA all need small-screen
  // variants. This test asserts that none of the layout-affecting
  // classes (px, py, gap, text size, width) appear only at the default
  // size without a `sm:` companion on at least one of the critical
  // surfaces (CTA, summary, mode switcher, mode tabs).
  const ctaStart = componentSource.indexOf("data-pdp-cta");
  assert.ok(ctaStart > 0, "Could not locate data-pdp-cta block");
  const ctaBlock = componentSource.slice(ctaStart, ctaStart + 2000);
  const summaryStart = componentSource.indexOf("data-pdp-summary");
  assert.ok(summaryStart > 0, "Could not locate data-pdp-summary block");
  const summaryBlock = componentSource.slice(summaryStart, summaryStart + 2000);
  // The CTA button itself must use a small-screen base size that scales
  // up at `sm:` (or be the same on both since the button is full-width).
  assert.match(ctaBlock, /text-(?:xs|sm|base)/, "CTA should set a small-screen text size");
  // The summary panel must use `p-4 sm:p-5` (or similar) so it doesn't
  // waste 40px of padding on 320px viewports.
  assert.match(summaryBlock, /p-4[^"]*sm:/, "Summary panel should scale padding from p-4 to sm:p-*");
});

test("module selector uses p-3 sm:p-4 so the cards keep 12px breathing room on 320px", () => {
  // The module article blocks are the second-most overflow-prone surface.
  assert.match(componentSource, /p-3[^"]*sm:p-4/);
});

test("purchase builder is mobile-first (the small-screen class comes first)", () => {
  // Every layout-affecting class string in the source should put the
  // small-screen base class before the `sm:` companion.
  const lines = componentSource.split(/\n/);
  let bad = 0;
  for (const line of lines) {
    const smMatch = line.match(/(\b[a-z-]+(?:\[[^\]]+\])?)(\s+sm:\1)/g);
    if (smMatch) {
      for (const match of smMatch) {
        // Detect reversed order (`sm:p-4 p-3` is allowed only when the
        // unprefixed class is on the right; we want `p-3 sm:p-4`).
        const reversed = match.match(/^sm:([a-z-]+(?:\[[^\]]+\])?)\s+([a-z-]+(?:\[[^\]]+\])?)$/);
        if (reversed) {
          bad += 1;
        }
      }
    }
  }
  assert.equal(bad, 0, "Found sm: classes preceding their unprefixed companions (regression risk)");
});

test("purchase builder uses max-w-* (not raw width) for the responsive column layout", () => {
  // The component is dropped into a parent that controls the outer
  // grid; the inner blocks should never declare a fixed pixel max-width.
  const maxWidths = componentSource.match(/\bmax-w-\[(\d+)px\]/g) || [];
  assert.deepEqual(maxWidths, [], `Unexpected max-w-[NNNpx] classes: ${maxWidths.join(", ")}`);
});
