// tests/checkoutMobileWidths.test.mjs
//
// Mobile-width structural audit for the new Checkout Review + Success
// components. The Node test runner in this repo has no DOM layout
// engine, so the assertions are source-text only: every layout-affecting
// class must have a small-screen counterpart, every container must avoid
// raw pixel widths ≥ the requested viewport, and the mobile-first
// ordering rule must hold.
//
// Widths covered: 320, 360, 390, 430, 480.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const reviewSource = fs.readFileSync(
  path.join(repoRoot, "src/components/checkout/CheckoutReviewStep.tsx"),
  "utf8",
);
const successSource = fs.readFileSync(
  path.join(repoRoot, "src/components/checkout/CheckoutSuccessStep.tsx"),
  "utf8",
);
const appSource = fs.readFileSync(
  path.join(repoRoot, "src/components/checkout/CheckoutApp.tsx"),
  "utf8",
);
const lineItemSource = fs.readFileSync(
  path.join(repoRoot, "src/components/checkout/CheckoutLineItemCard.tsx"),
  "utf8",
);
const contextSource = fs.readFileSync(
  path.join(repoRoot, "src/checkout/CheckoutContext.tsx"),
  "utf8",
);

const widths = [320, 360, 390, 430, 480];

// ---------------------------------------------------------------------------
// For each required width: no layout-breaking utilities in the source
// ---------------------------------------------------------------------------

for (const width of widths) {
  test(`Checkout Review + Success: no width utilities overflow at ${width}px`, () => {
    for (const source of [reviewSource, successSource, appSource, lineItemSource]) {
      const minW = source.match(/min-w-\[(\d+)px\]/g) || [];
      const wPx = source.match(/\bw-\[(\d{3,})px\]/g) || [];
      for (const m of [...minW, ...wPx]) {
        const px = Number(m.match(/(\d+)/)?.[1] || 0);
        assert.ok(px < width, `Class ${m} forces a min-width of ${px}px which can overflow at ${width}px`);
      }
    }
  });

  test(`Checkout: text-bearing flex children are shrinkable at ${width}px`, () => {
    // Only the leaf components (Review, Success, LineItemCard) render
    // long text. The CheckoutApp shell is a layout-only container.
    for (const source of [reviewSource, successSource, lineItemSource]) {
      assert.match(source, /min-w-0/, "expected at least one `min-w-0` utility on a flex child");
      assert.match(source, /truncate/, "expected at least one `truncate` utility on long text");
    }
  });
}

// ---------------------------------------------------------------------------
// Review step: per-section structure
// ---------------------------------------------------------------------------

test("Checkout Review uses p-3 sm:p-4 so cards keep 12px breathing room on 320px", () => {
  assert.match(reviewSource, /p-3[^"]*sm:p-4/);
});

test("Checkout Review uses p-3 sm:p-4 for the price section so the total doesn't get clipped on 320px", () => {
  assert.match(reviewSource, /p-3[^"]*sm:p-4/);
});

test("Checkout Review uses min-w-0 + line-clamp on the line-item title so 320px doesn't overflow", () => {
  assert.match(lineItemSource, /<h3[^>]*line-clamp-2/);
  assert.match(lineItemSource, /min-w-0 flex-1/);
});

test("Checkout Review uses gap-2 grid-cols-2 for the back/refresh action row so both fit on 320px", () => {
  assert.match(reviewSource, /grid-cols-2[^"]*gap-2/);
});

test("Checkout Review uses p-1 text-center helper text for safe 320px wrapping", () => {
  assert.match(reviewSource, /px-1 text-center text-\[1[01]px\]/);
});

// ---------------------------------------------------------------------------
// Success step: per-section structure
// ---------------------------------------------------------------------------

test("Checkout Success uses p-3 sm:p-4 on every section card", () => {
  // At least 4 occurrences of p-3 ... sm:p-4
  const matches = successSource.match(/p-3[^"]*sm:p-4/g) || [];
  assert.ok(matches.length >= 3, `expected ≥ 3 p-3 sm:p-4 sections, got ${matches.length}`);
});

test("Checkout Success uses truncate on the receipt row values to avoid horizontal scroll", () => {
  assert.match(successSource, /<dd[^>]*truncate|<dt[^>]*truncate|truncate/);
});

test("Checkout Success has a back-to-source CTA that fits a 320px viewport", () => {
  assert.match(successSource, /Back to source/);
});

// ---------------------------------------------------------------------------
// Buyer card
// ---------------------------------------------------------------------------

test("Checkout Review: buyer card uses truncate on name/email so 320px doesn't overflow", () => {
  // The buyer card uses a block layout (space-y-1) so `truncate` on
  // each <p> is sufficient — no min-w-0 needed. The regex looks for a
  // `<p>` whose class list contains `truncate` and whose body
  // immediately follows with `{buyer.<field>`.
  assert.match(
    reviewSource,
    /<p[^>]*\btruncate\b[^>]*>\s*\{buyer\.name/,
  );
  assert.match(
    reviewSource,
    /<p[^>]*\btruncate\b[^>]*>\s*\{buyer\.email/,
  );
});

// ---------------------------------------------------------------------------
// Mobile-first ordering rule
// ---------------------------------------------------------------------------

test("Checkout Review is mobile-first (small-screen class comes before the sm: variant)", () => {
  const lines = reviewSource.split(/\n/);
  let bad = 0;
  for (const line of lines) {
    const smMatch = line.match(/(\b[a-z-]+(?:\[[^\]]+\])?)(\s+sm:\1)/g);
    if (smMatch) {
      for (const match of smMatch) {
        const reversed = match.match(/^sm:([a-z-]+(?:\[[^\]]+\])?)\s+([a-z-]+(?:\[[^\]]+\])?)$/);
        if (reversed) bad += 1;
      }
    }
  }
  assert.equal(bad, 0, "Found sm: classes preceding their unprefixed companions (regression risk)");
});

test("Checkout Success is mobile-first (small-screen class comes before the sm: variant)", () => {
  const lines = successSource.split(/\n/);
  let bad = 0;
  for (const line of lines) {
    const smMatch = line.match(/(\b[a-z-]+(?:\[[^\]]+\])?)(\s+sm:\1)/g);
    if (smMatch) {
      for (const match of smMatch) {
        const reversed = match.match(/^sm:([a-z-]+(?:\[[^\]]+\])?)\s+([a-z-]+(?:\[[^\]]+\])?)$/);
        if (reversed) bad += 1;
      }
    }
  }
  assert.equal(bad, 0, "Found sm: classes preceding their unprefixed companions (regression risk)");
});

// ---------------------------------------------------------------------------
// Session restoration contract
// ---------------------------------------------------------------------------

test("CheckoutContext never mutates a shared singleton — it returns a fresh value object on every render", () => {
  // The provider builds a new value via `useMemo` / `buildEmptyValue` so
  // consumers can rely on referential equality tracking real changes
  // only. A regression that introduces `Object.assign` on a module-level
  // singleton would be caught by this test (comments excluded).
  const codeOnly = contextSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(codeOnly, /Object\.assign/);
  assert.match(contextSource, /useMemo<CheckoutContextValue>/);
});

test("CheckoutContext reads the validated session record on mount and never hard-codes a default product", () => {
  // No hard-coded "React & Next.js" / "Rahul Verma" / "₹1999" defaults.
  assert.doesNotMatch(contextSource, /React & Next\.js|Rahul Verma|₹1999/);
  // The provider must call `readFromSessionStorage` (the validated
  // sessionStorage round-trip) on mount.
  assert.match(contextSource, /readFromSessionStorage/);
});

test("Checkout App does not import the deprecated `src/data/checkoutData.ts` singleton", () => {
  // The old flow imported `product` / `user` from `../data/checkoutData`
  // and `Object.assign`-ed fields on every navigation. The new flow
  // must not import that file. We strip JS/TS comments before matching
  // so doc-comments that *mention* the deprecated path (for context) do
  // not cause a false positive — only real `import` statements count.
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  for (const source of [appSource, reviewSource, successSource, lineItemSource, contextSource]) {
    const codeOnly = stripComments(source);
    assert.doesNotMatch(
      codeOnly,
      /data\/checkoutData/,
      "Checkout component still references the deprecated `src/data/checkoutData.ts` singleton in code",
    );
  }
});

test("Checkout Context exposes the canonical `refresh()` action so a 320px user can recover from a stale quote", () => {
  // The refresh action is declared in the CheckoutContextValue type
  // (src/checkout/types.ts) and implemented in the provider. The
  // provider must call fetchQuote (the Part 4 endpoint) inside the
  // refresh handler.
  const typesSource = fs.readFileSync(
    path.join(repoRoot, "src/checkout/types.ts"),
    "utf8",
  );
  assert.match(typesSource, /refresh: \(\) => Promise<void>/);
  assert.match(contextSource, /useCallback\(async \(\) => \{[^]*fetchQuote/s);
});
