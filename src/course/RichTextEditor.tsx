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

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { Bold, Code, Italic, List, ListOrdered, Quote, Strikethrough, Underline, Eraser } from "lucide-react";
import { plainToRichText, sanitizeRichText } from "../utils/richText";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
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
  try {
    document.execCommand(command, false, value);
  } catch {
    /* unsupported command — the surface stays editable either way */
  }
};

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your note…",
  autoFocus = false,
  surfaceClassName = "min-h-[42vh]",
  ariaLabel = "Note editor",
  dataAttribute,
}: RichTextEditorProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Tracks what we last pushed upward so re-renders never clobber the caret.
  const lastEmitted = useRef<string>(value);
  const hydrated = useRef(false);

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
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-course-rich-editor>
      <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-t-xl border border-b-0 border-[var(--course-border)] bg-[var(--course-soft)] px-1.5 py-1.5" data-course-rich-toolbar>
        {actions.map(({ key, label, icon: Icon, run }) => (
          <button
            key={key}
            type="button"
            // `onMouseDown` keeps the caret / selection inside the surface.
            onMouseDown={(event) => {
              event.preventDefault();
              surfaceRef.current?.focus();
              run();
              emit();
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
            aria-label={label}
            title={label}
            data-course-rich-action={key}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
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
        className={`course-rich-surface min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-b-xl border border-[var(--course-border)] bg-[var(--course-soft)] p-3 text-sm leading-relaxed text-[var(--course-text)] outline-none focus:border-violet-400 ${surfaceClassName}`}
        {...(dataAttribute ? { [dataAttribute]: "true" } : {})}
      />
    </div>
  );
}
