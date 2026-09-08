# Performance engineering pass — Eduvora / Digital Catalyst

**Branch:** `arena/01a0823d-digitalcatalyst` (base `6cb555c`)
**Date:** 2026-09-08
**Toolchain detected:** pnpm 10.34.5 (corepack) · Node 22.22.3 · Vite 7.3.2 + `@vitejs/plugin-react` · React 19.2.6 · Tailwind v4 · TypeScript 5 · Firebase 12 (modular) · Capacitor 7 (Android)
**Commands used:** build `pnpm build` · typecheck `npx tsc --noEmit` · tests `node --test tests/*.test.mjs` (`run_tests.sh`) · dist gates `node scripts/verify-backdrop.mjs`, `node scripts/glass-coverage.mjs`
**No lint script exists** in `package.json`; nothing was disabled or weakened.

> Scope note, stated up front: **there is no AiMentor and no Community feature in this repository.** `grep -ri "aimentor\|community"` finds no such screen. The closest analogues are the AI revision subtree (`src/revision/**`, `pages/AiGeneratePage.tsx`, `engine/aiUsage.ts`) and the notifications/queries screens. The AiMentor-specific mandates (paginate chat sessions, isolate input state, virtualize conversations, visualViewport rAF) therefore have no target here; the equivalent work was applied to the closest real screens (notifications list pagination, shared listeners, route splitting for the revision engine). This is reported rather than invented.

---

## 1. Problems found (audit, before touching anything)

Audited against the A–AX checklist. Findings, worst first:

| # | Problem | Evidence | Severity |
|---|---|---|---|
| P1 | **The entire app shipped as ONE file.** `vite-plugin-singlefile` inlined every route, vendor and stylesheet into `dist/index.html`. | baseline build: `dist/index.html` = **3,312,918 bytes raw / 918.95 kB gzip**, 2,766 modules, one blocking parse | Critical |
| P2 | **A ~5 MB MP4 opening clip downloads before the bundle**, on every cold load, on every device — `preload="auto"` + `src` assigned in the pre-React inline script. | `public/assets/animations/EduOS_app_opening_mobile.mp4` 5,017,574 B; desktop 5,097,100 B; `index.html:81-92,197` | Critical (mobile / slow network) |
| P3 | The clip was fetched **even when it was never going to play** (reduced-motion boots set `src` then `pause()`). | `index.html` set `src` outside the `playClip` branch | High |
| P4 | **21 static route imports** in `src/main.tsx` — admin console, course player, mind map, revision engine, flowpath, checkout all parsed on the landing page. | `src/main.tsx:23-48` (before) | Critical |
| P5 | **Duplicate `onSnapshot` listeners on identical queries.** `users/{uid}` was watched 3× (AuthContext + CommerceContext + useCourseAccess); `users/{uid}/purchases` 2×; `entitlements where uid==` 2×; `users/{uid}/subscription/current` 2×; published `siteReviews` 2×; notifications 2×. `CourseRouteGuard` *renders* `CoursePlayerApp` and both call `useCourseAccess` → **8 listeners for 4 queries** on one screen. | 72 `onSnapshot` sites across 25 files | Critical (billing + battery) |
| P6 | **Notifications list rendered unbounded**, every item inside a framer-motion `AnimatePresence`. | `src/components/NotificationsPage.tsx` | High |
| P7 | **`firebase/storage` initialized eagerly at module scope** with zero consumers on the boot path. | `firebase.ts` `getStorage(app)` | Medium |
| P8 | **`matter-js` physics (85 kB) + a 621-line canvas simulation mounted eagerly on Home**, above and below the fold alike. | `src/components/StickerWall.tsx`, `src/home/App.tsx` | High |
| P9 | **`MindMapPanel` (2,200 lines / 208 kB) statically imported by the course player**, loaded even for learners who never open the mind map. | `src/CoursePlayerApp.tsx` | High |
| P10 | **34 `<img>` tags with no `loading`, no `decoding`, no dimensions** → layout shift + main-thread decode on scroll. | 15 files | Medium |
| P11 | **Service worker cached the app shell only**; every hashed chunk re-fetched from the network on each visit. | `public/sw.js` v3 | Medium |
| P12 | **Scroll handler wrote CSS custom properties synchronously per scroll event** (style write inside the listener, then a second write in the rAF). | `src/utils/footerGlow.ts` | Medium |
| P13 | **No route prefetch of any kind** — every navigation was a cold parse. | — | Medium |
| P14 | **Admin data layer `getDocs` entire collections** (`siteOrders`, `users`, `siteReviews`, `siteProducts`) and filters in memory; tables are unpaginated. | `src/lib/admin/client.ts` | Medium (admin-only) |
| P15 | `CatalogContext` subscribes to **all** of `siteProducts` with no `limit`, re-running `mapProduct` + `localeCompare` sort on every snapshot. | `src/context/CatalogContext.tsx:125` | Medium |
| P16 | No performance instrumentation at all. | — | Low |
| P17 | `react-rnd` and `react-day-picker` are declared dependencies with **zero imports**. | `grep` | Low (already tree-shaken) |

**Already good — deliberately left alone** (the brief says improve existing perf work, don't compete with it): the glass tier system already downgrades to `lite`/`flat` on `hardwareConcurrency <= 4 || deviceMemory <= 3`, reduced-transparency and reduced-motion (`src/lib/glass.ts`); `SnowOverlay` already parks its rAF on `document.hidden`; `CatalogContext` already implements a `fromCache`-first paint; `firebase.ts` persistent cache; `ConnectivityContext` visibility gating; `CONTINUE_LEARNING_LIMIT = 2`.

---

## 2. Changes implemented

Each item below is **BEFORE → CHANGE → AFTER → EXPECTED IMPACT**.

### 2.1 Route-level code splitting (P1, P4)

- **BEFORE** — `vite-plugin-singlefile` produced one 3.31 MB / 919 kB-gzip `index.html`. 21 screens were static imports in `src/main.tsx`. A learner opening the landing page parsed the admin console.
- **CHANGE** — removed `vite-plugin-singlefile`; added `manualChunks` (`vendor-react`, `vendor-firebase`, `vendor-motion`) and `cssMinify: "lightningcss"` in `vite.config.ts`. Added `src/utils/lazyRoute.ts` — a 100-line helper wrapping `React.lazy` with a **memoised `.preload()`**, an `onIdle()` scheduler and a `prefersReducedData()` probe. All 21 routes became `lazyRoute(() => import(...))`, wrapped in **one** `<Suspense fallback={<RouteChunkFallback />}>` that reuses the app's existing loading visual.
- **Waterfall avoidance** (explicitly required): `LandingApp` stays a **static** import so Vite emits a `modulepreload` for the default screen; `routeChunkFor(hash)` + `preloadRouteChunk()` start the active route's chunk **at module-evaluation time, before React renders**, and again in a **capture-phase** `hashchange` listener one tick before React re-renders. So the split does not add a render→suspend→fetch hop.
- **AFTER** — 117 JS chunks. Critical path for a cold landing open = entry + 3 preloaded vendors + CSS.
- **EXPECTED IMPACT** — **919 kB → 429.7 kB gzip on the critical path (−53%)**, and ~1.6 MB of raw JS (admin, mind map, revision, flowpath, checkout, matter-js) never parsed unless visited. On a mid-range Android (≈1.5 MB/s of usable 4G, ~1 MB/s parse+compile) this is roughly **1.5–2.5 s off Time-to-Interactive** and a far smaller main-thread compile burst — the single biggest win in this pass.

### 2.2 The 5 MB opening video (P2, P3) — biggest mobile/slow-network win after splitting

- **BEFORE** — `index.html`'s pre-React script assigned `video.src` unconditionally with `preload="auto"`. Every cold load raced a **5,017,574-byte** MP4 against the JS/CSS the app needs to boot, including on Data Saver, on 2G, and on reduced-motion boots where the clip is paused immediately and never seen.
- **CHANGE** — two changes, mirrored on both sides of the boot so the pre-React script and the React controller agree:
  1. `index.html`: `if (playClip) video.setAttribute("src", src);` — the file is only fetched when a frame will actually be shown.
  2. New Data-Saver / 2G rule: `navigator.connection.saveData === true || /(^|-)2g$/.test(effectiveType)` → static brand card, in both `index.html` and `resolveOpeningDecision()` (new optional `saveData` input in `src/utils/openingSplash.ts`). `?opening=force` still plays it.
- **AFTER** — the clip downloads only for boots that will display it on a connection that can carry it. No visual change for everyone else: the *existing, designed* static brand card is shown (the same one reduced-motion users already get).
- **EXPECTED IMPACT** — up to **5 MB and ~10–12 s of bandwidth contention removed** from a cold boot on a slow or metered connection, and ~5 MB of data saved per cold load for reduced-motion users on any connection. This dwarfs every JS-level saving in this document.

### 2.3 One shared Firestore listener layer (P5)

- **BEFORE** — 72 `onSnapshot` call sites; the same queries opened repeatedly by co-mounted components. Opening a course ran `useCourseAccess` twice (guard + player) = 8 live listeners for 4 queries, each re-billing document reads and holding its own snapshot in memory.
- **CHANGE** — added **one** dedup/cache layer, `src/lib/sharedSnapshot.ts` (no competing system introduced; it is the single layer everything else extends):
  - `subscribeShared(key, makeQuery, listener)` — ref-counted collection/query listener.
  - `subscribeSharedDoc(key, makeRef, listener)` — same for documents (added this pass).
  - `useSharedSnapshot`, `SharedDoc` React bindings.
  - **Stale-while-revalidate**: a late subscriber is replayed the cached snapshot **synchronously** on subscribe, then updated when the live snapshot lands.
  - **10-second teardown grace** so a route transition that unmounts and remounts the same consumer does not tear down and re-open (and re-bill) the listener.
  - Guaranteed cleanup: the last unsubscriber schedules `stop()`; errors are fanned out, not swallowed.
- Wired through: `useCourseAccess` (4 listeners), `useOwnedProducts` (2), `AuthContext` (`users/{uid}`), `CommerceContext` (`users/{uid}`), `CatalogContext` (`users/{uid}/purchases`), `useProductReviews` + `CatalogContext` reviews aggregate, `useUnreadNotificationCount` + `NotificationsPage`.
- **AFTER** — on a course-player screen the same data is served by **4 listeners instead of 8**; `users/{uid}` is **1 listener instead of 3**; the notification bell and the bell page share one; the store card ratings and the PDP review list share one.
- **EXPECTED IMPACT** — roughly **50–65 % fewer Firestore document reads** on the player/PDP/profile paths and one snapshot copy in memory per query instead of N. Also removes the duplicate re-render storm: one snapshot used to wake two independent `useState` trees.

### 2.4 Notifications list pagination (P6)

- **BEFORE** — every notification the account had ever received was mapped into a framer-motion `AnimatePresence` card. A heavy account = hundreds of animated DOM subtrees.
- **CHANGE** — `NOTIFICATIONS_PAGE_SIZE = 20`; `visibleCount` state (reset on filter change); a `data-notifications-load-more` button appends the next 20. Filter chips and their counters still read the **full** filtered set, so nothing in the UI lies.
- Why client-side and not `orderBy("createdAt","desc").limit(20)`: **rejected deliberately** — legacy notification documents predate `createdAt`, and `orderBy` silently drops documents that lack the field, while `limit` without `orderBy` returns an arbitrary `__name__` slice. Doing it server-side requires a backfill; that is recommendation §20.2.
- **AFTER** — at most 20 animated cards mounted initially.
- **EXPECTED IMPACT** — bounded DOM (≈20 × ~15 nodes instead of unbounded) and a bounded `AnimatePresence` work list; on a 200-notification account this is roughly a 10× cut in mount cost and layout for that screen.

### 2.5 Deferred + lazy heavy components (P8, P9)

- **BEFORE** — `StickerWall` (matter-js physics, 621 lines, rAF loop) mounted with Home; `MindMapPanel` (2,200 lines) statically imported by the course player.
- **CHANGE** — new `src/components/DeferredVisible.tsx` (IntersectionObserver, 400 px `rootMargin`, mounts once then disconnects) wraps a `lazy()` `StickerWall`; `MindMapPanel` became `lazy()` + `Suspense` inside `CoursePlayerApp`.
- **AFTER** — `matter-CYOIWWfS.js` (84.73 kB) and `StickerWall--Nu4lpI3.js` load only when the wall scrolls near the viewport; `MindMapPanel-*.js` (208.16 kB / 68.40 kB gz) only when the mind map opens.
- **EXPECTED IMPACT** — Home boots without a physics engine or its rAF loop (measurable battery/CPU on low-end Android); the course player's first paint drops ~68 kB gzip and ~208 kB of parse.

### 2.6 Image loading discipline (P10)

- **BEFORE** — 34 `<img>` with no loading strategy.
- **CHANGE** — 21 images across 15 files given `loading="lazy" decoding="async"` plus intrinsic `width`/`height` where the layout allowed. **The hero carousel's first slide is explicitly `loading="eager"` with `fetchpriority` left to the browser** — the LCP element is never lazy (explicit requirement).
- **AFTER/IMPACT** — off-screen product/course art no longer decodes on the main thread during boot; reserved dimensions remove CLS on card grids.

### 2.7 Service-worker asset caching (P11)

- **BEFORE** — `digital-catalyst-app-shell-v3` cached the shell only.
- **CHANGE** — bumped to `app-shell-v4`, added `digital-catalyst-assets-v1`. Navigations stay **network-first** (fresh shell); `/assets/*` **content-hashed files only** are cache-first; `activate` prunes the asset cache to 100 entries when it passes 200.
- **Safety (explicit requirement)**: the matcher is `/-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|ttf|png|jpe?g|svg|webp|avif|gif)$/` — content-hashed build output only. It **cannot** match `/api/*`, auth, Razorpay, Firestore, any private or payment response, or `/assets/animations/*.mp4` (a 5 MB Range-served video must not sit in the app's cache quota). Only `status === 200 && type === 'basic'` responses are stored, so opaque/partial responses can never poison the cache.
- **IMPACT** — repeat visits serve ~430 kB gzip of critical JS/CSS from disk; a returning user on a dead network still gets a working shell.

### 2.8 Scroll handler coalescing (P12)

- **BEFORE** — `footerGlow`'s scroll listener wrote `--dc-footer-glow` synchronously on each scroll event *and* again from the rAF decay loop → two style invalidations per frame, one of them from inside the scroll handler.
- **CHANGE** — the listener now only bumps a number and schedules the rAF; `settle()` was reordered to publish → early-return at zero → decay → reschedule, so exactly **one** style write happens per frame and the final `0` frame is still emitted. The painted peak value is byte-identical to before.
- **IMPACT** — removes a style write per scroll event (scroll events fire faster than frames on Android); no visual change.

### 2.9 Bandwidth-aware prefetch (P13)

- **CHANGE** — three narrowly-scoped prefetches, never "preload everything":
  1. active route at boot (§2.1);
  2. capture-phase `hashchange` (§2.1);
  3. `onIdle(..., 4000)` warms **only** `StoreApp` and `ProfileApp` — the two destinations reachable from the footer nav on nearly every screen.
  4. Desktop only: `RailItem` in `DesktopShell` prefetches on `pointerenter`/`focus` via `prefetchRoute()`.
- **All of it is gated by `prefersReducedData()`** (`saveData` or `effectiveType` 2g/slow-2g) — a metered or 2G device speculatively fetches nothing.
- **IMPACT** — desktop rail navigation is typically instant (hover lead time > chunk fetch); mobile tab switches to Store/Profile skip the fallback entirely; no cost to data-constrained users.

### 2.10 Firebase init (P7)

- **BEFORE** — `getStorage(app)` at module scope on the boot path, zero consumers.
- **CHANGE** — replaced with an async `getFirebaseStorage()` that imports `firebase/storage` on demand.
- **IMPACT** — the Storage SDK leaves the boot path; the persistent-cache/auth-persistence configuration (already present, and good) was left intact.

### 2.11 Opt-in performance instrumentation (P16)

- **CHANGE** — new `src/utils/perfMonitor.ts`. **Off unless `?perf=1` or `localStorage["eduvora:perf"]==="1"`** (`?perf=0` clears it). When off it registers no observers and logs nothing — the cost on a normal boot is one `localStorage` read. When on: buffered `PerformanceObserver` for `largest-contentful-paint`, `layout-shift`, `event`, `longtask`; bounded counters (route samples capped at 30); `window.__eduvoraPerf.{report,state,stop}`. Route transition timing uses a double-rAF and is itself guarded by `isPerfEnabled()`.
- **Removal is one commit**: delete the file and the three call sites in `src/main.tsx`.

### 2.12 Build gates repointed at the split output

- `scripts/glass-coverage.mjs` and `scripts/verify-backdrop.mjs` both read `dist/index.html` only, which was correct **only** while the build was single-file. Both now read `dist/index.html` **plus** every `dist/assets/*.css`. Without this the design-system gates would have silently passed on an empty payload — i.e. the split would have disabled two guards. They are now genuinely enforced (§16).

---

## 3. Files changed

**Added (4):**

| File | Purpose |
|---|---|
| `src/utils/lazyRoute.ts` | `lazyRoute()` with memoised `.preload()`, `onIdle()`, `prefersReducedData()`, cycle-free `setRoutePreloader`/`prefetchRoute` registry |
| `src/lib/sharedSnapshot.ts` | The single ref-counted / SWR Firestore listener layer (`subscribeShared`, `subscribeSharedDoc`, `useSharedSnapshot`, `SharedDoc`) |
| `src/components/DeferredVisible.tsx` | IntersectionObserver mount gate (400 px margin, mounts once, disconnects) |
| `src/utils/perfMonitor.ts` | Opt-in, removable Web-Vitals / long-task / route-timing instrumentation |

**Modified (33):** `vite.config.ts`, `index.html`, `firebase.ts`, `public/sw.js`, `scripts/glass-coverage.mjs`, `scripts/verify-backdrop.mjs`, `src/main.tsx`, `src/CoursePlayerApp.tsx`, `src/PdpApp.tsx`, `src/LeaderboardApp.tsx`, `src/context/{AuthContext,CommerceContext,CatalogContext}.tsx`, `src/hooks/{useCourseAccess,useProductReviews,useUnreadNotificationCount}.ts`, `src/components/{NotificationsPage,DesktopShell,ProductCard,StorePage,OtherTabs}.tsx`, `src/home/App.tsx`, `src/home/components/{HeroCarousel,ProductCard,ContinueLearning}.tsx`, `src/cartWishlist/components/{FavoriteCard,CartItemCard}.tsx`, `src/subscription/components/{StackedCards,CourseSelectModal}.tsx`, `src/profile/ProfileLayout.tsx`, `src/course/PlayerPanel.tsx`, `src/utils/{footerGlow,openingSplash}.ts`.

`git diff --stat`: **33 files changed, 667 insertions(+), 192 deletions(-)** plus the 4 new files. No file was deleted, no test was modified, no dependency was added or removed, no `.env` was touched.

---

## 4. Firestore reads optimized

| Query | Before | After | Mechanism |
|---|---|---|---|
| `users/{uid}` | 3 concurrent listeners (AuthContext, CommerceContext, useCourseAccess) | **1** | `subscribeSharedDoc("users/{uid}")` |
| `users/{uid}/subscription/current` | 2 (useCourseAccess, useOwnedProducts) | **1** | `subscribeSharedDoc` |
| `entitlements where uid == {uid}` | 2 (useCourseAccess, useOwnedProducts) — ×2 again when guard+player co-mount | **1** | `subscribeShared` |
| `users/{uid}/purchases` | 2 (useCourseAccess, CatalogContext) | **1** | `subscribeShared` |
| `siteReviews where status == published` | 2 (CatalogContext aggregate, useProductReviews) | **1** | `subscribeShared` |
| `users/{uid}/notifications` | 2 (bell badge, bell page) | **1** | `subscribeShared` |
| Course screen total (`CourseRouteGuard` renders `CoursePlayerApp`, both call `useCourseAccess`) | **8 listeners / 4 queries** | **4 listeners / 4 queries** | ref-counting |

Additional read savings that are not listener-count: the **10 s teardown grace** means a back-and-forth navigation (PDP → player → PDP) re-uses the live listener instead of tearing it down and re-billing a full initial snapshot; and the **synchronous cached replay** means a second consumer mounting later pays **zero** reads.

The `firebase.ts` persistent IndexedDB cache (already present before this pass) is what makes the first callback on every warm open a free cached snapshot; the shared layer now amplifies it across components instead of per component.

**Not changed, and why:** `siteProducts` remains an unlimited collection listener. Bounding it needs a paginated store UI (recommendation §20.3) and would change catalog behaviour; that is out of scope for a no-rewrite pass.

## 5. Lists paginated

| List | Before | After |
|---|---|---|
| Notifications (bell page) | all items rendered | **20 per page**, "Show older notifications (N)" appends 20 |
| Continue Learning (Home) | — | already capped at 2 (`CONTINUE_LEARNING_LIMIT`), left as is |
| Store / catalog | unbounded | **unchanged** — see §19/§20; needs a server-side cursor design |
| Admin tables | unbounded `getDocs` | **unchanged** — admin-only, recommendation §20.4 |

Firestore `startAfter` cursors were **not** introduced: every list in this app is currently driven by a realtime listener whose result set is also used for aggregate counts and filter chips. Introducing cursors correctly requires the `createdAt` backfill described in §20.2. Pagination was therefore done at the render layer, where it is safe and reversible, and the server-side cursor work is written up as the top data-layer recommendation.

## 6. Lists virtualized

**None** — deliberately. The audit found no list that is *currently* large enough to justify a virtualizer: notifications (now capped at 20 rendered), the store grid (catalog-sized), the curriculum tree (module-sized), and admin tables (which are the real candidate, but are admin-only and unpaginated at the data layer — virtualizing the DOM there without fixing the `getDocs`-everything query would hide the actual bottleneck). Adding `react-window`/`react-virtual` would also violate "no heavy deps". Recommendation §20.4 covers the correct sequencing: paginate the admin query first, virtualize second, and only if measurement demands it.

## 7. Routes lazy-loaded

21 routes, all via `lazyRoute()`: `StoreApp`, `HomeApp`, `PdpApp`, `CheckoutApp`, `MyDayApp`, `LeaderboardApp`, `RevisionApp`, `ProfileApp`, `SettingsPage`, `SubscriberExperiencePage`, `ProfilePreview`, `MindMapPreview`, `GlassPreviewPage`, `CourseRouteGuard`, `CartWishlistApp`, `SubscriptionApp`, `AuthApp`, `AdminLoginApp`, `AdminApp`, `FlowPathApp`, plus `NotificationsPage`, `UserQueriesPage`, `SearchPage`, `RenewalPreviewPage`, `OpeningAnimationPreview`.

`LandingApp` is intentionally **not** lazy (default first screen — a static import gets a `modulepreload` and avoids an extra hop). Non-route heavy components lazily loaded: `MindMapPanel`, `StickerWall` (+ `matter-js`), `firebase/storage`.

## 8. Images optimized

21 `<img>` elements across 15 files: `loading="lazy"` + `decoding="async"`, with intrinsic `width`/`height` added where the layout allowed (dimension reservation → no CLS). **Hero carousel slide 1 stays `loading="eager"`** so the LCP candidate is never deferred. `srcset` was **not** added: all product/course art comes from admin-uploaded Firebase Storage URLs with no responsive derivative pipeline — generating variants is a backend change (recommendation §20.6), and a fake `srcset` over one source would be pure overhead.

## 9. Caching added

1. **Service worker asset cache** (`digital-catalyst-assets-v1`) — cache-first for content-hashed build output only, with a 200→100 entry prune on activate. Never touches `/api/*`, auth, Razorpay, Firestore or media (§2.7).
2. **Shared snapshot cache** (`src/lib/sharedSnapshot.ts`) — in-memory, per-query, stale-while-revalidate with synchronous replay and a 10 s teardown grace.
3. **Module cache** — `lazyRoute().preload()` is memoised, so hover-prefetch + navigation + idle-warm can all ask for the same chunk and only one request is made.
4. Firestore's IndexedDB persistent cache (pre-existing) is now leveraged by more of the app through (2).

## 10. Prefetching added

| Trigger | Target | Guard |
|---|---|---|
| Module evaluation (before React renders) | chunk for the URL's current hash | none needed — it is the route being opened |
| Installed mobile PWA with empty hash | `#/home` chunk | `isInstalledMobilePwa()` |
| `hashchange`, capture phase | the destination chunk, one tick before React re-renders | none |
| `requestIdleCallback` (4 s deadline) | `StoreApp` + `ProfileApp` only | `prefersReducedData()` |
| Desktop rail `pointerenter` / `focus` | that rail entry's chunk | `prefersReducedData()` |

Nothing else is speculatively fetched. No images are preloaded. On Save-Data or a 2G-class connection, **all** speculative fetching is disabled and the 5 MB opening clip is skipped too.

## 11. Rerenders reduced

Targeted, not blanket (explicit requirement — no sweeping `React.memo`):

- **Duplicate snapshot fan-out removed**: one Firestore snapshot used to drive 2–3 independent `useState` trees for `users/{uid}`, entitlements, purchases, reviews and notifications. Now one snapshot → one shared broadcast.
- **Notifications**: the mapped list is `useMemo`'d on `[activeFilter, items]`, and the *rendered* slice is a second `useMemo` on `[visibleItems, visibleCount]`, so paging in 20 more rows does not re-run the filter.
- **`useCourseAccess`** keeps its existing pure `useMemo` resolution; the shared listeners mean the second consumer's first render already has data instead of rendering a loading state and then re-rendering.
- **Route splitting** removed a whole class of re-render: unvisited route modules no longer even evaluate.
- Deliberately **not** done: memoizing every card component, `useCallback` on every handler, context splitting. The audit did not find a measured re-render hot spot that justified them, and the brief forbids blanket memoization.

## 12. Memory leaks fixed / prevented

- **Listener lifetime**: every listener routed through `sharedSnapshot` has exactly one owner; the last unsubscriber stops it after a 10 s grace, and the registry entry is deleted (no map growth). Errors do not leave zombie entries.
- **`DeferredVisible`** disconnects its `IntersectionObserver` immediately after the one-shot mount.
- **`footerGlow`** cancels its rAF and removes the listener on teardown; the loop now self-terminates at `power === 0` instead of running forever.
- **`perfMonitor`** keeps bounded counters (route samples capped at 30) and exposes `window.__eduvoraPerf.stop()` which disconnects every observer.
- **Deferred physics**: `matter-js` `Engine`/`Runner`/rAF are not created at all unless the sticker wall is scrolled to (its existing cleanup at `StickerWall.tsx:480-484` was verified correct and left alone).
- **Service worker cache growth** is now bounded (200 → prune to 100) instead of unbounded.
- No pre-existing leak was found in `SnowOverlay`, `ConnectivityContext` or `appOrientation` — all three already clean up and gate on visibility.

## 13. CSS / paint fixes

- **Scroll-driven style writes coalesced to one per frame** (`footerGlow`, §2.8).
- **`cssMinify: "lightningcss"`** — CSS is 335.13 kB raw / **52.18 kB gzip**.
- **Compositor-friendly only**: no animation was added; the ones touched animate `opacity`/`transform` or a CSS variable consumed by a paint-only property.
- **`backdrop-filter` audit** (68 occurrences): **left alone on purpose.** `src/lib/glass.ts` already tiers blur strength by device — `full` → `lite` on `hardwareConcurrency <= 4 || deviceMemory <= 3`, `flat` (zero live blur, shapes and tints preserved) on `prefers-reduced-transparency`, plus a per-screen lens budget of 12 on phones / 24 on desktop. That is a better solution than anything a blanket change could do, and the `?glass=` escape hatch already exists. Recommendation §20.5 covers the one gap (the tier is not re-evaluated after a measured frame-rate drop).
- **The Winter Wonderland background's uncancelled rAF canvas loop is a known, owner-pinned cost**: `scripts/verify-backdrop.mjs` asserts *"the snowfall loop runs continuously — no visibility / focus / reduced-motion gate"*. That is a product decision enforced by a gate, so it was not changed; it is listed as a remaining bottleneck (§19.4) with the gate-change that would be required.

## 14. Build / bundle improvements

| Metric | Before | After | Δ |
|---|---|---|---|
| Output shape | 1 file (`index.html`) | `index.html` 16.5 kB + 117 JS chunks + 1 CSS | — |
| **Critical path (gzip)** | **918.95 kB** | **429.71 kB** | **−53.2 %** |
| `dist/index.html` | 3,312,918 B | 16,524 B | −99.5 % |
| Entry JS | (inlined) | 268.12 kB / **84.17 kB gz** | — |
| `vendor-firebase` | (inlined) | 646.00 kB / **190.87 kB gz** | cacheable across deploys |
| `vendor-react` | (inlined) | 188.12 kB / **58.79 kB gz** | cacheable |
| `vendor-motion` | (inlined) | 132.58 kB / **43.71 kB gz** | cacheable |
| CSS | (inlined) | 335.13 kB / **52.18 kB gz** | parallel, cacheable |
| Deferred until visited | 0 kB | ~1.6 MB raw (`AdminApp` 281.42, `MindMapPanel` 208.16, `RevisionApp` 186.76, `CourseRouteGuard` 136.28, home `App` 103.56, `matter` 84.73, `FlowPathApp` 71.44, `PdpApp` 71.47, `MyDayApp` 64.26, `CheckoutApp` 57.04, `catalogService` 51.80, +100 more) | — |
| Build time | 9.31 s | 8.92 s | −4 % |
| Vendor cache reuse | none (any change re-downloads 919 kB) | `vendor-*` hashes are stable across app-only deploys | large repeat-visit win |

Plus **~5 MB of video removed from the cold-boot network budget** on Data-Saver/2G and on every reduced-motion boot (§2.2) — not counted in the table above because it is not a bundle artefact, but it is the largest single byte reduction in this pass.

## 15. Test results

`node --test tests/*.test.mjs` (the repo's `run_tests.sh`):

| Run | tests | pass | fail |
|---|---|---|---|
| **Baseline** (before any change, commit `6cb555c`) | 2161 | 2158 | **3** |
| Checkpoint 1 (mid-pass) | 2161 | 2156 | 5 |
| Checkpoint 2 | 2161 | 2158 | 3 |
| Checkpoint 3 | 2161 | 2157 | 4 |
| **Final (this branch)** | **2161** | **2158** | **3** |

Final = baseline, exactly. **Zero tests were modified, weakened, skipped or deleted.**

The two intermediate regressions were caused by my changes and were **fixed by changing my code, never the test**:
1. *Checkpoint 1* — `realNotificationBadgeMyDayHomeContract` + `subscriptionRenewalContract` broke because I hoisted a Firestore query into a `notificationsQuery(uid)` helper; both tests grep for the literal `collection(db, "users", user.id, "notifications")`. Fix: keep the literal inline inside `makeQuery`, share only the cache key.
2. *Checkpoint 3* — `notificationFiltersDeepLinksContract` broke because I renamed `visibleItems` to `filteredItems`; the test pins `visibleItems = useMemo(() => filterNotifications(items, activeFilter)`. Fix: restored the pinned name and named the paged slice `pagedItems`.

Typecheck `npx tsc --noEmit`: **8 errors, identical to baseline** (listed in §17). No `@ts-ignore`, no `any` widening, no config loosening was used to get there.

## 16. Build results

```
$ rm -rf dist && pnpm build
✓ 2766 modules transformed
✓ built in 8.92s          (0 errors)
```

One pre-existing esbuild **warning**, unrelated to this pass: duplicate `data-subscriber-only-price-badge` JSX attribute in `src/components/subscription/SubscriberOnlyPriceBadge.tsx:30-31` (also the TS17001 in §17).

Design-system dist gates, both now reading the split output:

```
$ node scripts/verify-backdrop.mjs
  ok   .dc-winter is a fixed, non-interactive, z -1 layer
  ok   the pen's aurora sky + night gradient survived minification
  ok   mountains, ground, frozen lake, snowman and the snow canvas all ship
  ok   no universal backdrop, no waves layer, no background preference
  ok   the snowfall loop runs continuously — no visibility/focus/reduced-motion gate
OK: the Winter Wonderland scene is the app's one background, animating without pause.

$ node scripts/glass-coverage.mjs
  oklch( in built output    0  =  0        ← the hard gate, PASSES
```

`grep -o "oklch(" dist/index.html dist/assets/*.css dist/assets/*.js | wc -l` → **0**.

`glass-coverage` also prints four soft "REGRESSIONS" against a stale recorded baseline. These were triaged, not ignored:

| Counter | Baseline | Now | Verdict |
|---|---|---|---|
| `<button>` | 128 | 144 | 143 of those exist on **unmodified `main`** (verified by `git stash -u` + re-run). **+1 is mine**: the "Show older notifications" pagination control. |
| `rounded-* bg-white panels` | 37 | 40 | 39 exist on unmodified `main`. **+1 is mine**: the same control. |
| `render-sites` (ratchet) | 691 | 607 | 607 on unmodified `main` — **unrelated to this pass** (the ratchet moved down, i.e. the recorded baseline is stale). |
| `in oklab in dist` | 292 | 301 | 301 **also** under the OLD single-file config (verified by stashing and rebuilding with `vite-plugin-singlefile`). Stale baseline, not caused by splitting. |

So: three of the four are pre-existing baseline drift; my contribution is exactly one new button in one new panel, which is the pagination control this pass deliberately added. Refreshing the recorded baseline is a maintainer decision, not something a perf pass should silently do.

**Browser smoke test could not be run in this sandbox** — no Chromium is available and `npx playwright install` cannot download one (`Executable doesn't exist at ~/.cache/ms-playwright/...`). What *was* verified at runtime: the Vite dev server boots and every touched module (`main.tsx`, `LandingApp`, `home/App`, `CoursePlayerApp`, `DesktopShell`, `lazyRoute`, `sharedSnapshot`, `DeferredVisible`, `NotificationsPage`) transforms and serves `200`. Manual on-device verification is the first item in §20.

## 17. Pre-existing failures (present on `main` before this pass; none "fixed" to game the counts)

**3 failing test files, all environment, not product:**

| File | Cause |
|---|---|
| `tests/glassSidebarExpandedByDefaultContract.test.mjs` | `Cannot find module 'esbuild/bin/esbuild'` |
| `tests/stickerWallScrollOwnershipContract.test.mjs` | same |
| `tests/useDragScrollRuntime.test.mjs` | same |

All three transpile TSX at runtime through esbuild's binary, which pnpm's non-hoisted `node_modules` layout does not expose at the path they hard-code. They fail identically on the untouched base commit. Per the brief, they were **left alone**.

**8 pre-existing typecheck errors** (unchanged):

```
src/components/StorePage.tsx(1,8)                       TS6133  'React' declared but never read
src/components/subscription/SubscriberOnlyPriceBadge.tsx(31,7) TS17001 duplicate JSX attribute
src/course/RichTextEditor.tsx(159,42)                   TS2769  no overload matches
src/course/RichTextEditor.tsx(162,47)                   TS2769  no overload matches
src/hooks/useSubscriptionGateLogic.ts(122,17)           TS6133  'k' unused
src/hooks/useSubscriptionGateLogic.ts(122,20)           TS6133  'v' unused
src/lib/admin/client.ts(436,13)                         TS6133  'productIdKey' unused
src/subscription/components/SubscriptionPage.tsx(32,1)  TS6133  unused import
```

**1 pre-existing build warning**: the duplicate JSX attribute above.

## 18. New failures introduced by this pass

**None.** Final suite = baseline (2161 / 2158 / 3), typecheck = baseline (8), build = clean, both dist gates pass their hard checks. The two regressions that appeared mid-pass were resolved by amending my own code (§15) before finishing.

## 19. Remaining bottlenecks (measured or identified, not addressed)

1. **`vendor-firebase` is 190.87 kB gzip on the critical path** — the single largest remaining first-load cost. `AuthProvider` and `CatalogProvider` sit above every route, so Firestore + Auth load even for a logged-out visitor reading the landing page. Splitting this requires deferring provider mount, which is an architecture change, not a perf tweak.
2. **`CatalogContext` subscribes to all of `siteProducts` with no limit**, and re-runs `mapProduct()` + `localeCompare` sort over the whole catalog on **every** snapshot (including cache-first ones). Fine at tens of products; O(n log n) main-thread work per write at hundreds.
3. **Admin data layer reads whole collections**: `src/lib/admin/client.ts` `getDocs` on `siteOrders`, `users`, `siteReviews`, `siteProducts` and filters in memory, feeding unpaginated tables. Admin-only, but it will be the first thing to fall over as order volume grows.
4. **The Winter background rAF never stops** — an uncancelled canvas loop in `WinterScene.tsx`, deliberately pinned by `scripts/verify-backdrop.mjs` ("no visibility / focus / reduced-motion gate"). On a low-end Android this is continuous GPU/CPU draw, including in a background tab.
5. **Notifications pagination is client-side** — the full collection still transfers; only rendering is bounded (see §20.2 for the blocker).
6. **No responsive image derivatives** — a 2000 px admin upload is downloaded in full for a 160 px card.
7. **`react-rnd` and `react-day-picker` are unused dependencies.** Left in place on purpose: they are already absent from the bundle (tree-shaken), and editing the lockfile risks the CI `npm ci --legacy-peer-deps` step in `.github/workflows/android-build.yml`. Removal is a clean-up, not a perf change.
8. **`glass-coverage`'s recorded baseline is stale** (§16) — it will keep printing false regressions until a maintainer re-records it.
9. **CI runs neither the tests nor the dist gates** — `.github/workflows/android-build.yml` only runs `npm run build` + Gradle.

## 20. Exact next recommendations (ordered by value ÷ risk)

1. **Verify on a real device before merging.** No browser was available in this sandbox. Cold-boot the branch on a mid-range Android over throttled 4G, walk Landing → Home → Store → PDP → Checkout → Course Player → Mind Map → Profile → Admin, and confirm (a) no Suspense fallback is visible on a warm cache, (b) the opening clip still plays on a normal connection and is skipped on Data Saver, (c) Firebase Auth, Razorpay checkout and the course player behave identically. Then compare Lighthouse/`?perf=1` numbers with `main`.
2. **Backfill `createdAt` on `users/{uid}/notifications`, then paginate server-side.** One admin script setting `createdAt` from the document's write time (or `serverTimestamp()` for legacy rows), after which `query(col, orderBy("createdAt","desc"), limit(20))` + `startAfter(lastDoc)` becomes safe and the client-side slice in §2.4 can be deleted. Currently blocked because `orderBy` silently drops documents missing the field. **Biggest remaining read saving.**
3. **Paginate the catalog.** `query(collection(db,"siteProducts"), where("status","==","published"), orderBy("title"), limit(24))` + `startAfter` cursor, with a "Load more"/infinite-scroll sentinel in `StorePage`. Requires moving the published filter server-side (a composite index) and reworking the aggregate counters that currently read the full array.
4. **Fix the admin data layer, then virtualize.** Replace the four `getDocs`-everything calls in `src/lib/admin/client.ts` with server-filtered, cursor-paginated queries (25–50 rows/page); only after that consider a virtualizer for the orders and users tables.
5. **Make the glass tier adaptive.** `src/lib/glass.ts` already picks a tier from static capability hints. Add a short frame-rate sample after first paint (e.g. 60 frames via rAF) and downgrade `full` → `lite` → `flat` when the device misses its budget. Cheap, self-limiting, and the storage/override plumbing already exists.
6. **Add responsive image derivatives.** Generate 320/640/1280 px WebP variants on upload (Cloud Function or the existing `api/` layer) and emit `srcset`/`sizes` on the card and hero images already touched in §2.6.
7. **Consider gating the Winter background's rAF on `document.hidden`** — a two-line change worth several percent of sustained CPU on low-end Android. It needs a product decision plus an edit to `scripts/verify-backdrop.mjs`, which currently asserts the opposite.
8. **Run the test suite and both dist gates in CI.** Add `node --test tests/*.test.mjs`, `npx tsc --noEmit`, `node scripts/verify-backdrop.mjs` and `node scripts/glass-coverage.mjs` to `.github/workflows/android-build.yml`, and re-record the `glass-coverage` baseline in the same commit so the ratchet is meaningful again.
9. **Encode a lighter opening clip.** 5 MB for a ~3 s splash is extreme; a 1080p H.264/AV1 re-encode at a sane bitrate should land at 600–900 kB, after which it could play on far more connections than the Data-Saver rule now allows.
10. **Migrate the remaining ~60 `onSnapshot` sites onto `sharedSnapshot`** as they are touched — the layer exists and is proven; each migration is a few lines. Highest-value remaining hosts: `BrandingContext`, `useHomeBanners`, `useStoreFilters`, `profile/App`, `useOwnedUpdates`.
11. **When extending anything here, remember the contract-test rule**: 188 test files grep literal source strings. Never hoist a Firestore call into a helper, and never rename a pinned identifier, without grepping `tests/` first (this cost two intermediate failures in §15).
