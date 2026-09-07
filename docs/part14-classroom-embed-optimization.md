# Part 14 — 3D Classroom Third-Party-Embed Optimization

## Scope

Part 13 made the room itself cheap (merged geometry, baked shadows, quality
tiers, walls that sleep). What it could not touch is what renders INSIDE
cross-origin iframes: YouTube's player internals, Google Docs/Sheets/Slides/
Forms internals, Whimsical, generic embeds. Those repaint at 60 Hz whenever
their on-screen transform changes — i.e. on every frame of every camera move
— and no prop, flag, or clever CSS reaches across the origin boundary.

This part applies the game-developer answer to expensive-but-uncontrollable
assets — impostors, decoupled tick rates, occlusion, layer isolation — to
everything that WRAPS those iframes, since the insides are off-limits:

| Game technique | Classroom translation |
|---|---|
| LOD / billboard swap while the camera moves | Static kind-icon placeholder CSS-swapped over the live iframe during motion; the iframe is never unmounted |
| Physics ticks below render rate | Wall DOM transforms commit at ~22 Hz during motion while the scene renders full-rate |
| Don't stream what isn't needed | No iframe `src` until first wall focus; `content-visibility: auto` on walls |
| Isolated render passes | Compositor/layout containment around each embed frame |

Constraints honoured: nothing ever reads pixels from a cross-origin frame
(no screenshots — a hard browser limit); a loaded iframe is NEVER unmounted
(scroll, form input, cursors, auth state always survive); every behaviour in
`docs/course-player-all-file-types.md` and `docs/part11-course-player-ui.md`
(fullscreen escape hatch, downloads, unsandboxed edit-mode editor) is
preserved; Part 13's gates are built on, not duplicated; no new runtime
dependencies.

## New files

| File | What it does |
|---|---|
| `src/classroom3d/embedMotion.ts` | The single "is the view actively changing" signal: SeatRig reports per frame, subscribers hear only true/false edges, motion clears after a 200 ms quiet window. |
| `src/classroom3d/throttledTransform.ts` | `useThrottledTransform` rate-limiter + `WallTransformThrottle` Canvas wiring for the ~22 Hz decoupled wall-transform tick. |
| `src/course/EmbedImpostor.tsx` | Static kind-icon/title placeholder (motion + lazy modes). No state, no effects, no pixel reading. |
| `tests/classroom3dEmbedImpostorContract.test.mjs` | 17 contract tests pinning every item below. |

## Modified files

| File | What changed |
|---|---|
| `src/classroom3d/SeatRig.tsx` | Publishes motion (drag/pinch/spring/lean, never idle sway); spring snaps sub-visible residuals; mirrors motion to a CSS class; resets on unmount. |
| `src/classroom3d/WallActivity.tsx` | Exports the wall-focus context (flat player = null); active walls use `content-visibility: auto` (inactive keeps forced `hidden`). |
| `src/classroom3d/Classroom3D.tsx` | Enables the transform throttle for the board only while it shows a third-party embed; mounts the throttle last. |
| `src/classroom3d/classroom3d.css` | Impostor swap rules, embed containment, wall skip base — with the drei DOM audit that justifies each hint. |
| `src/course/ResourceViewer.tsx` | Wall latch (lazy boot), motion-impostor siblings, YouTube quality step-down, per-kind `allow` map. Sandbox line byte-identical. |

## Part 14 coverage

### A1. The motion signal

`embedMotion.ts` owns one boolean. SeatRig reports every frame the view
changes: a finger on the glass (`dragging` or a held pinch), or a spring
still travelling (focus-preset hop, pinch/wheel lean, recenter glide,
zoom-follow return). The idle breathing sway is added straight to the camera
— never to the spring refs — so rest reads as rest. Motion raises instantly
and clears 200 ms after the last report (A3's debounce band), so a drag that
pauses mid-gesture doesn't thrash the swap. SeatRig mirrors edges onto the
canvas parent as `.dc-embed-moving` (pure CSS from there — zero React
renders) and resets the store on unmount so a remount never inherits stale
motion. Consumers: the impostor class, the YouTube quality effect, the
transform throttle.

### A2–A4. Impostor swap during motion

While `.dc-embed-moving` holds, two CSS rules hide each marked live surface
(`visibility: hidden` — box kept, no reflow) and grid its `EmbedImpostor`
sibling over it: kind icon (MonitorPlay, FileText, Table, Presentation,
ClipboardList, HardDrive, Network, Globe), file title, kind label
("Google Doc", "Whimsical board", …). Settle clears the class and the live
frame is back — same element, same `src`, zero reload. The placeholder is
deliberately NOT a screenshot (cross-origin pixels are unreadable; no
capture is attempted anywhere — pinned by test). Native `<video>`/`<audio>`
are excluded on purpose: Part 13 already keeps them visually live while
faced, they're GPU-cheap and fully controllable, and only uncontrollable
frames need the treatment.

### B5. YouTube: the one frame we can remote-control

The split is explicit and commented, so the two mechanisms never fight:

- **Focus away from the board → pause.** Unchanged Part 13 behaviour via
  WallActivity's generic `pauseVideo`/`playVideo` postMessage (audio
  deliberately does not continue behind another wall, matching flat mode).
- **Camera moving while faced → quality steps to `'small'`, no pause.** A
  drag that muted the lesson would be miserable; instead the YT.Player
  instance (extended interface: optional `setPlaybackQuality` /
  `getPlaybackQuality`, called defensively) banks the prior quality and
  drops decode/render cost while the impostor covers the pixels and audio
  continues untouched. Settle restores the exact prior quality (`default` =
  the API's auto), never a hardcoded HD.

### C6–C7. Decoupled wall-transform rate

Drei's `<Html transform>` rewrites its matrix3d styles EVERY frame
unconditionally — its `calculatePosition` prop is only consulted in
non-transform mode (verified against the installed source), so a custom
calculator would be a silent no-op. Instead `useThrottledTransform` runs
after drei's update each frame (mount order) and commits matrix values at
most every 45 ms (~22 Hz) while moving, restoring the last committed values
between commits; at rest it commits every frame, which is the automatic
exact snap on settle. Resolution walks drei's real DOM (wall hook → portal
root → outer → inner) with `instanceof` guards and fails closed to
full-rate sync. Classroom3D enables it for the board only while the selected
lesson resolves to a third-party embed kind (native video keeps full-rate —
a 45 ms-stepped video wall would judder for zero gain); the enablement is
approximate (the board node is opaque) and safe in both directions.

### D8. Compositor layer isolation, audited first

Verified against drei's transform-mode DOM before writing a single hint
(portal root ~0×0 with overflowing children; outer/inner matrix divs):

- `contain: layout style` on `.dc-embed-frame` (each iframe + impostor
  wrapper): internal overlay churn can't invalidate ancestors; sits below
  the `[data-course-viewer]` fullscreen target, so the top-layer escape
  hatch is unaffected.
- Deliberately NOT added, with reasons in the CSS: `contain: paint/size`
  on the portal root or walls (would clip the walls to nothing),
  `will-change: transform` / `translateZ(0)` on frames (iframes already own
  a compositor layer in every engine — a forced one only burns memory).

### E9–E10. Occlusion and lazy activation

`useWallActivity()` (null in the flat player → immediate load, zero flat
change) feeds a one-way latch in `YouTubeFrame` and `EmbedFrame`: until the
wall is first faced, a lazy `EmbedImpostor` renders with NO iframe element
at all — no `src`, no fetch, no boot. Boot effects (API construction, load
timeout, motion subscription) all wait on the latch. Once set, nothing ever
unsets it: there is no code path back to unmounted (pinned by test), so doc
scroll, form input, cursors and auth state survive every look-away and every
motion swap. Walls additionally carry `content-visibility: auto` with
`contain-intrinsic-size: 1280px 800px` (browser skips off-screen subtrees
like virtualized rows, layout held while skipped); WallActivity's inline
style keeps forced `hidden` while inactive (strictly stronger) and now uses
`auto` while active instead of `visible` — a deliberate Part 13 contract
update, reconciled in the old test file.

### F11. Sandbox/permissions audit

- `sandbox`: UNCHANGED, byte-identical (old tests still assert the exact
  line). Every token is load-bearing for documented behaviours: scripts +
  forms (docs/forms/CodePen/Replit), popups (share/print), modals (dialogs,
  `window.print`), downloads (export), same-origin (Google auth cookies),
  presentation (Slides casting). Edit mode stays unsandboxed.
- `allow`: was one-size-fits-all; now per kind via `EMBED_ALLOW_BY_KIND`
  with a full-list fallback for unknowns — YouTube keeps media + fullscreen
  + clipboard-write (drops pointless clipboard-read); doc/sheet/slides/form
  and mindmap keep fullscreen + clipboard read/write (copy/paste IS the
  interaction); pdf/drive keep fullscreen + clipboard-write; generic
  `embed` keeps the FULL previous list on purpose (unknown third-party
  content may legitimately need any of it). `allowFullScreen`, downloads,
  the edit toggle and the new-tab escape hatches are untouched.

## Behaviour before / after

| Situation | Before (Part 13) | After (Part 14) |
|---|---|---|
| Rotate / lean with a Doc/Slides/Form on the board | Iframe internals repaint at 60 Hz every frame of the gesture | Static impostor tracks the wall; live frame restored ~200 ms after settle, state intact |
| YouTube during a drag | Full-decode playback + 60 Hz repaint | Audio continues, decode steps to `small`, impostor covers pixels; prior quality restored on settle |
| YouTube while facing another wall | Paused via postMessage | Unchanged (same mechanism — the one owner) |
| Board wall DOM transform during motion | Committed at 60 Hz | Committed at ~22 Hz for embed lessons; exact snap at rest; native video still 60 Hz |
| Embed on a never-faced wall | `src` set, frame boots eagerly | Placeholder only — zero fetch/boot until first focus; then mounted forever |
| Off-screen wall subtree | `hidden` when inactive, `visible` when active | `hidden` when inactive, `auto` when active (browser skips off-screen) |
| Permissions per frame | Full media+clipboard list for every kind | Least-permission per kind; sandbox identical |

## State-preservation verification

This sandbox has no usable browser (same constraint as Part 13), so the
checklist below is verified BY CONSTRUCTION plus contracts, and left as the
manual pass on a real device (`#/dev/classroom-3d` with a Doc + a Form + a
YouTube lesson opened):

- **(a) Rotate away and back** — WallActivity never unmounts (Part 13
  contract); media positions banked and resumed; YouTube pauses/plays via
  the API wire format; background iframes keep their own scroll/cursors.
- **(b) Impostor swap mid-rotation** — the swap is `visibility` + a sibling
  overlay: the iframe element, its `src`, and its browsing context are
  untouched (no unmount path exists in the motion code — pinned by test).
- **(c) Full focus cycle through all four surfaces** — latch is one-way
  (`setWallLoaded(false)` appears nowhere — pinned); quality restore is
  idempotent; transform throttle commits exact values at rest.

Manual device checklist: (1) scroll a Doc halfway, rotate to mind and back
— same scroll offset; (2) type half a Form answer, drag the room (impostor
visible), settle — text intact; (3) play YouTube, drag — audio gapless,
quality dips and restores; look at notes — paused; look back — resumes at
the same second; (4) open the room, don't face the board… (board is the
default focus, so instead: switch to a new Doc lesson while facing the
desk via keyboard `2`→select→`1`) — the new frame boots on return to the
board, not before.

## Bundle size

No new dependencies — react, fiber, drei and lucide only (pinned by an
import-allowlist test covering the new modules).

| `dist/index.html` | Part 13 | Part 14 | Δ |
|---|---|---|---|
| Raw | 5,104.14 kB | 5,110.09 kB | +5.95 kB (+0.12%) |
| Gzip | 1,355.64 kB | 1,357.39 kB | +1.75 kB (+0.13%) |

## TypeScript

`npx tsc --noEmit` reports the same 6 pre-existing, unrelated errors as the
`main` baseline — zero new errors, none in `classroom3d/` or `course/`.

## Tests

- New: `tests/classroom3dEmbedImpostorContract.test.mjs` — 17 tests covering
  the motion store (200 ms settle, edge-only notify, reset), SeatRig
  publishing (drag/pinch/spring/lean, sway excluded, snap, CSS mirror),
  the impostor (static chrome, kind maps, CSS-only swap, screenshot-tech
  ban in code), native-media exclusion, YouTube quality step-down + restore
  and its explicit no-pause-on-motion, the 45 ms throttle (resolution,
  fail-closed guards, at-rest snap, mount order, embed-only enablement),
  containment rules + the audited no-list, the wall latch (gated boot, no
  pre-latch iframe, one-way mount), per-kind `allow` + untouched sandbox /
  fullscreen / downloads / edit mode, and the new-module import allowlist.
- Reconciled (deliberate, commented): Part 13's `contentVisibility`
  active value (`visible` → `auto`) and the course-player `allow` literal
  (one list → per-kind map, full list preserved as the fallback).
- Full suite: `node --test tests/*.test.mjs` → **2184/2184 pass**
  (2167 baseline + 17 new), 0 failures.

## What is NOT in this part

- Screenshot/video-capture impostors (impossible cross-origin — the limit
  is structural, not a missing feature).
- Background audio while looking away (Part 13's deliberate product match
  with flat mode — unchanged).
- Pausing YouTube on camera motion (explicitly rejected: drags must not
  mute the lesson; quality step-down instead).
- `loading="lazy"` on the iframes (the wall latch already dominates load
  timing in the room; attribute-level laziness could fight it).
- Throttling notes/mind/desk walls (no third-party iframes live there) or
  `calculatePosition` overrides (verified no-op in drei transform mode).
- Wall-clock fps numbers from this sandbox (no browser available).
