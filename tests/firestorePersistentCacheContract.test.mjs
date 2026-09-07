import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Part 17 — loading experience, task A: Firestore persistent cache
 * (stale-while-revalidate).
 *
 * These source-contract tests pin the exact modular-SDK v12 wiring:
 * firebase 12.x / @firebase/firestore 4.x configure the IndexedDB
 * persistent cache through the `localCache` settings field with the
 * persistentLocalCache() factory (the old enableIndexedDbPersistence()
 * call is a legacy alias). The catalog listener must then paint cached
 * snapshots immediately and keep its error path intact.
 */

const firebaseInit = fs.readFileSync("firebase.ts", "utf8");
const catalog = fs.readFileSync("src/context/CatalogContext.tsx", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("installed firebase major is the modular SDK with the cache-factory API", () => {
  const version = pkg.dependencies.firebase;
  assert.match(version, /^\^?1[2-9]\./, `expected firebase ^12+ in package.json, got ${version}`);
});

test("firebase.ts enables the persistent IndexedDB cache via the v12 localCache API", () => {
  // The factory + multi-tab manager must be imported from firestore.
  assert.match(firebaseInit, /persistentLocalCache/);
  assert.match(firebaseInit, /persistentMultipleTabManager|persistentSingleTabManager/);
  // It must be passed through initializeFirestore's `localCache` field
  // (NOT via the deprecated enableIndexedDbPersistence call).
  assert.match(firebaseInit, /localCache:\s*persistentLocalCache\(/);
  assert.match(firebaseInit, /initializeFirestore\(/);
  assert.doesNotMatch(firebaseInit, /enableIndexedDbPersistence/);
  // The cache config must live alongside the existing init options.
  assert.match(firebaseInit, /ignoreUndefinedProperties:\s*true/);
});

test("persistent cache failure falls back to a working Firestore instance", () => {
  // Capacitor WebViews / Node / storage-disabled contexts must never take
  // Firestore down with the cache factory — getFirestore() fallback stays.
  assert.match(firebaseInit, /catch\s*\{/);
  assert.match(firebaseInit, /getFirestore\(app\)/);
});

test("catalog listener paints cached snapshots before the server refresh", () => {
  // Stale-while-revalidate: the first callback may be the IndexedDB
  // snapshot (fromCache). Cached docs must clear loading immediately.
  assert.match(catalog, /snapshot\.metadata\.fromCache/);
  assert.match(catalog, /setLoading\(false\)/);
});

test("catalog error path is preserved — skeletons never mask snapshot failures", () => {
  // The error callback still exists and still surfaces a message.
  assert.match(catalog, /Catalog sync failed/);
  assert.match(catalog, /setError\(/);
  assert.match(catalog, /The live catalog could not be loaded/);
  // Loading must always terminate on failure (no stuck skeleton).
  const errorHandler = catalog.slice(catalog.indexOf("(snapshotError)"));
  assert.match(errorHandler, /setLoading\(false\)/);
});
