# Course Player — Notes & Mind Map: full-page pages (round 3)

**Branch:** `arena/6bdb33d3-digitalcatalyst` · **PR:** [#747](https://github.com/wmath84-ux/Digitalcatalyst/pull/747)
**Scope:** the two "own workspace" pages inside the Course Player — **Notes** and **Mind Map**.

---

## 1. What the owner asked for (and what shipped)

| # | Ask | Shipped |
|---|-----|---------|
| 1 | Delete the start screen (New note / New mind map / My library / Course library) from both pages | ✅ both start screens removed, together with their CSS and test hooks |
| 2 | Notes opens on a **blank "New note" page**, Mind Map on an **empty canvas**; both with a **bottom toolbar** | ✅ viewer pages, bottom tray on both |
| 3 | The library opens from the toolbar's **direct button** (already in the read state) | ✅ one tap from the bottom tray (no page hop) |
| 4 | Remove the **home** button from the Mind Map toolbar and the Note read-mode toolbar | ✅ `data-note-read-home` / `data-mindmap-read-home` are gone for good |
| 5 | Blank note page: heading **"New note"** + body **"Start writing from here…"** | ✅ shown as real text in the viewer **and** as the editor's placeholders |
| 6 | **No auto-created note/map on every visit** | ✅ an untouched empty state shows the *same* state again; a new session starts a *fresh* blank state |
| 7 | **Course-Library notes open in the SAME notes area, without lag** | ✅ the note travels with the signal; the editor chunk is pre-warmed |
| 8 | The side panel becomes the **full-page main area**; **Master/Self → "Course library" / "My library"**; the top control expanded | ✅ both panels, expanded filter, renamed labels |
| 9 | The Mind Map's **page-switching button fit-zooms** the map it opens | ✅ `openMap()` frames the map (`fitView`, padding 0.2) |

Everything else in both pages behaves exactly as before (editor, autosave, delete-confirm, read/eye mode,
per-note library, cloud notes, mind-map create/rename/delete/auto-arrange, style menu, undo/redo, …).

---

## 2. The pages as they are now

### Notes (`src/course/NotesPanel.tsx`)

```
COURSE PLAYER
┌──────────────────────────────────────────┐
│                                          │  ← no start screen any more
│   New note                    (heading)  │
│   Start writing from here…    (hint)     │  ← the blank viewer page
│                                          │
├──────────────────────────────────────────┤
│ 📚 Library   ‹ Prev   Next ›   ✎ Edit    │  ← bottom toolbar (no HOME)
└──────────────────────────────────────────┘
```

* The page opens **in compose** (`useState(!restoreEdit)`): a session that was left on a *real* note
  restores that note, a fresh session opens the blank page.
* The blank page carries the two real strings (`data-note-blank-title` / `data-note-blank-body`);
  in edit mode the very same two words are the editor's placeholders — and the placeholders are now
  **per editor instance** (`editorFactory.ts` takes a `bodyPlaceholder`), so an old note can never
  inherit a new note's hint.
* Tapping **✎ Edit** opens the editor on the same blank seed; the first *word* is what creates the
  record (`isEmptyRichText` guard) — **nothing is written for an empty page**.
* **Library** opens the ONE library panel, which is now the **full-page main area**
  (`absolute inset-0 z-40 flex flex-col shadow-2xl`) with a **back** button (`data-note-library-back`)
  and the expanded **Course library / My library** filter.

### Mind Map (`src/course/MindMapPanel.tsx`)

```
COURSE PLAYER
┌──────────────────────────────────────────┐
│                                          │
│              (empty canvas)              │  ← no start screen any more
│   No map open yet. Open one from the     │
│   library, or create a new map.          │
├──────────────────────────────────────────┤
│ 📚 Library   ‹ Prev   Next ›   ✎ Edit    │  ← bottom toolbar (no HOME)
└──────────────────────────────────────────┘
```

* The page **is** the canvas: `mapOpen` says whether a map is *on* it (`mapOpen ? selfMind : emptyMind`).
* The read tray's **prev / next / edit** are disabled while no map is open; **Library** is always live.
* `openMap(mapKey)` = switch the map **and** frame it: `fitView({ duration: 320, padding: 0.2 })`.
* Escape leaves the map → back to the empty page (the map itself is untouched).
* The library panel is the **full-page main area** with a back button (`data-mindmap-panel-back`),
  the expanded **Course library / My library** filter, and the usual *new map* / list rows.

### The shared filter (`src/course/MasterSelfControl.tsx`)

New optional props `masterLabel`, `selfLabel` and `expand`. The two workspace pages pass
`"Course library"` / `"My library"` and `expand`; every other page keeps the classic
`MASTER` / `SELF` compact pill.

### Course-Library notes (`src/course/CourseResourceLibrary.tsx`, `src/CoursePlayerApp.tsx`)

* A **note file** in the course library is no longer handed to the lesson pane. It now travels as a
  **note** (`onOpenCourseNote` → `handleOpenCourseNoteFromLibrary` → `openMasterNoteSignal` with the
  note object) and opens **in the notes area**.
* **No lag**: the note object rides along with the signal (no id → list lookup, no blank frame), and
  the lazy `NoteEditor` chunk is imported as soon as the library opens, so the editor is warm before
  the learner taps a row.

### Never create on the way in

* The notes page creates a record only when the draft has words in it.
* The mind map creates a map only when the learner asks for one.
* The panel session (`coursePanelSession.ts`) is reset when the player unmounts, so the **next entry
  is a fresh blank page / empty canvas**, while an untouched empty state inside a session keeps
  showing the very same state.

---

## 3. Files touched

**Product code**

| File | Change |
|------|--------|
| `src/course/NotesPanel.tsx` | blank viewer page, no start screen, no home button, full-page library panel + back, renamed/expanded filter, master-note signal carries the note, `goHome` re-seeds the editor empty |
| `src/course/MindMapPanel.tsx` | empty canvas page, no start screen, no home button, `openMap` fit-zoom, full-page library panel + back, renamed/expanded filter, empty hint |
| `src/course/MasterSelfControl.tsx` | `masterLabel` / `selfLabel` / `expand` |
| `src/course/noteEditor/editorFactory.ts` | per-instance `bodyPlaceholder` |
| `src/course/NoteEditor.tsx` | `titlePlaceholder` / `bodyPlaceholder` props |
| `src/course/notesLibrary.css` | `.dc-note-blank*` styles, the panel is a page (no sheet radii) |
| `src/course/mindMapLibrary.css` | the panel is a page (no sheet radii) |
| `src/course/coursePanelSession.ts` | `mindMapView: "empty" \| "canvas"` |
| `src/course/CourseResourceLibrary.tsx` | course note files → the notes area + editor chunk warm-up |
| `src/CoursePlayerApp.tsx`, `src/course/CourseOverlay.tsx` | the note-carrying open signal |
| `src/course/{courseTheme,flatPlayerChrome,study-light-surfaces}.css` | dead start-screen selectors removed |

**Tests** — 18 files updated (stale start-screen / home-button / side-panel contracts rewritten to
the new design) and **1 new file**:
`tests/coursePlayerNotesMindMapPagesContract.test.mjs` (9 tests pinning every item of the spec).

---

## 4. Verification

| Check | Result |
|-------|--------|
| `node --test tests/*.test.mjs` | **4444 tests · 4250 pass · 0 fail · 194 skipped** |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | **clean** |
| `npm run build:low-heap` | **exit 0** (built in ~51 s) |

The browser-driven suites (`noteEditorBrowser.test.mjs`) stay skipped here — no Playwright browser is
installed in this sandbox — so the pages were verified through the jsdom runtime tests
(`workModeNoteEditorRuntime`, `workModeMindMapRuntime`) and the source contracts.
