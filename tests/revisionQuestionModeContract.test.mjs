import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const aiPage = read("src/revision/pages/AiGeneratePage.tsx");
const aiGenerate = read("src/revision/engine/aiGenerate.ts");
const aiConfig = read("src/revision/engine/aiConfig.ts");
const customTests = read("src/revision/engine/customTestService.ts");
const cloudClient = read("src/revision/engine/cloudRevisionService.ts");
const cloudApi = read("api/_lib/revisionData.ts");
const generateApi = read("api/_lib/revisionGenerate.ts");
const results = read("src/revision/pages/TestResultPage.tsx");

test("AI generator exposes question type as a separate setting with Mixed default", () => {
  assert.match(aiPage, /useState<QuestionMode>\("mixed"\)/);
  assert.match(aiPage, /2 · Difficulty/);
  assert.match(aiPage, /Question type/);
  assert.match(aiPage, /Difficulty controls level only\. Question type is selected separately below\./);
  assert.match(aiPage, /label:\s*"Mixed"/);
  assert.match(aiPage, /label:\s*"Theory only"/);
  assert.match(aiPage, /label:\s*"Application only"/);
  assert.doesNotMatch(aiPage, /setQuestionMode\(m\.value\)[\s\S]{0,120}setDifficulty/);
});

test("selected questionMode travels to both generation paths and saved test plans", () => {
  assert.match(aiPage, /questionMode,\n\s*count: total/);
  assert.match(aiPage, /planDetails:\s*\{[\s\S]*questionMode,/);
  assert.match(aiConfig, /syllabusToInput[\s\S]*questionMode: syllabus\.questionMode/);
  assert.match(aiConfig, /body: JSON\.stringify\(\{[\s\S]*syllabus: args\.syllabus/);
  assert.match(generateApi, /const source = body\.source === "own" \? "own" : "default"/);
  assert.match(generateApi, /generateWithProvider\(config, syllabus, origin\)/);
});

test("AI prompts enforce theory, application, and mixed modes", () => {
  for (const source of [aiGenerate, generateApi]) {
    assert.match(source, /THEORETICAL \/ CONCEPT-BASED ONLY/);
    assert.match(source, /Do NOT include numerical problems or long application-based word problems/);
    assert.match(source, /APPLICATION-BASED ONLY/);
    assert.match(source, /Do NOT include pure definition, naming or formula-recall questions/);
    assert.match(source, /MIXED THEORY \+ APPLICATION/);
    assert.match(source, /balanced blend of theory\/concept questions and application\/problem-based questions/);
  }
});

test("question type is a strict, self-checked rule with explicit forbidden kinds", () => {
  for (const source of [aiGenerate, generateApi]) {
    // A labelled hard constraint, per-mode forbidden lists, a same-style
    // example, and a self-check the model runs before answering.
    assert.match(source, /STRICT QUESTION TYPE RULE — the learner selected: THEORY ONLY/);
    assert.match(source, /STRICT QUESTION TYPE RULE — the learner selected: APPLICATION ONLY/);
    assert.match(source, /STRICT QUESTION TYPE RULE — the learner selected: MIXED/);
    assert.match(source, /Forbidden in theory mode/);
    assert.match(source, /Forbidden in application mode/);
    assert.match(source, /Self-check before answering/);
    assert.match(source, /What is the SI unit of force\?/);
    // The system prompt also defends the rule so weak system-attention models comply.
    assert.match(source, /question-style rule in the user request is a hard constraint/);
    // The final line of the user prompt repeats the selected type as a hard check.
    assert.match(source, /CRITICAL FINAL CHECK/);
    assert.match(source, /follows that rule exactly/);
  }
});

test("generation temperature is pinned low so strict rules are followed", () => {
  assert.match(generateApi, /temperature: 0\.4/);
  assert.match(aiGenerate, /temperature: 0\.4/);
  assert.match(aiConfig, /temperature: 0\.4/);
  assert.doesNotMatch(generateApi, /temperature: 0\.7/);
  assert.doesNotMatch(aiGenerate, /temperature: 0\.7/);
});

test("questionMode survives local save, cloud sanitize, migration, and result/history display", () => {
  assert.match(customTests, /questionMode: normalizeQuestionMode\(input\.planDetails\.questionMode\)/);
  assert.match(customTests, /Existing plans that pre-date questionMode get an explicit Mixed/);
  assert.match(cloudClient, /test: structuredClone\(test\)/);
  assert.match(cloudApi, /questionMode: \["mixed", "theory", "application"\]/);
  assert.match(cloudApi, /action === "revision\.data\.create" \|\| action === "revision\.data\.migrate"/);
  assert.match(results, /Saved Test Plan/);
  assert.match(results, /questionModeLabel\(data\.planDetails\.questionMode\)/);
});
