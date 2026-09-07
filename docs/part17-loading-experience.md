# Part 17 — Loading experience: persistent cache + skeletons + non-blocking shell

**Goal:** make every app open *feel* instant. Cold first-ever load shows
smooth skeletons; every open after that paints the last-known catalog from
the on-device cache immediately while live data refreshes silently in the
background (stale-while-revalidate), and the app shell never waits on data.

---

## A. Firestore persistent cache (stale-while-revalidate)

### What changed

**`firebase.ts`** — Firestore is now initialised with the modular SDK's
persistent IndexedDB cache:

```ts
initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
```

API verification: the installed version is **firebase 12.18.0 /
@firebase/firestore 4.17.1** (confirmed against
`node_modules/@firebase/firestore/dist/firestore/src/global_index.d.ts`).
In the modular SDK v10+ the cache is configured through the
`FirestoreSettings.localCache` field with the `persistentLocalCache()`
factory (and `persistentMultipleTabManager()` /
`persistentSingleTabManager()` for tab coordination). The old
`enableIndexedDbPersistence()` global function is a deprecated alias and is
not used. If the cache factory throws (Node, or a WebView with IndexedDB
unavailable), init falls back to `getFirestore()` / in-memory cache exactly
as before — Firestore never fails to initialise.

**`src/context/CatalogContext.tsx`** — the products listener is now
cache-aware:

- A snapshot with `snapshot.metadata.fromCache === true` that **contains
  documents** clears `loading` and paints immediately — this is the warm
  reload path, online or offline.
- An **empty** cached snapshot only happens on a genuinely cold device
  (nothing cached yet); the skeleton stays up until the live server
  snapshot arrives, instead of flashing an empty catalog.
- The live (non-`fromCache`) snapshot remains authoritative and clears
  `loading`/`error` as before.
- The **error path is unchanged in spirit**: a snapshot failure still sets
  `error` ("The live catalog could not be loaded…") and clears `loading`.
  When cached products are already on screen they stay on screen (the
  banner only appears when the screen would otherwise be blank); on a cold
  offline cache the user gets the clear, retryable error message instead
  of a stuck skeleton.

### Effect (before → after)

| Scenario | Before | After |
|---|---|---|
| **Cold load** (first ever open, no cache) | Blank/"Trending" section empty until the network round-trip finished | Shell + chrome paint instantly; product grid shows 4 dimension-matched shimmer cards; real cards swap in with zero layout shift |
| **Warm load, online** (2nd+ open) | Same full network wait before any product appeared | Products/purchases render **instantly from IndexedDB**; `onSnapshot` refreshes silently in the background |
| **Warm load, offline / airplane mode** (Capacitor WebView included) | Skeleton→error or blank catalog; the OfflineGate overlay could cover an empty app | Cached products/purchases render instantly from cache; the flag-only OfflineGate still overlays after the 8 s grace window if the radio is genuinely down, but dismissing/retrying now reveals populated screens |
| Snapshot error (rules/permission) | Error banner | Same error banner — unchanged |

### Offline-handling coexistence (audit finding)

`ConnectivityContext` (flag-only, `navigator.onLine` + 8 s grace debounce)
and `OfflineGate`/`OfflineScreen` make **no assumption about Firestore
persistence** — they never read cache state, gate fetches, or touch
Firestore settings (verified by reading all four offline files). The two
mechanisms compose rather than duplicate:

- Persistent cache decides **what data the screens underneath can show**.
- ConnectivityContext decides **whether the "You're Offline" overlay shows**,
  purely from the OS/ browser flag.

No changes were needed in either file. The splash controller
(`openingSplash.ts`) already skips the opening video when offline at boot
and hands it back on `online`; with the cache populated the app underneath
it now has content regardless of connectivity.

### Capacitor / WebView compatibility

- Android System WebView (the Capacitor target) and iOS WKWebView both
  ship IndexedDB, and the Firebase JS SDK's persistent cache is the
  supported mechanism for WebView apps; WebView storage is per-origin and
  persists across launches.
- `persistentMultipleTabManager()` is safe in WebView (there is effectively
  one tab; the manager simply coordinates if more than one Firestore
  instance attaches).
- The guarded `try/catch` around `initializeFirestore` means any WebView
  quirk (storage disabled, private/incognito-style mode that exposes no
  IndexedDB) degrades to the previous in-memory behaviour instead of
  crashing startup.
- No native plugin changes are required — this is the same web Firestore
  SDK the app already uses through Capacitor.

---

## B. Skeleton / shimmer loading states

### New primitive

**`src/components/ui/Skeleton.tsx`** — a tiny reusable shimmer block:
configurable `width` / `height` / `radius` / `label`, `role="status"` +
`aria-busy`, plain CSS (no new dependency — React + the repo's existing
`cn()` helper only).

**`src/index.css`** — a single `.dc-skeleton` class next to the existing
`@keyframes shimmer` (it reuses that keyframe — the app keeps one shimmer
vocabulary). The base tint matches the pack's glass token (~10 % white,
echoing `--dc-chrome-glass: rgba(255,255,255,0.105)`); the moving highlight
uses the same indigo family as progress fills and accent pills. Under
`prefers-reduced-motion` the sweep collapses to a static, clearly
unfinished surface (never invisible — same rule the OfflineScreen follows).

### Wired sections

1. **Home product grid** (`src/home/App.tsx`,
   `src/home/components/ProductCardSkeleton.tsx`): while
   `useCatalog().loading` is true, the "Trending Now"/category grid renders
   `ProductCardSkeleton`s in the **same**
   `grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4` container (4 cards for
   the default "Trending" tab, matching the real top-4 count). Each
   skeleton mirrors `ProductCard` exactly: same `GlassSurface` material
   (`dc-scene-plate`, radius 24, tint 0.25, blur 0), same
   `aspect-[4/3]` artwork, same `p-3` text block with the
   `min-h-[2.5rem]` two-line title reserve, author/rating/price bars.
   The `error` branch (rose banner) renders **instead of** skeletons when
   the snapshot fails — error states still surface clearly.

2. **Home "Continue Learning"**
   (`src/home/components/ContinueLearningSkeleton.tsx`): shown only for a
   signed-in learner while their `courseProgress` listener (new
   `progressLoading` flag) **or** the catalog is still loading. Mirrors the
   real cards: `h-16 w-16` rounded thumbnail, title/author bars, the
   `h-1.5` progress track, and a Resume-pill placeholder at the exact
   width. Signed-out users and learners with no progress get no section,
   same as before.

3. **Store page** (`src/components/StorePage.tsx`): the old four
   `h-72 animate-pulse` empty blocks (which did not match any real card and
   jumped to a different layout) are replaced with six horizontal
   list-card skeletons matching the store's default list layout
   (`w-36 sm:w-44` artwork + text column + price/CTA row) inside the same
   `flex flex-col gap-3 px-4 pt-4` container.

4. **My Day / task-schedule** — **audit finding: no skeleton needed.**
   `MyDayApp.tsx` is local-first: tasks, schedule, notes and reminders
   initialise synchronously from `localStorage` with seeded sample data
   (`loadFromStorage("myday_*", initial*)`). There is no fetch-gated empty
   state to cover — the lists always render content immediately, and cloud
   sync is a non-blocking background write with its own existing
   "Syncing… / Saved on this device" status line. The `useMyDayAccess`
   entitlement hook gates only the paywall, not the schedule rendering.

### Zero layout-shift verification

Layout shift is zero by construction and was checked explicitly:

- Skeletons live in the **same grid/flex containers** with the **same gap
  classes** as the real content; the Skeleton primitive never brings its
  own margin.
- Card height is fixed by the same intrinsic geometry — `aspect-[4/3]`
  artwork plus the same text-block padding and line reserves
  (`min-h-[2.5rem]` title) — so a skeleton card and a real card occupy the
  same box in every track.
- Section wrappers (`data-home-grid-loading`,
  `data-home-continue-loading`, `data-store-list-loading`) sit in the same
  document position as the real sections, so nothing above/below them
  moves on swap.
- The skeletons' rounded radii match the real artwork (full-bleed image =
  0 radius at the card's own radius-24 crop) and pill elements
  (`rounded-full`).

---

## C. Priority-ordered, non-blocking fetch sequencing

### Audit

Every top-level screen's data hooks were audited for genuine waterfalls
(a fetch gated behind another fetch it does not depend on):

- **CatalogContext** — already parallel: the `siteProducts` listener, the
  `siteReviews` aggregate listener, and the per-user `purchases` listener
  each attach in their own effect on mount; nothing waits for another.
  Left as the reference pattern.
- **Home (`src/home/App.tsx`)** — catalog, banners (`useHomeBanners`,
  Firestore doc with built-in fallback slides so the hero always has
  content), reviews (`useHomepageProductReviews`, with built-in fallback
  reviews so the rail always has content) and per-user `courseProgress`
  all attach independently on mount. No waterfall found.
- **My Day (`useMyDayAccess`)** — the feature doc, subscription doc and
  usage doc listeners all attach together and each independently calls the
  status refresh; local tasks/schedule are synchronous. No waterfall found.
- **Auth (`AuthContext`)** — session restore is a single
  `onAuthStateChanged` → one `users/{uid}` profile read; the live profile
  `onSnapshot` then keeps it fresh. This is inherent to auth (role/admin
  status genuinely comes from that profile), not an avoidable waterfall.

**No genuine fetch-waterfall beyond the already-parallel CatalogContext
pattern was found, so no sequencing changes were made** (inventing
parallelisation where no dependency exists would only add complexity).

### Shell / splash gating (item 9 + 10)

- **Opening splash** (`src/utils/openingSplash.ts`): verified it is tied
  only to the brand/clip opening sequence and connectivity — never to
  catalog/purchases/schedule data. React mounts the full page tree
  underneath it; the splash does not gate any data.
- **App shell chrome** (`Header`, `BottomNav`, desktop shell) is data-
  independent and paints immediately.
- **Installed-PWA cold start** (`src/main.tsx`): the installed mobile PWA
  previously rendered a **blank `<main>`** while `onAuthStateChanged`
  restored the session (it skips landing and rewrites the hash to
  `#/home`). It now renders the real Home shell immediately — header and
  nav chrome with skeletons in the data sections — replacing the blank
  screen. The auth restore still happens in the background and falls back
  gracefully: genuinely protected routes (`#/my-day`, `#/profile`,
  `#/course/`, `#/checkout`, `#/subscription`) keep their
  "Restoring your secure session…" spinner, and if no session exists they
  redirect to login as before. Admin users remain exempt from any
  learner-catalog gating.
- With `browserLocalPersistence` the Firebase session is already cached on
  disk, so the restore is normally a fast local resolution; the change
  simply stops the short resolution window from ever being a blank screen.

---

## Tests

- `tests/firestorePersistentCacheContract.test.mjs` — pins the firebase 12
  `localCache: persistentLocalCache(...)` wiring (import names, settings
  field, no deprecated API, fallback path) and the catalog cache-aware
  loading/error behaviour.
- `tests/skeletonLoadingContract.test.mjs` — pins the Skeleton primitive
  and its CSS/reduced-motion behaviour, the Home grid + Continue Learning
  wiring, shared grid geometry between skeleton and real grids
  (`grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4` appears on both), the
  preserved error state, the Store skeleton upgrade, and the removal of
  the blank-screen PWA gate.

All checks: `npx tsc --noEmit` (no new errors), `npm run build` ✓, full
suite `node --test tests/*.test.mjs` — 2174 pre-existing + 14 new tests,
all passing.

## Manual verification checklist

1. **Cold load** (clear site data / first install): open Home — shell
   paints at once, product grid shows shimmer cards, real cards replace
   them on the first server snapshot (the one case that still needs the
   network for first paint of data).
2. **Warm reload online**: products, purchases and continue-learning
   render instantly before the background refresh completes.
3. **Warm reload offline** (DevTools offline / airplane mode on a
   Capacitor build): reload — cached products/purchases still render; no
   blank/error state for the catalog (the OfflineGate overlay appears only
   after the 8 s grace window, as before).
4. **Layout shift**: watch the grid boundary during skeleton→content swap —
   no movement above or below the grid.
