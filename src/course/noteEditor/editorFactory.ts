// src/course/noteEditor/editorFactory.ts
//
// The Course Player note editor's SCHEMA and the one factory that builds an
// editor instance from it. No React in here — the schema (and everything the
// importer / serialiser / commands need from it) is exercised headlessly by
// the Node test runner.
//
// What the schema is:
//
//   blocks   paragraph · heading 1–3 · bullet · numbered · checklist · quote ·
//            code · divider — plus ONE internal block, `legacyHtml`.
//   styles   bold · italic · underline · strike · inline code (the toolbar's
//            set), plus the colour / super / subscript styles that exist ONLY
//            so a legacy note's colours and x² survive an open → save.
//   inline   text + link.
//
// `legacyHtml` is the controlled fallback of the migration (see
// ./editorMigration): any legacy HTML the editor cannot represent faithfully —
// a table, an image, a definition list — is kept VERBATIM inside this block,
// rendered read-only through the player's sanitiser and written back
// unchanged. Nothing a learner wrote is ever dropped silently. It is also the
// seam the later educational blocks (callout, flashcard, …) plug into: a new
// block is one more `createBlockSpec` entry in `noteSchema`.

import {
  BlockNoteEditor,
  BlockNoteSchema,
  createBlockSpec,
  createCodeBlockSpec,
  createHeadingBlockSpec,
  createStyleSpec,
  defaultBlockSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { sanitizeRichText } from "../../utils/richText";
import { installRuntimeCompat } from "./editorRuntime";
import type { NotePartialBlock } from "./editorTypes";

/** Link schemes the player's sanitiser allows — the editor allows exactly these. */
const SAFE_LINK = /^(https?:|mailto:|tel:)/i;
export const isNoteLinkAllowed = (href: string): boolean => SAFE_LINK.test(String(href || "").trim());

// ── Internal block: verbatim legacy HTML ────────────────────────────────────

const legacyHtmlBlock = createBlockSpec(
  {
    type: "legacyHtml" as const,
    propSchema: { html: { default: "" } },
    content: "none",
  },
  {
    // Atom: the caret skips over it, Backspace / the block menu remove it whole.
    meta: { selectable: true },
    parse() {
      // Only the editor itself ever creates these (see the importer); pasted
      // HTML goes through the importer, never straight into this block.
      return undefined;
    },
    render(block) {
      const dom = document.createElement("div");
      dom.className = "dc-note-legacy";
      dom.setAttribute("data-note-legacy", "");
      // Safe by construction: every fragment was sanitised on the way in and
      // is sanitised again on every render.
      dom.innerHTML = sanitizeRichText(block.props.html);
      return { dom };
    },
    toExternalHTML(block) {
      const dom = document.createElement("div");
      dom.innerHTML = sanitizeRichText(block.props.html);
      return { dom };
    },
  },
);

// ── Styles that exist only to keep legacy content intact ────────────────────

const superscriptStyle = createStyleSpec(
  { type: "sup", propSchema: "boolean" },
  {
    render() {
      const dom = document.createElement("sup");
      return { dom, contentDOM: dom };
    },
    toExternalHTML() {
      const dom = document.createElement("sup");
      return { dom, contentDOM: dom };
    },
    parse(element) {
      return element.tagName === "SUP" ? true : undefined;
    },
  },
);

const subscriptStyle = createStyleSpec(
  { type: "sub", propSchema: "boolean" },
  {
    render() {
      const dom = document.createElement("sub");
      return { dom, contentDOM: dom };
    },
    toExternalHTML() {
      const dom = document.createElement("sub");
      return { dom, contentDOM: dom };
    },
    parse(element) {
      return element.tagName === "SUB" ? true : undefined;
    },
  },
);

// ── The schema ──────────────────────────────────────────────────────────────

export const noteSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3], defaultLevel: 1, allowToggleHeadings: false }),
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: createCodeBlockSpec({
      defaultLanguage: "text",
      supportedLanguages: { text: { name: "Plain text" } },
      indentLineWithTab: true,
    }),
    divider: defaultBlockSpecs.divider,
    legacyHtml: legacyHtmlBlock(),
  },
  styleSpecs: {
    bold: defaultStyleSpecs.bold,
    italic: defaultStyleSpecs.italic,
    underline: defaultStyleSpecs.underline,
    strike: defaultStyleSpecs.strike,
    code: defaultStyleSpecs.code,
    textColor: defaultStyleSpecs.textColor,
    backgroundColor: defaultStyleSpecs.backgroundColor,
    sup: superscriptStyle,
    sub: subscriptStyle,
  },
});

export type NoteEditorInstance = typeof noteSchema.BlockNoteEditor;

/** Dictionary: BlockNote's English strings with the player's placeholders. */
export const noteDictionary = {
  ...en,
  placeholders: {
    ...en.placeholders,
    default: "Write something, or type / for blocks",
    heading: "Heading",
    bulletListItem: "List item",
    numberedListItem: "List item",
    checkListItem: "To-do",
  },
};

export interface CreateNoteEditorOptions {
  initialContent?: NotePartialBlock[];
  /**
   * Turns clipboard HTML into blocks. Injected so the factory stays free of
   * the importer (which itself needs the schema above).
   */
  pasteHtml?: (html: string, editor: NoteEditorInstance) => boolean;
  /** Same for a plain-text-only clipboard — kept literal (see `pasteIntoEditor`). */
  pastePlain?: (text: string, editor: NoteEditorInstance) => boolean;
  /** Extra attributes on the contenteditable (aria-label, test hooks…). */
  editableAttributes?: Record<string, string>;
}

/**
 * Build ONE editor instance. Everything the player needs to be true of every
 * editor lives here: the schema, safe links, literal plain-text paste, no
 * animations (no layout shift while typing on a phone), Tab always indents.
 */
export function createNoteEditor(options: CreateNoteEditorOptions = {}): NoteEditorInstance {
  // The engine calls two array methods an older Android WebView lacks (see
  // ./editorRuntime); they must exist before the first transaction can.
  installRuntimeCompat();
  const { initialContent, pasteHtml, pastePlain, editableAttributes } = options;
  return BlockNoteEditor.create({
    schema: noteSchema,
    initialContent: initialContent && initialContent.length ? initialContent : undefined,
    dictionary: noteDictionary,
    animations: false,
    tabBehavior: "prefer-indent",
    trailingBlock: true,
    links: {
      isValidLink: isNoteLinkAllowed,
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      // Tapping a link while writing must place the caret, never navigate the
      // Capacitor WebView away from the player. Read-only notes still open it.
      onClick: (event, editor) => {
        if (editor.isEditable) return true;
        const anchor = (event.target as HTMLElement | null)?.closest?.("a");
        const href = anchor?.getAttribute("href");
        if (href && isNoteLinkAllowed(href)) window.open(href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
    domAttributes: editableAttributes ? { editor: editableAttributes } : undefined,
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      const data = event.clipboardData;
      const html = data?.getData("text/html") || "";
      const plain = data?.getData("text/plain") || "";
      const typed = editor as unknown as NoteEditorInstance;
      if (html && pasteHtml && pasteHtml(html, typed)) return true;
      // Plain text stays literal — the legacy editor never interpreted it, and
      // "# not a heading" or "**stars**" must not turn into formatting just
      // because they were pasted (TipTap's own paste rules would bold the latter).
      const files = Array.from(data?.types || []).includes("Files");
      if (!html && plain && !files && pastePlain && pastePlain(plain, typed)) return true;
      return defaultPasteHandler({ plainTextAsMarkdown: false, prioritizeMarkdownOverHTML: false });
    },
  });
}
