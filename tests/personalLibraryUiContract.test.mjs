// Cross-surface source contracts for Part 1 My Study Library. Runtime helper
// behaviour lives in personalLibrary.test.mjs; this suite protects routing,
// authoritative API boundaries, official immutability and responsive UX wiring.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const api = read("api/_lib/personalCourse.ts");
const main = read("src/main.tsx");
const routes = read("src/utils/appRoutes.ts");
const desktop = read("src/components/DesktopShell.tsx");
const profile = read("src/profile/ProfileLayout.tsx");
const profileApp = read("src/profile/App.tsx");
const study = read("src/personal-library/StudyLibraryPage.tsx");
const addDialog = read("src/personal-library/AddOfficialResourceDialog.tsx");
const player = read("src/CoursePlayerApp.tsx");
const playerPanel = read("src/course/PlayerPanel.tsx");
const personalPanel = read("src/course/PersonalModulesPanel.tsx");
const hook = read("src/hooks/usePersonalModules.ts");
const client = read("src/lib/personalCourseClient.ts");
const modal = read("src/components/ui/Modal.tsx");
const confirm = read("src/components/ui/ConfirmDialog.tsx");
const viewport = read("src/components/ui/overlayBounds.tsx");
const viewer = read("src/course/ResourceViewer.tsx");

test("My Study Library is one lazy authenticated route reachable from desktop and Profile", () => {
  assert.match(main, /STUDY_LIBRARY_HASH = "#\/study-library"/);
  assert.match(main, /lazyRoute\(\(\) => import\("\.\/personal-library\/StudyLibraryPage"\)\)/);
  assert.match(main, /<StudyLibraryPage \/>/);
  assert.match(routes, /"#\/study-library"/);
  assert.match(desktop, /key: "study"/);
  assert.match(desktop, /hash: "#\/study-library"/);
  assert.match(desktop, /hash\.startsWith\("#\/study-library"\)/);
  assert.match(profile, /data-profile-study-library/);
  assert.match(profileApp, /window\.location\.hash = "#\/study-library"/);
});

test("central workspace exposes Saved, recent, search/type/module/state filters and plan usage", () => {
  assert.match(study, /My Study Library/);
  assert.match(study, /Saved for Later/);
  assert.match(study, /Recently added/);
  assert.match(study, /Recently opened/);
  assert.match(study, /aria-label="Search study library"/);
  assert.match(study, /<FilterSelect label="Type"/);
  assert.match(study, /<FilterSelect label="Module"/);
  assert.match(study, /<FilterSelect label="State"/);
  assert.match(study, /data-library-plan-usage/);
  assert.match(study, /moduleLimit/);
  assert.match(study, /resourceLimit/);
  assert.match(study, /usageAtPerModuleLimit/);
});

test("module/resource organization has CRUD, confirmations, move and non-drag reorder controls", () => {
  assert.match(study, /createModule/);
  assert.match(study, /updateModule/);
  assert.match(study, /deleteModule/);
  assert.match(study, /createResource/);
  assert.match(study, /updateResource/);
  assert.match(study, /deleteResource/);
  assert.match(study, /moveResourceTo/);
  assert.match(study, /ConfirmDialog/);
  assert.match(study, /Move module up/);
  assert.match(study, /Move resource down/);
  assert.match(study, /Move to another module/);
  assert.match(api, /applyOrderMove/);
  assert.doesNotMatch(api, /resources\.forEach\(\(item, index\) => tx\.update/);
  assert.match(study, /No matching resources/);
});

test("official player actions snapshot stable references, are single-flight and submit through the API", () => {
  assert.match(playerPanel, /Add to My Module/);
  assert.match(playerPanel, /Save for later/);
  assert.match(player, /officialDialogTarget/);
  assert.match(player, /personalActionRef/);
  assert.match(player, /productId: String\(product\.id\)/);
  assert.match(player, /moduleId: String\(selectedOfficialModule\.id\)/);
  assert.match(player, /resourceId: String\(selectedFile\.id\)/);
  assert.match(addDialog, /Create new/);
  assert.match(addDialog, /Already added/);
  assert.match(addDialog, /role="status"/);
  assert.match(client, /"personalCourse\.official\.add"/);
  assert.match(player, /destination: "saved"/);
  assert.match(hook, /addOfficialResource/);
});

test("the server derives ownership from verified auth and never accepts an owner id", () => {
  assert.match(api, /requireFirebaseUser\(req\)/);
  assert.match(api, /const uid = await authenticate\(req\)/);
  assert.match(api, /return text\(decoded\.uid\)/);
  assert.doesNotMatch(api, /body\.ownerUid/);
  assert.match(api, /collection\("users"\)\.doc\(uid\)/);
  assert.match(api, /where\("ownerUid", "==", uid\)/);
  assert.match(api, /isOwnedResourcePath/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(api, /safeId\(body\.ownerUid/);
});

test("the account API exposes every CRUD, reorder, move, open and official-save action", () => {
  for (const action of [
    "personalCourse.library",
    "personalCourse.module.create",
    "personalCourse.module.update",
    "personalCourse.module.delete",
    "personalCourse.module.reorder",
    "personalCourse.resource.create",
    "personalCourse.resource.update",
    "personalCourse.resource.delete",
    "personalCourse.resource.reorder",
    "personalCourse.resource.move",
    "personalCourse.resource.open",
    "personalCourse.official.add",
  ]) {
    assert.match(api, new RegExp(action.replaceAll(".", "\\.")), action);
  }
});

test("all creation paths use live cycle entitlements and transactionally reconciled account-global limits", () => {
  assert.match(api, /resolvePersonalModulesEntitlement/);
  assert.match(api, /readEntitlementInTransaction/);
  assert.match(api, /readUsageAndInventoryInTransaction/);
  assert.match(api, /ensureGlobalUsage/);
  assert.match(api, /moduleLimit/);
  assert.match(api, /resourceLimit/);
  assert.match(api, /perModuleResourceLimit/);
  assert.match(api, /isPersonalTypeAllowed/);
  assert.match(api, /runTransaction/);
  assert.match(api, /usagePayload/);
  assert.match(api, /MODULE_LIMIT/);
  assert.match(api, /RESOURCE_LIMIT/);
  assert.match(api, /PER_MODULE_LIMIT/);
  assert.match(api, /TYPE_NOT_ALLOWED/);
});

test("downgrades preserve reads/organization while every additional create remains gated", () => {
  const listBody = api.slice(api.indexOf("async function listLibrary"), api.indexOf("async function createModule"));
  assert.match(listBody, /readEntitlement/);
  assert.doesNotMatch(listBody, /assertCreationEntitled/);
  assert.match(api, /assertCreationEntitled/);
  assert.match(personalPanel, /Existing content remains readable and organisable/);
  assert.match(study, /Opening, renaming, moving, reordering and deleting retained content remain available/);
  assert.match(study, /View plans/);
});

test("official data is resolved server-side and copied only into owner-scoped personal documents", () => {
  assert.match(api, /loadOfficialSnapshot/);
  assert.match(api, /assertOfficialCourseAccess/);
  assert.match(api, /resolveCourseAccess/);
  assert.match(api, /firestoreToCatalogProduct/);
  assert.match(api, /sanitizePersonalResourceInput/);
  assert.match(api, /kind: "official"/);
  assert.match(api, /tx\.create\(targetRef/);
  assert.doesNotMatch(api, /tx\.(?:set|update|delete)\([^\n]*(?:siteProducts|products|courseContent)/);
  assert.doesNotMatch(api, /updateDoc|setDoc|deleteDoc/);
});

test("Saved is a first-class state and moving it is one authoritative transaction", () => {
  assert.match(api, /kind: "saved"/);
  assert.match(api, /system: true/);
  assert.match(api, /state: "saved"/);
  assert.match(api, /async function moveResource/);
  assert.match(api, /tx\.delete\(sourceResource\.ref\)/);
  assert.match(api, /tx\.create\(targetRef/);
  assert.match(client, /movePersonalResourceToDestination/);
  assert.match(study, /personal\.moveResourceTo/);
});

test("concurrent deletes and moves cannot underflow usage or write into deleting modules", () => {
  assert.match(api, /readUsageAndInventoryInTransaction/);
  assert.match(api, /remainingModules/);
  assert.match(api, /remainingResources/);
  assert.match(api, /MODULE_DELETING/);
  assert.match(api, /sourceModule\.data\(\)\?\.deleting/);
  assert.match(api, /destinationParent\.data\(\)\?\.deleting/);
  assert.match(api, /db\.runTransaction/);
});

test("personal resources reuse ResourceViewer and cannot mutate official progress/completion", () => {
  assert.match(study, /ResourceViewer/);
  assert.match(study, /personalResourceToCourseFile/);
  assert.match(client, /source: "personal"/);
  assert.match(player, /activeFileIsPersonal/);
  assert.match(player, /!activeFileIsPersonal/);
  assert.match(player, /selectedFile\.source \|\| ""\) === "personal"/);
  assert.match(viewer, /CourseFile/);
  assert.doesNotMatch(study, /mark.*Complete/i);
});

test("dialogs use visualViewport bounds and mobile-safe scrolling rather than keyboard constants", () => {
  assert.match(viewport, /window\.visualViewport/);
  assert.match(viewport, /addEventListener\("resize"/);
  assert.match(viewport, /addEventListener\("scroll"/);
  assert.match(modal, /useVisualViewportBox/);
  assert.match(confirm, /useVisualViewportBox/);
  assert.match(modal, /max-h-\[calc\(100%-0\.5rem\)\]/);
  assert.match(study, /overflow-y-auto/);
  assert.match(addDialog, /min-h-11/);
  assert.doesNotMatch(`${study}\n${addDialog}\n${modal}\n${confirm}`, /keyboardHeight\s*=\s*\d+/i);
});

test("personal library stays lazy in Course Player and avoids course refetches/listeners", () => {
  assert.match(player, /autoLoad: false/);
  assert.match(player, /personalModules\.ensureLoaded/);
  assert.doesNotMatch(hook, /onSnapshot/);
  assert.doesNotMatch(hook, /firebase\/firestore/);
  assert.match(hook, /REVALIDATE_AFTER_MS/);
  assert.match(hook, /patchResource/);
});
