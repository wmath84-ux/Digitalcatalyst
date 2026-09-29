// SANCTUARY — DOCK ADVANCED SETTING · TIME-OF-DAY SMOKE · NIGHT SKY · FAR RANGE
//
// Owner brief (2026-09-29), four connected asks for the 3D study sanctuary.
// This file records what changed, where, and how it is verified.

# Sanctuary: dock drag-scroll auto-hide · smoke density · night & far range

## 1. Bottom dock — DRAG SCROLL AUTO-HIDE (Advanced setting, default ON)

Brief: *"3d sanctuary ke andar jo bottom dock drag scroll function hai, uske
liye advance option uske hi setting mein add karna hai … user horizontal line
per jab drag left right scroll karein to dock reveal ho aur finger hatate hi
hide ho jaaye, aur jis bhi button per drag scroll karke lekar jaakar apna
finger uthae, use button per click ho jaaye — matlab vahi function jo already
home page per aur sabhi docs per applied hai. By default enable rakho."*

The sanctuary dock now speaks the exact gesture the home footer dock and the
course player's peek line already speak (same pattern as
`src/course/CoursePeekDock.tsx`):

| Gesture on the bottom line / dock           | Result                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| Press the line (dock closed)                | Dock reveals instantly under the finger                       |
| Drag left / right along the line            | Magnification wave follows the finger (`pointerX` motion value) |
| Lift on a button                            | **That button is clicked** (`elementsFromPoint` hit-test)     |
| Lift on empty glass / world (auto-hide ON)  | Dock hides again — "finger hatate hi hide"                    |
| Plain tap on the line                       | Toggles the dock open (stays open to browse)                  |
| Mostly-vertical swipe                       | Old peek behaviour: up reveals, down hides                    |
| Drag across the OPEN dock, lift on a button | Button clicks (GlassDock's own rule, unchanged)               |
| Drag across the open dock, lift off a button| Dock hides (auto-hide ON only)                                |

The dominant axis is decided once, past a 12 px threshold, so a diagonal
never does both; a vertical swipe never activates a button by accident.

**The setting**: Settings (gear on the dock) → new third page **Dock**
(rail now Light / Scene / Dock) → **"Drag scroll auto-hide"** On/Off row.
Default **enabled**; the preference persists in
`localStorage["sanctuary.dockAutoHide"]` (`!== "off"` = on, so private-mode
browsers still default to enabled). With it OFF the dock opens only by
tap/swipe and never auto-hides after a drag. The "Bottom dock → Hide" row
moved onto the same page so all dock controls live together.

Files: `src/nature3d/NatureStudioPage.tsx`, `src/nature3d/SanctuarySettings.tsx`.

## 2. Smoke density — reduced

Brief: *"sanctuary ka smoke density kam karo."*

Every quality tier: `fogNear 16 → 90` m (the meadow, boards and study
clearing are always crystal clear) and `fogFar 420 → 4200` m (the horizon
opens from under half a kilometre to 4.2 km). The world is no longer a grey
curtain past 420 m — the island's own coast, the open sea and the new far
range all resolve on a clear day. Underwater / Ice-Age runtime scalars are
untouched.

File: `src/nature3d/engine/quality.ts`.

## 3. Time-of-day smoke (time-lapse)

Brief: *"subah ke samay thoda sa smoke … jaise-jaise sun aata hai smokes
gayab hone lagte hain … din mein hat jaaye, aur shaam aur raat mein rahe."*

`daylight.ts` now publishes a `smoke` factor (0 clear → 1 haziest) on every
`DaylightState`:

| Time               | smoke | Live fog ramp (low tier)         |
| ------------------ | ----- | -------------------------------- |
| Dawn 06:00–07:00   | 0.75  | full smoke at ≈ 2.4 km — valleys hazy |
| Sun climbing 07–11 | ↓     | the haze visibly burns off       |
| Midday 11:00–15:30 | 0.14  | full smoke at ≈ 3.9 km — clear air |
| Evening 15:30–18:30| → 0.60| it thickens with the golden hour |
| Night              | 0.68  | it stays ("shaam aur raat mein rahe") |

`scene.applyDaylight` turns the factor into the live `fog.near / fog.far`
ramp (`near × (1.5 − 0.9·smoke)`, `far × (1 − 0.58·smoke)`), and Auto mode
re-reads the clock every 20 s — so sitting in the sanctuary across a sunrise
is a genuine time-lapse: watch the far hills emerge from the morning haze.

Files: `src/nature3d/engine/daylight.ts`, `src/nature3d/engine/scene.ts`.

## 4. Out of the world — the FAR RANGE

Brief: *"out of the world bhi expand karo … dur pahad bhi dikhte hain bahut
dur out of the world — to vah aur bhi real lagenge."*

New `src/nature3d/engine/farRange.ts`: a ridged mountain chain standing on
the open sea at `farPlane × 0.36` ≈ **2.2–2.8 km** — far beyond the island
edge (1440 m) and the fly limit (1180 m), inside the sky dome. Two octaves
of the same deterministic simplex as the terrain, per-vertex slate rock with
a noisy snow line, one merged geometry, one draw call, ~1.4 k vertices, zero
per-frame work (static mesh, no shadows, frustum-culled). It registers with
the atmosphere pass, so the day/night light, aerial perspective and the
smoke curve all hit it like they hit the island: buried in the dawn haze,
clear at midday, a blue silhouette under the moon at night.

File: `src/nature3d/engine/farRange.ts`, wired in `scene.ts`.

## 5. The NIGHT scene

Brief: *"abhi kya hai ki raat nahin hoti hai — raat wala bhi scene design
karo."*

`daylight.ts` renders the clock's night hours as a REAL night instead of
holding the frozen sunset:

* **Timeline**: `clampToDaylight` folds 00:00–06:00 past midnight
  (24:00–30:00), so Auto follows the real clock into the dark. A manual
  **Night** tile (22:15 light) joins Auto / Morning / Midday / Evening on
  the Light page.
* **Twilights**: two 1.5 h blends (sunset→night, night→sunrise) lerp every
  field, so dusk *melts* into starlight — no snap.
* **The moon takes over the sun's slot** (one arc, opposite half of the
  clock): pale-blue directional light at 0.62 intensity, so the shadow rig,
  water glint and dome disc all render moonlight with no per-consumer
  wiring. The dome's existing sun-disc code *is* the moon.
* **Stars**: the dome shader gains a `uNight`-driven star field — one hash
  per grid cell, jittered points, per-star twinkle on the shared time
  clock, faded at the horizon. Stars fade IN through dusk.
* **Readability (the standing "kala nahi, dark green" directive)**: night
  exposure 0.98, hemisphere sky `#2b4166`, ground bounce stays green
  `#1c3a24`, fog `#27364e` pinned to the horizon. Boards are DOM and stay
  fully readable — it remains a study space.
* **Sky furniture at night**: clouds dim to moonlit slate and thin out;
  the volumetric sun shafts switch off; the anime panorama dips a little
  deeper (≤ 60 %, never black).

Files: `daylight.ts`, `sky.ts`, `scene.ts`, `SanctuarySettings.tsx`.

## Verification

* `npx tsc --noEmit` — no new errors (remaining ones pre-date this change).
* `npx vite build` — clean.
* `tests/nature3dNightSkyRuntime.test.mjs` (NEW): bundles the real engine
  and verifies numerically — the clock runs into the night, night mode is a
  moonlit readable scene, twilights blend, the smoke curve burns off at
  noon and returns at night, the fog ramp buries the far range at dawn and
  reveals it at midday, the reduced budget (90/4200) on every tier, and the
  far-range mesh is seated under the sea, beyond the island, inside the dome.
* `tests/nature3dSanctuaryContract.test.mjs` — the stale "night holds the
  evening look" contract replaced with the real-night + smoke contract.
* `tests/nature3dSettingsPageContract.test.mjs` — brought up to date with
  the three-page overlay and the new toggle (was already failing on `main`).
* Full `node --test tests/*.test.mjs`: **80 failures on the base commit →
  77 after this change — zero new failures, three stale ones fixed.**
