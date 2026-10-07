# Brain practice sets — the admin authoring flow

A **Brain · practice set** is the one course resource whose content lives inside
the product document instead of at a URL: the questions *are* the resource. It
is created on the admin side in **Product Builder → module → Resources** by
picking the resource type `Brain · practice set`, and it reaches the learner as
the **Brain** tab of the Course Player.

```
Admin: PracticeSetImportPanel          Player: CourseBrainPanel
  (paste / AI CMD / by hand)              (the MCQ deck + review screen)
        ↓  resource.practiceQuestions            ↑
  utils/productMapping.js → utils/practiceSet.js  →  CourseFile.practiceQuestions
```

One normaliser (`utils/practiceSet.js`) is shared by the editor preview, the
stored document and the player, so a question the admin can save is exactly a
question the learner can answer.

## The three ways to author a set

The panel shows them as a numbered flow, so an admin never has to guess:

1. **Step 1 — let an AI write the questions (the CMD).** The panel builds a
   copy-paste prompt (`src/utils/practicePrompt.ts`) from two editable slots —
   **Topic** and **Class / level** — plus a question count and a language. Copy
   the CMD into ChatGPT / Gemini / Claude and the reply comes back in the exact
   plain-text shape the importer parses. The CMD is shown in an editable box:
   the fields rewrite it, and manual edits are copied verbatim. Quick-fill
   buttons cover the usual levels (`Class 9–10`, `JEE / NEET`, …).
2. **Step 2 — paste & import.** The pasted block goes through the same parser as
   the revision bulk importer (`src/revision/engine/bulkParser.ts`): numbered
   prompts, `A.` … `D.` options, an answer marker (`✓ ✔ √ * [correct] **bold**`
   or an `Answer: B` line) and an `Explanation:` line. Importing **appends** to
   the set, so a chapter can arrive in several passes.
3. **Add question manually.** A blank card for hand-written questions, with the
   same fields the importer produces.

## The explanation is never optional

Every question carries an explanation, and the rule has one definition —
`practiceQuestionIssues()` in `utils/practiceSet.js`:

- the panel's per-question pill names exactly what is missing (`no question
  text`, `needs 2 options`, `no answer marked`, `no explanation`);
- the resource card shows `N to fix` until every question is complete;
- **publishing is blocked** (`ProductEditor`) with the count of incomplete
  questions — each needs text, two options, a marked answer *and* an
  explanation;
- the panel's Step-2 preview counts how many pasted questions came with an
  explanation, and the AI CMD demands one on every question.

Two gates, on purpose:

| Gate | Function | Who reads it |
| --- | --- | --- |
| Runtime / playability | `practiceQuestionsReady()` | `isUsableResource` in `utils/productMapping.js` — a set published **before** this rule keeps playing for the learners who own it |
| Publish | `practiceQuestionsExplained()` (+ the per-question rule) | the admin panel and `ProductEditor`'s validation |

So the admin can never publish a question without its "why", and no learner ever
loses a set that is already live.

## Limits and shape

- 2–6 options per question (the player letters A–F), 100 questions per set
  (`MAX_PRACTICE_QUESTIONS`), difficulty `easy | medium | hard`, optional topic
  chip.
- Storage shape (Firestore-safe, no `undefined`): `id`, `prompt`, `options[]`,
  `correctIndex` (`-1` = unmarked), `explanation`, `difficulty`, `topic`.
- Drafts are kept: a half-written question stays in the editor blob exactly as
  typed; only complete sets are publishable and only complete sets reach the
  player's Brain tab.

## Tests

- `tests/courseBrainPracticeContract.test.mjs` — the normaliser, the mapping
  round trip, the access filter, the player deck.
- `tests/adminBrainPracticePromptContract.test.mjs` — the CMD (topic/class
  placeholders, format rules, the example parsing through the real importer),
  the never-optional explanation (rule, publish gate, counter) and the real
  panel driven in jsdom (typing rewrites the CMD, copy works, a blank question
  is flagged, the CMD's example imports ready).
