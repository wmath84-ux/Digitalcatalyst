import { useState } from "react";
import type { Post } from "../types";
import { useApp } from "../context/AppContext";
import { CURRENT_USER_ID } from "../data/seed";
import Avatar from "./Avatar";
import MentionText from "./MentionText";
import PollWidget from "./PollWidget";
import { timeAgo } from "../utils/time";
import { cn } from "../utils/cn";

const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill={filled ? "#f43f5e" : "none"} stroke={filled ? "#f43f5e" : "currentColor"} strokeWidth={2}>
    <path d="M12 20.5s-7.5-4.6-10-9.3C.5 7.8 2.4 4.5 5.8 4c2-.3 3.8.7 5 2.4.9-1.3 3-2.7 5.2-2.4 3.4.5 5.3 3.8 3.8 7.2-2.5 4.7-10 9.3-10 9.3Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CommentIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.9-.9L3 20l1-5.4A8.5 8.5 0 1 1 21 11.5Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m3 11 18-8-8 18-2.5-7.5L3 11Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const RepostIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={filled ? "#10b981" : "currentColor"} strokeWidth={2}>
    <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const BookmarkIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill={filled ? "#6366f1" : "none"} stroke={filled ? "#6366f1" : "currentColor"} strokeWidth={2}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M12 2l1.6 4.9L18.5 8l-4.9 1.6L12 14.5l-1.6-4.9L5.5 8l4.9-1.1L12 2Z" />
  </svg>
);

interface PostCardProps {
  post: Post;
  onOpenProfile: (userId: string) => void;
  onOpenComments: (post: Post, focusAI?: boolean) => void;
  onOpenTag?: (tag: string) => void;
  onShareToChat?: (post: Post) => void;
}

export default function PostCard({ post, onOpenProfile, onOpenComments, onOpenTag, onShareToChat }: PostCardProps) {
  const { state, toggleLikePost, votePoll, sharePost, repost, toggleBookmark, deletePost, follow, unfollow, currentUser } = useApp();
  const author = state.users[post.authorId];
  const [burst, setBurst] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  
  if (!author) return null;

  const liked = post.likes.includes(CURRENT_USER_ID);
  const reposted = (post.repostedBy || []).includes(CURRENT_USER_ID);
  const bookmarked = (currentUser.bookmarks || []).includes(post.id);
  const isSelf = author.id === CURRENT_USER_ID;
  const isFollowing = currentUser.following.includes(author.id);

  const handleLike = () => {
    toggleLikePost(post.id);
    if (!liked) {
      setBurst(true);
      setTimeout(() => setBurst(false), 500);
    }
  };

  const handleShare = () => {
    setShareMenuOpen(!shareMenuOpen);
  };

  const handleCopyLink = () => {
    sharePost(post.id);
    setShareMenuOpen(false);
  };

  const handleShareToChat = () => {
    if (onShareToChat) {
      onShareToChat(post);
    }
    setShareMenuOpen(false);
  };

  return (
    <article className="border-b border-slate-100 bg-white pb-2 pt-3">
      <div className="flex items-center justify-between px-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar user={author} size="md" onClick={() => onOpenProfile(author.id)} />
          <div className="leading-tight">
            <button onClick={() => onOpenProfile(author.id)} className="flex items-center gap-1">
              <span className="text-[13.5px] font-semibold text-slate-900">{author.displayName}</span>
              {author.verified && <span className="text-xs">✅</span>}
            </button>
            <p className="text-[11.5px] text-slate-400">
              @{author.username} · {timeAgo(post.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isSelf && (
            <button
              onClick={() => (isFollowing ? unfollow(author.id) : follow(author.id))}
              disabled={author.isAdmin && isFollowing}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95",
                isFollowing
                  ? "border border-slate-200 text-slate-400 disabled:opacity-60"
                  : "bg-slate-900 text-white"
              )}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-slate-400 p-1"
          >
            ⋯
          </button>
        </div>
      </div>

      {/* Post Menu */}
      {menuOpen && (
        <div className="mx-3.5 mt-2 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
          <button
            onClick={() => { toggleBookmark(post.id); setMenuOpen(false); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            {bookmarked ? "🔖 Remove Bookmark" : "🔖 Save Post"}
          </button>
          {isSelf && (
            <button
              onClick={() => { deletePost(post.id); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-red-500 hover:bg-red-50"
            >
              🗑️ Delete Post
            </button>
          )}
          <button
            onClick={() => setMenuOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-slate-400 hover:bg-slate-100"
          >
            ✕ Close
          </button>
        </div>
      )}

      {post.text && (
        <div className="px-3.5 pt-2">
          <MentionText
            text={post.text}
            className="text-[14px] leading-snug text-slate-800"
            onMentionClick={(uname) => {
              const u = Object.values(state.users).find((u) => u.username === uname);
              if (u) onOpenProfile(u.id);
            }}
            onTagClick={(tag) => onOpenTag?.(tag)}
          />
        </div>
      )}

      {post.type === "image" && post.imageUrl && (
        <div className="relative mt-2.5" onDoubleClick={handleLike}>
          <img src={post.imageUrl} className="max-h-[420px] w-full object-cover" alt="post" />
          {burst && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="animate-ping text-7xl">❤️</span>
            </div>
          )}
        </div>
      )}

      {post.type === "poll" && post.poll && (
        <div className="px-3.5 pt-2.5">
          <PollWidget poll={post.poll} onVote={(optionId) => votePoll(post.id, optionId)} />
        </div>
      )}

      {/* Actions Row */}
      <div className="flex items-center justify-between px-3.5 pt-2.5">
        <div className="flex items-center gap-3">
          <button onClick={handleLike} className="flex items-center gap-1 active:scale-90 transition">
            <HeartIcon filled={liked} />
            <span className={cn("text-[12px] font-medium", liked ? "text-rose-500" : "text-slate-500")}>
              {post.likes.length}
            </span>
          </button>
          <button onClick={() => onOpenComments(post)} className="flex items-center gap-1 active:scale-90 transition text-slate-500">
            <CommentIcon />
            <span className="text-[12px] font-medium">{post.comments.length}</span>
          </button>
          <button onClick={() => repost(post.id)} className={cn("flex items-center gap-1 active:scale-90 transition", reposted ? "text-emerald-500" : "text-slate-500")}>
            <RepostIcon filled={reposted} />
            <span className="text-[12px] font-medium">{(post.repostedBy || []).length}</span>
          </button>
          <button onClick={handleShare} className="flex items-center gap-1 active:scale-90 transition text-slate-500">
            <ShareIcon />
            <span className="text-[12px] font-medium">{post.shares}</span>
          </button>
          <button onClick={() => toggleBookmark(post.id)} className="active:scale-90 transition">
            <BookmarkIcon filled={bookmarked} />
          </button>
        </div>
        <button
          onClick={() => onOpenComments(post, true)}
          className="flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm active:scale-95 transition"
        >
          <SparkleIcon /> AI Reply
        </button>
      </div>

      {/* Share Menu */}
      {shareMenuOpen && (
        <div className="mx-3.5 mt-2 flex gap-2">
          <button
            onClick={handleCopyLink}
            className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-600"
          >
            🔗 Copy Link
          </button>
          {onShareToChat && (
            <button
              onClick={handleShareToChat}
              className="flex-1 rounded-xl bg-violet-100 py-2.5 text-xs font-semibold text-violet-600"
            >
              💬 Send to Chat
            </button>
          )}
        </div>
      )}

      {post.comments.length > 0 && (
        <button onClick={() => onOpenComments(post)} className="mt-1.5 block px-3.5 text-[12.5px] text-slate-400">
          View {post.comments.length === 1 ? "1 comment" : `all ${post.comments.length} comments`}
        </button>
      )}
    </article>
  );
}
