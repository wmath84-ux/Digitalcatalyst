# Sanctuary → Tropical Island — Phase 0 Technical Audit

> Task: transform the existing 3D Study Sanctuary (`src/nature3d/**`) into a
> bright, clean, tropical-island world (PUBG-Nusa *category* of visual quality,
> 100 % original assets) without breaking a single functional system.
>
> Reference note: no tropical reference image files were delivered with the
> task (the images present in the repo are Learnbook UI mock-ups and the app
> logo). The written "Reference characteristics" list in the brief is treated
> as the primary art-direction contract; every target value below is derived
> from it.

---

## 0. What the Sanctuary IS today

A three.js (r180-line API) procedural study world, ~12 600 lines, fully
client-side, zero new deps allowed (`package.json` is contract-checked against
water/ocean/postprocessing packages).

| System | File(s) | What it does today |
|---|---|---|
| Terrain | `engine/terrain.ts` | One analytic height field (`terrainHeight`), 4 concentric LOD shells (90/260/620/2760 m), vertex-coloured from an environmental rule set. Mountain arc up to 100 m, circular island edge falling to −16 m. River carved at x=18. |
| Environment field | `engine/environment.ts` | "Digital ecologist": slope / aspect / drainage (D8 flow) / worn paths / soil / crowding / biome per point. `groundColorAt` is the ONE ground-colour rule consumed by terrain + grass. |
| Palette / art direction | `engine/palette.ts` | Albedo clamps (30…240), texel density, hue drift, ground/foliage/rock palettes, per-elevation atmosphere keys. Currently tuned for a temperate morning meadow (olive greens, dust haze, snow crests). |
| Sky | `engine/sky.ts` | Rayleigh+Mie analytic dome (contract-pinned), fBm cloud-card banks (instanced billboards), sun shafts, drifting motes, sun/hemi/fill lights. |
| Daylight | `engine/daylight.ts` | Clock-driven solar arc → one `DaylightState` (sun dir/colour/intensity, hemi, sky gradient, fog, exposure). Intensity + exposure formulas are contract-pinned. |
| Water | `engine/water.ts` | River: dual-phase flow normals, Schlick Fresnel, Beer-Lambert depth tint, shoreline foam, sun glint. Waterfall sheet + ballistic spray. No ocean exists. |
| Grass | `engine/grass.ts` | Up to 245 k clump-based blades, 2 instanced LOD rings, GPU wind, colour inherited from `groundColorAt`. |
| Flora | `engine/flora.ts` | Growth-model trees (broadleaf/pine/acacia), ONE merged static-wood mesh, instanced leaf cards (sway + still), 300 m impostor LOD, perched + soaring birds. No palms. |
| Rocks | `engine/rocks.ts` | 4 sculpted masters × 2 LODs, clustered placement, per-instance weathering (moss/dust/wet), contact decals, grass skirts. |
| Atmosphere | `engine/atmosphere.ts` | Height fog + aerial perspective + foliage transmission, injected into every registered material via shared uniforms. |
| Weathering | `engine/weathering.ts` | Curvature AO/cavity, world-aligned moss/dust/streaks on rocks. |
| Districts | `engine/regions.ts`, `safariDistrict.ts` | One connected world: Trek (west highlands), Sanctuary (centre), Clay Safari (east valley, streamed GLB animals). |
| Buildings / roads / landmarks | — | **Do not exist.** The only structures are the study lectern, boards, chair, desk, lesson-board stand. Paths are worn-dirt trails (4 hand-authored polylines). |
| Performance | `engine/quality.ts` + scene loop | 4 static tiers, adaptive resolution, staggered updates, static shadow map, allocation-free loop, disposal contract. |
| Controls / avatar | `engine/controls.ts`, `trekAvatar.ts` | Orbit + FPP (joystick/swipe/keyboard), TerrainTrek locomotion constants, walk limit = WORLD_REACH, jointed avatar with IK. |

## 1. Verification gates (baseline, this working tree)

| Gate | Command | Baseline |
|---|---|---|
| TypeScript strict | `npx tsc --noEmit -p tsconfig.json` | CLEAN |
| Contract suite | `node --test tests/nature3dSanctuaryContract.test.mjs` | 87 / 87 pass |
| Shader harness | `bash scripts/verify-nature3d.sh` | 66/66 shader + ALL world + ALL avatar checks |
| Production build | `npm run build` | passes |

## 2. The contract (what must NOT change — source-shape assertions)

Pinned by `tests/nature3dSanctuaryContract.test.mjs` — every change below is
designed around these:

- **Terrain**: `WORLD_SIZE = WORLD_REACH * 2 + 400`, shell halves 90/260/WORLD_HALF,
  `if (h > 18) tmp.lerp(rock`, `if (h > 52) tmp.lerp(snow` (values may change,
  code shape may not), river carve lines, `smoothstep(150, SANCTUARY_HILL_RIM, d)`,
  ridged-noise forms, outer-shell spacing < 16 m.
- **Sky**: exact Rayleigh/Mie GLSL, sun-disc term, no mountain-ring mesh.
- **Water**: dual-phase flow lines, Schlick Fresnel line, `RIVER_LENGTH = 1000`,
  waterfall + ballistic spray lines, shared sun vector (`uSunDir = { value: sunDir }`),
  scene must pass the atmosphere's live colours.
- **Flora**: `sways: Math.random() < (r < 70 ? 0.55 : r < 150 ? 0.3 : 0.08)` exact,
  `maxRadius = 430`, `leafMatStill/leafMatSway` factory calls, merged `forest-wood`,
  perch/bird strings, wind-fade `smoothstep(60.0, 130.0, ...)`.
- **Grass**: InstancedMesh + onBeforeCompile wind + alphaTest + `smoothstep(45.0, 95.0, …)`.
- **Daylight**: `sunIntensity: lerp(0.95, 3.15, dayFactor)`,
  `exposure: lerp(0.92, 1.16, dayFactor)`, `warm` formula, MIN_ELEVATION 4°,
  arc maths. **Colour literals are NOT pinned** → the tropical grade goes there.
- **Quality**: farPlane ≥ 1500 all tiers, grassFarRadius ≥ 165, grassNear ≥ 10 000,
  fogDensity low enough that the far district stays > 15 % visible (≤ ~0.0005).
- **Wildlife/birds**: merged geometry + distance-LOD strings; ground animals stay removed.
- **Dependencies**: no water/ocean/postprocessing npm packages.

## 3. CURRENT → PROBLEM → TARGET → CHANGE → COST

| # | Current system | Problem (vs tropical target) | Target system | Required change | Perf impact |
|---|---|---|---|---|---|
| 1 | Palette: olive/dust/snow meadow | Reads temperate, muddy; no sand/turquoise keys exist | Tropical key set (pale sand, turquoise, clean bright greens, warm limestone) | Retune every palette table in `palette.ts`; add coastal sand palette | Zero runtime cost (data) |
| 2 | Sky uniforms: deep blue `#2a6ec4`, dust ground `#d9c9a8` | Sky too heavy/hazy for bright tropics | Cyan-blue `#2f7fd9` zenith, pale-cyan horizon, warm-sand haze | Change colour literals + cloud brightness/opacity | Zero |
| 3 | Daylight colours: temperate blues, grey-green ground bounce | Ambient too cool, ground bounce muddy | Brighter cyan sky light, tropical green-sand bounce, brighter fog | Change colour literals only (pinned formulas untouched) | Zero |
| 4 | No ocean — world just fades to haze past the rim | No coastline, no beaches, no turquoise | Depth-graded tropical ocean at a fixed sea level in the drowned island-edge zone | New ocean mesh in `water.ts`: radial grid with CPU-baked per-vertex water depth (analytic height field sampled ~2.6 k verts at build), shader reuses the river's dual-phase/Fresnel/foam recipe + depth colour ramp | +1 draw call, +1 transparent layer over water pixels only; ~5 k tris; no render targets |
| 5 | Island edge: 1150→1330 m linear drop to −16 m | Shoreline would be a steep cliff everywhere | Gentle coastal shelf: longer falloff (1120→1420 m, eased power), so a wide shallow turquoise shelf + real beaches exist | Reshape edge falloff constants/curve in `terrainHeight` | Zero |
| 6 | Mountain rim: full 100 m circle | Blocks every ocean view from inside the map | One authored coastal sector ("the bay") where the arc drops to dunes → long ocean vista + beach district | Angular gap factor in `outerRim` (keeps pinned structure/handoff) | Zero |
| 7 | Terrain colour pass: grass→rock→snow banding only | No sand/wet-sand/underwater banding | Full coastal gradient: dry sand → light sand → wet sand (per-pixel, world-Y based) → underwater sand → deep lagoon; foam line baked at the waterline | `groundColorAt` gains shore blend (shared with grass); terrain landscape shader adds world-Y wet-sand darkening + foam + underwater tint via the existing `vDcWorldPos` varying | ~8 ALU/pixel on terrain only |
| 8 | River: steel-blue `#57b5be/#061e33` | Reads temperate | Turquoise→teal tropical grade; riverbed sand | Change linear colour literals (pinned lines untouched); bed material tint | Zero |
| 9 | Flora: broadleaf/pine/acacia only | Wrong trees for a tropical island | 5-variant ORIGINAL palm system (curved trunk, frond cards, coconuts) + palm impostor LOD; distribution by biome (beach→palms, woodland→lush broadleaf, few highland pines) | New palm factory in `flora.ts` (merged trunk wood + instanced frond cards reusing the sway/still leaf pipelines + new `frond`/`palmCanopy` textures); kind selection reads the new coastal field | +2 instanced draw calls (fronds sway/still) + 1 impostor call; fronds ≈ leaves budget (no new leaf count); trunks merged into one mesh |
| 10 | Grass: uniform meadow to 420 m | Grass on beaches = wrong biome | Beach stays sand (density rejection below +1 m, thinning to +2.4 m); tropical blade tint | `acceptsBlade` height rule + texture/palette retint | Slightly FEWER blades |
| 11 | Rocks: grey meadow kit | Neutral grey reads cold | Warm coral-limestone grade, beach boulders + bleached high tint | Palette + placement/tint rules read `coastal` | Zero |
| 12 | No buildings | Brief requires tropical-modern architecture | ORIGINAL modular kit: wall/window/door/roof/balcony/stair/railing/pillar modules → villa ×2, resort pavilion, shop strip, shed, observation-beacon tower (landmark), jetty, boat | New `engine/structures.ts`, merged per material, vertex-AO baked, plinth pads so nothing floats on slopes | ~6–10 draw calls total (merged), ~30 k tris, static, frustum-culled; shadows only within the 34 m shadow frustum |
| 13 | No props | Brief requires controlled storytelling props | Beach umbrellas, benches, signs, fence runs, mooring posts — all instanced/merged, all at the bay/village | Same `structures.ts` | +1–2 draw calls |
| 14 | No distant islands | Depth stops at the fog line | 3 original island silhouettes 1.7–2.6 km out (merged low-poly, atmosphere-registered → correct aerial perspective) | Same file | +1 draw call, ~2 k tris |
| 15 | Trails: 4 dirt paths ending at the meadow rim | Nothing guides the player to the new coast | 5th trail: meadow → the bay village + jetty | One polyline in `environment.ts` TRAILS | Path-weight query cost unchanged (bbox-guarded) |
| 16 | Water bodies disconnected from sea level | River ends mid-island | River already carved full-length in the bed; estuary where it meets the bay | Downstream extension plane sharing the river material (pinned `RIVER_LENGTH = 1000` line untouched) | +1 draw call |
| 17 | Grade: exposure 1.08, ACES | Fine base; scene needs the final tropical push | Slightly brighter graded exposure (×1.06 on top of the pinned per-hour curve) + brighter fog/haze keys | `scene.ts` exposure application | Zero |

## 4. Deliberately NOT changed

- Study lectern, boards, desk, chair, student, avatar, controls, camera rigs,
  board bridge, safari district internals, wildlife removal policy.
- World layout (districts, river centre, clearing, board hill), world size,
  quality-tier budgets, frame-loop scheduling, disposal contract.
- Any pinned code shape listed in §2.

## 5. Build/test order (Phase 28 sequence)

1. ✅ Audit (this file) + baseline gates
2. Palette → daylight colours → sky (global art direction first)
3. Terrain (coast shelf, bay gap, colour pass, shoreline shader)
4. Water (ocean + river grade + estuary)
5. Environment field (coastal biome) → grass → flora (palms) → rocks
6. Structures (buildings, landmark, props, islands, jetty)
7. LOD/cull/perf review → harness extension → final gates
