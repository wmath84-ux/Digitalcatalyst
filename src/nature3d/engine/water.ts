// src/nature3d/engine/water.ts
//
// River, waterfall and the splash mist.
//
// The river surface is a single plane whose NORMAL MAP scrolls in two
// directions at different speeds — the classic, nearly-free way to fake
// flowing water. Real vertex displacement is added only in the near band
// (a shader-side sine, not a CPU loop).
//
// The waterfall sheet scrolls a second copy of the same texture vertically and
// the spray is one `Points` cloud updated with a typed-array loop that touches
// only Y (never allocates).
//
// ── What the research pass changed here (research §15, §16, §17, §29) ───
//
//   1. THE SURFACE IS LIT BY THE REAL SKY. The reflection colour used to be a
//      hard-coded blue, so a 6 am river and a 6 pm river reflected the same
//      noon sky. It now reads `uDcHazeColor` / `uDcSunColor` off the shared
//      atmosphere uniforms, which `daylight.ts` writes once per hour change:
//      the water turns peach at dusk and steel-blue at midday for free, on the
//      same draw call (principle 23: material response is part of the light).
//
//   2. THE GRADE HAPPENS IN LINEAR LIGHT, BEFORE THE TONE MAP. The old mix
//      ran after `<dithering_fragment>`, i.e. after three had already tone
//      mapped and sRGB-encoded the frame — colour maths on an encoded signal,
//      which is why water tanks look "video-gamed". The injection now sits on
//      `<opaque_fragment>`, so Fresnel, the Beer-Lambert body and the glint
//      are all combined in the same linear space the rest of the renderer uses.
//      Its constants are therefore authored as linear triples, annotated with
//      the sRGB value they came from.
//
//   3. THE BANK HAS A FOAM LINE. Water that meets stone is whitewater: the
//      shallow band at the edge carries the bed's turbulence. One
//      `smoothstep` on the distance from the channel centre, broken up by the
//      same flow texture that drives the ripples, paints the shoreline. This is
//      the cheapest "the water and the bank are touching" cue there is, and it
//      is what stops the river reading as a decal (research §15, principle 34).

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import { RIVER_CENTER_X, WATER_LEVEL, OCEAN_LEVEL, coastWeight, terrainHeight } from "./terrain";
import type { TextureSet, WaterPhotoSet } from "./textures";

export interface WaterSystem {
  group: THREE.Group;
  /**
   * Every material this system owns.
   *
   * The scene registers these with `atmosphere.ts` so the river and the fall
   * fade into the same air as the ground they run through. Without it a river
   * is the one object in the frame that keeps full contrast at 900 m, and the
   * eye reads it as a blue strip pasted over the hills (research §16).
   */
  materials: THREE.Material[];
  iceMaterials: THREE.Material[];
  setFrozen(frozen: boolean): void;
  update(dt: number, time: number, cameraPos?: THREE.Vector3): void;
  /**
   * Swap the procedural water detail for the baked maps of the Sketchfab
   * "small flat cube of water" GLB (see `textures.loadWaterPhotos`). Purely
   * live-uniform and live-image writes: no recompile, no relayout, and the
   * animation stays the shader's own — nothing new runs on the CPU.
   */
  setPhotos(photos: WaterPhotoSet): void;
  dispose(): void;
}

export function createWater(
  tex: TextureSet,
  budget: QualityBudget,
  /**
   * The live sun direction, SHARED with the sky (same Vector3 instance).
   * The glint has to track the sun or the river would sparkle from the
   * morning position all evening. Holding the reference means the daylight
   * code writes once and this follows for free — no per-frame copy, and the
   * reflection schedule itself is untouched.
   */
  sunDir: THREE.Vector3,
  /**
   * The LIVE sky colours, shared with `atmosphere.ts` (same `THREE.Color`
   * instances, mutated in place by `daylight.ts`). Water reflects whatever the
   * sky currently is, so a river at 6 pm has to be lit by a 6 pm sky — a
   * constant blue here is the single fastest way to make water look like
   * plastic. Both are optional so the system still builds standalone; the
   * defaults are the midday values the daylight code produces anyway.
   */
  colors: { sky?: THREE.Color; sun?: THREE.Color } = {},
): WaterSystem {
  const skyColor = colors.sky ?? new THREE.Color(0xaedcfa);
  const sunColor = colors.sun ?? new THREE.Color(0xfff8e0);

  const group = new THREE.Group();
  group.name = "water";

  // ── River surface ────────────────────────────────────────────────────
  //
  // Technique credits (all open source, re-implemented rather than imported so
  // the page stays dependency-free and keeps its zero-lag budget):
  //
  //   * DUAL-PHASE FLOW, from Valve's "Water Flow in Portal 2" (SIGGRAPH 2010)
  //     and three.js `Water2`/flow-map example. Scrolling a normal map in one
  //     direction makes the texture visibly slide. Instead we sample it TWICE
  //     with two half-cycle-offset phases and cross-fade between them, so the
  //     pattern continuously regenerates and the eye never locks onto a
  //     sliding feature. This single trick is the difference between "blue
  //     plastic moving" and "water flowing".
  //   * SCHLICK FRESNEL with F0 = 0.02 (water's real ~2 % normal reflectance)
  //     plus a GGX-ish sun glint, from the WaterThreeJS ocean. Grazing angles
  //     go mirror-bright, straight-down goes deep and transparent — that
  //     view-dependence is most of what reads as "wet".
  //   * DEPTH TINT via Beer-Lambert: shallow edges are bright turquoise,
  //     the channel centre saturates to deep green-blue.
  //
  // Cost: one extra texture fetch and ~20 ALU in the fragment shader. No
  // render targets, no planar reflection pass, no second camera.
  const RIVER_LENGTH = 1000;
  const riverGeo = new THREE.PlaneGeometry(12.5, RIVER_LENGTH, 1, budget.tier === "low" ? 40 : 140);
  riverGeo.rotateX(-Math.PI / 2);

  const flowTex = tex.water.clone();
  flowTex.needsUpdate = true;
  flowTex.wrapS = THREE.RepeatWrapping;
  flowTex.wrapT = THREE.RepeatWrapping;
  flowTex.repeat.set(3, 24);

  const normTex = tex.waterNormal.clone();
  normTex.needsUpdate = true;
  normTex.wrapS = THREE.RepeatWrapping;
  normTex.wrapT = THREE.RepeatWrapping;

  const riverMat = new THREE.MeshStandardMaterial({
    // METALNESS IS 0, NOT 0.42 (research §9: a metalness map is 0 or 1 in
    // practice; values in between are a look, not a material). The reflection
    // here is dielectric Fresnel — which is what water actually is — and the
    // injection below supplies it in full; parking metalness at 0.42 on top
    // would double-count the same highlight and kill the diffuse body.
    // USER DIRECTIVE (water colour): a real river is saturated blue, not a
    // white-cyan sheet. The albedo map is kept for flow, but the body colour
    // in the shader owns the look. DoubleSide so a camera under the surface
    // still sees water instead of a culled backface.
    color: 0x0d6ad0,
    roughness: 0.18,
    metalness: 0.0,
    transparent: true,
    opacity: 0.94,
    map: flowTex,
    envMapIntensity: 0.55,
    side: THREE.DoubleSide,
  });
  // USER DIRECTIVE (the "small flat cube of water" GLB): the baked caustics
  // ride EVERY water surface. On the low tier the roughness-glint modulation
  // and the photographic layer are compiled OUT (one fetch instead of four);
  // the caustics stay — they are the point of the directive.
  if (budget.tier === "low") (riverMat as THREE.Material & { defines?: Record<string, string> }).defines = { DC_WATER_LOW: "" };
  // Arrives async from `loadWaterPhotos`; until then the flow normal map is
  // a harmless grey-noise placeholder for all three slots.
  let waterPhotos: WaterPhotoSet | null = null;
  riverMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uFlowMap = { value: normTex };
    shader.uniforms.uCaustics = { value: waterPhotos?.caustics ?? normTex };
    shader.uniforms.uRoughTex = { value: waterPhotos?.roughness ?? normTex };
    shader.uniforms.uEmis = { value: waterPhotos?.emissive ?? normTex };
    shader.uniforms.uSunDir = { value: sunDir };
    // Different NAMES, the same Color objects the atmosphere owns. The water
    // must not redeclare `uDcHazeColor` — a duplicate uniform declaration is a
    // GLSL redefinition error, not a compiler warning — but it still has to
    // track the sky, so it borrows the values through its own identifiers.
    shader.uniforms.uWsky = { value: skyColor };
    shader.uniforms.uWsun = { value: sunColor };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vDcWorld;")
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        // Two crossing wave trains give a convincing current without a
        // simulation. Amplitude is tiny so it never breaks the shoreline.
        transformed.y += sin(transformed.z * 0.6 + uTime * 2.4) * 0.045
                       + sin(transformed.x * 1.3 - uTime * 1.7) * 0.025;
        vDcWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform sampler2D uFlowMap;
        uniform sampler2D uCaustics;
        uniform sampler2D uRoughTex;
        uniform sampler2D uEmis;
        uniform vec3 uSunDir;
        uniform vec3 uWsky;
        uniform vec3 uWsun;
        varying vec3 vDcWorld;
        `,
      )
      .replace(
        "#include <opaque_fragment>",
        /* glsl */ `
        #include <opaque_fragment>

        // NOTE the anchor: this runs on the LINEAR, PRE-TONE-MAP colour, so
        // every constant below is a linear triple with its sRGB source in a
        // trailing comment. Mixing Fresnel into an already sRGB-encoded frame
        // is the classic "why does my water look like plastic" bug.

        // ── Dual-phase flow (Portal 2 / three.js Water2) ────────────────
        vec2 dcUv = vDcWorld.xz * vec2(0.09, 0.055);
        vec2 dcFlow = vec2(0.06, 0.85);          // downstream direction
        float dcCycle = 0.22;
        float dcHalf = 0.5;
        float dcPhase0 = fract(uTime * dcCycle);
        float dcPhase1 = fract(uTime * dcCycle + dcHalf);
        vec3 dcN0 = texture2D(uFlowMap, dcUv - dcFlow * dcPhase0).rgb;
        vec3 dcN1 = texture2D(uFlowMap, dcUv * 1.37 + 0.37 - dcFlow * dcPhase1).rgb;
        // Triangle wave cross-fade: each sample is swapped out exactly when
        // it has drifted furthest, so no frame ever shows a sliding seam.
        float dcMix = abs((dcPhase0 - dcHalf) / dcHalf);
        vec3 dcNrm = normalize(mix(dcN0, dcN1, dcMix) * 2.0 - 1.0);
        float dcRipple = abs(dcNrm.x) + abs(dcNrm.y);
        vec3 dcNormal = normalize(vec3(dcNrm.x * 0.45, 1.0, dcNrm.y * 0.45));

        vec3 dcView = normalize(cameraPosition - vDcWorld);

        // ── Schlick Fresnel, F0 = 0.02 (water's real normal reflectance) ─
        float dcCos = clamp(dot(dcView, dcNormal), 0.0, 1.0);
        float dcFres = 0.02 + 0.98 * pow(1.0 - dcCos, 5.0);

        // ── Depth tint (Beer-Lambert): shallow edge, deep channel ───────
        // The channel is deepest along its centre line, so the distance from
        // that line is a stand-in for the water column that costs no extra
        // geometry or depth pass (principle 39: fake the part nobody checks).
        // USER DIRECTIVE (natural blue): shallow is sky-blue, the channel
        // saturates to sapphire. Green is pulled out of both stops so the
        // river never reads as turquoise.
        float dcBank = abs(vDcWorld.x - ${RIVER_CENTER_X.toFixed(1)});
        float dcDepth = smoothstep(0.0, 5.4, dcBank);
        // Saturated river blue throughout — no white-cyan, no centre stripe.
        vec3 dcDeep = vec3(0.010, 0.095, 0.420);       // sRGB #0e4cb0
        vec3 dcShallow = vec3(0.035, 0.220, 0.720);    // sRGB #1a78d6
        vec3 dcBody = mix(dcDeep, dcShallow, dcDepth);

        // ── THE GLB WATER TEXTURE (small_flat_cube_of_water.glb) ────────
        // The baked caustic-wave noise, dual-phase scrolled like the normal:
        // two samples drift against each other and cross-fade, so the
        // pattern is ALWAYS moving and never visibly slides. It multiplies
        // the body into bright caustic threads and dark troughs — wave
        // animation straight in the shader, zero CPU.
        #ifdef DC_WATER_LOW
        float dcCau = texture2D(uCaustics, dcUv * 1.7 + dcFlow * (dcPhase0 - 0.5) * 1.3).r;
        #else
        float dcCau = mix(
          texture2D(uCaustics, dcUv * 1.7 + dcFlow * (dcPhase0 - 0.5) * 1.3).r,
          texture2D(uCaustics, dcUv * 2.3 + 0.41 - dcFlow * (dcPhase1 - 0.5) * 1.3).r,
          dcMix);
        #endif
        dcBody *= 0.66 + dcCau * 0.70;

        // Sky reflection is kept QUIET so the body stays water-coloured
        // instead of bleaching to white-blue along the centre line.
        vec3 dcSky = uWsky * 0.55 + uWsun * 0.06;
        vec3 dcH = normalize(dcView + uSunDir);
        float dcSpec = pow(max(dot(dcNormal, dcH), 0.0), 220.0) * 1.1;
        float dcSheen = pow(max(dot(dcNormal, dcH), 0.0), 36.0) * 0.07;
        // The GLB's roughness map decides where the sun really BITES: the
        // smooth patches (low roughness) catch a hard glint, the choppy
        // ones stay matte — that variation is most of what reads as SHINE.
        #ifndef DC_WATER_LOW
        float dcRgh = texture2D(uRoughTex, dcUv * 1.3 + vec2(dcPhase1 * 0.2, 0.0)).g;
        float dcGlint = mix(1.75, 0.4, dcRgh);
        dcSpec *= dcGlint;
        dcSheen *= dcGlint * 0.8;
        #endif

        vec3 dcCol = mix(dcBody, dcSky, dcFres * 0.28) + uWsun * (dcSpec + dcSheen);

        // The GLB's own photographic surface, drifting slower than the
        // caustics — a mid-depth photo layer the body sits ON. Sun/sky tint
        // keeps it honest at every hour (never glowing at midnight).
        #ifndef DC_WATER_LOW
        vec3 dcPhoto = texture2D(uEmis, dcUv * 0.6 + vec2(uTime * 0.008, 0.0)).rgb;
        dcCol = mix(dcCol, dcPhoto * (uWsun * 0.85 + uWsky * 0.45) * 1.35, 0.26);
        #endif

        // Shoreline foam — a thin bank only, never a white stripe down the
        // middle of the channel.
        float dcEdge = smoothstep(5.15, 6.25, dcBank);
        float dcFoam = dcEdge * 0.35 * smoothstep(0.45, 0.9, dcRipple);

        dcCol = mix(dcCol, vec3(0.42, 0.62, 0.78), clamp(dcFoam, 0.0, 0.4));

        gl_FragColor.rgb = mix(gl_FragColor.rgb * vec3(0.15, 0.35, 0.85), dcCol, 0.94);
        gl_FragColor.a = clamp(mix(0.88, 0.98, dcFres * 0.4) + dcFoam * 0.06, 0.0, 1.0);
        `,
      );
    riverMat.userData.shader = shader;
  };

  const river = new THREE.Mesh(riverGeo, riverMat);
  river.position.set(RIVER_CENTER_X, WATER_LEVEL, 0);
  river.renderOrder = 1;
  group.add(river);

  // Wet sandy riverbed under the translucent surface — a tropical stream
  // runs over pale grit, not dark slate.
  const bed = new THREE.Mesh(
    new THREE.PlaneGeometry(13.5, RIVER_LENGTH + 2),
    new THREE.MeshLambertMaterial({ map: tex.rock, color: 0x3d6e88 }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(RIVER_CENTER_X, WATER_LEVEL - 0.75, 0);
  group.add(bed);

  // ── Cliff + waterfall ────────────────────────────────────────────────
  const cliffGeo = new THREE.BoxGeometry(20, 20, 16, 3, 3, 3);
  const cliffPos = cliffGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cliffPos.count; i += 1) {
    cliffPos.setXYZ(
      i,
      cliffPos.getX(i) + (Math.random() - 0.5) * 1.8,
      cliffPos.getY(i) + (Math.random() - 0.5) * 1.4,
      cliffPos.getZ(i) + (Math.random() - 0.5) * 1.8,
    );
  }
  cliffGeo.computeVertexNormals();
  const cliff = new THREE.Mesh(
    cliffGeo,
    new THREE.MeshStandardMaterial({
      map: tex.rock,
      normalMap: tex.rockNormal,
      color: 0x8e9792,
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    }),
  );
  cliff.position.set(RIVER_CENTER_X, 7, -46);
  cliff.castShadow = budget.shadowMapSize > 0;
  cliff.receiveShadow = budget.shadowMapSize > 0;
  group.add(cliff);

  // ── Waterfall sheet ──────────────────────────────────────────────────
  //
  // A single scrolling plane reads as a flat curtain. Three cheap additions
  // fix that, all in the fragment shader:
  //   * two vertically-scrolling samples at different speeds and scales, so
  //     the water has fast surface streaks over a slower body;
  //   * the sheet goes from clear at the lip to churned white at the base,
  //     which is what a real fall does as it entrains air;
  //   * vertical streak noise so it breaks into ropes instead of a sheet.
  const fallTex = tex.water.clone();
  fallTex.needsUpdate = true;
  fallTex.wrapS = THREE.RepeatWrapping;
  fallTex.wrapT = THREE.RepeatWrapping;
  fallTex.repeat.set(1.4, 5);
  const fallMat = new THREE.MeshStandardMaterial({
    map: fallTex,
    color: 0xe8f6ff,
    transparent: true,
    opacity: 0.9,
    roughness: 0.16,
    // Aerated whitewater is a dielectric scatterer, not a metal (§9 again).
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  fallMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWsun = { value: sunColor };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime;\nuniform vec3 uWsun;",
      )
      .replace(
        "#include <opaque_fragment>",
        /* glsl */ `
        #include <opaque_fragment>
        // Linear, pre-tone-map (see the river above).
        //
        // NOTE: there is deliberately NO "uniform sampler2D map;" declaration
        // here. Three already declares it under USE_MAP, and redeclaring a
        // uniform is a GLSL error that only surfaces in a real browser — the
        // line this replaced was exactly that bug.
        //
        // vMapUv.y runs 0 at the base to 1 at the lip.
        float dcDrop = 1.0 - vMapUv.y;

        // Two speeds: a fast surface streak over a slower body.
        float dcA = texture2D(map, vMapUv * vec2(1.0, 2.0) + vec2(0.0, -uTime * 1.9)).r;
        float dcB = texture2D(map, vMapUv * vec2(2.3, 3.7) + vec2(0.13, -uTime * 3.1)).r;

        // Vertical ropes — a fall separates into strands, it is not a sheet.
        float dcRope = 0.55 + 0.45 * sin(vMapUv.x * 46.0 + dcA * 5.0);

        // Aeration: clear at the lip, churned white at the base.
        float dcFoam = smoothstep(0.25, 1.0, dcDrop);
        vec3 dcClear = vec3(0.36, 0.68, 0.82);   // sRGB #9bd0e0 — tropical water
        vec3 dcCol = mix(dcClear, vec3(1.0), clamp(dcFoam * 0.9 + dcB * 0.25, 0.0, 1.0));
        dcCol *= 0.72 + dcRope * 0.4;

        // The sun catches the spray: the same colour the sky uses to light the
        // meadow reaches into the whitewater too.
        dcCol += uWsun * dcFoam * 0.06;

        gl_FragColor.rgb = mix(gl_FragColor.rgb, dcCol, 0.85);
        gl_FragColor.a *= clamp(0.45 + dcDrop * 0.75 + dcB * 0.2, 0.0, 1.0);
        `,
      );
    fallMat.userData.shader = shader;
  };
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 19, 1, 10), fallMat);
  fall.position.set(RIVER_CENTER_X, 5.4, -37.4);
  group.add(fall);

  // ── Spray ────────────────────────────────────────────────────────────
  //
  // The old cloud drifted straight up and teleported back down, which reads
  // as rising smoke, not splash. Real plunge-pool spray bursts UP and OUTWARD
  // from the impact point, slows under gravity, then falls back — so each
  // particle now carries a small ballistic velocity and is respawned at the
  // impact point when it lands. Still one draw call and one typed-array loop.
  const count = budget.waterfallParticles;
  const IMPACT_X = RIVER_CENTER_X;
  const IMPACT_Y = -1.2;
  const IMPACT_Z = -36.4;
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const life = new Float32Array(count);

  const seedParticle = (i: number) => {
    // Burst from a small disc at the foot of the fall.
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 2.6;
    positions[i * 3] = IMPACT_X + Math.cos(a) * r;
    positions[i * 3 + 1] = IMPACT_Y + Math.random() * 0.5;
    positions[i * 3 + 2] = IMPACT_Z + Math.sin(a) * r * 0.7;
    // Up and outward, biased downstream.
    const speed = 1.6 + Math.random() * 2.8;
    velocities[i * 3] = Math.cos(a) * (0.5 + Math.random() * 1.1);
    velocities[i * 3 + 1] = speed;
    velocities[i * 3 + 2] = Math.sin(a) * (0.4 + Math.random() * 0.9) + 0.7;
    life[i] = 0.7 + Math.random() * 1.9;
  };
  for (let i = 0; i < count; i += 1) {
    seedParticle(i);
    // Stagger the first cycle so they do not all burst on frame one.
    life[i] *= Math.random();
  }

  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const spray = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      map: tex.cloud,
      color: 0xffffff,
      size: 0.62,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    }),
  );
  spray.frustumCulled = false;
  group.add(spray);

  const attr = pGeo.attributes.position as THREE.BufferAttribute;

  // ── THE OCEAN ──────────────────────────────────────────────────────────
  //
  // The island's drowned edge, flooded to OCEAN_LEVEL. Everything about this
  // mesh is chosen for a mobile budget:
  //
  //   * ONE radial disc, ~7 k vertices: rings are spaced by hand so most of
  //     them sit where the shoreline actually meanders (~1050–1400 m from
  //     centre) and the far field is a handful of huge rings. ~13 k triangles
  //     total — less than one mid-distance tree crown.
  //   * FLOOD MASK BAKED PER VERTEX. Water may only exist where the terrain
  //     is actually below sea level AND past the coast ring (see
  //     `coastWeight`) — otherwise a dry inland basin that sits below
  //     sea level 700 m inland, would flood. Vertices whose mask says "dry"
  //     are dropped 90 m under the ground in the vertex shader, which is the
  //     standard mobile shoreline trick: no stencil, no depth texture, no
  //     second pass.
  //   * DEPTH IS BAKED TOO. `OCEAN_LEVEL − terrainHeight` at build time,
  //     interpolated per fragment, is what drives the tropical colour ramp
  //     (shallow turquoise shelf → clear blue → deep) and the foam line,
  //     for the cost of one attribute — no depth pre-pass, no render target.
  //   * THE SHADER is the river's recipe retargeted: dual-phase flow normals,
  //     Schlick Fresnel against the LIVE sky colours, a GGX-ish sun glint on
  //     the shared sun vector, and depth grades. All analytic, all linear
  //     pre-tone-map, ~30 ALU + 2 fetches per fragment.
  const OCEAN_RING_RADII = [
    0, 160, 340, 540, 740, 900, 970, 1020, 1060, 1095, 1125, 1155, 1185, 1215,
    1245, 1275, 1310, 1350, 1400, 1470, 1580, 1760, 2050, 2450, 2950, 3450,
  ];
  const OCEAN_SEGMENTS = 256;
  const oceanGeo = new THREE.BufferGeometry();
  {
    const ringCount = OCEAN_RING_RADII.length;
    const vertCount = 1 + (ringCount - 1) * (OCEAN_SEGMENTS + 1);
    const pos = new Float32Array(vertCount * 3);
    const depth = new Float32Array(vertCount);
    // Centre vertex.
    pos[0] = 0;
    pos[2] = 0;
    depth[0] = -1;
    let v = 1;
    for (let r = 1; r < ringCount; r += 1) {
      const radius = OCEAN_RING_RADII[r];
      for (let s = 0; s <= OCEAN_SEGMENTS; s += 1) {
        const a = (s / OCEAN_SEGMENTS) * Math.PI * 2;
        const x = Math.cos(a) * radius;
        const z = Math.sin(a) * radius;
        pos[v * 3] = x;
        pos[v * 3 + 1] = 0;
        pos[v * 3 + 2] = z;
        // The flood mask + water column in one number: −1 = dry (collapsed
        // under the terrain), 0… = metres of water over the bed.
        depth[v] = coastWeight(x, z) > 0.42
          ? Math.max(0, OCEAN_LEVEL - terrainHeight(x, z))
          : -1;
        v += 1;
      }
    }
    const idx: number[] = [];
    for (let s = 0; s < OCEAN_SEGMENTS; s += 1) idx.push(0, 1 + s + 1, 1 + s);
    for (let r = 1; r < ringCount - 1; r += 1) {
      const a0 = 1 + (r - 1) * (OCEAN_SEGMENTS + 1);
      const a1 = a0 + OCEAN_SEGMENTS + 1;
      for (let s = 0; s < OCEAN_SEGMENTS; s += 1) {
        idx.push(a0 + s, a0 + s + 1, a1 + s);
        idx.push(a0 + s + 1, a1 + s + 1, a1 + s);
      }
    }
    oceanGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    oceanGeo.setAttribute("aDcDepth", new THREE.BufferAttribute(depth, 1));
    oceanGeo.setIndex(idx);
  }

  const oceanNormTex = normTex.clone();
  oceanNormTex.needsUpdate = true;
  oceanNormTex.wrapS = THREE.RepeatWrapping;
  oceanNormTex.wrapT = THREE.RepeatWrapping;

  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.11,
    metalness: 0.0,
    transparent: true,
  });
  // Same low-tier contract as the river: caustics stay, the roughness-glint
  // and photographic layers compile out (see the river block above).
  if (budget.tier === "low") (oceanMat as THREE.Material & { defines?: Record<string, string> }).defines = { DC_WATER_LOW: "" };
  oceanMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uFlowMap = { value: oceanNormTex };
    shader.uniforms.uCaustics = { value: waterPhotos?.caustics ?? oceanNormTex };
    shader.uniforms.uRoughTex = { value: waterPhotos?.roughness ?? oceanNormTex };
    shader.uniforms.uEmis = { value: waterPhotos?.emissive ?? oceanNormTex };
    shader.uniforms.uSunDir = { value: sunDir };
    // The same live sky/sun colour objects the river borrows — one write in
    // `daylight`, every water surface follows.
    shader.uniforms.uWsky = { value: skyColor };
    shader.uniforms.uWsun = { value: sunColor };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform float uTime;
        attribute float aDcDepth;
        varying float vDcDepth;
        varying vec3 vDcWorld;
        `,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        // Dry vertices sink; wet ones ride a long, low ocean swell. The swell
        // amplitude is deliberately a few centimetres — a mobile ocean moves,
        // it does not simulation-slosh.
        if ( aDcDepth < 0.0 ) {
          transformed.y -= 90.0;
          vDcDepth = -1.0;
        } else {
          vDcDepth = aDcDepth;
          transformed.y += sin( transformed.x * 0.011 + uTime * 0.9 ) * 0.05
                         + sin( transformed.z * 0.013 - uTime * 0.7 ) * 0.045;
        }
        vDcWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform sampler2D uFlowMap;
        uniform sampler2D uCaustics;
        uniform sampler2D uRoughTex;
        uniform sampler2D uEmis;
        uniform vec3 uSunDir;
        uniform vec3 uWsky;
        uniform vec3 uWsun;
        varying float vDcDepth;
        varying vec3 vDcWorld;
        `,
      )
      .replace(
        "#include <opaque_fragment>",
        /* glsl */ `
        #include <opaque_fragment>

        if ( vDcDepth >= 0.0 ) {
          // Dual-phase flow normals — the same regeneration trick the river
          // uses, at ocean scale and two crossing directions.
          vec2 dcUv = vDcWorld.xz * 0.0085;
          vec2 dcFlowA = vec2( 0.84, 0.31 );
          vec2 dcFlowB = vec2( -0.42, 0.78 );
          float dcCycle = 0.16;
          float dcHalf = 0.5;
          float dcPhase0 = fract( uTime * dcCycle );
          float dcPhase1 = fract( uTime * dcCycle + dcHalf );
          vec3 dcN0 = texture2D( uFlowMap, dcUv - dcFlowA * dcPhase0 ).rgb;
          vec3 dcN1 = texture2D( uFlowMap, dcUv * 1.41 + 0.19 - dcFlowB * dcPhase1 ).rgb;
          float dcMix = abs( ( dcPhase0 - dcHalf ) / dcHalf );
          vec3 dcNrm = normalize( mix( dcN0, dcN1, dcMix ) * 2.0 - 1.0 );
          // Calm tropics: the normal is mostly UP, with a gentle swell tilt.
          vec3 dcNormal = normalize( vec3( dcNrm.x * 0.34, 1.0, dcNrm.y * 0.34 ) );

          // Schlick Fresnel, F0 = 0.02 — real water reflectance.
          vec3 dcView = normalize( cameraPosition - vDcWorld );
          float dcCos = clamp( dot( dcView, dcNormal ), 0.0, 1.0 );
          float dcFres = 0.02 + 0.98 * pow( 1.0 - dcCos, 5.0 );

          // USER DIRECTIVE (natural blue): depth decides the hue.
          //   0–2.5 m   bright sky-blue over the sand shelf
          //   2.5–9 m   clear sapphire
          //   9 m +     deep, saturated sea blue
          float dcD = clamp( vDcDepth, 0.0, 14.0 );
          vec3 dcShallowC = vec3( 0.030, 0.210, 0.700 );  // water blue
          vec3 dcMidC     = vec3( 0.012, 0.130, 0.560 );  // mid
          vec3 dcDeepC    = vec3( 0.004, 0.045, 0.280 );  // deep sea
          vec3 dcBody = mix( dcShallowC, dcMidC, smoothstep( 0.6, 6.0, dcD ) );
          dcBody = mix( dcBody, dcDeepC, smoothstep( 6.0, 13.0, dcD ) );

          // ── THE GLB WATER TEXTURE (small_flat_cube_of_water.glb) ──────
          // The same caustic noise the river wears, at ocean scale: broad
          // drifting bands of light over the swell, dual-phase cross-faded
          // so the pattern regenerates forever.
          #ifdef DC_WATER_LOW
          float dcCau = texture2D( uCaustics, dcUv * 4.1 + dcFlowA * ( dcPhase0 - 0.5 ) * 0.8 ).r;
          #else
          float dcCau = mix(
            texture2D( uCaustics, dcUv * 4.1 + dcFlowA * ( dcPhase0 - 0.5 ) * 0.8 ).r,
            texture2D( uCaustics, dcUv * 5.6 + 0.27 - dcFlowB * ( dcPhase1 - 0.5 ) * 0.8 ).r,
            dcMix );
          #endif
          dcBody *= 0.68 + dcCau * 0.66;

          vec3 dcSky = uWsky * 0.5 + uWsun * 0.05;
          vec3 dcH = normalize( dcView + uSunDir );
          float dcSpec = pow( max( dot( dcNormal, dcH ), 0.0 ), 280.0 ) * 1.05;
          float dcSheen = pow( max( dot( dcNormal, dcH ), 0.0 ), 40.0 ) * 0.06;
          // The GLB's roughness map: smooth patches throw a hard sun glint,
          // choppy ones stay matte — the SHINE is textured, not uniform.
          #ifndef DC_WATER_LOW
          float dcRgh = texture2D( uRoughTex, dcUv * 5.2 + vec2( dcPhase1 * 0.14, 0.0 ) ).g;
          float dcGlint = mix( 1.8, 0.4, dcRgh );
          dcSpec *= dcGlint;
          dcSheen *= dcGlint * 0.8;
          #endif
          vec3 dcCol = mix( dcBody, dcSky, dcFres * 0.26 ) + uWsun * ( dcSpec + dcSheen );

          // The GLB's photographic ocean, drifting slowly under everything —
          // a deep-water photo layer tinted by the live sun/sky so it stays
          // honest at every hour.
          #ifndef DC_WATER_LOW
          vec3 dcPhoto = texture2D( uEmis, dcUv * 2.3 + vec2( uTime * 0.006, -uTime * 0.004 ) ).rgb;
          dcCol = mix( dcCol, dcPhoto * ( uWsun * 0.85 + uWsky * 0.45 ) * 1.35, 0.30 );
          #endif

          float dcBreak = texture2D( uFlowMap, dcUv * 3.1 + vec2( uTime * 0.02, -uTime * 0.017 ) ).r;
          float dcLine = 0.85 + 0.55 * sin( uTime * 0.7 + vDcWorld.x * 0.05 + vDcWorld.z * 0.043 );
          float dcFoam = ( 1.0 - smoothstep( 0.0, 1.15 * dcLine, dcD ) ) * smoothstep( 0.45, 0.85, dcBreak * 0.5 + dcNrm.y * 0.3 );
          dcCol = mix( dcCol, vec3( 0.38, 0.58, 0.76 ), clamp( dcFoam, 0.0, 0.35 ) );

          gl_FragColor.rgb = mix( gl_FragColor.rgb * vec3( 0.12, 0.32, 0.82 ), dcCol, 0.96 );
          gl_FragColor.a = clamp( mix( 0.86, 0.98, smoothstep( 0.0, 5.0, dcD ) ) + dcFoam * 0.08, 0.0, 1.0 );
        }
        `,
      );
    oceanMat.userData.shader = shader;
  };

  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.set(0, OCEAN_LEVEL, 0);
  ocean.renderOrder = 2; // after the river (1), both transparent
  ocean.frustumCulled = false; // one disc, always in view somewhere
  ocean.name = "ocean";
  group.add(ocean);

  let frozen = false;
  return {
    group,
    // NOTE: the ocean materials are APPENDED. The shader harness addresses
    // the river/fall/spray by index ([0]/[3]/[4]) — keep them stable.
    materials: [riverMat, bed.material as THREE.Material, cliff.material as THREE.Material, fallMat, spray.material as THREE.Material, oceanMat],
    iceMaterials: [riverMat, fallMat, oceanMat],
    setFrozen(value) {
      frozen = value;
      spray.visible = !value;
    },
    setPhotos(photos) {
      waterPhotos = photos;
      // Live uniform swap on whichever shaders are already compiled; the
      // onBeforeCompile closures read the same reference for the rest.
      for (const mat of [riverMat, oceanMat]) {
        const sh = mat.userData.shader as { uniforms: Record<string, { value: unknown }> } | undefined;
        if (!sh) continue;
        sh.uniforms.uCaustics.value = photos.caustics;
        sh.uniforms.uRoughTex.value = photos.roughness;
        sh.uniforms.uEmis.value = photos.emissive;
      }
      // The GLB caustics also BECOME the river's and the fall's albedo maps
      // (the map slot animates by scrolling UV, already driven per frame).
      if (photos.caustics.image) {
        flowTex.image = photos.caustics.image;
        flowTex.needsUpdate = true;
        fallTex.image = photos.caustics.image;
        fallTex.needsUpdate = true;
      }
    },
    update(dt, time, cameraPos) {
      if (frozen) return;
      const shader = riverMat.userData.shader as { uniforms: Record<string, { value: number }> } | undefined;
      if (shader) shader.uniforms.uTime.value = time;

      // Ocean clock — one uniform per frame for the whole sea.
      const oceanShader = oceanMat.userData.shader as { uniforms: Record<string, { value: number }> } | undefined;
      if (oceanShader) oceanShader.uniforms.uTime.value = time;

      // Scrolling UVs = flowing water, one float per frame.
      flowTex.offset.y = (time * 0.28) % 1;
      flowTex.offset.x = Math.sin(time * 0.15) * 0.04;
      fallTex.offset.y = (-time * 1.35) % 1;
      const fallShader = fallMat.userData.shader as { uniforms: Record<string, { value: number }> } | undefined;
      if (fallShader) fallShader.uniforms.uTime.value = time;

      // INTEREST MANAGEMENT for the plunge-pool debris. Past ~90 m the spray
      // is a few pixels and per-particle integration is pure waste — the
      // classic "debris physics gets culled, not simulated" rule. One
      // squared-distance test per ambient tick; the Points object and its
      // typed arrays stay allocated (zero churn), they just stop ticking
      // and hide. The waterfall sheet itself is a world landmark visible
      // from the whole meadow, so it always renders.
      if (cameraPos) {
        const dx = cameraPos.x - IMPACT_X;
        const dz = cameraPos.z - IMPACT_Z;
        const near = dx * dx + dz * dz < 8100; // 90 m
        if (spray.visible !== near) spray.visible = near;
        if (!near) return;
      } else if (!spray.visible) {
        spray.visible = true;
      }

      // Ballistic spray: integrate, apply gravity and drag, respawn on death.
      const arr = attr.array as Float32Array;
      const g = 6.4 * dt;
      const drag = 1 - 0.9 * dt;
      for (let i = 0; i < count; i += 1) {
        life[i] -= dt;
        const p = i * 3;
        if (life[i] <= 0 || arr[p + 1] < IMPACT_Y - 0.6) {
          seedParticle(i);
          arr[p] = positions[p];
          arr[p + 1] = positions[p + 1];
          arr[p + 2] = positions[p + 2];
          continue;
        }
        velocities[p + 1] -= g;
        velocities[p] *= drag;
        velocities[p + 2] *= drag;
        arr[p] += velocities[p] * dt;
        arr[p + 1] += velocities[p + 1] * dt;
        arr[p + 2] += velocities[p + 2] * dt;
      }
      attr.needsUpdate = true;
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose?.();
      });
      flowTex.dispose();
      fallTex.dispose();
      if (waterPhotos) {
        waterPhotos.caustics.dispose();
        waterPhotos.roughness.dispose();
        waterPhotos.emissive.dispose();
      }
      group.clear();
    },
  };
}
