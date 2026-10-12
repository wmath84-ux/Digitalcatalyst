// tests/checkoutUiverseDesign.test.mjs
//
// Design contract for the checkout's cart/summary cart set and the PDP review
// dialog, both ported from MIT-licensed Uiverse references:
//
//   · https://uiverse.io/zanina-yassine/warm-bulldog-97 — the "Your cart" card
//     (product rows + coupons) and the "Checkout" card (details grid over a
//     tinted footer with the big price and the blue-gradient CTA)
//   · https://uiverse.io/Yaya12085/nasty-firefox-13 — the success animation card
//     that plays before the receipt
//   · https://uiverse.io/catraco/dry-bulldog-95 — the "Send feedback" card the
//     PDP's "Write a review" now opens
//
// Source-level only (the repo's node test runner has no layout engine), so each
// assertion pins a material fact of the port: the reference geometry, the rupee
// pricing (never dollars), the product thumbnail + title row, the module price
// tags for a scoped purchase, the animation → receipt order, and the free-order
// path never opening a transaction.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const css = read("src/components/checkout/checkout-uiverse.css");
const review = read("src/components/checkout/CheckoutReviewStep.tsx");
const cartList = read("src/components/checkout/CheckoutCartList.tsx");
const success = read("src/components/checkout/CheckoutSuccessStep.tsx");
const animation = read("src/components/checkout/CheckoutSuccessAnimation.tsx");
const app = read("src/components/checkout/CheckoutApp.tsx");
const gateway = read("src/components/PaymentGateway.tsx");
const reviewDialog = read("src/components/pdp/WriteReviewDialog.tsx");
const pdp = read("src/PdpApp.tsx");

// ── The reference card material ─────────────────────────────────────────────

test("checkout wears the reference cart/summary card geometry", () => {
  // `.cart { border-radius: 19px 19px 7px 7px }` / `.checkout { 9px 9px 19px 19px }`
  assert.match(css, /border-radius:\s*19px 19px 9px 9px/);
  assert.match(css, /border-radius:\s*9px 9px 19px 19px/);
  // `.title { height: 40px; … border-bottom: 1px solid #efeff3; font-size: 11px }`
  assert.match(css, /\.cu-title[\s\S]*?min-height:\s*40px/);
  assert.match(css, /\.cu-title[\s\S]*?border-bottom:\s*1px solid #efeff3/);
  // `.checkout .checkout--footer { background-color: #efeff3 }`
  assert.match(css, /\.cu-footer[\s\S]*?background-color:\s*#efeff3/);
  // `.price { font-size: 22px; font-weight: 900 }` with `sup` currency
  assert.match(css, /\.cu-price[\s\S]*?font-weight:\s*900/);
  assert.match(css, /\.cu-price > sup/);
  // `.coupons form button` / `.checkout .checkout-btn` blue gradient
  assert.match(css, /linear-gradient\(180deg, #4480ff 0%, #115dfc 50%, #0550ed 100%\)/);
  // The reference's own easing
  assert.match(css, /cubic-bezier\(0\.15, 0\.83, 0\.66, 1\)/);
});

test("the cart card and the summary card are the two blocks that wear it", () => {
  assert.match(css, /\[data-checkout-line-items\][\s\S]*?background:\s*#ffffff/);
  assert.match(css, /\[data-checkout-price-section\][\s\S]*?border-radius:\s*9px 9px 19px 19px/);
  // The free-order rail is re-cut into two stops rather than squeezed into three.
  assert.match(css, /\[data-checkout-stepbar\]\[data-steps="2"\][\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
});

// ── Rupees, never dollars ───────────────────────────────────────────────────

test("every price renders as rupees — the reference's dollar sign is not shipped", () => {
  assert.match(read("src/components/checkout/RupeePrice.tsx"), /<sup aria-hidden="true">₹<\/sup>/);
  assert.match(read("src/components/checkout/RupeePrice.tsx"), /paiseToRupees|Math\.floor\(safe \/ 100\)/);
  for (const source of [review, cartList, success, animation, reviewDialog]) {
    assert.doesNotMatch(source, /\$\d/, "a hard-coded dollar amount would contradict rupee pricing");
    assert.doesNotMatch(source, /"(?:USD|\$)\s*\$/);
  }
  // The whole checkout page still prices through the paise helpers.
  assert.match(review, /formatCheckoutMoney/);
  assert.match(cartList, /rupeeLabel\(/);
});

// ── Product rows: thumbnail + title, in a list ───────────────────────────────

test("a course line is a cover thumbnail + product title + price row", () => {
  // `grid-template-columns: 60px 1fr 80px 1fr` in the reference; here the row
  // is cover · copy · price.
  assert.match(css, /\.cu-item[\s\S]*?grid-template-columns:\s*60px minmax\(0, 1fr\) auto/);
  assert.match(css, /\.cu-thumb[\s\S]*?width:\s*60px[\s\S]*?height:\s*60px/);
  assert.match(cartList, /className="cu-item"/);
  assert.match(cartList, /<img src=\{image\} alt="" loading="lazy" decoding="async" \/>/);
  assert.match(cartList, /<h3>\{line\.title\}<\/h3>/);
  assert.match(cartList, /data-checkout-line-amount=\{line\.id\}/);
  assert.match(review, /<CheckoutCartRow key=\{line\.id\} line=\{line\} products=\{catalogProducts\} \/>/);
  // The quantity control is a read-only licence chip, not an editable stepper.
  assert.match(cartList, /data-checkout-line-units/);
  assert.doesNotMatch(cartList, /onQuantityChange|onAddOne|onRemoveOne/);
});

test("an individual purchase lists every module with its own price tag", () => {
  assert.match(cartList, /data-checkout-module-list=\{kind\}/);
  assert.match(cartList, /className="cu-price-tag"/);
  assert.match(css, /\.cu-price-tag[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  for (const kind of ["selected_modules", "selected_resources", "paid_update"]) {
    assert.match(
      review,
      new RegExp(`<CheckoutModuleList\\s+kind="${kind}"\\s+lines=\\{linesOfKind\\("${kind}"\\)\\}`)
    );
  }
  // The list is the record of the order, so an already-owned module stays in it
  // (tagged ₹0) instead of disappearing from the list the buyer is checking.
  assert.match(review, /const linesOfKind = \(kind: CheckoutLineItem\["kind"\]\) =>/);
  assert.match(review, /lineItems\.filter\(\(line\) => line\.kind === kind\)/);
  assert.match(cartList, /"Already owned · ₹0"/);
  // A scoped purchase never renders the cart rows for the whole course.
  assert.match(review, /productLines\.length > 0 && kind !== "cart_bundle"/);
});

// ── Coupons + the commitment footer ─────────────────────────────────────────

test("the coupon row is stamped into the cart card like the reference", () => {
  const couponSection = review.slice(review.indexOf("function CouponCard"));
  assert.match(couponSection, /className="cu-coupons"/);
  assert.doesNotMatch(couponSection, /<CheckoutSection data-checkout-coupon/);
  assert.match(couponSection, /placeholder="Apply coupons"/);
  assert.match(review, /<CheckoutSection data-checkout-line-items>[\s\S]*?<CouponCard/);
});

test("the summary footer pairs the big total with the single commitment CTA", () => {
  assert.match(review, /className="cu-footer"/);
  assert.match(review, /<RupeePrice paise=\{finalTotal\} \/>/);
  // `data-checkout-final-total` still sits inside the price section, and the
  // commitment button keeps the one proceed hook other suites click.
  assert.match(
    review,
    /<CheckoutSection data-checkout-price-section>[\s\S]*?data-checkout-final-total[\s\S]*?<\/CheckoutSection>/
  );
  assert.match(review, /data-checkout-proceed=""/);
  assert.equal((review.match(/data-checkout-proceed=/g) || []).length, 1, "one commitment CTA");
  assert.match(review, /label=\{finalTotal === 0 \? "Get free access" : "Checkout"\}/);
});

// ── Success: animation first, then the receipt ──────────────────────────────

test("the success animation fully exits before the receipt is revealed", () => {
  assert.match(success, /type SuccessPhase = "animation" \| "transition" \| "receipt"/);
  assert.match(success, /const \[phase, setPhase\] = useState<SuccessPhase>\("animation"\)/);
  assert.match(success, /data-success-phase=\{phase\}/);
  assert.match(success, /<CheckoutSuccessAnimation/);
  assert.match(success, /primaryLabel=\{isFreeOrder \? "View access record" : "View receipt"\}/);
  assert.match(success, /onPrimary=\{\(\) => setPhase\("transition"\)\}/);
  assert.match(success, /onExitComplete=\{\(\) => \{/);
  assert.match(success, /current === "transition" \? "receipt" : current/);
  // The receipt stays in the DOM for stable hooks but remains display:none
  // throughout the animation and its exit; only the completed exit reveals it.
  assert.match(success, /style=\{\{ display: phase === "receipt" \? undefined : "none" \}\}/);
  assert.match(success, /animate=\{phase === "receipt" \? \{ opacity: 1, y: 0 \} : \{ opacity: 0, y: 12 \}\}/);
  assert.match(success, /data-checkout-success-receipt/);
  assert.equal((success.match(/data-checkout-success-receipt\b/g) || []).length, 1, "one receipt hook");
  // The reference animation itself: the pulsing 3rem plate over the 2rem glyph.
  assert.match(animation, /cu-success-plate/);
  assert.match(css, /@keyframes cuSuccessPulse/);
  assert.match(css, /animation:\s*cuSuccessPulse 0\.6s linear alternate-reverse infinite/);
  assert.match(css, /\.cu-success-primary[\s\S]*?background-color:\s*#1aa06d/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?cu-success-plate[\s\S]*?animation:\s*none/);
});

test("the success card keeps the reference's corner dismiss", () => {
  // `nasty-firefox-13` ships a × in the corner: 30px plate, 2px border, red hover.
  assert.match(animation, /data-checkout-success-dismiss=""/);
  assert.match(animation, /dismissLabel = "Dismiss and view receipt"/);
  assert.match(animation, /aria-label=\{dismissLabel\}/);
  assert.match(success, /dismissLabel=\{isFreeOrder \? "Dismiss and view access record" : "Dismiss and view receipt"\}/);
  assert.match(animation, /onClick=\{onDismiss\}/);
  assert.match(css, /\.cu-success-dismiss[\s\S]*?border:\s*2px solid #d1d5db[\s\S]*?border-radius:\s*7px/);
  assert.match(css, /\.cu-success-dismiss:hover[\s\S]*?background-color:\s*#ee0d0d/);
  // The card is the positioning context the × hangs off.
  assert.match(css, /\.cu-success,[\s\S]*?position:\s*relative/);
  // And it never cancels a verified purchase — it jumps to the receipt.
  assert.match(success, /onDismiss=\{\(\) => setPhase\("transition"\)\}/);
  assert.match(success, /onPrimary=\{\(\) => setPhase\("transition"\)\}/);
  assert.doesNotMatch(success, /onDismiss=\{[^}]*onGoBackToSource/);
});

// ── Free orders never open a transaction ────────────────────────────────────

test("a ₹0 order is an Access step, never a transaction", () => {
  assert.match(app, /const isFreeOrder = Boolean\(quote\) && finalPrice <= 0 && \(quote\?\.minimumPayable \|\| 0\) <= 0/);
  assert.match(app, /const FREE_STEPS = \[\{ label: "Review" \}, \{ label: "Access" \}\]/);
  assert.match(app, /freeAccess=\{isFreeOrder\}/);
  // The rail drops the Payment stop and the page stops calling itself Checkout.
  assert.match(app, /\{isFreeOrder \? "Free access" : "Checkout"\}/);
  // The free branch runs the same server pair and never loads Razorpay.
  assert.match(gateway, /if \(order\.free\) \{/);
  assert.match(gateway, /playPaymentSuccessChime\(\);/);
  assert.match(gateway, /data-free-access=\{freeAccess \? "true" : "false"\}/);
  assert.match(gateway, /freeAccess \? "Nothing to pay" : finalPrice === 0 \? "Amount payable"/);
  assert.match(gateway, /freeAccess\s*\n?\s*\? "Free order — there is no transaction to complete or cancel/);
  assert.match(gateway, /freeAccess\s*\n?\s*\? "No money moves here\. Access is granted the moment the server confirms the claim\."/);
  // The claim is the buyer's own tap — the copy names it as access, not payment.
  assert.match(gateway, /freeAccess && paymentState === "error"/);
  assert.match(gateway, /: payLabel\b/);
  assert.match(review, /Free item · no payment or transaction is needed\./);
  assert.match(review, /label=\{finalTotal === 0 \? "Get free access" : "Checkout"\}/);
  assert.match(success, /No payment or payment transaction is needed — your access is now part of your library\./);
  assert.match(success, /\{isFreeOrder \? "Access record" : "Receipt"\}/);
  assert.match(success, /isFreeOrder \? "Access reference" : "Order ID"/);
  assert.match(success, /Your free access is active in My Purchases\./);
});

// ── The PDP review dialog ───────────────────────────────────────────────────

test("Write a review opens the reference feedback card as a modal", () => {
  assert.match(pdp, /import WriteReviewDialog from "\.\/components\/pdp\/WriteReviewDialog"/);
  assert.match(pdp, /\{composerOpen && canReview && \(/);
  assert.match(pdp, /<WriteReviewDialog/);
  // The card keeps the reference's 6-column grid, its control material and its
  // paper-plane send button.
  assert.match(reviewDialog, /grid grid-cols-6 gap-2 rounded-xl border border-slate-200 bg-white p-2 text-sm/);
  assert.match(reviewDialog, /col-span-6 h-28 resize-none rounded-lg border border-slate-200 bg-slate-100/);
  assert.match(reviewDialog, /focus:border-slate-600/);
  assert.match(reviewDialog, /col-span-1 flex items-center justify-center rounded-lg border p-2/);
  assert.match(reviewDialog, /data-pdp-review-rating=\{value\}/);
  assert.match(reviewDialog, /Very unhappy/);
  assert.match(reviewDialog, /viewBox="0 0 24 24"/);
  assert.match(reviewDialog, /M7\.39999 6\.32003L15\.89 3\.49003/);
  assert.match(reviewDialog, /className="col-span-2 flex items-center justify-center rounded-lg border/);
  assert.match(reviewDialog, /aria-label=\{submitting \? "Submitting review" : "Submit review"\}/);
  assert.match(reviewDialog, /<h1[\s\S]*?Send feedback/);
  // It is a real modal: labelled dialog, Escape, scroll lock, visible close.
  assert.match(reviewDialog, /role="dialog"/);
  assert.match(reviewDialog, /aria-modal="true"/);
  assert.match(reviewDialog, /aria-labelledby=\{headingId\}/);
  assert.match(reviewDialog, /event\.key === "Escape"/);
  assert.match(reviewDialog, /event\.key !== "Tab"/);
  assert.match(reviewDialog, /previousFocus\?\.isConnected/);
  assert.match(reviewDialog, /lockBodyScroll\(\)/);
  assert.match(reviewDialog, /aria-label="Close review form"/);
});

test("the review dialog keeps the accessible names the review journey is driven by", () => {
  assert.match(reviewDialog, /aria-label=\{`\$\{value\} star\$\{value === 1 \? "" : "s"\} — \$\{label\}`\}/);
  assert.match(reviewDialog, /aria-label="Your product review"/);
  assert.match(pdp, /notice=\{notice\}/);
  assert.match(reviewDialog, /role="status" aria-live="polite"/);
  assert.match(reviewDialog, /aria-label=\{submitting \? "Submitting review" : "Submit review"\}/);
  assert.match(reviewDialog, /title=\{label\}/);
  // Rendered inside the reviews section, so the status line stays in one region.
  assert.match(pdp, /<section data-pdp-reviews[\s\S]*?\{composerOpen && canReview && \(/);
  assert.doesNotMatch(reviewDialog, /createPortal/);
});
