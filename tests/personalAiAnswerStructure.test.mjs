// tests/personalAiAnswerStructure.test.mjs
//
// The ask-answer pipeline must deliver STRUCTURED answers: paragraphs stay
// paragraphs and `- ` bullet lines stay bullet lines. A regression once ran
// the whole answer body through `cleanAiText` (which folds every newline run
// into one space), so every answer arrived as a single dummy paragraph no
// renderer could split back apart. These pins keep that collapse out.

import test from "node:test";
import assert from "node:assert/strict";
import { cleanAiAnswerText, normalizePersonalAiAnswer } from "../utils/personalAi.js";

test("paragraph breaks and bullet lines survive answer cleaning", () => {
  const raw = "Photosynthesis has two stages.\n\n- Light reactions run on the thylakoid membrane.\n- The Calvin cycle fixes CO2 in the stroma.\n\nDarkness stalls sugar production within minutes.";
  assert.equal(cleanAiAnswerText(raw), raw);
});

test("single newlines inside a paragraph are kept, not folded", () => {
  assert.equal(cleanAiAnswerText("line one\nline two"), "line one\nline two");
});

test("messy whitespace is tidied without touching the shape", () => {
  assert.equal(cleanAiAnswerText("  padded   words\t\there  \n\n\n\nnext para  "), "padded words here\n\nnext para");
  assert.equal(cleanAiAnswerText("a\r\n\r\nb\r\nc"), "a\n\nb\nc");
  assert.equal(cleanAiAnswerText("   "), "");
  assert.equal(cleanAiAnswerText(null), "");
});

test("the length cap prefers a paragraph boundary over slicing mid-word", () => {
  const raw = `${"x".repeat(90)}\n\n${"y".repeat(90)}`;
  assert.equal(cleanAiAnswerText(raw, 100), "x".repeat(90));
  const words = "alpha beta gamma delta epsilon zeta eta theta";
  assert.equal(cleanAiAnswerText(words, 20), "alpha beta gamma");
});

test("normalizePersonalAiAnswer keeps a structured answer structured", () => {
  const payload = normalizePersonalAiAnswer(
    { answer: "First point.\n\n- Bullet one\n- Bullet two", sources: ["u1"], grounded: true, followUps: ["More?"] },
    ["u1"],
  );
  assert.equal(payload.answer, "First point.\n\n- Bullet one\n- Bullet two");
  assert.equal(payload.grounded, true);
  assert.deepEqual(payload.followUps, ["More?"]);
});
