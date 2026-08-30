// tests/revisionAiGeminiModelContract.test.mjs
//
// Contract for the Revision → AI configuration (admin panel + student app).
//
// Google retired the Gemini 1.5/2.x families. Calling `gemini-2.0-flash` now
// answers:
//   404 "This model models/gemini-2.0-flash is no longer available. Please
//        update your code to use models/gemini-3.6-flash …"
// which silently pushed the admin panel onto the built-in offline generator.
//
// The AI configuration was later upgraded to be multi-provider: admins and
// students can connect Gemini, OpenAI, Anthropic, OpenRouter, Groq or any
// OpenAI-compatible custom API, and the model dropdown lists every model the
// connected key can actually use.
//
// This locks in that:
//   · the built-in default is a live model (gemini-3.6-flash);
//   · no retired model id is left anywhere in the AI paths;
//   · a stale model persisted in localStorage is migrated;
//   · a 404 that names a replacement is retried automatically;
//   · admins pick the default-for-users model from a dropdown of live models;
//   · the admin's published default flows to the shared catalog settings.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const aiGenerate = fs.readFileSync("src/revision/engine/aiGenerate.ts", "utf8");
const aiConfig = fs.readFileSync("src/revision/engine/aiConfig.ts", "utf8");
const revisionPage = fs.readFileSync("src/admin/pages/RevisionPage.tsx", "utf8");
const catalogService = fs.readFileSync("src/revision/engine/catalogService.ts", "utf8");
const aiSettingsPage = fs.readFileSync("src/revision/pages/AiSettingsPage.tsx", "utf8");

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
  assert.match(aiGenerate, /export const DEFAULT_MODEL = "gemini-3\.7-flash"/);
});

test("no retired Gemini model id is used as a default or in the known-model lists", () => {
  for (const id of RETIRED_MODEL_IDS) {
    const asDefault = new RegExp(`DEFAULT_MODEL\\s*=\\s*"${id.replace(/\./g, "\\.")}"`);
    assert.doesNotMatch(aiGenerate, asDefault, `${id} must not be the default model`);
    // Known Gemini models offered in the dropdowns must all be live.
    const known = new RegExp(`\\{ id: "${id.replace(/\./g, "\\.")}"`);
    assert.doesNotMatch(aiConfig, known, `${id} must not appear in the known model list`);
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
  // The working model is persisted (via the migration callback) so the next
  // run starts on it.
  assert.match(aiGenerate, /onModelMigrated/);
  assert.match(aiGenerate, /setGeminiModel\(next\)/);
});

// ---------------------------------------------------------------------------
// Multi-provider configuration
// ---------------------------------------------------------------------------

test("the AI configuration supports every provider family", () => {
  for (const provider of ["gemini", "openai", "anthropic", "openrouter", "groq", "custom"]) {
    assert.ok(aiConfig.includes(`id: "${provider}"`), `${provider} must be a configured provider`);
  }
  // Unified generation + model discovery exist.
  assert.match(aiConfig, /export async function generateQuestionsWithAi\(/);
  assert.match(aiConfig, /export async function fetchProviderModels\(/);
  assert.match(aiConfig, /export function mergeModelLists\(/);
  assert.match(aiConfig, /export function resolveEffectiveAi\(/);
});

test("the model dropdown lists every model a connected key can use", () => {
  // The shared connection form auto-loads models when the key changes and
  // renders them in a <select>.
  assert.match(aiConfig, /export async function fetchProviderModels\(/);
  const form = fs.readFileSync("src/revision/components/AiConfigForm.tsx", "utf8");
  assert.match(form, /refreshModels/);
  assert.match(form, /allModels\.map/);
  assert.match(form, /<select/);
});

// ---------------------------------------------------------------------------
// Admin UI
// ---------------------------------------------------------------------------

test("the admin connects any provider and picks the default model from a dropdown of live models", () => {
  assert.match(revisionPage, /AiConfigForm/);
  assert.match(revisionPage, /loadAdminAiConfig/);
  assert.match(revisionPage, /saveAdminAiConfig/);
  // Admin page is configuration-only — generation lives on the student profile.
  assert.doesNotMatch(revisionPage, /generateQuestionsWithAi/);
  // "Default for all users" section: model chosen from the published list.
  assert.match(revisionPage, /Default for all users/);
  assert.match(revisionPage, /publishModels\.map/);
  assert.match(revisionPage, /<select/);
});

test("every known Gemini model offered in dropdowns is a live (non-retired) model", () => {
  const block = aiConfig.slice(aiConfig.indexOf("gemini: ["), aiConfig.indexOf("openai: ["));
  const values = [...block.matchAll(/id: "(gemini-[^"]+)"/g)].map((m) => m[1]);
  assert.ok(values.length >= 3, "expected several Gemini model choices");
  for (const value of values) {
    assert.ok(
      /^gemini-3(\.\d+)?-/.test(value) || value === "gemini-flash-latest",
      `${value} is not a current Gemini model`,
    );
  }
  assert.ok(values.includes("gemini-3.6-flash"), "the previous default must remain selectable");
  assert.ok(values.includes("gemini-3.7-flash"), "the current default (best reasoning) model must be selectable");
});

test("the admin-published default is part of the shared catalog", () => {
  assert.match(catalogService, /aiSettings: CatalogAiSettings/);
  assert.match(catalogService, /defaultCatalogAiSettings\(\)/);
  assert.match(catalogService, /normalizeCatalogAiSettings\(raw\.aiSettings\)/);
});

test("admin can publish daily and rolling-window AI limits for every user", () => {
  assert.match(aiConfig, /dailyLimit:/);
  assert.match(aiConfig, /windowHours:/);
  assert.match(aiConfig, /windowLimit:/);
  assert.match(revisionPage, /Usage limits for every user/);
  assert.match(revisionPage, /dailyLimit/);
  assert.match(revisionPage, /windowHours/);
  const profile = fs.readFileSync("src/profile/App.tsx", "utf8");
  assert.match(profile, /AiQuotaCard/);
  const usage = fs.readFileSync("src/revision/engine/aiUsage.ts", "utf8");
  assert.match(usage, /consumeAiGeneration/);
  assert.match(usage, /users.*aiUsage/);
  const rules = fs.readFileSync("firestore.rules", "utf8");
  assert.match(rules, /match \/aiUsage\/\{documentId\}/);
});

test("students can configure their own custom API in the app", () => {
  assert.match(aiSettingsPage, /loadUserAiConfig/);
  assert.match(aiSettingsPage, /saveUserAiConfig/);
  assert.match(aiSettingsPage, /AiConfigForm/);
  assert.match(aiSettingsPage, /resolveEffectiveAi/);
  assert.match(aiSettingsPage, /liveModelsOnly/);
  assert.match(aiSettingsPage, /blankOwnAiConfig/);
});
