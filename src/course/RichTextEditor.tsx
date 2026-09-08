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

import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bold, Code, Italic, List, ListOrdered, Quote, Strikethrough, Underline, Eraser, Palette, Type, ChevronDown, SeparatorHorizontal } from "lucide-react";
import { plainToRichText, richTextToPlain, sanitizeRichText } from "../utils/richText";
import { GlassButton } from "../components/ui/glass-button";
import { GlassSurface } from "../components/ui/glass";
import { GlassSwatch } from "../components/ui/glass-swatch";
import { PopoverItem } from "../components/ui/glass-popover";

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
  return <PopoverItem style={style} onMouseDown={e => e.preventDefault()} onClick={onClick} className="rounded-md px-3 py-2">{label}</PopoverItem>;
}

function FormatMenu({ label, icon, open, onToggle, menuRef, children }: { label: string; icon: ReactNode; open: boolean; onToggle: () => void; menuRef: React.RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // The dropdown is PORTALLED to the body: the toolbar is a horizontal scroll
  // container now, and any in-flow menu would be clipped by it. Fixed
  // positioning against the toggle's own rect keeps it glued to its button
  // while the sheet animates or the keyboard lifts it, clamped into the
  // viewport so it can never hang off a phone screen.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const measure = () => {
      const box = anchorRef.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(208, window.innerWidth - 16);
      const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
      const below = box.bottom + 6;
      // Open downward; when the keyboard ate the room below, open upward.
      const top = below + 240 > window.innerHeight ? Math.max(8, box.top - 246) : below;
      setPos({ top, left, width });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  return <div ref={anchorRef} className="relative shrink-0">
    <GlassButton variant="capsule" aria-label={label} title={label} aria-expanded={open} onMouseDown={e => e.preventDefault()} onClick={onToggle} className="[&>span>div]:h-7 [&>span>div]:px-1.5"><span className="flex items-center gap-1"><span>{icon}</span><span className="hidden text-[11px] sm:inline">{label}</span><ChevronDown size={10} /></span></GlassButton>
    {open && pos ? createPortal(
      <div ref={menuRef} role="menu" aria-label={label} className="fixed z-[90]" style={{ top: pos.top, left: pos.left, width: pos.width }} data-course-rich-menu>
        <GlassSurface radius={20} className="text-white" contentClassName="max-h-[280px] overflow-y-auto p-1">{children}</GlassSurface>
      </div>,
      document.body,
    ) : null}
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
  // Wraps the toggle buttons, so "outside" can be decided against one
  // element for any of the three menus. The open dropdown itself is portalled
  // to the body (the toolbar scrolls sideways now), so it gets its own ref —
  // only one menu is ever open, which is why a single shared ref is enough.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const richMenuRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<"heading" | "color" | "font" | null>(null);
  // Tracks what we last pushed upward so re-renders never clobber the caret.
  const lastEmitted = useRef<string>(value);
  const hydrated = useRef(false);
  const lastHeadingEmitted = useRef<string>(heading ?? "");
  const hydratedHeading = useRef(false);

  const showHeading = heading !== undefined;

  // The heading / text color / font dropdowns must close the moment the
  // learner taps ANYWHERE outside them — previously only tapping the same
  // toggle (or picking an item) closed them, so a stray tap on the writing
  // surface left the menu floating over the note. The listener is armed only
  // while a menu is open and checks the press against the whole toolbar
  // (toggles + open dropdown), so:
  //   · tapping the same toggle still flips it (its own onClick runs);
  //   · tapping an item still applies the format (items close themselves);
  //   · tapping the surface / Save / Cancel / the lesson dismisses the menu.
  // The portalled menu is skipped the same way (its items close it
  // themselves after applying their format), and Escape dismisses it too.
  // It listens for pointerdown (not focus/blur) and never preventDefaults,
  // so the caret in the contentEditable surface is exactly where the tap
  // puts it afterwards — no focus stealing, no lost selection.
  useEffect(() => {
    if (openMenu === null) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target instanceof Node ? event.target : null;
      if (node && toolbarRef.current?.contains(node)) return;
      if (node && richMenuRef.current?.contains(node)) return;
      setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

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
      <div ref={toolbarRef} className="flex shrink-0 flex-nowrap items-center gap-1 overflow-x-auto rounded-t-xl border border-b-0 border-[var(--course-border)] bg-[var(--dc-chrome-glass)] px-1.5 py-1.5 [backdrop-filter:var(--dc-chrome-glass-blur)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-course-rich-toolbar onScroll={() => setOpenMenu(null)}>
        <FormatMenu label="Heading" icon={<Type size={13} />} open={openMenu === "heading"} menuRef={richMenuRef} onToggle={() => setOpenMenu(openMenu === "heading" ? null : "heading")}>
          {[1, 2, 3, 4, 5].map(level => <MenuItem key={level} label={`Heading ${level}`} onClick={() => { exec("formatBlock", `h${level}`); emit(); setOpenMenu(null); }} />)}
        </FormatMenu>
        <FormatMenu label="Text color" icon={<Palette size={13} />} open={openMenu === "color"} menuRef={richMenuRef} onToggle={() => setOpenMenu(openMenu === "color" ? null : "color")}>
          <div className="grid grid-cols-6 gap-2 p-2">
            {["#202124", "#d93025", "#e37400", "#fbbc04", "#34a853", "#1a73e8", "#9334e8", "#e91e63", "#795548", "#607d8b", "#ffffff", "#eeeeee"].map(color => <GlassSwatch key={color} color={color} title={color} size={24} onMouseDown={e => e.preventDefault()} onClick={() => { surfaceRef.current?.focus(); exec("foreColor", color); emit(); setOpenMenu(null); }} />)}
            <label className="col-span-6 flex cursor-pointer items-center gap-2 border-t border-white/10 pt-2 text-xs text-white/70"><span className="h-5 w-5 rounded-full border" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />Custom color<input type="color" className="sr-only" onChange={e => { surfaceRef.current?.focus(); exec("foreColor", e.target.value); emit(); setOpenMenu(null); }} /></label>
          </div>
        </FormatMenu>
        <FormatMenu label="Font" icon={<span className="text-[11px] font-bold">Aa</span>} open={openMenu === "font"} menuRef={richMenuRef} onToggle={() => setOpenMenu(openMenu === "font" ? null : "font")}>
          {['Arial','Calibri','Cambria','Comic Sans MS','Courier New','Georgia','Helvetica','Roboto','Times New Roman','Trebuchet MS','Verdana'].map(font => <MenuItem key={font} label={font} style={{ fontFamily: font }} onClick={() => { exec("fontName", font); emit(); setOpenMenu(null); }} />)}
        </FormatMenu>
        {actions.map(({ key, label, icon: Icon, run }) => (
          <GlassButton key={key} onMouseDown={(event) => { event.preventDefault(); surfaceRef.current?.focus(); run(); emit(); }} className="shrink-0 [&_.size-12]:size-7" aria-label={label} title={label} data-course-rich-action={key}><Icon size={13} /><span className="sr-only">{label}</span></GlassButton>
        ))}
      </div>
      {/* Heading (title) area — a default title field above the body,
          separated by a horizontal rule exactly like mainstream note
          editors (Notion, Keep, Apple Notes). The divider line is part of
          the editor chrome; the body's own <hr> button inserts dividers
          INSIDE the note. */}
      {showHeading && (
        <div className="shrink-0 border-x border-[var(--course-border)] bg-[var(--dc-chrome-glass)] px-3 pt-3" data-course-note-heading>
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
        className={`course-rich-surface min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-b-xl bg-[var(--dc-chrome-glass)] p-3 text-sm leading-relaxed text-[var(--course-text)] outline-none focus:border-violet-400 ${showHeading ? "border-x border-b border-[var(--course-border)]" : "border border-[var(--course-border)]"} ${surfaceClassName}`}
        {...(dataAttribute ? { [dataAttribute]: "true" } : {})}
      />
    </div>
  );
}
