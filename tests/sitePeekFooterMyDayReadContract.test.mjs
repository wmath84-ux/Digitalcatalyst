// tests/sitePeekFooterMyDayReadContract.test.mjs
//
// Owner brief 2026-10-04:
//   · hide the leftover My Day conversion nag (JOPLIN_BAD_ID);
//   · Joplin mobile = one-pane app layout, tablets = desktop 3-pane;
//   · home footer uses the course-player peek drag, then that footer is on My Day;
//   · Read library: course / my-PDFs toggle, module+submodule+multi upload,
//     and an upload that actually leaves 0%.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("the conversion banner is gone and a failed migration is skipped, not retried", () => {
  const app = read("src/MyDayApp.tsx");
  assert.doesNotMatch(app, /Some items could not be moved yet/);
  assert.doesNotMatch(app, /MigrationNotice/);
  assert.match(app, /skipLegacyMigration/);
  const bridge = read("src/joplin/joplinMigrationBridge.ts");
  assert.match(bridge, /export async function skipLegacyMigration/);
  assert.match(bridge, /legacy_not_needed/);
  assert.match(bridge, /completedAt: now/);
});

test("Home and My Day wear the course-player peek footer with home icons", () => {
  const peek = read("src/components/SitePeekFooter.tsx");
  assert.match(peek, /data-site-peek-dock=""/);
  assert.match(peek, /data-site-peek-line=""/);
  assert.match(peek, /data-site-peek-panel=""/);
  assert.match(peek, /data-site-footer-nav/);
  assert.match(peek, /<GlassDock siteFooter/);
  assert.match(peek, /pointerX=\{pointerX\}/);
  assert.match(peek, /DRAG_SELECT_THRESHOLD/);
  assert.match(peek, /setPointerCapture/);
  assert.match(peek, /isInsidePeekDockArea/);

  const footer = read("src/components/SiteFooterNav.tsx");
  assert.match(footer, /peek\?: boolean/);
  assert.match(footer, /if \(peek\)/);
  assert.match(footer, /<SitePeekFooter/);
  assert.match(footer, /<GlassDock siteFooter/);

  const home = read("src/home/App.tsx");
  assert.match(home, /<BottomNav/);
  assert.match(home, /\bpeek\b/);

  const myDay = read("src/MyDayApp.tsx");
  assert.match(myDay, /import BottomNav/);
  assert.match(myDay, /active="myday"/);
  assert.match(myDay, /\bpeek\b/);
});

test("the Joplin workspace is a phone app layout and a tablet desktop 3-pane", () => {
  const css = read("public/my-day-workspace/app.bundle.css");
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /\.workspace-container\[data-pane="list"\] \.workspace-editor/);
  assert.match(css, /\.workspace-container\[data-pane="editor"\] \.workspace-list/);
  assert.match(css, /transform: translateX\(-105%\)/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /clamp\(200px, 22vw, 280px\)/);
  assert.doesNotMatch(css, /min-width: 60px/);

  const js = read("public/my-day-workspace/app.bundle.js");
  assert.match(js, /function toggleTheme/);
  assert.match(js, /btn-theme/);
  assert.match(js, /eduvora\.joplin_theme/);
  assert.match(js, /mobilePane/);
  assert.match(js, /sidebarOpen/);
  assert.match(js, /isHex32/);
});

test("the Read library has a course/mine toggle, compose for modules, and a stall-proof upload", () => {
  const panel = read("src/course/ReadLibraryPanel.tsx");
  assert.match(panel, /data-course-read-mode="course"/);
  assert.match(panel, /data-course-read-mode="mine"/);
  assert.match(panel, /data-course-read-compose/);
  assert.match(panel, /multiple/);
  assert.match(panel, /Create your module/);
  assert.match(panel, /Submodule/);
  assert.match(panel, /Your annotations/);
  assert.match(panel, /data-course-read-upload/);

  const hook = read("src/course/useReadUploads.ts");
  assert.match(hook, /uploadBytesResumable/);
  // ONE upload path with real progress: the old 3.5 s "stall" fallback that
  // cancelled the resumable task and raced a progress-less uploadBytes (the
  // stuck-at-40 % upload) must not come back. Behaviour is proved in
  // tests/readUploadPipelineRuntime.test.mjs.
  assert.match(hook, /uploadBytesResumable\(target, file, \{ contentType: "application\/pdf" \}\)/);
  assert.doesNotMatch(hook, /uploadBytes\(target, file/);
  assert.doesNotMatch(hook, /progress: 0\.4\b/);
  assert.match(hook, /READ_UPLOAD_STALL_MS/);
  assert.match(hook, /getIdToken\(true\)/);
  assert.match(hook, /uploadPdfs/);
  assert.match(hook, /sanitizeReadUploadSubmodule/);

  const model = read("utils/readUploads.js");
  assert.match(model, /sanitizeReadUploadSubmodule/);
  assert.match(model, /submodule:/);
  assert.match(model, /groupReadUploadSubmodules/);
});

test("Home's footer is always open; My Day keeps the peek; the desktop dock follows the Home route", () => {
  const home = read("src/home/App.tsx");
  assert.match(home, /<BottomNav[\s\S]*?\bpeek\b[\s\S]*?\bpeekAlwaysOpen\b/);
  const myDay = read("src/MyDayApp.tsx");
  assert.doesNotMatch(myDay, /peekAlwaysOpen/);
  const footer = read("src/components/SitePeekFooter.tsx");
  assert.match(footer, /const open = alwaysOpen \|\| hover \|\| pinned/);
  assert.match(footer, /inert=\{!open\}/);
  const dock = read("src/components/glass-dock/DesktopPeekDock.tsx");
  assert.match(dock, /export function isHomeDockRoute/);
  assert.match(dock, /const open = alwaysOpen \|\| hoverOpen/);
  const shell = read("src/components/DesktopShell.tsx");
  assert.match(shell, /data-desktop-dock-clearance=/);
  assert.match(read("src/index.css"), /\[data-desktop-content\]\[data-desktop-dock-clearance="true"\]/);
});
