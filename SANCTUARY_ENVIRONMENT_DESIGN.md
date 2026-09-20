# Sanctuary Environment Design — research ka poora analysis + jo code me utra

> Ye document uska jawab hai: "har EK point ko analyse karo… apne sanctuary world me use karke design ekadam tagada karo."
> Har research point ke saamne teen cheezein hain: **(1)** research kya kehta hai, **(2)** sanctuary me uska faisla kya hua,
> **(3)** wo kis file/function me baitha hai — aur usko verify kaun karta hai.
>
> Target: `src/nature3d` ka existing 3D Study Sanctuary. Naya project nahi — usi engine ko upar uthaya gaya hai.

---

## 0. Ek line me: kya hua

Pehle environment "scatter + colour" tha — ped, ghaas, patthar, paani sab alag-alag passes the jo apni marzi se
cheezein rakhte the. Ab ek **environmental field** hai (`environment.ts`) jo batata hai ki zameen kis jagah
kaisi hai — slope, aspect, drainage, worn path, altitude, crowding, soil — aur **baaki har module uski baat
maanta hai**: terrain ka colour, ghaas ka scatter, rock kit, ped ka growth model, aur paani ki roshni.

Iske saath teen aur cheezein aayi jinke bina ye logic adhoora rehta:

| Naya module | Kya karta hai | Lines |
|---|---|---|
| `environment.ts` | "digital ecologist" — site field + flow accumulation + worn paths + `groundColorAt` | 539 |
| `palette.ts` | art direction enforcer — albedo 30…240, texel density, material response, biome/atmosphere keys | 242 |
| `atmosphere.ts` | height fog + aerial perspective + foliage transmission (fake SSS) | 365 |
| `weathering.ts` | curvature-driven edge wear, cavity dirt, water streaks, world-aligned moss, wetness | 419 |
| `rocks.ts` | rock KIT — 4 sculpted masters, 2 LODs, cluster placement, contact decals, skirt export | 417 |

Modified: `terrain.ts` (+113), `flora.ts` (+267), `grass.ts` (+170), `textures.ts` (+146), `water.ts` (+139),
`scene.ts` (+63). **~2 000 nayi lines, 1 000 se zyada edited lines.**

---

## 1. Verification — ye claim nahi, measurement hai

Ye teen gate **isi working tree par** chalaye gaye hain:

| Gate | Command | Result |
|---|---|---|
| TypeScript strict | `npx tsc --noEmit -p tsconfig.json` | **CLEAN** (no output) |
| Contract suite (source-shape) | `node --test tests/nature3dSanctuaryContract.test.mjs` | **84 / 84 pass, 0 fail** |
| Shader harness (real GLSL resolution) | `bash scripts/verify-nature3d.sh` → `scripts/verify-nature3d-shaders.mts` | **66 / 66 checks pass** (58 + 8 naye §8 regression checks) |
| World harness (runtime objects) | `bash scripts/verify-nature3d.sh` → `scripts/verify-nature3d-world.mts` | **ALL WORLD CHECKS PASSED** |
| Production build | `npm run build` | **built in 21.9 s**, `dist/index.html` me `oklch(` count = **0** |
| Poora repo suite | `bash run_tests.sh` | **2 569 pass / 31 fail** — aur wo 31 **is kaam se related nahi hain** (sab My Day / revision / liquid-glass / store ke UI contract suites me hain, jin files ko is change ne chhua hi nahi; **nature3d ke 84 tests 84/84 pass**) |

Browser Playwright is sandbox me download nahi hota, isliye "browser me kaisa dikhta hai" ki jagah hum **wahi
GLSL** resolve karke check karte hain jo browser compile karta, aur **wahi objects** banate hain jo runtime banata hai.
Shader harness three ke asli `ShaderLib` se `#include <chunk>` graph resolve karta hai — usi tarah jaise
`WebGLProgram` karta hai — phir anchors, varyings, duplicate declarations aur feature-presence assert karta hai.

> Isi harness ne ek **live bug** pakda: waterfall shader `uniform sampler2D map;` dobara declare kar raha tha,
> jo three ke `<map_pars_fragment>` ke saath **GLSL redefinition error** hai. Browser me waterfall toota hota.
> Fix + us bug ke liye ek permanent check, dono isi change me hain (`harness self-test` bhi hai, taaki check
> khud prove kare ki wo fire kar sakta hai).

---

## 2. Before → after (verified numbers)

| Cheez | Pehle | Ab |
|---|---|---|
| Rock kit | 1 dodecahedron, jahan jagah mili wahan scatter | **4 sculpted masters × 2 LOD** → 8 InstancedMesh; near 180 tris, far 80 tris; ek master `1.08×0.40×1.28`, doosra `1.34×0.66×1.48` (koi bhi sphere nahi) |
| Rock grounding | patthar zameen me bas rakha hua | sink 25–50 % + **ground-contact AO decal har boulder ke liye** + grass skirt 3 anchors per boulder |
| Rock look | flat colour | per-instance 3-channel weathering (moss/dust/wet) + world-aligned moss + channel-packed `rockORM` (AO+Rough+Metal ek texture me) |
| Grass | blade scatter | **clump-based** scatter jo `groundColorAt` se apna rang leता hai, worn paths par ugta hi nahi, rock bases ki skirt, 2 LOD rings (72 000 / 88 000 clumps @ high) |
| Grass build cost | 494 ms | 723 ms (same instance count — extra kharch clump ka ground-colour matching + path rejection hai) |
| Trees | cylinder + cone, ek boulder scatter andar | growth model: crowding × soil, phototropic boughs, gravity droop, root flare + buttress roots, dead twigs, hemispherical sun-biased canopy, baked vertex AO + moss side, **impostor LOD 300 m ke baad** |
| Tree geometry | ~1 merged mesh per tree | ~90 000 merged verts + ~300–380 instanced leaf cards + **~290–340 impostor cards** + ~1 300 bird perches |
| Terrain | vertex colour = height band | per-shell UV retile (6 m tile), colour pass jo **vertex normals se slope** padhta hai, drainage-wet soil, worn paths, slope→rock ramp, snow shelf mask, macro variation + aspect tint shader me, `clampAlbedo` 30…240 |
| Air | `FogExp2` ek line | height fog (haze valley me baithta hai) + aerial perspective (sun ki taraf warm limb) + fog ke through silhouette |
| Foliage light | Lambert + sun | + transmission term (sun peeche se aaye to patta jalta hai) |
| Water | hardcoded blue reflection | **live sky reflection** (atmosphere ke wahi Color objects), linear-space grade, shoreline foam, metalness 0.42 → **0** |
| Materials | alag-alag texture bina niyam | `TEXELS_PER_METRE = 512`, `GROUND_TILE_METRES = 6`, albedo 30…240, roughness ranges per class |

---

## 3. Har research point — ek-ek karke

### §1 Environmental logic: pehle kaaran, phir cheez

**Research:** professional artist cheez nahi rakhta — kaaran rakhta hai. Geology (bedrock, slope, soil depth),
climate (rain, sun side, wind), phototropism (light ki taraf badhna), moss side (shade ki taraf), age
(purana ped jhuka hua), competition (crowded jungle me lamba nanga tana).

**Sanctuary faisla:** ek hi jagah par sab kaaran compute karo, baaki sab wahi padhe.

**Code:** `environment.ts` → `siteAt(x, z)` ek `Site` deta hai: `height, slope, slopeDeg, aspect, wetness,
nearWater, sunExposure, crowding, soil, biome, path, distanceToDistrict`. Coastal consumers:
`terrain.ts` (colour), `grass.ts` (`acceptsBlade`), `rocks.ts` (cluster rules), `flora.ts` (`TreeLayout`).

**Proof:** world harness — "every site value is finite", "probabilities stay in 0…1", "a biome is always chosen",
"the river line knows it is near water — nearWater=1.00", "the reclaimed ridge is not — 0.00".

---

### §2 Reference → observation → abstraction

**Research:** reference dekho → usme pattern *observe* karo → phir usko *abstract* karo (style me utaaro).

**Sanctuary faisla:** is process ko code me **sahitya** banaya gaya — har inject ki gayi line ke saath uska
observation likha hai, aur abstraction ek fixed number me. Style: "stylised-real", realistic proportion +
readable silhouette + pura detail sirf paas me.

**Code:** har naye module ka header — `atmosphere.ts` ("air teen kaam karta hai, teeno likhe hain"),
`rocks.ts` ("primary/secondary/tertiary form"), `environment.ts` ("nature ke system ko samjho, copy mat karo")।

**Abstraction ke concrete numbers:** 4 rock masters, 3 tree archetypes (broadleaf/pine/acacia), 2 grass LODs,
6 biomes (`meadow…summit`) ek shared ground palette par, 1 terrain height field, 1 sky model.

---

### §3 Primary / secondary / tertiary forms — 70 / 20 / 10

**Research:** 70 % bada silhouette, 20 % secondary planes, 10 % micro detail. Beginner ulta karta hai.

**Sanctuary faisla:** har asset class ka form budget fix, aur micro-detail **geometry me nahi, normals +
vertex data me** (principle 5 — triangle budget bacha ke detail becho).

**Code:** `rocks.ts` → `sculptRock()`
- PRIMARY: anisotropic scale + decisive tilt + non-spherical base (koi master sphere nahi — harness assert karta hai);
- SECONDARY: 2–3 **bedding planes** (sedimentary fracture) jo blob ko flat facets me kaat dete hain;
- TERTIARY: fractal displacement + `bakeCurvature()` (3-channel curvature) → shader ko cavities, edges, dirt;
- LOD note: RNG draws `detail` par depend nahi karte, isliye far LOD wahi patthar hai — sirf kam triangles me.

Trees me: PRIMARY tana + boughs, SECONDARY tier/crown shape, TERTIARY leaf cards.
Terrain me: PRIMARY `distantRelief` (ridged noise crests), SECONDARY foothills + river cut, TERTIARY ground texture + macro variation.

---

### §4 Grass: clumps, SSS backlight, dark root / bright tip, instancing

**Research:** ghaas "blade" nahi, **cluster** hoti hai; root gehra, tip chamaकdar; backlight par hari roshni
aati hai (fake SSS); har blade alag object = mobile suicide — instancing.

**Sanctuary faisla:** teeno lagaye gaye, aur ghaas ko **zameen ka rang pehnaya gaya**.

**Code:** `grass.ts`
- clump placement: ek tuft ke andar 5.5→3.2 (near) / 2.4→1.6 (far) blades, ek hi `worn` measurement aur ek hi
  ground sample per tuft (build cost ka asli khaarch yahi tha, isliye per-tuft share kiya);
- `groundColorAt(...)` se clump ka albedo → "zameen ghaas uga rahi hai", ghaas zameen par chipki hui nahi lagti;
- dark root → bright tip: geometry ke vertex colour gradient + tip par `hueDrift`;
- SSS: `atmosphere.ts` ka transmission term (`uDcTransmit`, `uDcPhase`) foliage materials par — sun peeche,
  camera sun ki taraf → patta/blade jalta hai. Ye asli SSS nahi, **observation ka 8-ALU wala jhooth** hai (principle 39);
- instancing: 2 `InstancedMesh` = **2 draw calls** me 160 000 clumps (high tier);
- `alphaTest 0.5` (research §22: mobile par alpha test minimal).

**Proof:** world harness — "grass: two LOD rings", "blades were placed on worn ground too (skirt ring) —
72 000 near, 88 000 far", "no NaN blade transforms — 0", "materials are published for the atmosphere pass".

---

### §5 Trees: phototropism + LOD/impostor

**Research:** ped roshni ki taraf badhta hai, purane patte jhukte hain, aur 100 m ke baad impostor/billboard —
full mesh ka koi tukda screen par nahi padta.

**Sanctuary faisla:** growth model likha gaya (random cone nahi), aur far trees **2 crossed canopy cards**,
ek hi `InstancedMesh` me, wahi wind uniform.

**Code:** `flora.ts`
- `sunAzimuth = atan2(SUN_SIDE_Z, SUN_SIDE_X)` → leading boughs sun ki taraf 0.55 pull, lagging boughs 1.05
  gravity droop (`(1 − heightFrac) · 1.05`);
- `crowding` (competition) → crowded trees lambe aur bare (pine ×(1+0.35c), broadleaf/acacia ×(1+0.6c));
- `soil` → `baseFlare = 0.46 s (1 + (1−soil)·0.55)` + soil < 0.6 par buttress roots;
- `crowding > 0.5` → dead twigs;
- canopy: hemisphere, sun ki taraf stretch, baahar ke patte yellow-green/bright, andar wale dark/cool;
- `IMPOSTOR_RADIUS = 300` → `impostors` InstancedMesh, `tex.canopy` par 2 crossed cards.

**Proof:** world harness — "leaf cards are instanced", "far trees became impostors", "wood carries baked vertex
weathering — colour attribute present", "the merge produced real geometry", "perches exist for the birds".
(Exact counts har load par thodi badalti hain — forest layout randomise hota hai, jaisa pehle tha; geometry
90 000 vertices + ~300 leaf cards + ~300 impostors ke aas-paas rehta hai.)

---

### §6 Rock kit: 3–5 masters, per-angle silhouette, sink/rotate, up-axis moss

**Research:** 300 unique rocks nahi — **3–5 master kit**; har master ka silhouette har angle se alag; rakhte waqt
ghusaao (sink) + rotate karo; moss **up-axis** par lagta hai, isliye top-down moss texture galat hai — world
alignment chahiye.

**Sanctuary faisla:** poora kit, plus per-instance weathering channels, plus "scree me families" (grid nahi).

**Code:** `rocks.ts`
- 4 masters (`MASTER_COUNT = 4`), sculpt §3 ke teen form levels me;
- placement `siteAt` se: slope, drainage, near-water wetness, path avoidance, **clusters** (density gradient,
  research §49);
- rotate: random yaw + terrain normal ki taraf 40 % slerp (boulder slope me baithta hai, slope ko match nahi karta);
- sink: 25–50 % neeche dhansa hua;
- moss: `weathering.ts` world-aligned tri-planar — jis face ka world normal upar hai aur jo sun ke **doosri taraf**
  hai (`uDcShadeAxis = SUN_SIDE_X/Z`), wahi moss pakadta hai;
- contact decal: ek `InstancedMesh` (transparent, `depthWrite: false`) har boulder ke neeche — patthar zameen se
  "juda" dikhta hai, "rakha hua" nahi.

**Proof:** world harness — "the field is populated — 260 boulders", "every tier of the kit is used — 8 instanced
meshes", "a near LOD and a far LOD both exist", "every boulder has a ground-contact decal", "grass skirts were
published for every boulder — 260 skirts", "no NaN instance transforms — 0", "the far LOD is cheaper than the
near one — 180 → 80 tris", "the curvature bake is present and in range — 540 verts", "per-instance weathering is
3 channels per boulder", "the masters have distinct proportions", "no master is a sphere".

---

### §7 Mountains = silhouette + atmosphere

**Research:** door ka pahad geometry se nahi, **silhouette + atmosphere** se banta hai. Detail waste hai; jo
dikhta hai wo hai crest line aur uske saamne ki hawa.

**Sanctuary faisla:** horizon par sirf ridged noise ke crest, aur unke upar height fog + aerial perspective.
Sky me pehle jo fake "cardboard ridge ring" tha, wo **delete** hai.

**Code:** `terrain.ts` → `distantRelief(x, z)` (ridged noise `1 − |a|` + altitude banding rock/snow);
`atmosphere.ts` → `dcHazeFall` (valley me gehra, upar patla — pahad "paas" lagta hai) + `dcToward`
(sun ki taraf warm limb, research §16).

**Proof:** contract test — "the distant hills are real eroded terrain, not cardboard pyramids"; shader harness —
"rock: height-aware fog present", "rock: aerial perspective present".

---

### §8 Terrain: slope > 45° rock, height masks, flow maps, worn paths

**Research:** slope mask layers chalati hai (45° ke baad rock), height mask (snowline/tree line), flow map
(paani kahan jaata hai → wahan geeli, kaali mitti aur erosion), aur worn paths (jo jagah pair se ghisi hai).

**Sanctuary faisla:** chaaron rule ek hi colour function me, aur wo function ghaas + patthar + terrain sab padhte hain.

**Code:** `environment.ts` → `flowWetness` (lazily built drainage grid — 20 000-sample flow accumulation),
`pathWeight` (trails + trodden disc, meandering edge, bbox early-out), `groundColorAt` (biome blend + wet + worn;
slope→rock ramp `clamp01((0.8 − normalY)/0.18) · 0.92` — pehla rock 26°, half 45°, full 52°);
`terrain.ts` → per-shell UV retile (`GROUND_TILE_METRES = 6`), colour pass **`computeVertexNormals` ke baad**
(vertex normal = free slope mask, ~150 000 vertices par ek extra sample bachta hai), altitude banding
(`h > 18` rock, `h > 52` snow), aur **snow shelf mask** — 52° se zyada khadi face par barf nahi tikti.

**Proof:** world harness — "the clearing is worn ground — path=0.82", "a far ridge is untouched — path=0.000",
"drainage accumulates in the channel, not on the ridge", "12 000 ground samples all inside the albedo range",
"the clearing is flat — 0.29°".

---

### §9 PBR: metallic 0 ya 1, roughness ki kahani, albedo 30–240

**Research:** metalness map practically binary hoti hai; roughness hi batati hai ki surface kya hai; albedo
kabhi 0 (pure black) ya 255 (pure white) nahi — 30–240 ke andar.

**Sanctuary faisla:** `palette.ts` is niyam ka **enforcer** hai, aur water ka metalness bhi isi niyam se theek hua.

**Code:** `palette.ts` → `ALBEDO_FLOOR = 30`, `ALBEDO_CEILING = 240`, `clampAlbedo()` (sRGB in → linear out,
byte helper bhi), `ROUGHNESS_RANGE` per class (rock 0.85–0.97, ground 0.9–1.0, foliage 0.55–0.85…);
`terrain.ts` colour loop ka aakhri step `clampAlbedo`; `rocks.ts` me `metalness: 0` + `rockORM` (B channel = 0);
`water.ts` me river ka `metalness: 0.42 → 0` (dielectric Fresnel khud reflection deta hai — 0.42 double-count tha).

**Proof:** world harness albedo range check; shader harness — "rock: wet surfaces darken albedo",
"rock: roughness is modulated".

---

### §10 Colour: desaturated base + cool shadow / warm lit hue shift

**Research:** base colour desaturated rakho (saturation ko *accent* ke liye bachao), aur hue shift: roshni me
warm, shadow me cool. Ye colour wheel ka rule nahi, **observation** hai.

**Sanctuary faisla:** teen jagah lagta hai — palette me, shader me (aspect tint), aur atmosphere me (haze key).

**Code:** `palette.ts` → `GROUND_PALETTE` (6 biomes, sab desaturated), `hueDrift(facing, height)`,
`atmosphereKeyFor(elevation)` (har din ka band: haze colour, in-scatter, sun tint);
`terrain.ts` shader me aspect tint `mix(vec3(0.94,0.97,1.06), vec3(1.06,1.02,0.94), smoothstep(−0.6,0.6,dcFacing))`
— sun ki taraf warm, shade ki taraf cool; `SUN_SIDE_X/Z = 0/−1` ek hi sach, jise terrain tint, moss, tree lean,
grass tint aur weathering sab padhte hain.

---

### §11 Weathering, edge wear, AO dirt, water stains

**Research:** koi surface nayi nahi hoti. Kinare ghise hue, gaddho me dhool, niche paani ke dhabbe, upar dhool.

**Sanctuary faisla:** ek reusable weathering pass jo **curvature** (convex/concave) padhta hai aur uske hisaab se
edge wear + cavity dirt + streaks deta hai — aur "up" ka faisla world normal se karta hai (koi bhi asset, kisi
bhi rotation me, sahi javab deta hai).

**Code:** `weathering.ts` → `bakeCurvature(geo, …)` (3-channel: cavity/edge/flow), `apply(material, {attrib})`
(tri-planar detail, moss `uDcShadeAxis` par, wetness, roughness modulation), `setInstanceWeather(...)`
(per-instance 3 channels). Consumers: `rocks.ts` (kit), `flora.ts` (trunk wood via vertex colour AO),
`terrain.ts` (macro variation).

**Proof:** shader harness — "rock: tri-planar weathering present" (3 fetches), "rock: curvature bake attribute
consumed", "rock: instance weathering attribute consumed", "rock: moss uses the shade axis".

---

### §12 Natural variation: 0.85–1.15, clustering, per-instance tint

**Research:** variation ±15 % se zyada karna "random" lagta hai, ±10–15 % "natural"; aur variation **cluster**
karta hai (patch me), uniform nahi hota; per-instance tint scale ke saath.

**Sanctuary faisla:** variation cluster ke andar, aur tint per-instance (draw call nahi badhta).

**Code:** `rocks.ts` (cluster centres + per-cluster scale band + `instanceColor` tint: moss → green,
wet → cool, height → pale), `grass.ts` (per-clump colour ground se derive, tuft ke andar blade scale 0.62–1.30,
`clumpNear/Far` densities), `flora.ts` (layout jitter + crowding se size).

---

### §13 Procedural vs hand-crafted — kahan kya

**Research:** dono ki jagah hai. Repeat hone wali cheez procedural, **hero** cheez hand-crafted.

**Sanctuary faisla (actual split):**

| Hand-crafted (authored) | Procedural (systematic) |
|---|---|
| Study lectern + 3 boards, student, waterfall cliff + fall, three districts ke landmarks | terrain height field, ground colour, ghaas, forest layout, rock kit placement, river surface, birds |
| Paths ke control points (`TRAILS` in `environment.ts`) | path ka width, wobble, wear gradient — aur uska asar ghaas/colour par |
| Camera focus presets, daylight modes | sky, clouds, air, shadows ki update cadence |

Ye split jaan-boojh kar hai: jo cheez **kahani** hai wo haath se, jo cheez **jagah** hai wo niyam se.

---

### §14 Lighting: low sun drama, cross-light, no pure black

**Research:** sabse achhi roshni neeche wala suraj (5–15°) hai — cross-light, lambi shadows, texture ubharti hai;
aur shadow me **kabhi pure black nahi** — bounce light se fill hota hai.

**Sanctuary faisla:** din ka arc low-sun ke around art-directed hai, aur world me do fill sources hain
(hemisphere sky/ground + cool directional fill) — isliye shade bhi information rakhta hai.

**Code:** `daylight.ts` (`MIN_ELEVATION = 4°`, `MAX_ELEVATION = 72°`, auto/morning/midday/evening);
`sky.ts` (hemi 1.05, sun `0xfff1d6` 2.35, cool fill `0xa8d6ff` 0.5); `atmosphere.ts` fog tints the low sky;
note — night bhi evening look rakhta hai (study space hai, 23:00 par sun horizon nahi chhoota).

**Proof:** contract tests — "night holds the evening look and the sun never touches the horizon",
"everything that reads the sun shares one vector".

---

### §15 Material × lighting: wetness, Fresnel, "response" hi material hai

**Research:** material ko sirf albedo+roughness nahi samjho — light ke saath uska **response** dekho: geeला
surface kaala + mirror-jaisa (roughness kam), patta peeche se jalta hai (SSS), paani Frisnel se grazing par
mirror ho jaata hai.

**Sanctuary faisla:** response ko shader me daala gaya, per-instance / per-vertex / per-pixel teen level par.

**Code:** `water.ts` — Schlick Fresnel `F0 = 0.02` (paani ka asli ~2 %), Beer-Lambert depth tint, dual-phase
flow (Portal 2 / three.js Water2 trick), **live sky reflection**, **shoreline foam** (jahan paani patthar se
milta hai wahan whitewater), grade **linear light me tone-map se pehle**; `weathering.ts` — wet par albedo ×0.62
aur roughness kam; `atmosphere.ts` — foliage transmission.

**Proof:** shader harness — "water: the river reflects the live sky colours", "water: it borrows the atmosphere
values, not new ones", "water: shoreline foam is present", "water: the grade lands in LINEAR light, before the
haze", "water: the fall does NOT redeclare three's map uniform".

---

### §16 Atmosphere: aerial perspective, fog = mood

**Research:** door ki cheez ka contrast pehle girta hai, shape baad me. Fog sirf "chhupane" ka tool nahi —
**mood** ka tool hai (subah doodhiya, dopahar clear, shaam sona).

**Sanctuary faisla:** stock `FogExp2` hata ke ek chhota atmosphere pass — teen kaam: neeche pool karna,
sun ki taraf lit hona, silhouette resolve karna.

**Code:** `atmosphere.ts` → `FOG_CHUNK` (`dcHazeFall` height weighting + `dcToward` arial perspective +
Mie forward lobe), shared uniforms (`uDcHazeColor`, `uDcInScatter`, `uDcAerial`…), `update(elevation, …)`
har band par values badalta hai; consumers: terrain shells, rocks, grass, leaves, trunks, aur ab **paani bhi**
(scene.ts `this.water.materials.forEach((m) => this.atmosphere.register(m))`).

---

### §17 Art direction: palette, cool-grey shadows, rest vs action

**Research:** palette sirf rang nahi, **contrast ka budget** hai. "Visual rest" areas chahiye (aankh ko saans
lene do) warna sab jagah drama = koi drama nahi.

**Sanctuary faisla:** clearing = rest (flat, khula, halka), cascade + escarpment = action (verticals, foam,
mist, high contrast), forest = texture zone (detail chhota, silhouette bada).

**Code:** `palette.ts` `GROUND_PALETTE`/`FOLIAGE_PALETTE`/`ROCK_PALETTE` + `ROUGHNESS_RANGE`;
`terrain.ts` aspect tint; `environment.ts` `inClearing()` — kuch rules clearing ke andar explicitly shaant
rehte hain (jaise boulder clusters clearing me nahi).

---

### §18 Texel density + roughness floors

**Research:** ek hi surface ke do pieces ki texel density match karni chahiye (warna patchwork), aur roughness
"shiny plastic" se bachane ke liye floor chahiye.

**Sanctuary faisla:** ek constant sab kuch decide karta hai, aur ground texture ka repeat (1,1) rakha gaya
taaki shells apni UV scale khud bake karein — warna near aur far shell desync ho jaate (ye classic bug hai).

**Code:** `palette.ts` → `TEXELS_PER_METRE = 512`, `GROUND_TILE_METRES = 6` (~85 px/m, **har shell** ke UV me
bake), `clampAlbedoByte`, `ROUGHNESS_RANGE`; `textures.ts` → ground map ka `repeat` deliberately removed with
comment; `terrain.ts` → per-shell `uv = (x, z) / GROUND_TILE_METRES`.

---

### §19 Camera-driven design: detail wahan jahan camera hai

**Research:** player camera ke aas-paas detail, door par suggestion. Artist budget deta hai camera ko, geometry ko nahi.

**Sanctuary faisla:** teen radius jo camera (aur tier) se tay hote hain: grass 46/330 m, rock near-LOD 150 m,
tree impostor 300 m — aur wind/detail fades inhi radii par.

**Code:** `quality.ts` (`grassNearRadius`, `grassFarRadius` per tier), `rocks.ts` (`NEAR_LOD_RADIUS`),
`flora.ts` (`IMPOSTOR_RADIUS`), `grass.ts` (wind fade 45–95 m), `scene.ts` (focus presets jo camera ko
set-piece par le jaate hain — wahi "camera-driven" curation hai).

---

### §20 Optimization: HISM/ASTC/TBR/cull volumes/URO

**Research:** BGMI-class renderer: HISM (hierarchical instancing), ASTC (compressed textures), TBR-friendly
(overdraw kam, load/store kam), cull volumes, URO (Update Rate Optimization — door ki cheezein kam update).

**Sanctuary faisla (jo hum kar sakte the, wo kiya; jo platform feature hai, wo document kiya):**

| Technique | Sanctuary me |
|---|---|
| HISM | har asset class ek `InstancedMesh` — ghaas 2 draw calls (160 000 clumps), rocks 8, leaves 1 |
| ASTC/texture compression | **N/A** — saari textures runtime par canvas se banti hain, download me 0 byte hai; compress karne ko kuch nahi |
| TBR-friendliness | minimal alpha test, `depthWrite: false` decals, ek hi shadow-casting light, no post FX chain |
| Cull volumes | per-ring radii + `frustumCulled` jahan sasta hai; hidden ring-interior verts ko −240 m par bheja gaya |
| URO | wildlife ~30 Hz, clouds ~20 Hz, ambient passes quarter rate, `shadowMap.autoUpdate = false` + explicit refresh |

**Code:** `scene.ts` (staggered clocks), `quality.ts` (4 tiers, `AdaptiveResolution`), `flora.ts`/`grass.ts`/`rocks.ts`.

---

### §21 Fakes: impostors, vertex AO, lightmaps, dynamic resolution

**Research:** jo render nahi kar sakte, use **convincingly fake** karo — impostor, baked light, baked AO,
vertex colour, dynamic resolution.

**Sanctuary faisla:** list aur unka exact use:

| Fake | Kahan |
|---|---|
| Impostor cards | `flora.ts` 300 m ke baad (292 cards), `tex.canopy` |
| Vertex-colour AO + moss | `flora.ts` `woodColor()` — AO 0.46→1 height ke saath, moss shade side par, chest height par fade |
| Vertex-curvature weathering | `weathering.ts` `bakeCurvature` + shader |
| Fake SSS | `atmosphere.ts` transmission term (asli blur pass nahi) |
| Dynamic resolution | `quality.ts` `AdaptiveResolution` (>22 ms par ×0.92, <13.5 ms par ×1.05) |
| Static shadow refresh | `scene.ts` `shadowMap.autoUpdate = false` + `requestShadowRefresh()` |
| Fake depth (paani) | `water.ts` channel centre se distance = water column proxy |

---

### §22 BGMI/PUBG evidence — kya match kiya

**Research:** mobile battle-royale ka environment stack: single CSM, URO, HISM, ASTC, minimal alpha test,
LOD chains, baked light.

**Sanctuary faisla:** jo cheez browser me possible hai, wo match ki gayi:

| BGMI/PUBG | Sanctuary me |
|---|---|
| Single cascaded shadow map | ek hi shadow-casting directional light, ±34 m ortho shadow cam, 0/1024/2048 tier-wise |
| URO | ambient/wildlife/cloud updaters staggered, static shadow map |
| HISM | asset-class instancing (upar §20) |
| LOD chain | rock near/far, grass near/far, tree mesh→impostor |
| Minimal alpha test | ghaas/leaf `alphaTest 0.5`, decals `depthWrite: false` |

---

### §23 Asset pipeline (18-step)

**Research:** ek asset sirf model nahi hota — reference → blockout → high poly → retopo → UV → bake → texture →
material instance → LOD → collision → placement rules → QA.

**Sanctuary faisla:** is pipeline ka **analogue** — kyunki yahan asset file nahi, code-factory hai:

| Step | Sanctuary me |
|---|---|
| reference/observation | module header comments (research section citation ke saath) |
| blockout | `sculptRock` master seed, `TreeLayout`, terrain height field |
| high→low (LOD) | near `detail 2` / far `detail 1`, wahi RNG draws |
| UV | `GROUND_TILE_METRES` baked UV, rock par box-ish UV + tri-planar detail |
| bake | `bakeCurvature` (3-channel), `woodColor` (vertex AO), `tierColor` |
| texture/material | `textures.ts` (canvas generators) → `palette.ts` (response ranges) → material instance per class |
| LOD chain | rock 2, grass 2, tree 2 |
| placement rules | `environment.ts` `siteAt` + har consumer ke accept rules |
| QA | contract suite + shader harness + world harness |

---

### §24 Environment pipeline (kaam ka order)

**Research:** blockout → budgets early → master material + instances → texture packing → light early →
placement automate → detail pass.

**Sanctuary faisla:** `scene.ts` ka build order isi pipeline ka code hai:

1. budget decide (`quality.ts`) → 2. atmosphere + weathering (shared uniforms sabse pehle, taaki har material
   register ho sake) → 3. terrain shells (ground truth height) → 4. rock kit (kuch cheezein ghaas se pehle,
   kyunki ghaas ko rock bases chahiye) → 5. grass (rock skirts ke saath) → 6. flora (leaves + impostors) →
7. water + wildlife + student + lectern → 8. `applyDaylight()` (light early-late, par pehle frame se pehle) →
9. dispose sab.

---

### §25 Decision trees — rock + grass

**Research:** artist ke paas decision tree hota hai, feeling nahi.

**Sanctuary me jo tree **actually** code hai (`rocks.ts`):

```
boulder candidate (x, z):
  ├─ insideRiver / pathWeight > 0.6            → REJECT (trail ke beech patthar nahi)
  ├─ inClearing(bound)                          → REJECT (rest area)
  ├─ site.slopeDeg < 5  aur rand() < 0.62       → REJECT (flat, level ground me bedrock nahi dikhta)
  ├─ snowline se upar (height > 52)             → REJECT (barf me kit nahi)
  ├─ cluster banate waqt:
  │     slopeDeg > 26  → scree (family tight, chhote)
  │     slopeDeg 8–26  → outcrop (aksar, médium)
  │     nearWater/wet  → river boulder (round, wet channel, moss kam)
  └─ instance: near (<150 m) → detail 2 ; far → detail 1 ; sink 25–50 % ; tilt to normal ×0.4 ; tint per-instance
```

Grass ka tree (`grass.ts`):

```
blade/tuft candidate:
  ├─ insideRiver(x, z)                          → REJECT
  ├─ river ke 8.6 m andar, rand() < 0.72        → REJECT (bank par ghaas patli)
  ├─ chair/lectern ke 1.9 m andar               → REJECT
  ├─ y < −1.1                                    → REJECT (paani ke neeche)
  ├─ worn > 0.62                                 → REJECT (ghisi hui mitti)
  ├─ worn > 0.18 aur rand() < worn·1.45          → REJECT (shoulder par thinning)
  └─ accept → clump banao: 3.2–5.5 blades (near) / 1.6–2.4 (far), ground colour inherit,
              tip gradient, per-clump tint, wind fade 45–95 m
```

---

### §26 10-point framework: FORM / SCALE / MATERIAL / COLOR / VARIATION / WEATHERING / LIGHT / CONTEXT / DISTANCE / PERFORMANCE

| Point | Sanctuary implementation |
|---|---|
| FORM | `sculptRock` 3 levels; tree tana/bough/tier; terrain ridged crests |
| SCALE | real-world metres: `TEXELS_PER_METRE = 512`, rock master ~0.4–1.6 m × scale, trees 5–14 m, `WORLD_REACH = 1180` |
| MATERIAL | `palette.ts` `ROUGHNESS_RANGE`, metalness 0, `rockORM` channel packing, dielectric Fresnel for water |
| COLOR | `GROUND_PALETTE` per biome + `clampAlbedo` 30–240 + aspect hue shift (cool shade / warm lit) |
| VARIATION | cluster ke andar ±10–15 %, per-instance tint, per-clump grass colour |
| WEATHERING | `weathering.ts` curvature → edge wear + cavity dirt + streaks + moss + wet |
| LIGHT | low-sun arc, cross-light, no pure black (hemi + cool fill), foliage transmission |
| CONTEXT | `siteAt` — sab kuch apne aas-paas ki zameen se, aur moss/path/water sab sun side ke ek constant se |
| DISTANCE | 2 grass rings, rock near/far 150 m, impostors 300 m, height fog + aerial perspective |
| PERFORMANCE | 2/8/1 draw calls per class, instancing, alpha test, URO-staggered updates, adaptive resolution |

---

### §27 Limited-asset case study (1 terrain / 3 rocks / 3 trees / 2 grass / 1 mountain / 1 sky)

**Research:** ek chhote asset set se poora environment banta hai — jaise asli studios karte hain.

**Sanctuary ka actual kit:**

| Asset | Kit size | Kit-bashing |
|---|---|---|
| Terrain | 1 height field, 6 biomes, 1 shared `GROUND_PALETTE` (7 colours) | 4 shells, per-shell UV retile, 12 000 colour samples me blend |
| Rocks | **4 masters** | × 2 LOD, per-instance scale/rot/sink/tint/weather → 260 boulders |
| Trees | 3 archetypes (broadleaf / pine / acacia) | growth model se size/shape/bough/canopy vary → 380 trees + 292 impostors |
| Grass | 2 LODs (8-vert tuft, 4-vert card) | clump density + ground colour + wind → 160 000 clumps |
| Mountain | 1 `distantRelief` field | altitude + slope banding, atmosphere |
| Sky | 1 analytic sky model | daylight arc, clouds, haze key |

---

### §28 Blueprint — blockout, budgets early, master material + instances, packing, light early, automate placement

Ye §24 wala order hi hai, aur uske saath ye concrete decisions:

- **Budget early:** `quality.ts` pehle chalta hai, `budget.tier` har module me jaata hai (grass counts, shadow
  map size, far plane, particles).
- **Master material + instances:** har class ka EK material (rock field ka ek material, grass ka ek, foliage ke
  teen) — per-instance data attributes se aata hai, naye material se nahi (draw call / shader compile dono bachte hain).
- **Packing:** `rockORM` (AO|Rough|Metal ek texture me) — teen texture ka kaam ek me.
- **Light early:** atmosphere uniforms pehle bante hain; daylight pehla frame se pehle apply hota hai
  (`applyDaylight()` build ke andar hi).
- **Automate placement:** koi bhi prop haath se place nahi hota except landmarks — sab `siteAt` ke rules se.

---

### §29 50 principles — jo code me actually cite hue hain

Code me in principles ka **direct reference** hai (grep se nikala gaya — jhooth nahi, citation hai):

| Principle | Kahan cite hua | Code ke hisaab se uska matlab |
|---|---|---|
| 1 | `environment.ts` | "Copy mat karo, nature ka system samjho" — isliye poora environment field hai |
| 3 | `textures.ts` | "Too perfect" hi tell hai — contact shadow bhi wobbled hai, perfect circle nahi |
| 5 | `rocks.ts` | Detail **normals + vertex data** me, extra triangles me nahi |
| 8 | `rocks.ts` | Kit-bash scale rule — door ke boulders BADE hone chahiye, tabhi distance ka scale banta hai |
| 9 | `textures.ts`, `weathering.ts` | Roughness/albedo range aur unka physical matlab |
| 10, 11, 12 | `palette.ts`, `environment.ts`, `rocks.ts`, `textures.ts`, `weathering.ts` | colour, weathering, aur variation (cluster me, ±10–15 %) |
| 14 | `weathering.ts` | Weathering **world space** me hoti hai — ek hi asset har biome me, kabhi stretch nahi hota |
| 17, 18 | `grass.ts`, `atmosphere.ts` | SSS ka observation: sun peeche + camera sun ki taraf = patta jalta hai |
| 19 | `flora.ts` | Open-grown crown ka shape — upar ki taraf race, sun ki taraf stretch |
| 20 | `terrain.ts` | Height-banding ka tell — isliye snow ko slope shelf mask mila |
| 21 | `environment.ts` | 45° ke baad kuch nahi tikta — slope→rock ramp ka base |
| 23 | `water.ts` | Material ka response light ka hissa hai — paani ka reflection live sky se aata hai |
| 24 | `atmosphere.ts` | Fog = mood, sirf "chhupane" ka tool nahi |
| 29 | `palette.ts` | "Rest vs detail" — detail ko budget karo, sab jagah nahi |
| 34 | `water.ts` | Paani patthar ko chhue to whitewater — shoreline foam |
| 35 | `grass.ts` | Alpha card ke khaali pixels pure cost hain — alphaTest 0.5, overdraw trim |
| 36 | `rocks.ts`, `textures.ts` | Channel packing (`rockORM` = AO│Rough│Metal) — teen texture ka kaam ek me |
| 39 | `atmosphere.ts`, `water.ts` | Jo render nahi kar sakte, usko sasta aur convince-ing jhooth se banao |
| 46 | `palette.ts`, `terrain.ts` | Ek texel density, poore world me — tabhi meadow aur far hills ek material lagte hain |
| 48 | `environment.ts` | Environmental storytelling — trail proof hai ki is world me koi rehta hai |
| 49 | `rocks.ts` | Nature density gradient follow karti hai, grid nahi — isliye clusters |
| 50 | `grass.ts`, `rocks.ts`, `scene.ts`, `textures.ts` | Koi prop akela khada nahi hota — skirt, decal, cluster, contact |

## 4. Kya nahi kiya, aur kyun (deliberate exclusions)

Honesty is part of the design — ye cheezein **jaan-boojh kar** nahi ki gayi:

1. **Post-processing grade chain (bloom/DOF/vignette).** Mobile + mid-range laptop target hai; ek hi extra
   fullscreen pass ka kharch paid nahi tha. Grade uske bajaye **material me** hota hai (water ka linear grade,
   terrain ka aspect tint) aur daylight exposure se.
2. **ASTC/BC texture compression.** Saari textures runtime par canvas se generate hoti hain — download 0 byte.
   Compress karne ke liye koi network texture hi nahi hai; mobile GPU ke liye ye actually best case hai.
3. **Real SSS blur / thickness map.** Foliage ka transmission term observation ka ~95 % le leta hai, 8 ALU me.
4. **GPU vertex displacement for grass.** Wind CPU-side uniform se hota hai (ek vector per frame) — vertex
   texture / compute ka fayda is scale par nahi hai.
5. **Report ke §14 ka "night" (raat).** Study space hai: 23:00 bhi sunset look deta hai, taaki learner padh sake.
   Ye owner ka pehle se diya hua directive hai aur usko nahi chheda gaya.
6. **Rain/particle weather system.** Seasonal wetness environment field me hai (drainage, wet ground, wet rocks),
   lekin ek live rain system naya budget maangta aur usse pehle lighting/LOD ka kharcha zyada important tha.

---

## 5. Agle kadam (open items)

1. Rendered screenshots ka manual visual pass (playwright sandbox me download nahi hota — user ke browser me
   preview kholna padega).
2. Per-biome texture variation (§10): abhi biome palettes colour se badalte hain, texture detail se nahi.
3. Live weather: `weathering.ts` ke wet channels pehle se hain — rain system unhi ko drive kar sakta hai.

---

## 6. Files (naye + badle hue)

```
src/nature3d/engine/
  environment.ts   NEW  539  environmental field: site, drainage, paths, ground colour
  palette.ts       NEW  242  art direction enforcer: albedo range, texel density, palettes, atmosphere keys
  atmosphere.ts    NEW  365  height fog + aerial perspective + foliage transmission (fake SSS)
  weathering.ts    NEW  419  curvature bake + tri-planar weathering + moss/wet/streak
  rocks.ts         NEW  417  rock kit: 4 masters, 2 LODs, clusters, contact decals, skirt export
  terrain.ts       MOD +113  per-shell UV retile, slope-from-normals colour pass, snow shelf, macro tint shader
  flora.ts         MOD +267  growth model, wood AO/moss, impostors, root flare, boulder scatter deleted
  grass.ts         MOD +170  clumps, ground-colour adoption, worn paths, rock skirts, LOD fade
  textures.ts      MOD +146  rockORM / weather / contact / canopy maps, ground repeat fix
  water.ts         MOD +139  linear grade, live sky, shoreline foam, metalness fix, redeclared-uniform bug fix
  scene.ts         MOD  +63  wiring: atmosphere + weathering + rocks + grass skirt + water haze
tests/nature3dSanctuaryContract.test.mjs  MOD  contract updated where a signature legitimately grew
```

Verification harnesses repo me **permanent** hain (`scripts/verify-nature3d-*.mts`), aur ek command se chalte hain:

```bash
bash scripts/verify-nature3d.sh      # shaders + world, dono, plain node me — na browser, na GPU
```

Ye jaan-boojh kar rakhe gaye hain: shader harness ne ek asli GLSL bug pakda tha (waterfall ka redeclared
uniform) jo kisi bhi source-shape test se nahi dikhta. Bundle `/tmp` me jaata hai — repo me kuch nahi girta.

---

## 7. Zameen gayab thi — bug, fix aur optimization (is doc ke baad ka kaam)

User ne report kiya: preview me **zameen dikh hi nahi rahi thi**. Jaach me nikla ye chhota visual glitch nahi,
balki ek shader bug tha jo poori nature ko gayab kar raha tha:

**Bug.** `atmosphere.ts` ka `register()` fragment shader me `#include <common>` ko **replace** kar deta tha
sirf apne uniforms se — include line hi uda deta tha. `common` chunk me `PI`, `saturate`, `pow2`,
`BRDF_Lambert` define hote hain, jinhin standard/lambert pipeline **use** karta hai. Natija: har
atmosphere-registered material (terrain, rocks, grass, flora, water) ke fragment shader me 4+ guaranteed GLSL
compile errors → three.js program link nahi kar paata → **mesh render hi nahi hota**. Zameen ke saath ghaas,
ped, patthar aur nadi bhi gayab the; sirf sky/student/boards dikhte the (wo register nahi hote).

**Fix (1 line).** Replacement me `#include <common>` wapas rakha — har doosra injection (terrain, grass,
flora, water, weathering) pehle se yehi karta tha; sirf atmosphere bhool gaya tha.

**Regression test (harness §8, 8 naye checks).** Purana harness ye bug pakad hi nahi sakta tha — wo anchors,
duplicates aur varyings check karta tha, lekin ye kabhi assert nahi karta tha ki load-bearing chunks
**survive** karte hain. Ab general check hai: stock lib ke har top-level `#define` aur function ko injection
ke baad bhi resolve hona chahiye (jaan-boojh kar replace hone wale chunks — fog, project_vertex,
opaque/map/roughness — me sirf main()-scoped code hai, isliye sahi injection kabhi trip nahi karta).
Self-test ke saath: harness ko pata hai ye checker kabhi khaali fire nahi karta.

**Zameen ki optimization (research ke hisaab se, §18/§20) — zero visual change:**
Proof: poori terrain (positions + normals + UVs + colors, 4 shells) ka FNV hash change se pehle aur baad me
**identical** (`b7ae7b3c`) — ek bhi pixel nahi badla.

| Kaam | Research | Natija |
|---|---|---|
| Per-shell **tight bounding volumes** (sirf visible verts par; -240 m pit verts bahar) | §20 cull volumes | shell-1 ka culling sphere center **-105 m → +15 m**, radius 394 → 370 m — frustum culling ab actually kaam karta hai |
| `matrixAutoUpdate = false` (4 static meshes, rotation ek baar set) | §20 static = zero per-frame CPU | har frame ka redundant matrix compose khatam |
| `tiles` loop se hoist + hot loops me direct `Float32Array` access | §20 hot-loop hygiene | ~165k verts × 3 passes par laakhon getter calls khatam; wall-clock noise-dominated hai (~0.5 s, `terrainHeight` noise math) isliye build time lagbhag same |
| Trail segments precompute (`TRAIL_SEGS` — vectors + `len` ek baar) | §20 loop invariants hoist | `pathWeight` **117 ms → 76 ms** (200k queries, **35% tez**), results bit-identical |
| Texture setup verify | §18 texel density | ground map pehle se sahi tha: RepeatWrapping + sRGB + aniso — kuch badalne ki zaroorat nahi padi |

**Imaandaar note:** terrain build wall-clock (~441–601 ms) is pass se materially nahi ghata — 90%+ waqt
`terrainHeight` ke noise evaluation me hai, jo duniya ki shape hai (usko chhuna = duniya badalna, jo contract
bhi rokta hai: shell `segs` ka shape + outer spacing < 16 m pin hai). Isliye optimization runtime (culling,
static freeze) aur shared hot path (`pathWeight`, jo ghaas bhi use karti hai) par lagayi — wahi fayda tha.
