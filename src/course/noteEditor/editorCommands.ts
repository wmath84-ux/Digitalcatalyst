// src/course/noteEditor/editorCommands.ts
//
// The editor's COMMANDS and its programmatic document API — everything that
// reads or changes a live editor, with no React and no DOM beyond BlockNote's.
// NotesPanel never reaches into the editor; it goes through the handle that
// `NoteEditor.tsx` builds from these functions.
//
//   · NOTE_BLOCK_COMMANDS — the one list behind the slash menu (/paragraph
//     /heading /list /numbered /checklist /quote /code /divider), the block
//     type selector and the docked touch toolbar. Icons are the React layer's
//     business (it maps `key` → icon), so this list stays pure.
//   · readNoteBody / loadNoteBody / isNoteBodyEmpty — the document API.
//     `loadNoteBody` writes the document WITHOUT a history entry, so loading a
//     note can never be undone into the previous one ("clean history boundary").

import type { BlockIdentifier } from "@blocknote/core";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import type { NoteEditorInstance } from "./editorFactory";
import { importLegacyHtml } from "./editorMigration";
import { serializeNoteBody } from "./editorSerialization";
import type { NoteImportReport, NotePartialBlock } from "./editorTypes";

export type NoteCommandKey =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "numberedList"
  | "checklist"
  | "quote"
  | "code"
  | "divider";

export interface NoteBlockCommand {
  key: NoteCommandKey;
  title: string;
  subtext: string;
  /** What the slash menu filters on (the title is always searched too). */
  aliases: string[];
  group: "Text" | "Lists" | "Blocks";
}

export const NOTE_BLOCK_COMMANDS: readonly NoteBlockCommand[] = [
  { key: "paragraph", title: "Paragraph", subtext: "Plain text", aliases: ["paragraph", "text", "plain", "p"], group: "Text" },
  { key: "heading1", title: "Heading 1", subtext: "Large section heading", aliases: ["heading", "h1", "title", "big"], group: "Text" },
  { key: "heading2", title: "Heading 2", subtext: "Medium section heading", aliases: ["heading", "h2", "subtitle"], group: "Text" },
  { key: "heading3", title: "Heading 3", subtext: "Small section heading", aliases: ["heading", "h3", "small"], group: "Text" },
  { key: "bulletList", title: "Bullet list", subtext: "A simple list of points", aliases: ["list", "bullet", "bullets", "ul", "unordered"], group: "Lists" },
  { key: "numberedList", title: "Numbered list", subtext: "Steps, in order", aliases: ["numbered", "number", "ordered", "ol", "list", "steps"], group: "Lists" },
  { key: "checklist", title: "Checklist", subtext: "Track tasks as you go", aliases: ["checklist", "check", "todo", "task", "checkbox"], group: "Lists" },
  { key: "quote", title: "Quote", subtext: "Call out a quotation", aliases: ["quote", "blockquote", "cite"], group: "Blocks" },
  { key: "code", title: "Code", subtext: "Monospaced snippet", aliases: ["code", "codeblock", "snippet", "pre"], group: "Blocks" },
  { key: "divider", title: "Divider", subtext: "A line between sections", aliases: ["divider", "hr", "line", "separator", "rule"], group: "Blocks" },
];

const BLOCK_FOR: Record<NoteCommandKey, NotePartialBlock> = {
  paragraph: { type: "paragraph" },
  heading1: { type: "heading", props: { level: 1 } },
  heading2: { type: "heading", props: { level: 2 } },
  heading3: { type: "heading", props: { level: 3 } },
  bulletList: { type: "bulletListItem" },
  numberedList: { type: "numberedListItem" },
  checklist: { type: "checkListItem" },
  quote: { type: "quote" },
  code: { type: "codeBlock" },
  divider: { type: "divider" },
};

/** The commands whose title / aliases match what the learner typed after "/". */
export function filterNoteCommands(query: string): NoteBlockCommand[] {
  const items = NOTE_BLOCK_COMMANDS.map((command) => ({ ...command, onItemClick: () => undefined }));
  return filterSuggestionItems(items, query).map(({ key }) => NOTE_BLOCK_COMMANDS.find((command) => command.key === key)!);
}

/**
 * Run a slash-menu command: removes the typed "/query", then converts the
 * current (empty) block in place or inserts the block after a non-empty one.
 */
export function runSlashCommand(editor: NoteEditorInstance, key: NoteCommandKey): void {
  insertOrUpdateBlockForSlashMenu(editor, BLOCK_FOR[key]);
}

// ── The document API ────────────────────────────────────────────────────────

/** The body as stored HTML — serialised through the explicit adapter. */
export function readNoteBody(editor: NoteEditorInstance): string {
  return serializeNoteBody(editor.document);
}

/** True when the document holds nothing but blank lines. */
export function isNoteBodyEmpty(editor: NoteEditorInstance): boolean {
  return serializeNoteBody(editor.document) === "";
}

/**
 * Replace the whole document with a (legacy or stored) body, as one
 * history-less transaction: the undo stack starts empty, so the first Undo can
 * never resurrect the previous note.
 */
export function loadNoteBody(editor: NoteEditorInstance, bodyHtml: string): NoteImportReport {
  const report = importLegacyHtml(bodyHtml);
  const next: NotePartialBlock[] = report.blocks.length ? report.blocks : [{ type: "paragraph" }];
  editor.transact((tr) => {
    tr.setMeta("addToHistory", false);
    editor.replaceBlocks(editor.document, next);
  });
  return report;
}

/**
 * Put the caret at the start or the end of the body.
 *
 * A divider or a preserved table has no text to put a caret in, so: at the START
 * the first block that does; at the END — where the learner means to keep
 * writing — a blank line is opened after it (a trailing blank line is trimmed
 * again on save, so this can never alter a stored note).
 */
export function focusNoteBody(editor: NoteEditorInstance, position: "start" | "end" = "end"): void {
  const blocks = editor.document;
  const hasText = (block: (typeof blocks)[number]) => Array.isArray(block.content);
  let target: BlockIdentifier | undefined;
  if (position === "start") {
    target = blocks.find(hasText);
  } else {
    const last = blocks[blocks.length - 1];
    if (last && !hasText(last)) {
      const [created] = editor.insertBlocks([{ type: "paragraph" }], last, "after");
      target = created;
    } else {
      target = last;
    }
  }
  if (target) {
    try {
      editor.setTextCursorPosition(target, position);
    } catch {
      /* nothing writable: leave the caret where it is */
    }
  }
  editor.focus();
}
