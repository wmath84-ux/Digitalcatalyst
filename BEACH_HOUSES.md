# Sanctuary — the beach-house district (the uploaded house, six times over)

**Date:** 2026-09-24 · **Branch:** `arena/01a0d1f8-digitalcatalyst`
**Owner brief:** *"field bahut badi hai sanctuary ke andar fields per panch se
chhah alag alag jagahon per door-door yah house add karo … koi bhi glitch ya
problem nahin aani chahiye"*

---

## 1. What the uploaded file actually contains (measured, not assumed)

`Beach+House_Pack+JSGraphics_CGTrader.blend` is **Blender 3.0, uncompressed
(v301)** — not the 3.6 the name suggests, and not gzipped. It was read twice,
by two independent tools, because the whole job hangs off its numbers:

| Reading | Tool | Result |
|---|---|---|
| datablock census | `bat blocks` | 174 objects, 174 meshes, 5 materials, **1 image** |
| DNA-level inspection | `scripts/blend/extract-beach-house.py` | same, plus geometry |

    objects ............ 174 meshes (172 belong to the house)
    triangles .......... 22 410   (12 780 verts, 9 468 n-gons, all flat-shaded)
    materials .......... MAbeachhouse | light / Roof / wall 1 / wall 2 / wall 3
    image textures ..... NONE
    colour attributes .. NONE

Three findings decided the whole implementation:

1. **There are no textures.** The file's only image datablock is Blender's own
   `Render Result`. The five materials are flat grey placeholders
   (`0.8, 0.8, 0.8`), and only three of them carry any faces at all:

   | slot | faces | what it is |
   |---|---|---|
   | `light` | 8 341 | lime-washed plaster + the roof's rafters and finials |
   | `Roof` | 547 | the shingle courses |
   | `wall 1` | 580 | the dark oiled plank bands |
   | `wall 2`, `wall 3` | **0** | unused slots (carried anyway, see §3) |

2. **Two leftovers.** The scene also holds `OBBeach House` (a 17 × 14 × 15 m
   block, 8 vertices) and `OBCube.367` (a 1.8 m roof shell at the origin) —
   remains of the author's earlier blocky pass, ~110 m from the villa. They are
   *parented into* the house's tree, so a graph walk cannot separate them; a
   single-linkage cluster on object centres can (110 m apart, 40 m threshold).

3. **The parent transforms are bookkeeping, not a transform stack.** Every
   detail object carries its own world placement in `loc` and its mesh is
   authored around its origin; the parents' 5.4× scales are `OBBeach House`'s
   own odd scale and would blow the model up 5× if multiplied in. Verified by
   rendering both ways (see §6) — the chain is wrong, the local matrix is right.
   `obmat` in the file is stale in the same way, so it is not consulted.

---

## 2. The asset that ships

`scripts/blend/extract-beach-house.py` bakes the scene to
`public/sanctuary/models/beach_house.glb` — offline-first, like every other
model in the sanctuary:

* keeps the 172-object house (single-linkage cluster, measured);
* bakes each object's world placement into the vertices, drops them at the
  origin and puts the floor at **y = 0**;
* converts Blender's **Z-up** to glTF's **Y-up**;
* welds nothing, decimates nothing — the authored 22 410 triangles are kept;
* splits the mesh into **3 primitives**, one per material, each with POSITION,
  NORMAL and TEXCOORD_0;
* writes the author's slot colours as `baseColorFactor` (metalness 0, so the
  roof cannot read as a mirror under this sun — the villa's rule).

    file .......... 2 184 KB   (22 410 tris, 3 materials)
    bounds ........ 21.568 (x) × 18.920 (y) × 17.330 (z) m
    wall box ...... 14.190 × 14.040 m     ridge ......... 13.588 m
    depth centre .. 0.000                 floor ......... 0.000

The GLB is validated by loading it through **three's real `GLTFLoader`** in
Node (see `scripts/verify-nature3d.sh`'s world harness and the history in §6),
not by reading the JSON by hand.

**One real bug was caught this way and is worth recording:** the first bake
centred the model on Blender's *height* axis instead of its *depth* axis, which
put the house 9.46 m underground and 8.7 m off its own origin. Nothing about
the file "looked" broken — the sizes and triangle counts were right. It was
found by loading the GLB and printing the bounding box.

---

## 3. Where the six stand — solved, not typed

The sites are **solved at build time against the same analytic height field
everything else reads** (`terrainHeight`), because a building in the river
gorge, on a sea cliff or across a trail is the one asset class a scatter pass
cannot fix afterwards.

    grid ......... 14 m steps over the sanctuary's fields
    gates ........ river corridor (|x-18| >= 20.4)
                   worn trails (pathWeight <= 0.02)
                   the villa's apron (58 m)
                   the lesson-board hill (95 m)
                   the study zone (r < 130 m)
                   the fields themselves (130 <= r <= 520 m)
                   above the beach, below the foothills (1.6 <= h <= 46 m)
                   pad relief <= 3.2 m  (a house is CUT into a slope)
    seed ......... the flattest open ground
    then ......... 5 x far-the-farthest with a flatness bonus
                   (>= 170 m apart; relaxes in steps rather than shipping five)
    yaw .......... facing the meadow, +-16 deg jitter
    scale ........ 0.86…1.14 x (ridge 9.7…12.0 m)

The result, deterministic on every machine (seeded `mulberry32`, no `Math.random`):

| # | world (x, z) | r | ground | ridge | yaw |
|---|---|---|---|---|---|
| 1 | (98, 182) | 207 m | 2.4 m | 11.94 m | −167° |
| 2 | (−322, −406) | 518 m | 24.3 m | 10.48 m | 34° |
| 3 | (322, −392) | 507 m | 13.8 m | 11.96 m | −29° |
| 4 | (−476, 182) | 510 m | 7.0 m | 9.73 m | 123° |
| 5 | (504, 56) | 507 m | 13.5 m | 11.18 m | −88° |
| 6 | (−196, 476) | 515 m | 17.8 m | 11.36 m | 145° |

Closest pair 406 m, widest 1 011 m — "door-door", spread across the whole
sanctuary, one of them a 3-minute walk from the study chair.

---

## 4. Why the ground is levelled (and how it cannot glitch)

`terrain.ts` now routes **every** exit of `terrainHeight` through
`levelBeachHouseGround` — the two early returns and the final one, so no path
can skip the pad:

```
base -> levelWarehouseGround(...) -> levelBeachHouseGround(...) -> height
```

* inside the walls + apron → **exactly** the pad level;
* outward through a 6–8 m blend → feathered back to natural ground (C¹, no
  step, no lip);
* anywhere else → after a 24-comparison early-out, the natural height,
  byte-identical to before this feature.

The pad level is the **lowest natural sample under the walls** (5×5 grid over
the wall box + 2.5 m apron), so the floor is cut into the ground rather than
perched on it. Measured relief under every wall: **≤ 5 cm**, six for six.

`beachHouseSite.ts` holds all of this and **imports nothing**: `terrain.ts`
imports it, and a cycle there would decide whether the houses exist. Until
`beachHouses.ts` installs the sites it answers "no houses anywhere", so the
world is exactly what it was before this feature — a silent, safe degradation.

---

## 5. Nothing grows through a wall

Seven prop kits already ask "is this the villa?"; all seven now ask about the
beach houses in the same breath, each with its own margin:

| kit | margin | why |
|---|---|---|
| grass (meadow) | 1.2 m | a blade must not clip the wall |
| hill sward | 1.5 m | same, on the mountain rule |
| grass tufts | 3 m | a 4 m clump is a bigger lie than a blade |
| sorrel | 6 m | 7.6 m clumps |
| tropical field | 9 m | 7–20 m cards would swallow the roof |
| trees | 9 m | a crown must not sit on the ridge |
| rocks | 3 m / 12 m clusters | a boulder through a floor |

The veto is measured on the **WALL box (14.19 × 14.04 m)**, not the roof's
flare — so grass still grows *under the eaves*, which is what makes the house
read as planted in a meadow rather than pasted on a lawn.

The yards are fed through `pathWeight` (a new `beachHouseYardWeight` term), so
the bare ground, the missing grass, the thinned plants, and the packed-dirt
ground tint all come from **one number** — and every existing consumer inherits
it for free.

---

## 6. Verification (every claim above is measured)

| Gate | Command | Result |
|---|---|---|
| TypeScript strict | `npx tsc --noEmit -p tsconfig.json` | **CLEAN** |
| Contract suite | `node --test tests/nature3dBeachHousesContract.test.mjs` | **10 / 10 pass** |
| World harness (real engine, real height field) | `bash scripts/verify-nature3d.sh` | **10 new house checks pass** (6 pads level, sites deterministic, spread, cut-down pads, no beach/river/villa collisions, walls clear) |
| Whole repo suite | `bash run_tests.sh` | 2 539 pass / 39 fail — **byte-identical failure set to the pre-change baseline** (diffed line by line: 0 regressions, +10 new passes) |
| Production build | `npm run build` | **built in 16.5 s** |
| GLB load | three's real `GLTFLoader` in Node | **LOAD OK** — 3 meshes, 22 410 tris, floor at y = 0 |

Two pre-existing failures the run surfaced and did **not** introduce
(confirmed by running the suite on a stashed tree): the shader harness's
`water: the grade lands in LINEAR light` check and the palette's albedo-range
check. `tests/nature3dSanctuaryContract.test.mjs` also crashes on a missing
`src/nature3d/components/Joystick.tsx` in the baseline tree.

### The visual proof

No browser or GPU is reachable from this sandbox, so the shapes were checked by
**rendering the real triangle soup offline** (a small z-buffered rasteriser,
`blendtool/`): the world's own height field sampled through `terrainHeight`,
`groundColorAt` and `pathWeight`, plus the real GLBs placed exactly the way the
runtime places them.

| file | what it shows |
|---|---|
| `docs/beach-houses/house_only.png` | the extracted house on its own: plaster, timber bands, thatch, 11 m ridge |
| `docs/beach-houses/house_pad.png` | the levelled yard cut into the meadow, the flat pad 19 m across, tinted yard |
| `docs/beach-houses/world_top.png` | the sanctuary from above: six houses on the fields, each with its own clearing |
| `docs/beach-houses/world_hero.png` | the same from a low oblique pass — houses on the field, not over the river |

That harness caught two bugs the source review could not: the GLB origin bug
(§2) and its own Y/Z swap while placing the soup.

---

## 7. Cost

* **3 draw calls** for all six houses — one `InstancedMesh` per material.
* Geometry uploaded **once**, matrices written **once**, then frozen
  (`StaticDrawUsage`; `update()` is a no-op that exists so the frame loop reads
  alike).
* `frustumCulled = false` on purpose: six instances spanning 1.2 km share one
  bounding sphere, so three's test would cull houses that are on screen. Three
  draw calls are not worth that bug.
* No shadow casting (the shadow frustum is 34 m around the study chair; a
  6-house shadow walk at 1 km would be pure waste); the ground still receives.
* The low tier takes the same `cheapPlants` diet the plant fields take —
  `MeshLambertMaterial` instead of PBR.
* UV attributes are dropped at load: the pack ships no textures, so the fetches
  would be pure waste.
* One extra term inside `pathWeight` (two length checks until the sites are
  installed) — the function runs ~60 000× per build and is otherwise untouched.
* The site solve runs **once**, before the first scatter: **~110 ms** of build
  time, 4 500 candidates, and not a millisecond after that.

---

## 8. Files

| file | what |
|---|---|
| `src/nature3d/engine/beachHouses.ts` | the district: site solve + instanced placement + load/teardown |
| `src/nature3d/engine/beachHouseSite.ts` | the pads, the wall-box test, the yard weight (no imports, on purpose) |
| `public/sanctuary/models/beach_house.glb` | the baked model (2 184 KB) |
| `scripts/blend/extract-beach-house.py` | the offline bake, committed for provenance |
| `scripts/blend/batutil.py` | the DNA reader the bake uses |
| `tests/nature3dBeachHousesContract.test.mjs` | 10 source-shape contracts |
| `scripts/verify-nature3d-world.mts` | +10 runtime checks against the real engine |
| `src/nature3d/engine/scene.ts` | wires it: sites installed **before** the ground mesh, district built async, `beachHouses` disposal, a `houses` camera preset |
| `src/nature3d/engine/terrain.ts` | every `terrainHeight` exit runs through the pads |
| `src/nature3d/engine/environment.ts` | `pathWeight` gains the yard term |
| `grass / grassTufts / hillGrass / sorrel / tropicalFlora / flora / rocks` | the wall veto |
| `src/nature3d/NatureStudioPage.tsx` | a "Beach Houses" viewpoint button |
