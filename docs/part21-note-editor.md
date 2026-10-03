# Part 21 — The Notes editor, rebuilt as a block document (BlockNote)

Baseline: release V1.2.1 ("Text editor"). Branch `arena/01a0fb72-digitalcatalyst`.

The Course Player's Notes editor (`NotesPanel` → `RichTextEditor`, a `contentEditable`
+ `execCommand` surface) is now a **block-document editor on a white page**, built on the
original React BlockNote packages. It was rebuilt **in place**: the notes list, the cards,
the delete confirmation, the panel session, the player's exit rescue, the explicit
Save / Cancel semantics and every stored note are unchanged.

## What shipped

| Piece | File |
|---|---|
| The editor + page (title, body, controllers, dock, programmatic handle) | `src/course/NoteEditor.tsx` |
| Toolbar · docked touch bar · block controls · slash items | `src/course/NoteEditorToolbar.tsx` |
| Schema + one factory per instance (links, paste, no animations) | `src/course/noteEditor/editorFactory.ts` |
| Legacy HTML → blocks (detect · normalise · import) | `src/course/noteEditor/editorMigration.ts` |
| Blocks → stored HTML (the explicit serialisation adapter) | `src/course/noteEditor/editorSerialization.ts` |
| Slash / block commands + the document API | `src/course/noteEditor/editorCommands.ts` |
| The engine's runtime floor (three array methods an older Android WebView lacks) | `src/course/noteEditor/editorRuntime.ts` |
| Types (`NoteDraft`, `NoteEditorHandle`, …) | `src/course/noteEditor/editorTypes.ts` |
| The page and the skin (loaded with the editor chunk) | `src/course/noteEditor/noteEditor.css` |

Dependencies (all pinned, `0.55.0`): `@blocknote/core`, `@blocknote/react`,
`@blocknote/ariakit` — the smallest of BlockNote's three official UI skins (no Mantine, no
Tailwind coupling) — plus `@floating-ui/react`, declared directly because the editor imports
it (under pnpm a transitive dependency is not resolvable from `src/`). Both lockfiles were
updated additively and the pnpm one passes `--frozen-lockfile`.

## The data pipeline

```
stored note html   <h1>title</h1><hr>body        (unchanged: note.html + note.text)
  → splitFirstHeading           title (plain text) | body html       (NotesPanel, as before)
  → importLegacyHtml(body)      detect → sanitise → DOM walk → BlockNote blocks
  → BlockNote document          (one editor instance per open note)
  → serializeNoteBody(blocks)   the stored dialect, sanitised
  → combineHtml(title, body)    → onAdd / onEdit → useCourseNotes → device mirror + Firestore
```

* **Nothing is dropped silently.** BlockNote's own HTML parser flattens a table into one run
  of text and drops an `<img>`; the importer instead keeps anything the editor cannot hold
  *verbatim* in a read-only `legacyHtml` block and writes it back unchanged. Deliberate
  normalisations are reported in `NoteImportReport.downgrades` (h4–h6 → H3, font family /
  size not carried, a colour unreadable on white is dropped).
* **Stored dialect.** `<p>`, `<h1>`–`<h3>`, `<ul>/<ol>` (nested), checklist as
  `<li data-checked="true|false">`, `<blockquote>`, `<pre><code>`, `<hr>`, `<strong> <em> <u>
  <s> <code> <sup> <sub> <a>` and one `<span style="color; background-color">`. The player's
  sanitiser gained exactly one attribute for this — `data-checked` on `<li>`, `true|false` only.
* **Round trip.** import → serialise is a fixed point over a corpus (`tests/noteEditorDataPipeline`),
  and what the serialiser writes is a fixed point of the sanitiser.
* **Cap.** `normalizeNote` truncates at 60 000 characters silently; the panel therefore refuses
  to Save a longer note and says "Too long to save".

## Behaviour

* One editor instance per note (`NotesPanel` keys it by the note's identity); `load` / `reset`
  on the handle replace the instance so the undo history is always clean.
* Changes are batched (trailing 250 ms, at most every 1.5 s) into one `onDraftChange`; "empty"
  and "unsaved" notify only when they flip. No React state per keystroke, no storage write per
  keystroke. The final flush on unmount is a **layout** cleanup, so it runs before the player's
  own (passive) exit effect reads the panel session.
* Slash menu (`/paragraph /heading /list /numbered /checklist /quote /code /divider`), selection
  toolbar (block type · B I U S · code · link), block controls (insert · handle: move up / down /
  delete), undo / redo, plain-text paste kept literal, HTML paste sanitised and imported.
* Status chip: Unsaved · Saving… · Saved · Synced, from `useCourseNotes` via `syncState`.

## Keyboard and viewport

The editor reuses the player's single keyboard state (`useCourseKeyboard`) and adds no second
one. BlockNote's own mobile toolbar controller (which runs its own viewport listener) is not
used. On touch, while the soft keyboard is open and the editor is focused, the same actions are
one slim bar laid out **in flow** at the bottom of the editor — so it rides exactly as high as
the pane, which the deck already sizes to the visible area (no hard-coded heights, no double
inset, in both the resize and the overlay keyboard engines). Floating UI portals to `<body>`
(never clipped by the player's `overflow-hidden` panes) and clamps to the visible rectangle, ending above the dock.

## Runtime floor (older Android WebViews)

The app promises Chrome 96+ and the Android shell's `minSdkVersion` is 23; Chrome / WebView 106
was the last release that shipped to Android 6, so such a phone is stuck below Chrome 107.
BlockNote's engine (TipTap 3) calls two ES2023 array methods with no feature check:
`Array.prototype.findLast` (Chrome 97) in the dispatch of every transaction, and
`Array.prototype.toReversed` (Chrome 110) when a selection is serialised for copy / cut / drag.
Measured in Chromium with each removed and no stand-in: without `findLast` every keystroke throws
a `TypeError`, **the `/` menu never opens** and copy is empty (the typed text still lands, so the
failure is silent); without `toReversed` copy is empty.

`editorRuntime.ts` installs `findLast`, `findLastIndex` and `toReversed` **only when absent** (a
no-op on every current WebView), with the natives' property attributes (not enumerable) and
semantics, from `createNoteEditor` — before the first transaction can exist. It ships in the lazy
editor chunk only. A syntax check of that chunk against `chrome96` (esbuild) reports nothing, and
a name-based scan of it against MDN's compatibility data (JavaScript built-ins and the main DOM
interfaces) found no other newer API that is called unguarded — the ones that matched
(`checkVisibility`, `caretPositionFromPoint`, `getComposedRanges`) are feature-detected by the
libraries. That is a static scan, not a guarantee: the stand-ins are covered by tests, but no
Chrome 96–106 WebView was available to run the editor on.

CSS is the other half: BlockNote's stylesheet uses `:has()` (Chrome 105) in a few cosmetic rules
(checkbox row height, placeholder tint, the nested-block guide line) and `color-mix()` /
`100dvh` only for features this editor does not use (track-changes marks, the versioning
sidebar, BlockNote's own mobile scroll container). On Chrome 96–104 those cosmetic rules simply
do not apply; layout and behaviour do not depend on them.

## Fallbacks

If the editor chunk cannot load (a first visit made offline in a browser that has not cached it)
`NotesPanel` falls back to the previous `RichTextEditor` bound to the same draft, so a note can
still be written and saved. `RichTextEditor.tsx` therefore stays — it is also My Day's editor.

## Tests

`tests/noteEditorDataPipeline.test.mjs` (importer, serialiser, sanitiser, persistence, commands,
schema, in Node + jsdom), `tests/noteEditorContract.test.mjs` (dependency set, architecture,
keyboard reuse, visual brief), `tests/noteEditorBrowser.test.mjs` (a real Chromium: flows, slash,
undo/redo, paste, links, both keyboard engines, eight widths, the handle, the offline fallback —
skips without Chromium). Run the browser tests locally with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome node --test tests/noteEditorBrowser.test.mjs`.

## Known limits

* Indentation of a non-list block (an indented paragraph) is not persisted — its text is.
* Tables and images in old notes are preserved but not editable in place (delete via the handle).
* Font family / size and exact h4–h6 levels of pasted or legacy content are not carried.
* The title is plain text (as it always was).
* `emoji-mart`'s data ships as a lazy chunk (BlockNote bundles it); the emoji picker is disabled,
  so it is never requested.
