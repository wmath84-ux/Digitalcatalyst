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
  assert.match(page, /<AiQuotaCard uid=\{user\.id\} material="home" minimal \/>/);
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

  assert.match(page, /className="mx-auto flex w-full max-w-4xl flex-col gap-6"/);
  assert.match(page, /max-w-4xl grid-cols-1 items-start gap-5 xl:grid-cols-\[minmax\(0,0\.92fr\)_minmax\(0,1\.08fr\)\]/);
  assert.match(page, /data-usage-limits-content/);
  assert.match(css, /\.dc-desktop-shell \[data-usage-limits-page\]/);
  assert.match(css, /\.dc-desktop-shell \[data-usage-limits-content\]/);
});

test("the purchased-product library action is a simple accessible button wired to its real handler", () => {
  const pdp = read("src/PdpApp.tsx");
  const start = pdp.indexOf("data-pdp-library-primary");
  assert.ok(start > -1);
  const snippet = pdp.slice(start - 30, start + 250);
  assert.match(snippet, /type="button"/);
  assert.match(snippet, /onClick=\{\(\) => onOpenCourse\(product\)\}/);
  assert.match(snippet, /className="dc-pdp-library-cta"/);
  assert.match(snippet, /identity\.libraryAction/);
  assert.doesNotMatch(snippet, /PlayCircle/);
});
