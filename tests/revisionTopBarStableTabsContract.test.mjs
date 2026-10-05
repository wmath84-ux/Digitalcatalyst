import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const revisionApp = fs.readFileSync("src/revision/RevisionApp.tsx", "utf8");
const tabsContext = fs.readFileSync("src/components/TopBarTabsContext.tsx", "utf8");

test("Revision publishes a stable top-bar item array to avoid desktop shell update loops", () => {
  assert.match(revisionApp, /const REVISION_TOP_BAR_ITEMS: TopBarTabItem\[\] = \[/);
  assert.match(revisionApp, /items: REVISION_TOP_BAR_ITEMS/);
  assert.doesNotMatch(revisionApp, /items:\s*\[\s*\n\s*\{ id: "dashboard"/);

  // TopBarTabsContext memoizes the shell-facing config by the items identity;
  // route changes may republish once, but unrelated renders must not.
  assert.match(tabsContext, /const items = config\?\.items \?\? null;/);
  assert.match(tabsContext, /\}, \[feature, ariaLabel, items, activeId, homeLabel\]\);/);
  assert.match(tabsContext, /host\.setTabs\(published\)/);
});
