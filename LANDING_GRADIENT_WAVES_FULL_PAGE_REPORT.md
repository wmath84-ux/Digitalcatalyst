# Landing Background = React Bits “Gradient Waves”, page-wide

**Source of truth:** https://reactbits.dev/c/backgrounds/gradient-waves (component
+ prop table fetched from `DavidHDev/react-bits` — `src/ts-tailwind/Backgrounds/
GradientWaves/GradientWaves.tsx`, the exact file the site's shadcn registry
(`public/r/GradientWaves-TS-TW.json`) ships, dependency `ogl@^1.0.11`).
**Date:** 2026-10-07 · **Branch:** `arena/e57d5541-digitalcatalyst`

The owner brief: the landing page background must be *this* React Bits
component, installed as shipped, and applied across the **whole** landing page.

---

## 1. What changed

| File | Change |
| --- | --- |
| `src/components/GradientWaves.tsx` | Replaced with the **official** `ogl` component (TS version, unmodified) — real raymarched sine-plasma waves, not the earlier hand-rolled three-sine approximation. |
| `src/LandingApp.tsx` | The landing's single background layer: Gradient Waves at its documented defaults, mounted page-wide behind every section (see §2). |
| `tests/landingGradientWavesBackgroundContract.test.mjs` | New contract test that locks the integration (dependency, prop defaults, one page-wide mount, WebGL2 guard, sections intact). |
| `package.json` | No change needed — `ogl@^1.0.11` was already a dependency. |

The component is React Bits' own code (WebGL2 `#version 300 es` shader pair,
`raymarch()`/`plasma()`, `detail` → step-count tiers, premultiplied alpha output,
Resize + Intersection observers, grain, cursor parallax). Only **one** line of it
is not verbatim React Bits, and it is marked with a comment:

```ts
// [Digitalcatalyst] This instance paints the landing page's page-wide
// background, so it is mounted BEHIND the page content and never receives
// pointer events itself. The listeners therefore live on the window ...
window.addEventListener('pointermove', onPointerMove, { passive: true });
document.addEventListener('pointerleave', onPointerLeave);
```

React Bits listens on the **canvas** for `pointermove`. On this page the canvas
is a background layer under the content, so the pointer never reaches it; moving
the listeners to `window` restores the component's own parallax without touching
the shader, the props or the render loop. The 21 documented props and all 21
defaults are unchanged (asserted by the new test).

## 2. “Pure landing page” mounting

```tsx
<div className="pointer-events-none fixed inset-0 z-0" data-dc-landing-waves>
  {showWaves ? <GradientWaves /> : null}
</div>
<div className="relative z-10"> {/* Header · Hero · Features · CtaBanner · Footer · LandingOverlays */}
```

* React Bits ships the component as a self-sizing block (`relative h-full w-full`).
  Inside a **fixed, full-viewport, non-interactive** shell it therefore covers the
  entire landing at every size and stays put while the page scrolls — the effect
  is continuous behind the hero, the features grid, the CTA and the footer
  instead of stopping after the first screenful.
* Stacking: app backdrop `z-index:-1` → **waves `z-index:0`** → all content `z-index:10`
  (the fixed header keeps `z-50` inside it). No second background layer exists.
* Colour scheme stays the documented one — `#5227FF` horizon, `#FF9FFC` waves,
  `#FFFFFF` crests, grain on, cursor parallax on — so the page reads exactly like
  the component's own preview.
* Props are the defaults on purpose. The previous instance passed
  `opacity={0.15}`; that is gone, because the brief is “exactly this effect”.

### WebGL2 guard

The shader is WebGL2-only. `ogl` silently falls back to WebGL1 when WebGL2 is
missing and the shader then throws inside the mount effect, which would blank the
whole landing page (the error would escape into the page shell). `LandingApp`
therefore probes for a WebGL2 context once and renders the waves only when it
exists; on anything else the page is exactly as it was before (app backdrop).

## 3. Verification

* **Real browser, real WebGL2.** Headless Chromium (software ANGLE/SwiftShader —
  no GPU in this sandbox) loaded `#/landing` and rendered the shader: the layer
  reports `position: fixed`, `z-index: 0`, canvas `1440×900` matching the
  viewport, and `canvas.getContext('webgl2')` is live. No shader compile errors,
  no WebGL warnings in the console. Screenshots captured at desktop (1440×900),
  scrolled (900/1800 px) and mobile (390×844): waves visible behind the hero, the
  feature grid, the CTA card and above the footer, with all copy/buttons intact.
* **Still animating after scrolling.** Instrumented draw-call counting in the
  page: 68 draws at the hero → 96 → 134 while parked 1500 px down the page, i.e.
  the loop keeps running and the effect is genuinely page-wide.
* **Cursor parallax reaches the shader.** With the pointer at x=60 the shader's
  `uMouse[0]` reads 0.248; at x=840 it reads 0.661 (0.5 = untouched default) —
  the window-level wiring works while the canvas itself is `pointer-events: none`.
* **Tests.** `node --test tests/landingGradientWavesBackgroundContract.test.mjs`
  → 6/6 pass. Full suite: 3250 tests, **3117 pass / 57 fail**, and the baseline
  run of the same suite **without** these changes fails the *identical* 57 tests
  (profile/store/revision contracts and an Android `versionCode` regex) — no
  landing or background test regressed; landing-specific contracts
  (`landingDesktopFullBleedContract`, `landingApkDownloadContract`,
  `landingFooterStoreGlassContract`, `desktopLandingLockContract`) all pass.
* **Type-check.** `npx tsc --noEmit`: zero errors in `LandingApp.tsx` /
  `GradientWaves.tsx` (52 pre-existing errors elsewhere, unchanged).
* **Production build.** `node scripts/vite-build.mjs` → `✓ built in 41.87s`.

## 4. Notes / limits

* `prefers-reduced-motion` is not handled — React Bits' component does not handle
  it either, and the brief was to ship it exactly as published. Say the word and
  we can gate the loop behind a media query.
* On a device without WebGL2 the landing keeps the app's clean-gradient backdrop
  rather than a static imitation of the waves (deliberate: no faked effect).
* The desktop preview of this branch runs `vite` on port 5173;
  `#/landing` and `#/` both show the effect.
