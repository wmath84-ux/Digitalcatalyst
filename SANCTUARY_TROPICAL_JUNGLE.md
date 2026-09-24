# Sanctuary — the tropical jungle (owner's low-poly plant set)

**Date:** 2026-09-24 (pass 2) · **Branch:** `arena/01a0cf33-digitalcatalyst`

## What changed

The sanctuary meadow read as empty, so the owner's uploaded plant set —
`Lowpoly+plants+tropical+blend.rar` (a Blender file with six low-poly
alpha-card plants plus their six RGBA cutout PNGs) — is scattered over the
**whole world**: the study meadow, the plains, the trek district and the
mountain ring. Land is full on every tier, every plant is **7–20 m of
visible plant**, and every plant's base sits **on** the ground.

All six variants are used ("sabko add karna hai"):

| Variant | GLB | What it is | Height range in the scene |
|---|---|---|---|
| Fan palm on a stem | `tropical_palm.glb` | the palm TREE | 13 – 20 m |
| Banana leaf with splits | `tropical_banana.glb` | the banana TREE | 12 – 19 m |
| Tall fern frond | `tropical_fern.glb` | the tall fern | 9 – 15 m |
| Broad yellow-green leaf | `tropical_leaf_a.glb` | undergrowth | 7 – 11 m |
| Broad green leaf with stem | `tropical_leaf_b.glb` | undergrowth | 7 – 11 m |
| Variegated prayer-plant leaf | `tropical_leaf_c.glb` | undergrowth | 7 – 10 m |

## Pass 2 fixes (owner feedback, 2026-09-24)

1. **Plants were floating.** "jameen se juda dikh nahin rahe, hawa mein
   flow kar rahi hain" — the owner's cards ship with transparent padding
   inside their frames: measured per variant from the six card textures,
   the palm's artwork starts 8.8 % (0.25 m) up from the frame's bottom
   edge and the broad green leaf (leaf_b) a full 22.3 % (0.27 m). A 20 m
   palm stood with ~1.7 m of empty air under it. The field now measures
   the padding once per variant (`gapB`/`gapT` in the variant table) and
   translates each geometry at load so the **artwork's** base — not the
   frame's — is at y = 0; every scale is computed from the artwork height
   (`artH`), so a "20 m palm" is 20 m of visible fronds, and the padding
   below the base bites invisibly into the ground. The wind shader
   normalises on the same artwork height, so t = 0 exactly at the ground
   and the base never moves.
2. **Coverage was only around the boards.** "pure jameen per failao …
   pure world mein pahadon per jameenon per sab jagah" — the two-ring
   disc (≤360 m) became a three-ring field out to the mountain band
   (≤1.2 km; the ocean shelf past the island edge is the world's
   boundary, enforced by the tide gate). Slope tolerance loosens outward
   on purpose: 28° at the meadow, 40° on the plains, **52° on the
   mountain ring** — jungle on the pahad is an explicit directive, and a
   world-vertical card on a steep facet is the standard low-poly
   mountain-forest look. The mid/far patch field is nearly uniform
   ("jitne bhi area hai sab jagah" — the gaps were the complaint).
3. **The villa got its plants.** "ek jo villa hai uske niche 5 se 6
   paudhe" — six hand-placed plants at the rusty-roof villa's
   foundation (a 17 m palm on the chair-facing side, a row down the west
   flank, one at the back, one on the river side), a few metres off the
   walls so they frame the villa instead of clipping it. Composed, not
   random: fixed sizes (all inside the 7–20 m contract) and small fixed
   yaws. They join the near ring's meshes — same materials, wind and
   draw calls.
4. **More than a hundred more plants.** Every tier carries 150+ over the
   first pass.

## Asset conversion (the .blend problem)

The RAR's payload is a `.blend` file — unusable by the WebGL engine — and
the materials were legacy (no nodes), so the textures were orphaned from
their materials. Conversion was done headlessly (Blender 4.2 via the pip
`bpy` module, run with stub X11/GL libraries in the sandbox) and each
variant was exported as one self-contained GLB:

1. **Node material rebuilt** — Principled BSDF ← Image Texture (the set's
   own "Plant alpha N" PNGs, sRGB) plus the glTF exporter's
   alpha-clip pattern, so the GLB ships `alphaMode: MASK` (cutout, not
   blend) and `doubleSided: true`.
2. **Cards crossed** — each card is duplicated, rotated 90° about the
   vertical axis and joined, so the silhouette reads from every angle
   (classic billboard forestry; still one geometry per variant).
3. **Rebased** — footprint centred on the origin, base at the origin,
   authored transforms baked in, Y-up in the final GLB. (The transparent
   padding inside the frame is NOT baked away in the GLB — the engine
   measures and compensates at load, so the re-export stays faithful to
   the set.)

The six GLBs ship in `public/sanctuary/models/tropical/` (3.3 MB total,
textures embedded) — the sanctuary is OFFLINE-FIRST, nothing hot-linked.
`ASSET_LICENSE.md` records the owner-supplied provenance.

## Files

- `src/nature3d/engine/tropicalFlora.ts` — the field. `createTropicalField(budget, aniso)`
  loads the six GLBs (async, fail-soft — a broken asset degrades to the
  grass + sorrel meadow), re-anchors the geometries, scatters three rings
  plus the villa cluster, and returns a `TropicalField` (group +
  materials + update + setShed + dispose), the same shape the
  sorrel/grass-tuft/moss fields have.
- `src/nature3d/engine/scene.ts` — wiring: async build, atmosphere
  registration as FOLIAGE (backlit transmission), winter registration,
  half-precision on the diet tier, wind in the staggered ambient update,
  thermal-shed rung, dispose.
- `public/sanctuary/models/tropical/*.glb` — the six converted variants.
- `ASSET_LICENSE.md` — provenance line for the owner's set.

## How the scatter stays cheap (the no-lag contract)

- **18 draw calls max** — one `InstancedMesh` per (variant, ring). The
  CPU never touches a plant after build (`StaticDrawUsage` matrices).
- **112–320 triangles per plant.** The 1130-plant ultra field is ~300 k
  triangles of double-sided alpha-tested cards — the same order the
  1120-plant sorrel ultra field spends, on a cheaper per-fragment
  material (one texture fetch; the low tier swaps PBR for Lambert, the
  sorrel diet rule).
- **Alpha-TEST, not alpha-blend** (MASK, cutoff 0.5 from the glTF): no
  sorting, no overdraw explosion (principle 35). The far ring projects
  to a few pixels per card past ~700 m, so its fill cost stays small.
- **Wind is a vertex-shader injection** (the grass/sorrel idiom): one
  `uTime`/`uWind` uniform pair per frame, artwork-base-anchored `t²` bend
  in local space (the instance scale multiplies it for free — a 20 m
  palm sways more than a 7 m leaf), distance fade past ~110 m. The base
  never moves.
- **Static per-tier counts** — plants never pop in/out at runtime. Three
  rings out to the mountains:

  | tier | near ≤130 m | mid ≤640 m | far ≤1180 m | total | vs pass 1 |
  |---|---|---|---|---|---|
  | low | 80 | 130 | 100 (≤820 m) | **310** | +150 |
  | medium | 170 | 230 | 170 | **570** | +270 |
  | high | 270 | 330 | 250 | **850** | +370 |
  | ultra | 370 | 440 | 320 | **1130** | +480 |

  Plus the six-plant villa cluster on every tier (totals above are
  rings only; live totals are 316 / 576 / 856 / 1136).

## Where plants may NOT grow

Cheap rejections first, the site query last (the grass/sorrel ordering):

- the river channel + its scoured shingle band,
- the villa's footprint + 9 m apron (the six foundation plants are placed
  by hand, not by the scatter),
- the **study zone**: a 34 m keep-out around the chair — the three 30 m
  boards stand on a 26 m arc (lectern.ts) and this field's plants grow to
  20 m, so nothing may sit between the seated learner and a board face,
- the lesson board's hill and its sightlines (42 m keep-out),
- the open beach (below tide line + 1 m; one-in-five on the upper beach)
  — the tide gate doubles as the world boundary: past the mountain band
  the island falls below `OCEAN_LEVEL` and the ocean owns the rim,
- worn trail core (and a thin shoulder),
- slope > 28° / 40° / 52° (near / mid / far — the far ring climbs the
  mountains on purpose), soil < 0.15 (far: 0.08), the main channel's
  wettest facets, and — under a closed canopy — the outer rings thin.

A two-octave simplex patch field keeps the jungle in organic groves —
applied hard only in the near ring (the visible character), nearly
uniform in the mid/far rings so there are no empty districts. No two
instances are clones: full 2π yaw, a small lean, independent axis
scales, a subtle per-instance tint that keeps the authored texture's own
colour.

## Verification

- `tsc --noEmit` and `vite build` pass.
- Headless end-to-end run (real module, real terrain, GLBs served over
  HTTP, all four tiers): 316 / 576 / 856 / 1136 placements (64–200 ms,
  18 draw-call meshes each); **visible** height 7.01–20.00 m on every
  tier (contract measured on the artwork, not the padded frame); zero in
  the river; zero inside the 34 m study zone; zero inside the villa;
  zero underwater; zero off the ground; six cluster plants at the villa;
  far-ring plants out to the 1180 m mountain band (819 m on low);
  `setShed(0|1|2)` and `dispose()` clean.
- Padding measurement (the grounding fix): the six card textures were
  decoded and the alpha bands at the 3D bottom edge measured — palm
  8.8 %, banana 0 %, fern 0 %, leaf_a 7.9 %, leaf_b 22.3 %, leaf_c 5.0 % —
  these are the `gapB` values in the variant table.
