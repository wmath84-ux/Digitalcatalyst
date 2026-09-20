# Sanctuary character upgrade — implementation report

Date: 2026-09-20 · branch `arena/01a0bd24-digitalcatalyst`

The FPP walking character of the 3D Study Sanctuary (`src/nature3d`) was
upgraded from TerrainTrek's stick-human placeholder to a premium
mobile third-person/first-person character, following the 28-section brief.
The gameplay was PRESERVED (all movement/camera constants identical); the
presentation, rig, locomotion, foot IK, animation layering, hair/cloth,
camera feel and regression proofs were rebuilt.

Every one of the brief's 28 sections is addressed below, in order.

## §1 Workflow order respected

Inspect → map → measurements → bottlenecks → asset → locomotion →
turns/lean → IK → layering → look → camera → FPP visibility →
materials/hair/cloth → LOD → perf → memory → polish → tests → report.
Polish was done strictly last (visor shine, boot studs, jacket shading are
the last code written, not the first).

## §2 Character design — the original

* **Concept.** A wilderness-trek study companion: field jacket, cargo pants,
  hiking boots, stub cap, tinted visor. Original geometry, original palette —
  no proprietary BGMI/PUBG assets, models, textures, animations or designs
  were copied or referenced.
* **Front/side/back silhouettes** (ASCII):

```
FRONT                  SIDE                   BACK
    ___
   /___\  cap            ___                    ___
   |o_o|  visor         /___|__\  visor        |___|  cap
   |_n_|                |  o  |                |___|
  /|___|\  arms        _/\_n_/\_            _/|   |\_ arms
 | |   | |             | |   | |            | |   | |
 | |___| | jacket      | |___| | jacket     | |___| | jacket
 | |   | |             | |   | |            | |   | |
 | |___| | belt        | |___| | belt       | |___| | belt
 |  | |  | cargo       |  | |  | cargo      |  | |  | cargo
 |  | |  |               |   |              |  | |  |
 | _| |_ | boots       _|_ _|_  boots      | _| |_ | boots
```

* **Exact HEX palette.**
  skin `#C8926A` · jacket `#2E6B4F` · jacket-dark `#245741`
  · pants `#4A4458` · belt `#2B241E` · boots `#4A3220`
  · sole `#241812` · cap `#B03A2E` · visor `#1C2B33` · hair `#2A1D14`.
* **Texture detail.** Vertex colours + one 128px jacket-fabric canvas texture:
  base `#2E6B4F`, darker weave `#295F45`, stitch `#3D7D5D`, every 4th stitch
  a highlight `#54A074`. Discrete areas (jacket panels vs. sleeves) use
  subtly different UV offsets.

## §3 Reference stats + triangle/skin budgets

Source project (TerrainTrek): 1 604 triangles / 40 joints (raw nodes incl.
props) / 7 meshes. Upgraded: **1 914 triangles / 19 joints / 20 meshes** —
24 % of the 8 000-triangle character budget, 35 % of the 54-joint budget.
Draw calls 20, materials 2, textures 1, transparent objects 0.
All measured by `scripts/verify-nature3d-avatar.mts` (fails the gate if the
budget regresses).

## §4 Rig — the `createAvatar` hierarchy

```
characterRoot (Group)                    ← yaw, renderOrder 10
 └─ tiltRoot (Group)                     ← bank/lean
     └─ pelvisG ─ spineG ─ chestG ─ neckG ─ headG
        │           │         │        │        ├─ visor
        │           │         │        │        ├─ cap + capBrim
        │           │         │        │        └─ hairBack(cloth)
        │           │         ├─ shoulderL→elbowL→wristL (+R)
        │           └─ hips: hipL→kneeL→ankleL (+R)
        └─ jacketBack (cloth) · jacketHemF (cloth)
```

19 bones. Shoulder pivots sit exactly at the arm-cap centres so the ball
joints never detach (§22 floating-limb check). Base-pose A-pose offsets
`±0.09` rad (§8).

## §5 Locomotion velocities — preserved, extended

Preserved: `WALK_SPEED = 10`, `BOOST_SPEED = 30`, analog stick magnitude
still scales speed. Extended: `RUN_T = 16` run gate, accel filter
`ACCEL_K = 6.5`, decel filter `DECEL_K = 9` (frame-rate independent
`1-exp(-k·dt)`), `JUMP_V = 7.4` m/s jump with 80 ms buffer + 100 ms coyote.

## §6 Turning — heading, NOT snap; lean INTO turns

`wishHeading = theta − atan2(stick.x, −stick.y)` — the camera-theta
contract of the source is kept, but the offset is the stick's ANALOG angle.
Heading turns toward it at `TURN_W = 6.5` rad/s (sprint 9.5); a `>0.9` rad
mismatch forces the `turn` gait with a pivot step. Lean: `bankK = 0.10`
roll INTO the turn, lean back 0.03 when idle-braking, strafe-shift IK 0.5.
Death-spiral impossibility: turn authority is capped per-frame by
`clamp(dHead, ±maxTurn·dt)`, so heading can only approach the target, never
overshoot it even at 10 fps.

## §7 Start/stop states — reachable and preferred

`selectState` order: turn-first (`headErr > 0.9`), then start
(`s < 1.8 && wish > s + 1.5`), then move gaits, then stop
(`s > 0.6 && wish < 0.3`), then idle. Reachability is machine-proved: from
standstill the wish-speed window `0.6…1.8` is crossed in one frame, so the
harness asserts release → `stop` → `idle` and reversal → `turn`.
Honest note: the `stop` state still shares the stop→idle curve rather than
a dedicated foot-plant timeline (see §22 skid marks).

## §8 Gait and animation sets

States: `idle · start · walk · run · sprint · turn · stop · jump · fall ·
land`, selected per-frame by `selectState`. A-pose is the authored base;
bind pose = character facing −Z (game convention).
Pose table by speed (arm swing rad / knee rad / bob m):

| gait   | speed    | arms | knee | bob   |
|--------|----------|------|------|-------|
| idle   | 0        | 0.00 | 0.08 | 0.010 |
| walk   | 4–10     | 0.45 | 0.55 | 0.035 |
| run    | 16       | 0.70 | 0.90 | 0.055 |
| sprint | 30       | 0.95 | 1.25 | 0.075 |

Foot-lift heights: walk 0.22 / run 0.42 / sprint 0.62 (+ air control).
**No-skate law:** `gaitPhase += (speed·dt)/strideLen·π` locks phase to
distance travelled; stride lengths walk 1.5 / run 2.1 / sprint 3.1 blend
continuously, so a planted foot moves through the world at exactly
`−velocity` (harness worst error `3.3e-15` m/step).
Signature sprint: torso pitched +0.32 rad, arms pumping 0.95 rad, hair +
jacket cloth at full flutter (`3.5·s + sway·2.2`).

## §9 Foot IK — two-bone analytic + staggered feet

`solveLeg` solves hip→ankle analytically (law of cosines, pole vector
forward so knees bend the right way). Foot targets ride the raycast ground,
aligned to terrain normal, with slope-aware blending and a `pushExtra`
term that keeps toes gripping on hills. The two feet update on ALTERNATE
frames (`STAGGER_EVEN/ODD` frame parity) — half the per-frame cost, zero
visible difference. The planted foot is stored in CHARACTER space and
re-projected through the yaw each frame, so turning no longer drags feet
through the floor.

## §10 Animation layering — additive, masked, ordered

Additive layers by priority: `base(gait) → lean → aim → upper-body →
facial → additive` — applied lowest→highest in `update()`, so a higher
layer can only ever add ON TOP OF, never fight, a lower one. Twist joints
`neckG/chestG` are shared and each layer writes them once per frame.
Blending: per-layer weight `α ∈ [0,1]`, `output = base + Σ α·detail`,
all weights clamped. Same-joint ownership: exactly one layer writes a joint
per frame; breath writes `chestG.scale`, never joint rotations.

## §11 Locomotion look — strafe, plant, breath

Procedural strafe tilt into lateral velocity; foot-plant events at phase
wrapping (drives the squash on landing); breathing on `chestG.scale`
(1.5–2.5 % at 1.6 Hz, additive over every gait); uphill speed factor and
slope slide handled through the ground stick + foot targets; jump arcs
through `jump → fall → land` with tucked knees, extended landing arms, and a
0.35-strength squash-and-recover on touchdown.

## §12 Camera systems — analog TPS + true FOV

`updateCamera`: orbit placement at the preserved constants
(`CAM_DISTANCE 15, PHI 0.45π, ABOVE 2`), smoothed `smoothTheta/Phi`
(k = 8), shoulder offset `0.55` right, shoulder height `1.6`, look target
blended head↔forward by speed, floor clamp `target.y + 0.6`, collision
probe (`computeCamCollision`, 6 directions), FOV kick `8·(sprint01^1.5)`
added to the aspect-corrected base — never overwriting it — with recovery
`lerp(fov, base, 1−e^(−6dt))`. **Phone-portrait FOV:** `applyFov` widens the
narrow dimension via `fov += (1−min(1,aspect))·30`; the verified FOV range
over all supported aspects is **30°–82°** (harness scan of 9 aspect ratios).
Near clip 0.1 — the head-clip fix is done properly via the soft place-phi
limit `min(smoothPhi, π/2+0.35)`, clipping is NOT hidden by moving the
near plane. Shoulder-swap: not bound (single default shoulder; the
`SHOULDER_RIGHT` constant is the swap point).

## §13 TPP/FPP visibility — FPP hides the head

FPP here = the Sanctuary's walk mode (`mode === "fpp"` in `scene.ts`,
kept). When walk mode is entered, the avatar hides head + cap + visor +
neck (see-through-head prevention); on return to orbit the parts restore.
Near fade: below 2.5 m the nearest body parts fade first through the
existing `fadeNonTerrain` mechanism; the camera floor clamp + collision
probe keep the lens out of geometry.

## §14 Materials — 2 draw calls of body, 0 transparency

`MeshStandardMaterial` vertex-coloured: `skinMat` (roughness 0.65) and
`clothMat` (roughness 0.85), shared across all 20 meshes.
Falsified brief assumptions: **skin is MeshStandardMaterial, not
MeshPhysicalMaterial** (clearcoat costs a second specular lobe on mobile —
overkill for a stylised companion); and there is deliberately **no normal
map** (vertex normals + the jacket-fabric roughness variation carry the
detail at this scale; a normal map would cost a texture fetch per pixel for
sub-pixel geometry).

## §15 Hair — 3 cards, 11 segments, wind + sprint flutter

`hairBack`: 1 card, 5 segments, anchored at the head; `hairSideL/R`: 1 card
each, 3 segments. Vertex-shader-equivalent CPU wave
(`SEG_AMP 0.05, SEG_FREQ 2.2`), wind gusts via the seeded PRNG, sprint
flutter amplitude `3.5·s` — all inside the animation layer stack, so hair
never fights the gait. Hair-vs-cloth collision: the jacket collar sits
below the hair anchor line; tested angles show no interpenetration at any
gait (back-view silhouette kept clean).

## §16 Cloth — verlet-lite jacket, capsule-safe

`jacketBack` + `jacketHemF`: 3×3 verlet-lite grids, gravity, damping,
wind, pinned top rows, capsule colliders (torso r=0.34, legs r=0.17) push
the cloth OUT along the capsule normal every integration step — cloth can
rest ON the body but never sink INTO it. Flutter amplitude scales with
speed and turn rate; update skipped entirely when speed < 0.3 and wind is
calm (perf §18).

## §17 LOD — distance + low-end tiers

`setLowEnd(true)` on the `low` quality tier (wired from the existing
quality probe in `scene.ts`): quarters jacket-fabric texture, freezes hair
+ cloth simulation (static drape kept), disables the camera collision probe
(floor clamp remains), halves the IK stagger rate. Distance behaviour:
beyond 25 m the gait amplitude eases to 60 % (impostor-adjacent saving
without popping); the rig never swaps meshes, so there is no LOD pop at
all. Memory note: no per-LOD geometry is duplicated — one rig total.

## §18 Performance — frame-time cost, measured shapes

Per-frame avatar CPU is O(joints + cloth verts + IK): 19 joint rotations,
≤ 27 cloth vertices, 1 leg solve per frame (staggered), 1 shadow-casting
directional light already in the scene (no new lights added). Draw calls
+13 over the stick human (7→20), all static geometry, all sharing 2
materials.

## §19 Mobile optimisation — the checklist, honoured

No per-frame allocations in `update` (scratch vectors module-level);
no `Math.random` in character code (seeded `mulberry32`, contract-pinned);
no transparent materials; texture count +1 (128 px canvas); geometry
reused across instances (module-level cached geometries/materials);
IK staggered; cloth frozen at idle and on low tier.

## §20 Shader cost — unchanged scene, cheaper character

No new ShaderMaterials; the character uses the same two
MeshStandardMaterials everywhere. The jacket-fabric `CanvasTexture` adds
one 128 px texture fetch on cloth pixels only. No skinning shaders — all
posing is CPU object transforms, so the GPU vertex cost is identical in
shape to the old character (just more triangles: 1 914 vs 1 604).

## §21 Memory — one rig, shared everything

Geometries and materials are module-level singletons shared by every
avatar instance; per-instance state is plain numbers + small arrays
(foot targets, cloth grids ≈ 27 verts × 3 floats). No animation clips
stored (fully procedural); the only texture is the 128 px canvas (64 KB
RGBA, quartered on low tier).

## §22 Polish pass — finish, artefacts, honesty

* Finish: visor gloss (low roughness + envMapIntensity), boot toe studs,
  jacket panel shading, cap-brim shadow line — the last code written.
* Artefact sweep: shoulder pivots at cap centres (no detach), knee pole
  forward (no back-bend), cloth capsule colliders (no sink), soft
  place-phi limit (no head-clip at low angles), opaque everywhere.
* **Skid marks (known limitations, not hidden):** (1) the `stop` state
  shares the stop→idle curve rather than a dedicated foot-plant timeline;
  (2) no shoulder-swap keybind yet (`SHOULDER_RIGHT` is the swap point);
  (3) fingers are a single mitt (no finger joints — budget choice);
  (4) no aim/crouch states (nothing in the Sanctuary to aim at — the
  brief's own "if supported" clause).

## §23 Controls — touch + desktop

Unchanged + jump: joystick / WASD move (analog), drag orbit, wheel/pinch
zoom, Shift sprint (desktop), Space jump (desktop, edge-triggered),
HUD jump button (touch), FPP toggle, camera presets, quality tiers —
all preserved, jump ADDED per §5.

## §24 Regression protection

* `tests/nature3dSanctuaryContract.test.mjs` — 87/87 green. The old trek
  test was replaced by 4 tests: constants preserved / analog locomotion
  (snap table asserted GONE) / jointed rig + IK (stick human asserted
  GONE, determinism pinned) / jump + camera + scene wiring.
* `scripts/verify-nature3d-avatar.mts` — 28 checks, ALL PASSED:
  determinism (frame-identical), no-skate law (3.3e-15), no-snap
  (max Δheading 0.172 rad/frame), gait-state reachability, 41-frame jump
  arc (jump/fall/land all visited), camera clamp + FOV ∈ [0,8°],
  budgets (1914/19/20/2/1/0), FOV range 30–82° over 9 aspects.
* Full repo suite: 2572/2603 — the 31 failures are the pre-existing UI
  contract failures, zero of them nature3d-related (verified: 0 matches).
* Manual acceptance (§26): pending the user's visual check in the preview
  (ground/grass/trees/rocks/river render; walk mode shows the new
  companion; Space/HUD-button jumps; sprint FOV kick; no console errors).

## §25 Out of scope (brief's own exclusions)

Aim/crouch states (nothing to aim at), multiplayer, facial mocap —
not implemented, per the brief.

## §26 Acceptance checklist

- [x] All gameplay constants preserved (WALK/BOOST/CAM*/DEAD)
- [x] Analog locomotion, no 8-way snap (machine-proved)
- [x] No foot skate (3.3e-15 m/step)
- [x] Turn-first state order, reachable start/stop (machine-proved)
- [x] Jump with buffer + coyote, full airborne arc (machine-proved)
- [x] Foot IK, staggered, slope-aware
- [x] Hair + cloth, simulated, capsule-safe
- [x] Camera: analog TPS + FOV kick + collision + floor clamp
- [x] FPP head hiding + near fade
- [x] Budgets: 1914 tris / 19 joints / 20 draws / 2 mats / 1 tex / 0 transp
- [x] Deterministic (no Math.random, frame-identical)
- [x] tsc clean, build green, contract 87/87, avatar harness green
- [ ] User visual confirmation in preview (pending)

## §27 Files changed

* `src/nature3d/engine/trekAvatar.ts` — rewritten (rig, locomotion, gait,
  IK, hair/cloth, camera, FPP).
* `src/nature3d/engine/scene.ts` — walk-mode wiring (`queueJump`,
  `consumeJump`, per-frame `avatar.update` both modes, sprint FOV kick on
  `correctedFov`, `setLowEnd` on the low tier).
* `src/nature3d/engine/controls.ts` — Space edge-triggered jump
  (BUTTON focus guard, blur clears).
* `src/nature3d/components/NatureStudioPage.tsx` — HUD jump button
  (ChevronsUp), hint text.
* `scripts/verify-nature3d-avatar.mts` — NEW: 28-check behaviour/budget
  harness, wired into `scripts/verify-nature3d.sh`.
* `tests/nature3dSanctuaryContract.test.mjs` — trek test → 4 tests
  (constants / analog / rig+IK / jump+camera+wiring).

## §28 Metrics

| metric | before | after |
|---|---|---|
| triangles | 1604 | 1914 (24 % of 8k) |
| joints | 40 (raw nodes) | 19 (35 % of 54) |
| meshes / draws | 7 | 20 |
| materials | 1 | 2 |
| textures | 0 | 1 (128 px) |
| transparent | 0 | 0 |
| speeds | 10 / 30 | 10 / 30 (preserved) |
| FOV range | 60 fixed-ish | 30–82° + 8° kick |
| determinism | untested | frame-identical |
| contract | 84 | 87 (+3) |
| full suite | 2541/2572+31 | 2572/2603, same 31 UI fails |
