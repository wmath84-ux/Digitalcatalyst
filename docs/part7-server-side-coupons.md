# Part 7 — Server-Side Coupons

## Scope

Part 7 wires **server-side coupons** into the Part 4 quote
engine. Every coupon rule is enforced by the server; the client
never gets to send a discount, and the client UI only displays
what the verified `ServerPriceQuote` carries back. The spec
calls for the following validation rules:

- Coupon exists
- Active
- Start date
- Expiry date
- Global usage limit
- Per-user usage limit
- Product eligibility
- Module eligibility
- Resource eligibility
- Category eligibility
- Minimum order
- Maximum discount
- First-purchase only

Plus the discount-math rules:

- `percent` coupons: `floor(subtotal * value / 100)`, capped at
  `maxDiscountPaise` (per coupon) and clamped to the order
  subtotal.
- `flat` coupons: `value` (in paise), with the same caps.
- The minimum-payable floor always wins — a coupon can never
  push the price below the per-line floor.

What is **out of scope** (explicitly preserved as-is):

- **EduCoin** — `eduCoinDiscount` is hard-coded to `0`. The
  price section still shows "EduCoin discount = ₹0" as a
  placeholder.
- **Subscription** — `applyCouponToQuote` and the Part 7 flow
  operate only on the Part 6 purchase kinds. The Razorpay
  endpoint still refuses subscription selections.
- **PDP / Course Player / Subscription / Admin** — the only
  client surface that changes is the Checkout Review + Success
  steps.

## Architectural Changes

### 1. Pure coupon engine (`utils/coupons.js` + `.d.ts`)

Every coupon rule is a pure function. The Node test runner
imports the `.js` file directly. The server endpoint and the
Part 4 engine both call into this module — no rule is duplicated
anywhere.

The public surface is:

- `normaliseCouponCode(raw)` — trim, uppercase, strip non-alnum,
  cap at 60 chars. The Firestore doc id IS the normalised code.
- `normaliseCouponDoc(raw)` — coerce a Firestore `coupons/{code}`
  doc into the canonical `CouponDoc` shape.
- `isCouponActive`, `isWithinGlobalLimit`, `isWithinPerUserLimit`,
  `isEligibleForProducts`, `isEligibleForModules`,
  `isEligibleForResources`, `isEligibleForCategories`,
  `isEligibleForPurchaseKind`, `meetsMinOrder`, `isFirstPurchase`
  — one pure predicate per rule.
- `computeCouponDiscount(coupon, orderSubtotalPaise)` — returns
  the absolute discount in paise, respecting `maxDiscountPaise`
  and clamping to the order subtotal.
- `validateCoupon(coupon, orderContext, now?)` — the top-level
  validator. Returns
  `{ ok: true, discountPaise } | { ok: false, code, reason }`
  where `code` is a machine-readable token the client can map
  to UI copy and `reason` is a user-safe string.
- `applyCouponToQuote(quote, coupon, validatedDiscountPaise)` —
  returns a NEW quote object with `couponCode`, `couponType`,
  `couponValue`, `couponDiscount` set and `cashPayable`
  recomputed. The minimum-payable floor always wins.
- `removeCouponFromQuote(quote)` — clears the coupon fields
  and restores the pre-coupon `cashPayable`.
- `buildCouponRedemptionDocId(couponCode, orderId)` — the
  doc id for `couponRedemptions` (idempotency key for
  `applyCouponRedemption`).
- `shouldIncrementCouponUsage(redemptionDoc, coupon, now?)` —
  pure helper used by the transactional writer.

### 2. Part 4 engine integration (`utils/serverQuotes.js`)

`buildQuote` accepts three new optional inputs:

- `coupon` — the loaded `CouponDoc`.
- `userCouponUsageCount` — for the per-user limit.
- `userHasPriorPurchases` — for the first-purchase check.
- `productCategories` — for the category eligibility rule.

When `coupon` is supplied, the engine:

1. Builds the order context (subtotal, product ids, module ids,
   resource ids, categories, purchase kind, first-purchase flag,
   user-usage count).
2. Calls `validateCoupon` — on failure, returns
   `{ ok: false, status: 400, reason: validation.reason }`.
3. Applies the validated discount, respecting the
   minimum-payable floor.
4. Returns the new `ServerPriceQuoteRecord` with
   `couponCode`, `couponType`, `couponValue`, `couponDiscount`
   populated.

`selectionsEqual` (the idempotency check) now includes
`couponCode` in the equality check so applying or removing a
coupon invalidates any cached idempotent quote.

### 3. Server-side plumbing (`api/_lib/coupons.ts` + `api/_lib/quotes.ts`)

- `loadCouponByCode(code)` — single `.doc(code).get()` on
  the `coupons` collection. Returns `null` for missing,
  malformed, or inactive coupons.
- `loadUserCouponUsageCount(uid, code)` — counts
  `couponRedemptions/{code}__*` docs with `status: "applied"`
  for the user. Only **applied** redemptions count toward the
  per-user quota; partial / reverted ones do not.
- `loadUserHasPriorPurchases(uid)` — checks
  `users/{uid}.purchasedProductIds` AND `siteOrders/{uid}/*` so
  the answer is correct for both the legacy Part 6 dual-write
  path and the free-grant path.
- `applyCouponRedemption(tx, { uid, coupon, discountPaise,
  orderId, paymentId, now })` — runs inside a Firestore
  transaction, writes a `couponRedemptions/{code}__{orderId}`
  doc (status: "applied"), increments
  `coupons/{code}.usedCount`, and stamps
  `users/{uid}.lastCouponRedemptionAt`. Idempotent: a
  replay sees the existing doc and short-circuits.

`api/_lib/quotes.ts` loads the coupon (when the selection
carries a `couponCode`), reads the user context, and passes the
loaded coupon + context to `buildQuote`. The forbidden-fields
list now includes `couponDiscount`, `couponType`, `couponValue`
so a malicious client cannot bypass the server-side validation.

### 4. Razorpay endpoints

- `api/razorpay/create-order.ts` — the intent now carries
  `couponCode`, `couponType`, `couponValue`, `couponDiscount`
  so the verify-payment step (or a replay) knows what coupon
  was applied without re-loading the quote.
- `api/razorpay/verify-payment.ts` — the response shape
  carries the coupon fields + a `couponRedemption` summary
  (`{ couponCode, discountPaise, redeemed, redemptionId }`) on
  every success branch (replay, free, paid). The
  consumed-replay fallback quote also carries the coupon
  fields so the entitlement writer still sees them.

### 5. Atomic usage increment

`grantEntitlementsFromQuote` (Part 6) was extended:

- The `siteOrders/{orderId}` receipt now carries `couponCode`,
  `couponType`, `couponValue`, `couponDiscount` so the admin /
  receipt UI can show them.
- When the quote carries a coupon, a SEPARATE transaction
  calls `applyCouponRedemption` to write the redemption doc +
  increment `usedCount` + stamp the user doc. The redemption
  helper is itself idempotent (`status === "applied"` short-
  circuit), so a verify-payment replay does not double-count.
- The coupon increment lives in a separate transaction from
  the entitlement write so a coupon failure (e.g. global
  limit reached between quote and payment) does NOT roll back
  the entitlement grant. The user keeps what they paid for;
  the coupon failure surfaces in the response.
- The `GrantEntitlementsResult` shape now includes a
  `couponRedemption?: { couponCode, discountPaise, redeemed,
  redemptionId }` summary.

### 6. Client UI

`CheckoutContext` was extended with:

- `applyCoupon(code)` action — sets `selection.couponCode`
  immutably, re-fetches the server-side quote, surfaces the
  result or the error message.
- `removeCoupon()` action — clears the coupon, re-fetches.
- `couponStatus: "idle" | "applying" | "error"` state.
- `couponErrorMessage: string | null` state.
- `couponInput: string` + `setCouponInput` (controlled input).

`CheckoutReviewStep` now renders a new `CouponCard`:

- Coupon input field + Apply button when no coupon is applied.
- Verified-savings badge + Remove button when a coupon is
  applied.
- Loading spinner while the round-trip is in flight.
- Error message under the input when the server refuses the
  code.
- The price section's "Coupon discount" row only renders
  when `couponDiscount > 0` (and is labelled with the coupon
  code).

`CheckoutSuccessStep` surfaces the verified coupon on the
receipt header (e.g. "SAVE20 (20% off)") and in the totals
section ("Coupon discount − ₹X").

The Part 5 mobile-widths contract tests still pass.

## Files Added

| Path | Purpose |
| --- | --- |
| `utils/coupons.js` | Pure coupon engine — every Part 7 rule as an independently-testable function. |
| `utils/coupons.d.ts` | Type declarations for the engine + the `CouponDoc` / `CouponRedemptionDoc` / `CouponOrderContext` shapes. |
| `api/_lib/coupons.ts` | Server-side plumbing — `loadCouponByCode`, `loadUserCouponUsageCount`, `loadUserHasPriorPurchases`, `applyCouponRedemption` (transactional). |
| `tests/coupons.test.mjs` | 42 unit tests — every Part 7 spec rule + discount math + apply/remove. |
| `tests/couponsServerContract.test.mjs` | 28 source-level contract tests for the coupon plumbing in the Razorpay endpoints + entitlement writer. |
| `tests/checkoutCouponContract.test.mjs` | 22 source-level contract tests for the React client (CheckoutContext, CheckoutReviewStep, CheckoutSuccessStep). |

## Files Modified

| Path | Change |
| --- | --- |
| `utils/serverQuotes.js` | Imported `validateCoupon` from `utils/coupons.js`. `buildQuote` now accepts a `coupon` (plus `userCouponUsageCount`, `userHasPriorPurchases`, `productCategories`) and applies the discount before returning the quote. `selectionsEqual` includes `couponCode` in the idempotency check. |
| `utils/serverQuotes.d.ts` | `ServerPriceQuoteRecord` + `BuildQuoteInput` extended with the coupon fields + the new input fields. `CouponDoc` re-exported from `utils/coupons.d.ts`. |
| `src/types/commerce.ts` | `ServerPriceQuote` interface extended with `couponCode?`, `couponType?`, `couponValue?`. |
| `api/_lib/quotes.ts` | `parseSelection` adds `couponDiscount`, `couponType`, `couponValue` to the forbidden-fields list. `handleCreateQuote` loads the coupon + user context and passes them to `buildQuote`. On a coupon refusal, the response includes `couponRefused: true`. |
| `api/razorpay/create-order.ts` | Intent snapshot now carries the coupon fields (so a replay still knows what coupon was applied). |
| `api/razorpay/verify-payment.ts` | Response shape carries the coupon fields + `couponRedemption` summary on every success branch. The consumed-replay fallback quote carries the coupon fields. |
| `api/_lib/entitlements.ts` | `buildSiteOrder` carries the coupon fields. `grantEntitlementsFromQuote` calls `applyCouponRedemption` in a separate transaction when the quote has a coupon. The result shape includes `couponRedemption?`. |
| `src/checkout/types.ts` | `CheckoutContextValue` extended with `applyCoupon`, `removeCoupon`, `couponStatus`, `couponErrorMessage`, `couponInput`, `setCouponInput`. |
| `src/checkout/CheckoutContext.tsx` | Provider implements the new actions + state. Both actions build a fresh immutable selection and re-fetch the server-side quote; the failure path rolls back the optimistic selection update. |
| `src/components/checkout/CheckoutReviewStep.tsx` | New `CouponCard` component (input + Apply, error state, verified-savings badge, Remove). The price section's "Coupon discount" row only renders when a coupon is applied, and is labelled with the code. |
| `src/components/checkout/CheckoutSuccessStep.tsx` | Receipt header includes the verified coupon (code + percent/flat label). |
| `tsconfig.api.json` | `include` adds `utils/coupons.d.ts`. |
| `tests/serverQuotesContract.test.mjs` | Updated the "couponDiscount = 0" guard (Part 7 makes it conditional) and the `cashPayable` formula (now `max(effectiveSubtotal - couponDiscount, minimumPayable)`). |

## Spec Coverage

| Spec requirement | Where it lives | Test |
| --- | --- | --- |
| Coupon exists | `validateCoupon` rule 1 | `coupons.test.mjs` |
| Active | `isCouponActive` (rule 2) | `coupons.test.mjs` |
| Start date | `isCouponActive` (rule 3) | `coupons.test.mjs` |
| Expiry date | `isCouponActive` (rule 4) | `coupons.test.mjs` |
| Global usage limit | `isWithinGlobalLimit` (rule 5) | `coupons.test.mjs` |
| Per-user usage limit | `isWithinPerUserLimit` (rule 6) | `coupons.test.mjs` |
| Product eligibility | `isEligibleForProducts` (rule 7) | `coupons.test.mjs` |
| Module eligibility | `isEligibleForModules` (rule 8) | `coupons.test.mjs` |
| Resource eligibility | `isEligibleForResources` (rule 9) | `coupons.test.mjs` |
| Category eligibility | `isEligibleForCategories` (rule 10) | `coupons.test.mjs` |
| Minimum order | `meetsMinOrder` (rule 11) | `coupons.test.mjs` |
| Maximum discount | `computeCouponDiscount` (rule 12) | `coupons.test.mjs` |
| First-purchase only | `isFirstPurchase` (rule 13) | `coupons.test.mjs` |
| Coupon code on quote | `ServerPriceQuote.couponCode` + `applyCouponToQuote` | `coupons.test.mjs`, `checkoutCouponContract.test.mjs` |
| Coupon type on quote | `ServerPriceQuote.couponType` | `checkoutCouponContract.test.mjs` |
| Coupon value on quote | `ServerPriceQuote.couponValue` | `checkoutCouponContract.test.mjs` |
| Coupon discount on quote | `ServerPriceQuote.couponDiscount` (and `cashPayable` recomputed) | `coupons.test.mjs`, `couponsServerContract.test.mjs` |
| Updated cash payable | `applyCouponToQuote` (respects minimumPayable floor) | `coupons.test.mjs` |
| Never trust client discount | `parseSelection` forbidden fields + no client math in `applyCoupon` | `couponsServerContract.test.mjs`, `checkoutCouponContract.test.mjs` |
| Do not increment on quote create | `loadCouponByCode` is read-only; the `usedCount` increment lives in `applyCouponRedemption` | `couponsServerContract.test.mjs` |
| Increment on payment completion | `grantEntitlementsFromQuote` calls `applyCouponRedemption` (transactional) | `couponsServerContract.test.mjs` |
| Transactional / idempotent | `couponRedemptions/{code}__{orderId}` doc + `existingData.status === "applied"` short-circuit | `coupons.test.mjs`, `couponsServerContract.test.mjs` |
| Reject replay / over-limit use | `existingData.status === "applied" | "reverted"` short-circuit + `isWithinGlobalLimit` re-check inside the transaction | `coupons.test.mjs`, `couponsServerContract.test.mjs` |
| Coupon input | `<input>` controlled field on the CouponCard | `checkoutCouponContract.test.mjs` |
| Apply | `data-checkout-coupon-apply` button | `checkoutCouponContract.test.mjs` |
| Remove | `data-checkout-coupon-remove` button | `checkoutCouponContract.test.mjs` |
| Loading | `couponStatus === "applying"` + spinner | `checkoutCouponContract.test.mjs` |
| Error | `data-checkout-coupon-error` + server-refused reason | `checkoutCouponContract.test.mjs` |
| Verified savings | `data-checkout-coupon-applied` badge | `checkoutCouponContract.test.mjs` |
| Test for every validation rule | 42 unit tests + 28 server contract tests + 22 client contract tests | (counts above) |

## Test Results

| Suite | Tests | Pass | Fail |
| --- | --- | --- | --- |
| `tests/coupons.test.mjs` (NEW) | 42 | 42 | 0 |
| `tests/couponsServerContract.test.mjs` (NEW) | 28 | 28 | 0 |
| `tests/checkoutCouponContract.test.mjs` (NEW) | 22 | 22 | 0 |
| `tests/serverQuotes.test.mjs` (Part 4) | 47 | 47 | 0 |
| `tests/serverQuotesContract.test.mjs` (Part 4, updated) | 18 | 18 | 0 |
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
| **Total (Part 7 + adjacent)** | **385** | **385** | **0** |

- `npx tsc --noEmit` is clean for new code. Pre-existing `utils/*` errors remain (out of scope, unchanged).
- `npx tsc --noEmit -p tsconfig.api.json` is clean. The pre-existing `api/push/send.ts` web-push error is unchanged.
- `npm run build` succeeds (Vite 7.3.2, 2960 modules, 2.65 MB).

## What was NOT done in Part 7

- **EduCoin** — `eduCoinDiscount` is hard-coded to `0` (the
  spec explicitly defers EduCoin to a later part). The price
  section still shows "EduCoin discount = ₹0" as a
  placeholder.
- **Subscription** — the Razorpay endpoint refuses
  subscription selections (Part 6). The coupon engine does
  not handle subscription-product discounts; a coupon that
  targets a subscription plan would be refused by the
  `isEligibleForPurchaseKind` gate.
- **PDP / Course Player / Subscription / Admin** — the only
  client surface that changes is the Checkout Review + Success
  steps. PDP CTAs still call `startCheckout` with the same
  shape.
- Part 4 server-quote endpoint is consumed as-is (only the
  forbidden-fields list grew). Part 5 CheckoutContext's
  existing actions (`refresh`, `cancel`, `goBack`) are
  unchanged. Part 6 Razorpay endpoints are consumed as-is (the
  coupon fields are added to the intent + response).
- Pre-existing `utils/*` tsc errors + pre-existing test
  infrastructure issues in `payment*` / `subscription*` /
  `course*` / `admin*` test files (which reference top-level
  `App.tsx` / `components/PaymentModal.tsx` that don't exist
  in `src/`). These fail identically on the pristine `main`
  branch with `Error: ENOENT ... 'App.tsx'` and are out of
  scope.
