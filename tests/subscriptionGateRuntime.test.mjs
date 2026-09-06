import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../api/_lib/subscriptionGate.ts", import.meta.url), "utf8");

async function loadGate(t, getSnapshot) {
  let ts;
  try {
    ts = require("typescript");
  } catch {
    t.skip("dependencies not installed — run pnpm install");
    return null;
  }

  // Execute the actual reader, mocking only the shared Admin database.
  // The snapshots below deliberately expose `exists` as a boolean, not
  // the client SDK's exists() method. No Firebase credentials are needed.
  const get = t.mock.fn(getSnapshot);
  const doc = t.mock.fn((path) => {
    assert.equal(path, "settings/subscriptionGate");
    return { get };
  });
  const exports = {};
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: "subscriptionGate.ts",
  }).outputText;
  new Function("require", "exports", output)((specifier) => {
    if (specifier === "./firebaseAdmin.js") return { adminDb: () => ({ doc }) };
    return require(specifier);
  }, exports);
  return { ...exports, doc, get };
}

test("missing Admin settings snapshot returns the legacy defaults", async (t) => {
  const gate = await loadGate(t, async () => ({
    exists: false,
    data: () => assert.fail("a missing document must not be read"),
  }));
  if (!gate) return;

  const settings = await gate.getSubscriptionGateSettings();
  assert.deepEqual(settings, gate.SUBSCRIPTION_GATE_DEFAULTS);
  assert.notStrictEqual(settings, gate.SUBSCRIPTION_GATE_DEFAULTS);
  assert.equal(settings.oldGateEnabled, true);
  assert.equal(settings.hideUntilPurchasedEnabled, false);
  assert.equal(gate.doc.mock.callCount(), 1);
  assert.equal(gate.get.mock.callCount(), 1);
});

for (const data of [{}, undefined]) {
  test(`existing Admin snapshot with ${data ? "empty" : "undefined"} data returns defaults`, async (t) => {
    const gate = await loadGate(t, async () => ({ exists: true, data: () => data }));
    if (!gate) return;
    assert.deepEqual(await gate.getSubscriptionGateSettings(), gate.SUBSCRIPTION_GATE_DEFAULTS);
  });
}

test("existing Admin settings snapshot normalises all sections and its timestamp", async (t) => {
  const updatedAt = 1_788_652_800_000;
  const gate = await loadGate(t, async () => ({
    exists: true,
    data: () => ({
      oldGateEnabled: false,
      hideUntilPurchasedEnabled: true,
      features: {
        myday: {
          gated: 1,
          durations: { monthly: false },
          tiers: { basic: 0, premium: 1 },
          hideFromNonSubscribers: 1,
        },
      },
      planVisibility: {
        basic: { visible: false, visibleToSubscribers: false, durations: { lifetime: false } },
      },
      subscriberPricing: { premium: { monthly: "99", yearly: "invalid", lifetime: null } },
      usageLimits: { aiQuestionsPerDay: { premium: "25", zero: 0, negative: -1, invalid: "invalid" } },
      updatedAt: { toMillis: () => updatedAt },
      unknownField: "ignored",
    }),
  }));
  if (!gate) return;

  assert.deepEqual(await gate.getSubscriptionGateSettings(), {
    oldGateEnabled: false,
    hideUntilPurchasedEnabled: true,
    features: {
      myday: {
        gated: true,
        durations: { monthly: false, yearly: true, lifetime: true },
        tiers: { basic: false, premium: true },
        hideFromNonSubscribers: true,
      },
    },
    planVisibility: {
      basic: {
        visible: false,
        visibleToSubscribers: false,
        durations: { monthly: true, yearly: true, lifetime: false },
      },
    },
    subscriberPricing: { premium: { monthly: 99, yearly: null, lifetime: null } },
    usageLimits: { aiQuestionsPerDay: { premium: 25 } },
    updatedAt,
  });
});

test("existing Admin settings snapshot preserves a numeric timestamp", async (t) => {
  const gate = await loadGate(t, async () => ({ exists: true, data: () => ({ updatedAt: 12345 }) }));
  if (!gate) return;
  assert.deepEqual(await gate.getSubscriptionGateSettings(), {
    ...gate.SUBSCRIPTION_GATE_DEFAULTS,
    updatedAt: 12345,
  });
});

test("Admin read failures propagate instead of silently disabling configured gates", async (t) => {
  const error = new Error("Firestore unavailable");
  const gate = await loadGate(t, async () => { throw error; });
  if (!gate) return;
  await assert.rejects(gate.getSubscriptionGateSettings(), (actual) => actual === error);
});
