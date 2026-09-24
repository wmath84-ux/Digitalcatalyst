# Explore mode — realistic third-person character + locomotion

**Date:** 2026-09-24 · **Branch:** `arena/01a0d36b-digitalcatalyst`
**Route:** `#/nature-studio` → **Explore** button (bottom tray) or the `E` key.
**Reference:** https://github.com/VeryHotShark/RealisticThirdPersonCharacter
(architecture patterns only — strafe locomotion, gait start/stop windows,
additive air pose, turn-in-place; all code here is original Three.js, no
PUBG/BGMI code or assets, no copied art).

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
  RealisticMale.ts      — procedural realistic male (~5k tris, 5 opaque PBR
                          mats, 1.89 m at CHARACTER_SCALE; faces −Z).
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

Tuning (the contract pins these): IDLE / WALK 1.4 / JOG 2.7 / SPRINT 5.2
m/s, crouch 1.3, prone 0.6, backpedal ×0.75, gravity −14, jump 5.2 m/s,
coyote 0.12 s, buffer 0.15 s, capsule r 0.35 / h 1.7, max walkable slope
50°, camera 3.2 m / 1.5 m / FOV 65. Quality tiers LOW/MEDIUM/HIGH
(default MEDIUM): IK off/reduced/full, pixel-ratio and shadow budgets.

## 2. Bugs the behaviour harness caught (fixed, then proven fixed)

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

## 3. Manual test plan — 30 steps

Setup for every step: open `#/nature-studio`, wait for the world to settle,
press **Explore** (or `E`). Steps 1–20 need only a keyboard + mouse; steps
21–25 need touch (or device emulation); steps 26–30 are system checks.

| # | Action | Expect | FAIL if |
|---|--------|--------|---------|
| 1 | Enter Explore | Camera swings behind a realistic adult man (~1.8 m) standing on the grass near the villa | No character · capsule/blob · floating or sunk feet |
| 2 | Look: drag mouse / right-drag | Orbit follows the drag, head + chest bias toward the camera; body stays put when idle | Camera detaches · head spins past ~60° · body yaws while idle |
| 3 | Hold `W` 5 s | Accelerates smoothly to a jog; arms/legs counter-swing; no foot-skate at cruise | Speed pops · sliding feet · moon-running arms |
| 4 | Tap `W` lightly / half-stick | Slow walk (~1.4 m/s), smaller steps | Only one speed exists · walk looks like jog in slow-mo |
| 5 | Hold `Shift+W` 5 s | Sprint (~5.2 m/s): lean-in, pumping arms, slight FOV widening | No speed change · sprint while standing still · FOV jump-cut |
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
| 17 | `C` while idle, then `W` | Sinks to a crouch (capsule + camera dip); crouch-walks at ~1.3 m/s; `C` stands back up | Camera stays high · crouch as fast as jog · stand pops |
| 18 | `C` then `Z` (or `Z` from stand) | Goes prone via a crouch stage (never a direct flop); crawls slowly; head cranes up | Stand→prone single motion · body clips through dirt |
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

- A realistic adult male (not a capsule) with a PBR body, correct human
  scale and −Z travel convention, replacing the old trek avatar.
- Third-person camera: 3.2 m boom, 1.5 m shoulder height, FOV 65, with
  terrain + wall avoidance and sprint FOV kick.
- Walk / jog / sprint / strafe / backpedal / crouch / prone / jump / fall /
  land all present, gated (sprint = grounded + forward + stand) and
  smoothly blended — no sliding, no popping, no snaps.
- Slope + water + furniture + house collision all hold; feet plant on
  uneven ground with distance-faded two-foot IK.
- One-stick + look + 4-button touch HUD drives the same InputManager as
  WASD/Shift/Space/C/Z.
- Zero per-frame allocation in the hot path; LOW/MEDIUM/HIGH tiers work
  with MEDIUM default; dev-only debug overlay present.
- Automated gates green: avatar harness 53/53, Sanctuary contract 90/90,
  `tsc --noEmit` clean, `vite build` clean.
