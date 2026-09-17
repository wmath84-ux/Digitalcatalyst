// tests/courseAiReaderRegistry.test.mjs
//
// The per-file-type reader registry (utils/aiFileReaders.js) is the ONE answer
// to "how does the AI read THIS file?", consumed by the server extractor
// (api/_lib/personalAiContent.ts), the personal-library honesty table
// (utils/personalCourse.js) and the Course Player chat (src/lumen/course/*).
//
// These tests pin the decisions themselves, because the learner-facing bug they
// exist to prevent was exactly this: three tables describing the same files
// three ways, and the stale one winning in the UI. A course player AI that
// answers "I don't have access to this module" to every message — for a learner
// with full access — is what happens when "no text was read" and "no access"
// share one sentence.
//
// Runs on plain `node --test`: the registry is pure and imports nothing.

import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CAPTION_EXTENSIONS,
  AI_FILE_LABELS,
  AI_FILE_READERS,
  AI_FILE_TYPES,
  AI_MEDIA_EXTENSIONS,
  AI_READ_KINDS,
  AI_TEXT_EXTENSIONS,
  aiCapabilitiesFor,
  aiCaptionUrl,
  aiPayloadText,
  aiReadPlan,
  aiReaderFor,
  aiReaderReason,
  aiTypeHasReadPath,
  googleFileIdFromUrl,
  isGoogleFileUrl,
  mindMapToText,
  parseCaptionText,
  practiceSetToText,
} from "../utils/aiFileReaders.js";
import { personalAiReadPlan } from "../utils/personalAi.js";
import { personalAiAvailability } from "../utils/personalCourse.js";
import { ALL_PERSONAL_COURSE_TYPES } from "../utils/personalCourse.js";

/* ------------------------------------------------------------------ */
/* Coverage: no file type is unhandled                                */
/* ------------------------------------------------------------------ */

test("every course file type has a reader row with a reason and a fallback", () => {
  for (const type of AI_FILE_TYPES) {
    const reader = aiReaderFor(type);
    assert.equal(reader.type, type);
    assert.ok(AI_FILE_LABELS[type], `${type}: needs a label`);
    assert.ok(AI_READ_KINDS.includes(reader.via), `${type}: read kind "${reader.via}" is not a known kind`);
    assert.ok(["screenshot", "metadata", "none"].includes(reader.fallback), `${type}: fallback`);
    assert.ok(reader.reason.length > 20, `${type}: an unreadable file must explain itself`);
    // An honest reason never blames the learner's permissions for a limitation
    // of OUR pipeline — that is the sentence that made this bug unfixable.
    assert.doesNotMatch(reader.reason, /subscription|upgrade|purchase|pay/i, `${type}: reason must not be a paywall`);
  }
});

test("an unknown type degrades to the safest row, never to a crash", () => {
  const reader = aiReaderFor("not-a-real-type");
  assert.equal(reader.fallback, "metadata");
  assert.equal(reader.hasReadPath, false);
  assert.ok(reader.reason.length > 0);
  assert.equal(aiReadPlan({ type: "not-a-real-type", url: "https://example.com/x.bin" }).kind, "none");
  assert.equal(aiReadPlan(null).kind, "none");
  assert.equal(aiReadPlan({}).kind, "none");
});

test("the personal library's types are a subset of the registry", () => {
  for (const type of ALL_PERSONAL_COURSE_TYPES) {
    assert.ok(AI_FILE_TYPES.includes(type), `${type} exists in My Modules but has no reader row`);
  }
});

/* ------------------------------------------------------------------ */
/* Read paths: text the AI may actually ground an answer in           */
/* ------------------------------------------------------------------ */

test("PDF and e-book read from the file's own bytes (direct link or Drive)", () => {
  const direct = aiReadPlan({ type: "pdf", url: "https://cdn.example.com/notes/ch4.pdf" });
  assert.equal(direct.kind, "pdf-bytes");
  assert.equal(direct.url, "https://cdn.example.com/notes/ch4.pdf");

  const drive = aiReadPlan({ type: "pdf", url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view" });
  assert.equal(drive.kind, "pdf-bytes");
  assert.equal(drive.url, "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp");

  const ebook = aiReadPlan({ type: "ebook", url: "https://archive.org/download/book/book.pdf" });
  assert.equal(ebook.kind, "pdf-bytes");

  // Server-rendered pages are not a file: reading them would be scraping.
  assert.equal(aiReadPlan({ type: "pdf", url: "https://site.com/download.php?f=1" }).kind, "none");
});

test("Google Docs, Sheets and Slides read through Google's own export endpoint", () => {
  const doc = aiReadPlan({ type: "doc", url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit?usp=sharing" });
  assert.equal(doc.kind, "google-export");
  assert.equal(doc.url, "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/export?format=txt");

  const sheet = aiReadPlan({ type: "sheet", url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit" });
  assert.equal(sheet.format, "csv", "a sheet must come back as rows, not as a rendered page");

  const slides = aiReadPlan({ type: "slides", url: "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/embed" });
  assert.equal(slides.kind, "google-export");

  // A link that is not a Google file is reported as that, not as "unreadable type".
  const wrongHost = aiReadPlan({ type: "doc", url: "https://notes.example.com/lecture-4" });
  assert.equal(wrongHost.kind, "none");
  assert.match(wrongHost.reason, /isn't a Google file/i);
});

test("the extension, not the label, decides for plain-text links", () => {
  assert.equal(aiReadPlan({ type: "embed", url: "https://site.com/handout.md" }).kind, "text-file");
  assert.equal(aiReadPlan({ type: "doc", url: "https://site.com/a.txt" }).kind, "text-file", "not Google → a plain text file");
  assert.equal(aiReadPlan({ type: "sheet", url: "https://site.com/data.csv" }).kind, "text-file");
  assert.ok(AI_TEXT_EXTENSIONS.test("https://a/b/x.markdown"));
});

test("a missing link is a different fact from an unreadable type", () => {
  const noUrl = aiReadPlan({ type: "pdf", name: "Notes" });
  assert.equal(noUrl.kind, "none");
  assert.match(noUrl.reason, /no link to read/i);
  assert.doesNotMatch(noUrl.reason, /private|share/i, "must not invent a permission problem");

  const unreadableType = aiReadPlan({ type: "youtube", url: "https://youtu.be/aircAruvnVk" });
  assert.equal(unreadableType.kind, "none");
  assert.match(unreadableType.reason, /transcript/i, "and must name the thing that would fix it");
});

/* ------------------------------------------------------------------ */
/* Media: only ever through text somebody already wrote               */
/* ------------------------------------------------------------------ */

test("media becomes readable only through a transcript that is actually linked", () => {
  const bare = aiReadPlan({ type: "video", url: "https://cdn.example.com/lesson.mp4" });
  assert.equal(bare.kind, "none", "the app never watches a video");
  assert.match(bare.reason, /\.vtt|\.srt/i, "the reason must name the fix");

  const captioned = aiReadPlan({ type: "video", url: "https://cdn.example.com/lesson.mp4", captionsUrl: "https://cdn.example.com/lesson.vtt" });
  assert.equal(captioned.kind, "caption-file");
  assert.equal(captioned.url, "https://cdn.example.com/lesson.vtt");

  const youtubeTranscript = aiReadPlan({ type: "youtube", url: "https://youtu.be/aircAruvnVk", transcriptUrl: "https://files.example.com/lecs.srt" });
  assert.equal(youtubeTranscript.kind, "caption-file");

  const pasted = aiReadPlan({ type: "audio", transcriptText: "We begin with Faraday's law, then the negative sign, then two worked examples." });
  assert.equal(pasted.kind, "in-document", "a transcript written into the resource needs no network at all");

  assert.ok(AI_MEDIA_EXTENSIONS.test("https://a/b.mp4"));
  assert.ok(AI_CAPTION_EXTENSIONS.test("https://a/b.vtt"));
});

test("WebVTT and SRT cues parse into prose with their timestamps", () => {
  const vtt = `WEBVTT -extmin 1

NOTE this line must never reach the model
00:03.000 --> 00:07.000
<v Speaker>Faraday's law gives the <c.em>size</c.em> of the EMF.

00:07.500 --> 00:11.000
Lenz's law gives the direction.
`;
  const parsed = parseCaptionText(vtt);
  assert.equal(parsed.cues, 2);
  assert.match(parsed.text, /\[0:03\] Faraday's law gives the size of the EMF\./);
  assert.match(parsed.text, /\[0:07\] Lenz's law gives the direction\./);
  assert.doesNotMatch(parsed.text, /NOTE|-->/, "container noise never reaches the model");
  assert.equal(parsed.durationSeconds, 11);

  const srt = parseCaptionText(`1
00:00:01,000 --> 00:00:05,000
Hello class, today is induction.

2
00:00:05,000 --> 00:00:09,000
 flux change drives the current
`);
  assert.equal(srt.cues, 2);
  assert.match(srt.text, /Hello class, today is induction\./);

  assert.deepEqual(parseCaptionText(""), { text: "", cues: 0, durationSeconds: 0 });
  assert.equal(parseCaptionText("WEBVTT\n\njust prose, no cues").cues, 0, "a file with no cues yields nothing, never a guess");
});

/* ------------------------------------------------------------------ */
/* Payload: content that already lives inside the resource document    */
/* ------------------------------------------------------------------ */

test("a Brain practice set reads from its own questions — no URL needed", () => {
  const plan = aiReadPlan({
    type: "brain",
    practiceQuestions: [
      { id: "q1", prompt: "What does Lenz's law give you?", options: ["Magnitude", "Direction", "Nothing"], correctIndex: 1, explanation: "It fixes the direction of the induced current.", difficulty: "easy", topic: "Lenz" },
      { id: "q2", prompt: "State Faraday's law.", options: [], correctIndex: -1, explanation: "", difficulty: "medium", topic: "Faraday" },
    ],
  });
  assert.equal(plan.kind, "in-document");
  const text = aiPayloadText({ type: "brain", practiceQuestions: [{ prompt: "Q1?", options: ["a", "b"], correctIndex: 0, explanation: "because", topic: "T", difficulty: "easy" }] });
  assert.match(text, /Q1\?/);
  assert.match(text, /Correct: a/);
  assert.match(text, /Why: because/);
  assert.match(text, /Topic: T/);
  assert.equal(aiPayloadText({ type: "brain", practiceQuestions: [] }), "");
  assert.match(aiReaderFor("brain").reason, /no questions imported yet/i);
});

test("practiceSetToText skips malformed rows and caps the set", () => {
  const text = practiceSetToText([{ prompt: "   " }, { prompt: "Real question" }, null, undefined]);
  assert.equal(text, "Q2. Real question");
  const many = practiceSetToText(Array.from({ length: 300 }, (_, index) => ({ prompt: `Q${index}` })));
  assert.equal(many.split("\n\n").length, 120);
});

test("a learner's own mind map is readable text, an embedded one is not", () => {
  const flat = mindMapToText({
    rootTopic: "Induction",
    nodes: [
      { id: "1", parent: "", topic: "Flux" },
      { id: "2", parent: "1", topic: "BA cos θ" },
      { id: "3", parent: "", topic: "Faraday" },
    ],
  });
  assert.match(flat, /Central idea: Induction/);
  assert.match(flat, /- Flux/);
  assert.match(flat, /  - BA cos θ/, "child rows stay indented under their parent");
  assert.equal(aiReadPlan({ type: "mindmap", mind: { nodes: [{ id: "1", parent: "", topic: "Alpha" }, { id: "2", parent: "1", topic: "Beta branch text" }] } }).kind, "in-document");
  // A Whimsical map behind an iframe has no readable structure at all.
  const embedOnly = aiReadPlan({ type: "mindmap", url: "https://whimsical.com/abc-123" });
  assert.equal(embedOnly.kind, "none");
  assert.match(embedOnly.reason, /screenshot/i);
});

test("nested (imported) mind maps flatten too, and depth is bounded", () => {
  let node = { topic: "root", children: [] };
  const root = node;
  for (let index = 0; index < 30; index += 1) {
    const child = { topic: `level-${index}`, children: [] };
    node.children.push(child);
    node = child;
  }
  const text = mindMapToText(root);
  assert.match(text, /- root/);
  assert.ok(text.split("\n").length <= 13, "a runaway tree must not flood the prompt");
});

test("payload text never invents content from an empty description", () => {
  assert.equal(aiPayloadText({ type: "pdf", description: "short" }), "", "a description is metadata, not content");
  assert.equal(aiPayloadText({ type: "pdf", transcriptText: "too short" }), "", "sub-threshold text is not a transcript");
  assert.equal(aiCaptionUrl({ type: "video", url: "https://a/b.mp4" }), "");
  assert.equal(aiCaptionUrl({ type: "video", url: "https://a/b.vtt" }), "https://a/b.vtt", "a .vtt saved as the resource IS a transcript");
});

/* ------------------------------------------------------------------ */
/* What must never be read                                            */
/* ------------------------------------------------------------------ */

test("forms, embeds and images stay unreadable — and say why, without scraping", () => {
  assert.equal(aiReaderFor("google_form").hasReadPath, false);
  assert.match(aiReaderReason("google_form"), /owner/i);
  assert.equal(aiReaderFor("embed").hasReadPath, false);
  assert.match(aiReaderReason("embed"), /never scraped/i);
  assert.equal(aiReaderFor("image").hasReadPath, false);
  // …but all three are visible to the learner, so a capture is a real path.
  assert.equal(aiCapabilitiesFor("image").fallback, "screenshot");
  assert.equal(aiCapabilitiesFor("embed").fallback, "screenshot");
  assert.equal(aiCapabilitiesFor("audio").fallback, "metadata", "an audio player has nothing to screenshot");
});

test("google id extraction is shared, not duplicated per surface", () => {
  assert.equal(googleFileIdFromUrl("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/copy"), "1AbCdEfGhIjKlMnOp");
  assert.equal(googleFileIdFromUrl("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp"), "1AbCdEfGhIjKlMnOp");
  assert.equal(googleFileIdFromUrl("https://example.com/document/d/1AbCdEfGhIjKlMnOp"), "", "only Google hosts are Google files");
  assert.equal(googleFileIdFromUrl("not a url"), "");
  assert.equal(isGoogleFileUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit"), true);
});

/* ------------------------------------------------------------------ */
/* One table, three consumers                                         */
/* ------------------------------------------------------------------ */

test("the server's read plan IS the registry's plan", () => {
  for (const resource of [
    { type: "pdf", url: "https://a/b.pdf" },
    { type: "doc", url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit" },
    { type: "sheet", url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit" },
    { type: "slides", url: "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/edit" },
    { type: "youtube", url: "https://youtu.be/aircAruvnVk" },
    { type: "embed", url: "https://codepen.io/pen" },
    { type: "brain", practiceQuestions: [{ prompt: "Explain flux in one line so the payload clears its own floor." }] },
  ]) {
    const registry = aiReadPlan(resource);
    const server = personalAiReadPlan(resource);
    assert.deepEqual(server, { kind: registry.kind, url: registry.url, format: registry.format, reason: registry.reason }, resource.type);
  }
});

test("the honesty table is derived, so it cannot claim or deny on its own", () => {
  for (const type of AI_FILE_TYPES) {
    const availability = personalAiAvailability(type);
    const reader = aiReaderFor(type);
    assert.equal(availability.readable, reader.hasReadPath, type);
    assert.equal(availability.via, reader.via, type);
    assert.equal(availability.reason, reader.reason, type);
    assert.equal(availability.label, reader.label, type);
    assert.equal(availability.screenshotSupported, reader.fallback === "screenshot" && reader.visual, type);
    // The stale copy this replaced, kept out forever.
    assert.doesNotMatch(availability.reason, /isn't supported yet/i, type);
  }
  // Readable kinds: real pipelines. Unreadable kinds: honest refusals.
  for (const type of ["pdf", "doc", "sheet", "slides", "ebook", "mindmap", "brain"]) {
    assert.equal(aiTypeHasReadPath(type), true, type);
  }
  for (const type of ["youtube", "video", "audio", "image", "google_form", "embed"]) {
    assert.equal(aiTypeHasReadPath(type), false, type);
  }
});

test("every row is frozen — no surface can rewrite the table at runtime", () => {
  assert.ok(Object.isFrozen(AI_FILE_READERS));
  assert.ok(Object.isFrozen(AI_FILE_TYPES));
  assert.ok(Object.isFrozen(AI_READ_KINDS));
});
