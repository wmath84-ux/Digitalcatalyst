import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Game controls and launch plumbing are absent from all headers and pages', () => {
  const files = [
    'src/components/DesktopShell.tsx', 'src/components/Header.tsx',
    'src/home/components/Header.tsx', 'src/home/App.tsx', 'src/App.tsx',
    'src/CartWishlistApp.tsx', 'src/FlowPathApp.tsx', 'src/LeaderboardApp.tsx',
    'src/MyDayApp.tsx', 'src/PdpApp.tsx', 'src/profile/App.tsx', 'src/main.tsx',
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /showGameButton|openGameWorld|GameEnvironment|GameWorldHost|onOpenGameEnvironment|id:\s*["']game["']/, file);
  }
});

test('both old and downloaded game implementations and their build hook are deleted', () => {
  for (const file of [
    'src/components/GameEnvironment.tsx', 'src/components/GameWorldHost.tsx',
    'src/components/game-world.css', 'src/lib/gameWorld.ts',
    'scripts/build-game-world.mjs', 'vendor/threejs-world',
    'vendor/threejs-world.local.json', 'vendor/threejs-world.upstream.json',
    'public/game-world',
  ]) {
    assert.equal(fs.existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  }
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.dev, 'vite');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.scripts['build:game-world'], undefined);
  assert.doesNotMatch(read('public/sw.js'), /game-world/);
  assert.doesNotMatch(read('.gitignore'), /game-world|threejs-world/);
});

// This test used to pin the 3D vendor stack + src/classroom3d as "shared, do
// not delete" while the game was being removed. The 3D Classroom was then
// removed as a feature of its own (owner, 2026-09-08).
//
// `three` returned on 2026-09-18 for the 3D Study Sanctuary (src/nature3d/**),
// which is unrelated to both the game and the classroom. What this test still
// pins is that NEITHER removed feature came back: no React-3D wrappers, and no
// src/classroom3d or game directory.
test('neither removed 3D feature is left behind', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const dependency of ['@react-three/fiber', '@react-three/drei']) {
    assert.equal(pkg.dependencies[dependency], undefined, dependency);
    assert.equal(pkg.devDependencies[dependency], undefined, dependency);
  }
  assert.equal(fs.existsSync(new URL('../src/classroom3d', import.meta.url)), false);
});
