# Course Player — Sketch (Excalidraw) integration

Technical report, 14 points. Branch `arena/01a10511-digitalcatalyst`, commit
`071ff54`.

The follow-up — white canvas, the full-RGB pencil, the missing "colourful
card" and the remembered canvas — is the addendum at the end (branch
`arena/01a10569-digitalcatalyst`).

---

## 1. What was integrated

The official **`@excalidraw/excalidraw@0.18.1`** React package — the real
editor with its own toolbar, tool palette, context menus, undo/redo, zoom,
colour pickers, library, export dialog and canvas gestures.

- Imported as `import { Excalidraw } from "@excalidraw/excalidraw"` plus
  `import "@excalidraw/excalidraw/index.css"`.
- **Nothing is re-implemented.** No hand-rolled toolbar, no custom pen
  buttons, no `UIOptions` kill-switch, no `ui: false`, no `viewModeEnabled`,
  no `zenModeEnabled`, no `<canvas>` of our own.
- React 19 safe: the package's peer range is `^17 || ^18 || ^19`, and the
  published build contains **zero `process.env` references** in both its
  `dev` and `prod` entries, so the usual Vite `define` workaround is not
  needed.

## 2. Files

**Added**

| File | Role |
| --- | --- |
| `utils/sketchScene.js` (+ `.d.ts`) | Pure scene model: sanitise, serialise, size-cap, doc id, change signature. No React, no Firestore, no Excalidraw import. |
| `src/course/useCourseSketch.ts` | Persistence hook: load, debounce, mirror, retry, flush, status. |
| `src/course/SketchPanel.tsx` | The host component: sizing box + save line + the editor. |
| `src/course/excalidrawAssets.ts` | Sets `window.EXCALIDRAW_ASSET_PATH`. |
| `tests/courseSketchScene.test.mjs` | 13 tests — the scene model. |
| `tests/courseSketchCloudSyncRuntime.test.mjs` | 13 tests — the hook, really running. |
| `tests/courseSketchIntegrationContract.test.mjs` | 13 tests — the integration's shape. |

**Changed**

| File | Change |
| --- | --- |
| `src/course/CourseOverlay.tsx` | `"sketch"` added to `DockTab`, one row in `TABS`, a `sketchPanel` slot in `StudyContent` + `CourseOverlayProps`, a `SKETCH_FALLBACK`. |
| `src/CoursePlayerApp.tsx` | `useCourseSketch` call, the lazy `SketchPanel`, the tab-exit flush, `keyboardExpandEnabled` + `solid`. |
| `src/course/splitMotion.ts` | `SPLIT_DOCK_MIN_PX` 336 → 380. |
| `firestore.rules` | New owner-only `users/{uid}/sketches/{sketchId}` block. |
| `vite.config.ts` | `excalidraw-assets` plugin + the `course-sketch` manual chunk. |
| 5 test files | The four 7-tab assertions, now eight. |

`src/course/studyPanels.tsx` (the Split Deck), `GlassDock.tsx`,
`CoursePeekDock.tsx` and `src/index.css` are **untouched**.

## 3. One more tab — not a second dock

Sketch goes through the infrastructure that already exists:

```
DockTab  ──►  TABS  ──►  STUDY_TAB_ORDER  ──►  buildDockItems  ──►  GlassDock
                   └────────────────────────►  StudyContent
```

- It is appended as the **last** entry of `TABS`, so no existing tab changed
  position and no learner's muscle memory (or `⌘/Ctrl+1…7`) moved. `⌘/Ctrl+8`
  now reaches it, because the shortcut walks `visibleTabOrder.length`.
- Label **Sketch**, icon `PenLine`, colour **`#F97316`** — the peek rail,
  the dock plate tint and the tooltip all pick that up from the one list.
- Both dock homes (in-pane `CourseOverlay` and the collapsed
  `CoursePeekDock`) are fed by the same `buildDockItems`; neither file needed
  a Sketch-specific line. Footer dimensions, materials, the entrance spring,
  the magnification wave and the stagger are all unchanged.
- **Moving the tab next to Mind map is a one-line change**: move the
  `{ key: "sketch", … }` object in `TABS` to sit after the `mindmap` row.
  Nothing else reads a hard-coded index.

## 4. Sizing — how Excalidraw gets a real box

```
study pane (deck-owned, flex column)
└─ [data-course-sketch-panel]   relative flex h-full min-h-0 w-full flex-col
   ├─ save line                 shrink-0
   └─ [data-course-sketch-canvas] relative min-h-0 w-full flex-1
      └─ [data-course-sketch-host] absolute inset-0
         └─ <Excalidraw/>
```

- The editor's parent is an `absolute inset-0` child of a `flex-1` box, so
  its width and height **always resolve** from the pane's own geometry —
  in portrait (lecture above / sketch below) and in landscape (side by side)
  alike, because the deck flips the axis, not the panel.
- **No `window.innerWidth` / `innerHeight`, no `visualViewport`, no `100vh`,
  no percentage heights** anywhere in the panel.
- **No app-side `ResizeObserver`.** Verified in the shipped bundle:
  Excalidraw 0.18.1 constructs its own
  `new ResizeObserver(() => { this.refreshEditorBreakpoints(); this.updateDOMRect(); })`
  on its container, so adding a second one would only duplicate work. The
  requirement "ResizeObserver only where necessary" is met by needing none.

## 5. The split still belongs to the Split Deck

`SplitDeck` remains the single source of truth for the ratio, the drag, the
snap points, collapse-to-rail, the peek rail, the keyboard hand-over, the
orientation axis and the per-course ratio persistence. The panel contains the
word "ratio" only in a comment; a contract test strips comments and asserts
the source has no ratio code, no window measuring and no pointer handlers.

`SPLIT_DOCK_MIN_PX` moved 336 → **380** because the floor's whole purpose is
"a landscape pane must never be narrower than the dock inside it":
8 plates × 38 px + 7 gaps × 6 px + 2 × 12 px inline padding = **370 px**,
rounded up for the plate border. The CSS dock-zoom rules in `src/index.css`
(the 0.88 zoom under 350 px and the P0-5 `zoom: 1 !important` override) were
deliberately left alone.

## 6. No remounts

The editor is keyed by **`sceneKey`**, which is
`` `${docId}#${generation}` `` — course + module, plus a counter that only
moves when a late cloud read replaces a board the learner had already opened.

- Never `key={splitRatio}`, `key={width}`, `key={activeTab}`,
  `key={orientation}`.
- `initialData` is memoised on `sceneKey`, so a re-render (save line, divider
  drag, status change) can never hand the editor a fresh object either.
- A runtime test re-renders the hook repeatedly, draws, and asserts the key
  is byte-identical; switching modules is the only thing that moves it.
- Because `initialData` is read once per mount, the panel takes the scene
  through a **`getScene()` getter**, not a value: drawing deliberately does
  not re-render the player, so a plain prop could hand a remounting editor a
  scene one debounce out of date.

One deliberate exception: the Sketch body is only rendered while its tab is
active (`StudyContent`'s switch), so leaving the tab unmounts the editor and
returning mounts it on the scene the hook still holds. That is what keeps the
1.1 MB chunk off every other tab; the scene itself lives in `CoursePlayerApp`,
so nothing is lost, and the tab-exit effect flushes the last stroke
immediately rather than waiting for a timer.

## 7. Scope — uid + course + module

Mirrors the mind map exactly, including reusing the player's
`activeMindMapModuleId` (the module of the lesson being watched):

```
users/{uid}/sketches/{uid}__{productId}__{moduleId}
```

Module A's board cannot appear under Module B — they are different documents
and different `sceneKey`s — and coming back to A restores A. The **resource**
open beside the board is recorded as an association (`resourceId`,
`resourceName`) rather than as part of the key, because a learner draws about
the lesson, not about one PDF inside it; switching files inside a module
therefore keeps the same board instead of blanking it.

## 8. Storage schema

The single hard constraint: **Firestore rejects nested arrays**, and an
Excalidraw freedraw element is `points: [[x, y], …]`. So the structured scene
(elements + whitelisted appState + files) is stored as **one JSON string**.

```jsonc
{
  "uid": "…", "productId": "…", "moduleId": "…", "sketchKey": "main",
  "version": 1,
  "scene": "{\"version\":1,\"elements\":[…],\"appState\":{…},\"files\":{…}}",
  "elementCount": 42,
  "updatedAt": 1730000000000, "createdAt": 1720000000000,
  "resourceId": "file-9", "resourceName": "Lecture 3.pdf"   // optional
}
```

- **Never a screenshot.** No `toDataURL`, `exportToCanvas` or `exportToBlob`
  anywhere — asserted by test.
- `appState` is whitelisted: canvas colour, theme, grid, zoom (clamped
  0.1–30), scroll position and the learner's current pen. Ephemeral UI
  (`selectedElementIds`, `collaborators`, `draggingElement`, `openMenu`, …)
  is dropped, so reopening never restores a half-finished gesture.
- Caps, with the rules enforcing the same numbers: 1 500 elements,
  420 000 chars of images, 760 000 chars of scene. Over the ceiling the
  images go first (recoverable), the drawing last.
- Device mirror: `dc.sketch.v1.{uid}.{productId}.{moduleId}`, plus a durable
  outbox flag `dc.sketchOutbox.v1.…`.

## 9. Sync behaviour

| Concern | Behaviour |
| --- | --- |
| Debounce | 1 100 ms of quiet; a continuous drawing still checkpoints every 6 000 ms. Local mirror at 350 ms. |
| Write per pointer event | Impossible: a cheap change signature (count + Σversion + Σ versionNonce) means Excalidraw's hover/select/menu `onChange` storms write nothing. 25 `onChange` calls from one stroke = **1** write (test). |
| Flush | Tab switch, unmount, `pagehide`, `visibilitychange`, and leaving the module. |
| Retry | Up to 8 attempts, backoff `min(20 s, 1.5 s × attempts)`, plus an immediate retry on the `online` event. |
| Stale writes | Every write carries its revision; an acknowledgement only clears the dirty flag if nothing was drawn while it was in flight. |
| Failure | Local work is **never** erased. The device copy is written *before* the cloud attempt, the outbox flag persists across reloads, and the board on screen is untouched. |
| Failed read | The device copy stays on screen — a refused read never blanks the board — and the editor opens anyway after a 2.5 s grace window. |
| Conflict | The newer `updatedAt` wins; a newer local board drawn offline is pushed up over an older cloud copy. |
| Ownership | A uid the session cannot verify (`auth.currentUser.uid` mismatch) never reaches the network at all. |
| UI | One slim line: `Saving…` / `Saved` / `Offline draft — saved on this device`. No banner, no modal, nothing disabled while saving. |

## 10. Security rules

```
match /users/{uid}/sketches/{sketchId} { … }
```

- Read/delete: `isOwner(uid) || isAdmin()`.
- Create/update: `isOwner(uid)` **and** the document id is re-derived from the
  path's uid — `sketchId == uid + '__' + productId + '__' + moduleId` — so a
  client-supplied uid is worthless and no learner can address another's board.
- `scene is string` and `≤ 900 000` chars; `elementCount ≤ 1500`;
  `sketchKey` is a `^[a-z0-9-]+$` slug ≤ 40 chars; optional resource fields
  are bounded strings.
- The usual privilege-escalation blocklist (`role`, `status`,
  `purchasedProductIds`, `coinBalance`, `subscriptionTier`, …) is carried over.
- No existing rule was weakened; the notes and mindMaps blocks are untouched.

## 11. Bundle + lazy loading

`CoursePlayerApp` loads the panel with `lazy(() => import("./course/SketchPanel"))`
behind a `Suspense` spinner — the same pattern as `MindMapPanel` — and neither
the player nor the overlay imports Excalidraw statically.

| Chunk | Size | When |
| --- | --- | --- |
| `course-sketch-*.js` | 1 130 kB / **371 kB gzip** | first activation of the Sketch tab |
| `course-sketch-*.css` | 143 kB / **22 kB gzip** | same |
| mermaid chunks | ~700 kB | only if the learner opens Excalidraw's own "Mermaid to Excalidraw" dialog |
| ~57 locale chunks | ~2 kB each | only for a non-English UI language |

`CoursePlayerApp`'s own chunk is unchanged at 192 kB. The chunk is pinned by
name in `manualChunks` because Rollup had named it `percentages-BXMCSKIN.js`
after a module deep inside the editor's tree — unreadable in a build report
and in the service worker's precache list.

Excalidraw's stylesheet was audited for leakage: every selector is either
scoped to `.excalidraw` / `:root` or uses an Excalidraw-only class name
(`.exc-stats`, `.ProjectName`, `.zoom-actions`, `.LoadingMessage`,
`.footer-center`, `.visually-hidden`), none of which the app uses.

## 12. Fonts and the offline build

Excalidraw fetches its hand-drawn fonts at runtime and, with no
`window.EXCALIDRAW_ASSET_PATH`, falls back to `https://esm.sh/…`. That would
mean a third-party request per sketch and **no text at all** inside the
Capacitor WebView when offline.

- `src/course/excalidrawAssets.ts` sets the path to `/excalidraw-assets/`
  and is imported *above* the editor import, so the value exists before the
  font loader runs.
- The `excalidraw-assets` Vite plugin serves that prefix from the package in
  dev (verified byte-identical over HTTP) and emits
  `dist/excalidraw-assets/fonts/<Family>/…` at build time.
- **504 KB total**: the 13 MB `Xiaolai` CJK family is deliberately excluded —
  26× the other eight families combined, for a script this catalogue does not
  teach in. If a learner ever types CJK, Excalidraw's own CDN fallback still
  resolves it.

## 13. Keyboard, touch and the divider

- **One keyboard detector.** The panel contains no `visualViewport` code, no
  `useCourseKeyboard` call and no keyboard hack. Sketch simply joins the
  writing tabs in `keyboardExpandEnabled`, so the soft keyboard hands the
  whole deck over and the footer dock hides exactly as it does for notes,
  the mind map and the AI chat. No footer-over-keyboard regression.
- **`handleKeyboardGlobally={false}`**: the editor only takes the keyboard
  while the learner is actually in it, so the player's `⌘/Ctrl+1…8` keep
  working.
- **Touch/stylus**: Excalidraw's own pointer handling is left alone. The
  panel sets no `touch-action`, calls no `preventDefault`/`stopPropagation`
  and registers no pointer listeners, so canvas gestures cannot drag the
  divider and the divider's pointer capture cannot be stolen by the canvas.
- Sketch was added to the `solid` tab list: a frosted pane behind a drawing
  surface is unreadable.

## 14. Verification, and what is *not* verified

**TypeScript** — `tsc --noEmit`: only the repo's 9 pre-existing `TS6133`
unused-symbol errors (`FlowPathImportModal`, `FlowPathView`, `main.tsx`,
`capacitorBridge`). Nothing new.

**Build** — `vite build` ✓ in ~40 s; `grep -c "oklch(" dist/index.html` = 0
(the Lightning CSS gate still holds).

**Tests** — `node --test tests/*.test.mjs`: **3 080 tests, 2 998 pass,
33 fail, 45 skipped**. The 33 failures are byte-for-byte the repo's
pre-existing baseline (store/leaderboard/My Day/glass-plate/FlowPath/APK
contracts) — diffed against the pre-change list; **zero new failures**.
39 of the new tests are this feature's:

- scene model 13 ✓ — round trip with nested `points`, no arrays in the
  document, corrupt input, whitelisting, caps, trimming order, signature;
- hook runtime 13 ✓ — real React 19 + jsdom + in-memory Firestore: the write
  path, debouncing, the no-op storm, module isolation and restore, key
  stability, zero renders while drawing, refused write → device + retry →
  land, refused read → board intact, unmount flush, pagehide flush, unverified
  uid, unscoped inertness, second-device open, newer-local-wins;
- integration contract 13 ✓ — official component, no `ui:false`, one dock,
  no geometry in the panel, no forbidden keys, lazy chunk, slim status,
  rules, fonts, touch.

**Not verified in this environment:** the editor was never painted in a real
browser. The sandbox has no Chromium binary and the Playwright CDN is
unreachable, so "a stroke appears under the finger" and "the canvas re-lays
out while the divider is dragged" rest on the source contract plus
Excalidraw's own behaviour, not on a screenshot. A dev server is running on
port 5173 for exactly that click-through. Likewise, the Firestore rules are
proved by their text and by the payload builder, not by the emulator suite.

**Known trade-offs:** (a) the editor unmounts when its tab loses focus — the
scene survives, but Excalidraw's undo history does not; (b) a board with no
module scope (no lesson open) is editable but not saved, and says so; (c) CJK
text needs the CDN fallback.

---

# Addendum — the white canvas, the pencil, and the missing "colourful card"

**Branch `arena/01a10569-digitalcatalyst`.** The 14 points above still stand.
This addendum covers the four asks that followed them:

1. a **white** canvas next to the dark one;
2. a **pencil** that opens a **full-RGB** colour picker — not preset swatches;
3. the **"colourful card"** the learner saw in the toolbar on excalidraw.com
   but not in this app — find out whether it is genuinely missing, and add it;
4. the choice must be **remembered**: close the sketch, reopen it, same canvas.

## 15. The missing toolbar item was the sticky note — and it needed the nightly

The item the learner remembered as a *colourful card* is Excalidraw's
**sticky note** (element type `stickynote`, tool letter `N`, click-place
250×250 or drag-to-size, its own colour domain). It was *not* installed
incorrectly: it does not exist in any stable release yet.

- Mounting the real `@excalidraw/excalidraw@0.18.1` editor (an esbuild+jsdom
  probe, the recipe in §20) listed the whole toolbar: hand, selection,
  rectangle, diamond, ellipse, arrow, line, freedraw, text, eraser — plus
  lock, main menu, Library, zoom, undo/redo, Help. **No sticky note**, and no
  public prop or `UIOptions` key to add one.
- Upstream, sticky notes landed on `master` (changelog entry 2026-09-06;
  PR #12064 merged 2026-09-10) and are live on excalidraw.com, but they are in
  **no published stable version** — 0.18.1 predates them.
- **Decision: pin the nightly `@excalidraw/excalidraw@0.18.0-4ce38fb`**
  (registry time 2026-10-01T15:16Z). It is the only line that carries *both*
  the sticky-note tool and the dark-mode filter helpers the canvas colour
  needs (`applyDarkModeFilter` / `removeDarkModeFilter`).
- **Verified, not assumed**: the new `tests/courseSketchToolbarRuntime.test.mjs`
  bundles *this* panel, mounts the *real* editor and asserts the toolbar
  contains `aria-label="Sticky note"` (testid `toolbar-stickynote`) among the
  other tools. `tests/courseSketchIntegrationContract.test.mjs` pins the
  version (`^0\.18\.0-[0-9a-f]{7}$`) and greps the built chunk and locales for
  `stickynote`, so a silent downgrade back to 0.18.1 fails the suite.

**What the pin costs, stated plainly**

| | |
| --- | --- |
| lazy chunk | `course-sketch` is now **2 500.40 kB minified / 755.65 kB gzip** (the build's largest chunk; `CoursePlayerApp` itself is 185.87 kB). It is still lazy — nothing above it imports the editor — but the first Sketch open pulls that payload. |
| API deltas | `onExcalidrawAPI?(api \| null)` replaces `excalidrawAPI`; `setViewport({ fit })` replaces `scrollToContent`; `setActiveTool(tool, { keepSelection?, toggle? })` replaces the `toggle*Tool`/`setFrameAsActiveTool`/`setEmbeddableAsActiveTool` helpers. `handleKeyboardGlobally`, `autoFocus`, `name`, `window.EXCALIDRAW_ASSET_PATH` and `index.css` are unchanged. |
| interop | an app still on 0.18.1 treats `stickynote` as an unknown element and drops it. Boards drawn here are only fully visible in editors on the same nightly line. |
| lockfile | the 384 new packages are the nightly's **own closure** — it depends on `radix-ui@1.4.3` (the whole `@radix-ui/react-*` set), `@codemirror/*`, `browser-fs-access@0.38.0` — which also explains the moved `@radix-ui/react-popover` / `react-tabs` versions. Reproduced from HEAD's lock with *only* the version swapped: `npm install --package-lock-only` yields the current lock byte-for-byte (1 453 entries, **0** version diffs). No unrelated upgrade is hidden in the diff. |

## 16. A canvas colour is two appState values, not one

Excalidraw renders `viewBackgroundColor` **through** a theme filter: the
`theme` decides whether the dark filter applies, and the filter is a real
transform of the stored colour, so the value you write is not the value on
screen. The nightly's `@excalidraw/common` exposes it:

- forward (`applyDarkModeFilter`): per channel,
  `round(clamp(c·(1−p) + (255−c)·p, 0, 255))` with **p = 0.93**, then
  `hue-rotate(180°)`, re-hexed and memoised;
- inverse (`removeDarkModeFilter`): `round(clamp((c − 255p)/(1 − 2p), 0, 255))`
  plus the same rotation.

Emitted range is `[18, 237]`: `#ffffff → #121212`, `#000000 → #ededed`,
`#121212 → #dedede`, `#808080 → #7f7f7f` (greys survive the rotation).

**Round trip, inverse → forward, measured** (this is the honest part):

| colour | requested → rendered | error |
| --- | --- | --- |
| `#121212`, `#1e293b`, `#212529`, `#2b2b2b`, `#20303c`, `#006400` | exact | 0 |
| `#3f1d38` | `#3f1d38`-family | −3 |
| mid greys | ±1 | 1 |
| `#141e3c` | `#17212d` | 20 |
| `#1e40af` | `#284a7a` | 53 |
| `#8b0000` | `#532a2a` | 56 |
| `#4b0082` | `#412041` | 65 |
| worst grid case | — | 202 |

An uncompensated `#1e40af` would render `#98b5ff`; the inverse pass makes it a
dark navy. Neutrals and slates are exact, mid greys ±1, saturated colours keep
their hue family but drift — that is the filter's gamut, not a rounding bug.
`tests/courseSketchCanvasTheme.test.mjs` asserts exactly this (same hue family
**and** closer than stock, plus the exact exceptions) — do not tighten it to
byte-equality for saturated colours, it cannot hold.

## 17. `utils/sketchCanvas.js` (+ `.d.ts`) — the model

Pure, and it imports **nothing** from Excalidraw or React, so the maths is
testable and reusable:

| export | role |
| --- | --- |
| `SKETCH_CANVAS_PRESETS` | dark `#121212` (default), white `#ffffff`, paper `#f6f3e7`, sky `#e4eeff`, mint `#e3f3ea`, grey `#eef0f3` |
| `sketchCanvasAppState(color)` | `{ theme, viewBackgroundColor }` — `theme` is `light` for luminance ≥ 0.5, else `dark` |
| `sketchThemeForColor`, `sketchColorLuminance`, `normalizeSketchColor`, `sketchColorChannels`, `sketchRgbToHex` | colour maths |
| `sketchColorUnderDarkFilter`, `sketchSceneCanvasColor`, `sketchRenderedCanvasColor` | forward filter, inverse (what to store), and what the learner will actually see |
| `sketchCanvasFromAppState(appState)` | read a board's canvas back |
| `readSketchCanvasPreference` / `writeSketchCanvasPreference` | the remembered choice (`dc.sketchCanvas.v1`, `.<uid>` when signed in); every read/write is guarded and never throws (private mode, SSR) |

The header of the file documents the filter's real gamut (`[18, 237]`) so the
next reader does not have to rediscover it.

## 18. The control — `src/course/SketchCanvasControls.tsx`

It lives in the panel's existing save line, **not** as a cloned toolbar. A host
button cannot render Excalidraw's `.ToolIcon` island/`--checked` chrome, and
re-skinning the toolbar is exactly what §1 forbids; the control is ours, the
drawing UI stays theirs.

- **Canvas row**: a **Dark** swatch and a **White** swatch (the two the learner
  asked for) plus a **pencil** icon.
- **Pencil → popover**: 6 preset swatches, **R / G / B sliders with number
  spinners**, a hex field, a live preview and **Done**. Full 0–255 RGB, not a
  fixed palette.
- Dismissal: `Escape` and a `fixed inset-0` backdrop **button** (no document
  listeners, so no listener leak and no interference with the editor's own
  keyboard handling).
- Props-only: it renders what it is told and reports the pick through
  `onPick(color)`; the panel owns the state and the write.
- DOM hooks for the runtime tests: `data-course-sketch-canvas-{controls,pencil,picker,rgb}`
  and `data-canvas-{quick,preset,channel,hex,preview,current,theme,backdrop}`.

## 19. Remembered — and durable

- **Immediately**: the choice is mirrored to `localStorage` under
  `dc.sketchCanvas.v1[.<uid>]`, so reopening the panel paints the learner's
  colour before Firestore answers.
- **Durably**: the colour is written into the board itself
  (`appState.viewBackgroundColor` + `appState.theme`), so it survives a new
  device and a cleared browser. `sanitizeSketchAppState` already keeps any
  string ≤ 200 characters, so a `#rrggbb` value round-trips localStorage and
  the Firestore `scene` payload with **no schema and no rules change**.
- **Apply path**: `editor.updateScene({ appState })` → the editor reports the
  change back through `onChange` → `useCourseSketch` persists it, exactly like
  a stroke. Plus `markSceneChanged()`, because the hook's write queue watches
  **elements**: without it, choosing a colour on an otherwise empty board
  would never reach the cloud. The revision bump it raises also stops an
  in-flight older write from acknowledging the new colour.
- **Who wins on open**: a board that already carries its own colour wins; the
  remembered preference is only used when the board has none. So a colour set
  on the phone shows up on the laptop, and a board is never re-tinted behind
  the learner's back.

## 20. Verification (updated), and what is still not verified

**TypeScript** — `tsc --noEmit`: the same 9 pre-existing `TS6133` errors
(`FlowPathImportModal`, `FlowPathView`, `main.tsx`, `capacitorBridge`), none in
the sketch files.

**Build** — `vite build` ✓ in 52 s. `course-sketch` 2 500.40 kB
(755.65 kB gzip) stays lazy; `dist/excalidraw-assets/` is unchanged at 504 KB
/ 25 files.

**Tests** — the five sketch suites: **64 ✓** —

| suite | tests |
| --- | --- |
| `tests/courseSketchScene.test.mjs` | 13 ✓ |
| `tests/courseSketchCanvasTheme.test.mjs` | 10 ✓ |
| `tests/courseSketchCloudSyncRuntime.test.mjs` | 16 ✓ |
| `tests/courseSketchIntegrationContract.test.mjs` | 19 ✓ |
| `tests/courseSketchToolbarRuntime.test.mjs` | 6 ✓ |

**Full suite** — `node --test tests/*.test.mjs` (271 files, run through
`run_tests.sh`): **3 105 tests, 3 027 pass, 33 fail, 45 skipped** in 127 s, and
all 33 failures are pre-existing. Proof, not assertion: the same 21 files
re-run in a clean worktree of `HEAD` fail with the same 33 tests, and the 33
names are identical between the dot-reporter and spec-reporter full runs; none
of the 21 reads any file this change touches (`store`/`leaderboard`/`My Day`/
glass-plate/FlowPath/APK/user-query contracts). Zero new failures, and the
sketch suites are green inside the full run.

**The real-editor toolbar suite** (worth keeping working): it esbuild-bundles
a TSX fixture that renders the actual `SketchPanel`, mounts it in jsdom and
drives the real editor. Three non-obvious things are load-bearing — the
fixture must go through esbuild `stdin` + `resolveDir` (an on-disk fixture
inside `node_modules/…/` resolves its relative imports there);
`conditions: ["production"]` is required or `@excalidraw/excalidraw/index.css`
cannot resolve; and the runner must release the editor's Node timers and
`unref()` the React scheduler's `MessagePort` handles on teardown, otherwise
the process sits alive ~15 minutes *after* a green run.

**Still not verified here:** the editor has never been painted in a real
browser (no Chromium binary, Playwright CDN unreachable), so the white canvas
and the sticky note are proven by the real editor's own DOM in jsdom, not by a
screenshot. `pnpm-lock.yaml` cannot be regenerated in this environment and
Vercel installs through it: `package.json` is pinned, but the pnpm lock still
says 0.18.1 and must be refreshed from a machine that has pnpm (until then a
frozen-lockfile install will not see the nightly).
