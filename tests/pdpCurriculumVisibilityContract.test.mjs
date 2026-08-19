// tests/pdpCurriculumVisibilityContract.test.mjs
//
// Product Detail curriculum must match what the Course Player actually
// unlocks after a purchase:
//   - before buying: hide paid-update modules
//   - after buying: show only remaining unpaid paid-update modules,
//     with a distinct paid appearance
//
// Source contracts + runtime checks against the pure helper.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  collectPaidModuleIdSet,
  filterCurriculumForPdp,
  isPaidUpgradeModule,
  resolvePaidUpdateForModule,
} from "../utils/pdpCurriculum.js";

const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const overlay = fs.readFileSync("src/course/CourseOverlay.tsx", "utf8");

const included = (id, title, children = []) => ({
  id,
  title,
  paid: false,
  resources: [{ id: `${id}-r`, name: `${title} file`, type: "video" }],
  modules: children,
});

const paid = (id, title, updateId = "upd-1") => ({
  id,
  title,
  paid: true,
  paidUpdateId: updateId,
  paidUpdateTitle: "Premium pack",
  paidUpdatePrice: "₹199",
  resources: [{ id: `${id}-r`, name: `${title} file`, type: "pdf" }],
  modules: [],
});

test("PDP curriculum is filtered through the shared visibility helper", () => {
  assert.match(pdp, /filterCurriculumForPdp/);
  assert.match(pdp, /collectPaidModuleIdSet/);
  assert.match(pdp, /isPaidUpgradeModule/);
  assert.match(pdp, /data-pdp-curriculum/);
  assert.match(pdp, /data-pdp-curriculum-mode/);
  assert.match(pdp, /data-pdp-curriculum-module/);
  assert.match(pdp, /data-paid=/);
  assert.match(pdp, /Paid upgrade/);
});

test("paid curriculum rows use a distinct amber appearance", () => {
  assert.match(pdp, /from-amber-50 via-orange-50/);
  assert.match(pdp, /from-amber-500 to-orange-600/);
  assert.match(pdp, /LockKeyhole/);
  assert.match(pdp, /data-pdp-curriculum-upgrade-hint/);
});

test("before purchase, paid-update modules are dropped from the curriculum", () => {
  const tree = [
    included("m1", "Intro"),
    paid("m2", "Premium chapter"),
    included("m3", "Practice", [paid("m3a", "Hidden nested premium")]),
  ];
  const view = filterCurriculumForPdp(tree, { isProductOwned: false, ownedUpdateIds: new Set() });
  assert.equal(view.mode, "included");
  assert.deepEqual(view.modules.map((module) => module.id), ["m1", "m3"]);
  assert.equal(view.modules[1].modules.length, 0);
  assert.ok(view.modules.every((module) => module.paid !== true));
});

test("after purchase, only unpaid paid-update modules remain", () => {
  const tree = [
    included("m1", "Intro"),
    paid("m2", "Premium chapter"),
    included("m3", "Practice", [paid("m3a", "Nested premium", "upd-2")]),
    paid("m4", "Already bought", "upd-owned"),
  ];
  const view = filterCurriculumForPdp(tree, {
    isProductOwned: true,
    ownedUpdateIds: new Set(["upd-owned"]),
  });
  assert.equal(view.mode, "paid-upgrade");
  assert.deepEqual(view.modules.map((module) => module.id), ["m2", "m3a"]);
  assert.ok(view.modules.every((module) => module.paid === true));
});

test("after purchase with no remaining upgrades, included modules stay visible", () => {
  const tree = [included("m1", "Intro"), paid("m2", "Owned premium")];
  const view = filterCurriculumForPdp(tree, {
    isProductOwned: true,
    ownedUpdateIds: new Set(["upd-1"]),
  });
  assert.equal(view.mode, "included");
  assert.deepEqual(view.modules.map((module) => module.id), ["m1"]);
});

test("paid-update access is detected from accessLevel, paidUpdateId, and catalogue ids", () => {
  const paidIds = collectPaidModuleIdSet([
    { id: "upd-1", active: true, visibility: "visible", includedModuleIds: ["from-catalogue"] },
    { id: "upd-hidden", active: false, includedModuleIds: ["draft-only"] },
  ]);
  assert.equal(isPaidUpgradeModule({ accessLevel: "paid_update", id: "a" }, paidIds), true);
  assert.equal(isPaidUpgradeModule({ accessLevel: "paidUpdate", id: "b" }, paidIds), true);
  assert.equal(isPaidUpgradeModule({ accessLevel: "included", paidUpdateId: "upd-1", id: "c" }, paidIds), true);
  assert.equal(isPaidUpgradeModule({ accessLevel: "included", id: "from-catalogue" }, paidIds), true);
  assert.equal(isPaidUpgradeModule({ accessLevel: "included", id: "draft-only" }, paidIds), false);
  assert.equal(isPaidUpgradeModule({ accessLevel: "included", id: "plain" }, paidIds), false);
});

test("resolvePaidUpdateForModule reads the catalogue by id or includedModuleIds", () => {
  const updates = [
    { id: "upd-1", title: "Pack A", cashPrice: 199, active: true, visibility: "visible", includedModuleIds: ["mod-a"] },
  ];
  assert.equal(resolvePaidUpdateForModule({ id: "mod-a" }, updates)?.id, "upd-1");
  assert.equal(resolvePaidUpdateForModule({ id: "other", paidUpdateId: "upd-1" }, updates)?.title, "Pack A");
  assert.equal(resolvePaidUpdateForModule({ id: "plain" }, updates), null);
});

test("course player overlay still locks paidUpdate modules the PDP now hides before purchase", () => {
  assert.match(overlay, /accessLevel === "paidUpdate"/);
  assert.match(overlay, /data-course-overlay-buy-module/);
  assert.match(overlay, /data-course-overlay-wire/);
});
