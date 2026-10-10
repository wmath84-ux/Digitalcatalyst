import test from "node:test";
import assert from "node:assert/strict";
import { normaliseCouponDoc } from "../utils/coupons.js";
import { buildPdpPaidContent } from "../utils/pdpPaidContent.js";
import { resolveCourseAccess, collectEntitlementOwnership } from "../utils/courseAccess.js";
import { getIsModuleOwned, getIsResourceOwned, computeSummary, buildCheckoutSelection } from "../utils/pdpSelection.js";
import { buildQuote, computeOwnedEntitlementIds, isModuleOwned } from "../utils/serverQuotes.js";
import { canonicalOwnershipScopes, filterLegacyOwnershipRecord, isActiveOwnershipRecord, isFullProductPurchase, commerceContentTree, visibleContentModules } from "../utils/contentOwnership.js";

const module = (id, extra = {}) => ({ id, title: `Module ${id}`, description: "", active: true, visibility: "visible", accessLevel: "included", includeInBundle: true, cashPrice: 0, salePrice: null, resources: [], modules: [], requiredPreviousModuleIds: [], entitlementId: id, ...extra });
const resource = (id, extra = {}) => ({ id, name: `Resource ${id}`, type: "pdf", cashPrice: 100, salePrice: null, visibility: "visible", accessLevel: "included", individuallyPurchasable: true, entitlementId: id, ...extra });
const product = (extra = {}) => ({ id: "course", documentId: "course-doc", title: "Free foundation", price: 0, regularPrice: 0, isFree: true, isVisible: true, inStock: true, canonicalModules: [module("base"), module("optional", { title: "Advanced practice", includeInBundle: false, cashPrice: 300, salePrice: 249 })], paidUpdates: [], ...extra });
const projection = (course, ownership = {}) => {
  const resolution = resolveCourseAccess({ product: course, ...ownership });
  return buildPdpPaidContent({ product: course, isProductOwned: resolution.hasFullProductAccess, ownedUpdateIds: resolution.ownedUpdateIds, resolution });
};
const selection = (kind, ids = [], updateId = null) => ({ purchaseKind: kind, productIds: ["course"], moduleIds: kind === "selected_modules" ? ids : [], resourceIds: kind === "selected_resources" ? ids : [], updateId, featureIds: [], couponCode: null });
const quote = (course, selected, docs = []) => buildQuote({ selection: selected, products: new Map([["course", course]]), purchasesByProduct: new Map([["course", docs]]), uid: "learner", now: 1000, quoteId: "verified", ttlMs: 60000 });


test("a free product keeps its genuinely paid optional module discoverable before base acquisition", () => {
  const course = product();
  const rows = projection(course);
  assert.deepEqual(rows.available.map((row) => row.id), ["optional"]);
  assert.equal(rows.available[0].regularPrice, 300);
  assert.equal(rows.available[0].effectivePrice, 249);
  assert.equal(rows.available[0].selectable, true);
  assert.equal(rows.available[0].includedInBase, false);
  assert.equal(rows.owned.length, 0);
});

test("base acquisition leaves paid optional content first and moves included content to acquired group", () => {
  const course = product();
  const rows = projection(course, { ownedProductIds: ["course-doc"] });
  assert.deepEqual(rows.available.map((row) => row.id), ["optional"]);
  assert.deepEqual(rows.owned.map((row) => row.id), ["base"]);
  assert.equal(rows.owned[0].ownershipLabel, "Included in your product");
  assert.equal(rows.owned[0].owned, true);
});

test("an individual module purchase does not incorrectly grant its full parent product", () => {
  const course = product();
  const rows = projection(course, { ownedModuleIds: ["optional"] });
  assert.equal(rows.available.length, 0);
  assert.deepEqual(rows.owned.map((row) => row.id), ["optional"]);
  assert.equal(rows.owned[0].ownershipLabel, "Purchased module");
  assert.equal(resolveCourseAccess({ product: course, ownedModuleIds: ["optional"] }).hasFullProductAccess, false);
});

test("a sale reaching numeric ₹0 retains only the real ₹300 MRP and remains a selectable add-on", () => {
  const course = product({ canonicalModules: [module("base"), module("optional", { includeInBundle: false, cashPrice: 300, salePrice: 0 })] });
  const row = projection(course).available[0];
  assert.equal(row.regularPrice, 300); assert.equal(row.effectivePrice, 0); assert.equal(row.selectable, true);
});

test("invalid/negative MRP is not fabricated or shown as a discount", () => {
  const course = product({ canonicalModules: [module("optional", { includeInBundle: false, cashPrice: -100, salePrice: -200 })] });
  const row = projection(course).available[0];
  assert.equal(row.regularPrice, null);
  assert.ok(row.effectivePrice === null || row.effectivePrice >= 0);
});

test("paid-update packages include real names and remain locked after base-only ownership", () => {
  const course = product({ canonicalModules: [module("base"), module("u-module", { title: "Exam strategies", accessLevel: "paid_update", includeInBundle: true, cashPrice: 550, resources: [resource("u-pdf")] })], paidUpdates: [{ id: "u1", title: "Exam pack", active: true, visibility: "visible", cashPrice: 550, includedModuleIds: ["u-module"], includedResourceIds: [] }] });
  const rows = projection(course, { ownedProductIds: ["course"] });
  assert.deepEqual(rows.available.map((row) => row.key), ["update:u1"]);
  assert.deepEqual(rows.available[0].details, ["Exam strategies"]);
  assert.equal(rows.available[0].effectivePrice, 550);
  assert.equal(rows.available[0].selectable, true);
  const access = resolveCourseAccess({ product: course, ownedProductIds: ["course"] });
  assert.equal(access.accessibleModuleIds.has("u-module"), false);
  assert.equal(access.accessibleResourceIds.has("u-pdf"), false);
});

test("a purchased update moves beneath the divider without duplicate package/module rows", () => {
  const course = product({ canonicalModules: [module("base"), module("u-module", { accessLevel: "paid_update", cashPrice: 500 })], paidUpdates: [{ id: "u1", title: "Exam pack", active: true, cashPrice: 500, includedModuleIds: ["u-module"], includedResourceIds: [] }] });
  const rows = projection(course, { ownedProductIds: ["course"], ownedUpdateIds: ["u1"] });
  assert.equal(rows.available.length, 0);
  assert.deepEqual(rows.owned.map((row) => row.key), ["update:u1", "module:base"]);
  assert.equal(rows.owned[0].ownershipLabel, "Purchased update");
});

test("paid packages stay discoverable on free products but explain the real base prerequisite", () => {
  const course = product({ canonicalModules: [module("base"), module("u-module", { accessLevel: "paid_update" })], paidUpdates: [{ id: "u1", title: "Upgrade", cashPrice: 500, active: true, includedModuleIds: ["u-module"], includedResourceIds: [] }] });
  const row = projection(course).available[0];
  assert.equal(row.requiresBase, true); assert.equal(row.selectable, false);
  assert.equal(row.effectivePrice, 500);
});

test("resource-only ownership is acquired below the divider, never mislabelled as the entire module", () => {
  const course = product({ canonicalModules: [module("optional", { includeInBundle: false, cashPrice: 350, resources: [resource("r1"), resource("r2")] })] });
  const rows = projection(course, { ownedResourceIds: ["r1"] });
  assert.deepEqual(rows.available.filter((row) => row.kind === "selected_modules").map((row) => row.id), ["optional"]);
  assert.equal(rows.available.find((row) => row.id === "optional").acquiredCount, 1);
  assert.deepEqual(rows.owned.map((row) => row.key), ["resource:r1"]);
  assert.equal(rows.owned[0].ownershipLabel, "Purchased resource");
});

test("optional resources remain separately purchasable after buying the included base module", () => {
  const extra = resource("extra", { includeInBundle: false, cashPrice: 99 });
  const course = product({ canonicalModules: [module("base", { resources: [resource("included"), extra] })] });
  const rows = projection(course, { ownedProductIds: ["course"] });
  assert.deepEqual(rows.available.map((row) => row.key), ["resource:extra"]);
  assert.equal(getIsResourceOwned({ ...extra, parentModuleId: "base" }, course.canonicalModules, { isProductOwned: true, ownedModuleIds: [], ownedUpdateIds: [], ownedResourceIds: [] }), false);
  assert.equal(rows.owned.some((row) => row.id === "extra"), false);
});

test("visible descendants of hidden/inactive parents do not leak into paid content or selections", () => {
  const hidden = module("hidden", { visibility: "hidden", modules: [module("secret", { cashPrice: 999, includeInBundle: false })] });
  const inactive = module("draft", { active: false, modules: [module("secret2", { cashPrice: 555, includeInBundle: false })] });
  const course = product({ canonicalModules: [hidden, inactive, module("visible", { cashPrice: 100, includeInBundle: false })] });
  const rows = projection(course, { ownedProductIds: ["course"] });
  assert.deepEqual(rows.available.map((row) => row.id), ["visible"]);
  assert.deepEqual(visibleContentModules(course.canonicalModules).map((item) => item.id), ["visible"]);
  assert.equal(rows.owned.length, 0);
});

test("nested optional bundles are not granted merely because their child defaults includeInBundle=true", () => {
  const course = product({ canonicalModules: [module("parent", { cashPrice: 600, includeInBundle: false, modules: [module("child", { cashPrice: 300 })] })] });
  const rows = projection(course, { ownedProductIds: ["course"] });
  assert.equal(rows.owned.length, 0);
  assert.deepEqual(rows.available.map((row) => row.id), ["parent", "child"]);
  const out = quote(course, selection("selected_modules", ["child"]), [{ productDocumentId: "course", kind: "full_product" }]);
  assert.equal(out.ok, true); assert.equal(out.quote.cashPayable, 30000);
});

test("buying a parent module includes its non-paid descendants, but never an unrelated paid update", () => {
  const course = product({ canonicalModules: [module("parent", { cashPrice: 600, includeInBundle: false, modules: [module("child", { cashPrice: 300, resources: [resource("child-pdf")] }), module("paid-child", { accessLevel: "paid_update", paidUpdateId: "u1" })] })] });
  const access = resolveCourseAccess({ product: course, ownedModuleIds: ["parent"] });
  assert.equal(access.moduleAccessSources.child, "module_purchase");
  assert.equal(access.resourceAccessSources["child-pdf"], "module_purchase");
  assert.equal(access.accessibleModuleIds.has("paid-child"), false);
  const out = quote(course, selection("selected_modules", ["child"]), [{ productDocumentId: "course", kind: "module", moduleId: "parent" }]);
  assert.equal(out.ok, true); assert.equal(out.quote.cashPayable, 0);
});

test("active subscription access is labelled as subscription, never a permanent purchased product", () => {
  const course = product();
  const rows = projection(course, { subscriptionProductIds: ["course"], subscriptionModuleIds: ["optional"] });
  assert.equal(rows.available.length, 0);
  assert.equal(rows.owned.every((row) => row.accessSource === "subscription"), true);
  assert.equal(rows.owned.every((row) => row.ownershipLabel === "Subscription access"), true);
});

test("expired/revoked scoped grants do not survive as already-owned paid content", () => {
  const grants = collectEntitlementOwnership([{ kind: "module", productId: "course", moduleId: "optional", status: "active", expiresAt: 900 }, { kind: "module", productId: "course", moduleId: "base", status: "revoked" }], 1000);
  assert.equal(grants.ownedModuleIds.size, 0);
  assert.deepEqual(projection(product(), { ownedModuleIds: [...grants.ownedModuleIds] }).available.map((row) => row.id), ["optional"]);
});

test("preview is never misrepresented as ownership", () => {
  const course = product({ canonicalModules: [module("optional", { cashPrice: 300, includeInBundle: false, previewAvailable: true })] });
  const rows = projection(course);
  assert.equal(rows.owned.length, 0); assert.equal(rows.available.length, 1);
});

test("hidden/inactive updates do not expose unpublished package titles", () => {
  const course = product({ paidUpdates: [{ id: "draft", title: "Secret draft", active: false, cashPrice: 600 }, { id: "hidden", title: "Secret hidden", visibility: "hidden", active: true, cashPrice: 300 }] });
  const rows = projection(course);
  assert.equal(rows.available.some((row) => row.kind === "paid_update"), false);
  assert.equal(JSON.stringify(rows).includes("Secret"), false);
});

test("one purchased scope is not ownership of every module in an update package", () => {
  const course = product({ canonicalModules: [module("first", { accessLevel: "paid_update" }), module("second", { accessLevel: "paid_update" })], paidUpdates: [{ id: "u1", title: "Both modules", cashPrice: 400, active: true, includedModuleIds: ["first", "second"], includedResourceIds: [] }] });
  const rows = projection(course, { ownedProductIds: ["course"], ownedModuleIds: ["first"] });
  assert.equal(rows.available.find((row) => row.id === "u1").acquiredCount, 1);
  assert.deepEqual(rows.owned.map((row) => row.id), ["first"]);
});

test("update/module/resource receipts do not create an accidental full-product grant", () => {
  for (const receipt of [{ productDocumentId: "course", updateId: "u1" }, { productDocumentId: "course", moduleId: "optional", kind: "module" }, { productDocumentId: "course", resourceId: "r1", kind: "resource" }]) {
    assert.equal(isFullProductPurchase(receipt), false);
    assert.equal(computeOwnedEntitlementIds([receipt]).has("course"), false);
  }
  assert.equal(isFullProductPurchase({ productDocumentId: "course" }), true);
});

test("client and server module ownership agree that base access excludes optional and paid-update scopes", () => {
  const client = { isProductOwned: true, ownedModuleIds: [], ownedUpdateIds: [] };
  const server = { isProductOwned: true, ownedEntitlementIds: new Set(), ownedUpdateIds: new Set() };
  for (const item of [module("base"), module("optional", { includeInBundle: false }), module("update", { accessLevel: "paid_update", includeInBundle: true, paidUpdateId: "u1" })]) {
    assert.equal(getIsModuleOwned(item, client), isModuleOwned(item, server));
  }
});

test("free-base paid module quote charges the real ₹249, never ₹0 or 100× rupees", () => {
  const course = product();
  const client = computeSummary({ product: course, mode: "selected_modules", selectedIds: ["optional"], modules: course.canonicalModules, paidUpdates: [], isProductOwned: true, ownedUpdateIds: [], ownedModuleIds: [], ownedResourceIds: [] });
  assert.equal(client.effectiveSubtotal, 249);
  const out = quote(course, selection("selected_modules", ["optional"]), [{ productDocumentId: "course", kind: "full_product" }]);
  assert.equal(out.ok, true); assert.equal(out.quote.cashPayable, 24900);
  assert.equal(out.quote.verifiedLineItems[0].title, "Advanced practice");
});

test("already-bought optional module contributes zero to a verified new selection", () => {
  const course = product({ canonicalModules: [module("owned", { cashPrice: 300, includeInBundle: false }), module("remaining", { cashPrice: 200, includeInBundle: false })] });
  const out = quote(course, selection("selected_modules", ["owned", "remaining"]), [{ productDocumentId: "course", kind: "module", moduleId: "owned" }]);
  assert.equal(out.ok, true); assert.equal(out.quote.cashPayable, 20000);
  assert.equal(out.quote.verifiedLineItems.some((line) => line.moduleId === "owned"), false);
  assert.equal(out.quote.verifiedLineItems.find((line) => line.moduleId === "remaining").alreadyOwned, false);
});

test("a paid-update-only receipt does not bypass the genuine base prerequisite", () => {
  const course = product({ paidUpdates: [{ id: "u1", title: "Exam pack", cashPrice: 500, active: true }] });
  const out = quote(course, selection("paid_update", [], "u1"), [{ productDocumentId: "course", kind: "paid_update", updateId: "other" }]);
  assert.equal(out.ok, false); assert.equal(out.status, 403);
});

test("already purchased paid update is not charged a second time by a forged/replayed selection", () => {
  const course = product({ paidUpdates: [{ id: "u1", title: "Exam pack", cashPrice: 500, active: true }] });
  const out = quote(course, selection("paid_update", [], "u1"), [{ productDocumentId: "course", kind: "full_product" }, { productDocumentId: "course", kind: "paid_update", updateId: "u1" }]);
  assert.equal(out.ok, true); assert.equal(out.quote.cashPayable, 0);
  assert.deepEqual(out.quote.verifiedLineItems, []);
});

test("paid selections retain canonical product/module/update ids and return route", () => {
  const chosen = buildCheckoutSelection({ product: product(), mode: "selected_modules", selectedIds: ["optional"], returnRoute: "#/product/course" });
  assert.deepEqual(chosen.moduleIds, ["optional"]); assert.deepEqual(chosen.productIds, ["course"]);
  assert.equal(chosen.returnRoute, "#/product/course"); assert.equal(chosen.purchaseKind, "selected_modules");
});


test("a genuine zero-price module sale remains zero in the authoritative quote", () => {
  const course = product({ canonicalModules: [module("sample", { cashPrice: 100, salePrice: 0, includeInBundle: false })] });
  const out = quote(course, selection("selected_modules", ["sample"]));
  assert.equal(out.ok, true); assert.equal(out.quote.cashPayable, 0);
  assert.equal(out.quote.regularSubtotal, 10000); assert.equal(out.quote.saleDiscount, 10000);
});

test("zero resource sales remain numeric zero and invalid prices never create a free grant", () => {
  const course = product({ canonicalModules: [module("base", { resources: [resource("sample", { cashPrice: 100, salePrice: 0, includeInBundle: false })] })] });
  const out = quote(course, selection("selected_resources", ["sample"]));
  assert.equal(out.ok, true); assert.equal(out.quote.cashPayable, 0); assert.equal(out.quote.saleDiscount, 10000);
  for (const cashPrice of [-100, "broken", Infinity]) {
    const invalid = product({ canonicalModules: [module("invalid", { includeInBundle: false, cashPrice })] });
    assert.equal(projection(invalid).available[0].effectivePrice, null);
    assert.equal(projection(invalid).available[0].selectable, false);
    assert.equal(quote(invalid, selection("selected_modules", ["invalid"])).ok, false);
  }
});

test("malformed sale prices fall back to the genuine module MRP instead of becoming free", () => {
  const course = product({ canonicalModules: [module("optional", { cashPrice: 300, salePrice: "broken", includeInBundle: false })] });
  assert.equal(quote(course, selection("selected_modules", ["optional"])).quote.cashPayable, 30000);
});

test("catalogue-only resource update membership is paid on client/access/server, not granted by base", () => {
  const course = product({ canonicalModules: [module("base", { resources: [resource("update-pdf")] })], paidUpdates: [{ id: "u1", title: "New workbook", cashPrice: 500, active: true, includedModuleIds: [], includedResourceIds: ["update-pdf"] }] });
  const mapped = commerceContentTree(course)[0].resources[0];
  assert.equal(mapped.paidUpdateId, "u1");
  assert.equal(resolveCourseAccess({ product: course, ownedProductIds: ["course"] }).accessibleResourceIds.has("update-pdf"), false);
  assert.equal(quote(course, selection("selected_resources", ["update-pdf"]), [{ productDocumentId: "course", kind: "full_product" }]).ok, false);
  const bought = projection(course, { ownedProductIds: ["course"], ownedUpdateIds: ["u1"] });
  assert.ok(bought.owned.some((row) => row.key === "update:u1"));
});

test("paid-update descendants/resources and hidden ancestry cannot bypass package checkout", () => {
  const course = product({ canonicalModules: [module("paid-parent", { modules: [module("child", { cashPrice: 300, resources: [resource("r1")] })] }), module("hidden-parent", { visibility: "hidden", resources: [resource("secret")] })], paidUpdates: [{ id: "u1", title: "Upgrade", cashPrice: 500, active: true, includedModuleIds: ["paid-parent"], includedResourceIds: [] }] });
  for (const selected of [selection("selected_modules", ["child"]), selection("selected_resources", ["r1"]), selection("selected_resources", ["secret"])]) assert.equal(quote(course, selected, [{ productDocumentId: "course", kind: "full_product" }]).ok, false);
});

test("dependency-blocked possession stays acquired and never becomes a duplicate purchase offer", () => {
  const course = product({ canonicalModules: [module("optional", { cashPrice: 300, includeInBundle: false, requiredPreviousModuleIds: ["missing"] })] });
  const rows = projection(course, { ownedModuleIds: ["optional"] });
  assert.equal(rows.available.length, 0); assert.equal(rows.owned[0].owned, true);
  assert.match(rows.owned[0].accessNote, /Requires missing/);
  const supplied = buildPdpPaidContent({ product: course, resolution: { ownedModuleIds: new Set(["optional"]), moduleAccessSources: { optional: "locked" } } });
  assert.equal(supplied.available.length, 0); assert.equal(supplied.owned[0].owned, true);
});

test("a purchased update without base remains purchased and explains access instead of repurchase", () => {
  const course = product({ canonicalModules: [module("u-module")], paidUpdates: [{ id: "u1", title: "Upgrade", cashPrice: 500, active: true, includedModuleIds: ["u-module"], includedResourceIds: [] }] });
  const rows = projection(course, { ownedUpdateIds: ["u1"] });
  assert.equal(rows.available.length, 0); assert.equal(rows.owned[0].key, "update:u1");
  assert.match(rows.owned[0].accessNote, /Get the base product/);
});

test("legacy courseContent/files preserve optional prices and named acquired resources", () => {
  const course = product({ canonicalModules: [], courseContent: [module("optional", { cashPrice: 300, includeInBundle: false, resources: undefined, files: [resource("legacy-pdf", { includeInBundle: false })] })] });
  const rows = projection(course, { ownedResourceIds: ["legacy-pdf"] });
  assert.equal(rows.available[0].effectivePrice, 300); assert.equal(rows.owned[0].key, "resource:legacy-pdf");
  assert.equal(quote(course, selection("selected_modules", ["optional"])).quote.cashPayable, 30000);
});

test("explicit invalid/elapsed ownership expiry never becomes a permanent grant", () => {
  for (const expiresAt of ["broken", "", 0, -1, 900, { seconds: 0 }]) assert.equal(isActiveOwnershipRecord({ status: "active", expiresAt }, 1000), false);
  assert.equal(isActiveOwnershipRecord({ status: "active", expiresAt: null }, 1000), true);
  assert.equal(isActiveOwnershipRecord({ status: "active", expiresAt: { _seconds: 2 } }, 1000), true);
});


test("optional nested modules remain unpaid after a base or parent-module purchase", () => {
  const course = product({ canonicalModules: [module("parent", { cashPrice: 600, modules: [module("extra", { cashPrice: 300, includeInBundle: false })] })] });
  for (const ownership of [{ ownedProductIds: ["course"] }, { ownedModuleIds: ["parent"] }]) {
    const access = resolveCourseAccess({ product: course, ...ownership });
    assert.equal(access.accessibleModuleIds.has("extra"), false);
    assert.ok(projection(course, ownership).available.some((row) => row.id === "extra"));
  }
  assert.equal(quote(course, selection("selected_modules", ["extra"]), [{ kind: "module", productDocumentId: "course", moduleId: "parent" }]).quote.cashPayable, 30000);
});

test("an acquired optional resource remains explicitly named even when its base module is owned", () => {
  const course = product({ canonicalModules: [module("base", { resources: [resource("extra", { cashPrice: 99, includeInBundle: false })] })] });
  const rows = projection(course, { ownedProductIds: ["course"], ownedResourceIds: ["extra"] });
  assert.equal(rows.available.length, 0); assert.ok(rows.owned.some((row) => row.key === "resource:extra" && row.ownershipLabel === "Purchased resource"));
});


test("canonical revoked/expired scope cannot be resurrected by an active legacy mirror", () => {
  const authority = canonicalOwnershipScopes([{ kind: "full_product", status: "revoked" }, { kind: "paid_update", updateId: "expired-update", expiresAt: 0 }, { kind: "module", moduleId: "expired-module", expiresAt: "bad" }]);
  assert.equal(filterLegacyOwnershipRecord({ productId: "course", kind: "full_product", status: "Verified" }, authority), null);
  assert.equal(filterLegacyOwnershipRecord({ productId: "course", updateId: "expired-update", status: "active" }, authority), null);
  assert.equal(filterLegacyOwnershipRecord({ productId: "course", moduleId: "expired-module" }, authority), null);
  const independent = { kind: "module", moduleIds: ["expired-module", "independent-module"] };
  assert.deepEqual(filterLegacyOwnershipRecord(independent, authority).moduleIds, ["independent-module"]);
  assert.equal(filterLegacyOwnershipRecord({ resourceId: "independent-resource" }, authority).resourceId, "independent-resource");
  assert.equal(canonicalOwnershipScopes([{ kind: "full_product", source: "subscription", expiresAt: 0 }]).full, false);
});

test("legacy Verified/Completed receipts work, but malformed status/expiry never becomes lifetime ownership", () => {
  assert.equal(isActiveOwnershipRecord({ status: "Verified" }, 1000), true);
  assert.equal(isActiveOwnershipRecord({ status: "Completed" }, 1000), true);
  for (const status of [false, true, 1, [], {}, "", "refunded", "revoked"]) assert.equal(isActiveOwnershipRecord({ status }, 1000), false);
  for (const expiresAt of [false, true, [], {}, "-1", "12.5", { toMillis: () => { throw Error("bad"); } }]) assert.equal(isActiveOwnershipRecord({ status: "active", expiresAt }, 1000), false);
});


test("a real unlimited coupon with null limits/cap reduces a paid add-on attached to a free base", () => {
  const coupon = normaliseCouponDoc({ code: "SAVE50", type: "flat", value: 5000, status: "active", globalLimit: null, perUserLimit: null, maxDiscountPaise: null });
  assert.equal(coupon.globalLimit, null); assert.equal(coupon.perUserLimit, null); assert.equal(coupon.maxDiscountPaise, null);
  const course = product();
  const out = buildQuote({ uid: "buyer", quoteId: "q", now: 1000, selection: { ...selection("selected_modules", ["optional"]), couponCode: "SAVE50" }, products: new Map([["course", course]]), coupon });
  assert.equal(out.ok, true); assert.equal(out.quote.saleDiscount, 5100); assert.equal(out.quote.couponDiscount, 5000); assert.equal(out.quote.cashPayable, 19900);
  const zeroLimit = normaliseCouponDoc({ code: "PAUSED", type: "flat", value: 5000, status: "active", globalLimit: 0, perUserLimit: null });
  assert.equal(zeroLimit.globalLimit, 0);
});
