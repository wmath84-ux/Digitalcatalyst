import { pdpFixtureCatalog, pdpFixtureProduct } from "./products";
import { computeSummary } from "../../../utils/pdpSelection";

export async function apiFetch(_url: string, options: RequestInit = {}) {
  const params = new URLSearchParams(location.search);
  const body = JSON.parse(String(options.body || "{}"));
  const selection = body.selection || body;
  const global = window as Window & { quoteRequests?: unknown[] };
  (global.quoteRequests ||= []).push(selection);
  if (params.has("quoteError")) return { ok: false, status: 503, json: async () => ({ ok: false, error: "Pricing temporarily unavailable" }) };
  if (selection.couponCode === "INVALID") return { ok: false, status: 400, json: async () => ({ ok: false, error: "Invalid coupon" }) };
  if (params.has("couponFullOnly") && selection.couponCode && selection.purchaseKind !== "full_product") return { ok: false, status: 400, json: async () => ({ ok: false, error: "Coupon is only valid for the full product" }) };
  const base = pdpFixtureProduct(params);
  const product = selection.productIds?.includes(base.id) ? base : pdpFixtureCatalog(base, params).find((item) => selection.productIds?.includes(item.id)) || base;
  const ownedModuleIds = params.has("moduleOwned") ? ["algebra"] : [];
  const ownedResourceIds = params.has("resourceOwned") ? ["notebook"] : [];
  const summary = computeSummary({
    product: product.isFree || product.price === 0 ? { ...product, isFree: true } : product,
    mode: selection.purchaseKind,
    selectedIds: new Set(selection.purchaseKind === "paid_update" ? [selection.updateId] : selection.purchaseKind === "selected_modules" ? selection.moduleIds : selection.resourceIds),
    modules: product.canonicalModules || [], paidUpdates: product.paidUpdates || [],
    isProductOwned: params.has("owned"), ownedUpdateIds: [], ownedModuleIds, ownedResourceIds,
  });
  const regularSubtotal = Math.round(summary.regularSubtotal * 100);
  const effective = Math.round(summary.effectiveSubtotal * 100);
  const couponDiscount = selection.couponCode ? selection.couponCode === "SAVE10" ? Math.round(effective * 0.1) : Math.min(10000, effective) : 0;
  const minimumPayable = params.has("minimumCharge") && effective > 0 ? 100 : 0;
  const quote = {
    quoteId: `quote-${Date.now()}`, uid: "fixture", purchaseKind: selection.purchaseKind,
    verifiedLineItems: summary.lineItems.map((line) => ({ ...line, regularPrice: Math.round(line.regularPrice * 100), effectivePrice: Math.round(line.effectivePrice * 100), salePrice: line.salePrice === null ? null : Math.round(line.salePrice * 100) })),
    regularSubtotal, saleDiscount: regularSubtotal - effective,
    couponDiscount, cashPayable: Math.max(minimumPayable, effective - couponDiscount),
    minimumPayable, currency: "INR", expiresAt: Date.now() + 900000, status: "active",
    couponCode: selection.couponCode || null, couponType: selection.couponCode === "SAVE10" ? "percent" : "flat",
  };
  if (params.has("slowQuotes")) await new Promise((resolve) => setTimeout(resolve, selection.purchaseKind === "selected_modules" ? 600 : 40));
  return { ok: true, status: 200, json: async () => ({ ok: true, quote }) };
}
