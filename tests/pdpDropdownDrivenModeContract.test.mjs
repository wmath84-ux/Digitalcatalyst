// tests/pdpDropdownDrivenModeContract.test.mjs
//
// PDP "Select course modules" dropdown — the single module picker.
//
// Before: a separate "Full course / Modules" tab bar plus an inline module
// list duplicated the dropdown. Worse, the dropdown only wrote
// `selectedModuleIds` while summary/price/CTA/checkout were driven by the
// tab's `mode` state — and because that state initialised ONCE, any mount
// that landed on "full_product" (e.g. modules finishing loading after first
// render) made the dropdown a silent no-op. Verified in a real browser:
// picking modules from the dropdown changed neither the summary nor the CTA.
//
// Now: the mode is DERIVED from the module selection
// (≥1 module → "selected_modules", empty → the always-enabled
// default "full_product" CTA), the tabs + inline list are gone, and the
// dropdown normalises selections (dependency auto-add) exactly like the
// selector it replaced.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const builder = fs.readFileSync("src/components/pdp/PdpPurchaseBuilder.tsx", "utf8");

test("the Full course / Modules tab bar and the inline module list are removed", () => {
  assert.doesNotMatch(builder, /<ModeSwitcher/);
  assert.doesNotMatch(builder, /function ModeSwitcher/);
  assert.doesNotMatch(builder, /<ModuleSelector/);
  assert.doesNotMatch(builder, /function ModuleSelector\b/);
  assert.doesNotMatch(builder, /expandedModules/);
});

test("the purchase mode is derived from the dropdown selection, not an initialised tab state", () => {
  assert.match(builder, /selectedModuleIds\.size > 0\s*\?\s*"selected_modules"/);
  assert.match(builder, /isProductOwned && availableModes\.includes\("paid_update"\)/);
  assert.match(builder, /availableModes\.includes\("full_product"\)/);
  assert.doesNotMatch(builder, /const \[mode, setMode\]/);
});

test("the dropdown applies dependency auto-add so selections stay valid", () => {
  assert.match(builder, /const normalizeModuleSelection/);
  assert.match(builder, /flattenModules\(modules\)/);
  assert.match(builder, /requiredPreviousModuleIds/);
  assert.match(builder, /onChangeSelected=\{\(ids\) => \{\s*\/\/ Normalize/);
  assert.match(builder, /setSelectedModuleIds\(normalizeModuleSelection\(ids\)\)/);
});

test("only non-module extras (resources / paid updates) keep an opt-in chip row, gated on availability", () => {
  assert.match(builder, /data-pdp-extra-modes/);
  assert.match(builder, /extraModes\.length > 0 \?/);
  assert.match(builder, /ExtraModeChip/);
});

test("summary, CTA and checkout selection still key off the (derived) mode", () => {
  assert.match(builder, /<SummaryPanel summary=\{summary\} \/>/);
  assert.match(builder, /<CtaBar\s+mode=\{mode\}/);
  assert.match(builder, /mode === "selected_modules"\s*\?\s*selectedModuleIds/);
});
