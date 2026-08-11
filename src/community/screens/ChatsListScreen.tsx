import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { CURRENT_USER_ID } from "../data/seed";
import Avatar from "../components/Avatar";
import UserPickerSheet from "../components/UserPickerSheet";
import { timeAgo } from "../utils/time";
import { cn } from "../utils/cn";

interface ChatsListScreenProps {
  onBack: () => void;
  onOpenChat: (chatId: string) => void;
  onOpenProfile: (userId: string) => void;
  onNewChat: () => void;
}

export default function ChatsListScreen({ onBack, onOpenChat, onOpenProfile, onNewChat }: ChatsListScreenProps) {
  const { state, deleteChat, getOrCreateChat } = useApp();
  const [showPicker, setShowPicker] = useState(false);

  const chats = useMemo(() => {
    return state.chats
      .filter(
        (c) =>
          c.participantIds.includes(CURRENT_USER_ID) &&
          !(c.deletedFor || []).includes(CURRENT_USER_ID) &&
          c.messages.length > 0
      )
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }, [state.chats]);

  const getOtherUser = (chat: typeof chats[0]) => {
    const otherId = chat.participantIds.find((id) => id !== CURRENT_USER_ID);
    return otherId ? state.users[otherId] : null;
  };

  const getUnreadCount = (chat: typeof chats[0]) => {
    return chat.messages.filter((m) => m.senderId !== CURRENT_USER_ID && !m.read).length;
  };

  const getLastMessage = (chat: typeof chats[0]) => {
    const last = chat.messages[chat.messages.length - 1];
    if (!last) return "";
    if (last.type === "image") return "📷 Photo";
    if (last.type === "post") return "📝 Shared a post";
    if (last.type === "story") return "✨ Shared a story";
    return last.text || "";
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
        <button onClick={onBack} className="text-xl text-slate-700">←</button>
        <h2 className="text-sm font-bold text-slate-900">Messages</h2>
        <button onClick={() => setShowPicker(true)} className="text-xl text-slate-700">✏️</button>
      </div>

      {chats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <span className="text-5xl mb-3">💬</span>
          <p className="text-sm font-semibold text-slate-700 mb-1">No messages yet</p>
          <p className="text-xs text-slate-400 mb-4">Start a conversation with someone!</p>
          <button
            onClick={onNewChat}
            className="rounded-full bg-gradient-to-r from-fuchsia-500 to-orange-400 px-5 py-2.5 text-sm font-bold text-white"
          >
            New Message
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {chats.map((chat) => {
            const other = getOtherUser(chat);
            if (!other) return null;
            const unread = getUnreadCount(chat);
            const lastMsg = getLastMessage(chat);
            
            return (
              <div key={chat.id} className="relative">
                <button
                  onClick={() => onOpenChat(chat.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50 transition"
                >
                  <Avatar user={other} size="md" onClick={() => onOpenProfile(other.id)} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <p className={cn(
                        "text-[13.5px] font-semibold truncate",
                        unread > 0 ? "text-slate-900" : "text-slate-700"
                      )}>
                        {other.displayName}
                      </p>
                      <span className="text-[10px] text-slate-400 ml-2 shrink-0">
                        {timeAgo(chat.lastMessageAt)}
                      </span>
                    </div>
                    <p className={cn(
                      "text-[12px] truncate",
                      unread > 0 ? "text-slate-800 font-medium" : "text-slate-400"
                    )}>
                      {lastMsg}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-500 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => deleteChat(chat.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-red-500"
                >
                  🗑️
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showPicker && (
        <UserPickerSheet
          title="New Message"
          onClose={() => setShowPicker(false)}
          onSelect={(userId) => {
            const chat = getOrCreateChat(userId);
            setShowPicker(false);
            onOpenChat(chat.id);
          }}
        />
      )}
    </div>
  );
}
