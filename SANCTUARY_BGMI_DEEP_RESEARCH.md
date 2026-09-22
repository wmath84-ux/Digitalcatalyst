# BGMI / Unreal-scale mobile rendering — deep research → Sanctuary roadmap

Research branch artefact (2026-09-22). Question: *"BGMI mein itne heavy grass
aur trees, 8×8 km map, phir bhi no lag — kaunsi techniques use hote hain, aur
hamare chhote Sanctuary map pe wo kaise apply hoti hain taaki aur bohot saari
cheezein add karne par bhi super-smooth rahe?"*

PUBG Mobile / BGMI is built on **Unreal Engine 4** (mobile forward renderer,
Vulkan/GLES3). Everything below is what that class of engine does — verified
against Epic's docs, UE rendering discussions, and PUBG-player observations —
and where our WebGL/three.js engine already matches it, partially matches it,
or has a gap worth closing **before** we add more content.

---

## The ten techniques BGMI-class engines rely on

### 1. Grass is capped to a SHORT render distance — far grass is just TEXTURE
PUBG draws real grass only within ~70–150 m (Sanhok ~70–90 m, Erangel
~100–150 m) and uses the SAME radius for every player for fairness —
players literally lie "visible" beyond it because their grass is ground
texture only. Scope-in forces the far grass to render around the scoped
area. Sources: [r/PUBGMobile Sanhok grass distance](https://www.reddit.com/r/PUBGMobile/comments/9fdv1s/grass_render_distance_on_sanhok/),
[PSA: not covered by grass at a distance](https://www.reddit.com/r/PUBATTLEGROUNDS/comments/7lbf03/psa_you_are_not_covered_by_grass_at_a_distance/),
[r/PUBATTLEGROUNDS view-distance-ultra grass](https://www.reddit.com/r/PUBATTLEGROUNDS/comments/187k4jw/i_have_view_distance_to_ultra/).
The level-design trick that makes the cap invisible: place hills/trees on
common sightlines so players rarely NEED far grass ([source](https://www.reddit.com/r/PUBGMobile/comments/9fdv1s/grass_render_distance_on_sanhok/)).

**Sanctuary status: ✅ already matching.** Grass, sorrel, tufts are ring-based
(near ring + far ring), tiers scale the far radius (28→240 m), the far ring
is a flat card, and ground textures carry the far field. When we add content:
NEVER extend grass past the far-ring radius — extend the ground TEXTURE
instead (free).

### 2. Foliage instancing — thousands of plants, ONE draw call each
Unreal foliage = HISM (Hierarchical Instanced Static Meshes): one draw call
per mesh type for thousands of instances; practical limit ~500k–1M instances
([bugnet](https://bugnet.io/blog/fix-unreal-foliage-disappearing-at-distance)).

**Sanctuary status: ✅ already matching.** Every plant field is an
`InstancedMesh`; the forest is merged + instanced so "the forest stays in
two draw calls" (flora.ts). Rule for new content: always add via instancing
or `mergeGeometries`, never as loose meshes.

### 3. 3–5 step LOD chains; the LAST step is a 4–6 triangle billboard/impostor
Standard UE chain: high (0–20 m) → mid (20–80 m) → low (80–200 m) →
billboard/impostor beyond. A billboard final LOD turns a 1000-tri tree into
~6 tris ([TangentArc, r/unrealengine](https://www.reddit.com/r/unrealengine/comments/j7wgry/how_to_optimize_foliage_for_foliage_heavy_scenes/));
per-object guidance: ~2–6k tris hero, 500–2k mid ([Quora UE5 foliage](https://www.quora.com/How-do-I-make-trees-and-foliage-perform-better-in-Unreal-Engine-5-Without-Nanite-my-FPS-drops-dramatically-whenever-I-add-trees-Do-I-just-need-better-PC)).

**Sanctuary status: ✅ already matching.** Trees flip to crossed-card
impostors (4 tris) beyond a radius (flora.ts `IMPOSTOR_RADIUS`); grass has
near/far geometric LOD rings. Rule: every NEW prop species ships with an
impostor card on day one.

### 4. Cull Distance Volumes — tiny things vanish earliest
UE culls by *screen size*: small objects get short max-draw-distances, driven
by size→distance tables in Cull Distance Volumes
([Epic docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/visibility-and-occlusion-culling-settings?application_version=4.27)).
Per-class `foliage.CullDistanceScale` scales them together
([r/unrealengine](https://www.reddit.com/r/unrealengine/comments/1nvgseo/configurable_foliage_distance_culling/)).

**Sanctuary status: ✅ IMPLEMENTED (2026-09-22).** `cull.ts` computes the
size→distance cutoff live from `fov`×`viewH` (UE's per-frame equivalent of
`CullDistanceScale`), and the wildlife herd + flying birds sleep past their
~3 px distances. Perched birds, spray, grass radii keep their hand-tuned
gates on top.

### 5. Occlusion culling by design — let terrain hide the world
UE runs hardware/software occlusion queries; level designers place "occluders"
(hills, houses) on common paths so most of the map is invisible from most
positions ([CloudShannen, r/unrealengine](https://www.reddit.com/r/unrealengine/comments/1apl53i/how_to_increase_performance/)).

**Sanctuary status: 🟡 partial (by design only).** Frustum culling is free in
three.js; true occlusion queries don't exist in WebGL2. But the LEVEL-DESIGN
half is free: our districts already sit behind ridges (the trek chain).
Rule for new districts: put a hill/rockline between sightlines — manual
occlusion costs nothing and hides both GPU and CPU cost.

### 6. Distance streaming + HLOD proxies — why an 8×8 km map fits a phone
UE streams the world in grid cells; far cells collapse into merged low-poly
proxy meshes (HLOD) instead of full geometry
([World Partition explainer](https://medium.com/@sarah.hyperdense/world-partition-explained-open-worlds-for-small-teams-d10e81e6bf95),
[UE5 landscape/WP guide](https://www.strayspark.studio/blog/ue5-landscape-world-partition-massive-open-worlds)).
Crucially: **under ~4 km² you don't need streaming at all** — "a single
persistent level with good LODs handles it" (same source).

**Sanctuary status: ✅ N/A by scale (the right call).** Our world is small.
Static load + impostors + mergeGeometries = our HLOD equivalent. If the map
ever grows past ~4 km², THEN we add chunk-streaming; before that it would be
pure overhead.

### 7. Scalability presets — "Smooth + Extreme" is content, not magic
BGMI's Graphics presets (Smooth/Balanced/HD/HDR) swap texture sizes, foliage
density, view distance, shadows and AA; frame-rate presets cap fps; an
auto-adjust option lowers settings on fluctuation
([sportskeeda settings guide](https://www.sportskeeda.com/bgmi/best-graphics-settings-get-fps-bgmi-pubg-mobile),
[ggtools no-lag guide](https://ggtools.in/blog/bgmi-best-graphics-settings)).
Shadows + AA are the first sacrifices ([zupitek](https://www.zupitek.in/2025/11/how-to-optimize-bgmipubg-mobile-for-max.html)).

**Sanctuary status: ✅ matching (tier ladder).** quality.ts 4-tier budgets
(grass counts, treeCount 105→520, shadows 0/1024/2048) + DRS + thermal
shed ladder + 30 Hz pacing. New content MUST register counts in
`QualityBudget`, not hard-code numbers.

### 8. Material discipline — atlas textures, no wind on far LODs, no shadows on small things
From UE foliage-optimization consensus
([CloudShannen](https://www.reddit.com/r/unrealengine/comments/1apl53i/how_to_increase_performance/),
[Quora](https://www.quora.com/How-do-I-make-trees-and-foliage-perform-better-in-Unreal-Engine-5-Without-Nanite-my-FPS-drops-dramatically-whenever-I-add-trees-Do-I-just-need-better-PC)):
texture atlases (1 material slot per mesh — every extra slot is a draw
call), mip bias on far-LOD materials, WPO/wind OFF on far LODs (or a lookup
texture), roughness baked to constants on far LODs, **shadows disabled on
small/low-LOD objects**, masked cutout instead of translucency (overdraw!),
and density/scale *jitter* so you need fewer instances for the same look.

**Sanctuary status: ✅ matching (wind gap closed 2026-09-22).** Procedural
texture set ≈ atlas discipline, halveTextureSet ≈ far-mip bias, fp16 on
plant shaders, cheap Lambert on low tier, and the far grass ring now ships
with the wind program **compiled out entirely** (`windSway:false`) — the UE
"wind OFF on lower LODs" rule, made static at compile time. Small-prop
shadow policy verified compliant (all ground foliage `castShadow=false`);
cutout-alpha only, never `transparent: true` on foliage.

### 9. Spend the frame on what the player is looking at
PUBG's scope-in swaps the world for the scoped view. Our study-mode does the
same in reverse: when a board is framed, world simulation/animation runs at
quarter rate so DOM work (video, canvas, text) keeps the main thread
(scene.ts "STUDY MODE" comment). **Sanctuary status: ✅ matching.** Keep this
invariant for every new ambient system: if it's not within ~30 m of the
camera OR the framed board, it ticks at quarter rate or sleeps.

### 10. Variety from cheap parameters, not more geometry
UE's per-instance random + density jitter means ~20 % fewer blades reads the
same ([CloudShannen](https://www.reddit.com/r/unrealengine/comments/1apl53i/how_to_increase_performance/)).
**Sanctuary status: ✅ matching.** Placement jitter/scale/rotation variance
is built into every plant ring and the sorrel variants.

---

## Mapping table

| Technique (BGMI/UE) | Sanctuary status | File(s) |
| --- | --- | --- |
| Short grass draw-distance + texture far field | ✅ done | grass.ts, quality.ts tiers |
| GPU instancing (HISM) | ✅ done | grass/sorrel/grassTufts/moss |
| LOD chains + 4-tri impostor final | ✅ done | flora.ts importers |
| Merged-geometry districts (HLOD-lite) | ✅ done | flora.ts mergeGeometries |
| Quality presets + auto-adjust | ✅ done | quality.ts, DRS + shed ladder |
| Frame spent on the looked-at thing | ✅ done | scene.ts study-focus rate |
| Mip bias / texture diet | ✅ done | textures.ts halveTextureSet |
| No-shadows / cheap materials on low tier | ✅ done | quality.ts shadowMapSize, cheapPlants |
| Screen-size auto-cull for small props | ✅ DONE (2026-09-22) | cull.ts → wildlife/flyers sleep past ~3 px |
| Occlusion by level design | 🟡 keep doing it | districts behind ridges |
| Wind/WPO off on far ring | ✅ DONE (2026-09-22) | grass.ts windSway:false — wind **compiled out** of the far ring |
| No-shadow policy on small props | ✅ verified compliant | all ground foliage/impostors castShadow=false already |
| Distance streaming (>4 km²) | ⏸ N/A until map grows | — |

## Applied now (post-research implementation)

1. **Screen-size culling** (`cull.ts`): `cullDistanceForPx(radius, minPx, fov,
   viewH)` converts the UE size→distance table into a per-frame runtime
   cutoff — smaller screens cull CLOSER, which is exactly right. Wired to:
   wildlife (herd sleeps past its ~3 px distance — locomotion, matrices,
   behaviour all freeze) and flying birds (per-flyer trig sleeps past the
   cutoff; perched birds keep their own 45 m gate).
2. **Wind compiled OUT of the far grass ring** (`windSway:false`): the shader
   already faded amplitude to zero past 95 m but still spent three sines per
   far vertex; now the far ring's compiled program has no wind code at all
   (the largest instance count in the scene × 3 sines/frame, gone — real
   vertex-ALU saving on the weakest GPUs).
3. **Shadow audit**: every ground-foliage system already renders with
   `castShadow=false` (grass, tufts, moss, sorrel, impostors); big trees and
   structures keep theirs on the shadow tiers. Policy confirmed, rule #6
   stands for new content.
4. **Dead-code prune after FPP removal**: FirstPersonRig/KeyboardInput/
   VirtualStick/WALK_LIMIT (controls.ts), the whole TrekPlayer locomotion +
   third-person camera block and its tuning constants (trekAvatar.ts)
   deleted — the seated avatar keeps only the fields its breathing pose
   reads. ~300 lines of dead engine gone; chunk −4 kB.

## Rules for everything we add next (the "super smooth" checklist)

1. New plant/prop → **InstancedMesh or mergeGeometries only**, count lives in
   `QualityBudget` (4 tiers), final LOD is a ≤6-tri impostor card.
2. New ambient animation → distance-gated tick (≤30 m full, ≤90 m quarter,
   else sleep), allocation-free, like wildlife/spray/birds.
3. New small prop → inherits the screen-size auto-cull (to add) +
   `castShadow=false`.
4. New far content → ground/sky TEXTURE does the work; geometry stops at the
   far-ring radius.
5. New district → ridge/rock occluder on the main sightline; merged into ≤2
   draw calls; consider HLOD-style merged proxy first, streaming only past
   ~4 km².
6. Shadows/AA/translucency are luxury toggles — default OFF on small + far.
7. Wind shader scales to 0 beyond the far radius (add per-ring uniform).
8. Never `transparent: true` foliage — masked cutout only (overdraw tax).
