# Mobile/tablet optimization — same world, bounded rendering cost

This is a **first implemented optimization pass**, not a claim that every technique
from the supplied native battle-royale report has been implemented. Game still
opens `index.html?scene=world&nogate=1`, never the unrelated mobile scene. This is now standalone page navigation, not an iframe. WebGPU is
still required. Phones without a suitable WebGPU adapter cannot run this engine.

## What stays the same

World dimensions/scale, seed, macro map, heightfield synthesis and erosion quality,
water layout, default walking spawn, tree species, terrain materials and sky model.
Desktop defaults retain their rendering budgets. Mobile sacrifices close-up leaf
geometry, draw distances, shadow reach, effect quality and internal resolution —
not the map. Expect visible quality differences; this is not pixel-identical output.

## Boot profiles (browser hints, not hardware identification)

- Desktop: original 1.5 DPR default cap, uncapped rAF cadence, four 2048² cascades.
- Mobile low: phones/tablets with ≤4 GB *reported* memory, missing memory hints,
  or fewer than six logical cores. iPad desktop-UA + multitouch is recognized.
- Mobile balanced: mobile devices reporting ≥6 GB and ≥6 logical cores.
- `?quality=desktop|mobile-low|mobile-balanced` overrides detection for A/B tests.
  `?hud=1` enables detailed GPU timing/readbacks (adds profiling overhead).
- These privacy-restricted browser values are only conservative hints. They do
  **not** expose available RAM, exact SoC, GPU utilization or device temperature.

| Budget | Desktop | Mobile low | Mobile balanced |
|---|---:|---:|---:|
| Target cadence | native rAF | 30 FPS | 30 FPS |
| DPR ceiling | 1.5 | 1.0 | 1.25 |
| Internal pixel ceiling | viewport-based | 921,600 | 1,555,200 |
| Shadow cascades | 4 | 1 | 2 |
| Shadow map edge | 2048 | 512 | 1024 |
| Shadow distance | 3200 m | 50 m | 100 m |
| R1 tree limit | 150 m | 24 m | 40 m |
| Impostor transition | 460 m | 90 m | 140 m |
| Main grass candidate grid | 3072² | 768² | 1024² |
| Near/mid/far compact grass capacity | 524,288 / 1,048,576 / 1,835,008 | 16,384 / 32,768 / 65,536 | same as low |
| Far-tuft capacity | 196,608 | 8,192 | 8,192 |
| Particle pool | 131,072 | 1,024 | 4,096 |
| SH probe grid | 256² × 6 | 64² × 6 | 96² × 6 |
| Terrain patch segments | 64 | 32 | 32 |
| Aggregate canopy grid | 512² | 128² | 128² |
| Cloud screen-pass linear scale | 0.5 | 0.25 | 0.35 |

These are **configured allocation/workload reductions**, not measured FPS/RAM gains.
For example, the low profile's candidate grass scan is 16× smaller and its shadow
map texel allocation is 64× smaller. Other render targets, duplicated buffers,
geometry, browser overhead and driver allocations still consume memory. This does
not enforce a 2 GB process-RAM limit or a 1.5M visible-triangle ceiling.

## Implemented / retained

1. **Frame pacing:** 30 FPS render/simulation cadence driven by browser rAF; no
   catch-up bursts after stalls. Uses elapsed time for movement, not frame counts.
2. **Adaptive resolution:** sustained frame-interval/CPU pressure reduces DPR in
   steps; 8-second cooldown and slower recovery avoid allocation oscillation.
   Pixel area stays bounded on high-DPR tablets and after resize. This is a
   pressure heuristic, **not thermal measurement or GPU frame-time attribution**.
3. **Background suspension:** stops the renderer animation loop on hidden/pagehide;
   resets timing and pressure history on resume. GPU loss/validation failure is
   surfaced rather than silently continuing to submit black frames.
4. **Forest LOD/instancing:** retains upstream GPU frustum + heightfield occlusion
   culling, compacted indirect draws, dithered LOD overlap, crown shadow proxies
   and octahedral impostors. Mobile never builds hero mesh-leaf pools; R1 reaches
   the camera so skipping R0 cannot leave a hole. Shorter detail bands keep the
   same forest composition at cheaper representations.
5. **Memory/overdraw:** smaller compact buffers and grass/debris candidate grids;
   fewer pooled particles; 4× fewer terrain patch quads; 16× fewer canopy quads.
   No new per-frame allocations were added to these GPU pools. Compact capacities
   bound draws; in very dense regions capacity clipping can reduce visible density.
6. **Lighting:** smaller cached CSM cascades and default filtering instead of PCSS
   on mobile. Shadow caster allocation uses the SAME cascade budget. Existing
   SH lighting is baked at boot into a smaller probe field, reused while lighting
   stays static, and refreshed incrementally on time-of-day invalidation.
7. **Bandwidth/effects:** retains forward scene color/depth and the existing merged
   post pass, lowers cloud noise/shadow resolution and ray steps. Mobile disables
   froxel fog, animated caustics, screen-space bounce, bloom and contact shadows;
   low also omits GTAO/TRAA. Balanced keeps GTAO and temporal AA. Sky and water stay.
   Fewer passes/targets do not imply zero memory bandwidth.
8. **CPU/boot:** yields between tree variants and skips unused hero generation;
   explicitly warms scene shaders under the loading overlay. Initial settled
   frames still compile post/compute variants. No claim of exhaustive persistent
   driver PSO caching. Mobile skips the unused pre-erosion debug buffer unless the
   split diagnostic is requested. P95 telemetry uses preallocated typed arrays
   with throttled in-place sorting rather than allocating/sorting every frame.
9. **Mobile input:** pointer-captured left movement/right look on the original
   FlyCamera, analog speed, Jump and Fly/walk buttons. Cancel, capture loss, blur
   and visibility changes clear movement. No React render on input/frame ticks.
10. **Portable cloud storage:** the original R16Float storage volumes failed
    WebGPU validation on the test adapter. They now use core, filterable
    RGBA16Float storage with unchanged R-channel sampling. This fix applies to
    desktop too. Per-texel bytes increase versus R16Float; mobile's reduced 3D
    noise dimensions offset that cost. No texture compression claim is made.
11. **Diagnostics:** `window.__laas.stats` retains frame time/P95, calls/triangles
    and CPU timing. `budget.*` counters expose selected profile, target FPS,
    shadow budgets and compact-buffer allocation. Detailed GPU/readback profiling
    is opt-in on mobile to avoid its default overhead.

## Not implemented / not applicable here

| Requested technique | Status and reason |
|---|---|
| Vulkan subpasses, transient/lazy GMEM attachments, vendor extensions | Not exposed directly by Three.js/browser WebGPU; requires native renderer work. |
| ARM NEON masked software occlusion | Not implemented. Existing GPU heightfield occlusion stays; no false SIMD claim. |
| Swappy/Choreographer integration | Native APIs, not callable from this browser renderer. rAF pacing is used instead. |
| Hardware thermal/energy/LMKD telemetry | Not available via portable browser APIs. Requires native plugins + device profiling. |
| Offline baked lightmap asset pipeline | Not added. Boot-baked SH field is reused instead. |
| ASTC/ETC2 offline texture compression / blanket f16 conversion | Not added. Textures are generated by the engine; compression and precision need separate artifact/feature validation. Existing packed/half-float resources are retained. |
| Worker-based world generation, streaming/eviction of map chunks | Not implemented. World generation/scatter remains at boot; near-ring culling is NOT claimed as asset streaming. |
| Full ECS/job system/physics rewrite, weapon/projectile pools | Not added; this is a procedural exploration world, not a combat simulation. |
| Character bone/animation LOD, networking/relevancy/100 players | No such character/multiplayer systems exist in the project. |
| Guaranteed <1500 draws, <1.5M triangles, <2 GB RAM, 30/60 FPS | Not established. Requires representative real-device measurement and further tuning. |

## Validation and next measurement gate

- Upstream engine strict TypeScript check and production build are run.
- Automated tests cover profile selection, pixel ceilings, 60/90/120 Hz pacing,
  cooldown/floor/recovery, P95, matching cascade budgets, effects and touch cleanup.
- Original source hashes remain in `threejs-world.upstream.json`; explicit local
  edits/additions (including standalone navigation/build changes) are recorded in `threejs-world.local.json`. Untouched files must
  still match upstream. Dependency versions and lockfile have not been changed.
- Real software-WebGPU cloud generation (atmosphere + noise + shadow bake)
  completed without GPU validation errors after the portable storage fix.
- Full-world headless validation remains **incomplete**: the default terrain run
  was expensive in software rendering; a reduced-terrain diagnostic run reached
  shader warm-up with no recorded validation errors but did not become playable
  within 180 seconds. Separate frame-loop attempts hit a headless Dawn
  `Instance dropped in popErrorScope` error in **both** desktop and mobile profiles.
  These tests do not establish full-world visual correctness, sustained FPS,
  memory usage, thermal behavior, or real-device compatibility.

Before calling this smooth on low-end phones: test actual Adreno/Mali Android and
an iPad for a cold boot, walking/turning through dense forest, water/gorge views,
15–30 minutes of sustained play, suspend/resume, rotate/resize, close/reopen and
GPU loss. Record startup time, P50/P95/P99 frame intervals, peak process memory,
rendered triangles/draws, quality changes and external thermal data. Compare the
same seed/camera with `quality=desktop` and each mobile profile. Further streaming,
shader precision/compression and GPU-specific tuning should follow those results.
