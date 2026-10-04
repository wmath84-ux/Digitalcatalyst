# Course Player — Sketch (Excalidraw) integration

Technical report, 14 points. Branch `arena/01a10511-digitalcatalyst`, commit
`071ff54`.

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
