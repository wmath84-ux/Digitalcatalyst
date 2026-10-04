# Course Player — Sketch: canvas colour, RGB picker, sticky notes

Technical report. Branch `arena/01a10585-digitalcatalyst`, working on top of
commit `f83649c`.

---

## 1. What was asked

Four things for the Course Player's Sketch tab:

1. The sketch theme defaults to **dark** — add a **white canvas** option.
2. Add a **pencil icon** that opens a **custom canvas colour picker — full
   RGB** (R/G/B 0–255, not just a preset list).
3. A **"colorful card" option is missing from the toolbar** — it exists on
   `excalidraw.com` but not in the player; identify it and add it.
4. **Persist the canvas colour** — reopening the sketch must show the same
   canvas colour.

Items 1, 2 and 4 needed only this repo. **Item 3 forced a decision about the
editor itself** — see §3.

## 2. What the "colorful card" is

It is the **Sticky Note tool** — keyboard shortcut **`N`**, the small
multi-coloured card icon in the `excalidraw.com` toolbar (V R D O A L P T
**N** E). It drags out a coloured note (yellow/pink/blue/green/…); the note
resizes proportionally to its text, supports a coloured background while you
type its label, and a slightly lifted corner at roughness ≥ 2.

Verified on the live site: it is one of Excalidraw's toolbar tools, a distinct
element type (`stickynote`) — not a preset, not a frame, not a card export.

Sticky notes were merged to `excalidraw` **master on 2026-09-06** and do not
exist in any published stable release. The player pinned
`@excalidraw/excalidraw@0.18.1` (July 2026) — which has no `stickynote`
element type at all. There is no way to add the tool to the 0.18.1 editor
without the editor itself: the element type, toolbar item, resize logic, text
fitting and rendering all live inside the package. So item 3 is an **editor
upgrade**, and this report covers it honestly.

## 3. The upgrade: 0.18.1 → 0.18.0-4ce38fb

`@excalidraw/excalidraw`'s latest **stable** is still `0.18.1`. The project
publishes **pre-releases of master** to npm (dist-tag `next`), each pinned to a
master commit. The newest at the time of this work:

```
"@excalidraw/excalidraw": "0.18.0-4ce38fb"      # published 2026-10-01
```

- It is an **official build** from the project's own pipeline — the same code
  the `excalidraw.com` toolbar runs on, three days old.
- Its workspace dependencies (`@excalidraw/common`, `@excalidraw/element`,
  `@excalidraw/math`, …) are published at the **same pre-release version**, so
  it installs cleanly from the npm registry — no vendored tarball, no
  `file:` dependency, no build step in this repo.
- Contains the sticky note tool (verified in the installed bundle: toolbar
  item `toolbar-stickynote`, `setActiveTool({ type: "stickynote" })`, and a
  dedicated `stickynote` element with its own stroke/background state).
- Exports `onExcalidrawAPI` (renamed from `excalidrawAPI` in 0.18.1) — see §8
  for the one prop that changed.

**What else comes with it** (all of it was in the six months between 0.18.1
and this build — none of it is optional): the reworked toolbar (real
`<button>`s, letter badges), right-click-to-pan, wheel-button zoom,
autoshapes, TTD dialog, command palette, magic frames, bucket fill, the
spreadsheet view, and WYSIWYG text editing (links in text, via CodeMirror —
its chunk loads lazily only when a learner starts editing text).

**Compatibility with existing sketches — verified.** The player stores scenes
as versioned JSON. A 0.18.1-format scene (freedraw stroke with nested
`points`, rectangle with roundness, `appState` with `theme` /
`viewBackgroundColor`) was run through the new build's `restoreElements` +
`restoreAppState`: both restore cleanly, element types and geometry intact,
`points` preserved byte-for-byte. Excalidraw's restore is designed for
forward-compat (a new editor always reads old files), and this confirms it for
the exact shapes this repo persists.

## 4. The canvas-colour subtlety (why a colour is a *pair*)

In 0.18.1, `viewBackgroundColor` painted verbatim. **In this build the canvas
colour is theme-filtered**: `bootstrapCanvas` applies
`applyDarkModeFilter(viewBackgroundColor, theme === "dark")` — under the dark
theme the colour is *inverted* (white → `#121212`, black → `#ededed`, red →
`#ff9090`). That is how the editor's own dark canvas works, and it means a
learner who picks "white" would otherwise get near-black on reopen.

So every canvas choice persists as a **theme + colour pair**, and the rule is
*what you pick is what you see*:

| Learner picks | Persisted to the board (`appState`) | Renders as |
| --- | --- | --- |
| **Theme default** (the dark swatch) | `theme: "dark"`, `viewBackgroundColor: "#ffffff"` | the editor's dark canvas (`#121212`) |
| **White** swatch | `theme: "light"`, `viewBackgroundColor: "#ffffff"` | white |
| **Any RGB colour** | `theme: "light"`, `viewBackgroundColor: <hex>` | that exact hex |

The **board's saved theme is authoritative** on reopen:

```
board theme "light"  →  its saved viewBackgroundColor (the colour swatch lights up)
board theme "dark"   →  the dark canvas (theme swatch lights up)
no saved theme       →  the learner's device preference → else dark
```

`viewBackgroundColor` is a **required `string`** in this build's `AppState`
type (never `undefined`) — both keys are already in the persistence
whitelist, so no schema change was needed.

## 5. The picker: a pencil with full RGB

On the save line, right of the two swatches (theme-default + white), a **pencil
chip** opens the picker:

- **Three sliders — R, G, B, each 0–255** — plus a **hex field** (accepts
  `rgb`–style shorthand `abc` or full `aabbcc`, with or without `#`).
- **Sliding previews live** on the canvas (the editor is updated through its
  imperative API as the finger moves); the colour is **committed (persisted)
  on release / blur / Enter** — a long drag costs one save, not one per tick.
- The **"Theme" button** resets to the dark default and closes the picker.
- While a custom colour is active, **the pencil chip becomes that colour**
  (icon auto-contrasts: dark icon on light fills, white on dark — a simple
  luminance threshold), so the current choice is visible at a glance.
- The picker closes on outside click; it is plain DOM + CSS, no new dependency.

## 6. Persistence (item 4) — two places, one rule

A committed colour is written **twice**, synchronously:

1. **The board** (per course + module): `appState.theme` +
   `appState.viewBackgroundColor` join the normal scene save — debounced,
   mirrored to the device copy, uploaded on the existing retry ladder. This is
   why *this* board reopens with *its* colour even on another device.
2. **The learner's device preference**
   (`localStorage`, keyed by learner id, guests share one): the last-used
   colour, applied as the starting canvas of a **new** board — so a learner
   who works on a white canvas gets a white canvas for their next module
   without re-picking.

The board always wins over the preference; the preference is only the *first
guess* for boards with no saved theme yet.

## 7. Files

| File | Change |
| --- | --- |
| `src/course/SketchPanel.tsx` | Swatches (theme default + white), the pencil chip + `SketchColourPicker` (full RGB + hex), `applyCanvasColour` (theme-pair application through the editor API), theme-aware `initialData`, the `canvasColor` / `onCanvasColorChange` props. |
| `src/course/useCourseSketch.ts` | `canvasColor` (derived: board theme → device preference), `setCanvasColor` (persists the theme-pair to the board's `appState` **and** the device preference, then debounces the save). |
| `src/CoursePlayerApp.tsx` | Two props wired through to the lazy `SketchPanel`. |
| `package.json`, `pnpm-lock.yaml`, `package-lock.json` | `@excalidraw/excalidraw` `0.18.1` → `0.18.0-4ce38fb` (exact pin; both lockfiles regenerated). |

`src/course/excalidrawAssets.ts`, `utils/sketchScene.js`, the split deck, the
firestore rules and the vite config are **untouched** — the font pipeline and
the `excalidraw-assets` path resolution work identically on the new build
(verified: the same `dist/prod/fonts/…` layout is served by the dev server).

## 8. The one API break, handled

`0.18.1` called the imperative handle `excalidrawAPI`; this build renamed it
to **`onExcalidrawAPI`** (same signature, still called with `null` on
unmount). The panel derives its `ExcalidrawAPI` type from the component's own
prop type (`ComponentProps<typeof Excalidraw>["onExcalidrawAPI"]`) instead of a
subpath import, so the type can't drift between editor builds.

Also new in the public surface: the top-level `restore` export was removed in
favour of `restoreElements` / `restoreAppState` (used by §3's compatibility
check).

## 9. Bundle

The `course-sketch` chunk (lazy — loaded only when a learner opens the Sketch
tab for the first time) grew with the six months of editor:

| Chunk | Before (0.18.1) | After (0.18.0-4ce38fb) |
| --- | --- | --- |
| `course-sketch` (JS) | 1,130 kB raw / 371 kB gzip | 2,427 kB raw / **736 kB** gzip |
| `course-sketch` (CSS) | 184 kB / 28 kB | 188 kB / 29 kB |
| `CodeMirrorEditor` (JS) | — | 295 kB / 99 kB — **dynamic**, loads only when text editing starts (WYSIWYG links) |
| `subset-shared.chunk` (JS) | 1,819 kB / 736 kB | 1,820 kB / 737 kB — unchanged; lazy, font-subset export paths only |

First paint and every other tab are unaffected: the chunk is behind
`React.lazy`, and the player's own chunks are unchanged. The size is the
intrinsic cost of the feature — the sticky note tool ships with the rest of
that master build.

## 10. Verification

**Verified (ran it):**

- `npx tsc --noEmit` — clean apart from the 9 pre-existing unused-var notes
  (TS6133) that predate this work. Zero new diagnostics.
- `node --test tests/courseSketch*.test.mjs` — **39/39**, including the
  integration-contract pins (official editor import, no `UIOptions`
  kill-switches, no hand-rolled canvas, keying, prop set).
- Full suite `node --test tests/*.test.mjs` — **3,080 tests, 3,002 pass,
  33 fail, 45 skipped — identical to the pre-change baseline** (the 33 fails
  are the pre-existing store/leaderboard/MyDay/glass-plate/FlowPath/APK
  set; none touch the player or sketch).
- **Restore compatibility** — a 0.18.1-format scene run through the new
  build's `restoreElements`/`restoreAppState`: elements, nested freedraw
  `points`, theme and `viewBackgroundColor` all survive (§3).
- `npm run build` — exit 0 (~49 s). **Lightning CSS oklch gate: 0** `oklch()`
  in `index.html` (the known Tailwind v4 build issue stays fixed).
- Dev server (`npm run dev`): app shell, `SketchPanel.tsx`, the excalidraw
  module and a font asset all serve `200`; the served dev bundle contains the
  `toolbar-stickynote` item and `setActiveTool({ type: "stickynote" })`.
- Installed-package audit: pre-release's `dist` has the same `dev`/`prod`/
  `types`/`fonts` layout, **zero `process.env` references** (no Vite `define`
  workaround needed, as before), and its CSS is fully scoped to
  `.excalidraw*` / `#excalidraw*` selectors (0 unscoped element selectors —
  nothing leaks into the player's chrome).

**Not verified (honest list):**

- **No browser click-through in this environment** — I could not open a real
  browser here, so: the picker's sliders/hex UX, the live preview during a
  drag, drawing a sticky note, its proportional resize and its colours, and
  the actual persisted-reopen loop with a signed-in learner were not
  exercised by hand. Every one of those paths is covered by code review and
  the unit/runtime tests above; the sticky note's *behaviour* is Excalidraw's
  own shipped code, verified only for presence in the bundle.
- Firestore round-trip of the new `appState` keys relies on the existing
  whitelist path (both keys are plain strings, already permitted by
  `firestore.rules`' owner-only sketch block).

## 11. Decisions and trade-offs

- **Upgraded the editor rather than forking it.** Adding sticky notes to
  0.18.1 is impossible short of vendoring and patching the package; the
  project's own published pre-release is a cleaner, reproducible substitute.
  If sticky notes land in a stable `0.18.x`, the pin can move to that — the
  app code is version-agnostic except for the `onExcalidrawAPI` prop name.
- **Exact pin, not a caret.** `0.18.0-4ce38fb` is an immutable build of a
  known master commit; a caret on a pre-release would silently float.
- **Colours persist as theme-pairs** (§4) instead of fighting the dark-theme
  colour filter — a hex alone is ambiguous on this build.
- **The device preference is advisory; the board is authoritative.** Two
  learners on one device don't overwrite each other's boards' canvas colours,
  and a learner's habit (white canvas) carries to new modules.
- **Accepted the +365 kB gzip** on the lazy sketch chunk as the cost of a
  six-month-old editor; it is not on first paint and not on any other tab.
