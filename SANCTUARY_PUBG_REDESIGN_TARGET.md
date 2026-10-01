# Sanctuary PUBG/BGMI-Style Redesign Target

Owner directive: reconstruct the Sanctuary environment around mobile-game logic, not by patching individual lag points. The study boards and board placement are fixed and must not be moved or resized.

## Strict rules for the redesign

1. **Static rich world, not dynamic cinematic world**
   - Prefer baked/faked visuals over runtime simulation.
   - Fixed bright daylight is the default look.
   - Dynamic day/night lighting and moving shadow maps are not part of the low-lag environment.

2. **Vegetation movement removed**
   - Grass, hill grass, tree leaves, tropical plants, sorrel, moss and tuft wind animation must not tick every frame.
   - If vegetation exists, it should be static or shader-light.

3. **Grass is mostly ground art**
   - Do not cover the map with real blade geometry.
   - Terrain texture / vertex colour carries the main grass/dirt variation.
   - Real grass exists only as very limited dense pockets/clumps.

4. **Batch/instance instead of individual objects**
   - Houses, repeated props, trees and vegetation are grouped into material/type buckets.
   - A thousand visible-looking pieces must resolve to a small number of render buckets wherever possible.
   - CPU draw-call count is reduced by instancing/merging; GPU cost is controlled with lower density, LOD, culling and impostors.

5. **No runtime shadow maps**
   - Shadow map size is zero in the environment budget.
   - Object grounding is supplied by baked terrain darkening, contact shadows, blob/decal shadows or authored material darkness.
   - Fixed sun angle means fake shadows can be precomputed and remain believable.

6. **No decorative wildlife in the performance world**
   - Animals, birds, butterflies and drifting leaves are disabled/zero-budget.
   - If life is needed later, it should be static silhouettes or very cheap 2D sprites.

7. **PUBG-style water**
   - Water is made from a small number of surfaces with scrolling normal/foam/flow textures.
   - No large particle system for waterfall/river/ocean.
   - Foam, mist and splash are texture cards/decals whenever possible; particles are zero or near-zero.

8. **UI overdraw diet**
   - Backdrop blur/glass is removed in the Sanctuary shell.
   - Use simple dark translucent panels rather than expensive blur filters.

9. **Walkable world**
   - Character must stay on terrain and not sink inside hills.
   - Houses/villa should be explorable/walk-through unless a proper interior shell collider exists.
   - Board collision and board placement remain untouched.

10. **Village expansion**
    - Add at least 20 more beach-house placements beyond the old six using the existing instanced house pipeline.
    - Houses should appear both nearer groups and distant groups, while staying out of the study-board area.

11. **Do not touch study boards**
    - Three study boards, lesson board placement, CSS3D board hosts and board-focused camera fit are out of scope.

12. **Mobile-first acceptance**
    - Low-end target is stable paced 30 FPS with less heat and less micro-stutter.
    - Visual realism comes from texture, lighting, density illusion, fog and batching — not from heavy real-time simulation.

## PDF/Text techniques added to the working checklist

The owner supplied the PDF content in chat. These points are now part of the redesign checklist. Items marked **applied** are already used in this pass; **partial** means the code has the foundation but needs deeper follow-up; **pending** means not relevant yet or not implemented.

1. **Frustum Culling** — applied/partial
   - Three.js culling remains active for most meshes.
   - Large instanced systems that previously disabled culling need split buckets/HLOD so culling can work safely.

2. **Occlusion Culling** — partial
   - Board sight/terrain occlusion exists for study boards.
   - True general object occlusion is not available in WebGL like UE; use distance/HLOD/proxies instead.

3. **LOD** — partial
   - Terrain uses concentric LOD shells.
   - Houses now need full/detail vs proxy buckets.
   - Vegetation density has been reduced, but far impostor layers remain a deeper phase.

4. **GPU Instancing** — applied
   - Houses, trees, grass/plant clumps already use instanced meshes/buckets rather than individual objects.

5. **Texture Compression and Mipmapping** — partial
   - Mipmaps and texture-size diet exist.
   - True ASTC/ETC2 compressed source assets are pending because that requires an asset pipeline.

6. **Asynchronous Asset Streaming** — partial
   - Heavy GLB plant/house assets load async and fail soft.
   - Real map-grid streaming/unloading is not fully implemented; current streaming mostly toggles resident grass/hill fields.

7. **Hardware Compression** — pending
   - Needs KTX2/Basis/ASTC/ETC2 pipeline for textures.

8. **World Partitioning / Grid Chunking** — partial
   - Terrain is LOD shells and vegetation streams by radius.
   - Future: chunk houses/props/trees into cells with per-cell visibility.

9. **Object Pooling** — applied where relevant / pending for effects
   - The render loop allocates no objects.
   - Water particles are removed; future bullets/effects must use pools, never create/destroy per event.

10. **Baked Lighting / Lightmaps** — applied conceptually
    - Runtime shadow maps are disabled.
    - Terrain receives baked/fake contact darkening from trees, houses and villa.
    - True UV lightmaps for imported buildings remain future asset work.

11. **HLOD** — partial
    - Terrain LOD exists.
    - Next step: far house clusters should draw as simplified proxy blocks instead of full bungalow meshes.

12. **Dynamic Resolution Scaling** — applied
    - Existing AdaptiveResolution remains and now works against a lighter world budget.

13. **Client-side Prediction** — not relevant
    - Sanctuary is local single-player movement, no server movement roundtrip.

14. **Simplified Hitboxes / Capsule Physics** — applied
    - Character uses an invisible capsule and simple box/circle colliders, not visual triangle collision.

15. **Interpolation** — partial
    - Camera/locomotion smoothing exists; no network interpolation needed.

16. **Audio Culling / Priority** — pending
    - No major Sanctuary audio system in this pass. If added, distance-priority culling is required.

17. **Hyper-realistic muted palette** — applied
    - Palette values from supplied text are represented in `palette.ts`: grass, leaves, bark, sky/water/fog/shadow/rock/dirt/mud/path.

18. **Stones and Hills: weathering + atmospheric perspective** — applied/partial
    - Weathering and fog systems already exist.
    - Distant hills use muted blue-gray atmospheric palette.

19. **Ground: texture splatting / vertex painting** — applied/partial
    - Terrain vertex colors blend grass/dirt/mud/gravel/sand/waterbed layers.
    - True multi-texture splat material remains future work.

20. **Micro-displacement / tire tracks / roughness breakup / decals** — partial/pending
    - Terrain height field and paths exist.
    - True decal projection and wet/dry roughness masks need another pass.

21. **Character movement: inertia, acceleration/deceleration, capsule, slope speed, jump phases, landing absorption** — applied/partial
    - Controller already uses acceleration/braking, capsule collision, air control, jump gravity and landing absorption.
    - This phase improves terrain support sampling so the character does not sink into hills.

22. **Foot IK** — pending
    - The web avatar system has gait/pose state but not full per-foot raycast IK yet.

## Deeper phase 2 implementation notes

Applied in this pass:

- **House/villa interiors moved from walk-through to simple interior wall colliders.**
  The previous sealed-box colliders were removed so the player could enter; now each house/villa receives cheap box wall segments with a front doorway gap. This preserves PUBG-style simple hitboxes while allowing entry.

- **Character hill grounding improved further.**
  Capsule terrain support now uses multiple probes around the capsule footprint instead of centre-only sampling, reducing the issue where the character sinks into hillside geometry.

- **Far settlement HLOD started.**
  Far homesteads use simplified proxy wall/roof blocks while nearer houses keep the authored bungalow model.

- **Wet/dry ground roughness breakup added.**
  Terrain shader now varies roughness analytically: dry dirt stays matte; shoreline mud / track-like macro variation becomes glossier, matching the supplied PDF rule for wet mud roughness without adding a texture fetch or decal pass.

Still pending / partial:

- True KTX2/ASTC/ETC2 hardware texture compression pipeline.
- Proper per-cell/chunk loading/unloading for all props, not only grass streaming and house HLOD.
- True projected decals for pebbles, tire tracks and dead leaves.
- Full per-foot IK for the avatar.
- Authored detailed interiors for each house model.

## Deeper phase 3 implementation notes

Applied in this pass:

- **Water rewrite moved further toward PUBG-style cards/shaders.**
  River/waterfall still use scrolling shader textures, but shoreline foam is now cheap foam cards, waterfall base is a static plunge-foam decal, and mist is a single billboard sprite. Particle spray remains zero-budget.

- **Far vegetation impostor HLOD added.**
  A new `farImpostors.ts` system paints distant forest/palm silhouettes using two static instanced alpha-card buckets. This gives dense-looking far vegetation without full 3D trees.

- **Coarse settlement chunk streaming added.**
  Beach-house detailed buckets now sleep when the camera is far from the village/study band; far HLOD proxies remain visible as settlement silhouettes.

- **Ground decal layer added.**
  Terrain now gets cheap instanced mud/leaf/tire-track style decals using one generated alpha texture. This breaks repeated ground and gives paths/wet soil more realism without a projected-decal pass.

Already verified:

- Production build passes after these changes.

Still not full-native-engine level:

- Real ASTC/KTX2 compressed asset pipeline still pending.
- True occlusion queries / Unreal-style occlusion culling are not practical in this WebGL path; HLOD, culling, DRS and streaming are the replacement strategy.
- Full authored interiors/furniture for every house remain asset/design work.
