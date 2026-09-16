// tests/myDayTabletLayoutAndDecorContract.test.mjs
//
// Two reported defects on My Day, both pinned here:
//
//  1. SHRINKED ON A SMALL TABLET — the reminders page (and every other My Day
//     section) got NARROWER the moment the side rail appeared. The rail was a
//     224px panel from 768px up, inside the same flex row as the page column,
//     so the page had ~448px at 768px — narrower than the ~719px it had at
//     767px, and narrower than a phone. It then narrowed again at 1024px.
//     The rail is now a compact icon column (68px) from 768 to 1279px, the
//     shell gutter steps down instead of up, and the reminders two-column
//     layout starts at 1180px, so its list column is never squeezed.
//
//  2. DECORATION PAINTED OVER CONTENT — on desktop (1280px up) both snowman
//     companions were absolutely positioned ON TOP of the page with
//     `z-index: 5`: the overview one hung 2.5rem below its card over the
//     Study-streak card, and the reminders one was lifted `bottom: calc(100%
//     - 1.4rem)` above the banner across the Quick-add card. Their bubbles
//     ("You can do it! / Stay consistent", "Set reminders today…") covered
//     that content, which is what made reading and clicking it awkward.
//     Both are now IN FLOW in their own row (the areas are flex columns), with
//     no negative offsets and `pointer-events: none` at every depth.
//
// These are code-shape + arithmetic contracts (no browser here), so the width
// budget is recomputed from the shipped numbers at every standard device width
// and fails if any breakpoint ever widens the rail or narrows the column.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync("src/MyDayApp.tsx", "utf8");
const sideNav = fs.readFileSync("src/components/myday/SideNav.tsx", "utf8");
const remindersTsx = fs.readFileSync("src/components/myday/Reminders.tsx", "utf8");
const overviewCss = fs.readFileSync("src/myday-overview.css", "utf8");
const remindersCss = fs.readFileSync("src/myday-reminders.css", "utf8");

/** The Tailwind spacing scale used by the shell gutter (rem → px at 16px). */
const SPACING = {
  "gap-4": 16,
  "gap-5": 20,
  "gap-6": 24,
  "gap-8": 32,
  "px-4": 32, // both sides
  "px-6": 48,
  "px-8": 64,
  "px-10": 80,
};

/**
 * Page column width at `viewport`, mirroring the shell markup and the rail's
 * own width rules. Throws if a token is missing, so a re-worded shell can
 * never silently pass.
 */
function pageColumn(viewport) {
  const p = (token) => {
    const value = SPACING[token];
    assert.ok(value !== undefined, `unknown spacing token: ${token}`);
    return value;
  };
  // data-myday-content: gap-6 px-4 sm:px-6 md:gap-4 lg:gap-5 lg:px-8 xl:gap-8 xl:px-10
  let gap = p("gap-6");
  let pad = p("px-4");
  if (viewport >= 640) pad = p("px-6");
  if (viewport >= 768) gap = p("gap-4");
  if (viewport >= 1024) {
    gap = p("gap-5");
    pad = p("px-8");
  }
  if (viewport >= 1280) {
    gap = p("gap-8");
    pad = p("px-10");
  }
  // SideNav: hidden below 768, compact 68px to 1279, full 240px from 1280.
  const rail = viewport < 768 ? 0 : viewport < 1280 ? 68 : 240;
  return viewport - pad - (rail ? gap : 0) - rail;
}

/** Main (list) column inside the reminders layout, once it is two columns. */
function remindersMainColumn(viewport) {
  const column = pageColumn(viewport);
  if (viewport < 1180) return column; // single column: the list is full width
  const rail = viewport >= 1280 ? 304 : 284;
  const gap = 17.6; // .myrem-layout gap: 1.1rem
  return column - gap - rail;
}

const VIEWPORTS = {
  "phone (320)": 320,
  "phone (375)": 375,
  "phone (414)": 414,
  "large phone / phablet (600)": 600,
  "phone landscape (767)": 767,
  "small tablet portrait (768)": 768,
  "iPad mini portrait (744)": 744,
  "iPad portrait (810)": 810,
  "iPad Air portrait (834)": 834,
  "tablet landscape (1023)": 1023,
  "small laptop (1024)": 1024,
  "tablet landscape (1180)": 1180,
  "desktop (1280)": 1280,
  "desktop (1440)": 1440,
  "wide desktop (1920)": 1920,
};

/* ------------------------------------------------------------------ */
/* 1 · The page column must never shrink                            */
/* ------------------------------------------------------------------ */

test("the side rail is a compact icon column until the column can afford the full panel", () => {
  // Compact rail (68px) + the full panel (240px) only from 1280px.
  assert.match(sideNav, /className="sticky top-\[65px\] hidden h-fit w-\[4\.25rem\] shrink-0 md:block xl:w-60"/);
  // Nothing may re-introduce a wide panel before 1280px.
  assert.doesNotMatch(sideNav, /md:w-56|lg:w-60(?! xl)|md:w-60/);
  // The full-panel extras come back with the panel, and only then.
  assert.match(sideNav, /mb-3 hidden px-1 pt-0\.5 xl:block/);
  assert.match(sideNav, /className="mt-4 hidden xl:block"/);
  assert.match(sideNav, /myday-quote-card mt-4 hidden xl:block/);
  // The shell gutter steps DOWN (never up) as the rail grows.
  const shellLine = appSource.split("\n").find((line) => line.includes("data-myday-content"));
  assert.ok(shellLine, "the My Day content shell renders");
  assert.match(shellLine, /gap-6 px-4 pt-6 sm:px-6 md:gap-4 lg:gap-5 lg:px-8 xl:gap-8 xl:px-10/);
  assert.doesNotMatch(shellLine, /md:gap-8|md:px-8/);
});

test("the compact rail keeps every section reachable", () => {
  // Labels are hidden by CSS on the rail, so the button itself must carry the
  // name (aria-label) and the hover tooltip (title).
  assert.match(sideNav, /aria-label=\{item\.label\}/);
  assert.match(sideNav, /title=\{item\.label\}/);
  assert.match(sideNav, /className="myday-snav-label min-w-0 flex-1 truncate"/);
  assert.match(sideNav, /myday-snav-dot/);
  // The rail centring rule is scoped exactly to the compact band.
  assert.match(overviewCss, /@media \(min-width: 768px\) and \(max-width: 1279\.98px\) \{[\s\S]*?\.myday-snav-label \{ display: none; \}/);
  assert.match(overviewCss, /@media \(min-width: 768px\) and \(max-width: 1279\.98px\) \{[\s\S]*?justify-content: center;/);
  // The quote card the compact rail cannot show is rendered in the page
  // content exactly while the panel is compact.
  assert.match(appSource, /<QuoteCard className="xl:hidden" \/>/);
});

test("no standard screen size leaves the page column squeezed", () => {
  const widths = Object.entries(VIEWPORTS).map(([label, viewport]) => [
    label,
    viewport,
    pageColumn(viewport),
  ]);
  // Floor: from the phone-landscape size up, the page column is at least as
  // wide as a comfortable tablet column (the reminders list needs ~600px for
  // a row's tile + time + text + actions).
  for (const [label, viewport, column] of widths) {
    if (viewport < 768) continue;
    assert.ok(column >= 620, `${label}: page column ${column}px is below the 620px floor`);
  }
  // The reported bug: at 767px the page had a full-width column, and at 768px
  // it collapsed to ~448px. It may not drop by more than 15% at any step.
  const steps = widths.filter(([, viewport]) => viewport >= 600);
  for (let i = 1; i < steps.length; i += 1) {
    const [previousLabel, previousViewport, previous] = steps[i - 1];
    const [label, viewport, column] = steps[i];
    const drop = previous - column;
    assert.ok(
      drop <= previous * 0.15,
      `${previousLabel} (${previousViewport}px) → ${label} (${viewport}px) drops the column by ${drop}px`,
    );
  }
});

test("the reminders list column stays wide enough at every size", () => {
  // A phone column is what it is (the row's actions wrap); what must never
  // happen is the TABLET/desktop list being squeezed below a phone's.
  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    const main = remindersMainColumn(viewport);
    const floor = viewport >= 1024 ? 600 : viewport >= 768 ? 560 : 288;
    assert.ok(main >= floor, `${label}: reminders list column ${main}px is below the ${floor}px floor`);
  }
  // The two steps that were reported: 767px → 768px (the rail appears and used
  // to collapse the list from 719px to 448px — a 38% cut) and 1023px → 1024px
  // (it collapsed again). The rail may cost at most 15% at 768px, and the lg
  // step may not shrink the list at all any more.
  const at767 = remindersMainColumn(767);
  const at768 = remindersMainColumn(768);
  assert.ok(
    at768 >= at767 * 0.85,
    `768px shrinks the reminders list too far (${at767}px → ${at768}px)`,
  );
  // (the lg step only widens the gutter — a few px, never a column cut, which
  // is why the tolerance is 5% here and not the 15% the rail gets.)
  const at1023 = remindersMainColumn(1023);
  const at1024 = remindersMainColumn(1024);
  assert.ok(
    at1024 >= at1023 * 0.95,
    `1024px shrinks the reminders list too far (${at1023}px → ${at1024}px)`,
  );
  // …and the two-column layout only starts where it genuinely fits.
  assert.match(remindersCss, /@media \(min-width: 1180px\) \{\s*\.myrem-layout \{/);
  assert.doesNotMatch(remindersCss, /@media \(min-width: 1024px\) \{\s*\.myrem-layout/);
  // The rail-only affordances (mobile search row, chips magnifier, always-open
  // calendar) follow the same breakpoint, so tablet never gets a hybrid.
  assert.match(remindersCss, /@media \(min-width: 1180px\) \{ \.myrem-msearch \{ display: none; \} \}/);
  assert.match(remindersCss, /@media \(min-width: 1180px\) \{\s*\.myrem-dsearch \{ display: inline-flex/);
  assert.match(remindersCss, /@media \(min-width: 1180px\) \{\s*\.myrem-rail-cal \.myrem-cal-body \{ display: block; \}/);
  // Every layout cell keeps `min-width: 0`, so no grid track can be pushed
  // wider than its share by a long reminder title.
  for (const area of ["panel", "rail-cal", "rail-stats", "rail-quick", "banner"]) {
    assert.match(remindersCss, new RegExp(`\\.myrem-${area} \\{ grid-area: [a-z]+; min-width: 0; \\}`));
  }
});

/* ------------------------------------------------------------------ */
/* 2 · Decoration must never cover content                          */
/* ------------------------------------------------------------------ */

test("the overview snowman sits in its own row, never over the cards", () => {
  // The schedule area is a flex column; the card keeps filling the grid row
  // and the companion follows it in flow.
  assert.match(overviewCss, /@media \(min-width: 1280px\) \{\s*\.myday-area-schedule \{\s*display: flex;\s*flex-direction: column;/);
  assert.match(overviewCss, /\.myday-area-schedule > \*:not\(\.myday-snowman\) \{\s*flex: 1 1 auto;\s*min-height: 0;/);
  // The companion itself: in flow, right-aligned, non-interactive at depth.
  const block = overviewCss.slice(overviewCss.indexOf(".myday-snowman {"));
  const rule = block.slice(0, block.indexOf("}"));
  assert.match(rule, /display: none;/);
  assert.doesNotMatch(rule, /position: absolute;/);
  assert.doesNotMatch(rule, /(right|bottom|left|top):\s*-/);
  assert.doesNotMatch(rule, /z-index:/);
  assert.match(rule, /align-self: flex-end;/);
  // …and it may never be flexed away (the card above shrinks instead of the
  // companion spilling into the row below).
  assert.match(rule, /flex: 0 0 auto;/);
  assert.match(rule, /pointer-events: none;/);
  assert.match(overviewCss, /\.myday-snowman \* \{\s*pointer-events: none;/);
});

test("the reminders snowman stands above the banner, never over the quick-add card", () => {
  // It is a SIBLING of the banner card now — not a child that could be lifted
  // over the card above it.
  const banner = remindersTsx.slice(remindersTsx.indexOf('className="myrem-banner"'));
  const snowIndex = banner.indexOf('className="myrem-snow"');
  const innerIndex = banner.indexOf('className="myrem-banner-inner"');
  assert.ok(snowIndex !== -1 && innerIndex !== -1, "both the companion and the banner card render");
  assert.ok(snowIndex < innerIndex, "the companion is outside the banner card");
  assert.equal(banner.indexOf('className="myrem-banner-inner"', snowIndex) > snowIndex, true);
  // …and the old nested copy is gone (exactly one companion in the page).
  assert.equal(remindersTsx.match(/myrem-snow-body/g).length, 1);

  assert.match(remindersCss, /@media \(min-width: 1280px\) \{\s*\.myrem-banner \{\s*display: flex;\s*flex-direction: column;/);
  assert.match(remindersCss, /\.myrem-banner-inner \{ flex: 1 1 auto; \}/);
  const baseRule = remindersCss.indexOf(".myrem-snow { display: none; }");
  assert.ok(baseRule !== -1, "the companion starts hidden (desktop-only)");
  // The rule inside the desktop media query — the base rule stays `display: none`.
  const mq = remindersCss.slice(remindersCss.indexOf("@media (min-width: 1280px) {", baseRule));
  const ruleStart = mq.indexOf(".myrem-snow {");
  assert.ok(ruleStart !== -1, "the desktop rule for the companion exists");
  const rule = mq.slice(ruleStart, mq.indexOf("}", ruleStart));
  assert.doesNotMatch(rule, /position: absolute;/);
  assert.doesNotMatch(rule, /(right|bottom|left|top):\s*(calc\(|-)/);
  assert.doesNotMatch(rule, /z-index:/);
  assert.match(rule, /align-self: flex-end;/);
  // …and it may never be flexed away (the card above shrinks instead of the
  // companion spilling into the row below).
  assert.match(rule, /flex: 0 0 auto;/);
  assert.match(rule, /pointer-events: none;/);
  assert.match(mq, /\.myrem-snow \* \{ pointer-events: none; \}/);
});

test("no My Day decoration is absolutely positioned on top of content any more", () => {
  // The two companions were the only overlays; a scan of both My Day sheets
  // must not find a decorative layer that both floats and stacks above content.
  for (const [file, cssText] of [["myday-overview.css", overviewCss], ["myday-reminders.css", remindersCss]]) {
    for (const selector of [".myday-snowman", ".myrem-snow"]) {
      let index = cssText.indexOf(`${selector} {`);
      while (index !== -1) {
        const rule = cssText.slice(index, cssText.indexOf("}", index));
        assert.doesNotMatch(
          rule,
          /position: absolute;[\s\S]*z-index: [1-9]/,
          `${file}: ${selector} floats above the page`,
        );
        index = cssText.indexOf(`${selector} {`, index + 1);
      }
    }
  }
});
