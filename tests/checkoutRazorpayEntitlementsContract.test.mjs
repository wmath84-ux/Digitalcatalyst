// tests/checkoutRazorpayEntitlementsContract.test.mjs
//
// Part 6 — client-side contract tests. These are SOURCE-level
// checks that the React client (PaymentGateway, CheckoutApp,
// CheckoutSuccessStep) was updated to use the new quoteId-driven
// Razorpay flow and that the success page renders the spec
// fields (real orderId, paymentId, line items, granted
// entitlement ids, cash paid, purchase kind).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const paymentGateway = readSource("src/components/PaymentGateway.tsx");
const checkoutApp = readSource("src/components/checkout/CheckoutApp.tsx");
const checkoutSuccess = readSource("src/components/checkout/CheckoutSuccessStep.tsx");

// ---------------------------------------------------------------------------
// PaymentGateway — quoteId-only
// ---------------------------------------------------------------------------

test("PaymentGateway accepts a quoteId prop (Part 6)", () => {
  assert.match(paymentGateway, /quoteId:\s*string/);
  // The legacy productId / productIds / updateSelection props must
  // be gone from the component API.
  assert.doesNotMatch(paymentGateway, /productId:\s*string/);
  assert.doesNotMatch(paymentGateway, /productIds\?:/);
  assert.doesNotMatch(paymentGateway, /updateSelection\?:/);
});

test("PaymentGateway sends only quoteId to /api/razorpay/create-order", () => {
  // The body must contain only `{ quoteId }` — no productId,
  // productIds, or updateSelection. The component destructures
  // `quoteId` and passes it directly.
  assert.match(paymentGateway, /apiRequest<CreateOrderResponse>\(\s*"\/api\/razorpay\/create-order"\s*,\s*\{\s*quoteId\s*\}\s*\)/);
});

test("PaymentGateway sends the quoteId on the verify call too", () => {
  assert.match(paymentGateway, /apiRequest<VerifyPaymentResponse>\(\s*"\/api\/razorpay\/verify-payment"\s*,\s*\{[\s\S]*?quoteId[\s\S]*?\}\s*\)/);
});

test("PaymentGateway surfaces grantedEntitlementIds from the verify response", () => {
  assert.match(paymentGateway, /grantedEntitlementIds/);
  // The success callback receives the ids.
  assert.match(paymentGateway, /onPaymentSuccess\(\{[\s\S]*?grantedEntitlementIds/);
});

// ---------------------------------------------------------------------------
// CheckoutApp — passes the quoteId to the gateway + the new props
// to the success step
// ---------------------------------------------------------------------------

test("CheckoutApp passes quoteId to PaymentGateway (not productId)", () => {
  assert.match(checkoutApp, /<PaymentGateway[\s\S]*?quoteId=\{quoteId\}[\s\S]*?\/>/);
  assert.doesNotMatch(checkoutApp, /<PaymentGateway[\s\S]*?productId=/);
  assert.doesNotMatch(checkoutApp, /<PaymentGateway[\s\S]*?productIds=/);
  assert.doesNotMatch(checkoutApp, /<PaymentGateway[\s\S]*?updateSelection=/);
});

test("CheckoutApp passes orderId, paymentId, grantedEntitlementIds, purchaseKind, cashPaid to the success step", () => {
  const successBlock = checkoutApp.match(/<CheckoutSuccessStep[\s\S]*?\/>/);
  assert.ok(successBlock, "CheckoutApp must render <CheckoutSuccessStep>");
  const block = successBlock[0];
  assert.match(block, /orderId=\{/);
  assert.match(block, /paymentId=\{/);
  assert.match(block, /grantedEntitlementIds=\{/);
  assert.match(block, /purchaseKind=\{/);
  assert.match(block, /cashPaid=\{/);
  assert.match(block, /minimumPayable=\{/);
  assert.match(block, /currency=\{/);
});

test("CheckoutApp derives the quoteId from the canonical CheckoutContext", () => {
  assert.match(checkoutApp, /quoteId\s*=\s*quote\?\.quoteId/);
});

// ---------------------------------------------------------------------------
// CheckoutSuccessStep — renders real orderId, paymentId, line items,
// granted entitlements, cash paid, purchase kind
// ---------------------------------------------------------------------------

test("CheckoutSuccessStep renders a real orderId from the verify-payment response", () => {
  assert.match(checkoutSuccess, /orderId\?:\s*string\s*\|\s*null/);
  assert.match(checkoutSuccess, /<ReceiptRow\s+label="Order ID"\s+value=\{orderId \|\| quote\.quoteId\}/);
});

test("CheckoutSuccessStep renders a real paymentId from the verify-payment response", () => {
  assert.match(checkoutSuccess, /paymentId\?:\s*string\s*\|\s*null/);
  assert.match(checkoutSuccess, /<ReceiptRow\s+label="Payment ID"\s+value=\{paymentId \|\| "—"\}/);
});

test("CheckoutSuccessStep renders the granted entitlement ids with a data attribute", () => {
  assert.match(checkoutSuccess, /grantedEntitlementIds\?:\s*string\[\]/);
  assert.match(checkoutSuccess, /data-granted-entitlement-id=\{id\}/);
  assert.match(checkoutSuccess, /data-checkout-success-entitlements/);
});

test("CheckoutSuccessStep renders the cash-paid total", () => {
  assert.match(checkoutSuccess, /data-checkout-success-cash-paid/);
  assert.match(checkoutSuccess, /Cash paid/);
});

test("CheckoutSuccessStep renders the purchase kind", () => {
  assert.match(checkoutSuccess, /purchaseKind\?:\s*PurchaseKind/);
  assert.match(checkoutSuccess, /<ReceiptRow\s+label="Purchase kind"/);
  assert.match(checkoutSuccess, /PURCHASE_KIND_LABEL/);
});

test("CheckoutSuccessStep still renders itemised line items via CheckoutLineItemCard", () => {
  assert.match(checkoutSuccess, /<CheckoutLineItemCard/);
  assert.match(checkoutSuccess, /verifiedLineItems/);
});
