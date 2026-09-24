# GRASS ON EVERY HILL — Implementation Report

Owner directive (verbatim):

> "Sanctuary ki andar jitne bhi hills aur stones aur pahadiya hai sabhi per
> ghas ... exactly jaisa hai sab kuchh implement karo, agar animation hai to
> bhi sab kuchh implement karo ... pura gras exactly vaisa hi design dikhna
> chahie sabhi jagah, is per 360 degree all around har jagah dense grass
> dikhna chahie"

Reference design: the blend scene uploaded to the repo root —
`pahadon ke upar gras replace hill.blend` (Blender 3.0). Inspection of the
file shows the design intent precisely: a terrain plane wearing a
**dense, world-wide scatter of grass clumps** (`Grass_Basic_A/D
spring-summer` plus daisy flowers) — ~5 000 instanced plants covering the
ground in **every direction**, with no bare-rock band and no bare crest.

## What was implemented

### 1. `src/nature3d/engine/hillGrass.ts` (new) — the world-wide hill sward

One `InstancedMesh` (one draw call) sows the sward over a **full 360°
circle** from the meadow's edge (34 m) to the island rim (1 150 m) — over
the foothills, the 100 m mountain arc, both districts, the corridors and
the bay headlands:

- **Every slope wears grass.** Each clump measures the terrain normal and
  aligns its up axis to it (`setFromUnitVectors`), so the sward lies flush
  against 50°+ mountainsides instead of spiking off them.
- **Every altitude.** No rock-band or snowline veto — the smoke test
  measures grass planted up to the full 100 m crest, with ~65 % of all
  clumps above the old 18 m rock band.
- **Every stone.** The rock kit's published boulder bases get a skirt of
  clumps, so stones grow into the hillside (principle 50, now world-wide).
- **Dense at distance.** Cards grow with radius (height ×5.2, width ×13 at
  the rim), the same LOD-by-size trick the meadow's far ring uses, so the
  hills stay solid green without millions of instances. Weak tiers grow
  bigger cards instead of more instances (`farBoost`).
- **Animation included.** Wind sway is the meadow's own vertex-shader
  idiom (two-octave swell + flutter, per-clump phase), fading out past
  240 m where motion would read as shimmer. One `uTime` uniform per frame,
  zero JS work.
- Only physically impossible places refuse grass: the river channel, the
  warehouse pad, the sea floor, the beach band and near-vertical cliffs.

### 2. The ground colour — grass mountains (`terrain.ts`, `environment.ts`)

The altitude bands the terrain bakes into vertex colour were re-graded from
bare rock / snow to GRASS, per the directive:

- the 18 m band lerps toward dry upland pasture (`0x8a9a4b`), capped at
  0.52 so green stays the majority colour;
- the 52 m crest lerps toward pale sun-bleached grass (`0xc9d68a`), shelf-
  masked and capped at 0.5;
- the steep-slope rock blend in `groundColorAt` was pulled back from
  `steep * 0.92` to `steep * 0.38` — stone under the sward, never bare
  faces;
- the ground-photo macro fetch was also corrected to the contracted
  `vMapUv * 0.25` scale (existing test failure, fixed in passing).

The 18 m / 52 m thresholds stay exactly where they were — the props and the
sanctuary contract test read them.

### 3. Budget + wiring (`quality.ts`, `scene.ts`)

- New `hillGrass` budget on every tier: low 30 000 · medium 95 000 ·
  high 150 000 · ultra 210 000 clumps.
- Built right after the meadow grass; registered with the atmosphere pass
  as foliage (backlit glow), with the winter pass, and with the half-
  precision diet on low tier.
- In the thermal fail-safe ladder (70 % / 45 % trims), in the frame tick
  (`update(time, wind)`) and in `dispose()`.

## Verification

- `tests/nature3dHillGrassContract.test.mjs` — 11 new contract tests, all
  green (coverage circle, slope alignment, no altitude veto, stone skirts,
  wind shader, per-tier budgets, grass-colour bands, scene wiring, the
  reference blend present).
- Runtime smoke test (esbuild-bundled, all four tiers): the full budget
  places every clump — r = 34→1 150 m, heights up to 100 m, build 0.3–1.1 s.
- `tsc --noEmit` clean; `vite build` clean; the rest of the nature3d suite
  unchanged (pre-existing gaps: the sanctuary contract file cannot load
  because `src/nature3d/components/Joystick.tsx` is absent from this repo
  snapshot, and two winter-frost runtime tests were already failing before
  this change — none touched by grass work).
