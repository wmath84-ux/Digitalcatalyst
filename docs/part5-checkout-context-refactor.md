# Part 5 — Immutable CheckoutContext + Mobile-First Review/Success

## Scope

Part 5 of the 5-part checkout refactor removes the mutable
`src/data/checkoutData.ts` singleton + the `Object.assign` flow that
used to leak checkout state across pages. It introduces:

- An **immutable `CheckoutContext`** that owns the canonical
  `CheckoutSelection` + `ServerPriceQuote` + buyer + return route +
  loading + error + refresh + session-restoration state.
- A **mobile-first `CheckoutReviewStep`** (itemised line items, full
  price section, navigation, safe-recovery UI).
- A new itemised **`CheckoutSuccessStep`** (read-only receipt that
  consumes the verified quote).

What is **out of scope** (explicitly preserved as-is):

- Razorpay / `PaymentGateway` (Part 2 wiring untouched).
- Coupons / EduCoin discount calculation (Part 1 schema unchanged;
  hard-coded to ₹0 in the new Review price section, per the Part 5
  spec).
- PDP, Course Player, Subscription, Admin modules (no behavioural
  changes — PDP CTAs now route through the new `startCheckout`
  helper but the user-visible PDP behaviour is the same).
- The Part 4 server-quote endpoint (`api/quotes/create`,
  `api/quotes/fetch`, `utils/serverQuotes.js`, `tsconfig.api.json`)
  is consumed as-is; no changes in Part 5.

## Files Added

| Path | Purpose |
| --- | --- |
| `src/checkout/types.ts` | `CheckoutContextValue`, `CheckoutBuyer`, `CheckoutReturnRoute`, `CheckoutSessionRecordV1` (schemaVersion: 1, key `checkoutSession.v1`). |
| `utils/checkoutSession.js` + `utils/checkoutSession.d.ts` | Pure helpers: `parseCheckoutSessionRecord`, `buildCheckoutSessionRecord`, `readCheckoutSessionRecord`, `writeCheckoutSessionRecord`, `clearCheckoutSessionRecord`, plus sessionStorage adapters `readFromSessionStorage`, `writeToSessionStorage`, `clearFromSessionStorage`. Schema-mismatch drops the record; unparseable quote drops only the quote, keeps the rest. |
| `src/checkout/CheckoutContext.tsx` | `<CheckoutProvider>` with `useMemo<CheckoutContextValue>`, `useCallback` for `refresh` / `reload` / `goBack` / `cancel`. POSTs to `/api/quotes/create`. `AbortController` for in-flight refresh. Restores stored record on mount; if stored quote is `active` AND `expiresAt > now` → surfaces immediately, else fetches fresh. On 400/404/403 → `status: "invalid"`, else `status: "needs_refresh"`. Persists refreshed record on every successful fetch. |
| `src/components/checkout/CheckoutLineItemCard.tsx` | Itemised line card with type chip, title, parent, regular/sale/effective, already-owned badge. `min-w-0` on flex container, `line-clamp-2 break-words` on `<h3>`, `truncate` on parent title `<p>`. |
| `src/components/checkout/CheckoutReviewStep.tsx` | Mobile-first review: purchase type chip, buyer card (Firebase verified badge), itemised line items, price section (regular subtotal, sale discount, coupon discount = ₹0, EduCoin discount = ₹0, minimum payable, final total, GST inclusive), selection details, refresh banner, navigation (proceed / back / refresh / edit). `SafeRecoveryUI` for empty / invalid / error states. |
| `src/components/checkout/CheckoutSuccessStep.tsx` | Itemised success: receipt header, itemised line items, totals, note about payment wiring coming later, CTAs (Go to library / Back to source). |
| `src/components/checkout/CheckoutApp.tsx` | Replaces old `src/CheckoutApp.tsx`. 3-step state machine (review → payment → success), wraps `<CheckoutProvider>` in `main.tsx`. Derives `productId` / `productIds` / `updateSelection` / `finalPrice` / `productName` from `CheckoutContext`. |
| `tests/checkoutSession.test.mjs` | 19 unit tests — round-trip, version mismatch, sanitization, storage safety, legacy `{product, user}` shape rejected. |
| `tests/checkoutMobileWidths.test.mjs` | 25 mobile-width structural tests across 320 / 360 / 390 / 430 / 480 px. |

## Files Deleted

- `src/data/checkoutData.ts` — the mutable singleton.
- `src/CheckoutApp.tsx` — replaced by `src/components/checkout/CheckoutApp.tsx`.
- `src/components/OrderSummary.tsx` — replaced by Review step.
- `src/components/VerificationSuccess.tsx` — replaced by Success step.

## Files Modified

- `src/main.tsx` — removed `applyCheckoutContext`, the `CheckoutContext`
  type, `CHECKOUT_CONTEXT_KEY`, `checkoutProduct`, `checkoutUser`
  imports. Added `startCheckout({ selection, buyer, returnRoute,
  idempotencyKey })` helper that builds a validated session record,
  writes it, navigates to `#/checkout`. Replaced `handleCartCheckout`,
  `handlePurchaseUpdate`, `navigateToCheckout` to use `startCheckout`
  (no `Object.assign`, no module-level mutation). `#/checkout` route
  wraps `<CheckoutProvider><CheckoutApp /></CheckoutProvider>`. The
  old `InvalidCheckout` fallback is preserved as a small no-session
  component. PDP CTAs now pass `selection` + `buyer` + `returnRoute`
  + `idempotencyKey` to `startCheckout`.
- `src/types/commerce.ts` — added optional `status?: "active" |
  "expired" | "consumed" | "invalid"` to `ServerPriceQuote`.
- `tsconfig.json` — `"include": ["src", "utils", "vite.config.ts"]`
  so `utils/*.d.ts` is typechecked.

## Session-Restoration Contract

The session record is keyed under `checkoutSession.v1` in
`window.sessionStorage`. On every successful quote fetch (initial
load AND `refresh()`), the provider calls
`writeToSessionStorage(buildCheckoutSessionRecord({...}))`. On mount
the provider reads the record via `readFromSessionStorage()` and:

- If the record's schema version mismatches → discard.
- If the record has no `selection` → discard.
- If `quote.status === "active"` AND `quote.expiresAt > now` →
  surface the cached quote immediately, no network round-trip.
- Otherwise → fetch a fresh quote from `/api/quotes/create`.
- Server 400 / 403 / 404 → `status: "invalid"` (safe recovery UI).
- Other errors → `status: "needs_refresh"` (user can retry).

## Test Results

| Suite | Tests | Pass | Fail |
| --- | --- | --- | --- |
| `tests/checkoutSession.test.mjs` | 19 | 19 | 0 |
| `tests/checkoutMobileWidths.test.mjs` | 25 | 25 | 0 |
| `tests/serverQuotes.test.mjs` (Part 4) | 47 | 47 | 0 |
| `tests/serverQuotesContract.test.mjs` (Part 4) | 18 | 18 | 0 |
| `tests/pdpSelection.test.mjs` (Part 3) | 45 | 45 | 0 |
| `tests/pdpPurchaseBuilderMobileWidths.test.mjs` (Part 3) | 15 | 15 | 0 |
| `tests/commerce.test.mjs` | 28 | 28 | 0 |
| `tests/productMapping.test.mjs` | 27 | 27 | 0 |
| `tests/productPrice.test.mjs` | 3 | 3 | 0 |
| **Total (Part 5 + adjacent)** | **227** | **227** | **0** |

`npx tsc --noEmit` is clean for `src/`. Pre-existing `utils/*` tsc
errors remain (out of scope, unchanged from before Part 5).

`npm run build` succeeds (Vite 7.3.2, 2960 modules, 2.65 MB).

## Mobile Widths

Tested structurally at 320 / 360 / 390 / 430 / 480 px. Review and
Success use `p-3 sm:p-4`, `min-w-0` on every text-bearing flex child,
`truncate` on buyer / receipt rows / line-item parent title, and
`line-clamp-2` on the line-item title. The back / refresh action row
uses `grid-cols-2 gap-2` so both buttons fit on a 320 px viewport.

## Behavioural Deltas (vs. pre-Part-5)

- Removed: `applyCheckoutContext`, module-level `checkoutProduct` /
  `checkoutUser` mutation, `Object.assign(checkoutData, ...)`.
- Removed: hard-coded default product (`React & Next.js` / `Rahul
  Verma` / `₹1999`) in the checkout flow.
- Added: explicit `CheckoutSelection` + `CheckoutBuyer` +
  `CheckoutReturnRoute` arguments on every entry point
  (`startCheckout`).
- Added: validated sessionStorage round-trip with schema versioning.
- Added: immutable `useMemo<CheckoutContextValue>` — every render
  of the provider returns a fresh value object, never a mutation.
- Added: 320 / 360 / 390 / 430 / 480 px structural tests.
- Added: safe-recovery UI for empty / invalid / error states (no
  fake product on stale quote).
- Unchanged: Razorpay / `PaymentGateway` wiring (Part 2).
- Unchanged: coupon / EduCoin discount (Part 1, hard-coded to ₹0
  per Part 5 spec).
- Unchanged: PDP, Course Player, Subscription, Admin behaviour.

## What was NOT done in Part 5

- No behavioural change to Razorpay / `PaymentGateway` / coupon
  / EduCoin (per the Part 5 spec).
- No new product-mapping rules (Part 3 work is unchanged).
- No server-quote contract changes (Part 4 work is unchanged).
- Pre-existing `utils/*` tsc errors (out of scope for Part 5).
- Pre-existing test infrastructure issues in
  `tests/payment*` / `tests/subscription*` / `tests/course*` /
  `tests/admin*` test files that reference top-level `App.tsx` /
  `components/PaymentModal.tsx` (the repo moved to `src/...`
  before Part 5; these tests are out of scope and fail identically
  on the pristine `main` branch with `Error: ENOENT ... 'App.tsx'`).
