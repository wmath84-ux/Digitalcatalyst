#!/usr/bin/env node
// Full, reproducible reference download. Deliberately NOT a shallow/sparse clone.
// The several-GB Unreal checkout stays in .cache, outside the web build and Git.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPOSITORY = 'https://github.com/VeryHotShark/RealisticThirdPersonCharacter';
const COMMIT = 'bf56bcd56c5dd149590d1e5a0dc45575ae2fa95c';
const DEST = path.join(ROOT, '.cache/upstream/RealisticThirdPersonCharacter');
const reportOnly = process.argv.includes('--report-only');

function git(args, capture = true) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  return result.stdout?.trim() ?? '';
}

try {
  if (!fs.existsSync(path.join(DEST, '.git'))) {
    if (reportOnly) throw new Error('Reference is not downloaded. Run without --report-only first.');
    if (fs.existsSync(DEST)) throw new Error('Destination exists without .git; refusing to overwrite it.');
    fs.mkdirSync(path.dirname(DEST), { recursive: true });
    git(['clone', '--recurse-submodules', REPOSITORY, DEST], false);
  }
  const sha = git(['-C', DEST, 'rev-parse', 'HEAD']);
  if (sha !== COMMIT) throw new Error(`Reference is at ${sha}, not reviewed ${COMMIT}. Review the upstream change before updating this pin; no working-tree reset was performed.`);
  if (git(['-C', DEST, 'rev-parse', '--is-shallow-repository']) !== 'false') throw new Error('Reference is shallow; a complete history download is required.');
  if (git(['-C', DEST, 'config', '--get', 'remote.origin.url']).replace(/\.git$/, '').replace(/\/$/, '') !== REPOSITORY) throw new Error('Reference origin does not match the requested repository.');
  if (!reportOnly) git(['-C', DEST, 'submodule', 'update', '--init', '--recursive'], false);
  const files = git(['-C', DEST, 'ls-files', '-z']).split('\0').filter(Boolean);
  const formats = {};
  let bytes = 0;
  let characterBytes = 0;
  let characterFiles = 0;
  const pointers = [];
  for (const name of files) {
    const filename = path.join(DEST, name);
    const stat = fs.statSync(filename);
    if (!stat.isFile()) continue;
    bytes += stat.size;
    const ext = path.extname(name).toLowerCase() || '(no extension)';
    formats[ext] = (formats[ext] ?? 0) + 1;
    if (name.startsWith('Content/Characters/Katiusza/')) { characterFiles++; characterBytes += stat.size; }
    if (stat.size < 1024 && fs.readFileSync(filename, 'utf8').startsWith('version https://git-lfs.github.com/spec/v1')) pointers.push(name);
  }
  if (pointers.length) throw new Error(`Download contains ${pointers.length} LFS pointers, not full assets. Install Git LFS and run git lfs pull in the reference checkout, then verify again.`);
  const report = {
    repository: REPOSITORY, commit: COMMIT, engine: 'Unreal Engine 5.1', shallow: false,
    trackedFiles: files.length, checkedOutBytes: bytes, formats, lfsPointers: 0,
    character: {
      directory: 'Content/Characters/Katiusza', files: characterFiles, bytes: characterBytes,
      mesh: '/Game/Characters/Katiusza/Models/Katia/SKM_Katiusza',
      portableModelsPresent: files.filter(f => /\.(glb|gltf|fbx)$/i.test(f)),
    },
    projectLicensePresent: ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'].some(f => fs.existsSync(path.join(DEST, f))),
    deployment: 'Inspection only. No upstream assets, map, lights or environment are installed into Sanctuary. Original appearance/animations need an authorized character-only export and deployment rights.',
  };
  const filename = path.join(ROOT, '.cache/reference-character-inventory.json');
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nComplete reference checkout: ${DEST}\nInventory: ${filename}`);
} catch (error) {
  console.error(`Reference download/verification failed: ${error.message}`);
  process.exitCode = 1;
}
