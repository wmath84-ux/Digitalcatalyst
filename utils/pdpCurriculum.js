// utils/pdpCurriculum.js
//
// Pure helpers for the Product Detail curriculum tab.
//
// The PDP must never advertise content the buyer will not actually unlock:
//   - Before purchase: hide paid-update modules (they stay locked in the
//     Course Player after the base product is bought).
//   - After purchase: if unpaid paid-update modules remain, show only those
//     (so the curriculum becomes an upgrade surface) with a distinct look.
//   - After purchase with nothing left to unlock: show the included modules.
//
// No DOM, no Firebase, no React. Imported by `src/PdpApp.tsx` and the
// node --test contract.

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const arr = (value) => (Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : []);
const str = (value) => (value === null || value === undefined ? "" : String(value));

const PAID_ACCESS_LEVELS = new Set(["paidUpdate", "paid_update"]);

/**
 * Module ids that a published paid-update catalogue actually gates.
 * Hidden / inactive updates are ignored so a draft upgrade never leaks
 * into the public curriculum.
 */
export const collectPaidModuleIdSet = (paidUpdates) => {
  const ids = new Set();
  for (const update of arr(paidUpdates)) {
    if (!isObject(update)) continue;
    if (update.active === false || update.visibility === "hidden") continue;
    for (const id of arr(update.includedModuleIds)) {
      const key = str(id).trim();
      if (key) ids.add(key);
    }
  }
  return ids;
};

/**
 * True when this module stays locked after the base product is purchased
 * and must be bought as a paid upgrade.
 */
export const isPaidUpgradeModule = (module, paidModuleIds) => {
  if (!isObject(module)) return false;
  const access = str(module.accessLevel);
  if (PAID_ACCESS_LEVELS.has(access)) return true;
  if (str(module.paidUpdateId).trim()) return true;
  const id = str(module.id).trim();
  if (id && paidModuleIds instanceof Set && paidModuleIds.has(id)) return true;
  return false;
};

/**
 * Resolve the catalogue update that gates a module (id / title / price)
 * so the PDP can label the upgrade without guessing.
 */
export const resolvePaidUpdateForModule = (module, paidUpdates) => {
  if (!isObject(module)) return null;
  const moduleId = str(module.id);
  const explicitId = str(module.paidUpdateId).trim();
  for (const update of arr(paidUpdates)) {
    if (!isObject(update)) continue;
    if (update.active === false || update.visibility === "hidden") continue;
    const updateId = str(update.id);
    if (explicitId && updateId === explicitId) return update;
    if (moduleId && arr(update.includedModuleIds).map(str).includes(moduleId)) return update;
  }
  return null;
};

const isOwnedPaidModule = (module, ownedUpdateIds) => {
  const owned = ownedUpdateIds instanceof Set ? ownedUpdateIds : new Set(arr(ownedUpdateIds).map(str));
  const updateId = str(module?.paidUpdateId).trim();
  if (updateId && owned.has(updateId)) return true;
  const id = str(module?.id).trim();
  return Boolean(id && owned.has(id));
};

const keepIncluded = (modules) =>
  arr(modules)
    .filter((module) => isObject(module) && !module.paid)
    .map((module) => ({ ...module, modules: keepIncluded(module.modules) }));

/**
 * Keep only unpaid paid-upgrade modules. Included parents are dropped and
 * any unpaid paid children are hoisted so the list is just the upgrades.
 */
const keepUnownedPaid = (modules, ownedUpdateIds) => {
  const out = [];
  for (const module of arr(modules)) {
    if (!isObject(module)) continue;
    const children = keepUnownedPaid(module.modules, ownedUpdateIds);
    if (module.paid && !isOwnedPaidModule(module, ownedUpdateIds)) {
      out.push({ ...module, modules: children });
    } else {
      out.push(...children);
    }
  }
  return out;
};

/**
 * Pick the curriculum the learner should see on the PDP.
 *
 * @returns {{ modules: object[], mode: "included" | "paid-upgrade" }}
 */
export const filterCurriculumForPdp = (modules, { isProductOwned = false, ownedUpdateIds } = {}) => {
  const included = keepIncluded(modules);
  const paid = keepUnownedPaid(modules, ownedUpdateIds);
  if (isProductOwned && paid.length > 0) {
    return { modules: paid, mode: "paid-upgrade" };
  }
  return { modules: included, mode: "included" };
};

export const countCurriculumTree = (modules) => {
  let modulesCount = 0;
  let resourcesCount = 0;
  const visit = (node) => {
    if (!isObject(node)) return;
    modulesCount += 1;
    resourcesCount += arr(node.resources).length;
    arr(node.modules).forEach(visit);
  };
  arr(modules).forEach(visit);
  return { modulesCount, resourcesCount };
};

export const __testHelpers = { isObject, arr, str, isOwnedPaidModule, keepIncluded, keepUnownedPaid };
