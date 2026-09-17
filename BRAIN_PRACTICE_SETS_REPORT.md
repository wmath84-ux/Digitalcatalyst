# Brain practice sets — admin import → Course Player Brain page

Everything the owner asked for in one feature line: the **Brain button inside the
Course Player** now carries the practice sets the admin builds on the
**Product / Course-content** page, imported with **the exact bulk-import flow the
revision profile page uses**, rendered with **the exact revision test-taking
design**, scaled to the viewport.

---

## 1. Admin: a new resource type "Brain · practice set"

| Where | What |
| --- | --- |
| `src/components/admin/products/ModulesResourcesEditor.tsx` | `RESOURCE_TYPES` gained `brain` (label **"Brain · practice set"**, provider `Brain`). Picking it swaps the URL fields for the importer, removes the "URL required" blocker and the "Open URL" button, and swaps the card pill for a question counter: `Questions required` / `n questions ready` / `n questions · answer missing`. |
| `src/components/admin/products/PracticeSetImportPanel.tsx` (new) | The importer itself — the same flow as the revision profile page: paste the revision question format and press **Import n questions**, or **Add question manually**. Live preview, per-question options (2–6), tap the circle to mark the correct answer, explanation, topic, difficulty, remove, rename the set. |
| `src/components/admin/products/ProductEditor.tsx` | Publish blocker: a `brain` resource with no complete question set cannot be published, and it is **exempt from the URL rule**. `persist()` normalises the set on the way out (canonical ids/caps) and clears the link fields a card may have kept from its previous type. |
| `src/lib/admin/types.ts` | `ProductResource.type` gained `brain`; `practiceQuestions` / `practiceTitle` and the `ProductPracticeQuestion` shape (mirrors the runtime normaliser). |

The parser is **not a copy**: the panel imports `parseQuestionText` from
`src/revision/engine/bulkParser.ts` — the same function the revision importer
uses — and normalises through `utils/practiceSet.js`, which the player then
reads back.

## 2. One normaliser, every hop

`utils/practiceSet.js` (+ `.d.ts`) is the single source of truth:

- `normalizePracticeQuestion(s)` — caps at **100 questions / 6 options**, needs
  **2 options** minimum, fills ids, `correctIndex: -1` = not marked;
- `practiceQuestionsReady()` / `countUnmarkedPracticeQuestions()` — the publish
  gate the admin panel and the product editor share;
- `collectBrainPracticeSets(modules, unlockedModuleIds)` — the list the player
  renders: curriculum order, hidden modules/files skipped, **locked or unowned
  paid modules never leak their practice**.

`utils/productMapping.js` knows `brain` as a first-class type: it survives
editor → Firestore → catalog → player → editor **with its questions**, emits
`{ type: "brain", … }` into the course tree, and `utils/productMapping.d.ts`
carries the same shape.

## 3. Course Player: the Brain page

- **Dock tab** — `Brain` (green), hint *"Practice sets — apna Brain test"*.
  A `brain` resource is visible/reachable without a URL and shows
  `n practice questions` as its row subtitle.
- **Follows the lesson** — the tab opens on the **module of the lesson being
  watched** (same source the mind map uses) and a chip row switches modules by
  hand (`All modules`, one chip per module, each with its count). A module with
  no practice of its own shows its own honest empty state plus
  *"Show all practice sets"*.
- **Three ways in** — tap the row in the Modules list, resume a previously
  opened practice set, or deep-link a module whose only content is a set.
- **The design is the revision test-taking page** — `CourseBrainPanel` reuses
  the same markup language and copy as `src/revision/pages/TestPlayerPage.tsx`:
  the `GlassTile` answer tiles with the indigo ink + letter circle, the
  `ProgressBar` header, `Skip this question`, `Previous` / `Review & Submit`,
  the 5-column review grid with the **Answered / Unanswered** legend, the
  scoped submit dialog (*"Keep Reviewing"*, *"1 unanswered question"*), the
  result screen (score, correct/wrong/skipped, accuracy, topic breakdown) and
  the answer explanations.
- **Scales with the viewport** — every size is `S(px) = calc(px * var(--brain-scale))`;
  `--brain-scale` steps 1 → 1.08 @560px → 1.16 @820px → 1.24 @1200px
  (in `src/index.css`, with the panel's `max-height` raised alongside it).
- **Progress** — passing a set (**≥ 60%**) marks its resource complete once
  (`arrayUnion`, never a regression), and sets sit in the progress denominator
  as well, clamped at 100%. Practice history is per device
  (`dc:courseBrain:{productId}`) and never writes into the revision Test Bank.
- **Safety net** — a resource type the Lumen AI reader has no icon for now
  draws a stage instead of crashing on an undefined component.

## 4. Default setting

**Player settings → "Always-visible footer dock" defaults ON.** Absent key =
ON, only an explicit `"0"` (the learner's own choice) turns it off; the choice
is still remembered per device.

## 5. Demo data

`src/data/demoCourseContent.ts` ships a 13th module `mod-brain` /
`file-brain-1` — *"Algebra Warm-up"* with 4 real questions — plus its
`modulePriceSummary` row, so the Brain tab is populated on demo courses
immediately.

## 6. Verification

- `src` + `utils` typecheck: **clean** (one pre-existing, unrelated
  `PricingGlassCard` unused-variable error).
- `npx vite build`: **success**.
- `node --test "tests/*.test.mjs"`: **2476 tests, 2444 pass, 32 fail** — the
  32 are **byte-identical to the untouched branch's baseline** (verified by
  stashing the whole change and re-running), i.e. this feature adds none.
- `tests/courseBrainPracticeContract.test.mjs` — **29/29 pass**: the normaliser,
  the five mapping hops, the access filter, the admin surface and publish rules,
  the panel/wiring, design parity with the revision page, the module-follow
  chip row, reachability, and the footer-dock default.
- Both new surfaces were additionally mounted end to end in a scratch
  jsdom harness (panel: 23 checks — library, module chips, pinned set from
  another module, question → review → submit → result, retake and pass;
  importer: 22 checks — paste format, `Answer: B`, manual add, mark correct,
  remove, rename), after which the scratch files were deleted.
