import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sharedHeader = fs.readFileSync("src/components/Header.tsx", "utf8");
const homeHeader = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const menu = fs.readFileSync("src/components/MobileHeaderMenu.tsx", "utf8");
const notifications = fs.readFileSync("src/components/HeaderNotificationsButton.tsx", "utf8");
const glassSidebar = fs.readFileSync("src/components/glass-dock/GlassSidebar.tsx", "utf8");

test("the shared page header keeps contextual actions in a phone-only quick-actions drawer", () => {
  assert.match(sharedHeader, /<MobileHeaderMenu/);
  assert.match(sharedHeader, /items=\{mobileMenuItems\}/);
  assert.match(sharedHeader, /extraContent=\{action\}/);
  assert.match(sharedHeader, /useViewportBand\(\)/);
  assert.match(sharedHeader, /viewportBand === "compact-mobile" \|\| viewportBand === "large-mobile"/);
  assert.match(sharedHeader, /data-header-actions-inline/);
  assert.match(sharedHeader, /<HeaderNotificationsButton/);
  assert.doesNotMatch(sharedHeader.slice(sharedHeader.indexOf("const tabItems"), sharedHeader.indexOf("const visibleTabItems")), /id: "notifications"/);
});

test("Home and FlowPath keep their page-specific actions in the drawer beside a standalone Notifications button", () => {
  assert.match(homeHeader, /<MobileHeaderMenu/);
  assert.match(homeHeader, /items=\{phoneMenuItems\}/);
  assert.match(homeHeader, /useViewportBand\(\)/);
  assert.match(homeHeader, /viewportBand === "compact-mobile" \|\| viewportBand === "large-mobile"/);
  assert.match(homeHeader, /data-home-actions-inline/);
  assert.match(homeHeader, /<HeaderNotificationsButton/);
  for (const action of ["leaderboard", "profile", "favorites", "settings"]) {
    assert.ok(homeHeader.includes(`id: "${action}"`), `home menu keeps ${action}`);
  }
  assert.doesNotMatch(homeHeader, /id: "notifications"/, "the old duplicate notification tab is removed");
});

test("the old profile trigger becomes a glass quick-actions button, while the same-sized bell owns Notifications", () => {
  assert.match(menu, /data-mobile-header-menu-button/);
  assert.match(menu, /data-header-glass-button="quick-actions"/);
  assert.match(menu, /<Menu\b/);
  assert.doesNotMatch(menu, /data-mobile-header-avatar/);
  assert.match(notifications, /data-header-glass-button="notifications"/);
  assert.match(notifications, /aria-label=\{label\}/);
  assert.match(notifications, /data-button-size=\{size\}/);
});

test("the phone drawer reuses the glass sidebar, closes accessibly, and does not persist a rail state", () => {
  assert.match(menu, /createPortal\(drawer, document\.body\)/);
  assert.match(menu, /<GlassSidebar/);
  assert.match(menu, /remember=\{false\}/);
  assert.match(menu, /showToggle=\{false\}/);
  assert.match(menu, /aria-modal="true"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /data-mobile-header-drawer-backdrop/);
  assert.match(glassSidebar, /icon\?: ReactNode/);
  assert.match(glassSidebar, /badge\?: number \| string/);
});
