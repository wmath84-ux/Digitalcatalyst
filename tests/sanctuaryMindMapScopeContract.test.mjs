// tests/sanctuaryMindMapScopeContract.test.mjs
//
// The second half of "Sanctuary ke andar jo notes aur mind map hai vah save ho
// — abhi save nahin ho rahe."
//
// ROOT CAUSE (mind map): `useCourseMindMap` only reads or writes a document
// when it has BOTH a course id AND a module id — `scoped` gates the load
// effect, `persist()` and `createMap()`. On the Sanctuary board the module id
// came from `selectedModuleId`, which the reading board sets ONLY when the
// learner opens a RESOURCE. So the ordinary flow — enter the Sanctuary, pick a
// course, turn to the mind-map board, draw — was unscoped: the canvas accepted
// every branch, "New map" returned null, and `persist()` returned on its first
// line without writing anything. The map looked editable and saved nothing,
// which is indistinguishable from "Firebase save nahi kar raha".
//
// A second, quieter bug sat behind it: the board passed `productId: productId ?? ""`.
// An empty string satisfies `productId != null`, so if a module id had been
// present the hook would have built the document id `{uid}____{moduleId}` — one
// shared namespace for every unpicked course.
//
// THE FIX, pinned here: the board ALWAYS has a scope (a course-level bucket
// until the learner drills into a module), it passes `undefined` rather than
// `""` when no course is picked, the hook itself refuses an empty product id,
// and the board's subtitle says out loud whether the work reached Firebase.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const boards = read("src/nature3d/boards/StudyBoards.tsx");
const reading = read("src/nature3d/boards/ReadingBoard.tsx");
const mindHook = read("src/course/useCourseMindMap.ts");
const rules = read("firestore.rules");

test("the mind-map board is ALWAYS scoped once a course is picked", () => {
  // The fallback bucket, and why it exists.
  assert.match(boards, /export const SANCTUARY_COURSE_MAP_SCOPE = "course";/);
  assert.match(boards, /const boardModuleId = selectedModuleId \?\? \(productId \? SANCTUARY_COURSE_MAP_SCOPE : null\);/);
  assert.match(boards, /moduleId: boardModuleId \?\? undefined,/);
  // Drilling into a resource still scopes the board to that module, exactly as
  // the Course Player does — the bucket is only the default.
  assert.match(reading, /onSelectModule\(ownerId\);/);
  assert.match(boards, /const \[selectedModuleId, setSelectedModuleId\] = useState<string \| null>\(null\);/);
});

test("an unpicked course passes undefined, never an empty-string scope", () => {
  assert.match(boards, /productId: productId \?\? undefined,/);
  assert.doesNotMatch(boards, /productId: productId \?\? ""/);
  assert.match(boards, /const productId = activeCourse\?\.id \?\? null;/);
});

test("the hook itself refuses an empty product id, so no caller can repeat the bug", () => {
  assert.match(
    mindHook,
    /const scoped =\n\s*Boolean\(uid\)\n\s*&& productId != null\n\s*&& String\(productId\)\.length > 0\n\s*&& moduleId != null\n\s*&& String\(moduleId\)\.length > 0;/,
  );
});

test("the board says whether the map and the notes reached Firebase", () => {
  // A silent save is indistinguishable from a lost one — that is how this went
  // undiagnosed. Both side boards now carry the cloud state in their subtitle.
  assert.match(boards, /export function boardSubtitle\(/);
  assert.match(boards, /Firebase par save ho gaya/);
  assert.match(boards, /Firebase par save ho raha hai…/);
  assert.match(boards, /subtitle=\{boardSubtitle\(activeCourse\?\.title, notes\.status, notes\.errorMessage, notes\.lastSavedAt\)\}/);
  assert.match(boards, /mindMap\.status,\n\s*mindMap\.errorMessage,\n\s*mindMap\.lastSavedAt,/);
  // The mind-map panel keeps its own status row too (unchanged design).
  assert.match(boards, /status=\{mindMap\.status\}/);
  assert.match(boards, /errorMessage=\{mindMap\.errorMessage\}/);
});

test("the board still writes the learner's OWN mind-map documents", () => {
  // Same hook, same collection, same composite id — so a map drawn in the
  // Sanctuary is the map the Course Player opens for that module.
  assert.match(boards, /import useCourseMindMap from "\.\.\/\.\.\/course\/useCourseMindMap"/);
  assert.match(mindHook, /collection\(db, "users", uidText, "mindMaps"\)/);
  assert.match(mindHook, /setDoc\(doc\(db, "users", signedInUid, "mindMaps", key\), payload\)/);
  assert.match(rules, /match \/mindMaps\/\{mapId\} \{/);
  assert.match(rules, /mapId == uid \+ '__' \+ request\.resource\.data\.productId \+ '__' \+ request\.resource\.data\.moduleId/);
  // The course-level bucket is a legal moduleId under those rules: a non-empty
  // string, and the mapKey charset rule only constrains the map key.
  assert.match(rules, /request\.resource\.data\.moduleId\.size\(\) > 0/);
});

test("nothing is auto-selected, so the boards still open empty", () => {
  // The 2026-09 behaviour that must NOT regress: an unpicked course means an
  // empty board, not somebody else's notes.
  assert.match(boards, /const \[selectedCourseId, setSelectedCourseId\] = useState<string \| null>\(null\);/);
  assert.match(boards, /notes=\{activeCourse \? notes\.notes : EMPTY_NOTES\}/);
  assert.match(boards, /const EMPTY_NOTES: CoursePlayerNote\[\] = \[\];/);
});
