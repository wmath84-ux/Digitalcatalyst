// Deterministic network boundary only; the UI, checkout context and handlers
// under test are the production implementations.
import type {
  CheckoutLineItem,
  CheckoutSelection,
  ServerPriceQuote,
} from "../../../src/types/commerce";
import { catalog, products } from "./data";
import { resolveFeaturePrice } from "../../../utils/featurePricing";
const params = new URLSearchParams(location.search);
const state = window as typeof window & {
  fixtureRequests: { url: string; body: Record<string, unknown> }[];
  fixtureQuote: ServerPriceQuote;
  fixtureFaults: Record<string, boolean>;
  fixtureRazorpay?: unknown;
  fixtureQuoteCount: number;
};
state.fixtureRequests = [];
state.fixtureQuoteCount = 0;
state.fixtureFaults = {
  quote: params.has("quoteError"),
  order: params.has("orderError"),
  verify: params.has("verifyError"),
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const line = (
  id: string,
  title: string,
  kind: CheckoutLineItem["kind"],
  current: number,
  original = current,
  extra = {}
): CheckoutLineItem => ({
  id,
  title,
  kind,
  productId: "alpha-doc",
  parentTitle: "Waves and optics",
  moduleId: null,
  resourceId: null,
  updateId: null,
  subscriptionPlanId: null,
  featureId: null,
  regularPrice: original,
  salePrice: original > current ? current : null,
  effectivePrice: current,
  quantity: 1,
  alreadyOwned: false,
  entitlementId: id,
  ...extra,
});
export function selectionForFixture(): CheckoutSelection {
  const membership = params.has("subscription");
  return {
    purchaseKind: membership
      ? "subscription"
      : params.has("update")
      ? "paid_update"
      : "selected_modules",
    productIds: membership ? ["alpha-doc"] : ["alpha-doc"],
    moduleIds: membership ? [] : ["waves", "optics"],
    resourceIds: [],
    updateId: params.has("update") ? "update1" : null,
    subscriptionPlanId: membership ? "premium" : null,
    billingCycle: membership ? "monthly" : null,
    featureIds: membership ? ["my-day", "revision", "notes"] : [],
    couponCode: null,
    returnRoute: "#/source",
  };
}
export function quoteFor(selection: CheckoutSelection): ServerPriceQuote {
  let lines: CheckoutLineItem[];
  const subscription = selection.purchaseKind === "subscription";
  if (subscription) {
    const plan = catalog.plans.find((plan) => plan.id === selection.subscriptionPlanId)!;
    lines = [
      line(
        "subscription:plan",
        plan.name,
        "subscription",
        params.has("addon")
          ? 0
          : selection.billingCycle === "yearly"
          ? plan.yearlyPricePaise
          : plan.monthlyPricePaise,
        undefined,
        { productId: null, parentTitle: plan.description, subscriptionPlanId: plan.id }
      ),
    ];
    for (const id of selection.featureIds) {
      const feature = catalog.features.find((feature) => feature.id === id);
      if (!feature || feature.included) continue;
      const price = resolveFeaturePrice(feature, plan.id, selection.billingCycle).pricePaise;
      lines.push(
        line(
          `feature:${id}`,
          params.has("quotedNames") && id === "my-day" ? "Quoted task workspace" : feature.name,
          "subscription_features",
          params.has("addon") && id === "my-day" ? 0 : price,
          undefined,
          {
            productId: null,
            featureId: id,
            subscriptionPlanId: plan.id,
            alreadyOwned: params.has("addon") && id === "my-day",
          }
        )
      );
    }
    for (const id of selection.productIds) {
      const product = products.find((product) => product.id === id || product.documentId === id);
      if (product)
        lines.push(
          line(
            `product:${id}`,
            params.has("quotedNames") ? "Quoted waves course" : product.title,
            "subscription_features",
            Math.round(product.price * 100),
            Math.round(product.originalPrice * 100),
            { productId: id }
          )
        );
    }
    lines.push(
      line("product:bonus", "Plan unlock: bonus", "subscription_features", 0, 0, {
        productId: "bonus",
      })
    );
    if (params.has("moduleUnlocks")) {
      for (const moduleId of ["waves", "optics"]) {
        lines.push(
          line(
            `subscription_unlock:${plan.id}:module:alpha-doc:${moduleId}`,
            params.has("quotedNames") && moduleId === "optics"
              ? "Server-quoted optics lesson"
              : `Plan unlock: module ${moduleId}`,
            "subscription_features",
            0,
            0,
            {
              productId: "alpha-doc",
              moduleId,
              parentTitle:
                moduleId === "optics" && params.has("quotedNames")
                  ? "Quoted optics course"
                  : plan.name,
              entitlementId: `subscription_module_unlock:${plan.id}:alpha-doc:${moduleId}`,
            }
          )
        );
      }
    }
  } else if (params.has("update"))
    lines = [
      line("update1", "Advanced revision update", "paid_update", 19995, 24995, {
        updateId: "update1",
        detailItems: ["Wave practice module", "Revision PDF", "Answer explanations"],
      }),
    ];
  else
    lines = [
      line(
        "waves",
        params.has("long")
          ? "Wave module with a comprehensive descriptive title ".repeat(4)
          : "Wave motion",
        "selected_modules",
        9995,
        14995,
        { moduleId: "waves" }
      ),
      line("optics", "Ray optics", "selected_modules", 12995, 17995, { moduleId: "optics" }),
      line("owned", "Already-owned introduction", "selected_modules", 0, 0, {
        moduleId: "intro",
        alreadyOwned: true,
      }),
    ];
  if (params.has("free"))
    lines = lines.map((item) => ({ ...item, effectivePrice: 0, regularPrice: 0, salePrice: null }));
  const regularSubtotal = lines.reduce(
    (sum, item) => sum + (item.alreadyOwned ? 0 : item.regularPrice),
    0
  );
  const saleDiscount = lines.reduce(
    (sum, item) => sum + (item.alreadyOwned ? 0 : item.regularPrice - item.effectivePrice),
    0
  );
  const available = regularSubtotal - saleDiscount;
  const couponDiscount = selection.couponCode
    ? Math.min(available, selection.couponCode === "ZERO" ? available : 2500)
    : 0;
  const expiresAt =
    params.has("expiresSoon") && state.fixtureQuoteCount === 0
      ? Date.now() + 1400
      : Date.now() + 300000;
  state.fixtureQuoteCount += 1;
  const quote: ServerPriceQuote = {
    quoteId: `quote-${state.fixtureQuoteCount}`,
    uid: "fixture",
    purchaseKind: selection.purchaseKind,
    verifiedLineItems: lines,
    regularSubtotal,
    saleDiscount,
    couponDiscount,
    cashPayable: available - couponDiscount,
    minimumPayable: 0,
    currency: "INR",
    expiresAt,
    status: "active",
    couponCode: selection.couponCode,
    couponType: selection.couponCode ? "flat" : null,
    couponValue: selection.couponCode ? couponDiscount : null,
    subscriptionPlanId: selection.subscriptionPlanId,
    subscriptionCycle: selection.billingCycle,
    subscriptionFeatureIds: selection.featureIds,
    subscriptionProductIds: selection.productIds,
    subscriptionExpiresAt: subscription ? Date.now() + 86400000 * 30 : null,
    subscriptionAddOn: params.has("addon"),
  };
  state.fixtureQuote = quote;
  return quote;
}
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const body = options.body ? JSON.parse(String(options.body)) : {};
  state.fixtureRequests.push({ url, body });
  if (url === "/api/subscription-catalog") {
    if (params.has("catalogLoading")) await new Promise(() => {});
    return params.has("catalogError")
      ? response({ ok: false, error: "Catalog temporarily unavailable" }, 503)
      : response({ ok: true, catalog });
  }
  if (url === "/api/subscription-coupon") {
    if (body.couponCode === "SLOW") await new Promise((resolve) => setTimeout(resolve, 650));
    return body.couponCode === "BAD"
      ? response({ ok: false, error: "Code does not apply to these items" }, 400)
      : response({
          ok: true,
          discountPaise:
            body.couponCode === "ZERO" ? 999999 : body.couponCode === "SLOW" ? 10000 : 2500,
        });
  }
  if (url === "/api/subscription-referral")
    return body.referralCode === "USED"
      ? response(
          { ok: false, error: "This referral has already used its allowance; it is already used" },
          400
        )
      : response({ ok: true, code: body.referralCode, discountPaise: 25000 });
  if (url === "/api/quotes/create") {
    if (params.has("quoteLoading")) await new Promise(() => {});
    if (state.fixtureFaults.quote)
      return response(
        { ok: false, error: "Secure price unavailable", code: "service_unavailable" },
        503
      );
    if (params.has("invalid"))
      return response(
        { ok: false, error: "This selection is unavailable", code: "selection_invalid" },
        400
      );
    if (body.selection.couponCode === "BAD")
      return response(
        { ok: false, error: "Coupon is not applicable", code: "coupon_invalid" },
        400
      );
    return response({ ok: true, quote: quoteFor(body.selection) });
  }
  if (url === "/api/razorpay/create-order")
    return state.fixtureFaults.order
      ? response({ ok: false, error: "Could not create secure order" }, 503)
      : response({
          ok: true,
          free: state.fixtureQuote.cashPayable === 0,
          orderId: "order-fixture",
          amount: state.fixtureQuote.cashPayable,
          currency: "INR",
          keyId: "fixture-public-key",
          productName: "Selected study content",
        });
  if (url === "/api/razorpay/verify-payment")
    return state.fixtureFaults.verify
      ? response(
          { ok: false, error: "Payment could not be verified. Please retry or contact support." },
          503
        )
      : response({
          ok: true,
          verified: true,
          orderId: "order-fixture",
          paymentId: body.free ? null : "pay-fixture",
          free: Boolean(body.free),
          grantedEntitlementIds: ["fixture:access:" + "long-reference-".repeat(12)],
        });
  return response({ ok: false, error: "Unmocked fixture endpoint" }, 404);
}
