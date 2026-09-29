// HOME FOOTER — THE FILLED DOCK'S WAVE IS TRANSFORM-ONLY
//
// Owner brief (2026-09-29): "Home page ka footer navigation use tarike se
// animate nahin karta jaise dusre dock jaise My Day ke karte hain drag
// scroll left right karne per."

# Home footer: drag-scroll wave restored (transform-only, like My Day)

## The difference the owner saw

Every footer mounts the same `SiteFooterNav → GlassDock`, so the wave code
is identical everywhere. What differed was the room around it:

* **My Day** (5 tabs, `fill = null`) leaves tens of px of free width beside
  the capsule, so the wave's horizontal half plays at full strength: the
  plates magnify, the **neighbours part** (the ripple), and the glass widens
  with them.
* **Home** (8 tabs, the 2026-09-28 width-fill brief) consumes the nav's
  whole width, so the clamp-aware squeeze (the same-day fix for the
  one-sided spill) measures ~2 px of headroom and throttles the wave's
  horizontal share to ~5 %. Icons still popped under the finger, but the row
  never rippled sideways — exactly what the owner reported.

## The fix — `src/components/glass-dock/GlassDock.tsx`

On a **width-filled dock** (`fill` present) the wave now rides transforms
only:

* the neighbour push takes its **full share** again — the drag-scroll ripple
  is back, identical springs and geometry to My Day's;
* the capsule asks for **no horizontal layout growth** (`padding-inline`
  stays at rest), so the `max-w-full` clamp that caused the one-sided spill
  can never be hit — symmetry is guaranteed by construction, not by
  throttling;
* the vertical half is untouched (the glass still breathes upward with the
  lift);
* an end plate at full magnification overhangs the capsule edge by at most
  ~0.3 × plate — inside the nav gutter plus the fill reserve, never the
  screen edge;
* and because the capsule no longer resizes mid-gesture on Home,
  `GlassMaterial`'s refraction lens can never rebuild during a drag there at
  all.

Roomy docks (My Day, Store, Cart, the course player, everything else) keep
the exact squeeze behaviour — untouched.

## Bonus fixes carried in the same commit

* `idFromPoint` fails soft when a DOM has no `elementsFromPoint`
  (jsdom, old WebViews) instead of throwing mid-gesture — this un-crashed
  the two runtime test files that had never finished on `main`
  (`footerDockSmoothDragRuntime`, `homeFooterDockFillRuntime`).
* The stale `atRest` contract pin (0.5 → the deliberate 0.05 threshold from
  the FlowPath cumulative-growth fix).

## Verification

* `tests/footerDockSmoothDragContract.test.mjs` §5 rewritten to pin the new
  model: filled dock ⇒ `pushShare = 1`, glass growth `0`; roomy docks keep
  the squeeze; the hit-test guard.
* `tests/homeFooterDockFillRuntime.test.mjs` §4b now mounts the real filled
  dock, drags across it, and asserts **the ripple exists** (`translateX` on
  the parting columns), **the glass stays put** (`padding-inline` at rest)
  and the plates never resize — 6/6 pass, and the file completes for the
  first time.
* Full `node --test tests/*.test.mjs`: **80 failures on base → 76, zero new
  failures, four stale ones fixed.** `tsc --noEmit` and `vite build` clean.
