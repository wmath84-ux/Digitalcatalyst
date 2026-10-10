import { commerceContentTree, isActiveOwnershipRecord, isBundleIncluded, isFullProductPurchase, isPaidContent } from "./contentOwnership.js";
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
 * doc. Part 1's `canonicalModules` use `purchasable: true` while the Admin
 * canonical mapping may persist `accessLevel: "purchasable"`; legacy
 * `courseContent` uses `accessLevel: "paidUpdate"` and canonical schemas use
 * `paid_update`. Normalize both vocabularies to one access string.
 */
const moduleAccessLevel = (module) => {
  if (!isObject(module)) return "included";
  if (module.accessLevel === "hidden") return "hidden";
  if (module.accessLevel === "paidUpdate" || module.accessLevel === "paid_update") return "paidUpdate";
  if (module.accessLevel === "purchasable" || module.purchasable === true) return "purchasable";
  return "included";
};

const resourceAccessLevel = (resource) => {
  if (!isObject(resource)) return "included";
  if (resource.accessLevel === "hidden") return "hidden";
  if (resource.accessLevel === "paidUpdate" || resource.accessLevel === "paid_update") return "paidUpdate";
  if (resource.accessLevel === "purchasable" || resource.purchasable === true) return "purchasable";
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
    for (const file of arr(node.resources || node.files)) out.push(file);
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
    for (const file of arr(node.resources || node.files)) {
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
  const tree = commerceContentTree(product);
  const modules = collectModules(tree);
  const resources = collectResources(tree);
  const moduleIndex = new Map(modules.map((m) => [String(m.id), m]));
  const resourceIndex = new Map(resources.map((r) => [String(r.id), r]));

  const ownedProductIds = new Set(arr(input.ownedProductIds).map(String));
  const ownedUpdateIds = new Set(arr(input.ownedUpdateIds).map(String));
  const ownedModuleIds = new Set(arr(input.ownedModuleIds).map(String));
  const ownedResourceIds = new Set(arr(input.ownedResourceIds).map(String));
  const subscriptionProductIds = new Set(arr(input.subscriptionProductIds).map(String));
  const subscriptionModuleIds = new Set(arr(input.subscriptionModuleIds).map(String));
  const subscriptionResourceIds = new Set(arr(input.subscriptionResourceIds).map(String));

  // Firestore's document id and a product's public `id` can differ. Checkout
  // uses the document id for an authoritative lookup while routes/catalog UI
  // commonly use the public id, so either alias must resolve the same access.
  const productIdentityIds = [product?.id, product?.documentId]
    .map((value) => String(value || "").trim())
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
  // Full product access comes from EITHER a base purchase OR an
  // active subscription that grants the base product.
  const hasPurchasedFullProduct = productIdentityIds.some((id) => ownedProductIds.has(id));
  const hasSubscriptionProductAccess = productIdentityIds.some((id) => subscriptionProductIds.has(id));
  const hasFullProductAccess = hasPurchasedFullProduct || hasSubscriptionProductAccess;

  // Modules the user owns via per-module purchase OR subscription.
  // `ownedModuleIds` is the union of the two (for the
  // resolver's public output). For internal source
  // classification, the per-source check happens below.
  const combinedOwnedModules = new Set(ownedModuleIds);
  for (const id of subscriptionModuleIds) combinedOwnedModules.add(id);

  // Paid catalogue membership and parent scopes are resolved once. Owning the
  // free/base bundle does not grant optional modules or future paid updates.
  const parentIds = new Map();
  const resourceParents = new Map();
  const hiddenIds = new Set();
  const indexTree = (nodes, parentId = null, parentHidden = false) => {
    for (const module of arr(nodes)) {
      if (!isObject(module)) continue;
      const id = String(module.id);
      parentIds.set(id, parentId || module.parentModuleId || null);
      const hidden = parentHidden || module.active === false || module.visibility === "hidden" || moduleAccessLevel(module) === "hidden";
      if (hidden) hiddenIds.add(id);
      for (const resource of arr(module.resources || module.files)) resourceParents.set(String(resource.id), id);
      indexTree(module.modules, id, hidden);
    }
  };
  indexTree(tree);
  const updateByModule = new Map();
  const updateByResource = new Map();
  for (const update of arr(product?.paidUpdates)) {
    if (!isObject(update) || update.active === false || update.visibility === "hidden") continue;
    for (const id of arr(update.includedModuleIds)) updateByModule.set(String(id), String(update.id));
    for (const id of arr(update.includedResourceIds)) updateByResource.set(String(id), String(update.id));
  }
  const ancestors = (id) => {
    const ids = [];
    const seen = new Set([id]);
    let parent = parentIds.get(id);
    while (parent && !seen.has(parent)) { ids.push(parent); seen.add(parent); parent = parentIds.get(parent); }
    return ids;
  };
  const updateForModule = (module) => {
    const ids = [String(module.id), ...ancestors(String(module.id))];
    for (const id of ids) {
      const node = moduleIndex.get(id);
      const updateId = updateByModule.get(id) || itemUpdateId(node);
      if (updateId) return updateId;
    }
    return null;
  };
  const inheritedModuleGrant = (id, grants) => {
    for (const scope of [id, ...ancestors(id)]) {
      if (grants.has(scope)) return true;
      if (!isBundleIncluded(moduleIndex.get(scope))) return false;
    }
    return false;
  };
  const requireBaseCourseForUpdate = input.requireBaseCourseForUpdate ?? product?.requireBaseCourseForUpdate ?? true;
  const moduleAccessSources = {};
  for (const module of modules) {
    const id = String(module.id);
    const lineage = [id, ...ancestors(id)];
    const updateId = updateForModule(module);
    if (hiddenIds.has(id)) { moduleAccessSources[id] = "locked"; continue; }
    if (ownedModuleIds.has(id) || (!updateId && !isPaidContent(module) && inheritedModuleGrant(id, ownedModuleIds))) {
      moduleAccessSources[id] = "module_purchase";
      continue;
    }
    if (updateId && ownedUpdateIds.has(updateId) && (!requireBaseCourseForUpdate || hasFullProductAccess)) {
      moduleAccessSources[id] = "paid_update";
      combinedOwnedModules.add(id);
      continue;
    }
    if (subscriptionModuleIds.has(id) || (!updateId && !isPaidContent(module) && inheritedModuleGrant(id, subscriptionModuleIds))) {
      moduleAccessSources[id] = "subscription";
      continue;
    }
    const bundleIncluded = !updateId && lineage.every((ancestor) => isBundleIncluded(moduleIndex.get(ancestor)));
    moduleAccessSources[id] = bundleIncluded && hasPurchasedFullProduct ? "full_product"
      : bundleIncluded && hasSubscriptionProductAccess ? "subscription" : "locked";
  }

  const resourceAccessSources = {};
  for (const resource of resources) {
    const id = String(resource.id);
    const parentId = resourceParents.get(id);
    const updateId = updateByResource.get(id) || itemUpdateId(resource) || updateForModule(moduleIndex.get(parentId) || {});
    if (resource.active === false || resource.visibility === "hidden" || resourceAccessLevel(resource) === "hidden" || hiddenIds.has(parentId)) {
      resourceAccessSources[id] = "locked";
    } else if (ownedResourceIds.has(id)) {
      resourceAccessSources[id] = "resource_purchase";
    } else if (subscriptionResourceIds.has(id)) {
      resourceAccessSources[id] = "subscription";
    } else if (updateId && ownedUpdateIds.has(updateId) && (!requireBaseCourseForUpdate || hasFullProductAccess)) {
      resourceAccessSources[id] = "paid_update";
    } else if (!updateId && !isPaidContent(resource) && resource.includeInBundle !== false) {
      const source = moduleAccessSources[parentId];
      resourceAccessSources[id] = ["full_product", "module_purchase", "subscription"].includes(source) ? source : "locked";
    } else resourceAccessSources[id] = "locked";
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
      resourceAccessSources[id] === "module_purchase" ||
      resourceAccessSources[id] === "resource_purchase" ||
      resourceAccessSources[id] === "paid_update" ||
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
  for (const module of modules) if (moduleAccessSources[String(module.id)] === "subscription") subscriptionGrantedModuleIds.add(String(module.id));

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
    hasPurchasedFullProduct,
    hasSubscriptionProductAccess,
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
export const collectEntitlementOwnership = (entitlementRecords, now = Date.now()) => {
  const out = {
    ownedProductIds: new Set(),
    ownedUpdateIds: new Set(),
    ownedModuleIds: new Set(),
    ownedResourceIds: new Set(),
  };
  for (const record of arr(entitlementRecords)) {
    if (!isObject(record)) continue;
    if (!isActiveOwnershipRecord(record, now) || record.planId || record.subscriptionPlanId || record.source === "subscription") continue;
    const kind = String(record.kind || "");
    if (isFullProductPurchase(record) && record.productId) {
      out.ownedProductIds.add(String(record.productId));
    } else if ((kind === "paid_update" || kind === "free") && record.updateId) {
      out.ownedUpdateIds.add(String(record.updateId));
    } else if ((kind === "module" || kind === "free") && record.moduleId) {
      out.ownedModuleIds.add(String(record.moduleId));
    } else if ((kind === "resource" || kind === "free") && record.resourceId) {
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
