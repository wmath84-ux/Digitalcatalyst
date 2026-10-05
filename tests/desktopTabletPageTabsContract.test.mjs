// tests/desktopTabletPageTabsContract.test.mjs
//
// Contract for how My Day and Revision reach their own pages on a wide screen:
//
//   1. On a phone AND on a tablet in portrait both features use the floating
//      bottom capsule — the one footer design the whole app shares
//      (src/components/SiteFooterNav.tsx). It is released only from 960 px up
//      (and in tablet-landscape desktop mode), where the rail is the nav.
//   2. REVISION — its page buttons (Dashboard · Test Bank · Weak Topics ·
//      Progress · Profile) live in the DESKTOP HEADER: the feature publishes
//      them into the desktop shell's top bar through
//      `useRegisterTopBarTabs`, and the shell renders them as a second row of
//      `[data-desktop-topbar]`. Because the registration is cleared on
//      unmount, the row exists ONLY while Revision is mounted — no other page
//      shows it. Where the phone header is still the chrome (768–959 px tablet
//      portrait) the same destinations render as the in-body text row
//      (`src/components/ui/PageTabs.tsx`) — which CSS hides in that band now
//      that the shared capsule is visible there, so never both at once.
//   3. MY DAY — no horizontal strip at all. Its pages are reached from the
//      side rail (`SideNav`, md+) and the phone bottom pill, which drive the
//      same `handleNavigate` section swap.
//   4. SUPERSEDED 2026-09-16: the pill used to be hidden from 768 px up on both
//      features. The owner's brief made My Day's capsule the app's only footer
//      design and asked for it on tablets too, so the row now yields in the
//      768–959 px portrait band instead of the pill yielding.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const tabs = read("src/revision/components/RevisionTabs.tsx");
const shell = read("src/components/DesktopShell.tsx");
const topBarContext = read("src/components/TopBarTabsContext.tsx");
const myDay = read("src/MyDayApp.tsx");
const revision = read("src/revision/RevisionApp.tsx");
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

test("Revision publishes its page destinations into the desktop header", () => {
  const block = revision.slice(revision.indexOf("const REVISION_TOP_BAR_ITEMS"), revision.indexOf("interface RevisionAppProps"));
  for (const [id, label] of [
    ["dashboard", "Dashboard"],
    ["bank", "Test Bank"],
    ["decks", "Decks"],
    ["browser", "Cards"],
    ["weak-topics", "Weak Topics"],
    ["progress", "Progress"],
    ["profile", "Plan & AI"],
    ["bulk-import", "Import"],
  ]) {
    assert.ok(block.includes(`id: "${id}", label: "${label}"`), `missing ${label} tab`);
  }

  // The stable destination array is published into DesktopShell's inline row.
  assert.match(revision, /useRegisterTopBarTabs\(/);
  assert.match(revision, /feature: "revision"/);
  assert.match(revision, /ariaLabel: "Revision pages"/);
  assert.match(revision, /items: REVISION_TOP_BAR_ITEMS/);
  assert.match(revision, /activeId: route\.page/);
  assert.match(shell, /data-desktop-topbar-tabs=\{config\.feature\}/);

  // The top-bar handler navigates every destination through Revision's router.
  assert.match(revision, /onSelect: \(id\) => \{/);
  assert.match(revision, /if \(id === "dashboard"\) navigate\("#\/revision"\)/);
  assert.match(revision, /id === "bulk-import"\) navigate\("#\/revision\/bulk-import"\)/);
});

test("Revision tabs yield to the desktop host and focused test surfaces", () => {
  assert.match(revision, /const isDesktopHost = Boolean\(useTopBarTabsHost\(\)\)/);
  assert.match(revision, /const isFocused = route\.page === "test-play" \|\| route\.page === "test-play-attempt"/);
  assert.match(revision, /!isDesktopHost && !isFocused && <RevisionTabs route=\{route\} \/>/);
  assert.match(revision, /!isDesktopHost && !isFocused && \(\s*<BottomNav/);
  // Results and review remain navigable from the page row; active test-taking
  // hides it, while desktop uses the registered top-bar destinations.
  assert.match(revision, /case "test-result":[\s\S]{0,100}<TestResultPage/);
  assert.match(revision, /case "test-review":[\s\S]{0,100}<TestReviewPage/);
  assert.match(revision, /data-revision-scroll/);
});

test("My Day renders no horizontal tab strip", () => {
  // The planner is retired: the strip, its side rail and its phone pill went
  // with it. `#/my-day` is the Joplin workspace. Phone/tablet also mount the
  // SAME home peek footer (BottomNav peek) so learners can leave My Day the
  // way they leave Home — desktop CSS still hides that capsule from 960 px.
  assert.doesNotMatch(myDay, /PageTabs/);
  assert.doesNotMatch(myDay, /DAY_TABS/);
  assert.doesNotMatch(myDay, /<SideNav/);
  assert.match(myDay, /<BottomNav/);
  assert.match(myDay, /peek/);
  // The route stays a thin adapter that lazy-loads the workspace.
  assert.match(myDay, /import\("\.\/joplin\/JoplinWorkspace"\)/);
});

test("the footer capsule is the ONE footer on phone + tablet, released only on desktop", () => {
  // 2026-09-16 owner brief: "footer navigation ka jo design My Day per hai
  // exactly vahi design har jagah honi chahiye … jahan-jahan footer navigation
  // hai, jis screen per, jaise tablet aur mobile check karke fix karo". Both
  // features render the shared capsule (src/components/SiteFooterNav.tsx) and
  // neither hides it at 768 px any more — a tablet in portrait used to lose the
  // footer completely here while Home / Store / Cart kept theirs.
  // My Day used to be the second consumer; the planner's pill is retired with
  // the planner (the Joplin workspace owns the route's chrome), so Revision is
  // the remaining feature footer on top of the primary one.
  const shared = read("src/components/SiteFooterNav.tsx");
  assert.match(revisionFooter, /<SiteFooterNav/);
  assert.doesNotMatch(revisionFooter, /md:hidden/);
  assert.doesNotMatch(shared, /md:hidden/);
  assert.match(shared, /data-site-footer-nav/);

  // Desktop still releases it: >=960 px, tablet-landscape-as-desktop and any
  // page inside the desktop shell, where the left rail is the nav.
  assert.match(css, /HARD RULE: Footer navigation never appears on desktop/);
  assert.match(css, /@media \(min-width: 960px\) \{\s*\[data-site-footer-nav\]/);
  assert.match(css, /html\[data-tablet-landscape-desktop="true"\] \[data-site-footer-nav\]/);
  assert.match(css, /\.dc-desktop-shell \[data-site-footer-nav\]/);

  // In the active Recall port, the shared Revision row stays with the feature
  // only when the desktop host is absent; DesktopShell supplies the inline row.
  assert.match(revision, /!isDesktopHost && !isFocused && <RevisionTabs route=\{route\} \/>/);
  assert.match(shell, /<TopBarTabRow config=\{topBarTabs\} \/>/);
});

test("the in-body Revision row stays horizontal, text-only and feature-scoped", () => {
  assert.match(tabs, /overflow-x-auto/);
  assert.match(tabs, /aria-label=\{t\("revision\.tabs\.label", "Revision pages"\)\}/);
  assert.match(tabs, /\{t\(tab\.label\.key, tab\.label\.fallback\)\}/);
  assert.doesNotMatch(tabs, /lucide-react/);
  assert.match(tabs, /onClick=\{\(\) => navigate\(tab\.href\)\}/);
  // It is shown on phone/tablet when the desktop host is absent and yields to
  // the host's published inline row or the focused test-taking view.
  assert.match(revision, /!isDesktopHost && !isFocused && <RevisionTabs route=\{route\} \/>/);
  assert.match(revision, /useRegisterTopBarTabs\(/);
  assert.match(revision, /items: REVISION_TOP_BAR_ITEMS/);
});

test("the taller top bar is not clipped on tablet bands", () => {
  // The fixed height moved from the bar onto its first row, so a published tab
  // row can grow the bar instead of being cut off.
  assert.match(css, /\.dc-desktop-shell \[data-desktop-topbar-row\]\s*\{\s*height: var\(--desktop-topbar-height\) !important;/);
  const tabletBar = css.slice(css.indexOf("/* Ensure search bar and top bar scale"), css.indexOf(".dc-desktop-shell [data-desktop-topbar] input"));
  assert.doesNotMatch(tabletBar, /data-desktop-topbar\]\s*\{\s*height:/);
  assert.match(tabletBar, /padding-inline: clamp\(12px, 1\.5vw, 24px\) !important/);
});
