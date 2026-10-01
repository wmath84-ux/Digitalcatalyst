#!/usr/bin/env node
// Installs ONLY an authorized, self-contained character GLB. Never copies the
// reference project, environment, levels, native plugins or paid source packs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_BYTES = 64 * 1024 * 1024;
let schema;
async function getSchema() {
  if (schema) return schema;
  const result = await build({
    stdin: { contents: `export * from './src/nature3d/engine/characterManifest';`, resolveDir: ROOT },
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
  });
  schema = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return schema;
}

export function readGlbJson(bytes) {
  if (bytes.length < 28 || bytes.length > MAX_BYTES) throw new Error('Character GLB must be nonempty and <= 64 MiB; optimize the export without omitting clothing, textures or clips.');
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('Expected a binary glTF 2.0 (.glb), not an FBX/uasset or renamed file.');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB length/header mismatch.');
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || length % 4 || length > bytes.length - 20) throw new Error('GLB JSON chunk is invalid.');
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  if (json.asset?.version !== '2.0') throw new Error('Unsupported glTF asset version.');
  return json;
}

export async function validateCharacterExport(bytes, config, { partial = false } = {}) {
  const { parseCharacterManifest, ANIMATION_KEYS, BONE_ROLES } = await getSchema();
  const manifest = parseCharacterManifest({ ...config, modelUrl: '/sanctuary/character/character.glb' });
  if (!manifest.licenseConfirmed) throw new Error('Deployment rights must be confirmed.');
  const json = readGlbJson(bytes);
  if (!json.skins?.length || !json.meshes?.length || !json.animations?.length) throw new Error('Export must include the complete skinned mesh, rig and animations.');
  if (json.cameras?.length || json.extensions?.KHR_lights_punctual?.lights?.length) throw new Error('Character-only export required; remove level cameras/lights.');
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (resource.uri && !resource.uri.startsWith('data:')) throw new Error('GLB must embed all textures/buffers; remote and sidecar resources are not allowed.');
  }
  for (const extension of json.extensionsRequired ?? []) {
    if (['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].includes(extension)) throw new Error(`${extension} needs a decoder not configured here. Export ordinary GLB geometry with embedded PNG/JPEG/WebP textures.`);
  }
  const nodes = json.nodes ?? [];
  const joints = new Set(json.skins.flatMap(s => s.joints ?? []));
  const parents = new Map();
  nodes.forEach((node, index) => (node.children ?? []).forEach(child => {
    if (!Number.isInteger(child) || child < 0 || child >= nodes.length || parents.has(child)) throw new Error('Invalid character node hierarchy.');
    parents.set(child, index);
  }));
  nodes.forEach((node, index) => {
    if (node.mesh === undefined || node.skin !== undefined) return;
    let p = index;
    const seen = new Set();
    while (!joints.has(p) && parents.has(p)) {
      if (seen.has(p)) throw new Error('Cyclic character hierarchy.');
      seen.add(p); p = parents.get(p);
    }
    if (!joints.has(p)) throw new Error('Unskinned scene geometry found. Export only the character; static accessories must attach to its bones, not to an environment scene.');
  });
  const available = new Set(json.animations.map(a => a.name));
  for (const [key, name] of Object.entries(manifest.animationMap)) if (!available.has(name)) throw new Error(`${key}: GLB has no animation named ${name}.`);
  const core = ['idle', 'walkForward', 'runForward', 'jump', 'fall', 'land', 'crouchIdle'];
  const missing = (partial ? core : ANIMATION_KEYS).filter(key => !manifest.animationMap[key]);
  if (missing.length) throw new Error(`Missing ${partial ? 'core' : 'full feature'} clip mappings: ${missing.join(', ')}. Do not label a partial export as the complete upstream character.`);
  if (!partial && new Set(Object.values(manifest.animationMap)).size !== ANIMATION_KEYS.length) throw new Error('Full-feature export needs distinct directional/transition/cover clips, not the same idle/walk clip reused for every feature.');
  for (const role of BONE_ROLES) {
    if (manifest.boneMap?.[role] && !nodes.some((n, i) => n.name === manifest.boneMap[role] && joints.has(i))) throw new Error(`Bone mapping ${role} does not exist as a skeleton joint in the GLB.`);
  }
  return { manifest, json, missingOptional: ANIMATION_KEYS.filter(k => !manifest.animationMap[k]) };
}

async function main(args) {
  if (args.includes('--help') || !args.length) {
    console.log('Usage: node scripts/install-sanctuary-character.mjs --model <owned.glb> --manifest <mapping.json> --license-confirmed [--check-only] [--allow-partial] [--replace] [--dest <directory>]\nDefault: all 26 motion mappings required; self-contained, character-only export. No assets are obtained from the Internet. See docs/sanctuary-character-integration.md.');
    return;
  }
  const flags = new Set(['--license-confirmed', '--check-only', '--allow-partial', '--replace']);
  const values = new Set(['--model', '--manifest', '--dest']);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (flags.has(args[i])) options[args[i]] = true;
    else if (values.has(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i]] = args[++i];
    else throw new Error(`Unknown/incomplete option: ${args[i]}`);
  }
  if (!options['--model'] || !options['--manifest'] || !options['--license-confirmed']) throw new Error('Supply --model, --manifest and explicit --license-confirmed deployment authorization.');
  const modelFile = path.resolve(ROOT, options['--model']);
  const stat = await fs.stat(modelFile);
  if (stat.size > MAX_BYTES) throw new Error('Export exceeds the 64 MiB deployment budget; keep the several-GB source assets in external storage.');
  const bytes = await fs.readFile(modelFile);
  const config = JSON.parse(await fs.readFile(path.resolve(ROOT, options['--manifest']), 'utf8'));
  const { manifest, json, missingOptional } = await validateCharacterExport(bytes, { ...config, licenseConfirmed: true }, { partial: Boolean(options['--allow-partial']) });
  const summary = `${json.meshes.length} meshes, ${json.skins.length} skins, ${json.animations.length} clips; normalized to 1.8288 m at runtime.`;
  if (options['--check-only']) { console.log(`VALID: ${summary}${missingOptional.length ? ` Partial motions: ${missingOptional.join(', ')}` : ''}`); return; }
  const dest = path.resolve(ROOT, options['--dest'] ?? 'public/sanctuary/character');
  const relative = path.relative(ROOT, dest);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).includes('.git') || !relative) throw new Error('Destination must be a subdirectory of this repository, never .git or its root.');
  const target = path.join(dest, 'character.glb');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  try {
    const old = await fs.readFile(target);
    if (!options['--replace'] && createHash('sha256').update(old).digest('hex') !== sha256) throw new Error('A different character.glb already exists; use --replace only if intentionally replacing it.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(dest, { recursive: true });
  const source = {
    ...(config.source ?? {}), scope: 'character-only', sha256, bytes: bytes.length,
    licenseAcknowledgement: 'Installer was explicitly invoked with --license-confirmed. The operator is responsible for export, deployment and distribution rights.',
    missingOptional, nativeUnrealFeatures: 'Unreal Blueprint/Control Rig, physical-animation ragdoll and skirt cloth do not execute in Three.js.',
  };
  await fs.writeFile(target, bytes);
  await fs.writeFile(path.join(dest, 'manifest.json'), JSON.stringify({ ...manifest, source }, null, 2) + '\n');
  await fs.writeFile(path.join(dest, 'SOURCE.json'), JSON.stringify(source, null, 2) + '\n');
  console.log(`Installed authorized character only: ${dest}\n${summary}\nSHA-256: ${sha256}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(`Character install failed: ${error.message}`); process.exitCode = 1; });
}
