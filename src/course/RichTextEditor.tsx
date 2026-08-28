// src/course/RichTextEditor.tsx
//
// Course Player notes — rich text editor.
//
// A contentEditable surface that keeps the EXACT formatting of anything the
// user pastes into it: bold / italic / underline / strike, headings, lists,
// tables, links, inline code, code blocks, colours, highlights, images and
// emoji all survive the round-trip. Pasted HTML is sanitised (see
// `utils/richText`) so a hostile page can never smuggle a script in, but the
// presentational markup itself is preserved verbatim rather than flattened.
//
// A plain-text paste (Ctrl/Cmd + Shift + V, or a source with no HTML flavour)
// keeps its line breaks and indentation instead of collapsing to one line.

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type CSSProperties, type ReactNode } from "react";
import { Bold, Code, Italic, List, ListOrdered, Quote, Strikethrough, Underline, Eraser, Palette, Type, ChevronDown, SeparatorHorizontal } from "lucide-react";
import { plainToRichText, richTextToPlain, sanitizeRichText } from "../utils/richText";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  /**
   * Optional note HEADING (title) shown above the writing surface, separated
   * by a horizontal rule like mainstream note apps. When provided, a heading
   * area is rendered and its HTML is reported through `onHeadingChange`.
   */
  heading?: string;
  onHeadingChange?: (html: string) => void;
  /** Focus the heading field on mount instead of the writing surface. */
  headingAutoFocus?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Tailwind classes controlling the writing surface height. */
  surfaceClassName?: string;
  ariaLabel?: string;
  /** Test / integration hook forwarded to the editable surface. */
  dataAttribute?: string;
}

type ToolbarAction = {
  key: string;
  label: string;
  icon: typeof Bold;
  run: () => void;
};

const exec = (command: string, value?: string) => {
  try { document.execCommand(command, false, value); } catch { /* unsupported command */ }
};

function MenuItem({ label, onClick, style }: { label: string; onClick: () => void; style?: CSSProperties }) {
  return <button type="button" style={style} onMouseDown={e => e.preventDefault()} onClick={onClick} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100">{label}</button>;
}

function FormatMenu({ label, icon, open, onToggle, children }: { label: string; icon: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <div className="relative">
    <button type="button" aria-label={label} title={label} onMouseDown={e => e.preventDefault()} onClick={onToggle} className="flex h-8 items-center gap-1 rounded-lg px-2 text-[var(--course-muted)] hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"><span>{icon}</span><span className="hidden text-xs sm:inline">{label}</span><ChevronDown size={11} /></button>
    {open && <div className="absolute left-0 top-9 z-20 min-w-[145px] rounded-lg border border-slate-200 bg-white p-1 shadow-xl">{children}</div>}
  </div>;
}

export default function RichTextEditor({
  value,
  onChange,
  heading,
  onHeadingChange,
  headingAutoFocus = false,
  placeholder = "Write your note…",
  autoFocus = false,
  surfaceClassName = "min-h-[42vh]",
  ariaLabel = "Note editor",
  dataAttribute,
}: RichTextEditorProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<"heading" | "color" | "font" | null>(null);
  // Tracks what we last pushed upward so re-renders never clobber the caret.
  const lastEmitted = useRef<string>(value);
  const hydrated = useRef(false);
  const lastHeadingEmitted = useRef<string>(heading ?? "");
  const hydratedHeading = useRef(false);

  const showHeading = heading !== undefined;

  const syncEmptyFlag = (surface: HTMLDivElement) => {
    // contentEditable leaves a stray <br> behind after the last character is
    // deleted, so `:empty` alone can't drive the placeholder.
    surface.dataset.empty = surface.textContent?.trim() || surface.querySelector("img") ? "false" : "true";
  };

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    // The first pass ALWAYS writes, otherwise reopening an existing note for
    // editing would show a blank surface (the ref already equals `value`).
    if (hydrated.current && value === lastEmitted.current) {
      syncEmptyFlag(surface);
      return;
    }
    surface.innerHTML = value || "";
    lastEmitted.current = value;
    hydrated.current = true;
    syncEmptyFlag(surface);
  }, [value]);

  // Heading field — hydrated exactly like the body, so switching between
  // notes (or reopening an editor) never shows a stale or blank title.
  useEffect(() => {
    const el = headingRef.current;
    if (!el) return;
    if (hydratedHeading.current && heading === lastHeadingEmitted.current) {
      syncEmptyFlag(el);
      return;
    }
    el.innerHTML = heading || "";
    lastHeadingEmitted.current = heading ?? "";
    hydratedHeading.current = true;
    syncEmptyFlag(el);
  }, [heading]);

  useEffect(() => {
    if (!autoFocus) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.focus();
    // Drop the caret at the very end of the existing content.
    const selection = window.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(surface);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [autoFocus]);

  // A fresh note starts with the heading focused (like Notion / Keep); an
  // existing note being edited keeps the caret in the body instead.
  useEffect(() => {
    if (!headingAutoFocus) return;
    const el = headingRef.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [headingAutoFocus]);

  const emitHeading = () => {
    const el = headingRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastHeadingEmitted.current = html;
    syncEmptyFlag(el);
    onHeadingChange?.(html);
  };

  // Enter in the title jumps to the body (like Notion / Keep) — the title
  // stays a single line; the caret simply moves into the writing surface.
  const handleHeadingKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const surface = surfaceRef.current;
      if (surface) {
        surface.focus();
        const selection = window.getSelection?.();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(surface);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  };

  // Pasting into the heading keeps it plain — the title is stored as a
  // single text line, so formatting pasted there would only be flattened
  // away on save anyway.
  const handleHeadingPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const html = clipboard.getData("text/html");
    const plain = clipboard.getData("text/plain");
    if (!html && !plain) return;
    event.preventDefault();
    const markup = plainToRichText(plain || richTextToPlain(html));
    if (!markup) return;
    exec("insertHTML", markup);
    emitHeading();
  };

  const emit = () => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const html = surface.innerHTML;
    lastEmitted.current = html;
    syncEmptyFlag(surface);
    onChange(html);
  };

  // Paste keeps the source formatting. `text/html` is sanitised and inserted
  // as-is; a plain-text-only clipboard is converted so newlines survive.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const html = clipboard.getData("text/html");
    const plain = clipboard.getData("text/plain");
    if (!html && !plain) return;
    event.preventDefault();
    const markup = html ? sanitizeRichText(html) : plainToRichText(plain);
    if (!markup) return;
    exec("insertHTML", markup);
    emit();
  };

  // Dropping a selection from another document behaves exactly like a paste.
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const html = event.dataTransfer?.getData("text/html");
    const plain = event.dataTransfer?.getData("text/plain");
    if (!html && !plain) return;
    event.preventDefault();
    const markup = html ? sanitizeRichText(html) : plainToRichText(plain);
    if (!markup) return;
    exec("insertHTML", markup);
    emit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const meta = event.metaKey || event.ctrlKey;
    if (!meta) return;
    const key = event.key.toLowerCase();
    if (key === "b") { event.preventDefault(); exec("bold"); emit(); }
    if (key === "i") { event.preventDefault(); exec("italic"); emit(); }
    if (key === "u") { event.preventDefault(); exec("underline"); emit(); }
  };

  const actions: ToolbarAction[] = [
    { key: "bold", label: "Bold", icon: Bold, run: () => exec("bold") },
    { key: "italic", label: "Italic", icon: Italic, run: () => exec("italic") },
    { key: "underline", label: "Underline", icon: Underline, run: () => exec("underline") },
    { key: "strike", label: "Strikethrough", icon: Strikethrough, run: () => exec("strikeThrough") },
    { key: "bullet", label: "Bulleted list", icon: List, run: () => exec("insertUnorderedList") },
    { key: "numbered", label: "Numbered list", icon: ListOrdered, run: () => exec("insertOrderedList") },
    { key: "quote", label: "Quote", icon: Quote, run: () => exec("formatBlock", "blockquote") },
    { key: "code", label: "Code block", icon: Code, run: () => exec("formatBlock", "pre") },
    { key: "clear", label: "Clear formatting", icon: Eraser, run: () => exec("removeFormat") },
    { key: "divider", label: "Horizontal line", icon: SeparatorHorizontal, run: () => exec("insertHorizontalRule") },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-course-rich-editor>
      <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-t-xl border border-b-0 border-[var(--course-border)] bg-[var(--course-soft)] px-1.5 py-1.5" data-course-rich-toolbar>
        <FormatMenu label="Heading" icon={<Type size={14} />} open={openMenu === "heading"} onToggle={() => setOpenMenu(openMenu === "heading" ? null : "heading")}>
          {[1, 2, 3, 4, 5].map(level => <MenuItem key={level} label={`Heading ${level}`} onClick={() => { exec("formatBlock", `h${level}`); emit(); setOpenMenu(null); }} />)}
        </FormatMenu>
        <FormatMenu label="Text color" icon={<Palette size={14} />} open={openMenu === "color"} onToggle={() => setOpenMenu(openMenu === "color" ? null : "color")}>
          <div className="grid grid-cols-6 gap-2 p-2">
            {["#202124", "#d93025", "#e37400", "#fbbc04", "#34a853", "#1a73e8", "#9334e8", "#e91e63", "#795548", "#607d8b", "#ffffff", "#eeeeee"].map(color => <button key={color} type="button" aria-label={color} className="h-6 w-6 rounded-full border border-black/15 shadow-sm" style={{ backgroundColor: color }} onMouseDown={e => e.preventDefault()} onClick={() => { surfaceRef.current?.focus(); exec("foreColor", color); emit(); setOpenMenu(null); }} />)}
            <label className="col-span-6 flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600"><span className="h-5 w-5 rounded-full border" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />Custom color<input type="color" className="sr-only" onChange={e => { surfaceRef.current?.focus(); exec("foreColor", e.target.value); emit(); setOpenMenu(null); }} /></label>
          </div>
        </FormatMenu>
        <FormatMenu label="Font" icon={<span className="text-xs font-bold">Aa</span>} open={openMenu === "font"} onToggle={() => setOpenMenu(openMenu === "font" ? null : "font")}>
          {['Arial','Calibri','Cambria','Comic Sans MS','Courier New','Georgia','Helvetica','Roboto','Times New Roman','Trebuchet MS','Verdana'].map(font => <MenuItem key={font} label={font} style={{ fontFamily: font }} onClick={() => { exec("fontName", font); emit(); setOpenMenu(null); }} />)}
        </FormatMenu>
        {actions.map(({ key, label, icon: Icon, run }) => (
          <button key={key} type="button" onMouseDown={(event) => { event.preventDefault(); surfaceRef.current?.focus(); run(); emit(); }} className="grid h-8 w-8 rounded-lg place-items-center text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]" aria-label={label} title={label} data-course-rich-action={key}><Icon size={14} /><span className="sr-only">{label}</span></button>
        ))}
      </div>
      {/* Heading (title) area — a default title field above the body,
          separated by a horizontal rule exactly like mainstream note
          editors (Notion, Keep, Apple Notes). The divider line is part of
          the editor chrome; the body's own <hr> button inserts dividers
          INSIDE the note. */}
      {showHeading && (
        <div className="shrink-0 border-x border-[var(--course-border)] bg-[var(--course-soft)] px-3 pt-3" data-course-note-heading>
          <div
            ref={headingRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Note heading"
            aria-multiline="false"
            data-placeholder="Heading…"
            data-course-note-heading-input="true"
            onInput={emitHeading}
            onBlur={emitHeading}
            onPaste={handleHeadingPaste}
            onKeyDown={handleHeadingKeyDown}
            className="course-note-title outline-none"
          />
          <hr className="course-note-title-divider" />
        </div>
      )}
      <div
        ref={surfaceRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        className={`course-rich-surface min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-b-xl bg-[var(--course-soft)] p-3 text-sm leading-relaxed text-[var(--course-text)] outline-none focus:border-violet-400 ${showHeading ? "border-x border-b border-[var(--course-border)]" : "border border-[var(--course-border)]"} ${surfaceClassName}`}
        {...(dataAttribute ? { [dataAttribute]: "true" } : {})}
      />
    </div>
  );
}
