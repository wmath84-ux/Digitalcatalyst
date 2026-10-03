# Brain MCQ cards — the reference Product Card Deck, exactly

Owner brief, 2026-10-03:

> "Course Player ke andar Mind/Brain page par jo Test/MCQ cards hain, unka current
> design completely replace karo. Is reference design ko exactly follow karo:
> <https://aicanvas.me/components/product-card-deck> … Glass design bilkul use
> nahi karna hai … user jis option per click kare vahi submit ho jaaye aur card
> out ho slide hokar next per jaaye … user kisi bhi direction mein swipe kar sake
> … top-right corner mein ek small circular box jismein current question ka count
> show ho (1/10, 2/10)."

The Brain tab's question screen **is** that deck now. The reference's own source
was read line by line (AI Canvas is MIT/open-core: `aicanvas-me/aicanvas`,
`components-workspace/product-card-deck`) and its mechanics were ported verbatim
into `src/course/BrainQuestionDeck.tsx` — the same stack, the same drag-tilt, the
same flick physics, the same fly-off — with the practice question living inside
the card. The revision test-taking design the Brain page used to copy is gone from
this tab, glass and all. `src/revision/pages/TestPlayerPage.tsx` itself is
untouched.

---

## 1. What the reference is, mechanically (and what was ported)

| Reference (`product-card-deck/index.tsx`) | In the Brain deck |
| --- | --- |
| `VISIBLE = 4` cards; slots rest at `y = [0,12,24,36]`, `scale = [1,0.95,0.9,0.86]`, `opacity = [1,1,0.92,0.82]`, `zIndex = 100 - slot` | identical |
| Every card owns its own `x, y, scale, opacity` motion values — no hand-off when the deck advances | identical |
| `rotate = useTransform(x, [-200,200], [-18,18], { clamp: true })` | identical (verified in a real browser: −6.75° at 75 px, −14.4° at 160 px) |
| Slot transitions spring with `{ stiffness: 300, damping: 30 }`; background cards also recentre `x` | identical |
| Top card drags **free** (no axis, no constraints), `touchAction: none` | identical — this is what makes left / right / up / down / diagonal all work |
| Release: `speed > 500` **or** `dist > 130` = flick; slower than 220 falls back to `offset * 9`; otherwise spring back to slot 0 | identical |
| Fly-off: normalized velocity × 1500 over 0.5 s, opacity → 0 in 0.45 s, scale → 0.85, then `safeToRemove()`; `AnimatePresence` + `usePresence` | identical |
| Card: `borderRadius: 22`, `#D3DDEE`, dark `#111111` ink, pill `#141312` / `#F5F1E8` with hover (1.06 + `#2C2825`) and press (0.93 + `#000000`) springs | identical palette and states (the pill is `BrainPill`, used by the set cards, the submit dialog, the review bar and the result actions) |
| Heavier drop shadow on the top card than the rest | identical |
| Stage `clamp(220px, 72vw, 300px)` wide, +56 px tall | the deck takes **72 % of the pane it is given** (never past 360 px wide), +56 px |

### What changed, and why

- **The cards are the questions.** The reference's "picture" area is the
  question, its "caption strip" is the answer stack. There is **no pill CTA on
  the card** and **no Previous / Next / Skip button anywhere** — the answers are
  the only controls, and the swipe is the skip.
- **The deck drains instead of looping.** A catalogue repeats; a test set ends.
  The card behind rises, no fresh card arrives at the back, and when the last
  card has flown the deck reports `onEmpty` so the practice continues into the
  existing review → submit → result flow.
- **A round counter** sits in the card's top-right corner (`3/10`), and the
  question reserves exactly that corner (`paddingRight`), so nothing overlaps
  what the learner is reading.
- **A card that has more to say grows downwards**, and a question that still
  cannot fit is scaled down as a whole (never under 0.62) and then scrolls —
  never clipped, never a wall of 9 px type.

## 2. The flow the owner asked for

```
tap an answer
  → the answer is recorded (`selections[q] = option`)
  → the choice lights up (#141312 pill, white letter disc)
  → after 260 ms the card flicks ITSELF away (the deck's "onwards" direction)
  → the card behind rises into the top slot, the counter reads n+1/N
```

```
flick the card (any direction: left / right / up / down / diagonal)
  → the card sails off the way it was thrown, spinning to its tilt clamp
  → the next question rises into the top slot
  → no answer was written, so the question counts as skipped
```

- A **weak drag** (under both thresholds) springs back: an unfinished gesture
  never costs a question.
- **One answer per card**, and only the top card answers. A drag *over* an
  answer never answers it (a pointer that comes up more than 8 px from where it
  went down is a gesture, not a tap) — which is how both gestures live on the
  same surface.
- **Last card:** its fly-off hands the practice to the review grid on its own,
  with the docked **Submit Practice** bar, the same confirmation dialog, the same
  scoring and the same pass → *Module marked complete* behaviour as before.
- **Back** from the review grid re-enters the deck at the **first question that
  still has no answer**, so a learner finishing what they skipped is not sent
  through the whole set again.

## 3. No glass anywhere on this tab

The question screen used to be the revision test-taking page: `GlassSurface`
cards, `GlassTile` answers, a `dc-scene-plate` bar. All of it is gone from the
Brain tab — every surface is painted with the reference's own **solid** palette
through `src/course/BrainCards.tsx` (no `backdrop-filter`, no lens, no frost):

| Token | Value | Where it comes from |
| --- | --- | --- |
| `card` | `#D3DDEE` | the reference card face |
| `ink` | `#111111` | the reference title colour |
| `pill` / `pillHover` / `pillPress` | `#141312` / `#2C2825` / `#000000` | the reference pill + its hover / press states |
| `pillInk` | `#F5F1E8` | the reference pill's own text colour |
| `plate` | `#F5F1E8` | the answer tiles and the submit dialog's face |
| `page` | `#E8E8DF` | the reference's light page — the review screen's docked bar |
| `hint` | `#9E9E98` | the reference's hint line (dark mode) |
| `shadowTop` / `shadowRest` | `0 30px 60px rgba(0,0,0,.30), 0 10px 20px rgba(0,0,0,.20)` / `0 14px 30px rgba(0,0,0,.18)` | the reference's two shadows, verbatim |
| `radius` | `22` | the reference card's radius |

The tinted badges (difficulty, result chips) are solid tones in the same key.
`tests/courseBrainPracticeContract.test.mjs` asserts the absence of glass by
token, and the presence of the palette above, so a later edit cannot quietly
re-introduce either.

## 4. Fit: the pane, not the screen (carried over from 2026-09-28)

The Brain page still measures **its own box** and publishes `--brain-scale`
(`src/course/panelFit.ts` → `brainFitScale`), because the learner drags the Split
Deck divider and the study pane is a different size every frame. The deck does
the same thing one level down, with the reference's own proportions:

- `brainDeckSize(pane)` — 72 % of the pane's width (the reference's `72vw`),
  capped at 360 px wide / 560 px tall, never taller than the pane can hold (the
  stack's peek and the hint line are reserved), floor 200 px wide;
- the card's metrics are the reference's own px × the card's width scale
  (`unit()`), and the deck's **one** content scale is applied **once**, as a
  transform. (Scaling the metrics *and* the transform would make the measurement
  depend on the scale that measurement produces — the card oscillates between two
  sizes. That is pinned by a test.)
- the measurement is layout-only (`offsetHeight`), so it does not wobble with the
  deck's own scale.

Verified in a real Chromium (Playwright, headless) at 390 × 720, 1100 × 900, a
900 × 330 landscape rail and with a deliberately enormous 6-option question: no
overflow, no clipping, no oscillation, no console errors.

## 5. Files

| File | What |
| --- | --- |
| `src/course/BrainQuestionDeck.tsx` (new) | the ported deck: stack, drag, flick, fly-off, the card face (question + answers + counter), the pane measurement |
| `src/course/BrainCards.tsx` (new) | the reference's palette and its solid parts: `BrainSurface`, `BrainPill`, `BrainCounter`, `BrainBadge`, `BrainProgress` |
| `src/course/CourseBrainPanel.tsx` | the question screen is the deck; the deck state (`items`), answer → auto-flick, flick → skip, last card → review; every other screen re-painted on the solid palette; the deck-nav buttons and the swipe handler removed |
| `src/course/panelFit.ts` | `brainDeckSize()` + the deck's own constants (reference width, peek, hint, gutter, caps) |
| `src/index.css` | the Brain block's doc comment (the tab is the deck now; the ladder is still only the pre-measure fallback) |
| `src/components/dev/BrainDeckPreview.tsx` (new) | dev sandbox `#/dev/brain-deck`: the **real** panel with the demo course's **real** practice set on a box you can size by hand (`?w=`, `?h=`, `?long=1`) |
| `src/main.tsx` | that sandbox's lazy route, wired exactly like `#/dev/opening` |
| `tests/courseBrainPracticeContract.test.mjs` | the deck's mechanics, the no-button rule, the counter, the palette / no-glass rule, the flow, the scaling language, the dev sandbox |
| `tests/courseBrainDeckRuntime.test.mjs` (new) | the REAL panel in a real DOM: tap-to-answer, any-direction flick, weak drag, skipped-question accounting, review → submit, Back resuming, the deck's own box |
| `tests/coursePanelFitContract.test.mjs` | `brainDeckSize()` arithmetic + the deck's one-fit architecture (the old "docked Previous / Next bar" test became "the question screen is the deck, and the review bar stays docked") |

## 6. One unrelated dev-server fix (found while verifying this work)

`utils/pushScheduler.js` read `process.env.MYDAY_MAX_CATCHUP_HOURS` at module
scope, and `src/main.tsx` imports that module. Vite replaces only
`process.env.NODE_ENV`, so on `npm run dev` the browser threw
`ReferenceError: process is not defined` while the module was still evaluating —
which takes the whole import chain down and leaves **the app unmounted** behind
the opening splash. (The production bundle tree-shakes the unused constant away,
so it only ever bit the dev server.) The read is now guarded
(`typeof process === "undefined" ? undefined : process.env?…`), which is the same
value on the server and "not set" in the browser. `tests/myDayExactTimeDeliveryContract.test.mjs`
still passes (18/18).

## 7. Verification

```
node --test tests/courseBrainPracticeContract.test.mjs \
           tests/courseBrainDeckRuntime.test.mjs \
           tests/coursePanelFitContract.test.mjs \
           tests/coursePaneFitRuntime.test.mjs \
           tests/coursePlayerUx.test.mjs \
           tests/demoCourseContent.test.mjs          # 98 pass / 0 fail
npx tsc --noEmit                                 # no new errors
npx vite build                                   # builds; no dev-only file ships
```

The full suite: **2997 tests, 33 failures — all pre-existing and unrelated** (My
Day tab strip, store view order, FlowPath radial menu, liquid-glass pinning, APK
workflow…). They fail identically at the branch point with these changes stashed
(checked), and this work adds 2 test files without touching any of them.

`#/dev/brain-deck` (dev only) opens the deck in the running app: the dev server
is live at the `Course Player (dev)` preview, and the sandbox's size sliders
reproduce the Split Deck divider by hand.
