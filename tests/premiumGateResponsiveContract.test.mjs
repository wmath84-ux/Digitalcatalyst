// tests/premiumGateResponsiveContract.test.mjs
//
// Contract for the responsive redesign of the premium subscription gate
// (the same component is used by both My Day and Revision).
//
// User-visible requirements being pinned here:
//   (1) The close (X) button must be INSIDE the card, not floating
//       outside it. There must be no "page ke bahar" cross button.
//   (2) The card must be readable on every viewport: 320 px (smallest
//       phone) up to a 27" desktop. The same component is reused for
//       My Day and Revision, so the contract is single-source.
//   (3) The hero / offer block typography must be top-tier — a tier
//       comparison row, a hero gradient headline, social-proof, a
//       single dominant CTA. NOT a flat single-button coupon.
//   (4) Two render modes: modal (overlay) and asPage (legacy lock
//       screen). Both must keep the same redesign.
//   (5) Perks list adapts fluidly; no fixed h-10 w-10 icons that
//       overgrow on desktop or vanish on a small phone.
//
// Static contract: we read the source. Run by `node --test tests/`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(
  "src/components/subscription/PremiumGate.tsx",
  "utf8",
);
const css = fs.readFileSync("src/index.css", "utf8");
const myDay = fs.readFileSync("src/MyDayApp.tsx", "utf8");
const revision = fs.readFileSync("src/revision/RevisionApp.tsx", "utf8");

// ---------------------------------------------------------------------------
// 1. Close button must be INSIDE the card
// ---------------------------------------------------------------------------

test("the close (X) button is inside the card frame, not outside", () => {
  // The component MUST render a [data-premium-gate-close] hook. The
  // pre-redesign code rendered the X as a sibling after the card
  // (rendered with `data-premium-gate-close` and a separate gradient
  // capsule); both must live inside `data-premium-gate` now.
  assert.match(
    src,
    /data-premium-gate/,
    "the gate must keep its data-premium-gate root attribute",
  );
  assert.match(
    src,
    /data-premium-gate-close/,
    "the close (X) must carry a data-premium-gate-close test hook",
  );

  // The data-premium-gate-close button must be inside the data-premium-gate
  // root. We assert that by ensuring the close button appears AFTER
  // the data-premium-gate root opens and BEFORE the closing fragment.
  const rootOpen = src.indexOf("data-premium-gate");
  const closeOpen = src.indexOf("data-premium-gate-close");
  assert.ok(rootOpen > -1, "data-premium-gate root must exist");
  assert.ok(closeOpen > -1, "data-premium-gate-close must exist");
  assert.ok(
    closeOpen > rootOpen,
    "close button must be declared inside the data-premium-gate root",
  );

  // The button is rendered as part of GateContent (the shared body for
  // both modes), NOT as a separate element after the card. The old
  // structure had a standalone circular gradient button placed in the
  // modal wrapper outside the sheet div.
  //
  // Pin: the [data-premium-gate-close] appears within a <button> with
  // dc-premium-close class (i.e. part of the card chrome) and is NOT
  // inside a separate "backdrop" sibling.
  assert.match(
    src,
    /data-premium-gate-close[\s\S]{0,400}className="dc-premium-close/,
    "the close button must use the .dc-premium-close class family so it lives inside the card",
  );
});

test("the X button has an aria-label and is a real <button>", () => {
  // A real button is required so keyboard users can reach it.
  assert.match(
    src,
    /<button[\s\S]{0,400}data-premium-gate-close[\s\S]{0,400}<\/button>/,
    "the X must be a real <button> element",
  );
  assert.match(
    src,
    /aria-label="Close subscription gate"/,
    "the X must carry an aria-label",
  );
});

// ---------------------------------------------------------------------------
// 2. Responsive / fluid sizing
// ---------------------------------------------------------------------------

test("the gate uses CSS clamp() for fluid type and sizing on every breakpoint", () => {
  // The user explicitly said "sab jagah acche se dekhen screen size ke
  // according Chhota bada hokar dikhe" — i.e. fluid scaling, not
  // hard breakpoints. The component must use clamp() for at least the
  // headline, body text, the perk-icon size and the card padding.
  assert.match(
    src,
    /clamp\([^)]+\)/,
    "the gate must use CSS clamp() for fluid scaling",
  );
  // Headline uses clamp()
  assert.match(
    src,
    /text-\[clamp\([^)]+\)\][^"]*font-black/,
    "the hero headline must scale via clamp()",
  );
  // Perks icon uses clamp()
  assert.match(
    src,
    /h-\[clamp\([^)]+\)\][^"]*w-\[clamp\([^)]+\)\][^"]*shrink-0/,
    "the perk-icon size must scale via clamp()",
  );
  // The card never sets a hardcoded width on the inner card itself
  // (the modal column is width: min(100vw, 640px), so a 27" monitor
  // still gets a comfortable 640 px card, not a 1600 px slab).
  assert.match(
    src,
    /min\(100vw,\s*640px\)/,
    "the modal card must cap itself at min(100vw, 640px) so it never overgrows on desktop",
  );
});

test("the gate never uses the old fixed h-10 w-10 perk icon size", () => {
  // Pre-redesign: every perk row rendered a fixed h-10 w-10 (40 px)
  // icon. That was either too big on a 7" tablet portrait or lost
  // inside the row on desktop. The contract requires the icon to be
  // clamp()-driven.
  assert.doesNotMatch(
    src,
    /h-10 w-10[^"]*"/,
    "perk icon must not be a fixed h-10 w-10",
  );
});

test("the gate keeps the responsive data-premium-gate-modal hook for modal mode", () => {
  // Modal mode needs its own hook so the contract can pin that:
  //  - the modal mounts a centred card (sm:items-center)
  //  - mobile uses items-end (bottom-sheet)
  //  - the inner card width is fluid (width: min(100vw, 640px))
  assert.match(src, /data-premium-gate-modal/);
  assert.match(
    src,
    /sm:items-center/,
    "the modal must switch from bottom sheet (mobile) to centred card (>= sm)",
  );
});

test("the gate renders a single dominant gradient CTA (not a flat coupon)", () => {
  // Top-tier design requires: ONE primary CTA that fills the width,
  // tier comparison, social-proof / value-prop block, and a single
  // gradient headline.
  assert.match(
    src,
    /data-premium-gate-cta/,
    "the CTA must carry a data-premium-gate-cta hook for the contract",
  );
  assert.match(
    src,
    /className="dc-premium-cta[^"]*"/,
    "the CTA must use the .dc-premium-cta class",
  );
  // Tier rows
  assert.match(
    src,
    /id: "monthly"[\s\S]{0,200}id: "yearly"/,
    "the offer must render a tier comparison with monthly and yearly rows",
  );
  // Save badge on the yearly tier
  assert.match(
    src,
    /Save 37%/,
    "the yearly tier must surface a Save 37% (or similar) value badge",
  );
  // Hero gradient headline in the offer block
  assert.match(
    src,
    /bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text/,
    "the hero headline must use the brand gradient text treatment",
  );
});

// ---------------------------------------------------------------------------
// 3. AsPage mode: full-screen flex-1, not a centred card
// ---------------------------------------------------------------------------

test("asPage mode renders a full-screen scroll, not a modal", () => {
  // The legacy lock-screen variant stays available for callers that
  // want it. The card's class set must include min-h-0 flex-1 so the
  // page scrolls inside its parent column.
  assert.match(
    src,
    /asPage\s*\?\s*"dc-premium-page[^"]*min-h-0[^"]*flex-1/,
    "asPage must keep its full-screen flex-1 behaviour",
  );
  // And it must NOT also render the modal backdrop (otherwise
  // asPage+open would layer the modal OVER the page variant).
  // We assert by the conditional: when asPage is true, the modal
  // branch is not returned.
  assert.match(
    src,
    /if \(asPage\)[\s\S]{0,200}return[\s\S]{0,40}<GateContent/,
    "asPage must return GateContent without the modal wrapper",
  );
});

// ---------------------------------------------------------------------------
// 4. Both My Day and Revision use the redesigned gate identically
// ---------------------------------------------------------------------------

test("My Day imports and renders the redesigned premium gate", () => {
  assert.match(myDay, /import\s+PremiumGate\s+from\s+["']\.?\.?\/components\/subscription\/PremiumGate["']/);
  assert.match(myDay, /<PremiumGate[\s\S]{0,200}variant="myday"/);
  // Multi-line JSX: closing tag is indented, not flush.
  assert.match(myDay, /<PremiumGate[\s\S]{0,800}\/>\s*\n\s*<Toast/);
});

test("Revision imports and renders the redesigned premium gate", () => {
  assert.match(revision, /import\s+PremiumGate\s+from\s+["']\.?\.?\/components\/subscription\/PremiumGate["']/);
  assert.match(revision, /<PremiumGate[\s\S]{0,200}variant="revision"/);
  // Multi-line JSX: closing tag is indented, not flush.
  assert.match(revision, /<PremiumGate[\s\S]{0,800}\/>/);
});

// ---------------------------------------------------------------------------
// 5. Both gates are dismissible (the "Maybe later" path stays)
// ---------------------------------------------------------------------------

test("the gate keeps a dismissible secondary action so the user is never locked out", () => {
  // Modal mode must keep "Maybe later" so the learner can browse
  // without subscribing. The page variant keeps "Go back to Home" so
  // a hard block still has a way back.
  assert.match(src, /Maybe later/);
  assert.match(src, /Go back to Home/);
});

// ---------------------------------------------------------------------------
// 6. CSS layer: the gate has the right class hooks
// ---------------------------------------------------------------------------

test("CSS exposes the dc-premium-* class family for the redesigned gate", () => {
  // The card, modal inner column, perk row, close button and CTA all
  // need their class names defined in CSS for hover/focus/animations
  // to attach. The class names referenced from JSX must exist in
  // index.css.
  const requiredClasses = [
    "dc-premium-page",
    "dc-premium-sheet",
    "dc-premium-modal",
    "dc-premium-modal-inner",
    "dc-premium-perk",
    "dc-premium-close",
    "dc-premium-cta",
    "dc-premium-offer",
  ];
  for (const cls of requiredClasses) {
    assert.match(
      css,
      new RegExp(`\\.${cls}`),
      `CSS must define the .${cls} class for the redesigned gate`,
    );
  }
});

test("the modal pinned at min(100vw, 640px) is enforced in CSS too", () => {
  // JSX uses [width:min(100vw,640px)] but Tailwind arbitrary values
  // sometimes get minified by the build. The CSS layer pins the
  // value too, which means tests catch any regression.
  assert.match(
    css,
    /\.dc-premium-modal-inner\s*\{[^}]*min\(100vw,\s*640px\)/,
    "the modal inner column must use min(100vw, 640px) in CSS",
  );
});

test("the close button focus ring + hover affordances live in CSS", () => {
  // A11y: the close button must be keyboard-focusable. The contract
  // pins a :focus-visible rule and a hover micro-interaction so the
  // button reads as a button, not a decoration.
  assert.match(
    css,
    /\.dc-premium-close:focus-visible/,
    "the close button must have a :focus-visible rule for keyboard a11y",
  );
  // The hover affordance lives in the JSX className (hover:scale-110);
  // we just pin that the JSX carries it so a regression where the
  // hover behaviour is dropped fails the contract.
  assert.match(
    src,
    /dc-premium-close[^"]*hover:scale/,
    "the close button JSX must include a hover:scale affordance",
  );
});

// ---------------------------------------------------------------------------
// 7. Reduced-motion: animations must be opt-outable
// ---------------------------------------------------------------------------

test("premium gate animations respect prefers-reduced-motion", () => {
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,300}dc-premium-(page|sheet)/,
    "the gate's entrance animation must be suppressed under prefers-reduced-motion",
  );
});
