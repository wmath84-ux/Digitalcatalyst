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
  createInlineContentSpec,
  createStyleSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { sanitizeRichText } from "../../utils/richText";
import { MAX_NOTE_MATH_SOURCE_LENGTH, mathSourceText, renderMathSource } from "./mathRendering";
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

// ── Native, editable math nodes ────────────────────────────────────────────

const safeLatex = (value: unknown): string => String(value ?? "").slice(0, MAX_NOTE_MATH_SOURCE_LENGTH);

/** Render KaTeX output only from the bounded, trust-disabled renderer. */
const paintMath = (target: HTMLElement, latex: string, displayMode: boolean): void => {
  const result = renderMathSource(latex, displayMode);
  target.replaceChildren();
  target.className = displayMode ? "dc-note-math-rendered dc-note-math-rendered-block" : "dc-note-math-rendered dc-note-math-rendered-inline";
  if (result.valid) target.innerHTML = result.html;
  else target.textContent = mathSourceText(latex, displayMode);
};

/** A small DOM-native source editor shared by inline and block formula nodes. */
const createMathSourcePanel = (
  initialSource: string,
  onApply: (source: string) => void,
  onDelete: () => void,
): { panel: HTMLDivElement; focus: (anchor: HTMLElement) => void } => {
  const panel = document.createElement("div");
  panel.className = "dc-note-math-source-panel";
  panel.setAttribute("contenteditable", "false");
  panel.hidden = true;

  const label = document.createElement("label");
  label.className = "dc-note-math-source-label";
  const labelText = document.createElement("span");
  labelText.textContent = "LaTeX source";
  const textarea = document.createElement("textarea");
  textarea.className = "dc-note-math-source-input";
  textarea.setAttribute("aria-label", "LaTeX formula source");
  textarea.rows = 2;
  textarea.value = initialSource;
  label.append(labelText, textarea);

  const actions = document.createElement("div");
  actions.className = "dc-note-math-source-actions";
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "dc-note-math-source-apply";
  apply.textContent = "Apply";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "dc-note-math-source-cancel";
  cancel.textContent = "Cancel";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "dc-note-math-source-delete";
  remove.textContent = "Delete formula";
  actions.append(apply, cancel, remove);
  panel.append(label, actions);

  const close = () => { panel.hidden = true; };
  const stopEditorEvent = (event: Event) => event.stopPropagation();
  panel.addEventListener("mousedown", stopEditorEvent);
  panel.addEventListener("click", stopEditorEvent);
  apply.addEventListener("click", () => { onApply(safeLatex(textarea.value)); close(); });
  cancel.addEventListener("click", close);
  remove.addEventListener("click", () => { close(); onDelete(); });
  textarea.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); apply.click(); }
  });

  return {
    panel,
    focus: (anchor) => {
      panel.hidden = false;
      const view = panel.ownerDocument.defaultView;
      const placeAndFocus = () => {
        const anchorBox = anchor.getBoundingClientRect();
        const visual = view?.visualViewport;
        const leftEdge = visual?.offsetLeft ?? 0;
        const topEdge = visual?.offsetTop ?? 0;
        const viewportWidth = visual?.width ?? view?.innerWidth ?? 0;
        const viewportHeight = visual?.height ?? view?.innerHeight ?? 0;
        const panelBox = panel.getBoundingClientRect();
        const left = Math.max(leftEdge + 8, Math.min(anchorBox.left, leftEdge + viewportWidth - panelBox.width - 8));
        const below = topEdge + viewportHeight - anchorBox.bottom;
        const preferredTop = below >= panelBox.height + 12
          ? anchorBox.bottom + 6
          : anchorBox.top - panelBox.height - 6;
        const top = Math.max(topEdge + 8, Math.min(preferredTop, topEdge + viewportHeight - panelBox.height - 8));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        textarea.focus();
        textarea.select();
      };
      if (view) view.requestAnimationFrame(placeAndFocus);
      else placeAndFocus();
    },
  };
};

const mathInline = createInlineContentSpec(
  {
    type: "math" as const,
    propSchema: { latex: { default: "" } },
    content: "none",
  },
  {
    meta: { draggable: false },
    parse(element) {
      if (element.getAttribute("data-note-math") !== "inline") return undefined;
      return { latex: safeLatex(element.getAttribute("data-latex") ?? element.textContent) };
    },
    render(inlineContent, updateInlineContent, editor, node, getPos) {
      const latex = safeLatex(inlineContent.props.latex);
      const dom = document.createElement("span");
      dom.className = "dc-note-math-inline-node";
      dom.setAttribute("data-note-math-node", "inline");
      dom.setAttribute("contenteditable", "false");

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "dc-note-math-trigger dc-note-math-inline-trigger";
      trigger.setAttribute("aria-label", "Edit inline formula");
      trigger.title = "Click to edit formula source";
      const preview = document.createElement("span");
      paintMath(preview, latex, false);
      trigger.appendChild(preview);

      const removeInline = () => {
        if (!editor.isEditable) return;
        const position = getPos();
        if (typeof position !== "number") return;
        editor.transact((transaction) => transaction.delete(position, position + node.nodeSize));
      };
      const sourcePanel = createMathSourcePanel(latex, (next) => {
        if (!editor.isEditable) return;
        updateInlineContent({ type: "math", props: { latex: next } });
        paintMath(preview, next, false);
      }, removeInline);
      dom.append(trigger, sourcePanel.panel);
      trigger.addEventListener("mousedown", (event) => event.stopPropagation());
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!editor.isEditable) return;
        sourcePanel.focus(trigger);
      });

      return { dom, ignoreMutation: () => true };
    },
    toExternalHTML(inlineContent) {
      const latex = safeLatex(inlineContent.props.latex);
      const dom = document.createElement("span");
      dom.setAttribute("data-note-math", "inline");
      dom.setAttribute("data-latex", latex);
      dom.textContent = mathSourceText(latex, false);
      return { dom };
    },
  },
);

const mathBlock = createBlockSpec(
  {
    type: "mathBlock" as const,
    propSchema: { latex: { default: "" } },
    content: "none",
  },
  {
    meta: { selectable: true },
    parse(element) {
      if (element.getAttribute("data-note-math") !== "block") return undefined;
      return { latex: safeLatex(element.getAttribute("data-latex") ?? element.textContent) };
    },
    render(block, editor) {
      const latex = safeLatex(block.props.latex);
      const dom = document.createElement("div");
      dom.className = "dc-note-math-block-node";
      dom.setAttribute("data-note-math-node", "block");
      dom.setAttribute("contenteditable", "false");

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "dc-note-math-trigger dc-note-math-block-trigger";
      trigger.setAttribute("aria-label", "Edit block formula");
      trigger.title = "Click to edit formula source";
      const preview = document.createElement("span");
      paintMath(preview, latex, true);
      trigger.appendChild(preview);

      const sourcePanel = createMathSourcePanel(
        latex,
        (next) => {
          if (!editor.isEditable) return;
          editor.updateBlock(block.id, { props: { latex: next } });
          paintMath(preview, next, true);
        },
        () => { if (editor.isEditable) editor.removeBlocks([block.id]); },
      );
      dom.append(trigger, sourcePanel.panel);
      trigger.addEventListener("mousedown", (event) => event.stopPropagation());
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!editor.isEditable) return;
        sourcePanel.focus(trigger);
      });

      return { dom, ignoreMutation: () => true, update: () => false };
    },
    toExternalHTML(block) {
      const latex = safeLatex(block.props.latex);
      const dom = document.createElement("div");
      dom.setAttribute("data-note-math", "block");
      dom.setAttribute("data-latex", latex);
      dom.textContent = mathSourceText(latex, true);
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
    mathBlock: mathBlock(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    math: mathInline,
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
  /** Same for plain-text-only clipboard — selectively parses Markdown/math, otherwise literal. */
  pastePlain?: (text: string, editor: NoteEditorInstance) => boolean;
  /** Extra attributes on the contenteditable (aria-label, test hooks…). */
  editableAttributes?: Record<string, string>;
}

/**
 * Build ONE editor instance. Everything the player needs to be true of every
 * editor lives here: the schema, safe links, explicit plain-text paste handling, no
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
      // The player normalizes recognized Markdown / math in the custom hook;
      // ordinary text falls through literally. Keep BlockNote's own Markdown
      // paste disabled so it cannot reinterpret ambiguous prose on fallback.
      const files = Array.from(data?.types || []).includes("Files");
      if (!html && plain && !files && pastePlain && pastePlain(plain, typed)) return true;
      return defaultPasteHandler({ plainTextAsMarkdown: false, prioritizeMarkdownOverHTML: false });
    },
  });
}
