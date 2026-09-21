# Sanctuary — Sorrel Field (real 3D ground plants)

**Date:** 2026-09-21 · **Branch:** `arena/01a0c218-digitalcatalyst`

## What changed

The meadow's placeholder shrubs — one icosahedron repeated 50–147 times
(the "one mesh, many placements" shortcut the research pass calls out,
§6) — are replaced by the real authored plant:

> **"Shrub Sorrel 01"** by Rico Cilliers, Poly Haven — CC0,
> https://polyhaven.com/a/shrub_sorrel_01

Eleven leaf/flower planes (3 319 triangles) carrying the scalloped
three-leaf rosettes, brown edge wear and the pink five-petaled blossoms,
cut out by the asset's own alpha map.

## Files

| Path | Role |
|---|---|
| `src/nature3d/engine/sorrel.ts` | New module: asset load, merge, scatter, wind, disposal |
| `src/nature3d/engine/flora.ts` | icosahedron shrub block removed (now a pointer comment) |
| `src/nature3d/engine/scene.ts` | Wires the field: async build, update, dispose, atmosphere/winter registration |
| `public/sanctuary/models/shrub_sorrel_01_1k.gltf` | The model (1K texture set) |
| `public/sanctuary/models/shrub_sorrel_01.bin` | Geometry buffer |
| `public/sanctuary/models/textures/shrub_sorrel_01_diff_1k.jpg` | Base colour |
| `public/sanctuary/models/textures/shrub_sorrel_01_nor_gl_1k.jpg` | Normal (OpenGL) |
| `public/sanctuary/models/textures/shrub_sorrel_01_arm_1k.jpg` | AO / roughness / metalness (packed) |
| `public/sanctuary/models/textures/shrub_sorrel_01_alpha_1k.png` | Cutout mask (not in the glTF — JPGs can't carry alpha) |

Total asset payload: **~1.3 MB**, served from the repo — the sanctuary
stays offline-first (no runtime hot-linking to Poly Haven's CDN).

## How it works

- **Two draw calls total.** All eleven parts merge into one geometry at
  boot; the field is two `InstancedMesh` rings (near 4–60 m, far 56 m →
  0.8 × the grass far radius), the same split as the grass field.
- **Per-tier counts** (`sorrelCounts`): low 120/40 · medium 320/90 ·
  high 600/150 · ultra 900/220 (near/far). Tuning happens there — the
  counts are static per tier, so plants never pop in/out at runtime.
- **Natural scatter, no clones:**
  - two-octave simplex **patch field** → organic clumps with *real gaps*
    (the brief asked for visible gaps, not just thinning);
  - full 2π yaw, small lean, independent x/y/z scale (squat-wide vs
    tall-narrow), subtle per-instance tint that inherits the ground's hue
    and warms on sun-facing facets;
  - environmental veto, same rules as the grass: river + scoured bank,
    worn trails, trodden disc under chair/desk, beach, slope > 30°,
    shallow soil, saturated channels, crowded closed canopy.
- **Wind** is a vertex-shader injection (the grass idiom): crown-only
  bend in local space (so instance scale scales it for free), distance
  fade past ~90 m, driven by the shared `uTime`/`uWind` uniforms.
- **Alpha-test, not alpha-blend** — no sorting, no overdraw explosion.
- **Failure-safe:** the glTF load is the only async piece of the world
  build; a failed load degrades to grass + wildflowers and warns in the
  console instead of breaking the scene.

## Verification

- `tsc --noEmit` clean; `vite build` clean.
- Node smoke test (real `terrain`/`environment` modules): all eleven
  primitives merge (3 319 tris), base rebased to the origin, and all four
  tiers fill 100 % of their instance slots with 2–4× sampling headroom.
- All six asset files verified serving from the dev server (200).

## Notes

- The `shrub_sorrel_01_1k.blend.zip` uploaded to the repo root
  (commit `32923bf`) is **no longer needed** — the glTF equivalent now
  ships in `public/sanctuary/models/`. It can be deleted from the repo.
- Procedural grass blades are intentionally kept as the base turf layer
  (they fill between the plants and carry the path/water logic); the
  sorrel field is the 3D plant layer on top.
