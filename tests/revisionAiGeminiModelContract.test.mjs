// tests/revisionAiGeminiModelContract.test.mjs
//
// Contract for the admin Revision → AI Generate model configuration.
//
// Google retired the Gemini 1.5/2.x families. Calling `gemini-2.0-flash` now
// answers:
//   404 "This model models/gemini-2.0-flash is no longer available. Please
//        update your code to use models/gemini-3.6-flash …"
// which silently pushed the admin panel onto the built-in offline generator.
//
// This locks in that:
//   · the built-in default is a live model (gemini-3.6-flash);
//   · no retired model id is left anywhere in the AI generate path;
//   · a stale model persisted in an admin's localStorage is migrated;
//   · a 404 that names a replacement is retried automatically;
//   · the admin picks the model from a dropdown of live models.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const aiGenerate = fs.readFileSync("src/revision/engine/aiGenerate.ts", "utf8");
const revisionPage = fs.readFileSync("src/admin/pages/RevisionPage.tsx", "utf8");

const RETIRED_MODEL_IDS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro-vision",
];

// ---------------------------------------------------------------------------
// Default model
// ---------------------------------------------------------------------------

test("the default Gemini model is the current Flash model, not a retired one", () => {
  assert.match(aiGenerate, /export const DEFAULT_MODEL = "gemini-3\.6-flash"/);
});

test("no retired Gemini model id is used as a default or placeholder", () => {
  for (const id of RETIRED_MODEL_IDS) {
    const asDefault = new RegExp(`DEFAULT_MODEL\\s*=\\s*"${id.replace(/\./g, "\\.")}"`);
    assert.doesNotMatch(aiGenerate, asDefault, `${id} must not be the default model`);
    const placeholder = new RegExp(`placeholder="${id.replace(/\./g, "\\.")}"`);
    assert.doesNotMatch(revisionPage, placeholder, `${id} must not be shown as the model placeholder`);
    const hint = new RegExp(`defaults to ${id.replace(/\./g, "\\.")}`, "i");
    assert.doesNotMatch(revisionPage, hint, `${id} must not be advertised as the default in the admin hint`);
  }
});

// ---------------------------------------------------------------------------
// Stored-model migration
// ---------------------------------------------------------------------------

test("retired models stored in localStorage are detected and upgraded", () => {
  assert.match(aiGenerate, /export function isRetiredModel\(/);
  assert.match(aiGenerate, /RETIRED_MODEL_PATTERNS/);
  // getGeminiModel rewrites the stale value instead of returning it.
  const getter = aiGenerate.slice(
    aiGenerate.indexOf("export function getGeminiModel"),
    aiGenerate.indexOf("export function setGeminiModel"),
  );
  assert.match(getter, /isRetiredModel\(stored\)/);
  assert.match(getter, /setGeminiModel\(DEFAULT_MODEL\)/);
  assert.match(getter, /return DEFAULT_MODEL/);
});

test("a stored 'models/' prefix is normalised away", () => {
  assert.match(aiGenerate, /function normalizeModelName\(/);
  assert.match(aiGenerate, /replace\(\/\^models\\\/\/i, ""\)/);
});

// ---------------------------------------------------------------------------
// 404 auto-recovery
// ---------------------------------------------------------------------------

test("a 404 naming a replacement model is retried automatically", () => {
  assert.match(aiGenerate, /export function extractSuggestedModel\(/);
  assert.match(aiGenerate, /use\\s\+models\\\/\(\[a-z0-9\._-\]\+\)/i);
  assert.match(aiGenerate, /res\.status === 404/);
  assert.match(aiGenerate, /const suggested = extractSuggestedModel\(detail\)/);
  // The working model is persisted so the next run starts on it.
  assert.match(aiGenerate, /setGeminiModel\(fallback\)/);
});

// ---------------------------------------------------------------------------
// Admin UI
// ---------------------------------------------------------------------------

test("the admin picks the model from a dropdown of live models", () => {
  assert.match(aiGenerate, /export const MODEL_OPTIONS/);
  assert.match(aiGenerate, /gemini-3\.7-flash/);
  assert.match(aiGenerate, /gemini-3\.5-flash-lite/);
  assert.match(revisionPage, /GEMINI_MODEL_OPTIONS/);
  assert.match(revisionPage, /GEMINI_MODEL_OPTIONS\.map/);
  // Rendered as a <select>, not a free-text input the admin has to guess at.
  const card = revisionPage.slice(revisionPage.indexOf('title="Gemini API key"'), revisionPage.indexOf('title="AI question generator"'));
  assert.match(card, /<select/);
  assert.match(card, /setGeminiModel\(e\.target\.value\)/);
});

test("every model offered in the dropdown is a live (non-retired) model", () => {
  const block = aiGenerate.slice(aiGenerate.indexOf("MODEL_OPTIONS"), aiGenerate.indexOf("RETIRED_MODEL_PATTERNS"));
  const values = [...block.matchAll(/value: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(values.length >= 3, "expected several model choices");
  for (const value of values) {
    assert.ok(
      /^gemini-3(\.\d+)?-/.test(value) || value === "gemini-flash-latest",
      `${value} is not a current Gemini model`,
    );
  }
  assert.ok(values.includes("gemini-3.6-flash"), "the default model must be selectable");
});

test("the UI mirrors an auto-upgraded model back into the form", () => {
  assert.match(revisionPage, /setModel\(getGeminiModel\(\)\)/);
});
