// tests/coursePlayerFormChromeViewportContract.test.mjs
//
// Contract for three Course Player fixes:
//
//   1. Submitting a Google Form keeps the learner INSIDE the player, with the
//      course header and the mark-complete footer still on screen.
//   2. The view-options dropdown is fully visible in mobile landscape /
//      rotated mode, where the header is a narrow rail on the LEFT edge.
//   3. The header's document button behaves like the browser's own
//      "Desktop site" switch: it drives the layout viewport AND loads the
//      host's mobile rendering, so a phone in desktop-site mode stops
//      showing unreadably small Google Docs text.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getCourseEmbed, getGoogleFormEmbedUrl, hasNativeMobileRendering } from "../src/utils/courseEmbed.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const resourceViewer = readSource("src/course/ResourceViewer.tsx");
const viewportMode = readSource("src/utils/documentViewportMode.ts");

const formFile = (url) => ({ id: "f1", name: "Quiz", type: "google_form", url });

// ---------------------------------------------------------------------------
// 1. A Google Form submits inside the player
// ---------------------------------------------------------------------------

test("every Google Form link resolves to an embedded /viewform", () => {
  const cases = [
    "https://docs.google.com/forms/d/e/1FAIpQLSabc123/viewform",
    "https://docs.google.com/forms/d/e/1FAIpQLSabc123/viewform?usp=sf_link",
    // An admin pasting the EDIT link must still give learners a viewable form.
    "https://docs.google.com/forms/d/1FAIpQLSabc123/edit",
    // The response endpoint is a POST target, never something to embed.
    "https://docs.google.com/forms/d/e/1FAIpQLSabc123/formResponse",
  ];
  for (const url of cases) {
    const { url: embed, kind } = getCourseEmbed(formFile(url));
    assert.equal(kind, "form", `kind mismatch for ${url}`);
    assert.match(embed, /\/viewform\?/, `should embed the viewform for ${url}`);
    assert.doesNotMatch(embed, /\/edit/, `edit link leaked for ${url}`);
    assert.doesNotMatch(embed, /\/formResponse/, `response endpoint leaked for ${url}`);
  }
});

test("embedded=true is what keeps Submit inside our iframe", () => {
  // Without this flag the form ships <base target="_top">, so submitting
  // replaces the whole app and the header + footer vanish — the reported bug.
  const { url } = getCourseEmbed(formFile("https://docs.google.com/forms/d/e/1FAIpQLSabc123/viewform"));
  assert.match(url, /[?&]embedded=true/);
});

test("an existing query string survives, and embedded is never duplicated", () => {
  const url = getGoogleFormEmbedUrl("https://docs.google.com/forms/d/e/1FAIpQLSabc123/viewform?usp=sf_link&entry.123=hello");
  assert.match(url, /usp=sf_link/);
  assert.match(url, /entry\.123=hello/);
  assert.equal(url.match(/embedded=true/g).length, 1);
});

test("already-embedded links are left semantically unchanged", () => {
  const url = getGoogleFormEmbedUrl("https://docs.google.com/forms/d/e/1FAIpQLSabc123/viewform?embedded=true");
  assert.equal(url.match(/embedded=true/g).length, 1);
  assert.match(url, /\/viewform/);
});

test("forms.gle short links are supported and carry the embed flag", () => {
  const { url, kind } = getCourseEmbed(formFile("https://forms.gle/abcDEF123"));
  assert.equal(kind, "form");
  assert.match(url, /[?&]embedded=true/);
});

test("a non-https or junk form url yields no embed rather than a broken frame", () => {
  assert.equal(getGoogleFormEmbedUrl("http://docs.google.com/forms/d/e/x/viewform"), "");
  assert.equal(getGoogleFormEmbedUrl("/images/not-a-form.jpg"), "");
  assert.equal(getGoogleFormEmbedUrl(""), "");
});

test("the form renders in the normal viewer stack, so the chrome stays mounted", () => {
  // The header and the mark-complete footer are siblings of the viewer, and
  // the form is just another embed inside it — nothing about submitting can
  // unmount them.
  assert.match(coursePlayer, /const markCompleteBar = selectedFile && !fileBarsHidden \?/);
  assert.match(resourceViewer, /\{chromeHidden \? null : <ViewerHeader/);
  // Popups/top-navigation are NOT granted, so the frame cannot escape.
  assert.doesNotMatch(resourceViewer, /allow-top-navigation/);
});

// ---------------------------------------------------------------------------
// 2. The view-options dropdown is visible in landscape
// ---------------------------------------------------------------------------

test("the dropdown opens sideways off the left rail in landscape", () => {
  // In landscape the header is a 56px rail pinned to the left edge. Anchoring
  // a 240px panel with `right-0` pushed almost all of it off-screen.
  assert.match(coursePlayer, /useLandscapeRails \? "left-full top-0 ml-2" : "right-0 top-12"/);
  assert.match(coursePlayer, /data-placement=\{useLandscapeRails \? "side" : "below"\}/);
});

test("the dropdown can never be wider than the space it has", () => {
  assert.match(coursePlayer, /max-w-\[min\(15rem,calc\(100vw-4\.5rem\)\)\]/);
});

// ---------------------------------------------------------------------------
// 3. The document button is a real "Desktop site" switch
// ---------------------------------------------------------------------------

test("mobile mode loads Google's own reflowing rendering, not a scaled desktop page", () => {
  const doc = { id: "d", name: "Notes", type: "doc", url: "https://docs.google.com/document/d/DOC123/edit" };
  assert.match(getCourseEmbed(doc, { viewport: "desktop" }).url, /\/document\/d\/DOC123\/preview/);
  // /preview is fixed-width and paginated — narrowing it only makes the text
  // SMALLER. /mobilebasic reflows, which is what actually fixes readability.
  assert.match(getCourseEmbed(doc, { viewport: "mobile" }).url, /\/document\/d\/DOC123\/mobilebasic/);

  const sheet = { id: "s", name: "Marks", type: "sheet", url: "https://docs.google.com/spreadsheets/d/SHEET123/edit" };
  assert.match(getCourseEmbed(sheet, { viewport: "mobile" }).url, /\/spreadsheets\/d\/SHEET123\/htmlview/);
});

test("the default viewport stays desktop, so nothing changes for existing callers", () => {
  const doc = { id: "d", name: "Notes", type: "doc", url: "https://docs.google.com/document/d/DOC123/edit" };
  assert.equal(getCourseEmbed(doc).url, getCourseEmbed(doc, { viewport: "desktop" }).url);
});

test("only hosts lacking a mobile endpoint fall back to the narrow-frame trick", () => {
  for (const kind of ["doc", "sheet", "form"]) assert.equal(hasNativeMobileRendering(kind), true, kind);
  for (const kind of ["slides", "drive", "pdf", "embed", "mindmap"]) assert.equal(hasNativeMobileRendering(kind), false, kind);
  assert.match(resourceViewer, /!hasNativeMobileRendering\(embed\.kind\)/);
});

test("the viewer resolves the embed url from the chosen viewport (and the edit/preview mode)", () => {
  // The viewport decision still happens BEFORE the URL is built; the viewer
  // additionally forwards the Google Docs full-editor mode when the learner
  // toggles Edit in the header.
  assert.match(resourceViewer, /getCourseEmbed\(file, \{ viewport: desktopView \? "desktop" : "mobile", mode: canEditInline && editMode \? "edit" : "preview" \}\)/);
});

test("the switch drives the document's layout viewport like the browser setting", () => {
  assert.match(viewportMode, /export const applyDocumentViewportMode/);
  assert.match(viewportMode, /width=device-width/);
  // The page's original meta is restored, never guessed at.
  assert.match(viewportMode, /originalViewportContent/);
  assert.match(viewportMode, /export const resetDocumentViewportMode/);
  assert.match(coursePlayer, /applyDocumentViewportMode\(desktopView \? "desktop" : "mobile"\)/);
  // Leaving the player must not leave the rest of the site overridden.
  assert.match(coursePlayer, /useEffect\(\(\) => \(\) => resetDocumentViewportMode\(\), \[\]\)/);
});

test("a phone already in desktop-site mode defaults to the readable rendering", () => {
  assert.match(viewportMode, /export const isBrowserDesktopSiteMode/);
  // Detection needs BOTH a touch device and a layout viewport far wider than
  // the physical screen — a real desktop must not be misread as a phone.
  assert.match(viewportMode, /pointer: coarse/);
  assert.match(viewportMode, /window\.innerWidth > screenWidth \* 1\.5/);
  assert.match(coursePlayer, /return !isBrowserDesktopSiteMode\(\)/);
  // An explicit choice still wins over the detected default.
  assert.match(coursePlayer, /if \(stored === "mobile"\) return false;/);
  assert.match(coursePlayer, /if \(stored === "desktop"\) return true;/);
});
