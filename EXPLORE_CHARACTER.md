# Explore mode — realistic third-person character + locomotion

**Date:** 2026-09-24 · **Branch:** `arena/01a0d36b-digitalcatalyst`
**Route:** `#/nature-studio` → **Explore** button (bottom tray) or the `E` key.
**Reference:** https://github.com/VeryHotShark/RealisticThirdPersonCharacter
— reproduced faithfully in original Three.js (see §4 for exactly what
"faithful" means: the repo is a UE5 project with no licence file, paid
animset content and no prone, so movement numbers / camera / behaviour are
matched 1:1 while mesh, animation and code are original).

---

## 1. What was built

The old Explore implementation (a floating first-person rig + a capsule
“trek” avatar) was pruned and replaced with a full third-person character
layer that lives **inside the existing Sanctuary** — same terrain, villa,
desk, day bed, beach houses, river and sea. Nothing else in the app moves.

```
src/nature3d/engine/character/
  CharacterConfig.ts    — every tuning number in one place (speeds, accel,
                          capsule, camera, IK fades, quality tiers)
  MovementState.ts      — gait/state selection, shortest-angle helpers,
                          no-skate gait law, turn-in-place policy
  CharacterController.ts— Input → wish dir → sprint gates → target velocity
                          → accel smoothing → rotation → integrate +
                          axis-separated collision → ground snap / gravity
  GroundingController.ts— terrain + water + slope sampling (sampleGround)
  CharacterRig.ts       — BONE_NAMES: the 21-bone skeleton contract
  RealisticMale.ts      — procedural athletic male in the reference
                          animset's design language (grey crew tee, navy
                          joggers, white-sole sneakers, faded crop; ~5k
                          tris, 5 opaque PBR mats, 1.89 m; faces −Z).
                          Replaceable: any licensed GLB/FBX bound to
                          BONE_NAMES drops in without touching locomotion.
  AnimationController.ts— layered pose: base gait → stance → additive air →
                          lean/bank/strafe → look. Cross-fade by tracking.
  FootIKController.ts   — two-bone leg IK, pelvis drop, sole pitch,
                          distance fade, LOW-tier skip
  ThirdPersonCameraController.ts — 3.2 m boom, 1.5 m shoulder height,
                          FOV 65 (+7 sprint kick), terrain + wall avoidance,
                          crouch/prone dip, shoulder offset
  InputManager.ts       — one abstraction over keyboard (WASD/Shift/Space/
                          C/Z) and the touch HUD: moveX/moveY/lookX/lookY,
                          sprint/jump/crouch/prone
  index.ts              — barrel

src/nature3d/components/Joystick.tsx — the one-stick touch control
```

HUD (touch + mouse): left stick, right-side Sprint (latching) / Crouch /
Prone / Jump buttons, “Exploring · tap to exit” chip, dev-only 4 Hz
telemetry span (`state/speed/grounded/slope/vvel/anim/fps/draws`).

Tuning (the contract pins these — reference values, UE cm → m): IDLE /
WALK 1.6 / JOG 3.2 / RUN 5.0 m/s, crouch 2.0, prone crawl 0.9, rotation
cap 500°/s, gravity −13, jump 7.0 m/s, coyote 0.12 s, buffer 0.15 s,
capsule r 0.38, max walkable slope 50°, camera 4.0 m boom / 1.1 m pivot /
FOV 90 centred (no shoulder offset, no FOV kick — as in the reference).
Quality tiers LOW/MEDIUM/HIGH
(default MEDIUM): IK off/reduced/full, pixel-ratio and shadow budgets.

## 2. Reference fidelity — what "exact same" means here

The user asked for the reference repository to be installed exactly. That is
not possible, for four concrete reasons, all verified against the repo:

1. It is an **Unreal Engine 5 project** (`.uproject`, Blueprints, `.uasset`
   binaries). UE content cannot run on the web — there is nothing to
   `npm install` into a Three.js app.
2. It has **no licence file**, so its content is all-rights-reserved by
   default; and its animations come from **FemaleAnimsetPro (a paid UE
   Marketplace pack)** plus Mixamo — Marketplace content is UE-only by
   Epic's licence and cannot be ported to the web legally.
3. Its character is **female**; this project needs a male player + a male
   student, so the design is reproduced as the male equivalent in the same
   athletic design language.
4. It has **no prone** (states are WALK / RUN / CROUCH / COVER / JUMP), so
   prone is an original military high-crawl built to the same bar.

What IS matched 1:1 from the reference's own `RealisticMovementCharacter`
source: run 500 cm/s, walk ≈ 160 cm/s, crouch 200 cm/s (UE default),
rotation rate 500°/s (hard cap), jump 700 cm/s, air control 0.35, braking
2000 cm/s² (snappy stops), 4 m centred camera boom, FOV 90, strafe
locomotion with body-faces-velocity, start/stop transitions, additive
air pose, leg IK that snaps position only, aim-offset head + torso, and
turn-in-place past ~60° with a still camera. Cover stays out of scope.

## 3. Bugs the behaviour harness caught (fixed, then proven fixed)

The headless harness (`scripts/verify-nature3d-avatar.mts`, run by
`bash scripts/verify-nature3d.sh`) runs the REAL controller/rig/anim/IK/
camera in Node. Its first run failed 14 checks and exposed two genuine
engine bugs:

1. **Z-teleport** — the integrator read `position.y` (feet height) for the
   Z candidate, pinning every frame's Z to ≈ feet height. Corrupted all
   spatial behaviour.
2. **Backwards facing** — the velocity-follow target yaw missed a negation,
   so the body whipped 180° to face away from travel (and the “no-snap”
   check caught the 0.48 rad whip).

After the two-line fix: **53/53 avatar checks pass**, plus `tsc --noEmit`
clean, `vite build` clean, and the Sanctuary contract suite **90/90**
(the file was 100% red at HEAD — it imported a module that no longer
existed). Full repo suite: 2653 pass / 38 fail, and a stash-compare
proves all 38 fail identically at HEAD (pre-existing UI failures in
MyDay/revision/store/orientation — none touched by this change).

No browser was available in the sandbox (Playwright CDN blocked), so the
30-step manual plan below is the browser acceptance gate.

---

## 4. Manual test plan — 30 steps

Setup for every step: open `#/nature-studio`, wait for the world to settle,
press **Explore** (or `E`). Steps 1–20 need only a keyboard + mouse; steps
21–25 need touch (or device emulation); steps 26–30 are system checks.

| # | Action | Expect | FAIL if |
|---|--------|--------|---------|
| 1 | Enter Explore | Camera swings behind a realistic adult man (~1.8 m) standing on the grass near the villa | No character · capsule/blob · floating or sunk feet |
| 2 | Look: drag mouse / right-drag | Orbit follows the drag, head + chest bias toward the camera; body stays put when idle | Camera detaches · head spins past ~60° · body yaws while idle |
| 3 | Hold `W` 5 s | Accelerates smoothly to a jog; arms/legs counter-swing; no foot-skate at cruise | Speed pops · sliding feet · moon-running arms |
| 4 | Tap `W` lightly / half-stick | Slow walk (~1.6 m/s), smaller steps | Only one speed exists · walk looks like jog in slow-mo |
| 5 | Hold `Shift+W` 5 s | Run (~5.0 m/s): lean-in, pumping arms, steady FOV 90 | No speed change · sprint while standing still · FOV jump-cut |
| 6 | `Shift` + `A`/`D` strafe, `Shift`+`S` | Stays jog-class; never sprints sideways/backwards | Sideways/backwards sprint |
| 7 | Release all keys from sprint | Stop-plant + settle to idle in ~1 s, no glide | Slides > 1 m · snaps to idle pose |
| 8 | `W`, then whip the mouse 180° | Body arcs around (analog turn, leans into it) and runs back; never snaps | Instant 180° flip · turn looks robotic-straight |
| 9 | Idle; drag camera 90° to the side, hold still 1 s | Character shuffles (turn-in-place steps) to face the camera heading | Feet glide while rotating · no steps · spins forever |
| 10 | `S` (backpedal) | Steps backwards slower than forward jog | Backpedals at full sprint · faces away from camera |
| 11 | `A` / `D` | Side-steps then curves to run facing travel | Strafes rigidly sideways forever |
| 12 | `Space` from idle | Crouch-dip, launch, legs tuck then extend, landing absorb dip; lands where physics says | No dip · legs frozen · lands with a snap · sinks into dirt |
| 13 | `Space` at sprint | Long jump preserving momentum; arms spread while falling | Jump kills momentum · arms pinned to sides in air |
| 14 | Run off the villa-pad edge / a bank | Falls (fall pose), landing grade matches drop (dip → deep absorb) | Falls through terrain · same landing for all drops |
| 15 | Mash `Space` mid-air | Exactly one jump; no double-jump | Second jump fires |
| 16 | `Space` a blink before landing | Buffered jump fires on touchdown | Input eaten |
| 17 | `C` while idle, then `W` | Sinks to a crouch (capsule + camera dip), arms forward-ready; crouch-walks at ~2.0 m/s; `C` stands back up | Camera stays high · arms hang behind · stand pops |
| 18 | `C` then `Z` (or `Z` from stand) | Kneels with hands planting, then stretches flat: chest ~0.3 m, up on elbows, head craned forward, toes back; crawls diagonal elbow/knee | Stand→prone single motion · feet in the air · arms clip through dirt |
| 19 | Prone under the desk (crawl to it from the north) | Slides under the 0.79 m top; `Z`/`C` while under it only reaches crouch, never stand | Stands through the desktop · blocked from crawling under |
| 20 | `Space` while prone | Pops to crouch, stays grounded | Prone leap · launches airborne |
| 21 | Left stick: full tilt / half tilt | Full = jog, half ≈ walk; release = stop-to-idle | Digital on/off · drift after release |
| 22 | Sprint toggle + full stick forward | Latching sprint until toggled off; works with stick only | Sprint needs keyboard · toggle sticks ON forever |
| 23 | Jump / Crouch / Prone buttons | Same behaviour as Space/C/Z | Any button dead or double-firing |
| 24 | Right-half drag (look) + stick held | Independent look + move ( twin-stick feel) | Look drag moves the body · stick drag turns the camera |
| 25 | Exit via the chip, re-enter | Clean exit to orbit; re-enter spawns the same man, same place, no duplicates | Ghost second character · camera stuck · state leaks |
| 26 | Sprint at the villa wall | Stopped at the wall, slides along it when angled; camera never enters the villa | Walks through · camera clips inside |
| 27 | Walk at the river, then into the shallows | Slowed wading; deep channel refuses the step (soft pushback) | Walks the riverbed · hard teleport out |
| 28 | Climb toward the high hills | Steep faces shed the climber (slide), sprint dies on grades, walkable slopes slow uphill | Climbs cliffs · floats over ridges |
| 29 | Crouch behind the desk; swing the camera low | Boom shortens/pulls over obstacles; lens never under terrain or inside furniture | Camera through desk/ground · jitter oscillation |
| 30 | 2 min sprint across the meadow (MEDIUM, mid-Android or emulation) | Steady frame rate, no GC hitches; LOW tier disables foot IK and still looks planted | Stutter · visible IK pop on LOW · feet hover/float |

### Final acceptance (all must hold)

- An athletic adult male (grey tee, navy joggers, sneakers — the same
  design as the seated student, who is built from the same rig) with a
  PBR body, correct human scale and −Z travel convention.
- Third-person camera: 4.0 m centred boom, 1.1 m pivot, FOV 90, with
  terrain + wall avoidance (reference tune — no shoulder offset, no kick).
- Walk 1.6 / jog 3.2 / run 5.0 / strafe / backpedal / crouch / prone / jump / fall /
  land all present, gated (sprint = grounded + forward + stand) and
  smoothly blended — no sliding, no popping, no snaps.
- Slope + water + furniture + house collision all hold; feet plant on
  uneven ground with distance-faded two-foot IK.
- One-stick + look + 4-button touch HUD drives the same InputManager as
  WASD/Shift/Space/C/Z.
- Zero per-frame allocation in the hot path; LOW/MEDIUM/HIGH tiers work
  with MEDIUM default; dev-only debug overlay present.
- Automated gates green: avatar harness 61/61, Sanctuary contract 90/90,
  `tsc --noEmit` clean, `vite build` clean.
