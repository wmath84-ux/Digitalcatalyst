import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const pages = [
  "src/home/App.tsx", "src/App.tsx", "src/CartWishlistApp.tsx",
  "src/FlowPathApp.tsx", "src/LeaderboardApp.tsx", "src/MyDayApp.tsx",
  "src/PdpApp.tsx", "src/profile/App.tsx",
];

test("old game environment implementation and its per-page modal entry points stay removed", () => {
  assert.equal(fs.existsSync(new URL("../src/components/GameEnvironment.tsx", import.meta.url)), false);
  for (const page of pages) {
    const source = read(page);
    assert.doesNotMatch(source, /GameEnvironment|isGameOpen|setIsGameOpen/, page);
    assert.match(source, /\bshowGameButton\b/, `${page} keeps its header button`);
  }
});

for (const file of ["src/home/components/Header.tsx", "src/components/Header.tsx"]) {
  test(`${file} retains the Game icon and launches the new shared world`, () => {
    const source = read(file);
    assert.match(source, /showGameButton\?: boolean/);
    assert.match(source, /showGameButton\s*\?\s*\[\{\s*id: "game",\s*label: "Game",\s*ariaLabel: "Game",\s*icon: <Joystick/);
    assert.doesNotMatch(source, /onOpenGameEnvironment/);
    assert.match(source, /id === "game"\) openGameWorld\(\)/);
  });
}
