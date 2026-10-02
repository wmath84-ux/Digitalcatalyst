// src/course/noteEditor/editorTypes.ts
//
// Shared types for the Course Player's block-document note editor
// (BlockNote). Pure types — importing this file never loads the editor.

import type { Block, PartialBlock } from "@blocknote/core";
import type { noteSchema } from "./editorFactory";

export type NoteSchema = typeof noteSchema;
export type NoteBlockSchema = NoteSchema["blockSchema"];
export type NoteInlineContentSchema = NoteSchema["inlineContentSchema"];
export type NoteStyleSchema = NoteSchema["styleSchema"];

/** A block as the editor reports it (ids and every default prop filled in). */
export type NoteBlock = Block<NoteBlockSchema, NoteInlineContentSchema, NoteStyleSchema>;
/** A block as the importer / commands write it (everything optional). */
export type NotePartialBlock = PartialBlock<NoteBlockSchema, NoteInlineContentSchema, NoteStyleSchema>;

/**
 * The note model the panel, the panel session and the persistence layer all
 * speak — deliberately NOT BlockNote's document. The stored note stays
 * `html` (`<h1>title</h1><hr>body`), exactly as before; this is its two halves:
 *
 *   title    — plain text (the note's leading heading)
 *   bodyHtml — sanitised HTML produced by the explicit serialisation adapter
 */
export interface NoteDraft {
  title: string;
  bodyHtml: string;
}

/** What the legacy-HTML importer did, so nothing is ever dropped silently. */
export interface NoteImportReport {
  blocks: NotePartialBlock[];
  /** Blocks kept verbatim as read-only preserved HTML (tables, images, …). */
  preservedBlocks: number;
  /** Fidelity notes — e.g. `heading-level` (h4–h6 imported as H3). */
  downgrades: string[];
}

/**
 * The ONE programmatic surface over a live editor — NotesPanel never touches
 * the DOM or BlockNote directly, it goes through this handle.
 */
export interface NoteEditorHandle {
  /** Replace the whole document. The history starts clean afterwards. */
  load: (draft: NoteDraft) => void;
  /** Flush any pending (debounced) change and return the latest note model. */
  read: () => NoteDraft;
  /** True when both title and body are empty (no storable content). */
  isEmpty: () => boolean;
  focusTitle: () => void;
  focusBody: (position?: "start" | "end") => void;
  /** Back to a blank note, history cleared. */
  reset: () => void;
  setReadOnly: (readOnly: boolean) => void;
  undo: () => boolean;
  redo: () => boolean;
}
