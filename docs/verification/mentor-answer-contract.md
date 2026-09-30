# AI mentor answer contract

What the mentor may refuse (nothing on-topic), and what shape every answer has (one of nine layouts,
checked by code). Covers the Course Player chat ("Roman AI Pro") and the Study Library "Ask this module"
chat — both call `personalAi.ask`.

## Why earlier fixes did not stick

"Structured output" was a hope, not a mechanism. A previous fix stopped `cleanAiAnswerText` folding
newlines, which was real but only one of several leaks:

| # | Root cause | Symptom |
|---|---|---|
| 1 | The ask prompt said *"40-220 words of plain prose … bullets where a list genuinely helps"*. | The model was told **not** to structure. |
| 2 | The layouts (steps, table, timeline, code, deep dive…) lived only in the mock engine `src/lumen/lib/engine.ts`. Production copied a **label** (`formatOf`, a weaker regex copy of `detectFormat`). | The chip said "Step-by-step" over a prose body. |
| 3 | Markdown inside a JSON string is fragile; `extractJson` threw on raw newlines/truncation → `AI_INVALID_JSON`. | Formatting slips became errors or blobs. |
| 4 | `cleanAiAnswerText` trimmed every line. | Code lost its indentation; sub-bullets flattened. |
| 5 | `loadThread` ran every stored message through `cleanAiText` (folds newlines, cuts at 4000 chars) and `appendThread` re-saves the whole thread through it. | One later question flattened every earlier answer, permanently. |
| 6 | `AiProse` (Library chat) only understood paragraphs and all-bullet blocks. | Headings/tables/code showed as raw `###`, `**`, `\|---\|`. |
| 7 | Tailwind's preflight sets `list-style: none`; `.md` only *coloured* the marker. | Numbered steps lost their numbers, bullets their dots, a quiz's key could not be matched to questions. |
| 8 | `withCourseLead` prefixed the course/module **title** to the question the layout was chosen from. | A module called "Programming in Python" made every answer a code answer. |

Refusals came from the same place:

* `PERSONAL_AI_SYSTEM_PROMPT`: *"answer ONLY from the CONTENT block … never state facts not in it … if it does
  not contain the answer, say so"*, plus an empty block that read *"do not answer from memory"*.
* The Library chat replaced its composer with a "Nothing readable in this module yet" card.
* The client footnote and UI copy framed an own-knowledge answer as a failure.

## The contract

```
question ──detectMentorFormat──▶ format ──mentorFormatInstructions──▶ model fills FIELDS (single-line JSON)
reply ──parseMentorModelText (repairs)──▶ fields ──renderMentorAnswer──▶ Markdown
                     └─ legacy {answer} / Markdown / prose ──slotsFromMentorText─┘
Markdown ──validateMentorAnswer──▶ ok?  no → next simpler format (concise is always satisfiable)
```

Everything lives in **`utils/mentorAnswer.js`** (dependency-free; browser, server and tests share it).

| Format | Skeleton (exact) |
|---|---|
| concise | lead · ≤3 bullets · optional closing |
| steps | lead · `### The walkthrough` numbered `**title** — detail` · `> **Watch out:**` |
| comparison | lead · GFM table · takeaway |
| timeline | lead · `- **when** — what` · watch-out |
| code | lead · fenced code · `### Reading it line by line` · watch-out |
| deep-dive | gist · `### The key points` · optional `### How it actually runs` / `### At a glance` / `### In code` · `> **Where students slip:**` |
| visual | lead · fenced text diagram · `### How to read it` (the mentor cannot draw images, so it draws in text) |
| practice | lead · `### Questions` (options nested) · `### Answer key` |
| feedback | lead · `### What's working` · `### What to sharpen` · `### Try this next` |

Guarantees (each pinned by a test):

1. **Exact layouts.** `renderMentorAnswer` reproduces `engine.ts` byte-for-byte for every topic/format.
2. **Nothing off-skeleton leaves the server.** `finalizeMentorAnswer` output passes `validateMentorAnswer` for
   the `format` it reports, or is `""` with `empty: true`. Seeded fuzz: 500 random hostile payloads × 9
   formats in the suite; 54 000 cases were run while developing.
3. **The chip is honest.** `format` is the layout *delivered* (it degrades, e.g. comparison → deep-dive, when
   the model gave no table). The client uses it instead of its own guess.
4. **No invented content.** A missing section is omitted or given a neutral structural lead ("Here is the
   walkthrough."); a one-sentence reply stays one sentence.
5. **Stored answers stay structured** (`loadThread` uses `cleanAiAnswerText`).

## Answer-first policy

* The mentor system prompt (`MENTOR_SYSTEM_PROMPT`) treats the learner's files as material to **prefer and
  cite**, never a precondition. When they do not cover the question, it answers fully from its own knowledge,
  sets `grounded: false`, and never says "not in the file / no access / upload it first".
* On-topic is broad (prerequisites, neighbouring topics, exam prep, study technique, code, maths, the
  learner's own work). Only clearly non-educational asks get one redirect sentence.
* **One** correction if the reply is a dead end (`isMentorDeadEnd`: short *and* phrased as a refusal) or
  empty. It runs inside the same metered call: one allowance count, tokens summed, never a loop. It only
  starts with ≥ 30 s of the handler's budget left and is abandoned after 20 s (a stalled provider must not
  cost the answer already held; an abandoned attempt is not billed). An empty reply after the correction is
  released uncharged (`AI_EMPTY`).
* `grounded: false` is shown as a footnote/badge ("This wasn't in your lesson files, so I answered from
  general knowledge") — information, not a failure.
* Generators (summary, questions, flashcards, plan, orientation) keep the strict grounded-only prompt: they
  must never invent material. "Explain again" takes the mentor policy.

## Changing a layout

1. Edit the renderer, the skeleton in `SKELETONS`, and the field rules in `FORMAT_SPECS` **together**.
2. `tests/mentorAnswerContract.test.mjs` fails until the exact-layout table, the `engine.ts` parity check and
   the validator agree; the fuzz test proves the new layout cannot be produced malformed.
3. Keep the field list single-line: never ask the model to write Markdown into a JSON string again.

## Verification

* `node --test tests/mentorAnswerContract.test.mjs tests/mentorAnswerPolicyRuntime.test.mjs tests/mentorSurfaceContract.test.mjs`
  — the runtime test bundles the real `api/_lib/personalAi.ts` against an in-memory Firestore with a scripted
  provider; the surface test server-renders the real `MessageList`, `Markdown` and `AiMarkdown`.
* Against the pre-change tree (the new module and `AiMarkdown` copied in, everything else as on `main`),
  17 of the 19 runtime tests and 9 of the 15 surface tests fail; the contract file cannot even load there
  because it imports the new `personalAi` exports. The full suite has the same 74 unrelated failures before
  and after (identical test names, checked).
* Visual check: mount `MessageList` with the real `src/index.css` + `src/lumen/index.css` in a scratch Vite
  page (`scratch/` is git-ignored) and screenshot at desktop and phone widths. That is how the missing list
  markers (#7) and the oversized Library headings (global `h3 { font-size: clamp(...) !important }` on
  640–1366 px; hence `role="heading"` in `AiMarkdown`) were found — no unit test would have.
