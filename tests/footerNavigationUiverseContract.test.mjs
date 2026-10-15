import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const sharedFooter = read("src/components/SiteFooterNav.tsx");
const uiverseFooter = read("src/components/UiverseFooterNav.tsx");
const uiverseCss = read("src/components/uiverse-footer-nav.css");
const preference = read("src/utils/footerNavigationStyle.ts");
const settings = read("src/settings/SettingsPage.tsx");
const header = read("src/components/Header.tsx");
const homeHeader = read("src/home/components/Header.tsx");
const mobileMenu = read("src/components/MobileHeaderMenu.tsx");
const desktopShell = read("src/components/DesktopShell.tsx");
const notificationsButton = read("src/components/HeaderNotificationsButton.tsx");
const notificationsCss = read("src/components/header-navigation.css");
const chromeCss = read("src/light-theme-pages.css");

test("the Workspace pill is the default and the existing magnifying dock remains selectable", () => {
  assert.match(preference, /type FooterNavigationStyle = "youtube" \| "uiverse" \| "glass-dock" \| "work-pill"/);
  assert.match(preference, /DEFAULT_STYLE: FooterNavigationStyle = "work-pill"/);
  assert.match(preference, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(preference, /localStorage\.setItem\(STORAGE_KEY, next\)/);
  assert.match(sharedFooter, /useFooterNavigationStyle\(\)/);
  assert.match(sharedFooter, /navigationStyle === "uiverse"/);
  assert.match(sharedFooter, /<UiverseFooterNav/);
  assert.match(sharedFooter, /navigationStyle === "work-pill"/);
  assert.match(sharedFooter, /<WorkFooterNav/);
  assert.match(sharedFooter, /if \(peek\)/, "the classic peek mode remains in the glass-dock branch");
  assert.match(sharedFooter, /<SitePeekFooter/);
  assert.match(settings, /setFooterNavigationStyle\("youtube"\)/);
  assert.match(settings, /aria-checked=\{footerNavigationStyle === "youtube"\}/);
  assert.match(settings, /Edge-to-edge/);
  assert.match(settings, /setFooterNavigationStyle\("uiverse"\)/);
  assert.match(settings, /setFooterNavigationStyle\("glass-dock"\)/);
  assert.match(settings, /aria-checked=\{footerNavigationStyle === "uiverse"\}/);
  assert.match(settings, /aria-checked=\{footerNavigationStyle === "glass-dock"\}/);
  assert.match(settings, /setFooterNavigationStyle\("work-pill"\)/);
});

test("the four-tab pill keeps the measured footer hook and the required destinations", () => {
  assert.match(uiverseFooter, /data-site-footer-nav/);
  assert.match(uiverseFooter, /data-dock-count="4"/);
  assert.match(uiverseFooter, /data-footer-nav-design="uiverse"/);
  for (const tab of ["Home", "Store", "My Purchases", "Profile"]) {
    assert.ok(uiverseFooter.includes(`aria-label="${tab}"`) || uiverseFooter.includes(`>${tab}<`), `${tab} is visible and named`);
  }
  for (const route of ["#/home", "#/store", "#/store/purchases", "#/profile"]) {
    assert.ok(uiverseFooter.includes(route), `the footer retains ${route}`);
  }
  assert.match(uiverseCss, /backdrop-filter:\s*blur\(12px\) saturate\(1\.25\)/);
  assert.match(uiverseCss, /inset 0 1px 0/);
  assert.match(uiverseCss, /aria-current="page"|\[aria-current="page"\]/);
  assert.match(uiverseCss, /html\[data-theme="light"\] \.dc-uiverse-footer[\s\S]*?rgba\(0, 74, 198, 0\.9\)/, "light mode retains the richer blue treatment from the earlier design");
  assert.match(uiverseCss, /@media \(min-width: 440px\)[\s\S]*?flex-direction: row/, "tablet widths retain icon-label rows from the earlier design");
});

test("Profile opens the four animated learning shortcuts once and Profile on a double click/tap", () => {
  for (const [route, label] of [
    ["work", "Work Mode"],
    ["my-day", "My Day"],
    ["study-library", "My Study Library"],
    ["revision", "Revision"],
    ["flowpath", "FlowPath"],
  ]) {
    assert.ok(uiverseFooter.includes(`id: "${route}"`), `${label} shortcut exists`);
  }
  assert.match(uiverseFooter, /navigate\(route\)/, "shortcut selection routes to the explicit destination");
  assert.match(uiverseFooter, /route: "#\/work"/);
  assert.match(uiverseFooter, /className="dc-compact-glass-window dc-uiverse-profile-menu"/);
  assert.match(uiverseFooter, /data-open=\{profileMenuOpen \? "true" : "false"\}/);
  assert.match(uiverseFooter, /now - previous <= 340/);
  assert.match(uiverseFooter, /navigate\("#\/profile"\)/);
  assert.match(uiverseFooter, /onDoubleClick=\{/);
  assert.match(uiverseFooter, /keyboardMenuOpenRef\.current = true/);
  assert.match(uiverseFooter, /querySelector<HTMLElement>\('\[role="menuitem"\]'\)\?\.focus\(\)/);
  assert.match(uiverseFooter, /aria-keyshortcuts="Alt\+Enter"/);
  assert.match(uiverseCss, /\.dc-uiverse-profile-menu\.dc-compact-glass-window/);
});

test("Notifications replaces the header avatar action without duplicating the bell; phone quick actions stay available", () => {
  assert.match(header, /<HeaderNotificationsButton/);
  assert.doesNotMatch(header.slice(header.indexOf("const tabItems"), header.indexOf("const visibleTabItems")), /id: "notifications"/);
  assert.match(homeHeader, /<HeaderNotificationsButton/);
  assert.doesNotMatch(homeHeader, /id: "notifications"/);
  assert.match(mobileMenu, /data-mobile-header-menu-button/);
  assert.match(mobileMenu, /<Menu\b/);
  assert.doesNotMatch(mobileMenu, /data-mobile-header-avatar/);
  assert.match(notificationsButton, /data-header-glass-button="notifications"/);
  assert.match(notificationsButton, /#/);
  assert.doesNotMatch(desktopShell.slice(desktopShell.indexOf("data-desktop-topbar-actions")), /id: "notifications"/);
  assert.match(desktopShell, /<HeaderNotificationsButton/);
  assert.match(notificationsCss, /box-shadow:[\s\S]*?inset 0 1px 0/);
  assert.doesNotMatch(notificationsCss, /box-shadow:[^;]*,\s*0\s*\d+px/);
});

test("non-Home header bars lose exterior shadows/glow", () => {
  const reset = chromeCss.slice(chromeCss.lastIndexOf("Navigation refresh"));
  for (const hook of ["[data-site-header]", "[data-revision-app-header]", "[data-rev-bank-header]", "[data-desktop-topbar]"]) {
    assert.ok(reset.includes(hook), `${hook} is covered by the reset`);
  }
  assert.match(reset, /box-shadow:\s*none !important/);
  assert.match(reset, /\.mobile-header-glow::before/);
  assert.match(reset, /\.mobile-header-glow::after/);
  assert.match(reset, /display:\s*none\s*!important/);
});
