# Part 13 — 3D Classroom Performance (real-time-game smoothness)

## Scope

The 3D Classroom rendered every frame like a diorama and every wall like a
foreground app: ~110 static meshes, 13 point lights, a per-frame 1024 px
shadow map, three transmission glass panes (each forcing extra scene
renders), and four live DOM walls (one carrying a YouTube iframe) all
reprojected and painted whether the learner looked at them or not. On a
mid-range phone that is a slide show, not a classroom.

This part makes the room run like a real-time game — steady 60 fps on
desktop, 30–60 fps on low/mid mobile — with **zero functional regressions**:
module/lesson switching, notes, mind map, resource viewer, focus/head-turn,
Part 12 zoom/fit/fullscreen, shortcuts (1–4, arrows, +/−/0, Esc), and
portrait/landscape all behave exactly as before. The full suite (including
every Part 12 contract) passes unchanged, plus 19 new contracts.

Constraints honoured: offline-first and Capacitor-safe (no network probes, no
CDN assets), no new runtime dependencies (three / fiber / drei only — pinned
by test), and every optimisation degrades gracefully (a weak device gets a
faster room, never a broken one).

## New files

| File | What it does |
|---|---|
| `src/classroom3d/quality.ts` | Tiers (`low`/`medium`/`high`), factor→tier mapping with hysteresis bands, area-aware initial-dpr heuristic, one-time static probe, session persistence. |
| `src/classroom3d/QualityGovernor.tsx` | The auto-graphics-settings bridge: `<PerformanceMonitor>` sampling → tier → fiber-store `performance.current` (which `<AdaptiveDpr>`/`<AdaptiveEvents>` read) + one room re-render per tier edge. Rendered once. |
| `src/classroom3d/WallActivity.tsx` | Focus-driven wall gate: unfaced walls skip rendering (`content-visibility`) and pause media/YouTube, keeping the SAME mounted instance. |
| `src/classroom3d/WallVisibility.tsx` | Canvas-side yaw/pitch gate: off-screen walls stop painting via `visibility`, touching the DOM only on visibility edges. |
| `src/classroom3d/mergedStatics.ts` | Merged static geometry (desks, window bays, lamps, books): one geometry per material, built once as a module singleton. |
| `tests/classroom3dPerformanceContract.test.mjs` | 19 contract tests pinning every item below. |

## Modified files

| File | What changed |
|---|---|
| `src/classroom3d/Classroom3D.tsx` | Quality state, mount-only `initialDpr`, governor/adaptive/baked-shadow mounts, tier props to `Room`, `spill` props, `WallActivity` wraps, `WallVisibility` mount. |
| `src/classroom3d/Room.tsx` | Renders merged statics; 1 window light + 1–2 ceiling lights (was 3 + 6); plain-transparency glass (transmission gone); 512 px baked-map-ready shadows; tiered snowfall; memoized. |
| `src/classroom3d/SeatRig.tsx` | Drag-fidelity class + 1× dpr dip with governor-safe restore; iterator reads instead of `Array.from`; in-place pointer bookkeeping; `rotation.order` set once; header documents the guarantees. |
| `src/classroom3d/SurfaceFrame.tsx` | `spill` prop gates the wall glow light (low tier: focused wall only). |
| `src/classroom3d/DeskConsole.tsx` | Only the desktop + tablet cast shadows (was 5 casters); `spill` prop gates the tablet glow (off on low). |
| `src/classroom3d/panels.tsx` | `BoardPanel`/`DeskPanel`/`WallHeader` memoized; desk root exposes `data-classroom-wall="desk"`. |
| `src/classroom3d/classroom3d.css` | `.dc-dragging` drag-fidelity rule (sheds shadows/blurs/animations while the head turns). |

## Part 13 coverage

### A. ONLY THE FACED WALL WORKS

- `WallActivity` wraps the board viewer, the notes node and the mind node,
  fed by the room's `focus` state. Inactive walls get
  `content-visibility: hidden` (layout box kept, so re-activation never
  reflows) + `pointer-events: none`. The children render unconditionally —
  there is deliberately no unmount path — so playback positions, note drafts,
  mind-map state and Firestore listeners survive a look-away.
- Media pauses imperatively on the inactive edge: `<video>`/`<audio>` that
  were playing are paused and remembered (a video the learner paused
  themselves is never resumed), YouTube iframes get `pauseVideo` via the JS
  API `ResourceViewer` already enables. Resume on return is best-effort
  (autoplay policy / detached nodes can never throw). Pausing **audio** too
  is a deliberate product choice matching flat mode (file switch pauses the
  outgoing lesson there); the file header documents the one-line change if
  the owner ever wants background audio.
- Board fullscreen counts as faced (`focus === "board" || boardFullscreen`),
  so the top layer can never be gated by a stale head angle.

### B. AUTO-GRAPHICS-SETTINGS (GOVERNOR + TIERS + DPR)

- `QualityGovernor` mounts a `<PerformanceMonitor>` (6 × 200 ms averaged
  windows ≈ a decision every 1.2 s; 6 flip-flops before fallback lock) with
  the tier's start factor (1 / 0.65 / 0.4). `qualityForFactor` maps with
  hysteresis bands (≥ 0.8 high, ≥ 0.5 medium, else low); `onFallback` locks
  low and stops sampling.
- **drei-10 discovery (documented here so the next upgrade doesn't regress
  it):** `<AdaptiveDpr>`/`<AdaptiveEvents>` read the *fiber store's*
  `performance.current`, but drei 10's `<PerformanceMonitor>` no longer
  writes it — it only reports through callbacks. The governor is the bridge:
  every factor change writes the tier's scale (1 / 0.75 / 0.6) into the
  store, so the stock adaptive components work with this fiber/drei combo.
  The room itself re-renders only when the TIER changes (`lastTier` ref),
  and the governor is `memo`'d with a stable `setState` callback, so it
  renders exactly once per mount.
- Tier settings (`QUALITY_SETTINGS`): snow 420 / 240 / 120, ceiling lights
  2 / 2 / 1, spill `all` / `all` / `active` (low: only the focused wall
  spills, desk spill off). Tier edges persist via `rememberTier`; a remount
  (flat ⇄ room) resumes where the room settled, and the governor seeds the
  store on mount so a remembered low tier never flashes a second of
  full-resolution frames.
- `computeInitialDpr` caps EFFECTIVE shaded pixels, not the ratio: ≥8 MP → 1,
  ≥3.7 MP → 1.25, ≥2 MP → 1.5, times a tier scale (1 / 0.85 / 0.7), clamped
  to [0.65, 2]. A huge desktop viewport starts *lower* than a small phone
  screen. Runtime dpr belongs to the governor alone — the old fixed
  `dpr={[1, 1.75]}` range is gone.

### C. GEOMETRY, LIGHTS, SNOW, SHADOWS

- Repeated statics merge to ~11 meshes: 4 desk meshes (tops/bodies/legs/
  chairs), 3 window meshes (frames/glass/ledges), 1 lamp mesh, 5 book meshes
  (one per shelf colour). The merge runs once (module singleton), bakes the
  exact original transforms (verified: learner's desk slot stays empty for
  `DeskConsole`), and animated things (classmates, fan, clock) are
  deliberately NOT merged — merging them would trade cheap scene-graph
  transforms for per-frame matrix composition.
- Lights: 13 point lights → 1 shared window light + 1–2 ceiling fills + ≤3
  wall spills + desk spill (low tier: fewer still). Emissive meshes keep
  reading as lit.
- Transmission is gone: frosted glass is plain transparency (one blended
  quad instead of extra scene renders per pane). The single shadow-casting
  directional light keeps a 512 px map, and shadows bake exactly once via a
  `memo`'d `<BakeShadows>` (`BakedShadowsOnce`) — focus hops and pinch ticks
  re-render the room but can never re-bake the map. Shadow content is
  tier-independent (snow/lamps/spills don't cast), so the bake survives tier
  changes; classmate sway is sub-texel at 512 px over 12 m, so the stale
  shadows are invisible.
- `castShadow` survives only where a shadow reads: desk tops, shelf/teacher
  desks, radiator, mug, classmate torsos + heads, learner desktop + tablet.
- Snowfall takes a `count` prop (tier-driven; buffers rebuild only on tier
  edges) and its loop allocates nothing — the attribute array is reused in
  place, as is the steam loop.

### D. OFF-SCREEN WALLS DON'T PAINT

- `WallVisibility` runs one `useFrame` (after `SeatRig`, so it reads the
  same frame's rotation): per-wall yaw checks against the seat-derived
  directions (board 0.025, notes 0.976, mind 1.551 rad) with the composed
  76° horizontal FOV + per-wall half-size + a 0.15 rad hysteresis band, and
  a pitch check for the desk tablet using the camera's live vertical FOV
  (portrait widens it to 96°).
- Walls flip between `visibility: visible | hidden` — never `display` or
  `content-visibility`, so the gate composes with `WallActivity` (which owns
  `content-visibility` via React): either mechanism hiding the wall hides
  it, neither overwrites the other, and layout is always preserved.
- Elements resolve lazily and cache; the DOM is written only on visibility
  edges, so steady-state cost is a few float comparisons per frame. No React
  state anywhere in the gate. `forceVisible` (board fullscreen) skips all
  hiding. Wall pitch-gating was deliberately skipped: `WallActivity` already
  covers focus-driven look-down (the common case), and yaw-only is exactly
  right for the manual left/right drags the gate exists for.

### E. RIG + RENDER HYGIENE

- `SeatRig` hot paths: no `Array.from` (map iterators read directly — 5
  reads), no per-event allocation (`last` mutated in place), no React state
  at all, `rotation.order` assigned once in the lens effect instead of every
  frame. Zoom-delta and manual-look reporting are byte-identical to Part 12
  (pinned by the old suite).
- Drag fidelity: pointer-down adds `.dc-dragging` to the canvas parent and
  dips dpr to 1× (only when above 1×); pointer-up removes the class and
  restores the snapshot — unless the governor moved dpr meanwhile, in which
  case its live decision wins. The CSS rule sheds `box-shadow`,
  `text-shadow`, `backdrop-filter` and `animation` on the overlays (all
  `!important`, all transient) while transforms keep tracking the slabs, and
  deliberately never touches `visibility`/`display`.
- `BoardPanel`/`DeskPanel`/`WallHeader` and `Room` are `memo`'d: pinch-zoom
  ticks (which re-render the room dozens of times per second) no longer
  reconcile the desk's module/lesson lists or the room graph, and the heavy
  viewer/notes/mind subtrees bail out on their stable node identities.

### F. ONE-TIME PROBE, SESSION MEMORY

- `pickInitialTier` probes once per session: ≤4 cores or ≤4 GB RAM → low;
  ≥8 MP viewports, ≥3× dpr on ≥1 MP screens, or ≤6 cores on ≥2 MP screens →
  medium; otherwise high. A stored session tier always wins (private-mode
  failures fall back to probing fresh). No network, no canvas benchmark, no
  re-probe on focus change — the monitor's first averaging window is the
  warm-up fps sample that corrects a wrong guess within ~a second.

## Frame-rate before / after

**Honest note on measurement:** this sandbox has no usable browser
(Playwright's CDN download fails, no system Chrome/Firefox exists, and the
`@sparticuz/chromium` binary can't launch — missing system NSS/NSPR libs with
no sudo or apt access), so wall-clock fps could not be captured here. The
table below reports structural per-frame cost instead — every number is
verifiable in source — plus the expected effect. To measure on a real
device, open `#/dev/classroom-3d`, turn on Chrome DevTools → Rendering →
*Frame Rendering Stats*, and compare `main` against this branch while
dragging between walls on (a) a plain desktop viewport and (b) a throttled
mid-tier mobile profile; the governor's own bands target ≥40 fps (no
step-down) and ≥60 fps (step-up) on 60 Hz screens.

| Per-frame cost | Before (Part 12) | After (Part 13) | Why it matters |
|---|---|---|---|
| Static-mesh draw calls (room) | ~110 | ~11 merged | CPU submit + state changes per frame |
| Point lights shaded | 13 | 2–6 (tier + focus) | Every light is evaluated per shaded pixel |
| Shadow map renders | 1 × 1024 px, every frame | 1 × 512 px, once per mount | A full extra scene render → ~zero |
| Transmission passes | 3 panes | 0 | Each forced extra scene renders |
| Live DOM walls painted | 4 (incl. YouTube) | 1 faced + yaw/pitch-visible only | Iframe/video/compositor work while looking away |
| Snow particles | 420 fixed | 120–420 by tier | Vertex + fill on weak GPUs |
| Shaded pixels (dpr) | fixed ≤1.75 | area-aware initial × 1/0.75/0.6, 1× while dragging | Fill-rate is the mobile bottleneck |
| React reconciles per pinch tick | whole room + desk lists | lean readout only (memo) | Main-thread jank during gestures |

Expected: steady 60 fps on desktop (high tier, baked shadows, ~10× fewer
static draws), 30–60 fps on low/mid mobile after the governor settles
(typically medium/low within the first seconds, without visible popping —
only snow density, light fills and resolution step, never geometry or
features).

## Bundle size

No new dependencies — everything reuses the existing three / fiber / drei.

| `dist/index.html` | Before | After | Δ |
|---|---|---|---|
| Raw | 5,092.93 kB | 5,104.14 kB | +11.21 kB (+0.22%) |
| Gzip | 1,352.09 kB | 1,355.64 kB | +3.55 kB (+0.26%) |

## TypeScript

`npx tsc --noEmit` reports the same 6 pre-existing, unrelated errors as the
`main` baseline (StorePage, SubscriberOnlyPriceBadge, useSubscriptionGate-
Logic ×2, admin/client, SubscriptionPage) — zero new errors, none in
`classroom3d/`.

## Tests

- New: `tests/classroom3dPerformanceContract.test.mjs` — 19 tests covering
  the activity gate (render-skip, media/YouTube pause-resume, focus wiring),
  the tier ladder + probe + persistence, the governor bridge (windows,
  fallback lock, store writes, render-once), merged statics (singleton,
  9 merge calls, empty learner slot), lights/transmission/shadows/spill,
  the yaw/pitch visibility gate (directions, hysteresis, edge-only writes,
  fullscreen bypass), rig hygiene (no allocs, drag dip + governor-safe
  restore, single `rotation.order` assignment), the drag-fidelity CSS rule,
  memoization, and the no-new-dependencies import allowlist.
- Full suite: `node --test tests/*.test.mjs` → **2167/2167 pass**
  (2148 baseline + 19 new), 0 failures — every Part 12 zoom/fit/fullscreen
  contract still green.

## What is NOT in this part

- Background audio while looking away (deliberate product match with flat
  mode; the one-line change is documented in `WallActivity.tsx`).
- LOD meshes, texture compression (the room has no textures — all procedural
  geometry), occlusion-culling libraries, WebGPU, or worker-offloaded
  physics — measured cost didn't justify any of them.
- Disabling antialiasing on low tier (needs a renderer rebuild for a minor
  win; the dpr ladder covers fill-rate instead).
- Far-classmate yaw gating (left to frustum culling — 14 draws of trivial
  capsules; a per-frame React gate would cost more than it saves).
- Wall-clock fps numbers from this sandbox (no browser available — see the
  measurement recipe above).
