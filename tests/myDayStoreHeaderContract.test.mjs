import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/MyDayApp.tsx", "utf8");

test("My Day renders the shared store header above its own toolbar", () => {
  assert.match(source, /import StoreHeader from "\.\/components\/Header"/);
  const storeHeader = source.indexOf("<StoreHeader");
  const myDayHeader = source.indexOf('<header className="sticky top-[68px]');
  assert.ok(storeHeader >= 0, "shared store header is missing");
  assert.ok(myDayHeader > storeHeader, "My Day toolbar must render below the shared store header");
});

test("My Day offsets its sticky toolbar so the two headers never overlap", () => {
  assert.match(source, /top-\[68px\] z-20/);
  assert.match(source, /cartCount=\{cartIds\.size\}/);
  assert.match(source, /#\/subscription/);
  assert.match(source, /#\/cart/);
  assert.match(source, /#\/notifications/);
});
