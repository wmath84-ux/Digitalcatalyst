# Course Player — the Resource Library page, and ONE search experience for both libraries

The owner's brief (2026-10-16), in one sentence: **the Resource Library becomes a
pure-white page whose header area holds one circular search box**, and a click on
that box opens a **nested search page inside the library** — ready-to-write box,
back arrow on its left, a format button on its right that shows *no options*,
Enter inside the box, a **flash-scan loading state with a one-second floor**, and
**previous searches in exactly YouTube's search-page design**. The **Music
library gets the exact same everything**, on its own page structure.

The one rule that kept this from becoming two implementations: **both libraries
wear the same three shared files**, so they cannot drift.

---

## 1. What the owner asked for, and where it landed

| # | Brief | Where |
|---|-------|-------|
| 1 | Page **and header** pure white | `coursePageHeader.css` (`[data-course-resource-library]`, its `.library-header`, `.library-body` → `#ffffff !important`) + `courseResourceLibrary.css` (root + body). The paid/modules ~95 % plate list still excludes it — on purpose, now with a comment saying why |
| 2 | Title + icon + resource count **move onto the page**, just under the header | `[data-library-title-row]` in `CourseResourceLibrary.tsx` (h2 carries `data-course-page-title`, the count keeps `library-header__count`) — the header strip keeps its defined 48 px and renders no title at all |
| 3 | The page keeps **scrolling** as it does | `.library-body` untouched (`flex: 1 1 auto; overflow-y: auto`) |
| 4 | The header area gets a **circular search box** with the long sentence, **large, faded black, sliding left-right continuously** | `[data-library-search-open-button]` · `.library-searchbox` + `SlidingSearchText` (`.dc-slide` in `searchExperience.css`: `animation-direction: alternate`, `iteration-count: infinite`, duration ≥ 8 s at ~22 px/s — it never shrinks and never clips) |
| 5 | A click opens a **nested page inside the Resource Library** | `[data-library-search-page-body]` inside the library body: the course listing steps aside, the search page takes over |
| 6 | Its header = **ready-to-write box**, **arrow on its left**, **format button on its right** | one `CoursePageHeader` strip: `[data-library-search-back]` → `[data-library-search-form]` → `[data-library-search-format-toggle]`, in that DOM order; the input takes the caret when the page opens |
| 7 | The format button shows **no options** — it is **self-convertible**, and the two formats are the music library's own two | ONE button whose glyph is the format the next tap gives you; `[data-library-search-format-next]` announces it; the listing re-renders as rows (`LibraryHitRow` / YouTube row) or thumbnail cards (`LibraryHitCard` / `TrackArtwork variant="card"`) |
| 8 | Typing long text **auto-slides inside the box**; **Enter button inside the box, on the right**; keyboard Enter does the same | the input is a normal text input inside a `min-width: 0` flex pill (the browser keeps the caret in view); `[data-library-search-enter]` sits inside the box and is `type="submit"` — the keyboard's Enter fires the same form submit |
| 9 | On Enter a **flash scan**, **minimum ~1 s however fast the internet**, and it keeps scanning while the network is slow | `SearchFlashScan` (`[data-dc-flash-scan]` + sweeping beam + shimmer rows) + `useStudySearch`'s floor: the harness proves results never land before the second, and the scan survives a slow answer |
| 10 | The search page shows **previous searches in exactly YouTube's search-page design** | `SearchHistoryList` (`.dc-history*`): a "Recent searches" head with **Clear all**, one row per search with a history glyph, an ✕ per row, tap-to-run — device-local, per-namespace, capped at 12 |
| 11 | Search reaches the **whole library AND direct YouTube lectures/songs** | ONE query, two answers: `matchResources` (the whole library's rows) + `searchYouTube` (the same key-gated, never-scraping call the Music pane owns). No key → the same honest hand-off link |
| 12 | Music gets **the exact same everything**, same page structure, and its format button becomes **directly convertible** | `MusicPanel`: the Enter button moved **inside** the pill, the sentence slides inside the box while it is empty, `SearchFlashScan` replaces the old spinner, `SearchHistoryList` appears while the box is focused and empty, and the two-option `[data-music-view-option]` pair became ONE `[data-music-search-format-toggle]` |

**No new nested page for music** (owner's pick) — the same behaviour lands on the
page it already has. **One search box for both halves** (owner's pick) — not two
tabs, not two fields.

---

## 2. The shared kit (the reason the two cannot drift)

| File | What it is |
|------|------------|
| `src/course/searchExperience.tsx` + `.css` | `STUDY_SEARCH_SENTENCE`, `SEARCH_MIN_LOADING_MS = 1000`, `SlidingSearchText`, `SearchFlashScan`, `SearchHistoryList`, `usePointerFirstAction` (finger-first, so a tap still lands when the box blurs under it), `useStudySearch` (the 1 s floor, the newest-run-wins guard, the history) |
| `src/course/searchHistory.ts` | the device-local, per-namespace recent searches (`dc.searchHistory.v1.<namespace>`) — pure, bounded, never throws |
| `src/course/resourceSearch.ts` | the library matcher — pure (`termWeight`, `scoreResource`, `matchResources`): every term must land, a title hit outranks kind/subtitle which outranks the module path, ties break by title |

The Music pane uses the **same** three files (`namespace: "course-music"`), the
library uses them with `namespace: "course-library"`, so each keeps its own
history list while the look and the timing are literally the same code.

---

## 3. The Resource Library, top to bottom (after the brief)

```
┌──────────────────────────────────────────────┐
│  ⌕  Search your favourite lecture on YouTube…│  the header STRIP = the circular box
│        (the whole sentence slides left-right) │  (the title left the strip)
├──────────────────────────────────────────────┤
│  📖  Resource Library              6 resources│  the page's own title row (scrolls)
│  ▾ Foundations                               │
│     • Intro to Algebra                       │  the listing, exactly as before
└──────────────────────────────────────────────┘

a click on the box →
┌──────────────────────────────────────────────┐
│ (←) │ ⌕ write here …                    ↵ │ ▦ │  arrow · box (Enter inside) · format
├──────────────────────────────────────────────┤
│  Recent searches                     Clear all│  YouTube's own search page
│  🕘 algebra                                  ✕│
│  …while the box is empty                      │
└──────────────────────────────────────────────┘

after Enter →
the flash scan (a full second, longer if the network is)
→  IN THIS LIBRARY  3      ON YOUTUBE  2
   • the matching lessons / notes / mind maps / brain cards / PDFs
   • the YouTube lectures and songs, artwork edge to edge → opened on YouTube itself
```

---

## 4. Tests

New:

* `tests/studySearchKit.test.mjs` — the two pure halves: the history (order,
  dedupe, the 12 cap, forget, Clear all, two namespaces, corrupt/hostile
  storage) and the matcher (the weight table, "every term must land", the
  ranking rule, the cap, case/punctuation/Devanagari).
* `tests/courseResourceLibrarySearchRuntime.test.mjs` — the real page in jsdom:
  the title row on the page and the box in the header, the nested page's
  arrow/box/format order, the Enter button **inside** the box, the flash scan
  surviving an instant answer and the floor elapsing, both halves listing, the
  format button converting the whole listing both ways, a hit opening the
  resource, the YouTube-shaped history (pick re-runs, Clear empties), the no-key
  hand-off, and the nothing-found page.
* `tests/coursePlayerMusicPaneRuntime.test.mjs` — three new tests: the history
  round-trip, the self-convertible format button, and the idle box sliding the
  sentence before the filter's own placeholder returns.

Repinned (the owner's direction changed, so the old pins had to):

* `coursePaidLibraryDesignContract` + `branchedMenuLibraryContract` +
  `experimentStudyPaneRouting` — the library's search is **not** "removed"; it is
  the shared kit's. They now forbid the *hand-rolled* state (`searchQuery`,
  `LibrarySearchBar`) and require the shared imports instead.
* `coursePageHeaderContract` — the library keeps the shared header box but names
  itself on the page; its page/header/body are asserted **pure white**.
* `coursePlayerMusicTabContract` — the `[data-music-view-option]` pair is gone;
  the ONE self-convertible toggle, the in-box Enter, the sliding sentence, the
  flash scan and the history list are pinned instead.

Green: `tsc --noEmit` clean, the full sweep **4069 pass / 1 flaky perf test**
(`coursePlayerMindMapDragPerf`, 8/8 in isolation — timing-only, untouched by this
change), `npm run build:low-heap` ✅ 50.82 s.

---

## 5. Notes for the next reader

* `.library-search*` / `.library-hit*` classes live in `courseResourceLibrary.css`
  (layout); the shared **look** (the sentence, the beam, the history) lives in
  `searchExperience.css` — keep new shared pieces there, not in a page sheet.
* The `~95 % pure white` plate in `coursePageHeader.css` must keep **excluding**
  `[data-course-resource-library]`: the library is the one page that is *more*
  white than the plate, and the specific rule above it enforces that.
* The loading floor is a promise, not a spinner: `useStudySearch` starts the
  clock when a search begins, so a slow network extends the scan instead of
  cutting it short.
* Nothing here scrapes: the online half is `searchYouTube` (the official Data
  API, key-gated) or the same YouTube search URL the Music pane already handed
  over before this change.
