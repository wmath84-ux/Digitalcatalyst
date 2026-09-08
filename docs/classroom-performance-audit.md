# Classroom performance audit — 8 September 2026

## Outcome and measurement limits

Optimized the **existing** course player. No replacement player, UI redesign, game mode, or new learning features. Viewer implementations, wall content, notes, mind maps, controls and iframe mounting semantics remain in place.

**These are production-build measurements in Chromium 149 / ANGLE SwiftShader (software GPU), not physical old-phone or high-end-desktop results.** Third-party responses were deterministic iframe fixtures. Actual YouTube decoding, Google editor and native PDF rendering performance remain unmeasured. No universal 30/60 FPS claim is made.

## 1. Biggest bottlenecks

- **GPU/fill:** steady rendering is GPU-backend-bound here: approximately 230 ms GPU-query time versus less than 1 ms renderer submission CPU time in the idle diagnostic. A diagnostic-only DPR change from 1 to .25 reduced sampled GPU time from approximately 237 to 27 ms. The .25 setting was **not shipped**.
- **DPR ownership bug:** R3F reapplies the Canvas DPR prop on parent/portal renders. The old constant prop undid AdaptiveDpr. Live baseline quality fell to low while DPR stayed at 1. The adapter now preserves the actuator's live value.
- **Unnecessary shadow rebakes:** boolean Canvas shadows selected deprecated PCFSoftShadowMap, which Three 0.185 converted to PCF. Subsequent Canvas renders restored the deprecated type and requested another bake. Explicit PCF preserves the effective appearance without that loop.
- **Cold shader stalls remain:** getProgramInfoLog/getShaderInfoLog caused approximately 600–900 ms first-use stalls. Disabling checks merely moved blocking to getProgramParameter. Forced priming moved it into startup; asynchronous compilation is unavailable on this backend. Neither experiment was shipped.

## 2. Optimizations already present and retained

13 merged static geometry batches; normal Three frustum culling; PerformanceMonitor → AdaptiveDpr / AdaptiveEvents; baked 512×512 directional shadows; restrained lighting; plain transparent window glass; procedural geometry; Preload all; cached wall visibility queries/hysteresis; visible/hidden wall activity; lazy iframe boot with mounted-state retention; motion impostors; the existing 45 ms embed-transform commit throttle; context bridges and scroll controls.

No global shader precision reduction, texture downgrade, shadow removal, iframe feature stripping or blanket instancing was introduced.

## 3. New optimizations

- **Canvas compatibility:** live-DPR binding, recoverable high ceiling, stale drag-snapshot protection and explicit effective PCF shadow mode.
- **Governor:** stateful tier hysteresis; small resolution steps; continued sampling instead of permanent finite-flip fallback; sustained 60 Hz / 30 Hz frame budgets; visibility-history reset; consistent R3F performance floor. Budget selection is not a second RAF or forced FPS limiter.
- **Classmates:** shared immutable geometry/materials, one animation subscriber, conservative animated bounds, offscreen pose sleeping, near/full-rate and farther 30/15 Hz updates. Only curved parts receive three LOD levels, with 0.6 m hysteresis around 5 m / 9 m thresholds. Original near geometry is byte-identical. Off-camera casters remain included during the full-detail shadow bake.
- **Selective batching:** fan blades are instanced under their existing animated parent. Desk-leg instancing was **rejected** because it added a draw in the normal view; legs instead share resources while retaining separate culling bounds.
- **Particles/CPU:** snow reuses its capacity buffer across quality changes, changes draw range and maintains drift-aware bounds; invisible particle updates sleep; static local transforms stop recomposing while world transforms remain Three-managed; narrower store subscriptions; pointer records mutate in place.
- **Timers/storage:** motion extends one quiet-window deadline rather than creating a timer per frame. Identical playback patches skip repeated sorting, serialization and localStorage writes; actual progress, seeks, page/scroll and image changes still persist immediately.
- **Fullscreen:** native board fullscreen switches only the covered WebGL scene to demand rendering. DOM/media remain mounted and independent; exit resumes the same Canvas.
- **Resource ownership:** cached CPU assets remain reusable, but their last mounted owner disposes GPU bindings/listeners. Reference counting protects concurrent owners. This also covers the existing merged geometry cache; its merging algorithm is unchanged.

## 4–8. Production before/after results

Two fresh-context **10-second runs** per A–J scenario; pooled display-render intervals. Same scripted paths, viewport and requested tier. Governor sampling is disabled only in the harness for these scene comparisons; separate live runs follow. Detailed callback/GL instrumentation is excluded from headline samples.

| Scenario | Calls, median | Triangles, median | Mean frame ms | p95 frame ms | FPS |
|---|---:|---:|---:|---:|---:|
| A — idle | 24 → 24 | 1,670 → 1,670 | 251.5 → 252.1 | 404.5 → 482.0 | 3.98 → 3.97 |
| B — focus movement | 34 → 27 | 3,530 → 1,796 | 314.6 → 290.3 | 568.0 → 642.0 | 3.18 → 3.45 |
| C — fast pointer drag | 41 → 29 | 4,594 → 2,070 | 300.2 → 260.4 | 546.1 → 468.1 | 3.33 → 3.84 |
| D — board fill | 14 → 14 | 202 → 202 | 307.2 → 298.7 | 513.6 → 493.6 | 3.26 → 3.35 |
| E — wall focus | 34 → 28 | 3,530 → 2,158 | 315.3 → 290.3 | 580.8 → 474.9 | 3.17 → 3.44 |
| F — YouTube fixture | 24 → 24 | 1,670 → 1,670 | 269.6 → 248.0 | 481.8 → 405.8 | 3.71 → 4.03 |
| G — Docs fixture | 24 → 24 | 1,670 → 1,670 | 262.1 → 258.0 | 403.7 → 438.7 | 3.82 → 3.88 |
| H — diagnostic rear view | 82 → 80 | 12,610 → 11,194 | 266.7 → 241.0 | 404.5 → 412.4 | 3.75 → 4.15 |
| I — low/CPU-throttled | 24 → 24 | 1,670 → 1,670 | 136.7 → 76.1 | 203.6 → 106.0 | 7.31 → 13.15 |
| J — desktop-sized | 24 → 24 | 1,670 → 1,670 | 976.0 → 942.3 | 1,717.3 → 1,412.5 | 1.02 → 1.06 |

A–I: 640×360 CSS pixels. J: 1280×720. DPR 1/high throughout except I: low tier, 4× CPU throttle, **DPR .7 → .42**. I is **not an equal-pixel speedup**: it demonstrates that adaptive resolution now sticks. The DOM boards/iframes are not rasterized at this lower WebGL DPR. J is not a high-end hardware measurement. H is a diagnostic camera, not an added player control.

Interpretation:

- Idle high-quality FPS is effectively unchanged, and its sampled p95 worsened. **No global FPS/frame-pacing improvement is claimed.**
- Fast movement peaks: **56 → 38 calls**, **7,104 → 4,180 triangles**; shadow rebakes **35 → 0** across two runs. Triangle reductions here include eliminated shadow work, not just model simplification.
- H: **82 → 80 calls**, **12,610 → 11,194 triangles**. Curved-part LOD accounts for the geometry reduction; classmates were not removed.
- I: **136.7 → 76.1 ms mean**, **203.6 → 106.0 ms p95**, **7.31 → 13.15 FPS**. Still below 30 FPS on this software backend.
- B's p95 worsened despite its improved average. Cold compilation and sandbox scheduling remain significant.
- Estimated missed 60 Hz opportunities: C **1,107 → 1,111**, I **1,048 → 933**. These are timing-derived estimates, not compositor telemetry. Most sandbox frames still exceed 33.3 ms.
- Detailed visible render-object census: idle **24 → 24**, H **82 → 80**. The instanced fan still has all three blades.
- Supplemental PDF fixture: **24 calls / 1,670 triangles** unchanged. Native board fullscreen: continuous hidden WebGL rendering before, **zero rendered WebGL frames during the optimized six-second sample**. This does not mean zero video playback FPS.

### Live governor — separate 30-second runs

- High-start idle: **4.79 → 6.89 FPS**, mean **208.9 → 145.2 ms**. Baseline DPR stayed at 1 despite tier decline; optimized DPR stepped through .948 … .42. Optimized shadow rebakes were zero. Long tasks increased in this run; smoother behavior is not claimed universally.
- Low-start/CPU-throttled: **7.52 → 12.78 FPS**, p95 **184.8 → 104.2 ms**, DPR **.7 → .42**. The optimized governor selected a 33.3 ms budget after sustained floor pressure, but this software GPU still could not meet it.
- Tests execute the installed monitor to verify that healthy 60 Hz does not trigger permanent fallback, one slow frame does not lower quality, sustained 50 FPS declines, and sustained recovery restores quality.

## 9. Memory, GC and loading

- Idle attached geometries: **102 → 55**; materials **102 → 59**; renderer textures **3 → 3**. H uses 59 geometries when medium LOD is active.
- Attached geometry ArrayBuffer bytes: **536,420 → 223,484**. Including unused cached LOD buffers: **259,468 bytes**, approximately **52% less** than the baseline geometry payload. These are buffer bytes, not total VRAM.
- **No blanket JS-heap/GC improvement is claimed.** Endpoints vary; I averaged **18.9 → 23.2 MiB** at sample end. Initial repeated visits also showed retained-heap growth, prompting explicit shared-resource lifetime cleanup.
- Final cleanup verification: geometry/material/texture counts stay **55 / 59 / 3** across repeat visits; cached geometry identity is reused and its renderer-dispose listener count stays **1**, rather than accumulating old renderer listeners. Whole-app leak freedom is not proven by this short test.
- A synthetic 1,000 identical playback-poll test reduces persistence calls from **1,000 to 1**. Changed values still persist immediately. This is not a measured physical-device storage/FPS gain.
- No downloaded room models/textures were found to compress or stream. Course media/iframe loading is unchanged. Production HTML: **4,305.75 → 4,312.38 kB**, gzip **1,188.12 → 1,190.95 kB**. No startup speedup is claimed. First display-render entry is recorded separately from actual presentation; the opening animation is excluded using its existing URL override.

## 10. Deliberately not implemented

- Giant animated instance batches or more global merging: would harm per-object culling; the desk-leg trial demonstrated this.
- LOD on every box or a new very-far world system: this is a bounded seated classroom. Normal far-plane/frustum culling remains.
- Raycast/software occlusion, streaming, BVH/Hi-Z renderers, global pooling, native Vulkan/NEON/subpass/Swappy techniques: no measured justification or inappropriate browser equivalents here.
- A replacement Html/iframe compositor: the audit did not justify replacing working portals/throttling; actual remote decoder/editor costs were unavailable.
- Global low-precision shaders, removed lighting/shadows or reduced course textures: visual/functionality risk without evidence.
- Forced shader priming or disabled diagnostics: did not eliminate backend compilation work. Original Preload remains.

## 11. Validation and remaining bottlenecks

**2,250 tests pass; production build passes; whitespace check passes.** Typecheck has exactly the same six pre-existing diagnostics as baseline: unused declarations and an existing duplicate JSX attribute. No new diagnostics were added.

Production-browser assertions passed for all four surfaces, DPR persistence/recovery, decline-during-drag handling, note draft retention/save, iframe identity/internal state, completion and FIT/FILL controls, fullscreen suspension/resumption and repeated-visit resource ownership.

Same-pose WebGL comparison, excluding randomized weather on both sides only for this visual check: seat view **pixel-identical**; rear LOD view changed 362 of 230,400 pixels (188 exceeded eight channel levels). Stylesheets were unchanged. This is not exhaustive visual equivalence across every device/file type.

Remaining priorities: physical old Android/iOS and desktop GPU traces; actual YouTube decode and PDF/Docs sessions; cold shader compilation; longer authenticated-course retained-heap measurements; and DPR/budget tuning from those physical-device traces. No guarantee that every old device reaches 30/60 FPS is made.

## Reproduce

React 19.2.6; Three 0.185.1; R3F 9.7.0; drei 10.7.8; Vite 7.3.2; Playwright 1.63.0. Baseline commit: `76549cd71415858b1b40cd0820db41452e08a13c`.

```bash
npm ci
npx playwright install chromium
npm run build
npm run preview -- --host 0.0.0.0 --port 4174
# Separate terminal, production server running:
node scripts/benchmark-classroom.mjs --url=http://127.0.0.1:4174 --seconds=10 --repeats=2
node scripts/benchmark-classroom.mjs --url=http://127.0.0.1:4174 --governor=live --scenarios=A,I --seconds=30
node scripts/benchmark-classroom.mjs --url=http://127.0.0.1:4174 --detail=true --scenarios=A,C,H,P,K
node scripts/verify-classroom-runtime.mjs --url=http://127.0.0.1:4174 --memory-cycles=3
node --test tests/*.test.mjs
```

Use `CHROMIUM_PATH` for an installed browser. The sandbox used an ignored local Chromium distribution because the standard download host was unreachable. Default measurements explicitly use SwiftShader; `--gpu=hardware` permits a supported desktop GPU. `--network=live` requests actual hosts, whose availability must be checked. Detailed instrumentation adds overhead and must remain separate from headline runs. CPU-profiler recording crashed the stripped browser; CPU attribution instead used callback/GL timings and trace counters.

Compare against the preserved baseline production build on another port, not a dev/HMR server. Raw traces/browser binaries remain in ignored `scratch/`, not Git. [Machine-readable results](classroom-performance-results.json) include per-run values, heaps, counters and limitations.

Timing runs preceded the final **unmount-only** shared-resource listener cleanup. Per-frame rendering code is unchanged; the final build and repeat-visit browser regressions were rerun afterward.

## Exact changed files

Application:
- `src/CoursePlayerApp.tsx`
- `src/course/playbackState.ts`
- `src/classroom3d/Classroom3D.tsx`
- `src/classroom3d/ClassroomCanvas.tsx`
- `src/classroom3d/QualityGovernor.tsx`
- `src/classroom3d/quality.ts`
- `src/classroom3d/Room.tsx`
- `src/classroom3d/Classmates.tsx`
- `src/classroom3d/classmateAssets.ts`
- `src/classroom3d/objectActivity.ts`
- `src/classroom3d/resourceLifetime.ts`
- `src/classroom3d/StaticInstances.tsx`
- `src/classroom3d/DeskConsole.tsx`
- `src/classroom3d/SeatRig.tsx`
- `src/classroom3d/WallVisibility.tsx`
- `src/classroom3d/embedMotion.ts`

Tests, tools and report:
- `tests/classroom3dPerformanceContract.test.mjs`
- `tests/classroom3dEmbedImpostorContract.test.mjs`
- `tests/classroom3dOptimizationRuntime.test.mjs`
- `scripts/benchmark-classroom.mjs`
- `scripts/classroom-performance-probe.mjs`
- `scripts/verify-classroom-runtime.mjs`
- `docs/classroom-performance-audit.md`
- `docs/classroom-performance-results.json`
