# Sanctuary character integration

## Current implementation — and the important limit

The original **entire** [RealisticThirdPersonCharacter repository](https://github.com/VeryHotShark/RealisticThirdPersonCharacter) was cloned **before** the scene changes, without depth/sparse/filter restrictions, and inspected at:

`bf56bcd56c5dd149590d1e5a0dc45575ae2fa95c` (Unreal Engine **5.1**).

The checkout contains 1,696 tracked files, 1,005 `.uasset` files and five `.umap` files; its Katiusza directory contains 459 files / 1,146,583,158 bytes. There is **no exported FBX/GLB/glTF character** and no project-level LICENSE. `docs/sanctuary-character-reference.json` records the verified inventory. The complete local checkout is approximately 4.8 GB including Git history.

**The exact Katiusza character IS now installed.** `public/sanctuary/character/character.glb` is a character-only binary glTF converted straight from the pinned UE 5.1 **editor-source** assets: the original mesh, complete outfit, source skin/eye/hair/cloth textures, the 84-bone rig, and original animation keys, then re-encoded for web delivery (textures only — every mesh, rig and animation byte is untouched). It is the real Katiusza design, not a procedural look-alike or a re-authored model.

The user explicitly confirmed export, web-deployment and redistribution rights on 2026-10-01. `public/sanctuary/character/SOURCE.json` records that acknowledgement, the pinned source commit, the source mesh SHA-256 and the installed GLB SHA-256; `manifest.json` carries `licenseConfirmed: true`. Reports: `docs/sanctuary-original-character-export.json` (deployed bundle) and `docs/sanctuary-original-character-archive.json` (full external archive with all 401 original sequences).

Deployed web copies downsample the 8K source textures (2K base maps, 1K normal/specular/occlusion maps), re-encode them to WebP and keep the runtime's 26 mapped controller clips, so the download is not a pixel-identical 8K/401-clip archive; the full archive stays external. That web pass took the shipped model from 43.2 MB to 11.1 MB (textures 33.4 MB to 2.8 MB) with every non-image byte identical. Native Unreal cloth, physical-animation ragdoll, Control Rig and Blueprint/AnimGraph execution are **still not ported** — see the coverage table. There is deliberately **no procedural stand-in figure**: if the model fails to load the Sanctuary draws no character and the HUD says so, rather than covering for the failure with a look-alike that is easy to mistake for the real one.

What is implemented:

- Existing Sanctuary terrain, hills, houses, sky, river and vegetation retained. **No upstream environment is imported.**
- Shader-stage precision/link fix, shader-cache hook preservation, and out-of-buffer grass instancing fix restore the world rather than hiding the boards.
- No seated student creation/update/winter/disposal in the live scene. Sofa remains alone; its three scale axes are **exactly 2× the previous rendered scale**, with its front edge kept clear of the desk.
- Character is fitted by actual neutral mesh bounds to **18 ft = 5.4864 m** — three times the original six-foot Katiusza, as requested. Units are metres. Crouched collision/pose height is 68.4 % of the body (3.75 m). Every capsule radius, speed, stride, step height, jump arc, foot-IK tolerance, cover threshold and spring-arm length is derived from one `CHARACTER_SCALE = 3` constant in `src/nature3d/engine/characterConfig.ts`, so the body stays geometrically consistent instead of being visually stretched.
- **Facing is measured, not assumed.** The deployed GLB's face/eyes point down **+Z** in its own node space (read from the real vertex data — eyes centroid vs. skull centroid, left boot vs. right boot), while the controller/camera call **-Z** the direction of travel. `manifest.json` therefore declares `modelForward: "+Z"` and `characterAsset.characterFacingYaw()` turns the model half a circle, so arms swing and the face point the way the character moves instead of running backwards. Both facts are asserted by tests against the deployed bytes.
- Playable collision-tested controller, TPP/FPP, desktop/gamepad/touch input and optional authorized GLB replacement.
- Existing lesson boards/media remain mounted. Playing switches their input off, not their browsing contexts; choosing a study board leaves player mode.

## Feature coverage: do not confuse web equivalents with native Unreal

| Upstream feature | This web implementation |
| --- | --- |
| Original Katiusza mesh, complete outfit, textures, skeleton | **Installed from actual editor source.** Original mesh, 8 material slots (head, hands, shirt, pants, buttons, cloth, eyes), original source textures downsampled to 2K for web, 84-bone rig, normalized to 5.4864 m (18 ft) from real neutral bounds. Not pixel-identical to the 8K source maps. |
| Strafe locomotion, walk/run/crouch, keyboard controls | Independent web equivalent with analog/diagonal normalization, acceleration/braking and collision. Speeds are 6.6 / 15 / 3.3 m/s (the original 2.2 / 5 / 1.1 scaled by the body), not a promise of identical native root-motion velocity. |
| Physical jump, air control and landing | 120 Hz physics; jump 21 m/s, gravity 54 m/s², air control .35, coyote/buffer/early release and landing absorption — the same airtime as the original with a three-times-taller arc. Capsule/world physics, **not** per-bone physical animation. |
| Start/stop, directional loops and turn clips | **Original source clips** (walk/run/crouch start, stop, turn) sampled from the reference animation data into 26 mapped motion roles. Native AnimGraph sync markers/blend masks are not executing. |
| Additive directional jump/land graph | Basic jump/fall/land blending and visual poses; **not** the original additive AnimGraph. |
| Head/torso camera follow and delayed turn-in-place | Web aim offsets, bounded head/torso look and >60° / 0.5 s delayed turn, with limited turn rate. |
| Control Rig leg IK | Web two-bone IK / ground sampling; **not** Unreal Control Rig. |
| Cover spline, posture, edge lean and exit | Existing Sanctuary box faces form straight paths; height posture, end lean, camera-relative motion and away-input exit work. **Not** source-authored curved spline actors or their animation speed curves. |
| Spring-arm camera | 10.2 m damped collision-tested boom (3.4 × the body scale), pivoting at 55 % of the body height so an 18 ft figure is centred and fully in shot, plus shoulder switch, zoom, optional mouse capture and a separate first-person eye camera. |
| Physical-animation ragdoll follower / per-bone wall avoidance | **Not ported.** Capsule collisions do not replace that system. |
| Skirt cloth simulation | **Not ported.** GLB supplies a skinned skirt mesh, not Unreal cloth physics. |
| Separate eyes/facial layers and source-specific modifiers/curves | Eyes material/texture and eyes sequences are included in the full external archive, but not automatically played as native layers. Further adapter work is required. |
| Original Unreal rendering/Blueprints | Not executable in Three.js. Matching mesh/material design does not make the rendering pixel-identical to Unreal. |

Original appearance, all original animation data and the skeleton are now in the app. Native cloth, ragdoll and source-specific animation graphs/Blueprints are **still not ported**, so this is not a claim of complete original runtime fidelity.

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

Keyboard events from editor fields/boards are ignored. Space/Enter on a focused HUD button retains accessible button activation. Sticks are refs, not frame-by-frame React state. Both sticks and scene drags undo the CSS 90° landscape fallback. Blur, hidden tab, overlays, pointer cancellation and disposal clear input; camera switches preserve held input. Camera capture is optional and falls back to drag if a WebView/preview denies it. First person can look almost vertically up/down without crossing the gimbal pole. Entry/reset chooses an open, jump-clear patch from the existing vegetation registry so the eighteen-foot figure does not spawn inside a giant leaf card; every probe scales with the body. No plants are removed or rescaled.

Colliders come from **this Sanctuary's** rock transforms, narrow tree trunks, house footprints, villa/sofa/desk bounds and resized study-board placements. Terrain, steep slopes, steps, head clearance, deep water, ice support and world boundary are handled without triangle-casting the vegetation. These are conservative solid footprints, not a triangle-accurate navigable house-interior mesh.

## 1. Reproduce/verify the full reference download

```sh
npm run character:reference
# Verify a checkout already downloaded, without downloading anything:
node scripts/fetch-reference-character.mjs --report-only
```

The script uses a complete recursive Git clone into `.cache/upstream/RealisticThirdPersonCharacter`, verifies the reviewed commit/full history and checks for unresolved LFS pointers. A changed upstream HEAD fails pin verification rather than silently accepting unreviewed assets. It does not reset or modify this application's Git branch. The generated inventory is `.cache/reference-character-inventory.json`.

The multi-GB checkout is **not** copied into `public`, bundled, committed, or included in persisted build artifacts. If an environment does not preserve `.cache`, reproduce it with the script. Plugin third-party licenses in the reference do not establish deployment rights for the character/animation packs.

## 2. Headless conversion from editor source (the route that produced the installed model)

The reference ships **no portable export**, so the installed model was decoded directly from the UE 5.1 editor `.uasset` data — no Unreal Editor, no manual Blender retargeting, and nothing generated or re-authored:

```sh
npm run character:reference                      # pinned full clone, verified
PYTHONPATH=.cache/character-conversion/python python3 scripts/convert-reference-character.py
PYTHONPATH=.cache/character-conversion/python python3 scripts/convert-reference-character.py --all-animations
node scripts/install-sanctuary-character.mjs \
  --model .cache/character-conversion/export/Katiusza.runtime.glb \
  --manifest .cache/character-conversion/export/manifest.json --license-confirmed
```

`scripts/convert-reference-character.py` reads, from the pinned `SKM_Katiusza.uasset` and its animation packages:

- the source LOD's real vertices — positions, full-precision tangent basis, UVs, vertex colours and up to 12 source bone weights, reduced to the 4 strongest **without discarding** a 5th+ weight silently (it refuses instead);
- the 84-bone reference skeleton with real reference poses, converted to inverse bind matrices;
- the 8 material slots resolved from the material graphs, with their source textures decoded from `FTextureSource` payloads, BGRA→RGBA decoded, DirectX→OpenGL normal green flipped, and specular/roughness/AO routed into glTF + `KHR_materials_specular`;
- every animation's real translation/rotation/scale keys (`AnimDataModel` raw tracks), with `-Y`→`-Z` facing and left-handed→right-handed conversion.

Safety: it verifies the source mesh SHA-256 and UE 5.1 package versions, refuses unreviewed assets, drops only the **original disabled duplicate** cloth section (not clothing), and never reads a level/map. Runtime mode keeps the 26 mapped clips and samples 1920 Hz retargeted curves at 60 Hz; `--all-animations` keeps every original key in a 300 MB external archive. Output stays in ignored `.cache/`; deployment requires the separate explicit installer.

The helper depends on the GPL-3.0 `unreal-assets-to-glb==5.5.0` package for its package/property reader (installed privately into `.cache/character-conversion/python`, never bundled into the app) and on numpy/Pillow. Serialization shapes were cross-checked against CUE4Parse (Apache-2.0) sources; CUE4Parse itself cannot be built here because the sandbox blocks `dot.net`/`api.nuget.org`, and UE Viewer's Linux binary is a 32-bit build that cannot run.

## 3. Optional: Unreal Editor FBX/TGA route — never export the map

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

## 4. Validate/install the authorized GLB

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

Only `character.glb`, `manifest.json` and SHA-256/source/license-acknowledgement `SOURCE.json` are installed. The validator rejects non-embedded resources, unsupported compressed assets, cameras/lights, unskinned environment geometry, absent/misnamed/reused full-coverage clips and invalid explicit bone names. Static accessories must attach to the character's bones. The runtime rejects obviously environment-sized GLB bounds, normalizes neutral boot-to-head bounds to 5.4864 m, rotates a `+Z` model onto its `-Z` travel axis and leaves the labelled guide/world working if import fails. Horizontal root translation is stripped to prevent double-moving against authoritative capsule physics; vertical bob/jump is retained. Source-specific native root-motion/turn curves are not a promise of exact native execution.

## Verification

```sh
npm run build
npm run test:sanctuary:character
npm run test:sanctuary:engine
bash scripts/verify-nature3d.sh
```

The installed original GLB is validated in-repo by the **same installer validator** (`tests/sanctuaryCharacterContract.test.mjs`): real deployed bytes, skin/mesh/rig presence, self-contained buffers, no cameras/lights, the 26 mapped original clips present by their real source names, explicit bone roles resolving to real joints, and recorded rights/provenance.

Character runtime tests exercise actual geometry height, sofa ratio, fixed-step/frame-rate travel, analog/diagonal movement, gait, jump/buffer/coyote, steps, rotated walls/trees/sliding, crouch/head clearance, water/slope/boundary, cover/lean/exit, camera obstruction/FPP, delayed turn, input cleanup, pose IK, manifests and root motion. Installer tests use an **original tiny owned test fixture**, never an upstream model.

`tests/sanctuaryWorldBrowser.test.mjs` uses real Three.js/WebGL2 and the real React controls: low-tier shader **linking and pixel readback**, instance bounds/no magenta corruption, keyboard/HUD/camera/pause, persistent board iframe, rotated mobile sticks/drag, gamepad and the actual GLB loader/aim-reset/disposal. It skips explicitly if Chromium is not installed. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a custom binary. `SANCTUARY_SCREENSHOT_DIR` optionally saves ignored diagnostic screenshots. The character collection is **41 tests: 37 passing, 4 skipped, 0 failing**. The four WebGL2/React/GLB browser regressions skip — they do not silently pass — when headless Chromium cannot create a WebGL2 context (no GPU and no working SwiftShader, as in some sandboxes); they were last recorded at **38/38 passing, zero skips** on a machine with working WebGL2 Chromium/SwiftShader. Three of the node-runnable tests are new guards for this change: the deployed GLB's face/left axes measured from real vertex data and reconciled with `manifest.modelForward`, the loader's facing convention (no mirroring), and a camera-framing assertion that the whole eighteen-foot body sits centred and in shot at the default boom. The existing adaptive-resolution/hill-grass engine collection is **17/17 passing**, the production Vite build passes, and the working typecheck retains the seven baseline errors listed below. These are not screenshot-only/source-regex assertions.

The existing broader repository validation has unrelated debt: baseline typechecking has eight errors (seven remain after removing an unused page import), including the ReadingBoard `CourseBrainPanel.onComplete` prop and unused imports elsewhere. The original broad `nature3d*.test.mjs` collection already had 30 stale/legacy failures. After updating the character-specific/removal contracts (not unrelated environment expectations), the broader collection is **178 tests / 158 pass / 20 existing failures / 0 skips**, versus the original 147 pass / 30 fail / 1 skip. The shader/world smoke harnesses each retain the **same five failures reproduced from the original commit**; the updated avatar smoke harness passes. Do not treat a successful Vite build as a claim that every repository test/type check is clean.
