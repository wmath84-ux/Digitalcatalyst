import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readGlbJson, validateCharacterExport } from '../scripts/install-sanctuary-character.mjs';
import { characterFixtureJson, encodeGlb, MAPPING } from './fixtures/sanctuaryCharacterGlb.mjs';

const bytes = () => { const { json, binary } = characterFixtureJson(); return encodeGlb(json, binary); };

test('installer preflights a full character-only GLB with all distinct motion mappings', async () => {
  const result = await validateCharacterExport(bytes(), MAPPING);
  assert.equal(result.manifest.licenseConfirmed, true);
  assert.equal(result.manifest.modelUrl, '/sanctuary/character/character.glb');
  assert.equal(result.json.animations.length, 26); assert.deepEqual(result.missingOptional, []);
});

test('installer refuses renamed/corrupt/oversized interchange files and unconfirmed rights', async () => {
  assert.throws(() => readGlbJson(Buffer.from('FBX, not glTF')));
  const corrupt = bytes(); corrupt.writeUInt32LE(99, 8); assert.throws(() => readGlbJson(corrupt));
  await assert.rejects(validateCharacterExport(bytes(), { ...MAPPING, licenseConfirmed: false }), /rights|Confirm/);
});

test('installer rejects environment geometry/cameras/lights and non-embedded assets/decoders', async () => {
  for (const mutate of [
    j => { j.nodes.push({ name: 'Upstream house', mesh: 0 }); },
    j => { j.cameras = [{ type: 'perspective' }]; },
    j => { j.extensions = { KHR_lights_punctual: { lights: [{}] } }; },
    j => { j.buffers[0].uri = 'https://external.test/geometry.bin'; },
    j => { j.images = [{ uri: 'texture.png' }]; },
    j => { j.extensionsRequired = ['KHR_draco_mesh_compression']; },
  ]) {
    const { json, binary } = characterFixtureJson(); mutate(json);
    await assert.rejects(validateCharacterExport(encodeGlb(json, binary), MAPPING));
  }
});

test('missing/wrong/reused clips or explicit nonexistent bones cannot masquerade as full integration', async () => {
  const partialMap = { idle: 'idle', walkForward: 'walkForward', runForward: 'runForward', jump: 'jump', fall: 'fall', land: 'land', crouchIdle: 'crouchIdle' };
  await assert.rejects(validateCharacterExport(bytes(), { ...MAPPING, animationMap: partialMap }), /Missing full feature/);
  const partial = await validateCharacterExport(bytes(), { ...MAPPING, animationMap: partialMap }, { partial: true });
  assert.equal(partial.missingOptional.length, 19);
  await assert.rejects(validateCharacterExport(bytes(), { ...MAPPING, animationMap: { ...MAPPING.animationMap, walkForward: 'idle' } }), /distinct/);
  await assert.rejects(validateCharacterExport(bytes(), { ...MAPPING, animationMap: { ...MAPPING.animationMap, jump: 'Absent' } }), /no animation/);
  await assert.rejects(validateCharacterExport(bytes(), { ...MAPPING, boneMap: { head: 'MissingBone' } }), /does not exist/);
  await assert.rejects(validateCharacterExport(bytes(), { ...MAPPING, boneMap: { head: characterFixtureJson().json.nodes[0].name } }), /skeleton joint/);
});

test('CLI requires explicit deployment authorization and installs only the model/manifest/provenance', async () => {
  await fs.mkdir('node_modules/.cache', { recursive: true });
  const dir = await fs.mkdtemp('node_modules/.cache/character-install-');
  try {
    await fs.writeFile(path.join(dir, 'owned.glb'), bytes());
    await fs.writeFile(path.join(dir, 'mapping.json'), JSON.stringify(MAPPING));
    const base = ['scripts/install-sanctuary-character.mjs', '--model', path.join(dir, 'owned.glb'), '--manifest', path.join(dir, 'mapping.json'), '--dest', path.join(dir, 'installed')];
    const denied = spawnSync(process.execPath, base, { encoding: 'utf8' });
    assert.equal(denied.status, 1); assert.match(denied.stderr, /license-confirmed/);
    const installed = spawnSync(process.execPath, [...base, '--license-confirmed'], { encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    assert.deepEqual((await fs.readdir(path.join(dir, 'installed'))).sort(), ['SOURCE.json', 'character.glb', 'manifest.json']);
    const m = JSON.parse(await fs.readFile(path.join(dir, 'installed/manifest.json'), 'utf8'));
    assert.equal(m.licenseConfirmed, true); assert.equal(m.source.scope, 'character-only'); assert.equal(m.source.sha256.length, 64);
    assert.match(m.source.nativeUnrealFeatures, /do not execute/);
    assert.equal(m.source.bytes, bytes().length);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
