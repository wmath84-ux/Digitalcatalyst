# Course Player — Footer Navigation Visibility Rule

**Brief (owner, 2026-10-16, right after the Resource Library search work):**
check inside the course player once more — if it is fine, no matter, but if it
is not, fix it; then *"ab tum footer navigation ka function update karo aur
clear batao ki kab kab yah nahin dikhega — yah tab nahin dikhega jab editor
mode on hoga, bas; baaki hamesha dikhe."*
And, in the same breath, two new Settings options plus a small English
instruction line under them.

This report is the "clear batao" half: **exactly when the footer navigation is
not shown**, what was changed, and how it is verified.

---

## 1 · The rule, in one table

`isFooterHiddenPage(tab, state)` — `src/course/coursePanelSession.ts`.

| Dock tab | Page the learner is on | Footer navigation |
| --- | --- | --- |
| **notes** | notes home / library panel | **shown** |
| notes | note open in the **READ** view (a MASTER note included) | shown |
| notes | note open in **EDIT / compose** (write mode) | **HIDDEN** |
| **mindmap** | mind map library (sheet) | shown |
| mindmap | canvas open in **READ** mode (a read-only MASTER map) | shown |
| mindmap | canvas open in **EDIT** mode | **HIDDEN** |
| **sketch** | sketch in **READ** mode (the tab's home state) | shown |
| sketch | sketch in **EDIT** mode (page *or* Quick Sketch chip) | **HIDDEN** |
| **brain** | practice-set shelf (home) | shown |
| brain | **answer deck** open | **HIDDEN** |
| **experiment** | experiment library | shown |
| experiment | **live experiment viewer** open | **HIDDEN** |
| **read** | PDF / annotations shelf | shown |
| read | **PDF / annotations reader** open (Drive viewer too) | **HIDDEN** |
| **music** | music **library** page (search bar + white tray + lists) | shown |
| music | **real player** open — full-area audio player **or** YouTube player | **HIDDEN** |
| music | **search page** — the ready-to-write box with the recent searches under it, and the flash scan | **HIDDEN** |
| music | **search results** on screen | shown — see §3 (scroll) |
| **modules** (Resource Library) | library page (title row + module tree) | shown |
| modules | **search page** (the nested page: back arrow · box · format button) | **HIDDEN** |
| modules | **search results** on screen | shown — see §3 (scroll) |
| **paid / player / ai** | every page | shown |

Two overrides the rule does **not** own, and one that does:

* **Soft keyboard** — both footer homes still hide while a text field inside the
  player is being typed into (`useCourseKeyboard`). That is a physical overlap,
  not a page: the dock would otherwise sit in the strip between the keyboard and
  the writing surface. Unchanged.
* **Settings → "Visible footer navigation always"** — §4. It wins over every
  row of the table above.

Probe run over the live resolver (esbuild-bundled module, no DOM) prints the
whole matrix; it is the table above, machine-checked.

---

## 2 · What changed (and what deliberately did not)

**The three editors — edit mode only.** The rule used to hide the footer for
*being inside* a page (`case "sketch": return true`, notes "editor open",
mind map "canvas open"). Now the editors publish **edit mode**:

| Panel | Published fact | Source |
| --- | --- | --- |
| Notes | `notesEditMode = editorOpen && !(editingId && selfReadOnly)` — the same `selfReadOnly` flag the eye button toggles | `NotesPanel.tsx` |
| Mind map | `!libraryOpen && !readOnlyCanvas` (a read-only MASTER map is never edit) | `MindMapPanel.tsx` |
| Sketch | `editing` — one flag for the full editor **and** the Quick Sketch chip | `SketchPanel.tsx` |

**The pages the owner named** keep their own rule, untouched: brain answer deck,
live experiment viewer, Read PDF/annotations reader, and the music **player**
(the library page keeps the footer — that part of the 2026-10-15 brief stands).

**New:** the two search surfaces are part of the rule now (they publish
`"closed" | "page" | "results"`, plus a separate "scrolled away" flag):

* `CourseResourceLibrary.tsx` (Modules tab) — publishes its nested search page
  and the results state, and reads its own scroll host (`.library-body`).
* `MusicPanel.tsx` — the same surface states on the library page (no nested page
  there: the owner asked for the same behaviour on the same page structure), and
  reads `[data-music-body]` in whichever of its three homes is up.

**Nothing else moved:** the read reader, brain, experiment, keyboard rule, both
footer homes' own keyboard/styling behaviour, and every library/shelf page.

---

## 3 · The search results half: scroll down hides, the top brings it back

`useScrollAwayHidden(enabled)` + `nextScrollAwayHidden(...)` in
`src/course/searchExperience.tsx` — one shared rule for both search surfaces:

```ts
if (top <= 28)        return false;   // at the top: always there
if (top > previous)   return true;    // travelling down: step away
if (top < previous)   return false;   // travelling up: come back
return current;                       // no movement: keep the answer
```

* One read per animation frame (`requestAnimationFrame`, with a 16 ms timer
  fallback where the host has no frames), read once at attach from the page's
  own position, and the listener leaves the moment the results do.
* Publishing a surface away from `"results"` clears the flag in the session, so
  a hidden footer can never be stranded by closing the page it belonged to.

**A real bug this uncovered, worth knowing about:** the first cut ran
`setHidden((current) => nextScrollAwayHidden(current, top, previous))` with
`previous` reassigned right after the call. React may run that updater *during a
later render* — by which time `previous === top`, so a genuine scroll was
compared with itself and answered "unchanged". It looked correct whenever React
evaluated the updater eagerly (an empty update queue) and failed otherwise.
The decision now captures both numbers **before** the update. Nothing mutable is
ever read inside a state updater.

---

## 4 · Settings: the two options and the English line

`SettingsPage.tsx` → **Footer navigation** section, one new radio group under
the four styles, in the same card design:

* **Visible footer navigation always** — every page keeps the footer.
* **Visible footer navigation accordingly** — follows the rule (§1); the default.

Under them, the small English instruction line (exported as
`FOOTER_NAVIGATION_VISIBILITY_NOTE`, `src/utils/footerNavigationVisibility.ts`,
so the sentence and the implementation can never drift apart):

> With “accordingly”, the footer navigation is not shown: while a note, mind map
> or sketch is open in edit mode (reading any of them keeps it); on a Brain
> answer deck; inside a live experiment; inside a PDF or annotations reader; on
> the Music player or its YouTube player; and on the Resource Library or Music
> search page. On a search results page it is shown, and slides away while you
> scroll down and returns at the top. It also steps aside for the on-screen
> keyboard. Everything else keeps it visible.

Store: device-local (`dc-footer-navigation-visibility`, event
`dc:footer-navigation-visibility-change`, default `accordingly`), read by both
footer homes through `useFooterNavigationAlways()` — the *only* override, so
"always" wins over every page rule by construction. Storage that refuses writes
still announces the change in memory (private mode safe).

---

## 5 · Files

| File | Change |
| --- | --- |
| `src/course/coursePanelSession.ts` | the rule (`notesEditMode` / `mindMapEditMode` / `sketchEditMode` / two `SearchSurfaceView` states + the scroll flags), the setters, the projection |
| `src/course/searchExperience.tsx` | `nextScrollAwayHidden` (pure) + `useScrollAwayHidden` (per-frame, listener-safe) |
| `src/course/NotesPanel.tsx` | publishes write mode (read view keeps the footer) |
| `src/course/MindMapPanel.tsx` | publishes canvas **edit** mode (read canvas keeps the footer) |
| `src/course/SketchPanel.tsx` | publishes edit mode (read mode keeps the footer — the tab's home) |
| `src/course/CourseResourceLibrary.tsx` | publishes search page / results + the scroll flag |
| `src/course/MusicPanel.tsx` | the same three states, on the same page structure |
| `src/course/CourseOverlay.tsx`, `CoursePeekDock.tsx` | `immersivePage = pageRuleHidesFooter && !useFooterNavigationAlways()` |
| `src/utils/footerNavigationVisibility.ts` | new store, default, the exported instruction line |
| `src/settings/SettingsPage.tsx`, `src/settings/settings.css` | the two options, the radiogroup, the instruction line, light-theme variants |

---

## 6 · Verification

| Check | Result |
| --- | --- |
| `./node_modules/.bin/tsc --noEmit` | **EXIT 0** |
| `node --test --test-concurrency=4 tests/*.test.mjs` | **EXIT 0 — 4277 tests, 4083 pass, 0 fail, 194 skipped** (unrunnable browser suites skip; the log is `/tmp/sweep7.log`) |
| `npm run build:low-heap` | **EXIT 0 — 47.70 s** (`/tmp/build5.log`) |

New/repinned tests:

* **`tests/footerNavigationVisibilityContract.test.mjs`** *(new, 10 tests)* — the
  whole rule, the publishers, the two Settings options, the instruction line's
  every phrase, both footer homes' override, and the store (default, override,
  storage denial).
* **`tests/coursePlayerImmersivePagesContract.test.mjs`** — repinned: the three
  editors hide on **edit mode**, the named pages, both search surfaces, the
  Settings override at both footer homes.
* **`tests/courseResourceLibrarySearchRuntime.test.mjs`** — the real library, with
  the real session: search page → `page`; flash scan → still `page`; results →
  `results`; scroll down → away; back to the top → shown; back arrow → `closed`
  and never stranded.
* **`tests/coursePlayerMusicPaneRuntime.test.mjs`** — the same flow on the music
  page (its own session value, the player rule untouched).
* **`tests/courseStripNavigationRuntime.test.mjs`** — the real Workspace pill:
  the page rule removes it, **"Visible footer navigation always" brings it back
  with all ten tools**, unticking hides it again.
* **`tests/coursePlayerMusicTabContract.test.mjs`** — repinned to the new
  resolver lines (the music case now carries the search page and the scroll half).

---

## 7 · For the next reader

* One rule, one place: `isFooterHiddenPage` — add a page by publishing a fact
  into the session and naming it in the switch; never branch inside a panel.
* The footer homes know nothing about pages: they read the rule and the Settings
  override and nothing else.
* The Settings sentence is exported, not typed into the page, so a rule change
  that forgets the sentence fails `footerNavigationVisibilityContract`.
* Read modes are the interesting half of this brief: notes read view, mind-map
  read canvas, sketch read mode and both library pages are where the footer now
  *lives*, and each of them is pinned by a test.
