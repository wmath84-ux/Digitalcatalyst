// src/course/NoteEditorToolbar.tsx
//
// Every piece of editor chrome the note editor shows, built from BlockNote's
// own building blocks (so behaviour and accessibility are BlockNote's) and
// skinned by ./noteEditor/noteEditor.css:
//
//   · NoteFormattingToolbar — the compact floating toolbar that follows a text
//     selection with a fine pointer (desktop / hardware keyboard): block type
//     · B I U S · code · link.
//   · NoteDockedToolbar     — the editing toolbar as ONE floating pill at the
//     bottom-left of the note (the reference design): undo · redo | block
//     type · B I S · highlight | code · quote · link | bullet · numbered ·
//     checklist · indent · outdent. It is the note's toolbar wherever a finger
//     is the primary pointer, and it is on screen on EVERY device from the
//     moment the note has a cursor in it. The pill floats over the bottom of
//     the scroll area, so it rides exactly as high as the pane does — with a
//     soft keyboard open it sits directly above it, and where there is no
//     keyboard (a desktop, a big tablet in desktop view, a floating window)
//     directly above the player's footer navigation (the footer inset lifts
//     it clear). Absolute over the pane, never fixed: no second keyboard
//     listener, no hard-coded keyboard heights.
//   · NoteSideMenu          — the subtle per-block controls (insert / handle).
//   · useNoteSlashItems     — the slash menu's items.
//
// Every control calls `preventFocusOnTap` (BlockNote's own helper), so tapping
// it never moves focus out of the writing surface — the selection survives and
// the keyboard stays up.

import { useMemo, type ReactNode } from "react";
import { HistoryExtension, SideMenuExtension } from "@blocknote/core/extensions";
import {
  AddBlockButton,
  BasicTextStyleButton,
  BlockTypeSelect,
  CreateLinkButton,
  DragHandleButton,
  DragHandleMenu,
  FormattingToolbar,
  RemoveBlockItem,
  SideMenu,
  UIModeContext,
  blockTypeSelectItems,
  preventFocusOnTap,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  useExtensionState,
  type BlockTypeSelectItem,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Code2,
  FileCode2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Indent,
  List,
  ListOrdered,
  Minus,
  Outdent,
  Pilcrow,
  Quote,
  Redo2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { filterNoteCommands, runSlashCommand, type NoteCommandKey } from "./noteEditor/editorCommands";
import type { NoteEditorInstance } from "./noteEditor/editorFactory";

const COMMAND_ICONS: Record<NoteCommandKey, LucideIcon> = {
  paragraph: Pilcrow,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bulletList: List,
  numberedList: ListOrdered,
  checklist: CheckSquare,
  quote: Quote,
  code: Code2,
  divider: Minus,
};

const asIcon = (Icon: LucideIcon): BlockTypeSelectItem["icon"] => (props) => <Icon size={props.size ?? 16} />;

/**
 * The block type selector: BlockNote's own list narrowed to what the schema has
 * (headings 1–3, no toggles) with the code block it leaves out.
 */
const useBlockTypeItems = (editor: NoteEditorInstance): BlockTypeSelectItem[] =>
  useMemo(() => {
    const keep = (item: BlockTypeSelectItem) =>
      item.type === "paragraph" ||
      (item.type === "heading" && Number(item.props?.level) <= 3 && !item.props?.isToggleable) ||
      item.type === "quote" ||
      item.type === "bulletListItem" ||
      item.type === "numberedListItem" ||
      item.type === "checkListItem";
    // Our heading has no toggle variant, so its schema has no `isToggleable`
    // prop — BlockNote drops any item that names a prop the schema lacks.
    const withoutToggle = (item: BlockTypeSelectItem): BlockTypeSelectItem =>
      item.type === "heading" ? { ...item, props: { level: Number(item.props?.level) } } : item;
    return [
      ...blockTypeSelectItems(editor.dictionary).filter(keep).map(withoutToggle),
      { name: "Code", type: "codeBlock", icon: asIcon(FileCode2) },
    ];
  }, [editor]);

const InlineActions = () => (
  <>
    <BasicTextStyleButton basicTextStyle="bold" key="bold" />
    <BasicTextStyleButton basicTextStyle="italic" key="italic" />
    <BasicTextStyleButton basicTextStyle="underline" key="underline" />
    <BasicTextStyleButton basicTextStyle="strike" key="strike" />
    <BasicTextStyleButton basicTextStyle="code" key="code" />
    <CreateLinkButton key="link" />
  </>
);

/** The floating toolbar: appears over a selection, never steals it. */
export function NoteFormattingToolbar() {
  const editor = useBlockNoteEditor() as unknown as NoteEditorInstance;
  const items = useBlockTypeItems(editor);
  return (
    <FormattingToolbar>
      <BlockTypeSelect key="blockType" items={items} />
      <InlineActions />
    </FormattingToolbar>
  );
}

/** One undo / redo button: enabled only when the history can act. */
function HistoryButton({ direction }: { direction: "undo" | "redo" }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor() as unknown as NoteEditorInstance;
  const can = useEditorState({
    editor,
    selector: ({ editor: live }) => {
      const history = live.getExtension(HistoryExtension);
      if (!history) return false;
      return live.canExec(direction === "undo" ? history.undoCommand : history.redoCommand);
    },
  });
  const Icon = direction === "undo" ? Undo2 : Redo2;
  return (
    <Components.FormattingToolbar.Button
      className="dc-note-history"
      label={direction === "undo" ? "Undo" : "Redo"}
      mainTooltip={direction === "undo" ? "Undo" : "Redo"}
      icon={<Icon size={16} />}
      isDisabled={!can}
      onClick={() => {
        // The toolbar is up for a cursor in the TITLE field too (see
        // NoteEditor). History acts on the body, but it must not drag the
        // cursor out of the title the learner is still writing in:
        // `preventFocusOnTap` kept it there on the way in, so it stays there
        // on the way out — only a caret that is already in the body is
        // refocused there.
        const caret = document.activeElement;
        const inTitle = caret instanceof HTMLElement && caret.hasAttribute("data-course-note-heading-input");
        if (direction === "undo") editor.undo();
        else editor.redo();
        if (!inTitle) editor.focus();
      }}
    />
  );
}

/** One pill divider (the reference toolbar's grouped-button separators). */
const DockSeparator = () => <span className="dc-note-dock-sep" aria-hidden="true" />;

/** A pill button that runs one of the note's block commands at the caret. */
function DockCommandButton({ command, label }: { command: NoteCommandKey; label: string }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor() as unknown as NoteEditorInstance;
  const Icon = COMMAND_ICONS[command];
  return (
    <Components.FormattingToolbar.Button
      className="dc-note-dock-command"
      label={label}
      mainTooltip={label}
      icon={<Icon size={16} />}
      onClick={() => runSlashCommand(editor, command)}
    />
  );
}

/**
 * Highlight — toggles the schema's background-colour style on the selection,
 * so the pill's highlighter is a real formatter, not a decoration. Active
 * state follows the caret's live styles.
 */
function HighlightButton() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor() as unknown as NoteEditorInstance;
  const activeBackground = useEditorState({
    editor,
    selector: ({ editor: live }) => live.getActiveStyles().backgroundColor,
  });
  const highlighted = Boolean(activeBackground && activeBackground !== "transparent");
  return (
    <Components.FormattingToolbar.Button
      className="dc-note-highlight"
      label="Highlight"
      mainTooltip="Highlight"
      icon={<Highlighter size={16} />}
      isSelected={highlighted}
      onClick={() => editor.toggleStyles({ backgroundColor: "yellow" })}
    />
  );
}

/** Indent / outdent the caret's block one level (list nesting included). */
function IndentButton({ direction }: { direction: "indent" | "outdent" }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor() as unknown as NoteEditorInstance;
  const can = useEditorState({
    editor,
    selector: ({ editor: live }) => (direction === "indent" ? live.canNestBlock() : live.canUnnestBlock()),
  });
  const Icon = direction === "indent" ? Indent : Outdent;
  const label = direction === "indent" ? "Indent" : "Outdent";
  return (
    <Components.FormattingToolbar.Button
      className="dc-note-indent"
      label={label}
      mainTooltip={label}
      icon={<Icon size={16} />}
      isDisabled={!can}
      onClick={() => (direction === "indent" ? editor.nestBlock() : editor.unnestBlock())}
    />
  );
}

/**
 * The editing toolbar — the note's ONE toolbar on touch, and its
 * always-reachable one everywhere else: it is mounted whenever the note has a
 * cursor in it, on any device (see NoteEditor). Rendered inside the editor's
 * React tree (it needs BlockNote's contexts) as a floating pill at the
 * bottom-left of the note — see the file header and noteEditor.css. The
 * "mobile" UI mode keeps BlockNote's dropdowns from taking focus, which would
 * blur the editor and dismiss the keyboard.
 *
 * Button order is the reference design's, left to right: undo · redo |
 * block type (Heading) · bold · italic · strikethrough · highlight |
 * code · quote · link | bulleted list · numbered list · checklist ·
 * indent · outdent. Every button acts on the live document.
 */
export function NoteDockedToolbar({ onFocusWithinChange }: { onFocusWithinChange?: (within: boolean) => void }) {
  const editor = useBlockNoteEditor() as unknown as NoteEditorInstance;
  const items = useBlockTypeItems(editor);
  const Components = useComponentsContext()!;
  return (
    <UIModeContext.Provider value="mobile">
      <div
        className="dc-note-dock"
        data-note-dock=""
        role="toolbar"
        aria-label="Formatting"
        onMouseDown={preventFocusOnTap}
        onFocusCapture={() => onFocusWithinChange?.(true)}
        onBlurCapture={(event) => {
          // Focus moving between two controls of the dock is still "within".
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusWithinChange?.(false);
        }}
      >
        <Components.FormattingToolbar.Root className="bn-toolbar dc-note-dock-bar">
          <div className="dc-note-dock-tools">
            <HistoryButton direction="undo" key="undo" />
            <HistoryButton direction="redo" key="redo" />
            <DockSeparator key="sep-history" />
            <BlockTypeSelect key="blockType" items={items} />
            <BasicTextStyleButton basicTextStyle="bold" key="bold" />
            <BasicTextStyleButton basicTextStyle="italic" key="italic" />
            <BasicTextStyleButton basicTextStyle="strike" key="strike" />
            <HighlightButton key="highlight" />
            <DockSeparator key="sep-inline" />
            <BasicTextStyleButton basicTextStyle="code" key="code" />
            <DockCommandButton key="quote" command="quote" label="Quote" />
            <CreateLinkButton key="link" />
            <DockSeparator key="sep-lists" />
            <DockCommandButton key="bulletList" command="bulletList" label="Bulleted list" />
            <DockCommandButton key="numberedList" command="numberedList" label="Numbered list" />
            <DockCommandButton key="checklist" command="checklist" label="Checklist" />
            <IndentButton key="indent" direction="indent" />
            <IndentButton key="outdent" direction="outdent" />
          </div>
        </Components.FormattingToolbar.Root>
      </div>
    </UIModeContext.Provider>
  );
}

// ── Block controls (side menu) ──────────────────────────────────────────────

/** The handle's menu: move the block, or delete it. (Colours are not offered.) */
const NoteDragHandleMenu = (): ReactNode => {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor() as unknown as NoteEditorInstance;
  const block = useExtensionState(SideMenuExtension, { selector: (state) => state?.block });
  return (
    <DragHandleMenu>
      <Components.Generic.Menu.Item icon={<ArrowUp size={16} />} onClick={() => block && editor.moveBlocksUp(block)}>
        Move up
      </Components.Generic.Menu.Item>
      <Components.Generic.Menu.Item icon={<ArrowDown size={16} />} onClick={() => block && editor.moveBlocksDown(block)}>
        Move down
      </Components.Generic.Menu.Item>
      <RemoveBlockItem>Delete block</RemoveBlockItem>
    </DragHandleMenu>
  );
};

/** Insert-below and drag handle only — no colour menus, nothing permanent. */
export function NoteSideMenu() {
  return (
    <SideMenu>
      <AddBlockButton />
      <DragHandleButton dragHandleMenu={NoteDragHandleMenu} />
    </SideMenu>
  );
}

// ── Slash menu ──────────────────────────────────────────────────────────────

/** Slash menu items for a query: filterable by title and alias, with icons. */
export function useNoteSlashItems(editor: NoteEditorInstance): (query: string) => Promise<DefaultReactSuggestionItem[]> {
  return useMemo(
    () => async (query: string) =>
      filterNoteCommands(query).map((command) => {
        const Icon = COMMAND_ICONS[command.key];
        return {
          title: command.title,
          subtext: command.subtext,
          aliases: command.aliases,
          icon: <Icon size={18} />,
          onItemClick: () => runSlashCommand(editor, command.key),
        };
      }),
    [editor],
  );
}
