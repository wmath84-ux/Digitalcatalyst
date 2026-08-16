// utils/pdpSelection.js
//
// Pure helpers for the customer-facing Product Detail Page purchase builder.
// No DOM, no Firebase, no React. Imported by:
//   - `src/components/pdp/PdpPurchaseBuilder.tsx` (React UI)
//   - `tests/pdpSelection.test.mjs` (node --test)
//
// The builder supports three purchase modes against a single product:
//   - "full_product"      — buy the whole course (existing PDP behaviour).
//   - "selected_modules"  — pick individual `individuallyPurchasable` modules.
//   - "selected_resources"— pick individual `individuallyPurchasable` resources.
//   - "paid_update"       — a published paid update (only available when the
//                           base product is already owned).
//
// Every selection becomes a canonical `CheckoutSelection` (see
// `src/types/commerce.ts` Part 1) so the future Razorpay endpoint can verify
// the line items server-side without trusting the client.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []);

const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = typeof v === "string" ? v.replace(/[^0-9.-]/g, "") : null;
  if (typeof v === "string") {
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  return null;
};
const num = (v) => {
  const n = numOrNull(v);
  return n === null ? 0 : n;
};

// ---------------------------------------------------------------------------
// Tree walk
// ---------------------------------------------------------------------------

/**
 * Flatten the canonical module tree into an ordered list of all modules
 * (root → nested). Children are visited depth-first so the result preserves
 * the visual order the admin built in the editor.
 */
export const flattenModules = (tree) => {
  const out = [];
  const visit = (m) => {
    if (!isObject(m)) return;
    out.push(m);
    arr(m.modules).forEach(visit);
  };
  arr(tree).forEach(visit);
  return out;
};

/**
 * Decide which purchase modes are available for the current user/product.
 */
export const getAvailableModes = ({ isProductOwned, hasAnyPurchasableModule, hasAnyPurchasableResource, hasAnyPaidUpdate }) => {
  const modes = [];
  if (!isProductOwned) modes.push("full_product");
  if (hasAnyPurchasableModule) modes.push("selected_modules");
  if (hasAnyPurchasableResource) modes.push("selected_resources");
  if (isProductOwned && hasAnyPaidUpdate) modes.push("paid_update");
  return modes;
};

// ---------------------------------------------------------------------------
// Module selection
// ---------------------------------------------------------------------------

/**
 * Filter a flat module list down to the modules the user can actually see in
 * the module selector. Hidden, inactive, and `paid_update` modules are
 * excluded (paid-update modules surface separately as their own
 * `CanonicalPaidUpdate[]` list).
 *
 *   - visibility === "hidden"          → drop
 *   - active === false                  → drop
 *   - accessLevel === "hidden"          → drop
 *   - accessLevel === "paid_update"     → drop (it appears in the paid-updates list)
 *   - `individuallyPurchasable`         → keep
 *   - accessLevel === "purchasable"     → keep
 *   - accessLevel === "included"        → keep (shown under Full Course and
 *                                         selectable a la carte on the PDP)
 */
export const getVisibleModules = (modules) => {
  return arr(modules).filter((m) => {
    if (!isObject(m)) return false;
    if (m.visibility === "hidden") return false;
    if (m.active === false) return false;
    if (m.accessLevel === "hidden") return false;
    if (m.accessLevel === "paid_update") return false;
    return true;
  });
};

/**
 * Modules the user can pick a la carte. Every visible course module is
 * selectable so a learner can buy only the parts they need — matching the
 * subscription feature picker. Nested modules are flattened first.
 */
export const getPurchasableModules = (modules) => {
  return getVisibleModules(flattenModules(modules));
};

/**
 * Modules that are included in the Full Course bundle. They show up in the
 * "Full Course includes" panel but cannot be selected individually.
 */
export const getBundleModules = (modules) => {
  return getVisibleModules(modules).filter((m) => m.includeInBundle !== false);
};

/**
 * Map a canonical module to the effective cash price (sale wins when valid).
 * `null` means the module has no standalone price (it must be bought as part
 * of the bundle).
 *
 * Negative or NaN values are treated as invalid → returns null so the UI
 * can hide the price chip rather than display `-₹10`.
 */
export const getModuleEffectivePrice = (module, fallbackPrice = null) => {
  if (!isObject(module)) return null;
  const cash = numOrNull(module.cashPrice);
  if (cash === null || cash < 0) {
    const fallback = numOrNull(fallbackPrice);
    return fallback === null || fallback < 0 ? null : fallback;
  }
  const sale = numOrNull(module.salePrice);
  if (sale === null || sale < 0) return cash;
  return Math.min(sale, cash);
};

/** Share of the product price used when a module has no cash price of its own. */
export const getModuleFallbackPrice = (product, modules) => {
  const visible = getPurchasableModules(modules);
  const productPrice = numOrNull(product?.price) ?? numOrNull(product?.originalPrice);
  if (productPrice === null || productPrice < 0 || visible.length === 0) return 0;
  return Math.max(0, Math.round(productPrice / visible.length));
};

/**
 * Return the dependency IDs a given module is blocked by (i.e. those that
 * must be selected for this one to be selectable).
 */
export const getModuleDependencies = (module) => {
  if (!isObject(module)) return [];
  return arr(module.requiredPreviousModuleIds).map(String);
};

/**
 * Given a set of selected module ids and a module list, return the missing
 * dependencies that block the selection.
 */
export const getUnsatisfiedDependencies = (module, selectedIds, allModules) => {
  if (!isObject(module)) return [];
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const byId = new Map(arr(allModules).filter(isObject).map((m) => [m.id, m]));
  const missing = [];
  for (const depId of getModuleDependencies(module)) {
    if (selected.has(depId)) continue;
    // A dep that is included in the bundle counts as "owned" if the base
    // product is owned; this is enforced by the caller via
    // `getIsModuleOwned(module, isProductOwned)`.
    missing.push(depId);
  }
  // Return only the dependency *modules* the caller will need to add to the
  // selection (in dependency order, depth-first).
  return missing.map((id) => byId.get(id)).filter(Boolean);
};

/**
 * Decide whether a module is already owned by the current user. The PDP
 * v1 (this part) treats module ownership as:
 *   - true if the base product is owned AND the module is `includeInBundle`
 *     (i.e. bundled with the base) OR the module is a paid-update module
 *     whose update id is in `ownedUpdateIds`.
 *   - true if the module id appears in `ownedModuleIds` (future: per-module
 *     entitlements — out of scope here, the field is plumbed for the next
 *     part).
 */
export const getIsModuleOwned = (module, { isProductOwned, ownedUpdateIds, ownedModuleIds }) => {
  if (!isObject(module)) return false;
  const moduleSet = ownedModuleIds instanceof Set ? ownedModuleIds : new Set(ownedModuleIds || []);
  if (moduleSet.has(module.id)) return true;
  if (isProductOwned && module.includeInBundle !== false) return true;
  if (module.accessLevel === "paid_update") {
    const updateSet = ownedUpdateIds instanceof Set ? ownedUpdateIds : new Set(ownedUpdateIds || []);
    if (module.entitlementId && updateSet.has(module.entitlementId)) return true;
    if (updateSet.has(module.id)) return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Resource selection
// ---------------------------------------------------------------------------

/**
 * Flatten the visible resources across all modules into a single list. The
 * caller is responsible for `parentTitle` so the resource card can show
 * "Module 3 · PDF Workbook".
 */
export const getPurchasableResources = (modules) => {
  const out = [];
  const visit = (m) => {
    if (!isObject(m)) return;
    arr(m.resources).forEach((r) => {
      if (!isObject(r)) return;
      if (r.visibility === "hidden") return;
      if (r.accessLevel === "hidden") return;
      if (r.accessLevel === "paid_update") return;
      if (r.individuallyPurchasable !== true) return;
      out.push({
        ...r,
        parentTitle: str(m.title),
        parentModuleId: str(m.parentModuleId || m.id),
      });
    });
    arr(m.modules).forEach(visit);
  };
  arr(modules).forEach(visit);
  return out;
};

const str = (v, fallback = "") => (v === null || v === undefined ? fallback : String(v));

/**
 * Map a canonical resource to the effective cash price. `null` when the
 * resource has no standalone price or the price is invalid.
 */
export const getResourceEffectivePrice = (resource) => {
  if (!isObject(resource)) return null;
  const cash = numOrNull(resource.cashPrice);
  if (cash === null || cash < 0) return null;
  const sale = numOrNull(resource.salePrice);
  if (sale === null || sale < 0) return cash;
  return Math.min(sale, cash);
};

/**
 * Resources are "owned" when:
 *   - the parent module is owned, OR
 *   - the base product is owned and the resource is part of the bundle
 *     (i.e. the parent module is `includeInBundle`).
 */
export const getIsResourceOwned = (resource, modules, { isProductOwned, ownedUpdateIds, ownedModuleIds }) => {
  if (!isObject(resource)) return false;
  const byId = new Map(arr(modules).filter(isObject).map((m) => [m.id, m]));
  const module = byId.get(resource.parentModuleId);
  if (!module) return false;
  return getIsModuleOwned(module, { isProductOwned, ownedUpdateIds, ownedModuleIds });
};

// ---------------------------------------------------------------------------
// Paid updates
// ---------------------------------------------------------------------------

/**
 * Filter paid updates to those the user can actually buy right now: active,
 * visible, and not already owned.
 */
export const getAvailablePaidUpdates = (paidUpdates, ownedUpdateIds) => {
  const owned = ownedUpdateIds instanceof Set ? ownedUpdateIds : new Set(ownedUpdateIds || []);
  return arr(paidUpdates).filter((u) => {
    if (!isObject(u)) return false;
    if (u.active === false) return false;
    if (u.visibility === "hidden") return false;
    if (owned.has(u.id)) return false;
    return true;
  });
};

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------

/**
 * Validate a (mode, selectedIds) state. Returns either an `{ ok: true }`
 * payload with the cleaned ids, or `{ ok: false, reason }`.
 *
 *   - mode === "selected_modules":
 *       * every selected id must be a known visible module id,
 *       * hidden / paid-update modules are refused,
 *       * the user must already own any module that is `includeInBundle`
 *         (you can't double-buy the bundle),
 *       * dependencies must be a subset of the selection or already-owned
 *         modules.
 */
export const validateSelection = ({ mode, selectedIds, modules, isProductOwned, ownedUpdateIds, ownedModuleIds }) => {
  const idList = (selectedIds instanceof Set ? Array.from(selectedIds) : arr(selectedIds)).map(String);
  if (mode === "full_product") {
    return { ok: true, purchaseKind: "full_product", ids: [] };
  }
  if (mode === "paid_update") {
    if (!isProductOwned) return { ok: false, reason: "Paid updates are only available after you own the course." };
    return { ok: true, purchaseKind: "paid_update", ids: idList.slice(0, 1) };
  }
  if (mode === "selected_modules") {
    const purchasable = getPurchasableModules(modules);
    const byId = new Map(flattenModules(modules).filter(isObject).map((m) => [m.id, m]));
    const purchasableIds = new Set(purchasable.map((m) => m.id));
    const out = [];
    for (const id of idList) {
      if (!purchasableIds.has(id)) {
        return { ok: false, reason: `Module "${id}" is not individually purchasable.` };
      }
      const m = byId.get(id);
      if (!m) continue;
      if (getIsModuleOwned(m, { isProductOwned, ownedUpdateIds, ownedModuleIds })) continue;
      out.push(id);
    }
    // Dependency check: every dependency must be in the selection or already owned.
    for (const id of out) {
      const m = byId.get(id);
      if (!m) continue;
      for (const depId of getModuleDependencies(m)) {
        if (out.includes(depId)) continue;
        const depModule = byId.get(depId);
        if (depModule && getIsModuleOwned(depModule, { isProductOwned, ownedUpdateIds, ownedModuleIds })) continue;
        return { ok: false, reason: `Module "${m.title}" requires "${depModule ? depModule.title : depId}" to be selected first.` };
      }
    }
    return { ok: true, purchaseKind: "selected_modules", ids: out };
  }
  if (mode === "selected_resources") {
    const purchasable = getPurchasableResources(modules);
    const purchasableIds = new Set(purchasable.map((r) => r.id));
    const byId = new Map(purchasable.map((r) => [r.id, r]));
    const out = [];
    for (const id of idList) {
      if (!purchasableIds.has(id)) {
        return { ok: false, reason: `Resource "${id}" is not individually purchasable.` };
      }
      const r = byId.get(id);
      if (!r) continue;
      if (getIsResourceOwned(r, modules, { isProductOwned, ownedUpdateIds, ownedModuleIds })) continue;
      out.push(id);
    }
    return { ok: true, purchaseKind: "selected_resources", ids: out };
  }
  return { ok: false, reason: `Unknown purchase mode: ${mode}` };
};

// ---------------------------------------------------------------------------
// Price math
// ---------------------------------------------------------------------------

/**
 * Compute the per-line-item regular + sale + effective price for a list of
 * modules/resources. `price` is the resolved cash price (sale wins when
 * valid); `regular` is the unsold price; `sale` is the optional discount
 * line; `effective` is what the user actually pays.
 */
export const computeLineTotals = (lines) => {
  let regularSubtotal = 0;
  let effectiveSubtotal = 0;
  let saleSavings = 0;
  for (const line of arr(lines)) {
    const regular = numOrNull(line.regularPrice) || 0;
    const sale = numOrNull(line.salePrice);
    const effective = numOrNull(line.effectivePrice) ?? regular;
    if (line.alreadyOwned) continue;
    regularSubtotal += regular;
    effectiveSubtotal += Math.max(0, effective);
    saleSavings += Math.max(0, regular - effective);
  }
  return { regularSubtotal, effectiveSubtotal, saleSavings };
};

/**
 * Compute the full-course price for comparison:
 *   - Use the product's `originalPrice` (regular) and `price`/`salePrice`
 *     (sale) when they are present and positive.
 *   - Otherwise sum the cash price of every `includeInBundle` module that
 *     is visible, to give the user a meaningful "what if you bought it all"
 *     number.
 */
export const computeFullCoursePrice = ({ product, modules }) => {
  if (isObject(product)) {
    const regularRaw = numOrNull(product.originalPrice);
    const saleRaw = numOrNull(product.salePrice) ?? numOrNull(product.price);
    if (regularRaw !== null && regularRaw > 0) {
      return {
        regularPrice: regularRaw,
        salePrice: saleRaw === null ? null : saleRaw,
        effectivePrice: saleRaw === null ? regularRaw : Math.min(saleRaw, regularRaw),
      };
    }
  }
  let regular = 0;
  let effective = 0;
  for (const m of getBundleModules(modules)) {
    const cash = numOrNull(m.cashPrice);
    if (cash === null || cash < 0) continue;
    const sale = numOrNull(m.salePrice);
    regular += cash;
    effective += sale === null ? cash : Math.min(sale, cash);
  }
  return { regularPrice: regular, salePrice: null, effectivePrice: effective };
};

// ---------------------------------------------------------------------------
// Build the canonical CheckoutSelection
// ---------------------------------------------------------------------------

/**
 * Convert a (mode, selectedIds) state into a canonical `CheckoutSelection`
 * (see `src/types/commerce.ts`). The selection always carries the product id
 * and the list of selected module or resource ids.
 */
export const buildCheckoutSelection = ({ product, mode, selectedIds, paidUpdateId, returnRoute }) => {
  const idList = (selectedIds instanceof Set ? Array.from(selectedIds) : arr(selectedIds)).map(String);
  const productId = str(product?.id);
  if (mode === "full_product") {
    return {
      purchaseKind: "full_product",
      productIds: productId ? [productId] : [],
      moduleIds: [],
      resourceIds: [],
      updateId: null,
      subscriptionPlanId: null,
      billingCycle: null,
      featureIds: [],
      couponCode: null,
      returnRoute: returnRoute || null,
    };
  }
  if (mode === "paid_update") {
    return {
      purchaseKind: "paid_update",
      productIds: productId ? [productId] : [],
      moduleIds: [],
      resourceIds: [],
      updateId: paidUpdateId || (idList[0] || null),
      subscriptionPlanId: null,
      billingCycle: null,
      featureIds: [],
      couponCode: null,
      returnRoute: returnRoute || null,
    };
  }
  if (mode === "selected_modules") {
    return {
      purchaseKind: "selected_modules",
      productIds: productId ? [productId] : [],
      moduleIds: idList,
      resourceIds: [],
      updateId: null,
      subscriptionPlanId: null,
      billingCycle: null,
      featureIds: [],
      couponCode: null,
      returnRoute: returnRoute || null,
    };
  }
  if (mode === "selected_resources") {
    return {
      purchaseKind: "selected_resources",
      productIds: productId ? [productId] : [],
      moduleIds: [],
      resourceIds: idList,
      updateId: null,
      subscriptionPlanId: null,
      billingCycle: null,
      featureIds: [],
      couponCode: null,
      returnRoute: returnRoute || null,
    };
  }
  return {
    purchaseKind: "free_entitlement",
    productIds: productId ? [productId] : [],
    moduleIds: [],
    resourceIds: [],
    updateId: null,
    subscriptionPlanId: null,
    billingCycle: null,
    featureIds: [],
    couponCode: null,
    returnRoute: returnRoute || null,
  };
};

/**
 * Build the canonical `CheckoutLineItem[]` for a given (mode, selectedIds)
 * state. Used by the summary panel.
 */
export const buildLineItems = ({ product, mode, selectedIds, modules, paidUpdates, isProductOwned, ownedUpdateIds, ownedModuleIds }) => {
  const byId = new Map(flattenModules(modules).filter(isObject).map((m) => [m.id, m]));
  const productId = str(product?.id);
  const productTitle = str(product?.title);
  const idList = (selectedIds instanceof Set ? Array.from(selectedIds) : arr(selectedIds)).map(String);

  if (mode === "full_product") {
    const full = computeFullCoursePrice({ product, modules });
    return [{
      id: `product:${productId}`,
      kind: "full_product",
      productId,
      moduleId: null,
      resourceId: null,
      updateId: null,
      subscriptionPlanId: null,
      featureId: null,
      title: productTitle,
      parentTitle: "",
      regularPrice: full.regularPrice,
      salePrice: full.salePrice,
      effectivePrice: isProductOwned ? 0 : full.effectivePrice,
      quantity: 1,
      alreadyOwned: Boolean(isProductOwned),
      entitlementId: productId,
    }];
  }
  if (mode === "paid_update") {
    const updateId = idList[0];
    const update = arr(paidUpdates).find((u) => u.id === updateId);
    if (!update) return [];
    return [{
      id: `update:${updateId}`,
      kind: "paid_update",
      productId,
      moduleId: null,
      resourceId: null,
      updateId,
      subscriptionPlanId: null,
      featureId: null,
      title: str(update.title),
      parentTitle: productTitle,
      regularPrice: numOrNull(update.cashPrice) || 0,
      salePrice: null,
      effectivePrice: numOrNull(update.cashPrice) || 0,
      quantity: 1,
      alreadyOwned: false,
      entitlementId: updateId,
    }];
  }
  if (mode === "selected_modules") {
    const fallback = getModuleFallbackPrice(product, modules);
    return idList.map((id) => {
      const m = byId.get(id);
      if (!m) return null;
      const regular = numOrNull(m.cashPrice) ?? fallback;
      const sale = numOrNull(m.salePrice);
      const effective = sale === null ? regular : Math.min(sale, regular);
      return {
        id: `module:${id}`,
        kind: "selected_modules",
        productId,
        moduleId: id,
        resourceId: null,
        updateId: null,
        subscriptionPlanId: null,
        featureId: null,
        title: str(m.title),
        parentTitle: "",
        regularPrice: regular,
        salePrice: sale,
        effectivePrice: effective,
        quantity: 1,
        alreadyOwned: getIsModuleOwned(m, { isProductOwned, ownedUpdateIds, ownedModuleIds }),
        entitlementId: str(m.entitlementId, id),
      };
    }).filter(Boolean);
  }
  if (mode === "selected_resources") {
    const purchasable = getPurchasableResources(modules);
    const rById = new Map(purchasable.map((r) => [r.id, r]));
    return idList.map((id) => {
      const r = rById.get(id);
      if (!r) return null;
      const regular = numOrNull(r.cashPrice) || 0;
      const sale = numOrNull(r.salePrice);
      const effective = sale === null ? regular : Math.min(sale, regular);
      return {
        id: `resource:${id}`,
        kind: "selected_resources",
        productId,
        moduleId: str(r.parentModuleId) || null,
        resourceId: id,
        updateId: null,
        subscriptionPlanId: null,
        featureId: null,
        title: str(r.name),
        parentTitle: str(r.parentTitle),
        regularPrice: regular,
        salePrice: sale,
        effectivePrice: effective,
        quantity: 1,
        alreadyOwned: getIsResourceOwned(r, modules, { isProductOwned, ownedUpdateIds, ownedModuleIds }),
        entitlementId: str(r.entitlementId, id),
      };
    }).filter(Boolean);
  }
  return [];
};

/**
 * Compute the dynamic summary block for the summary panel.
 */
export const computeSummary = ({ product, mode, selectedIds, modules, paidUpdates, isProductOwned, ownedUpdateIds, ownedModuleIds }) => {
  const lines = buildLineItems({ product, mode, selectedIds, modules, paidUpdates, isProductOwned, ownedUpdateIds, ownedModuleIds });
  const totals = computeLineTotals(lines);
  const full = computeFullCoursePrice({ product, modules });
  const titles = lines.filter((l) => !l.alreadyOwned).map((l) => l.title);
  return {
    mode,
    lineItems: lines,
    selectedCount: titles.length,
    selectedTitles: titles,
    regularSubtotal: totals.regularSubtotal,
    saleSavings: totals.saleSavings,
    effectiveSubtotal: totals.effectiveSubtotal,
    fullCourse: full,
    fullCourseDifference: full.effectivePrice - totals.effectiveSubtotal,
    isFree: !isProductOwned && full.effectivePrice === 0 && totals.effectiveSubtotal === 0,
  };
};

// Re-exports for tests and other consumers.
export const __testHelpers = {
  numOrNull,
  num,
  str,
  arr,
  isObject,
};
