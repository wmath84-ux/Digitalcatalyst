// tests/courseAccess.test.mjs
//
// Part 10 — unit tests for the pure course-access resolver in
// `utils/courseAccess.js`. Every spec requirement is tested
// individually: full product, partial module, resource,
// update, subscription, preview, dependencies.
//
// The Node test runner imports the .js file directly; no
// Firestore, no React, no fetch.

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCourseAccess,
  isSubscriptionRecordActive,
  collectEntitlementOwnership,
  collectModules,
  collectResources,
  findModuleById,
  findResourceById,
  moduleRequiredPreviousIds,
  isPreviewEnabled,
} from "../utils/courseAccess.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Build a canonical-module tree. We use the Part 1 shape (with
 * `purchasable`) and the legacy `accessLevel: "paidUpdate"`
 * shape — the resolver must accept both.
 */
const mkModule = (id, overrides = {}) => ({
  id,
  title: `Module ${id}`,
  files: [],
  modules: [],
  ...overrides,
});

const mkResource = (id, overrides = {}) => ({
  id,
  name: `Resource ${id}`,
  type: "pdf",
  url: "https://example.com/r.pdf",
  ...overrides,
});

const mkProduct = (overrides = {}) => ({
  id: "p-1",
  title: "React course",
  canonicalModules: [],
  courseContent: [],
  ...overrides,
});

const NOW = 1_700_000_000_000;

// ---------------------------------------------------------------------------
// collectModules / collectResources
// ---------------------------------------------------------------------------

test("collectModules returns every module in the tree (root + nested)", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1", { modules: [mkModule("m-1-1"), mkModule("m-1-2", { modules: [mkModule("m-1-2-1")] })] }),
      mkModule("m-2"),
    ],
  });
  const all = collectModules(product.canonicalModules);
  assert.equal(all.length, 5);
  assert.ok(all.find((m) => m.id === "m-1-2-1"));
});

test("collectResources returns every file in the tree", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1", { files: [mkResource("r-1"), mkResource("r-2")] }),
      mkModule("m-2", { files: [mkResource("r-3")] }),
    ],
  });
  const all = collectResources(product.canonicalModules);
  assert.equal(all.length, 3);
});

// ---------------------------------------------------------------------------
// Full product
// ---------------------------------------------------------------------------

test("full product ownership opens every included + purchasable module", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1"), // included
      mkModule("m-2", { purchasable: true }),
    ],
  });
  const r = resolveCourseAccess({
    product,
    ownedProductIds: ["p-1"],
    now: NOW,
  });
  assert.equal(r.hasFullProductAccess, true);
  assert.ok(r.accessibleModuleIds.has("m-1"));
  assert.ok(r.accessibleModuleIds.has("m-2"));
  assert.equal(r.moduleAccessSources["m-1"], "full_product");
  assert.equal(r.moduleAccessSources["m-2"], "full_product");
  assert.equal(r.lockedModuleIds.size, 0);
});

test("no product ownership + no module ownership = no module access", () => {
  const product = mkProduct({ canonicalModules: [mkModule("m-1")] });
  const r = resolveCourseAccess({ product, now: NOW });
  assert.equal(r.hasFullProductAccess, false);
  assert.equal(r.accessibleModuleIds.has("m-1"), false);
  assert.equal(r.lockedModuleIds.has("m-1"), true);
});

// ---------------------------------------------------------------------------
// Partial module
// ---------------------------------------------------------------------------

test("partial module: open the Course Player, access owned module, lock unowned", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1"),
      mkModule("m-2", { purchasable: true }),
      mkModule("m-3", { purchasable: true }),
    ],
  });
  const r = resolveCourseAccess({
    product,
    ownedModuleIds: ["m-2"],
    now: NOW,
  });
  assert.equal(r.hasFullProductAccess, false);
  assert.equal(r.accessibleModuleIds.has("m-1"), false);
  assert.equal(r.accessibleModuleIds.has("m-2"), true);
  assert.equal(r.accessibleModuleIds.has("m-3"), false);
  assert.equal(r.moduleAccessSources["m-2"], "module_purchase");
  assert.equal(r.lockedModuleIds.has("m-1"), true);
  assert.equal(r.lockedModuleIds.has("m-3"), true);
});

test("partial module via subscription = accessible as 'subscription' source", () => {
  const product = mkProduct({
    canonicalModules: [mkModule("m-1", { purchasable: true })],
  });
  const r = resolveCourseAccess({
    product,
    subscriptionModuleIds: ["m-1"],
    now: NOW,
  });
  assert.equal(r.accessibleModuleIds.has("m-1"), true);
  assert.equal(r.moduleAccessSources["m-1"], "subscription");
  assert.ok(r.subscriptionGrantedModuleIds.has("m-1"));
});

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

test("resource purchase opens the resource; parent module remains locked when product not owned", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1", { files: [mkResource("r-1", { purchasable: true })] }),
    ],
  });
  const r = resolveCourseAccess({
    product,
    ownedResourceIds: ["r-1"],
    now: NOW,
  });
  assert.equal(r.accessibleResourceIds.has("r-1"), true);
  // Parent module is still locked because the user has not
  // bought the base product (the resource is a stand-alone
  // purchase).
  assert.equal(r.accessibleModuleIds.has("m-1"), false);
  assert.equal(r.resourceAccessSources["r-1"], "resource_purchase");
});

test("included resource opens with full product", () => {
  const product = mkProduct({
    canonicalModules: [mkModule("m-1", { files: [mkResource("r-1")] })],
  });
  const r = resolveCourseAccess({
    product,
    ownedProductIds: ["p-1"],
    now: NOW,
  });
  assert.equal(r.accessibleResourceIds.has("r-1"), true);
  assert.equal(r.resourceAccessSources["r-1"], "full_product");
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

test("paid update: open the update, require base when configured", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1", { paidUpdateId: "u-1", paidUpdateTitle: "Update 1" }),
      mkModule("m-2", { paidUpdateId: "u-1" }),
    ],
  });
  // No base, no update → locked.
  let r = resolveCourseAccess({ product, now: NOW });
  assert.equal(r.accessibleModuleIds.has("m-1"), false);
  assert.equal(r.accessibleModuleIds.has("m-2"), false);
  // Base owned (no requireBaseCourseForUpdate flag set → default
  // true). The update is accessible.
  r = resolveCourseAccess({ product, ownedProductIds: ["p-1"], now: NOW });
  assert.equal(r.accessibleModuleIds.has("m-1"), true);
  assert.equal(r.accessibleModuleIds.has("m-2"), true);
  assert.equal(r.moduleAccessSources["m-1"], "full_product");
  // Update owned outright (no base).
  r = resolveCourseAccess({ product, ownedUpdateIds: ["u-1"], now: NOW });
  assert.equal(r.accessibleModuleIds.has("m-1"), true);
  assert.equal(r.accessibleModuleIds.has("m-2"), true);
  assert.equal(r.moduleAccessSources["m-1"], "paid_update");
  assert.equal(r.moduleAccessSources["m-2"], "paid_update");
});

test("paid update: requireBaseCourseForUpdate=false allows update without base", () => {
  const product = mkProduct({
    canonicalModules: [mkModule("m-1", { paidUpdateId: "u-1" })],
  });
  const r = resolveCourseAccess({
    product,
    ownedUpdateIds: ["u-1"],
    requireBaseCourseForUpdate: false,
    now: NOW,
  });
  assert.equal(r.accessibleModuleIds.has("m-1"), true);
  assert.equal(r.moduleAccessSources["m-1"], "paid_update");
});

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

test("active subscription opens subscription-granted modules + product", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1", { purchasable: true }),
      mkModule("m-2"), // included
    ],
  });
  const r = resolveCourseAccess({
    product,
    subscriptionProductIds: ["p-1"],
    subscriptionModuleIds: ["m-1"],
    now: NOW,
  });
  // The subscription grants full product access, so every
  // module in the bundle is "full_product" (not "subscription").
  // The subscription-granted set is still surfaced separately
  // for the UI to render the "active subscription" badge.
  assert.equal(r.hasFullProductAccess, true);
  assert.equal(r.accessibleModuleIds.has("m-1"), true);
  assert.equal(r.accessibleModuleIds.has("m-2"), true);
  assert.equal(r.moduleAccessSources["m-1"], "full_product");
  assert.equal(r.moduleAccessSources["m-2"], "full_product");
  assert.ok(r.subscriptionGrantedModuleIds.has("m-1"));
});

test("expired subscription removes subscription-only access; keeps permanent purchases", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1", { purchasable: true }),
      mkModule("m-2", { purchasable: true }),
    ],
  });
  // The user has a per-module purchase (permanent) on m-1, and
  // a subscription-granted m-2. Subscription is now expired
  // (status != "active"), so the subscriptionProductIds set
  // is empty even though the entitlements doc still exists.
  const r = resolveCourseAccess({
    product,
    ownedModuleIds: ["m-1"],
    subscriptionProductIds: [],
    subscriptionModuleIds: [],
    now: NOW,
  });
  // Permanent purchase on m-1 is preserved.
  assert.equal(r.accessibleModuleIds.has("m-1"), true);
  // m-2 is locked because the subscription is gone.
  assert.equal(r.accessibleModuleIds.has("m-2"), false);
  assert.equal(r.lockedModuleIds.has("m-2"), true);
});

test("isSubscriptionRecordActive: false for missing / expired / cancelled", () => {
  assert.equal(isSubscriptionRecordActive(null, NOW), false);
  assert.equal(isSubscriptionRecordActive({ status: "active", expiresAt: NOW - 1 }, NOW), false);
  assert.equal(isSubscriptionRecordActive({ status: "cancelled", expiresAt: NOW + 1000 }, NOW), false);
  assert.equal(isSubscriptionRecordActive({ status: "active", expiresAt: NOW + 1000 }, NOW), true);
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

test("preview-enabled content opens without ownership (preview source)", () => {
  const product = mkProduct({
    canonicalModules: [mkModule("m-1", { previewAvailable: true })],
  });
  const r = resolveCourseAccess({ product, now: NOW });
  assert.equal(r.accessibleModuleIds.has("m-1"), true);
  assert.equal(r.previewModuleIds.has("m-1"), true);
  // preview source is NOT in moduleAccessSources (preview is a
  // mode, not a source) — the Course Player uses `previewModuleIds`
  // directly. The module is still "locked" in the strict sense.
  assert.equal(r.moduleAccessSources["m-1"], "locked");
});

test("preview flag on an owned module does NOT make it a preview", () => {
  const product = mkProduct({
    canonicalModules: [mkModule("m-1", { previewAvailable: true, purchasable: true })],
  });
  const r = resolveCourseAccess({
    product,
    ownedModuleIds: ["m-1"],
    now: NOW,
  });
  assert.equal(r.previewModuleIds.has("m-1"), false);
  assert.equal(r.moduleAccessSources["m-1"], "module_purchase");
});

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

test("dependency enforcement: a module whose required previous module is locked is recorded", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1"),
      mkModule("m-2", { requiredPreviousModuleIds: ["m-1"] }),
    ],
  });
  // User owns m-2 but not m-1 (and no base product).
  const r = resolveCourseAccess({
    product,
    ownedModuleIds: ["m-2"],
    now: NOW,
  });
  assert.equal(r.accessibleModuleIds.has("m-2"), true);
  assert.deepEqual(r.unmetDependencies["m-2"], ["m-1"]);
});

test("dependency enforcement: a base-product owner satisfies the dependency", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1"),
      mkModule("m-2", { requiredPreviousModuleIds: ["m-1"] }),
    ],
  });
  const r = resolveCourseAccess({
    product,
    ownedProductIds: ["p-1"],
    now: NOW,
  });
  assert.equal(Object.keys(r.unmetDependencies).length, 0);
});

// ---------------------------------------------------------------------------
// Access source priority
// ---------------------------------------------------------------------------

test("access source priority: module_purchase > subscription", () => {
  const product = mkProduct({
    canonicalModules: [mkModule("m-1", { purchasable: true })],
  });
  const r = resolveCourseAccess({
    product,
    ownedModuleIds: ["m-1"],
    subscriptionModuleIds: ["m-1"],
    now: NOW,
  });
  // Permanent purchase is the strongest source.
  assert.equal(r.moduleAccessSources["m-1"], "module_purchase");
});

test("hidden modules are always locked", () => {
  const product = mkProduct({
    canonicalModules: [mkModule("m-1", { accessLevel: "hidden" })],
  });
  const r = resolveCourseAccess({
    product,
    ownedProductIds: ["p-1"],
    now: NOW,
  });
  assert.equal(r.accessibleModuleIds.has("m-1"), false);
  assert.equal(r.moduleAccessSources["m-1"], "locked");
});

// ---------------------------------------------------------------------------
// collectEntitlementOwnership
// ---------------------------------------------------------------------------

test("collectEntitlementOwnership splits the canonical entitlement records by kind", () => {
  const records = [
    { kind: "full_product", productId: "p-1", status: "active" },
    { kind: "paid_update", updateId: "u-1", status: "active" },
    { kind: "module", moduleId: "m-1", status: "active" },
    { kind: "resource", resourceId: "r-1", status: "active" },
    { kind: "subscription", entitlementId: "subscription:pro" },
    { kind: "module", moduleId: "m-2", status: "revoked" }, // ignored
  ];
  const out = collectEntitlementOwnership(records);
  assert.deepEqual([...out.ownedProductIds].sort(), ["p-1"]);
  assert.deepEqual([...out.ownedUpdateIds].sort(), ["u-1"]);
  assert.deepEqual([...out.ownedModuleIds].sort(), ["m-1"]);
  assert.deepEqual([...out.ownedResourceIds].sort(), ["r-1"]);
});

test("collectEntitlementOwnership returns empty sets for null / undefined", () => {
  const out = collectEntitlementOwnership(null);
  assert.equal(out.ownedProductIds.size, 0);
  assert.equal(out.ownedUpdateIds.size, 0);
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

test("findModuleById returns the matching module (root or nested)", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1", { modules: [mkModule("m-1-1")] }),
    ],
  });
  assert.equal(findModuleById(product.canonicalModules, "m-1")?.id, "m-1");
  assert.equal(findModuleById(product.canonicalModules, "m-1-1")?.id, "m-1-1");
  assert.equal(findModuleById(product.canonicalModules, "ghost"), null);
});

test("findResourceById returns the matching resource", () => {
  const product = mkProduct({
    canonicalModules: [
      mkModule("m-1", { files: [mkResource("r-1")] }),
      mkModule("m-2", { modules: [mkModule("m-3", { files: [mkResource("r-2")] })] }),
    ],
  });
  assert.equal(findResourceById(product.canonicalModules, "r-1")?.id, "r-1");
  assert.equal(findResourceById(product.canonicalModules, "r-2")?.id, "r-2");
  assert.equal(findResourceById(product.canonicalModules, "r-99"), null);
});

test("moduleRequiredPreviousIds returns the required previous module ids", () => {
  const m = mkModule("m-2", { requiredPreviousModuleIds: ["m-1"] });
  assert.deepEqual(moduleRequiredPreviousIds(m), ["m-1"]);
  assert.deepEqual(moduleRequiredPreviousIds(mkModule("m-x")), []);
  assert.deepEqual(moduleRequiredPreviousIds(null), []);
});

test("isPreviewEnabled returns true only when the flag is set", () => {
  assert.equal(isPreviewEnabled({ previewAvailable: true }), true);
  assert.equal(isPreviewEnabled({ preview: true }), true);
  assert.equal(isPreviewEnabled({}), false);
  assert.equal(isPreviewEnabled(null), false);
});
