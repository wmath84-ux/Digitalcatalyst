import { memo } from "react";
import { GraduationCap, Pin, PinOff, SquarePen, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { Chat } from "../lib/types";
import { cn } from "../utils/cn";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "LR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function Sidebar({
  chats,
  activeId,
  mode,
  panelPinned,
  profile,
  onSelect,
  onNewChat,
  onTogglePin,
  onTogglePanelPin,
  onClose,
}: {
  chats: Chat[];
  activeId: string;
  mode: "docked" | "drawer";
  panelPinned: boolean;
  profile?: { name: string; photoURL?: string };
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onTogglePin: (id: string) => void;
  onTogglePanelPin: () => void;
  onClose?: () => void;
}) {
  const { user } = useAuth();
  const displayName = profile?.name || user?.name || "Learner";
  const photoURL = profile?.photoURL || user?.photoURL;
  const pinnedChats = chats.filter((c) => c.pinned);
  const recent = chats.filter((c) => !c.pinned);

  const Item = ({ chat }: { chat: Chat }) => {
    const active = chat.id === activeId;
    return (
      <div
        className={cn(
          "group relative flex items-center rounded-[10px] border transition-colors",
          active ? "border-[--border] bg-[--surface] shadow-[var(--sh-xs)]" : "border-transparent hover:bg-[--hover]"
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(chat.id)}
          aria-current={active ? "page" : undefined}
          className="focus-ring min-w-0 flex-1 rounded-[10px] px-3 py-2.5 text-left"
        >
          <div className="flex items-center gap-1.5">
            <span className={cn("truncate text-[13px] font-medium leading-snug", active ? "text-[--ink]" : "text-[--ink-2]")}>{chat.title}</span>
            {chat.pinned && <Pin size={10.5} className="flex-none -rotate-45 text-[--accent-ink]" aria-label="Pinned" />}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[--ink-3]">{chat.courseShort}</div>
        </button>
        <button
          type="button"
          onClick={() => onTogglePin(chat.id)}
          aria-label={chat.pinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`}
          title={chat.pinned ? "Unpin" : "Pin"}
          className={cn(
            "focus-ring mr-1.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] text-[--ink-3] transition-all hover:bg-[--active] hover:text-[--ink]",
            chat.pinned ? "opacity-100 text-[--accent-ink] hover:text-[--accent-ink]" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          )}
        >
          {chat.pinned ? <PinOff size={13.5} aria-hidden="true" /> : <Pin size={13.5} aria-hidden="true" />}
        </button>
      </div>
    );
  };

  return (
    <aside
      aria-label="Chats"
      className={cn(
        "flex h-full flex-col border-r border-[--border] bg-[#f2f1eb]",
        mode === "drawer" ? "anim-drawer w-[min(272px,88%)] shadow-[var(--sh-pop)]" : "w-[252px] xl:w-[264px]"
      )}
    >
      {/* Brand */}
      <div className={cn("flex flex-none items-center gap-2.5 pb-2 pt-4", mode === "drawer" ? "px-4" : "px-4")}>
        <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-[--accent] text-white shadow-[var(--sh-sm)]">
          <GraduationCap size={16.5} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[--ink]">Brightpath</div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[--ink-3]">Lumen Assistant</div>
        </div>
        {mode === "drawer" && (
          <button type="button" onClick={onClose} aria-label="Close chat list" className="icon-btn is-sm focus-ring">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* New chat */}
      <div className="flex-none px-3 pb-3 pt-1.5">
        <button
          type="button"
          onClick={onNewChat}
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-[10px] border border-[--border-2] bg-[--surface] px-3 py-2 text-[13px] font-medium text-[--ink] shadow-[var(--sh-xs)] transition-colors hover:border-[--accent-soft-2] hover:bg-[--accent-soft] hover:text-[--accent-ink]"
        >
          <SquarePen size={15} aria-hidden="true" />
          New chat
        </button>
      </div>

      {/* Chat list */}
      <nav className="scroll-area min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {pinnedChats.length > 0 && (
          <div className="pb-1.5">
            <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[--ink-4]">Pinned</div>
            <div className="flex flex-col gap-0.5">
              {pinnedChats.map((c) => (
                <Item key={c.id} chat={c} />
              ))}
            </div>
          </div>
        )}
        <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[--ink-4]">Recent</div>
        <div className="flex flex-col gap-0.5">
          {recent.map((c) => (
            <Item key={c.id} chat={c} />
          ))}
          {recent.length === 0 && <div className="px-3 py-2 text-[12px] text-[--ink-3]">No other chats</div>}
        </div>
      </nav>

      {/* Profile footer + panel pin */}
      <div className="flex-none border-t border-[--border] p-3">
        <div className="flex items-center gap-1">
          <button type="button" className="focus-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-[--hover]">
            {photoURL ? (
              <img
                src={photoURL}
                alt=""
                className="h-[30px] w-[30px] flex-none rounded-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #6d5dff 0%, #4f46e5 60%, #3b32b8 100%)" }}
              >
                {initialsOf(displayName)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium text-[--ink]">{displayName}</div>
              <div className="truncate text-[11px] text-[--ink-3]">Learner</div>
            </div>
          </button>
          <button
            type="button"
            onClick={onTogglePanelPin}
            aria-label={panelPinned ? "Unpin side panel (auto-collapse on narrow screens)" : "Pin side panel open"}
            aria-pressed={panelPinned}
            title={panelPinned ? "Panel pinned — stays open. Click to unpin" : "Pin panel open"}
            className={cn(
              "focus-ring flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] border transition-colors",
              panelPinned
                ? "border-[--accent-soft-2] bg-[--accent-soft] text-[--accent-ink]"
                : "border-transparent text-[--ink-3] hover:bg-[--hover] hover:text-[--ink]"
            )}
          >
            {panelPinned ? <Pin size={15} className="-rotate-45" aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

function sameChats(a: Chat[], b: Chat[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.title !== y.title || x.pinned !== y.pinned || x.courseShort !== y.courseShort) return false;
  }
  return true;
}

export default memo(
  Sidebar,
  (a, b) =>
    a.mode === b.mode &&
    a.activeId === b.activeId &&
    a.panelPinned === b.panelPinned &&
    a.profile?.name === b.profile?.name &&
    a.profile?.photoURL === b.profile?.photoURL &&
    sameChats(a.chats, b.chats)
);
