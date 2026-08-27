import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const myDay = fs.readFileSync("src/MyDayApp.tsx", "utf8");
const header = fs.readFileSync("src/components/Header.tsx", "utf8");

test("My Day renders ONE header — the shared store header, rebranded", () => {
  assert.match(myDay, /import StoreHeader from "\.\/components\/Header"/);
  const storeHeader = myDay.indexOf("<StoreHeader");
  assert.ok(storeHeader >= 0, "shared store header is missing");
  // The old second My Day toolbar header is gone — the page must not render
  // a separate sticky "My Day" header below the store header anymore.
  assert.doesNotMatch(myDay, /sticky top-\[68px\]/);
  assert.doesNotMatch(myDay, /Eduvora Tasker/);
  assert.doesNotMatch(myDay, /<h1 className="hidden text-lg font-bold text-slate-900 lg:block">My Day<\/h1>/);
});

test("My Day rebrands the shared header: app-name Tasker + My Day Activities", () => {
  // The title is now driven by the branding context (so the merchant's
  // chosen app name shows up here) and the literal "Eduvora Taskar"
  // string is no longer hardcoded. The brand evolved from "Taskar" to
  // "Tasker" — the test follows the latest source.
  assert.match(myDay, /title=\{`\$\{appName\} Tasker`\}/);
  assert.match(myDay, /subtitle="My Day Activities"/);
});

test("My Day replaces the cart icon with Download and adds Search to its left", () => {
  // The report download takes the cart's slot on the My Day header…
  assert.match(myDay, /onDownloadReport=\{handleDownloadReport\}/);
  // …and the search toggle sits next to it.
  assert.match(myDay, /onToggleSearch=\{\(\) => setShowMobileSearch/);
  assert.match(myDay, /searchActive=\{showMobileSearch \|\| Boolean\(globalSearch\)\}/);
  // The shared header supports both overrides.
  assert.match(header, /onDownloadReport\?:/);
  assert.match(header, /onToggleSearch\?:/);
  assert.match(header, /searchActive\?:/);
});

test("the search dropdown still works and keeps the task search wired", () => {
  assert.match(myDay, /Search tasks, notes\.\.\./);
  assert.match(myDay, /globalSearch=\{globalSearch\}/);
  assert.match(myDay, /#\/subscription/);
  assert.match(myDay, /#\/cart/);
  assert.match(myDay, /#\/notifications/);
});
