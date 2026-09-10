// Shared pure layer for the Personal Module AI Study Engine (Part 2).
//
// One dependency-free module (Node-testable, browser-safe, server-safe) that
// is the single source of truth for:
//
//   · honest per-resource AI availability states (ready / partial /
//     processing / unavailable / permission_required / unsupported) — the
//     reasons for "no read path at all" are DELEGATED to the existing
//     `personalAiAvailability` table in utils/personalCourse.js so there is
//     never a second, drifting honesty table;
//   · the read plan (what the server extractor should try for a resource);
//   · building the grounding corpus (text units) from a module snapshot +
//     learner notes + extracted text, with provenance for every unit;
//   · chunking + deterministic keyword retrieval, so a small question never
//     ships the whole module to the model;
//   · every prompt the engine sends (ask / summary / questions / flashcards /
//     explain-again / study-plan / study-mode orientation);
//   · strict normalisation of model output into artifacts;
//   · artifact reuse (content-hash + TTL) so a summary is not regenerated
//     while the module content is unchanged;
//   · weak-topic evidence aggregation;
//   · user-facing failure copy + retryability for every AI error code.
//
// Nothing here touches the network, Firestore or React.

import { personalAiAvailability, personalCourseTypeLabel } from "./personalCourse.js";

/* ------------------------------------------------------------------ */
/* Constants + limits                                                  */
/* ------------------------------------------------------------------ */

/** Availability vocabulary shared by the extractor, the API and the UI. */
export const PERSONAL_AI_STATES = [
  "ready",
  "partial",
  "processing",
  "unavailable",
  "permission_required",
  "unsupported",
];

/** True when a state means the AI may ground an answer in that resource. */
export const PERSONAL_AI_READABLE_STATES = ["ready", "partial"];

/** What the server extractor should attempt for a resource. */
export const PERSONAL_AI_READ_KINDS = ["google-export", "pdf", "text", "none"];

/** Extraction outcomes reported by the server content service. */
export const PERSONAL_AI_OUTCOMES = ["ok", "empty", "invalid", "permission", "error", "skipped", "pending", "unsupported"];

/** Grounding corpus caps — keep every request small and predictable. */
export const PERSONAL_AI_MAX_CONTEXT_CHARS = 18000;
export const PERSONAL_AI_MAX_CHUNK_CHARS = 1600;
export const PERSONAL_AI_MAX_CHUNKS = 12;
/** Per-resource extracted text kept in the content cache / corpus. */
export const PERSONAL_AI_MAX_RESOURCE_CHARS = 40000;
/** Learner-authored text (description / notes) kept per resource. */
export const PERSONAL_AI_MAX_AUTHORED_CHARS = 4000;
export const PERSONAL_AI_MAX_UNITS = 120;

/** Generation caps. */
export const PERSONAL_AI_QUESTION_MIN = 1;
export const PERSONAL_AI_QUESTION_MAX = 20;
export const PERSONAL_AI_QUESTION_DEFAULT = 10;
export const PERSONAL_AI_FLASHCARD_MIN = 1;
export const PERSONAL_AI_FLASHCARD_MAX = 30;
export const PERSONAL_AI_FLASHCARD_DEFAULT = 12;
export const PERSONAL_AI_PLAN_DAY_MIN = 1;
export const PERSONAL_AI_PLAN_DAY_MAX = 14;
export const PERSONAL_AI_PLAN_DAY_DEFAULT = 5;
export const PERSONAL_AI_QUESTION_TYPES = ["mcq", "short", "boolean"];
export const PERSONAL_AI_EXPLAIN_MODES = ["simple", "steps", "example", "exam"];

/** Artifact kinds persisted under `users/{uid}/personalAi/artifacts`. */
export const PERSONAL_AI_ARTIFACT_TYPES = [
  "module-summary",
  "resource-summary",
  "questions",
  "flashcards",
  "study-plan",
  "orientation",
  "explanation",
  "answer",
];

/** Chat history trimming. */
export const PERSONAL_AI_MAX_HISTORY_MESSAGES = 8;
export const PERSONAL_AI_MAX_HISTORY_CHARS = 4000;
export const PERSONAL_AI_QUESTION_CHARS_MAX = 1200;

/** A summary/artifact stays reusable for this long if content is unchanged. */
export const PERSONAL_AI_ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Saved-for Later has no module document; it gets its own provenance root. */
export const PERSONAL_AI_SAVED_LABEL = "Saved for Later";
export const PERSONAL_AI_MODULE_ROOT_LABEL = "My Module";

/* ------------------------------------------------------------------ */
/* Small text helpers                                                  */
/* ------------------------------------------------------------------ */

const asRecord = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);

/** Collapse whitespace + trim, never returning anything but a string. */
export const cleanAiText = (value, max = 0) => {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return max > 0 ? text.slice(0, max) : text;
};

/** Strip markup so only prose reaches the model (and the UI). */
export const stripAiMarkup = (value, max = 0) => {
  let text = String(value == null ? "" : value);
  text = text
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return cleanAiText(text, max);
};

const clampInt = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
};

/** Deterministic 64-bit-ish string hash — same input, same output everywhere. */
export const personalAiHash = (value) => {
  const text = String(value == null ? "" : value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
    h2 = Math.imul(h2 + code + index, 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`.padStart(12, "0").slice(0, 16);
};

/* ------------------------------------------------------------------ */
/* Read plan — what the extractor should try                           */
/* ------------------------------------------------------------------ */

const GOOGLE_ID_BY_HOST = [
  [/^docs\.google\.com$/i, "doc"],
  [/^drive\.google\.com$/i, "drive"],
  [/^sheets\.google\.com$/i, "sheet"],
  [/^slides\.google\.com$/i, "slides"],
];

/** Pull the Google file id out of any of the canonical personal URL shapes. */
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

const TEXT_EXTENSION = /\.(txt|md|markdown|csv|tsv|html?|xml|json|log|rtf)$/i;

/**
 * Decide what the server extractor should attempt for one personal resource.
 * Returns `{ kind: "none", reason }` for every type with no read path — the
 * reason comes from the EXISTING honesty table so the copy never drifts.
 */
export const personalAiReadPlan = (resource) => {
  const row = asRecord(resource);
  const type = String(row.type || "").trim();
  const url = String(row.url || row.sourceUrl || "").trim();
  const legacy = personalAiAvailability(type);
  const noPlan = (reason) => ({ kind: "none", url: "", format: "", reason: reason || legacy.reason });

  if (!url) return noPlan("This resource has no link to read.");
  if (type === "doc") {
    const fileId = googleFileIdFromUrl(url);
    return fileId
      ? { kind: "google-export", url: `https://docs.google.com/document/d/${fileId}/export?format=txt`, format: "txt", reason: "" }
      : noPlan();
  }
  if (type === "sheet") {
    const fileId = googleFileIdFromUrl(url);
    return fileId
      ? { kind: "google-export", url: `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv`, format: "csv", reason: "" }
      : noPlan();
  }
  if (type === "slides") {
    const fileId = googleFileIdFromUrl(url);
    return fileId
      ? { kind: "google-export", url: `https://docs.google.com/presentation/d/${fileId}/export?format=txt`, format: "txt", reason: "" }
      : noPlan();
  }
  if (type === "pdf" || type === "ebook") {
    const fileId = googleFileIdFromUrl(url);
    if (fileId) {
      return { kind: "pdf", url: `https://drive.google.com/uc?export=download&id=${fileId}`, format: "pdf", reason: "" };
    }
    if (/^https:\/\//i.test(url) && !/\.(php|aspx?|jsp|do|cfm)(\?|$)/i.test(url)) {
      return { kind: "pdf", url, format: "pdf", reason: "" };
    }
    return noPlan();
  }
  // Any other type that happens to point at a plain-text document is still
  // readable — the extension, not the label, decides.
  if (TEXT_EXTENSION.test(url.split("?")[0])) {
    return { kind: "text", url, format: "text", reason: "" };
  }
  return noPlan();
};

/* ------------------------------------------------------------------ */
/* Availability — outcome → honest state                               */
/* ------------------------------------------------------------------ */

/** Minimum extracted characters before a resource counts as genuinely read. */
export const PERSONAL_AI_MIN_READABLE_CHARS = 60;

/**
 * Map one extraction outcome onto an availability state + a learner-facing
 * reason. `authored` is true when the learner wrote a description/notes for
 * the resource, which is the only thing that can make an unreadable file
 * `partial` instead of `unsupported`/`unavailable`.
 */
export const personalAiState = (input) => {
  const options = asRecord(input);
  const type = String(options.type || "");
  const plan = asRecord(options.plan);
  const outcome = asRecord(options.outcome);
  const status = String(outcome.status || "skipped");
  const chars = clampInt(outcome.chars, 0, Number.MAX_SAFE_INTEGER, 0);
  const authored = options.authored === true;
  const legacy = personalAiAvailability(type);
  const label = personalCourseTypeLabel(type);

  const withAuthored = (state, reason) => (authored
    ? { state: "partial", readable: true, reason: `${reason} I can still use the title, description and notes you wrote for it.`, chars, authored: true, type, typeLabel: label }
    : { state, readable: false, reason, chars, authored: false, type, typeLabel: label });

  if (status === "pending") {
    return { state: "processing", readable: false, reason: `Reading this ${label} is still in progress.`, chars: 0, authored, type, typeLabel: label };
  }
  if (plan.kind === "none" || status === "unsupported" || status === "skipped") {
    return withAuthored("unsupported", String(outcome.reason || legacy.reason || `I can't read ${label} content yet.`));
  }
  if (status === "permission") {
    return withAuthored(
      "permission_required",
      String(outcome.reason || `I can see this ${label} exists, but it is private — I don't have permission to read it.`),
    );
  }
  if (status === "ok") {
    if (chars < PERSONAL_AI_MIN_READABLE_CHARS) {
      return withAuthored("unavailable", `I opened this ${label} but found almost no selectable text in it.`);
    }
    return {
      state: "ready",
      readable: true,
      reason: `Text read from this ${label}.`,
      chars,
      authored,
      type,
      typeLabel: label,
    };
  }
  if (status === "empty") {
    return withAuthored("unavailable", `I can see that this ${label} exists, but I couldn't read its contents.`);
  }
  if (status === "invalid") {
    return withAuthored("unavailable", `I could open this ${label}, but the text inside it isn't readable (it may be a scan or an image-only file).`);
  }
  return withAuthored("unavailable", String(outcome.reason || `I couldn't fetch this ${label} just now.`));
};

/** True when the state allows grounding. */
export const isPersonalAiReadableState = (state) => PERSONAL_AI_READABLE_STATES.includes(String(state));

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/**
 * One provenance label per grounding unit / source chip.
 *
 *   module   → "My Module → Physics Revision"
 *   resource → "My Module → Physics Revision → Chapter 2 PDF"
 *   saved    → "Saved for Later → Formula Sheet"
 *
 * `originKind === "official"` marks a personal copy of an official course
 * resource so the model (and the learner) can tell the two apart.
 */
export const personalAiProvenance = (input) => {
  const options = asRecord(input);
  const scope = options.scope === "resource" ? "resource" : "module";
  const saved = options.saved === true;
  const root = saved ? PERSONAL_AI_SAVED_LABEL : PERSONAL_AI_MODULE_ROOT_LABEL;
  const moduleTitle = saved ? "" : cleanAiText(options.moduleTitle, 120) || "Untitled module";
  const resourceName = scope === "resource" ? cleanAiText(options.resourceName, 140) : "";
  const parts = [root, moduleTitle, resourceName].filter(Boolean);
  const official = String(options.originKind || "manual") === "official";
  return {
    scope,
    saved,
    label: parts.join(" → "),
    root,
    moduleTitle,
    resourceName,
    kind: official ? "official-copy" : "personal",
    kindLabel: official ? "Personal copy of an official course resource" : "Personal resource",
  };
};

/* ------------------------------------------------------------------ */
/* Grounding corpus (text units)                                       */
/* ------------------------------------------------------------------ */

const UNIT_KINDS = ["module-brief", "resource-meta", "resource-text", "note", "artifact"];

/**
 * Build the retrieval corpus for one module.
 *
 * @param input.module   `{ id, title, description }`
 * @param input.resources  personal resources (already owner-scoped)
 * @param input.availability  `{ [resourceId]: { state, readable, reason, chars } }`
 * @param input.extracted `{ [resourceId]: string }` successfully extracted text
 * @param input.notes     `{ [resourceId|"__module__"]: [{ id, text }] }`
 * @param input.saved     true when the scope is the Saved-for-Later bucket
 */
export const buildPersonalAiUnits = (input) => {
  const options = asRecord(input);
  const module = asRecord(options.module);
  const saved = options.saved === true;
  const resources = asArray(options.resources).slice(0, PERSONAL_AI_MAX_UNITS);
  const availability = asRecord(options.availability);
  const extracted = asRecord(options.extracted);
  const notes = asRecord(options.notes);
  const units = [];

  const moduleTitle = cleanAiText(module.title, 120) || (saved ? PERSONAL_AI_SAVED_LABEL : "Untitled module");
  const moduleDescription = stripAiMarkup(module.description, PERSONAL_AI_MAX_AUTHORED_CHARS);
  if (moduleTitle || moduleDescription) {
    const provenance = personalAiProvenance({ scope: "module", moduleTitle, saved });
    units.push({
      id: `module:${module.id || "__scope__"}:brief`,
      kind: "module-brief",
      scope: "module",
      resourceId: null,
      title: moduleTitle,
      provenance: provenance.label,
      originKind: "personal",
      readable: true,
      weight: 1.15,
      text: cleanAiText([
        `Module: ${moduleTitle}`,
        moduleDescription ? `What the learner says this module is about: ${moduleDescription}` : "",
      ].filter(Boolean).join("\n"), PERSONAL_AI_MAX_AUTHORED_CHARS),
    });
  }

  for (const raw of resources) {
    const resource = asRecord(raw);
    const resourceId = String(resource.id || "");
    if (!resourceId) continue;
    const state = asRecord(availability[resourceId]);
    const provenance = personalAiProvenance({
      scope: "resource",
      moduleTitle,
      resourceName: resource.name,
      originKind: resource.originKind,
      saved,
    });
    const description = stripAiMarkup(resource.description, PERSONAL_AI_MAX_AUTHORED_CHARS);
    const metadata = asRecord(resource.metadata);
    const metadataText = Object.entries(metadata)
      .map(([key, value]) => `${cleanAiText(key, 40)}: ${cleanAiText(value, 200)}`)
      .filter((line) => line.split(":")[1]?.trim())
      .slice(0, 8)
      .join("\n");
    const readable = isPersonalAiReadableState(state.state);

    units.push({
      id: `resource:${resourceId}:meta`,
      kind: "resource-meta",
      scope: "resource",
      resourceId,
      title: cleanAiText(resource.name, 140) || "Untitled resource",
      provenance: provenance.label,
      originKind: provenance.kind,
      readable,
      weight: 1,
      text: cleanAiText([
        `Resource: ${cleanAiText(resource.name, 140) || "Untitled resource"}`,
        `Type: ${provenance.kindLabel} · ${personalCourseTypeLabel(resource.type)}`,
        description ? `Learner's description: ${description}` : "",
        metadataText ? `Learner's labels: ${metadataText}` : "",
        readable ? "" : `Not readable by the AI: ${state.reason || "no read path"}`,
      ].filter(Boolean).join("\n"), PERSONAL_AI_MAX_AUTHORED_CHARS),
    });

    const body = stripAiMarkup(extracted[resourceId], PERSONAL_AI_MAX_RESOURCE_CHARS);
    if (body && state.state === "ready") {
      units.push({
        id: `resource:${resourceId}:text`,
        kind: "resource-text",
        scope: "resource",
        resourceId,
        title: cleanAiText(resource.name, 140) || "Untitled resource",
        provenance: provenance.label,
        originKind: provenance.kind,
        readable: true,
        weight: 1.35,
        text: body,
      });
    }

    for (const rawNote of asArray(notes[resourceId]).slice(0, 20)) {
      const note = asRecord(rawNote);
      const text = stripAiMarkup(note.text || note.html, 2000);
      if (!text) continue;
      units.push({
        id: `note:${String(note.id || units.length)}`,
        kind: "note",
        scope: "resource",
        resourceId,
        title: cleanAiText(resource.name, 140) || "Untitled resource",
        provenance: `${provenance.label} · your note`,
        originKind: "personal",
        readable: true,
        weight: 1.25,
        text: `Learner's own note: ${text}`,
      });
    }
  }

  for (const rawNote of asArray(notes.__module__).slice(0, 20)) {
    const note = asRecord(rawNote);
    const text = stripAiMarkup(note.text || note.html, 2000);
    if (!text) continue;
    units.push({
      id: `note:${String(note.id || units.length)}`,
      kind: "note",
      scope: "module",
      resourceId: null,
      title: moduleTitle,
      provenance: `${personalAiProvenance({ scope: "module", moduleTitle, saved }).label} · your note`,
      originKind: "personal",
      readable: true,
      weight: 1.2,
      text: `Learner's own note: ${text}`,
    });
  }

  return units
    .filter((unit) => unit.text && unit.text.length > 1)
    .slice(0, PERSONAL_AI_MAX_UNITS)
    .map((unit) => ({ ...unit, kind: UNIT_KINDS.includes(unit.kind) ? unit.kind : "artifact", chars: unit.text.length }));
};

/** Coverage numbers + the honest sentence the UI shows above an answer. */
export const personalAiCoverage = (input) => {
  const options = asRecord(input);
  const rows = asArray(options.resources).map((raw) => asRecord(raw));
  const total = rows.length;
  const ready = rows.filter((row) => row.state === "ready").length;
  const partial = rows.filter((row) => row.state === "partial").length;
  const processing = rows.filter((row) => row.state === "processing").length;
  const permission = rows.filter((row) => row.state === "permission_required").length;
  const unsupported = rows.filter((row) => row.state === "unsupported").length;
  const unavailable = rows.filter((row) => row.state === "unavailable").length;
  const readable = ready + partial;
  return {
    total,
    readable,
    ready,
    partial,
    processing,
    permissionRequired: permission,
    unsupported,
    unavailable,
    full: total > 0 && readable === total,
    none: total === 0 || readable === 0,
    sentence: personalAiCoverageSentence({ total, readable, ready, partial }),
  };
};

export const personalAiCoverageSentence = (input) => {
  const options = asRecord(input);
  const total = clampInt(options.total, 0, 100000, 0);
  const readable = clampInt(options.readable, 0, total, 0);
  const ready = clampInt(options.ready, 0, total, 0);
  if (total === 0) return "This module has no resources yet, so there is nothing for me to read.";
  if (readable === 0) return `I couldn't read any of the ${total} resource${total === 1 ? "" : "s"} in this module, so I can only use the titles and descriptions you wrote.`;
  if (readable === total) {
    return ready === total
      ? `Based on all ${total} readable resource${total === 1 ? "" : "s"} in this module.`
      : `Based on all ${total} resource${total === 1 ? "" : "s"} — ${ready} fully read, ${readable - ready} from your own titles, descriptions and notes.`;
  }
  return `Based on ${readable} of ${total} readable resource${total === 1 ? "" : "s"} — the rest could not be opened.`;
};

/* ------------------------------------------------------------------ */
/* Chunking + retrieval                                                */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "so", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "do", "does", "did", "have", "has", "had",
  "this", "that", "these", "those", "it", "its", "as", "at", "by", "from", "about", "into", "over",
  "what", "which", "who", "whom", "when", "where", "why", "how", "can", "could", "should", "would",
  "will", "shall", "may", "might", "must", "me", "my", "mine", "you", "your", "yours", "we", "our",
  "us", "them", "they", "he", "she", "his", "her", "i", "am", "not", "no", "yes", "please", "tell",
  "explain", "give", "list", "summarize", "summary", "question", "questions", "module", "resource",
]);

/** Query/keyword tokens used by the retriever (lowercase, deduped). */
export const personalAiTokens = (value) => {
  const words = String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\u0900-\u097F]+/g, " ")
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  return Array.from(new Set(words));
};

/**
 * Split one unit into retrieval chunks. Paragraph-ish boundaries are kept so
 * a chunk never starts mid-word, and long paragraphs are hard-split.
 */
export const chunkPersonalAiText = (text, maxChars = PERSONAL_AI_MAX_CHUNK_CHARS) => {
  const source = String(text || "");
  const cap = clampInt(maxChars, 200, 8000, PERSONAL_AI_MAX_CHUNK_CHARS);
  if (source.length <= cap) return source.trim() ? [source.trim()] : [];
  const chunks = [];
  const paragraphs = source.split(/\n{2,}|\r\n\r\n/);
  let current = "";
  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };
  for (const paragraph of paragraphs) {
    let block = String(paragraph || "").trim();
    if (!block) continue;
    while (block.length > cap) {
      // Hard-split at the last sentence/space boundary inside the cap.
      const slice = block.slice(0, cap);
      const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
      const at = cut > cap * 0.5 ? cut + 1 : cap;
      if (current) flush();
      chunks.push(block.slice(0, at).trim());
      block = block.slice(at).trim();
    }
    if (!block) continue;
    if (current.length + block.length + 2 > cap) flush();
    current = current ? `${current}\n\n${block}` : block;
  }
  flush();
  return chunks;
};

/**
 * Deterministic keyword retrieval over the grounding corpus.
 *
 * No embeddings exist in this app, so relevance is term frequency with a
 * title/provenance boost and an exact-phrase bonus — cheap, explainable and
 * identical on the server and in tests. Returns the chunks that will actually
 * be sent to the model, each carrying its provenance.
 */
export const retrievePersonalAiChunks = (input) => {
  const options = asRecord(input);
  const units = asArray(options.units);
  const query = cleanAiText(options.query, PERSONAL_AI_QUESTION_CHARS_MAX);
  const maxChunks = clampInt(options.maxChunks, 1, 60, PERSONAL_AI_MAX_CHUNKS);
  const maxChars = clampInt(options.maxChars, 400, 200000, PERSONAL_AI_MAX_CONTEXT_CHARS);
  const tokens = personalAiTokens(query);
  const phrase = query.toLowerCase();

  const scored = [];
  for (const raw of units) {
    const unit = asRecord(raw);
    const text = String(unit.text || "");
    if (!text) continue;
    const parts = chunkPersonalAiText(text, clampInt(options.chunkChars, 200, 8000, PERSONAL_AI_MAX_CHUNK_CHARS));
    parts.forEach((part, index) => {
      const haystack = part.toLowerCase();
      const head = `${String(unit.title || "").toLowerCase()} ${haystack.slice(0, 240)}`;
      let score = 0;
      for (const token of tokens) {
        let hits = 0;
        let from = haystack.indexOf(token);
        while (from !== -1 && hits < 12) {
          hits += 1;
          from = haystack.indexOf(token, from + token.length);
        }
        if (hits) score += hits * (head.includes(token) ? 2 : 1);
      }
      if (phrase && phrase.length > 6 && haystack.includes(phrase)) score += 6;
      // A resource-specific question always keeps its own resource in scope.
      if (options.resourceId && unit.resourceId === options.resourceId) score += 8;
      score *= Number(unit.weight) || 1;
      // Units earlier in the module keep a tiny ordering advantage so ties are
      // stable instead of arbitrary.
      score += Math.max(0, 0.05 - scored.length * 0.0005);
      scored.push({
        unitId: String(unit.id),
        kind: String(unit.kind),
        scope: unit.scope === "module" ? "module" : "resource",
        resourceId: unit.resourceId ? String(unit.resourceId) : null,
        title: String(unit.title || ""),
        provenance: String(unit.provenance || ""),
        originKind: String(unit.originKind || "personal"),
        part: index,
        parts: parts.length,
        text: part,
        chars: part.length,
        score: Number(score.toFixed(4)),
      });
    });
  }

  scored.sort((a, b) => b.score - a.score || a.chars - b.chars);
  const selected = [];
  let budget = maxChars;
  for (const chunk of scored) {
    if (selected.length >= maxChunks) break;
    if (chunk.chars > budget && selected.length > 0) continue;
    selected.push({ ...chunk, text: chunk.chars > maxChars ? chunk.text.slice(0, maxChars) : chunk.text });
    budget -= chunk.chars;
    if (budget <= 0) break;
  }
  // Restore corpus order so the model reads the material in a natural sequence.
  selected.sort((a, b) => (a.unitId === b.unitId ? a.part - b.part : a.unitId < b.unitId ? -1 : 1));
  return selected;
};

/** Sources list for an answer, deduped by unit id, in the model's read order. */
export const personalAiSources = (chunks) => {
  const seen = new Set();
  const sources = [];
  for (const raw of asArray(chunks)) {
    const chunk = asRecord(raw);
    const id = String(chunk.unitId || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    sources.push({
      unitId: id,
      scope: chunk.scope === "module" ? "module" : "resource",
      resourceId: chunk.resourceId || null,
      label: cleanAiText(chunk.title, 140),
      provenance: cleanAiText(chunk.provenance, 220),
      kind: String(chunk.kind || ""),
      originKind: String(chunk.originKind || "personal"),
    });
  }
  return sources;
};

/** Deterministic hash of a corpus — used to decide artifact reuse. */
export const personalAiContentHash = (units) => personalAiHash(
  asArray(units)
    .map((unit) => `${asRecord(unit).id}:${asRecord(unit).chars || String(asRecord(unit).text || "").length}`)
    .join("|"),
);

/**
 * True when a stored artifact can be reused instead of paying for a new
 * generation: same scope, same content hash, inside the TTL, not stale-flagged.
 */
export const isReusablePersonalAiArtifact = (input) => {
  const options = asRecord(input);
  const artifact = asRecord(options.artifact);
  const now = clampInt(options.now, 0, Number.MAX_SAFE_INTEGER, Date.now());
  if (!artifact || asRecord(artifact.payload) === {} && !artifact.type) return false;
  if (String(artifact.type || "") !== String(options.type || "")) return false;
  if (String(artifact.moduleId || "") !== String(options.moduleId || "")) return false;
  if (String(artifact.resourceId || "") !== String(options.resourceId || "")) return false;
  if (options.force === true) return false;
  if (artifact.stale === true) return false;
  if (String(artifact.contentHash || "") !== String(options.contentHash || "")) return false;
  const createdAt = clampInt(artifact.updatedAt || artifact.createdAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const ttl = clampInt(options.maxAgeMs, 1000, Number.MAX_SAFE_INTEGER, PERSONAL_AI_ARTIFACT_TTL_MS);
  if (!createdAt) return false;
  return now - createdAt <= ttl;
};

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

export const PERSONAL_AI_SYSTEM_PROMPT = [
  "You are Digitalcatalyst's personal study tutor for ONE learner's own module.",
  "You answer ONLY from the CONTENT block you are given. That block is the complete set of material you can actually read.",
  "Hard rules:",
  "- Never invent facts, definitions, formulas, page numbers, examples or quotes that are not present in the CONTENT block.",
  "- Never claim to have read a resource that is listed as not readable. If the learner asks about it, say plainly that you can see the resource exists but could not read its contents.",
  "- If the CONTENT block does not contain the answer, say so in one short sentence and then say what IS in the module that is closest.",
  "- Cite provenance using the exact unit ids from the CONTENT block in the `sources` array. Only cite units you actually used.",
  "- Respect the coverage line: it tells you how much of the module is readable. Never imply you read more than that.",
  "- Write for a student revising for an exam: short sentences, concrete, no filler, no marketing tone.",
  "- Return ONLY valid JSON in the exact shape the request specifies. No markdown, no code fences, no commentary outside the JSON.",
].join("\n");

const contentBlock = (chunks, coverage, scopeLabel) => {
  const rows = asArray(chunks).map((chunk, index) => {
    const row = asRecord(chunk);
    return [
      `[${index + 1}] id=${row.unitId} scope=${row.scope} kind=${row.kind} origin=${row.originKind}`,
      `provenance: ${row.provenance}`,
      String(row.text || ""),
    ].join("\n");
  });
  return [
    `SCOPE: ${scopeLabel}`,
    `COVERAGE: ${asRecord(coverage).sentence || ""}`,
    rows.length ? "CONTENT:" : "CONTENT: (nothing readable — do not answer from memory)",
    rows.join("\n\n"),
  ].join("\n");
};

const sourceRule = "sources: an array of the unit ids (the `id=` value) you actually used, in the order you used them. Use [] if you used none.";

/** Module/resource chat question. */
export const buildPersonalAiAskPrompt = (input) => {
  const options = asRecord(input);
  const question = cleanAiText(options.question, PERSONAL_AI_QUESTION_CHARS_MAX);
  const history = asArray(options.history).slice(-PERSONAL_AI_MAX_HISTORY_MESSAGES).map((row) => {
    const message = asRecord(row);
    return `${message.role === "assistant" ? "Tutor" : "Learner"}: ${cleanAiText(message.text, 900)}`;
  }).filter((line) => line.split(": ")[1]);
  return [
    contentBlock(options.chunks, options.coverage, String(options.scopeLabel || "module")),
    history.length ? `EARLIER IN THIS CONVERSATION (context only, not new content):\n${history.join("\n")}` : "",
    `LEARNER'S QUESTION: ${question}`,
    "Answer in the learner's own language when the question is not in English (Hinglish is fine).",
    "Return JSON: {\"answer\":\"...\",\"sources\":[\"unit-id\",...],\"grounded\":true|false,\"followUps\":[\"...\"]}",
    "- answer: 40-220 words of plain prose. Use short bullet lines with a leading '- ' where a list genuinely helps.",
    "- grounded: false ONLY when the CONTENT block did not contain the answer.",
    sourceRule,
    "- followUps: up to 2 short questions the learner is likely to ask next (empty array if none).",
  ].filter(Boolean).join("\n\n");
};

/** Module summary (study-oriented structure). */
export const buildPersonalAiSummaryPrompt = (input) => {
  const options = asRecord(input);
  return [
    contentBlock(options.chunks, options.coverage, String(options.scopeLabel || "module")),
    "TASK: write a study-oriented summary of THIS module's readable material.",
    "Return JSON: {\"overview\":\"...\",\"keyConcepts\":[{\"title\":\"...\",\"detail\":\"...\"}],\"definitions\":[{\"term\":\"...\",\"meaning\":\"...\"}],\"formulas\":[{\"name\":\"...\",\"value\":\"...\",\"when\":\"...\"}],\"takeaways\":[\"...\"],\"remember\":[\"...\"],\"sources\":[\"unit-id\",...],\"insufficient\":true|false}",
    "- overview: 2-4 sentences describing what this module actually covers, based only on the content above.",
    "- keyConcepts: 3-8 concepts that are genuinely present in the content, each with a 1-2 sentence detail.",
    "- definitions: only terms the content actually defines (may be empty).",
    "- formulas: only formulas/facts the content actually states (may be empty). Never write a formula from memory.",
    "- takeaways: 3-6 short lines a student must be able to say back.",
    "- remember: 2-5 easily-forgotten details, exceptions or units.",
    "- insufficient: true when the readable content is too thin for a real summary; then keep overview to one honest sentence and leave the arrays empty.",
    sourceRule,
    "Do not pad. An empty array is a correct answer; invented content is not.",
  ].join("\n\n");
};

/** Question generation. */
export const buildPersonalAiQuestionsPrompt = (input) => {
  const options = asRecord(input);
  const count = clampInt(options.count, PERSONAL_AI_QUESTION_MIN, PERSONAL_AI_QUESTION_MAX, PERSONAL_AI_QUESTION_DEFAULT);
  const types = asArray(options.types).map((type) => String(type)).filter((type) => PERSONAL_AI_QUESTION_TYPES.includes(type));
  const allowed = types.length ? types : PERSONAL_AI_QUESTION_TYPES;
  return [
    contentBlock(options.chunks, options.coverage, String(options.scopeLabel || "module")),
    `TASK: generate exactly ${count} study question(s) from THIS content only.`,
    `Allowed question types: ${allowed.join(", ")} (mcq = 4 options, short = one/two-line answer, boolean = true/false).`,
    `Difficulty focus: ${cleanAiText(options.difficulty, 20) || "mixed"}.`,
    "Return JSON: {\"questions\":[{\"type\":\"mcq|short|boolean\",\"prompt\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctIndex\":0,\"answer\":\"...\",\"explanation\":\"...\",\"topic\":\"...\",\"sources\":[\"unit-id\",...]}],\"insufficient\":true|false}",
    "- mcq: options must be exactly 4 distinct non-empty strings and correctIndex the 0-based answer.",
    "- short/boolean: options must be [] and answer must hold the expected answer (\"True\"/\"False\" for boolean).",
    "- Every question must be answerable from the CONTENT block. Never ask about a fact that is absent from it.",
    "- topic: 1-4 words naming the concept the question tests (used for weak-topic tracking). Use the material's own wording.",
    "- explanation: 1-2 sentences teaching why the answer is right, quoting the content's own terms.",
    "- insufficient: true when the readable content cannot support the requested number of real questions; then return fewer questions rather than inventing them.",
  ].join("\n\n");
};

/** Flashcard generation. */
export const buildPersonalAiFlashcardsPrompt = (input) => {
  const options = asRecord(input);
  const count = clampInt(options.count, PERSONAL_AI_FLASHCARD_MIN, PERSONAL_AI_FLASHCARD_MAX, PERSONAL_AI_FLASHCARD_DEFAULT);
  return [
    contentBlock(options.chunks, options.coverage, String(options.scopeLabel || "module")),
    `TASK: create exactly ${count} concise study flashcard(s) from THIS content only.`,
    "Return JSON: {\"cards\":[{\"front\":\"...\",\"back\":\"...\",\"topic\":\"...\",\"sources\":[\"unit-id\",...]}],\"insufficient\":true|false}",
    "- front: a question or a concept cue (max 140 characters).",
    "- back: the answer or a tight explanation (max 320 characters).",
    "- One idea per card. No card may repeat another.",
    "- topic: 1-4 words naming the concept (used for weak-topic tracking).",
    "- insufficient: true when the readable content is too thin for real cards; then return fewer cards rather than inventing them.",
  ].join("\n\n");
};

/** "Explain Again" for a question the learner got wrong. */
export const buildPersonalAiExplainPrompt = (input) => {
  const options = asRecord(input);
  const mode = PERSONAL_AI_EXPLAIN_MODES.includes(String(options.mode)) ? String(options.mode) : "simple";
  const instructions = {
    simple: "Explain it again in the simplest possible words, as if to a first-time learner. Short sentences, no jargon without an immediate plain meaning.",
    steps: "Explain it step by step. Number each step. Each step must be one small idea that follows from the previous one.",
    example: "Explain it through ONE concrete worked example taken from the content (or, if the content has none, a minimal everyday example that uses only the content's own concepts). Show the reasoning, then state the answer.",
    exam: "Explain it the way an examiner wants it written: the exact definition/derivation the content gives, the marks-worthy points, and the common mistake to avoid.",
  }[mode];
  return [
    contentBlock(options.chunks, options.coverage, String(options.scopeLabel || "module")),
    `QUESTION THE LEARNER STRUGGLED WITH: ${cleanAiText(options.question, 900)}`,
    options.answer ? `CORRECT ANSWER: ${cleanAiText(options.answer, 600)}` : "",
    options.explanation ? `SHORT EXPLANATION ALREADY GIVEN: ${cleanAiText(options.explanation, 600)}` : "",
    options.learnerAnswer ? `WHAT THE LEARNER ANSWERED: ${cleanAiText(options.learnerAnswer, 600)}` : "",
    `MODE: ${mode}. ${instructions}`,
    "Return JSON: {\"explanation\":\"...\",\"keyPoint\":\"...\",\"sources\":[\"unit-id\",...],\"grounded\":true|false}",
    "- explanation: 60-200 words. Do not just repeat the previous explanation — teach it differently.",
    "- keyPoint: ONE sentence the learner should remember.",
    "- If the learner's wrong answer reveals a specific misconception, name it and correct it.",
    "- grounded: false when the CONTENT block does not actually cover this concept.",
  ].filter(Boolean).join("\n\n");
};

/** Study plan. */
export const buildPersonalAiPlanPrompt = (input) => {
  const options = asRecord(input);
  const days = clampInt(options.days, PERSONAL_AI_PLAN_DAY_MIN, PERSONAL_AI_PLAN_DAY_MAX, PERSONAL_AI_PLAN_DAY_DEFAULT);
  const weak = asArray(options.weakTopics).map((topic) => cleanAiText(topic, 60)).filter(Boolean).slice(0, 8);
  return [
    contentBlock(options.chunks, options.coverage, String(options.scopeLabel || "module")),
    `TASK: build a practical ${days}-day study plan for THIS module's readable material only.`,
    weak.length ? `The learner's current weak topics (from their own answers): ${weak.join(", ")}. Give them dedicated revision days.` : "",
    options.minutesPerDay ? `Assume about ${clampInt(options.minutesPerDay, 5, 600, 45)} minutes of study per day.` : "",
    "Return JSON: {\"days\":[{\"day\":1,\"focus\":\"...\",\"tasks\":[\"...\"],\"questions\":10}],\"note\":\"...\",\"sources\":[\"unit-id\",...],\"insufficient\":true|false}",
    "- One entry per day, day numbers 1.." + days + ", in order.",
    "- focus: the topic(s) for that day, named with the content's own wording.",
    "- tasks: 2-4 concrete actions (read X, revise Y, answer N questions, re-check weak topic Z).",
    "- questions: how many practice questions to attempt that day (0 is allowed for a pure revision day).",
    "- note: ONE sentence stating clearly that this plan was generated from the module's available content and nothing else.",
    "- Never assume a school calendar, exam dates or other subjects. If the readable content is too thin, set insufficient true and keep the plan honest and short.",
  ].filter(Boolean).join("\n\n");
};

/** Study Mode orientation. */
export const buildPersonalAiOrientationPrompt = (input) => {
  const options = asRecord(input);
  return [
    contentBlock(options.chunks, options.coverage, String(options.scopeLabel || "module")),
    "TASK: the learner is starting a focused study session on this module. Give a short orientation.",
    "Return JSON: {\"orientation\":\"...\",\"focus\":[\"...\"],\"watchOut\":[\"...\"],\"firstStep\":\"...\",\"sources\":[\"unit-id\",...],\"insufficient\":true|false}",
    "- orientation: 3-5 sentences — what this material is, how it is organised, what matters most.",
    "- focus: 3-6 topics to cover in this session, in a sensible order.",
    "- watchOut: 1-3 things students commonly get wrong IN THIS MATERIAL (only if the content supports it; otherwise []).",
    "- firstStep: ONE concrete next action for the learner.",
  ].join("\n\n");
};

/* ------------------------------------------------------------------ */
/* Output normalisation                                                */
/* ------------------------------------------------------------------ */

const cleanList = (value, max, perItem) => asArray(value)
  .map((item) => cleanAiText(typeof item === "string" ? item : asRecord(item).text || asRecord(item).title, perItem))
  .filter(Boolean)
  .slice(0, max);

const normalizeSourceIds = (value, known) => {
  const allowed = new Set(asArray(known).map((id) => String(id)));
  const ids = asArray(value).map((id) => String(id || "").trim()).filter(Boolean);
  const unique = Array.from(new Set(ids));
  // A model may echo a chunk number instead of an id — accept only real ids so
  // provenance can never point at content that was not in the context.
  return allowed.size ? unique.filter((id) => allowed.has(id)).slice(0, 8) : unique.slice(0, 8);
};

/** `{ answer, sources, grounded, followUps }` */
export const normalizePersonalAiAnswer = (raw, knownUnitIds) => {
  const row = asRecord(raw);
  const answer = cleanAiText(row.answer || row.text || row.response, 4000);
  return {
    answer,
    sources: normalizeSourceIds(row.sources, knownUnitIds),
    grounded: row.grounded !== false && Boolean(answer),
    followUps: cleanList(row.followUps, 3, 160),
  };
};

/** Module/resource summary artifact. */
export const normalizePersonalAiSummary = (raw, knownUnitIds) => {
  const row = asRecord(raw);
  const keyConcepts = asArray(row.keyConcepts).map((item) => {
    const concept = asRecord(item);
    return {
      title: cleanAiText(concept.title || concept.name || concept.text, 120),
      detail: cleanAiText(concept.detail || concept.description || concept.explanation, 600),
    };
  }).filter((item) => item.title || item.detail).slice(0, 10);
  const definitions = asArray(row.definitions).map((item) => {
    const definition = asRecord(item);
    return {
      term: cleanAiText(definition.term || definition.title, 120),
      meaning: cleanAiText(definition.meaning || definition.detail || definition.text, 600),
    };
  }).filter((item) => item.term && item.meaning).slice(0, 12);
  const formulas = asArray(row.formulas).map((item) => {
    const formula = asRecord(item);
    return {
      name: cleanAiText(formula.name || formula.title, 120),
      value: cleanAiText(formula.value || formula.formula || formula.expression, 300),
      when: cleanAiText(formula.when || formula.usage || formula.detail, 300),
    };
  }).filter((item) => item.value || item.name).slice(0, 12);
  return {
    overview: cleanAiText(row.overview || row.summary, 1600),
    keyConcepts,
    definitions,
    formulas,
    takeaways: cleanList(row.takeaways, 8, 300),
    remember: cleanList(row.remember || row.thingsToRemember, 8, 300),
    sources: normalizeSourceIds(row.sources, knownUnitIds),
    insufficient: row.insufficient === true,
  };
};

/**
 * True/False answers arrive as `true`, `"True"`, `"yes"`, `"T"`… The practice
 * view compares case-insensitively, so canonicalising to "True"/"False" keeps
 * the card readable without changing the comparison.
 */
const normalizeBooleanAnswer = (value) => {
  const text = cleanAiText(value, 40).toLowerCase();
  if (/^(true|t|yes|y|correct|right)$/.test(text)) return "True";
  if (/^(false|f|no|n|incorrect|wrong)$/.test(text)) return "False";
  return cleanAiText(value, 40);
};

/**
 * Resolve which option is correct. Models give a 0-based index, a 1-based
 * index, a letter ("B"), or simply repeat the option text — all four are
 * accepted, because guessing wrong here would teach a learner the wrong answer.
 */
const resolveCorrectIndex = (question, options, rawAnswer) => {
  if (!options.length) return 0;
  const explicit = clampInt(question.correctIndex ?? question.answerIndex ?? question.correct, -1, options.length - 1, -1);
  if (explicit >= 0) return explicit;
  const letter = cleanAiText(question.correctOption ?? question.correctAnswerLetter ?? rawAnswer, 8).match(/^([a-h])[).:\s]*$/i);
  if (letter) {
    const index = letter[1].toLowerCase().charCodeAt(0) - 97;
    if (index < options.length) return index;
  }
  const wanted = cleanAiText(rawAnswer, 400).toLowerCase().trim();
  if (wanted) {
    const exact = options.findIndex((option) => option.toLowerCase() === wanted);
    if (exact >= 0) return exact;
    // "B) mass × acceleration" or "mass × acceleration (B)"
    const prefixed = options.findIndex((option) => option.toLowerCase().replace(/^[a-h][).:\s-]+/, "") === wanted.replace(/^[a-h][).:\s-]+/, ""));
    if (prefixed >= 0) return prefixed;
    const contained = options.findIndex((option) => wanted.includes(option.toLowerCase()) && option.length > 2);
    if (contained >= 0) return contained;
  }
  const oneBased = clampInt(question.correctIndex ?? question.answerIndex, 1, options.length, -1);
  return oneBased > 0 ? oneBased - 1 : 0;
};

/** Generated questions. */
export const normalizePersonalAiQuestions = (raw, knownUnitIds) => {
  const row = Array.isArray(raw) ? { questions: raw } : asRecord(raw);
  const questions = [];
  for (const item of asArray(row.questions)) {
    const question = asRecord(item);
    const prompt = cleanAiText(question.prompt || question.question || question.text, 900);
    if (!prompt) continue;
    const options = asArray(question.options).map((option) => cleanAiText(option, 400)).filter(Boolean).slice(0, 6);
    const rawAnswer = cleanAiText(question.answer ?? question.correctAnswer ?? question.solution, 900);
    // Models label the same shape many ways ("mcq", "MCQ", "multiple_choice",
    // "multiple-choice", "multi", "true/false", "tf", …) and sometimes omit the
    // label entirely. Compare on a punctuation-stripped lowercase form, and fall
    // back to the shape of the data (options present ⇒ choice question) so a
    // well-formed question is never silently dropped.
    const rawType = String(question.type || question.kind || "").trim().toLowerCase().replace(/[\s_\-/]+/g, "");
    const hasOptions = options.length >= 2;
    const labelledType = rawType.startsWith("mc") || rawType === "multiplechoice" || rawType === "multi" || rawType === "choice"
      ? "mcq"
      : rawType.startsWith("bool") || rawType === "truefalse" || rawType === "tf" || rawType === "yesno"
        ? "boolean"
        : "";
    const type = labelledType || (hasOptions && !rawAnswer ? "mcq" : "short");
    // A choice question that arrived without usable options is still a real
    // question when it carries an answer — keep it as short-answer.
    const effectiveType = type === "mcq" && !hasOptions ? (rawAnswer ? "short" : "") : type;
    if (!effectiveType) continue;
    const answer = effectiveType === "boolean" ? normalizeBooleanAnswer(rawAnswer) : rawAnswer;
    if (effectiveType !== "mcq" && !answer) continue;
    const correctIndex = effectiveType === "mcq" ? resolveCorrectIndex(question, options, rawAnswer) : -1;
    questions.push({
      id: `q_${personalAiHash(`${prompt}${questions.length}`)}`,
      type: effectiveType,
      prompt,
      options: effectiveType === "mcq" ? options : [],
      correctIndex,
      answer: effectiveType === "mcq" ? (options[correctIndex] || answer) : answer,
      explanation: cleanAiText(question.explanation || question.reason, 900),
      topic: cleanAiText(question.topic || question.concept, 80),
      sources: normalizeSourceIds(question.sources, knownUnitIds),
    });
    if (questions.length >= PERSONAL_AI_QUESTION_MAX) break;
  }
  return { questions, insufficient: row.insufficient === true };
};

/** Generated flashcards. */
export const normalizePersonalAiFlashcards = (raw, knownUnitIds) => {
  const row = Array.isArray(raw) ? { cards: raw } : asRecord(raw);
  const cards = [];
  const seen = new Set();
  for (const item of asArray(row.cards || row.flashcards)) {
    const card = asRecord(item);
    const front = cleanAiText(card.front || card.question || card.q, 300);
    const back = cleanAiText(card.back || card.answer || card.a, 900);
    if (!front || !back) continue;
    const key = `${front.toLowerCase()}::${back.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      id: `c_${personalAiHash(key)}`,
      front,
      back,
      topic: cleanAiText(card.topic || card.concept, 80),
      sources: normalizeSourceIds(card.sources, knownUnitIds),
    });
    if (cards.length >= PERSONAL_AI_FLASHCARD_MAX) break;
  }
  return { cards, insufficient: row.insufficient === true };
};

/** Study plan. */
export const normalizePersonalAiPlan = (raw, knownUnitIds) => {
  const row = asRecord(raw);
  const days = asArray(row.days || row.plan).map((item, index) => {
    const day = asRecord(item);
    return {
      day: clampInt(day.day, 1, PERSONAL_AI_PLAN_DAY_MAX, index + 1),
      focus: cleanAiText(day.focus || day.topic || day.title, 200),
      tasks: cleanList(day.tasks || day.activities, 6, 300),
      questions: clampInt(day.questions ?? day.questionCount, 0, 100, 0),
    };
  }).filter((day) => day.focus || day.tasks.length).slice(0, PERSONAL_AI_PLAN_DAY_MAX);
  return {
    days,
    note: cleanAiText(row.note || row.disclaimer, 600),
    sources: normalizeSourceIds(row.sources, knownUnitIds),
    insufficient: row.insufficient === true,
  };
};

/** Study-mode orientation. */
export const normalizePersonalAiOrientation = (raw, knownUnitIds) => {
  const row = asRecord(raw);
  return {
    orientation: cleanAiText(row.orientation || row.intro || row.text, 2000),
    focus: cleanList(row.focus || row.topics, 8, 160),
    watchOut: cleanList(row.watchOut || row.caution, 5, 300),
    firstStep: cleanAiText(row.firstStep || row.nextStep, 300),
    sources: normalizeSourceIds(row.sources, knownUnitIds),
    insufficient: row.insufficient === true,
  };
};

/** "Explain Again" result. */
export const normalizePersonalAiExplanation = (raw, knownUnitIds) => {
  const row = asRecord(raw);
  const explanation = cleanAiText(row.explanation || row.answer || row.text, 3000);
  return {
    explanation,
    keyPoint: cleanAiText(row.keyPoint || row.takeaway, 400),
    sources: normalizeSourceIds(row.sources, knownUnitIds),
    grounded: row.grounded !== false && Boolean(explanation),
  };
};

/* ------------------------------------------------------------------ */
/* Weak topics — evidence based, never guessed                         */
/* ------------------------------------------------------------------ */

export const PERSONAL_AI_EVIDENCE_KINDS = [
  "question_incorrect",
  "question_repeated",
  "dont_understand",
  "flashcard_missed",
  "low_session_score",
];

export const PERSONAL_AI_EVIDENCE_WEIGHTS = {
  question_incorrect: 2,
  question_repeated: 1,
  dont_understand: 3,
  flashcard_missed: 1,
  low_session_score: 2,
};

/** Minimum total weight before a topic is called weak at all. */
export const PERSONAL_AI_WEAK_MIN_SCORE = 2;
export const PERSONAL_AI_WEAK_MAX_TOPICS = 12;
export const PERSONAL_AI_WEAK_TOPIC_MIN_CHARS = 2;
export const PERSONAL_AI_WEAK_TOPIC_MAX_CHARS = 60;
export const PERSONAL_AI_INSUFFICIENT_WEAK_COPY = "Keep practicing to discover your weak topics";

/** Lowercase, punctuation-light key so "Newton's laws" and "newtons laws" merge. */
export const personalAiTopicKey = (value) => cleanAiText(value, PERSONAL_AI_WEAK_TOPIC_MAX_CHARS)
  .toLowerCase()
  .replace(/['’`]/g, "")
  .replace(/[^a-z0-9\u00C0-\u024F\u0900-\u097F ]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const personalAiTopicLabel = (value) => cleanAiText(value, PERSONAL_AI_WEAK_TOPIC_MAX_CHARS)
  .replace(/\s+/g, " ")
  .trim();

/**
 * Aggregate weak-topic evidence events into a ranked list.
 * A topic only appears when it has real evidence (weight ≥ 2 or two+ hits),
 * so the panel can never call a learner weak on a guess.
 */
export const aggregatePersonalAiWeakTopics = (events, options) => {
  const rows = asArray(events).map((event) => asRecord(event));
  const now = clampInt(asRecord(options).now, 0, Number.MAX_SAFE_INTEGER, Date.now());
  const windowMs = clampInt(asRecord(options).windowMs, 60_000, 10 * 365 * 24 * 3600_000, 90 * 24 * 3600_000);
  const buckets = new Map();
  for (const row of rows) {
    const kind = String(row.kind || "");
    if (!PERSONAL_AI_EVIDENCE_KINDS.includes(kind)) continue;
    const at = clampInt(row.at || row.createdAt, 0, Number.MAX_SAFE_INTEGER, 0);
    if (at && now - at > windowMs) continue;
    const label = personalAiTopicLabel(row.topic);
    const key = personalAiTopicKey(row.topic);
    if (key.length < PERSONAL_AI_WEAK_TOPIC_MIN_CHARS) continue;
    const weight = clampInt(row.weight, 0, 20, PERSONAL_AI_EVIDENCE_WEIGHTS[kind] || 1);
    const existing = buckets.get(key) || {
      key,
      topic: label,
      score: 0,
      hits: 0,
      firstAt: at || now,
      lastAt: at || now,
      evidence: {},
      resourceIds: [],
      moduleId: String(row.moduleId || ""),
    };
    existing.score += weight;
    existing.hits += 1;
    existing.evidence[kind] = (existing.evidence[kind] || 0) + 1;
    existing.lastAt = Math.max(existing.lastAt, at || now);
    existing.firstAt = Math.min(existing.firstAt, at || now);
    if (label.length > existing.topic.length) existing.topic = label;
    const resourceId = String(row.resourceId || "");
    if (resourceId && !existing.resourceIds.includes(resourceId)) existing.resourceIds.push(resourceId);
    if (!existing.moduleId) existing.moduleId = String(row.moduleId || "");
    buckets.set(key, existing);
  }
  const topics = Array.from(buckets.values())
    .filter((topic) => topic.score >= PERSONAL_AI_WEAK_MIN_SCORE || topic.hits >= 2)
    .map((topic) => ({
      ...topic,
      resourceIds: topic.resourceIds.slice(0, 10),
      level: topic.score >= 8 ? "high" : topic.score >= 4 ? "medium" : "low",
    }))
    .sort((a, b) => b.score - a.score || b.hits - a.hits || b.lastAt - a.lastAt)
    .slice(0, PERSONAL_AI_WEAK_MAX_TOPICS);
  return {
    topics,
    state: topics.length ? "ready" : "insufficient",
    message: topics.length ? "" : PERSONAL_AI_INSUFFICIENT_WEAK_COPY,
    totalEvents: rows.length,
  };
};

/* ------------------------------------------------------------------ */
/* Errors, limits and retryability                                     */
/* ------------------------------------------------------------------ */

/**
 * One place that turns an API/AI failure into learner-facing copy plus the
 * two flags the UI needs: `retryable` (show a Retry button) and
 * `upgrade` (show the existing subscription CTA).
 */
export const personalAiFailure = (input) => {
  const options = asRecord(input);
  const code = String(options.code || "").toUpperCase();
  const message = cleanAiText(options.message, 400);
  const status = clampInt(options.status, 0, 599, 0);
  const switchOn = () => {
    switch (code) {
      case "AUTH_REQUIRED":
        return { message: "Sign in again to use your module AI tutor.", retryable: false, upgrade: false, kind: "auth" };
      case "AI_ALLOWANCE_REACHED":
      case "AI_COST_ALLOWANCE_REACHED":
        return { message: message || "You've reached your AI allowance for now. It resets automatically — or upgrade for a higher limit.", retryable: false, upgrade: true, kind: "limit" };
      case "REVISION_SUBSCRIPTION_REQUIRED":
      case "PLAN_REQUIRED":
      case "ENTITLEMENT_REQUIRED":
        return { message: message || "An active subscription is required for the AI study engine.", retryable: false, upgrade: true, kind: "entitlement" };
      case "AI_NOT_CONFIGURED":
      case "AI_SCHOOL_NOT_PUBLISHED":
        return { message: message || "No AI provider is connected yet. Connect one in Revision → AI Configuration, or ask your institute to publish the shared AI.", retryable: false, upgrade: false, kind: "config" };
      case "NO_READABLE_CONTENT":
        return { message: message || "I couldn't read any content in this module yet, so there is nothing to ground an answer in.", retryable: false, upgrade: false, kind: "content" };
      case "MODULE_NOT_FOUND":
      case "NOT_OWNER":
        return { message: "That module isn't available to this account.", retryable: false, upgrade: false, kind: "ownership" };
      case "VALIDATION":
        return { message: message || "Check the request and try again.", retryable: false, upgrade: false, kind: "input" };
      case "AI_SERVER_BUSY":
      case "TIME_BUDGET":
        return { message: message || "The AI server is busy. Nothing was charged — please try again in a moment.", retryable: true, upgrade: false, kind: "busy" };
      case "AI_EMPTY":
      case "AI_INVALID_JSON":
      case "PROVIDER_ERROR":
        return { message: message || "The AI didn't return a usable answer. Nothing was charged — please try again.", retryable: true, upgrade: false, kind: "provider" };
      case "NETWORK_ERROR":
        return { message: "Network problem — your device couldn't reach the AI service. Check your connection and try again.", retryable: true, upgrade: false, kind: "network" };
      // `/api/personal-ai` shares one deployed function with several features.
      // A 2xx that is `ok` but carries no `data` means the AI never ran, so the
      // learner must be told to reload — not left on a generic failure that
      // reads like an AI outage.
      case "AI_ROUTE_UNAVAILABLE":
        return { message: message || "The AI endpoint didn't answer this request — the shared API replied with a different service's result. Reload the page and try again.", retryable: true, upgrade: false, kind: "server" };
      default:
        return null;
    }
  };
  const mapped = switchOn();
  if (mapped) return { code: code || "AI_ERROR", ...mapped };
  if (status === 429) return { code: code || "AI_ALLOWANCE_REACHED", message: message || "AI limit reached. Try again later or upgrade your plan.", retryable: false, upgrade: true, kind: "limit" };
  if (status === 401 || status === 403) return { code: code || "AUTH_REQUIRED", message: message || "Your session needs refreshing before the AI can answer.", retryable: false, upgrade: false, kind: "auth" };
  if (status >= 500 || status === 0) return { code: code || "SERVER_ERROR", message: message || "The AI service didn't respond. Nothing was charged — please try again.", retryable: true, upgrade: false, kind: "server" };
  return { code: code || "AI_ERROR", message: message || "Something went wrong while asking the AI. Please try again.", retryable: status === 0 || status >= 500, upgrade: false, kind: "unknown" };
};

/** Copy for a resource the AI can see but not read. */
export const personalAiUnreadableCopy = (availability) => {
  const row = asRecord(availability);
  return row.reason
    ? cleanAiText(row.reason, 400)
    : "I can see that this resource exists, but I couldn't read its contents.";
};
