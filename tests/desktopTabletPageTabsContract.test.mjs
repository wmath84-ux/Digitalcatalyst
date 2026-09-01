// tests/desktopTabletPageTabsContract.test.mjs
//
// Contract for how My Day and Revision reach their own pages on a wide screen:
//
//   1. On a phone both features use the floating bottom pill, hidden from
//      768 px up.
//   2. REVISION — its page buttons (Dashboard · Test Bank · Weak Topics ·
//      Progress · Profile) live in the DESKTOP HEADER: the feature publishes
//      them into the desktop shell's top bar through
//      `useRegisterTopBarTabs`, and the shell renders them as a second row of
//      `[data-desktop-topbar]`. Because the registration is cleared on
//      unmount, the row exists ONLY while Revision is mounted — no other page
//      shows it. Where the phone header is still the chrome (768–959 px tablet
//      portrait) the same destinations render as the in-body text row
//      (`src/components/ui/PageTabs.tsx`), never both at once.
//   3. MY DAY — no horizontal strip at all. Its pages are reached from the
//      side rail (`SideNav`, md+) and the phone bottom pill, which drive the
//      same `handleNavigate` section swap.
//   4. The bottom footer pill is hidden for wide screens on BOTH features
//      (`md:hidden`), which is what the desktop/tablet ask was.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const tabs = read("src/components/ui/PageTabs.tsx");
const shell = read("src/components/DesktopShell.tsx");
const topBarContext = read("src/components/TopBarTabsContext.tsx");
const myDay = read("src/MyDayApp.tsx");
const revision = read("src/revision/RevisionApp.tsx");
const myDayFooter = read("src/components/myday/BottomNav.tsx");
const revisionFooter = read("src/revision/components/BottomNav.tsx");
const css = read("src/index.css");

test("the desktop top bar hosts a page-published tab row", () => {
  // The shell owns the row, the page owns the destinations.
  assert.match(shell, /import \{ TopBarTabsProvider, type TopBarTabsConfig \} from "\.\/TopBarTabsContext";/);
  assert.match(shell, /const \[topBarTabs, setTopBarTabs\] = useState<TopBarTabsConfig \| null>\(null\);/);
  // The bar is tagged with the publishing feature so CSS/tests can target it.
  assert.match(shell, /data-topbar-tabs=\{topBarTabs \? topBarTabs\.feature : undefined\}/);
  // The row renders INSIDE the top bar, and only while a page publishes one.
  const headerAt = shell.indexOf("data-desktop-topbar\n");
  const rowAt = shell.indexOf("{topBarTabs ? <TopBarTabRow config={topBarTabs} /> : null}");
  const headerEnd = shell.indexOf("</header>");
  assert.ok(headerAt >= 0, "the top bar must be tagged data-desktop-topbar");
  assert.ok(rowAt > headerAt && rowAt < headerEnd, "the tab row must render inside the top bar");
  // First row keeps the fixed bar height; the tab row is additive.
  assert.match(shell, /data-desktop-topbar-row className="flex h-16 items-center gap-4"/);
  assert.match(shell, /function TopBarTabRow\(\{ config \}: \{ config: TopBarTabsConfig \}\)/);
  assert.match(shell, /data-desktop-topbar-tabs=\{config\.feature\}/);
  // Text only — same treatment as the in-body row, no icon components.
  assert.match(shell, /\{item\.label\}/);
  assert.doesNotMatch(shell.slice(shell.indexOf("function TopBarTabRow"), shell.indexOf("function TopBarButton")), /<(Search|Bell|Heart|Crown|ShoppingBag) /);
  // The provider wraps the page body, so a page can reach the setter.
  assert.match(shell, /<TopBarTabsProvider setTabs=\{setTopBarTabs\}>/);
});

test("the header row exists only for as long as the publishing page is mounted", () => {
  // Registration is paired with a cleanup that clears the row, so leaving the
  // page removes it — the row can never leak onto another screen.
  assert.match(topBarContext, /host\.setTabs\(published\);/);
  assert.match(topBarContext, /return \(\) => host\.setTabs\(null\);/);
  // No host (phone / tablet portrait, where the shell is not mounted) → the
  // hook is a no-op and the page keeps its in-body row.
  assert.match(topBarContext, /if \(!host\) return undefined;/);
  // Stable published identity + handlers read through a ref: publishing every
  // render must not re-render the shell in a loop, and a click must still hit
  // the newest handler.
  assert.match(topBarContext, /latest\.current\?\.onSelect\(id\);/);
  assert.match(topBarContext, /\}, \[feature, ariaLabel, items, activeId, homeLabel\]\);/);
});

test("Revision publishes its page buttons into the desktop header", () => {
  const block = revision.slice(revision.indexOf("const REVISION_TABS"), revision.indexOf("/** Which tab"));
  for (const href of ["#/revision", "#/revision/bank", "#/revision/weak-topics", "#/revision/progress", "#/revision/profile"]) {
    assert.ok(block.includes(`href: "${href}"`), `missing tab route ${href}`);
  }
  for (const label of ["Dashboard", "Test Bank", "Weak Topics", "Progress", "Profile"]) {
    assert.match(block, new RegExp(`label: "${label}"`), `missing "${label}" tab`);
  }

  // The same destinations are handed to the desktop header.
  assert.match(revision, /import \{ useRegisterTopBarTabs, useTopBarTabsHost \} from "\.\.\/components\/TopBarTabsContext";/);
  assert.match(revision, /useRegisterTopBarTabs\(/);
  assert.match(revision, /feature: "revision"/);
  assert.match(revision, /ariaLabel: "Revision pages"/);
  assert.match(revision, /items: REVISION_TABS/);
  assert.match(revision, /activeId,/);

  // …but never on top of the in-body row: with the shell mounted the strip is
  // skipped, so a wide screen gets the header row and nothing else.
  assert.match(revision, /const topBarHost = useTopBarTabsHost\(\);/);
  assert.match(revision, /if \(topBarHost \|\| focusRoute\) return null;/);

  // Clicking goes through the feature's exit guard, so an in-progress test
  // still confirms before the learner leaves it.
  assert.match(revision, /const \{ navigate \} = useExitGuard\(\);/);
  assert.match(revision, /if \(href && href !== path\) navigate\(href\);/);
  assert.match(revision, /onHome: \(\) => navigate\("#\/home"\)/);
});

test("the revision tabs step out of the way on the focused test surfaces", () => {
  // The row is skipped exactly where the feature also hides its own nav.
  assert.match(revision, /const focusRoute = isRevisionFocusRoute\(path\);/);
  assert.match(revision, /topBarHost && !focusRoute/);
  assert.match(revision, /<RevisionPageTabs path=\{path\} \/>/);
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

test("My Day renders no horizontal tab strip", () => {
  // The strip and its buttons are gone from the page…
  assert.doesNotMatch(myDay, /PageTabs/);
  assert.doesNotMatch(myDay, /DAY_TABS/);
  // …and the pages stay reachable from the side rail + phone pill, both wired
  // to the same section swap the strip used.
  assert.match(myDay, /<SideNav active=\{activeSection\} onNavigate=\{handleNavigate\} \/>/);
  assert.match(myDay, /<BottomNav active=\{activeSection\} onNavigate=\{handleNavigate\}/);
  assert.match(myDayFooter, /id: "overview", label: "Day"/);
});

test("the footer pill is hidden on tablet + desktop for both features", () => {
  // My Day already released the pill at 768 px; Revision now does the same, so
  // no desktop / tablet user gets a phone-style floating bar.
  assert.match(myDayFooter, /className="pointer-events-none absolute inset-x-0 bottom-0[^"]*md:hidden"/);
  assert.match(revisionFooter, /className="pointer-events-none absolute inset-x-0 bottom-0[^"]*md:hidden"/);
});

test("the in-body row stays text-only, phone-hidden and revision-only", () => {
  // `hidden … md:block` — the row cannot stack on top of the phone pill.
  assert.match(tabs, /"dc-page-tabs hidden w-full shrink-0[^"]*md:block/);
  // Keval text — the row renders a label and nothing else; no icon component is
  // imported by the shared row at all.
  assert.doesNotMatch(tabs, /lucide-react/);
  assert.match(tabs, /title=\{item\.hint\}/);
  assert.match(tabs, /\{item\.label\}/);
  // Revision is now its only consumer (tablet portrait).
  assert.match(revision, /import PageTabs, \{ type PageTabItem \} from "\.\.\/components\/ui\/PageTabs"/);
  assert.match(revision, /feature="revision"/);
  // The offset has to follow whichever header is visible, which the app decides
  // in src/index.css (768 / 960 bands + tablet landscape), not a Tailwind class.
  assert.match(css, /\.dc-page-tabs\s*\{[^}]*position: sticky/);
  assert.match(css, /@media \(min-width: 768px\)\s*\{\s*\.dc-page-tabs\s*\{\s*top: 80px/);
  assert.match(css, /@media \(min-width: 960px\)\s*\{\s*\.dc-page-tabs\s*\{\s*top: 64px/);
  assert.match(css, /html\[data-tablet-landscape-desktop="true"\] \.dc-page-tabs/);
});

test("the taller top bar is not clipped on tablet bands", () => {
  // The fixed height moved from the bar onto its first row, so a published tab
  // row can grow the bar instead of being cut off.
  assert.match(css, /\.dc-desktop-shell \[data-desktop-topbar-row\]\s*\{\s*height: var\(--desktop-topbar-height\) !important;/);
  const tabletBar = css.slice(css.indexOf("/* Ensure search bar and top bar scale"), css.indexOf(".dc-desktop-shell [data-desktop-topbar] input"));
  assert.doesNotMatch(tabletBar, /data-desktop-topbar\]\s*\{\s*height:/);
  assert.match(tabletBar, /padding-inline: clamp\(12px, 1\.5vw, 24px\) !important/);
});
