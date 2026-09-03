// tests/courseAccessServerContract.test.mjs
//
// Part 10 — source-level contract tests for the course
// access resolver. These tests do NOT need a live Firestore;
// they assert the source code:
//
//   - `utils/courseAccess.js` is a pure module (no Firestore /
//     no fetch / no Node-only imports).
//   - The hook `src/hooks/useCourseAccess.ts` subscribes to
//     entitlements + subscriptions + legacy user docs.
//   - The CourseRouteGuard component uses the resolver
//     instead of `purchasedIds.has(productId)`.
//   - The Course Player + PDP + Profile + Purchases library
//     all consume the resolver.
//   - The `accessSource` field exists in the resolver output.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const resolver = readSource("utils/courseAccess.js");
const resolverDts = readSource("utils/courseAccess.d.ts");
const hook = readSource("src/hooks/useCourseAccess.ts");
const routeGuard = readSource("src/components/CourseRouteGuard.tsx");
const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const playerPanel = readSource("src/course/PlayerPanel.tsx");
const pdpApp = readSource("src/PdpApp.tsx");
const profileApp = readSource("src/profile/App.tsx");
const otherTabs = readSource("src/components/OtherTabs.tsx");
const mainTsx = readSource("src/main.tsx");

// ---------------------------------------------------------------------------
// utils/courseAccess.js — pure engine
// ---------------------------------------------------------------------------

test("utils/courseAccess.js is pure (no Firestore / no fetch / no Node-only imports)", () => {
  assert.doesNotMatch(resolver, /firebase-admin/);
  assert.doesNotMatch(resolver, /require\(/);
  assert.doesNotMatch(resolver, /process\.env/);
  assert.doesNotMatch(resolver, /from "node:/);
});

test("utils/courseAccess.js exports the resolver + every spec helper", () => {
  for (const name of [
    "resolveCourseAccess",
    "isSubscriptionRecordActive",
    "collectEntitlementOwnership",
    "collectModules",
    "collectResources",
    "findModuleById",
    "findResourceById",
    "moduleRequiredPreviousIds",
    "isPreviewEnabled",
  ]) {
    // Accept either `export const name` (top-level export) or
    // any `export { ..., name, ... }` re-export at the bottom.
    const topLevel = new RegExp(`export\\s+const\\s+${name}\\b`).test(resolver);
    const reExport = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(resolver);
    assert.ok(topLevel || reExport, `missing export ${name}`);
  }
});

test("utils/courseAccess.d.ts declares the spec-shaped CourseAccessResolution", () => {
  for (const field of [
    "hasFullProductAccess",
    "ownedModuleIds",
    "ownedResourceIds",
    "ownedUpdateIds",
    "subscriptionGrantedModuleIds",
    "accessibleModuleIds",
    "accessibleResourceIds",
    "lockedModuleIds",
    "previewModuleIds",
    "moduleAccessSources",
    "resourceAccessSources",
    "unmetDependencies",
  ]) {
    assert.match(resolverDts, new RegExp(`\\b${field}\\b`), `missing field ${field}`);
  }
  // The access source union must include every source kind.
  for (const source of [
    "full_product",
    "module_purchase",
    "resource_purchase",
    "paid_update",
    "subscription",
    "preview",
    "locked",
  ]) {
    assert.match(resolverDts, new RegExp(`\\b${source}\\b`), `missing access source ${source}`);
  }
});

// ---------------------------------------------------------------------------
// src/hooks/useCourseAccess.ts — Firestore subscriptions
// ---------------------------------------------------------------------------

test("useCourseAccess subscribes to canonical entitlements (entitlements/{uid}__*)", () => {
  assert.match(hook, /collection\(db, "entitlements"\)/);
  assert.match(hook, /where\("uid", "==", uid\)/);
});

test("useCourseAccess subscribes to the current subscription record (users/{uid}/subscription/current)", () => {
  assert.match(hook, /subscription/, "must reference the subscription record");
  assert.match(hook, /doc\(db, "users", uid, "subscription", "current"\)/);
});

test("useCourseAccess also reads the legacy users/{uid} doc for purchasedProductIds + purchasedProductUpdateIds", () => {
  assert.match(hook, /purchasedProductIds/);
  assert.match(hook, /purchasedProductUpdateIds/);
  assert.match(hook, /doc\(db, "users", uid\)/);
});

test("useCourseAccess also reads the legacy users/{uid}/purchases subcollection", () => {
  assert.match(hook, /collection\(db, "users", uid, "purchases"\)/);
});

test("useCourseAccess calls resolveCourseAccess (single source of truth)", () => {
  assert.match(hook, /resolveCourseAccess\(/);
});

// ---------------------------------------------------------------------------
// src/components/CourseRouteGuard.tsx
// ---------------------------------------------------------------------------

test("CourseRouteGuard uses useCourseAccess (not the legacy purchasedIds.has check)", () => {
  assert.match(routeGuard, /useCourseAccess/);
  // The spec rule: "Do not require full-product ownership
  // when user owns a valid module/resource."
  assert.match(routeGuard, /hasAnyAccess/);
  assert.match(routeGuard, /hasFullProductAccess/);
  assert.match(routeGuard, /ownedModuleIds/);
  assert.match(routeGuard, /ownedResourceIds/);
  assert.match(routeGuard, /ownedUpdateIds/);
  assert.match(routeGuard, /subscriptionGrantedModuleIds/);
  // The old `purchasedIds.has(productId)` check is gone from
  // the code (it may only appear in a doc comment).
  const codeOnly = routeGuard.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(codeOnly, /purchasedIds\.has/);
});

test("CourseRouteGuard renders the Course Player when ANY access exists, PDP otherwise", () => {
  // The component branches on `hasAnyAccess`.
  assert.match(routeGuard, /hasAnyAccess/);
  assert.match(routeGuard, /CoursePlayerApp/);
  assert.match(routeGuard, /PDP_WITH_OWNERSHIP/);
});

// ---------------------------------------------------------------------------
// main.tsx — direct course-route protection
// ---------------------------------------------------------------------------

test("main.tsx uses CourseRouteGuard for the direct course route", () => {
  // The old inline `purchasedIds.has(...)` check is gone.
  assert.doesNotMatch(mainTsx, /if \(!purchasedIds\.has\(selectedCourseProduct\.id\)\)/);
  assert.match(mainTsx, /<CourseRouteGuard/);
});

// ---------------------------------------------------------------------------
// CoursePlayerApp — single resolver
// ---------------------------------------------------------------------------

test("CoursePlayerApp uses useCourseAccess + resolver.accessibleModuleIds (single source of truth)", () => {
  assert.match(coursePlayer, /useCourseAccess/);
  assert.match(coursePlayer, /resolution\.accessibleModuleIds/);
  // The old local `ownedUpdateIds` Firestore subscription is
  // gone — the resolver owns it now.
  assert.doesNotMatch(coursePlayer, /setOwnedUpdateIds/);
  // The first-accessible file walker is fed the resolver's
  // accessibleModuleIds set.
  assert.match(coursePlayer, /firstAccessibleFile\(modules, resolution\.accessibleModuleIds\)/);
});

test("The Player tab shows the active-subscription badge when the subscription is active", () => {
  // The badge rides the footer dock's Player tab now (the header is gone).
  assert.match(coursePlayer, /hasActiveSubscription/);
  assert.match(playerPanel, /data-course-subscription-badge="active"/);
  assert.match(playerPanel, /Active subscription/);
});

// ---------------------------------------------------------------------------
// PDP — resolver feeds ownedModuleIds + ownedResourceIds
// ---------------------------------------------------------------------------

test("PdpApp feeds the resolver's ownedModuleIds + ownedResourceIds to the builder", () => {
  assert.match(pdpApp, /useCourseAccess/);
  assert.match(pdpApp, /ownedModuleIds=\{ownedModuleIds\}/);
  assert.match(pdpApp, /ownedResourceIds=\{ownedResourceIds\}/);
});

// ---------------------------------------------------------------------------
// Profile — single resolver
// ---------------------------------------------------------------------------

test("Profile uses useOwnedProducts for the canonical Purchased count", () => {
  assert.match(profileApp, /useOwnedProducts/);
  assert.match(profileApp, /canonicalOwnedIds/);
  assert.match(profileApp, /signedIn/);
});

// ---------------------------------------------------------------------------
// Purchases library — single resolver
// ---------------------------------------------------------------------------

test("OtherTabs (Purchases library) uses useOwnedProducts + merges with purchasedIds", () => {
  assert.match(otherTabs, /useOwnedProducts/);
  assert.match(otherTabs, /canonicalOwnedIds/);
});

// ---------------------------------------------------------------------------
// Field completeness
// ---------------------------------------------------------------------------

test("Every Part 10 spec field is implemented in the resolver + types", () => {
  for (const field of [
    "hasFullProductAccess",
    "ownedModuleIds",
    "ownedResourceIds",
    "ownedUpdateIds",
    "subscriptionGrantedModuleIds",
    "accessibleModuleIds",
    "accessibleResourceIds",
    "lockedModuleIds",
    "previewModuleIds",
  ]) {
    assert.match(resolver, new RegExp(`\\b${field}\\b`), `resolver missing ${field}`);
    assert.match(resolverDts, new RegExp(`\\b${field}\\b`), `d.ts missing ${field}`);
  }
});
