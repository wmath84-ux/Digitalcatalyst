import { commerceContentTree, isBundleIncluded, isPaidContent, visibleContentModules } from "./contentOwnership.js";
import { getIsModuleOwned, getIsResourceOwned, getModuleEffectivePrice, getModuleFallbackPrice, getResourceEffectivePrice } from "./pdpSelection.js";

const list = (value) => Array.isArray(value) ? value : [];
const set = (value) => value instanceof Set ? value : new Set(list(value).map(String));
const text = (value) => String(value ?? "").trim();
const price = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const entitled = (source) => ["full_product", "module_purchase", "resource_purchase", "paid_update", "subscription"].includes(source);

/** A catalogue projection, NEVER payment authority. Prices remain rupees here;
 * existing verified quotes do all sale/coupon/referral arithmetic in paise. */
export function buildPdpPaidContent({ product = {}, isProductOwned = false, ownedUpdateIds = [], resolution = {} } = {}) {
  const tree = commerceContentTree(product);
  const modules = visibleContentModules(tree);
  const byId = new Map(modules.map((module) => [text(module.id), module]));
  const resources = modules.flatMap((module) => list(module.resources || module.files)
    .filter((resource) => resource && resource.active !== false && resource.visibility !== "hidden" && resource.accessLevel !== "hidden")
    .map((resource) => ({ ...resource, parentModuleId: text(module.id), parentTitle: text(module.title) })));
  const byResourceId = new Map(resources.map((resource) => [text(resource.id), resource]));
  const updates = list(product.paidUpdates).filter((update) => update && update.active !== false && update.visibility !== "hidden");
  const ownedUpdates = set(ownedUpdateIds);
  const ownedModules = new Set(set(resolution.ownedModuleIds));
  const ownedResources = new Set(set(resolution.ownedResourceIds));
  for (const [id, source] of Object.entries(resolution.moduleAccessSources || {})) if (entitled(source)) ownedModules.add(id);
  for (const [id, source] of Object.entries(resolution.resourceAccessSources || {})) if (entitled(source)) ownedResources.add(id);
  const ownership = { isProductOwned, ownedUpdateIds: ownedUpdates, ownedModuleIds: ownedModules, ownedResourceIds: ownedResources };
  const updateByModule = new Map();
  const updateByResource = new Map();
  for (const update of updates) {
    for (const id of list(update.includedModuleIds)) updateByModule.set(text(id), update);
    for (const id of list(update.includedResourceIds)) updateByResource.set(text(id), update);
  }
  const moduleUpdate = (module) => {
    const seen = new Set();
    let current = module;
    while (current && !seen.has(text(current.id))) {
      seen.add(text(current.id));
      const update = updateByModule.get(text(current.id)) || updates.find((item) => text(item.id) === text(current.paidUpdateId));
      if (update) return update;
      current = byId.get(text(current.parentModuleId));
    }
    return null;
  };
  const moduleOwned = (module) => {
    const id = text(module.id);
    const source = resolution.moduleAccessSources?.[id];
    // Possession is independent of playback prerequisites. A locked source
    // cannot turn a genuine purchased scope into another purchase offer.
    if (ownedModules.has(id) || entitled(source)) return true;
    if (getIsModuleOwned(module, { ...ownership, isProductOwned: isProductOwned && module.ancestorExcludedFromBundle !== true })) return true;
    const update = moduleUpdate(module);
    if (update && ownedUpdates.has(text(update.id))) return true;
    const seen = new Set([id]);
    let descendant = module;
    let parent = byId.get(text(module.parentModuleId));
    while (parent && !seen.has(text(parent.id))) {
      seen.add(text(parent.id));
      if (!isBundleIncluded(descendant) || moduleUpdate(descendant)) return false;
      if (ownedModules.has(text(parent.id))) return true;
      descendant = parent;
      parent = byId.get(text(parent.parentModuleId));
    }
    return false;
  };
  const resourceOwned = (resource) => {
    const source = resolution.resourceAccessSources?.[text(resource.id)];
    if (ownedResources.has(text(resource.id)) || entitled(source)) return true;
    const parent = byId.get(resource.parentModuleId);
    if (updateByResource.get(text(resource.id)) && ownedUpdates.has(text(updateByResource.get(text(resource.id)).id))) return true;
    return getIsResourceOwned(resource, modules, { ...ownership, isProductOwned: isProductOwned && parent?.ancestorExcludedFromBundle !== true });
  };
  const available = [];
  const owned = [];
  const fallback = getModuleFallbackPrice(product, tree);
  const ownedPackageIds = new Set();
  for (const update of updates) {
    const id = text(update.id);
    if (!id) continue;
    const contentModules = list(update.includedModuleIds).map((key) => byId.get(text(key))).filter(Boolean);
    const contentResources = list(update.includedResourceIds).map((key) => byResourceId.get(text(key))).filter(Boolean);
    const contentCount = contentModules.length + contentResources.length;
    const acquired = contentModules.filter(moduleOwned).length + contentResources.filter(resourceOwned).length;
    const purchased = ownedUpdates.has(id);
    // All declared, still-published scopes must be present before a package
    // is considered included. Missing catalogue entries cannot fabricate access.
    const declaredCount = list(update.includedModuleIds).length + list(update.includedResourceIds).length;
    const included = !purchased && contentCount > 0 && contentCount === declaredCount && acquired === contentCount;
    const row = { key: `update:${id}`, id, kind: "paid_update", title: text(update.title) || "Paid update",
      description: text(update.description), details: [...contentModules.map((module) => text(module.title)), ...contentResources.map((resource) => text(resource.name || resource.title))],
      regularPrice: price(update.cashPrice), effectivePrice: price(update.cashPrice), estimated: false,
      includedInBase: false, requiresBase: true, selectable: isProductOwned && price(update.cashPrice) !== null,
      acquiredCount: acquired, contentCount, owned: purchased || included,
      ownershipLabel: purchased ? "Purchased update" : included ? "Content already available" : "",
      accessSource: purchased ? "paid_update" : included ? "included" : "locked",
      accessNote: purchased && !isProductOwned ? "Purchased already. Get the base product to open this update; don't buy the update again." : purchased ? "The base product is required to open this update." : "" };
    if (row.owned) { owned.push(row); ownedPackageIds.add(id); } else available.push(row);
  }
  for (const module of modules) {
    const id = text(module.id);
    if (!id) continue;
    const update = moduleUpdate(module);
    // Paid-update content appears once under its named package. A missing
    // active package remains visible with honest unavailable pricing.
    const source = resolution.moduleAccessSources?.[id];
    const purchased = moduleOwned(module);
    if (update && (ownedPackageIds.has(text(update.id)) || !purchased)) continue;
    const regular = price(module.cashPrice);
    const effective = getModuleEffectivePrice(module, fallback);
    const ownResources = resources.filter((resource) => resource.parentModuleId === id && resourceOwned(resource));
    const paid = isPaidContent(module) || module.includeInBundle === false || (regular !== null && regular > 0) || (regular === null && effective !== null && effective > 0);
    if (!purchased && !paid) continue;
    const ownResourceCount = ownResources.length;
    const row = { key: `module:${id}`, id, kind: "selected_modules", title: text(module.title) || "Module",
      description: text(module.description), details: [], regularPrice: regular,
      effectivePrice: isPaidContent(module) && !update ? null : effective,
      estimated: regular === null && effective !== null, includedInBase: isBundleIncluded(module) && !update,
      requiresBase: false, selectable: !isPaidContent(module) && !update && effective !== null,
      acquiredCount: ownResourceCount, contentCount: resources.filter((resource) => resource.parentModuleId === id).length,
      owned: purchased, ownershipLabel: source === "subscription" ? "Subscription access" : source === "paid_update" ? "Purchased update" : source === "module_purchase" ? "Purchased module" : "Included in your product",
      accessSource: source || (purchased ? "module_purchase" : "locked"),
      accessNote: list(resolution.unmetDependencies?.[id]).length ? `Requires ${list(resolution.unmetDependencies[id]).map((key) => text(byId.get(text(key))?.title) || text(key)).join(", ")} before you can open this module.` : "",
      prerequisites: list(module.requiredPreviousModuleIds).map((key) => text(byId.get(text(key))?.title) || text(key)),
    };
    if (purchased) owned.push(row); else available.push(row);
  }
  for (const resource of resources) {
    const id = text(resource.id);
    const update = updateByResource.get(id) || moduleUpdate(byId.get(resource.parentModuleId) || {});
    if (update && ownedPackageIds.has(text(update.id))) continue;
    const purchased = resourceOwned(resource);
    const parent = byId.get(resource.parentModuleId);
    const parentOwned = parent && moduleOwned(parent);
    // A purchased module already names its content; only separately-owned
    // resources in a still-locked parent need their own acquired row.
    if (purchased && parentOwned && resource.includeInBundle !== false && !isPaidContent(resource)) continue;
    const effective = getResourceEffectivePrice(resource);
    const regular = price(resource.cashPrice);
    if (!purchased && (update || resource.individuallyPurchasable !== true || effective === null || (effective === 0 && !(regular > 0) && resource.includeInBundle !== false))) continue;
    const source = resolution.resourceAccessSources?.[id];
    const row = { key: `resource:${id}`, id, kind: "selected_resources", title: text(resource.name || resource.title) || "Resource",
      description: text(resource.parentTitle), details: [], regularPrice: regular, effectivePrice: effective, estimated: false,
      includedInBase: resource.includeInBundle !== false && parent && isBundleIncluded(parent),
      requiresBase: false, selectable: !isPaidContent(resource) && !update && effective !== null,
      acquiredCount: 0, contentCount: 0, owned: purchased,
      ownershipLabel: source === "subscription" ? "Subscription access" : "Purchased resource",
      accessSource: source || (purchased ? "resource_purchase" : "locked") };
    if (purchased) owned.push(row); else available.push(row);
  }
  return { available, owned, ownedModuleIds: ownedModules, ownedResourceIds: ownedResources };
}
