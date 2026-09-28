import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");

test("the APK never paints the marketing landing page", () => {
  assert.match(main, /skipLandingForInstalledApp/);
  assert.match(main, /installedMobilePwa \|\| isNativeApp\(\)/);
  assert.match(main, /landingRouteRequested/);
  assert.match(main, /history\.replaceState[\s\S]*HOME_HASH/);
  assert.match(main, /setHash\(HOME_HASH\)/);
  assert.match(main, /isInstalledMobilePwa\(\) \|\| isNativeApp\(\)/);
});
