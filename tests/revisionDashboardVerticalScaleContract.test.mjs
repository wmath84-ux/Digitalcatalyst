// tests/revisionDashboardVerticalScaleContract.test.mjs
//
// Contract for how much vertical space the Revision DASHBOARD keeps on tablet
// and desktop — i.e. the opposite of the last pass, which compacted it.
//
// Bug this locks down: on tablets and on desktop-sized windows the dashboard
// read as "ekadam shrink ho gaya hai vertically". Three unrelated band rules
// stacked up to produce it, all of them shrinking a design that was never too
// big for those widths:
//
//   1. The "Tablet Size-Based Scaling" block (640–1366 px) rewrites `.p-*`,
//      `.gap-*`, `.rounded-*` and h1/h2/h3 with fluid clamps whose LOWER bound
//      is smaller than the phone default. The dedicated undo pass for Revision
//      + Profile stopped at 1023 px, so the whole 1024–1366 px band — iPad Pro
//      landscape, split-screen tablets in the desktop shell, small laptops —
//      still ran on the shrunken values.
//   2. `.dc-desktop-shell … .rev-card { padding: clamp(10px, 0.9vw, 14px) }`
//      and the tablet-landscape `.rev-card { padding: 10px }` gave every card
//      10 px where the component says `p-4` (16 px).
//   3. `.min-h-[270px] { min-height: 180px/200px !important; padding: 12/16px }`
//      flattened the plan hero card into a short band on those same widths.
//
// Fix: the undo pass now covers the full 640–1366 px range, the card paddings
// are floored at the phone values, and the height caps are gone (the phone band
// keeps its own deliberate 205 px compaction). To keep the left column from
// ending in a band of empty wallpaper next to the taller right column, the
// desktop dashboard grid stretches its rows and the hero card carries a flex
// chain that fills its panel — the plan-details box absorbs the slack, so the
// card grows without an empty hole between the copy and the button.
//
// These are pure code-shape / CSS tests — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const dashboard = fs.readFileSync("src/revision/pages/DashboardPage.tsx", "utf8");

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const clean = stripComments(css);

function innermostRules(text) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    rules.push({ selector: match[1].trim().replace(/\s+/g, " "), body: match[2] });
  }
  return rules;
}

const rules = innermostRules(clean);

test("the tablet-shrink undo covers the whole range the global clamp does", () => {
  // The global block scales Revision/Profile boxes for 640–1366 px; the undo
  // pass has to reach the same ceiling or the 1024–1366 px band stays shrunk.
  const globalBlock = clean.match(/@media \(min-width: 640px\) and \(max-width: (\d+)px\) \{\n\s*\[data-app-frame\] \{\n\s*--tablet-vw/);
  assert.ok(globalBlock, "expected the 'Tablet Size-Based Scaling' block");
  const globalMax = Number(globalBlock[1]);

  const undoBlock = clean.match(/@media \(min-width: 640px\) and \(max-width: (\d+)px\) \{\n\s*\[data-revision-app\]:not\(\[data-recall-root\]\) h1,/);
  assert.ok(undoBlock, "expected the legacy Revision + Profile undo block, scoped away from Recall's own UI");
  assert.equal(
    Number(undoBlock[1]),
    globalMax,
    "the undo pass must cover exactly the band the tablet scaling applies to",
  );
  assert.ok(globalMax >= 1366, `the tablet scaling band should reach 1366px, found ${globalMax}`);
});

test("no band caps the plan hero card outside the phone", () => {
  // The phone compaction is deliberate (205 px + 14 px padding below 768 px);
  // the 180 px / 200 px tablet + desktop versions are what flattened it.
  assert.equal(
    (clean.match(/min-height:\s*180px\s*!important/g) ?? []).length,
    0,
    "the tablet-landscape band must not cap the hero card at 180px",
  );
  assert.equal(
    (clean.match(/\.min-h-\\\[270px\\\][^{]*\{\s*min-height:\s*200px/g) ?? []).length,
    0,
    "the desktop-shell band must not cap the hero card at 200px",
  );
  // The phone value survives, so the card is still compact where it has to be.
  assert.match(clean, /\[data-revision-app\] \[data-revision-page-main\] \.min-h-\\\[270px\\\] \{\s*min-height: 205px !important/);
});

test("revision cards are never padded below the phone box", () => {
  const toPx = (value) => {
    const raw = value.includes("clamp") ? value.match(/clamp\(\s*([\d.]+)px/)[1] : value.match(/^([\d.]+)(px|rem)/)[1];
    const num = Number(raw);
    return value.includes("rem") && !value.includes("clamp") ? num * 16 : num;
  };
  const cardPadding = rules.filter(
    (r) => /\.rev-card/.test(r.selector) && /padding/.test(r.body) && /data-revision-page-main|data-revision-app/.test(r.selector),
  );
  assert.ok(cardPadding.length >= 3, "expected the desktop / tablet card padding rules");
  for (const rule of cardPadding) {
    const value = rule.body.match(/padding:\s*([^;]+)/)[1].trim();
    assert.ok(
      toPx(value) >= 14,
      `${rule.selector} shrinks card padding to ${value}; the component's own p-4 is 16 px — 14 px is the floor`,
    );
  }
  // 10px card padding on a ~1000px window was the "everything shrank" symptom.
  assert.equal((clean.match(/\.rev-card[^{]*\{\s*padding:\s*10px/g) ?? []).length, 0);
  assert.doesNotMatch(clean, /\.rev-card[^{]*\{[^}]*clamp\(10px/);
});

test("every .rev-card padding rule leaves the Test Bank cards alone", () => {
  // A Test Bank card is `Card className="… p-0"` with its own inner padding, so
  // ANY `.rev-card` padding lands on top of it: extra box around the content,
  // and a taller card than its content needs.
  const offenders = rules.filter(
    (r) => /\.rev-card/.test(r.selector) && /padding/.test(r.body) && !r.selector.includes(":not([data-saved-test-card])"),
  );
  assert.deepEqual(
    offenders.map((r) => r.selector),
    [],
    "band rules that pad .rev-card must exclude [data-saved-test-card]",
  );
});

test("the dashboard's hero is the slide deck, sized from the visible area", () => {
  // The hero is no longer a stretched card: it is the AI Canvas slide deck
  // (https://aicanvas.me/components/slide-deck), whose stage takes the space
  // between the page top and the bottom of the page's own scroller so the
  // first card owns the visible area and the rest of the dashboard waits
  // below the fold. Nothing may size it from the VIEWPORT (`100vh`/`100dvh`),
  // or a phone's browser chrome and the footer navigation would clip it.
  const deck = fs.readFileSync("src/revision/components/PlanSlideDeck.tsx", "utf8");
  const dashRules = rules.filter((r) => /data-rev-layout="dashboard"|data-revision-page="dashboard"/.test(r.selector) && /display:\s*grid/.test(r.body));
  assert.ok(dashRules.length >= 2, "expected the desktop-shell dashboard grid rules");
  for (const rule of dashRules) {
    const align = rule.body.match(/align-items:\s*([^;]+)/)?.[1]?.trim();
    if (align !== undefined) {
      assert.equal(align, "stretch", `${rule.selector}: 'start' leaves the columns short next to each other`);
    }
  }
  // The hero panel and the deck itself.
  assert.match(dashboard, /data-rev-panel="primary" className="flex flex-col gap-4/);
  assert.match(dashboard, /<PlanSlideDeck/);
  assert.match(deck, /data-plan-slide-deck/);
  // The sizing rule: measured against the page's scroller, scroll-independent.
  assert.match(deck, /el\.closest\("\[data-revision-page-main\]"\),? ?(as HTMLElement \| null)?/);
  assert.match(deck, /main\.clientHeight - innerTop - BOTTOM_RESERVE/);
  assert.match(deck, /const innerTop = rect\.top - mainRect\.top \+ main\.scrollTop;/);
  assert.doesNotMatch(deck, /100vh|100dvh/);
  // The card fits inside that box: both the width and the height are capped
  // and the stage clips its own overflow, so no card can spill sideways.
  assert.match(deck, /Math\.min\(\(stageW - 28\) \/ CARD_W, Math\.max\(CARD_H \* MIN_SCALE, stageH - CHROME_BELOW_CARD\) \/ CARD_H\)/);
  assert.match(deck, /className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-\[28px\]"/);
  // The compact phone band still compacts the no-plans entry card, which keeps
  // the hook it always had.
  assert.match(dashboard, /className="relative flex min-h-\[270px\] flex-auto flex-col overflow-hidden dc-scene-plate text-white lg:min-h-\[220px\]"/);
  assert.match(clean, /\[data-revision-app\] \[data-revision-page-main\] \.min-h-\\\[270px\\\] \{\s*min-height: 205px !important/);
});

test("the deck's own box never relies on a zero flex basis", () => {
  // `flex-1` is `1 1 0%`. The deck is the one surface on this page whose height
  // is solved from the scroller rather than grown by flex, so the rule that
  // matters is simpler: its stage is sized by the measurement hook, its inner
  // stack is a plain centred column, and the panels below it keep their content
  // height (`space-y`/`grid` with real heights), never a zero basis that would
  // let a column be clamped below its own content.
  const chain = /(data-rev-panel="primary" className="[^"]*"|data-rev-panel="secondary" className="[^"]*")/g;
  const found = [...dashboard.matchAll(chain)].map((m) => m[0]);
  assert.ok(found.length >= 2, "expected both dashboard panels");
  for (const snippet of found) {
    assert.doesNotMatch(snippet, /flex-1(?!\S)/, `zero flex basis in: ${snippet}`);
  }
  // The stat row and the follow-up panel are real boxes with real heights.
  assert.match(dashboard, /data-rev-stat-grid\s*\n?\s*className="grid shrink-0 grid-cols-3 gap-3 lg:col-span-5 lg:gap-2"/);
  assert.match(dashboard, /data-rev-panel="secondary" className="space-y-4 lg:col-span-7 lg:space-y-3"/);
  // The deck's card root keeps the reference's fixed box (a solved width and
  // height), so nothing inside it can be squeezed by a flex row.
  const deck = fs.readFileSync("src/revision/components/PlanSlideDeck.tsx", "utf8");
  assert.match(deck, /const CARD_W = 260;/);
  assert.match(deck, /const CARD_H = 300;/);
  assert.match(deck, /width: cardW,\s*\n\s*height: cardH,/);
});

test("the quick stats ride along in the plan column", () => {
  // They used to top the right column, which left the primary column one card
  // long against a three-block stack — a short, "shrunk" left half on tablet and
  // desktop. Same reading order on the phone: hero, stats, weak topics, bank.
  const primaryAt = dashboard.indexOf('data-rev-panel="primary"');
  const secondaryAt = dashboard.indexOf('data-rev-panel="secondary"');
  const statsAt = dashboard.indexOf("data-rev-stat-grid");
  assert.ok(primaryAt > -1 && secondaryAt > primaryAt && statsAt > primaryAt && statsAt < secondaryAt);
  const phoneOrder = dashboard.slice(primaryAt, dashboard.indexOf("</PageShell"));
  const order = ["data-rev-panel=\"primary\"", "data-rev-stat-grid", "data-rev-panel=\"secondary\"", "Weak Topics", "Revision Bank"];
  let cursor = 0;
  for (const marker of order) {
    const at = phoneOrder.indexOf(marker, cursor);
    assert.ok(at > -1, `reading order broken: ${marker} should follow ${order[order.indexOf(marker) - 1] ?? "the panel start"}`);
    cursor = at;
  }
});
