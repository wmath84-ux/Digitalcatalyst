import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const footer = read("src/components/YoutubeFooterNav.tsx");
const css = read("src/components/youtube-footer-nav.css");
const shared = read("src/components/SiteFooterNav.tsx");
const preference = read("src/utils/footerNavigationStyle.ts");
const settings = read("src/settings/SettingsPage.tsx");
const settingsCss = read("src/settings/settings.css");

test("edge-to-edge footer is the default while both previous footer designs remain selectable", () => {
  assert.match(preference, /type FooterNavigationStyle = "youtube" \| "uiverse" \| "glass-dock"/);
  assert.match(preference, /DEFAULT_STYLE: FooterNavigationStyle = "youtube"/);
  assert.match(shared, /navigationStyle === "youtube"/);
  assert.match(shared, /<YoutubeFooterNav/);
  assert.match(shared, /navigationStyle === "uiverse"/);
  assert.match(shared, /<UiverseFooterNav/);
  assert.match(shared, /<GlassDock siteFooter/);
  assert.match(settings, /aria-checked=\{footerNavigationStyle === "youtube"\}/);
  assert.match(settings, /aria-checked=\{footerNavigationStyle === "uiverse"\}/);
  assert.match(settings, /aria-checked=\{footerNavigationStyle === "glass-dock"\}/);
});

test("the bar is edge-attached, safe-area aware, and blue-highlights the active route", () => {
  assert.match(footer, /data-site-footer-nav/);
  assert.match(footer, /data-footer-nav-design="youtube"/);
  assert.match(footer, /data-dock-count="5"/);
  assert.match(footer, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(footer, /startsWith\("#\/store\/purchases"\)/);
  assert.match(footer, /startsWith\("#\/settings"\)/);
  assert.match(css, /left:\s*0;/);
  assert.match(css, /right:\s*0;/);
  assert.match(css, /bottom:\s*0;/);
  assert.match(css, /width:\s*100%;/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\[aria-current="page"\]/);
  assert.match(css, /#004ac6|--dc-youtube-footer-accent/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("the center quick-action menu retains secondary app destinations and keyboard dismissal", () => {
  for (const destination of ["myday", "study-library", "revision", "flowpath"]) {
    assert.ok(footer.includes('"' + destination + '"'), "missing quick route " + destination);
  }
  assert.match(footer, /aria-haspopup="menu"/);
  assert.match(footer, /aria-expanded=\{menuOpen\}/);
  assert.match(footer, /event.key !== "Escape"/);
  assert.match(footer, /window\.location\.hash = item\.route/);
});

test("Settings shows a preview of the new five-slot navigation", () => {
  assert.match(settings, /3 styles/);
  assert.match(settings, /settings-navigation-preview--youtube/);
  assert.match(settingsCss, /\.settings-navigation-preview--youtube/);
  assert.match(settingsCss, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});
