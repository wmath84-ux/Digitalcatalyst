# SANCTUARY — Mountain Forest Ring & Round World

Implements the owner's five directives for the Sanctuary's edge, all verified
against the live height field (`docs/world_round_check.png` is a top-down
render of the actual `terrainHeight()` after this change).

## 1. Anime sky is the default
`NatureStudioPage` boots with `animeSky = true` and issues `setAnimeSky(true)`
right after `engine.start()`. The Scene-menu toggle still switches back to the
procedural dome. Contract: `tests/nature3dAnimeSkyContract.test.mjs`.

## 2. The boundary land is ROUND, not square
The ground used to be four square `PlaneGeometry` plates; through the clear
shallows the outer plate's straight edge read as a square boundary. Every
shell is now a round disc/annulus (`buildRadialShell` in `terrain.ts`) and the
outermost shell reaches `TERRAIN_DISC_RADIUS` (1500 m) — past the island edge
(1440 m), so the fall into the sea always completes on drawn ground. Vertex
cost actually DROPPED (~46 k vs ~165 k): rings are spent where detail matters.

The free camera's limit is radial now too: `FLY_LIMIT_RADIUS` (1050 m) in
`terrain.ts`, clamped in `OrbitRig.fly` — no invisible square walls; every
direction ends over the island's own coast ring, short of open sea.

## 3. The coast reads to the horizon
- Terrain: the drowned shelf's easing keeps the shore shallow far out.
- Ocean shader (`water.ts`): a three-layer surf zone — glassy lagoon shelf,
  rolling foam bands that travel shoreward and pulse (broken arcs, not laser
  lines), and a white beach line where the chop breaks. Shelf alpha drops so
  the sand shows through, and the shallows stay transparent to the bed, which
  is what makes "aage infinity tak gaya" read on the water.

## 4. The real hills — the uploaded model, 360°
`the-landscape-is-a-forest-in-the-mountains.zip` (repo root) was converted
once with FBX2glTF and ships as `public/sanctuary/models/mountain_forest.glb`
(2.8 MB, textures resized + re-encoded, cutouts kept alpha-capable).

`mountainForest.ts` merges the diorama per material and draws it as one
`InstancedMesh` per material: 36 chunks on a 950 m ring (one every 10°),
alternately mirrored, each snapped to the REAL ground (highest of five
`terrainHeight` samples − 2.4 m sink). The whole 360° panorama is ~10 draw
calls. The bay sector (±17° around azimuth 0.92) is skipped so the beach
keeps its view of the sea — the ring opens there between two forested
headlands. The OLD procedural foothill band was retuned to real ridged
simplex (no sin/cos lattice) so ground hills and model hills read as ONE
mountain system.

## 5. Border-only ring at the OLD hills' size (final revision)
The first two passes taught two lessons the owner stated plainly:
(1) the ring is for the BORDER only — never the field; (2) its height must
match the old stone hills. The 60 m intermediate is gone: the terrain arc
is back at the original `MOUNTAIN_MAX_HEIGHT = 100` (trek amplitude 110,
foothills 44 — the exact old profile), and the ring's vertical scale is ×8
(silhouette ≈ 100 m) with the horizontal ×12 kept.

**The bug that made it "everywhere":** the first two rings applied the
scale TWICE — baked into the merged geometry AND again on every instance
matrix. The two matrices multiplied into ×144 horizontally: 4.4 km cards
that wrapped the whole world and hid the sky ("har jagah hills, sky dikh
hi nahin raha"). Sizes now live ONLY in the geometry bake; instance
matrices carry position + rotation at unit scale, and a comment guards
that line.
