import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("vendored project matches pinned upstream plus the explicitly recorded optimization changes", () => {
  const manifest = JSON.parse(read("vendor/threejs-world.upstream.json"));
  assert.equal(manifest.commit, "398320e9bcf74bf4c15532fafff4c565f7729b37");
  const local = JSON.parse(read("vendor/threejs-world.local.json"));
  assert.equal(local.upstreamCommit, manifest.commit);
  for (const [file, change] of Object.entries(local.modified)) {
    assert.match(file, /^(src\/|index\.html$|vite\.config\.ts$)/, 'dependencies and license remain upstream');
    assert.equal(change.upstreamSha256, manifest.sha256[file], file);
  }
  for (const [file, hash] of Object.entries(manifest.sha256)) {
    const bytes = fs.readFileSync(new URL(`../vendor/threejs-world/${file}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), local.modified[file]?.sha256 ?? hash, file);
  }
  for (const [file, hash] of Object.entries(local.added)) {
    assert.equal(manifest.sha256[file], undefined);
    assert.equal(createHash("sha256").update(read(`vendor/threejs-world/${file}`)).digest("hex"), hash, file);
  }
});

test("all devices launch the same world entry with the upstream device gate bypassed", () => {
  const launcher = read("src/lib/gameWorld.ts");
  assert.match(launcher, /game-world\/index\.html\?scene=world&nogate=1/);
  assert.doesNotMatch(launcher, /mobile\.html|isGameWorldMobile|navigator\.userAgent|preset=|setLightweight/);
  assert.match(read("vendor/threejs-world/src/core/BrowserGate.ts"), /get\('nogate'\) === '1'/);
  assert.match(read("vendor/threejs-world/src/main.ts"), /await probeWebGPU\(\)/);
});

test("all header variants navigate directly and the old overlay hosts are removed", () => {
  const main = read("src/main.tsx");
  assert.doesNotMatch(main, /GameWorldHost/);
  assert.equal(fs.existsSync(new URL("../src/components/GameEnvironment.tsx", import.meta.url)), false);
  assert.equal(fs.existsSync(new URL("../src/components/GameWorldHost.tsx", import.meta.url)), false);
  for (const header of ["src/components/Header.tsx", "src/home/components/Header.tsx", "src/components/DesktopShell.tsx"]) {
    assert.match(read(header), /id === "game"\) openGameWorld\(\)/, header);
    assert.match(read(header), /id: "game"/, header);
  }
  assert.match(read("src/lib/gameWorld.ts"), /window.location.assign\(gameWorldUrl\(\)\)/);
});

test("only the full-world entry is shipped; the old scene chooser is removed", () => {
  assert.doesNotMatch(read("vendor/threejs-world/vite.config.ts"), /mobile: entry/);
  assert.doesNotMatch(read("vendor/threejs-world/index.html"), /choose-mobile|id="chooser"/);
  assert.doesNotMatch(read("vendor/threejs-world/src/main.ts"), /isMobileDevice|choose-mobile|bareHome/);
});

test("the renderer uses the same core adapter that passed the capability probe", () => {
  assert.match(read("vendor/threejs-world/src/core/Diagnostics.ts"), /probedAdapter.requestDevice/);
  assert.match(read("vendor/threejs-world/src/core/Engine.ts"), /await createWorldDevice/);
  assert.match(read("vendor/threejs-world/src/core/Engine.ts"), /device: worldDevice/);
});

test("offline game navigation never falls back to the cached learning app", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /url.pathname.includes\('\/game-world\/'\)/);
  assert.match(sw, /Game needs a connection/);
  assert.match(sw, /status: 503/);
});

test("dev and production generate local portable assets with independent locked dependencies", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.dev, /build-game-world\.mjs && vite/);
  assert.match(pkg.scripts.build, /build-game-world\.mjs && vite build/);
  const script = read("scripts/build-game-world.mjs");
  assert.match(script, /"ci", "--include=dev"/);
  assert.match(script, /--base=\.\//);
  assert.match(script, /public\/game-world/);
  assert.match(script, /THREE-LICENSE\.txt/);
  assert.match(read(".gitignore"), /\/public\/game-world\//);
});
