# Home footer: the glass capsule now expands with the wave

// Owner brief (2026-09-29, round three): "Home page ki footer navigation
// drag animate to ho raha hai perfectly. Lekin drag left right scroll karne
// per icon dock container area se bahar chale ja rahe hain left right ki
// taraf — hona chahiye ki container bhi left right expand ho taki icons
// container ke andar hi dikhen."

## The difference the owner saw

Round two (commit `4283e93`) restored the drag wave at full strength on the
filled Home dock — but deliberately froze the glass: `padding-inline` stayed
at rest, so the capsule never widened. The physics then guaranteed an
escape: a full-strength wave spreads the 8-tab row by ~60 px (each plate's
magnification plus the neighbour push), and with the glass static the pushed
and magnified end plates sailed ~20–25 px **past the capsule edge on both
sides** — "icons container ke bahar".

Why not just grow the glass by the full ask? The filled capsule already
spans the nav at rest (`HOME_FILL_RESERVE = 4` per side inside the nav's
gutter), so a 60 px ask is ~30 px per side of room the footer simply does
not have. Growing the glass fully would push it past the screen edge;
keeping the push full would keep the escape. The only arithmetic that
satisfies both the brief and the screen is **one share for the whole wave**.

## The fix — `src/components/glass-dock/GlassDock.tsx`

The clamp-aware squeeze (`squeezeX` = min(1, room/ask), room = the capsule's
measured headroom per side × 2) now scales the **entire** wave, and the
glass follows it:

1. **The glass expands left AND right, always to its full budget.**
   `padding-inline` grows by `share × ask / 2` on every gesture — exactly
   the measured headroom, half per side, symmetric around the row (the
   ≤319 px spread band keeps its fixed padding). The container visibly
   breathes with the finger and can never cross within 2 px of the screen
   edge (`EDGE_KEEP_PX`, the same budget every dock already honoured).

2. **`max-w-full` is released, not fought.** A new inline
   `maxWidth = restingWidth + growth` (`glassMaxWidth`) removes the clamp
   that once turned a symmetric padding ask into the one-sided right spill:
   the border box can always take the padding, so the content box equals the
   row width at every spring frame. At rest the value equals the resting
   width — the box is pixel-identical.

3. **Magnification, lift, tooltip ride and the neighbour push take the same
   share** (`DockItem`'s new `waveScale = 1 + (m − 1) × k`, `waveShare`).
   With one k everywhere:
   * a plate pair's gap changes by `k × ((δi + δj)/2 − shove) = 0` —
     **plates can never crowd or overlap** mid-gesture;
   * an end plate's outer edge moves exactly as far as the padding grew —
     **every plate keeps its resting glass margin at ANY share**, so the
     icons are inside the container at rest *and* mid-gesture;
   * the wave's shape never distorts — it scales. The pop (the part the
     owner calls "perfect") is the least-squeezed visual at every width.

4. **At rest everything lands home**: padding back to the fill's exact
   resting numbers, `maxWidth` back to the resting width, transforms to
   identity — the same once-per-gesture measure pass guards it.

Docks with room (My Day, the 7-tab nav at most widths, the peek dock)
resolve share = 1 and wave **exactly as before** — nothing about their
arithmetic changed.

## What it feels like now (per width)

| Viewport | share k | glass growth mid-gesture | wave |
| --- | --- | --- | --- |
| 360 px phone | ~0.35 | ~11 px per side | pop 1.55→~1.19, gentle part, glass breathes |
| 390 px phone | ~0.37 | ~11 px per side | same |
| 430 px phone | ~0.70 | ~21 px per side | pop ~1.39, clear ripple, glass follows |
| ≥768 px | ~0.34–1.0 | headroom-sized | roomy docks play near full |

The old one-sided (right-only) spill is structurally impossible: the
padding ask is symmetric and the clamp that degraded it is released by the
same amount.

## Verification

* `tests/footerDockSmoothDragContract.test.mjs` — section 5 rewritten as
  "the squeeze owns the whole wave and the glass follows it": pins the
  uniform share, the `maxWidth` release, `waveShare={squeezeX}`, and the
  unchanged push arithmetic. 11/11.
* `tests/footerDockSmoothDragRuntime.test.mjs` — 5/5 (layout-read budget,
  gesture publish, settle-home, no ratchet, swipe-select all intact).
* `tests/homeFooterDockFillRuntime.test.mjs` — 4b rewritten as "a drag
  across the filled dock grows the glass with the wave and every plate
  stays inside": asserts the capsule widens by its whole headroom (+15 px
  on the 430 px fixture), reads the transforms back and asserts every plate
  stays within the grown capsule edges, asserts the resting rhythm is
  preserved between all pairs (no crowding), and that the capsule settles
  back to rest after the finger lifts. Fill sections 1–4a (resting
  geometry) untouched and green. 6/6.
* Dock suites total 22/22. Full suite: 76 fails = base 80 − 5 fixed
  + 1 known rename artifact ("search — per-page…", pre-existing failure
  under a new name) — **zero regressions**. `tsc` clean for the touched
  files; `vite build` clean (21.3 s).
