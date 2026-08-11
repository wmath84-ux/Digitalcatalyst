import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { CURRENT_USER_ID } from "../data/seed";
import Avatar from "../components/Avatar";
import { timeAgo } from "../utils/time";
import { cn } from "../utils/cn";
import type { ChatMessage, Post, Story } from "../types";

interface ChatScreenProps {
  chatId: string;
  onBack: () => void;
  onOpenProfile: (userId: string) => void;
  onSharePost?: () => void;
  onShareStory?: () => void;
}

export default function ChatScreen({ chatId, onBack, onOpenProfile }: ChatScreenProps) {
  const { state, sendMessage, deleteMessage, markChatRead } = useApp();
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [sharePostOpen, setSharePostOpen] = useState(false);
  const [shareStoryOpen, setShareStoryOpen] = useState(false);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chat = state.chats.find((c) => c.id === chatId);
  const otherId = chat?.participantIds.find((id) => id !== CURRENT_USER_ID);
  const other = otherId ? state.users[otherId] : null;

  useEffect(() => {
    if (chat) markChatRead(chat.id);
  }, [chat, markChatRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length]);

  const myPosts = useMemo(() => 
    state.posts.filter((p) => p.authorId === CURRENT_USER_ID),
    [state.posts]
  );

  const myStories = useMemo(() => 
    state.stories.filter((s) => s.authorId === CURRENT_USER_ID),
    [state.stories]
  );

  if (!chat || !other) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <p className="text-slate-400">Chat not found</p>
      </div>
    );
  }

  const handleSend = () => {
    if (!text.trim() && !imagePreview) return;
    
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: CURRENT_USER_ID,
      type: imagePreview ? "image" : "text",
      text: text.trim() || undefined,
      imageUrl: imagePreview || undefined,
      createdAt: Date.now(),
      read: false,
    };
    sendMessage(chat.id, msg);
    setText("");
    setImagePreview(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSharePost = (post: Post) => {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: CURRENT_USER_ID,
      type: "post",
      postId: post.id,
      text: post.text?.slice(0, 50) || "Shared a post",
      createdAt: Date.now(),
      read: false,
    };
    sendMessage(chat.id, msg);
    setSharePostOpen(false);
    setShareMenuOpen(false);
  };

  const handleShareStory = (story: Story) => {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: CURRENT_USER_ID,
      type: "story",
      storyId: story.id,
      text: story.text?.slice(0, 50) || "Shared a story",
      createdAt: Date.now(),
      read: false,
    };
    sendMessage(chat.id, msg);
    setShareStoryOpen(false);
    setShareMenuOpen(false);
  };

  const renderMessage = (msg: ChatMessage) => {
    const isMine = msg.senderId === CURRENT_USER_ID;
    const sharedPost = msg.postId ? state.posts.find((p) => p.id === msg.postId) : null;
    const sharedStory = msg.storyId ? state.stories.find((s) => s.id === msg.storyId) : null;

    return (
      <div
        key={msg.id}
        className={cn("flex mb-2", isMine ? "justify-end" : "justify-start")}
        onContextMenu={(e) => {
          e.preventDefault();
          setLongPressId(msg.id);
        }}
      >
        <div className="relative max-w-[75%]">
          {msg.type === "image" && msg.imageUrl && (
            <div className={cn(
              "rounded-2xl overflow-hidden mb-1",
              isMine ? "rounded-br-sm" : "rounded-bl-sm"
            )}>
              <img src={msg.imageUrl} className="max-w-full max-h-48 object-cover" alt="" />
            </div>
          )}
          
          {msg.type === "post" && sharedPost && (
            <div className={cn(
              "rounded-2xl overflow-hidden border border-slate-200 bg-white mb-1",
              isMine ? "rounded-br-sm" : "rounded-bl-sm"
            )}>
              {sharedPost.imageUrl && (
                <img src={sharedPost.imageUrl} className="w-full h-24 object-cover" alt="" />
              )}
              <div className="p-2">
                <p className="text-[11px] font-semibold text-slate-600">📝 Post</p>
                <p className="text-[12px] text-slate-700 line-clamp-2">{sharedPost.text}</p>
              </div>
            </div>
          )}

          {msg.type === "story" && sharedStory && (
            <div className={cn(
              "rounded-2xl overflow-hidden border border-slate-200 mb-1",
              isMine ? "rounded-br-sm" : "rounded-bl-sm"
            )}>
              <div className={cn(
                "h-20 flex items-center justify-center p-3",
                sharedStory.imageUrl ? "" : "bg-gradient-to-br",
                sharedStory.bgGradient || "from-violet-500 to-fuchsia-500"
              )} style={sharedStory.imageUrl ? { backgroundImage: `url(${sharedStory.imageUrl})`, backgroundSize: "cover" } : {}}>
                <p className="text-[11px] font-bold text-white text-center line-clamp-2 drop-shadow">
                  {sharedStory.text || "✨ Story"}
                </p>
              </div>
            </div>
          )}

          {(msg.type === "text" || (msg.text && msg.type !== "post" && msg.type !== "story")) && (
            <div className={cn(
              "px-3.5 py-2.5 rounded-2xl",
              isMine 
                ? "bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white rounded-br-sm" 
                : "bg-slate-100 text-slate-800 rounded-bl-sm"
            )}>
              <p className="text-[13.5px] leading-snug">{msg.text}</p>
            </div>
          )}
          
          <div className={cn("flex items-center gap-1 mt-0.5", isMine ? "justify-end" : "justify-start")}>
            <span className="text-[10px] text-slate-400">{timeAgo(msg.createdAt)}</span>
            {isMine && msg.read && <span className="text-[10px] text-blue-500">✓✓</span>}
          </div>

          {longPressId === msg.id && isMine && (
            <div className="absolute top-0 right-0 z-10 rounded-xl bg-white shadow-xl border border-slate-100 overflow-hidden">
              <button
                onClick={() => {
                  deleteMessage(chat.id, msg.id);
                  setLongPressId(null);
                }}
                className="block w-full px-4 py-2.5 text-left text-xs font-medium text-red-500 hover:bg-red-50"
              >
                🗑️ Delete
              </button>
              <button
                onClick={() => setLongPressId(null)}
                className="block w-full px-4 py-2.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                ✕ Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
        <button onClick={onBack} className="text-xl text-slate-700">←</button>
        <button onClick={() => onOpenProfile(other.id)} className="flex items-center gap-2.5">
          <Avatar user={other} size="sm" />
          <div className="text-left">
            <p className="text-[13.5px] font-semibold text-slate-900">{other.displayName}</p>
            <p className="text-[11px] text-slate-400">@{other.username}</p>
          </div>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4" onClick={() => setLongPressId(null)}>
        {chat.messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      {/* Image Preview */}
      {imagePreview && (
        <div className="relative mx-4 mb-2">
          <img src={imagePreview} className="h-20 rounded-xl object-cover" alt="" />
          <button
            onClick={() => setImagePreview(null)}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-white text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          >
            📷
          </button>
          <button
            onClick={() => setShareMenuOpen(!shareMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          >
            📎
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-[13.5px] outline-none focus:ring-2 focus:ring-violet-300"
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() && !imagePreview}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white disabled:opacity-30"
          >
            ➤
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* Share Menu */}
        {shareMenuOpen && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => { setSharePostOpen(true); setShareMenuOpen(false); }}
              className="flex-1 rounded-xl bg-violet-50 py-3 text-xs font-semibold text-violet-600"
            >
              📝 Share Post
            </button>
            <button
              onClick={() => { setShareStoryOpen(true); setShareMenuOpen(false); }}
              className="flex-1 rounded-xl bg-fuchsia-50 py-3 text-xs font-semibold text-fuchsia-600"
            >
              ✨ Share Story
            </button>
          </div>
        )}
      </div>

      {/* Share Post Modal */}
      {sharePostOpen && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSharePostOpen(false)} />
          <div className="relative max-h-[60%] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl animate-[slideUp_0.25s_ease-out]">
            <h3 className="mb-3 text-center text-sm font-bold text-slate-900">Share a Post</h3>
            {myPosts.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No posts to share</p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {myPosts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSharePost(p)}
                    className="aspect-square overflow-hidden rounded-lg bg-slate-100"
                  >
                    {p.imageUrl ? (
                      <img src={p.imageUrl} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-700 p-1">
                        <p className="text-[9px] text-white line-clamp-3">{p.text}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share Story Modal */}
      {shareStoryOpen && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShareStoryOpen(false)} />
          <div className="relative max-h-[60%] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl animate-[slideUp_0.25s_ease-out]">
            <h3 className="mb-3 text-center text-sm font-bold text-slate-900">Share a Story</h3>
            {myStories.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No stories to share</p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {myStories.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleShareStory(s)}
                    className={cn(
                      "aspect-[9/16] overflow-hidden rounded-lg",
                      s.imageUrl ? "" : "bg-gradient-to-br",
                      s.bgGradient || "from-violet-500 to-fuchsia-500"
                    )}
                    style={s.imageUrl ? { backgroundImage: `url(${s.imageUrl})`, backgroundSize: "cover" } : {}}
                  >
                    <div className="flex h-full items-center justify-center p-1">
                      <p className="text-[9px] font-bold text-white text-center line-clamp-3 drop-shadow">
                        {s.text || "Story"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
