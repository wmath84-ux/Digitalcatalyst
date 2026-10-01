import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCharacterExport } from '../scripts/install-sanctuary-character.mjs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const scene = read('src/nature3d/engine/scene.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const page = read('src/nature3d/NatureStudioPage.tsx');
const ui = read('src/nature3d/CharacterControls.tsx');

test('live scene contains no seated-student lifecycle; guide is separate from the empty doubled sofa', () => {
  assert.doesNotMatch(scene, /createStudent|this\.student\.|from ["']\.\/student["']|\.setSeated\(true/);
  assert.match(scene, /createDayBed\(/); assert.match(scene, /new CharacterController\(/);
  assert.match(scene, /this\.scene\.add\(this\.avatar\.group\)/);
  assert.match(scene, /this\.avatar\.dispose\(\)/);
  assert.match(scene, /this\.characterWorld\.dispose\(\)/);
});

test('page wires the real character HUD, lifecycle callbacks, walk dock, overlays and focusable canvas', () => {
  assert.match(page, /<CharacterControls/); assert.match(page, /onCharacterMode:/); assert.match(page, /onCharacterAsset:/);
  assert.match(page, /id: "walk"/); assert.match(page, /setCharacterMode\("third-person"\)/);
  assert.match(page, /setOverlayOpen\(menuOpen \|\| moduleMenuOpen \|\| showLesson\)/);
  assert.match(page, /canvas ref=\{canvasRef\} tabIndex=\{0\}/);
  assert.match(ui, /data-character-asset-status/); assert.match(ui, /\{status\.label\}/);
  assert.match(ui, /data-character-stick/); assert.match(ui, /stageLocalDelta/);
});

test('installed original assets have explicit authorization/provenance; model loading is local and character-only', () => {
  const manifest = JSON.parse(read('public/sanctuary/character/manifest.json'));
  assert.equal(manifest.modelUrl, '/sanctuary/character/character.glb'); assert.equal(manifest.licenseConfirmed, true);
  assert.equal(manifest.label, 'Original Katiusza');
  assert.match(manifest.source.userRightsConfirmation, /explicitly confirmed/);
  assert.equal(manifest.source.commit, 'bf56bcd56c5dd149590d1e5a0dc45575ae2fa95c');
  assert.match(manifest.source.conversion, /Actual original/);
  assert.equal(manifest.source.fullArchiveAnimations, 401);
  assert.match(scene, /import\("\.\/characterAsset"\)/);
  const loader = read('src/nature3d/engine/characterAsset.ts');
  assert.match(loader, /manifest\.modelUrl\.slice\(1\)/); assert.doesNotMatch(loader, /RealisticThirdPersonCharacter.*\.(umap|uasset)/);
  assert.match(loader, /environment-sized geometry/);
});

test('input listeners and pointer-lock capture have paired disposal; overlays/hidden views clear character input', () => {
  for (const event of ['keydown', 'keyup', 'blur', 'pointerlockchange', 'mousemove']) {
    assert.match(scene, new RegExp(`addEventListener\\("${event}"`));
    assert.match(scene, new RegExp(`removeEventListener\\("${event}"`));
  }
  assert.match(scene, /setOverlayOpen\(open: boolean\)/); assert.match(scene, /this\.clearCharacterInput\(\); this\.releaseCharacterMouse\(\)/);
  assert.match(scene, /if \(this\.character\.enabled\) this\.setCharacterMode\("orbit"\)/);
});

test('precision/cache/instancing fixes preserve hooks and reject the original buffer-overrun pattern', () => {
  const quality = read('src/nature3d/engine/quality.ts');
  assert.match(quality, /material\.precision = "highp"/);
  for (const filename of ['atmosphere', 'weathering']) {
    const source = read(`src/nature3d/engine/${filename}.ts`);
    assert.match(source, /const priorKey = material\.customProgramCacheKey\(\)/);
    assert.match(source, /previous\?\.call\(material, shader, renderer\)/);
  }
  const grass = read('src/nature3d/engine/grassTufts.ts');
  assert.match(grass, /mesh\.count = 0/); assert.match(grass, /slot >= mesh\.instanceMatrix\.count/);
});

test('the installed original GLB is the real source model and passes the installer validator', async () => {
  const manifest = JSON.parse(read('public/sanctuary/character/manifest.json'));
  assert.equal(manifest.licenseConfirmed, true);
  assert.match(manifest.source.userRightsConfirmation, /explicitly confirmed/);
  assert.match(manifest.source.conversion, /Actual original/);
  assert.equal(manifest.source.commit, 'bf56bcd56c5dd149590d1e5a0dc45575ae2fa95c');
  const source = JSON.parse(read('public/sanctuary/character/SOURCE.json'));
  assert.equal(source.scope, 'character-only');
  assert.match(source.meshSHA256, /^[0-9a-f]{64}$/); assert.match(source.sha256, /^[0-9a-f]{64}$/);
  // Real deployed bytes, not a fixture: original mesh/rig/outfit/clips only.
  const model = readFileSync(new URL('../public/sanctuary/character/character.glb', import.meta.url));
  const checked = await validateCharacterExport(model, manifest);
  const json = checked.json;
  assert.deepEqual(checked.missingOptional, []);
  assert.equal(json.skins.length, 1); assert.equal(json.skins[0].joints.length, 84);
  assert.equal(json.meshes.length, 1);
  assert.equal(new Set(json.meshes[0].primitives.map(p => p.material)).size, 8);
  assert.ok(json.animations.length >= 26);
  assert.deepEqual(Object.values(manifest.animationMap).filter(n => !json.animations.some(a => a.name === n)), []);
  assert.deepEqual(new Set(Object.values(manifest.animationMap)).size, 26);
  assert.ok(!json.cameras?.length && !json.extensions?.KHR_lights_punctual);
  assert.ok(json.buffers.every(b => !b.uri) && json.images.every(i => !i.uri));
  for (const role of Object.values(manifest.boneMap)) {
    assert.ok(json.nodes.some(n => n.name === role), `original bone ${role} missing`);
  }
  assert.ok(json.nodes.some(n => n.name === 'spine_03' && !n.mesh), 'original skeleton retained');
});
test('the installed character faces its direction of travel, measured from the real mesh', async () => {
  const manifest = JSON.parse(read('public/sanctuary/character/manifest.json'));
  const bytes = readFileSync(new URL('../public/sanctuary/character/character.glb', import.meta.url));
  const { json, binary } = await validateCharacterExport(bytes, manifest);
  const parents = new Map();
  json.nodes.forEach((node, index) => (node.children ?? []).forEach(child => parents.set(child, index)));
  const meshNode = json.nodes.findIndex(node => node.mesh === 0);
  assert.ok(meshNode >= 0, 'the export must contain the character mesh node');
  const chain = [];
  for (let index = meshNode; index !== undefined; index = parents.get(index)) chain.push(index);
  const rotate = (v, q) => {
    const [x, y, z, w] = q;
    const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z;
    const iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
    return { x: ix * w + iw * -x + iy * -z - iz * -y,
             y: iy * w + iw * -y + iz * -x - ix * -z,
             z: iz * w + iw * -z + ix * -y - iy * -x };
  };
  const centroid = (pattern) => {
    const slot = json.materials.findIndex(material => pattern.test(material.name ?? ''));
    assert.ok(slot >= 0, `original ${pattern} material slot is missing`);
    const primitive = json.meshes[0].primitives.find(p => p.material === slot);
    const accessor = json.accessors[primitive.attributes.POSITION];
    const view = json.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5126, 'positions must be float'); assert.equal(accessor.type, 'VEC3');
    const stride = view.byteStride ?? 12;
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < accessor.count; i++) {
      x += binary.readFloatLE(offset + i * stride);
      y += binary.readFloatLE(offset + i * stride + 4);
      z += binary.readFloatLE(offset + i * stride + 8);
    }
    return { x: x / accessor.count, y: y / accessor.count, z: z / accessor.count };
  };
  const toNodeSpace = (v) => {
    for (const index of chain) { const q = json.nodes[index].rotation; if (q) v = rotate(v, q); }
    return v;
  };
  // MEASURED, not assumed: the eyes lead the skull, and the left boot is on
  // the character's own left. Both are read from the deployed vertex data.
  const face = toNodeSpace((({ x, z }) => ({ x, y: 0, z }))(centroid(/eye/i)));
  const skull = toNodeSpace((({ x, z }) => ({ x, y: 0, z }))(centroid(/^head/i)));
  const faceAxis = Math.sign((face.x - skull.x) || (face.z - skull.z));
  const left = toNodeSpace((({ x, z }) => ({ x, y: 0, z }))(centroid(/^ButL/i)));
  const right = toNodeSpace((({ x, z }) => ({ x, y: 0, z }))(centroid(/^ButR/i)));
  const leftAxis = Math.sign((left.x - right.x) || (left.z - right.z));
  assert.equal(faceAxis, 1, `the face must look down the GLB +Z axis (measured ${JSON.stringify(face)})`);
  assert.equal(leftAxis, 1, `the left boot must sit on +X in the GLB (measured ${JSON.stringify(left)})`);
  // characterAsset rotates a +Z model by PI; the result must be the -Z axis
  // the controller calls "forward", and left/right must not be mirrored.
  const flip = manifest.modelForward === '+Z' ? -1 : 1;
  assert.equal(faceAxis * flip, -1, 'the face must point along -Z, the direction of travel');
  assert.equal(leftAxis * flip, -1, 'the character left side must stay on the runtime left (-X)');
});
