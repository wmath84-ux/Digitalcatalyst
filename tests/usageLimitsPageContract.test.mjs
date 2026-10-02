import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("Usage Limits is a lazy, authenticated route with its own loading layout", () => {
  const main = read("src/main.tsx");
  const routes = read("src/utils/appRoutes.ts");
  const pageEnter = read("src/components/PageEnter.tsx");

  assert.match(main, /lazyRoute\(\(\) => import\("\.\/usage\/UsageLimitsPage"\)\)/);
  assert.match(main, /USAGE_LIMITS_HASH = "#\/usage-limits"/);
  assert.match(main, /hash\.startsWith\(USAGE_LIMITS_HASH\)\) return UsageLimitsPage/);
  assert.match(main, /hash\.startsWith\(USAGE_LIMITS_HASH\)\) return <PageEnter[\s\S]*?<UsageLimitsPage \/>/);
  assert.match(main, /usageLimits: \[[\s\S]*?height: 112[\s\S]*?height: 192/);
  assert.match(routes, /"#\/usage-limits"/);
  assert.match(pageEnter, /if \(path\.startsWith\("#\/usage-limits"\)\) return "#\/usage-limits"/);
});

test("the personal allowance cards leave Profile and render on Usage Limits", () => {
  const profile = read("src/profile/App.tsx");
  const profileLayout = read("src/profile/ProfileLayout.tsx");
  const page = read("src/usage/UsageLimitsPage.tsx");

  assert.doesNotMatch(profile, /MyDayAllowanceCard|AiQuotaCard/);
  assert.doesNotMatch(profileLayout, /myDayCard|aiQuotaCard/);
  assert.match(profileLayout, /data-profile-usage-limits-link/);
  assert.match(profile, /onOpenUsageLimits=\{\(\) => \{ window\.location\.hash = "#\/usage-limits"; \}\}/);
  assert.match(page, /<MyDayAllowanceCard/);
  assert.match(page, /<AiQuotaCard uid=\{user\.id\} material="home" \/>/);
  assert.match(page, /data-school-ai-visible="true"/);
  assert.doesNotMatch(page, /hasSubscriberPlan|useHasSubscriberPlan/);
});

test("desktop rail and phone drawer expose Usage Limits without changing tablet inline actions", () => {
  const desktop = read("src/components/DesktopShell.tsx");
  const header = read("src/components/Header.tsx");
  const homeHeader = read("src/home/components/Header.tsx");

  assert.match(desktop, /key: "usage-limits", label: "Usage Limits"[\s\S]*?hash: "#\/usage-limits"/);
  assert.match(desktop, /if \(hash\.startsWith\("#\/usage-limits"\)\) return "usage-limits"/);
  assert.match(header, /id: "usage-limits",[\s\S]*?label: "Usage Limits"/);
  assert.match(header, /const mobileMenuItems = \[[\s\S]*?visibleTabItems\.map[\s\S]*?id: "usage-limits"/);
  assert.match(homeHeader, /const phoneMenuItems = \[[\s\S]*?id: "usage-limits"/);
  assert.match(homeHeader, /items=\{phoneMenuItems\}/);
  assert.match(homeHeader, /items=\{homeActionItems\}/);
});

test("the page uses a centered, responsive content column instead of stretching on wide screens", () => {
  const page = read("src/usage/UsageLimitsPage.tsx");
  const css = read("src/index.css");

  assert.match(page, /className="mx-auto flex w-full max-w-6xl flex-col gap-5 md:gap-6"/);
  assert.match(page, /max-w-6xl grid-cols-1 items-start gap-5 xl:grid-cols-\[minmax\(0,0\.92fr\)_minmax\(0,1\.08fr\)\]/);
  assert.match(page, /data-usage-limits-content/);
  assert.match(css, /\.dc-desktop-shell \[data-usage-limits-page\]/);
  assert.match(css, /\.dc-desktop-shell \[data-usage-limits-content\]/);
});

test("the purchased-course library action keeps its icon and label in one inline row", () => {
  const pdp = read("src/PdpApp.tsx");
  const start = pdp.indexOf("Open course in library");
  assert.ok(start > -1);
  const snippet = pdp.slice(start - 300, start + 80);
  assert.match(snippet, /inline-flex items-center justify-center gap-2 whitespace-nowrap/);
  assert.match(snippet, /PlayCircle className="h-4 w-4 shrink-0"/);
});
