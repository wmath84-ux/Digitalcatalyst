# Native marketplace, overlays and desktop Leaderboard

## Scope

- Store: branded catalog discovery, local search, authoritative admin chips and
  mouse/pen scrolling, genuine sorts, grid/list/mixed layouts, native filter
  dialog, and honest loading/error/empty states. Store-specific cards retain
  navigation, favorites, cart, ownership, real review evidence, MRP, reductions,
  paise values and numeric ₹0. Legacy free records now retain their configured
  original amount; a missing MRP is not invented.
- PDP module picker: named modules, individual regular/sale prices, selected
  estimate, prerequisites, ownership, no-double-charge rules, search and native
  checkboxes. The canonical parent selection and verified checkout remain the
  authority. Legacy width/presentation overrides no longer distort the dialog.
- My Study Library: native course editor and delete confirmations. Nested trees,
  all 14 resource types, Brain/manual/bulk question authoring, HTML experiments,
  file/cover upload, limits, save and Save & play stay on the existing controllers
  and player adapter. A pending optimistic deletion cannot unmount the editor's
  confirmation; failures retain retry. Fresh courses and load errors are honest.
- Leaderboard: single desktop header/tab clearance, reachable top and first row,
  authentic data/cache/refresh/error recovery, real code availability, used-ID
  styling, subscription referral rules and honest clipboard failures. Desktop
  titles and the authoring rail family now reflect the current route.
- Shared native dialog: bounded body/footer, proper title/description linkage,
  focus trap, Escape/backdrop/close, busy guard, scroll lock and opener/fallback
  focus return.

No backend payment, coupon, entitlement, subscription duration, resource-access
or course-storage authority was replaced. No courses/reviews/rankings were
fabricated for the production page. Glass helpers remain available for their
other consumers; only superseded presentation assertions were migrated.

## Executed validation

| Check | Result |
| --- | --- |
| Focused commerce/content/presentation tests, 66 files | **891 passed**, 0 failed, 0 skipped |
| Browser + responsive UI regression suite, 7 files | **91 passed**, 0 failed, 0 skipped |
| `NODE_OPTIONS=--max-old-space-size=3072 npm run build` | Passed, **48.41s** |
| Whole-repository TypeScript against untouched published HEAD | Baseline **37**, current **37**, **0 new diagnostics** |
| `git diff --check` | Passed |

TypeScript baseline: `62a4c2508ed3f55fedc5c631e34f1b0703620617`, extracted via
`git archive` without switching branches or resetting the working tree.
Diagnostic comparison ignores only source line/column shifts, not error content.
The repository is **not** claimed to be globally TypeScript-clean.

Browser coverage includes 320–1920px, tablet portrait, physical-tablet short
landscape, actual AppShell/header scrollers, optional tab clearance,
scroll-return-to-top, keyboard trap/Escape/focus return, real-price/free/MRP
states, all Store layouts and filter reset, module ownership/dependencies,
authoring hierarchy, Brain import, sandboxed templates, uploads, save failure,
delete rollback/retry and synchronous duplicate-write protection. The prior
Home, PDP, account, Subscription, checkout and Library regressions were rerun.

### Browser replay

Use an installed Chromium, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The
harness mounts production components and global CSS; only external I/O boundaries
are replaced with deterministic test data. The authoring controller, editor,
parser, validators and helper factories are production code.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium \
node --test --test-concurrency=1 \
  tests/marketplaceOverlaysMinimalBrowser.test.mjs \
  tests/homeMobileLayoutBrowser.test.mjs \
  tests/accountPagesMinimalBrowser.test.mjs \
  tests/minimalPagesBrowser.test.mjs \
  tests/pdpPurchaseBuilderMobileWidths.test.mjs \
  tests/subscriptionCheckoutLibraryMinimalBrowser.test.mjs \
  tests/collectionCardsBrowser.test.mjs
```

New fast render/mapping regressions:

```sh
node --test tests/storeMarketplaceCardPresentation.test.mjs \
  tests/catalogStoreFreePricePresentation.test.mjs
```

Live bank/Razorpay payments and production Firebase writes were **not** performed.
Temporary logs, screenshots, browser dependencies, archive and build artifacts
are ignored and are not part of the patch.
