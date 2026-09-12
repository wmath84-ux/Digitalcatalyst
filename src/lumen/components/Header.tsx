import { memo, useEffect, useRef, useState } from "react";
import { MoreHorizontal, PanelLeft, Pencil, Pin, PinOff } from "lucide-react";
import { tierLte } from "../lib/tier";
import type { AIModel, Chat, Tier } from "../lib/types";
import { cn } from "../utils/cn";
import Dropdown from "./Dropdown";
import ModelSelector from "./ModelSelector";

function Header({
  chat,
  tier,
  showMenuButton,
  onOpenSidebar,
  onTogglePin,
  onRename,
  onSelectModel, models, selectedSource, modelDisabled,
}: {
  models: AIModel[];
  selectedSource: string;
  modelDisabled: boolean;
  chat: Chat;
  tier: Tier;
  showMenuButton: boolean;
  onOpenSidebar: () => void;
  onTogglePin: () => void;
  onRename: (title: string) => void;
  onSelectModel: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditing(false);
    setDraft(chat.title);
  }, [chat.id, chat.title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== chat.title) onRename(t);
    else setDraft(chat.title);
    setEditing(false);
  };

  const showSubtitle = !tierLte(tier, "sm"); // md and up
  const directActions = !tierLte(tier, "sm"); // pin + rename as dedicated buttons
  const pinDirect = tier === "sm"; // sm keeps pin visible, moves rename into menu
  const sm = tierLte(tier, "sm");

  return (
    <header className="relative z-30 flex-none border-b border-[--border] bg-[--bg]">
      <div
        className={cn(
          "flex items-center",
          tier === "xxs" ? "h-[42px] gap-0.5 px-1.5" : tier === "xs" ? "h-[46px] gap-1 px-2" : tier === "sm" ? "h-[48px] gap-1 px-2.5" : "h-[54px] gap-1.5 px-3.5"
        )}
      >
        {showMenuButton && (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open chat list"
            title="Chats"
            className={cn("icon-btn focus-ring", sm && "is-sm", tier === "xxs" && "is-xs")}
          >
            <PanelLeft size={sm ? 16 : 17} aria-hidden="true" />
          </button>
        )}

        {/* Title block — becomes an inline editor when renaming */}
        <div className="min-w-0 flex-1 select-none">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(chat.title);
                  setEditing(false);
                }
              }}
              aria-label="Chat title"
              maxLength={80}
              className={cn(
                "w-full max-w-[420px] rounded-[7px] border border-[--accent] bg-[--surface] px-2 py-1 font-semibold tracking-[-0.01em] text-[--ink] shadow-[0_0_0_3.5px_var(--ring)] outline-none",
                sm ? "text-[13.5px]" : "text-[14.5px]"
              )}
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => setEditing(true)}
              onClick={() => !sm && setEditing(true)}
              title={sm ? chat.title : "Rename chat"}
              className="focus-ring block w-full cursor-text rounded-md text-left"
            >
              <div className={cn("truncate font-semibold tracking-[-0.01em] text-[--ink]", sm ? "text-[13.5px]" : "text-[14.5px]")}>
                {chat.title}
                {chat.pinned && <span className="sr-only"> (pinned)</span>}
              </div>
              {showSubtitle && <div className="mt-px truncate text-[11.5px] leading-tight text-[--ink-3]">{chat.course}</div>}
            </button>
          )}
        </div>

        <ModelSelector models={models} disabled={modelDisabled} modelId={selectedSource} tier={tier} onSelect={onSelectModel} />

        {directActions && (
          <>
            <div className="mx-1 h-5 w-px flex-none bg-[--border]" aria-hidden="true" />
            <button
              type="button"
              onClick={onTogglePin}
              aria-label={chat.pinned ? "Unpin chat" : "Pin chat"}
              aria-pressed={!!chat.pinned}
              title={chat.pinned ? "Unpin chat" : "Pin chat"}
              className={cn("icon-btn focus-ring", chat.pinned && "is-active")}
            >
              {chat.pinned ? <PinOff size={16.5} aria-hidden="true" /> : <Pin size={16.5} aria-hidden="true" />}
            </button>
            <button type="button" onClick={() => setEditing(true)} aria-label="Rename chat" title="Rename chat" className="icon-btn focus-ring">
              <Pencil size={16} aria-hidden="true" />
            </button>
          </>
        )}

        {pinDirect && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={chat.pinned ? "Unpin chat" : "Pin chat"}
            aria-pressed={!!chat.pinned}
            title={chat.pinned ? "Unpin chat" : "Pin chat"}
            className={cn("icon-btn is-sm focus-ring", chat.pinned && "is-active")}
          >
            {chat.pinned ? <PinOff size={15.5} aria-hidden="true" /> : <Pin size={15.5} aria-hidden="true" />}
          </button>
        )}

        {/* Overflow menu — carries secondary actions on narrow tiers */}
        {(tierLte(tier, "sm") || !directActions) && (
          <div className="relative flex-none">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Chat options"
              title="Chat options"
              className={cn("icon-btn focus-ring", sm && "is-sm", tier === "xxs" && "is-xs", menuOpen && "bg-[--hover] text-[--ink]")}
            >
              <MoreHorizontal size={sm ? 17 : 18} aria-hidden="true" />
            </button>
            <Dropdown open={menuOpen} onClose={() => setMenuOpen(false)} align="right" ariaLabel="Chat options" className="w-[196px]">
              {!pinDirect && (
                <button type="button" role="menuitem" className="menu-item focus-ring" onClick={() => { setMenuOpen(false); onTogglePin(); }}>
                  {chat.pinned ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
                  {chat.pinned ? "Unpin chat" : "Pin chat"}
                  {chat.pinned && <span className="ml-auto rounded-full bg-[--accent-soft] px-1.5 py-px text-[10px] font-semibold text-[--accent-ink]">Pinned</span>}
                </button>
              )}
              <button type="button" role="menuitem" className="menu-item focus-ring" onClick={() => { setMenuOpen(false); setEditing(true); }}>
                <Pencil size={15} aria-hidden="true" />
                Rename chat
              </button>
            </Dropdown>
          </div>
        )}
      </div>
    </header>
  );
}

// Field-level comparison: stream commits swap the chat object identity
// constantly, but the header only cares about these fields — so it never
// re-renders during generation, typing, or streaming.
export default memo(
  Header,
  (a, b) =>
    a.tier === b.tier &&
    a.showMenuButton === b.showMenuButton &&
    a.chat.id === b.chat.id &&
    a.chat.title === b.chat.title &&
    a.chat.course === b.chat.course &&
    a.chat.pinned === b.chat.pinned &&
    a.chat.modelId === b.chat.modelId
);
