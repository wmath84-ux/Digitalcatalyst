// tests/revisionCloudSyncTimeoutContract.test.mjs
//
// Cloud sync reliability — bounded hydration contract:
//   · app startup cloud hydration is bounded — no indefinite loading;
//   · the intended hydration timeout is around seven seconds;
//   · every serverless Revision API call carries the same bounded budget so a
//     silent network blackhole cannot hold the "Syncing your Test Bank…"
//     screen forever (migration loop, reserve/commit/delete, status);
//   · the optional catalog pull (a Firestore read that gates the loading
//     screen) is also deadline-bounded and degrades to the local seeded DB.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const cloudSource = read("src/revision/engine/cloudRevisionService.ts");
const appSource = read("src/revision/RevisionApp.tsx");
const catalogSource = read("src/revision/engine/catalogService.ts");

test("cloud hydration is bounded by a ~7s read timeout", () => {
  assert.match(cloudSource, /7_000/);
  assert.match(cloudSource, /SYNC_TIMEOUT/);
  assert.match(cloudSource, /Promise\.race/);
  assert.match(cloudSource, /using the safe local copy/i);
  assert.match(cloudSource, /clearTimeout\(timeout\)/);
});

test("every serverless Revision API call is bounded by the same timeout", () => {
  assert.match(cloudSource, /REVISION_API_TIMEOUT_MS = 7_000/);
  assert.match(cloudSource, /new AbortController\(\)/);
  assert.match(cloudSource, /setTimeout\(\(\) => controller\.abort\(\), REVISION_API_TIMEOUT_MS\)/);
  assert.match(cloudSource, /signal: controller\.signal/);
  assert.match(cloudSource, /clearTimeout\(timer\)/);
});

test("hydration failures fall back to the local copy instead of blocking the app", () => {
  assert.match(appSource, /cloud hydration skipped/);
  assert.match(appSource, /Keep the local cache usable/i);
  assert.match(appSource, /setRevisionDataLoading\(false\)/);
  assert.match(appSource, /setRevisionDataLoading\(uid !== "guest"\)/);
});

test("the startup catalog pull is deadline-bounded so the page cannot hang on it", () => {
  assert.match(catalogSource, /CATALOG_READ_TIMEOUT_MS = 5_000/);
  assert.match(catalogSource, /withDeadline\(/);
  assert.match(catalogSource, /Promise\.race\(/);
  assert.match(catalogSource, /clearTimeout\(timer\)/);
  assert.match(catalogSource, /catch \{/);
  assert.match(catalogSource, /return null;/);
});
