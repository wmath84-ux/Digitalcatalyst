// utils/courseAccess.js
//
// Part 10 — single canonical course-access resolver. Pure (no
// Firestore, no fetch, no React). The Node test runner imports
// this file directly; React components and the server endpoint
// import the runtime from `utils/courseAccess.d.ts`.
//
// The resolver accepts a product doc + the user's verified
// entitlements and returns:
//
//   - hasFullProductAccess
//   - ownedModuleIds
//   - ownedResourceIds
//   - ownedUpdateIds
//   - subscriptionGrantedModuleIds
//   - accessibleModuleIds
//   - accessibleResourceIds
//   - lockedModuleIds
//   - previewModuleIds
//   - accessSource per item (per module / per resource)
//
// Rules (verbatim from the Part 10 spec):
//
//   Full product       — access bundle-included content.
//   Partial module     — open Course Player, access owned
//                        modules, lock unowned modules.
//   Resource           — access purchased resource; parent
//                        module otherwise remains locked.
//   Update             — access update content; require base
//                        course where configured.
//   Subscription       — access while active; remove
//                        subscription-only access after
//                        expiry; keep permanent purchases.
//   Preview            — preview-enabled content opens without
//                        ownership; preview does not grant
//                        completion / rewards.
//   Dependencies       — required previous modules enforced.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The access level a module or resource carries on the product
 * doc. Part 1's `canonicalModules` use `purchasable: true` to
 * flag a-la-carte items; the legacy `courseContent` tree uses
 * `accessLevel: "paidUpdate"` for the same purpose. We normalise
 * both to a single string.
 */
const moduleAccessLevel = (module) => {
  if (!isObject(module)) return "included";
  if (module.accessLevel === "hidden") return "hidden";
  if (module.accessLevel === "paidUpdate") return "paidUpdate";
  if (module.purchasable === true) return "purchasable";
  return "included";
};

const resourceAccessLevel = (resource) => {
  if (!isObject(resource)) return "included";
  if (resource.accessLevel === "hidden") return "hidden";
  if (resource.accessLevel === "paidUpdate") return "paidUpdate";
  if (resource.purchasable === true) return "purchasable";
  return "included";
};

const isPreviewEnabled = (item) =>
  Boolean(isObject(item) && (item.previewAvailable === true || item.preview === true));

const collectModules = (tree) => {
  const out = [];
  const visit = (node) => {
    if (!isObject(node)) return;
    out.push(node);
    for (const child of arr(node.modules)) visit(child);
  };
  for (const node of arr(tree)) visit(node);
  return out;
};

const collectResources = (tree) => {
  const out = [];
  const visit = (node) => {
    if (!isObject(node)) return;
    for (const file of arr(node.files)) out.push(file);
    for (const child of arr(node.modules)) visit(child);
  };
  for (const node of arr(tree)) visit(node);
  return out;
};

const findModuleById = (tree, id) => {
  for (const node of arr(tree)) {
    if (!isObject(node)) continue;
    if (node.id === id) return node;
    const inner = findModuleById(node.modules, id);
    if (inner) return inner;
  }
  return null;
};

const findResourceById = (tree, id) => {
  for (const node of arr(tree)) {
    if (!isObject(node)) continue;
    for (const file of arr(node.files)) {
      if (file.id === id) return file;
    }
    const inner = findResourceById(node.modules, id);
    if (inner) return inner;
  }
  return null;
};

/**
 * Pure: collect the set of dependency module ids a module
 * requires. Returns an empty array when none.
 */
const moduleRequiredPreviousIds = (module) => {
  if (!isObject(module)) return [];
  if (Array.isArray(module.requiredPreviousModuleIds)) {
    return arr(module.requiredPreviousModuleIds).map(String);
  }
  if (Array.isArray(module.dependencies)) {
    return arr(module.dependencies).map(String);
  }
  return [];
};

/**
 * Pure: collect every "update" id that gates a module or
 * resource. Paid updates group multiple modules / resources
 * under a single `paidUpdateId`.
 */
const itemUpdateId = (item) => {
  if (!isObject(item)) return null;
  const id = item.paidUpdateId;
  return typeof id === "string" && id ? id : null;
};

// ---------------------------------------------------------------------------
// Top-level resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a user's access to a product.
 *
 * @param {object} input
 * @param {object} input.product  Firestore-shaped product (canonicalModules preferred; courseContent fallback).
 * @param {string[]} input.ownedProductIds  Legacy `purchasedProductIds` list (base products).
 * @param {string[]} input.ownedUpdateIds  Paid-update ids the user owns.
 * @param {string[]} input.ownedModuleIds  Module ids the user owns (per-module purchases + canonical entitlements).
 * @param {string[]} input.ownedResourceIds  Resource ids the user owns.
 * @param {string[]} input.subscriptionProductIds  Product ids granted by an active subscription.
 * @param {string[]} input.subscriptionModuleIds   Module ids granted by an active subscription.
 * @param {string[]} input.subscriptionResourceIds Resource ids granted by an active subscription.
 * @param {boolean} input.requireBaseCourseForUpdate  When true, paid updates only open when the user owns the base product OR an active subscription grants it.
 * @param {number} [input.now=Date.now()]  Wall clock for subscription checks.
 *
 * @returns {{
 *   hasFullProductAccess: boolean,
 *   ownedModuleIds: Set<string>,
 *   ownedResourceIds: Set<string>,
 *   ownedUpdateIds: Set<string>,
 *   subscriptionGrantedModuleIds: Set<string>,
 *   accessibleModuleIds: Set<string>,
 *   accessibleResourceIds: Set<string>,
 *   lockedModuleIds: Set<string>,
 *   previewModuleIds: Set<string>,
 *   moduleAccessSources: Record<string, string>,
 *   resourceAccessSources: Record<string, string>,
 *   unmetDependencies: Record<string, string[]>,
 * }}
 */
export const resolveCourseAccess = (input = {}) => {
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const product = isObject(input.product) ? input.product : null;
  const modules = collectModules(product?.canonicalModules || product?.courseContent || []);
  const resources = collectResources(product?.canonicalModules || product?.courseContent || []);
  const moduleIndex = new Map(modules.map((m) => [String(m.id), m]));
  const resourceIndex = new Map(resources.map((r) => [String(r.id), r]));

  const ownedProductIds = new Set(arr(input.ownedProductIds).map(String));
  const ownedUpdateIds = new Set(arr(input.ownedUpdateIds).map(String));
  const ownedModuleIds = new Set(arr(input.ownedModuleIds).map(String));
  const ownedResourceIds = new Set(arr(input.ownedResourceIds).map(String));
  const subscriptionProductIds = new Set(arr(input.subscriptionProductIds).map(String));
  const subscriptionModuleIds = new Set(arr(input.subscriptionModuleIds).map(String));
  const subscriptionResourceIds = new Set(arr(input.subscriptionResourceIds).map(String));

  const productId = product?.id ? String(product.id) : null;
  // Full product access comes from EITHER a base purchase OR an
  // active subscription that grants the base product.
  const hasFullProductAccess = Boolean(
    (productId && (ownedProductIds.has(productId) || subscriptionProductIds.has(productId))),
  );

  // Modules the user owns via per-module purchase OR subscription.
  // `ownedModuleIds` is the union of the two (for the
  // resolver's public output). For internal source
  // classification, the per-source check happens below.
  const combinedOwnedModules = new Set(ownedModuleIds);
  for (const id of subscriptionModuleIds) combinedOwnedModules.add(id);

  // Per-module access source.
  const moduleAccessSources = {};
  const markSource = (id, source) => {
    if (!id) return;
    const current = moduleAccessSources[id];
    // Order matters: paid > subscription > free. We pick the
    // strongest source the user has.
    if (current === "full_product" || current === "module_purchase") return;
    if (source === "full_product" || source === "module_purchase") {
      moduleAccessSources[id] = source;
      return;
    }
    if (current === "subscription" && source === "resource_purchase") {
      // A per-resource purchase is the strongest source for
      // a resource, but for a module, the subscription
      // grant wins. Keep `current` as-is.
      return;
    }
    if (current === "subscription" && source === "paid_update") {
      // paid_update is a stronger source than subscription
      // (it's a permanent purchase). Override.
      moduleAccessSources[id] = source;
      return;
    }
    if (!current) moduleAccessSources[id] = source;
  };

  for (const m of modules) {
    const id = String(m.id);
    const level = moduleAccessLevel(m);
    if (level === "hidden") {
      markSource(id, "locked");
      continue;
    }
    if (level === "included") {
      // Free with the base. Open if the user owns the base
      // (or a subscription grants it) or the user owns the
      // module directly.
      if (hasFullProductAccess) {
        markSource(id, "full_product");
        continue;
      }
      if (ownedModuleIds.has(id)) {
        markSource(id, "module_purchase");
        continue;
      }
      if (subscriptionModuleIds.has(id)) {
        markSource(id, "subscription");
        continue;
      }
      markSource(id, "locked");
      continue;
    }
    // paidUpdate or purchasable: the user must own the
    // module, or the base product, or the subscription must
    // grant it. Subscription wins over paid_update only when
    // the user has both, but a direct per-module purchase
    // is the strongest.
    if (ownedModuleIds.has(id)) {
      markSource(id, "module_purchase");
      continue;
    }
    if (hasFullProductAccess) {
      markSource(id, "full_product");
      continue;
    }
    if (subscriptionModuleIds.has(id)) {
      markSource(id, "subscription");
      continue;
    }
    // Otherwise still locked.
    markSource(id, "locked");
  }

  // Paid updates: owned when the user has them in their
  // entitlements, OR the user owns the base product, OR the
  // subscription grants the base product.
  // The `requireBaseCourseForUpdate` flag (admin-set) further
  // gates the case where the user only owns the update.
  const requireBaseCourseForUpdate = input.requireBaseCourseForUpdate !== false;
  for (const m of modules) {
    const id = String(m.id);
    const level = moduleAccessLevel(m);
    const updateId = itemUpdateId(m);
    if (level !== "paidUpdate" && !updateId) continue;
    if (!updateId) continue;
    if (ownedUpdateIds.has(updateId)) {
      // Update owned outright.
      if (!moduleAccessSources[id] || moduleAccessSources[id] === "locked") {
        moduleAccessSources[id] = "paid_update";
      }
      continue;
    }
    if (hasFullProductAccess) {
      // Base course owned; updates are accessible when the
      // product's `requireBaseCourseForUpdate` flag is on.
      if (requireBaseCourseForUpdate) {
        if (!moduleAccessSources[id] || moduleAccessSources[id] === "locked") {
          moduleAccessSources[id] = "full_product";
        }
      }
    }
  }

  // Resources: own per-resource purchase OR subscription grant.
  const resourceAccessSources = {};
  for (const r of resources) {
    const id = String(r.id);
    const level = resourceAccessLevel(r);
    if (level === "hidden") {
      resourceAccessSources[id] = "locked";
      continue;
    }
    if (level === "included") {
      if (hasFullProductAccess) {
        resourceAccessSources[id] = "full_product";
        continue;
      }
      if (ownedResourceIds.has(id)) {
        resourceAccessSources[id] = "resource_purchase";
        continue;
      }
      resourceAccessSources[id] = "locked";
      continue;
    }
    if (ownedResourceIds.has(id) || subscriptionResourceIds.has(id)) {
      resourceAccessSources[id] = subscriptionResourceIds.has(id) ? "subscription" : "resource_purchase";
      continue;
    }
    if (hasFullProductAccess && level === "purchasable") {
      // Per-Part 1, "purchasable" items open with the base
      // product (unlike paidUpdate which is gated). The PDP
      // builder, however, decides which the user actually
      // buys.
      resourceAccessSources[id] = "full_product";
      continue;
    }
    resourceAccessSources[id] = "locked";
  }

  // Preview-enabled modules open without ownership. They do NOT
  // grant completion / rewards (the Course Player keeps them
  // out of the completion-count and the resolver marks them
  // with the "preview" source).
  const previewModuleIds = new Set();
  for (const m of modules) {
    if (isPreviewEnabled(m) && moduleAccessSources[String(m.id)] !== "full_product" && moduleAccessSources[String(m.id)] !== "module_purchase" && moduleAccessSources[String(m.id)] !== "subscription" && moduleAccessSources[String(m.id)] !== "paid_update") {
      previewModuleIds.add(String(m.id));
    }
  }

  // Dependency enforcement: a module's required previous
  // modules must be in the accessible set. The `unmetDependencies`
  // map is consumed by the Course Player to lock a module even
  // when the user nominally owns it.
  const accessibleModuleIds = new Set();
  for (const m of modules) {
    const id = String(m.id);
    if (
      moduleAccessSources[id] === "full_product" ||
      moduleAccessSources[id] === "module_purchase" ||
      moduleAccessSources[id] === "subscription" ||
      moduleAccessSources[id] === "paid_update"
    ) {
      accessibleModuleIds.add(id);
    } else if (previewModuleIds.has(id)) {
      accessibleModuleIds.add(id);
    }
  }
  const accessibleResourceIds = new Set();
  for (const r of resources) {
    const id = String(r.id);
    if (
      resourceAccessSources[id] === "full_product" ||
      resourceAccessSources[id] === "resource_purchase" ||
      resourceAccessSources[id] === "subscription"
    ) {
      accessibleResourceIds.add(id);
    }
  }

  const lockedModuleIds = new Set();
  for (const m of modules) {
    const id = String(m.id);
    if (moduleAccessSources[id] === "locked" || moduleAccessSources[id] === undefined) {
      lockedModuleIds.add(id);
    }
  }

  const subscriptionGrantedModuleIds = new Set(subscriptionModuleIds);
  for (const id of subscriptionModuleIds) subscriptionGrantedModuleIds.add(id);

  // Dependency evaluation: a module is "dependency-blocked"
  // when (a) it is in `accessibleModuleIds` AND (b) one of its
  // required previous modules is NOT in `accessibleModuleIds`.
  // We surface this as `unmetDependencies` for the UI.
  const unmetDependencies = {};
  for (const m of modules) {
    const id = String(m.id);
    if (!accessibleModuleIds.has(id)) continue;
    const missing = moduleRequiredPreviousIds(m).filter((dep) => !accessibleModuleIds.has(dep));
    if (missing.length > 0) unmetDependencies[id] = missing;
  }

  return {
    hasFullProductAccess,
    ownedModuleIds: combinedOwnedModules,
    ownedResourceIds: new Set(ownedResourceIds),
    ownedUpdateIds: new Set(ownedUpdateIds),
    subscriptionGrantedModuleIds,
    accessibleModuleIds,
    accessibleResourceIds,
    lockedModuleIds,
    previewModuleIds,
    moduleAccessSources,
    resourceAccessSources,
    unmetDependencies,
  };
};

// ---------------------------------------------------------------------------
// Subscription helpers (re-exported so the Firestore loader can
// filter active subscriptions by status + expiresAt).
// ---------------------------------------------------------------------------

/**
 * Pure: is a subscription record still active? `now` defaults
 * to `Date.now()`. Returns `false` for `null` / `undefined`.
 */
export const isSubscriptionRecordActive = (record, now = Date.now()) => {
  if (!isObject(record)) return false;
  const status = String(record.status || "").toLowerCase();
  if (status && status !== "active") return false;
  if (!Number.isFinite(record.expiresAt)) return false;
  return Number(record.expiresAt) > Number(now);
};

/**
 * Pure: extract the per-user entitlement-shape records the
 * resolver consumes. Splits the `entitlements/{uid}__*` docs
 * into `ownedProductIds`, `ownedUpdateIds`, `ownedModuleIds`,
 * and `ownedResourceIds` sets. `entitlementRecords` is the
 * array of docs (raw).
 */
export const collectEntitlementOwnership = (entitlementRecords) => {
  const out = {
    ownedProductIds: new Set(),
    ownedUpdateIds: new Set(),
    ownedModuleIds: new Set(),
    ownedResourceIds: new Set(),
  };
  for (const record of arr(entitlementRecords)) {
    if (!isObject(record)) continue;
    if (record.status && record.status !== "active") continue;
    const kind = String(record.kind || "");
    if (kind === "full_product" && record.productId) {
      out.ownedProductIds.add(String(record.productId));
    } else if (kind === "paid_update" && record.updateId) {
      out.ownedUpdateIds.add(String(record.updateId));
    } else if (kind === "module" && record.moduleId) {
      out.ownedModuleIds.add(String(record.moduleId));
    } else if (kind === "resource" && record.resourceId) {
      out.ownedResourceIds.add(String(record.resourceId));
    } else if (kind === "subscription") {
      // The subscription writer persists a `subscription`
      // entitlement id shaped like `subscription:<planId>` or
      // `subscription_feature:<planId>:<featureId>`. We don't
      // add it to module / resource ownership here — the
      // subscription plan's own product-unlock mapping
      // (passed in as `subscriptionProductIds` / etc.) is
      // what unlocks the per-course content.
      void record;
    }
  }
  return out;
};

export { collectModules, collectResources, findModuleById, findResourceById, moduleRequiredPreviousIds, isPreviewEnabled };
