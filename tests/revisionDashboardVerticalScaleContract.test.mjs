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

  const undoBlock = clean.match(/@media \(min-width: 640px\) and \(max-width: (\d+)px\) \{\n\s*\[data-revision-app\] h1,/);
  assert.ok(undoBlock, "expected the Revision + Profile undo block");
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

test("the dashboard columns fill the row instead of ending short", () => {
  const dashRules = rules.filter((r) => /data-rev-layout="dashboard"|data-revision-page="dashboard"/.test(r.selector) && /display:\s*grid/.test(r.body));
  assert.ok(dashRules.length >= 2, "expected the desktop-shell dashboard grid rules");
  for (const rule of dashRules) {
    const align = rule.body.match(/align-items:\s*([^;]+)/)?.[1]?.trim();
    if (align !== undefined) {
      assert.equal(align, "stretch", `${rule.selector}: 'start' leaves the plan column short next to the tall right column`);
    }
  }
  // …and the hero card has the flex chain that needs that height.
  assert.match(dashboard, /data-rev-panel="primary" className="flex flex-col/);
  assert.match(dashboard, /<section aria-label="Your revision plans" className="flex min-h-0 flex-auto flex-col">/);
  assert.match(dashboard, /data-rev-plan-details className="mt-3 flex min-h-0 flex-auto flex-col justify-center/);
  assert.match(dashboard, /className="relative flex min-h-\[270px\] flex-auto flex-col overflow-hidden/);
  // The CTA must not be squeezed by the growing card, and it must not fight the
  // details box for the slack: an `mt-auto` margin eats free space before
  // `flex-grow`, which would move the empty band back under the copy.
  assert.match(dashboard, /min-h-\[48px\] w-full shrink-0/);
  assert.match(dashboard, /data-rev-plan-cta/);
  assert.doesNotMatch(dashboard, /data-rev-plan-cta[^>]*mt-auto/);
});

test("the fill chain grows from the content, never from a zero basis", () => {
  // `flex-1` is `1 1 0%`. Against a stretched row the zero basis lets a card be
  // clamped below its own content and `overflow-hidden` then clips the CTA —
  // the same class of bug as the Test Bank squares. `flex-auto` (1 1 auto) keeps
  // the content height as the floor and still grows into the free space.
  const chain = /(<section aria-label="Your revision plans"[^>]*>|className="[^"]*min-h-\[270px\][^"]*"|data-rev-panel="primary" className="[^"]*")/g;
  const found = [...dashboard.matchAll(chain)].map((m) => m[0]);
  assert.ok(found.length >= 3, "expected the panel, the card roots and the carousel section");
  for (const snippet of found) {
    assert.doesNotMatch(snippet, /flex-1(?!\S)/, `zero flex basis in: ${snippet}`);
  }
  // The compact phone band still reaches the plan card button.
  assert.match(clean, /\[data-revision-app\] \[data-revision-page-main\] \[data-rev-plan-cta\] \{\s*min-height: 38px !important/);
  // A flex column spaces its children with `gap`, not `space-y`: without it the
  // hero card and the stat row would touch on the phone band.
  assert.match(dashboard, /data-rev-panel="primary" className="flex flex-col gap-4/);
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
