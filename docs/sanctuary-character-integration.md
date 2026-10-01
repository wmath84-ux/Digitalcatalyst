# Sanctuary character integration

## Current implementation — and the important limit

The original **entire** [RealisticThirdPersonCharacter repository](https://github.com/VeryHotShark/RealisticThirdPersonCharacter) was cloned **before** the scene changes, without depth/sparse/filter restrictions, and inspected at:

`bf56bcd56c5dd149590d1e5a0dc45575ae2fa95c` (Unreal Engine **5.1**).

The checkout contains 1,696 tracked files, 1,005 `.uasset` files and five `.umap` files; its Katiusza directory contains 459 files / 1,146,583,158 bytes. There is **no exported FBX/GLB/glTF character** and no project-level LICENSE. `docs/sanctuary-character-reference.json` records the verified inventory. The complete local checkout is approximately 4.8 GB including Git history.

**The exact Katiusza character is not installed.** The standing web guide is an original procedural fallback, clearly labelled in the HUD. It is **not** the upstream design, FemaleAnimsetPro, or a claim that native Unreal systems have been ported. The default runtime manifest deliberately has `modelUrl: null` and `licenseConfirmed: false`.

What is implemented:

- Existing Sanctuary terrain, hills, houses, sky, river and vegetation retained. **No upstream environment is imported.**
- Shader-stage precision/link fix, shader-cache hook preservation, and out-of-buffer grass instancing fix restore the world rather than hiding the boards.
- No seated student creation/update/winter/disposal in the live scene. Sofa remains alone; its three scale axes are **exactly 2× the previous rendered scale**, with its front edge kept clear of the desk.
- Standing guide fitted by actual neutral mesh bounds to **6 ft = 1.8288 m**. Units are metres. Crouched collision/pose height is 1.25 m.
- Playable collision-tested controller, TPP/FPP, desktop/gamepad/touch input and optional authorized GLB replacement.
- Existing lesson boards/media remain mounted. Playing switches their input off, not their browsing contexts; choosing a study board leaves player mode.

## Feature coverage: do not confuse web equivalents with native Unreal

| Upstream feature | This web implementation |
| --- | --- |
| Original Katiusza mesh, complete outfit, textures, skeleton | **Missing pending authorized export.** Adapter keeps the exported mesh/materials/textures/skin and normalizes neutral height; the web guide is not Katiusza. |
| Strafe locomotion, walk/run/crouch, keyboard controls | Independent web equivalent with analog/diagonal normalization, acceleration/braking and collision. Speeds are 2.2 / 5 / 1.1 m/s, not a promise of identical native root-motion velocity. |
| Physical jump, air control and landing | 120 Hz physics; jump 7 m/s, gravity 18 m/s², air control .35, coyote/buffer/early release and landing absorption. Capsule/world physics, **not** per-bone physical animation. |
| Start/stop, directional loops and turn clips | Procedural guide poses; licensed GLB supports 26 mapped motion roles. Native AnimGraph sync markers/blend masks are not executing. |
| Additive directional jump/land graph | Basic jump/fall/land blending and visual poses; **not** the original additive AnimGraph. |
| Head/torso camera follow and delayed turn-in-place | Web aim offsets, bounded head/torso look and >60° / 0.5 s delayed turn, with limited turn rate. |
| Control Rig leg IK | Web two-bone IK / ground sampling; **not** Unreal Control Rig. |
| Cover spline, posture, edge lean and exit | Existing Sanctuary box faces form straight paths; height posture, end lean, camera-relative motion and away-input exit work. **Not** source-authored curved spline actors or their animation speed curves. |
| Spring-arm camera | 4 m damped collision-tested boom, shoulder switch, zoom, optional mouse capture, plus a separate first-person eye camera. |
| Physical-animation ragdoll follower / per-bone wall avoidance | **Not ported.** Capsule collisions do not replace that system. |
| Skirt cloth simulation | **Not ported.** GLB supplies a skinned skirt mesh, not Unreal cloth physics. |
| Separate eyes/facial layers and source-specific modifiers/curves | Can be exported, but not automatically played as native layers. Further adapter work is required. |
| Original Unreal rendering/Blueprints | Not executable in Three.js. Matching mesh/material design does not make the rendering pixel-identical to Unreal. |

Original assets, native cloth/ragdoll and source-specific animation graphs are still required to satisfy an **exact, complete original-character** request. Do not describe this patch as that completed import.

## Controls

Choose **Explore on foot** (or Walk in the dock) to enter TPP. The opening world panorama remains the default.

| Action | Desktop | Touch | Standard gamepad |
| --- | --- | --- | --- |
| Move / strafe | WASD / arrows | Left stick | Left stick |
| Run | Hold Shift | Run latch | Left-stick click (held) |
| Jump / shorter jump | Space / release early | Jump / release | A / release |
| Crouch | Hold Ctrl | Crouch latch | B (held) |
| Enter/exit cover | E | Cover | X |
| Look | Drag; optional Mouse capture | Right stick or scene drag | Right stick |
| TPP / FPP | V | Camera button | Y |
| Swap shoulder | Q | — | — |
| Zoom | Wheel | Pinch | — |
| Safe respawn | R | Reset | — |
| Release captured mouse | Esc | — | — |
| Leave player mode | Pick a board/scenery view | Overview/dock | Use HUD |

Keyboard events from editor fields/boards are ignored. Space/Enter on a focused HUD button retains accessible button activation. Sticks are refs, not frame-by-frame React state. Both sticks and scene drags undo the CSS 90° landscape fallback. Blur, hidden tab, overlays, pointer cancellation and disposal clear input; camera switches preserve held input. Camera capture is optional and falls back to drag if a WebView/preview denies it. First person can look almost vertically up/down without crossing the gimbal pole. Entry/reset chooses an open, jump-clear patch from the existing vegetation registry so the six-foot figure does not spawn inside a giant leaf card; no plants are removed or rescaled.

Colliders come from **this Sanctuary's** rock transforms, narrow tree trunks, house footprints, villa/sofa/desk bounds and resized study-board placements. Terrain, steep slopes, steps, head clearance, deep water, ice support and world boundary are handled without triangle-casting the vegetation. These are conservative solid footprints, not a triangle-accurate navigable house-interior mesh.

## 1. Reproduce/verify the full reference download

```sh
npm run character:reference
# Verify a checkout already downloaded, without downloading anything:
node scripts/fetch-reference-character.mjs --report-only
```

The script uses a complete recursive Git clone into `.cache/upstream/RealisticThirdPersonCharacter`, verifies the reviewed commit/full history and checks for unresolved LFS pointers. A changed upstream HEAD fails pin verification rather than silently accepting unreviewed assets. It does not reset or modify this application's Git branch. The generated inventory is `.cache/reference-character-inventory.json`.

The multi-GB checkout is **not** copied into `public`, bundled, committed, or included in persisted build artifacts. If an environment does not preserve `.cache`, reproduce it with the script. Plugin third-party licenses in the reference do not establish deployment rights for the character/animation packs.

## 2. Export authorized character assets — never export the map

An authorized asset owner needs Unreal Editor 5.1 and the applicable Katiusza, FemaleAnimsetPro/Mixamo permissions for export and web deployment. A public GitHub download is not itself redistribution permission. Do not place paid source packs in public Git or serve them as standalone source archives.

1. Open the reference `.uproject` in UE **5.1**, not the browser. Enable Python Editor Script Plugin if using the helper.
2. Export `/Game/Characters/Katiusza/Models/Katia/SKM_Katiusza` as the skeletal mesh, with its clothing, eyes, skirt, materials, rig and morph targets. Select only the character, **not** a level, sky, ground, houses, lights, cameras or native cover actors.
3. Export the needed sequences from the character's `InPlace`, `RootMotion`, `Retargeted` and eyes folders. Preserve action names and correct character retargeting.
4. Optional helper (runs **inside Unreal Editor**, not ordinary Python):

   ```text
   py "<Digitalcatalyst>/scripts/export-unreal-character.py"
   ```

   Set `SANCTUARY_CHARACTER_EXPORT_DIR` before launching Editor, or look in the Unreal project's `Saved/SanctuaryCharacterExport`. It exports character FBX sequences, textures as TGA and a material/export report. It never creates a level export task. **Syntax checked only** in this sandbox; Unreal execution is unverified here. Inspect `export-report.json` for failures.
5. In a rig-aware DCC such as Blender, combine the mesh and properly retargeted/baked actions into **one** binary glTF 2.0 (`.glb`). Use Y-up and record forward direction as `-Z` or `+Z`. Use LOD0, not stacked duplicate LOD meshes. Keep the complete outfit/material slots; do not replace the figure with a mannequin or drop maps. Bake Unreal-only shader appearance to supported PBR textures, preserving normal/roughness/alpha/eyes/skirt details. The helper's FBX is an interchange intermediate, **not** a complete material/animation conversion.
6. Export all actions/NLA tracks, skin and morph targets with embedded PNG/JPEG/WebP textures. Ordinary geometry is supported; Draco/Meshopt/KTX2 decoders are not configured. Keep the deployable GLB ≤64 MiB; retain full-resolution source files externally. Inspect appearance and all poses against Unreal. FBX/GLB alone **cannot** transfer Control Rig, Blueprint graphs, ragdoll, cloth or custom spline curves.

For complete original runtime fidelity, those remaining native systems need a separately implemented/tested web port, or an Unreal runtime delivery architecture. That work is not claimed by the GLB adapter.

## 3. Validate/install the authorized GLB

Copy `docs/sanctuary-character-manifest.example.json` to your private export directory. Replace every placeholder clip/bone name with the actual exported names. The installer uses the same schema as the runtime; all **26 distinct adapter motion mappings** are required by default. That is adapter coverage, not certification of every native Unreal feature.

```sh
node scripts/install-sanctuary-character.mjs \
  --model /path/to/authorized-character.glb \
  --manifest /path/to/your-mapping.json \
  --license-confirmed --check-only

# Then deliberately install into public/sanctuary/character:
node scripts/install-sanctuary-character.mjs \
  --model /path/to/authorized-character.glb \
  --manifest /path/to/your-mapping.json \
  --license-confirmed
```

`--license-confirmed` is the operator's explicit confirmation of **export/deployment/distribution rights**, not an invented license grant. Review those rights before publishing a web-delivered model. `--replace` is required to replace a different installed model. `--allow-partial` deliberately accepts only the seven core clip roles and records missing optional roles; **do not use it for a complete-original-character acceptance**.

Only `character.glb`, `manifest.json` and SHA-256/source/license-acknowledgement `SOURCE.json` are installed. The validator rejects non-embedded resources, unsupported compressed assets, cameras/lights, unskinned environment geometry, absent/misnamed/reused full-coverage clips and invalid explicit bone names. Static accessories must attach to the character's bones. The runtime rejects obviously environment-sized GLB bounds, normalizes neutral boot-to-head bounds to 1.8288 m and leaves the labelled guide/world working if import fails. Horizontal root translation is stripped to prevent double-moving against authoritative capsule physics; vertical bob/jump is retained. Source-specific native root-motion/turn curves are not a promise of exact native execution.

## Verification

```sh
npm run build
npm run test:sanctuary:character
npm run test:sanctuary:engine
bash scripts/verify-nature3d.sh
```

Character runtime tests exercise actual geometry height, sofa ratio, fixed-step/frame-rate travel, analog/diagonal movement, gait, jump/buffer/coyote, steps, rotated walls/trees/sliding, crouch/head clearance, water/slope/boundary, cover/lean/exit, camera obstruction/FPP, delayed turn, input cleanup, pose IK, manifests and root motion. Installer tests use an **original tiny owned test fixture**, never an upstream model.

`tests/sanctuaryWorldBrowser.test.mjs` uses real Three.js/WebGL2 and the real React controls: low-tier shader **linking and pixel readback**, instance bounds/no magenta corruption, keyboard/HUD/camera/pause, persistent board iframe, rotated mobile sticks/drag, gamepad and the actual GLB loader/aim-reset/disposal. It skips explicitly if Chromium is not installed. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a custom binary. `SANCTUARY_SCREENSHOT_DIR` optionally saves ignored diagnostic screenshots. The final character collection is **37/37 passing, zero skips**, including four real WebGL2/controls/GLB browser regressions on Chromium/SwiftShader. The existing adaptive-resolution/hill-grass engine collection is **17/17 passing**, the production Vite build passes, and the working typecheck retains the seven baseline errors listed below. These are not screenshot-only/source-regex assertions.

The existing broader repository validation has unrelated debt: baseline typechecking has eight errors (seven remain after removing an unused page import), including the ReadingBoard `CourseBrainPanel.onComplete` prop and unused imports elsewhere. The original broad `nature3d*.test.mjs` collection already had 30 stale/legacy failures. After updating the character-specific/removal contracts (not unrelated environment expectations), the broader collection is **178 tests / 158 pass / 20 existing failures / 0 skips**, versus the original 147 pass / 30 fail / 1 skip. The shader/world smoke harnesses each retain the **same five failures reproduced from the original commit**; the updated avatar smoke harness passes. Do not treat a successful Vite build as a claim that every repository test/type check is clean.
