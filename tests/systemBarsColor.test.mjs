import test from "node:test";
import assert from "node:assert/strict";

import {
  compositeOver,
  parseCssColor,
  prefersDarkIcons,
  relativeLuminance,
  toHex,
} from "../src/utils/systemBarColor.ts";

test("parses computed rgb/rgba strings and hex", () => {
  assert.deepEqual(parseCssColor("rgb(10, 12, 18)"), { r: 10, g: 12, b: 18, a: 1 });
  assert.deepEqual(parseCssColor("rgba(255, 255, 255, 0.5)"), { r: 255, g: 255, b: 255, a: 0.5 });
  assert.deepEqual(parseCssColor("rgb(0 0 0 / 25%)"), { r: 0, g: 0, b: 0, a: 0.25 });
  assert.deepEqual(parseCssColor("#0a0c12"), { r: 10, g: 12, b: 18, a: 1 });
  assert.deepEqual(parseCssColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(parseCssColor("transparent").a, 0);
  assert.equal(parseCssColor("linear-gradient(red, blue)"), null);
  assert.equal(parseCssColor(""), null);
});

test("composites translucent layers over what is beneath", () => {
  const under = { r: 0, g: 0, b: 0, a: 1 };
  const half = compositeOver({ r: 255, g: 255, b: 255, a: 0.5 }, under);
  assert.equal(toHex(half), "#808080");
  assert.equal(compositeOver({ r: 9, g: 9, b: 9, a: 1 }, under).a, 1);
});

test("light backgrounds get dark icons, dark backgrounds get light icons", () => {
  assert.equal(prefersDarkIcons(parseCssColor("#ffffff")), true);
  assert.equal(prefersDarkIcons(parseCssColor("#f5f1e8")), true);
  assert.equal(prefersDarkIcons(parseCssColor("#000000")), false);
  assert.equal(prefersDarkIcons(parseCssColor("#0a0c12")), false);
  assert.equal(prefersDarkIcons(parseCssColor("#1d4ed8")), false, "saturated blue is dark enough for light icons");
  assert.equal(prefersDarkIcons(parseCssColor("#facc15")), true, "bright yellow takes dark icons");
});

test("relative luminance follows WCAG (white = 1, black = 0)", () => {
  assert.ok(Math.abs(relativeLuminance(parseCssColor("#ffffff")) - 1) < 1e-6);
  assert.equal(relativeLuminance(parseCssColor("#000000")), 0);
});

test("toHex clamps and pads channels", () => {
  assert.equal(toHex({ r: 300, g: -4, b: 15.6, a: 1 }), "#ff0010");
});
