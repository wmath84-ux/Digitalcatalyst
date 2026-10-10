import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync("src/subscription/utils/unlockPresentation.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { subscriptionUnlockName, includedSubscriptionModules } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const products = [
  {
    id: "public",
    documentId: "doc",
    title: "Current course name",
    canonicalModules: [
      {
        id: "root",
        title: "Root",
        modules: [{ id: "nested", title: "Named nested module", modules: [] }],
      },
    ],
    courseContent: [{ id: "legacy", title: "Legacy named module", modules: [] }],
  },
];
test("Generic plan-unlock labels resolve to real canonical or legacy module names", () => {
  assert.equal(
    subscriptionUnlockName(products, "doc", "nested", "Plan unlock: module nested"),
    "Named nested module"
  );
  assert.equal(subscriptionUnlockName(products, "public", "legacy"), "Legacy named module");
  assert.equal(
    subscriptionUnlockName(products, "doc", null, "Plan unlock: doc"),
    "Current course name"
  );
});
test("Receipt snapshot names win over a subsequently renamed catalog, even when equal to an ID", () => {
  assert.equal(
    subscriptionUnlockName(products, "doc", "nested", "Server snapshot module"),
    "Server snapshot module"
  );
  assert.equal(
    subscriptionUnlockName(products, "doc", null, "Bought course snapshot"),
    "Bought course snapshot"
  );
  assert.equal(subscriptionUnlockName(products, "doc", null, "doc"), "doc");
});
test("Plan metadata and explicit module unlocks deduplicate canonical/public product aliases without losing partial scope", () => {
  const plan = { id: "basic", includedModuleKeys: ["doc:nested", "doc:legacy"] };
  const catalog = {
    moduleUnlocks: [
      { active: true, planId: "basic", productId: "public", moduleId: "nested" },
      { active: false, planId: "basic", productId: "public", moduleId: "hidden" },
      { active: true, planId: "other", productId: "public", moduleId: "other" },
    ],
  };
  const rows = includedSubscriptionModules(catalog, plan, products);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "doc:nested");
  assert.equal(rows[0].title, "Named nested module");
  assert.equal(rows[0].productTitle, "Current course name");
  assert.equal(rows[1].id, "doc:legacy");
  assert.equal(rows[1].title, "Legacy named module");
});
test("Missing catalog names expose actual IDs rather than inventing names or whole-course access", () => {
  assert.equal(
    subscriptionUnlockName([], "missing", "part", "Plan unlock: module part"),
    "Module ID: part"
  );
  assert.equal(
    subscriptionUnlockName([], "missing", null, "Plan unlock: missing"),
    "Course ID: missing"
  );
  assert.deepEqual(includedSubscriptionModules(null, null, []), []);
});
