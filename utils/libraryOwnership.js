// Library discovery is not the access guard: scoped purchases must be listed
// without being misrepresented as permanent full-product ownership.
export function collectLibraryProductIds(entries) {
  const full = new Set();
  const any = new Set();
  const kinds = new Set(["full_product", "selected_modules", "selected_resources", "paid_update", "free_entitlement"]);
  for (const data of Array.isArray(entries) ? entries : []) {
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    if ((data.status && data.status !== "active") || data.planId) continue;
    const id = data.productId === null || data.productId === undefined ? "" : String(data.productId).trim();
    if (!id || !kinds.has(data.kind)) continue;
    any.add(id);
    if (data.kind === "full_product" || data.kind === "free_entitlement") full.add(id);
  }
  return { full: [...full], any: [...any] };
}
