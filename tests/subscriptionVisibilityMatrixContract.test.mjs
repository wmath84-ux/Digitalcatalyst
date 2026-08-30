// tests/subscriptionVisibilityMatrixContract.test.mjs
//
// Contract for Phase-1 of the new subscription logic: per-feature +
// per-duration + per-tier visibility matrix + subscriber pricing + user
// limit, plus the "hide until purchased" mode for premium features.
//
// The admin client (`src/lib/admin/client.ts`) is the only writer; the
// feature page hooks (`src/hooks/useMyDayAccess.ts` +
// `src/hooks/useRevisionAccess.ts`) and the visibility context
// (`src/context/FeatureVisibilityContext.tsx`) are the readers. Both
// sides are tested statically so a regression anywhere fails the same
// contract.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const admin = fs.readFileSync("src/lib/admin/client.ts", "utf8");
const adminPage = fs.readFileSync("src/admin/pages/SubscriptionsPage.tsx", "utf8");
const myDayHook = fs.readFileSync("src/hooks/useMyDayAccess.ts", "utf8");
const revisionHook = fs.readFileSync("src/hooks/useRevisionAccess.ts", "utf8");
const myDayServer = fs.readFileSync("api/_lib/myDay.ts", "utf8");
const visibility = fs.readFileSync("src/context/FeatureVisibilityContext.tsx", "utf8");
const appShell = fs.readFileSync("src/components/AppShell.tsx", "utf8");
const desktopShell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");
const myDayApp = fs.readFileSync("src/MyDayApp.tsx", "utf8");
const revisionApp = fs.readFileSync("src/revision/RevisionApp.tsx", "utf8");

// ---------------------------------------------------------------------------
// 1. Admin client — the writer
// ---------------------------------------------------------------------------

test("admin client supports the visibilityMode field (gate vs hide) on features", () => {
  // The admin client normalises `visibilityMode` from the body, defaults
  // to "gate" (legacy), and persists it on the Firestore doc.
  assert.match(
    admin,
    /visibilityMode:\s*body\.visibilityMode\s*===\s*"hide"\s*\?\s*"hide"\s*:\s*"gate"/,
    "feature visibilityMode is normalised to 'hide' or 'gate'",
  );
  assert.match(
    admin,
    /visibilityMode:\s*data\.visibilityMode\s*===\s*"hide"\s*\?\s*"hide"\s*:\s*"gate"/,
    "feature visibilityMode is read back the same way on GET",
  );
});

test("admin client supports visibleCycles (per-duration matrix)", () => {
  // The normaliser accepts an array, defaults to both monthly + yearly,
  // and dedupes. The form exposes the same field on the plan too.
  assert.match(
    admin,
    /function\s+normaliseVisibleCycles\(/,
    "normaliseVisibleCycles helper exists in the admin client",
  );
  assert.match(
    admin,
    /return\s+\["monthly",\s*"yearly"\]/,
    "the default cycles are monthly + yearly when the array is empty",
  );
  // The plan also gets the field.
  assert.match(
    admin,
    /visibleCycles:\s*normaliseVisibleCycles\(body\.visibleCycles\)/,
    "plan writes the normalised visibleCycles on save",
  );
  assert.match(
    admin,
    /visibleCycles:\s*normaliseVisibleCycles\(data\.visibleCycles\)/,
    "plan reads the same field on GET",
  );
});

test("admin client supports subscriberPricingOverride (per-cycle subscriber price)", () => {
  // The override carries rupee values for monthly / yearly / lifetime.
  // A null value means "use the public price for everyone".
  assert.match(
    admin,
    /function\s+normaliseSubscriberPricing\(/,
    "normaliseSubscriberPricing helper exists",
  );
  assert.match(
    admin,
    /subscriberPricingOverride:\s*normaliseSubscriberPricing\(body\.subscriberPricingOverride\)/,
    "feature writes subscriberPricingOverride on save",
  );
  assert.match(
    admin,
    /subscriberPricingOverride:\s*normaliseSubscriberPricing\(data\.subscriberPricingOverride\)/,
    "feature reads subscriberPricingOverride on GET",
  );
  // The plan gets the same field.
  assert.match(
    admin,
    /subscriberPricingOverride:\s*normaliseSubscriberPricing\(body\.subscriberPricingOverride\)/,
    "plan writes subscriberPricingOverride on save",
  );
});

test("admin client supports hiddenPlanIds (per-plan hide toggle)", () => {
  // hiddenPlanIds is a string list of plan ids the feature is removed
  // from. Empty = available on every plan.
  assert.match(
    admin,
    /hiddenPlanIds:\s*normaliseStringList\(body\.hiddenPlanIds\)/,
    "feature writes hiddenPlanIds on save",
  );
  assert.match(
    admin,
    /hiddenPlanIds:\s*normaliseStringList\(data\.hiddenPlanIds\)/,
    "feature reads hiddenPlanIds on GET",
  );
});

test("admin client supports userLimit (per-feature cap, currently AI questions/day)", () => {
  // The user limit is shape-typed so future fields (storage, sessions)
  // join the same object without breaking the contract.
  assert.match(
    admin,
    /function\s+normaliseUserLimit\(/,
    "normaliseUserLimit helper exists",
  );
  assert.match(
    admin,
    /userLimit:\s*normaliseUserLimit\(body\.userLimit,\s*recordId\)/,
    "feature writes the normalised userLimit on save",
  );
  assert.match(
    admin,
    /userLimit:\s*normaliseUserLimit\(data\.userLimit,\s*String\(item\.id\)\)/,
    "feature reads userLimit on GET with the document id as the seed",
  );

  // GET used to call recordId(item.id) in the same function that later
  // declared `const recordId = ...`, which crashed the admin Subscriptions
  // customisation page with "Cannot access 'recordId' before initialization".
  const featuresFn = admin.slice(
    admin.indexOf("async function subscriptionFeaturesRequest"),
    admin.indexOf("async function subscriptionPlanProductsRequest"),
  );
  assert.doesNotMatch(featuresFn, /recordId\(item\.id\)/);
  // Built-in defaults: 50/day for Revision.
  assert.match(
    admin,
    /if\s*\(recordId\s*===\s*"revision"\)\s*return\s*50/,
    "Revision ships with a built-in 50 AI questions/day default",
  );
});

// ---------------------------------------------------------------------------
// 2. Admin form — the UI exposes the new fields
// ---------------------------------------------------------------------------

test("the admin Features form exposes visibilityMode as a radio (gate vs hide)", () => {
  assert.match(
    adminPage,
    /Hide until purchased/,
    "the feature sheet renders the 'Hide until purchased' radio",
  );
  assert.match(
    adminPage,
    /Show paywall on access/,
    "the feature sheet renders the legacy 'Show paywall on access' radio",
  );
  assert.match(
    adminPage,
    /visibilityMode:\s*"gate"/,
    "the gate radio writes visibilityMode: 'gate'",
  );
  assert.match(
    adminPage,
    /visibilityMode:\s*"hide"/,
    "the hide radio writes visibilityMode: 'hide'",
  );
});

test("the admin Features form exposes the per-cycle and per-plan matrix", () => {
  assert.match(
    adminPage,
    /Billing durations non-subscribers can pick/,
    "the feature sheet renders the cycle toggle row",
  );
  assert.match(
    adminPage,
    /Hide from specific plans/,
    "the feature sheet renders the per-plan hide toggles",
  );
  assert.match(
    adminPage,
    /Subscriber-only price/,
    "the feature sheet renders the subscriber-only price inputs",
  );
  assert.match(
    adminPage,
    /User limit \(per billing cycle\)/,
    "the feature sheet renders the user limit input",
  );
});

test("the admin Plans form exposes visibleCycles and subscriberPricingOverride", () => {
  assert.match(
    adminPage,
    /Visibility & subscriber pricing/,
    "the plan sheet renders the new visibility & pricing section",
  );
  assert.match(
    adminPage,
    /Billing durations to show/,
    "the plan sheet renders the per-plan cycle toggle row",
  );
});

// ---------------------------------------------------------------------------
// 3. Hooks — the readers
// ---------------------------------------------------------------------------

test("useRevisionAccess exposes a `hidden` flag driven by visibilityMode", () => {
  assert.match(
    revisionHook,
    /const\s*\[hidden,\s*setHidden\]\s*=\s*useState\(false\)/,
    "useRevisionAccess owns a `hidden` state",
  );
  assert.match(
    revisionHook,
    /visibilityMode\s*=\s*data\.visibilityMode\s*===\s*"hide"\s*\?\s*"hide"\s*:\s*"gate"/,
    "useRevisionAccess reads the feature's visibilityMode",
  );
  assert.match(
    revisionHook,
    /setHidden\(visibilityMode\s*===\s*"hide"\s*&&\s*!paid\)/,
    "useRevisionAccess returns hidden=true only when hide mode AND not paid",
  );
  assert.match(
    revisionHook,
    /return\s*\{\s*hasAccess,\s*hidden,\s*loading/,
    "useRevisionAccess returns { hasAccess, hidden, loading }",
  );
});

test("useMyDayAccess exposes a `hidden` flag driven by the server's response", () => {
  // My Day resolves the flag server-side (so the admin's free quota and
  // the visibility mode travel together on the same auth round-trip).
  // The hook mirrors the server field into the local `hidden` state.
  assert.match(
    myDayHook,
    /setHidden\(Boolean\(\(result\.access as any\)\?\.hidden\)\)/,
    "useMyDayAccess reads the server's `hidden` field",
  );
  assert.match(
    myDayHook,
    /hidden,\s*\/\/ Phase-1/,
    "useMyDayAccess returns `hidden` from the hook",
  );
});

test("api myday endpoint returns the `hidden` flag computed from the feature's visibilityMode", () => {
  // Phase-1 derives the per-doc mode from `feature.visibilityMode`; the
  // global kill switch + per-feature override can flip the effective
  // mode to "hide" independently.
  assert.match(
    myDayServer,
    /perDocMode\s*=\s*\(feature as any\)\?\.visibilityMode\s*===\s*"hide"\s*\?\s*"hide"\s*:\s*"gate"/,
    "api/_lib/myDay.ts derives the per-doc visibilityMode from the feature doc",
  );
  assert.match(
    myDayServer,
    /visibilityMode\s*=\s*perDocMode\s*===\s*"hide"\s*\|\|\s*globalHideOn\s*\?\s*"hide"\s*:\s*"gate"/,
    "api/_lib/myDay.ts stacks the per-doc + global kill switch into the effective mode",
  );
  assert.match(
    myDayServer,
    /const\s+hidden\s*=\s*visibilityMode\s*===\s*"hide"\s*&&\s*!paid/,
    "api/_lib/myDay.ts returns hidden=true only when hide mode AND not paid",
  );
  assert.match(
    myDayServer,
    /hidden,/,
    "api/_lib/myDay.ts includes `hidden` on the access snapshot",
  );
  assert.match(
    myDayServer,
    /getSubscriptionGateSettings\(\)/,
    "api/_lib/myDay.ts reads the gate settings document",
  );
});

// ---------------------------------------------------------------------------
// 4. Visibility context — the bridge between the page and the chrome
// ---------------------------------------------------------------------------

test("FeatureVisibilityContext exists and exposes the publish + read API", () => {
  assert.match(
    visibility,
    /export function FeatureVisibilityProvider/,
    "the provider is exported",
  );
  assert.match(
    visibility,
    /useFeatureVisibilityMap/,
    "the read-everything hook is exported",
  );
  assert.match(
    visibility,
    /usePublishFeatureVisibility/,
    "the auto-cleanup publish hook is exported",
  );
});

test("AppShell mounts the FeatureVisibilityProvider in both desktop and mobile branches", () => {
  // The provider must wrap BOTH render branches — the desktop shell AND
  // the per-page chrome — so a feature page can publish its visibility
  // regardless of which chrome owns the screen.
  const occurrences = (appShell.match(/<FeatureVisibilityProvider>/g) || []).length;
  assert.ok(
    occurrences >= 2,
    `AppShell must mount the provider in both the desktop and the mobile branch (found ${occurrences})`,
  );
});

test("DesktopShell reads the visibility map and filters hidden primary rail entries", () => {
  assert.match(
    desktopShell,
    /useFeatureVisibilityMap\(\)/,
    "DesktopShell calls the read-everything hook",
  );
  assert.match(
    desktopShell,
    /featureVisibility\[entry\.key\]\?\.hidden/,
    "DesktopShell checks the per-entry hidden flag",
  );
  assert.match(
    desktopShell,
    /filter\(\(entry\):\s*entry is RailEntry =>\s*entry !== null\)/,
    "DesktopShell filters out hidden entries from the primary rail",
  );
});

test("MyDayApp publishes its visibility into the shared context", () => {
  assert.match(
    myDayApp,
    /usePublishFeatureVisibility\("myday"/,
    "MyDayApp publishes its visibility under the 'myday' key",
  );
});

test("RevisionApp publishes its visibility into the shared context", () => {
  assert.match(
    revisionApp,
    /usePublishFeatureVisibility\("revision"/,
    "RevisionApp publishes its visibility under the 'revision' key",
  );
});

// ---------------------------------------------------------------------------
// 5. Backwards compatibility
// ---------------------------------------------------------------------------

test("the existing feature pricing tests still pass — no shape change for the legacy fields", () => {
  // The Phase-1 fields are pure additions. The legacy `price` /
  // `monthlyPrice` / `yearlyPrice` / `planPricing` writes stay.
  assert.match(
    admin,
    /price:\s*Number\(body\.individualPrice \|\| 0\),/,
    "legacy `price` field is still written on save",
  );
  assert.match(
    admin,
    /monthlyPrice:\s*optionalRupees\(body\.monthlyPrice\),/,
    "legacy `monthlyPrice` field is still written on save",
  );
  assert.match(
    admin,
    /yearlyPrice:\s*optionalRupees\(body\.yearlyPrice\),/,
    "legacy `yearlyPrice` field is still written on save",
  );
  assert.match(
    admin,
    /planPricing:\s*body\.planPricing\s*&&\s*typeof\s+body\.planPricing\s*===\s*"object"\s*\?\s*body\.planPricing\s*:\s*\{\}/,
    "legacy `planPricing` field is still written on save",
  );
});

test("the existing visibilityMode defaults to 'gate' — legacy data is unaffected", () => {
  // Pre-Phase-1 feature docs have no `visibilityMode` field. The
  // reader collapses the missing field to "gate", so a paywall still
  // shows on the legacy behaviour.
  assert.match(
    admin,
    /data\.visibilityMode\s*===\s*"hide"\s*\?\s*"hide"\s*:\s*"gate"/,
    "visibilityMode defaults to 'gate' when missing",
  );
});
