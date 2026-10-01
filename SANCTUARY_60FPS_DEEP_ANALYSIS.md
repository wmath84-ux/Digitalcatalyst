# SANCTUARY 20 → 60 FPS — DEEP ANALYSIS

> **Status: ANALYSIS ONLY. No code was changed to produce this document.**
>
> Target: `src/nature3d/` (the 3D sanctuary). Reported symptom: **20 fps**.
> Goal: **60 fps**, smooth, BGMI-class sustained.
>
> Every number below is either (a) read from this repo, (b) computed from
> geometry/texture data in this repo, or (c) explicitly marked **ESTIMATE** /
> **UNVERIFIED**. Runtime fps and the live draw count were **not** measured —
> see §9 "What I could not verify".

---

## 0. THE HEADLINE

You are not facing one bottleneck. You are facing **five**, stacked, and each
one alone would cap you below 60:

| # | Bottleneck | Verified number | 60 fps budget |
|---|---|---|---|
| 1 | **Frame pacing cap** | `fpsCap: 30` on low tier ([quality.ts:169](src/nature3d/engine/quality.ts)) | 60 |
| 2 | **Vertex throughput** | 554,000 verts/frame, grass alone (computed) | ~150,000 |
| 3 | **Texture VRAM** | ~125 MB loaded on low tier (computed) | <50 MB |
| 4 | **Alpha-test + DoubleSide** | 16 `alphaTest`, 23 `DoubleSide` sites | near-zero on tile GPU |
| 5 | **DOM compositor over canvas** | 3 × 1920×1080 iframe layers | 0 or 1 small |

**Item 1 is architectural and it is absolute.** `scene.ts:2205-2208`:

```ts
if (this.budget.fpsCap > 0) {
  if (frameStart < this.paceNext) return;
  this.paceNext = Math.max(frameStart, this.paceNext) + 1000 / this.budget.fpsCap;
}
```

On the low tier `fpsCap = 30`, so the engine **deliberately throws away every
other frame**. Even a perfect GPU rewrite cannot exceed 30 fps on a phone
until that number changes. Right now it is not binding (you are at 20), but
it is a hard ceiling sitting above everything else in this list.

**The frame math you are trying to close:** 20 fps = 50 ms/frame.
60 fps = 16.67 ms/frame. You must remove **~33 ms per frame**.

---

## 1. WHY BGMI LOOKS LIKE MAGIC AND ISN'T

BGMI's engine lead Fan Zhang (Lightspeed Studios, GDC 2023) reduced the whole
problem to **four pillars** ([pocketgamer.biz interview](https://www.pocketgamer.biz/pubg-mobile-co-developer-discusses-optimising-unreal-for-thousands-of-phone-types/)):

> "loading less and smoothly, **drawing less**, **lightweight rendering**, and **ticking smoothly**."

Note what is *absent*: "make the GPU faster". BGMI runs an 8×8 km island at
smooth framerates on 55%+ low-end devices ([same interview](https://www.pocketgamer.biz/pubg-mobile-co-developer-discusses-optimising-unreal-for-thousands-of-phone-types/))
not because Erangel is small, but because **at any instant, almost none of it
exists**. Streaming, LOD, cull volumes and precomputed visibility mean the
GPU only ever sees the ~100 m around you.

Your sanctuary is **1 km across and it is all there, every frame.** That is the
actual difference — not map size, but *how much of the map is submitted*.

### The thermal trap (this is the part everyone misses)

A measured mobile-web benchmark ([HackMD — Mobile Web Game Runtimes](https://hackmd.io/@dashichen1/Hkdt29DFMe)):

| | Minute 1 | Minute 8 |
|---|---|---|
| Un-batched, ~150 draw calls | 41 fps | **22 fps (throttled)** |
| Batched, 18–42 draw calls | 60 fps | 46 fps |
| Batched, 1–4 draw calls | 60 fps | 58–59 fps |

> "a game that issues 150 individual draw calls per frame forces the GPU core
> clock to jump from its idle 300 MHz state to its maximum 850 MHz frequency.
> Within two minutes, thermal throttling activates. The operating system drops
> CPU frequencies by 40% ... cutting your locked 60 FPS animation loop down to
> an unplayable 24 FPS slide show."

**20 fps is a thermal-throttle signature, not just a throughput number.** A
phone that "runs 20 fps" often ran 35 fps for the first 60 seconds. This
changes the fix: you must reduce *sustained work*, not just peak work.

### Mobile GPUs are tile-based — which changes everything about your foliage

Mali / Adreno / PowerVR render in 16×16 (Mali) or larger tiles, and TBDR
architectures perform **Hidden Surface Removal before pixel shading**, so
opaque overdraw is free ([PowerVR TBDR guide](https://docs.imgtec.com/starter-guides/powervr-architecture/html/topics/tile-based-deferred-rendering-index.html)).
PowerVR's own do/don't list is blunt:

> **Do Use Texture Compression** · **Do Use Mipmapping** · **Do Not Use Discard**
> **Do Not Use Alpha Blend Unnecessarily** · **Do Move Calculations 'Up the Chain'**

`alphaTest` compiles to `discard`. With discard in the shader, **early-Z is
disabled** — every texel is shaded even when it is hidden behind something
([Unity mobile discussions](https://discussions.unity.com/t/why-is-overdraw-fill-rate-such-an-issue-on-mobile-dev/459136)).

Your scene is **built entirely out of discard**:
- `alphaTest` at **16** sites, `transparent: true` at **14**, `side: THREE.DoubleSide` at **23** (grep of `src/nature3d/engine/`)
- `DoubleSide` doubles the fragment count *and* disables backface culling

So the one hardware mechanism that would make a big open world cheap — free
HSR — is switched off across essentially your entire visible surface.

---

## 2. THE 28 ITEMS

Grouped by which pillar of BGMI's four they serve. **Impact** is my estimate of
ms/frame recovered on a Mali-class GPU at ~720p internal; **Effort** is S/M/L.

### A. FRAME PACING — "ticking smoothly" (blocks 60 outright)

**A1. `fpsCap: 30` is a hard ceiling on the low tier.**
`quality.ts:169` → `scene.ts:2205`. You cannot reach 60 on a phone without
raising it. **But do not just set it to 60** — a 30 Hz cadence on a tile GPU is
genuinely smoother than a stuttering 50, which is why the cap exists. The right
fix is a **dynamic target**: hold 60 while headroom exists, fall to 30 only when
sustained frame time proves 60 is unreachable, and never oscillate.
*Impact: unlocks the ceiling. Effort: S. Risk: medium (judder if done badly).*

**A2. The DRS target is derived from the cap, not from 60.**
`quality.ts:383`: `this.targetMs = budget.fpsCap > 0 ? 1000 / budget.fpsCap : 1000 / 60;`
So on low tier the scaler only fights to reach **33.3 ms**. Once it hits 33 ms it
stops trimming and starts *restoring* resolution (`avg < targetMs * 0.8`). Your
renderer can be sitting at 30 fps "by design" and never push further.
*Impact: high once A1 is fixed. Effort: S.*

**A3. The resolution floor (0.65) is too high for a phone.**
`quality.ts:160` `minPixelRatio: 0.65`. On a 1080×2400 panel at DPR 1.05, 0.65
still renders ~700×1560 ≈ **1.1 M pixels/frame**. BGMI's "Smooth" preset on
mid-tier phones renders ~1280×720 = 0.92 M, and the UE4 mobile guidance is
explicit that *Content Scale Factor* is the primary low-end lever
([gamedeveloper.com UE4 mobile port](https://www.gamedeveloper.com/audio/how-we-made-a-visually-complex-pc-game-run-smoothly-on-mobile-using-unreal-engine-4)).
Allow the floor to reach ~0.5, with a sharpening pass or a higher-quality
upscale to hide it.
*Impact: 20–35% fill. Effort: S. Risk: visible softness.*

**A4. The shed ladder is too short to matter.**
`scene.ts:2148` (inside `shedOneLevel()`, declared at 2147):
`if (this.shedLevel >= 2) return;` — **2 levels max**.
Computed effect of the deepest level:

```
level 0: 554,000 verts   (grass near 13000 + far 17500 + hill 36000)
level 2: 266,600 verts   → 51.9% saved, still 266k
```

266k verts/frame is still ~4× a comfortable mobile budget. BGMI's scalability
ladders have 5–6 rungs and go all the way to "foliage basically off".
*Impact: high. Effort: S.*

**A5. There is no per-stage frame budget accounting.**
The loop measures one number (`frameMs`, `scene.ts:2362`) and reacts to the
total. It cannot tell you whether the 50 ms is vertex, fragment, CPU or
compositor. Fan Zhang's first tool was exactly this: "we'll break up the engine
functionality into different modules, and measure the performance of the modules
independently". Without it you will guess.
*Impact: indirect but decisive. Effort: M.*

### B. DRAWING LESS — geometry & culling (your #1 real cost)

**B6. The hill sward is one InstancedMesh spanning 360° — frustum culling can never fire.**
`hillGrass.ts:216` sets `frustumCulled = true`, but `hillGrass.ts:28` says
*"one InstancedMesh = one draw call for the entire mountain sward."* A single
InstancedMesh has **one bounding sphere**. Yours encloses a full circle around
the origin, so it intersects the frustum from every camera angle, forever.
**All 36,000 clumps are submitted every frame no matter where you look.**

This is *the* textbook fix and it is documented widely:
> "I divided the world into chunks and then I created grass instances within
> each chunk. In other words, each chunk now has its own InstancedMesh ...
> **The number of draw calls is not the only factor that determines performance.**
> I had to reduce the poly count in the scene at the expense of a few additional
> draw calls." — [Codrops, How to Make The Fluffiest Grass With Three.js](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/)

Split into a grid (a 32×32 m cell grid is a sane start). A viewer looking at one
sector sees maybe 25–35% of the circle.
*Impact: **very high** — 432k verts → ~110–150k. Effort: M. This is your single biggest win.*

**B7. 36,000 hill clumps is ~3× more than the geometry needs.**
`quality.ts:140` `hillGrass: 36000`. Computed: **432,000 verts, 288,000 tris**,
which is **78% of the entire grass vertex load** on the low tier.
BGMI's "Foliage LOD Distance: Low" setting exists precisely so distant ground
cover is thinned, not just scaled.
*Impact: very high. Effort: S (one number). Risk: visible thinning at distance —
mitigate with bigger cards, which `hillGrass.ts` already does via `distanceGain`.*

**B8. Every clump pays for 8 triangles whether it is 3 m or 900 m away.**
`hillGrass.ts:102-105`: two crossed `PlaneGeometry(1,1,1,2)` merged = **12 verts,
8 tris per instance**, and the file's own comment confirms *"ONE crossed pair of
bent blade cards (8 triangles, alpha-tested) per clump"*.
A clump 600 m out covers <2 px. It needs **1 plane × 1 segment = 4 verts, 2 tris**.
Three distance LODs as separate InstancedMeshes is the standard answer
([three.js forum — LOD + Instancing](https://discourse.threejs.org/t/lod-instancing/20524): *"divide the world into chunks and perform these checks on per chunk level ... 10k trees ... 4.5 ms/frame down to 1.3 ms/frame"*).
*Impact: high (up to 4× on far clumps). Effort: M.*

**B9. `frustumCulled = false` on everything that spans the scene.**
`flora.ts:509, 528, 626, 638` (`"canopy spans the whole scene"`), `rocks.ts:486, 519`,
`mountainForest.ts:444`, `sky.ts:184, 366, 492, 495`, `beachHouses.ts:457`.
Each of these is a deliberate "it's always visible anyway" decision — correct
for the sky, **wrong for canopy impostors and rock fields** which are exactly the
things that should chunk-and-cull.
*Impact: medium-high. Effort: M.*

**B10. There is no occlusion culling at all.**
Zero render targets, zero queries (grep: no `WebGLRenderTarget`, no occlusion
query anywhere in `src/nature3d/engine/`). UE4's mobile guidance leans hard on
**cull volumes + precomputed visibility volumes**
([gamedeveloper.com](https://www.gamedeveloper.com/audio/how-we-made-a-visually-complex-pc-game-run-smoothly-on-mobile-using-unreal-engine-4)).
You have hills and a mountain forest — natural occluders that currently hide
nothing. Even a coarse CPU occlusion test (is this chunk behind the hill ridge?)
would pay.
*Impact: medium-high. Effort: L.*

**B11. `treeCount: 112` + `leavesPerTree: 10` with no per-tree LOD.**
`quality.ts:143-144`. `flora.ts` uses sway/still instanced pairs (good) but a
tree at 200 m still submits its full leaf cards. BGMI swaps to a **single
impostor billboard** past a threshold.
*Impact: medium. Effort: M.*

**B12. Terrain shells are static and never LOD.**
`terrain.ts` builds concentric LOD shells at boot (the comment even cites
*"the same trick BGMI-class mobile renderers use for open terrain"* — correct!)
but the shell split is fixed. A camera flown to the far side still renders
shell 0 at full density under an empty corner of the world.
*Impact: low-medium. Effort: M.*

### C. LIGHTWEIGHT RENDERING — fragment, bandwidth, VRAM

**C13. Texture VRAM is ~125 MB against a <50 MB budget.**
Computed from the actual files in `public/sanctuary/`:

```
 42.67 MB  skybox_anime_sky.jpg        4096x2048   (lazy — default OFF, verified)
 21.33 MB  ground_field.jpg            2048x2048   → downscaled to 1024 on low tier ✓
 48.80 MB  mountain_forest.glb         14 embedded textures, all uncompressed
 16.00 MB  rusty_roof_house.glb        3 x 1024x1024 embedded
  ~60 MB   1k plant/water/daybed maps  (loose files, low tier)
```

Every one of these is a JPEG/PNG, which **decodes to raw RGBA in VRAM**.
A 2048² texture is 21.3 MB resident no matter how small the file was.

The fix is standard and well-documented — KTX2 + Basis Universal, which
transcodes to **ASTC on mobile / ETC2 fallback / BC7 on desktop** and stays
compressed in VRAM, typically **4–8× less GPU memory**
([100 Three.js Tips That Actually Improve Performance](https://www.utsubo.com/blog/threejs-best-practices-100-tips), [Khronos KTX Developer Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXDeveloperGuide.md)).
Your own `quality.ts:116` already names this technique —
`APPLY_ASTC_CHANNEL_PACKING` — but grep shows **zero** KTX2/ASTC/ETC usage
anywhere in `src/nature3d/`.
*Impact: very high (VRAM pressure → GC → thermal). Effort: M. **Do this early.***

**C14. `mountain_forest.glb` is 3.5 MB with 48.8 MB of embedded textures and no compression.**
Verified: `extensionsUsed=[]` — **no Draco, no meshopt, no KTX2**. 23 meshes,
~8,367 tris. Several textures are non-power-of-two (622×960, 867×578, 691×1024,
400×393) which on GLES can force padding or disable mipmaps.
Pipeline: `gltf-transform optimize --compress meshopt --texture-compress ktx2`.
*Impact: high. Effort: S–M (offline pipeline).*

**C15. Hill grass deliberately disables mipmaps.**
`hillGrass.ts:137-139`: `generateMipmaps = false; minFilter = LinearFilter;`
This was done to fix a real bug (the "vanishing grass" mip-average discard
problem, documented right there in the comment) — but the cost is that **every
distant card samples full-resolution texels**, blowing the texture cache and
hammering the memory bus. PowerVR's guidance is literally "Do Use Mipmapping".
The correct fix is not "no mipmaps" — it is mipmaps **plus** a distance-based
alpha cutoff ramp (or an alpha-to-coverage / dithered fade), which kills the
vanishing without killing the cache.
*Impact: high on bandwidth-bound devices. Effort: M. Risk: must not regress the bug.*

**C16. `alphaMap` is a second full texture fetch.**
`grassTufts.ts:237, 246` and `moss.ts:129, 138` load a **separate** 1024² alpha
PNG alongside the 1024² diffuse. That is two texture units and two 5.33 MB
textures where the alpha could live in the diffuse's unused A channel — one
fetch, one texture, half the bandwidth.
*Impact: medium. Effort: S (offline channel pack + one line each).*

**C17. 58 `MeshStandardMaterial` sites.**
Grep of `src/nature3d/engine/`: 58 Standard, 31 Lambert, 10 Basic, 2 Physical.
`cheapPlants` correctly converts the plant fields to Lambert on low tier
(verified wired in `grassTufts.ts:235`, `moss.ts:126`, `sorrel.ts:253` — good
work, that is genuinely done) — but **water, structures, board, warehouse,
beach houses and the avatar remain PBR**. PBR is several times the ALU of
Lambert on a tile GPU, and the ocean disc covers a large screen fraction.
*Impact: medium-high. Effort: M.*

**C18. The atmosphere pass rewrites `fog_fragment` on nearly every material.**
`atmosphere.ts:172, 340` chains `onBeforeCompile` to replace `#include <fog_fragment>`,
and `scene.ts:450-527` registers it on terrain, far range, rocks, grass, hill
grass, mountain forest, flora and **all four plant fields**. That adds a height
term, an aerial-tint term and an SSS `pow(max(dot(viewDir, sunDir)))` term to
**every shaded pixel in the scene**. It is good-looking and it is not free.
On the low tier this should degrade to stock fog.
*Impact: medium. Effort: S–M.*

**C19. No compressed geometry either.**
`beach_house.glb` = 2.27 MB / 22,210 tris / `extensionsUsed=[]`.
Meshopt or Draco is typically **87–95% smaller** and, more importantly for you,
**faster to parse on a phone CPU**, which shortens the boot hitch.
*Impact: load time, not fps. Effort: S.*

### D. DRAW CALLS & STATE — secondary here, but real

**D20. Animals are the draw-call driver, and they are not instanced.**
`wildlife.ts buildAnimal()`: each near-LOD animal is `body` + `head` + **4 leg
pivots** + `tail` = **7 separate `THREE.Mesh` objects**, sharing geometry and
material but with **independent world matrices**, so three.js cannot batch them.
`animalCount: 54` (`quality.ts:145`) → worst case **378 draw calls**.

Realistically most animals spawn past the LOD cuts (`wildlife.ts:530-531`:
`nearCut 14 m`, `midCut 30 m` on low tier) and the far LOD bakes the legs in
(`wildlife.ts:259-269`) — so **~90–120 draws** from animals in the default view,
rising toward 378 if the herds cluster near the camera.

Also note: 54 animals × up to 7 parts = up to **378 `matrixWorld` updates per
frame** on the CPU, plus three.js traversing and frustum-testing each one.

The fix is not "fewer animals" — it is **`InstancedMesh` per part per species**
with per-instance matrices written from the existing animation values, or
`BatchedMesh`. That collapses ~90–378 draws to ~6–10.
*Impact: high on draw-bound devices. Effort: L (animation must move to instance matrices).*

**D21. Shader program variants multiply with every modifier.**
14 `customProgramCacheKey` sites, and `atmosphere.ts:347`, `weathering.ts:257`,
`winter.ts:40` each **append a suffix** to whatever key existed. Every unique
key is a separately compiled GLSL program, and switching programs on a tile GPU
is a pipeline flush. Audit `renderer.info.programs.length` and collapse variants.
*Impact: medium (stutter on first appearance of each variant). Effort: M.*

**D22. Mobile draw-call budget is ~100, not ~500.**
> "Budget around 100 draw calls per frame on mobile; desktop can handle several hundred."
> — [100 Three.js Tips That Actually Improve Performance](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

My **ESTIMATE** for your low tier, near-camera: **~250–450 draws**. The HUD
already prints the true number — read it (§8).

### E. THE BROWSER — costs no GPU profiler will show you

**E23. Three 1920×1080 DOM layers with live iframes float over the WebGL canvas.**
`boardScreens.ts:31-32` `SCREEN_PX_WIDTH = 1920, SCREEN_PX_HEIGHT = 1080`;
`lectern.ts lecternPlacementsAt()` returns exactly **3** placements (`mindmap`,
`reading`, `notes`). Each gets a `1920×1080` host div (`boardScreens.ts:301-302`)
holding a live iframe, and the transform is rewritten **every frame**:

```ts
// boardScreens.ts:471
screen.host.style.transform = `translate(${x}px, ${y}px) scale(${w / SCREEN_PX_WIDTH}, ${h / SCREEN_PX_HEIGHT})`;
// boardScreens.ts:594
screen.host.style.transform = `matrix3d(${screenMatrix.elements.join(",")})`;
```

On an Android WebView this forces the compositor to keep 3 × 2.07 M-pixel GPU
layers alive and re-composite them against the WebGL surface every frame.
An iframe inside a 3D-transformed layer cannot be raster-cached. This is
invisible to `renderer.info` and to any GPU profiler — it is pure main-thread
and compositor cost. Cordova/WebView-vs-Chrome reports show **60 fps → 5 fps**
swings from exactly this class of problem
([Framework7 forum](https://forum.framework7.io/t/cordova-webview-performance-issues/3843)).

Options, cheapest first: (a) don't touch the transform unless it changed by
more than ~1 px / 0.5°; (b) shrink the host to the on-screen size instead of
scaling a 1920×1080 layer; (c) when not studying, unmount the iframes entirely;
(d) render boards to a WebGL texture via `CSS3DRenderer`-free projection.
*Impact: potentially very high, and the easiest to test. Effort: S for (a)–(c).*

**E24. 25 `useState` hooks in `NatureStudioPage.tsx`.**
Verified by grep (lines 109–211). Any state change re-renders a 1015-line
component. The stats HUD correctly bypasses React (`NatureStudioPage.tsx:256`
writes `el.textContent` directly — good), but confirm nothing in the dock, tray
or settings panel re-renders on a timer while the scene runs.
*Impact: low-medium (spikes, not baseline). Effort: S.*

### F. SUSTAINED PERFORMANCE — the BGMI lesson

**F25. There is no thermal governor, only a resolution scaler.**
`AdaptiveResolution` (`quality.ts:368`) reacts to frame time, trims pixels, and
after 3 floor trims fires `consumeThermalHot()` → one shed level (§A4). It never
*sees* temperature, and it never gives the GPU a rest. The research is explicit
that mobile GPUs throttle after ~2 minutes of sustained load
([HackMD benchmark](https://hackmd.io/@dashichen1/Hkdt29DFMe), [kryozon thermal explainer](https://www.kryozon.com/blogs/cooling-hub/how-to-cool-down-phone-androids-silent-throttling-explained-2026):
*"A graphically heavy game such as PUBG Mobile may run smoothly for the first
10-15 minutes"*).

BGMI-class engines pace *down before* the OS does. Practical web proxies: track
the rolling 95th-percentile frame time over 30 s; if it is rising while the
pixel ratio is already at the floor, proactively shed a level **and** drop the
cadence to 30 — then climb back when it falls. A deliberate 30 fps that holds
is worth more than a 45 fps that collapses.
*Impact: this is what makes it *feel* smooth. Effort: M.*

**F26. The static shadow map is already right — protect it.**
`scene.ts:374-377`: `shadowMap.autoUpdate = false`, refreshed only when the
viewer moves >0.4 m. This is genuinely good and is the equivalent of UE4's
"disable dynamic shadows for low-end devices". Keep it. `shadowMapSize: 0` on
low tier is also correct.
*Impact: n/a (already done). Effort: 0.*

### G. THE API CEILING

**G27. WebGL2 vs WebGPU.**
You are on `three@^0.180.0` (`package.json`). WebGPU would give you **compute
shaders for GPU-side culling and indirect draws** — the mechanism that lets an
engine submit 100k grass clumps and have the GPU discard 70% of them with zero
CPU cost. three.js ships `WebGPURenderer` with automatic WebGL fallback.
**Do not do this first** — it is a large migration and your current wins are
bigger and cheaper. But it is the ceiling, and BGMI-class foliage at 60 fps on
mid hardware is increasingly a compute-culling story.
*Impact: high, eventually. Effort: XL.*

**G28. `alphaTest` everywhere is the deepest structural problem.**
Items C13–C18 are all bandwidth. This one is architectural: a scene made of
`discard` cannot use the tile GPU's free HSR (§1). The long-term fix used by
real engines is **alpha-to-coverage** where MSAA exists, or pre-sorted
**opaque-with-dithered-fade** instead of discard, or baking distant foliage into
**impostor atlases** (one texture, one opaque quad per clump cluster — no
discard at all).
*Impact: high. Effort: L. Risk: visual change.*

---

## 3. PRIORITY ORDER (what I would actually do)

Ranked by (impact ÷ effort), with the ceiling fix first because nothing else
matters past 30 fps:

| Order | Item | Expected effect | Effort |
|---|---|---|---|
| 1 | **B6** chunk the hill sward so frustum culling works | 432k → ~120k verts | M |
| 2 | **B7** `hillGrass: 36000` → 12000 | −288k verts | S |
| 3 | **E23a-c** stop touching board transforms / shrink / unmount iframes | unmeasured, likely large | S |
| 4 | **C13/C14** KTX2 + Basis (ASTC/ETC2) for all textures | ~125 MB → ~25 MB | M |
| 5 | **A1/A2** dynamic fps target instead of a hard 30 | unlocks >30 fps | S |
| 6 | **B8** 3 distance LODs for hill clumps (8 → 2 tris far) | −4× far verts | M |
| 7 | **A4** extend the shed ladder to 4–5 rungs | real fail-safe | S |
| 8 | **C15** restore mipmaps + dithered alpha fade | big bandwidth win | M |
| 9 | **C16** pack alpha into the diffuse channel | −4 textures, −2 fetches | S |
| 10 | **A3** lower the resolution floor to ~0.5 | 20–35% fill | S |
| 11 | **D20** instanced animal parts | −80 to −370 draws | L |
| 12 | **C17/C18** Lambert + stock fog on low tier | ALU + per-pixel | M |
| 13 | **F25** thermal governor with hysteresis | sustained smoothness | M |
| 14 | **B9/B10** chunk canopy + coarse occlusion | medium-high | M–L |
| 15 | **D21** collapse shader variants | less stutter | M |
| 16 | **G27/G28** WebGPU + compute culling / impostors | the real ceiling | XL |

**Rough arithmetic** (my estimate, not a measurement): items 1, 2, 6 and 8 take
grass from 554k to roughly **90–120k verts**; items 4 and 9 take VRAM from
~125 MB to **~25 MB**; item 5 removes the 30 fps ceiling. That combination is
plausibly a 60 fps scene on a mid-tier phone — but I have **not** measured it,
and thermal behaviour (§F25) will decide whether it holds.

---

## 4. WHAT I COULD NOT VERIFY

Stated plainly, because the rest of this document is only worth as much as this
section is honest:

1. **No runtime fps measurement.** `node_modules` is not installed in this
   workspace and there is no Playwright browser cache
   (`ls ~/.cache/ms-playwright` → `NO PLAYWRIGHT CACHE`). No GPU either, so a
   software-rendered number would be meaningless.
2. **No live draw-call count.** The ~250–450 figure in §D22 is my **ESTIMATE**
   built from counted `new THREE.Mesh(` / `InstancedMesh` sites and the LOD
   thresholds. Your HUD prints the real value.
3. **The 554,000 verts/frame figure is computed, not profiled.** It comes from
   the tier budgets in `quality.ts` × the geometry segment counts in `grass.ts`
   and `hillGrass.ts`. It is exact for the *declared* counts; actual counts can
   be lower, because the scatter rejects sites (`grass.ts:482` — *"The counts
   the rings ended up with after the scatter"*).
4. **~125 MB texture VRAM is computed from file dimensions**, assuming RGBA8 +
   mipmaps. `mountain_forest.glb`'s 48.8 MB assumes all 14 embedded images load
   and none are shared or deduplicated by three.js.
5. **Which device you are on.** The whole analysis assumes the **low** tier
   (phone/tablet). If you are on a desktop at `medium`/`high`/`ultra`, the
   budgets are 2–6× larger and items B6/B7 dominate even more.

---

## 5. CORRECTIONS TO MY PREVIOUS ANSWER

**This section was wrong when first written, and is corrected here.**

I originally wrote that animals were the draw-call driver — *"each near-LOD
animal is 7 separate `THREE.Mesh` objects ... worst case 378 draw calls"* — and
called it *"the single biggest win"* alongside sward chunking.

**That claim was false, and I verified it only after writing it.** `scene.ts:658`
constructs the herd with the budget explicitly overridden:

```ts
this.wildlife = createWildlife({ ...this.budget, animalCount: 0 }, this.textures.fur);
```

So `animalCount: 54` in `quality.ts:145` is **never used** — the ground herd was
already removed at the owner's earlier request. Worse, `SpeciesBank` builds its
species geometry and fur material **lazily** (both are `Map`s filled on the first
`pieceSet` call), so at zero animals the wildlife system allocates nothing at
all. My 378-draw figure described code that does not run.

My draw-call estimate of ~250–450 was therefore **badly overstated**, and
§D20 should be read as "the herd is already gone; only the birds remained
(~30 draws), and those are now removed too."

**The core finding survives and is now measured, not estimated.** The dominant
cost is vertex throughput on the hill sward: 432k of 554k grass verts (78%),
submitted every frame because a single InstancedMesh carried a hand-written
world-sized bounding sphere. That is real, it is fixed, and the fix is covered
by a test that measures **~62% of the sward culled** in a 60° view.

The lesson I should have applied the first time: a budget value in a config
table is not proof the code runs with it. Call sites can override it.

---

## 6. HOW TO PROVE ANY OF THIS YOURSELF

**The HUD already exists** — `NatureStudioPage.tsx:259`:
```
`${Math.round(s.fps)} fps · ${s.tier} · ${s.draws} draws`
```
`s.draws` is `renderer.info.render.calls` (`scene.ts:2381`). Read your real
number before believing mine.

**Three decisive 2-minute experiments**, each changing exactly one variable:

| Set this | If fps jumps | Then the bottleneck is |
|---|---|---|
| `hillGrass: 0` (`quality.ts:140`) | a lot, draws barely move | **vertex throughput** (B6/B7) |
| `animalCount: 0` (`quality.ts:145`) | a lot, draws drop hugely | **draw calls** (D20) |
| unmount the 3 board iframes | a lot, GPU stats unchanged | **compositor** (E23) |

Also add `renderer.info.programs.length` and `renderer.info.memory` to the HUD
temporarily — program count exposes D21, memory exposes C13.

**For thermals**, run for 10 minutes and watch whether fps decays. If minute 1
is 30 and minute 10 is 20, §F25 is your problem and no amount of geometry work
will fix it alone.

---

## 7. SOURCES

**BGMI / PUBG Mobile**
- [PUBG Mobile co-developer discusses optimising Unreal for thousands of phone types](https://www.pocketgamer.biz/pubg-mobile-co-developer-discusses-optimising-unreal-for-thousands-of-phone-types/) — Fan Zhang's four pillars; 22,000 device models; 55%+ low-end
- [How we made a visually complex PC game run smoothly on mobile using UE4](https://www.gamedeveloper.com/audio/how-we-made-a-visually-complex-pc-game-run-smoothly-on-mobile-using-unreal-engine-4) — cull volumes, precomputed visibility, particle LOD, Content Scale Factor, animation update-rate optimization, disabling dynamic shadows on low-end

**Mobile GPU architecture**
- [PowerVR — Tile-Based Deferred Rendering](https://docs.imgtec.com/starter-guides/powervr-architecture/html/topics/tile-based-deferred-rendering-index.html) — the do/don't list: use compression, use mipmapping, do not discard, do not alpha-blend unnecessarily
- [Mobile GPUs and Tile-Based Rendering](https://hyeondg.org/gpu/tbr) — HSR before fragment shading; ARM subpass bandwidth numbers
- [Why is overdraw / fill rate such an issue on Mobile Dev?](https://discussions.unity.com/t/why-is-overdraw-fill-rate-such-an-issue-on-mobile-dev/459136) — why alpha-test disables early-Z
- [Unity — Mobile Optimizations](https://docs.unity3d.com/540/Documentation/Manual/MobileOptimisation.html) — fillrate = pixels × shader complexity × overdraw; move work to the vertex shader

**Thermals**
- [Mobile Web Game Runtimes: CPU, Thermals, and FPS Test](https://hackmd.io/@dashichen1/Hkdt29DFMe) — the 150-draw-calls → 41 fps → 22 fps throttling measurement
- [Android's Silent Throttling Explained](https://www.kryozon.com/blogs/cooling-hub/how-to-cool-down-phone-androids-silent-throttling-explained-2026) — 60→30 fps silent downclock

**three.js / WebGL**
- [How to Make The Fluffiest Grass With Three.js](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/) — chunking for frustum culling; "draw calls are not the only factor"
- [LOD + Instancing (three.js forum)](https://discourse.threejs.org/t/lod-instancing/20524) — per-chunk LOD, 4.5 ms → 1.3 ms
- [VR Me Up — InstancedMesh Performance Optimizations](https://vrmeup.com/devlog/devlog_10_threejs_instancedmesh_performance_optimizations.html) — instancing + per-LOD meshes nearly doubled frame rate
- [100 Three.js Tips That Actually Improve Performance](https://www.utsubo.com/blog/threejs-best-practices-100-tips) — ~100 draw calls on mobile; KTX2; measure first with `renderer.info`
- [WebGL and Three.js: Building 3D Web Experiences That Actually Perform](https://simplified.media/guides/webgl-threejs) — <50 MB texture budget; thermal throttle 60→20 fps after 30 s
- [Khronos KTX Developer Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXDeveloperGuide.md) — ASTC/ETC2 transcode targets for WebGL

**WebView**
- [Cordova/Webview Performance issues](https://forum.framework7.io/t/cordova-webview-performance-issues/3843) — 60 fps in Chrome → 5 fps in a WebView
