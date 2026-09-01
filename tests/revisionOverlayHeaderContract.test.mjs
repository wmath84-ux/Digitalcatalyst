// tests/revisionOverlayHeaderContract.test.mjs
//
// Revision headers overlay the page the same way Store / Home do:
// they leave the flow so cards can scroll under MAG frost. AppHeader
// stays a sibling ABOVE the scroller in markup (see
// revisionSubPageHeaderSeatContract) and is taken out of flow with
// unlayered `position: absolute; top: 0`. The scroller keeps a
// transparent pad equal to `--dc-revision-app-header-seat`. Nested
// Test Bank / page-tab glass toolbars share the same watercolor fill.
//
// `position: relative` is scoped to Revision's `[data-page-enter-panel]`
// — My Day also mounts that hook and must not become a containing block
// for overlay chrome it does not own.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const appHeader = fs.readFileSync("src/revision/components/AppHeader.tsx", "utf8");
const pageShell = fs.readFileSync("src/revision/components/PageShell.tsx", "utf8");
const myday = fs.readFileSync("src/MyDayApp.tsx", "utf8");

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

function innermostRules(text) {
  const clean = stripComments(text);
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean)) !== null) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

test("AppHeader overlays the revision scroller at top: 0", () => {
  assert.match(appHeader, /sticky top-0/);
  assert.match(pageShell, /<AppHeader /);
  const headerRules = innermostRules(css).filter((rule) =>
    rule.selector.trim() === "[data-revision-app-header]",
  );
  assert.ok(
    headerRules.some((rule) => /position:\s*absolute/.test(rule.body)),
    "unlayered CSS must take AppHeader out of flow so cards paint under the frost",
  );
  assert.ok(
    headerRules.some((rule) => /top:\s*0/.test(rule.body)),
    "AppHeader overlay inset must stay 0 — a band offset drops it into the page",
  );
  assert.match(css, /--dc-revision-app-header-seat:\s*3\.5rem/);
  assert.match(
    css,
    /\[data-page-enter-panel\]:has\(> \[data-revision-app-header\]\) > \[data-revision-page-main\] \{\s*padding-top:\s*var\(--dc-revision-app-header-seat\)/,
  );
  assert.match(
    css,
    /\[data-page-enter-panel\]:has\(> \[data-revision-app-header\]\) > \[data-revision-page-main\] \{\s*padding-top:\s*var\(--dc-revision-app-header-seat\);\s*background-color:\s*transparent/,
  );
});

test("the overlay containing block is Revision-scoped, not every page-enter panel", () => {
  assert.match(css, /\[data-revision-content\] \[data-page-enter-panel\] \{\s*position:\s*relative/);
  const relativePanels = innermostRules(css).filter(
    (rule) =>
      rule.selector.includes("data-page-enter-panel") && /position:\s*relative/.test(rule.body),
  );
  for (const rule of relativePanels) {
    assert.match(
      rule.selector,
      /\[data-revision-content\]/,
      `page-enter-panel position:relative must stay under Revision, found ${rule.selector}`,
    );
  }
  assert.match(myday, /data-page-enter-panel/);
});

test("Revision glass toolbars share MAG frost, not the opaque white toolbar fill", () => {
  const glass = css.slice(css.lastIndexOf("CHROME GLASS"), css.lastIndexOf("CHROME OVERLAY"));
  assert.match(glass, /\[data-rev-bank-header\]/);
  assert.match(glass, /\[data-revision-app\] \.dc-glass-toolbar/);
  assert.match(glass, /var\(--dc-chrome-glass\)/);
  assert.doesNotMatch(glass, /rgba\(255,\s*255,\s*255,\s*0\.9[0-9]\)/);
});
