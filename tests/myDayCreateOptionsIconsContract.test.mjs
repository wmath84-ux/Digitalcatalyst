import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const myDay = fs.readFileSync("src/MyDayApp.tsx", "utf8");

test("MyDayApp imports every lucide icon referenced in CREATE_OPTIONS", () => {
  // The `CREATE_OPTIONS` array lives at module scope, so a missing import
  // (e.g. `icon: Bell` without `Bell` in the lucide-react import) throws a
  // ReferenceError while the module is being evaluated — which crashes the
  // entire app before `createRoot(...).render(...)` and leaves the static
  // boot splash on screen forever ("stuck on loading").
  const importMatch = myDay.match(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/);
  assert.ok(importMatch, "lucide-react import not found in MyDayApp.tsx");
  const imported = importMatch[1].split(",").map((name) => name.trim()).filter(Boolean);

  const optionsMatch = myDay.match(/CREATE_OPTIONS[\s\S]*?=\s*\[([\s\S]*?)\];/);
  assert.ok(optionsMatch, "CREATE_OPTIONS array not found in MyDayApp.tsx");
  const iconRefs = [...optionsMatch[1].matchAll(/icon:\s*([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]);

  assert.ok(iconRefs.length > 0, "CREATE_OPTIONS should reference at least one icon");
  for (const icon of iconRefs) {
    assert.ok(
      imported.includes(icon),
      `CREATE_OPTIONS references \`${icon}\` but it is not imported from lucide-react`,
    );
  }
});
