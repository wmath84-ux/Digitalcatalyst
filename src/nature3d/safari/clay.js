// Clay look: rounded shapes + high roughness + faint fingerprint bump + velvety sheen.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, rng } from './noise.js';

let bumpTex = null;
export function clayBump() {
  if (bumpTex) return bumpTex;
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const r = rng(99);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // tileable-ish by sampling on a torus
    const a = x / S * Math.PI * 2, b = y / S * Math.PI * 2;
    const nx = Math.cos(a) * 3 + 10, nz = Math.sin(a) * 3 + 10, ny = Math.cos(b) * 3, nw = Math.sin(b) * 3;
    let v = fbm(nx + ny, nz + nw, 4) * 0.7 + fbm((nx - nw) * 3.1, (nz + ny) * 3.1, 3) * 0.3;
    v = 0.5 + (v - 0.5) * 1.6 + (r() - 0.5) * 0.08;          // contrast + speckle
    const g = Math.max(0, Math.min(255, v * 255));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  bumpTex = new THREE.CanvasTexture(cv);
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.anisotropy = 4;
  return bumpTex;
}

const matCache = new Map();
export function clayMaterial(color, opts = {}) {
  const key = typeof color === 'number' ? color.toString(16) : String(color);
  const ck = key + '|' + JSON.stringify(opts);
  if (matCache.has(ck)) return matCache.get(ck);
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: 0,
    bumpMap: clayBump(),
    bumpScale: opts.bumpScale ?? 0.6,
    sheen: opts.sheen ?? 0.35,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color(0xfff2dd),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    flatShading: false,
  });
  if (opts.repeat) { m.bumpMap = clayBump().clone(); m.bumpMap.repeat.set(opts.repeat, opts.repeat); m.bumpMap.needsUpdate = true; }
  matCache.set(ck, m);
  return m;
}

// names of Empties that Three.js animates — kept as separate groups when baking
export const PIVOTS = new Set(['head', 'tail', 'trunk', 'jaw', 'wingL', 'wingR', 'tailfin', 'finL', 'finR', 'earL', 'earR',
  'armR', 'armL', 'arm-1', 'arm1', 'leg-1', 'leg1', 'body', 'wheel-1_-0.72', 'wheel-1_0.78', 'wheel1_-0.72', 'wheel1_0.78']);

const loader = new GLTFLoader();
const modelCache = new Map();

export function loadModel(name, onProgress) {
  if (modelCache.has(name)) return modelCache.get(name).then(m => m.clone(true));
  const p = new Promise((resolve, reject) => {
    loader.load(`safari/models/${name}.glb`, (gltf) => {
      const root = gltf.scene;
      bakeModel(root);
      resolve(root);
    }, onProgress, reject);
  });
  modelCache.set(name, p);
  return p.then(m => m.clone(true));
}

// Merge every mesh into its nearest animated ancestor, grouped by material colour,
// so a 40-part clay animal becomes ~6 draw calls but heads/tails still move.
export function bakeModel(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(); // pivot -> Map(colorKey -> {geos, mat})
  const pivotOf = (obj) => {
    let o = obj.parent;
    while (o && o !== root) { if (PIVOTS.has(o.name)) return o; o = o.parent; }
    return root;
  };
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const invPivot = new THREE.Matrix4();
  for (const mesh of meshes) {
    const pivot = pivotOf(mesh);
    invPivot.copy(pivot.matrixWorld).invert();
    const local = new THREE.Matrix4().multiplyMatrices(invPivot, mesh.matrixWorld);
    let geo = mesh.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) {
      const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 2; uv[i * 2 + 1] = p.getY(i) * 2 + p.getZ(i); }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    if (!geo.index) { const idx = []; for (let i = 0; i < geo.attributes.position.count; i++) idx.push(i); geo.setIndex(idx); }
    geo.applyMatrix4(local);
    const src = mesh.material;
    const emissive = src.emissive ? src.emissive.getHex() : 0;
    const key = src.color.getHexString() + ':' + emissive + ':' + (src.emissiveIntensity || 1);
    if (!groups.has(pivot)) groups.set(pivot, new Map());
    const g = groups.get(pivot);
    if (!g.has(key)) g.set(key, { geos: [], src });
    g.get(key).geos.push(geo);
  }
  for (const mesh of meshes) mesh.parent.remove(mesh);
  // drop now-empty non-pivot groups
  const prune = (o) => { for (const c of [...o.children]) { prune(c); if (!c.isMesh && c.children.length === 0 && !PIVOTS.has(c.name)) o.remove(c); } };
  prune(root);
  for (const [pivot, g] of groups) {
    for (const [key, { geos, src }] of g) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      const emissive = src.emissive ? src.emissive.getHex() : 0;
      const isGlow = emissive !== 0 && (src.emissiveIntensity || 1) > 0.5;
      const mat = clayMaterial(src.color.getHex(), isGlow
        ? { emissive, emissiveIntensity: Math.min(3, src.emissiveIntensity || 1), roughness: 0.4, sheen: 0 }
        : { roughness: Math.max(0.5, src.roughness ?? 0.7), sheen: src.roughness < 0.5 ? 0.1 : 0.35 });
      const m = new THREE.Mesh(merged, mat);
      m.name = 'part_' + key;
      m.castShadow = true; m.receiveShadow = true;
      pivot.add(m);
    }
  }
  return root;
}

// Bounding info in model space after scaling is applied by the caller
export function measure(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return { box, height: box.max.y - box.min.y, top: box.max.y, center: box.getCenter(new THREE.Vector3()) };
}
