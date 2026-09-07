# Part 12 — Classroom Board Zoom / Fit / Fullscreen

## Scope

The 3D classroom (`src/classroom3d`) lets the learner turn their head
between Board / Notes / Mind / Desk, but the camera was pinned to the
seat with no way to lean closer, and the board — the real
`ResourceViewer`, welded onto the front wall — had no fit or fullscreen
of its own. The only escape hatch was the "Flat player" exit button,
which drops the learner out of the room completely.

This part adds, without touching course state, notes / mind map wiring,
module switching, or any Part 10/11 access-control logic:

* **Camera zoom-to-board** — a clamped lean toward the board on the same
  spring as the head turn (wheel, pinch, double-tap / double-click).
* **Board wall controls** — Zoom in, Zoom out, Fit to screen, Fullscreen
  keys riding the board's own title bar.
* **Fullscreen without leaving the room** — the SAME viewer instance
  shown in the browser's top layer over the live 3D canvas.

The Part 10 `resolveCourseAccess` engine + `useCourseAccess` hook +
`CourseRouteGuard` and every Part 11 viewer behaviour are preserved
unchanged. `CoursePlayerApp.tsx` still owns all course state; the room
stays a shell.

## New files

| File | Purpose |
| --- | --- |
| `tests/classroom3dBoardZoomFullscreenContract.test.mjs` | 24 source-level contract tests for the board lean, controls, fullscreen and Esc priority. |
| `docs/part12-classroom-zoom.md` | This file. |

## Modified files

| File | Change |
| --- | --- |
| `src/classroom3d/state.ts` | New `BOARD_ZOOM_*` constants (`MIN 1 / MAX 2.5 / STEP 0.25 / TOGGLE 2 / PORTRAIT_FIT 1.15 / DOLLY 2.4 m`) + `clampBoardZoom` with a non-finite guard. |
| `src/classroom3d/SeatRig.tsx` | Zoom target alongside yaw/pitch on the same spring; forward dolly from the seat; wheel (board-only, non-passive) + two-finger pinch on the empty room; smooth lean-back when focus leaves `"board"`; `recenterSignal` re-aim without a focus change. |
| `src/classroom3d/panels.tsx` | `BoardPanel` gains the control cluster (+ / − / % / fit / fullscreen), double-click + manual double-tap detection, and a `[data-course-viewer]` guard so viewer gestures stay the viewer's. `DeskPanel` / `WallHeader` untouched. |
| `src/classroom3d/Classroom3D.tsx` | Owns `boardZoom` / `boardFitSignal` / `boardFullscreen`; Fit reuses the existing `portrait` flag; fullscreen reuses ResourceViewer's `requestFullscreen` / `exitFullscreen` mechanism; Esc exits fullscreen first; `+` / `−` / `0` lean while facing the board. |
| `src/classroom3d/classroom3d.css` | Board control cluster in the HUD chip language (sky-tinted); `:fullscreen` top-layer sizing in viewport units + black `::backdrop`; zoom-percentage pop animation with a `prefers-reduced-motion` opt-out. Purely additive. |

## Part 12 coverage

### CAMERA ZOOM

* **Lean range** — `1` (the seat's normal position) to `2.5` (3.6 m of
  forward dolly, stopping 2.2 m short of the chalk rail). The path
  glides over the learner's desk, clear of the mug, the neighbouring
  desks and every classmate behind the seat, so clipping is impossible
  by construction.
* **Spring feel** — the lean rides the exact spring constant already
  used for yaw/pitch (`1 - pow(0.0016, delta)`); focus changes, Fit and
  the lean-back all ease, never jump-cut.
* **Wheel** — a native non-passive listener on the canvas only, gated
  on `focus === "board"`, same `±0.2` notch as the image viewer's wheel
  zoom. Gestures that start on a panel still belong to the panel.
* **Pinch** — the second fingertip on the canvas converts the drag
  into a pinch using the image viewer's distance-ratio maths, clamped
  per move; lifting back to one finger resumes the head turn.
* **Double-click / double-tap** — on the board chrome (title bar and
  empty board areas), faces + centres the board and toggles between
  fit and the 2x close-up. Touch uses a 350 ms / 48 px double-tap
  detector with synthetic-`dblclick` suppression; anything inside
  `[data-course-viewer]` is ignored so double-clicking a diagram zooms
  the diagram exactly as in flat mode.
* **Reset** — looking at Notes / Mind / Desk eases the lean back to 1
  through the existing focus-change effect pattern.

### BOARD CONTROLS

* **Cluster** — Zoom out, live percentage, Zoom in, Fit to screen,
  Fullscreen/Exit, in a glass pill on the board's title bar, following
  the `dc-classroom-chip` / `dc-classroom-hud` visual language with the
  board wall's sky accent. Fit reuses the image viewer's `Maximize`
  glyph; the zoom keys disable at the ends of the lean.
* **Fit to screen** — resets the lean (a touch closer in portrait,
  where the widened lens shrinks the board — reusing the room's
  existing `portrait` flag, not a duplicate) and recentres the head on
  the board's exact centre via the `boardFitSignal` / `recenterSignal`
  pair, which re-aims even when the focus never changed.
* **Facing** — the zoom keys also face the board when pressed from
  another wall; they never disturb a manual head position while
  already facing it.

### FULLSCREEN

* **Same instance** — the board panel is shown with the Fullscreen API
  (the exact `toggleFullscreen` shape from `ResourceViewer.tsx`:
  `querySelector` → `requestFullscreen?.()` / `exitFullscreen()`),
  aimed at `[data-classroom-board-panel]`. The browser paints that one
  mounted viewer in the top layer over the still-alive 3D canvas: no
  unmount, no iframe reload, no lost playback, no portal, no duplicated
  viewer.
* **Exit restores everything** — focus, yaw, pitch and zoom are never
  written on the way in or out, so exiting returns to exactly where
  the learner was.
* **Sync** — a `fullscreenchange` listener keeps the Fullscreen/Exit
  label correct across native Esc and Android swipe-down exits, and
  ignores the YouTube player's own fullscreen button (only a
  fullscreen element inside the board panel counts).
* **Esc priority** — Esc exits board-fullscreen first (reading the
  live top layer, so a lagging sync can neither re-request fullscreen
  nor yank the head to the desk) and only otherwise drops back to the
  desk, as before.

### KEYBOARD

* `1–4` turn the head, `←` / `→` step lessons, `Esc` follows the
  priority above — all unchanged.
* New while facing the board: `+` / `=` lean in, `−` / `_` lean back,
  `0` fits to screen. Typing in inputs and editors is still ignored.

### MOBILE / CAPACITOR

* No HDRI / env maps (the room keeps its local analytic lighting), no
  new dependencies, offline-safe.
* Portrait and landscape both covered: the lens logic is untouched,
  Fit compensates for the portrait widening, and the hint line teaches
  the gestures per orientation.
* Where the Fullscreen API is unavailable the button is a harmless
  no-op — the same behaviour as the flat player's viewer fullscreen.

## TypeScript

`npx tsc --noEmit` — byte-identical to the pre-Part-12 baseline: only
the 6 pre-existing unrelated errors (`StorePage` unused React,
`SubscriberOnlyPriceBadge` duplicate attribute, `useSubscriptionGateLogic`
unused `k`/`v`, `admin/client` unused `productIdKey`,
`SubscriptionPage` unused import). **No new errors.**

`npm run build` — `vite build` succeeds, 4450 modules transformed,
`dist/index.html` ≈ 5,093 kB (1,352.09 kB gzipped), built in ~16 s.

## Tests

| File | Tests |
| --- | --- |
| `tests/classroom3dBoardZoomFullscreenContract.test.mjs` | 24 (new) |
| All other files | 2124 (existing) |

**Total: 2148 tests pass, 0 failures.** The pre-existing suite is
mildly flaky in count (2107–2124 tests across baseline runs, with 0–1
transient failure) because some files generate dynamic subtests; the
post-change runs are clean, so no regressions were introduced.

The new contract file covers: the clamped lean range; the shared
spring + dolly maths; the lean-back on focus change; wheel gating and
notch; pinch distance-ratio maths; the untouched single-finger drag;
the board cluster's data hooks, glyphs and disabled limits; the
double-click / double-tap detector and its viewer guard; Fit's
portrait-aware reset + recentre; the ResourceViewer-identical
fullscreen mechanism; the single `{board}` instance (no portal, no
duplicate); the YouTube-excluding sync; Esc priority order; the
untouched fullscreen exit state; the `+` / `−` / `0` keys; and
regression guards for module switching, player state ownership, the
orientation lens, the offline lighting, and the board CSS.

## What is NOT in this part

* No changes to `CoursePlayerApp.tsx` (course state, notes, mind maps,
  Firestore sync all untouched).
* No changes to `openFile` / `step`, the desk console, or any
  Part 10/11 access-control logic.
* No HUD changes — the controls live on the board wall per the spec
  (double-tap + room gestures keep them reachable on phones).
* No new dependencies and no fullscreen fallback layer beyond the
  established `requestFullscreen?.()` no-op contract.
* The 6 pre-existing `tsc` errors and the suite's flaky count were
  left alone as out of scope.
