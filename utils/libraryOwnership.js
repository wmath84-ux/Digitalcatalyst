import { isActiveOwnershipRecord, isFullProductPurchase } from "./contentOwnership.js";
// Library discovery is not the access guard: scoped purchases must be listed
// without being misrepresented as permanent full-product ownership.
export function collectLibraryProductIds(entries, now = Date.now()) {
  const full = new Set();
  const any = new Set();
  const kinds = new Set(["full_product", "module", "resource", "selected_modules", "selected_resources", "paid_update", "free_entitlement", "free", "cart_bundle"]);
  for (const data of Array.isArray(entries) ? entries : []) {
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    if (!isActiveOwnershipRecord(data, now) || data.planId || data.subscriptionPlanId || data.source === "subscription") continue;
    const id = data.productId === null || data.productId === undefined ? "" : String(data.productId).trim();
    if (!id || !kinds.has(data.kind)) continue;
    any.add(id);
    if (isFullProductPurchase(data)) full.add(id);
  }
  return { full: [...full], any: [...any] };
}
