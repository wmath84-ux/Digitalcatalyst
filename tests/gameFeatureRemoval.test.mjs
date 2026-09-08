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

test('shared 3D dependencies and the classroom are retained', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const dependency of ['three', '@react-three/fiber', '@react-three/drei']) {
    assert.ok(pkg.dependencies[dependency], dependency);
  }
  assert.ok(fs.existsSync(new URL('../src/classroom3d/Classroom3D.tsx', import.meta.url)));
});
