# Course Player — Gradient Waves background on "Modern module listing"

**Date:** 2026-10-10 · **Branch:** `arena/f99924cb-digitalcatalyst`

The Course Player now paints the **same** animated React Bits Gradient Waves
background as the landing page, controlled by the existing
**Player settings → "Modern module listing"** switch.

| Switch | Course Player |
| --- | --- |
| **ON** (default when nothing is saved) | Modern module list + Gradient Waves behind the content area |
| **OFF** | Classic module list + the legacy player backdrop, exactly as before |

## 1. What the landing page uses (inspected first)

* `src/components/GradientWaves.tsx`: the official React Bits component
  (`DavidHDev/react-bits`, `src/ts-tailwind/Backgrounds/GradientWaves`). Diffed
  against upstream on 2026-10-10: identical apart from the one documented
  change (pointer listeners on `window` so parallax works behind content).
* Dependency: `ogl@^1.0.11` (already installed).
* Configuration: all documented defaults: `#5227FF` horizon, `#FF9FFC` waves,
  `#FFFFFF` crests, speed 0.4, detail `medium`, grain on, cursor parallax on.
* Behaviour: WebGL2 raymarched plasma, rAF loop paused when off-screen
  (IntersectionObserver) or when the tab is hidden; ResizeObserver; full
  cleanup and `WEBGL_lose_context` on unmount.
* `src/LandingApp.tsx` mounts it once in a fixed, `pointer-events-none` shell
  behind a WebGL2 probe. **This file is not modified.**

## 2. What changed

| File | Change |
| --- | --- |
| `src/course/CourseGradientWavesBackground.tsx` (new) | Memoised layer that renders `<GradientWaves />` with the landing defaults. Click-through, `aria-hidden`, `absolute inset-0 z-[-1]`. WebGL2 probe runs once per session (cached). An error boundary means a GPU failure can only remove the background. Pixel ratio is capped at 1× on touch devices and 1.5× on desktop. |
| `src/components/GradientWaves.tsx` | Additive `maxDpr` prop. Its **default is 2**, React Bits' own cap, so the landing page renders exactly as before. Read once per mount, so changing it never re-creates the WebGL context. |
| `src/course/playerPreferences.tsx` | `DEFAULT_MODULE_LISTING_STYLE = "modern"` (ON), `isModernModuleListing()`, and a `storage` listener so other open tabs follow along. The default is only a **read** fallback: nothing is written on load. |
| `src/CoursePlayerApp.tsx` | `gradientWavesOn` comes from the same preference. The layer is the first child of the stage (below the top rail). The shell has `data-course-waves="on\|off"`. |
| `src/course/courseGradientWaves.css` (new, imported in `main.tsx` after `courseTheme.css`) | While waves are ON only: the opaque lesson/study plates become tinted scrims, so the waves show through. Touch devices drop the study pane's live backdrop blur over the animated canvas. Paint only. |
| `src/course/PlayerPanel.tsx`, `src/course/CourseOverlay.tsx` | The `"classic"` fallback defaults now point at the shared default constant. |
| `tests/coursePlayerGradientWaves{Contract,Runtime}.test.mjs` (new) | 16 tests: wiring, default ON without writing, immediate toggle, persistence, saved OFF respected, per-user keys, cross-tab sync, memoisation, no-WebGL2 safety. |

## 3. Layering: why nothing gets covered

The shell is `position: fixed`, so it is its own stacking context. The waves
layer uses `z-index: -1` inside the stage. It paints directly above the shell's
legacy backdrop and **below everything else**: panes, divider, footer/peek
dock, snow, centre completion control, toasts, dialogs and sheets. No z-index
was added to any existing element, so no fixed overlay gets trapped in a new
stacking context. The top progress/settings rail sits outside the stage, so the
waves never paint behind or over it.

`pointer-events: none` means every click, tap, wheel and touch scroll lands on
the content. Parallax still works through the window-level listener.

## 4. Verification (headless Chromium, WebGL2 via SwiftShader)

The real `CoursePlayer` was rendered with Firebase stubbed, the same approach as
`tests/fixtures/coursePanelsHarness`, and driven with Playwright:

* New user, empty storage → `data-course-waves="on"`, one canvas, modern
  listing, **storage still empty**.
* `elementFromPoint` at four points in the content never hits the layer, and
  module rows are clickable or tappable.
* Settings → switch OFF: the layer and canvas are gone in the same frame, the
  value is saved as `classic`, the WebGL context is released and the plates are
  back to the legacy opaque paint. ON: back immediately.
* 10 rapid toggles: always ≤ 1 canvas; contexts created 8 / released 7 (one
  live).
* OFF survives reload and a fresh player mount. A user who had saved OFF before
  this release stays OFF. An explicitly saved ON survives reload.
* Phone 390×844 @3×, tablet 820×1180 @2×, tablet landscape 1180×820: drawing
  buffer = CSS size (1× cap), no backdrop blur over the shader, and the layer
  never overlaps the top rail.
* Contrast, measured from rendered pixels behind the text across several
  animation frames: worst case **7.1 : 1** for white ink on the dark theme and
  **12.5 : 1** for slate ink on the light theme (WCAG AA needs 4.5 : 1).

Repo checks: the full `node --test tests/*.test.mjs` has the **same 51
pre-existing failures** with and without this change, plus 16 new passing tests.
The landing contract passes (6/6). `tsc` shows no new errors. The production
build (`node scripts/vite-build.mjs`) succeeds.

## 5. Notes

* Defaulting the switch to ON also makes the **modern** module list the default
  for learners with no saved choice. That follows from the brief tying both to
  one switch. A saved Classic/OFF choice is untouched.
* `prefers-reduced-motion` is not specially handled, same as on the landing
  page. The loop could be gated on it if wanted.
* Without WebGL2 the layer stays an empty, inert box and the legacy backdrop
  shows. No static imitation is painted.
