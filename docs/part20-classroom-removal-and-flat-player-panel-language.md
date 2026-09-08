# Part 20 — 3D Classroom removed completely; its panel language ported to the flat player

Date: 2026-09-08. Branch `arena/01a080a3-digitalcatalyst`.

The owner's two asks, in their words:

> "Remove 3D classroom from course player completely including all its
> optimisation logic code, its code, everything, but don't touch even a single
> code of flat player, keep it as it is."
>
> "Ab hamara keval target hai flat player ko ek relief and maximum visibility
> and comfortability dena hai, isliye 3D classroom ke andar jo panel ka design
> aur look hai exactly vahi flat player ke panels aur background per apply karo
> — aur fir bhi tumhen usko delete karna hai."

So: the room goes, the room's **look** stays and moves onto the flat player.

Asked to pin the brief down, the owner answered four questions:

| # | Question | Answer |
|---|---|---|
| 1 | How much of the room's panel design goes on the flat player? | **The whole panel language** — plates, rows, dock, notes, mind map, dialog |
| 2 | "Floating nahin rakhna" — exact meaning? | **Dock and rails solid** — no frosted glass, nothing reads as floating |
| 3 | The room's module ⇄ content connection? | **Keep it** — dashed rail, cyan module, violet content |
| 4 | The flat player's background? | **The room's deep-navy gradient** — the winter scene no longer shows through the panes |

## Part A — the removal (47 files, 13,268 lines)

| What | Files | Notes |
|---|---|---|
| `src/classroom3d/` | 29 | 5,946 lines. The room itself: `Classroom3D`, `Room`, `SeatRig`, `DeskConsole`, `RoomSheet`, `panels`, `Classmates`, `SurfaceFrame`, `SurfaceContexts`, `QualityGovernor`, `WallActivity`, `WallVisibility`, plus `classroom3d.css` (795 lines) |
| The room's optimisation machinery | (in the 29) | `quality.ts` (device tiers + governor), `surfaceScroll.ts` / `useSurfaceScroll.ts` (pointer drag-scroll + fling, because a `touch-action: none` room has no native panning), `throttledTransform.ts`, `embedMotion.ts` (camera-motion signal), `mergedStatics.ts` / `objectActivity.ts` / `resourceLifetime.ts` (instancing + geometry/material retention), `wallFocus.ts`, `roomGeometry.ts`, `surfaceScale.ts` |
| `src/course/EmbedImpostor.tsx` | 1 | The static placeholder a third-party iframe was CSS-swapped for while the camera moved. Its two modes were `motion` (classroom walls only) and `lazy` (a wall that had not been faced yet) — both unreachable from the flat player |
| Tests | 7 | 119 assertions: `classroom3d{BoardZoomFullscreen,EmbedImpostor,OptimizationRuntime,Performance,SurfaceRendering,SurfaceScrollRuntime,TriptychAndContextBridge}` |
| Docs | 7 | `classroom-performance-audit.md` + `classroom-performance-results.json`, parts 12, 13, 14, 18, 19 |
| Benchmark scripts | 3 | `benchmark-classroom.mjs`, `classroom-performance-probe.mjs`, `verify-classroom-runtime.mjs` |
| Vendor stack | 4 deps | `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three` out of `package.json` + `package-lock.json`. Nothing else in the app imported them (verified by grep and by the new contract test) |

Woven out of the surviving files, with the flat path's behaviour unchanged:

- **`src/CoursePlayerApp.tsx`** — the room shell (`if (classroom3d) return <Classroom3D …>`), its persisted preference (`dc.coursePlayerClassroom3d`), the room's note/map library lists, the `+ New note` and `open this note` signals, and `returnStudySurfacesToLibrary()` — a helper whose only job was to reset Notes/Mind map to their library views on the way **into** the room.
- **`src/course/PlayerPanel.tsx`** — the "3D Classroom" preference row, its `classroom` accent, its props and its Hindi hint line. The five remaining preferences (Light theme, Snowfall, Desktop view, Hide status bar) and the "Split mode hamesha on hai" line are untouched.
- **`src/course/ResourceViewer.tsx`** — the Part 13/14 gates: `useWallActivity()` (lazy iframe boot), `subscribeEmbedMotion()` (YouTube `setPlaybackQuality('small')` while the camera moved), the two `EmbedImpostor` swaps, the `dc-embed-frame` containment class and the `data-embed-impostor-target` hooks. In the flat player `wall` was always `null`, so `wallLoaded` was always `true` and every gate was already a no-op: the frames now simply boot immediately and unconditionally, which is what they always did. The per-kind `allow` / `sandbox` audit stays (it is flat-player behaviour, only its "Part 14" label went).
- **`src/course/NotesPanel.tsx`** — `openNoteSignal` / `openNoteId` (the room's floating note library). `composerOpenSignal` stays: that one belongs to the flat overlay's own `+`.
- **`src/main.tsx`** — the `#/dev/classroom-3d` preview route and its import.
- **`src/context/*.tsx`** (6 files) — the raw context objects go back to module-private. They had been `export`ed only so `SurfaceContexts.tsx` could re-provide them inside drei's `<Html>` second React root; every consumer goes through the hooks.

## Part B — the port: `src/course/flatPlayerChrome.css`

One new file, 646 lines, imported in `src/main.tsx` **after** `index.css` and
`glass.css` so it wins the ties it re-points. It dresses the existing flat DOM
in the room's material — every value lifted from the deleted files, not
invented:

| Flat player surface | The room's equivalent it now wears |
|---|---|
| The shell's backdrop | The room: `#0d1424 → #080c18 → #04060e` with a sky glow at 18% and a violet one at 84% |
| `[data-course-lesson-pane]` | `BoardPanel`'s plate `#060910` + the board wall's sky bloom |
| `[data-course-study-pane]` | `DeskPanel`'s gradient `#0b1024 → #070a14` |
| `[data-solid-panel="true"]` (notes, mind map) | The board's near-black at 0.94 — the room's most restful plate |
| `[data-course-study-chrome]` | `WallHeader`: `#0b1120`, a hairline under it, an accent wash that follows the tab (sky / amber / violet), white/94 title over a white/45 subtitle |
| `[data-course-sheet-row]`, `[data-course-panel-row]` | RoomSheet + desk rows: white/4 plate, white/8 hairline, radius 16, hover white/9 + white/18 |
| module ⇄ content | `.dc-room-sheet-sublist`: a **dashed white/14 rail** in each file row's own left gutter, bridging the list's 6px `space-y-1.5` gap and trimmed at a module's last lesson; cyan wash on the open module, violet tint on its content, full violet wash on the lesson that is playing |
| `[data-course-dock] [data-glass-dock]`, peek rails, divider pills | The control tray's plate and shadow — but **SOLID** (`#141b30 → #0a0e1c`, no `backdrop-filter`), per decision 2. The tray's accent glow on the grabber and the ratio bubble is kept |
| Note cards, focus state | The notes wall's amber: white/4 plate, amber wash + bloom in focus |
| Rich-text toolbar / writing surface | `#0d1424` bar over the board's `#060910` |
| Mind map library | RoomSheet material: the two-stop navy gradient, `blur(22px) saturate(150%)`, `0 40px 90px` + a violet bloom |
| Delete confirmation | RoomSheet, over the room's radial scrim |
| Scrollbars, type | The room's 8px white/18 thumb, `antialiased` + `optimizeLegibility` |
| Light theme | The same room, **daylit**: `#1c2740 → #121a2c` desk, brighter hairlines and rows — never a white plate, because the player's ink is white in both themes (src/index.css's contract) |

Two disciplines the file obeys, both pinned by tests:

1. **Paint only.** No width/height, padding/margin, flex/grid, display,
   transform, animation, z-index. "Borders" are `box-shadow: inset 0 0 0 1px …`
   — a real border on an auto-height row would grow every row 2px and move the
   scroll-snap centres the dock fires on. The single exception is the connector
   rail: an absolutely positioned, `pointer-events: none` `::before` inside a
   row that is already `position: relative`.
2. **Scoped.** Every rule sits under `.course-player-shell`, except the delete
   dialog (portaled to `<body>`, only ever rendered by the player). The ROOT
   `--dc-chrome-glass: rgba(60, 62, 68, 0.105)` in `index.css` is untouched, so
   the store, the headers and the desktop shell keep their published material —
   the player re-scopes the token to the room's furniture glass instead.

### Why this is "maximum visibility", in numbers

WCAG contrast of the player's ink before and after (scratch/contrast.mjs).
Before, the panes were the pack's 12.6% glass over the winter scene, so contrast
depended on what happened to be behind the text:

| Backdrop behind the pane | body white/62 | title white/90 |
|---|---|---|
| scene at its darkest `#040812` | 7.67:1 | 15.51:1 |
| under the blue glow `#3b6dd1` | 3.12:1 | 4.74:1 |
| under the violet glow `#8f5ee7` | 2.84:1 | 4.23:1 |
| behind a mountain `#9fd9ff` | **1.48:1** | **1.74:1** |
| behind falling snow `#ffffff` | **1.15:1** | **1.22:1** |

After, on the room's plates:

| Pair | Ratio |
|---|---|
| board title white/94 on `#060910` | 17.49:1 |
| pane header title white/94 on `#0d1424` | 16.25:1 |
| row title white/94 on a white/4 row | 15.28:1 |
| open lesson white/94 on the violet wash | 13.27:1 |
| open module white/94 on the cyan wash | 12.49:1 |
| desk body white/68 on `#0b1024` | 8.99:1 |
| row sub white/68 on a white/4 row | 8.51:1 |
| LIGHT theme body white/76 on `#1c2740` | 9.16:1 |
| smallest sub-ink white/45 on `#0b1120` | 4.51:1 (AA) |

Every pair clears AA; all but the room's own 45%-white hint ink clears AAA. The
worst case before the port was 1.15:1 — white text on white snow.

## Verification

- `node --test tests/*.test.mjs` → **2161 pass / 0 fail**: 2,250 at HEAD,
  minus the room's 119, plus the 30 new ones below.
- `npx tsc --noEmit` → the same **6 pre-existing errors** listed in part 16,
  none in a file this part touched.
- `npm run build` → single-file bundle **5,110.09 kB → 3,324.98 kB**
  (921 kB gzip). The removal is worth ~1.8 MB; the ported stylesheet adds
  11.8 kB raw. 2,807 modules transformed.
- Lightning CSS at this app's floor (Chrome 96 / Safari 15): parses clean, 0
  warnings. The connector's `:has()` cannot be lowered, so on an older engine
  that one rule is dropped and the rail overshoots 6px into the gap below a
  module's last lesson — invisible, and everything else is unaffected.

## The two contracts that keep this honest

- `tests/classroom3dRemovalContract.test.mjs` (13 tests) — the room's files,
  tests, docs, scripts, dev route, player toggle, viewer gates, notes signals,
  context exports and vendor deps are all gone; no source file reaches for
  them (comments that record provenance are allowed — the check strips
  comments); and the flat Split Deck player is asserted **intact** end to end,
  so the removal cannot be "finished" by deleting flat-player behaviour.
- `tests/coursePlayerClassroomPanelLookContract.test.mjs` (17 tests) — the
  ported values are the room's own; the file is paint-only (the property
  allowlist fails on any layout declaration, and `position` / `content` are
  allowed only on the inert connector); the four owner decisions are pinned
  (solid dock and rails with `backdrop-filter: none`, the dashed connector with
  its trim rules, the room's backdrop); every attribute and class the port
  paints must exist in `src/course/` (a rename there fails here instead of
  silently painting nothing); and the app-wide glass token is unmoved.
