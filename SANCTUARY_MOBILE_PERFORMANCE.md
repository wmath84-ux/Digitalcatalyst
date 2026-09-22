# Sanctuary — Mid/Low-Tier Android Performance Pass

Yeh document owner ki research ke 11 agent-commands ko batata hai ki unka
web/three.js equivalent **kya implement hua, kahan, aur kyon**. Board / study
ka core game logic kahin touch nahi hua — saari changes rendering pipeline,
memory aur fail-safe side par hain.

Sab kuch `src/nature3d/engine/quality.ts` ke **budget flags** se control hota
hai — ek hi jagah tuning ka contract:

| Flag | Tier | Matlab |
|---|---|---|
| `halfPrecision` | low | Bhaari fragment shaders fp16 (mediump) par |
| `fpsCap` | low = 30 | Fixed cadence pacing (Swappy-style) |
| `cheapPlants` | low | Plant fields: PBR → Lambert, sirf diffuse+alpha maps |
| `plantTextureDetail` | low = 1k | glTF plant textures ka 1 K diet |
| `maxAniso` | low = 1 | Anisotropy bandwidth cap |

Desktop tiers (medium/high/ultra) pehle jaisa hi render karte hain.

---

## 1. Rendering Pipeline & GPU

### `ENABLE_VULKAN_SUBPASSES` → N/A (native API), goal already satisfied
WebGL subpasses / transient GMEM attachments expose nahi karta. Lekin us
command ka **goal** — intermediate buffers ko DRAM se door rakhna — scene mein
already satisfied hai: rendering **single-pass forward** hai, koi G-buffer /
post-processing render-target chain hi nahi hai (atmosphere + weathering pure
shader injections hain, koi extra pass nahi). Bandwidth ka asli bach WebGL mein
pixel ratio (DRS), fp16 fragments aur chhote textures se milta hai — teeno
implement hain.

### `FORCE_MEDIUMP_SHADER_PRECISION` → **implemented** (`quality.ts#halfPrecisionMaterial`)
Sabse bhaari fill-rate materials (grass, sorrel, tufts, moss, flora, water,
sky, terrain, rocks, structures) ke **fragment shader** mein
`precision mediump float;` re-declare kiya gaya hai — `onBeforeCompile` ko
CHAIN karke (wind/atmosphere/winter hooks kabhi overwrite nahi hote).
- Mali/Adreno tile GPUs par fp16 = **~2× ALU throughput**, half register pressure.
- **Vertex stage highp hi rehta hai** — duniya ±1.7 km hai; fp16 vertex positions
  se door ki geometry visibly jitter karti. Fill-rate fragment side mein hai,
  wahi half rate gaya.

## 2. Memory & Texture Management

### `APPLY_ASTC_CHANNEL_PACKING` → web diet equivalent (native ASTC/KTX2 pipeline unavailable)
Offline-first repo hai, runtime KTX2/Basis transcoder pipeline available nahi —
isliye iska **bandwidth goal** teen tareekon se achieve hua:
1. **Low tier par normal/ARM/AO maps gayab** (sorrel/tufts/moss Lambert diet):
   3 texture units aur ~17 MB texture traffic per boot frame-set free.
2. **Grass tuft diffuse 2 K → 1 K** (`grass_medium_02_diff_1k.jpg`, 457 KB →
   59 KB): texels ¼, displayed resolution low tier ke 0.85× scale par
   waise bhi unreachable thi.
3. **Anisotropy cap 8 → 1** (low) / 4 (medium): aniso bilinear se zyada
   samples = seedha bandwidth multiplier.
   Normal-map channel packing (XY + Z reconstruct) tabhi meaningful hai jab
   normal maps load ho rahi hon — low tier unhe skip hi kar deta hai (best-
   case packing: zero fetch).

### `ENFORCE_STRICT_OBJECT_POOLING` → **verified/already satisfied, preserved**
Frame loop aur sabhi subsystem updates (grass/sorrel/tufts/moss wind uniforms,
water particle pass, birds, winter dust, avatar IK) **pehle se allocation-free**
hain — sab scratch vectors/typed arrays hoisted hain. Ise preserve kiya gaya
hai, aur thermal fail-safe bhi isi rule par chalta hai: shed sirf
`InstancedMesh.count` trim + `visible` flips karta hai — zero realloc, zero
GC pressure, isliye fail-safe khud stutter nahi paida karta.

## 3. Culling, Visibility & LOD

### `INIT_SOFTWARE_OCCLUSION_CULLING` → CPU visibility pruning without GPU readback
GPU occlusion queries ka latency readback WebGL mein practical nahi; uski
jagah CPU-side hiding, bina GPU se baat kiye:
- Per-mesh **frustum culling** already on everywhere.
- **Study-mode culling** already: single board framed → ambient world ¼ rate,
  AI 12 Hz, sky 8 Hz (frame budget DOM/video ko milta hai).
- **Shed ladder** (thermal trigger) distance rings ko runtime par hide/trim
  karta hai — far foliage rings band = effective far-visibility cutoff, bina
  kisi object churn ke.

### `UPDATE_RATE_OPTIMIZATION_LOD` → implemented (staggered + wind LOD)
- AI ticks 30 Hz (study mein 12 Hz), sky 20 Hz (8 Hz), ambient quarter-rate in
  study mode — distance/rate degradation already engine ka design hai.
- **Grass/sorrel/tuft/moss wind vertex shader mein distance cutoff**:
  40–95 m ke baad sway amplitude zero — sub-pixel motion ke liye vertex work
  nahi (grass.ts, sorrel.ts, grassTufts.ts, moss.ts).
- Wildlife herd budget already 0; birds 8–12 max.

### `BATCH_HISM_FOLIAGE` → already the architecture
Poora foliage already InstancedMesh batches hai: grass = 2 draw calls, sorrel
= 2, tufts = 5, moss = 12, saare trees ki leaves = 1. Is pass ne koi naya
per-object draw call add nahi kiya.

## 4. Lighting & Shadows

### `BAKE_STATIC_LIGHTING_SH` → implemented (budget equivalents)
- Runtime GI kabhi tha hi nahi; terrain par **baked vertex AO/path-wear** aur
  foliage ka ground-inherited tint "baked" lighting ka kaam karta hai.
- **Plant-diet tier par atmosphere ka per-fragment sun-transmission chain
  (pow + multiple dots × lakhon grass pixels) OFF** — foliage solid ki tarah
  register hota hai (haze rehta hai, glow nahi). Ye low tier ka sabse mehenga
  shader feature tha.

### `LIMIT_SHADOW_CASCADES` → implemented
- Ek hi static sun map (cascade 1) — `autoUpdate:false`, sirf camera 0.4 m
  chale ya din badle tab refresh; frustum viewer ke 70 m par parked.
- **Foliage shadow pass se poori tarah bahar** (`castShadow=false`: grass,
  sorrel, tufts, moss) — alpha-tested leaves ka 2× overdraw shadow pass mein
  pure cost tha; ground ka baked AO gradient shadow bechta hai.
- Low tier: shadows 0 (pehle se).

## 5. Thermal & Frame Pacing

### `ACTIVATE_THERMAL_DRS_PACING` → implemented, 3 layers (`quality.ts` + `scene.ts`)
1. **Pacing (Swappy-style):** low tier par 30 fps cap — jaldi aane wale rAF
   skip hote hain, Clock ka dt accumulate hota hai, sim true-speed rehta hai.
   Jagged 38–50 fps ki jagah seedha 30 Hz cadence; thermal load ~½.
2. **DRS wall-clock se:** scaler ab tick ke CPU time par nahi, **rendered
   frames ke beech ke interval** par chalta hai — GPU-bound phone par CPU
   4 ms shaant rehta hai jabki GPU doob raha hota hai; vsync back-pressure
   sirf isi interval mein dikhta hai. Thresholds tier ke frame budget se
   derive hote hain (30 fps tier: 30 hold nahi ho raha to trim; hard chop
   −15 % at ~60 % overrun).
3. **Thermal collapse fail-safe = shed ladder:** floor par 3 consecutive
   trims ke baad resolution aur soften nahi hoti — **content shed** hota hai:
   - Rung 1: sorrel far ring + tuft far ring hidden, far grass 60 %
   - Rung 2: moss bank hidden, tufts near 50 %, sorrel near 60 %, far grass
     40 %, near grass 85 %
   Sab allocation-free (`count` trims + `visible`), console mein loud log
   (`[sanctuary] thermal fail-safe…`) taaki QA "sparse meadow" ko bug na
   samjhe. Async-loading fields par pending shed level apply hota hai.

## Tier detection (bonus fix)
`detectTier` ka blanket mobile penalty **har phone ko low par pin** karta tha
(iPhone 15 Pro bhi!). Ab flagship silicon (Adreno 640+, Mali-G77+, Apple
A14+, Tensor G3+, Dimensity 8/9xxx) medium pa sakta hai — sasti low tier ka
matlab sirf genuinely low-end parts. Low tier ka content budget bhi neeche
aaya hai (trees 130→105, grass 36k→26k, rocks 120→95), kyunki wahi tier har
mid/low Android ko milta hai.

---

---

## Pass 2 — the next six research techniques

### 1. Physics & Collision Micromanagement → already compliant + one new cull
- **Mesh colliders: banned by architecture.** The sanctuary has no physics
  engine at all — locomotion collides against the analytical height field
  (`terrainHeight` — one formula, zero meshes), so the "primitives only"
  rule is satisfied by construction. No rigid bodies exist → nothing to
  put to sleep.
- **Resting-state:** engine updates are already gated on visibility
  (IntersectionObserver + document.hidden → the whole loop parks at 0 %
  CPU when the panel is off-screen), and AI/ambient/sky tick at staggered
  fixed rates instead of every frame.
- **Debris/particles:** the waterfall spray is ballistic with a FIXED
  impact plane (no collision queries — the "raycast replaced" ideal), and
  now gets **distance interest management**: past 90 m the spray stops
  integrating AND hides (one squared-distance test per ambient tick;
  buffers stay allocated — zero churn). See `water.ts`.

### 2. Audio Pipeline Optimization → N/A by design
The sanctuary scene ships **zero audio** — no AudioContext, no <audio>,
no decoders. There is nothing to decompress, voice-limit or distance-cull.
(If ambience is ever added: keep a strict voice cap of 8, decompress once
into AudioBuffers at boot, and cull by the same 90 m interest radius the
spray uses.)

### 3. UI Overdraw & Alpha Blending → implemented (HUD diet)
- **Hidden ≠ opacity-0, everywhere:** boot veil, kebab dropdown, lesson
  modal and every tray are CONDITIONALLY RENDERED (`{x ? … : null}`)
  — React unmounts them, so the compositor never sees them. Verified: no
  `opacity-0`-only hiding in the page.
- **Boards:** the engine frustum-culls each board (`screen.object.visible`),
  and a framed board's siblings stop painting.
- **Backdrop blur diet (new):** `backdrop-filter: blur()` is a fullscreen
  sample+blur per chrome element per frame — the costliest CSS effect on a
  tile GPU. On the low tier the root gets `.sanctuary-lite` and every
  `backdrop-blur-*` is dropped to 2 px (Tailwind v4 variable override, other
  filter terms preserved). Heavy glow shadows flatten too. See `winter.css`.
- Texture-atlas batching: the HUD is a handful of DOM chips; the true
  "atlas" is the existing procedural-texture set (single painted canvases),
  and the CSS3D boards are one compositor layer each — nothing further to
  batch.

### 4. Network Culling / Interest Management → mapped to client interest
Single-player scene: no replicated entities, no server packets — classic
Interest Management has no network leg here. Its **client-side cousin** is
fully implemented:
- Boards frustum-culled (above); world/AI/ambient/sky tick rates degrade in
  study mode (Network-LOD-style rate scaling).
- glTF + texture assets are same-origin static files loaded once at boot;
  the diet tier simply fetches fewer/smaller ones (1 K diffuse Lambert set).
- Waterfall particles distance-culled (Pass 2, above).

### 5. Zero-Allocation Scripting / GC → audited + tightened
- Per-frame update loops were already allocation-free (verified by source
  audit: no `new`, no `.clone()`, no array pushes in any `update/tick`).
- **Stats payload hoisted (new):** the twice-a-second `onStats({…})` literal
  is gone — one reused object mutated in place (`scene.ts#statsObj`).
- DRS/shadow/scene-loop scratch vectors were already hoisted; the thermal
  shed ladder trims instance counts in place — no re-scatter, ever.
- Event listeners/constants in the bridge path allocate only per gesture
  (user-driven, far below GC relevance), which is within the rule.

### 6. Texture Mipmap Bias & Streaming → implemented
- **Mipmap bias:** WebGL can't select a base mip from JS, so the honest
  equivalent runs at boot on the low tier — `halveTextureSet()` repaints
  every procedural canvas at half size (512²→256² etc.): **¼ the VRAM and
  ¼ the live texture bandwidth**, detail the 0.85× render scale never shows.
- **Streaming/eviction:** single-scene app — textures live for the session
  and are disposed on unmount (`dispose()` walks every set + material). The
  "behind-view eviction" equivalent is the shed ladder + frustum culling:
  what is not visible is not drawn, and what the device can't afford was
  never uploaded (diet tier skips 2 K normal/ARM fetches entirely).



```bash
pnpm install --frozen-lockfile   # ✅ pass
node_modules/.bin/tsc --noEmit   # ✅ zero errors
pnpm build                       # ✅ built (NatureStudioPage chunk ~816 kB)
```

## Device-par expected effect (low tier, Mali/Adreno mid-low)

| Metric (meadow, orbit view) | Pehle | Ab |
|---|---|---|
| Sorrel triangles | ~530 k (160 × 3 319) | ~180 k (54 rings) + shed ⇒ 0 far |
| Tuft triangles | ~285 k | ~95 k + shed ladder |
| Plant texture boot traffic | ~18.5 MB (2 K×3 + 1 K×…) | ~0.6 MB (1 K diff + alpha) |
| Plant fragment lighting | PBR + transmission | Lambert, transmission off |
| Fragment ALU width | fp32 (highp) | fp16 (mediump) — ~2× rate |
| Pixel budget | 1.0× DPR | 0.85× start, DRS ⇒ 0.5× floor |
| Cadence | uncapped (jagged under load) | 30 Hz paced + wall-clock DRS + shed |
| Shadow pass foliage | casters on | foliage casters off (all tiers) |
