// utils/aiFileReaders.js
//
// THE per-file-type reader registry for every AI surface in the app.
//
// Before this file existed, "what can the AI read?" was answered in three
// places that had silently drifted apart:
//
//   · utils/personalCourse.js  → personalAiAvailability()  (told the UI that
//     PDF/e-book reading "isn't supported yet" even though the server had
//     supported it for weeks, and had NO case at all for doc/sheet/slides/brain,
//     so those fell through to "Content isn't readable by the AI assistant yet.")
//   · utils/personalAi.js      → personalAiReadPlan()      (the real decision).
//   · src/lumen/course/adapters.ts (the chat's per-type prose + fallbacks).
//
// One question, three answers, and the learner sees the wrong one: an AI that
// refuses to read a module it has full access to. This module is now the ONLY
// place that decides it. `personalAiReadPlan`, `personalAiAvailability` and the
// chat adapters all derive from here, so they can no longer disagree.
//
// Rules this registry encodes:
//
//   1. Text is read through a *legitimate* path only — the file's own bytes,
//      Google's own export endpoint, a caption/transcript file, or text the
//      course owner/learner already stored in the resource document.
//   2. Nothing is ever scraped from a cross-origin iframe, a private Drive
//      file, or a Form's responses. Those report an honest reason instead.
//   3. `readable` at TYPE level means "a real pipeline exists for this kind of
//      file". Whether THIS file was read is decided per resource by
//      `personalAiState()` from the extraction outcome — the type table must
//      never be used to claim a specific file was read.
//   4. Every type carries a learner-facing `reason`, so an unreadable file
//      explains itself instead of sounding like a permission problem.
//
// Pure: no network, no Firestore, no React. Imported by the browser bundle,
// the Vercel functions and `node --test`.

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * Every resource type the Course Player can hold, in canonical order.
 * `brain` is the 13th: it has no URL at all — its content is the practice
 * questions stored inside its own document, which is the easiest read there is.
 */
export const AI_FILE_TYPES = Object.freeze([
  "youtube",
  "video",
  "audio",
  "pdf",
  "doc",
  "sheet",
  "slides",
  "ebook",
  "image",
  "google_form",
  "embed",
  "mindmap",
  "brain",
]);

/** Labels used in every learner-facing sentence about a file. */
export const AI_FILE_LABELS = Object.freeze({
  youtube: "YouTube video",
  video: "video",
  audio: "recording",
  pdf: "PDF",
  doc: "Google Doc",
  sheet: "Google Sheet",
  slides: "Google Slides deck",
  ebook: "e-book",
  image: "image",
  google_form: "form",
  embed: "embedded page",
  mindmap: "mind map",
  brain: "practice set",
});

/**
 * How the extractor turns one file into text.
 *
 *   google-export — ask Google's own `export?format=…` endpoint for the file.
 *   pdf-bytes     — download the PDF and pull text out of its content streams.
 *   caption-file  — download a WebVTT/SRT transcript and read its cues.
 *   text-file     — download a plain-text/markdown/html file and strip tags.
 *   in-document   — the readable text is ALREADY inside the resource document
 *                   (practice questions, a transcript the owner pasted, the
 *                   learner's own mind-map topics). No network, ever.
 *   none          — no legitimate read path exists for this file.
 */
export const AI_READ_KINDS = Object.freeze([
  "google-export",
  "pdf-bytes",
  "caption-file",
  "text-file",
  "in-document",
  "none",
]);

/** `fallback` — what the assistant can still offer for an unreadable file. */
export const AI_FALLBACKS = Object.freeze(["screenshot", "metadata", "none"]);

/* ------------------------------------------------------------------ */
/* The registry                                                        */
/* ------------------------------------------------------------------ */

const entry = (type, over = {}) => ({
  type,
  label: AI_FILE_LABELS[type] || type,
  /** How a file of this type is normally read. `none` = no link-based read. */
  via: "none",
  /** A sidecar caption/transcript URL makes this type readable. */
  captions: false,
  /** Text may already live inside the resource document itself. */
  payload: false,
  /**
   * True when a real pipeline exists for this kind of file. Per-file truth
   * still comes from the extraction outcome; see rule 3 at the top.
   */
  hasReadPath: false,
  /** The learner can see it, so a screenshot is a legitimate way to help. */
  visual: false,
  /** What the assistant falls back to when nothing was read. */
  fallback: "metadata",
  /** Honest learner-facing explanation, used verbatim. Never a permission claim. */
  reason: "",
  ...over,
});

export const AI_FILE_READERS = Object.freeze({
  youtube: entry("youtube", {
    via: "none",
    captions: true,
    payload: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "I can't watch a YouTube video, so without its transcript I only know the title. Ask for the transcript to be attached, or send a screenshot of the part you mean.",
  }),
  video: entry("video", {
    via: "none",
    captions: true,
    payload: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "I can't watch a video file. If this lesson has a .vtt or .srt caption file, link it and I'll read every line of it — otherwise a screenshot works.",
  }),
  audio: entry("audio", {
    via: "none",
    captions: true,
    payload: true,
    fallback: "metadata",
    reason:
      "There's no transcript for this recording, so I can't tell you what was said in it. A transcript link or a summary of the part you mean is enough to start.",
  }),
  pdf: entry("pdf", {
    via: "pdf-bytes",
    payload: true,
    hasReadPath: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "I couldn't read text out of this PDF. It is either private (share it so anyone with the link can open it) or a scan with no selectable text — a screenshot of the page still works.",
  }),
  doc: entry("doc", {
    via: "google-export",
    payload: true,
    hasReadPath: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "This Google Doc isn't shared publicly, so I can't read its text. Set it to \"anyone with the link\" and I'll read it in full.",
  }),
  sheet: entry("sheet", {
    via: "google-export",
    payload: true,
    hasReadPath: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "This Google Sheet isn't shared publicly, so I can't read its rows. Set it to \"anyone with the link\" and I'll read the whole table.",
  }),
  slides: entry("slides", {
    via: "google-export",
    payload: true,
    hasReadPath: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "This Slides deck isn't shared publicly, so I can't read the slides. Set it to \"anyone with the link\" — or screenshot the slide you mean.",
  }),
  ebook: entry("ebook", {
    via: "pdf-bytes",
    payload: true,
    hasReadPath: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "I couldn't read text out of this e-book. PDFs are read directly; an EPUB behind a login or a scan isn't — a screenshot of the passage works.",
  }),
  image: entry("image", {
    via: "none",
    payload: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "I can't see the contents of this image — the app has no text-recognition path for it yet. Capture the area you mean and I'll work from what you send.",
  }),
  google_form: entry("google_form", {
    via: "none",
    payload: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "A form's questions and responses belong to its owner, so they are never read from here. Screenshot the exact question and I'll help with that one.",
  }),
  embed: entry("embed", {
    via: "none",
    payload: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "This is an embedded third-party page, so only its title is visible to me — its contents are never scraped. A screenshot of the part you mean lets me help properly.",
  }),
  mindmap: entry("mindmap", {
    via: "in-document",
    payload: true,
    hasReadPath: true,
    visual: true,
    fallback: "screenshot",
    reason:
      "This mind map's branches aren't stored where I can read them, so I can only use its title. A screenshot of the branch you mean works.",
  }),
  brain: entry("brain", {
    via: "in-document",
    payload: true,
    hasReadPath: true,
    visual: false,
    fallback: "metadata",
    reason:
      "This practice set has no questions imported yet, so there is nothing for me to read in it.",
  }),
});

/**
 * Unknown / future types land on the safest row: title + screenshot only.
 *
 * The row is still complete — a label and a reason are mandatory, because an
 * empty reason is what lets a UI fall back to "I don't have access" for a file
 * type it simply has never heard of. A type added on the server therefore stays
 * explainable here until someone writes its row.
 */
export const UNKNOWN_AI_FILE_REASON =
  "This kind of file has no reading path in the app yet, so the assistant can only use its title.";

export const aiReaderFor = (type) => {
  const key = String(type || "").trim();
  const known = AI_FILE_READERS[key];
  if (known) return known;
  return entry("embed", { type: key || "unknown", label: "file", reason: UNKNOWN_AI_FILE_REASON, fallback: "metadata" });
};

export const aiReaderLabel = (type) => aiReaderFor(type).label;

export const aiReaderReason = (type) => aiReaderFor(type).reason;

/** True when a pipeline of some kind exists for this file type. */
export const aiTypeHasReadPath = (type) => aiReaderFor(type).hasReadPath;

/* ------------------------------------------------------------------ */
/* URLs the registry recognises                                        */
/* ------------------------------------------------------------------ */

const asRecord = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);

const GOOGLE_ID_BY_HOST = [
  [/^docs\.google\.com$/i, "doc"],
  [/^drive\.google\.com$/i, "drive"],
  [/^sheets\.google\.com$/i, "sheet"],
  [/^slides\.google\.com$/i, "slides"],
];

/** Google path per file type — the export endpoint shape. */
const GOOGLE_EXPORT_BY_TYPE = {
  doc: { family: "document", format: "txt" },
  sheet: { family: "spreadsheets", format: "csv" },
  slides: { family: "presentation", format: "txt" },
};

/** Pull the Google file id out of any of the canonical URL shapes. */
export const googleFileIdFromUrl = (rawUrl) => {
  const url = String(rawUrl || "").trim();
  if (!url) return "";
  let parsed = null;
  try { parsed = new URL(url); } catch { return ""; }
  const host = parsed.hostname.replace(/^www\./i, "");
  const known = GOOGLE_ID_BY_HOST.find(([pattern]) => pattern.test(host));
  if (!known) return "";
  // /document/d/{id}/edit · /file/d/{id}/view · /spreadsheets/d/{id} · /open?id={id}
  const pathMatch = parsed.pathname.match(/\/(?:document|file|spreadsheets|slides|presentation|forms)?\/?d\/([a-zA-Z0-9_-]{10,})/);
  if (pathMatch) return pathMatch[1];
  const explicit = parsed.searchParams.get("id") || parsed.searchParams.get("fileId");
  return explicit && /^[a-zA-Z0-9_-]{10,}$/.test(explicit) ? explicit : "";
};

/** Any host that is a Google Docs-family host (used by the extractor's hints). */
export const isGoogleFileUrl = (rawUrl) => Boolean(googleFileIdFromUrl(rawUrl));

/** Links that are plain prose — the extension, not the label, decides. */
export const AI_TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|html?|xml|json|log|rtf)$/i;

/** Caption/transcript containers. */
export const AI_CAPTION_EXTENSIONS = /\.(vtt|srt|subrip|webvtt)$/i;

/** Direct-media links, recognised so a caption plan never guesses at them. */
export const AI_MEDIA_EXTENSIONS = /\.(mp4|m4v|webm|mov|mkv|mp3|m4a|aac|ogg|oga|wav|opus)$/i;

const extensionOf = (rawUrl) => {
  const clean = String(rawUrl || "").trim().split("#")[0].split("?")[0];
  const match = clean.match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toLowerCase() : "";
};

/** Fields a course owner or the admin import may use to hand us text directly. */
const PAYLOAD_TEXT_FIELDS = ["transcriptText", "transcript", "captionsText", "captionText", "aiText", "contentText", "bodyText"];
const PAYLOAD_URL_FIELDS = ["transcriptUrl", "captionsUrl", "captionUrl", "subtitleUrl", "vttUrl", "srtUrl"];

/** Dynamic drive download link for a public PDF (no API key, no scrape). */
const driveDownloadUrl = (fileId) => `https://drive.google.com/uc?export=download&id=${fileId}`;

/* ------------------------------------------------------------------ */
/* Readable text that already lives inside the resource document       */
/* ------------------------------------------------------------------ */

/**
 * Flatten a `brain` practice set into the text the AI may ground in.
 *
 * The questions ARE the lesson content — imported by the admin, stored on the
 * resource itself. Reading them costs nothing and needs no permission, which
 * is why a `brain` resource is the one type that is always readable when it has
 * questions. Answer keys and explanations are included on purpose: the tutor
 * is asked to teach from the set, and the learner already owns it.
 */
export const practiceSetToText = (questions) =>
  asArray(questions)
    .slice(0, 120)
    .map((raw, index) => {
      const question = asRecord(raw);
      const options = asArray(question.options).map((option) => String(option ?? "").trim()).filter(Boolean);
      const correctIndex = Number(question.correctIndex);
      const prompt = String(question.prompt ?? question.question ?? "").replace(/\s+/g, " ").trim();
      if (!prompt) return "";
      const lines = [`Q${index + 1}. ${prompt}`];
      if (options.length) lines.push(`Options: ${options.join(" | ")}`);
      if (Number.isInteger(correctIndex) && correctIndex >= 0 && options.length > correctIndex) {
        lines.push(`Correct: ${String(options[correctIndex]).trim()}`);
      }
      const explanation = String(question.explanation ?? "").replace(/\s+/g, " ").trim();
      if (explanation) lines.push(`Why: ${explanation}`);
      const topic = String(question.topic ?? "").replace(/\s+/g, " ").trim();
      const difficulty = String(question.difficulty ?? "").replace(/\s+/g, " ").trim();
      const meta = [topic && `Topic: ${topic}`, difficulty && `Difficulty: ${difficulty}`].filter(Boolean).join(" · ");
      if (meta) lines.push(meta);
      return lines.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

/**
 * Flatten a mind map into a readable branch list.
 *
 * Accepts both shapes the app already produces: the flat
 * `{ root, nodes: [{ id, parent, topic }] }` the Course Player edits, and the
 * nested `{ topic, children: [...] }` shape an imported map carries. Nothing is
 * invented — a map with no topics contributes nothing.
 */
export const mindMapToText = (mind) => {
  const tree = asRecord(mind);
  const out = [];

  const flatNodes = asArray(tree.nodes);
  if (flatNodes.length) {
    const byParent = new Map();
    for (const raw of flatNodes) {
      const node = asRecord(raw);
      const parent = String(node.parent ?? node.parentId ?? "") || "__root__";
      const list = byParent.get(parent) || [];
      list.push(node);
      byParent.set(parent, list);
    }
    const walk = (parentId, depth) => {
      if (depth > 12 || out.length > 400) return;
      for (const node of byParent.get(parentId) || []) {
        const topic = String(node.topic ?? node.label ?? node.text ?? "").replace(/\s+/g, " ").trim();
        if (topic) out.push(`${"  ".repeat(depth)}- ${topic}`);
        walk(String(node.id ?? ""), depth + 1);
      }
    };
    const rootTopic = String(tree.rootTopic ?? tree.title ?? "").replace(/\s+/g, " ").trim();
    if (rootTopic) out.push(`Central idea: ${rootTopic}`);
    walk("__root__", 0);
    return out.join("\n");
  }

  const walkNested = (node, depth) => {
    if (out.length > 400 || depth > 12) return;
    const row = asRecord(node);
    const topic = String(row.topic ?? row.label ?? row.text ?? row.name ?? "").replace(/\s+/g, " ").trim();
    if (topic) out.push(`${"  ".repeat(depth)}- ${topic}`);
    for (const child of asArray(row.children)) walkNested(child, depth + 1);
  };
  walkNested(tree, 0);
  return out.join("\n");
};

/**
 * The readable text a resource document already carries, or "".
 *
 * Checked in order of trustworthiness: an owner-supplied transcript, then the
 * type's own structured payload (practice questions / mind-map branches), then a
 * generic `text` field. Every one of these is content the learner already owns
 * on their own device or in their own Firestore document — nothing is fetched.
 */
export const aiPayloadText = (resource) => {
  const row = asRecord(resource);
  const type = String(row.type || "").trim();

  for (const field of PAYLOAD_TEXT_FIELDS) {
    const value = String(row[field] ?? "").replace(/\s+/g, " ").trim();
    if (value.length >= 40) return value;
  }

  if (type === "brain") {
    const questions = row.practiceQuestions ?? row.questions ?? asRecord(row.payload).practiceQuestions;
    const text = practiceSetToText(questions);
    if (text.trim().length >= 20) return text.trim();
    return "";
  }

  if (type === "mindmap") {
    const mind = row.mind ?? row.mindMap ?? row.tree ?? asRecord(row.metadata).mind;
    const text = mindMapToText(mind);
    if (text.trim().length >= 2) return text.trim();
  }

  const generic = String(row.text ?? "").replace(/\s+/g, " ").trim();
  return generic.length >= 40 ? generic : "";
};

/** A caption/transcript URL the owner linked, if any. */
export const aiCaptionUrl = (resource) => {
  const row = asRecord(resource);
  for (const field of PAYLOAD_URL_FIELDS) {
    const value = String(row[field] ?? "").trim();
    if (value) return value;
  }
  // A "resource" whose own link IS a caption file (owners upload .vtt as a file).
  const primary = String(row.url || row.sourceUrl || row.embedUrl || "").trim();
  if (primary && AI_CAPTION_EXTENSIONS.test(primary.split("?")[0])) return primary;
  return "";
};

/* ------------------------------------------------------------------ */
/* The decision                                                        */
/* ------------------------------------------------------------------ */

/**
 * Decide how ONE file should be read. Returns
 * `{ kind, url, format, reason, via }`, where `kind` is one of AI_READ_KINDS.
 *
 * Priority matters:
 *   1. `in-document` — the text is already here; never spend a network call
 *      (or a permission problem) on content we already hold.
 *   2. `caption-file` — an explicit transcript link, for any type.
 *   3. the type's own path (Google export / PDF bytes).
 *   4. extension fallback — a link ending in .txt/.md/.html is text whatever
 *      the label says, and a `.vtt`/`.srt` is a transcript.
 *   5. `none` + the registry's honest reason for that type.
 *
 * `noUrl` is reported separately from `unsupported` so "the admin never
 * attached a link" and "this kind of file can't be read" don't become the same
 * message — a distinction the learner needs in order to fix anything.
 */
export const aiReadPlan = (resource) => {
  const row = asRecord(resource);
  const type = String(row.type || "").trim();
  const reader = aiReaderFor(type);
  const url = String(row.url || row.sourceUrl || row.embedUrl || "").trim();
  const none = (reason) => ({ kind: "none", url: "", format: "", reason: reason || reader.reason, via: reader.via });

  const payload = aiPayloadText(row);
  if (payload) return { kind: "in-document", url, format: "text", reason: "", via: reader.via };

  const captionUrl = aiCaptionUrl(row);
  if (captionUrl) {
    return { kind: "caption-file", url: captionUrl, format: "vtt", reason: "", via: reader.via };
  }

  // No payload and no link: the file is empty to us. That is a different fact
  // from "this kind of file can't be read", so it gets its own sentence — and
  // for a type whose content lives in the document (a practice set, an in-app
  // map) "no link" is not even the point: the honest fact is that nothing has
  // been written into it yet.
  if (!url) return none(reader.via === "in-document" ? reader.reason : "This resource has no link to read.");

  const path = url.split("?")[0];
  const fileId = googleFileIdFromUrl(url);

  // Google first, and from any scheme: when we hold a file id we ask Google's
  // OWN endpoint over https, so a link the owner pasted as `http://docs…` or a
  // bare Drive /file/d/… view link is still readable. Refusing it because of how
  // the label was typed is the kind of pedantry that costs a learner an answer.
  const googleExport = GOOGLE_EXPORT_BY_TYPE[type];
  if (googleExport && fileId) {
    return {
      kind: "google-export",
      url: `https://docs.google.com/${googleExport.family}/d/${fileId}/export?format=${googleExport.format}`,
      format: googleExport.format,
      reason: "",
      via: reader.via,
    };
  }
  if ((type === "pdf" || type === "ebook") && fileId) {
    return { kind: "pdf-bytes", url: driveDownloadUrl(fileId), format: "pdf", reason: "", via: reader.via };
  }

  // Anything else is fetched at the link the course gave us, and this app only
  // ever reads public https. Two distinct facts, two distinct sentences —
  // "not a web address" and "not on https" are fixed differently.
  if (!/^https?:\/\//i.test(url)) {
    return none("That link isn't a web address the app can open, so there was nothing to read from it.");
  }
  if (/^http:\/\//i.test(url)) {
    return none("This link isn't on https, so the app won't open it. Publish it behind https and I can read it.");
  }

  // A link that IS a text or caption document is read as one, whatever the
  // resource is labelled — an ".md" attached under "Google Doc" is still
  // markdown, and calling that unreadable is how a learner ends up being told
  // the assistant cannot see content sitting in plain view.
  if (AI_CAPTION_EXTENSIONS.test(path)) return { kind: "caption-file", url, format: "vtt", reason: "", via: reader.via };
  if (AI_TEXT_EXTENSIONS.test(path)) return { kind: "text-file", url, format: "text", reason: "", via: reader.via };

  if (googleExport) {
    // A "Google Doc" that is not a Google file: a deck or handout published as a
    // PDF under a Google label is common in this app, and the bytes win.
    if (/\.pdf$/i.test(path)) return { kind: "pdf-bytes", url, format: "pdf", reason: "", via: reader.via };
    return none(`This ${reader.label} link isn't a Google file I can open, so there's nothing for me to read from it.`);
  }

  if (type === "pdf" || type === "ebook") {
    if (!/\.(php|aspx?|jsp|do|cfm)(\?|$)/i.test(url)) {
      return { kind: "pdf-bytes", url, format: "pdf", reason: "", via: reader.via };
    }
    return none(reader.reason);
  }

  if (reader.via === "text-file") return { kind: "text-file", url, format: "text", reason: "", via: reader.via };

  // A media file itself is never a read path — say so in the type's own words,
  // which name the one thing that would change the answer (a transcript).
  if (AI_MEDIA_EXTENSIONS.test(path)) return none(reader.reason);
  return none();
};

/* ------------------------------------------------------------------ */
/* Caption parsing (WebVTT + SRT)                                      */
/* ------------------------------------------------------------------ */

const timeToSeconds = (value) => {
  const parts = String(value || "").trim().split(":").map((part) => Number(part.replace(",", ".")));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number.isFinite(parts[0]) ? parts[0] : 0;
};

const CUE_TIME_LINE = /^\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*-->/;

const secondsToClock = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * Turn WebVTT/SRT bytes into plain prose with a timestamp per cue.
 *
 * Tags (`<c.xxx>`, `<v Speaker>`), NOTE blocks, styling headers and the
 * `WEBVTT -ex params` line are dropped; cue numbering is dropped too. What
 * remains is exactly what was said, in order, with the moment it started — so
 * the tutor can answer "what did they say at 4:10" without owning a player.
 */
export const parseCaptionText = (raw) => {
  const source = String(raw || "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return { text: "", cues: 0, durationSeconds: 0 };
  const blocks = source.split(/\n{2,}/);
  const cues = [];
  let lastEnd = 0;
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const timeIndex = lines.findIndex((line) => CUE_TIME_LINE.test(line));
    if (timeIndex < 0) continue; // header / NOTE / comment block
    const [from, to] = String(lines[timeIndex]).split("-->");
    const start = timeToSeconds((from || "").trim());
    const end = timeToSeconds((to || "").trim());
    lastEnd = Math.max(lastEnd, end);
    const body = lines
      .slice(timeIndex + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!body) continue;
    cues.push({ startTime: start, endTime: end, text: body });
  }
  if (!cues.length) return { text: "", cues: 0, durationSeconds: 0 };
  const text = cues
    .slice(0, 2000)
    .map((cue, index) => (index === 0 ? `[${secondsToClock(cue.startTime)}] ${cue.text}` : `[${secondsToClock(cue.startTime)}] ${cue.text}`))
    .join("\n");
  return { text, cues: cues.length, durationSeconds: lastEnd };
};

/* ------------------------------------------------------------------ */
/* Capability vocabulary (shared with the chat adapters)               */
/* ------------------------------------------------------------------ */

/**
 * One row per type for the chat's thinking trace and availability chips.
 * Derived from the registry so the player and the server describe a file the
 * same way — the drift at the top of this file is what this exists to stop.
 */
export const aiCapabilitiesFor = (type) => {
  const reader = aiReaderFor(type);
  const links = reader.via !== "none";
  return {
    label: reader.label,
    text: links || reader.payload,
    metadata: true,
    position: reader.captions || reader.via === "pdf-bytes" || type === "slides",
    pages: reader.via === "pdf-bytes",
    slides: type === "slides",
    transcript: reader.captions,
    searchableChunks: links || reader.payload,
    visual: reader.visual,
    original: reader.via !== "none",
    serverAnalyzable: reader.hasReadPath,
    fallback: reader.fallback,
  };
};
