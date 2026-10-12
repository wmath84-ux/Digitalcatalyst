import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/settings/settings.css", "utf8");
const lightSettings = css.slice(css.indexOf('html[data-theme="light"] [data-settings-page]:not([data-public-profile]) {'));

test("light Settings has a scoped paper canvas and distinct white setting cards", () => {
  assert.ok(lightSettings.length > 0, "private Settings light-theme block exists");
  assert.match(lightSettings, /linear-gradient\(180deg, #f8fbff 0%, #f3f6fa 56%, #edf1f6 100%\)/);
  assert.match(lightSettings, /\.settings-heading \{[\s\S]*?background: linear-gradient\(135deg, #ffffff/);
  assert.match(lightSettings, /\.settings-section \{[\s\S]*?background: rgba\(255, 255, 255, 0\.94\)/);
  assert.match(lightSettings, /\.settings-row \{[\s\S]*?background: #f8fafc/);
});

test("light Settings copy, controls and support panels use readable ink and brand colors", () => {
  assert.match(lightSettings, /\.settings-section-heading h2 \{[\s\S]*?color: #172033/);
  assert.match(lightSettings, /\.settings-row-copy > label,[\s\S]*?color: #1f2937/);
  assert.match(lightSettings, /\.settings-row-copy p,[\s\S]*?color: #475569/);
  assert.match(lightSettings, /\.settings-switch input:checked \+ span \{[\s\S]*?background: #004ac6/);
  assert.match(lightSettings, /\.settings-device \{[\s\S]*?background: linear-gradient\(120deg, #f0f6ff, #f1f8ff\)/);
  assert.match(lightSettings, /\.settings-primary \{[\s\S]*?color: #ffffff/);
});
