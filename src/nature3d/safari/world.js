import * as THREE from 'three';
import { fbm, vnoise, rng, smoothstep, lerp, clamp } from './noise.js';
import { MAP, WALK, RIVER, BRIDGE, ITEMS, PATH_POINTS, SPECIAL_TREES, PLAYER_START } from './data.js';
import { clayMaterial, clayBump } from './clay.js';
import { NavGrid } from './nav.js';

// ------------------------------------------------------------------ heights
export function inBridge(x, z) { return Math.abs(z - BRIDGE.z) < BRIDGE.halfW && Math.abs(x - BRIDGE.x) < BRIDGE.halfLen; }
export function bridgeY(x) { const t = clamp((x - BRIDGE.x) / BRIDGE.halfLen, -1, 1); return BRIDGE.base + BRIDGE.rise * Math.cos(t * Math.PI / 2); }

export function terrainHeight(x, z) {
  let h = (fbm(x * 0.05 + 10, z * 0.05 + 10, 3) - 0.5) * 1.4 + (fbm(x * 0.2 + 5, z * 0.2 + 5, 2) - 0.5) * 0.22 + 0.15;
  if (h < -0.05) h = -0.05 + (h + 0.05) * 0.25;      // soft floor: dry land never sinks toward the water level
  // bridge apron: flat landing on both banks
  const ap = (1 - smoothstep(2.0, 3.6, Math.abs(z - BRIDGE.z))) * (1 - smoothstep(5.0, 8.5, Math.abs(x - BRIDGE.x)));
  h = lerp(h, 0.05, ap);
  const d = Math.abs(x - RIVER.x(z));
  const carve = 1 - smoothstep(RIVER.halfWidth - 0.6, RIVER.halfWidth + 1.5, d);
  const bed = -1.6 + 0.12 * Math.sin(x * 0.9) * Math.sin(z * 0.7);
  h = lerp(h, bed, carve);
  const rim = Math.max(smoothstep(33, 42, Math.abs(x)), smoothstep(23, 30, Math.abs(z)));
  h += rim * (2.2 + 3.4 * vnoise(x * 0.11 + 3, z * 0.11 + 7));
  return h;
}
export function surfaceHeight(x, z) {
  if (inBridge(x, z)) return Math.max(bridgeY(x) + 0.1, terrainHeight(x, z));
  return terrainHeight(x, z);
}

// ------------------------------------------------------------------ helpers
const C = (h) => new THREE.Color(h);
const PAL = {
  sand: C('#F2D6A0'), sand2: C('#E7C48A'), grass: C('#8FCB4E'), grass2: C('#6FB63C'), grass3: C('#A7DA62'),
  beach: C('#F8E6BC'), bed: C('#C6B892'), path: C('#FCEFCF'), hill: C('#9ED063'), hillSand: C('#EFD9A4'),
  trunk: ['#8B5E3C', '#9C6B45', '#7A5033'], canopy: ['#7CC24A', '#63B03A', '#93CF5A', '#55A83B', '#A6D95E'],
  bush: ['#86C94F', '#6DBB44', '#9AD25A'], rock: ['#D9B98C', '#CDB28A', '#E0C49A', '#BFAF95'],
  flowers: ['#F48FB1', '#FFB74D', '#FFF176', '#81D4FA', '#B39DDB', '#F06292', '#FF8A65', '#FFFFFF'],
};

function pathSamples() {
  const pts = PATH_POINTS.map(p => new THREE.Vector3(p[0], 0, p[1]));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  return curve.getSpacedPoints(500);
}
function distToPath(samples, x, z) {
  let best = Infinity;
  for (let i = 0; i < samples.length; i++) { const dx = samples[i].x - x, dz = samples[i].z - z; const d = dx * dx + dz * dz; if (d < best) best = d; }
  return Math.sqrt(best);
}

// ------------------------------------------------------------------ world
// `district: true` builds ONLY the ground-level contents of the safari — its
// terrain skin, river, vegetation, rocks and bridge. The sky, sun, lights and
// clouds are skipped, because when the safari is a district inside the single
// connected Sanctuary world those are already provided once, globally, and a
// second sky sphere or a second directional light would double-light the
// scene and cost a full extra shadow pass.
export function buildWorld(scene, { isMobile, district = false }) {
  const r = rng(2026);
  const world = { obstacles: [], updaters: [], samples: pathSamples() };
  const bump = clayBump();

  // ---- lights & sky (own-world only)
  if (!district) {
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0xe8c99a, 0.9);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xfff4e0, 0.25));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
  sun.position.set(28, 46, 22);
  sun.castShadow = true;
  const S = isMobile ? 2048 : 4096;
  sun.shadow.mapSize.set(S, S);
  sun.shadow.camera.left = -50; sun.shadow.camera.right = 50; sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  world.sun = sun;
  world.sunDir = sun.position.clone().normalize();

  scene.fog = new THREE.Fog(0xdff3ff, 80, 190);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: C('#4fb0ee') }, mid: { value: C('#9bdcf8') }, hor: { value: C('#eaf8ff') } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, mid, hor; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h < 0.18 ? mix(hor, mid, smoothstep(-0.05, 0.18, h)) : mix(mid, top, smoothstep(0.18, 0.75, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMat);
  scene.add(sky);

  // ---- smiling sun
  const sunG = new THREE.Group();
  sunG.position.set(95, 78, -190);
  const sunBasic = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
  sunG.add(new THREE.Mesh(new THREE.SphereGeometry(11, 32, 24), sunBasic('#FFD34D')));
  const rays = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const ray = new THREE.Mesh(new THREE.BoxGeometry(2.6, 7, 1.4), sunBasic('#FFC63A'));
    const a = i / 12 * Math.PI * 2;
    ray.position.set(Math.cos(a) * 15.5, Math.sin(a) * 15.5, 0);
    ray.rotation.z = a - Math.PI / 2;
    rays.add(ray);
  }
  sunG.add(rays);
  const faceMat = sunBasic('#8A5A2B');
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), faceMat); e.position.set(s * 4, 2.2, 10.4); sunG.add(e); }
  const cheekMat = sunBasic('#FFA8A0');
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), cheekMat); e.position.set(s * 6.2, -0.6, 9.4); e.scale.set(1, 0.7, 0.5); sunG.add(e); }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.45, 8, 20, Math.PI), faceMat);
  smile.rotation.z = Math.PI; smile.position.set(0, -1.2, 10.6); sunG.add(smile);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('#FFE9A0'), color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(70, 70, 1); glow.position.z = -2; sunG.add(glow);
  sunG.lookAt(0, 10, 0);
  scene.add(sunG);
  world.updaters.push((dt, t) => { rays.rotation.z = t * 0.12; sunG.children[0].scale.setScalar(1 + Math.sin(t * 1.4) * 0.03); });
  }

  // ---- terrain
  const nx = MAP.w * 2, nz = MAP.h * 2;
  const geo = new THREE.PlaneGeometry(MAP.w, MAP.h, nx, nz);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = -pos.getY(i);
    const h = terrainHeight(x, z);
    pos.setXYZ(i, x, h, z);
    // colour
    const d = Math.abs(x - RIVER.x(z));
    const side = smoothstep(-3, 3, x - RIVER.x(z));
    const n1 = fbm(x * 0.15, z * 0.15, 2), n2 = fbm(x * 0.4 + 9, z * 0.4 + 9, 2);
    const sand = tmp.copy(PAL.sand).lerp(PAL.sand2, n1).clone();
    const grass = tmp.copy(PAL.grass).lerp(PAL.grass2, n2).lerp(PAL.grass3, smoothstep(0.55, 0.8, n1) * 0.7).clone();
    let c = sand.lerp(grass, side);
    const shore = 1 - smoothstep(RIVER.halfWidth + 0.5, RIVER.halfWidth + 1.7, d);
    c.lerp(PAL.beach, shore);
    if (h < RIVER.level + 0.05) c.lerp(PAL.bed, smoothstep(RIVER.level + 0.05, RIVER.level - 0.6, h));
    const dp = distToPath(world.samples, x, z);
    const pathT = (1 - smoothstep(0.9, 1.7, dp + (n2 - 0.5) * 0.6)) * (h > RIVER.level + 0.1 ? 1 : 0);
    c.lerp(PAL.path, pathT * 0.85);
    const rim = Math.max(smoothstep(33, 42, Math.abs(x)), smoothstep(23, 30, Math.abs(z)));
    c.lerp(x - RIVER.x(z) < 0 ? PAL.hillSand.clone().lerp(PAL.hill, 0.5) : PAL.hill, rim * 0.85);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrainBump = bump.clone(); terrainBump.repeat.set(40, 30); terrainBump.needsUpdate = true;
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, bumpMap: terrainBump, bumpScale: 0.35 });
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true; terrain.castShadow = false;
  terrain.name = 'terrain';
  scene.add(terrain);
  world.terrain = terrain;

  // diorama skirt: a clay slab wall hanging from the terrain edge so the world reads as a tabletop model
  {
    const hw = MAP.w / 2, hh = MAP.h / 2, step = 0.5, bottom = -7;
    const loop = [];
    for (let x = -hw; x < hw; x += step) loop.push([x, -hh]);
    for (let z = -hh; z < hh; z += step) loop.push([hw, z]);
    for (let x = hw; x > -hw; x -= step) loop.push([x, hh]);
    for (let z = hh; z > -hh; z -= step) loop.push([-hw, z]);
    const n = loop.length, v = new Float32Array(n * 2 * 3), col = new Float32Array(n * 2 * 3), idx = [];
    const topC = C('#E9CFA5'), botC = C('#C79E72');
    loop.forEach(([x, z], i) => {
      const h = terrainHeight(x, z) - 0.02;
      v.set([x, h, z], i * 6); v.set([x, bottom, z], i * 6 + 3);
      col.set([topC.r, topC.g, topC.b], i * 6); col.set([botC.r, botC.g, botC.b], i * 6 + 3);
      const j = (i + 1) % n;
      idx.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1);
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(v, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3)); sg.setIndex(idx);
    sg.computeVertexNormals();
    const skirt = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
    skirt.receiveShadow = true; scene.add(skirt);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(MAP.w + 0.02, 1.2, MAP.h + 0.02), clayMaterial(0xc79e72, { roughness: 0.95 }));
    slab.position.y = bottom - 0.6; scene.add(slab);
  }

  // ---- water
  const uTime = { value: 0 };
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x66c4ee, roughness: 0.28, metalness: 0.0, transparent: true, opacity: 0.92 });
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uRiver = { value: new THREE.Vector3(RIVER.A, RIVER.B, RIVER.C) };
    sh.uniforms.uHalf = { value: RIVER.halfWidth };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0 = modelMatrix * vec4(position, 1.0);
        transformed.y += sin(wp0.x * 1.4 + uTime * 1.6) * 0.03 + sin(wp0.z * 1.1 - uTime * 1.2) * 0.03;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uRiver; uniform float uHalf; varying vec3 vWPos;
        float hashw(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noisew(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hashw(i), hashw(i+vec2(1,0)), f.x), mix(hashw(i+vec2(0,1)), hashw(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float xc = uRiver.x * sin(uRiver.y * vWPos.z + uRiver.z);
        float d = abs(vWPos.x - xc);
        float deep = 1.0 - smoothstep(uHalf - 1.8, uHalf + 0.6, d);
        vec3 col = mix(vec3(0.50, 0.84, 0.95), vec3(0.18, 0.55, 0.90), deep);
        vec2 p = vec2(vWPos.x * 0.8, vWPos.z * 0.3 - uTime * 0.25);
        float n = noisew(p * 2.0) * 0.6 + noisew(p * 4.3 + 3.1) * 0.4;
        col += smoothstep(0.52, 0.74, n) * 0.30;
        float fn = noisew(vec2(vWPos.x * 1.6, vWPos.z * 1.6 - uTime * 0.5));
        float foam = smoothstep(uHalf + 0.15, uHalf + 0.95, d + (fn - 0.5) * 0.9);
        col = mix(col, vec3(1.0), foam * 0.9);
        diffuseColor.rgb = col;`);
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w, MAP.h, 84, 60), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = RIVER.level;
  water.receiveShadow = true; water.name = 'water';
  scene.add(water);
  world.water = water;
  world.updaters.push((dt, t) => { uTime.value = t; });

  // ---- placement helpers
  const items = ITEMS;
  const placed = []; // {x,z,r}
  const nearPath = (x, z, m) => distToPath(world.samples, x, z) < m;
  const nearRiver = (x, z, m) => Math.abs(x - RIVER.x(z)) < RIVER.halfWidth + m;
  const isRim = (x, z) => Math.abs(x) > 34 || Math.abs(z) > 24;
  const free = (x, z, rad, opts = {}) => {
    if (nearRiver(x, z, opts.river ?? 2.4)) return false;
    if (!opts.allowPath && nearPath(x, z, rad + 1.6)) return false;
    if (Math.hypot(x - PLAYER_START.x, z - PLAYER_START.z) < rad + 3) return false;
    if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < rad + 8) return false;
    for (const it of items) if (Math.hypot(x - it.pos[0], z - it.pos[1]) < rad + Math.max(it.r, 1.6) + 0.6) return false;
    for (const it of items) if (it.viewFrom && Math.hypot(x - it.viewFrom[0], z - it.viewFrom[1]) < rad + 1.4) return false;
    for (const t of SPECIAL_TREES) if (Math.hypot(x - t.pos[0], z - t.pos[1]) < rad + 5) return false;
    for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < rad + p.r) return false;
    return true;
  };

  // ---- instanced clay vegetation
  const blobs = [], trunks = [], rocks = [], grass = [], petals = [], centers = [];
  const addBlob = (x, y, z, sx, sy, sz, col) => blobs.push({ x, y, z, sx, sy, sz, col });

  function addTree(x, z, type, s) {
    const h0 = terrainHeight(x, z);
    const trunkCol = r.pick(PAL.trunk);
    if (type === 'blob') {
      trunks.push({ x, y: h0 - 0.2, z, r: 0.32 * s, h: 2.4 * s, col: trunkCol });
      const base = r.pick(PAL.canopy);
      addBlob(x, h0 + 3.0 * s, z, 1.7 * s, 1.5 * s, 1.7 * s, base);
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2, rr = r.range(0.7, 1.2) * s;
        addBlob(x + Math.cos(a) * rr, h0 + (2.4 + r.range(0, 1.2)) * s, z + Math.sin(a) * rr, 1.1 * s, 1.0 * s, 1.1 * s, r.pick(PAL.canopy));
      }
      placed.push({ x, z, r: 1.0 * s, tree: true });
    } else if (type === 'acacia') {
      trunks.push({ x, y: h0 - 0.2, z, r: 0.26 * s, h: 3.4 * s, col: trunkCol });
      addBlob(x, h0 + 3.6 * s, z, 2.7 * s, 0.9 * s, 2.7 * s, r.pick(PAL.canopy));
      addBlob(x + 0.8 * s, h0 + 4.0 * s, z - 0.4 * s, 1.4 * s, 0.7 * s, 1.4 * s, r.pick(PAL.canopy));
      addBlob(x - 0.9 * s, h0 + 3.9 * s, z + 0.6 * s, 1.2 * s, 0.6 * s, 1.2 * s, r.pick(PAL.canopy));
      placed.push({ x, z, r: 0.9 * s, tree: true });
    } else { // baobab
      trunks.push({ x, y: h0 - 0.2, z, r: 1.0 * s, h: 3.2 * s, col: trunkCol, fat: true });
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + r() * 0.5, rr = 0.9 * s;
        addBlob(x + Math.cos(a) * rr, h0 + (3.3 + r.range(0, 0.5)) * s, z + Math.sin(a) * rr, 0.95 * s, 0.85 * s, 0.95 * s, r.pick(PAL.canopy));
      }
      addBlob(x, h0 + 3.9 * s, z, 1.1 * s, 0.9 * s, 1.1 * s, r.pick(PAL.canopy));
      placed.push({ x, z, r: 1.4 * s, tree: true });
    }
  }
  // scattered trees
  let tries = 0, made = 0;
  while (made < 48 && tries++ < 6000) {
    const x = r.range(-41, 41), z = r.range(-29, 29);
    const rim = isRim(x, z);
    if (!free(x, z, 2.6, { river: rim ? 0 : 2.4 })) continue;
    const side = x - RIVER.x(z);
    const type = rim ? (r() < 0.6 ? 'blob' : 'acacia') : side < -2 ? (r() < 0.55 ? 'acacia' : 'baobab') : (r() < 0.78 ? 'blob' : 'acacia');
    addTree(x, z, type, rim ? r.range(0.9, 1.5) : r.range(0.85, 1.3));
    made++;
  }
  // bushes
  tries = 0; made = 0;
  while (made < 80 && tries++ < 6000) {
    const x = r.range(-40, 40), z = r.range(-28, 28);
    if (!free(x, z, 1.0)) continue;
    const s = r.range(0.6, 1.3), h0 = terrainHeight(x, z);
    addBlob(x, h0 + 0.5 * s, z, 1.0 * s, 0.85 * s, 1.0 * s, r.pick(PAL.bush));
    if (r() < 0.6) addBlob(x + 0.7 * s, h0 + 0.35 * s, z + 0.3 * s, 0.7 * s, 0.6 * s, 0.7 * s, r.pick(PAL.bush));
    placed.push({ x, z, r: 0.9 * s });
    made++;
  }
  // rocks
  tries = 0; made = 0;
  while (made < 34 && tries++ < 4000) {
    const x = r.range(-38, 38), z = r.range(-26, 26);
    if (!free(x, z, 1.0, { river: 1.2 })) continue;
    if (x - RIVER.x(z) > 4 && r() < 0.6) continue; // rocks mostly on the sand side
    const s = r.range(0.5, 1.4), h0 = terrainHeight(x, z);
    rocks.push({ x, y: h0 - 0.15 * s, z, sx: 1.0 * s, sy: 0.6 * s, sz: 0.8 * s, rot: r() * Math.PI, col: r.pick(PAL.rock) });
    placed.push({ x, z, r: 0.9 * s });
    made++;
  }
  // grass tufts & flowers
  for (let i = 0; i < 700; i++) {
    const x = r.range(-40, 40), z = r.range(-28, 28);
    if (nearRiver(x, z, 1.0) || nearPath(x, z, 1.3)) continue;
    const side = smoothstep(-3, 3, x - RIVER.x(z));
    if (r() > 0.25 + side * 0.7) continue;
    const h0 = terrainHeight(x, z);
    for (let k = 0; k < 3; k++) grass.push({ x: x + r.range(-0.25, 0.25), y: h0, z: z + r.range(-0.25, 0.25), s: r.range(0.6, 1.3), tilt: r.range(-0.4, 0.4), rot: r() * Math.PI * 2, col: r.pick(PAL.canopy) });
  }
  for (let i = 0; i < 420; i++) {
    const x = r.range(-40, 40), z = r.range(-28, 28);
    if (nearRiver(x, z, 1.4) || nearPath(x, z, 1.4)) continue;
    const side = smoothstep(-3, 3, x - RIVER.x(z));
    if (r() > 0.2 + side * 0.6) continue;
    const h0 = terrainHeight(x, z), s = r.range(0.7, 1.2);
    petals.push({ x, y: h0 + 0.36 * s, z, s, col: r.pick(PAL.flowers) });
    centers.push({ x, y: h0 + 0.4 * s, z, s });
  }

  const inst = (geoI, list, fill, { shadow = true, mat } = {}) => {
    const m = new THREE.InstancedMesh(geoI, mat || clayMaterial(0xffffff, { roughness: 0.8 }), list.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    list.forEach((it, i) => { fill(it, p, e, sc); q.setFromEuler(e); M.compose(p, q, sc); m.setMatrixAt(i, M); m.setColorAt(i, C(it.col || '#ffffff')); });
    m.castShadow = shadow; m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    scene.add(m);
    return m;
  };
  inst(new THREE.SphereGeometry(1, 22, 16), blobs, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, 0, 0); sc.set(it.sx, it.sy, it.sz); });
  const trunkGeo = new THREE.CylinderGeometry(0.72, 1, 1, 14); trunkGeo.translate(0, 0.5, 0);
  inst(trunkGeo, trunks, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, 0, 0); sc.set(it.r, it.h, it.r); });
  inst(new THREE.SphereGeometry(1, 16, 12), rocks, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, it.rot, 0); sc.set(it.sx, it.sy, it.sz); });
  const grassGeo = new THREE.ConeGeometry(0.11, 0.7, 6); grassGeo.translate(0, 0.3, 0);
  inst(grassGeo, grass, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(it.tilt, it.rot, it.tilt * 0.5); sc.set(it.s, it.s, it.s); }, { shadow: false });
  inst(new THREE.SphereGeometry(1, 14, 10), petals, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, 0, 0); sc.set(0.24 * it.s, 0.09 * it.s, 0.24 * it.s); }, { shadow: false });
  inst(new THREE.SphereGeometry(1, 10, 8), centers, (it, p, e, sc) => { p.set(it.x, it.y, it.z); e.set(0, 0, 0); sc.set(0.1 * it.s, 0.09 * it.s, 0.1 * it.s); }, { shadow: false, mat: clayMaterial(0xffd54f, { roughness: 0.6 }) });
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.035, 1, 5); stemGeo.translate(0, 0.5, 0);
  inst(stemGeo, centers, (it, p, e, sc) => { p.set(it.x, it.y - 0.4 * it.s, it.z); e.set(0, 0, 0); sc.set(1, 0.38 * it.s, 1); }, { shadow: false, mat: clayMaterial(0x6dbe5b, { roughness: 0.8 }) });

  // ---- perch trees (bird / monkey)
  world.perches = {};
  for (const t of SPECIAL_TREES) {
    const [x, z] = t.pos, s = t.scale, h0 = terrainHeight(x, z);
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * s, 0.62 * s, 5.0 * s, 16), clayMaterial(0x8b5e3c, { roughness: 0.85 }));
    trunk.position.set(x, h0 + 2.3 * s, z); g.add(trunk);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, t.branchLen + 0.8, 12), trunk.material);
    branch.rotation.z = t.branchDir * Math.PI / 2 - t.branchDir * 0.1;
    branch.position.set(x + t.branchDir * (t.branchLen / 2 + 0.2), h0 + t.branchH - 0.22, z); g.add(branch);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 14, 10), clayMaterial(r.pick(PAL.canopy)));
    knob.position.set(x + t.branchDir * (t.branchLen + 0.9), h0 + t.branchH + 0.45 * s, z); g.add(knob);
    for (let i = 0; i < 6; i++) {
      const a = (i - 1) / 5 * Math.PI * 2, rr = i === 0 ? 0 : 1.25 * s;
      const c = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), clayMaterial(PAL.canopy[i % PAL.canopy.length]));
      c.position.set(x + Math.cos(a) * rr, h0 + (5.2 + (i === 0 ? 0.9 : 0)) * s, z + Math.sin(a) * rr);
      c.scale.setScalar((i === 0 ? 1.9 : 1.3) * s); g.add(c);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    placed.push({ x, z, r: 0.8 * s, tree: true });
  }

  // ---- lion rock
  const lion = items.find(i => i.id === 'lion');
  const rockMat = clayMaterial(0xd9b98c, { roughness: 0.9 });
  const rock = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), rockMat);
  const lh = terrainHeight(lion.pos[0], lion.pos[1]);
  rock.position.set(lion.pos[0], lh - 0.35, lion.pos[1]); rock.scale.set(3.3, 1.45, 2.7); rock.rotation.y = 0.4;
  rock.castShadow = rock.receiveShadow = true; scene.add(rock);
  world.rockTop = lh - 0.35 + 1.45;
  for (const [dx, dz, s] of [[-3.4, 1.4, 1.0], [2.9, 2.0, 0.8], [-1.5, 3.2, 0.6]]) {
    const rk = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), clayMaterial(0xcdb28a, { roughness: 0.9 }));
    rk.position.set(lion.pos[0] + dx, terrainHeight(lion.pos[0] + dx, lion.pos[1] + dz) - 0.2 * s, lion.pos[1] + dz); rk.scale.set(s, 0.6 * s, 0.8 * s);
    rk.castShadow = rk.receiveShadow = true; scene.add(rk);
  }
  placed.push({ x: lion.pos[0], z: lion.pos[1], r: 3.5 });

  // ---- bridge
  const bridge = new THREE.Group();
  const wood = clayMaterial(0xc98f5e, { roughness: 0.8 }), wood2 = clayMaterial(0xa8714b, { roughness: 0.8 });
  const nPl = 13;
  for (let i = 0; i < nPl; i++) {
    const x = BRIDGE.x - BRIDGE.halfLen + (i + 0.5) * (2 * BRIDGE.halfLen / nPl);
    const y = bridgeY(x), dy = (bridgeY(x + 0.05) - bridgeY(x - 0.05)) / 0.1;
    const pl = new THREE.Mesh(new THREE.BoxGeometry(2 * BRIDGE.halfLen / nPl - 0.08, 0.16, BRIDGE.halfW * 2 - 0.2), i % 2 ? wood : wood2);
    pl.position.set(x, y, BRIDGE.z); pl.rotation.z = Math.atan(dy);
    bridge.add(pl);
  }
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const x = BRIDGE.x - BRIDGE.halfLen + i * (2 * BRIDGE.halfLen / 12); pts.push(new THREE.Vector3(x, bridgeY(x) + 0.95, BRIDGE.z + s * (BRIDGE.halfW - 0.1))); }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 8), wood2);
    bridge.add(rail);
    for (let i = 0; i <= 4; i++) {
      const x = BRIDGE.x - BRIDGE.halfLen + 0.3 + i * ((2 * BRIDGE.halfLen - 0.6) / 4);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.0, 10), wood2);
      post.position.set(x, bridgeY(x) + 0.5, BRIDGE.z + s * (BRIDGE.halfW - 0.1)); bridge.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), wood); cap.position.set(x, bridgeY(x) + 1.02, BRIDGE.z + s * (BRIDGE.halfW - 0.1)); bridge.add(cap);
    }
  }
  bridge.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(bridge);

  // ---- clouds (own-world only: the sanctuary sky carries its own)
  if (!district) {
  const cloudList = [];
  for (let i = 0; i < 10; i++) {
    const cx = r.range(-70, 70), cz = r.range(-80, 20), cy = r.range(16, 26), s = r.range(1.4, 2.6);
    const g = new THREE.Group();
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), clayMaterial(0xffffff, { roughness: 0.9, sheen: 0.6 }));
      m.position.set((k - (n - 1) / 2) * 1.3 * s + r.range(-0.3, 0.3), r.range(-0.2, 0.5) * s, r.range(-0.5, 0.5) * s);
      m.scale.setScalar((k === Math.floor(n / 2) ? 1.5 : r.range(0.9, 1.25)) * s);
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(cx, cy, cz);
    scene.add(g);
    cloudList.push({ g, speed: r.range(0.25, 0.6), cy });
  }
  world.updaters.push((dt, t) => { for (const c of cloudList) { c.g.position.x += c.speed * dt; if (c.g.position.x > 90) c.g.position.x = -90; c.g.position.y = c.cy + Math.sin(t * 0.3 + c.cy) * 0.3; } });
  }

  // ---- navigation grid
  const nav = new NavGrid({ minX: -MAP.w / 2, minZ: -MAP.h / 2, w: MAP.w, h: MAP.h, cell: 0.5 });
  const obstacles = placed.map(p => ({ x: p.x, z: p.z, r: p.r + 0.35 }));
  for (const it of items) if (it.r > 0) obstacles.push({ x: it.pos[0], z: it.pos[1], r: it.r + 0.35 });
  nav.build((x, z) => {
    if (Math.abs(x) > WALK.x || Math.abs(z) > WALK.z) return false;
    if (!inBridge(x, z)) {
      const h = terrainHeight(x, z);
      if (h < RIVER.level + 0.18 || h > 1.6) return false;
    }
    for (const o of obstacles) if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return false;
    return true;
  });
  world.nav = nav;
  world.obstacles = obstacles;

  world.update = (dt, t) => { for (const u of world.updaters) u(dt, t); };
  return world;
}

export function radialTexture(color = '#ffffff') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color); g.addColorStop(0.35, color + 'aa'); g.addColorStop(1, color + '00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); return t;
}
