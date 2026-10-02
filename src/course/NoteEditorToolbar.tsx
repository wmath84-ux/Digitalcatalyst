// src/course/NoteEditorToolbar.tsx
//
// Every piece of editor chrome the note editor shows, built from BlockNote's
// own building blocks (so behaviour and accessibility are BlockNote's) and
// skinned by ./noteEditor/noteEditor.css:
//
//   · NoteFormattingToolbar — the compact floating toolbar that follows a text
//     selection (desktop / hardware keyboard): block type · B I U S · code · link.
//   · NoteDockedToolbar     — the same actions as ONE slim bar sitting directly
//     above the soft keyboard on touch (plus undo / redo / insert). It is laid
//     out in normal flow at the bottom of the editor, so it rides exactly as
//     high as the pane does — the player's own keyboard state already sizes the
//     pane to the visible area. No fixed offsets, no second keyboard listener.
//   · NoteSideMenu          — the subtle per-block controls (insert / handle).
//   · useNoteSlashItems     — the slash menu's items.
//
// Every control calls `preventFocusOnTap` (BlockNote's own helper), so tapping
// it never moves focus out of the writing surface — the selection survives and
// the keyboard stays up.

import { useMemo, type ReactNode } from "react";
import { HistoryExtension, SideMenuExtension, SuggestionMenu } from "@blocknote/core/extensions";
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
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Plus,
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
        if (direction === "undo") editor.undo();
        else editor.redo();
        editor.focus();
      }}
    />
  );
}

/** "+" — opens the slash menu at the caret (discoverable on touch). */
function InsertButton() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor() as unknown as NoteEditorInstance;
  return (
    <Components.FormattingToolbar.Button
      className="dc-note-insert"
      label="Insert block"
      mainTooltip="Insert block"
      icon={<Plus size={16} />}
      onClick={() => {
        editor.focus();
        // Like BlockNote's own "+": a blank line is used as is, otherwise a new
        // blank line opens below the caret's block — then the menu opens on it.
        const block = editor.getTextCursorPosition().block;
        const blank = block.type === "paragraph" && Array.isArray(block.content) && block.content.length === 0;
        if (!blank) {
          const [created] = editor.insertBlocks([{ type: "paragraph" }], block, "after");
          if (created) editor.setTextCursorPosition(created, "start");
        }
        editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/");
      }}
    />
  );
}

/**
 * The docked touch toolbar. Rendered inside the editor's React tree (it needs
 * BlockNote's contexts) but laid out in flow beneath the scroll area — see the
 * file header. The "mobile" UI mode keeps BlockNote's dropdowns from taking
 * focus, which would blur the editor and dismiss the keyboard.
 */
export function NoteDockedToolbar({ onFocusWithinChange }: { onFocusWithinChange?: (within: boolean) => void }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor() as unknown as NoteEditorInstance;
  const items = useBlockTypeItems(editor);
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
          {/* The writing tools scroll sideways on a narrow phone (insert first,
              because it is the one nothing else can replace); undo / redo stay
              pinned at the end where a thumb always finds them. */}
          <div className="dc-note-dock-tools">
            <InsertButton key="insert" />
            <BlockTypeSelect key="blockType" items={items} />
            <InlineActions />
          </div>
          <div className="dc-note-dock-history">
            <HistoryButton direction="undo" key="undo" />
            <HistoryButton direction="redo" key="redo" />
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
