// tests/desktopTabletPageTabsContract.test.mjs
//
// Contract for the tablet + desktop pass over the My Day and Revision pages:
//
//   1. On a phone the pages are reached from the floating bottom pill. That pill
//      is hidden from 768 px up, so on a tablet / desktop both features now show
//      ONE shared text-only tab row (`src/components/ui/PageTabs.tsx`) as the
//      first line of the page body, directly under the header:
//        • My Day   → Day · Tasks · Schedule · Reminders · Notes (sections)
//        • Revision → Dashboard · Test Bank · Weak Topics · Progress · Profile
//      Every tab opens the same page the phone pill opened; the active page is
//      marked by colour + the underline on the rule, not by a new route.
//   2. Text only: no icons and no second chrome.
//   3. The bottom footer pill is hidden for wide screens on BOTH features
//      (`md:hidden`), which is what the desktop/tablet ask was.
//   4. The row never shows on a phone — mobile chrome is untouched.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const tabs = read("src/components/ui/PageTabs.tsx");
const myDay = read("src/MyDayApp.tsx");
const revision = read("src/revision/RevisionApp.tsx");
const myDayFooter = read("src/components/myday/BottomNav.tsx");
const revisionFooter = read("src/revision/components/BottomNav.tsx");
const css = read("src/index.css");

test("both features share one text-only PageTabs row", () => {
  assert.match(myDay, /import PageTabs, \{ type PageTabItem \} from "\.\/components\/ui\/PageTabs"/);
  assert.match(revision, /import PageTabs, \{ type PageTabItem \} from "\.\.\/components\/ui\/PageTabs"/);
  // Keval text — the row renders a label and nothing else; no icon component is
  // imported by the shared row at all.
  assert.doesNotMatch(tabs, /lucide-react/);
  assert.match(tabs, /title=\{item\.hint\}/);
  assert.match(tabs, /\{item\.label\}/);
});

test("My Day tabs list every My Day page and switch the live section", () => {
  const block = myDay.slice(myDay.indexOf("const DAY_TABS"), myDay.indexOf("export default function App"));
  for (const label of ["Day", "Tasks", "Schedule", "Reminders", "Notes"]) {
    assert.match(block, new RegExp(`label: "${label}"`), `missing "${label}" tab`);
  }
  // "Day" is the landing section, and a tab click drives the exact same state
  // transition the phone pill drives (`handleNavigate`) — no new route.
  assert.match(block, /\{ id: "overview", label: "Day"/);
  assert.match(myDay, /<PageTabs\n?\s*items=\{DAY_TABS\}[\s\S]*?onSelect=\{handleNavigate\}/);
  assert.match(myDay, /activeId=\{activeSection\}/);
  // The row is the first line under the shared header, above the page body.
  const headerAt = myDay.indexOf("<StoreHeader");
  const tabsAt = myDay.indexOf("<PageTabs");
  const bodyAt = myDay.indexOf('<div data-myday-content');
  assert.ok(headerAt >= 0 && tabsAt > headerAt && bodyAt > tabsAt, "tabs must sit between the header and the page body");
});

test("Revision tabs open the same routes as the revision footer", () => {
  const block = revision.slice(revision.indexOf("const REVISION_TABS"), revision.indexOf("/** Which tab"));
  for (const href of ["#/revision", "#/revision/bank", "#/revision/weak-topics", "#/revision/progress", "#/revision/profile"]) {
    assert.ok(block.includes(`href: "${href}"`), `missing tab route ${href}`);
  }
  assert.match(block, /label: "Dashboard"/);
  assert.match(block, /label: "Test Bank"/);
  assert.match(block, /label: "Weak Topics"/);
  // Clicking goes through the feature's exit guard, so an in-progress test
  // still confirms before the learner leaves it.
  assert.match(revision, /const \{ navigate \} = useExitGuard\(\);/);
  assert.match(revision, /if \(href && href !== path\) navigate\(href\);/);
  // The row is skipped exactly where the feature also hides its own nav.
  assert.match(revision, /\{!isRevisionFocusRoute\(path\) && <RevisionPageTabs path=\{path\} \/>\}/);
  // Un-escape the `\/` pairs inside the route regexes so the assertions below
  // read like the routes themselves.
  const focus = revision
    .slice(revision.indexOf("export function isRevisionFocusRoute"), revision.indexOf("function RevisionPageTabs"))
    .replace(/\\\//g, "/");
  assert.match(focus, /#\/revision\/test\/play/);
  assert.match(focus, /#\/revision\/session/);
  // …and only while an attempt is running: results / review keep the row.
  assert.doesNotMatch(focus, /result/);
});

test("the footer pill is hidden on tablet + desktop for both features", () => {
  // My Day already released the pill at 768 px; Revision now does the same, so
  // no desktop / tablet user gets a phone-style floating bar.
  assert.match(myDayFooter, /className="pointer-events-none sticky bottom-0[^"]*md:hidden"/);
  assert.match(revisionFooter, /className="pointer-events-none sticky bottom-0[^"]*md:hidden"/);
});

test("the tab row is invisible on a phone and its header offset is breakpoint-owned", () => {
  // `hidden … md:block` — the row cannot stack on top of the phone pill.
  assert.match(tabs, /"dc-page-tabs hidden w-full shrink-0[^"]*md:block/);
  // The offset has to follow whichever header is visible, which the app decides
  // in src/index.css (768 / 960 bands + tablet landscape), not a Tailwind class.
  assert.match(css, /\.dc-page-tabs\s*\{[^}]*position: sticky/);
  assert.match(css, /@media \(min-width: 768px\)\s*\{\s*\.dc-page-tabs\s*\{\s*top: 80px/);
  assert.match(css, /@media \(min-width: 960px\)\s*\{\s*\.dc-page-tabs\s*\{\s*top: 64px/);
  assert.match(css, /html\[data-tablet-landscape-desktop="true"\] \.dc-page-tabs/);
});

test("the row keeps a plain text way back Home", () => {
  // Both phone pills carry Home, so hiding them from 768 px up must not strand a
  // tablet user — the row ends with a text "Home".
  assert.match(tabs, /homeLabel = "Home"/);
  assert.match(myDay, /onHome=\{\(\) => \{ window\.location\.hash = "#\/home"; \}\}/);
  assert.match(revision, /onHome=\{\(\) => navigate\("#\/home"\)\}/);
});
