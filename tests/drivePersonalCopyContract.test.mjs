// tests/drivePersonalCopyContract.test.mjs
//
// Contract for the no-learner-Drive-consent architecture.
//
// Course resources may be fulfilled by the owner-controlled email gate, but
// the browser never requests a learner Google Drive token or calls Drive API.
// Basic Google identity sign-in remains separate from the owner-side
// Apps Script/server workflow.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gateResourceKind, getGateSourceFileId } from "../src/utils/courseEmbed.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const gdoc = { id: "d1", name: "Notes", type: "doc", url: "https://docs.google.com/document/d/DOC123/edit" };
const gsheet = { id: "s1", name: "Marks", type: "sheet", url: "https://docs.google.com/spreadsheets/d/SHEET123/edit" };
const gslides = { id: "p1", name: "Deck", type: "slides", url: "https://docs.google.com/presentation/d/SLIDES123/edit" };
const gform = { id: "f1", name: "Quiz", type: "google_form", url: "https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform" };
const drivePdf = { id: "v1", name: "Workbook", type: "pdf", url: "https://drive.google.com/file/d/DRIVE123/view" };
const youtube = { id: "y1", name: "Lesson", type: "youtube", url: "https://youtu.be/abcdefghijk" };

const sourceFiles = [
  "src/CoursePlayerApp.tsx",
  "src/course/PlayerPanel.tsx",
  "src/course/ResourceViewer.tsx",
  "src/course/GatePersonalAccess.tsx",
  "src/hooks/useDocsEditorAccess.ts",
  "src/admin/pages/ContentPage.tsx",
  "src/utils/courseEmbed.ts",
];

// ---------------------------------------------------------------------------
// 1. The gate resolves only owner-fulfillable Google resources
// ---------------------------------------------------------------------------

test("gateResourceKind covers native Google files and Drive binaries", () => {
  assert.equal(gateResourceKind(gdoc), "doc");
  assert.equal(gateResourceKind(gsheet), "sheet");
  assert.equal(gateResourceKind(gslides), "slides");
  assert.equal(gateResourceKind(drivePdf), "drive");
});

test("forms and unrelated media are excluded from the Drive share gate", () => {
  assert.equal(gateResourceKind(gform), null, "a form would expose the owner builder");
  assert.equal(gateResourceKind(youtube), null);
});

test("the gate receives a source id, but never a learner OAuth token", () => {
  assert.equal(getGateSourceFileId(gdoc), "DOC123");
  assert.equal(getGateSourceFileId(drivePdf), "DRIVE123");
  assert.equal(getGateSourceFileId(gform), "", "forms have no gate source id");
  const app = read("src/CoursePlayerApp.tsx");
  assert.match(app, /gateResourceKind\(selectedFile\)/);
  assert.match(app, /getGateSourceFileId\(selectedFile\)/);
});

// ---------------------------------------------------------------------------
// 2. The removed browser Drive OAuth path cannot ship
// ---------------------------------------------------------------------------

test("the production source has no learner Drive OAuth imports or controls", () => {
  for (const file of sourceFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /usePersonalDriveCopy|googleDriveCopy|requestDriveAccessToken/,
      `${file} still imports the removed Drive OAuth path`);
    assert.doesNotMatch(source, /personalCopyEnabled|personalCopyActive|onTogglePersonalCopy|drivePersonalCopy/,
      `${file} still exposes the removed personal-copy settings`);
  }
  assert.equal(fs.existsSync(path.join(repoRoot, "src/hooks/usePersonalDriveCopy.ts")), false);
  assert.equal(fs.existsSync(path.join(repoRoot, "src/utils/googleDriveCopy.ts")), false);
  assert.equal(fs.existsSync(path.join(repoRoot, "utils/googleIdentity.ts")), false);
});

test("the editor hook and admin page contain only editor settings", () => {
  const hook = read("src/hooks/useDocsEditorAccess.ts");
  const contentPage = read("src/admin/pages/ContentPage.tsx");
  assert.match(hook, /editorAccess: DocsEditorAccessMap/);
  assert.doesNotMatch(hook, /Client ID|DrivePersonalCopy|Google Drive/);
  assert.match(contentPage, /title="Personal access — email gate"/);
  assert.doesNotMatch(contentPage, /data-admin-drive-client-id|data-admin-personal-copy|drivePersonalCopy/);
});

test("the Player exposes the email gate and explicitly rejects learner Drive consent", () => {
  const panel = read("src/course/PlayerPanel.tsx");
  const gate = read("src/course/GatePersonalAccess.tsx");
  assert.match(panel, /<GatePersonalAccess/);
  assert.match(panel, /learner OAuth/);
  assert.match(gate, /No Google Drive permission will be requested/);
  assert.match(gate, /action: "gatePersonalAccess\.request"/);
  assert.doesNotMatch(gate, /google\.accounts\.oauth2|initTokenClient|auth\/drive|drive\.file/);
});

// ---------------------------------------------------------------------------
// 3. Owner-side fulfillment remains separate from the learner client
// ---------------------------------------------------------------------------

test("the owner-side gate still documents server or Apps Script fulfillment", () => {
  const api = read("api/_lib/gatePersonalAccess.ts");
  const script = read("gatePersonalAccess.gs");
  assert.match(api, /GATE_APPS_SCRIPT_URL/);
  assert.match(api, /service-account|Apps Script/i);
  assert.match(script, /files\.copy|makeCopy/);
  assert.match(script, /permission|share/i);
});

test("the public disclosures describe identity sign-in and owner-side sharing", () => {
  const privacy = read("public/privacy-policy.html");
  const terms = read("public/terms-of-service.html");
  assert.match(privacy, /do <strong>not<\/strong> ask you to connect your Google Drive/i);
  assert.match(privacy, /do <strong>not<\/strong> request or receive a Google Drive OAuth token/i);
  assert.match(terms, /operator(?:-controlled)? Drive share/i);
  assert.doesNotMatch(terms, /sign-in and personal Drive copies/i);
});
