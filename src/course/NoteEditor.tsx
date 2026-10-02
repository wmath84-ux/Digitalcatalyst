// src/course/NoteEditor.tsx
//
// THE COURSE PLAYER'S NOTE EDITOR — a block document (BlockNote) on a white
// page. It replaces the old contentEditable + execCommand surface inside
// NotesPanel; nothing else about the Notes experience (list, cards, delete,
// session, save semantics) moves.
//
// What lives where:
//
//   ./noteEditor/editorFactory       schema + one factory per editor instance
//   ./noteEditor/editorMigration     legacy HTML  → blocks   (never drops a word)
//   ./noteEditor/editorSerialization blocks       → stored HTML (explicit adapter)
//   ./noteEditor/editorCommands      slash / block commands + the document API
//   ./NoteEditorToolbar              toolbar · docked touch bar · side menu · slash items
//   ./noteEditor/noteEditor.css      the page, the skin
//
// Rules this component keeps:
//
//   · ONE editor instance per open note. NotesPanel keys this component by the
//     note's identity, so switching notes disposes the old instance and its
//     undo history — a clean boundary — and never recreates it per keystroke.
//   · No React state per keystroke and no storage write per keystroke. BlockNote
//     reports changes; they are batched (trailing 250 ms, at most every 1.5 s)
//     into ONE `onDraftChange`. Booleans (empty / dirty) only notify on a flip.
//   · The panel talks to the editor through `NoteEditorHandle` only — load,
//     read (flushes first), focus title / body, reset, read-only, undo, redo.
//   · The soft keyboard is the player's: `useCourseKeyboard()`. The docked
//     toolbar is laid out in flow beneath the scroll area, so it rides exactly
//     as high as the pane (which the deck already sizes to the visible area):
//     no hard-coded heights, no second viewport listener, no double inset.
//   · Floating UI (selection toolbar, slash menu, block controls) portals to
//     <body>, so the player's overflow-hidden panes can never clip it — and it
//     still lands correctly on the Sanctuary's 3D board, because positions come
//     from the screen-space selection rect.

import "@blocknote/react/style.css";
import "./noteEditor/noteEditor.css";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from "react";
import { components as ariakitComponents } from "@blocknote/ariakit";
import {
  BlockNoteViewEditor,
  BlockNoteViewRaw,
  ComponentsContext,
  DesktopFormattingToolbarController,
  SideMenuController,
  SuggestionMenuController,
  useEditorFocus,
} from "@blocknote/react";
import { flushSync } from "react-dom";
import { autoPlacement, flip, offset, shift, size, type Middleware } from "@floating-ui/react";
import { plainToRichText, sanitizeRichText } from "../utils/richText";
import { useCourseKeyboard } from "./useCourseKeyboard";
import { NoteDockedToolbar, NoteFormattingToolbar, NoteSideMenu, useNoteSlashItems } from "./NoteEditorToolbar";
import { createNoteEditor, type NoteEditorInstance } from "./noteEditor/editorFactory";
import { importLegacyHtml } from "./noteEditor/editorMigration";
import { focusNoteBody, isNoteBodyEmpty, readNoteBody } from "./noteEditor/editorCommands";
import type { NoteDraft, NoteEditorHandle } from "./noteEditor/editorTypes";

export type { NoteDraft, NoteEditorHandle } from "./noteEditor/editorTypes";

export interface NoteEditorProps {
  initialTitle: string;
  /** The body as stored (the title already split off). */
  initialBodyHtml: string;
  readOnly?: boolean;
  /** Which field to focus on mount; `false` leaves focus alone (safe on phones). */
  autoFocus?: "title" | "body" | false;
  ariaLabel: string;
  /** A `data-*` attribute name to stamp on the writing surface (test hook). */
  dataAttribute?: string;
  /** Batched, debounced — the latest note model. */
  onDraftChange?: (draft: NoteDraft) => void;
  /** Fires only when "nothing to save" flips. */
  onEmptyChange?: (empty: boolean) => void;
  /** Fires only when "differs from what was opened" flips. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Ctrl / Cmd + Enter. */
  onSaveShortcut?: () => void;
  ref?: Ref<NoteEditorHandle>;
}

const EMIT_DELAY_MS = 250;
const EMIT_MAX_WAIT_MS = 1500;

/**
 * The visible area of the page, for floating UI to clamp against — down to the
 * top of the docked toolbar when it is up, so a menu never covers the controls.
 */
const visibleRect = () => {
  const viewport = window.visualViewport;
  const rect = viewport
    ? { x: viewport.offsetLeft, y: viewport.offsetTop, width: viewport.width, height: viewport.height }
    : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  const dock = document.querySelector<HTMLElement>("[data-note-dock]");
  if (dock) {
    const top = dock.getBoundingClientRect().top;
    rect.height = Math.max(0, Math.min(rect.y + rect.height, top) - rect.y);
  }
  return rect;
};

/**
 * `shift` / `autoPlacement` / `size` re-read the visible rectangle on every
 * computation: with an OVERLAY keyboard the layout viewport keeps its height
 * while the visual one shrinks, and a menu clamped to the layout viewport would
 * slide under the keyboard. (A RESIZE keyboard shrinks both, so this is also
 * right there — and never double-counts, because it uses no inset at all.)
 */
const withVisibleBoundary = (make: (rootBoundary: ReturnType<typeof visibleRect>) => Middleware): Middleware => ({
  // Keep the wrapped middleware's own name: Floating UI stores each middleware's
  // working data under it, and autoPlacement reads its own back on the next pass.
  name: make({ x: 0, y: 0, width: 0, height: 0 }).name,
  async fn(state) {
    return make(visibleRect()).fn(state);
  },
});

const SLASH_FLOATING = {
  useFloatingOptions: {
    placement: "bottom-start" as const,
    middleware: [
      offset(8),
      withVisibleBoundary((rootBoundary) =>
        autoPlacement({ allowedPlacements: ["bottom-start", "top-start"], padding: 8, rootBoundary }),
      ),
      withVisibleBoundary((rootBoundary) => shift({ padding: 8, rootBoundary })),
      withVisibleBoundary((rootBoundary) =>
        size({
          padding: 8,
          rootBoundary,
          apply({ elements, availableHeight }) {
            elements.floating.style.maxHeight = `${Math.max(120, Math.min(availableHeight, 320))}px`;
          },
        }),
      ),
    ],
  },
  elementProps: { style: { zIndex: 130 } },
};

const SELECTION_FLOATING = {
  useFloatingOptions: {
    // Above the selection (so it never covers the words being formatted),
    // flipping below only when there is no room — then clamped to what is visible.
    middleware: [
      offset(8),
      withVisibleBoundary((rootBoundary) => flip({ padding: 8, rootBoundary })),
      withVisibleBoundary((rootBoundary) => shift({ padding: 8, rootBoundary })),
    ],
  },
  elementProps: { style: { zIndex: 130 } },
};

const SIDE_FLOATING = { elementProps: { style: { zIndex: 120 } } };

/** `(pointer: coarse)` — a finger is the primary pointer. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches),
  );
  useEffect(() => {
    const media = window.matchMedia?.("(pointer: coarse)");
    if (!media) return undefined;
    const update = () => setCoarse(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return coarse;
}

/** Clipboard HTML → blocks (the one importer, same as stored notes). */
function pasteIntoEditor(html: string, editor: NoteEditorInstance, asBlocks = false): boolean {
  const clean = sanitizeRichText(html);
  if (!clean) return false;
  const { blocks } = importLegacyHtml(clean);
  if (!blocks.length) return false;
  const selection = editor.getSelection();
  // A snippet of formatted text, or a selection to overwrite: BlockNote's own
  // inline paste does this best (marks survive, the caret stays in the block).
  if (!asBlocks && ((blocks.length === 1 && blocks[0].type === "paragraph") || selection)) {
    editor.pasteHTML(clean);
    return true;
  }
  const current = editor.getTextCursorPosition().block;
  const wasBlank = current.type === "paragraph" && !(Array.isArray(current.content) && current.content.length);
  const inserted = editor.insertBlocks(blocks, current, "after");
  if (wasBlank) editor.removeBlocks([current]);
  const last = inserted[inserted.length - 1];
  if (last) {
    try {
      editor.setTextCursorPosition(last, "end");
    } catch {
      /* a preserved (non-text) block: the caret stays put */
    }
  }
  return true;
}

/**
 * Plain-text clipboard → literal text. One line goes in at the caret as text
 * (replacing a selection); several lines become paragraphs after the current
 * block, with their runs of spaces kept — the way the old editor pasted.
 */
function pastePlainIntoEditor(text: string, editor: NoteEditorInstance): boolean {
  const normalised = text.replace(/\r\n?/g, "\n");
  if (!normalised.trim()) return false;
  const current = editor.getTextCursorPosition().block;
  // Code blocks take plain text natively (and must not be re-flowed).
  if (current.type === "codeBlock") return false;
  if (!normalised.includes("\n")) {
    editor.insertInlineContent([{ type: "text", text: normalised, styles: {} }]);
    return true;
  }
  return pasteIntoEditor(plainToRichText(normalised), editor, true);
}

const fitTitle = (element: HTMLTextAreaElement | null) => {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
};

const readTitle = (element: HTMLTextAreaElement | null): string =>
  (element?.value || "").replace(/\s*[\r\n]+\s*/g, " ").trim();

/** Everything that needs BlockNote's contexts: the controllers and the dock. */
function NoteEditorChrome({
  editor,
  readOnly,
  titleRef,
  onBodyKeyDown,
}: {
  editor: NoteEditorInstance;
  readOnly: boolean;
  titleRef: React.RefObject<HTMLTextAreaElement | null>;
  onBodyKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  const { keyboardVisible } = useCourseKeyboard();
  // Body focus, including BlockNote's own popovers (the link field): the dock
  // must not vanish — and take the link popover with it — while a URL is typed.
  const focused = useEditorFocus({ includeEditorUI: true });
  // …and focus that lands ON a dock button (a screen reader's click, a hardware
  // Tab) must not unmount the dock under the very control being used.
  const [dockFocused, setDockFocused] = useState(false);
  const docked = !readOnly && keyboardVisible && (focused || dockFocused);
  const slashItems = useNoteSlashItems(editor);

  return (
    <div className="dc-note-shell" data-note-docked={docked ? "true" : "false"}>
      <div className="dc-note-scroll" data-note-scroll="">
        <div className="dc-note-page">
          <textarea
            ref={titleRef}
            className="dc-note-title"
            rows={1}
            maxLength={200}
            placeholder="Title"
            aria-label="Note title"
            enterKeyHint="next"
            autoCapitalize="sentences"
            readOnly={readOnly}
            spellCheck
            data-course-note-heading-input=""
          />
          {/* The editable body; keydown here is how the caret hands back to the title. */}
          <div className="dc-note-body" onKeyDownCapture={onBodyKeyDown}>
            <BlockNoteViewEditor>
              {readOnly ? null : (
                <>
                  {docked ? null : (
                    <DesktopFormattingToolbarController
                      formattingToolbar={NoteFormattingToolbar}
                      floatingUIOptions={SELECTION_FLOATING}
                    />
                  )}
                  <SideMenuController sideMenu={NoteSideMenu} floatingUIOptions={SIDE_FLOATING} />
                  <SuggestionMenuController
                    triggerCharacter="/"
                    getItems={slashItems}
                    minQueryLength={0}
                    floatingUIOptions={SLASH_FLOATING}
                  />
                </>
              )}
            </BlockNoteViewEditor>
          </div>
        </div>
      </div>
      {docked ? <NoteDockedToolbar onFocusWithinChange={setDockFocused} /> : null}
    </div>
  );
}

/**
 * One editor instance and its page. `NoteEditor` (below) keys this by a
 * generation counter, so `load` / `reset` replace the instance — a brand-new
 * undo history, which is the only clean history boundary ProseMirror offers.
 */
function NoteEditorSession({
  initialTitle,
  initialBodyHtml,
  readOnly = false,
  autoFocus = false,
  ariaLabel,
  dataAttribute,
  onDraftChange,
  onEmptyChange,
  onDirtyChange,
  onSaveShortcut,
  reseed,
  announce,
  ref,
}: NoteEditorProps & { reseed: (draft: NoteDraft) => void; announce: boolean }) {
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const coarse = useCoarsePointer();

  // ONE instance, built once from the stored note. The document is imported
  // here (never on a re-render) and the instance lives until NotesPanel
  // unmounts this component — the key it passes is the note's identity.
  const [editor] = useState<NoteEditorInstance>(() => {
    const imported = importLegacyHtml(initialBodyHtml);
    return createNoteEditor({
      initialContent: imported.blocks,
      pasteHtml: pasteIntoEditor,
      pastePlain: pastePlainIntoEditor,
      editableAttributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel,
        ...(dataAttribute ? { [dataAttribute]: "" } : {}),
      },
    });
  });

  // Latest callbacks, so the batching below never closes over stale ones.
  const callbacks = useRef({ onDraftChange, onEmptyChange, onDirtyChange, onSaveShortcut });
  callbacks.current = { onDraftChange, onEmptyChange, onDirtyChange, onSaveShortcut };

  // What "unchanged" means: the body and title exactly as they were opened.
  const baseline = useRef<{ body: string; title: string } | null>(null);
  if (baseline.current === null) {
    baseline.current = { body: readNoteBody(editor), title: initialTitle.trim() };
  }
  const flags = useRef({ empty: Boolean(baseline.current && !baseline.current.body && !baseline.current.title), dirty: false });

  const timers = useRef<{ delay: number; max: number }>({ delay: 0, max: 0 });
  const pending = useRef(false);

  // The title as last read from its field. During an unmount the field may
  // already be detached when a final flush runs; this keeps the title then.
  const titleText = useRef(initialTitle.trim());
  const currentTitle = useCallback((): string => {
    const element = titleRef.current;
    if (element) titleText.current = readTitle(element);
    return titleText.current;
  }, []);

  const readDraft = useCallback((): NoteDraft => ({ title: currentTitle(), bodyHtml: readNoteBody(editor) }), [currentTitle, editor]);

  /** Serialise once, tell the panel, and flip the booleans if they flipped. */
  const flushNow = useCallback((): NoteDraft => {
    window.clearTimeout(timers.current.delay);
    window.clearTimeout(timers.current.max);
    timers.current = { delay: 0, max: 0 };
    const draft = readDraft();
    if (pending.current) {
      pending.current = false;
      callbacks.current.onDraftChange?.(draft);
    }
    const empty = !draft.title && !draft.bodyHtml;
    const dirty = draft.bodyHtml !== baseline.current!.body || draft.title !== baseline.current!.title;
    if (empty !== flags.current.empty) { flags.current.empty = empty; callbacks.current.onEmptyChange?.(empty); }
    if (dirty !== flags.current.dirty) { flags.current.dirty = dirty; callbacks.current.onDirtyChange?.(dirty); }
    return draft;
  }, [readDraft]);

  /** A change happened: cheap emptiness now, batched serialisation later. */
  const schedule = useCallback(() => {
    pending.current = true;
    const empty = editor.isEmpty && !currentTitle();
    if (empty !== flags.current.empty) { flags.current.empty = empty; callbacks.current.onEmptyChange?.(empty); }
    window.clearTimeout(timers.current.delay);
    timers.current.delay = window.setTimeout(flushNow, EMIT_DELAY_MS);
    if (!timers.current.max) timers.current.max = window.setTimeout(flushNow, EMIT_MAX_WAIT_MS);
  }, [currentTitle, editor, flushNow]);

  // Title: seed once, fit to its text, fit again whenever the width changes.
  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return undefined;
    element.value = initialTitle;
    fitTitle(element);
    const onInput = () => { fitTitle(element); schedule(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const atEnd = element.selectionStart === element.value.length && element.selectionEnd === element.value.length;
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        focusNoteBody(editor, "start");
      } else if (event.key === "ArrowDown" && atEnd) {
        event.preventDefault();
        focusNoteBody(editor, "start");
      }
    };
    element.addEventListener("input", onInput);
    element.addEventListener("keydown", onKeyDown);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => fitTitle(element)) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener("input", onInput);
      element.removeEventListener("keydown", onKeyDown);
      observer?.disconnect();
    };
    // Mount only: the title is uncontrolled so typing never re-renders React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never hold a change back: leave the page / background the app / unmount.
  // The unmount flush is a LAYOUT cleanup on purpose: it runs while the title
  // field and the editor are still attached, and before any passive cleanup —
  // including the player's own exit effect, which reads the panel session.
  useEffect(() => {
    const flush = () => { flushNow(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushNow]);
  useLayoutEffect(() => () => { if (pending.current) flushNow(); }, [flushNow]);

  // Focus: new notes land in the title; opening an existing note focuses the
  // body only where that cannot pop a keyboard the learner did not ask for.
  useEffect(() => {
    if (!autoFocus || readOnly) return undefined;
    const frame = window.requestAnimationFrame(() => {
      if (autoFocus === "title") titleRef.current?.focus({ preventScroll: true });
      else if (!coarse) focusNoteBody(editor, "end");
    });
    return () => window.cancelAnimationFrame(frame);
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read-only goes through the same renderer: BlockNote's own `editable` flag.
  useEffect(() => {
    editor.isEditable = !readOnly;
  }, [editor, readOnly]);

  // A freshly re-seeded instance (after load / reset) tells the panel where it stands.
  useLayoutEffect(() => {
    if (!announce) return;
    callbacks.current.onDirtyChange?.(false);
    callbacks.current.onEmptyChange?.(flags.current.empty);
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The ONE programmatic surface (see NoteEditorHandle).
  //
  // `load` and `reset` replace the instance (see NoteEditorSession) — synchronously,
  // so the `ref` already points at the new instance's handle when they return, and
  // an edit still waiting in the debounce is dropped, not written over the new note.
  useImperativeHandle(
    ref,
    (): NoteEditorHandle => {
      const replaceWith = (draft: NoteDraft) => {
        window.clearTimeout(timers.current.delay);
        window.clearTimeout(timers.current.max);
        timers.current = { delay: 0, max: 0 };
        pending.current = false;
        reseed(draft);
      };
      return {
        load: replaceWith,
        read: flushNow,
        isEmpty: () => !currentTitle() && isNoteBodyEmpty(editor),
        focusTitle: () => titleRef.current?.focus(),
        focusBody: (position = "end") => focusNoteBody(editor, position),
        reset: () => replaceWith({ title: "", bodyHtml: "" }),
        setReadOnly: (value) => { editor.isEditable = !value; if (titleRef.current) titleRef.current.readOnly = value; },
        undo: () => editor.undo(),
        redo: () => editor.redo(),
      };
    },
    [currentTitle, editor, flushNow, reseed],
  );

  // Caret ↔ title hand-off from the body, plus the Save shortcut.
  const onBodyKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        callbacks.current.onSaveShortcut?.();
        return;
      }
      if (event.nativeEvent.isComposing) return;
      if (event.key !== "ArrowUp" && event.key !== "Backspace") return;
      const position = editor.getTextCursorPosition();
      const state = editor.prosemirrorState.selection;
      if (!state.empty || position.prevBlock || position.parentBlock || state.$from.parentOffset !== 0) return;
      const blank = position.block.type === "paragraph" && !(Array.isArray(position.block.content) && position.block.content.length);
      // ArrowUp from the very first character, or Backspace in an empty first
      // line, lands on the end of the title. Anything else is BlockNote's.
      if (event.key === "ArrowUp" || (event.key === "Backspace" && blank && editor.document.length === 1)) {
        event.preventDefault();
        const title = titleRef.current;
        if (title) { title.focus(); title.setSelectionRange(title.value.length, title.value.length); }
      }
    },
    [editor],
  );

  const portalElements = useMemo(() => ({ default: typeof document !== "undefined" ? document.body : undefined }), []);

  return (
    <ComponentsContext.Provider value={ariakitComponents}>
      <BlockNoteViewRaw
        editor={editor}
        theme="light"
        className="dc-note"
        editable={!readOnly}
        onChange={schedule}
        renderEditor={false}
        portalElements={portalElements}
        formattingToolbar={false}
        sideMenu={false}
        slashMenu={false}
        emojiPicker={false}
        filePanel={false}
        tableHandles={false}
        comments={false}
        data-note-editor=""
        data-note-readonly={readOnly ? "true" : "false"}
      >
        <NoteEditorChrome editor={editor} readOnly={readOnly} titleRef={titleRef} onBodyKeyDown={onBodyKeyDown} />
      </BlockNoteViewRaw>
    </ComponentsContext.Provider>
  );
}

export default function NoteEditor(props: NoteEditorProps) {
  const [generation, setGeneration] = useState(0);
  const seed = useRef({ title: props.initialTitle, body: props.initialBodyHtml });
  const reseed = useCallback((draft: NoteDraft) => {
    seed.current = { title: draft.title, body: draft.bodyHtml };
    // Synchronous on purpose: when `load()` returns, the new instance is mounted
    // and the handle already points at it.
    flushSync(() => setGeneration((count) => count + 1));
  }, []);
  return (
    <NoteEditorSession
      key={generation}
      {...props}
      initialTitle={seed.current.title}
      initialBodyHtml={seed.current.body}
      reseed={reseed}
      announce={generation > 0}
    />
  );
}
