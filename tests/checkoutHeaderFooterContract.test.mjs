import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const checkoutApp = read("src/components/checkout/CheckoutApp.tsx");
const paymentGateway = read("src/components/PaymentGateway.tsx");
const chrome = read("src/utils/razorpayCheckoutChrome.ts");
const header = read("src/components/Header.tsx");
const footer = read("src/components/BottomNav.tsx");
const css = read("src/index.css");

test("checkout page renders the shared Eduvora header and footer", () => {
  assert.match(checkoutApp, /import Header from "\.\.\/Header"/);
  assert.match(checkoutApp, /import BottomNav, \{ type TabKey \} from "\.\.\/BottomNav"/);
  assert.match(checkoutApp, /<Header[\s\S]*cartCount=\{cartIds\.size\}/);
  assert.match(checkoutApp, /<BottomNav active=\{null\} onChange=\{handleFooterChange\}/);
  assert.match(checkoutApp, /data-checkout-shell/);
  assert.match(header, /data-site-header/);
  assert.match(footer, /data-site-footer/);
});

test("checkout footer routes to the same store destinations as other pages", () => {
  assert.match(checkoutApp, /#\/home/);
  assert.match(checkoutApp, /#\/my-day/);
  assert.match(checkoutApp, /#\/store/);
  assert.match(checkoutApp, /#\/store\/purchases/);
  assert.match(checkoutApp, /#\/profile/);
  assert.match(checkoutApp, /#\/cart/);
  assert.match(checkoutApp, /#\/notifications/);
});

test("Razorpay checkout keeps the site header visible and insets the payment frame below it", () => {
  assert.match(paymentGateway, /revealCheckoutChromeOverRazorpay/);
  assert.match(paymentGateway, /checkout\.open\(\)/);
  assert.match(paymentGateway, /unpinChromeRef\.current = revealCheckoutChromeOverRazorpay\(\)/);
  assert.match(chrome, /eduvora-razorpay-open/);
  assert.match(chrome, /data-site-header/);
  assert.match(chrome, /data-checkout-shell/);
  assert.match(chrome, /razorpay-container/);
  assert.match(chrome, /razorpay-backdrop/);
  // The frame is anchored below the header, down to the bottom of the
  // viewport (top + bottom, never a pre-computed height) so the payment
  // page always gets the full remaining screen and scrolls internally.
  assert.match(chrome, /"top", `\$\{frameTop\}px`/);
  assert.match(chrome, /"bottom", "0"/);
  assert.match(chrome, /"height", "auto"/);
  // Layering: backdrop < payment frame < site header.
  assert.match(chrome, /HEADER_Z = "2147483000"/);
  assert.match(chrome, /CONTAINER_Z = "2147482001"/);
  assert.match(chrome, /BACKDROP_Z = "2147482000"/);
  assert.match(css, /body\.eduvora-razorpay-open \[data-site-header\]/);
  assert.match(css, /body\.eduvora-razorpay-open \.razorpay-container/);
  assert.match(css, /top: var\(--eduvora-header-h, 64px\) !important/);
  assert.match(css, /bottom: 0 !important/);
});

test("Razorpay chrome is released when checkout closes or the payment step unmounts", () => {
  assert.match(paymentGateway, /releaseCheckoutChrome/);
  assert.match(paymentGateway, /closeRazorpayCheckout/);
  assert.match(paymentGateway, /ondismiss/);
  assert.match(chrome, /restoreStyle/);
});
