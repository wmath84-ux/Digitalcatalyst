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
const editor = read("src/personal-library/MyCourseEditorPage.tsx");
const myCard = read("src/personal-library/MyCourseCard.tsx");
const myPlayer = read("src/personal-library/MyCoursePlayerPage.tsx");
const myClient = read("src/lib/myCourseClient.ts");
const myAdapter = read("src/lib/myCourseAdapter.ts");
const brain = read("src/personal-library/MyCourseBrainEditor.tsx");
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

test("central workspace is a course shelf: product-card grid + a '+' that opens the builder", () => {
  assert.match(study, /My Study Library/);
  // Every course the learner built is a card drawn with the store's own
  // product-card material, carrying only cover, title, Play and Edit.
  assert.match(study, /data-my-course-grid/);
  assert.match(study, /<MyCourseCard key=\{course\.id\} course=\{course\} onPlay=\{openCourse\} onEdit=\{editCourse\} \/>/);
  assert.match(myCard, /dc-scene-plate/);
  assert.match(myCard, /aspect-\[4\/3\]/);
  assert.match(myCard, /data-my-course-play/);
  assert.match(myCard, /data-my-course-edit/);
  // The "+" is a tile in the grid AND a floating button, both opening the
  // builder route (new module / folder, image, title, type, name, resource).
  assert.match(study, /data-my-course-create/);
  assert.match(study, /data-my-course-create-fab/);
  assert.match(study, /data-my-course-create-empty/);
  assert.match(study, /MY_COURSE_NEW_HASH = "#\/my-course\/new"/);
  assert.match(study, /myCoursePlayHash\(course\.id\)/);
  assert.match(study, /myCourseEditHash\(course\.id\)/);
  // The old link-organiser surface is gone for good.
  assert.doesNotMatch(study, /Saved for Later/);
  assert.doesNotMatch(study, /data-library-plan-usage/);
  assert.doesNotMatch(study, /usageAtPerModuleLimit/);
});

test("the builder gives modules and resources full CRUD, confirmations and non-drag reorder", () => {
  // Modules: create (incl. nested folders), rename, reorder, delete — with a
  // confirmation before a destructive one.
  assert.match(editor, /createMyModule/);
  assert.match(editor, /addChildNode\(draft\.modules, parentId, createMyModule\(/);
  assert.match(editor, /removeNode/);
  assert.match(editor, /moveNode/);
  assert.match(editor, /updateNode/);
  assert.match(editor, /ConfirmDialog/);
  assert.match(editor, /data-my-module-add-child/);
  assert.match(editor, /Move module up/);
  assert.match(editor, /Move module down/);
  // Resources: name, file type, link OR upload, description, reorder, delete.
  assert.match(editor, /createMyResource/);
  assert.match(editor, /data-my-resource-type-select/);
  assert.match(editor, /data-my-resource-url/);
  assert.match(editor, /uploadMyCourseResourceFile/);
  assert.match(editor, /Move resource up/);
  assert.match(editor, /Move resource down/);
  assert.match(editor, /data-my-course-cover-input/);
  assert.match(editor, /uploadMyCourseCover/);
  // The Brain (MCQ) builder — the same capability the admin has.
  assert.match(editor, /MyCourseBrainEditor/);
  // …including the bulk paste (the shared parser) and hand-written questions.
  assert.match(brain, /parseQuestionText/);
  assert.match(brain, /data-my-brain-add/);
  assert.match(brain, /data-my-brain-option-mark/);
  assert.match(myClient, /MY_COURSES_COLLECTION = "myCourses"/);
  assert.match(myClient, /saveMyCourse/);
  assert.match(myClient, /deleteMyCourse/);
  assert.match(api, /applyOrderMove/);
  assert.doesNotMatch(api, /resources\.forEach\(\(item, index\) => tx\.update/);
});

test("official player actions write into the NEW My Study Library (myCourses) single-flight", () => {
  assert.match(playerPanel, /Add to My Module/);
  assert.match(playerPanel, /Save for later/);
  assert.match(player, /officialDialogTarget/);
  assert.match(player, /personalActionRef/);
  assert.match(player, /productId: String\(product\.id\)/);
  assert.match(player, /moduleId: String\(selectedOfficialModule\.id\)/);
  assert.match(player, /resourceId: String\(selectedFile\.id\)/);
  // Owner brief 2026-09-24: both settings rows now land in the learner-owned
  // `users/{uid}/myCourses` shelf — "Add to My Module" through the
  // course+module destination dialog, "Save for later" through the reserved
  // shelf course — via the same live useMyCourses controller the library
  // page reads. The old server call (`destination: "saved"`) is gone.
  assert.match(player, /useMyCourses\(\)/);
  assert.match(player, /SAVED_FOR_LATER_COURSE_ID = "saved-for-later"/);
  assert.match(player, /myLibrary\.save\(/);
  assert.match(player, /findDuplicateResource/);
  assert.match(addDialog, /New course/);
  assert.match(addDialog, /Choose a course/);
  assert.match(addDialog, /Already added/);
  assert.match(addDialog, /role="status"/);
  // The old personal-modules API still exists for the in-player
  // "My Modules" manager (official courses only).
  assert.match(client, /"personalCourse\.official\.add"/);
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

test("a learner's own courses are never plan-gated — no entitlement, no usage meter, no upsell", () => {
  // The shelf and the builder carry no plan state at all: what the learner
  // authors belongs to them outright (the old saved-link surface was a paid
  // feature with cycle limits; this one is not).
  assert.doesNotMatch(study, /View plans/);
  assert.doesNotMatch(study, /usageAtModuleLimit|usageAtResourceLimit|data-library-limit-state/);
  assert.doesNotMatch(editor, /View plans|personalModules|allowedTypes/);
  assert.doesNotMatch(myClient, /personalCourse|entitlement/i);
  // The old saved-link API keeps its own gating untouched (it still serves
  // the Course Player's "My Modules" surface inside OFFICIAL courses).
  const listBody = api.slice(api.indexOf("async function listLibrary"), api.indexOf("async function createModule"));
  assert.match(listBody, /readEntitlement/);
  assert.doesNotMatch(listBody, /assertCreationEntitled/);
  assert.match(api, /assertCreationEntitled/);
  assert.match(personalPanel, /Existing content remains readable and organisable/);
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
  assert.match(personalPanel, /personal\.moveResource\(/);
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
  assert.match(client, /source: "personal"/);
  assert.match(player, /activeFileIsPersonal/);
  assert.match(player, /!activeFileIsPersonal/);
  assert.match(player, /selectedFile\.source \|\| ""\) === "personal"/);
  assert.match(viewer, /CourseFile/);
  assert.doesNotMatch(study, /mark.*Complete/i);
});

test("a learner-authored course opens the SAME Course Player, on its own namespaced storage", () => {
  // Same player component — only the product projection differs…
  assert.match(myPlayer, /lazy\(\(\) => import\("\.\.\/CoursePlayerApp"\)\)/);
  assert.match(myPlayer, /<CoursePlayer/);
  assert.match(myAdapter, /export const myCourseToProduct/);
  assert.match(myAdapter, /courseContent: course\.modules\.map\(toCourseModule\)/);
  assert.match(myAdapter, /id: myCourseStorageId\(course\.id\)/);
  // …and it is flagged `mine`, which is what removes the Paid tab, hides the
  // official-resource rows and namespaces every store (`mine-<courseId>`).
  assert.match(myPlayer, /mine=\{\{ courseId: course\.id \}\}/);
  assert.match(player, /mine\?: \{ courseId: string \} \| null/);
  assert.match(player, /MINE_HIDDEN_TABS: DockTab\[\] = \["paid"\]/);
  assert.match(player, /storageProductId = isMine && mine \? `mine-\$\{mine\.courseId\}` : String\(product\.id\)/);
  assert.match(player, /hiddenTabs=\{hiddenTabs\}/);
  assert.match(player, /useCourseAccess\(\{ product, skip: isMine \}\)/);
  // Settings stay, the three official-resource rows do not.
  assert.match(playerPanel, /mine\?: boolean;/);
  assert.match(playerPanel, /!mine && showPersonalLibraryActions && onAddToPersonalModule/);
  assert.match(playerPanel, /!mine && showPersonalLibraryActions && onSaveForLater/);
  assert.match(playerPanel, /!mine && gateFile/);
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
