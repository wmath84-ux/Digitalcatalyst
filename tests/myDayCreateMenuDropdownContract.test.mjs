import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const myDay = fs.readFileSync("src/MyDayApp.tsx", "utf8");
const menu = fs.readFileSync("src/components/myday/CreateMenu.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");

test("the + creation hub is the dedicated CreateMenu component, fed by CREATE_OPTIONS", () => {
  assert.match(myDay, /import CreateMenu from "\.\/components\/myday\/CreateMenu"/);
  assert.match(myDay, /<CreateMenu options=\{CREATE_OPTIONS\} onSelect=\{handleCreateSelect\} \/>/);
  // The inline menu state/markup is gone from the page (it lives in the component now).
  assert.doesNotMatch(myDay, /createMenuOpen/);
});

test("the dropdown always opens ABOVE the button, anchored with explicit spacing", () => {
  // bottom: calc(100% + …) off the button+caption wrapper — never under the
  // button, never lost below the fold, on any screen height.
  assert.match(menu, /style=\{\{ bottom: "calc\(100% \+ 0\.9rem\)" \}\}/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /role="menu"/);
  assert.match(menu, /role="menuitem"/);
});

test("the menu stays readable on tablets: the width reset is an unlayered class, not a utility", () => {
  // The 640–1366 px fluid pass sets `* { max-width: 100% }` (unlayered),
  // which silently beats Tailwind's layered `max-w-none` and squeezes the
  // card to the ~80 px button width — verified on 640/768/800/960 px
  // screenshots. The reset must therefore live in an unlayered named class.
  assert.match(menu, /dc-create-menu-anchor/);
  assert.match(css, /\.dc-create-menu-anchor \{\s*max-width: none;\s*\}/);
  // Fixed compact width: 224 px phones, 256 px sm+ (labels never truncate).
  assert.match(menu, /w-56 -translate-x-1\/2 sm:w-64/);
});

test("the drop-up pops from the button and staggers its rows", () => {
  assert.match(css, /@keyframes dc-create-menu-pop/);
  assert.match(css, /@keyframes dc-create-item-in/);
  assert.match(css, /\.dc-create-menu \{[\s\S]*transform-origin: bottom center/);
  assert.match(menu, /animationDelay/);
});

test("the menu closes on Escape, outside pointer and outside scroll", () => {
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /pointerdown/);
  assert.match(menu, /addEventListener\("scroll"/);
});

test("selecting an option closes the menu before the page handles it", () => {
  assert.match(menu, /setOpen\(false\);\s*onSelect\(option\.id\)/);
  // Selection flow on the page: access check, then the section swap.
  assert.match(myDay, /if \(!requireMyDayAccess\(\)\) return;\s*handleNavigate\(id\);/);
});
