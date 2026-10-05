// Regression contracts for the independent Plan & AI and Settings routes.
// Profile must remain a Digitalcatalyst page; only /settings may enter Recall's
// settings view, and both desktop + mobile navigation must expose the route.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const routes = read("src/revision/integrations/routes.ts");
const app = read("src/revision/RevisionApp.tsx");
const tabs = read("src/revision/components/RevisionTabs.tsx");
const aiSettings = read("src/revision/pages/AiSettingsPage.tsx");
const aiConfigForm = read("src/revision/components/AiConfigForm.tsx");

test("Plan & AI does not alias Recall Settings; the Settings route remains explicit", () => {
  assert.match(routes, /case "settings":\s*return "settings";/);
  assert.match(routes, /case "profile":\s*return null;/);
  assert.doesNotMatch(routes, /case "settings":\s*case "profile":\s*return "settings"/);
  assert.match(app, /if \(id === "profile"\) navigate\("#\/revision\/profile"\)/);
  assert.match(app, /id === "settings"\) navigate\("#\/revision\/settings"\)/);
  assert.match(app, /case "settings":\s*showSettings\(\)/);
});

test("Settings is a visible destination in desktop and in-body Revision navigation", () => {
  assert.match(app, /id: "settings", label: "Settings"/);
  assert.match(app, /activeId: REVISION_TOP_BAR_ACTIVE_IDS\[route\.page\] \?\? route\.page/);
  assert.match(tabs, /id: "settings"[\s\S]*?href: REVISION_DEEP_LINKS\.settings, pages: \["settings"\]/);
  assert.match(tabs, /pages: \["profile", "ai-settings", "ai-generate"\]/);
});

test("AI Configuration has readable Recall surfaces, a visible Settings action, and no nested page scroller", () => {
  assert.match(aiSettings, /<RecallPage/);
  assert.doesNotMatch(aiSettings, /<PageShell/);
  assert.match(aiSettings, /data-rev-layout="ai-settings"/);
  assert.match(aiSettings, /data-ai-settings-link/);
  assert.match(aiSettings, /navigate\("#\/revision\/settings"\)/);
  assert.match(aiSettings, /text-on-surface-variant/);
  assert.match(aiSettings, /<RecallCard/);
  assert.match(aiSettings, /visualStyle="recall"/);
  assert.match(aiSettings, /actionStyle="recall"/);
  assert.match(aiConfigForm, /<RecallSelect/);
  assert.match(aiConfigForm, /data-ai-config-form=\{visualStyle\}/);
});
