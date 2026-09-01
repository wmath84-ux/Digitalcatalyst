# Liquid Glass Rollout Plan — website-glass (22 components) across the app

> **TL;DR (Hinglish)**
> website-glass ke **22 components** repo me **as-source install** honge (`src/components/ui/glass*`), phir **wave-by-wave** har user-facing page ka UI/UX un par migrate hoga.
> ** untouched:** sabse bottom wala **footer navigation** (`src/components/BottomNav.tsx` + `src/components/glass-dock/*`) aur pura **admin panel** (`src/admin/**`, `src/components/admin/**`).
> Har wave ke baad 3 gates: `tsc --noEmit` (baseline se new errors 0), `bash run_tests.sh` (baseline 8 failures se new failures 0), `npm run build` + live preview. Ek wave = ek commit, backout safe.

---

## 0. Status

**Decisions locked by the owner (2026-09-01):**

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | Immersive surfaces | **All in** — `#/course/:id` gets liquid glass *inside* the player too (toolbar, overlays, resource list, mind-map panel), plus `#/landing` and `#/auth` |
| D2 | Intensity | **Full iOS Liquid Glass everywhere** (strong refraction on controls, `dome` + magnification on). Consequence I take responsibility for: the perf guardrails in rule 1/3/4 of §4 stay, because the user's audience is mid-range Android — full look, capped *count* of lenses. `lite` tier stays reachable via `?glass=lite` |
| D3 | Delivery | **Wave by wave**, one commit per wave, live preview + sign-off between waves |
| D4 | `glass-dock` | **Desktop only** (macOS-style magnifying dock in `DesktopShell`). The mobile footer nav (`BottomNav` + `components/glass-dock/**`) stays frozen — D2 does not override that |

**Wave 0 — install: DONE (visual change: none).**

Landed:

- `src/components/ui/glass.tsx` — the lens engine (`Glass`, `GlassLens`, `GlassSurface`, `useGlassDark`, `refractionSupported`)
- `src/components/ui/glass-motion.ts` — `Track`, `spring`, `glide`, `easeGel/easeSoft/easeOutBack`, `overdrag`, `clamp`, `reduceMotion`
- `src/components/ui/glass-button.tsx` — capsule + icon-disc gel press
- `src/lib/utils.ts` — re-export shim for the shadcn `@/lib/utils` convention (so vendored files stay untouched)
- `components.json` — registry wired (`website-glass` → `https://websiteglass.com/r/{name}.json`) so `npx shadcn@latest add …` works from your machine
- `src/glass.css` — token scale, quality tiers, focus ring, `@supports` fallback, reduced-motion, safe-area gutter (all gated on `html[data-glass]`)
- `src/lib/glass.ts` — tier detection (`full`/`lite`/`off`), `applyGlassTier` kill switch, `strengthFor(role)`, `toGlassRgb` (brand accent → `"r,g,b"` prop), lens budget
- `scripts/verify-glass-registry.mjs` — re-fetches the 22 upstream files and diffs them against the vendored copies, with an auditable allowlist of the 4 `[digitalcatalyst]` adaptations
- `#/dev/glass-preview` (`src/GlassPreview.tsx`) — sandbox to review material, tier and per-role strength at any width

Gates at this commit: `tsc --noEmit` **7 errors = baseline**, `run_tests.sh` **1891/1899 = baseline**, `npm run build` ok, and `git diff` shows **no** change under `src/admin`, `src/components/admin`, `src/components/BottomNav.tsx`, `src/components/glass-dock`.

Remaining in the pack: **14 of 22 items vendored** (`glass-slider`, `glass-popover`, `glass-dock`, `glass-tile`, `glass-swatch`, `glass-card`, `glass-checkbox`, `glass-radio`, `glass-toggle-group`, `glass-accordion`, `glass-dropdown-menu`, `glass-select`, `glass-sheet`, `glass-command`); vendored so far: `glass` (2 files), `glass-button`, `glass-tabs`, `glass-dialog`, `glass-tooltip`, `glass-input`, plus `glass-toast` hand-ported (marked `PORTED` in the verify script). The remaining 14 stream in from the same document as the waves below, and §3 stays the contract for where each one lands.

**Wave 1 — shared primitives: DONE.** Visible change surface: My Day's three overlays (Task / Schedule / Reminders) and its delete confirm, My Day toasts, and Revision's desktop/tablet tab strip. Plus a keyboard focus ring on every app route (admin excluded, where the tier is forced `off`).

| Wrapper | Now renders | Public API | Notes |
| --- | --- | --- | --- |
| `ui/Modal.tsx` | `GlassSurface` panel + `.glass-dialog-in` | unchanged | keeps `useOverlayBox` scoping, body lock, Escape, dvh cap, safe-area padding; sheet corners come from `--glass-sheet-radius` |
| `ui/ConfirmDialog.tsx` | `GlassSurface` + `LiquidMetalButton` | + `tone` (default `danger`) | rose-on-white copy rule kept |
| `ui/MacWindowModal.tsx` | `GlassSurface` window over a blurred scrim | unchanged | 0 call-sites today; the windowed variant waves 2-5 can reach for |
| `ui/Toast.tsx` | `glass-toast`'s `GlassToastCard` | unchanged | singleton `toast.*()` + `<ToastViewport/>` now exist for call sites with no state; stack promoted z-[70] → z-[120] so a toast raised from a dialog is no longer hidden behind it |
| `ui/PageTabs.tsx` | `Tabs` / `TabsList` / `TabsTrigger` | unchanged | keeps `dc-page-tabs`, `hidden … md:block`, `data-page-tabs`, text-only labels, no lucide import — the contract test in `desktopTabletPageTabsContract` still passes; the droplet gets a light-theme wash from `glass.css` |
| `ui/LiquidMetalButton.tsx` | `GlassSurface` + the shared `Track`/`glide` gel press | unchanged + `tint`, `shape`, `danger`/`primary` tones | keeps `liquid-metal-button`, `eduvora-primary-action`, `data-liquid-tone`, forwardRef; `glass.css` removes the old opaque gradient only under `data-glass="on"` so the kill switch truly restores the previous look |
| `ui/GlassCard.tsx` | *deferred to Wave 2* | — | it has 0 call-sites today and the `glass-card` registry item had not transferred yet; see "Transfer reliability" below |

Correction to §5 as written: Wave 1's breadth is **not** "every page at once" — the app only consumes these primitives in a handful of places (My Day owns `Modal`/`ConfirmDialog`/`Toast`, Revision owns `PageTabs`, and `GlassCard`/`LiquidMetalButton`/`MacWindowModal` had zero call-sites). The breadth comes from Waves 2-5, where the per-page markup moves onto these components. Nothing about the wave order changes, but expect the visible diff to be local until Wave 2.

**Wave 2 — global chrome: DONE.** The chrome a learner touches on every single route now runs on the pack: the site header's action row, the desktop rail and top bar, the store search capsule. `glass-tooltip` and `glass-input` were vendored for it (14 of 22 items left).

| Surface | Now renders | Frozen anchors kept | Notes |
| --- | --- | --- | --- |
| `components/Header.tsx` action row | one `HeaderIconButton` per action = `GlassSurface` disc (tint 0.6–0.62, `radius 999`, `pointer-events-none absolute inset-0`) under the glyph + `glass-tooltip` chip | `data-site-header`, `sticky top-0`, `bg-white/75`, `backdrop-blur-xl`, `mobile-header-glow`, live `useUnreadNotificationCount`, badges | native `title=` is gone: the chip is keyboard-reachable now (trigger focus → chip opens). Each call site writes its `aria-label` as a **literal** because `subscriptionDowngradeGuard` greps for `aria-label="Help & FAQ"` |
| `DesktopShell.tsx` left rail | active row gains a `GlassSurface` droplet over the existing indigo identity | `data-desktop-rail`, `data-desktop-rail-item`, `data-active`, `aria-current`, `title={entry.description}` | deliberately **one lens per rail, on the selected row only** — eight refracting rows inside a sticky rail is the perf trap §4 forbids, and the row already prints its own description, so a tooltip there would repeat it (and clip against the rail's `overflow-y-auto`) |
| `DesktopShell.tsx` top-bar search | `glass-input` capsule (`tint 0.55`, `radius 14`, icon slot) | `data-desktop-search`, `data-desktop-topbar-row`, title-before-actions order, Enter submits | Escape now clears; the clear chip stays an absolutely positioned sibling (the pack item has no slot for it) and `.dc-glass-input` reserves `padding-right` for it |
| `DesktopShell.tsx` top-bar actions | same disc + tooltip treatment as the header | `data-desktop-topbar-button={ariaLabel.toLowerCase()}`, `aria-label`, badge `99+` cap, `hover:bg-slate-100` | old hover/active classes stay, so `data-glass="off"` is pixel-familiar |
| `DesktopShell.tsx` quick-stats card | `GlassSurface` panel, both CTAs are `LiquidMetalButton` (`primary` / `silver`) | `data-desktop-rail`, the four `RailStat`s, the two hashes | the button fixes its capsule at 44 px; the 11 px labels ride in a child span so the surface's `text-sm` doesn't win |
| `components/SearchBar.tsx` (store) | `GlassSurface` lens instead of the hand-painted `bg-white/60 border-white/70 shadow-lg` pill | `data-store-search-trigger`, `role="button"`, `tabIndex={0}`, Enter/Space, `readOnly` + `onFocus` → `#/search?q=`, clear button, "Tap to search" chip, default export + its 4 props | the sort control is a native `<select>` and stays one until `glass-select` lands in Wave 3 |
| ⌘K / Ctrl+K | focuses + pre-selects the real top-bar field | — | `glass-command`'s palette is not vendored yet, so Wave 2 ships the shortcut against the input instead of a half-wired palette; it steps aside inside inputs/textareas/contenteditable and is inert under `data-glass="off"`. Wave 3 re-points it at the palette |

Two §5 items are **closed as "no change by design"**, not silently dropped:

* **`AppShell` frame.** `[data-app-frame]` is the scroll container every phone/tablet page paints inside, and §4's rule is frost for scrolling content, real lens for controls. A lens around a scrolling column refracts the entire feed at 60 Hz for zero information, so the frame keeps its current shadow. It stays CSS-only reachable if you want a rim later.
* **`glass-dock` for the desktop rail.** `DesktopPeekDock` already implements that interaction on this repo's own `GlassMaterial`, and it is inside the frozen footer-nav set (§0 D4) — so Wave 2 does not introduce a second dock or edit that directory.

Light-chrome contrast rule learned this wave: the pack assumes dark surfaces (`text-white` on the input, a white focus ring, white label on the tooltip). None of that is patched in the vendored files; it is re-inked in `src/glass.css` under `.dc-glass-input` / `.dc-chrome-disc`, all inside `html[data-glass="on"]`, so the kill switch restores the published material byte-for-byte. The rim override needs `div[aria-hidden]:nth-of-type(4)` because `GlassSurface` stacks backdrop → tint → sheen → rim → content, and the focus glow needs `!important` because the vendored layer carries an inline `box-shadow`.

Gate at this commit: `tsc` **7 errors** (= baseline), `run_tests.sh` **1916 pass / 8 fail** (the same 8 baseline names, +15 new Wave-2 tests), `npm run build` ok, `git diff` over `BottomNav`/`glass-dock`/`src/admin`/`src/components/admin`/`src/home` **empty**, dev server transforms all six touched modules with 0 errors.

---

**Transfer reliability (learned the hard way, Wave 1):** `fetch_page` on `https://websiteglass.com/r/<item>.json` **mangles JSX** — the markdown conversion eats `<Component …>` / `</Component>` pairs, which silently corrupts a `.tsx` source (the surviving text still parses as prose, so it is easy to miss). Everything after Wave 0 therefore comes from `llms-full.txt` (fetched as plain text → code fences survive byte-for-byte; add a query string like `?v=8` to dodge the fetch cache). `scripts/verify-glass-registry.mjs` is the backstop: run it where egress exists and any mangled or drifted vendored file shows up as a diff.

Upstream adaptations needed so far (all recorded in `LOCAL_ADAPTATIONS` in the verify script): React 19 `JSX` namespace (`as?: ElementType`, `const El = Tag as "div"`), `useRef<HTMLDivElement>`, and exposing upstream's write-only `Track.lastValue` as `previous()` for `noUnusedLocals`. No engine behaviour was changed.


---

## 1. Research findings — website-glass (source of truth)

Researched from `https://websiteglass.com/docs`, `/docs/components/glass`, `/llms.txt`, `/llms-full.txt` and the live registry item `https://websiteglass.com/r/glass.json`.

| Fact | Detail |
| --- | --- |
| What it is | Apple **Liquid Glass** component family for React, distributed as a **shadcn registry** (source you own, not an npm package) |
| Components | 22 registry items: `glass` (base) + 21 |
| Engine | per-lens **canvas-generated displacement map** (PNG, R/G = normalised X/Y bend, cached, LRU 80 entries) fed into an **SVG `feDisplacementMap`** used as **`backdrop-filter`** → the real DOM behind the lens is physically bent; text stays selectable, links stay clickable |
| Browser support | `backdrop-filter: url()` is **Chromium-only**. Safari / Firefox auto-fall back to a **frosted blur** (`GlassSurface` renders identically everywhere) |
| Runtime deps | **zero** (only `clsx` + `tailwind-merge` via `cn`) |
| Requirements | React 18 **or 19**, **Tailwind v4**, standard shadcn `cn` at `@/lib/utils` |
| Install | `npx shadcn@latest add https://websiteglass.com/r/<name>.json` — each item pulls `glass` automatically. `glass` installs **two** files: `ui/glass.tsx` (engine + `Glass` / `GlassLens` / `GlassSurface`) and `ui/glass-motion.ts` (spring/gel/rubber-band primitives shared by all others) |
| Exports (base) | `Glass` (refracting rounded box), `GlassLens` (free-floating lens, fixed px size, default circular), `GlassSurface` (frost panel, no displacement, `specular` rim + corner sheen, imperative `setTintLift()`), plus `useGlassDark`, `useHydrated`, `refractionSupported` |
| Base props | `strength` 0–1 (default 0.5), `blur` (4px), `tint` (derived from strength), `tintColor` as `"r,g,b"`, `dome` (0), `radius` (24), `lens` (ReactNode), `className` / `contentClassName`, `as` |
| Theme awareness | reads `html.dark` / `html.light` / `data-theme` + `prefers-color-scheme` via `useSyncExternalStore` — **works with our BrandingContext if we mirror the class/attr on `<html>`** |

### Constraints found while probing the sandbox (important, not a blocker)

- `components.json` does **not** exist in the repo → the shadcn CLI is not wired here.
- **Bash has no egress to `websiteglass.com`** (TLS handshake blocked; only npm/GitHub/pypi hosts are reachable — I verified `npm ping` = PONG, `api.github.com` = 200, while `curl https://websiteglass.com/...` = exit 35, and `TresChar/website-glass` on GitHub is not publicly cloneable).
- ⇒ `npx shadcn@latest add <url>` **cannot be run from this sandbox**. Instead I pull the registry source with the fetch tool (one document, `llms-full.txt`, contains **every component's full source**, 17 chunks) and write the files into `src/components/ui/`. Net result is identical source; the only cost is that it lands in **several turns** instead of one CLI call.
- Fidelity guard: I will add `scripts/verify-glass-registry.mjs` which (when run on your machine / CI, where egress works) re-fetches the 22 registry JSONs and diffs them against the vendored files, so a transcription slip is impossible to miss.

---

## 2. Research findings — this repo

| Area | Finding |
| --- | --- |
| Stack | Vite + React 19.2 + **Tailwind v4** (`@import "tailwindcss"`) + Framer Motion + lucide + three/drei + `@xyflow/react`; Firebase Auth/Firestore; Capacitor Android shell; Vercel edge API in `api/` |
| Routing | **no react-router.** Hash router hand-rolled in `src/main.tsx` (1233 lines) — 20 routes, `Root()` → `RootPage()`, chrome decided by `AppShell` (`useResponsiveCategory()`: phone / tablet-portrait / desktop-shell at ≥960px or tablet-landscape) |
| `@/` alias | present in `vite.config.ts` **and** `tsconfig.json` paths |
| `cn` | lives at **`src/utils/cn.ts`**, *not* `@/lib/utils` → the registry files need a one-line shim |
| Existing "glass" work | `src/components/ui/` already holds `GlassCard`, `LiquidMetalButton` (+`.css`), `MacWindowModal`, `TrafficLights`, `HoldRing`, `ConfirmDialog`, `Modal`, `Toast`, `PageTabs`, `overlayBounds` — and `src/components/glass-dock/` (`GlassDock`, `DesktopPeekDock`, `GlassMaterial.tsx`) which is a **hand-rolled re-implementation of websiteglass's lens maths** (same `buildLensMap`/`refractionSupported` idea, constants `radius 20 · strength 0.28 · frost 0.3`) — used by the **bottom footer nav we must not touch** |
| Dead code to reclaim | `GlassCard`, `LiquidMetalButton`, `MacWindowModal`, `TrafficLights` are currently **imported by 0 pages** → perfect swap points: page code keeps its imports, internals become the official components |
| UI surface size (non-admin) | **424** `<button>`, **71** `<input>`, **13** `<select>`, **9** `<textarea>`, **16** `fixed inset-0` overlays in `components/`, **~600** `rounded-xl/2xl/3xl` class sites, **~120** `backdrop-blur` sites |
| Verification gates available | `bash run_tests.sh` = **1899 contract tests** (source-scanning + logic) in ~13 s; `npx tsc -p tsconfig.json --noEmit`; `npm run build` |
| ⚠️ Baseline is **not clean** | 7 pre-existing `tsc` errors and **8** pre-existing test failures (1891/1899 pass) → recorded in `docs/baselines/liquid-glass-baseline.txt`; the rule is "**zero new** errors/failures", not "zero" |
| Mobile hard rules to respect | portrait lock everywhere except course player (`disablePageZoom`, `initOrientationLock`), `disablePageZoom`, service worker + notification deep links, safe-area insets in `index.css`, one scroll container per breakpoint band |
| CSS strategy risk | `src/index.css` is **6032 lines** of hand-tuned breakpoints/utilities ⇒ new glass styling goes in a **separate `src/glass.css`** using `:where()`/low-specificity + CSS vars, layered *after* Tailwind, so it can't fight existing rules and can be switched off |

### Route inventory (what "har page" means, concretely)

| # | Route | Entry | In scope |
| --- | --- | --- | --- |
| 1 | `#/landing` | `LandingApp` | ✅ (marketing page, no AppShell — decision D1) |
| 2 | `#/home` | `src/home/App.tsx` | ✅ |
| 3 | `#/auth` | `AuthApp` | ✅ (decision D1) |
| 4 | `#/store`, `#/store/purchases` | `src/App.tsx` (`StoreApp`) | ✅ |
| 5 | `#/product/:id` | `PdpApp` (956 lines) | ✅ |
| 6 | `#/checkout` | `components/checkout/CheckoutApp` (+ `PaymentGateway`, `CheckoutReviewStep` 981 l.) | ✅ |
| 7 | `#/cart`, `#/favorites` | `CartWishlistApp` | ✅ |
| 8 | `#/subscription` | `SubscriptionPage` (1344 l.) + `PremiumGate`, `RenewalPreviewPage` | ✅ |
| 9 | `#/my-day` | `MyDayApp` (770 l.) + `QuickNotes`, `MyDayAllowanceCard` | ✅ |
| 10 | `#/flowpath` | `FlowPathApp` + `FlowPathView` (830 l.), `CreateModal`, `ActivityEditor`, `LecturePicker` | ✅ |
| 11 | `#/revision` | `RevisionApp` + **41 files** (`TestPlayerPage`, `RevisionBankPage`, `AiGeneratePage` 1025 l.) | ✅ |
| 12 | `#/course/:id` | `CoursePlayerApp` (1378 l.) + `MindMapPanel` (2279 l.), `ResourceViewer`, `CourseOverlay` | ⚠️ decision D1 (immersive full-screen) |
| 13 | `#/profile` + `#/profile/subscriber-experience` | `profile/App`, `ProfileLayout` (813 l.) | ✅ |
| 14 | `#/settings` | `SettingsPage` | ✅ |
| 15 | `#/notifications` | `NotificationsPage` | ✅ |
| 16 | `#/search` | `SearchPage` (390 l.) | ✅ |
| 17 | `#/leaderboard` | `LeaderboardApp` | ✅ |
| 18 | `#/dev/*` (3 preview routes) | `RenewalPreviewPage`, `ProfilePreview`, `MindMapPreview` | ✅ (cheap, and they are our visual test bed) |
| — | `#/admin`, `#/admin-login` | `src/admin/**` (21 files), `src/components/admin/**`, `src/lib/admin/**` | ❌ **explicitly excluded** |
| — | bottom footer nav | `components/BottomNav.tsx`, `cartWishlist/components/BottomNav.tsx`, `revision/components/BottomNav.tsx`, `components/glass-dock/**` | ❌ **frozen — no edits, no style changes** |

---

## 3. Component → surface map (all 22)

| Component | Used for, in our app |
| --- | --- |
| `glass` | Foundation: `GlassSurface` for all floating UI, `Glass` for hero/feature panels over imagery (PDP banner, home hero, subscription hero), `GlassLens` for slider/switch thumbs. Also the single place where `tintColor`/`strength` come from **branding** (`useGlassTokens()`) |
| `glass-button` | 424 buttons → migrated by **wrapper, not by hand**: `LiquidMetalButton` becomes an adapter that re-exports `GlassButton` (capsule + gel press) and gains `variant: primary / secondary / ghost / danger / purchase`. Priority call-sites: header actions, PDP "Add to cart / Buy", checkout "Pay", subscription CTA, modal confirm/cancel, revision test controls |
| `glass-switch` | Settings prefs, notification filters, auto-renew, course autoplay/loop, revision options, My-Day schedule toggles |
| `glass-slider` | Course player seek + volume + playback speed, My-Day allowance, revision timer, reader font size |
| `glass-tabs` | Replaces `PageTabs` internals (desktop/tablet tab strip with spring indicator) + PDP sections (Overview/Curriculum/Reviews), subscription cycle, profile sub-tabs |
| `glass-tooltip` | Every icon-only button: header (search/bell/cart/crown/help), desktop rail, course-player toolbar, revision toolbar. Replaces raw `title=""` attributes on those 40-ish controls |
| `glass-input` | Header search, `#/search`, auth email/password, coupon field, profile edit, revision/note search. `SearchBar.tsx` becomes a wrapper |
| `glass-popover` | Sort/filter menus, row "⋯" menus, notification quick actions, My-Day add-item menu, cart summary details |
| `glass-dialog` | Replaces `ui/Modal`, `ui/ConfirmDialog`, `course/ConfirmDeleteDialog`, `MacWindowModal` internals → `glass-dialog` (scales into place) while **keeping the `overlayBounds` + safe-area logic** our `Modal` already implements (desktop dialog constrained inside the content column, phone = bottom sheet). This is the single biggest visual win: 16 overlay call sites |
| `glass-dock` | **Only** for a *desktop* peek dock (mouse-hover magnification launcher in `DesktopShell`). The mobile bottom footer nav keeps its current `GlassDock` — decision D4 |
| `glass-tile` | Grids that scale: revision question-bank / topic grid, My-Day calendar day cells, store category tiles, mind-map colour palette. `realRefraction` **off** for lists > 24 items (perf) |
| `glass-swatch` | QuickNotes note colours, revision card colour, highlighter palette, settings theme accent picker (non-admin half of branding) |
| `glass-card` | `ProductCard`, home rails, `MyDayAllowanceCard`, `AiQuotaCard`, plan cards, profile stat cards, revision summary cards. `ui/GlassCard` becomes the wrapper (0 call-sites today, so risk-free) |
| `glass-checkbox` | Cart line selection, checkout terms, revision topic multi-select, notifications "select all", My-Day bulk actions |
| `glass-radio` | Checkout payment method & plan cycle & seat count, revision difficulty/class picker, settings notification mode |
| `glass-toggle-group` | Segmented controls: cart ⇄ favourites, store category, sort order, revision mode (Study/Quiz/Flashcards), subscription monthly/annual, PDP mobile sections |
| `glass-accordion` | PDP FAQ + curriculum modules, subscription FAQ, checkout order-summary details, `ResourceViewer` file list, profile subscriber-experience panels |
| `glass-dropdown-menu` | Header avatar menu, product-card menu, notification row menu, My-Day item menu, revision bank menu (keyboard nav + portalled, so it escapes `overflow-hidden` parents — fixes a real bug class we've had) |
| `glass-select` | The 13 non-admin `<select>`s: playback speed, class/subject, sort, language, coupon type |
| `glass-sheet` | Mobile bottom sheets: filters, sort, `PdpPurchaseBuilder`, `PaymentGateway`, notifications prefs, flowpath `ActivityEditor` drawer, resource viewer drawer |
| `glass-toast` | Replaces `ui/Toast` internals. It is a **singleton + portaled viewport** while ours is prop-drilled (`toasts` / `onRemove`) → I add `src/utils/toastBus.ts` (tiny emitter) so existing call-sites keep working and `Toast.tsx` renders `glass-toast` internally. SFX + success/error wording unchanged |
| `glass-command` | New `⌘K` palette mounted once in `DesktopShell`: route jumps, product search (uses the existing catalog context), quick actions (open My-Day, add note, toggle theme). Complements `#/search`, doesn't replace it |

---

## 4. Design tokens & rules (so it looks *designed*, not *skinned*)

```css
/* src/glass.css — loaded after tailwind, all rules under :where([data-glass="on"]) */
:root {
  --glass-accent: 56 189 248;      /* overridden at runtime from BrandingContext */
  --glass-tint-light: 255 255 255;
  --glass-tint-dark: 15 23 42;
  --glass-radius-xl: 24px;  --glass-radius-lg: 20px;  --glass-radius-md: 14px;
  --glass-strength-chrome: 0.5;   /* header, dock, dialog, command */
  --glass-strength-control: 0.32; /* button, switch, slider, tabs, tile */
  --glass-strength-panel: 0.22;   /* cards on imagery */
}
```

Rules I will apply consistently (they're also what keeps mobile fast):

1. **Frost for content, refraction for controls.** Anything in a scrolling list (cards, tiles) uses `GlassSurface` (cheap, identical on all browsers); anything the user *touches* (button, switch, slider thumb, tabs pill, dock, dialog, menu, command) uses the real lens. This mirrors Apple: sheets are frosted, pills are lenses.
2. **Never rely on bending for affordance** — Safari/Firefox fall back to blur, so state must read from tint/ring/scale too.
3. **One lens budget per screen:** ≤ 12 active refracting lenses at once on phones (enforced in `GlassRoot` by count + `useId` registry); over budget → auto-degrade to frost. `prefers-reduced-motion` → springs become 120 ms fades, magnification off.
4. **Low-end Android guard:** `navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 3` → `strength * 0.5`, dock magnification off. Capacitor WebView is Chromium so it *can* do refraction; this decides whether it *should*.
5. **Tint follows branding, theme follows `html.dark`.** Components read `prefers-color-scheme`/`.dark`/`data-theme`, so `BrandingContext` writes `data-theme` on `<html>` and we get correct light/dark glass with no per-component wiring.
6. **A11y floor:** real `<button>`/`<input>` semantics preserved, `focus-visible` ring on every lens control, 44 px min target on mobile, dialog/menu focus trap + `Esc`, labels kept for switch/slider/select (voiceover), contrast of label-on-tint re-checked (the current `Toast` error style comment shows we care about "red box with nothing readable").
7. **Kill switch:** `data-glass="off"` on `<html>` (persisted, and settable via `localStorage`/branding) → all glass rules no-op, old look returns. Zero-risk rollback in production without a redeploy.

---

## 5. Waves (each = 1 commit, independently shippable & revertable)

| Wave | Scope | Files touched | Gate |
| --- | --- | --- | --- |
| **0. Install** | 22 registry items vendored to `src/components/ui/` (`glass.tsx`, `glass-motion.ts`, `glass-button.tsx`, …); `src/lib/utils.ts` shim; `components.json` so **you** can run the CLI later; `scripts/verify-glass-registry.mjs`; `src/glass.css` tokens + `GlassRoot` + kill switch. **No visual change yet** | ~26 new, 2 edited | tsc/build/tests == baseline |
| **1. Primitives in place** | Swap internals behind existing APIs: `Modal`→`glass-dialog`(+`overlayBounds`), `ConfirmDialog`, `MacWindowModal`, `Toast`→`glass-toast`(+`toastBus`), `PageTabs`→`glass-tabs`, `GlassCard`→`glass-card`, `LiquidMetalButton`→`glass-button`. Zero page edits, but every page changes at once | 7 wrappers | same + preview check on 5 routes |
| **2. Global chrome** ✅ | `Header`, `DesktopShell` (rail, top bar, tooltips, `⌘K` → real search, see §0), `SearchBar`; `AppShell` frame + `glass-dock` **deliberately unchanged** (see §0 Wave 2); **`BottomNav` untouched** | 4 edited, 2 vendored | same + hover/keyboard pass |
| **3. Commerce** | `#/home`, `#/store`, `#/product/:id` (tabs, accordion, cards, radio, select, sheet), `#/cart`+`#/favorites` (checkbox, toggle group), `#/checkout` (radio, input, coupon, dialog, sheet, buttons) | ~45 | same + full purchase-flow click-through (mock) |
| **4. Learning** | `#/my-day` (dialog, tile, switch, slider), `#/flowpath` (sheet, popover, dialog, dock decision), `#/revision` (tile grids, sliders, swatch, segmented, dialog) | ~60 | same + offline/empty states |
| **5. Player & account** | `#/course/:id` toolbar/overlays (per D1), `#/profile`, `#/settings`, `#/notifications`, `#/search`, `#/leaderboard`, `#/subscription`, `#/auth`, `#/landing`, `#/dev/*` | ~55 | same + portrait-lock regression check |
| **6. Polish** | Perf profile (lens count, paint, jank on long lists), Safari/Firefox fallback screenshots, dark mode, `prefers-reduced-motion`, a11y audit, delete now-dead `GlassMaterial` duplication (except footer nav), update `README` + `docs/`, open PR | — | full gate + PR |

Estimated effort: **Wave 0–1 in the next 1–2 turns** (that is where the source transfer cost is), then **one wave per turn** after your preview sign-off. ~6–8 turns total, ~180 files touched, ~3 200 line diff.

---

## 6. Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| GPU cost of many lenses on low-end Android (this is a student app, mid-range devices dominate) | jank on scroll | rule 1 (frost for content), lens budget, auto-degrade, verify with 60-frame scroll profile before merge |
| 162 contract-test files assert markup | false failures / temptation to weaken tests | treat tests as spec: adapt to the **documented APIs** of `ui/*` wrappers, never edit assertions to pass; new `tests/liquidGlassContract.test.mjs` locks the invariants (footer nav untouched, admin untouched, kill switch present) |
| Source transferred through the agent, not the CLI | transcription drift | `verify-glass-registry.mjs` diff vs live registry in your env/CI; vendored files keep the original header comment naming the item id |
| `index.css` (6 032 l.) cascade conflicts | subtle breakage at 640/768/960 bands | all new rules in `src/glass.css`, `:where()` specificity, one breakpoint audit per wave; visual pass at 360/480/768/1024/1440 |
| `use client` + `@/lib/utils` (Next-isms) in vendored files | build noise | keep `'use client'` (harmless, matches existing files in repo) and add the `@/lib/utils` shim instead of editing 22 files |
| Admin excluded but shares `ui/*` primitives | admin visuals change via Wave 1 wrappers | wrappers get a `data-glass` opt-out: `AdminApp` mounts `GlassRoot enabled={false}` → admin keeps today's look **byte-identical**, still zero edits in `src/admin/**` |
| Footer nav is already a bespoke dock | accidental "improvement" | `git diff --stat` guard in the wave script + contract test asserting those files are unmodified |
| 7 pre-existing tsc errors / 8 test failures | can't claim "all green" | baseline recorded; gate = no **new** failures; (optional Wave 6 side-quest: fix them, separate commit) |

---

## 7. Decisions (locked — see §0)

D1 all-in (course player included) · D2 full iOS intensity with a capped lens *count* ·
D3 wave-by-wave with preview sign-off · D4 `glass-dock` on desktop only. |

---

## 8. Verification protocol (every wave, in this order)

```bash
npx tsc -p tsconfig.json --noEmit            # vs docs/baselines/liquid-glass-baseline.txt
bash run_tests.sh 2>&1 | grep -E "^not ok"   # must equal the 8 baseline lines
npm run build                                 # vite build, no new warnings
git diff --stat -- src/components/BottomNav.tsx src/components/glass-dock 'src/admin' 'src/components/admin'   # must print nothing
```

…plus `npm run dev` on `0.0.0.0` for the live preview, eyeballed at **360, 480, 768, 1024, 1440** widths, light + dark, and one real checkout/flow click-through (mock).
