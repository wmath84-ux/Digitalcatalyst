import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hook = fs.readFileSync("src/hooks/useUnreadNotificationCount.ts", "utf8");
const header = fs.readFileSync("src/components/Header.tsx", "utf8");
const homeHeader = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const storage = fs.readFileSync("utils/siteNotifications.ts", "utf8");
const myDayNav = fs.readFileSync("src/components/myday/BottomNav.tsx", "utf8");

test("shared notification badge combines local and cloud unread IDs without double count", () => {
  assert.match(hook, /loadSiteNotifications/);
  assert.match(hook, /collection\(db, "users", user\.id, "notifications"\)/);
  assert.match(hook, /new Set\(localItems\.filter/);
  assert.match(hook, /cloudUnreadIds\.forEach/);
  assert.match(header, /useUnreadNotificationCount/);
  assert.match(header, /99\+/);
});

test("home header uses the same real unread count instead of a decorative dot", () => {
  assert.match(homeHeader, /useUnreadNotificationCount/);
  assert.match(homeHeader, /unreadNotificationCount > 0/);
  assert.doesNotMatch(homeHeader, /right-2 top-2 h-2 w-2/);
});

test("same-tab notification writes notify every mounted badge", () => {
  assert.match(storage, /eduvora:notifications-updated/);
  assert.match(storage, /CustomEvent/);
  assert.match(hook, /addEventListener\("eduvora:notifications-updated"/);
});

test("My Day footer keeps Home as the far-left first item", () => {
  const home = myDayNav.indexOf('{ id: "home"');
  const day = myDayNav.indexOf('{ id: "overview"');
  assert.ok(home >= 0 && home < day);
});
