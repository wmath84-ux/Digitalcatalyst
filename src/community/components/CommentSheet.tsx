import { useMemo, useState } from "react";
import type { Post } from "../types";
import { useApp } from "../context/AppContext";
import Avatar from "./Avatar";
import MentionText from "./MentionText";
import { timeAgo } from "../utils/time";
import { generateReplySuggestions } from "../utils/ai";
import { CURRENT_USER_ID } from "../data/seed";
import { cn } from "../utils/cn";
import PostCard from "./PostCard";

interface CommentSheetProps {
  post: Post;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  focusAI?: boolean;
  showFullPost?: boolean;
}

export default function CommentSheet({ post, onClose, onOpenProfile, focusAI, showFullPost }: CommentSheetProps) {
  const { state, addComment, toggleLikeComment, deleteComment } = useApp();
  const [text, setText] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [showAI, setShowAI] = useState(!!focusAI);

  const suggestions = useMemo(() => generateReplySuggestions(post.text ?? "", post.tags), [post.text, post.tags]);

  const mentionCandidates = useMemo(() => {
    const match = text.match(/@([a-zA-Z0-9_.]*)$/);
    if (!match) return [];
    const query = match[1].toLowerCase();
    return Object.values(state.users).filter((u) => u.username.toLowerCase().includes(query)).slice(0, 5);
  }, [text, state.users]);

  const handleChange = (val: string) => {
    setText(val);
    setShowMentions(/@([a-zA-Z0-9_.]*)$/.test(val));
  };

  const insertMention = (username: string) => {
    setText((t) => t.replace(/@([a-zA-Z0-9_.]*)$/, `@${username} `));
    setShowMentions(false);
  };

  const submit = () => {
    if (!text.trim()) return;
    addComment(post.id, text.trim());
    setText("");
    setShowAI(false);
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[80%] min-h-[55%] flex-col rounded-t-3xl bg-white shadow-2xl animate-[slideUp_0.25s_ease-out]">
        <div className="flex items-center justify-center pt-2.5">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Comments · {post.comments.length}</h3>
          <button onClick={onClose} className="text-slate-400 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {showFullPost && (
            <div className="border-b border-slate-100 pb-1">
              <PostCard
                post={post}
                onOpenProfile={onOpenProfile}
                onOpenComments={() => {}}
              />
            </div>
          )}
          <div className="px-4 py-3 space-y-4">
          {post.comments.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No comments yet. Be the first to reply!</p>
          )}
          {post.comments.map((c) => {
            const author = state.users[c.authorId];
            if (!author) return null;
            const liked = c.likes.includes(CURRENT_USER_ID);
            return (
              <div key={c.id} className="flex gap-2.5">
                <Avatar user={author} size="sm" onClick={() => onOpenProfile(author.id)} />
                <div className="flex-1">
                  <div className="rounded-2xl bg-slate-100 px-3 py-2">
                    <button onClick={() => onOpenProfile(author.id)} className="text-[12.5px] font-semibold text-slate-900">
                      {author.displayName}
                    </button>
                    <MentionText
                      text={c.text}
                      className="block text-[13.5px] text-slate-700"
                      onMentionClick={(uname) => {
                        const u = Object.values(state.users).find((u) => u.username === uname);
                        if (u) onOpenProfile(u.id);
                      }}
                    />
                  </div>
                  <div className="mt-1 flex items-center gap-3 px-1 text-[11px] text-slate-400">
                    <span>{timeAgo(c.createdAt)}</span>
                    <button
                      onClick={() => toggleLikeComment(post.id, c.id)}
                      className={cn("font-semibold", liked && "text-rose-500")}
                    >
                      {liked ? "Liked" : "Like"} {c.likes.length > 0 && `(${c.likes.length})`}
                    </button>
                    {c.authorId === CURRENT_USER_ID && (
                      <button
                        onClick={() => deleteComment(post.id, c.id)}
                        className="font-semibold text-red-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>

        <div className="border-t border-slate-100 p-3">
          {showAI && (
            <div className="mb-2 rounded-2xl bg-gradient-to-r from-violet-50 to-fuchsia-50 p-2.5">
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-violet-600">
                ✨ AI SUGGESTED REPLIES
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setText(s)}
                    className="rounded-full border border-violet-200 bg-white px-2.5 py-1.5 text-[12px] text-violet-700 active:scale-95 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showMentions && mentionCandidates.length > 0 && (
            <div className="mb-2 max-h-32 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
              {mentionCandidates.map((u) => (
                <button
                  key={u.id}
                  onClick={() => insertMention(u.username)}
                  className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50"
                >
                  <Avatar user={u} size="xs" />
                  <span className="text-[13px] font-medium text-slate-800">@{u.username}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAI((v) => !v)}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm",
                showAI ? "bg-violet-600 text-white" : "bg-violet-100 text-violet-600"
              )}
            >
              ✨
            </button>
            <input
              value={text}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Write a reply... use @ to mention"
              className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-[13.5px] outline-none focus:ring-2 focus:ring-violet-300"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="rounded-full bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-30"
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
