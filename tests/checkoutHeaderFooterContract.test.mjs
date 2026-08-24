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

test("Razorpay checkout opens full screen with no extra close buttons", () => {
  assert.match(paymentGateway, /revealCheckoutChromeOverRazorpay/);
  assert.match(paymentGateway, /checkout\.open\(\)/);
  assert.match(paymentGateway, /unpinChromeRef\.current = revealCheckoutChromeOverRazorpay\(\)/);
  assert.match(chrome, /eduvora-razorpay-open/);
  assert.match(chrome, /razorpay-container/);
  assert.match(chrome, /razorpay-backdrop/);
  // Full-screen frame: live visual viewport, not inset under the site header.
  assert.match(chrome, /visualViewport/);
  assert.match(chrome, /inset: "0"/);
  assert.match(chrome, /top: `\$\{top\}px`/);
  assert.match(chrome, /height: `\$\{height\}px`/);
  // No custom Cancel-payment bar / confirm sheet — Razorpay's native × is enough.
  assert.doesNotMatch(chrome, /Cancel payment/);
  assert.doesNotMatch(chrome, /eduvora-razorpay-exit-bar/);
  assert.doesNotMatch(chrome, /eduvora-razorpay-exit-confirm/);
  assert.doesNotMatch(chrome, /prepareCheckoutChrome/);
  assert.doesNotMatch(paymentGateway, /prepareCheckoutChrome/);
  // Closing without paying is a single gesture (×, backdrop, Esc, system Back).
  assert.match(paymentGateway, /confirm_close: false/);
  assert.match(paymentGateway, /backdropclose: true/);
  assert.match(paymentGateway, /escape: true/);
  assert.match(paymentGateway, /dismissWithoutPaying/);
  assert.match(css, /body\.eduvora-razorpay-open \.razorpay-container/);
  assert.match(css, /inset: 0 !important/);
  assert.match(css, /top: 0 !important/);
  assert.match(css, /bottom: 0 !important/);
});

test("Razorpay chrome is released when checkout closes or the payment step unmounts", () => {
  assert.match(paymentGateway, /releaseCheckoutChrome/);
  assert.match(paymentGateway, /closeRazorpayCheckout/);
  assert.match(paymentGateway, /ondismiss/);
  assert.match(chrome, /document\.body\.classList\.remove\(OPEN_CLASS\)/);
});

test("system Back while Razorpay is open only closes the checkout", () => {
  assert.match(checkoutApp, /eduvora-razorpay-open/);
  assert.match(checkoutApp, /document\.body\.classList\.contains\("eduvora-razorpay-open"\)/);
  assert.match(paymentGateway, /handleback: false/);
});
