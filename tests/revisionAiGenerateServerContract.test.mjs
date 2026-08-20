// tests/revisionAiGenerateServerContract.test.mjs
//
// AI generation must go through a real server proxy so OpenAI / Anthropic /
// Groq / custom APIs are not blocked by CORS, and every syllabus field the
// student filled in is sent to the model.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const generatePage = fs.readFileSync("src/revision/pages/AiGeneratePage.tsx", "utf8");
const aiConfig = fs.readFileSync("src/revision/engine/aiConfig.ts", "utf8");
const aiGenerate = fs.readFileSync("src/revision/engine/aiGenerate.ts", "utf8");
const server = fs.readFileSync("api/_lib/revisionGenerate.ts", "utf8");
const leaderboard = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
const vercelConfig = fs.readFileSync("vercel.json", "utf8");
const viteConfig = fs.readFileSync("vite.config.ts", "utf8");

test("revision generate is served through the existing leaderboard function, not a 13th serverless entry", () => {
  assert.ok(!fs.existsSync("api/revision/generate.ts"), "must not add a new serverless function");
  assert.match(leaderboard, /handleRevisionGenerate/);
  assert.match(leaderboard, /req\.method === \"POST\"/);
  assert.match(vercelConfig, /\/api\/revision\/generate/);
  assert.match(vercelConfig, /\/api\/referral-leaderboard/);
});

test("the server prompt includes class, subject, chapter, concepts, difficulty, count and time", () => {
  assert.match(server, /export function buildSyllabusPrompt/);
  assert.match(server, /Class:/);
  assert.match(server, /Subject:/);
  assert.match(server, /Chapter:/);
  assert.match(server, /Concepts \/ topics:/);
  assert.match(server, /Exam duration to keep in mind:/);
  assert.match(aiGenerate, /Class:/);
  assert.match(aiGenerate, /Concepts \/ topics:/);
});

test("Gemini generate URL always includes /models/", () => {
  assert.match(aiGenerate, /export function geminiGenerateUrl/);
  assert.match(aiGenerate, /geminiGenerateUrl\(config\.baseUrl, model\)/);
  assert.match(server, /export function geminiGenerateUrl/);
  assert.match(server, /\/models\$/);
});

test("own and custom API keys are posted to the server proxy", () => {
  assert.match(aiConfig, /export async function generateRevisionQuestions/);
  assert.match(aiConfig, /\/api\/revision\/generate/);
  assert.match(aiConfig, /source === \"own\"/);
  assert.match(aiConfig, /apiKey: args\.config\.apiKey/);
  assert.match(server, /source === \"own\"/);
  assert.match(server, /chat\/completions/);
  assert.match(server, /assertSafeBaseUrl/);
});

test("the generator page sends the full syllabus and does not silently swap in dummy questions", () => {
  assert.match(generatePage, /generateRevisionQuestions/);
  assert.match(generatePage, /classNames/);
  assert.match(generatePage, /subjectNames/);
  assert.match(generatePage, /chapterNames/);
  assert.match(generatePage, /topicNames/);
  assert.match(generatePage, /minutes: totalMinutes/);
  assert.doesNotMatch(generatePage, /built your test with the offline engine instead/);
  assert.match(generatePage, /Check your configuration and try again/);
});

test("local Vite answers /api/revision/generate with JSON instead of the SPA", () => {
  assert.match(viteConfig, /\/api\/revision\/generate/);
  assert.match(viteConfig, /dev_no_api/);
});
