# The Notes page, rebuilt — a headless home, ONE side-panel library, read-first notes, and saving that happens by itself

Owner brief (2026-10-15), in full:

> Ab se note directly clean headless page se open hoga aur page par usko clear
> center mein buttons dikhne chahiye — "New note, My Library, Course Library".
> Aur side panel open karne ka koi bhi button header hoga hi nahin kahin bhi,
> pure notes me — read mode me bhi nahin. Aur yeh side panel directly read mode
> ke bottom tray toolbar se khulega: usmein sabse right side ek button hai note
> library par jaane ke liye — abhi yahi directly side panel open karega. Aur is
> side panel ka area almost full page hi hoga, bus right side se thoda sa page
> kam hoga, taaki side panel ki tarah dikhe. Aur is side panel mein wahi note
> library open hogi, aur side panel mein clear top center mein wahi filter
> option honge — MASTER aur SELF ka. Aur yahan ek cheez abhi problem hai: library
> dikhti hai lekin theek se dikh nahin rahi — text vertically spread ho gaye
> hain, aisa lag raha hai shrink ho gaye hain note ke naam. Aur iska reason
> mujhe lagta hai side panel mein jo pencil aur delete ka icon dikh raha hai —
> in dono icons ko hatao; ye dono option alag se pop-up dropdown ki tarah tabhi
> dikhen jab kisi bhi note par long press kiya jaaye; aur Rename button par click
> karne par wahi note ka name area naya editor box ban jaaye. Aur is side panel
> ke library ke bottom mein keval ek hi button "New note" ka hona chahiye, "Back
> to library" ka button remove kar do — kyunki library ab yahi direct side panel
> se hi open hogi. Aur right side koi bhi top mein button nahin dikhega; jo abhi
> doosra side panel open karne ka button hai, usko remove kar do. Aur "New note"
> par click karne par simple naya page open ho jaaye. Aur koi bhi note jo side
> panel library se open kiya jaayega woh hamesha pehle read mode mein hi open ho
> — editor double tap karne par khulega, ya read mode ke bottom tray me jo
> pencil ka icon already hai, uspar click karne se. Aur read mode ke bottom tray
> me jo sabse left button hai (note library page par wapas jaane ke liye) — wahi
> ab side panel open kare; aur jo 3-dot button hai usi tray me, usko remove kar
> do (woh right side panel kholta tha). Aur edit mode ke bottom toolbar ka design
> exactly wahi rakho, lekin uske andar ek sliding tray add karo jisse sabhi
> buttons bina shrink hue theek dikhein aur left-right swipe karke sabhi button
> access kiye ja sakein. Aur usi toolbar me jo 3-line wala ek button hai, jo abhi
> koi function nahin kar raha — uska reason check karo aur fix karo. Aur edit
> mode se wapas read mode mein jaane ke liye us bottom editing toolbar me sabse
> aage ek clear "Read" button add karo — bold, black background, white text —
> jisse wapas read mode mein jaaya ja sake aur bottom toolbar wapas wahi saare
> read buttons dikhaye, jisse user aasani se side panel toolbar se open kar paye.

Everything above is built. Two decisions the owner chose while it was being
built are folded in: the removed 3-dot slot now carries a **Home** button (the
way back to the notes home), and **saving is automatic** — no Save, no Cancel,
no options panel.

---

## 1. Three places, and nothing else

`src/course/NotesPanel.tsx` renders exactly three surfaces. There is **no
header on any of them**, and no button anywhere in a header.

| # | Place | What it is | Hooks |
| --- | --- | --- | --- |
| 1 | **HOME** — `data-course-notes-mode="home"` | a clean, headerless page: three centred buttons and nothing else | `data-course-notes-home`, `data-notes-home-actions`, `data-notes-home-new`, `data-notes-home-library`, `data-notes-home-course` |
| 2 | **THE LIBRARY PANEL** — `data-note-library-panel` | the ONE side panel: almost the full page (a thin strip of page stays visible on the right, so it reads as a panel), MASTER / SELF at its **top centre**, exactly ONE button at its bottom | `data-note-left-panel`, `data-note-panel-scrim`, `data-note-library-head`, `data-course-notes-list`, `data-note-library-foot`, `data-note-panel-new` |
| 3 | **THE WRITING PAGE** — `data-course-notes-mode="compose\|edit"` | the note itself, in `data-note-view-mode="read"` or `"edit"` — the SAME document | `data-course-notes-composer`, `data-note-status-chip`, `data-note-autosave`, `data-note-scroll`, `data-note-editor` |

There is no fourth surface. The old right-hand options drawer, the corner-button
row, the page header, the Save / Cancel pair and the separate "library page" are
all gone; every hook they owned is gone with them.

**How each place is reached**

* the tab opens on **HOME**;
* `New note` → the composer (a simple new blank page);
* `My Library` → the panel, SELF active; `Course Library` → the panel, MASTER
  active (a tap on the collection is remembered per user, as before);
* inside a note, read mode's tray opens the panel — that is the only other way
  in, and the panel's visible strip (or Escape) closes it.

## 2. The library rows: what was actually wrong

The owner's report — *"text vertically spread ho gaye hain, aisa lag raha hai
shrink ho gaye hain note ke naam"* — was the row itself: each name shared its
line with a pencil and a trash button, so on a narrow pane the label squeezed,
wrapped onto two or three lines and stretched the row while the buttons kept
their size. Two changes fix it for good, in that order:

1. **The row buttons are gone.** `BranchedMenu` grew `leafActionMenu`
   (`"inline"` — the default everywhere else — and `"long-press"`). The notes
   library asks for `"long-press"`, so a row renders its name, its SELF/MASTER
   tag and its word count and nothing else, and its name is one clean line:
   `notesLibrary.css` truncates it with an ellipsis (`white-space: nowrap`)
   instead of letting it wrap.
2. **Rename and Delete moved into a popup.** A long press (450 ms, movement-
   aware), a secondary click, the keyboard menu key or `Shift+F10` opens
   `[data-branched-menu-popup]` with **Rename** (`data-branched-menu-rename`)
   and **Delete** (`data-branched-menu-delete`) over the row it belongs to
   (flipping upwards near the bottom of the list). **Rename turns that same
   row's name area into an input** (`data-branched-rename-input`) — Enter /
   Save commits through the panel's `renameNote`, Escape / ✕ cancels. Delete
   still opens the same two-step confirmation dialog as everywhere else.

## 3. Read mode's tray, and edit mode's tray

**Read mode** — `data-note-read-nav`, bottom centre:

`library (→ the side panel)` · `prev` · `next` | `new` · `edit` | `home`

* `data-note-read-library` → **opens the library panel** (it used to navigate to
  a library page);
* `data-note-read-prev` / `-next` walk the SELF collection, `-new` opens a fresh
  composer, `-edit` (the pencil) unlocks the editor, `-home` returns to HOME;
* the **3-dot button is gone** (`MoreHorizontal` is no longer imported) — the
  panel is the only panel there is, and the left button is its way in.

A note opened from the panel **always lands in read mode**: one tap selects and
never edits (`useDoubleTapToEdit` + `data-note-view-mode="read"`), and a double
tap on the page, `Enter`/`F2`, or the tray's pencil unlocks the SAME document
(`data-note-view-mode="edit"`).

**Edit mode** — the docked tray (`data-note-dock`), unchanged in design:

* the black **Read capsule leads the bar and is pinned**: it sits OUTSIDE the
  scroller (`[data-note-edit-read]`, `#0b1220` on white, 800 weight) so it can
  never scroll out of reach; the panel also renders a floating capsule
  (`data-note-edit-read-float`) whenever the caret has left the note and the
  dock has followed it away;
* the tools are a **sliding tray** (`[data-note-dock-tools]`): every button
  keeps its full 36 px size (`flex: 0 0 auto`), the row scrolls sideways with
  scroll snapping instead of shrinking anything, and the scrollbar is hidden.

## 4. The button that "did nothing", and the other one that only looked broken

* **The 3-line button was Indent.** `Indent` (lucide) is the three-line glyph
  beside Outdent. Both were hard-disabled whenever BlockNote could not nest the
  block — which is *always* true on the first line of a note, under a divider,
  or anywhere with nothing above to nest under (`canNestBlock() === false`,
  `aria-disabled` + `pointer-events: none`). A tap therefore did literally
  nothing. They now always act: **Indent** nests when it can and otherwise turns
  the line into a bulleted list item (the standard "Tab makes a list" gesture —
  the next tap nests it), and **Outdent** lifts the block out, turning a
  top-level list item back into a paragraph. Measured in a jsdom probe of the
  real editor with an empty composer: `Bulleted list` on a blank first line
  changes the document (`paragraph` → `bulletListItem`), and inside a list
  `Outdent` changes it back.
* **The block-type control was the second, presentation-only bug**: under
  400 px `font-size: 0` hid its label, so the trigger was an unexplained
  little icon (the list icon is another three-line glyph). It now always
  spells out the type the caret is in — *Paragraph*, *Bulleted list*,
  *Check List* — beside its icon, which costs no reach inside a scrolling tray.

## 5. Saving is automatic

There is **no Save button, no Cancel and no options panel anywhere in notes** —
`data-note-status-chip` (the page's only top element, and it holds no button)
carries the quiet status: *Unsaved · Saving… · Synced · Too long to save*.

* the editor's batched draft commits on a trailing pause (`AUTOSAVE_IDLE_MS =
  1200`, `AUTOSAVE_MAX_WAIT_MS = 5000`) and immediately whenever the learner
  leaves the writing page — the Read capsule, Home, opening the library, a
  hidden page, or unmounting;
* a brand-new note takes its id from `onAdd` the first time it has content, and
  every later write updates **that same note** through `onEdit` — no duplicates,
  nothing lost;
* an over-long note is refused whole (`MAX_NOTE_HTML_LENGTH`), never truncated
  and never stored in part; the chip says so;
* deleting stays a two-step act (popup → confirmation dialog → only the red
  button deletes).

## 6. Files

| File | What changed |
| --- | --- |
| `src/course/NotesPanel.tsx` | the rewrite: HOME, the ONE library panel, the read/edit writing page, the autosave machine, `openNote` (always read-first), `enterReadMode` (commit + read), `goHome` (commit + home), `renameNote` |
| `src/course/notesLibrary.css` | **new** — the panel's radius/rows, the single-line label rule, the row popup, the strip cursor, the home plate, the status chip |
| `src/components/branched-menu/BranchedMenu.tsx` | `leafActionMenu="long-press"`: the long-press gesture, the popup, rename-in-place reachable from it; the default stays `"inline"` |
| `src/components/branched-menu/BranchedMenu.css` | the popup's own paint, in the shared `--bm-*` tokens |
| `src/course/NoteEditorToolbar.tsx` | the pinned black **Read** capsule, the sliding tool tray, Indent/Outdent always acting, the always-labelled block-type control |
| `src/course/noteEditor/noteEditor.css` | `.dc-note-dock-bar` flex bar, `.dc-note-dock-read`, the tray's scroll-snap rules, the block-type label |
| `src/course/NoteEditor.tsx` | reports `onDockChange` (is the tray up?) and forwards `onReadRequest`; the toolbar gets the Read button |
| `src/course/study-light-surfaces.css` | the dead header/collections rules removed; the home page, the panel and its head re-pointed to the light plate |

Deliberately **not** changed: the persistence curve (`useCourseNotes`), the
MASTER / SELF preference layer, the branched tree and its empty / loading /
sync-error states, the BlockNote document and its slash commands, the keyboard
rules, the footer/immersive rules, and `SplitDivider`'s home in `studyPanels`.

## 7. Tests

| File | Tests | What it proves |
| --- | --- | --- |
| `tests/noteEditorReferenceChromeContract.test.mjs` | 9 | no header / no corner buttons, the home page's three buttons, the panel's width, head, single foot button and long-press rows, the read tray, the edit tray's Read-first geometry + sliding tray, the always-acting Indent/Outdent, the MASTER viewer |
| `tests/workModeNoteEditorContract.test.mjs` | 4 | Work mounts the SAME panel; no storage-only fork in the chrome; rename through the long-press menu into Work's device-only `onEdit`; header/footer boundary |
| `tests/workModeNoteEditorRuntime.test.mjs` | 1 | the whole flow, in jsdom, inside the real `WorkPageSurface`: home → My Library panel (head centred, one foot button, no row buttons) → a row opens read-first → read tray (library · prev · next \| new · edit \| home) → pencil → the docked tray with the pinned Read capsule and its tools → Bold → **the autosave stores it with no Save** → long press → Rename in place → Delete asks (Cancel keeps the note) → the strip closes the panel → Home → an empty composer leaves nothing behind |
| `tests/noteEditorContract.test.mjs` | 27 | the editor's own promises (handle, batching, caret rules, the white page) |
| `tests/noteEditorDataPipeline.test.mjs` | 34 | the data pipeline, untouched |
| `tests/noteEditorBrowser.test.mjs` | 35 | real-browser suite, **re-pointed to the new chrome** (home → panel → read-first → the Read capsule commits, the long-press menus, the tray's full-size buttons, the panel's near-full width at 320–1024 px). It could NOT be executed in this sandbox — there is no Chromium here — so its flows were proved instead by the jsdom runtime suites below and by `workModeNoteEditorRuntime` |
| `tests/coursePageHeaderContract.test.mjs` | 6 | notes has NO header; its MASTER / SELF tablist heads the library panel instead |
| `tests/branchedMenuLibraryContract.test.mjs` | 16 | the shared menu keeps its `"inline"` default; the long-press mode is opt-in |
| `tests/studyLightSurfacePolish.test.mjs` | 4 | the light plate follows the home page and the panel |
| `tests/adminProductPublishingResourcesContract.test.mjs` | 10 | Master notes stay read-only and the SELF writes still go through `onAdd` / `onEdit` / `onDelete` |

Results on this branch:

| Run | Result |
| --- | --- |
| `tests/course*.test.mjs tests/workMode*.test.mjs tests/lumen*.test.mjs` | **1009 tests, 989 pass, 0 fail, 20 skipped** |
| the notes suites + admin/work suites above | **0 fail** |
| `tests/noteEditorBrowser.test.mjs` | 35 skipped — no Chromium in this sandbox (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` or `npx playwright install chromium` runs them) |
| `./node_modules/.bin/tsc --noEmit` | clean |
| `npm run build:low-heap` | OK — the plain `npm run build` OOMs on this 3 GB sandbox, which is why the low-heap script exists |

## 8. Notes for the next hand

* **The panel is one element, mounted in two places** (`{libraryOpen ? libraryPanel : null}`,
  once in the writing page and once on the home page) — so a change to the
  library lands in both, and any test that reads it must assert against the
  whole panel, never against a slice of one branch.
* **Read-first is a state, not a route**: `openNote` sets `selfReadOnly` before
  the editor is seeded, and `enterReadMode` / `goHome` are the only two places
  that leave edit mode — both commit first. A new exit must commit too, or the
  words in the editor are lost.
* **The dock follows the caret**; the floating Read capsule exists exactly
  because of that (`!readView && !dockUp`). Do not remove it, or a note whose
  caret has left the pane has no way back to the read view.
* `renameNote` must be defined above the tree builders — the leaf items close
  over it.
* Work Mode is device-only and has no MASTER collection, so its panel head
  names the collection ("My notes") instead of offering a tab that could not go
  anywhere; the shared MASTER / SELF control heads the same panel wherever both
  collections exist.
* In this sandbox `npm run build` needs `build:low-heap`, and a bash command
  carrying backslashes can arrive escaped — keep regex-heavy test text in files,
  not in shell heredocs.
