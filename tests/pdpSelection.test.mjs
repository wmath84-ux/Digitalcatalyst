// tests/pdpSelection.test.mjs
//
// Unit tests for the PDP purchase-builder pure helpers. Covers the
// scenarios required by the Part 3 spec:
//   - One module
//   - Multiple modules
//   - Already-owned exclusion
//   - Dependencies
//   - Resource selection
//   - Full-course comparison
//   - Hidden modules
//   - Empty selection
//   - Sale price calculation
//
// Plus the mobile-width smoke test (320, 360, 390, 430, 480) is
// implemented separately in `tests/pdpPurchaseBuilderMobileWidths.test.mjs`
// because it needs the React component tree (JSDOM via @testing-library
// is not in the project; instead we use a structural source-text check that
// every layout-breaking utility class in the new component has a small-screen
// counterpart).

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckoutSelection,
  buildLineItems,
  computeFullCoursePrice,
  computeLineTotals,
  computeSummary,
  flattenModules,
  getAvailableModes,
  getAvailablePaidUpdates,
  getBundleModules,
  getIsModuleOwned,
  getIsResourceOwned,
  getModuleDependencies,
  getModuleEffectivePrice,
  getPurchasableModules,
  getPurchasableResources,
  getResourceEffectivePrice,
  getUnsatisfiedDependencies,
  getVisibleModules,
  validateSelection,
  __testHelpers,
} from "../utils/pdpSelection.js";

const { numOrNull } = __testHelpers;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const buildModule = (overrides = {}) => ({
  id: "mod_1",
  title: "Module 1",
  description: "Intro module",
  sortOrder: 0,
  visibility: "visible",
  active: true,
  accessLevel: "included",
  individuallyPurchasable: false,
  cashPrice: null,
  salePrice: null,
  coinPrice: null,
  includeInBundle: true,
  previewAvailable: true,
  requiredPreviousModuleIds: [],
  entitlementId: "mod_1",
  badge: null,
  parentModuleId: null,
  resources: [],
  modules: [],
  ...overrides,
});

const buildResource = (overrides = {}) => ({
  id: "res_1",
  parentModuleId: "mod_1",
  name: "Workbook",
  type: "pdf",
  url: "https://example.com/a.pdf",
  provider: "public",
  sortOrder: 0,
  visibility: "visible",
  accessLevel: "included",
  individuallyPurchasable: false,
  cashPrice: null,
  salePrice: null,
  coinPrice: null,
  entitlementId: "res_1",
  paidUpdateId: null,
  ...overrides,
});

const buildProduct = (overrides = {}) => ({
  id: "prod_1",
  title: "React Mastery",
  instructor: "Jane",
  image: "https://example.com/cover.jpg",
  category: "Course",
  classLevel: "Intermediate",
  subject: "Frontend",
  tags: [],
  rating: 4.5,
  reviews: 100,
  originalPrice: 1999,
  price: 1499,
  description: "Master React 19",
  ...overrides,
});

// ---------------------------------------------------------------------------
// numOrNull / price parsing
// ---------------------------------------------------------------------------

test("numOrNull accepts numbers, rupee strings, and rejects empty/garbage", () => {
  assert.equal(numOrNull(499), 499);
  assert.equal(numOrNull("₹1,499"), 1499);
  assert.equal(numOrNull("0"), 0);
  assert.equal(numOrNull(null), null);
  assert.equal(numOrNull(""), null);
  assert.equal(numOrNull("abc"), null);
});

// ---------------------------------------------------------------------------
// Tree walk
// ---------------------------------------------------------------------------

test("flattenModules preserves root-then-nested order", () => {
  const tree = [
    buildModule({ id: "m1", title: "M1", sortOrder: 0, modules: [
      buildModule({ id: "m1a", title: "M1a", parentModuleId: "m1" }),
      buildModule({ id: "m1b", title: "M1b", parentModuleId: "m1" }),
    ] }),
    buildModule({ id: "m2", title: "M2", sortOrder: 1 }),
  ];
  const out = flattenModules(tree);
  assert.equal(out.length, 4);
  assert.equal(out[0].id, "m1");
  assert.equal(out[1].id, "m1a");
  assert.equal(out[2].id, "m1b");
  assert.equal(out[3].id, "m2");
});

// ---------------------------------------------------------------------------
// Module visibility
// ---------------------------------------------------------------------------

test("Hidden modules never appear in any selector", () => {
  const modules = [
    buildModule({ id: "m1", visibility: "visible", individuallyPurchasable: true, cashPrice: 499 }),
    buildModule({ id: "m_hidden", visibility: "hidden" }),
  ];
  const visible = getVisibleModules(modules);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, "m1");
  const purchasable = getPurchasableModules(modules);
  assert.equal(purchasable.length, 1);
  assert.equal(purchasable[0].id, "m1");
});

test("Inactive modules are excluded", () => {
  const modules = [
    buildModule({ id: "m1", active: true }),
    buildModule({ id: "m_off", active: false }),
  ];
  assert.equal(getVisibleModules(modules).length, 1);
});

test("Paid-update access-level modules are excluded from module selector", () => {
  const modules = [
    buildModule({ id: "m1" }),
    buildModule({ id: "m_paid", accessLevel: "paid_update", cashPrice: 99 }),
  ];
  const purchasable = getPurchasableModules(modules);
  assert.equal(purchasable.find((m) => m.id === "m_paid"), undefined);
});

test("Include-in-bundle modules are not individually purchasable by default", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: false, includeInBundle: true }),
    buildModule({ id: "m2", individuallyPurchasable: false, includeInBundle: true }),
    buildModule({ id: "m_premium", individuallyPurchasable: true, includeInBundle: false, cashPrice: 499 }),
  ];
  const purchasable = getPurchasableModules(modules);
  assert.equal(purchasable.length, 1);
  assert.equal(purchasable[0].id, "m_premium");
  const bundle = getBundleModules(modules);
  assert.equal(bundle.length, 2);
});

// ---------------------------------------------------------------------------
// Sale price calculation
// ---------------------------------------------------------------------------

test("getModuleEffectivePrice returns the regular price when no sale is set", () => {
  assert.equal(getModuleEffectivePrice(buildModule({ cashPrice: 499, salePrice: null })), 499);
});

test("getModuleEffectivePrice returns the sale price when valid and lower", () => {
  assert.equal(getModuleEffectivePrice(buildModule({ cashPrice: 499, salePrice: 399 })), 399);
});

test("getModuleEffectivePrice returns null when cash price is missing", () => {
  assert.equal(getModuleEffectivePrice(buildModule({ cashPrice: null })), null);
});

test("getModuleEffectivePrice returns null when cash is negative (invalid)", () => {
  assert.equal(getModuleEffectivePrice(buildModule({ cashPrice: -10 })), null);
});

test("Sale price is only used when valid (positive, finite, <= regular)", () => {
  // sale higher than regular → fall back to regular (not sale).
  // (Function clamps so the user never gets charged the higher amount.)
  assert.equal(getModuleEffectivePrice(buildModule({ cashPrice: 499, salePrice: 800 })), 499);
  // sale=0 is valid (the user pays zero for this module).
  assert.equal(getModuleEffectivePrice(buildModule({ cashPrice: 499, salePrice: 0 })), 0);
});

test("getResourceEffectivePrice follows the same rule as modules", () => {
  assert.equal(getResourceEffectivePrice(buildResource({ cashPrice: 199, salePrice: 149 })), 149);
  assert.equal(getResourceEffectivePrice(buildResource({ cashPrice: 199, salePrice: null })), 199);
  assert.equal(getResourceEffectivePrice(buildResource({ cashPrice: null })), null);
});

// ---------------------------------------------------------------------------
// Already-owned exclusion
// ---------------------------------------------------------------------------

test("getIsModuleOwned is true when the base product is owned and the module is in the bundle", () => {
  const m = buildModule({ includeInBundle: true });
  assert.equal(getIsModuleOwned(m, { isProductOwned: true, ownedUpdateIds: [], ownedModuleIds: [] }), true);
});

test("getIsModuleOwned is false when the base product is owned but the module is not in the bundle", () => {
  const m = buildModule({ includeInBundle: false, individuallyPurchasable: true, cashPrice: 499 });
  assert.equal(getIsModuleOwned(m, { isProductOwned: true, ownedUpdateIds: [], ownedModuleIds: [] }), false);
});

test("getIsModuleOwned honours ownedModuleIds when supplied", () => {
  const m = buildModule({ id: "m_special" });
  assert.equal(getIsModuleOwned(m, { isProductOwned: false, ownedUpdateIds: [], ownedModuleIds: ["m_special"] }), true);
});

test("getIsModuleOwned is true when the module's update id is in ownedUpdateIds", () => {
  const m = buildModule({ id: "m_paid", accessLevel: "paid_update", entitlementId: "upd_q1" });
  assert.equal(getIsModuleOwned(m, { isProductOwned: false, ownedUpdateIds: ["upd_q1"], ownedModuleIds: [] }), true);
});

test("getIsResourceOwned: resource is owned when its parent module is owned", () => {
  const modules = [buildModule({ id: "mod_1", includeInBundle: true, resources: [buildResource({ id: "r1", parentModuleId: "mod_1" })] })];
  assert.equal(getIsResourceOwned(modules[0].resources[0], modules, { isProductOwned: true, ownedUpdateIds: [], ownedModuleIds: [] }), true);
});

test("getIsResourceOwned: a la carte resource on a non-bundled module is NOT owned even with base product", () => {
  const modules = [buildModule({ id: "mod_premium", includeInBundle: false, individuallyPurchasable: true, resources: [buildResource({ id: "r1", parentModuleId: "mod_premium", individuallyPurchasable: true, cashPrice: 99 })] })];
  assert.equal(getIsResourceOwned(modules[0].resources[0], modules, { isProductOwned: true, ownedUpdateIds: [], ownedModuleIds: [] }), false);
});

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

test("Module dependencies come from requiredPreviousModuleIds", () => {
  const m = buildModule({ requiredPreviousModuleIds: ["mod_0", "mod_-1"] });
  assert.deepEqual(getModuleDependencies(m), ["mod_0", "mod_-1"]);
});

test("getUnsatisfiedDependencies reports deps that are missing from the selection", () => {
  const modules = [
    buildModule({ id: "m1" }),
    buildModule({ id: "m2", requiredPreviousModuleIds: ["m1"] }),
  ];
  const missing = getUnsatisfiedDependencies(modules[1], new Set([]), modules);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].id, "m1");
});

test("getUnsatisfiedDependencies returns nothing when deps are in the selection", () => {
  const modules = [
    buildModule({ id: "m1" }),
    buildModule({ id: "m2", requiredPreviousModuleIds: ["m1"] }),
  ];
  const missing = getUnsatisfiedDependencies(modules[1], new Set(["m1"]), modules);
  assert.equal(missing.length, 0);
});

// ---------------------------------------------------------------------------
// Available modes
// ---------------------------------------------------------------------------

test("getAvailableModes: full course + modules + resources are available when product is not owned", () => {
  const modes = getAvailableModes({
    isProductOwned: false,
    hasAnyPurchasableModule: true,
    hasAnyPurchasableResource: true,
    hasAnyPaidUpdate: true,
  });
  assert.deepEqual(modes, ["full_product", "selected_modules", "selected_resources"]);
});

test("getAvailableModes: full_product drops out when the product is already owned", () => {
  const modes = getAvailableModes({
    isProductOwned: true,
    hasAnyPurchasableModule: true,
    hasAnyPurchasableResource: false,
    hasAnyPaidUpdate: true,
  });
  assert.deepEqual(modes, ["selected_modules", "paid_update"]);
});

test("getAvailableModes: paid_update is hidden when the user owns nothing yet", () => {
  const modes = getAvailableModes({
    isProductOwned: false,
    hasAnyPurchasableModule: false,
    hasAnyPurchasableResource: false,
    hasAnyPaidUpdate: true,
  });
  assert.ok(!modes.includes("paid_update"));
});

// ---------------------------------------------------------------------------
// Purchasable resources
// ---------------------------------------------------------------------------

test("getPurchasableResources only returns individually-purchasable resources", () => {
  const modules = [
    buildModule({
      id: "mod_1",
      resources: [
        buildResource({ id: "r1", individuallyPurchasable: false }),
        buildResource({ id: "r2", individuallyPurchasable: true, cashPrice: 99 }),
        buildResource({ id: "r3", individuallyPurchasable: true, cashPrice: 149 }),
        buildResource({ id: "r4", individuallyPurchasable: true, accessLevel: "paid_update" }),
      ],
    }),
  ];
  const out = getPurchasableResources(modules);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "r2");
  assert.equal(out[1].id, "r3");
  // parentTitle is set so the resource card can show "Module 1 · Workbook".
  assert.equal(out[0].parentTitle, "Module 1");
});

// ---------------------------------------------------------------------------
// Paid updates
// ---------------------------------------------------------------------------

test("getAvailablePaidUpdates filters inactive / hidden / already-owned updates", () => {
  const updates = [
    { id: "u1", title: "U1", cashPrice: 99, active: true, visibility: "visible" },
    { id: "u2", title: "U2", cashPrice: 99, active: false, visibility: "visible" },
    { id: "u3", title: "U3", cashPrice: 99, active: true, visibility: "hidden" },
    { id: "u4", title: "U4", cashPrice: 99, active: true, visibility: "visible" },
  ];
  const out = getAvailablePaidUpdates(updates, new Set(["u4"]));
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "u1");
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("validateSelection: selected_modules rejects a module that is not individually purchasable", () => {
  const modules = [buildModule({ id: "m1", individuallyPurchasable: false, includeInBundle: true })];
  const out = validateSelection({ mode: "selected_modules", selectedIds: new Set(["m1"]), modules, isProductOwned: false, ownedUpdateIds: [], ownedModuleIds: [] });
  assert.equal(out.ok, false);
});

test("validateSelection: selected_modules accepts a valid set of individually-purchasable modules", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 499 }),
    buildModule({ id: "m2", individuallyPurchasable: true, cashPrice: 699 }),
  ];
  const out = validateSelection({ mode: "selected_modules", selectedIds: new Set(["m1", "m2"]), modules, isProductOwned: false, ownedUpdateIds: [], ownedModuleIds: [] });
  assert.equal(out.ok, true);
  assert.deepEqual(out.ids, ["m1", "m2"]);
});

test("validateSelection: selected_modules blocks a module whose dependency is missing", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 499 }),
    buildModule({ id: "m2", individuallyPurchasable: true, cashPrice: 699, requiredPreviousModuleIds: ["m1"] }),
  ];
  const out = validateSelection({ mode: "selected_modules", selectedIds: new Set(["m2"]), modules, isProductOwned: false, ownedUpdateIds: [], ownedModuleIds: [] });
  assert.equal(out.ok, false);
  assert.match(out.reason, /requires/i);
});

test("validateSelection: selected_modules allows a selection that includes the dependency", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 499 }),
    buildModule({ id: "m2", individuallyPurchasable: true, cashPrice: 699, requiredPreviousModuleIds: ["m1"] }),
  ];
  const out = validateSelection({ mode: "selected_modules", selectedIds: new Set(["m1", "m2"]), modules, isProductOwned: false, ownedUpdateIds: [], ownedModuleIds: [] });
  assert.equal(out.ok, true);
});

test("validateSelection: selected_modules drops already-owned modules from the cleaned ids", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 499, includeInBundle: true }),
  ];
  const out = validateSelection({ mode: "selected_modules", selectedIds: new Set(["m1"]), modules, isProductOwned: true, ownedUpdateIds: [], ownedModuleIds: [] });
  assert.equal(out.ok, true);
  assert.deepEqual(out.ids, []);
});

test("validateSelection: paid_update requires the base product to be owned", () => {
  const out = validateSelection({ mode: "paid_update", selectedIds: new Set(["u1"]), modules: [], isProductOwned: false, ownedUpdateIds: [], ownedModuleIds: [] });
  assert.equal(out.ok, false);
});

test("validateSelection: selected_resources rejects non-purchasable ids", () => {
  const modules = [buildModule({ id: "m1", resources: [buildResource({ id: "r1", individuallyPurchasable: false })] })];
  const out = validateSelection({ mode: "selected_resources", selectedIds: new Set(["r1"]), modules, isProductOwned: false, ownedUpdateIds: [], ownedModuleIds: [] });
  assert.equal(out.ok, false);
});

// ---------------------------------------------------------------------------
// Price math
// ---------------------------------------------------------------------------

test("computeLineTotals sums only non-owned line items and reports sale savings", () => {
  const totals = computeLineTotals([
    { regularPrice: 500, salePrice: 400, effectivePrice: 400, alreadyOwned: false },
    { regularPrice: 700, salePrice: null, effectivePrice: 700, alreadyOwned: false },
    { regularPrice: 999, salePrice: 999, effectivePrice: 999, alreadyOwned: true }, // excluded
  ]);
  assert.equal(totals.regularSubtotal, 1200);
  assert.equal(totals.effectiveSubtotal, 1100);
  assert.equal(totals.saleSavings, 100);
});

test("computeFullCoursePrice uses the product's originalPrice/salePrice when present", () => {
  const out = computeFullCoursePrice({ product: buildProduct(), modules: [] });
  assert.equal(out.regularPrice, 1999);
  assert.equal(out.salePrice, 1499);
  assert.equal(out.effectivePrice, 1499);
});

test("computeFullCoursePrice falls back to bundled modules when the product has no price", () => {
  const product = buildProduct({ originalPrice: 0, price: 0, salePrice: null });
  const modules = [
    buildModule({ id: "m1", includeInBundle: true, cashPrice: 100, salePrice: 80 }),
    buildModule({ id: "m2", includeInBundle: true, cashPrice: 200, salePrice: null }),
  ];
  const out = computeFullCoursePrice({ product, modules });
  assert.equal(out.regularPrice, 300);
  assert.equal(out.salePrice, null);
  assert.equal(out.effectivePrice, 280);
});

// ---------------------------------------------------------------------------
// CheckoutSelection
// ---------------------------------------------------------------------------

test("buildCheckoutSelection produces a full_product selection", () => {
  const sel = buildCheckoutSelection({ product: buildProduct(), mode: "full_product", returnRoute: "#/store/purchases" });
  assert.equal(sel.purchaseKind, "full_product");
  assert.deepEqual(sel.productIds, ["prod_1"]);
  assert.equal(sel.requestedEduCoins, 0);
  assert.equal(sel.returnRoute, "#/store/purchases");
});

test("buildCheckoutSelection produces a selected_modules selection", () => {
  const sel = buildCheckoutSelection({ product: buildProduct(), mode: "selected_modules", selectedIds: new Set(["m1", "m2"]) });
  assert.equal(sel.purchaseKind, "selected_modules");
  assert.deepEqual(sel.moduleIds, ["m1", "m2"]);
  assert.equal(sel.productIds.length, 1);
});

test("buildCheckoutSelection produces a selected_resources selection", () => {
  const sel = buildCheckoutSelection({ product: buildProduct(), mode: "selected_resources", selectedIds: new Set(["r1"]) });
  assert.equal(sel.purchaseKind, "selected_resources");
  assert.deepEqual(sel.resourceIds, ["r1"]);
});

test("buildCheckoutSelection produces a paid_update selection", () => {
  const sel = buildCheckoutSelection({ product: buildProduct(), mode: "paid_update", paidUpdateId: "upd_1" });
  assert.equal(sel.purchaseKind, "paid_update");
  assert.equal(sel.updateId, "upd_1");
  assert.equal(sel.productIds.length, 1);
});

// ---------------------------------------------------------------------------
// Line items + summary
// ---------------------------------------------------------------------------

test("buildLineItems returns one full-product line at the product price", () => {
  const lines = buildLineItems({
    product: buildProduct(),
    mode: "full_product",
    selectedIds: new Set(),
    modules: [],
    paidUpdates: [],
    isProductOwned: false,
    ownedUpdateIds: [],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, "full_product");
  assert.equal(lines[0].regularPrice, 1999);
  assert.equal(lines[0].effectivePrice, 1499);
  assert.equal(lines[0].alreadyOwned, false);
});

test("buildLineItems marks full-product line as alreadyOwned when the base product is owned", () => {
  const lines = buildLineItems({
    product: buildProduct(),
    mode: "full_product",
    selectedIds: new Set(),
    modules: [],
    paidUpdates: [],
    isProductOwned: true,
    ownedUpdateIds: [],
  });
  assert.equal(lines[0].alreadyOwned, true);
});

test("buildLineItems for selected_modules emits one line per module with the correct cash + sale prices", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 500, salePrice: 400 }),
    buildModule({ id: "m2", individuallyPurchasable: true, cashPrice: 700 }),
  ];
  const lines = buildLineItems({
    product: buildProduct(),
    mode: "selected_modules",
    selectedIds: new Set(["m1", "m2"]),
    modules,
    paidUpdates: [],
    isProductOwned: false,
    ownedUpdateIds: [],
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].regularPrice, 500);
  assert.equal(lines[0].salePrice, 400);
  assert.equal(lines[0].effectivePrice, 400);
  assert.equal(lines[1].regularPrice, 700);
  assert.equal(lines[1].salePrice, null);
  assert.equal(lines[1].effectivePrice, 700);
});

test("computeSummary returns correct subtotals and full-course difference", () => {
  const product = buildProduct({ originalPrice: 1999, price: 1499, salePrice: "₹1499" });
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 500, salePrice: 400 }),
    buildModule({ id: "m2", individuallyPurchasable: true, cashPrice: 700 }),
  ];
  const summary = computeSummary({
    product,
    mode: "selected_modules",
    selectedIds: new Set(["m1", "m2"]),
    modules,
    paidUpdates: [],
    isProductOwned: false,
    ownedUpdateIds: [],
  });
  assert.equal(summary.selectedCount, 2);
  assert.deepEqual(summary.selectedTitles, ["Module 1", "Module 1"]);
  assert.equal(summary.regularSubtotal, 1200);
  assert.equal(summary.effectiveSubtotal, 1100);
  assert.equal(summary.saleSavings, 100);
  assert.equal(summary.fullCourse.effectivePrice, 1499);
  // Full course is 1499, selected is 1100 → selecting modules is cheaper by 399.
  assert.equal(summary.fullCourseDifference, 1499 - 1100);
});

test("Empty selection produces zero totals but still returns a valid summary shape", () => {
  const summary = computeSummary({
    product: buildProduct(),
    mode: "selected_modules",
    selectedIds: new Set(),
    modules: [],
    paidUpdates: [],
    isProductOwned: false,
    ownedUpdateIds: [],
  });
  assert.equal(summary.selectedCount, 0);
  assert.equal(summary.regularSubtotal, 0);
  assert.equal(summary.effectiveSubtotal, 0);
  assert.equal(summary.saleSavings, 0);
  assert.equal(summary.lineItems.length, 0);
});
