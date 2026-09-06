// tests/myDayScenePlateContract.test.mjs
//
// Contract for the 2026-09-06 owner follow-up after Home, the store, the
// product page and the mobile footer dock:
//
//   "Abb my day ke sabhi pages aur yeh sabhi cheese optimise karo" — tasks
//   (status / completion / deletion), the daily schedule, reminders, quick
//   notes, today's completed + total tasks and the streak, the create menu,
//   cloud sync and device saving, subscription access / the daily free
//   creation limit / Premium, the overview, home + bottom + side navigation,
//   toast notifications, confirmation dialogs, the task and schedule modals,
//   highlighted items, and search through tasks and notes.
//
// My Day was the last big feature area still wearing the pack's raw material:
// every panel is a GlassSurface at tint 0.5 / blur 14, the search pills are
// GlassInput at tint 0.4, the two modals are `glass-dialog-in` sheets at tint
// 0.5, and from 1024px up the whole frame sits on a 55% WHITE veil
// (`[data-myday-frame]`, src/glass.css) over the winter scene. The ink on 47 of
// its labels is `text-white/55`, which measures 1.10:1 on that veil and 1.24:1
// on the lit snow — the same "text clearly visible nahin hai" the other routes
// were fixed for.
//
// Rules this contract holds the line on:
//   1. ONE material. My Day takes the same `dc-scene-plate` / `--bar` /
//      `dc-scene-field` / `dc-scene-ink` hooks Home, the store and the product
//      page take. No new recipe, no per-surface tuning in TS: the pinned
//      GLASS_DOCS sensitivity and every pack prop stay exactly as shipped.
//   2. Every CSS rule stays behind the glass gate, so `?glass=off` restores the
//      published material byte-for-byte.
//   3. No vendored registry item is edited to get there — the toast plate is
//      keyed off the hooks `glass-toast` itself ships (`z-[1000]` container,
//      `role="status"` card), and the dock / BottomNav stay frozen.
//   4. Behaviour is somebody else's contract: CRUD, sync + device saving, the
//      subscription gates, the notification deep-link highlight, the overlay
//      maths and the create-menu drop-up all keep their own tests. Nothing here
//      changes what My Day does, only what it looks like and how a pointer /
//      thumb reaches it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const css = read("src/glass.css");
const indexCss = read("src/index.css");
const myDay = read("src/MyDayApp.tsx");
const greeting = read("src/components/myday/GreetingHeader.tsx");
const createMenu = read("src/components/myday/CreateMenu.tsx");
const sideNav = read("src/components/myday/SideNav.tsx");
const taskList = read("src/components/myday/TaskList.tsx");
const taskItem = read("src/components/myday/TaskItem.tsx");
const taskModal = read("src/components/myday/TaskModal.tsx");
const scheduleModal = read("src/components/myday/ScheduleModal.tsx");
const timeline = read("src/components/myday/Timeline.tsx");
const reminders = read("src/components/myday/Reminders.tsx");
const quickNotes = read("src/components/myday/QuickNotes.tsx");
const modal = read("src/components/ui/Modal.tsx");
const confirmDialog = read("src/components/ui/ConfirmDialog.tsx");
const toastBridge = read("src/components/ui/Toast.tsx");
const glassToast = read("src/components/ui/glass-toast.tsx");

const PANELS = [
  ["GreetingHeader.tsx", greeting, 'className="dc-scene-plate relative overflow-hidden text-white"'],
  ["QuickNotes.tsx", quickNotes, '<GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">'],
  ["Reminders.tsx", reminders, '<GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">'],
  ["TaskList.tsx", taskList, '<GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">'],
  ["Timeline.tsx", timeline, '<GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">'],
  ["SideNav.tsx", sideNav, 'className="dc-scene-plate text-white"'],
  ["CreateMenu.tsx", createMenu, 'className="dc-create-menu dc-scene-plate relative mx-auto w-full max-w-[calc(100vw-2rem)]"'],
];

/* ------------------------------------------------------------------ */
/* 1. The panels                                                      */
/* ------------------------------------------------------------------ */

test("every My Day panel wears the shared plate, and keeps its pack props", () => {
  for (const [name, source, pinned] of PANELS) {
    assert.ok(source.includes(pinned), `${name} never took the plate: ${pinned}`);
    // The material stays the pack's own — the plate is CSS at the call site.
    assert.doesNotMatch(source, /tint=\{0\.\d+\}/, `${name} must not tune the pack's tint per surface`);
    assert.doesNotMatch(source, /blur=\{/, `${name} must not tune the pack's blur per surface`);
  }
});

test("the plate is the ONE recipe — My Day added no material of its own", () => {
  // Every surface above is plated by the rules Home / the store already ship.
  // The only new CSS in this pass is the toast stack (section 4), the tile's
  // element-level blur kill (section 3) and the textarea placeholder — which the
  // pinned `input::placeholder` selector forbade extending in place.
  assert.doesNotMatch(indexCss, /dc-scene-plate/, "the plate lives in glass.css only");
  assert.match(css, /:where\(\.dc-scene-plate\) > div\[aria-hidden\]:nth-of-type\(2\)/);
  assert.match(css, /:where\(\.dc-scene-field\) textarea::placeholder \{\s*\n\s*color: rgba\(255, 255, 255, 0\.66\);/);
});

/* ------------------------------------------------------------------ */
/* 2. Fields, segments, chrome and loose ink                          */
/* ------------------------------------------------------------------ */

test("search — global and per-page — takes the field hook", () => {
  // The phone search strip in the page chrome.
  assert.match(myDay, /className="dc-scene-field w-full"/);
  // Tasks and Notes each have their own search pill.
  assert.match(taskList, /cn\("dc-scene-field min-w-0 flex-1", isSearchActive && "ring-2 ring-indigo-400\/30 rounded-full"\)/);
  assert.match(quickNotes, /cn\("dc-scene-field min-w-0 flex-1", isSearchActive && "rounded-full ring-2 ring-rose-400\/30"\)/);
  // The Quick Notes composer is a WELL (a GlassSurface around a bare textarea),
  // so it takes the field hook rather than stacking a second plate: both the
  // expanded big editor and the collapsed strip.
  assert.equal(
    quickNotes.match(/dc-scene-field mb-4 transition-all focus-within:ring-2 focus-within:ring-rose-400\/30/g)?.length,
    2,
    "both composer wells (big editor + collapsed strip) need the rim",
  );
  // The field hook never paints a tint layer: the vendored input drives its
  // focus lift by writing an inline background there.
  assert.doesNotMatch(css, /:where\(\.dc-scene-field\) > div\[aria-hidden\]:nth-of-type\(2\)/);
});

test("the segmented controls take the store / PDP segment recipe", () => {
  assert.match(taskList, /cn\("dc-segment dc-scene-plate shrink-0", globalSearch && "opacity-50"\)/);
  assert.equal(
    taskModal.match(/className="dc-segment dc-scene-plate flex w-full"/g)?.length,
    2,
    "the task modal's Priority AND Status groups both need the well",
  );
  // The droplet + label re-ink the other routes already pinned stays put.
  assert.match(css, /\.dc-segment > div:last-child > div\[aria-hidden\] \{/);
  assert.match(css, /:where\(\.dc-segment\)\[data-stretch\] > div\[role="group"\]/);
});

test("the phone search strip is chrome, so it wears the bar plate", () => {
  assert.match(
    myDay,
    /className="dc-scene-plate dc-scene-plate--bar animate-slideUp border-b border-white\/10 bg-\[var\(--dc-chrome-glass\)\]/,
  );
  // The published chrome token is NOT retuned to get the contrast — the bar
  // plate overrides at the call site, exactly like the shared header and the
  // store's filter bar.
  assert.match(indexCss, /--dc-chrome-glass: rgba\(60, 62, 68, 0\.105\);/);
  assert.match(indexCss, /--dc-chrome-glass-blur: saturate\(1\.15\);/);
});

test("the copy with no surface under it takes the ink hook", () => {
  // The create menu's caption floats on the scene under the "+" button.
  assert.match(createMenu, /<p className="dc-scene-ink mt-3 text-sm font-semibold text-white\/55 md:text-base">/);
  // Cloud sync / device saving: "Saving My Day…", "Syncing My Day…" and the two
  // "Saved on this device" fallbacks — the only loose line on the page, and the
  // one that tells the learner their data is safe.
  assert.match(
    myDay,
    /cloudSyncFailed \? "dc-scene-ink text-\[11px\] font-bold text-amber-200" : "dc-scene-ink text-\[11px\] font-semibold text-white\/55"/,
  );
  assert.match(css, /:where\(\.dc-scene-ink\):where\(\.text-white\\\/50, \.text-white\\\/55, \.text-white\\\/60\) \{\s*\n\s*color: rgba\(255, 255, 255, 0\.86\);/);
});

/* ------------------------------------------------------------------ */
/* 3. Overlays: the task modal, the schedule modal, confirmations      */
/* ------------------------------------------------------------------ */

test("the shared sheet and the confirm dialog wear the plate", () => {
  // One edit, every overlay: TaskModal, ScheduleModal and the reminder editor
  // all render through `Modal`; every delete confirmation through
  // `ConfirmDialog`.
  assert.match(modal, /"dc-scene-plate glass-dialog-in relative flex w-full flex-col overflow-hidden text-white"/);
  assert.match(
    confirmDialog,
    /className="dc-scene-plate glass-dialog-in relative max-h-full w-full max-w-sm overflow-hidden text-white"/,
  );
  for (const [name, source] of [["TaskModal", taskModal], ["ScheduleModal", scheduleModal], ["Reminders", reminders]]) {
    assert.match(source, /from "\.\.\/ui\/Modal"/, `${name} must keep going through the shared sheet`);
  }
  assert.match(myDay, /import ConfirmDialog from "\.\/components\/ui\/ConfirmDialog"/);
});

test("the overlay maths and the sheet's own contract are untouched", () => {
  // myDayOverlayDesktopRailContract pins these; repeated here so this pass
  // cannot silently trade the rail-aware scoping for a restyle.
  assert.match(modal, /useOverlayBox\(open, resolvedBounds\)/);
  assert.match(confirmDialog, /useOverlayBox\(open, boundsRef\)/);
  assert.match(modal, /borderRadius: "var\(--glass-sheet-radius\)"/);
  // The sheet animation rules stay gated, and no un-gated `.glass-dialog-in`
  // rule appeared (liquidGlassWaveOneContract's admin leak guard).
  assert.doesNotMatch(css, /^\s*\.glass-dialog-in\s*\{/m);
  assert.match(css, /html\[data-glass="on"\] :where\(\.glass-dialog-in\) \{/);
});

test("the schedule + reminder forms are reached through the hooks they already wore", () => {
  // Neither file needed a plate of its own: both render through `Modal` (plated
  // above), their fields already wear Wave 5's `.dc-field`, and ScheduleModal's
  // event-type picker already wears `.dc-tile`. The pass reaches them through
  // the sheet — pinned here so a later wave does not plate the form twice.
  for (const [name, source] of [["ScheduleModal", scheduleModal], ["Reminders", reminders], ["TaskModal", taskModal]]) {
    assert.match(source, /from "\.\.\/ui\/Modal"/, `${name} must keep rendering through the shared sheet`);
    assert.match(source, /dc-field/, `${name}'s fields must keep the shared field recipe`);
  }
  // Nothing inside a sheet takes a second plate. ScheduleModal's whole body is
  // the sheet; Reminders' one plate is its page panel (its add/edit form is a
  // sheet); the task modal's only two are the segmented controls, which need a
  // well of their own — the pack's 35% tint group has no boundary on a plate.
  assert.doesNotMatch(scheduleModal, /dc-scene-plate/, "the schedule form is plated by its sheet");
  assert.equal(
    reminders.match(/className="dc-scene-plate text-white"/g)?.length,
    1,
    "the Reminders page panel takes the plate — the form inside its sheet does not",
  );
  assert.equal(taskModal.match(/className="dc-segment dc-scene-plate flex w-full"/g)?.length, 2, "only the Priority and Status segments");
  assert.equal(
    scheduleModal.match(/dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all/g)?.length,
    4,
    "the event title / start / end / detail fields keep the shared recipe",
  );
  assert.match(
    scheduleModal,
    /className=\{cn\("dc-tile aspect-auto min-h-\[68px\] rounded-xl px-2 py-3 text-xs font-semibold", active && et\.color\)\}/,
  );
  // The tile is not a layered surface — the pack puts `backdrop-blur-md` on the
  // button itself — so the owner's blur-0 override is written at element level.
  assert.match(css, /html\[data-glass="on"\]:not\(\[data-glass-tier="flat"\]\) :where\(\.dc-tile\) \{\s*\n\s*backdrop-filter: saturate\(1\.15\);/);
  // The pack's own tile states (Wave 3/4) stay as they were.
  assert.match(css, /:where\(\.dc-tile\)\[data-selected\]/);
  assert.match(css, /:where\(\.dc-tile\):not\(\[data-selected\]\)/);
});

/* ------------------------------------------------------------------ */
/* 4. Toasts                                                          */
/* ------------------------------------------------------------------ */

test("the toast stack is plated from CSS — the vendored card never moved", () => {
  // Provenance + the inline paint the plate now overrides.
  assert.match(glassToast, /^\/\/ Glass Toast — AI Canvas design/m);
  assert.match(glassToast, /background: onLightSurface \? "rgba\(18,18,24,0\.78\)" : "rgba\(255,255,255,0\.06\)"/);
  assert.match(glassToast, /backdropFilter: "blur\(24px\) saturate\(1\.8\)"/);
  // The two hooks the CSS keys off are the pack's own, and stay pinned here so
  // the selector cannot be orphaned by a registry refresh.
  assert.match(glassToast, /"pointer-events-none fixed z-\[1000\] flex gap-3 sm:w-\[380px\]"/);
  assert.match(glassToast, /role="status"/);
  assert.doesNotMatch(glassToast, /dc-scene-(plate|ink|field)/, "glass-toast.tsx must stay byte-comparable");

  // The plate: same navy, same rim, blur 0, and the `/50` description lifted to
  // the plate's muted floor.
  assert.ok(css.includes('html[data-glass="on"] :where(.z-\\[1000\\]) [role="status"] {'), "the toast plate rule is missing");
  assert.ok(css.includes('html[data-glass="on"]:not([data-glass-tier="flat"]) :where(.z-\\[1000\\]) [role="status"] > div[aria-hidden] {'), "the toast blur kill is missing");
  assert.ok(css.includes(':where(.z-\\[1000\\]) [role="status"] :where(.text-white\\/50)'), "the toast description lift is missing");
  const toastRule = /:where\(\.z-\\\[1000\\\]\) \[role="status"\] \{([^}]*)\}/.exec(css)?.[1];
  assert.ok(toastRule, "expected the toast plate rule body");
  assert.match(toastRule, /rgba\(12, 20, 40, 0\.78\) 0%/);
  assert.match(toastRule, /rgba\(8, 14, 30, 0\.72\) 55%/);
  assert.match(toastRule, /rgba\(6, 11, 24, 0\.76\) 100%/);
  assert.match(toastRule, /inset 0 1px 0 rgba\(255, 255, 255, 0\.34\)/);
  // A descendant selector, not a child: `AnimatePresence mode="popLayout"` owns
  // the tree between the container and the card.
  assert.match(glassToast, /mode="popLayout"/);

  // My Day's toasts still reach that stack through the app's prop-driven bridge.
  assert.match(toastBridge, /from "\.\/glass-toast"/);
  assert.match(toastBridge, /pushGlassToast\(\{ title: t\.text, variant: variantOf\[t\.type\] \}\)/);
  assert.match(myDay, /<Toast toasts=\{toasts\} onRemove=\{removeToast\} \/>/);
});

test("every toast rule is gated, so ?glass=off restores the pack card", () => {
  const lines = css.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes("z-\\[1000\\]")) continue;
    if (!lines[i].trim().endsWith("{") && !lines[i].includes("{")) continue;
    assert.match(
      lines[i],
      /^html\[data-glass="on"\]/,
      `a toast rule escaped the glass gate: ${lines[i].slice(0, 90)}`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 5. Pointer parity: the chip rail and the row actions                */
/* ------------------------------------------------------------------ */

test("the task filter rail gives a mouse what a thumb already had", () => {
  assert.match(taskList, /import \{ useDragScroll \} from "\.\.\/\.\.\/hooks\/useDragScroll";/);
  assert.match(taskList, /const filterRow = useDragScroll<HTMLDivElement>\(\);/);
  assert.match(taskList, /ref=\{filterRow\.ref\}/);
  assert.match(taskList, /onPointerDown=\{filterRow\.onPointerDown\}/);
  // Still a horizontal scroller with a hidden bar — the hook adds a pointer
  // path, it does not replace the row.
  assert.match(taskList, /overflow-x-auto px-4 pt-3\.5 pb-1 sm:px-6 hide-scrollbar/);
  // It is My Day's only horizontal rail.
  for (const [name, source] of [["Timeline", timeline], ["Reminders", reminders], ["QuickNotes", quickNotes], ["SideNav", sideNav]]) {
    assert.doesNotMatch(source, /overflow-x-auto/, `${name} has no horizontal rail — this pass must not add one`);
  }
  // The hook itself is shared and unchanged: a drag is still not a tap.
  const hook = read("src/hooks/useDragScroll.ts");
  assert.match(hook, /suppressClick\.current = state\.moved;/);
  assert.match(hook, /event\.pointerType !== "mouse" && event\.pointerType !== "pen"/);
});

test("row actions hide only where a pointer can hover", () => {
  // `sm:opacity-0 sm:group-hover:opacity-100` hid Edit / Delete on every screen
  // from 640px up — which includes touch tablets, where there is no hover to
  // reveal them with. Gating the hide on `(hover: hover)` keeps the desktop
  // reveal and leaves a thumb (and a stylus) the buttons always on screen.
  for (const [name, source] of [
    ["TaskItem.tsx", taskItem],
    ["Timeline.tsx", timeline],
    ["Reminders.tsx", reminders],
    ["QuickNotes.tsx", quickNotes],
  ]) {
    assert.ok(
      source.includes("[@media(hover:hover)]:sm:opacity-0 sm:group-hover:opacity-100"),
      `${name} must gate its hide-until-hover step on (hover: hover)`,
    );
    assert.ok(!source.includes(" sm:opacity-0"), `${name} still hides its row actions unconditionally`);
  }
  // Deletion stays reachable by tap on the cards themselves, too.
  assert.match(timeline, /aria-label=\{`Edit event: \$\{event\.title\}`\}/);
  assert.match(reminders, /aria-label=\{`Edit reminder: \$\{rem\.text\}`\}/);
});

/* ------------------------------------------------------------------ */
/* 6. Nothing frozen moved                                            */
/* ------------------------------------------------------------------ */

test("the vendored registry, the dock and both bottom navs are untouched", () => {
  for (const item of ["glass", "glass-input", "glass-toggle-group", "glass-tile", "glass-checkbox", "glass-toast"]) {
    const src = read(`src/components/ui/${item}.tsx`);
    assert.doesNotMatch(src, /dc-scene-(plate|ink|field)/, `${item}.tsx must stay byte-comparable`);
    assert.doesNotMatch(src, /data-drag-scrolling/, `${item}.tsx must stay byte-comparable`);
  }
  for (const file of [
    "src/components/glass-dock/GlassDock.tsx",
    "src/components/glass-dock/GlassMaterial.tsx",
    "src/components/BottomNav.tsx",
    "src/components/myday/BottomNav.tsx",
  ]) {
    assert.doesNotMatch(read(file), /dc-scene-(plate|ink|field)/, `${file} must not carry scene hooks`);
  }
  // My Day's bottom pill IS the shared dock, so Phase 2/3 already plated it and
  // fitted it to 320px — pinned here so this pass cannot double-plate it.
  assert.match(read("src/components/myday/BottomNav.tsx"), /<GlassDock/);
  assert.match(css, /html\[data-glass="on"\] :where\(\[data-glass-dock\]\) \{/);
  // The PremiumGate (subscription access, the daily free limit, Premium) is a
  // GlassCard, which Phase 1 plates on every route.
  assert.match(read("src/components/subscription/PremiumGate.tsx"), /<GlassCard/);
  assert.match(read("src/components/ui/GlassCard.tsx"), /dc-glass-card/);
});

/* ------------------------------------------------------------------ */
/* 7. Measured: the plate over the bands My Day actually sits on       */
/* ------------------------------------------------------------------ */

test("My Day's muted ink clears AA once the plate is under it", () => {
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

  // The two scene bands the store contract measured, plus My Day's own: from
  // 1024px up `[data-myday-frame]` lays `rgb(255 255 255 / 0.55)` over the
  // scene, so a desktop learner reads every panel against near-white.
  const snow = [206, 214, 226];
  const bands = {
    "the winter scene's mid band": [77, 81, 93],
    "the lit snow / lake": snow,
    "the desktop frame veil over the snow": over(white, 0.55, snow),
  };

  for (const [band, bg] of Object.entries(bands)) {
    // BEFORE: `text-white/55` straight on the band — 47 labels in My Day.
    const before = ratio(over(white, 0.55, bg), bg);
    if (band !== "the winter scene's mid band") {
      assert.ok(before < 3, `${band}: /55 measured ${before.toFixed(2)}:1 — the plate would not be needed`);
    }
    // AFTER: the plate's lightest stop (alpha 0.72) over the same band, with
    // the lifted muted floor (0.76) and the primary ink (0.97).
    const plate = over([8, 14, 30], 0.72, bg);
    const muted = ratio(over(white, 0.76, plate), plate);
    const primary = ratio(over(white, 0.97, plate), plate);
    assert.ok(muted >= 4.5, `${band}: muted label on the plate measures ${muted.toFixed(2)}:1, under AA`);
    assert.ok(primary >= 7, `${band}: primary ink on the plate measures ${primary.toFixed(2)}:1, under AAA`);

    // The toast: BEFORE it is a 6% white veil, where even the /90 title fails
    // on the bright bands; AFTER it wears the plate with its /50 description
    // lifted to 0.76.
    const packToast = over(white, 0.06, bg);
    const toastTitleBefore = ratio(over(white, 0.9, packToast), packToast);
    const toastBodyBefore = ratio(over(white, 0.5, packToast), packToast);
    if (band !== "the winter scene's mid band") {
      assert.ok(toastTitleBefore < 3, `${band}: the pack toast title measured ${toastTitleBefore.toFixed(2)}:1`);
    }
    assert.ok(toastBodyBefore < 4.5, `${band}: the pack toast description measured ${toastBodyBefore.toFixed(2)}:1`);
    const toastBody = ratio(over(white, 0.76, plate), plate);
    assert.ok(toastBody >= 4.5, `${band}: the plated toast description measures ${toastBody.toFixed(2)}:1, under AA`);
  }
});
