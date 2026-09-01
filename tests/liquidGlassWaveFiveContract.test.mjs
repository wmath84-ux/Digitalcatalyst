// tests/liquidGlassWaveFiveContract.test.mjs
//
// Contract for Wave 5 of the website-glass rollout (docs/liquid-glass-rollout-plan.md):
// account + player surfaces — profile/settings rows, the course player's audio
// transport and delete confirmation, `#/search` sort, the FlowPath editors and
// the renewal preview sandbox.
//
// The headline for this wave is arithmetic, not taste: after it there is no
// native `<select>`, `type="range"` or `type="checkbox"` left anywhere in the app
// outside the admin panel. That is asserted by walking the tree, so adding one
// back fails here instead of quietly shipping.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repo = new URL("../", import.meta.url).pathname;
const read = (p) => fs.readFileSync(repo + p, "utf8");

/** strip comments so prose about a removed control cannot satisfy an assertion */
const code = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const NATIVE = /<select\b|type="range"|type="checkbox"/;

/** The preview page's own tuning sliders are a developer control panel, not app
 *  UI, so they are the single allowed exception. */
const ALLOW_NATIVE = new Set(["src/GlassPreview.tsx"]);
const SKIP_DIR = /node_modules|[/\\]admin[/\\]|components[/\\]admin|[/\\]ui[/\\]/;

test("no native form control survives outside admin", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIR.test(p)) walk(p);
      } else if (p.endsWith(".tsx")) {
        const rel = path.relative(repo, p);
        if (ALLOW_NATIVE.has(rel)) continue;
        if (NATIVE.test(code(read(rel)))) offenders.push(rel);
      }
    }
  };
  walk(path.join(repo, "src"));
  assert.deepEqual(offenders, [], `native controls still in: ${offenders.join(", ")}`);
});

test("the course player's seek bar is the registry slider, hooks intact", () => {
  const s = read("src/course/AudioPlayer.tsx");
  assert.match(s, /<GlassSlider/);
  assert.match(s, /from "\.\.\/components\/ui\/glass-slider"/);
  assert.doesNotMatch(code(s), /type="range"/);
  // every transport hook the player contracts use stays addressable
  for (const hook of ["data-course-audio-seek", "data-course-audio-play", "data-course-audio-mute", "data-course-audio-loop"]) {
    assert.ok(s.includes(hook), hook);
  }
  // `max` never collapses to 0 while metadata loads (the pack normalises by range)
  assert.match(s, /max=\{duration \|\| 1\}/);
});

test("profile + settings preference rows use the registry switch", () => {
  const s = read("src/profile/ProfileLayout.tsx");
  const row = s.slice(s.indexOf("export function PreferenceRow"), s.indexOf("export function EditModal"));
  assert.match(row, /<GlassSwitch/);
  assert.match(row, /checked=\{checked\}/);
  assert.match(row, /onCheckedChange=\{onChange\}/); // same API, no prop plumbing change
  assert.match(row, /data-on=\{checked \? "true" : "false"\}/);
  assert.doesNotMatch(row, /left-\[22px\]/, "the hand-built knob is back");
  // brand identity lives in CSS, not in a forked component
  const css = read("src/glass.css");
  assert.match(css, /\.dc-switch\[aria-checked="true"\] > span:first-child/);
  assert.match(css, /linear-gradient\(90deg, #4f46e5, #7c3aed\)/);
});

test("profile dialogs and fields take the pack surface and field ink", () => {
  const s = read("src/profile/ProfileLayout.tsx");
  const modal = s.slice(s.indexOf("export function BaseModal"), s.indexOf("export function PreferenceRow"));
  assert.match(modal, /<GlassSurface/);
  assert.match(modal, /rounded-t-3xl/);
  assert.match(modal, /sm:rounded-3xl/);
  assert.doesNotMatch(modal, /bg-white p-6/, "the flat card is back");
  // `.dc-field` — the pack's frost on a real form field, because glass-input is a
  // search pill and the profile form needs `required`, `inputMode` and a textarea
  assert.match(s, /const INPUT =\s*\n?\s*"dc-field/);
  const css = read("src/glass.css");
  assert.match(css, /:where\(\.dc-field\) \{/);
  assert.match(css, /:where\(\.dc-field\):focus/);
});

test("the course delete confirmation is a pack surface with every hook", () => {
  const s = read("src/course/ConfirmDeleteDialog.tsx");
  assert.match(s, /<GlassSurface/);
  assert.match(s, /tint=\{0\.9\}/);
  for (const hook of ["data-course-confirm-dialog", "data-course-confirm-backdrop", "data-course-confirm-card", "data-course-confirm-cancel", "data-course-confirm-delete", "data-course-confirm-detail"]) {
    assert.ok(s.includes(hook), hook);
  }
  // the a11y contract: the *surface* is the alertdialog, backdrop tap cancels
  assert.match(s, /role="alertdialog"/);
  assert.match(s, /aria-modal="true"/);
  assert.match(s, /onClick=\{onCancel\}\s*\n\s*data-course-confirm-backdrop/);
  assert.match(s, /autoFocus/);
});

test("the remaining selects render the registry listbox without losing their logic", () => {
  const editor = read("src/flowpath/components/ActivityEditor.tsx");
  assert.equal((code(editor).match(/<select\b/g) ?? []).length, 0);
  assert.equal(editor.match(/<FieldSelect/g)?.length, 7, "one field lost its select");
  for (const v of ['value: "in-progress"', 'value: "exam"', 'value: "mixed"', '"amber", "sky", "rose", "emerald", "violet"']) {
    assert.ok(editor.includes(v), v);
  }
  // writes the same union types the server multiplexer validates
  assert.match(editor, /v as "pending" \| "in-progress" \| "completed"/);

  const bulk = read("src/flowpath/components/BulkRevisionCreator.tsx");
  assert.match(bulk, /<GlassSelect/);
  // difficulty still writes the preset's question count + minutes
  assert.match(bulk, /questions: preset\.questions, minutes: preset\.minutes/);

  const ai = read("src/revision/components/AiConfigForm.tsx");
  assert.match(ai, /disabled=\{allModels\.length === 0\}/);
  assert.match(ai, /Loading models…/);
  assert.match(ai, /\(custom\)/);
  assert.doesNotMatch(code(ai), /<select\b/);

  const search = read("src/components/SearchPage.tsx");
  assert.match(search, /<GlassSelect value=\{sort\}/);
  assert.match(search, /data-search-result-count/);
});

test("the renewal preview sandbox keeps its probes while adopting the controls", () => {
  const s = read("src/components/subscription/RenewalPreviewPage.tsx");
  assert.match(s, /<GlassSlider/);
  assert.match(s, /<GlassCheckbox/);
  assert.match(s, /<GlassSelect/);
  // pinned by tests/renewalPresentation.test.mjs
  for (const hook of ["data-preview-slider", "data-preview-offset", "data-preview-empty", "data-preview-notification"]) {
    assert.ok(s.includes(hook), hook);
  }
  assert.match(s, /min=\{-12\}/);
  assert.doesNotMatch(code(s), /type="checkbox"/);
});

test("Wave 5 recipes are exercised in the glass preview page", () => {
  const s = read("src/GlassPreview.tsx");
  assert.match(s, /Wave 5 · account &amp; player/);
  for (const needle of ['className="dc-switch shrink-0"', 'className="dc-field', "<GlassSelectTrigger", "dc-slider-violet"]) {
    assert.ok(s.includes(needle), needle);
  }
});
