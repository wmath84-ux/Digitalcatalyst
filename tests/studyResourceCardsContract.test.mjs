// Contract tests for the shared Course Player Note / Mind Map study-library
// card, its real curriculum context, accessible rename flow and library states.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const notePanel = read("src/course/NotesPanel.tsx");
const mapPanel = read("src/course/MindMapPanel.tsx");
const card = read("src/course/StudyResourceCard.tsx");
const cardCss = read("src/course/study-resource-card.css");
const context = read("src/course/studyResourceContext.ts");
const coursePlayer = read("src/CoursePlayerApp.tsx");
const types = read("src/types/course.ts");

test("notes and mind maps share one resource-card architecture with distinct context", () => {
  assert.match(notePanel, /<StudyResourceCard\s+kind="note"/);
  assert.match(mapPanel, /<StudyResourceCard\s+kind="mind-map"/);
  assert.match(card, /kind === "note" \? "NOTE" : "MIND MAP"/);
  assert.match(card, /data-study-resource-context/);
  assert.match(card, /data-study-resource-topic/);
  assert.match(card, /data-resource-source/);
  assert.match(notePanel, /topicLabel="Note context"/);
  assert.match(notePanel, /Untitled · \$\{String\(note\.id\)\.slice\(0, 8\)\}/);
  assert.match(mapPanel, /const title = entry\.title\.trim\(\) \|\| entry\.rootTopic\.trim\(\) \|\| `Map · \$\{entry\.mapKey\}`/);
  assert.match(mapPanel, /topicLabel="Root topic"/);
  assert.match(notePanel, /resolveCourseResourceContext\(modules, note\.moduleId, note\.resourceId\)/);
  assert.match(mapPanel, /resolveCourseResourceContext\(modules, moduleId\)/);
});

test("course breadcrumbs resolve through the stored hierarchy ids rather than duplicated fields", () => {
  assert.match(context, /resolveCourseResourceContext/);
  assert.match(context, /String\(module\.id\) === wantedModule/);
  assert.match(context, /resourceNameInModule\(module, wantedResource\)/);
  assert.match(context, /visit\(module\.modules \|\| \[\], path\)/);
  assert.match(context, /resolvePersonalResourceContext/);
  for (const field of ["moduleId", "resourceId", "personalModuleId", "personalResourceId", "aiGenerated", "aiKind"]) {
    assert.match(types, new RegExp(`\\b${field}\\??:`), `existing note metadata ${field} remains available`);
  }
  assert.doesNotMatch(types, /chapterTitle\??:|submoduleTitle\??:/, "no parallel curriculum hierarchy is introduced");
  assert.match(coursePlayer, /resourceId: String\(selectedFile\.id\)/);
  assert.match(coursePlayer, /personalModuleId: String\(selectedFile\.personalModuleId\)/);
  assert.match(coursePlayer, /personalNoteContextNeeded/);
  assert.match(coursePlayer, /personalModules\.ensureLoaded\(\)/);
});

test("a single activation opens the editor while double activation and F2 rename inline", () => {
  assert.match(card, /onClick=\{handleOpenClick\}/);
  assert.match(card, /onDoubleClick=\{handleDoubleClick\}/);
  assert.match(card, /event\.detail >= 2 \|\| repeatedClick/);
  assert.match(card, /event\.key === "F2"/);
  assert.match(card, /event\.key === "Enter" && event\.shiftKey/);
  assert.match(card, /onOpen\(\)/);
  assert.match(card, /onRename\?\.\(nextTitle\)/);
  assert.match(card, /onBlur=\{handleEditBlur\}/);
  assert.match(card, /event\.key === "Escape"/);
  assert.match(card, /data-study-resource-rename-input/);
  assert.match(card, /data-study-resource-rename-save/);
  assert.match(card, /data-study-resource-rename-cancel/);
  assert.match(card, /renaming \? \(/);
  assert.match(notePanel, /onEdit\(note\.id, combineHtml\(nextTitle/);
  assert.match(mapPanel, /onRename=\{\(nextTitle\) => onRenameMap\?\.\(entry\.mapKey, nextTitle\)\}/);
});

test("card opening is the large primary affordance and delete remains secondary", () => {
  assert.match(card, /className="study-resource-card__open"/);
  assert.match(card, /data-course-note-open/);
  assert.match(card, /data-course-mindmap-open-map/);
  assert.match(card, /className="study-resource-card__delete"/);
  assert.match(card, /event\.stopPropagation\(\); onDelete\(\)/);
  assert.doesNotMatch(notePanel, /PremiumEditIcon|GlassButton\s+onClick=\{\(\) => startEdit/);
  assert.doesNotMatch(mapPanel, /GlassButton\s+onClick=\{\(\) => startRename/);
});

test("mobile card copy remains readable and library feedback shares the card language", () => {
  assert.match(cardCss, /font-size: 17px/);
  assert.match(cardCss, /min-height: 212px/);
  assert.match(cardCss, /overflow-wrap: anywhere/);
  assert.match(cardCss, /study-resource-card__delete[\s\S]*?width: 40px/);
  assert.match(notePanel, /StudyLibraryEmptyState/);
  assert.match(notePanel, /StudyLibraryNotice/);
  assert.match(notePanel, /StudyResourceCardSkeleton/);
  assert.match(mapPanel, /StudyLibraryEmptyState/);
  assert.match(mapPanel, /StudyLibraryNotice/);
  assert.match(mapPanel, /StudyResourceCardSkeleton/);
});
