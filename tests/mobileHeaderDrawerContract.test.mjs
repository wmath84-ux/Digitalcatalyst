import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sharedHeader = fs.readFileSync("src/components/Header.tsx", "utf8");
const homeHeader = fs.readFileSync("src/home/components/Header.tsx", "utf8");
const menu = fs.readFileSync("src/components/MobileHeaderMenu.tsx", "utf8");
const glassSidebar = fs.readFileSync("src/components/glass-dock/GlassSidebar.tsx", "utf8");

test("the shared page header moves its contextual actions into a phone-only menu", () => {
  assert.match(sharedHeader, /<MobileHeaderMenu/);
  assert.match(sharedHeader, /items=\{mobileMenuItems\}/);
  assert.match(sharedHeader, /extraContent=\{action\}/);
  assert.match(sharedHeader, /useViewportBand\(\)/);
  assert.match(sharedHeader, /viewportBand === "compact-mobile" \|\| viewportBand === "large-mobile"/);
  assert.match(sharedHeader, /data-header-actions-inline/);
});

test("Home and FlowPath retain their page-specific actions in the same phone drawer", () => {
  assert.match(homeHeader, /<MobileHeaderMenu/);
  assert.match(homeHeader, /items=\{homeActionItems\}/);
  assert.match(homeHeader, /useViewportBand\(\)/);
  assert.match(homeHeader, /viewportBand === "compact-mobile" \|\| viewportBand === "large-mobile"/);
  assert.match(homeHeader, /data-home-actions-inline/);
  for (const action of ["leaderboard", "profile", "notifications", "favorites", "settings"]) {
    assert.ok(homeHeader.includes(`id: "${action}"`), `home menu keeps ${action}`);
  }
});

test("the phone header trigger is the signed-in user's avatar, with initials as fallback", () => {
  assert.match(menu, /const \{ user \} = useAuth\(\)/);
  assert.match(menu, /profilePhotoSrc\(user\?\.photoURL\)/);
  assert.match(menu, /data-mobile-header-avatar/);
  assert.match(menu, /data-mobile-header-avatar-fallback/);
  assert.doesNotMatch(menu, /import \{ Menu, X \}/);
  assert.doesNotMatch(menu, /<Menu\b/);
});

test("the phone drawer reuses the glass sidebar, closes accessibly, and does not persist a rail state", () => {
  assert.match(menu, /createPortal\(drawer, document\.body\)/);
  assert.match(menu, /<GlassSidebar/);
  assert.match(menu, /remember=\{false\}/);
  assert.match(menu, /showToggle=\{false\}/);
  assert.match(menu, /aria-modal="true"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /data-mobile-header-drawer-backdrop/);
  assert.match(menu, /data-mobile-header-menu-button/);
  assert.match(glassSidebar, /icon\?: ReactNode/);
  assert.match(glassSidebar, /badge\?: number \| string/);
});
