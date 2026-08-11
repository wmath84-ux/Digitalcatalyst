import { useEffect, useRef, useState } from "react";
import type { Chat } from "../types";
import {
  ChatBubbleIcon,
  DotsVerticalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "./icons";
import { cn } from "../utils/cn";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  chats: Chat[];
  activeChatId: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onRenameChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

export default function Sidebar({
  open,
  onClose,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
}: SidebarProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setMenuFor(null);
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFor(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = chats
    .filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[82%] max-w-[320px] bg-white dark:bg-[#0d0e12] shadow-2xl flex flex-col",
          open ? "animate-drawer-in" : "-translate-x-full",
          "transition-transform duration-200"
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Chat History
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 active:scale-90 transition"
          >
            <XIcon width={18} height={18} />
          </button>
        </div>

        <div className="px-4 pt-2">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white px-4 py-3 text-[14px] font-medium shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition"
          >
            <PlusIcon width={18} height={18} />
            New chat
          </button>
        </div>

        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-white/5 px-3 py-2">
            <SearchIcon width={16} height={16} className="text-zinc-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="bg-transparent outline-none text-[13.5px] text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 w-full"
            />
          </div>
        </div>

        <div className="mt-3 px-2 pb-4 flex-1 overflow-y-auto">
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Recent
          </p>
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-zinc-400">No chats found</p>
          )}
          <ul className="space-y-0.5">
            {filtered.map((chat) => {
              const isActive = chat.id === activeChatId;
              return (
                <li key={chat.id} className="relative">
                  <button
                    onClick={() => {
                      onSelectChat(chat.id);
                      onClose();
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-xl px-3 py-3 text-left transition",
                      isActive
                        ? "bg-indigo-50 dark:bg-white/10"
                        : "hover:bg-zinc-50 dark:hover:bg-white/5"
                    )}
                  >
                    <ChatBubbleIcon
                      width={17}
                      height={17}
                      className={cn(
                        "shrink-0",
                        isActive ? "text-indigo-500" : "text-zinc-400"
                      )}
                    />
                    <span
                      className={cn(
                        "flex-1 truncate text-[13.5px]",
                        isActive
                          ? "text-indigo-600 dark:text-indigo-300 font-medium"
                          : "text-zinc-700 dark:text-zinc-300"
                      )}
                    >
                      {chat.title}
                    </span>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor(menuFor === chat.id ? null : chat.id);
                      }}
                      className="p-1.5 rounded-full text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-white/10 shrink-0"
                    >
                      <DotsVerticalIcon width={16} height={16} />
                    </span>
                  </button>

                  {menuFor === chat.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-2 top-[calc(100%-4px)] z-10 w-40 rounded-xl bg-white dark:bg-[#1c1d22] shadow-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden animate-pop-in origin-top-right"
                    >
                      <button
                        onClick={() => {
                          onRenameChat(chat.id);
                          setMenuFor(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5"
                      >
                        <PencilIcon width={15} height={15} />
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          onDeleteChat(chat.id);
                          setMenuFor(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                      >
                        <TrashIcon width={15} height={15} />
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="px-4 py-4 border-t border-zinc-100 dark:border-white/5 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 flex items-center justify-center text-white text-[13px] font-semibold">
            U
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-100 truncate">
              You
            </p>
            <p className="text-[11.5px] text-zinc-400 truncate">Free plan</p>
          </div>
        </div>
      </aside>
    </>
  );
}
