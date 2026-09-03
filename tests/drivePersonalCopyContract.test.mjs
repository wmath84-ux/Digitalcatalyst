// tests/drivePersonalCopyContract.test.mjs
//
// Contract for the per-student PERSONAL COPY feature (Drive files.copy).
//
// The admin enables it per Google family (Docs / Sheets / Slides / Drive
// binaries) in Admin → Content → Course Player and supplies the public
// OAuth Client ID. A learner then gets a "My copy" toggle: the first tap
// runs Google's consent popup + Drive `files.copy`, cloning the master
// into the STUDENT's own Drive — the student owns the copy, so editing
// always works and the master stays untouched. The mapping is remembered
// in `users/{uid}/driveCopies/{sourceFileId}`.
//
// Google Forms are deliberately excluded: copying a form hands the
// student the form BUILDER, not a fillable form.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPersonalCopyUrl,
  getDriveSourceFileId,
  normalizeDrivePersonalCopySettings,
  personalCopyKind,
} from "../src/utils/courseEmbed.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const gdoc = { id: "d1", name: "Notes", type: "doc", url: "https://docs.google.com/document/d/DOC123/edit" };
const gsheet = { id: "s1", name: "Marks", type: "sheet", url: "https://docs.google.com/spreadsheets/d/SHEET123/edit" };
const gslides = { id: "p1", name: "Deck", type: "slides", url: "https://docs.google.com/presentation/d/SLIDES123/edit" };
const gform = { id: "f1", name: "Quiz", type: "google_form", url: "https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform" };
const drivePdf = { id: "v1", name: "Workbook", type: "pdf", url: "https://drive.google.com/file/d/DRIVE123/view" };
const youtube = { id: "y1", name: "Lesson", type: "youtube", url: "https://youtu.be/abcdefghijk" };

// ---------------------------------------------------------------------------
// 1. Kind resolution — which families support a personal copy
// ---------------------------------------------------------------------------

test("personalCopyKind covers docs, sheets, slides AND drive binaries", () => {
  assert.equal(personalCopyKind(gdoc), "doc");
  assert.equal(personalCopyKind(gsheet), "sheet");
  assert.equal(personalCopyKind(gslides), "slides");
  assert.equal(personalCopyKind(drivePdf), "drive", "PDFs stored on Drive can be copied too");
});

test("forms and non-Google files are excluded from personal copies", () => {
  assert.equal(personalCopyKind(gform), null, "copying a form would hand out the builder");
  assert.equal(personalCopyKind(youtube), null);
});

test("getDriveSourceFileId extracts the master file id", () => {
  assert.equal(getDriveSourceFileId(gdoc), "DOC123");
  assert.equal(getDriveSourceFileId(drivePdf), "DRIVE123");
  assert.equal(getDriveSourceFileId(gform), "", "forms never expose a copy source");
});

// ---------------------------------------------------------------------------
// 2. Copy URL — the student's own file opens in the right experience
// ---------------------------------------------------------------------------

test("native editors open the COPY in edit mode with the admin chrome", () => {
  assert.match(buildPersonalCopyUrl("doc", "COPY1"), /document\/d\/COPY1\/edit\?rm=embedded/);
  assert.match(buildPersonalCopyUrl("doc", "COPY1", "full"), /document\/d\/COPY1\/edit$/);
  assert.match(buildPersonalCopyUrl("sheet", "COPY2", "full"), /spreadsheets\/d\/COPY2\/edit$/);
  assert.match(buildPersonalCopyUrl("slides", "COPY3"), /presentation\/d\/COPY3\/edit\?rm=embedded/);
});

test("drive binaries open the COPY in the drive preview", () => {
  assert.match(buildPersonalCopyUrl("drive", "COPY4"), /drive\.google\.com\/file\/d\/COPY4\/preview/);
});

test("an empty copy id yields no URL (guards the toggle)", () => {
  assert.equal(buildPersonalCopyUrl("doc", ""), "");
});

// ---------------------------------------------------------------------------
// 3. Admin settings normalisation — everything defaults OFF
// ---------------------------------------------------------------------------

test("normalizeDrivePersonalCopySettings defaults every family to OFF", () => {
  const settings = normalizeDrivePersonalCopySettings(undefined, "");
  assert.deepEqual(settings.byType, { doc: false, sheet: false, slides: false, drive: false });
  assert.equal(settings.clientId, "");
});

test("stored client id wins over the env fallback; env fills the blank", () => {
  const stored = normalizeDrivePersonalCopySettings({ clientId: "stored-id" }, "env-id");
  assert.equal(stored.clientId, "stored-id");
  const fallback = normalizeDrivePersonalCopySettings({ clientId: "" }, "env-id");
  assert.equal(fallback.clientId, "env-id");
});

test("only explicit true enables a family (no truthy coercion)", () => {
  const settings = normalizeDrivePersonalCopySettings({ byType: { doc: true, sheet: "yes", drive: 1 } }, "");
  assert.equal(settings.byType.doc, true);
  assert.equal(settings.byType.sheet, false);
  assert.equal(settings.byType.drive, false);
});

// ---------------------------------------------------------------------------
// 4. OAuth token flow — client-side, public Client ID only
// ---------------------------------------------------------------------------

test("the Drive helper uses the GIS token flow with the full drive scope", () => {
  const helper = read("src/utils/googleDriveCopy.ts");
  assert.match(helper, /initTokenClient/);
  assert.match(helper, /auth\/drive/);
  // files.copy against Drive v3, into the student's Drive.
  assert.match(helper, /drive\/v3\/files\/.*\/copy/);
  // The client secret must NEVER appear in browser code.
  assert.doesNotMatch(helper, /client_secret/i);
});

test("the helper maps every Google failure to an actionable message", () => {
  const helper = read("src/utils/googleDriveCopy.ts");
  for (const code of ["consent_denied", "popup_blocked", "token_expired", "source_not_found", "forbidden", "network_error"]) {
    assert.match(helper, new RegExp(code));
  }
  assert.match(helper, /Anyone with the link → Viewer/);
});

// ---------------------------------------------------------------------------
// 5. Firestore mapping + rules
// ---------------------------------------------------------------------------

test("the copy mapping lives in users/{uid}/driveCopies/{sourceFileId}", () => {
  const hook = read("src/hooks/usePersonalDriveCopy.ts");
  assert.match(hook, /"driveCopies", sourceFileId/);
  assert.match(hook, /onSnapshot/);
  assert.match(hook, /copyFileId/);
});

test("firestore.rules restrict driveCopies to the owner", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /match \/driveCopies\/\{sourceFileId\}/);
  assert.match(rules, /request\.resource\.data\.sourceFileId == sourceFileId/);
  assert.match(rules, /request\.resource\.data\.copyFileId is string/);
});

// ---------------------------------------------------------------------------
// 6. Viewer + admin wiring
// ---------------------------------------------------------------------------

test("the Player tab shows the My copy toggle only when the admin enabled the family", () => {
  // The toggle moved off the file's own header (which no longer exists) into
  // the footer dock's Player tab; the ACTIVE viewer still owns the flow and
  // reports the toggle through its action model.
  const viewer = read("src/course/ResourceViewer.tsx");
  const panel = read("src/course/PlayerPanel.tsx");
  assert.match(panel, /data-course-viewer-copy-toggle/);
  assert.match(panel, /fileActions\.personalCopyEnabled \? \(/);
  assert.match(viewer, /personalCopyEnabled,\s*\n\s*personalCopyActive: showPersonalCopy/);
  assert.match(viewer, /personalCopySettings\.clientId && personalCopySettings\.byType\[copyKind\]/);
  assert.match(viewer, /usePersonalDriveCopy/);
  // Busy + error surfaces for the copy flow stay above the preview.
  assert.match(viewer, /data-course-personal-copy-busy/);
  assert.match(viewer, /data-course-personal-copy-error/);
});

test("the admin Content page has the client-id field and per-type toggles", () => {
  const contentPage = read("src/admin/pages/ContentPage.tsx");
  assert.match(contentPage, /data-admin-drive-client-id/);
  assert.match(contentPage, /data-admin-personal-copy/);
  assert.match(contentPage, /data-personal-copy-type=\{type\.key\}/);
  for (const key of ['key: "doc"', 'key: "sheet"', 'key: "slides"', 'key: "drive"']) {
    assert.ok(contentPage.includes(key), `missing personal-copy type ${key}`);
  }
  assert.match(contentPage, /drivePersonalCopy: settings\?\.drivePersonalCopy \?\? \{ clientId: "", byType: \{\} \}/);
});

test("the settings hook reads drivePersonalCopy live with the env fallback", () => {
  const hook = read("src/hooks/useDocsEditorAccess.ts");
  assert.match(hook, /normalizeDrivePersonalCopySettings\(data\?\.drivePersonalCopy, getGoogleClientId\(\)\)/);
});
