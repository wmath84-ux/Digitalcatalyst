import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.match(ui, /data-character-asset-status/); assert.match(ui, /original UE export pending/);
  assert.match(ui, /data-character-stick/); assert.match(ui, /stageLocalDelta/);
});

test('pending original assets are explicit; licensed replacement is local, lazy, and character-only', () => {
  const manifest = JSON.parse(read('public/sanctuary/character/manifest.json'));
  assert.equal(manifest.modelUrl, null); assert.equal(manifest.licenseConfirmed, false);
  assert.equal(manifest.source.commit, 'bf56bcd56c5dd149590d1e5a0dc45575ae2fa95c');
  assert.match(manifest.source.status, /not bundled|not installed/);
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
