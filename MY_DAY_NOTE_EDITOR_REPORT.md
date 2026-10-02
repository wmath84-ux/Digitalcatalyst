# My Day — the note page now uses the Course Player's note editor

**Owner's direction:** My Day's note-taking page must use *exactly the same* note
editor as the one inside the Course Player — the BlockNote one. The old editor on
that page is to be replaced, not kept alongside.

---

## 1. What was there

`src/components/myday/QuickNotes.tsx` mounted the course player's *legacy*
editor — `RichTextEditor`, a `contentEditable` surface driven by
`document.execCommand`:

```tsx
// src/components/myday/QuickNotes.tsx (before)
<RichTextEditor
  value={value}
  onChange={editing ? (html) => setEditDraft(html) : (html) => setDraft(html)}
  heading={titleValue}
  onHeadingChange={…}
  surfaceClassName="min-h-0 flex-1"
  …
/>
```

Meanwhile the Course Player had moved on to `src/course/NoteEditor.tsx` — the
BlockNote block editor with the serif title field, the `.dc-note` white page,
the internal scroll area and the caret-driven toolbar. So the same note was
written in two different editors depending on which door the learner came
through, with two different toolbars and two different formatting dialects.

## 2. What it is now

My Day's page mounts **the Course Player's own component** — not a lookalike,
the same module, lazily:

```tsx
// src/components/myday/QuickNotes.tsx
const loadNoteEditor = () => import("../../course/NoteEditor");
const NoteEditor = lazy(loadNoteEditor);
…
<NoteEditor
  key={seed.key}
  ref={editorRef}
  initialTitle={seed.title}
  initialBodyHtml={seed.body}
  autoFocus={editing || seed.title || seed.body ? "body" : "title"}
  onDraftChange={handleDraftChange}
  onEmptyChange={setEditorEmpty}
  onDirtyChange={setDirty}
  onSaveShortcut={editing ? submitEdit : submitAdd}
/>
```

Everything the player's editor brings comes with it for free — blocks, the
formatting toolbar that follows the caret, the same fonts, the same scroll
behaviour — because it *is* that editor. There is now no second implementation
on the My Day page: `QuickNotes.tsx` contains no `<textarea>`, no
`contentEditable`, no `execCommand`, no `queryCommandState`.

The surrounding decisions:

| Concern | How it is handled |
| --- | --- |
| Bundle weight | `NoteEditor` is a lazy chunk. It is warmed on idle (`requestIdleCallback(warm, { timeout: 4000 })`, `setTimeout(warm, 1500)` where that API is missing) so the first tap does not pay for it. |
| Stored notes | The dialect is unchanged: `combineHtml(title, body)` on the way in (`<h1>Title</h1><hr>body`), `splitFirstHeading(html)` on the way out. Legacy plain-text notes still open and still save. |
| Controlled vs. seeded | The editor is mounted **uncontrolled** with `key={seed.key}` and read back through `editorRef.current?.read()`. It is never driven by `value`/`onChange`, so BlockNote's own history stays intact. |
| Save gating | Empty (`isEmptyRichText`) → Save stays disabled. Longer than `MAX_NOTE_HTML_LENGTH` (60 000, `utils/courseNotes.js:37`) → `tooLong` is shown and the draft stays open, nothing is written. |
| Draft churn | `onDraftChange` is batched, and `discardingRef` suppresses the draft callback while a save/cancel is tearing the composer down. |
| Chunk failure | `EditorBoundary` + `Suspense`: if the editor chunk cannot load, the page falls back to `RichTextEditor` bound to the same draft. That is the *only* place the legacy editor is still referenced. |
| Editor space | The composer replaces the note grid (it does not squeeze under it) inside a `h-[min(72dvh,680px)]` / `sm:h-[min(75dvh,720px)]` card, and the editor scrolls inside `.dc-note .dc-note-scroll`. |
| Footer navigation | My Day has no `[data-course-peek-dock]` / `[data-course-dock]`, so `readCourseFooterInset()` returns 0 and the toolbar sits flush at the bottom — no special case needed. |

## 3. Verification

| Check | Command | Result |
| --- | --- | --- |
| Contract: the page really uses the course editor | `node --test tests/myDayQuickNotesBigEditorContract.test.mjs` | 8 / 8 pass |
| Contract: save, edit, delete, persistence | `node --test tests/myDayQuickNotesSaveContract.test.mjs` | 6 / 6 pass |
| Runtime: the real component in jsdom | `node --test tests/myDayQuickNotesEditorRuntime.test.mjs` | 7 / 7 pass |
| All three together | — | **21 / 21 pass** |
| Course Player editor + caret/footer suites (regression) | `node --test tests/coursePlayerNoteToolbarCaretRuntime.test.mjs tests/coursePlayerNoteToolbarFooterRuntime.test.mjs tests/noteEditorContract.test.mjs` | **48 / 48 pass** |
| Whole suite | `node --test tests/*.test.mjs` | 3194 tests, 3077 pass, **72 fail**, 45 skipped |
| Whole suite, before this change | stashed baseline | 85 fail |
| New failures introduced | `comm -13 baseline now` | **none** — and 13 previously-failing My Day tests now pass |
| Types | `npx tsc --noEmit` | the same 11 pre-existing errors, none in `QuickNotes.tsx` |
| Production build | `npx vite build` | `✓ built in 21.27s`, no errors |

The 72 remaining failures are the repo's pre-existing ones (unchanged set,
verified by name against the stashed baseline).

### The tests are not vacuous

Running the runtime suite against the **old** component
(`git show HEAD:src/components/myday/QuickNotes.tsx`) gives **2 pass / 5 fail**;
against the rewritten one, 7 / 7. The two that pass in both are the grid-side
cancel and delete flows, which this change deliberately leaves alone.

`tests/myDayQuickNotesEditorRuntime.test.mjs` bundles the real `QuickNotes` with
esbuild (aliasing `@ → src`, stubbing `*.css`) and drives it in jsdom:

1. the `+` opens the course player's block editor (`.dc-note.bn-container`,
   `.dc-note .dc-note-scroll`, `.bn-editor[contenteditable]`) and **not**
   `[data-course-rich-editor]`;
2. the toolbar appears from a caret alone — there is no `visualViewport` in the
   page at all — hides when the caret leaves, returns when it comes back, and
   ships the player's exact button set;
3. a new note saves through `onAdd` as `<h1>Cell biology</h1>`;
4. an existing note opens split into title + body and saves back with the body
   intact;
5. a legacy plain-text note still opens and still saves;
6. Cancel writes nothing;
7. delete stays a two-step act.

> **Trap worth keeping:** compare DOM nodes with `assert.ok(a === b, …)`, never
> `assert.equal(a, b)`. On failure Node's assert serialises both sides, and
> inspecting a jsdom node walks the whole document — it took the test runner's
> memory with it (kernel OOM-kill, `SIGKILL` at ~11 s with zero subtests
> reported) before this was found. The runtime suite now avoids it and says so
> in a comment next to its `find()` helper.
