# WORK MODE — deep-research design & implementation plan

Status: **the original design plan; implementation has since advanced through Phases 0–5.** Current verification and outstanding device sign-off items are tracked in `WORK_MODE_REPORT.md`. This document records the original repository research and product specification, so implementation details can differ where the code now has a safer or more isolated path (for example, Work Revision uses its own Work-prefixed snapshot and score keys rather than the proposed cloud-bootstrap seam).

The baseline research below was read from commit `8aba02e` plus the two design
references supplied for the work (`recreate-obsidian-notes-design.zip` in the
repo root, and https://uiverse.io/asgardOP/great-badger-21).

Owner brief (2026-10-14, verbatim asks, split into numbered requirements):

> 1. "Feature add karo desktop per header per button add karo work ke naam se ek
>    button, aur mobile users ke liye footer navigation mein jo cross icon hai
>    use per click karne per jo drop down open hota hai usmein … uska naam work
>    mode likhna."
> 2. "Starting mein user se jaise hi app open ho … ek beautiful card ke andar
>    option do … clean simple design … ek button hoga home ka … dusra hoga work."
> 3. "User ke pass setting mein option bhi hona chahiye ki vah app open hote hi
>    yah dekhna chahta hai ki nahin."
> 4. "Work per click karne per ek naya environment open hoga jahan per course
>    player ka mind map, notes, sketch, AI, my day aur revision — itni sari
>    cheezen ek jagah hongi."
> 5. "Feature pura storage based hoga, sab storage mein save hoga, kuchh bhi
>    cloud per nahin."
> 6. "[uiverse great-badger-21] footer navigation ka yah naya design add kiya
>    jaaye aur ismein button ko replace kiya jaaye aur sabhi button add kiye
>    jaayen."
> 7. "Yahan per course player jaisa split mode hoga aur default last opened page
>    dikhega … ful screen mein footer navigation ke sath, aur sabhi page ful
>    screen mein open honge … divider bye default hamesha top per hoga … user
>    upar se divider line ko kheech kar kahin bhi adjust kar sakta hai … agar
>    already do pages split mode mein open hain to teesra page niche wale area
>    mein open hoga, matlab secondary area ko replace kar dega."
> 8. "Mobile users ke liye simple keval swap ka button dikhta hai divider per
>    click karne per"; desktop/badi screen ke liye course-player wale rules
>    (1/2/3/4 pane splits) tabhi enable hon jab bada size detect ho.
> 9. My Day: "clean design … library open hogi jahan sabhi saved task strip card
>    mein dikhenge rectangular, upar header mein apna header hoga home page ka,
>    uske niche filter button honge horizontal rail mein (task, scheduled,
>    reminder etc), niche plus ka button … editor mein home page ka header nahin
>    hoga, bottom mein toolbar hoga [uploaded file ka exact design], bus button
>    replace kar dena hai apne my day editor ke buttons … exact styling, exact
>    height, vaise hi text formatting support, vaise hi sare rules."
> 10. My Day editor header: "koi header design nahin, simple header ka area fix
>     kar dena hai, right side save aur tick(save) — donon icon; left side ek
>     single button 3 lines wala jis per click karne per side panel [exact design
>     zip se] … edit mode by default nahin open hoga, tick button read button
>     mein bhi convert ho jaega, double tap per edit on hoga aur tabhi toolbar
>     dikhega, otherwise footer navigation mein keval delete aur back."
> 11. Notes: "already toolbar hai, bus vahi full text formatting support dena
>     hai, design pura use kar sakte ho."
> 12. Mind map / Sketch: "vahi course player wala exact design … header mein
>     button wahi, toolbar mein button replace honge … sketch ka sab exact
>     toolbar styling, bus cloud saving nahin, sab user ke storage mein."
> 13. "Notes library bhi aur mindmap library exact design follow karenge jaisa
>     course player ka hai."
> 14. Revision: "simple revision dashboard, clean design, page ke beech mein
>     options — make revision sets, make with AI, direct import, aur library
>     (footer navigation ke just upar) … library page per simple rectangular
>     strip design with pencil and delete icon … click per do options —
>     slidable aur convertible … slidable = brain page wala slide MCQ card
>     (slide skip, tick → auto next, submit/revise, answer review) … convertible
>     = revision deck card style interface, revision wala sara system, lekin
>     submit aur answer review brain wale style mein … self create per ek naya
>     page: do headings (deck style + visual mockup, brain style + visual
>     mockup) aur instruction 'click your favourite deck styling to create your
>     own revision cards', click per corresponding building interface."
> 15. "Mind map editor, note editor, sketch editor aur deck/brain card page per
>     home page header nahin dikhna chahiye — bus header ka area decide karke
>     button place kar dena hai; right side button se direct library dekh sake,
>     naya create kar sake."
> 16. "Light aur dark theme rakhna donon."
> 17. "Annecessary button aur cheezein remove kar dena jo related nahin hain."

---

## 1. What already exists (the research this plan stands on)

### 1.1 Routing / shell (`src/main.tsx`, 2249 lines)

* ONE hash router inside `RootPage()`; every screen is a `lazyRoute(() => import(...))`
  chunk (`src/utils/lazyRoute.ts`) and the active route's chunk is preloaded at
  boot (`routeChunkFor(hash)`, line 625).
* Route constants live at lines 232–280 (`HOME_HASH`, `MY_DAY_HASH`, `REVISION_HASH`,
  `COURSE_HASH`, dev previews `#/dev/brain-deck`, `#/dev/mindmap-preview`, …).
* `Root` (line ~740) **skips the desktop shell** for routes that own their own
  full-screen chrome: `#/course/`, `#/checkout`, `#/auth`, `#/admin*`,
  `isMyCoursePlayerRoute`, `#/landing`, dev previews. → **`#/work` joins this list.**
* First screen: `landingRouteRequested` (empty hash or `#/landing`) →
  `skipLandingForInstalledApp` (installed PWA/Capacitor) rewrites the hash to
  `#/home` in an effect (line 922) and `showHomeShellImmediately` paints Home
  before the catalog resolves (line 1695). → **This is the exact seam where the
  Home/Work chooser card goes.**
* Protected routes: `AUTH_REQUIRED_PREFIXES` in `src/utils/appRoutes.ts`.
* Theme: `initThemeMode()` runs at module scope (line 56) — and
  `src/lib/theme.ts` is **light-only by owner decision**: `resolveDocumentTheme()`
  returns `"light"` unconditionally, `applyDocumentTheme()` forces
  `data-theme="light"`, `setThemeMode()` writes `"light"` regardless of the
  argument. The Course Player is pinned light too
  (`src/course/playerPreferences.tsx` → `loadCourseTheme()` always returns
  `"light"`). → **Work mode's dark theme must be SCOPED to the Work shell, never
  global** (see §7).

### 1.2 The Split Deck — the layout Work mode reuses

`src/course/studyPanels.tsx` (1505 lines) + `src/course/splitMotion.ts` (300 lines).

* `SplitDeck` renders exactly three flex children: **lesson pane**, `SplitDivider`,
  **study pane**. `ratio` (a framer-motion `MotionValue`) is *the study pane's
  percent*; `flexGrow` is written straight to the DOM during a drag (no React
  re-render per frame).
* Pane slotting is a **pure flex `order` swap** (`swapped`): `lesson.order =
  swapped ? 2 : 0`, `study.order = swapped ? 0 : 2`, divider always `order: 1`.
  Nothing remounts on swap — that is pinned by
  `tests/coursePlayerSplitSwapRuntime.test.mjs`.
* Persistence (localStorage, per course + axis):
  `dc.splitDeck.ratio.v1:<courseId>:<axis>`, `…collapsed.v1…`, `…swapped.v1:<courseId>`,
  `dc.splitDeck.extras.v1:<courseId>:<axis>` — with defensive readers that fall
  back to defaults on any parse failure.
* Constants: `SPLIT_MIN 15` / `SPLIT_MAX 85`, phone-portrait floor
  `SPLIT_SMALL_SCREEN_MIN 30`, snap points `[20,35,50,65,80]`,
  `SNAP_TOLERANCE 3`, `FILL_THRESHOLD 8` (drag within 8% of an edge → collapse to
  rail), `PEEK_RAIL_PX 28`, `DIVIDER_HIT 10`, `DIVIDER_LINE "#FFBE0B"`,
  springs `SPRING_SETTLE {300,30}` / `SPRING_ENTRY {260,26,0.9}`,
  `EASE_OUT cubic-bezier(0.22,1,0.36,1)`.
* Divider interaction: tap (≤ `SWAP_TAP_SLOP_PX 6`, ≤ `SWAP_TAP_MS 400`) reveals a
  22px round **swap** button (`SWAP_BUTTON_PX`, `SWAP_ICON_PX 12`) that fades
  after `SWAP_HINT_MS 3600`; drag owns the pointer; double-click / `Enter` =
  50/50; arrows / Home / End / `s` on the keyboard.
* **Big-stage-only extra panes** already exist: `wide = renderExtraPane ?
  deckWidth >= SPLIT_WIDE_MIN_PX (900) : false`. `mainActions` adds
  "split the lesson area" / "split the study area" (`PanelLeft/Right/Top/Bottom`);
  `ExtraPaneRegion` gives each region a 3rd pane with its own divider, merge (X)
  and swap; `SplitExtras` is persisted per course+axis. On a phone-sized stage
  `renderExtraPane` is not passed at all → **only the swap button exists**, which
  is exactly requirement 8.
* Keyboard takeover: `keyboardExpandEnabled` + `useCourseKeyboard()` → the
  writing pane takes the whole deck while a soft keyboard is open.
* CSS the deck depends on is **scoped to `.course-player-shell`** in
  `src/index.css` (lines ~1745–1845): the divider's invisible `::after` grab
  extension (±10px), the compressed-pane lean shadows, the solid study plate,
  peek-rail reduced-motion rules. → Work mode needs the same rules re-scoped to
  `.work-shell` (§5.3), otherwise the divider has no finger grab area.

### 1.3 The panels Work mode hosts (all already prop-driven, all local-first)

| Feature | Panel component | State hook | Storage today |
| --- | --- | --- | --- |
| Notes | `src/course/NotesPanel.tsx` (library grid + composer) and `src/course/NoteEditor.tsx` (BlockNote) + `NoteEditorToolbar.tsx` | `useCourseNotes({uid, productId})` | Firestore `users/{uid}/notes/{id}` **plus** a full localStorage mirror `dc.courseNotes.<uid>.<productId>` + tombstones `dc.courseNotesDeleted.v1…` (`src/course/notesStore.ts`) |
| Mind map | `src/course/MindMapPanel.tsx` (126 kB, `@xyflow/react`, lazy) — library grid + canvas + toolbar | `useCourseMindMap({uid, productId, moduleId})` | Firestore doc + localStorage mirror `dc.mindMap.v1.<uid>.<product>.<module>.<mapKey>`, index `dc.mindMapIndex.v1…`, active `dc.mindMapActive.v1…` |
| Sketch | `src/course/SketchPanel.tsx` (Excalidraw, lazy) | `useCourseSketch({uid, productId, moduleId})` + `useSketchLibrary({uid})` | Firestore `users/{uid}/sketches` + `sketchLibraries/main`, localStorage mirror per board + outbox |
| AI | `src/lumen/App.tsx` (`LumenChat`, lazy) — props `{uid, productId, courseTitle, moduleId, notes, profile}` | `useLumenChats` | Firestore `users/{uid}/aiChats/{chatId}` + local mirror (`src/lumen/cloudChats.ts`) |
| Brain / MCQ deck | `src/course/CourseBrainPanel.tsx` → `src/course/BrainQuestionDeck.tsx` (the AI-Canvas "product card deck" port) | none (props only) | **already device-only**: scores in `localStorage["dc:courseBrain:<productId>"]` |
| Revision | ported **Recall** app under `src/revision/recall/**` + DC pages under `src/revision/pages/**` | `src/revision/engine/localDb.ts` (Dexie `digitalcatalyst-revision`: `kv`, `media`, `syncQueue`) + `engine/store.ts` (localStorage `RevisionDb`) | local-first **plus** cloud hydration/persistence, which already has an off-switch: `dcxRepository.persistUnified(..., { cloud: false })` |
| My Day | `src/MyDayApp.tsx` is only an adapter — the real UI is **Joplin's own web build in an iframe** (`/my-day-workspace/index.html`, a CI artifact that is *absent in this checkout*), data in Firestore `users/{uid}/joplin*` | — | cloud |

Consequences for Work mode:

* Notes / Mind map / Sketch / AI need **one additive flag** (`storageOnly`) to run
  100% on-device — the local mirror, debounce, tombstones, retry and merge logic
  is already written and already the source of the first paint.
* Cloud writes are additionally guarded by `cloudNotesUid()` / `cloudSketchUid()`
  (`uid` must equal `auth.currentUser.uid`), so a synthetic Work scope is a
  second, accidental safety net — but the plan uses the **explicit flag**, not
  the accident.
* The Brain deck is *already* storage-only and takes `{productId, sets, selfSets,
  onCreateSelfSet}` → the Revision "slidable" mode is nearly free.
* My Day is the one feature that **cannot** be reused as UI (Joplin iframe, cloud,
  AGPL bundle absent). Its *model*, *scheduling* and *formatting* modules are
  reusable and dependency-free: `src/joplin/joplinModel.ts`,
  `src/joplin/scheduling/{recurrence,scheduledItem,scheduleNotifications}.ts`,
  `src/joplin/myDayNoteFormatting.ts` (Markdown ⇄ rich HTML, KaTeX math, the
  clipboard normalizers from `src/course/noteEditor/clipboardNormalization.ts`).
  `MY_DAY_NOTE_EDITOR_REPORT.md` proves the precedent: My Day's old page mounted
  **the Course Player's own `NoteEditor`** — so Work mode does the same.

### 1.4 Navigation surfaces

* `src/components/SiteFooterNav.tsx` is the ONE site footer; it switches between
  three saved designs via `src/utils/footerNavigationStyle.ts`
  (`"youtube" | "uiverse" | "glass-dock"`, key `dc-footer-navigation-style`,
  `useSyncExternalStore` + a change event, one-time migration marker, and a
  Settings radio group in `src/settings/SettingsPage.tsx` lines 237–291).
  → **This is the exact pattern for adding a 4th design and for the Work-mode
  launch preference.**
* The "cross icon" the brief mentions is the `Plus` create button in
  `src/components/YoutubeFooterNav.tsx` (the default style) whose
  `dc-youtube-footer-quick-menu` holds `QUICK_ACTIONS` (My Day, My Study Library,
  Revision, FlowPath) → **"Work Mode" is one more entry there** (and, for
  parity, in `UiverseFooterNav`'s `PROFILE_SHORTCUTS` and `BottomNav`'s `TABS`).
* Desktop header = `src/components/DesktopShell.tsx`: `data-desktop-topbar` →
  `[data-desktop-topbar-actions]` already holds `{topBarRight}`, the Revision
  quick actions, the **Upgrade** pill, `ExpandingTabs` and the notifications
  button → **the "Work" button goes here** (same pill grammar as Upgrade).
  Rail entries are `PRIMARY_RAIL` / `WORKSPACE_RAIL` (lines 162–180) with
  `RAIL_COLORS`.
* The Home header the brief asks for on the My Day library page is
  `src/home/components/Header.tsx` (greeting + `ExpandingTabs` cluster +
  `MobileHeaderMenu` drawer + brand gradient from `useBranding()`), used by
  `src/home/App.tsx` line 400.
* Footer clearance is measured, never guessed: `src/utils/footerNavSpace.ts`
  publishes `--dc-footer-nav-h` from `[data-site-footer-nav]`, and the note
  toolbar's lift comes from `src/course/courseFooterInset.ts` /
  `useCourseFooterInset.ts` (`--dc-note-footer-inset`, selector list
  `[data-course-peek-dock], [data-course-dock]`).
  → Work's own pill nav must carry `data-site-footer-nav` + `data-site-footer` so
  both mechanisms keep working with zero new code, and its selector must be added
  to `COURSE_FOOTER_SELECTOR` (or Work publishes the same property itself).

### 1.5 The two design references

**A. `recreate-obsidian-notes-design.zip`** (repo root; a Vite + Tailwind v4 app,
`src/App.tsx` 2116 lines, `src/index.css` 143 lines). The pieces the brief points at:

* `MobileBottomToolbar` (line 1009) — **the toolbar to copy exactly**:
  * edit mode wrapper: `pointer-events-none absolute inset-x-0 bottom-0 z-30 flex
    justify-start px-2 pb-[max(8px,env(safe-area-inset-bottom))]`, inner pill
    `pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto
    rounded-full border border-border bg-surface-bg/95 px-2 py-1.5 shadow-lg
    backdrop-blur`;
  * read mode wrapper: same pill but `justify-center px-4
    pb-[max(12px,env(safe-area-inset-bottom))]`;
  * `ToolbarButton` = `relative flex h-9 w-9 shrink-0 items-center justify-center
    rounded-full text-text-secondary transition-colors hover:bg-hover-bg
    hover:text-text-primary active:bg-hover-bg` (+ optional badge
    `absolute -right-0.5 -top-0.5 h-4 min-w-[16px] rounded-full bg-accent
    px-1 text-[10px] text-white`);
  * `ToolbarDivider` = `mx-1 h-5 w-px bg-border`;
  * its button order: Undo, Redo | Heading, Bold, Italic, Strikethrough,
    Highlight | Code, Quote, Link | Bulleted, Numbered, Checklist, Indent,
    Outdent.
* `MobileTopBar` (line ~960) — `flex h-12 shrink-0 items-center justify-between
  border-b border-border bg-surface-bg px-3`: left `MenuIcon` button
  (`h-9 w-9 rounded-md`), centred truncated title, right a read/edit toggle
  (`BookOpenIcon` ⇄ `PencilIcon`, `h-8 w-8`) + `MoreHorizontalIcon`.
  → the brief's "left side 3-line button, right side save + tick" replaces the
  right cluster with two icon buttons and keeps the 48px fixed height.
* `MobileSidebarDrawer` (line 1346) — **the side panel to copy exactly**:
  `fixed inset-0 z-40`, scrim `bg-black/40 transition-opacity duration-300`,
  panel `absolute bottom-0 left-0 top-0 flex w-[280px] flex-col border-r
  border-border bg-sidebar-bg shadow-xl transition-transform duration-300
  ease-out will-change-transform` (`translate-x-0` / `-translate-x-full`),
  header `h-12 border-b px-4` (title + `XIcon` button `h-8 w-8`), a
  `h-9 border-b px-4 text-[13px]` count strip ("N folders, N notes"), a
  `flex-1 overflow-y-auto p-3` `FileTreeNode` list (folder chevron, `FolderIcon`
  / `FileTextIcon`, `paddingLeft: 8 + depth*14`, active =
  `bg-active-bg text-accent`), and a footer `h-12 border-t px-3` with
  "New note" (`h-9 rounded-lg px-3`) + a settings `h-8 w-8` button.
* Tokens (`src/index.css`) — light `:root` and `.dark` pairs:
  `--workspace-bg #ffffff / #0d0d0d`, `--surface-bg #ffffff / #121212`,
  `--sidebar-bg #f8f8f8 / #1a1a1a`, `--rail-bg #f2f2f2 / #141414`,
  `--text-primary #1a1a1a / #e6e6e6`, `--text-secondary #6b6b6b / #a1a1aa`,
  `--text-tertiary #9ca3af / #71717a`, `--border-color #e5e5e5 / #27272a`,
  `--accent-color #7c3aed / #8b5cf6`, `--accent-hover`, `--accent-muted`,
  `--accent-bg #ede9fe / #2e1065`, `--input-bg`, `--hover-bg #f3f4f6 / #27272a`,
  `--active-bg`; plus the 10px scrollbar rules, `::selection`, and mobile
  `font-size: 15px`.
  → **Work mode keeps these token NAMES 1:1** so the extracted markup/styles drop
  in unchanged, but re-points `--accent*` at this app's own indigo/violet
  (`--dc-accent-indigo 79 70 229`, `--dc-accent-violet 124 58 237` from
  `src/glass-theme.css`) — brief §9 says "apna app ka design follow karo aur vahi
  color bhi use karna hai".

**B. uiverse `great-badger-21`** ("Radio" by asgardOP, MIT). Fetched CSS, verbatim:

```css
#navbody { width:300px; height:60px; background-color:#fff; border-radius:40px;
  box-shadow:0 10px 15px rgba(0,0,0,.041); align-items:center; justify-content:center; display:flex; }
.ul { list-style:none; width:100%; background:transparent; display:flex; justify-content:space-between; margin-top:5px; }
.ul .li { display:inline-block; }
.radio { display:none; }
.svg { width:70px; height:70px; opacity:80%; cursor:pointer; padding:13px 20px; transition:.2s; }
.ul .li .svg:hover { transition:.1s; color:rgb(235,40,176); position:relative; margin-top:-4px; opacity:100%; }
.radio:checked + label .li .svg { color:rgb(235,40,176); fill-rule:evenodd; }
```

Its tags on uiverse are `home, search, bookmark, settings, profile` → five icon
slots in a white pill; the active/hover state is a colour change plus a −4px
lift. The public page serves only the CSS (the HTML is five hidden `radio`
inputs + `label`s wrapping an `.svg`), which is all the design needs: the pill
geometry, the 80%→100% opacity ramp, the −4px lift, the 0.2s/0.1s transitions
and the accent recolour. Work mode reimplements it as a React component with
`aria-current` instead of radio inputs (the app's footers are buttons — see
`YoutubeFooterNav`'s `role="menu"`/`aria-current` discipline) and keeps every
number above.

---

## 2. The one geometry decision (needs the owner's yes/no)

Requirement 7 has one ambiguity that changes the deck's constants, so it is
called out first.

Facts: the divider must be parked at the **top**; the current page must be
**full-screen**; a newly opened page must land in the **bottom** ("secondary")
region and replace whatever is there.

Because the divider's Y position *is* the height of the region above it, "parked
at the top" + "page full-screen" forces the full-screen page into the **bottom**
slot. So the deck is specified as:

```
┌───────────────────────────────┐  ← divider, parked at y=0 (2px line + grab strip)
│  PRIMARY slot   (top)         │  height = 100 - ratio   (0 at rest)
├───────────────────────────────┤
│  SECONDARY slot (bottom)      │  height = ratio         (100% at rest = the full-screen page)
└───────────────────────────────┘
        [ Work pill nav ]
```

mapped onto `SplitDeck` with **zero new layout code**:

* `swapped = false`, `ratio = 100` at rest → `lesson` (top) `flexGrow = 0`,
  `study` (bottom) `flexGrow = 100`, divider sits at the top edge. The page the
  learner sees full-screen is rendered into the **study/bottom** slot.
* dragging the divider **down** lowers `ratio` (the study pane's percent) → the
  top region grows. This is already how `ratioFromPointer` measures, and the
  existing snap/fill maths applies unchanged.
* every nav tap writes the **secondary (bottom)** slot → "teesra page niche wale
  area mein, secondary ko replace kar dega" ✔
* at rest every nav tap writes the same slot, which is 100% → "har page ful
  screen mein open hoga" ✔
* the top (primary) slot is filled the first time the learner drags: it takes the
  **previous page from Work's own history** (`dc.work.history.v1`), or, if there
  is none, a quiet "Open a page here" picker listing the same six destinations.
* the divider's swap button (mobile) trades the two slots — the existing
  flex-`order` swap, no remount.

The alternative reading ("the page I am on stays on TOP after I pull the divider
down") needs one extra `toggleSwap()` at drag start; it is a single flag in
`src/work/WorkDeck.tsx` (`PROMOTE_ON_SPLIT: boolean`). **Default: the geometry
above** (it is the one that satisfies every literal sentence of the brief).

---

## 3. Architecture

```
#/work                                  ← new immersive route (skips AppShell/DesktopShell)
└── src/work/WorkApp.tsx                 shell: theme attr, deck, footer nav, page registry
    ├── WorkLaunchChooser (mounted from main.tsx, NOT from here — see §4.1)
    ├── src/work/WorkDeck.tsx            SplitDeck wrapper: parked divider, slot policy, extras
    │     └── src/course/studyPanels.tsx  (extended with 4 optional props, §5.2)
    ├── src/work/WorkFooterNav.tsx        uiverse great-badger-21 pill (+ work-footer-nav.css)
    ├── src/work/pages/
    │     ├── WorkMyDayPage.tsx  → WorkMyDayLibrary.tsx / WorkMyDayEditor.tsx / WorkMyDayDrawer.tsx
    │     ├── WorkNotesPage.tsx  → src/course/NotesPanel.tsx + NoteEditor.tsx (storageOnly)
    │     ├── WorkMindMapPage.tsx→ src/course/MindMapPanel.tsx (lazy, storageOnly)
    │     ├── WorkSketchPage.tsx → src/course/SketchPanel.tsx (lazy, storageOnly)
    │     ├── WorkAiPage.tsx     → src/lumen/App.tsx (lazy, localOnly chats)
    │     └── WorkRevisionPage.tsx → Dashboard / Library / DeckChoose / Session / Create / AI / Import
    ├── src/work/storage/         workDb.ts (Dexie) · workPrefs.ts · workMyDay.ts · workDecks.ts
    ├── src/work/work-theme.css   scoped light/dark tokens (obsidian names, app accent)
    └── src/work/work-shell.css   deck/divider/footer/editor chrome re-scoped to .work-shell
```

Principles:

1. **Reuse, don't fork.** Every heavy surface (Excalidraw, xyflow, BlockNote,
   Brain deck, Recall) is mounted from its existing module. Work mode owns only
   the shell, the deck policy, the footer design, the My Day UI and the storage
   scope. No file under `src/course/**`, `src/revision/**` or `src/lumen/**` is
   copied.
2. **Additive changes only** to shared modules (new optional props / new optional
   function args, defaults preserve today's behaviour) so the 391 existing tests
   keep passing untouched.
3. **Everything lazy.** Work mode is one `lazyRoute` chunk; Mind map / Sketch /
   AI / Recall stay second-level lazy chunks inside it (same contract as
   `CoursePlayerApp`). Nothing lands on the app's first load.
4. **Storage-only is a testable property**, not a comment: no Firebase import may
   appear under `src/work/**`, and the reused hooks are called with
   `storageOnly: true` (§8, `tests/workModeStorageOnlyContract.test.mjs`).

---

## 4. Entry points

### 4.1 The launch chooser card (brief 2 + 3)

New `src/work/WorkLaunchChooser.tsx`, mounted from `main.tsx` inside `RootPage`,
immediately before the `showHomeShellImmediately` branch:

```tsx
const [launchChoice, setLaunchChoice] = useState<WorkLaunchDecision | null>(null);
// decision = "ask" | "home" | "work"  (dc.work.launch.v1, default "ask")
// shown only when: decision === "ask"
//            AND this loaded app instance has not already asked (in-memory ref)
//            AND the requested route is the default one (empty hash / #/landing / #/home)
//            AND no deep link is in flight (a notification tap, ?note=…, #/course/… wins)
// The in-memory ref survives SPA navigation but resets on a real reload/cold start;
// sessionStorage is deliberately NOT used, because it survives page reloads.
```

* Card design (clean, app's own language, no new material):
  `GlassSurface`-free by default — one centred card, `max-w-[420px]`,
  `rounded-[28px]`, the app's brand gradient as a 2px hairline + a soft
  `0 24px 60px -24px` shadow, on top of the existing learner background
  (`src/winter-background.css` / `GlassBackdrop` keep painting behind it).
  Two equal buttons in a row (stacked under 380px):
  * **Home** — `HomeIcon` plate tinted `#FFBE0B` (the rail's own Home colour),
    label "Home", sub-label "Courses, store & your day".
  * **Work** — `Briefcase` plate tinted `--dc-accent-indigo`, label "Work",
    sub-label "Notes · Mind map · Sketch · Revision".
  * Under them, one quiet text button: "Don't ask again — always open **Home**"
    which writes `dc.work.launch.v1 = "home"` (a long-press / second option
    offers "always open Work").
* Type scale + copy ramp copied from Home's own card language
  (`.dc-home-card`, `src/home/home.css` line 450) so it reads as the same app.
* Home → `window.location.hash = "#/home"`; Work → `"#/work"`. Both resolve an
  in-memory once-per-app-open ref, so an SPA route change never re-shows it but
  a full reload / new cold start asks again when the preference is still `ask`.
* Timing: it paints **under** the opening splash (`src/utils/openingSplash.ts`
  keeps its own lifecycle; the chooser never touches `#app-opening-splash`) and
  does not gate the Home chunk — `HomeApp` still preloads, so choosing Home is
  instant.

New preference module `src/work/storage/workPrefs.ts`, built exactly like
`src/utils/footerNavigationStyle.ts` (localStorage + `useSyncExternalStore` +
change event + defensive reads):

| key | values | meaning |
| --- | --- | --- |
| `dc.work.launch.v1` | `ask` (default) · `home` · `work` | the Settings choice (brief 3) |
| `dc.work.lastPage.v1` | a `WorkPageId` | "default last opened page dikhega" |
| `dc.work.history.v1` | `WorkPageId[]` (max 8) | feeds the primary slot on first split |
| `dc.work.theme.v1` | `light` (default) · `dark` | brief 16 |
| `dc.work.deck.v1` | `{primary, secondary, extras}` | the two slots + wide-stage extra panes |
| `dc.work.myday.filter.v1` | `all`·`task`·`scheduled`·`reminder`·`note`·`done` | the filter rail |

`dc.splitDeck.*` keys are reused as-is with `courseId = "work"` (per-axis ratios,
collapse, swap, extras) — no second layout store.

### 4.2 Settings (brief 3)

`src/settings/SettingsPage.tsx` gains one section after "Footer navigation"
(same markup grammar: `settings-section` → `settings-section-heading` →
`settings-navigation-options` radiogroup):

```
App opening            3 choices
  Ask every time        Home or Work card when the app opens      (default)
  Always open Home      Skip the card
  Always open Work      Skip the card, straight into Work
```

Device-local on purpose (it is a Work-mode/storage preference, not an account
preference — the account ones go through `/api/account/preferences` and
`PreferenceKey`, which brief 5 excludes).

### 4.3 Desktop header button (brief 1)

`src/components/DesktopShell.tsx`, inside `[data-desktop-topbar-actions]`,
immediately before the Upgrade pill — the same pill grammar as the Revision
"Review" quick action so the bar stays one design:

```tsx
<button type="button" data-work-mode-entry onClick={() => handleNavigate("#/work")}
  className="mr-1 hidden h-10 shrink-0 items-center gap-1.5 rounded-full border border-indigo-400/40
             bg-gradient-to-r from-indigo-500/25 to-violet-500/25 px-3.5 text-[22px] leading-[26px]
             font-black text-white transition hover:brightness-110 active:scale-95 sm:inline-flex"
  title="Work mode">
  <Briefcase size={30} /><span>Work</span>
</button>
```

Icon: `Briefcase` (lucide) is the default; the app already ships its own mark set
in `src/components/icons.tsx` (`SparkBookIcon`, `FlowPathIcon`, …), so a branded
Work glyph is a one-line swap that both entry points then follow.

Optional (owner's call, off by default): one `WORKSPACE_RAIL` entry
`{ key: "work", label: "Work", Icon: Briefcase, hash: "#/work", color: "#8B7CF6" }`
+ `resolveActiveFromHash("#/work") → "work"`. The brief only asks for the header
button, so the rail stays untouched unless asked.

### 4.4 Mobile cross-icon dropdown (brief 1)

* `src/components/YoutubeFooterNav.tsx` → `QUICK_ACTIONS` gains
  `{ id: "work", label: "Work Mode", route: "#/work", Icon: Briefcase }`
  (first position — it is the biggest surface), and `shortcutFromHash()` /
  `activeFromHash()` learn `#/work` so the create button lights up while Work is
  open.
* Parity (so the entry never depends on which footer design is saved):
  `UiverseFooterNav.PROFILE_SHORTCUTS`, `BottomNav.TABS` (glass-dock style) and
  `SitePeekFooter`'s item list get the same entry.

---

## 5. The Work shell + deck

### 5.1 `src/work/WorkApp.tsx`

```tsx
<div className="work-shell flex h-[100dvh] w-full flex-col overflow-hidden"
     data-work-shell data-work-theme={theme} data-work-page={focusedPage}>
  <WorkDeck …>                       {/* fixed header strip is INSIDE each page (§6) */}
    <WorkFooterNav … />              {/* data-site-footer-nav, in flow, never overlaying */}
</div>
```

* Immersive like the course player: added to `Root`'s desktop-shell skip list,
  excluded from `PortraitOnlyGuard`'s phone framing, and it drives the system
  bars through the existing `startSystemBarSync()` (the `data-work-theme`
  attribute is sampled by `src/utils/systemBarColor.ts` — one extra case).
* No global header at all (brief 15). Each page renders its own **fixed-height
  header AREA** (`--work-header-h: 48px`) whose contents are per-page buttons.
* `#/work/<page>` deep links open that page into the focused slot; `#/work`
  restores `dc.work.lastPage.v1`.
* Back handling: `src/utils/routeHistory.ts` already exists — Work keeps its own
  per-slot view stack (library → editor → …) and the hardware/browser Back pops
  the view stack before leaving `#/work`.

### 5.2 `SplitDeck` extension (additive, 4 optional props)

`src/course/studyPanels.tsx` — new optional props, defaults = today's behaviour:

| prop | default | Work value | why |
| --- | --- | --- | --- |
| `restRatio?: number` | `DEFAULT_SPLIT_RATIO[axis]` | `100` | parks the divider at the top with the study/bottom slot full-screen |
| `fullRange?: boolean` | `false` | `true` | bypasses the `SPLIT_MIN/SPLIT_MAX` (15/85) and the phone 30% floor so a slot can genuinely reach 0/100; adds `PARK_THRESHOLD = 6` — release within 6% of an edge and the deck springs to the parked state |
| `railAtEdge?: boolean` | `true` | `false` | at the parked edge the empty slot renders `flex-grow: 0` with **no 28px PeekRail** — the divider line itself is the affordance (brief 7: "divider bye default hamesha top per") |
| `grabInset?: number` | `10` | `26` | the parked divider needs a *bigger* invisible grab strip hanging INTO the full-screen pane, otherwise a 2px line at the very top edge is uncatchable by a thumb |

Everything else (springs, snaps, swap button, keyboard takeover, extras, the
per-course+axis persistence with `courseId="work"`) is inherited untouched.
`tests/coursePlayerSplitSwapRuntime.test.mjs` +
`tests/coursePlayerSplitSwapContract.test.mjs` are the regression net: the props
are optional, so the course player's deck must render byte-identically.

`src/work/WorkDeck.tsx` owns only policy:

```ts
type WorkSlot = { page: WorkPageId; view?: string; id?: string } | null;
openPage(target) {
  if (!split) setSecondary(target);            // full screen
  else setSecondary(target);                   // replaces the bottom slot (brief 7)
  pushHistory(target.page); saveLastPage(target.page);
}
onDragStart() { if (!primary) setPrimary(history[1] ?? null); }   // fill the top slot
```

### 5.3 CSS re-scope

`src/work/work-shell.css` re-declares, for `.work-shell`, the rules
`src/index.css` currently scopes to `.course-player-shell`:

* `[data-course-split-divider]::after` grab extension (with the larger
  `--work-divider-grab` inset, and `top: 0; bottom: -26px` when parked so the
  strip hangs *into* the page);
* the compressed-pane lean shadows (`--course-split-compress-*`);
* `[data-course-study-pane][data-solid-panel="true"]` plate — re-pointed at
  `--work-surface` so Notes/Mind map/Sketch read identically in both Work themes;
* peek-rail + reduced-motion rules (kept, though Work parks instead of railing);
* the divider's focus ring and hover brighten (unchanged).

The divider's core line keeps `DIVIDER_LINE #FFBE0B` (it is "the divider" colour
in this app, never the tab colour).

### 5.4 Footer navigation — uiverse `great-badger-21`

`src/work/WorkFooterNav.tsx` + `src/work/work-footer-nav.css`.

* Geometry, from the reference: pill `height 60px`, `border-radius 40px`,
  `background var(--work-surface)`, `box-shadow 0 10px 15px rgba(0,0,0,.041)`,
  `display:flex; align-items:center; justify-content:center`, `margin-top:5px`
  on the item row, `justify-content: space-between` inside.
* Reference width is a fixed `300px` for **five** 70px icon boxes. Work has
  **six** destinations, so the width becomes
  `width: min(calc(100vw - 24px), calc(var(--work-nav-n) * var(--work-nav-cell) + 24px))`
  with `--work-nav-cell: 52px` (≥44px tap target, 6 cells = 336px → fits a 360px
  phone; ≤349px phones drop to `--work-nav-cell: 46px`, the same rhythm rule
  `SiteFooterNav.COMPACT_FIT_QUERY` already uses). The icon plate keeps the
  reference's proportions (`padding 13px 20px` on a 70px box ⇒ a 30×44 content
  box) scaled to the cell: a `24px` glyph inside a `44px` round hover/active
  plate.
* Motion, from the reference: `opacity .8 → 1`, `transition .2s`, hover
  `transition .1s; margin-top:-4px` (the lift), `color: var(--work-nav-active)`.
* Colour: `--work-nav-active` = the app accent (`rgb(var(--dc-accent-indigo))`
  light, `--dc-accent-violet` dark) instead of the reference's
  `rgb(235,40,176)`; one token flip restores the original pink.
* Semantics: `<nav data-site-footer-nav data-footer-nav-design="work-pill">` →
  `<div data-site-footer>` so `footerNavSpace.ts` measures it and every scroller
  clears it automatically; buttons with `aria-current="page"`, `aria-label`,
  `title`; `prefers-reduced-motion` drops the lift; the nav is **in flow** (the
  last flex child of `.work-shell`), like `[data-course-strip-nav]`, so it can
  never cover a page or a keyboard.
* Items (brief 4 + 6, "sabhi button add kiye jaayen"):

| id | label | icon (lucide / custom) | colour plate |
| --- | --- | --- | --- |
| `myday` | My Day | `CalendarDays` | `#06D6A0` |
| `notes` | Notes | `NotebookPen` | `#3A86FF` |
| `mindmap` | Mind map | `Network` | `#B388FF` |
| `sketch` | Sketch | `PenLine` | `#F97316` |
| `ai` | AI | the player's own `AiTabIcon` | `#22D3EE` |
| `revision` | Revision | `SparkBookIcon` (the app's own) | `#34D399` |

  (Icons/colours lifted from `TABS` in `src/course/CourseOverlay.tsx` line 377 so
  the two environments read as one product.)
* **Contextual variant** (brief 10): a page can declare
  `footerVariant: "nav" | "editor"`. In `editor` the same pill renders only
  **Back** (`ArrowLeft`) and **Delete** (`Trash2`) — same geometry, same motion,
  two cells, centred. Used by the My Day editor while in READ mode; in EDIT mode
  the pill is replaced by the formatting toolbar (§6.2) and the nav is hidden.
* Optional (owner's call): register `"work-pill"` as a **4th global style** in
  `src/utils/footerNavigationStyle.ts` + the Settings radiogroup, so the design
  is also available outside Work mode. One-line type widening + one card in
  Settings; the component already takes `items`/`onSelect`.

---

## 6. Page-by-page specification

Every page: no Home header, a fixed `48px` header AREA (`--work-header-h`) with
per-page buttons, body `flex-1 min-h-0 overflow-hidden`, footer pill in flow.

### 6.1 My Day — library (brief 9)

`src/work/pages/WorkMyDayLibrary.tsx`

```
┌ Header (HOME PAGE'S OWN HEADER — brief 9) ────────────────┐
│  src/home/components/Header.tsx, mounted with a new       │
│  `variant="work"`: greeting + brand gradient + the        │
│  ExpandingTabs cluster (notifications, profile) kept,     │
│  search/favourites/cart dropped (not My Day's job)        │
├ Filter rail (horizontal, drag-scrollable) ────────────────┤
│  All · Tasks · Scheduled · Reminders · Notes · Completed   │
├ Strip cards (rectangular, full width, 1 per row) ─────────┤
│  [type plate] Title ……………………………  due/time chip  [ ✓ ]     │
│  [type plate] Title ……………………………  repeat chip    [ ✓ ]     │
└────────────────────────────────────────────────────────── ┘
                                            ( + )  ← FAB above the pill nav
```

* Header reuse: `src/home/components/Header.tsx` is `forwardRef` with
  `{userName, query, onQueryChange, suggestions, onSelectSuggestion,
  favoritesCount, onOpenFavorites, onOpenNotifications, onOpenSettings,
  headerVariant}`. Add `headerVariant="work"`: hides the search pill + the
  search/suggestions path and the favourites action (the brief's "unnecessary
  cheezein remove"), keeps the greeting, the brand gradient, the notification
  bell and the phone drawer. `MYDAY_HEADER_SEARCH_TASKS_TYPE_REPORT.md` is the
  precedent for exactly this kind of header subtraction on My Day.
* Filter rail: the chip grammar already in the app — `useDragScroll` +
  `FilterChips`-style pills (`src/components/FilterChips.tsx`), rebuilt small
  (`h-9`, `rounded-full`, `text-[13px]`, active = accent tint + check), one row,
  `overflow-x:auto`, scrollbar hidden. Filters map to the item's `kind`:
  `task | scheduled | reminder | note` + `done` (completed) — the same four
  families the canonical My Day model already distinguishes
  (`src/joplin/joplinModel.ts` `JoplinType.Note/Todo`, `scheduledItems`).
* Strip card: rectangular (`rounded-2xl`, `h-[68px]`, `border 1px
  var(--work-border)`, `background var(--work-surface)`), a `36px` tinted type
  plate on the left (the `#06D6A0/#3A86FF/#B388FF` family the dock rows already
  use), a bold title + one muted meta line, a right-hand chip (due time / repeat
  rule / "Today"), and a round tick button that completes the item (haptic via
  `@capacitor/haptics`, the app's `playSfxComplete()`).
* FAB `+`: `56px` round, accent gradient, `bottom: calc(var(--dc-footer-nav-h) +
  16px)`, right gutter — opens the editor as a NEW item (brief 9).
* Empty state: the app's `.dc-empty-glass` card ("Nothing here yet — tap + to
  plan your day").

### 6.2 My Day — editor (brief 9 + 10 + 11)

`src/work/pages/WorkMyDayEditor.tsx`

```
┌ header AREA (fixed 48px, border-b, NO design of its own) ─┐
│ [≡]                    (title, truncated)     [💾] [✓/📖] │
├ body ─────────────────────────────────────────────────────┤
│  READ: NoteEditor readOnly (BlockNote, .dc-note page)      │
│  EDIT: NoteEditor + the pill toolbar at the bottom         │
├ bottom ───────────────────────────────────────────────────┤
│  EDIT → obsidian pill toolbar (formatting)                 │
│  READ → WorkFooterNav variant="editor" → [← Back] [🗑]     │
└────────────────────────────────────────────────────────────┘
```

* Left button: the 3-line (`Menu`) button, `h-9 w-9 rounded-md`, opens
  `WorkMyDayDrawer` — **the zip's `MobileSidebarDrawer`, extracted 1:1**
  (280px, `border-r`, `bg-sidebar-bg`, `shadow-xl`, 300ms `ease-out` translate,
  `bg-black/40` scrim, 48px header with the vault name + `X`, the
  `h-9` "N notebooks, N notes" count strip, the scrollable `FileTreeNode` list
  with folder chevrons + `paddingLeft: 8 + depth*14` + `bg-active-bg text-accent`
  active row, and the `h-12 border-t` footer with "New note" + a settings icon).
  Content: the learner's local My Day notebooks/filters + every saved item, so
  the drawer is also a jump-to-item navigator. Edge-swipe-right opens it (the
  zip's own gesture, with its `data-no-swipe` opt-out for horizontally
  scrollable regions — the toolbar is one).
* Right buttons, both icons, in this order: **Save** (`Save`/floppy — writes now,
  shows a 900ms "Saved on this device" toast via the app's `glass-toast`) and
  **Tick/Read toggle** (`Check` ⇄ `BookOpen`) — the zip's `onToggleEdit` pair
  collapsed into the brief's single button: in EDIT it is a tick (save + go to
  READ), in READ it is a book (no-op / re-enter read). Exact classes:
  `flex h-8 w-8 items-center justify-center rounded-md transition-colors`,
  active = `text-accent`.
* **Read by default** (brief 10): the editor mounts `readOnly`; the body is the
  BlockNote page from `src/course/NoteEditor.tsx` (`.dc-note`, serif title field,
  internal scroll, KaTeX math nodes, the whole clipboard normalization).
* **Double-tap to edit**: `src/course/useDoubleTapToEdit.ts` — already written,
  already movement-aware (10px slop, 400ms window, 320ms inter-tap), already
  ignores links/buttons/inputs, already has the `Enter`/`F2` keyboard parity and
  the mouse `dblclick` path. Wire it on the read surface.
* **Toolbar only in edit** (brief 10) and the footer pill switches to
  Back + Delete in read (brief 10) — `footerVariant` from §5.4.
* **Toolbar design = the zip's pill, buttons = My Day's** (brief 9). One new
  component `src/work/myday/WorkEditorToolbar.tsx`:

  | cell | action | implementation |
  | --- | --- | --- |
  | `Undo` / `Redo` | history | `HistoryExtension` via the existing `HistoryButton` in `src/course/NoteEditorToolbar.tsx` |
  | ▸ divider | | `ToolbarDivider` (`mx-1 h-5 w-px bg-border`) |
  | `Heading` | block type | `BlockTypeSelect` with `blockTypeSelectItems` (H1/H2/H3, bullet, numbered, checklist, quote, code, table) — the same items list the course editor builds |
  | `Bold` `Italic` `Strike` `Code` `Highlight` | inline | `BasicTextStyleButton` (`bold/italic/strike/code`) + the app's highlight command |
  | ▸ | | |
  | `Link` `Quote` `Math` | insert | `CreateLinkButton`, quote block, the note editor's own KaTeX inline/block math node (`src/course/noteEditor/mathRendering.ts`) |
  | ▸ | | |
  | `Bullet list` `Numbered list` `Checklist` `Indent` `Outdent` | blocks | the existing `runSlashCommand` keys in `src/course/noteEditor/editorCommands.ts` (`bulletList`, `numberedList`, `checklist`, `nestBlock`, `unnestBlock`) |

  Every cell calls BlockNote's `preventFocusOnTap` (the course toolbar's rule) so
  a tap never drops the selection or the keyboard. Formatting parity with the
  reference is therefore **structural, not cosmetic**: same pill, same 36px
  round cells, same dividers, same order, but driving the app's real editor —
  so "vaise hi text formatting support, vaise hi sare rules" (brief 9) holds
  because it *is* the Course Player's editor (`MY_DAY_NOTE_EDITOR_REPORT.md`
  already established that My Day must not grow a second editor).
  * Storage: the note body persists as BlockNote JSON + an HTML mirror +
    a plain-text mirror for search; Markdown export via
    `src/joplin/myDayNoteFormatting.ts` for anyone moving data out.
* Data model — `src/work/storage/workMyDay.ts` on Dexie:

  ```ts
  interface WorkMyDayItem {
    id: string;                 // joplinIds.ts-style uuid
    ownerId: string;            // uid, or "device" when signed out
    kind: "task" | "note" | "reminder" | "scheduled";
    title: string;
    bodyHtml?: string; bodyJson?: unknown; bodyText?: string;
    notebookId?: string; tags?: string[];
    completed: boolean; completedAt?: number;
    dueAt?: number; allDay?: boolean;
    schedule?: ScheduleRule;    // src/joplin/scheduling/scheduledItem.ts (recurrence: once|daily|weekly|weekdays|monthly|interval, count/until, IANA zone)
    reminderAt?: number[]; notifiedAt?: number[];
    createdAt: number; updatedAt: number; deletedAt?: number;  // soft delete, joplin discipline
  }
  ```
  Reuses `src/joplin/scheduling/recurrence.ts` verbatim for the next-occurrence
  maths (it is pure, tested, and already handles zones) — no new scheduler logic.
* Reminders: `@capacitor/local-notifications` alarms through the existing
  `src/utils/capacitorBridge.ts` (`scheduleLocalAlarm`, `cancelLocalAlarms`,
  `ensureReminderChannel`) armed from the Work store while Work is mounted.
  Honest limitation to state in the UI: on the **web** there is no reliable
  background alarm when the tab is closed — the app's existing Web Push path is
  server-driven, which brief 5 excludes. Native (APK/PWA-installed) gets real
  exact-time alarms.

### 6.3 Notes (brief 11 + 13 + 15)

`src/work/pages/WorkNotesPage.tsx` = the Course Player's own surfaces:

* `useCourseNotes({ uid, productId: "work", storageOnly: true })`
* library: `src/course/NotesPanel.tsx` — **the exact course design** (grid of
  note cards, first-heading title extraction, preview text, MASTER/SELF control
  removed since Work has no admin-authored notes), including its composer and
  the `syncState` indicator re-labelled "Saved on this device".
* editor: `src/course/NoteEditor.tsx` with its own `NoteFormattingToolbar`
  (selection-following) + `NoteDockedToolbar` (bottom bar) — brief 11 says use
  the existing toolbar and keep full formatting, so **no re-skin here**; only
  `--dc-note-footer-inset` needs Work's pill nav added to
  `COURSE_FOOTER_SELECTOR` (`[data-work-footer-nav]`) so the docked bar stops
  above it.
* header AREA (48px, brief 15): left = page name + note count; right =
  **Library** (`Library` icon → toggles `NotesPanel`'s library view),
  **New note** (`Plus` → `composerOpenSignal`), **Theme** (`Sun/Moon`).

### 6.4 Mind map (brief 12 + 13 + 15)

`src/work/pages/WorkMindMapPage.tsx`

* `useCourseMindMap({ uid, productId: "work", moduleId: "work", rootTopic:
  "My mind map", storageOnly: true })` + `MindMapPanel` (lazy, `@xyflow/react`).
* Design: **the course player's, exactly** — canvas, rope edges, node styling,
  colour swatches, `ToolbarMenu` popovers, auto-arrange, align, style reset,
  text-fit, look, fit, stats, and its **map library grid** (brief 13) with
  New map / rename / delete.
* Toolbar buttons replaced/removed (brief 12 + 17):
  | course player | Work mode |
  | --- | --- |
  | `Check` "Save and read mind map" (closes the course sheet) | **removed** — no sheet to close; `Check` becomes "Done" → back to the library |
  | `Cloud` / `CloudUpload` / `CloudCheck` / `CloudAlert` + the "Abhi cloud par save karein" menu | replaced by a **device** icon (`HardDrive`/`Save`) with the menu text "Saved on this device · <time>"; no retry-to-cloud item |
  | MASTER maps banner, master grid, `onOpenMasterMap`, module breadcrumb (`courseTitle`/`modules`/`moduleId` segments) | **removed** (nothing admin-authored exists in Work) |
  | `FileJson` AI/JSON import, `Layers` map switcher, auto-arrange, align, style, fit, delete, node/level readout | **kept** |
* header AREA (48px, brief 15): left = map name; right = **Library** (`Layers` →
  the panel's own library, `libraryOpen`), **New map** (`Plus` → `createMap()`),
  **Theme**.
* New optional prop on `MindMapPanel`: `storage?: "cloud" | "device"` (default
  `"cloud"`) that swaps the save icon set + copy and hides the master-map
  affordances — one additive prop, no fork.

### 6.5 Sketch (brief 12 + 15)

`src/work/pages/WorkSketchPage.tsx`

* `useCourseSketch({ uid, productId: "work", moduleId: "work", storageOnly: true })`
  + `SketchPanel` (lazy, Excalidraw with the vendored fonts from
  `vite.config.ts`) + `useSketchLibrary({ uid, localOnly: true })`.
* Exact course styling: `SketchColourPicker`, `SketchColourCluster`,
  `SketchBoards` (the board switcher), `SketchStatus`, `SketchLibraryPill`,
  `cleanLook`, Quick Sketch — all kept.
* Removed (brief 17): course/module scoping copy, the cloud library doc
  (`users/{uid}/sketchLibraries/main`), pending-sync/retry-to-cloud lines,
  "Add to Excalidraw library" cloud link. The status line becomes
  "Saved on this device · 12:04".
* **Quota note (real risk):** Excalidraw scenes + embedded files are big and the
  current mirror is localStorage (`SKETCH_LIBRARY_MAX_CHARS = 900000`). Work mode
  writes scenes to the Dexie `blobs` table and keeps only metadata in
  localStorage — `workDb.ts` gets `sketchScenes` and `files` tables, and
  `useCourseSketch`'s `storageOnly` path is pointed at them through a small
  adapter interface (this is the one place where "reuse the localStorage mirror"
  is not enough).

### 6.6 AI (brief 4)

`src/work/pages/WorkAiPage.tsx` → `src/lumen/App.tsx` (lazy):

```tsx
<LumenChat uid={uid ?? "device"} productId="work" courseTitle="Work mode"
           courseShort="Work" moduleId={null} moduleTitle={null}
           notes={workNotes} profile={{name, photoURL}} localOnly
           onOpenSubscription={() => { window.location.hash = "#/subscription"; }} />
```

* `localOnly` (new optional prop → `useLumenChats`): skip `cloudChats.ts`
  reads/writes, keep the existing local mirror + retry queue as the only store.
* Inference still calls `/api/ai/*` (server-side model + quota) — that is not
  "saving to cloud", but it does need a signed-in learner and their allowance;
  the page states that plainly and offers the sign-in/upgrade path via the
  existing `AiQuotaCard` / `PremiumGate`.
* Work notes are passed in, so "AI, summarize my notes / make questions" works
  against local data; `notes` → `flashcard`/`question` answers can be pushed
  into Work Revision (§6.7) with one button.

### 6.7 Revision (brief 14)

Namespace: Work revision lives in its **own local namespace**
(`owner = "work:" + (uid ?? "device")`) inside the same Dexie DB
`digitalcatalyst-revision`, bootstrapped with
`bootstrapRevisionFeature(owner)` where `initializeRevisionDomain(owner, { cloud:
false })` skips hydration and `commitUnifiedSnapshot(..., { cloud: false })`
skips the queue (the `{ mirrorReviews?, cloud? }` seam **already exists** in
`commitUnifiedSnapshot`, `src/revision/integrations/dcxRepository.ts` line 170 →
`if (options.cloud !== false) queueUnifiedCloudPersistence(uid)`; only
`initializeRevisionDomain`'s unconditional `hydrateUnifiedFromCloud(uid)` at
line 119 needs the same option). FSRS
(`src/revision/engine/fsrs.ts`, `recall/services/fsrs-engine.ts`), stats, queue,
bulk parser, Anki/CSV/MD importers: all reused unchanged.

**a) Dashboard** — `WorkRevisionDashboard.tsx` (clean, centred, brief 14):

```
        Revision
   Your cards. Your pace.

  ┌────────────────────────────┐   ← 3 equal option cards, centred, max-w 460px
  │ ▤  Make revision sets      │      icon plate + title + one-line hint
  │ ↺  Make with AI            │
  │ ⇪  Direct import           │
  └────────────────────────────┘
   due today · N cards · streak        ← one quiet stat line (engine/analytics.ts)

  [            Library            ]    ← pinned just above the footer pill (brief 14)
```
Brand-professional but plain: `--work-surface` cards, 1px `--work-border`,
`rounded-2xl`, accent icon plates, no gradients except the app's own accent
hairline on press. Stat line from `getDashboardData(uid)` /
`countDueToday(cards)` (already exported).

**b) Library** — `WorkRevisionLibrary.tsx` (brief 14): rectangular **strip** rows
(same 68px strip grammar as the My Day library, so the two libraries read as one
design): set name + card/question count + last-reviewed chip, and on the right
**pencil** (`Pencil` → rename/edit the set) and **delete** (`Trash2` → the app's
`ConfirmDeleteDialog`). Tap the row → **DeckChoose**.

**c) DeckChoose** — two options, the brief's exact words:

```
   How do you want to study "<set name>"?
   ┌─────────────────┐  ┌─────────────────┐
   │  SLIDABLE       │  │  CONVERTIBLE    │
   │  [mini mockup]  │  │  [mini mockup]  │
   │  Swipe the card │  │  Revision deck  │
   │  to answer      │  │  + spaced rep.  │
   └─────────────────┘  └─────────────────┘
```
The mockups are the two real components rendered at `pointer-events:none`
`transform: scale(.42)` inside a fixed box — no screenshots, no drift.

**d) Slidable** — `src/course/CourseBrainPanel.tsx` mounted directly (brief 14:
"brain page jo course player ke andar hai … slide MCQ wala card … slide skip,
tick the question → automatic slide to next, niche submit aur revise, aur jo bhi
user submit kiya rahega vah pura dekh sakta hai"):

```tsx
<CourseBrainPanel productId={`work-${setId}`} sets={[asBrainPracticeSet(set)]}
                  selfSets={[]} uid={owner} />
```
`asBrainPracticeSet()` maps a Work set's cards → the `BrainPracticeSet` shape
`utils/practiceSet.js` defines (`{id, title, questions:[{id, prompt, options[],
correctIndex, explanation, difficulty, topic}]}`). Everything the brief lists is
already inside that panel: the stacked card deck (flick in ANY direction = skip,
tap an option = record + self-flick to the next, `3/10` counter), the review
grid, the docked **Submit practice** bar, the result screen (score, accuracy,
topic breakdown) and **Review answers** (each question with the learner's mark,
the correct one and the explanation). Its history is already
`localStorage["dc:courseBrain:<productId>"]` → storage-only for free.
Removed (brief 17): the MASTER/SELF header control, course/module grouping,
`onPass`/`completedFileIds` course-progress wiring.

**e) Convertible** — `WorkDeckSession.tsx`: the **revision system** drives, the
**Brain style** paints (brief 14: "revision ka deck card style interface …
revision wala sara system use karna hai, lekin submit aur answer review mein vahi
brain wala style"):

* queue + scheduling: Recall's store (`useRecallStore`) / `engine/queue.ts` +
  `fsrs.ts` → the card order, the again/hard/good/easy grading, the due dates;
* paint: `BrainQuestionDeck` for the question pass (same card stack, same
  flick-to-skip, same counter) and the Brain **result + answer-review** screens
  for the submit/review phase;
* grading: a card's answer maps to the FSRS rating (again/hard/good/easy) via a
  4-button row in Brain's own pill grammar, so the spaced-repetition system stays
  intact while the visuals stay Brain's.

**f) Make revision sets → style choice** (brief 14) — `WorkDeckStyleChoice.tsx`:

```
        Create your revision cards
  Click your favourite deck styling to create your own revision cards

  DECK STYLE                                   ← heading 1
  [visual mockup: the convertible deck card]
  Spaced repetition, FSRS scheduling, grades

  BRAIN STYLE                                  ← secondary heading
  [visual mockup: the slidable MCQ card]
  Swipe-through MCQ practice with instant review
```
* Deck style → the existing revision builder surfaces (Recall's `deck-dialog` /
  `card-dialog` / `bulk-add-dialog`, reached through `DeckDetail`) in a Work
  wrapper.
* Brain style → `src/course/SelfPracticeSetComposer.tsx` (the course player's own
  brain-card builder: AI prompt mode + manual + paste-and-parse via
  `utils/practiceImport.js`), with `onCreate` writing to the Work store instead
  of `users/{uid}/myCourses` (brief 5 — that is the cloud shelf
  `utils/selfPracticeSets.js` uses today).
* Both mockups are the real components scaled down (as in DeckChoose).

**g) Make with AI** → `src/revision/pages/AiGeneratePage.tsx` inside a Work
wrapper (it already speaks the DC design language); generated cards land in the
Work namespace, never in Firestore. AI settings via `AiSettingsPage`.

**h) Direct import** → `src/revision/pages/BulkImportPage.tsx` + Recall's
`ImportHub` (Anki `.apkg`, CSV, Markdown, Recall export) — all parsers are local
(`engine/bulkParser.ts`, `recall/lib/{bulk-parser,markdown-importer}.ts`,
`recall/services/anki-import.ts`), only the destination changes.

---

## 7. Light + dark theme (brief 16)

The app is light-only **by owner decision** (`src/lib/theme.ts`, pinned by
tests). Work mode therefore carries its own scoped theme and never touches the
global one:

* `src/work/work-theme.css` defines, under `[data-work-shell]` and
  `[data-work-shell][data-work-theme="dark"]`, **the zip's token names** so the
  extracted Obsidian markup works unmodified:
  `--workspace-bg, --surface-bg, --sidebar-bg, --rail-bg, --text-primary,
  --text-secondary, --text-tertiary, --border-color, --accent-color,
  --accent-hover, --accent-muted, --accent-bg, --input-bg, --hover-bg,
  --active-bg` (+ Tailwind `@theme` aliases `bg-surface-bg`, `text-text-primary`,
  `border-border`, … exactly as the zip does).
* Values: light = the zip's light ramp re-pointed at this app's paper/ink
  (`#ffffff` surface, `#f8f8f8` sidebar, `#e5e5e5` border, ink `#1a1a1a`) with
  `--accent-color: rgb(var(--dc-accent-indigo))`; dark = the zip's dark ramp
  (`#0d0d0d/#121212/#1a1a1a`, border `#27272a`, ink `#e6e6e6`) with
  `--accent-color: rgb(var(--dc-accent-violet))`. The app's own dark-first plate
  tokens (`src/glass-theme.css`) supply the shadows/glows so it still looks like
  this product.
* Propagation: the theme is passed down as the panels' own `theme` prop where one
  exists (`NoteEditor theme`, `MindMapPanel` → `data-course-theme`, `SketchPanel`
  cleanLook/theme, `LumenChat`'s `useCourseTheme`), so each reused surface paints
  its real dark palette instead of being CSS-inverted.
* Toggle: `Sun/Moon` in every page's header AREA (right side) + a row in the
  My Day drawer footer; persisted in `dc.work.theme.v1`;
  `syncSystemThemeColor()` / `startSystemBarSync()` get one extra case so the
  Android status bar follows the Work theme.
* Contract test: `document.documentElement.dataset.theme` stays `"light"` while
  Work is open in dark (`tests/workModeThemeContract.test.mjs`) — the global
  light-only rule is provably untouched.

---

## 8. Storage-only guarantee (brief 5)

| surface | where it writes in Work mode |
| --- | --- |
| My Day items, notebooks, schedules | Dexie `digitalcatalyst-work` → `mydayItems`, `notebooks` |
| Notes | localStorage `dc.courseNotes.<uid|device>.work` (+ tombstones) via `useCourseNotes({storageOnly:true})` |
| Mind maps | localStorage `dc.mindMap.v1.<uid|device>.work.work.<mapKey>` + index + active |
| Sketch scenes / Excalidraw files | Dexie `digitalcatalyst-work` → `sketchScenes`, `blobs` (too big for localStorage) |
| Revision decks/cards/FSRS/attempts | Dexie `digitalcatalyst-revision`, owner `work:<uid|device>` |
| Brain practice history | localStorage `dc:courseBrain:work-<setId>` (already device-only) |
| AI chat transcripts | the Lumen local mirror only (`localOnly`) |
| Layout / prefs / last page / theme | `dc.work.*` + `dc.splitDeck.*:work:<axis>` |

Enforcement:

1. `tests/workModeStorageOnlyContract.test.mjs` — static scan: **no**
   `firebase`, `firestore`, `collection(`, `setDoc(`, `onSnapshot(`, `apiFetch(`
   may appear in any file under `src/work/**`; and every reused hook call site in
   `src/work/**` must pass `storageOnly: true` / `localOnly` / `{ cloud: false }`.
2. The three course hooks gain `storageOnly?: boolean` (default `false`) which
   short-circuits the cloud read, the write queue, the outbox and the retry
   timer; `status` then means *device* status and the error copy changes to the
   device-only wording ("Device storage is full…" already exists).
3. `#/work` is **not** added to `AUTH_REQUIRED_PREFIXES`: Work is usable signed
   out (`owner = "device"`), which is the honest meaning of "sab storage mein".
   Signed-in learners get their data keyed by uid (so two learners on one device
   never share), and a one-time "move this device's Work data to your account
   folder" prompt appears after sign-in (local re-key, still no cloud).
4. Because nothing is backed up, Work ships an **Export / Import** action in the
   My Day drawer footer + the Revision dashboard: a single `.json` (or `.zip`
   via the already-bundled `jszip`) of every Work table, and a re-import that
   merges by `id` + `updatedAt`. This is the replacement for cloud sync and the
   answer to "clearing site data loses everything".

---

## 9. Desktop & responsive rules (brief 8)

| stage | behaviour |
| --- | --- |
| < 900px deck width (phones, phone-landscape, small tablets) | parked divider at the top; tap → **only the swap button**; no extra panes (`renderExtraPane` not passed ⇒ `wide === false`, the rule SplitDeck already applies); footer pill = 6 cells at 46–52px |
| ≥ 900px (`SPLIT_WIDE_MIN_PX`) | the divider's tap cluster also offers **Split lesson area / Split study area** (`PanelTop`/`PanelBottom`/`PanelLeft`/`PanelRight`) → 2, 3 and 4 panes, each with its own nested divider, merge (X) and swap; `SplitExtras` persisted for `courseId="work"` per axis — i.e. the course player's existing 1/2/3/4-screen modes, unchanged |
| axis | `column` in portrait, `row` in landscape/desktop (the player's `useLandscapeRails` rule); ratios are stored per axis, so rotating keeps both arrangements |
| keyboard | `keyboardExpandEnabled` for `notes`, `mindmap`, `sketch`, `ai` and the My Day editor → the writing slot takes the whole deck while a soft keyboard is open, then the split returns untouched |
| desktop chrome | `#/work` skips `AppShell`/`DesktopShell` (immersive, like `#/course/`); the pill nav stays at the bottom, centred (`justify-content: safe center`, the rule `course-strip-nav.css` already uses on wide stages); no left rail — Work's nav is the pill |
| desktop keys | `1…6` focus a destination, `s` swap (divider), `Esc` back to the page's library, `Ctrl/Cmd+S` save, `Ctrl/Cmd+E` toggle edit, `?` shows the shortcut sheet |
| safe areas | the pill carries `pb-[max(env(safe-area-inset-bottom),10px)]`; the editor toolbar uses the zip's own `pb-[max(8px,env(safe-area-inset-bottom))]` |

---

## 10. Cleanup list (brief 17 — "unnecessary button aur cheezein remove")

| surface | removed in Work mode |
| --- | --- |
| Home header (My Day library) | search pill + suggestions, favourites, cart, store shortcuts, opening-ad control |
| My Day | the Joplin frame, notebooks-as-vault complexity beyond the drawer, sync/allowance/premium meters, migration UI, web-clip |
| My Day editor | tabs/tab-switcher, "New tab", vault settings, More menu (nothing to put in it), the read-mode forward/back pair |
| Notes | MASTER/SELF filter, course/module breadcrumb, "Add to My Module", cloud retry |
| Mind map | cloud save button + menu items, MASTER map banner/grid, "Save and read", module breadcrumb, course-scoped collections |
| Sketch | module/course scoping, cloud library, pending-sync + retry lines, Excalidraw cloud-library link |
| AI | course/module context chips, "open in course" actions |
| Brain deck | MASTER/SELF, course set grouping, module completion (`onPass`, `completedFileIds`) |
| Revision | the Recall sidebar/app-shell chrome, Daily Test / Test Bank / Weak Topics / Progress / Leaderboard-ish surfaces (Work keeps only: create, AI, import, library, study), cloud sync indicators, premium gates except on the AI call |
| Footer | nothing else — 6 destinations only |

---

## 11. File-by-file change list

### New (all under `src/work/**` unless noted)

```
src/work/WorkApp.tsx                       shell (theme, deck, nav, page registry, routing)
src/work/WorkDeck.tsx                      slot policy: park, open→secondary, history→primary, extras
src/work/WorkFooterNav.tsx                 uiverse great-badger-21 pill (+ editor variant)
src/work/work-footer-nav.css
src/work/work-shell.css                    deck/divider/nav chrome re-scoped to .work-shell
src/work/work-theme.css                    light+dark tokens (obsidian names, app accent)
src/work/WorkLaunchChooser.tsx             the Home/Work card
src/work/work-launch.css
src/work/pages/WorkMyDayPage.tsx
src/work/pages/WorkMyDayLibrary.tsx
src/work/pages/WorkMyDayEditor.tsx
src/work/myday/WorkEditorToolbar.tsx       the obsidian pill wired to BlockNote
src/work/myday/WorkMyDayDrawer.tsx         the obsidian sidebar drawer
src/work/myday/WorkMyDayFilters.tsx        the horizontal filter rail
src/work/myday/WorkMyDayStrip.tsx          the rectangular strip card
src/work/pages/WorkNotesPage.tsx
src/work/pages/WorkMindMapPage.tsx
src/work/pages/WorkSketchPage.tsx
src/work/pages/WorkAiPage.tsx
src/work/pages/WorkRevisionPage.tsx        revision sub-router
src/work/revision/WorkRevisionDashboard.tsx
src/work/revision/WorkRevisionLibrary.tsx
src/work/revision/WorkDeckChoose.tsx       slidable ⇄ convertible
src/work/revision/WorkDeckStyleChoice.tsx  deck style ⇄ brain style (+ mockups)
src/work/revision/WorkDeckSession.tsx      FSRS engine, Brain paint
src/work/revision/WorkDeckMockups.tsx      the two scaled real-component mockups
src/work/storage/workDb.ts                 Dexie "digitalcatalyst-work"
src/work/storage/workPrefs.ts              dc.work.* (useSyncExternalStore, footerNavigationStyle pattern)
src/work/storage/workMyDay.ts              items CRUD + filters + schedule next-run
src/work/storage/workDecks.ts              sets ⇄ BrainPracticeSet / Recall cards adapters
src/work/storage/workBackup.ts             export/import (jszip)
src/work/workPages.ts                      WorkPageId registry: id, label, icon, colour, footerVariant
docs/work-mode-implementation-plan.md      (this file)
WORK_MODE_REPORT.md                        final report, repo convention
```

### Modified (all additive)

```
src/main.tsx                       +#/work route (+lazyRoute), +chooser gate in RootPage,
                                    +#/work in Root's desktop-shell skip list, +preload rule
src/utils/appRoutes.ts              WORK_HASH constant (NOT auth-required)
src/components/DesktopShell.tsx     "Work" button in [data-desktop-topbar-actions]
src/components/YoutubeFooterNav.tsx QUICK_ACTIONS += Work Mode (+ active/shortcut hash rules)
src/components/UiverseFooterNav.tsx PROFILE_SHORTCUTS += Work Mode
src/components/BottomNav.tsx        TABS += work (glass-dock style parity)
src/home/components/Header.tsx      headerVariant="work" (subtract search/favourites/cart)
src/course/studyPanels.tsx          SplitDeck += restRatio, fullRange, railAtEdge, grabInset
src/course/splitMotion.ts           += PARK_THRESHOLD, WORK_STORAGE_SCOPE, park helpers
src/course/useCourseNotes.ts        += storageOnly
src/course/useCourseMindMap.ts      += storageOnly
src/course/useCourseSketch.ts       += storageOnly (+ Dexie scene adapter seam)
src/course/useSketchLibrary.ts      += localOnly
src/course/MindMapPanel.tsx         += storage:"cloud"|"device" (icon set + copy + master hidden)
src/course/SketchPanel.tsx          += storage:"cloud"|"device" (status line, library source)
src/course/NotesPanel.tsx           += storage:"cloud"|"device" (+ hide MASTER/SELF)
src/course/CourseBrainPanel.tsx     += variant:"course"|"work" (hide MASTER/SELF + course wiring)
src/course/courseFooterInset.ts     COURSE_FOOTER_SELECTOR += [data-work-footer-nav]
src/lumen/App.tsx + useLumenChats   += localOnly
src/revision/integrations/bootstrap.ts   += { localOnly }
src/revision/integrations/dcxRepository.ts initializeRevisionDomain(uid, { cloud:false })
src/settings/SettingsPage.tsx       "App opening" section (3 radio choices)
src/index.css                       nothing (Work's chrome lives in work-shell.css)
package.json                        "test:work": "node --test tests/workMode*.test.mjs"
```

### Tests (repo convention: `tests/*.test.mjs`, node --test + jsdom + esbuild fixtures)

```
tests/workModeLaunchChooserContract.test.mjs   pref ask/home/work, cold-start only, deep links win
tests/workModeEntryPointsContract.test.mjs     desktop header button + all 3 footer styles
tests/workModeFooterNavContract.test.mjs       pill geometry/motion numbers vs the reference CSS
tests/workModeSplitDeckRuntime.test.mjs        parked at top · drag → split · nav tap → bottom slot ·
                                               3rd page replaces bottom · mobile = swap only ·
                                               ≥900px = split controls · layout persisted per axis
tests/workModeStorageOnlyContract.test.mjs     no firebase/api imports under src/work/**; every
                                               reused hook called with storageOnly/localOnly
tests/workModeMyDayEditorContract.test.mjs     read by default · double-tap → edit · toolbar only in
                                               edit · header = menu + save + tick · drawer classes ·
                                               footer variant back+delete in read
tests/workModeRevisionContract.test.mjs        dashboard options · library strips (pencil+delete) ·
                                               slidable = CourseBrainPanel · convertible = FSRS +
                                               Brain paint · style-choice page copy + mockups
tests/workModeThemeContract.test.mjs           both themes · global data-theme stays "light"
tests/coursePlayerSplitSwap*.test.mjs          (existing) must stay green — the SplitDeck props are optional
```

---

## 12. Delivery phases (each one shippable + reviewable on its own)

| phase | contents | visible result |
| --- | --- | --- |
| **0 — Skeleton** | route + shell + prefs module + theme tokens + footer pill + launch chooser + desktop button + mobile quick action + Settings section | the app opens on the Home/Work card, Work opens full-screen with the new pill nav and a placeholder page, light+dark work |
| **1 — Deck** | `SplitDeck` extension, `WorkDeck`, slot policy, history, persistence, wide-stage extras, CSS re-scope | parked divider at the top, pull down to split, nav taps replace the bottom slot, swap on mobile, 3/4 panes on desktop |
| **2 — Reused surfaces** | Notes, Mind map, Sketch, AI with `storageOnly` / `localOnly` + their header AREAs + cleanup list | four real pages, all course-exact, nothing on the cloud |
| **3 — My Day** | Dexie store, library (Home header + filter rail + strip cards + FAB), editor (drawer, save/tick, read-by-default, double-tap, obsidian pill toolbar), scheduling + local alarms | the whole My Day flow of brief 9/10/11 |
| **4 — Revision** | dashboard, library strips, DeckChoose, Slidable (Brain panel), Convertible (FSRS + Brain paint), style-choice page, AI + import, backup/export | brief 14 end to end |
| **5 — Polish** | dark-theme pass on every reused surface, desktop keyboard, empty/loading/error states, reduced-motion, safe areas, perf (chunk sizes, first paint), the report doc | release quality |

---

## 13. Risks & mitigations

| risk | mitigation |
| --- | --- |
`SplitDeck` is shared with the Course Player and pinned by runtime tests | additive optional props only; `courseId="work"` for storage; keep `tests/coursePlayerSplit*` green as a phase-1 gate |
A 2px divider parked at the very top edge is hard to grab on a phone | `grabInset 26` hanging INTO the page + `touch-action: none` on the strip only + a 6% park snap + a first-run hint (the swap-button reveal already teaches "tap the line") |
localStorage quota (Excalidraw scenes, long notes) | Dexie for scenes/blobs; the existing 900 000-char caps stay; the UI surfaces "Device storage is full" (copy already written) and offers Export |
No cloud ⇒ data loss on "clear site data" / uninstall | Export/Import (`jszip`, already a dependency) + a first-run line in the drawer: "Work data lives only on this device" |
The app is light-only by owner decision and pinned by tests | Work's dark theme is scoped to `[data-work-shell]`; a contract test proves `html[data-theme]` stays `light` |
My Day's canonical model is Joplin + Firestore | Work My Day is a NEW local store that reuses the *model*, *recurrence* and *formatting* modules only; no writes to `users/{uid}/joplin*`; an optional one-way local import can be added later |
Revision's Dexie DB is shared with `#/revision` | separate owner namespace `work:<uid|device>`; `{cloud:false}` on both hydrate and persist so the main feature's sync is untouched |
Reminders can't fire when a web tab is closed | native local notifications via the existing Capacitor bridge; on web the UI states the limitation instead of promising an alarm |
AI needs the server (model + quota) | only inference leaves the device; transcripts stay local; the page states this and reuses the existing allowance card |
Bundle size (Excalidraw + xyflow + BlockNote + Recall) | everything behind `lazyRoute`/`React.lazy` inside the Work chunk; `vite.config.ts` manual-chunk rules unchanged; measure with the existing `perfMonitor` marks |

---

## 14. Decisions and remaining defaults

**Confirmed by the owner for Phase 0 + 1:**

1. **Split geometry:** divider parks at the top; the last/current page stays in
   the lower/secondary slot. A real downward drag fills the upper/primary slot
   with the previous page (or a small picker if there is no history). Later
   navigation replaces only the lower slot.
2. **Footer scope:** Work's Uiverse pill is also the **4th global footer style**
   in Settings, beside Edge-to-edge / Four-button glass / Classic glass dock.
3. **Revision data:** a separate local Work library, not `#/revision`'s shared
   dataset. Its future key is `work:<uid|device>`.

**Product-language defaults implemented unless the owner changes them:**

4. **Accent:** the app's own per-destination Course Player colours, not the
   reference's pink. This follows the explicit brief to keep the app's palette.
5. **Signed-out Work:** allowed, scoped to `device`; signed-in data is keyed by
   uid and still stays on-device.
6. **My Day data:** the Work planner starts empty; it does not silently copy
   Joplin/Firestore content. A future explicit local import can be added.
7. **Desktop rail:** the asked-for top-bar **Work** button only. The global left
   rail is left intact until the owner asks for another entry.
```
