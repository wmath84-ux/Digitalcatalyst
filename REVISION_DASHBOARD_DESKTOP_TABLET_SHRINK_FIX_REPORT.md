# Revision Dashboard — desktop / tablet "shrink ho gaya" fix

Owner report (2026-10-04): **"Revision dashboard page get shinked on desktop and
tablet."** Reproduced on the real page (Playwright + the real bundle, five
viewports) and fixed; the phone is byte-for-byte unchanged.

## What was on screen

Measured before the fix (panel widths, px):

| Viewport | Deck panel | Quick stats | Weak Topics + Revision Bank | Deck card clipped |
| --- | --- | --- | --- | --- |
| 1440 × 900 desktop | **77** | **48** | **72** | **65 px each side** |
| 1194 × 834 tablet landscape | 840 | 343 | **59** | – |
| 1024 × 768 laptop / smaller tablet | 713 | 290 | **49** | – |
| 834 × 1112 tablet portrait | **381 (half of 776)** | 381 | 381 | – |
| 390 × 844 phone | 358 | 358 | 358 | – |

So: on a 1440 px desktop the whole dashboard lived in a **77 px** column while
1440 − 260 (rail) − 48 (gutters) − 12 columns of gap left ~1000 px of empty
wallpaper; "Weak Topics" and "Revision Bank" broke to one letter per line
(49–72 px columns, 1600–1800 px tall). On tablet portrait the deck was squeezed
into half the tablet next to a second narrow column.

## Root cause — one dead selector pair in `src/index.css`

The dashboard's panels used to carry the utility classes `lg:col-span-7` /
`lg:col-span-5`, and three bands split the 12-column grid through exactly those
classes:

```css
.dc-desktop-shell [data-rev-layout="dashboard"] > .lg\:col-span-7 { grid-column: span 7 }   /* ≥960 shell  */
.dc-desktop-shell [data-rev-layout="dashboard"] > .lg\:col-span-5 { grid-column: span 5 }
[data-rev-layout="dashboard"] > .lg\:col-span-7 { grid-column: span 7 }                     /* 640–1023 landscape */
[data-rev-layout="dashboard"] > .lg\:col-span-7, … > .lg\:col-span-5 { … }                  /* 640–959 portrait   */
```

The Slide Deck pass (same day, PR #674) replaced that markup with
`data-rev-panel="primary"` and a follow-up wrapper that carries **no**
`lg:col-span-*` class at all. No child matched those rules any more, so the
12-column grid **auto-placed both children into column 1** — a single 1/12
track, 77 px wide at 1440 px, 59 px at 1194 px. Every card inside was then
sized from that sliver, which is why the page read as "shrunk" and why the
deck's own card overflowed its 77 px stage by 65 px on both sides. The phone
was the only band that survived, because it never had a column split to lose.

## The fix

**`src/revision/pages/DashboardPage.tsx`** — one hook added, no visual change to
the phone:

* the follow-up wrapper (quick stats + Weak Topics + Revision Bank) is now
  `data-rev-followups`, so the bands can target it by name instead of through a
  utility class the component no longer renders.

**`src/index.css`** — every band that used to split through the dead classes now
keys off the data hooks:

* **≥ 960 px desktop shell** — `[data-rev-panel="primary"]` **spans all 12
  columns** (the deck solves its own height from the scroller; see the slide-deck
  report), and the follow-up wrapper becomes its own 12-column grid with the old
  **5 / 7** rhythm: quick stats `span 5`, Weak Topics + Revision Bank `span 7`.
  The wrapper's `space-y` margins are zeroed inside the grid so the gap owns the
  rhythm.
* **640–1023 px landscape tablets** — the same deck-first layout and 5 / 7
  follow-up split, keyed off the hooks (the `lg:` variants never engage in this
  band, which is why it kept the broken 49–59 px columns).
* **640–959 px portrait tablets** — **one** column: the deck takes the full
  canvas instead of half of it, the stats row and the two follow-up cards stack
  under it full width.
* **narrow-container fallback** (`@container dc-rev (max-width: 859px)`) — the
  960–1240 px windows that keep the shell but lose ~1000 px to the rail and
  gutters still collapse to a single readable column. Its selectors were also
  **raised to the same specificity as the band rules** and it sits later in the
  file: the earlier spelling (`[data-rev-followups]` alone, 0,3,0 against the
  band's 0,3,0 + `!important`) silently lost the cascade and left the crushed
  1024 / 1194 px layouts in place. It restores the 16 px stacking rhythm it had
  just zeroed for the grid.

Nothing about the deck itself changed: card box, stack, physics, dots, themes,
swipe thresholds, gesture handling and the reference's typography are all
untouched, and the deck's height is still solved from `[data-revision-page-main]`
(never the viewport).

## After (same five viewports, same bundle)

| Viewport | Deck panel | Quick stats | Weak Topics + Revision Bank | Deck card clipped | Horizontal scroll |
| --- | --- | --- | --- | --- | --- |
| 1440 × 900 desktop | 1079 | 441 | 623 | 0 px | none |
| 1194 × 834 tablet landscape | 840 | 840 | 840 | 0 px | none |
| 1024 × 768 laptop | 713 | 713 | 713 | 0 px | none |
| 834 × 1112 tablet portrait | 776 | 776 | 776 | 0 px | none |
| 390 × 844 phone | 358 (unchanged) | 358 | 358 | 0 px | none |

Also verified with a fresh 5-test deck: 768 × 1024, 960 × 600, 1023 × 768,
1366 × 1024 and 1920 × 1080 — the deck spans the canvas, the follow-ups sit
under it in one (narrow content) or two (5 / 7) columns, nothing clips, nothing
scrolls sideways, and screenshots of each were reviewed.

Screenshots: `qa/before/` and `qa/after/` (desktop, laptop, tablet landscape,
tablet portrait, phone) plus `qa/after/*-mid.png` / `-bottom.png` scrolling
shots. (Workspace-only QA artifacts, not part of the app.)

## Tests

New: **`tests/revisionDashboardDesktopTabletLayoutContract.test.mjs`** (6 tests)
locks the invariants that broke:

1. the follow-up row has its own hook and is never picked by position;
2. the deck panel spans the canvas in all three bands (and no band may set a
   panel's `display` without placing it in the grid);
3. the follow-ups keep the 5 / 7 split where there is room, and the panels opt
   out of the wrapper's alignment instead of the wrapper shortening them;
4. the narrow-container fallback out-ranks the width bands (same specificity,
   later in the file) and restores the stacked rhythm;
5. tablet portrait is one full-width column, never a 2-up split;
6. no band still splits the grid through the removed `lg:col-span-*` classes
   alone.

Verification:

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | 3034 tests, **2956 pass, 33 fail** — the 33 are the pre-existing repository failures (unchanged count/names) |
| `npx tsc --noEmit` | 9 errors — all pre-existing, none in the touched files |
| `npx vite build` | clean (20.8 s); the shipped CSS was re-read to confirm the cascade order of the fixed rules |
| Browser QA | 10 viewports, measured + screenshot-reviewed, before/after captured |
