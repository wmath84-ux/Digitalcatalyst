// src/ai/aiNotes.ts
//
// Bridge between the AI Study Engine and the EXISTING notes system.
//
// The course-player notes store (`src/course/notesStore.ts`) already keys notes
// per user + product and `CoursePlayerNote` already carries optional
// `moduleId` / `resourceId`, so personal-module AI output joins that store
// instead of inventing a second one:
//
//   · Reading: notes whose `moduleId` is this personal module (in either the
//     module's own product scope or the central `__library__` scope) are offered
//     to the server as grounding units. They are the learner's OWN private text,
//     sent by the learner for the learner's own module.
//   · Writing: "Save as note" APPENDS a new note. It never edits, replaces or
//     deletes a learner-written note, and every AI note is stamped
//     `aiGenerated: true` + `aiKind` so the Notes panel can label it.

import { loadLocalNotes, persistLocalNotes } from "../course/notesStore";
import { escapeHtml, richTextToPlain } from "../utils/richText";
import type { CoursePlayerNote } from "../types/course";
import type { PersonalAiNoteInput } from "./types";

/** Central My Study Library scope used when a module has no course product. */
export const LIBRARY_NOTE_SCOPE = "__library__";

const noteId = () => {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
};

/** Every note scope that could hold this module's notes. */
const scopesFor = (productId?: string | null) => {
  const scopes = new Set<string>([LIBRARY_NOTE_SCOPE]);
  if (productId && productId !== LIBRARY_NOTE_SCOPE) scopes.add(productId);
  return Array.from(scopes);
};

/**
 * Notes the learner already wrote for one personal module, grouped so the
 * server can attach them to the right resource (`resourceId`) or to the module
 * itself. De-duplicated across scopes by note id.
 */
export function collectModuleNotes(input: {
  uid: string;
  productId?: string | null;
  moduleId: string;
  resourceIds?: string[];
}): PersonalAiNoteInput[] {
  const { uid, moduleId } = input;
  if (!uid || !moduleId) return [];
  const wanted = new Set(input.resourceIds || []);
  const seen = new Set<string>();
  const notes: PersonalAiNoteInput[] = [];
  for (const scope of scopesFor(input.productId)) {
    for (const note of loadLocalNotes(uid, scope)) {
      if (note.moduleId !== moduleId) continue;
      if (note.id && seen.has(note.id)) continue;
      seen.add(note.id);
      const text = (note.text || richTextToPlain(note.html || "")).trim();
      if (!text) continue;
      const resourceId = note.resourceId && wanted.has(note.resourceId) ? note.resourceId : null;
      notes.push({ id: note.id, text, resourceId });
      if (notes.length >= 60) return notes;
    }
  }
  return notes;
}

export interface SaveAiNoteInput {
  uid: string;
  productId?: string | null;
  moduleId: string;
  resourceId?: string | null;
  /** Heading shown as the note's first block (same layout as a typed note). */
  title: string;
  /** Plain-text body; converted to safe HTML, never raw-injected. */
  body: string;
  kind: NonNullable<CoursePlayerNote["aiKind"]>;
}

/**
 * Append one AI-generated note. Returns the stored note (or null when the body
 * was empty). Existing notes are always preserved — the new note is prepended
 * to the list exactly like the player's own `saveNote`.
 */
export function saveAiNote(input: SaveAiNoteInput): CoursePlayerNote | null {
  const body = String(input.body || "").trim();
  if (!input.uid || !body) return null;
  const scope = input.productId || LIBRARY_NOTE_SCOPE;
  const title = String(input.title || "AI note").trim().slice(0, 120);
  const html = `<h1>${escapeHtml(title)}</h1><hr>${body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const isList = lines.length > 1 && lines.every((line) => /^([-•*]|\d+[.)])\s+/.test(line));
      if (!isList) return `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
      return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(/^([-•*]|\d+[.)])\s+/, ""))}</li>`).join("")}</ul>`;
    })
    .join("")}`;
  const note: CoursePlayerNote = {
    id: noteId(),
    text: richTextToPlain(html),
    html,
    createdAt: Date.now(),
    moduleId: input.moduleId,
    resourceId: input.resourceId || undefined,
    aiGenerated: true,
    aiKind: input.kind,
    personalModuleId: input.moduleId,
    personalResourceId: input.resourceId || undefined,
  };
  const existing = loadLocalNotes(input.uid, scope);
  persistLocalNotes(input.uid, scope, [note, ...existing]);
  return note;
}
