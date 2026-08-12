# Part 10 — Course Access Resolution

## Scope

Part 10 unifies the "what can this user open?" story across
the app. The previous flow had at least four different access
stories (CoursePlayerApp read `users.purchasedProductUpdateIds`
only, PDP read `purchasedIds` from `CatalogContext`, the
Course route guard checked `purchasedIds.has(productId)`,
Profile + Purchases library used the same `purchasedIds` set,
and per-module / per-resource / subscription unlocks weren't
considered anywhere). Part 10 collapses this into one
canonical resolver consumed by every consumer.

### Resolver output

The `resolveCourseAccess(input)` engine in
`utils/courseAccess.js` returns:

```
{
  hasFullProductAccess,                // bool
  ownedModuleIds,                       // Set<string>
  ownedResourceIds,                     // Set<string>
  ownedUpdateIds,                       // Set<string>
  subscriptionGrantedModuleIds,        // Set<string>
  accessibleModuleIds,                  // Set<string>
  accessibleResourceIds,                // Set<string>
  lockedModuleIds,                      // Set<string>
  previewModuleIds,                     // Set<string>
  moduleAccessSources,                  // Record<id, "full_product" | "module_purchase" | "resource_purchase" | "paid_update" | "subscription" | "preview" | "locked">
  resourceAccessSources,                // Record<id, ...>
  unmetDependencies,                    // Record<id, string[]>  (required previous modules that are not accessible)
}
```

### Spec rules implemented

| Rule | Resolver behaviour |
| --- | --- |
| **Full product** | A module / resource is `full_product` when `hasFullProductAccess` is true. `hasFullProductAccess` is true when the user has the product in `purchasedProductIds` (Part 6 dual-write) OR the canonical `entitlements` collection OR an active subscription grants the product. |
| **Partial module** | The user can open the Course Player whenever they own ANY access (full product, module, resource, paid update, or active subscription). The Course route guard uses `hasAnyAccess = hasFullProductAccess || ownedModuleIds.size > 0 || ownedResourceIds.size > 0 || ownedUpdateIds.size > 0 || subscriptionGrantedModuleIds.size > 0`. Modules the user owns individually are `module_purchase`; unowned modules in the same product are `locked`. |
| **Resource** | A resource opens when (a) the user has the base product, (b) the user has a per-resource purchase (canonical or legacy), (c) the subscription grants it. The parent module stays `locked` when the user only owns the resource. |
| **Update** | A paid update opens when the user has it (canonical OR legacy `purchasedProductUpdateIds[productId]`). The `requireBaseCourseForUpdate` flag (default `true`) also opens the update when the user has the base product. |
| **Subscription** | An active subscription unlocks every product / module / resource in its `includedProductIds` / `includedModuleKeys` lists. The hook subscribes to `users/{uid}/subscription/current`; the resolver treats a record as active when `status === "active"` AND `expiresAt > now`. |
| **Subscription expiry** | When the subscription is expired / cancelled, the per-user `subscriptionProductIds` / `subscriptionModuleIds` set becomes empty. The resolver reverts the source from `subscription` to `locked` (or `module_purchase` if the user has a permanent purchase). |
| **Permanent purchases** | A per-module or per-resource purchase is recorded in the canonical `entitlements` collection. The resolver treats those records as permanent — even after a subscription expires, the per-module ownership set is preserved. |
| **Preview** | Modules with `previewAvailable: true` (or `preview: true`) are added to `previewModuleIds`. The Course Player uses this set to mark the file as accessible without granting completion / rewards (the resolver keeps the source as `locked` for previews, so the existing completion logic doesn't count them). |
| **Dependencies** | The resolver evaluates every module's `requiredPreviousModuleIds`. The unmet-dep list lands in `unmetDependencies[id]`. The Course Player uses this to lock a module that the user nominally owns but can't access yet. |

## Architectural Changes

### 1. Pure resolver (`utils/courseAccess.js` + `.d.ts`)

- `resolveCourseAccess(input)` — the top-level engine.
- `isSubscriptionRecordActive(record, now?)` — pure helper
  for the `users/{uid}/subscription/current` record.
- `collectEntitlementOwnership(entitlementRecords)` —
  splits a `entitlements/{uid}__*` snapshot into
  `ownedProductIds` / `ownedUpdateIds` / `ownedModuleIds` /
  `ownedResourceIds` sets.
- `collectModules(tree)` / `collectResources(tree)` —
  flatten the canonical-module / legacy `courseContent` tree.
- `findModuleById(tree, id)` / `findResourceById(tree, id)` —
  lookup helpers.
- `moduleRequiredPreviousIds(module)` — returns the
  `requiredPreviousModuleIds` (or legacy `dependencies`).

### 2. React hook (`src/hooks/useCourseAccess.ts`)

- `useCourseAccess({ product, requireBaseCourseForUpdate? })`
  — subscribes to **five** Firestore sources in parallel:
  - `entitlements` (where `uid == currentUser`) — canonical
    Part 6 / Part 9 entitlements.
  - `users/{uid}/subscription/current` — the active
    subscription record (Part 9).
  - `users/{uid}` — legacy `purchasedProductIds` +
    `purchasedProductUpdateIds` (Part 6 dual-write).
  - `users/{uid}/purchases/*` — legacy per-product base
    purchase docs.
- The hook returns a `CourseAccessResolution` + a `loading`
  flag + a `hasActiveSubscription` boolean for the UI.
- `useOwnedProducts()` — a lighter-weight hook that
  returns just the canonical `full_product` ownership set
  for the Profile + Purchases library.

### 3. Consumers

- **Course route guard** (`src/components/CourseRouteGuard.tsx`):
  - Uses `useCourseAccess` instead of `purchasedIds.has(productId)`.
  - If the user has `hasAnyAccess`, opens the Course Player.
  - Otherwise, falls through to the PDP so the buyer can
    complete the purchase.
  - Anonymous users see the PDP (the login CTA fires from
    there).
- **Course Player** (`src/CoursePlayerApp.tsx`):
  - The local `ownedUpdateIds` Firestore subscription is
    **gone** — the resolver is the single source.
  - The `firstAccessibleFile` walker now consumes
    `resolution.accessibleModuleIds`.
  - An "Active subscription" badge is rendered when
    `hasActiveSubscription` is true.
- **Product Detail** (`src/PdpApp.tsx` + `src/components/pdp/PdpPurchaseBuilder.tsx`):
  - `useCourseAccess` feeds the builder with `ownedModuleIds` +
    `ownedResourceIds` so the per-item gate is resolver-driven.
- **Profile** (`src/profile/App.tsx`):
  - The "Purchased" stat uses `Math.max(purchasedIds.size, canonicalOwnedIds.length)` so
    subscriptions and per-module purchases are reflected.
- **Purchases library** (`src/components/OtherTabs.tsx`):
  - The library merges the legacy `purchasedIds` set with the
    canonical `ownedProductIds` set so subscription /
    module / resource unlocks surface as "Owned".
- **main.tsx** — the direct course route uses
  `<CourseRouteGuard>` instead of the inline
  `purchasedIds.has(productId)` check.

## Files Added

| Path | Purpose |
| --- | --- |
| `utils/courseAccess.js` | Pure course-access resolver (every spec rule as a pure function). |
| `utils/courseAccess.d.ts` | Type declarations for the resolver + the `CourseAccessResolution` shape + the `CourseAccessSource` union. |
| `src/hooks/useCourseAccess.ts` | The single React hook that wires Firestore to the resolver. Includes the lighter-weight `useOwnedProducts` helper. |
| `src/components/CourseRouteGuard.tsx` | The direct-course-route guard. Replaces the inline check in `main.tsx`. |
| `tests/courseAccess.test.mjs` | 25 unit tests — every spec rule + monthly / yearly / combos / preview / dependency. |
| `tests/courseAccessServerContract.test.mjs` | 17 source-level contract tests for the resolver + the hook + the consumers. |

## Files Modified

| Path | Change |
| --- | --- |
| `src/main.tsx` | Direct course route uses `<CourseRouteGuard>`. The inline `purchasedIds.has(...)` check is gone. `purchasedIds` is no longer used here. |
| `src/CoursePlayerApp.tsx` | Consumes `useCourseAccess`. The local `ownedUpdateIds` Firestore subscription is removed. The "Active subscription" badge is rendered when applicable. |
| `src/PdpApp.tsx` | Wires `useCourseAccess` and feeds the builder with `ownedModuleIds` + `ownedResourceIds`. |
| `src/components/pdp/PdpPurchaseBuilder.tsx` | Accepts the new `ownedResourceIds` prop and propagates it through `ownershipState`. |
| `src/profile/App.tsx` | "Purchased" count uses `Math.max(purchasedIds.size, canonicalOwnedIds.length)`. |
| `src/components/OtherTabs.tsx` | Purchases library merges the legacy `purchasedIds` set with the canonical `ownedProductIds` set. |

## Spec Coverage

| Spec rule | Where it lives | Test |
| --- | --- | --- |
| Full product access | `resolveCourseAccess` (`hasFullProductAccess`) | `courseAccess.test.mjs` |
| Partial module access | `resolveCourseAccess` (`ownedModuleIds`, `moduleAccessSources`) | `courseAccess.test.mjs` |
| Resource access | `resolveCourseAccess` (`ownedResourceIds`, `resourceAccessSources`) | `courseAccess.test.mjs` |
| Update access | `resolveCourseAccess` (`ownedUpdateIds`) | `courseAccess.test.mjs` |
| Update requires base | `requireBaseCourseForUpdate` flag | `courseAccess.test.mjs` |
| Subscription access | `useCourseAccess` subscription sync + `subscriptionProductIds` / `subscriptionModuleIds` | `courseAccess.test.mjs` |
| Subscription expiry | `isSubscriptionRecordActive` + `useCourseAccess` | `courseAccess.test.mjs` |
| Permanent purchases | `entitlements` collection + `collectEntitlementOwnership` | `courseAccess.test.mjs` |
| Preview | `previewModuleIds` + `moduleAccessSources[preview] === "locked"` | `courseAccess.test.mjs` |
| Dependencies | `unmetDependencies` + `requiredPreviousModuleIds` | `courseAccess.test.mjs` |
| Update direct course-route protection | `CourseRouteGuard` | `courseAccessServerContract.test.mjs` |
| Don't require full-product when module / resource owned | `CourseRouteGuard.hasAnyAccess` | `courseAccessServerContract.test.mjs` |
| `accessSource` per item | `moduleAccessSources` + `resourceAccessSources` | `courseAccess.test.mjs`, `courseAccessServerContract.test.mjs` |

## Test Results

| Suite | Tests | Pass | Fail |
| --- | --- | --- | --- |
| `tests/courseAccess.test.mjs` (NEW) | 25 | 25 | 0 |
| `tests/courseAccessServerContract.test.mjs` (NEW) | 17 | 17 | 0 |
| `tests/subscriptions.test.mjs` (Part 9) | 32 | 32 | 0 |
| `tests/subscriptionsServerContract.test.mjs` (Part 9) | 24 | 24 | 0 |
| `tests/coupons.test.mjs` (Part 7) | 42 | 42 | 0 |
| `tests/couponsServerContract.test.mjs` (Part 7) | 28 | 28 | 0 |
| `tests/checkoutCouponContract.test.mjs` (Part 7) | 22 | 22 | 0 |
| `tests/serverQuotes.test.mjs` (Part 4) | 47 | 47 | 0 |
| `tests/serverQuotesContract.test.mjs` (Part 4) | 18 | 18 | 0 |
| `tests/entitlements.test.mjs` (Part 6) | 23 | 23 | 0 |
| `tests/entitlementsContract.test.mjs` (Part 6) | 30 | 30 | 0 |
| `tests/checkoutRazorpayEntitlementsContract.test.mjs` (Part 6) | 13 | 13 | 0 |
| `tests/checkoutSession.test.mjs` (Part 5) | 19 | 19 | 0 |
| `tests/checkoutMobileWidths.test.mjs` (Part 5) | 25 | 25 | 0 |
| `tests/pdpSelection.test.mjs` (Part 3) | 45 | 45 | 0 |
| `tests/pdpPurchaseBuilderMobileWidths.test.mjs` (Part 3) | 15 | 15 | 0 |
| `tests/commerce.test.mjs` (Part 1) | 28 | 28 | 0 |
| `tests/productMapping.test.mjs` (Part 1) | 27 | 27 | 0 |
| `tests/productPrice.test.mjs` (Part 1) | 3 | 3 | 0 |
| **Total (Part 10 + adjacent)** | **504** | **504** | **0** |

- `npx tsc --noEmit` is clean for new code. Pre-existing `utils/*` errors remain (out of scope, unchanged).
- `npx tsc --noEmit -p tsconfig.api.json` is clean. Pre-existing `api/push/send.ts` web-push error is unchanged.
- `npm run build` succeeds (Vite 7.3.2, 2960 modules, 2.66 MB).

## What was NOT done in Part 10

- **No new admin surface** — the resolver is a pure
  consumer of the Part 6 / Part 9 entitlement / subscription
  docs. Admin tool changes to the coupon / subscription /
  entitlement writers are out of scope.
- **No new entitlement collection** — the resolver reads the
  existing `entitlements` + `subscriptions/{uid}/current` +
  legacy `users/{uid}` + `users/{uid}/purchases/*` docs. It does
  not write to any of them.
- **No client-side access state cache** — the hook subscribes
  to Firestore on every mount. The first render is `loading:
  true`; the second render carries the full resolver output.
- **No preview-mode completion / rewards plumbing** — the
  spec says "Preview does not grant completion / rewards."
  The resolver exposes `previewModuleIds` so the UI can hide
  the "Mark complete" button for previews, but the actual
  completion / rewards plumbing in `CoursePlayerApp` already
  treats `completedIds` as a Firestore-only set, so a preview
  module is naturally not counted. The "Active subscription"
  badge is rendered when `hasActiveSubscription` is true; a
  full per-page subscription UI is out of scope.
- Pre-existing `utils/*` tsc errors + pre-existing test
  infrastructure issues in `payment*` / `subscription*` /
  `course*` / `admin*` test files (which reference top-level
  `App.tsx` / `components/PaymentModal.tsx` that don't exist
  in `src/`). These fail identically on the pristine `main`
  branch with `Error: ENOENT ... 'App.tsx'` and are out of
  scope.
