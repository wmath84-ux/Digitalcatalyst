// Content scope is shared by the client access resolver and verified checkout.
// A product id on a MODULE / UPDATE receipt is provenance, not a full grant.
export const isPaidContent = (item) => Boolean(item && typeof item === "object" && (
  item.accessLevel === "paid_update" || item.accessLevel === "paidUpdate" || item.paidUpdateId
));
export const isBundleIncluded = (module) => Boolean(module && module.includeInBundle !== false && !isPaidContent(module));

export function ownershipTimestamp(value) {
  let number = 0;
  try {
    if (value && typeof value.toMillis === "function") number = value.toMillis();
    else if (value && typeof value === "object" && typeof (value.seconds ?? value._seconds) === "number") number = (value.seconds ?? value._seconds) * 1000;
    else if (typeof value === "number") number = value;
    else if (typeof value === "string" && value.trim()) {
      const numeric = Number(value);
      number = Number.isFinite(numeric) ? numeric : /^\d{4}-\d{2}-\d{2}/.test(value) ? Date.parse(value) : 0;
    }
  } catch { return 0; }
  return Number.isFinite(number) ? number : 0;
}

export function isActiveOwnershipRecord(record, now = Date.now()) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  if (record.status !== undefined && record.status !== null) {
    if (typeof record.status !== "string" || !["active", "verified", "paid", "completed"].includes(record.status.trim().toLowerCase())) return false;
  }
  if (record.expiresAt === undefined || record.expiresAt === null) return true;
  return ownershipTimestamp(record.expiresAt) > now;
}

export function isFullProductPurchase(record) {
  if (!record || typeof record !== "object" || record.updateId || record.moduleId || record.resourceId) return false;
  const kind = record.kind || record.purchaseKind;
  if (kind) return ["full_product", "free_entitlement", "free", "cart_bundle"].includes(kind);
  // Legacy base receipts have no kind; explicitly scoped arrays still disqualify.
  if (record.moduleIds?.length || record.resourceIds?.length || record.updateIds?.length) return false;
  return Boolean(record.productDocumentId || record.productId);
}

/** Visibility is inherited down the tree. A hidden/draft parent's descendants
 * must not leak into a paid list or an individual-content selector. */
export function visibleContentModules(tree) {
  const out = [];
  const visit = (module, parentId = null) => {
    if (!module || typeof module !== "object" || module.active === false || module.visibility === "hidden" || module.accessLevel === "hidden") return;
    out.push({ ...module, parentModuleId: module.parentModuleId || parentId });
    for (const child of Array.isArray(module.modules) ? module.modules : []) visit(child, String(module.id));
  };
  for (const module of Array.isArray(tree) ? tree : []) visit(module);
  return out;
}

/** Shared catalogue-only scope mapping. Pricing still comes from verified
 * quotes. Membership and ancestor boundaries must agree in selectors, Paid,
 * access and checkout, including legacy files and resource-only updates. */
export function commerceContentTree(product) {
  const list = (value) => Array.isArray(value) ? value : [];
  const source = list(product?.canonicalModules).length ? product.canonicalModules
    : list(product?.adminProduct?.modules).length ? product.adminProduct.modules : list(product?.courseContent);
  const moduleUpdates = new Map();
  const resourceUpdates = new Map();
  for (const update of list(product?.paidUpdates)) {
    if (!update || update.active === false || update.visibility === "hidden") continue;
    for (const id of list(update.includedModuleIds)) moduleUpdates.set(String(id), String(update.id));
    for (const id of list(update.includedResourceIds)) resourceUpdates.set(String(id), String(update.id));
  }
  const map = (nodes, parentId = null, excluded = false, hidden = false, inheritedUpdate = null) => list(nodes)
    .filter((module) => module && typeof module === "object").map((module) => {
      const parentHidden = hidden || module.visibility === "hidden" || module.active === false || module.accessLevel === "hidden";
      const updateId = moduleUpdates.get(String(module.id)) || module.paidUpdateId || inheritedUpdate;
      const mapped = updateId ? { ...module, paidUpdateId: updateId } : module;
      const parentExcluded = excluded || !isBundleIncluded(mapped);
      const resources = list(module.resources?.length ? module.resources : module.files)
        .filter((resource) => resource && typeof resource === "object").map((resource) => {
          const resourceUpdate = resourceUpdates.get(String(resource.id)) || resource.paidUpdateId || updateId;
          return { ...resource, parentModuleId: String(module.id), ...(resourceUpdate ? { paidUpdateId: resourceUpdate } : {}),
            ...(parentHidden ? { visibility: "hidden" } : {}) };
        });
      return { ...mapped, parentModuleId: module.parentModuleId || parentId,
        ancestorExcludedFromBundle: excluded, ...(parentHidden ? { visibility: "hidden" } : {}), resources,
        modules: map(module.modules, String(module.id), parentExcluded, parentHidden, updateId) };
    });
  return map(source);
}

/** Canonical records are unique per UID + entitlement ID. Their existence is
 * current scope authority even when revoked/expired; legacy mirror arrays or
 * receipts cannot resurrect that same grant. Independent scopes/subscriptions
 * remain untouched and active canonical grants still win normally. */
export function canonicalOwnershipScopes(records) {
  const out = { full: false, updates: new Set(), modules: new Set(), resources: new Set() };
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || record.planId || record.subscriptionPlanId || record.source === "subscription") continue;
    const kind = record.kind || record.purchaseKind;
    if (["full_product", "free_entitlement", "free", "cart_bundle"].includes(kind) && isFullProductPurchase(record)) out.full = true;
    if (kind === "paid_update" && record.updateId) out.updates.add(String(record.updateId));
    if (["module", "selected_modules"].includes(kind)) for (const id of [record.moduleId, ...(Array.isArray(record.moduleIds) ? record.moduleIds : [])].filter(Boolean)) out.modules.add(String(id));
    if (["resource", "selected_resources"].includes(kind)) for (const id of [record.resourceId, ...(Array.isArray(record.resourceIds) ? record.resourceIds : [])].filter(Boolean)) out.resources.add(String(id));
  }
  return out;
}

export function filterLegacyOwnershipRecord(record, canonical) {
  if (!record || (isFullProductPurchase(record) && canonical.full)) return null;
  if (record.updateId && canonical.updates.has(String(record.updateId))) return null;
  if (record.moduleId && canonical.modules.has(String(record.moduleId))) return null;
  if (record.resourceId && canonical.resources.has(String(record.resourceId))) return null;
  const mapped = { ...record };
  for (const [field, scopes] of [["moduleIds", canonical.modules], ["resourceIds", canonical.resources], ["updateIds", canonical.updates]]) {
    if (Array.isArray(record[field])) {
      mapped[field] = record[field].filter((id) => !scopes.has(String(id)));
      if (record[field].length && !mapped[field].length) return null;
    }
  }
  return mapped;
}
