# Footer navigation default, round plates, and the divider's split-mode button

Owner brief (2026-10-14), three asks in one turn:

> 1. Settings (profile) mein footer navigation ka **Edge-to-edge** style
>    **default** ho jaye — sabke liye set karo, purane users ke bhi.
> 2. Course player ke footer navigation ke **plate** bade screen par oval ho
>    jaate hain — **circular** rehne chahiye.
> 3. Bade screen par divider ke chhote button par click karne par sirf **swap**
>    nahin — **left** area ko ek aur hisse mein todne ka button aur **right**
>    wala bhi (3-part se 4-part tak). Koi hissa **khaali** na rahe, aur
>    **har** divider par dono option mile.

---

## 1. Edge-to-edge (`youtube`) is now the default for everyone

`src/utils/footerNavigationStyle.ts`

| Piece | Value |
| --- | --- |
| `DEFAULT_STYLE` | `"youtube"` (the edge-to-edge bar) — unchanged, already the fallback for a fresh profile |
| `STORAGE_KEY` | `"dc-footer-navigation-style"` |
| `MIGRATION_KEY` (new) | `"dc-footer-navigation-style.edge-default.v1"` |
| `ensureDefaultFooterNavigationStyle()` (new) | exported, boot-time one-shot |

The stuck point was that a learner who had once picked *Four-button glass* or
*Classic dock* had that choice **saved**, so "default" alone never reached them.
The new function runs once per device and, if the marker is absent, writes the
edge-to-edge style over whatever was stored, then sets the marker. Later boots
read the marker and leave a learner's own choice alone.

It is called from `src/main.tsx` right after `initFooterNavSpace()` — deliberately
**not** as a module side effect, because six classic-dock tests mount the app with
`footerStyle: "glass-dock"` and would be stomped by an import-time write. Boot-only
keeps those harnesses honest while still forcing the real app.

The write goes through `localStorage.setItem` inside a `try/catch`, so a private-mode
browser (storage throwing) can never take the app down; the change event
`dc:footer-navigation-style-change` is dispatched so mounted listeners re-read
the new value without a reload.

## 2. The strip's plates stay round on big screens

`src/course/course-strip-nav.css` — the plates used to be `flex: 1 1 auto` items in a
`justify-content: center` track, so on a wide stage the flex line stretched them into
ovals. Now:

* the track is `justify-content: safe center` and is its own **container**
  (`container-type: inline-size`), so nothing about the plates depends on the viewport
  (a desktop window can still be a narrow modal);
* `course-strip-plate` is a hard **32px circle** — `flex: 0 0 32px`, equal width and
  height, `aspect-ratio: 1`, `border-radius: 50%`, `flex-shrink: 0`;
* below 720px of *container* width the name labels are hidden (icon-only rail); at
  `@container (min-width: 720px)` the names come back with 14px plate padding;
* a `prefers-reduced-motion` block drops the reveal/track transitions.

Because width and height are both pinned, the shape cannot drift at any width — phone,
tablet, ultrawide, or with 12 plates instead of 3.

## 3. Every divider can split its own region (3-part → 4-part)

### The rule

`src/course/splitMotion.ts` owns the constants:

| Constant | Value | Meaning |
| --- | --- | --- |
| `SPLIT_WIDE_MIN_PX` | `900` | a deck narrower than this never offers split controls |
| `EXTRA_PANE_ENTRY` | `40` | the share a brand-new part takes |
| `EXTRA_PANE_DEFAULT` | `50` | the resting share of an extra part |
| `EXTRA_PANE_MIN` / `MAX` | `15` / `85` | the drag clamp for an extra part |
| `splitExtrasKey(courseId, axis)` | `dc.splitDeck.extras.v1:{courseId}:{axis}` | per course, per axis |

The gate is `wide = renderExtraPane ? deckWidth >= SPLIT_WIDE_MIN_PX : false`, and it is
driven by the deck's own `ResizeObserver` — **phones never see the split button**, and
neither does a desktop window dragged down to phone width. When new controls had to be
placed on a large screen the deck measures itself; the media query is only the phone
floor it always was.

### The gestures

`src/course/studyPanels.tsx`

* **`SplitDivider`** now takes an `actions` list and renders a small cluster under the
  switch: one **swap** pill (`data-course-split-swap`) plus one pill per available
  move — `data-course-split-action="study"` / `"lesson"` to split that region, or
  `"merge-study"` / `"merge-lesson"` to fold it back. The cluster carries
  `data-course-split-cluster="main" | "nested"` and the divider carries
  `data-divider-kind`, so the main line and a nested line are distinguishable both to
  tests and to a screen reader (`aria-label` names the kind).
* **Every** divider gets the same two gestures: the main divider can split the lesson
  side or the study side, and an extra pane's own nested divider can split *its* region
  again or merge itself away. Merge is offered only when that region really has an extra
  part to remove — no dead buttons.
* **`ExtraPaneRegion`** renders the pair: `data-region-pane="primary"` plus
  `data-region-pane="extra"`, with `data-region-swapped` mirroring the region's own
  swap. Swap moves the *content*, never the DOM host, so a video or canvas keeps
  running through the flip.
* Ceiling: **4 parts** total (lesson + study, each splittable once). At the ceiling the
  split pills disappear rather than being shown disabled-and-confusing.

### No empty part, ever

A newly created part is never a blank box. `CoursePlayerApp.tsx` hands the deck a
`renderExtraPane` and the free-tab list, and the player picks the first of
`extraPaneTabs` (modules / notes / read / paid) that is not already showing on
`dockTab`, the lesson extra pane, or the study extra pane — so a fresh part always
lands on a real study surface. `src/course/ExtraPaneTabs.tsx` gives that part its own
tab chooser: dots in the course colour, with the tab name appearing from 320px up.

Singleton panels are gated **off** inside an extra part (`opts.extra ? undefined : …`
for Mind map, Sketch, AI, Player and Experiment). Two Excalidraw canvases, two AI
sessions or two video players fighting over one scene is not a feature; the extra part
gets the tab-shaped content that can safely coexist.

### Persistence and the existing gestures

The extras live beside the ratio in the same per-course, per-axis record, so a
four-part arrangement comes back with the course and portrait/landscape keep their own
layouts. Drag-resize, the snap floors, the peek rails, the keyboard takeover and the
collapse/restore pair are untouched: the extra part is a normal flex sibling with its
own clamped grow, so the divider drag it shares with the main line behaves exactly like
before.

## 4. Where things live

| File | Change |
| --- | --- |
| `src/utils/footerNavigationStyle.ts` | `MIGRATION_KEY`, `ensureDefaultFooterNavigationStyle()` |
| `src/main.tsx` | boot call after `initFooterNavSpace()` |
| `src/course/course-strip-nav.css` | rewritten: container query, hard 32px circles, reduced motion |
| `src/course/splitMotion.ts` | `SplitRegion`, `SplitExtraPane`, `SplitExtras`, wide-gate + clamp constants, extras load/save |
| `src/course/studyPanels.tsx` | deck owns extras; `SplitDivider.actions`; `ExtraPaneRegion`; per-divider clusters |
| `src/course/ExtraPaneTabs.tsx` + `src/course/extra-pane-tabs.css` | new: an extra part's tab chooser |
| `src/CoursePlayerApp.tsx` | one `buildStudyPane()` builder for every part, `extraPaneTabs`, `renderExtraPane`, `opts.extra` gates |

## 5. Tests

New this round:

* `tests/coursePlayerSplitExtraPanesRuntime.test.mjs` — 9 tests driving the **real**
  deck: `a phone-sized stage keeps the bare switch: no split controls are offered`,
  `a wide stage offers one split control per region beside the switch`,
  `splitting the lesson area adds a third part inside that region`,
  `splitting the other region grows the deck to four parts`,
  `every divider offers the switch and the split-mode control`,
  `merging takes the added part away and leaves the pair alone`,
  `the region's switch trades its two parts and never remounts them`,
  `the added part can change its own tab without touching the main one`,
  `the arrangement comes back with the course and stays per axis`.
* `tests/coursePlayerSplitExtraPanesContract.test.mjs` — 9 source-shape tests:
  `the split ceiling and the wide-stage gate live in the motion file`,
  `the deck measures itself, so a phone stage never offers a third pane`,
  `the divider renders the controls it is handed, next to the switch`,
  `an extra part is a real study pane with a tab of its own`,
  `the added part has its own divider with the same two gestures`,
  `an extra part never mounts a singleton canvas, chat or video`,
  `the player hands the deck the pane renderer and the free-tab rule`,
  `the extra part's own tab chooser is a real control`, and
  `the footer strip keeps its plates circular on a wide stage`.
* `tests/footerNavigationDefaultContract.test.mjs` — 5 tests:
  `Edge-to-edge stays the one default, and the migration is one-time`,
  `only the real app boot runs it — harness pages keep switching styles on purpose`,
  `a browser with an older design saved is moved onto Edge-to-edge once`,
  `a browser with nothing stored simply reads the default`, and
  `storage that refuses writes never breaks the footer` — the middle three run the real
  module through `ts.transpileModule` against a fake `window`, so they prove behaviour
  rather than text.

Three older source-shape tests were **retargeted** to the new shapes without weakening
what they assert (the study pane is now built by one `buildStudyPane()` builder for
main and extra parts, and the singleton panels are handed down as
`opts.extra ? undefined : (…)`):

* `tests/coursePlayerDockMagneticNotesKeyboardContract.test.mjs`
* `tests/courseSketchIntegrationContract.test.mjs`
* `tests/coursePlayerSelfExperimentContract.test.mjs`

Results on this branch:

| Run | Result |
| --- | --- |
| the nine split / strip / footer test files | **66 pass / 0 fail** |
| full `tests/course*.test.mjs` sweep | **821 tests, 787 pass, 15 fail** — the same 15 pre-existing failures as the untouched baseline, **no new ones** |
| `npx tsc --noEmit` | clean |
| `npx vite build` (`NODE_OPTIONS=--max-old-space-size=6144`) | OK |

The 15 remaining failures are pre-existing on `main` (course progress/snapshot wiring,
the revision Brain page, the shared viewer, the theme toggle, and the social profile
card) and were verified against a `git stash` baseline before and after this work.

## 6. Notes for the next hand

* The split controls are gated by **deck width**, not by `window.matchMedia`, so a
  split-screen desktop window behaves like the tablet it is. If the product ever wants
  the controls on a large phone in landscape, raise `SPLIT_WIDE_MIN_PX` discussion —
  do **not** replace the `ResizeObserver` with a media query.
* Extra parts deliberately shadow the singleton panels. Adding a new singleton tab
  means adding the same `opts.extra` guard, or two instances will mount.
* `ensureDefaultFooterNavigationStyle()` is boot-only by design; do not move it to a
  module side effect or the classic-dock test harnesses (and any future embed) will
  have their style stomped on import.
