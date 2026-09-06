// tests/revisionScenePlateContract.test.mjs
//
// Contract for the 2026-09-06 owner follow-up after Home, the store, the
// product page, the mobile footer dock and My Day:
//
//   "Revision ka bhi optimise karo" — topics, cards, sessions, the review
//   queue (due), progress, the streak, history, topic selection (single +
//   multi), search, filters, the revision summary, quick / start / complete /
//   review-again, difficulty + recall status, spaced repetition, notes, card
//   colours, statistics, completed + pending, daily activity, notifications,
//   subscription access + Premium, the bottom nav and the desktop side nav.
//
// Revision was the last feature still wearing the pack's raw material: its
// shared `Card` is a GlassSurface at tint 0.4 (a ~17% white wash), the hero
// and stat surfaces sit at 0.4–0.5, the toolbars + player footers wear the
// 10% `--dc-chrome-glass` token, and the question blocks, the review grid,
// the result chips, the section headings and the carousel dots sit bare on
// the winter scene's snow — white ink on near-white, the same "text clearly
// visible nahin hai" every other route was fixed for.
//
// Rules this contract holds the line on:
//   1. ONE material. Revision takes the same `dc-scene-plate` / `--bar` /
//      `dc-scene-field` / `dc-scene-ink` hooks Home, the store, the product
//      page and My Day take. The only new CSS is the score-hero guard and
//      the carousel-dot shadow (same numbers as Home's) — no new recipe, no
//      per-surface tuning in TS: the pinned GLASS_DOCS sensitivity and every
//      pack prop stay exactly as shipped.
//   2. Every CSS rule stays behind the glass gate, so `?glass=off` restores
//      the published material byte-for-byte.
//   3. No vendored registry item is edited to get there — dialogs and sheets
//      take the plate through the `className` passthrough the pack itself
//      ships onto its inner GlassSurface, and the dock / every BottomNav
//      stays frozen.
//   4. Behaviour is somebody else's contract: the spaced-repetition engine,
//      session/test state machines, cloud sync + device saving, the
//      subscription gates + Test Bank capacity, the exit guard, the overlay
//      maths and the AI generation pipeline keep their own tests. Nothing
//      here changes what Revision does, only what it looks like and how a
//      pointer / thumb reaches it.
//
// Honest mapping notes (what the list items ARE in this codebase):
//   • "review schedule" is the due queue + Start Smart Revision (there is no
//     calendar UI — the queue is the schedule);
//   • "upcoming revisions" are the plan carousel + ready/available saved
//     tests (there is no separate upcoming list);
//   • "revision notes" are the per-question explanations (review, result and
//     import flows) — they sit inside plated cards;
//   • "revision notifications" are the bank's error toast + the capacity /
//     subscription gates (there is no separate notification center).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const css = read("src/glass.css");
const indexCss = read("src/index.css");
const ui = read("src/revision/components/ui.tsx");
const appHeader = read("src/revision/components/AppHeader.tsx");
const revisionApp = read("src/revision/RevisionApp.tsx");
const exitGuard = read("src/revision/components/ExitGuardContext.tsx");
const limitGate = read("src/revision/components/TestBankLimitGate.tsx");
const bottomNav = read("src/revision/components/BottomNav.tsx");
const dashboard = read("src/revision/pages/DashboardPage.tsx");
const bank = read("src/revision/pages/RevisionBankPage.tsx");
const progress = read("src/revision/pages/ProgressPage.tsx");
const weak = read("src/revision/pages/WeakTopicsPage.tsx");
const session = read("src/revision/pages/RevisionSessionPage.tsx");
const player = read("src/revision/pages/TestPlayerPage.tsx");
const testResult = read("src/revision/pages/TestResultPage.tsx");
const testReview = read("src/revision/pages/TestReviewPage.tsx");
const sessionResult = read("src/revision/pages/RevisionSessionResultPage.tsx");
const aiGenerate = read("src/revision/pages/AiGeneratePage.tsx");
const aiSettings = read("src/revision/pages/AiSettingsPage.tsx");
const aiConfigForm = read("src/revision/components/AiConfigForm.tsx");
const bulkImport = read("src/revision/pages/BulkImportPage.tsx");
const profile = read("src/revision/pages/RevisionProfilePage.tsx");
const premiumGate = read("src/components/subscription/PremiumGate.tsx");
const pageTabs = read("src/components/ui/PageTabs.tsx");
const desktopShell = read("src/components/DesktopShell.tsx");

/* ------------------------------------------------------------------ */
/* 1. The panels: one central edit + the direct surfaces               */
/* ------------------------------------------------------------------ */

test("the shared Card carries the plate, and keeps the pack's own props", () => {
  // One edit plates every revision card at once (dashboard, bank, progress,
  // weak topics, results, review, generator, importer, settings).
  assert.match(ui, /className=\{`rev-card p-4 text-white dc-scene-plate \$\{className\}`\}/);
  // The material stays the pack's own — the plate is CSS at the call site.
  const cardFn = ui.slice(ui.indexOf("export function Card"), ui.indexOf("export function PrimaryButton"));
  assert.match(cardFn, /<GlassSurface tint=\{0\.4\} radius=\{20\}/);
  assert.doesNotMatch(cardFn, /blur=\{/, "Card must not tune the pack's blur per surface");
});

test("the direct GlassSurface panels wear the plate and keep their props", () => {
  const panels = [
    ["RevisionApp loading panel", revisionApp, '<GlassSurface radius={24} className="dc-scene-plate text-white/55"'],
    ["Dashboard first-revision hero", dashboard, 'className="relative flex min-h-[270px] flex-auto flex-col overflow-hidden dc-scene-plate text-white lg:min-h-[220px]"'],
    ["Dashboard plan hero", dashboard, 'className="relative flex min-h-[270px] flex-auto flex-col overflow-hidden dc-scene-plate text-white"'],
    ["Dashboard stat chip", dashboard, '<GlassSurface tint={0.4} radius={20} className="dc-scene-plate text-white"'],
    ["Bank error toast", bank, '<GlassSurface radius={20} className="dc-scene-plate text-white ring-1 ring-rose-400/30"'],
    ["Submit confirm dialog", player, 'className="dc-scene-plate custom-scrollbar relative w-full max-w-[min(100%,26rem)] overflow-hidden text-white"'],
    ["Profile hero", profile, '<GlassSurface className="dc-glass-hero dc-scene-plate relative overflow-hidden text-white lg:col-span-12"'],
    ["Profile snapshot widget", profile, '<GlassSurface tint={0.4} radius={20} className="rev-card dc-scene-plate text-white"'],
  ];
  for (const [name, source, pinned] of panels) {
    assert.ok(source.includes(pinned), `${name} never took the plate: ${pinned}`);
  }
  // No direct surface re-tunes the pinned sensitivity to "fix" contrast.
  for (const [name, source] of [["Dashboard", dashboard], ["Bank", bank], ["Player", player], ["Profile", profile]]) {
    assert.doesNotMatch(source, /tint=\{0\.(1|2|3)\d*\}/, `${name} must not retune the pack's tint`);
    assert.doesNotMatch(source, /blur=\{[1-9]/, `${name} must not add live blur (blur 0 app-wide)`);
  }
});

test("the plate is the ONE recipe — Revision added no material of its own", () => {
  assert.doesNotMatch(indexCss, /dc-scene-plate/, "the plate lives in glass.css only");
  // The shared layer rules Home shipped are what plate every surface above.
  assert.match(css, /:where\(\.dc-scene-plate\) > div\[aria-hidden\]:nth-of-type\(2\)/);
  assert.match(css, /--dc-ink-1: rgba\(255, 255, 255, 0\.97\)/);
});

test("GlassCard surfaces needed no edit — the card plate already covers them", () => {
  // Progress totals, attempt rows, the provider strip, import previews, the
  // profile launchpad, the AI allowance card and the premium offer all render
  // through GlassCard, which wears `.dc-glass-card` on every route.
  for (const [name, source] of [
    ["ProgressPage", progress],
    ["RevisionBankPage", bank],
    ["AiGeneratePage", aiGenerate],
    ["BulkImportPage", bulkImport],
    ["RevisionProfilePage", profile],
    ["PremiumGate", premiumGate],
  ]) {
    assert.match(source, /<GlassCard/, `${name} must keep rendering through the pack card`);
  }
  assert.match(read("src/components/ui/GlassCard.tsx"), /dc-glass-card/);
});

test("the score heroes keep their solid brand paint through the guard", () => {
  // White on indigo-600 / emerald-600 already clears large-text AA for the
  // score numeral, and the plate would bury the brand — so the tint layer
  // goes transparent ONLY there (rim, lift, sheen and blur-0 still apply).
  assert.match(testResult, /<Card data-rev-score-card className="bg-indigo-600 text-center text-white">/);
  assert.match(sessionResult, /<Card data-rev-score-card="emerald" className="bg-emerald-600 text-center text-white">/);
  assert.match(
    css,
    /html\[data-glass="on"\] :where\(\.dc-scene-plate\[data-rev-score-card\]\) > div\[aria-hidden\]:nth-of-type\(2\) \{\s*\n\s*background: transparent !important;/,
  );
});

test("bare question flows moved INSIDE the shared Card — no tile plate invented", () => {
  // The session + test questions, the review answer-map and the result-chip
  // grids sat bare on the scene. They moved into `Card` (the pattern
  // TestReview and the dashboard bank grid already used) instead of inventing
  // a per-tile material — the tiles keep the pack's GlassTile states.
  assert.match(session, /<Card key=\{question\.id\} className="animate-fade-in">/);
  assert.match(player, /<Card key=\{question\.id\} className="animate-fade-in">/);
  assert.match(player, /function ReviewBeforeSubmit\([\s\S]*?<Card>\s*\n\s*<p className="mb-4/, "the review grid must sit in the shared Card");
  assert.match(testResult, /<Card className="p-3">\s*\n\s*<div data-rev-result-grid/);
  assert.match(sessionResult, /<Card className="p-3">\s*\n\s*<div data-rev-result-grid/);
  assert.match(testReview, /<Card key=\{q\.id\}/, "TestReview already carded its questions — unchanged");
  // The hooks the responsive + review contracts read survived the move.
  assert.match(testResult, /data-rev-result-grid/);
  assert.match(sessionResult, /data-rev-result-grid/);
  assert.match(session, /onTouchStart=\{onTouchStart\} onTouchEnd=\{onTouchEnd\}/, "swipe stays on the scroller");
});

test("nested pack surfaces keep their lighter wash — pinned non-changes", () => {
  // The attempt-history overlay and the generator's picker panel sit INSIDE
  // plated cards. A second plate would stack to near-opaque and erase the
  // layer; the pack's own wash over the navy reads as the raised layer, and
  // their copy inherits the plate's ink lifts as descendants.
  assert.match(bank, /<GlassSurface radius=\{20\} className="absolute inset-0 z-20"/);
  assert.match(
    aiGenerate,
    /<GlassSurface radius=\{20\} className="animate-fade-in mt-2 ring-1 ring-indigo-400\/30"/,
  );
  assert.doesNotMatch(
    bank.match(/data-saved-test-attempts[\s\S]{0,400}/)?.[0] ?? "",
    /dc-scene-plate/,
    "the attempt overlay is lit by its card, not a second plate",
  );
});

test("badges, tones and washes keep their meaning over the plate", () => {
  // Difficulty / recall / spaced-repetition status is colour + text. The
  // washes tint the dark plate now instead of the snow — no tone removed.
  assert.match(ui, /learning: "bg-amber-500\/20 text-amber-200 border-amber-400\/30"/);
  assert.match(ui, /mastered: "bg-emerald-500\/20 text-emerald-200 border-emerald-400\/30"/);
  assert.match(testReview, /ring-1 ring-emerald-400\/40/);
  assert.match(testReview, /ring-1 ring-rose-400\/40/);
  assert.match(dashboard, /tones = \{ amber: "bg-amber-500\/20 text-amber-200"/);
});

/* ------------------------------------------------------------------ */
/* 2. Fields, segments, bars and loose ink                             */
/* ------------------------------------------------------------------ */

test("both bank search pills take the field hook", () => {
  assert.match(bank, /placeholder="Search saved tests" className="dc-scene-field w-full"/);
  assert.match(bank, /placeholder="Search weak questions or topics" className="dc-scene-field w-full"/);
  // The field hook never paints a tint layer: the vendored input drives its
  // focus lift by writing an inline background there.
  assert.doesNotMatch(css, /:where\(\.dc-scene-field\) > div\[aria-hidden\]:nth-of-type\(2\)/);
});

test("the five segmented controls take the store / PDP segment recipe", () => {
  assert.match(bank, /className="dc-segment dc-scene-plate flex w-full rounded-2xl p-1"/);
  assert.match(bank, /className="dc-segment dc-scene-plate shrink-0"/);
  assert.match(progress, /className="dc-segment dc-scene-plate text-xs font-semibold"/);
  assert.equal(
    aiGenerate.match(/className="dc-segment dc-scene-plate mt-2 flex w-full"/g)?.length,
    2,
    "the question-count AND time presets both need the well",
  );
  // The droplet + label re-ink the other routes pinned stays put.
  assert.match(css, /\.dc-segment > div:last-child > div\[aria-hidden\] \{/);
  assert.match(css, /:where\(\.dc-segment\)\[data-stretch\] > div\[role="group"\]/);
});

test("every revision bar wears the bar plate — chrome token untouched", () => {
  const bars = [
    ["AppHeader", appHeader, '<header data-revision-app-header className="dc-scene-plate dc-scene-plate--bar dc-glass-toolbar sticky top-0 z-20 transition-all">'],
    ["bank header", bank, '<div data-rev-bank-header className="dc-scene-plate dc-scene-plate--bar dc-glass-toolbar border-b'],
    ["bank fixed start bar", bank, '<div className="dc-scene-plate dc-scene-plate--bar dc-glass-toolbar fixed inset-x-0 bottom-[var(--dc-footer-nav-h,56px)]'],
  ];
  for (const [name, source, pinned] of bars) {
    assert.ok(source.includes(pinned), `${name} never took the bar plate`);
  }
  assert.equal(
    bank.match(/className="dc-scene-plate dc-scene-plate--bar dc-glass-toolbar sticky top-0 z-10/g)?.length,
    2,
    "both sticky search bars (saved tests + smart revision) need the bar",
  );
  assert.equal(
    player.match(/className="dc-scene-plate dc-scene-plate--bar flex gap-3 border-t border-white\/10 bg-\[var\(--dc-chrome-glass\)\]/g)?.length,
    2,
    "both player footers (question + review) need the bar",
  );
  assert.match(
    session,
    /className="dc-scene-plate dc-scene-plate--bar flex gap-3 border-t border-white\/10 bg-\[var\(--dc-chrome-glass\)\]/,
  );
  // The published chrome token is NOT retuned — the bar overrides at the
  // call site, exactly like the shared header and the store's filter bar.
  assert.match(indexCss, /--dc-chrome-glass: rgba\(60, 62, 68, 0\.105\);/);
  assert.match(indexCss, /--dc-chrome-glass-blur: saturate\(1\.15\);/);
  // The overlay + seat contracts the bars live under still read their hooks.
  assert.match(appHeader, /sticky top-0/);
  assert.match(bank, /dc-glass-toolbar sticky top-0 z-10/);
  assert.match(bank, /<div data-rev-bank-header/);
});

test("the desktop top bar and both rail variants wear the bar plate", () => {
  // The standing desktop-chrome leftover, resolved: the revision tab row and
  // the rail entries were /55 ink on a 10% tint. The bar plate beats the
  // token the same way it beats the shared header's (documented in glass.css),
  // and the tab + rail labels inherit the plate's ink lifts as descendants.
  assert.match(desktopShell, /className="dc-scene-plate dc-scene-plate--bar absolute inset-x-0 top-0 z-30 border-b border-white\/10 px-6"/);
  assert.match(
    desktopShell,
    /className="dc-scene-plate dc-scene-plate--bar sticky top-0 z-40 flex h-\[100dvh\] w-\[260px\] shrink-0 flex-col border-r border-white\/10/,
  );
  assert.match(desktopShell, /className="dc-scene-plate dc-scene-plate--bar sticky top-0 z-40 h-\[100dvh\] shrink-0 py-3 pl-3"/);
  assert.match(desktopShell, /data-desktop-topbar-row className="flex h-16 items-center gap-4"/);
});

test("the copy with no surface under it takes the ink hook", () => {
  // Weak Topics section headings + the error banner.
  for (const heading of ["Recommended for you", "All Weak Topics", "Weakest Subjects", "Most Missed Topics", "Frequently Skipped"]) {
    assert.ok(
      weak.includes(`<h2 className="dc-scene-ink mb-2 text-[15px] font-bold text-white lg:text-[14px]">${heading}</h2>`),
      `missing ink on "${heading}"`,
    );
  }
  assert.match(weak, /className="dc-scene-ink order-first flex items-center gap-2 rounded-2xl bg-rose-500\/20/);
  // Dashboard carousel hint; the empty / error / loading states (shared, so
  // every bare usage is covered, including the bank + weak-topics empties).
  assert.match(dashboard, /<p className="dc-scene-ink text-xs font-semibold text-white\/55">Swipe to change plan<\/p>/);
  assert.match(ui, /<p className="dc-scene-ink text-sm font-medium text-white\/75">\{label\}<\/p>/);
  assert.match(ui, /<h3 className="dc-scene-ink text-base font-bold text-white">\{title\}<\/h3>/);
  assert.match(ui, /<h3 className="dc-scene-ink text-base font-bold text-white">Something went wrong<\/h3>/);
  // Session: the finished notice + the answered counter under the footer.
  assert.match(session, /<p className="dc-scene-ink text-sm text-white\/75">This session has already finished\.<\/p>/);
  assert.match(session, /<p className="dc-scene-ink pb-2 text-center text-\[11px\] font-medium text-white\/55">/);
  // Generator notice + hints; result retry error.
  assert.match(aiGenerate, /<div className="dc-scene-ink rounded-xl bg-amber-500\/15 px-3 py-2\.5 text-xs font-medium leading-relaxed text-amber-200">/);
  assert.match(aiGenerate, /<p className="dc-scene-ink text-center text-\[11px\] text-white\/55">/);
  assert.match(aiGenerate, /<p className="dc-scene-ink text-center text-\[11px\] font-semibold text-amber-200">/);
  assert.match(testResult, /<p className="dc-scene-ink rounded-xl bg-amber-500\/15 px-3 py-2 text-xs font-semibold text-amber-200">/);
  // The tablet tab strip has no surface — each label carries its own ink.
  assert.match(pageTabs, /"dc-scene-ink px-3 py-1\.5 text-sm font-semibold transition-colors duration-200"/);
  assert.match(pageTabs, /className="dc-scene-ink ml-auto shrink-0 rounded-xl px-2 py-3 text-sm font-semibold text-white\/55/);
  // The ink rule itself is unchanged.
  assert.match(css, /:where\(\.dc-scene-ink\):where\(\.text-white\\\/50, \.text-white\\\/55, \.text-white\\\/60\) \{\s*\n\s*color: rgba\(255, 255, 255, 0\.86\);/);
});

test("the plan-carousel dots get Home's dot shadow, keyed off their own hook", () => {
  assert.match(dashboard, /<div data-rev-plan-dots className="mt-1\.5 flex justify-center gap-1">/);
  assert.match(
    css,
    /html\[data-glass="on"\] :where\(\[data-rev-plan-dots\]\) > span \{\s*\n\s*box-shadow: 0 1px 6px rgba\(4, 8, 18, 0\.7\);/,
  );
});

/* ------------------------------------------------------------------ */
/* 3. Overlays: dialogs, sheets, the premium gate                      */
/* ------------------------------------------------------------------ */

test("every revision dialog and sheet wears the plate through the pack passthrough", () => {
  // DialogContent / GlassSheetContent render the pack's inner GlassSurface
  // with the call site's className — the plate lands on that surface, so no
  // vendored file moves. (The premium sheet is shared with My Day: same bug,
  // same fix, one component.)
  assert.match(exitGuard, /<DialogContent aria-label="Leave this screen\?" className="dc-scene-plate">/);
  assert.match(limitGate, /<DialogContent aria-label="Test Bank notice" className="dc-scene-plate max-w-\[460px\]">/);
  assert.match(bank, /<DialogContent aria-label="Delete test" className="dc-scene-plate">/);
  assert.match(
    bank,
    /<GlassSheetContent side="bottom" aria-label="Filter and sort" className="dc-scene-plate h-auto max-h-\[85vh\]/,
  );
  assert.match(premiumGate, /className="dc-scene-plate dc-premium-modal-inner right-0 mx-auto flex h-auto min-h-0 w-full/);
  // The passthroughs the hooks rely on are the pack's own — pinned so a
  // registry refresh cannot orphan the selectors.
  const dialog = read("src/components/ui/glass-dialog.tsx");
  const sheet = read("src/components/ui/glass-sheet.tsx");
  assert.match(dialog, /className=\{cn\("relative z-10 w-full max-w-md p-6/);
  assert.match(sheet, /className=\{cn\("pointer-events-auto absolute", posClass\[side\], className\)\}/);
});

test("the AI + import forms are reached through the hooks they already wore", () => {
  // AiSettings, the generator steps and the importer render through `Card`
  // (plated centrally); their fields already wear Wave 5's `.dc-field` and
  // their pickers already wear `.dc-tile` — pinned here so a later wave does
  // not plate the forms twice.
  // AiSettings renders the shared AiConfigForm, which holds the dc-field inputs.
  assert.match(aiSettings, /<AiConfigForm/);
  for (const [name, source] of [["AiConfigForm", aiConfigForm], ["BulkImport", bulkImport]]) {
    assert.match(source, /dc-field/, `${name}'s fields must keep the shared field recipe`);
  }
  assert.match(aiConfigForm, /<GlassTile/);
  assert.match(aiGenerate, /data-rev-question-mode-grid/);
  assert.match(aiGenerate, /data-rev-no-ai-gate/);
  assert.doesNotMatch(aiConfigForm, /dc-scene-plate/, "the AI form is plated by its card");
  assert.doesNotMatch(bulkImport, /dc-scene-plate/, "the importer is plated by its cards");
  // The tile element-level blur kill + the pack's own tile states stay put.
  assert.match(css, /html\[data-glass="on"\]:not\(\[data-glass-tier="flat"\]\) :where\(\.dc-tile\) \{\s*\n\s*backdrop-filter: saturate\(1\.15\);/);
  assert.match(css, /:where\(\.dc-tile\)\[data-selected\]/);
  assert.match(css, /:where\(\.dc-tile\):not\(\[data-selected\]\)/);
});

test("the overlay maths and the sheet animation contract are untouched", () => {
  // revisionSubmitOverlayContract pins these; repeated here so this pass
  // cannot silently trade the scoping for a restyle.
  assert.match(player, /document\.querySelector<HTMLElement>\("\[data-revision-page-main\]"\)/);
  assert.match(player, /data-rev-submit-dialog/);
  assert.match(player, /maxHeight: isScoped && box \? "100%" : undefined/);
  assert.match(exitGuard, /BeforeUnloadEvent/);
  assert.doesNotMatch(css, /^\s*\.glass-dialog-in\s*\{/m);
  assert.match(css, /html\[data-glass="on"\] :where\(\.glass-dialog-in\) \{/);
});

/* ------------------------------------------------------------------ */
/* 4. Pointer parity: the two rails                                    */
/* ------------------------------------------------------------------ */

test("the status rail and the desktop tab row drag with a mouse", () => {
  assert.match(bank, /import \{ useDragScroll \} from "\.\.\/\.\.\/hooks\/useDragScroll";/);
  assert.match(bank, /const statusRail = useDragScroll<HTMLDivElement>\(\);/);
  assert.match(bank, /ref=\{statusRail\.ref\} onPointerDown=\{statusRail\.onPointerDown\} className="no-scrollbar flex gap-2 overflow-x-auto"/);
  assert.match(desktopShell, /import \{ useDragScroll \} from "\.\.\/hooks\/useDragScroll";/);
  assert.match(desktopShell, /const tabRail = useDragScroll<HTMLElement>\(\);/);
  assert.match(desktopShell, /ref=\{tabRail\.ref\}\s*\n\s*onPointerDown=\{tabRail\.onPointerDown\}/);
  // Still horizontal scrollers with hidden bars — the hook adds a pointer
  // path, it does not replace the rails.
  assert.match(desktopShell, /overflow-x-auto border-t border-white\/10 pb-1 \[scrollbar-width:none\]/);
  // They are Revision's only horizontal rails: nothing else scrolls sideways.
  for (const [name, source] of [
    ["Dashboard", dashboard],
    ["Progress", progress],
    ["WeakTopics", weak],
    ["Session", session],
    ["Player", player],
    ["TestResult", testResult],
    ["TestReview", testReview],
    ["SessionResult", sessionResult],
    ["AiGenerate", aiGenerate],
    ["AiSettings", aiSettings],
    ["BulkImport", bulkImport],
    ["Profile", profile],
  ]) {
    assert.doesNotMatch(source, /overflow-x-auto/, `${name} has no horizontal rail — this pass must not add one`);
  }
  // The dashboard carousel already drags with a mouse (framer-motion `drag`
  // listens to pointers, not just touches) — pinned so nobody "fixes" it.
  assert.match(dashboard, /drag=\{plans\.length > 1 \? "x" : false\}/);
  assert.match(dashboard, /onDragEnd=\{onDragEnd\}/);
  // The hook itself is shared and unchanged: a drag is still not a tap.
  const hook = read("src/hooks/useDragScroll.ts");
  assert.match(hook, /suppressClick\.current = state\.moved;/);
  assert.match(hook, /event\.pointerType !== "mouse" && event\.pointerType !== "pen"/);
});

/* ------------------------------------------------------------------ */
/* 5. Nothing frozen moved                                             */
/* ------------------------------------------------------------------ */

test("the vendored registry, the dock and every bottom nav are untouched", () => {
  for (const item of ["glass", "glass-input", "glass-toggle-group", "glass-tile", "glass-checkbox", "glass-toast", "glass-dialog", "glass-sheet"]) {
    const src = read(`src/components/ui/${item}.tsx`);
    assert.doesNotMatch(src, /dc-scene-(plate|ink|field)/, `${item}.tsx must stay byte-comparable`);
    assert.doesNotMatch(src, /data-drag-scrolling/, `${item}.tsx must stay byte-comparable`);
  }
  for (const file of [
    "src/components/glass-dock/GlassDock.tsx",
    "src/components/glass-dock/GlassMaterial.tsx",
    "src/components/glass-dock/GlassSidebar.tsx",
    "src/components/BottomNav.tsx",
    "src/components/myday/BottomNav.tsx",
    "src/revision/components/BottomNav.tsx",
  ]) {
    assert.doesNotMatch(read(file), /dc-scene-(plate|ink|field)/, `${file} must not carry scene hooks`);
  }
  // Revision's bottom pill IS the shared dock, so the store pass already
  // plated it and fitted it to 320px — pinned here so this pass cannot
  // double-plate it.
  assert.match(bottomNav, /<GlassDock/);
  assert.match(bottomNav, /md:hidden/);
  assert.match(css, /html\[data-glass="on"\] :where\(\[data-glass-dock\]\) \{/);
});

test("behaviour still belongs to its own contracts — spot checks", () => {
  // Spaced repetition, sessions, tests, sync, gates and the exit guard keep
  // their logic; this pass only changed material + pointer reach.
  assert.match(bank, /startRevisionSession\(uid, \{/);
  assert.match(bank, /startCustomTestRetake\(uid, testId\)/);
  assert.match(session, /submitRevisionSession\(uid, sessionId\)/);
  assert.match(player, /submitTestAttempt\(uid, attemptId\)/);
  assert.match(session, /setGuard\(\{/);
  assert.match(revisionApp, /<PremiumGate/);
  assert.match(revisionApp, /hydrateRevisionFromCloud\(uid\)/);
  assert.match(aiGenerate, /generateRevisionQuestions\(\{/);
  assert.match(weak, /startRevisionSession\(uid, \{ topicId \}\)/);
});

/* ------------------------------------------------------------------ */
/* 6. Measured: the plate over the bands Revision actually sits on     */
/* ------------------------------------------------------------------ */

test("Revision's muted ink clears AA once the plate is under it", () => {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const over = (fg, a, bg) => fg.map((c, i) => a * c + (1 - a) * bg[i]);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const white = [255, 255, 255];

  // The two scene bands the store contract measured. Revision floats on the
  // scene with no frame veil of its own (its frame is transparent past `md`).
  const bands = {
    "the winter scene's mid band": [77, 81, 93],
    "the lit snow / lake": [206, 214, 226],
  };

  for (const [band, bg] of Object.entries(bands)) {
    // BEFORE: the shared Card's ~17% white wash (tint 0.4 → 0.4*0.42) with
    // `text-white/55` on it — the state every revision card shipped in.
    const packCard = over(white, 0.4 * 0.42, bg);
    const before = ratio(over(white, 0.55, packCard), packCard);
    if (band !== "the winter scene's mid band") {
      assert.ok(before < 3, `${band}: /55 on the pack wash measured ${before.toFixed(2)}:1 — the plate would not be needed`);
    }
    // AFTER: the plate's lightest stop (alpha 0.72) over the same band, with
    // the lifted muted floor (0.76) and the primary ink (0.97).
    const plate = over([8, 14, 30], 0.72, bg);
    const muted = ratio(over(white, 0.76, plate), plate);
    const primary = ratio(over(white, 0.97, plate), plate);
    assert.ok(muted >= 4.5, `${band}: muted label on the plate measures ${muted.toFixed(2)}:1, under AA`);
    assert.ok(primary >= 7, `${band}: primary ink on the plate measures ${primary.toFixed(2)}:1, under AAA`);

    // The score heroes keep brand paint: the large numeral (text-5xl) must
    // clear large-text AA (3:1) on both.
    for (const [name, paint] of [["indigo-600", [79, 70, 229]], ["emerald-600", [5, 150, 105]]]) {
      const score = ratio(white, paint);
      assert.ok(score >= 3, `${band}: the score numeral on ${name} measures ${score.toFixed(2)}:1, under large-text AA`);
    }
  }
});

test("both new CSS rules are gated, so ?glass=off restores the pack", () => {
  const lines = css.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes("[data-rev-score-card]") && !lines[i].includes("[data-rev-plan-dots]")) continue;
    if (!lines[i].includes("{")) continue;
    assert.match(
      lines[i],
      /^html\[data-glass="on"\]/,
      `a Revision rule escaped the glass gate: ${lines[i].slice(0, 90)}`,
    );
  }
  assert.ok(css.includes('[data-rev-score-card]'), "the score-hero guard is missing");
  assert.ok(css.includes('[data-rev-plan-dots]'), "the carousel-dot rule is missing");
});
