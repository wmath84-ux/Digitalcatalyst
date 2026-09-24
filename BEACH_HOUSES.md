# Sanctuary — the beach-house district (the uploaded house, six times over)

**Date:** 2026-09-24 · **Branch:** `arena/01a0d1f8-digitalcatalyst`
**Owner brief:** *"field bahut badi hai sanctuary ke andar fields per panch se
chhah alag alag jagahon per door-door yah house add karo … koi bhi glitch ya
problem nahin aani chahiye"*

---

> ### ⚠ Colour fix, second pass
>
> The first pass shipped the house **WHITE/cream**, because the bake assigned
> materials by MA-BLOCK ORDER instead of each mesh's own slot array, which put
> 8 341 of the 22 410 faces on `light` — and `light` is the pack's LAMP, so
> everything came out near-white. Both bugs are fixed and pinned by tests; the
> house now wears the file's own colours, and a separate class of white (five
> objects with **no material at all**) is handled explicitly. See §3b.

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
   | `light` | 24 | **a lamp** — an Emission node, not plaster (see §3b) |
   | `Roof` | 5 652 | the thatch / shingle courses |
   | `wall 1` | 580 | dark oiled plank bands |
   | `wall 2` / `wall 3` | 1 240 / 1 882 | timber bands (they DO carry faces — see §3b) |

2. **Two leftovers.** The scene also holds `OBBeach House` (a 17 × 14 × 15 m
   block, 8 vertices) and `OBCube.367` (a 1.8 m roof shell at the origin) —
   remains of the author's earlier blocky pass, ~110 m from the villa. They are
   *parented into* the house's tree, so a graph walk cannot separate them; a
   single-linkage cluster on object centres can (110 m apart, 40 m threshold).

3. **The colours are real, and they are NOT in the material names.** The five
   materials' legacy viewport fields (`Material.r/g/b/a`) all sit at Blender's
   default 0.8 grey, and `Object.col` is 1.0 white on every object — neither
   is the author's palette. The real colours are the **node-tree socket
   values**, and the real *shape* is: `light` is not plaster, it is a red-orange
   **Emission lamp** (1.0, 0.0598, 0.0), and `Roof` — which owns 14 664 of the
   22 210 exported triangles — is an **olive thatch** (0.248, 0.238, 0.108).
   `wall 1/2/3` are three different browns. See §3b.

4. **The parent transforms are bookkeeping, not a transform stack.** Every
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

    file .......... 2 217 KB   (22 210 tris, 5 materials — see §3b)
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

## 2b. §3b — THE COLOURS (and the two white bugs)

The owner's second report: *"color sahi nahin hai unka actual color nahin hai
unka white dikh rahe hain — keval actual color jo file mein mention hai sab
exactly vahi color implement karo."* Two independent bugs were producing that
white, and **both were in the bake, not the runtime**.

### Bug 1 — materials were assigned by block order, not by slot

`MPoly.mat_nr` indexes **the mesh's own `Material **mat` slot array**. The bake
was indexing `find_blocks_from_code(b'MA')` instead — the order the material
blocks happen to sit in the file, which is `light, Roof, wall 1, wall 2,
wall 3`. The two orders disagree on most of the house:

| | correct (`mesh.mat[mat_nr]`) | what the bake produced |
|---|---|---|
| `Roof` | 14 664 tris (5 652 faces) | 1 464 tris |
| `wall 3` | 3 770 tris | **0** |
| `wall 2` | 2 558 tris | **0** |
| `wall 1` | 1 194 tris | 1 464 tris |
| `light` | 24 tris | **22 110 tris** ← the entire house |

And `light` is the pack's **lamp**: an Emission node with base colour
`(1.0, 0.0598, 0.0)`. Every one of those 8 341 faces came out near-white. That
is the white in the screenshots.

`mat` is an array of **pointers**, so reading it takes two dereferences; the
slot count lives in `Mesh.totcol`, which is a **short**, not an int.

### Bug 2 — five objects have no material at all

Separately, five of the house's objects carry **no material slot and no object
material** (`Object.totcol = 0`, `Mesh.totcol = 0`), so Blender draws them with
its own default grey. They are some of the biggest, most visible panels — a
64-gon cupola cap, a long interior partition, three cross-beams.

They are **not** instances of any materialed mesh (their vertex data is
unique — verified by hashing every mesh), so there is no "correct" colour
anywhere in the file; only the possibility of inventing one. Since the owner
asked for *the file's* colours and not a nicer guess, the bake **drops them and
prints exactly what it dropped**:

```
unassigned-material objects DROPPED (the file gives them no colour):
   OBCircle.004  mesh=MECircle.005  polys=64
   OBCube.376    mesh=MECube.205    polys=12
   OBCube.377    mesh=MECube.206    polys=12
   OBCube.378    mesh=MECube.207    polys=6
   OBCube.379    mesh=MECube.208    polys=6
   -> 5 objects, 100 faces (1.1% of the house).
```

`--keep-unassigned` restores them in Blender's own grey if that is ever wanted.

### The colours that now ship — copied, not chosen

Base colours are **linear** in Blender's sockets and **linear** in glTF's
`baseColorFactor`, so they cross the boundary verbatim with no gamma conversion:

| material | faces | linear (r, g, b) | sRGB | what it is |
|---|---|---|---|---|
| `Roof` | 5 652 | 0.248383, 0.238419, 0.108126 | `#89865c` | olive thatch |
| `wall 3` | 1 882 | 0.098502, 0.029427, 0.011859 | `#58301c` | dark timber |
| `wall 2` | 1 240 | 0.259796, 0.081814, 0.031642 | `#8b5132` | warm timber |
| `wall 1` | 580 | 0.049547, 0.014357, 0.006436 | `#3f2013` | dark oiled plank |
| `light` | 24 | 1.000000, 0.059756, 0.000000 | `#ff4500` | **the lamp** — carried as `emissiveFactor`, so it survives the low tier's Lambert swap |

Two details the bake has to get right and the tests now pin:

* **A linked socket ignores its own default.** `Roof`'s Base Color arrives
  through a Hue/Saturation node, so `constant_rgba()` follows the link upstream
  to the constant behind it. Reading the socket blindly would have taken the
  HSV node's `(0.8, 0.8, 0.8)` instead — grey again.
* **`bNodeSocket.type` is not the RNA enum.** It is `eNodeSocketDatatype`:
  FLOAT=0, VECTOR=1, RGBA=2, SHADER=3, BOOLEAN=4, INT=5. Guessing the order
  reads every colour as a float and every float as a colour.

Nothing in the runtime re-tints: `beachHouses.ts` takes `material.color` and
`material.emissive` straight off the loaded glTF. The contract test asserts
that no hand-picked colour literal can come back, in the bake **or** in the
runtime, and that the bake's "no colour for this material" path is a hard
failure rather than a silent grey.

### What it looks like now

`docs/beach-houses/house_only.png` — brown timber, olive thatch, and the lamp
showing as warm orange through the window frames.

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
| Contract suite | `node --test tests/nature3dBeachHousesContract.test.mjs` | **11 / 11 pass** |
| World harness (real engine, real height field) | `bash scripts/verify-nature3d.sh` | **10 new house checks pass** (6 pads level, sites deterministic, spread, cut-down pads, no beach/river/villa collisions, walls clear) |
| Whole repo suite | `bash run_tests.sh` | 2 539 pass / 39 fail — **byte-identical failure set to the pre-change baseline** (diffed line by line: 0 regressions, +10 new passes) |
| Production build | `npm run build` | **built in 15.6 s** |
| GLB load | three's real `GLTFLoader` in Node | **LOAD OK** — 5 meshes, 22 210 tris, floor at y = 0, the file's own colours |

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
