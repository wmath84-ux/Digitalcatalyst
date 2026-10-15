import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const app = source("src/work/WorkApp.tsx");
const page = source("src/work/pages/WorkPageSurface.tsx");
const mindMapSurface = source("src/work/pages/WorkMindMapSurface.tsx");
const sketchSurface = source("src/work/pages/WorkSketchSurface.tsx");
const aiSurface = source("src/work/pages/WorkAiSurface.tsx");
const identity = source("src/work/workIdentity.ts");
const notesHook = source("src/course/useCourseNotes.ts");
const mindMapHook = source("src/course/useCourseMindMap.ts");
const mindMapPanel = source("src/course/MindMapPanel.tsx");
const notesPanel = source("src/course/NotesPanel.tsx");
const workSketch = source("src/work/storage/useWorkSketch.ts");
const sketchDb = source("src/work/storage/workSketchDb.ts");
const sketchPanel = source("src/course/SketchPanel.tsx");
const quickSketchHook = source("src/course/usePerfectFreehandSketch.ts");
const lumen = source("src/lumen/App.tsx");
const lumenChats = source("src/lumen/useLumenChats.ts");
const workCss = source("src/work/work-shell.css");
const workRevision = source("src/work/WorkRevisionApp.tsx");
const workRevisionDb = source("src/work/storage/workRevisionDb.ts");

test("heavy Work surfaces load on demand and expose accessible loading fallbacks", () => {
  for (const chunk of ["NotesPanel", "WorkMindMapSurface", "WorkSketchSurface", "WorkAiSurface", "WorkMyDayPage", "WorkRevisionApp"]) {
    assert.ok(page.includes(`const ${chunk} = lazy(() => import(`), `${chunk} should not be fetched before its Work page is opened`);
  }
  assert.match(page, /<Suspense fallback=\{<WorkPageLoading page=\{page\} \/>\}>/);
  assert.match(page, /role="status" aria-live="polite" data-work-page-loading/);
});

test("Work owns one stable device identity and a single local-only Notes scope", () => {
  assert.match(identity, /WORK_DEVICE_UID = "work-device"/);
  assert.match(app, /useCourseNotes\(\{ uid: WORK_DEVICE_UID, productId: WORK_PRODUCT_ID, storageOnly: true \}\)/);
  assert.match(page, /<NotesPanel[\s\S]*?masterNotes=\{\[\]\}[\s\S]*?storageOnly[\s\S]*?themeOverride=\{theme\}/);
  const localNotesBranch = notesHook.indexOf("if (session.storageOnly) {");
  const cloudNotesRead = notesHook.indexOf("void fetchCloudNotes(uidText, productText)", localNotesBranch);
  assert.ok(localNotesBranch >= 0 && cloudNotesRead > localNotesBranch, "device-only Notes must bypass cloud reads");
  assert.match(notesPanel, /storageOnly \? \{ view: "list" as const \} : getCoursePanelSession\(\)\.notes/);
  assert.match(notesPanel, /if \(storageOnly\) return;[\s\S]*?setNotesSessionView/);
});

test("Work Mind Maps show only personal device maps, with scoped theme and no Course panel-session leakage", () => {
  assert.match(mindMapSurface, /useCourseMindMap\(\{[\s\S]*?storageOnly: true/);
  assert.match(mindMapSurface, /masterMaps=\{\[\]\}[\s\S]*?storageOnly[\s\S]*?themeOverride=\{theme\}/);
  assert.match(mindMapHook, /if \(scope\.storageOnly\) \{[\s\S]*?return;[\s\S]*?\}/);
  assert.match(mindMapPanel, /storageOnly \|\| getCoursePanelSession\(\)\.mindMapView !== "canvas"/);
  assert.match(mindMapPanel, /if \(!storageOnly\) setMindMapSessionView/);
  assert.match(mindMapPanel, /const resumeCanvas = !storageOnly && getCoursePanelSession\(\)\.mindMapView === "canvas";/);
});

test("Work Sketch scenes/files and the personal library use Dexie, not Firestore", () => {
  assert.match(sketchSurface, /useWorkSketch\(\)/);
  assert.match(sketchSurface, /libraryDeviceStore=\{workSketchLibraryStore\}/);
  assert.match(sketchSurface, /storageOnly\s*\n\s*libraryDeviceStore/);
  assert.match(sketchDb, /extends Dexie/);
  assert.match(sketchDb, /scenes: "key, updatedAt"/);
  assert.match(sketchDb, /libraries: "key, updatedAt"/);
  assert.doesNotMatch(sketchDb, /firebase\/firestore/);
  assert.doesNotMatch(workSketch, /firebase\/firestore|setDoc\(|getDoc\(|getDocs\(|deleteDoc\(/);
  assert.match(workSketch, /parseSketchScene\(scene, \{ fileBudget: WORK_FILE_BUDGET \}\)/);
  assert.match(sketchPanel, /useSketchLibrary\(\{ uid, storageOnly, deviceStore: libraryDeviceStore \}\)/);
  assert.match(sketchPanel, /localOnly=\{storageOnly\}/);
});

test("Quick Sketch has an explicit local-only branch ahead of every Firestore operation", () => {
  const saveBranch = quickSketchHook.indexOf("if (localOnly) {");
  const cloudWrite = quickSketchHook.indexOf("await setDoc(", saveBranch);
  const localReturn = quickSketchHook.indexOf("return;", saveBranch);
  assert.ok(saveBranch >= 0 && localReturn > saveBranch && cloudWrite > localReturn);
  const boardLoadBranch = quickSketchHook.indexOf("if (localOnly) {", quickSketchHook.indexOf("const openBoard"));
  const cloudRead = quickSketchHook.indexOf("const snap = await getDoc(", boardLoadBranch);
  assert.ok(boardLoadBranch >= 0 && cloudRead > boardLoadBranch);
  assert.match(quickSketchHook, /if \(!localOnly\) \{\s*void deleteDoc/);
  assert.match(quickSketchHook, /localOnly \? "local" : "cloud"/);
});

test("Work AI receives Work notes, scopes its theme, and keeps chat history local-only", () => {
  assert.match(aiSurface, /<LumenChat[\s\S]*?notes=\{notes\}[\s\S]*?storageOnly[\s\S]*?themeOverride=\{theme\}/);
  assert.match(lumen, /storageOnly\?: boolean/);
  assert.match(lumen, /themeOverride\?: "light" \| "dark"/);
  assert.match(lumen, /Course Player uses cloud-backed history; Work opts into storageOnly/);
  const localBranch = lumenChats.indexOf("if (session.storageOnly) {");
  const cloudSubscribe = lumenChats.indexOf("const unsubscribe = subscribeCloudChats", localBranch);
  assert.ok(localBranch >= 0 && cloudSubscribe > localBranch);
  const localFlush = lumenChats.indexOf("if (scope.storageOnly) {", lumenChats.indexOf("const flushNow"));
  const cloudUpload = lumenChats.indexOf("uploadCloudChats(owner", localFlush);
  assert.ok(localFlush >= 0 && cloudUpload > localFlush);
});

test("Work theme and exit controls live in the page header, never as floating shell overlays", () => {
  assert.match(page, /<header[\s\S]*?data-work-header-area=\{page\}[\s\S]*?data-work-exit[\s\S]*?data-work-theme-toggle/);
  assert.doesNotMatch(app, /data-work-shell-controls|data-work-theme-toggle/);
  assert.doesNotMatch(workCss, /data-work-header-area\s*\{\s*padding/);
  assert.match(app, /setWorkTheme\(theme === "dark" \? "light" : "dark"\)/);
});

test("My Day and Phase 4 Revision mount as local Work surfaces instead of placeholders", () => {
  assert.match(page, /<WorkMyDayPage/);
  assert.doesNotMatch(page, /My Day · Phase 3|Revision library · Phase 4|WorkPhasePlaceholder/);
  assert.match(page, /<WorkRevisionApp notes=\{notes\.notes\} onExit=\{onExit\} \/>/);
  assert.match(workRevision, /data-work-revision-dashboard/);
  assert.match(workRevision, /data-work-revision-library/);
  assert.match(workRevision, /data-work-revision-style-choice/);
  assert.match(workRevision, /data-work-revision-create-choice/);
  assert.match(workRevisionDb, /WORK_REVISION_NAMESPACE = "work:device"/);
  assert.match(workRevisionDb, /recordWorkRevisionRating/);
  assert.doesNotMatch(workRevisionDb, /from\s*["'][^"']*(?:firebase|firestore|dcxRepository|revisionCloudSync)/i);
});
