# Footer navigation — smooth drag on every screen

Owner brief, 2026-09-28:

> "Home page per jis jis screen size per footer navigation available hai, home page per
> footer navigation drag scroll left-right karne per lag karta hai, animation lag dikhta
> hai — jabki course player ke andar, ya My Day per, ya aur bhi jagah jo bhi footer
> navigation hai vah lag nahin karte drag scroll karne per. Difference analyse karo aur
> vaise hi footer navigation ko bhi design karo taki super smooth scroll animation ho."

## The short version

Every footer in the app already renders the **same** component
(`SiteFooterNav` → `GlassDock`), so the difference was never a design difference. It was
what one frame of the magnification wave cost — and three per-frame costs in that wave
were multiplied by the size of the page the footer floats over. Home is the longest,
busiest document in the app, so it paid a bill My Day and the course player never
noticed. The wave is now transform-only, measures layout once per gesture instead of once
per frame, and stops publishing the footer's height while it is mid-spring.

## The analysis — what actually happened on one frame of a drag

### 1. The plates animated layout properties

`DockItem` drove `style={{ width: size, height: size }}` off the magnification spring, so
every spring tick wrote a **layout** property on all seven Home plates. Consequences, in order:

* a layout pass every frame;
* the capsule is `w-max`, so widening the plates **resized the capsule**;
* `GlassMaterial` is `absolute inset-0` inside the capsule, so it resized too — firing its
  `ResizeObserver` into `buildLensMap()`: a 220×220 pixel loop, `putImageData`, and a
  **blocking `canvas.toDataURL()` PNG encode**, then `setMap()` → a React re-render → a
  brand-new `<feImage>` → Chromium re-running the SVG filter. The map cache is keyed on
  the exact pixel size, so a drag crossed dozens of distinct sizes and paid that encode
  dozens of times a second.
  (With glass on — the default tier — that lens is not even painted:
  `html[data-glass="on"] :where([data-glass-dock]) > [aria-hidden] > div` in `src/glass.css`
  overrides the layer's `backdrop-filter` with a flat blur. The rebuild was pure cost.)

### 2. The distance was measured per item, per frame

Each plate's `useTransform` called `el.getBoundingClientRect()` to work out how far it was
from the pointer. One pointer move therefore forced **seven synchronous layouts**, taken
right after that frame's style writes — the worst possible place for a read.

### 3. Every one of those writes was a document-wide event

`src/utils/footerNavSpace.ts` published the footer's real height as `--dc-footer-nav-h`
on `<html>` (pages use it as their bottom clearance). To know when to re-measure, it
watched **`document.body`'s whole subtree for `class` and `style` mutations**.

Framer Motion writes inline styles on every spring tick, so dragging the footer woke that
observer every frame. Each wake ran `getComputedStyle` + `getBoundingClientRect` on every
footer (a forced layout of the whole document), and — because the capsule's height
*changes while the wave runs* — wrote a **new value of a custom property on the root
element**. A custom property on `:root` invalidates style document-wide, and every page
scroller consumes the value as its `::after` clearance:

```css
/* src/index.css, inside @media (max-width: 959px) and the not-desktop-shell gates */
[data-app-frame]:has(> [data-site-footer-nav]) > main::after { height: var(--dc-footer-nav-h, 0px); }
```

So one drag re-styled and re-laid out the entire page, once per frame.

### Why Home and not the others

The cost of (3) is proportional to the size of the document:

| screen | footer wrapper measured by `footerNavSpace`? | document behind it |
| --- | --- | --- |
| **Home** | yes (`SiteFooterNav`) | hero carousel, product grid, reviews rail, matter.js sticker wall, social card |
| My Day | yes | a handful of cards |
| Cart / Revision | yes | short lists |
| **Course player** | **no** — the peek dock is not a `[data-site-footer-nav]` at all, so its drag never touched `--dc-footer-nav-h` | the player pane |

Same component, same springs — a page-size bill. That is the "difference" the brief
asked for.

*(Honest scope note: the three mechanisms above are verified from the code and by the new
runtime test. Their relative weight on a real phone was not profiled on-device here — the
structural reason Home pays the most is the per-frame document-wide recalculation, whose
cost scales with the document.)*

## The fix

### `src/components/glass-dock/GlassDock.tsx` — the wave is transform-only

* **Plates keep a fixed box** (`plateSize`) and magnify with `scale` (origin
  `50% 100%`) + `y` (the −12 px lift). No layout property is ever animated on an item,
  and the tap target never changes size mid-gesture.
* **The neighbour push is arithmetic, not layout.** In the old centred `w-max` flex row,
  item *i*'s centre moved by exactly half the growth to its left minus half the growth to
  its right; the dock now computes that and applies it as `x` on the item column (so the
  plate's tooltip travels with its plate).
* **The capsule carries the envelope change on one element**, through its own
  `padding-top` (grows upward only, exactly like the bottom-aligned row did) and
  `padding-inline` (grows symmetrically, exactly like a centred capsule whose plates
  widened). One small subtree re-lays out, instead of seven plates plus a material layer.
* **One spring config** (`stiffness 300 / damping 22 / mass 0.5`) drives plate scale,
  lift, push and both paddings, so glass and plates cannot drift apart mid-gesture.
* **Centres are measured once per gesture** (on `pointerdown`, at rest) plus on mount and
  on resize — never per frame. The pass refuses to run while the wave is live, because
  `getComputedStyle` reports the capsule's *animated* padding: measuring a magnified
  capsule as the resting one made the footer grow a little further on every gesture. (The
  runtime test pins this — it is the bug it caught first.) A deferred retry covers a
  resize that lands mid-gesture.
* **Pointer moves are coalesced** to one update per animation frame (a 120 Hz panel fires
  two or three per frame; the spring only needs the last).
* **Touch drags take pointer capture**, so the wave keeps following a finger that drifts
  off the capsule.
* `whileTap={{ scale: 0.82 }}` became a press spring multiplied into the wave's scale — a
  `whileTap` scale would fight `style={{ scale }}` for the same transform slot. Same 0.82.
* `contain: layout style` keeps the capsule's one small layout inside the dock.

**Unchanged:** `ICON_SIZE 44` / `COMPACT 38` / `DENSE 34`, `MAG_RANGE 120`,
`MAG_SCALE 1.55`, the −12 px lift, entrance springs and stagger, plate tints, badges,
tooltips, `touch-action: none`, and the swipe-to-select release (`idFromPoint`).

### `src/components/glass-dock/GlassMaterial.tsx` — no lens rebuild storm

The refraction lens is a smooth field that `feImage` stretches over the element anyway
(`preserveAspectRatio="none"`), so it is now keyed and built on a coarse grid
(32 × 24 px) and the `ResizeObserver` is coalesced to one refresh per frame. A gesture
that used to rebuild it dozens of times rebuilds it at most once or twice.

### `src/utils/footerNavSpace.ts` — off the animation path

* Watches the **footers** (`ResizeObserver`) plus the viewport plus a **childList-only**
  observer for a footer mounting/unmounting on a route change. Nobody's animation frames
  wake it any more.
* While a gesture is live it publishes **nothing**. `GlassDock` raises
  `data-dc-dock-gesture` on `<html>` once per gesture; the attribute flipping off is the
  cue to publish the settled height — which is the value pages actually need.
* The published variable, the `+12 px` headroom, and every consuming rule are unchanged.

## Verification

| check | command | result |
| --- | --- | --- |
| full contract + runtime suite | `node --test tests/*.test.mjs` | **2788 tests, 2731 pass, 56 fail** — the same 56 pre-existing failures as before this change (`comm` on the two failure lists is empty); +15 new tests, all passing |
| new contract (geometry + shape) | `node --test tests/footerDockSmoothDragContract.test.mjs` | 10/10 |
| new runtime (real `GlassDock` in jsdom) | `node --test tests/footerDockSmoothDragRuntime.test.mjs` | 5/5 |
| types | `npx tsc --noEmit -p tsconfig.json` | one unrelated legacy-module diagnostic at that time; that legacy module has since been removed |
| production bundle | `npm run build` | ✓ built in ~19 s |

`tests/footerDockSmoothDragContract.test.mjs` re-derives **both** models — the old
layout-driven row and the new transform row — for four mid-gesture states and asserts the
capsule's left edge, width and height, and every plate's centre X and top edge, agree to
1e-9. The look did not move.

`tests/footerDockSmoothDragRuntime.test.mjs` mounts the real dock (seven tabs, like
Home's mobile footer) and asserts the behaviour:

* a 14-step drag takes **exactly 8** layout reads (one `measure()` pass), then none;
* the plates' inline `width`/`height` are byte-identical before and after the wave, while
  their `transform` and the capsule's padding do move;
* `--dc-footer-nav-h` is frozen while the gesture flag is up and publishes the settled
  value once it drops;
* swiping across the dock and lifting the finger still selects that plate;
* gesture after gesture reaches the same capsule — the dock cannot ratchet. With the
  at-rest guard disabled, that test fails; restored, it passes.

## Not changed, and why

* **Home's page work.** The sticker wall's matter.js physics + canvas render loop keeps
  running when the learner is scrolled near it, and the footer's `backdrop-filter` sits on
  top of it — so the frost re-samples a moving backdrop regardless of the footer's own
  cost. That is a page concern, not a footer one; the footer no longer adds anything to
  it.
* **The look.** No size, gap, tint, blur, lift or spring constant moved, and the pinned
  `[data-dock-count]` fit bands in `src/index.css` are untouched.
* **Other footers.** They needed no edit: My Day, Cart, Revision, FlowPath, the desktop
  peek dock and the course player's peek dock all mount this same `GlassDock`, so they all
  got the smooth wave with it.
