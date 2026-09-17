# Course Player AI — how every file type is read

**Who this is for:** anyone debugging "the AI says it can't read my module",
adding a resource type, or deciding what the assistant is allowed to see.

---

## 1. The symptom, and what it actually was

A learner with full access asked the Course Player's AI anything — a question,
a summary request, a greeting — and every answer came back along the lines of
*"mujhe is module ka access nahi hai."* Nothing was ever wrong with their
access. Three separate things were wrong:

1. **The scope for an official lesson was an empty list.**
   `api/_lib/personalAi.ts` routed a Course Player ask into
   `virtualCoursePlayerScope()`, which returned `resources: []` by design
   ("without inventing official-file extraction"). The model is then handed an
   empty `CONTENT:` block *and* a system rule that forbids answering from
   memory. It obeys, and says it cannot read the module. For every message.

2. **An official module id looked like a personal one.**
   The admin mints course module ids as `mod_<base36>`, and `isValidPersonalId`
   accepts that shape. So a `moduleId` from the course tree was routed into the
   *personal* resolver, looked up under `users/{uid}/personalCourseModules/…`,
   missed, and answered `404 MODULE_NOT_FOUND — "That module isn't available to
   this account."` A hard error that reads exactly like an entitlement problem.

3. **Three tables described the same files, differently.**
   `utils/personalCourse.js::personalAiAvailability()` still announced that
   *"Reading text out of personal PDF/e-book files isn't supported yet"* weeks
   after the server's PDF extractor shipped, and had **no row at all** for
   `doc`, `sheet`, `slides` or `brain`, so those fell through to *"Content isn't
   readable by the AI assistant yet."* The chat had a third opinion in
   `src/lumen/course/adapters.ts`. Whichever table a given surface happened to
   read decided what the learner was told.

   (There was a fourth: the ZIP playground's simulated extractor
   `src/lumen/course/server/extractionApi.ts` authorised from hard-coded claims
   `{ userId: "student-aria", courseIds: ["crs-phys-201"] }`. Against any real
   course it answered *"You don't have access to this course."* — and that
   answer was cached forever, because `contentService.ts` cached denials.)

**The fix is not a copy edit.** Access checks, extraction and per-type
capabilities were merged into one registry that every surface must derive from,
the official lesson is resolved against the real course tree under the learner's
real entitlements, and any id that "looks like a personal module" is now
*checked* rather than assumed.

---

## 2. One registry: `utils/aiFileReaders.js`

Pure, no network, no Firestore, no React — imported by the browser bundle, the
Vercel functions and `node --test`. Every row carries:

| field | meaning |
|---|---|
| `via` | the normal read path for that type (`google-export` / `pdf-bytes` / `caption-file` / `text-file` / `in-document` / `none`) |
| `hasReadPath` | a real pipeline exists for this **kind** of file |
| `captions` | a linked `.vtt` / `.srt` makes this type readable |
| `payload` | readable text may already sit inside the resource document |
| `visual` | the learner can see it, so a screenshot is a legitimate path |
| `fallback` | `screenshot` / `metadata` / `none` |
| `reason` | the learner-facing sentence used when nothing could be read |

`aiReadPlan(resource)` then decides, per file, in this fixed order:

```
1. in-document   text already in the document  → no network, no permission
2. caption-file  a linked transcript file      → fetch, parse cues
3. Google id     doc/sheet/slides → export endpoint · pdf/ebook → uc?export=download
                 (tried for any scheme: the URL we build is always https, so a
                  link pasted as `http://docs…` or a bare /file/d/… view link is
                  still read — refusing it would be pedantry at the learner's cost)
4. no link       → "no link to read", or "no questions imported yet" for a type
                  whose content lives in the document, where a link is not the point
5. scheme        not a web address / not https → its own sentence each
6. extension     .vtt/.srt → caption-file · .txt/.md/.csv/.html/… → text-file
7. type path     pdf/ebook → bytes (never a server-rendered .php/.aspx download)
8. media file    → never read; the reason names the fix (a transcript)
9. none          the registry's honest reason for that type
```

Two rules that the whole design rests on:

* **`hasReadPath` is about the type; whether *this* file was read comes from the
  extraction outcome** (`personalAiState()` in `utils/personalAi.js`). A type
  being readable never entitles an answer to claim a specific file was read.
* **A refusal must never be phrased as a permission problem** unless one was
  verified. "Not shared with anyone holding the link" is fixable by the learner;
  "you don't have access" is not.

`personalAiReadPlan()` (server) and `personalAiAvailability()` (honesty table)
are now thin wrappers over this file, and `src/lumen/course/adapters.ts` builds
its `Capabilities` from `aiCapabilitiesFor()`. `tests/courseAiReaderRegistry.test.mjs`
fails if any of them starts disagreeing again.

---

## 3. Per type: what the AI does, and what makes it better

| # | Course type | Read path today | What the AI can answer from | To make it fully readable |
|---|---|---|---|---|
| 1 | `pdf` | bytes → zlib inflate → `Tj`/`TJ` operators (`extractPdfText`) | full text, page-number citations | make the link a **direct** `https` PDF, or a Drive file shared as "anyone with the link" |
| 2 | `ebook` | same as PDF (`drive…uc?export=download` when it is a Drive id) | PDF text | EPUB is **not** parsed — publish the PDF, or attach the passage as text |
| 3 | `doc` | `docs.google.com/document/d/{id}/export?format=txt` | full document text | share the doc "anyone with the link"; a non-Google link must end in a text extension |
| 4 | `sheet` | `…/spreadsheets/d/{id}/export?format=csv` | rows as `Header: value` pairs | same sharing rule |
| 5 | `slides` | `…/presentation/d/{id}/export?format=txt` | slide text + speaker notes | same sharing rule |
| 6 | `youtube` | **no watching, no scraping** | title; transcript if present | attach `transcriptUrl` (`.vtt`/`.srt`) or paste `transcriptText` |
| 7 | `video` | media file itself is never read | title; transcript if present | link the sidecar `.vtt` as `captionsUrl` (the extractor parses cues with timestamps) |
| 8 | `audio` | same rule as video, `fallback: metadata` | title; transcript if present | attach the transcript — an audio player has nothing to screenshot |
| 9 | `image` | no OCR path in-app | title, description, learner's notes | the learner's own capture/screenshot (per-message, already supported) |
| 10 | `google_form` | **never read** — questions and responses belong to the form owner | title, notes | nothing to fix: send a screenshot of the exact question |
| 11 | `embed` | **never scraped** — a sandboxed third-party iframe | title, notes | screenshot of the region the learner means |
| 12 | `mindmap` | `in-document` when the map's own nodes are stored; the embedded Whimsical view is not readable | the learner's own branch text | store/read the node tree (both flat `{nodes}` and nested `{topic, children}` shapes are already handled) |
| 13 | `brain` | `in-document` — **its content is its `practiceQuestions`** | prompts, options, answer keys, explanations, topics | no link needed; in an official course the set must be publish-ready (≥2 options per question, correct answer marked) or the product itself drops the file (see §4) |

Anything with a text/caption extension is read as its extension says, whatever
it is labelled — the registry deliberately prefers bytes over labels, because a
`.md` filed under "Google Doc" is still markdown.

An unrecognised type degrades to the safest row (`metadata` + screenshot) and
still carries a non-empty reason, so a new server-side type can never arrive in
the chat as an unexplained "no access".

---

## 4. Scope resolution — who may read what

```
                              ┌─ personal module id AND it exists under
   POST /api/personal-ai ───► │  users/{uid} → resolveScope()  (unchanged)
   personalAi.ask             │
                              └─ otherwise → officialCoursePlayerScope():
                                   siteProducts/{id|public id}
                                     → firestoreToCatalogProduct()
                                     → resolveCourseAccess()   ← the player's own resolver
                                     → module (by id, else by open file,
                                        else first accessible)
                                     → files[] filtered by accessibleResourceIds
                                        / accessibleModuleIds, minus hidden
                                     → readScopeContent() per file
```

* `uid` only ever comes from the verified Firebase ID token.
* A file is read **only if the same resolver the Course Player uses says this
  learner may open it**. A locked `paidUpdate`, a `hidden` item, another
  account's product → zero files, and the answer is grounded in titles/notes
  alone, with a note saying so.
* Anything failing in that chain (a missing composite index, a cold emulator,
  an unreadable product doc) **degrades to reading nothing — it never becomes a
  500 and never becomes an "access" error**.
* Extraction cache keys for official files are derived
  (`oc_<hash(product/file)>`), never the raw shared id, so two learners can
  never read each other's cached extraction. The learner's own notes still
  resolve, via `aliases` on the resource.
* `readScopeContent` reads at most 8 files per pass inside a 14 s budget; the
  rest report `processing` with an honest "open the module again" reason.

**Two product rules the AI deliberately inherits** (both are asserted against the
real resolver in `tests/coursePlayerOfficialAiScopeRuntime.test.mjs`, so they
cannot drift):

* **The URL-only rule.** `firestoreToCatalogProduct` drops any course file that
  has no usable link — and any `brain` whose questions are not publish-ready
  (`utils/practiceSet.js`: ≥2 options, a detected correct answer). That file is
  not in the player either, so it is not in the AI's scope. If a learner says
  "the AI can't read my practice set", the admin-side fix is to complete the set
  or give the file a link — not to widen the AI.
* **`requireBaseCourseForUpdate: true`.** Owning the base course opens its
  `paidUpdate` modules (that is what the flag means in `utils/courseAccess.js`);
  owning only an update does nothing. The AI reads exactly the set the resolver
  grants — including those update files — and never a superset. Widening or
  narrowing that belongs in `resolveCourseAccess`, not in the AI path.

Capacities the tutor may claim per type come from the registry, so the chat's
"AI-readable / Not shared yet / Screenshot only" chips and the server's
availability agree by construction.

---

## 5. What the learner is told

The registry decides what is read; the UI must say the same thing, or the
learner draws their own (wrong) conclusion. Both are wired to the same strings:

| Where | What is shown |
|---|---|
| "What the AI can read" panel (`src/ai/AiSourcesView.tsx`) | one row per file with its own state and reason, straight from `personalAiReadPlan` + the extraction outcome |
| Coverage line, every AI tab (`AiCoverageLine`) | "3 of 4 files in this scope could be read." **plus the scope note** — which sub-modules were locked, which files had no readable link |
| Under an answer (`src/ai/AiChatView.tsx`) | the answer's own `scopeNote`, because that is the scope the answer was actually built from |
| Lumen chat | the same reason text, appended by `withGroundingNote()` — a refusal always names the file-level cause |

`scopeNote` originates on the server (`api/_lib/personalAi.ts`) from the
resolved scope, so it can never be a client-side guess about the learner's
access; and it is deliberately phrased as "its files were not read", never as
"you don't own this".

---

## 6. Adding a file type — the whole checklist

1. `utils/aiFileReaders.js` — add the label and the registry row (`via`,
   `captions`, `payload`, `hasReadPath`, `visual`, `fallback`, `reason`).
2. If it needs a new read path, implement it in
   `api/_lib/personalAiContent.ts` and execute the plan kind it returns.
3. `src/lumen/course/adapters.ts` — an adapter (position + fallback prose);
   capabilities come from the registry, so they cannot drift.
4. `src/types/course.ts` `CourseFileType`, admin builder, player viewer.
5. Run `node --test tests/courseAiReaderRegistry.test.mjs
   tests/coursePlayerAiGroundingContract.test.mjs` — coverage, the type
   cross-check, and the honesty contract are all asserted there.

A type that skips step 1 is a type the assistant will refuse to read while the
server can read it — which is the bug this document exists to prevent.
