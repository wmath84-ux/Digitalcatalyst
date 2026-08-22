// tests/revisionSubscriptionFeatureContract.test.mjs
//
// Contract for Revision as a subscription feature:
//   · frontend — Revision access mirrors the My Day gate against the
//     `revision` catalog feature (gate only exists while the feature doc
//     is present and active); the app is always browsable and the gate
//     appears as a floating PremiumGate modal when a paywalled action is
//     attempted (same behaviour as My Day — no upfront lock screen);
//   · subscription page — Revision is a first-class feature: default
//     selection, member-view navigation;
//   · backend — one-time feature seeding, generic quote/entitlement flow;
//   · customisation — admin icon defaults + fallback catalog defaults.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const revisionApp = fs.readFileSync("src/revision/RevisionApp.tsx", "utf8");
const premiumGate = fs.readFileSync("src/components/subscription/PremiumGate.tsx", "utf8");
const useRevisionAccess = fs.readFileSync("src/hooks/useRevisionAccess.ts", "utf8");
const fallback = fs.readFileSync("src/subscription/data/fallbackCatalog.ts", "utf8");
const subscriptionPage = fs.readFileSync("src/subscription/components/SubscriptionPage.tsx", "utf8");
const featureModal = fs.readFileSync("src/subscription/components/FeatureSelectModal.tsx", "utf8");
const adminClient = fs.readFileSync("src/lib/admin/client.ts", "utf8");
const serverSubscriptions = fs.readFileSync("api/_lib/subscriptions.ts", "utf8");
const entitlements = fs.readFileSync("api/_lib/entitlements.ts", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");

// ---------------------------------------------------------------------------
// Frontend gate
// ---------------------------------------------------------------------------

test("revision access mirrors the My Day gate against the revision feature doc", () => {
  assert.match(useRevisionAccess, /doc\(db, "subscriptionFeatures", "revision"\)/);
  assert.match(useRevisionAccess, /doc\(db, "users", user\.id, "subscription", "current"\)/);
  assert.match(useRevisionAccess, /features\.includes\("revision"\)/);
  assert.match(useRevisionAccess, /status === "active"/);
  assert.match(useRevisionAccess, /expiresAt/);
  // Missing/inactive feature doc removes the gate (feature becomes free).
  assert.match(useRevisionAccess, /featureConfigured = snapshot\.exists\(\) && \(snapshot\.data\(\)\?\.active !== false\)/);
});

test("RevisionApp gates paywalled actions with the floating premium gate", () => {
  assert.match(revisionApp, /useRevisionAccess/);
  assert.match(revisionApp, /hasRevisionAccess/);
  assert.match(revisionApp, /revisionAccessLoading/);
  assert.match(revisionApp, /data-revision-access-loading/);
  // No upfront lock screen: the app always renders so learners can browse,
  // and the unified PremiumGate modal (same behaviour as My Day) opens only
  // when a paywalled action is attempted.
  assert.match(revisionApp, /<PremiumGate/);
  assert.match(revisionApp, /variant="revision"/);
  assert.match(revisionApp, /userName=\{userName\}/);
  assert.match(revisionApp, /open=\{paywallOpen\}/);
  assert.match(revisionApp, /if \(hasRevisionAccess\) return true;/);
  assert.match(revisionApp, /setPaywallOpen\(true\)/);
  assert.match(revisionApp, /onRequireAccess=\{requireAccess\}/);
  // Only new-test creation is gated. Existing player/session/result routes
  // remain available after expiry or downgrade.
  assert.match(revisionApp, /AiGeneratePage[\s\S]{0,180}onRequireAccess=\{requireAccess\}/);
  assert.match(revisionApp, /BulkImportPage[\s\S]{0,180}onRequireAccess=\{requireAccess\}/);
  assert.match(revisionApp, /Existing saved tests and in-progress attempts remain usable/);
  assert.match(revisionApp, /Smart Revision sessions operate on existing learner-owned data/);
  // The gate lives on the existing route — #/revision still mounts the app.
  assert.match(main, /hash\.startsWith\(REVISION_HASH\)\) return <RevisionApp \/>/);
});

test("the premium gate pushes buyers to the subscription page", () => {
  // The unified gate carries the Revision Studio branding and hands the
  // navigation decision to its caller.
  assert.match(premiumGate, /Revision Studio/);
  assert.match(premiumGate, /onClick=\{onViewSubscription\}/);
  assert.match(premiumGate, /View subscription/);
  // Modal mode stays dismissible ("Maybe later") so browsing is never blocked.
  assert.match(premiumGate, /Maybe later/);
  assert.match(premiumGate, /if \(!open\) return null;/);
  // RevisionApp wires the CTA to the subscription page.
  assert.match(revisionApp, /window\.location\.hash = "#\/subscription"/);
});

// ---------------------------------------------------------------------------
// Subscription page integration
// ---------------------------------------------------------------------------

test("Revision is a first-class selectable feature with default selection", () => {
  assert.match(subscriptionPage, /const defaultFeatureIds = \["my-day", "revision"\]/);
  assert.match(subscriptionPage, /defaultFeatureIds\.filter/);
  assert.match(subscriptionPage, /if \(featureId === "revision"\) window\.location\.hash = "#\/revision"/);
});

test("the feature picker renders the revision icons", () => {
  assert.match(featureModal, /brain: <Brain/);
  assert.match(featureModal, /"refresh-cw": <RefreshCw/);
  assert.match(featureModal, /brain: "bg-indigo-50 text-indigo-600"/);
});

// ---------------------------------------------------------------------------
// Backend + seeding
// ---------------------------------------------------------------------------

test("server seeds the Revision feature once and respects admin deletions", () => {
  assert.match(serverSubscriptions, /ensureDefaultSubscriptionFeatures/);
  assert.match(serverSubscriptions, /DEFAULT_SUBSCRIPTION_FEATURES/);
  assert.match(serverSubscriptions, /id: "revision"/);
  assert.match(serverSubscriptions, /icon: "brain"/);
  assert.match(serverSubscriptions, /badge: "PAID"/);
  // Marker doc keeps a record of what was seeded — no silent re-seed.
  assert.match(serverSubscriptions, /subscriptionCatalogSettings/);
  assert.match(serverSubscriptions, /seededFeatures/);
  // The seed runs before the catalog is served.
  assert.match(serverSubscriptions, /await ensureDefaultSubscriptionFeatures\(db\)/);
});

test("quote + grant flow carries any catalog feature id through generically", () => {
  assert.match(entitlements, /const uniqueFeatures = Array\.from\(new Set\(selectedFeatureIds\)\)/);
  assert.match(entitlements, /features: uniqueFeatures/);
  // Unknown feature ids are refused against the live catalog, not a whitelist.
  assert.match(serverSubscriptions, /SUBSCRIPTION_FEATURE_NOT_FOUND/);
});

test("fallback catalog ships Revision so the page works offline", () => {
  assert.match(fallback, /id: "revision"/);
  assert.match(fallback, /name: "Revision Studio"/);
  assert.match(fallback, /icon: "brain"/);
  assert.match(fallback, /badge: "PAID"/);
  // The legacy My Day entry stays intact beside it.
  assert.match(fallback, /id: "my-day"/);
});

// ---------------------------------------------------------------------------
// Admin customisation
// ---------------------------------------------------------------------------

test("admin feature editor defaults the revision icon to brain", () => {
  assert.match(adminClient, /recordId === "revision" \? "brain"/);
  assert.match(adminClient, /recordId === "my-day" \? "calendar"/);
});
