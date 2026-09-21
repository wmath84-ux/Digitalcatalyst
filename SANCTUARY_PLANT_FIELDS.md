# Sanctuary — the plant fields (sorrel, grass tufts, riverbank moss)

**Date:** 2026-09-21 · **Branch:** `arena/01a0c218-digitalcatalyst`

## What changed

The meadow's placeholder icosahedron "shrubs" (one mesh repeated 50–147× —
the "one mesh, many placements" shortcut the research pass calls out, §6)
are replaced by three real authored 3D plant layers, all Poly Haven, all CC0:

| Field | Asset | Module | Where |
|---|---|---|---|
| **Sorrel** | "Shrub Sorrel 01" — 11 leaf/flower planes, 3 319 tris, rosettes + pink blossoms | `sorrel.ts` | across the meadow |
| **Grass tufts** | "Grass Medium 02" — **five** variant clumps (v1–v5, 714–2 489 tris each) | `grassTufts.ts` | across the meadow |
| **Moss bank** | "Moss 01" — **twelve** variant clumps (204 tris total) | `moss.ts` | both banks of the river |

Asset sources (kept for traceability):
- https://polyhaven.com/a/shrub_sorrel_01
- https://polyhaven.com/a/grass_medium_02
- https://polyhaven.com/a/moss_01

All models + textures ship in `public/sanctuary/models/` (~3.5 MB total) —
the sanctuary is **OFFLINE-FIRST**, so nothing is hot-linked to Poly Haven's
CDN at runtime (same convention as the safari kit in `public/safari/models/`).

## Files

- `src/nature3d/engine/sorrel.ts` — sorrel field (15× base scale ≈ 1.26 m
  clumps; the earlier 5× read too small on the walk-through)
- `src/nature3d/engine/grassTufts.ts` — the five tuft variants, one
  InstancedMesh each (5 draw calls), all five always in use
- `src/nature3d/engine/moss.ts` — the twelve moss variants lining both banks
  (12 draw calls), ≥1 clump per metre of bank
- `src/nature3d/engine/flora.ts` — icosahedron shrub block removed
- `src/nature3d/engine/scene.ts` — wires all three: async build, update,
  dispose, atmosphere + winter registration
- `public/sanctuary/models/` — glTFs, bins, textures
  (`grass_medium_02_v{1..5}.gltf`, `moss_01.gltf`, `shrub_sorrel_01_1k.gltf`)

## How they stay cheap

- **Merged + instanced:** sorrel's eleven parts merge into one geometry →
  two rings (near/far) = **2 draw calls**; the tuft field is **5**; the moss
  bank is **12**. The CPU never touches a plant after build.
- **One material per field**, so one compiled program per field.
- **Wind is a vertex-shader injection** (the grass idiom): one `uTime`
  uniform per frame, crown-only bend in normalised local space (the instance
  scale multiplies it for free), distance fade past ~90 m.
- **Alpha-test, not alpha-blend** (principle 35): no sorting, no overdraw
  explosion. The Poly Haven glTFs ship MASK/BLEND with JPG base colours that
  cannot carry alpha, so each field's **alpha cutout map is patched in**
  (plus the normal + ARM maps the exporter dropped); the ARM pack also serves
  as the AO map (R=AO, G=rough, B=metal).
- **Static per-tier counts** — plants never pop in/out at runtime:
  - sorrel: low 120/40 · medium 320/90 · high 600/150 · ultra 900/220
  - tufts: low 150/40 · medium 400/100 · high 700/180 · ultra 1000/280
  - moss: anchor spacing 1.5 / 1.2 / 0.9 / 0.7 m per bank
- **Failure-safe:** each field loads asynchronously; a failed load degrades
  to the remaining layers and warns in the console.

## How they stay natural

- **No clones:** random variant (round-robin interleaved so a glance never
  finds a patch of "all v3"), full 2π yaw, a lean, independent x/y/z scale,
  and a subtle per-instance tint that inherits the ground's hue.
- **Patch-noise clumping:** each field uses its own two-octave simplex patch
  field (different offsets, so sorrel and turf clump in DIFFERENT places —
  where one is thick the other can be open), carving organic clumps with
  real gaps instead of an even carpet.
- **Environmental veto** (same rules as the grass): river, worn trails, the
  chair's trodden disc, the beach, slope > 30°, shallow soil, saturated
  channels, crowded closed canopy.

### The moss bank's waterline

The river is a straight gorge at x = 18, but the gorge is much wider than the
channel: the **waterline sits 7–23 m outside the channel edge** along z. A
fixed offset would plant half the bank underwater, so `moss.ts` walks
outward from the channel per anchor until the terrain rises above
`WATER_LEVEL`, then plants 1–3 clumps in the first 0.15–4 m of dry ground on
that bank — ≥1 clump per metre of bank on every tier. The trampled bank path
stays bare and the estuary (where the bank turns to sand) thins hard.

## Verification

- `tsc --noEmit` clean; `vite build` clean.
- Node smoke tests against the REAL terrain/environment modules:
  - all geometry merges/splits correctly (sorrel 11→1, tufts 5, moss 12);
  - sorrel + tuft scatter fills 100 % of instance slots on all four tiers;
  - moss bank lands 1.2–2.6 clumps/m/bank (low→ultra) — ≥1 everywhere.
- All model/texture files verified serving from the dev server (200).

## Notes

- The three uploaded `.blend.zip` files on the repo root (commits `32923bf`,
  `abed3e5`, and the moss upload) are **no longer needed** — the glTF
  equivalents now ship in `public/sanctuary/models/`. They can be deleted.
- Procedural grass blades stay as the base turf (they fill between the 3D
  clumps and carry the path/water logic); sorrel + tufts + moss are the 3D
  plant layers on top.
