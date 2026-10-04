# Revision Dashboard — Slide Deck card (aicanvas.me port)

Owner brief (2026-10-04): the Revision Dashboard's top surface is no longer the
plan carousel / hero card. It is the **AI Canvas "Slide Deck"**, implemented the
way the reference does it — same stack, same physics, same dots, same editorial
themes, **no glass** — and its cards carry the learner's saved tests.

Reference: <https://aicanvas.me/components/slide-deck>.

## What changed

| Surface | File |
| --- | --- |
| The deck itself (new) | `src/revision/components/PlanSlideDeck.tsx` |
| Dashboard hero → deck | `src/revision/pages/DashboardPage.tsx` |
| Import form: Chapter name (new field, beside Test name) | `src/revision/pages/BulkImportPage.tsx` |
| AI generator: Test name (already user-typed) | `src/revision/pages/AiGeneratePage.tsx` |

The old `RevisionPlanCarousel` / `RevisionPlanCard` markup is gone: no arrows,
no `overflow-x-auto`, no `Swipe to change plan` hero copy. The dashboard keeps
its `data-rev-*` layout hooks, stat grid and bank grid, and the bottom
navigation is untouched.

## The reference, ported line by line

* **Card box** — `CARD_W 260 × CARD_H 300`, radius 20.
* **The stack** — every slide stays mounted; offset `(index - current + count) % count`:

  | offset | x | y | scale | opacity | z |
  | --- | --- | --- | --- | --- | --- |
  | 0 | 0 | 0 | 1.000 | 1 | 10 |
  | 1 | 0 | 11 | 0.962 | 1 | 6 |
  | 2 | 0 | 20 | 0.926 | 1 | 2 |
  | rest | 0 | 30 | 0.880 | 0 | 0 |

* **Forward** (next): the departing front card *flies out* to `x = −380`,
  `scale 0.88`, `opacity 0`, `zIndex 15`; the cards under it rise one step.
* **Backward** (previous): the arriving card is keyed `${id}-right`, starts at
  `x = +380, opacity 0, scale 0.88, y 0, zIndex 20` and slides in over the stack.
* Both are cleared in `onAnimationComplete` with functional `setState`.
* **Spring** — `{ type: "spring", stiffness: 300, damping: 28 }`.
* **Swipe** — front card only, x-axis, `dragElastic 0.5`; a release past
  `|offset.x| > 60` or `|velocity.x| > 400` moves the deck; anything less
  springs back. `touchAction: "pan-y"` keeps the page scroll.
* **Dots only** — one per test, 6 px wide, animating to 24 px on the active
  slide with `{ stiffness: 400, damping: 30 }`; `#E55A2B` active,
  `rgba(255,255,255,0.18)` / `rgba(0,0,0,0.15)` inactive by theme.
* **Themes** — four editorial cards (ink, bone, accent, charcoal) with the
  reference's exact palette and one shape decoration each (128 px outline
  circle, 15°-rotated square, twin vertical rules, outline triangle), cycled by
  slide index. The stage background is `#E8E8DF` light / `#1A1A19` dark, the
  dark read live via a `MutationObserver` on `<html class>`.
* **Typography** — label 10 px/700/0.12em uppercase, counter `XX / NN`
  11 px/700, numeral 88 px/900/0.85/−0.05em in the accent, title
  26 px/800/1.15/−0.03em; padding 24/28/28.

## The card content (owner's mapping)

Each saved test is one card:

| Card slot | Data |
| --- | --- |
| Subject (top label) | `planDetails.subjectNames` → "General" |
| Count (main numeral) | `totalQuestions` + `Questions` |
| Test name (under the count) | the test's `title` |
| Chapter (support) | `planDetails.chapterNames` → "Not labelled" |
| Counter / action | `XX / NN` · "Start Revision" → the test |

The count is unchanged: **one card per saved custom test**, so a learner with
five tests swipes through exactly five cards.

## Chapter name at import

* `BulkImportPage` gained a **Chapter name** field next to **Test name**
  (`data-rev-import-chapter`, placeholder `e.g. Electrostatics`). It is saved on
  the plan (`planDetails.chapterNames`), so the dashboard card shows it.
* Old imports keep working: with no chapter, the engine's honest legacy
  fallback still derives labels from the questions, and every existing field,
  the paste parser, the Test Bank reservation and the paywall gate are
  untouched.
* The AI generator keeps its own automatic title (`Revision · <Subject>`) and
  its subject/chapter selections, which already reached `planDetails`.

## Sizing (mobile, tablet, desktop)

The deck measures the Revision page's own scroller
(`[data-revision-page-main]`), never the viewport: the stage takes the visible
height between its top edge and the container's bottom edge (`BOTTOM_RESERVE`
only), so the deck cannot slide under the footer navigation. Inside it, the
card scale is clamped (`0.8 … 1.8`) against both axes with 28 px side rails and
88 px of chrome below the card. The first card owns the visible area; the next
two sit behind it, so the rest are a swipe (or a dot) away.

## Tests

| File | What it proves | Result |
| --- | --- | --- |
| `tests/revisionSlideDeckContract.test.mjs` | the reference's numbers, themes, shapes, gestures, sizing and the no-glass rule | 8 ✓ |
| `tests/revisionSlideDeckRuntime.test.mjs` | the real component in a DOM: card count/layers, content, swipe, spring-back, dots, tap-to-open, drag≠tap, geometry on phone/tablet/desktop/short viewport | 8 ✓ |
| `tests/revisionDashboardPlansContract.test.mjs` | the dashboard mounts the deck with the saved tests | 5 ✓ |
| `tests/revisionDashboardVerticalScaleContract.test.mjs` | the deck is solved from the visible area, not `100vh` | 7 ✓ |
| `tests/revisionChapterNameContract.test.mjs` | import → save → card for the chapter name (real engine), the new field, and the mapping | 6 ✓ |

Full suite: 3028 tests, 2950 pass, 33 fail — the 33 failures are the
pre-existing repository failures (identical names to the baseline run).
