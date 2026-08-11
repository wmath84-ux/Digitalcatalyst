import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { CURRENT_USER_ID } from "../data/seed";
import Avatar from "./Avatar";
import MentionText from "./MentionText";
import PollWidget from "./PollWidget";
import { timeAgo } from "../utils/time";
import { cn } from "../utils/cn";
import type { Story } from "../types";

interface StoryViewerProps {
  initialStoryId: string;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}

const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill={filled ? "#f43f5e" : "none"} stroke={filled ? "#f43f5e" : "white"} strokeWidth={2}>
    <path d="M12 20.5s-7.5-4.6-10-9.3C.5 7.8 2.4 4.5 5.8 4c2-.3 3.8.7 5 2.4.9-1.3 3-2.7 5.2-2.4 3.4.5 5.3 3.8 3.8 7.2-2.5 4.7-10 9.3-10 9.3Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function StoryViewer({ initialStoryId, onClose, onOpenProfile }: StoryViewerProps) {
  const { state, toggleLikeStory, markStoryViewed, voteStoryPoll, deleteStory } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const stories = state.stories;
  const initialIndex = Math.max(0, stories.findIndex((s) => s.id === initialStoryId));
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [insightsOpen, setInsightsOpen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: initialIndex * el.clientHeight, behavior: "auto" });
    if (stories[initialIndex]) markStoryViewed(stories[initialIndex].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx !== activeIndex) {
      setActiveIndex(idx);
      const s = stories[idx];
      if (s) markStoryViewed(s.id);
    }
  };

  const activeStory = stories[activeIndex];

  return (
    <div className="absolute inset-0 z-50 bg-black animate-[fadeIn_0.2s_ease-out]">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full w-full snap-y snap-mandatory overflow-y-auto"
      >
        {stories.map((story, idx) => (
          <StorySlide
            key={story.id}
            story={story}
            isActive={idx === activeIndex}
            onOpenProfile={onOpenProfile}
            onLike={() => toggleLikeStory(story.id)}
            onVote={(optId) => voteStoryPoll(story.id, optId)}
            onOpenInsights={() => setInsightsOpen(true)}
            onDelete={() => {
              deleteStory(story.id);
              if (stories.length <= 1) onClose();
            }}
          />
        ))}
      </div>

      <button
        onClick={onClose}
        className="absolute right-3 top-[max(env(safe-area-inset-top),14px)] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-lg text-white backdrop-blur"
      >
        ✕
      </button>

      {/* progress dots */}
      <div className="pointer-events-none absolute left-2 right-14 top-[max(env(safe-area-inset-top),14px)] z-10 flex gap-1">
        {stories.map((_, i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
            <div className={cn("h-full bg-white transition-all", i <= activeIndex ? "w-full" : "w-0")} />
          </div>
        ))}
      </div>

      {/* Insights Bottom Sheet */}
      {insightsOpen && activeStory && (
        <StoryInsightsSheet
          story={activeStory}
          onClose={() => setInsightsOpen(false)}
          onOpenProfile={(id) => {
            setInsightsOpen(false);
            onOpenProfile(id);
          }}
        />
      )}
    </div>
  );
}

function StorySlide({
  story,
  isActive,
  onOpenProfile,
  onLike,
  onVote,
  onOpenInsights,
  onDelete,
}: {
  story: Story;
  isActive: boolean;
  onOpenProfile: (userId: string) => void;
  onLike: () => void;
  onVote: (optionId: string) => void;
  onOpenInsights: () => void;
  onDelete: () => void;
}) {
  const { state } = useApp();
  const author = state.users[story.authorId];
  const liked = story.likes.includes(CURRENT_USER_ID);
  const [burst, setBurst] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwnStory = story.authorId === CURRENT_USER_ID;

  const bg = useMemo(() => {
    if (story.type === "image") return null;
    return story.bgGradient ?? "from-indigo-600 to-fuchsia-600";
  }, [story]);

  const handleDoubleTap = () => {
    if (!liked) {
      onLike();
      setBurst(true);
      setTimeout(() => setBurst(false), 500);
    }
  };

  if (!author) return null;

  return (
    <div className="relative h-full w-full snap-start snap-always">
      {story.type === "image" && story.imageUrl ? (
        <img src={story.imageUrl} className="absolute inset-0 h-full w-full object-cover" alt="" />
      ) : (
        <div className={cn("absolute inset-0 bg-gradient-to-br", bg)} />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/60" />

      <div
        className="relative flex h-full flex-col justify-between"
        onClick={isActive ? handleDoubleTap : undefined}
      >
        <div className="flex items-center gap-2.5 px-3.5 pt-[max(env(safe-area-inset-top),30px)]">
          <Avatar user={author} size="sm" onClick={() => onOpenProfile(author.id)} />
          <div>
            <p className="text-[13px] font-bold text-white">{author.displayName}</p>
            <p className="text-[11px] text-white/70">{timeAgo(story.createdAt)}</p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-8">
          {story.type !== "poll" && story.text && (
            <p className="text-center text-xl font-bold leading-snug text-white drop-shadow-lg">
              <MentionText text={story.text} />
            </p>
          )}
          {burst && <span className="absolute text-8xl animate-ping">❤️</span>}
        </div>

        <div className="space-y-3 px-3.5 pb-[max(env(safe-area-inset-bottom),20px)]">
          {story.type === "poll" && story.poll && (
            <div onClick={(e) => e.stopPropagation()}>
              {story.text && <p className="mb-2 text-sm font-semibold text-white">{story.text}</p>}
              <PollWidget poll={story.poll} onVote={onVote} variant="dark" />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLike();
                }}
                className="flex items-center gap-1.5 active:scale-90 transition"
              >
                <HeartIcon filled={liked} />
                <span className="text-sm font-semibold text-white">{story.likes.length}</span>
              </button>

              {/* Views & Insights Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInsights();
                }}
                className="flex items-center gap-1.5 text-white/80 active:scale-90 transition"
              >
                <EyeIcon />
                <span className="text-sm font-semibold">{story.viewedBy.length}</span>
              </button>
            </div>

            {isOwnStory ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                className="text-[11px] text-white/60 underline"
              >
                ⋯ Options
              </button>
            ) : (
              <span className="text-[11px] text-white/60">Tap ❤️ twice to like</span>
            )}
          </div>
          
          {/* Story Menu for owner */}
          {menuOpen && isOwnStory && (
            <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  onDelete();
                  setMenuOpen(false);
                }}
                className="flex-1 rounded-xl bg-red-500/80 py-2.5 text-xs font-bold text-white backdrop-blur"
              >
                🗑️ Delete Story
              </button>
              <button
                onClick={() => setMenuOpen(false)}
                className="flex-1 rounded-xl bg-white/20 py-2.5 text-xs font-bold text-white backdrop-blur"
              >
                ✕ Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Bottom Sheet for Views & Likes
function StoryInsightsSheet({
  story,
  onClose,
  onOpenProfile,
}: {
  story: Story;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const { state } = useApp();
  const [tab, setTab] = useState<"views" | "likes">("views");

  const viewers = story.viewedBy
    .map((id) => state.users[id])
    .filter(Boolean);
  const likers = story.likes
    .map((id) => state.users[id])
    .filter(Boolean);

  return (
    <div className="absolute inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[70%] min-h-[45%] flex-col rounded-t-3xl bg-white shadow-2xl animate-[slideUp_0.25s_ease-out]">
        <div className="flex items-center justify-center pt-2.5">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Story Insights</h3>
          <button onClick={onClose} className="text-slate-400 text-lg leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setTab("views")}
            className={cn(
              "flex-1 py-3 text-center text-sm font-semibold transition",
              tab === "views"
                ? "text-slate-900 border-b-2 border-slate-900"
                : "text-slate-400"
            )}
          >
            👁 Views ({viewers.length})
          </button>
          <button
            onClick={() => setTab("likes")}
            className={cn(
              "flex-1 py-3 text-center text-sm font-semibold transition",
              tab === "likes"
                ? "text-rose-500 border-b-2 border-rose-500"
                : "text-slate-400"
            )}
          >
            ❤️ Likes ({likers.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "views" ? (
            viewers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="text-4xl mb-2">👁</span>
                <p className="text-sm text-slate-400">No views yet</p>
                <p className="text-xs text-slate-300 mt-1">Views will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {viewers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => onOpenProfile(user.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50 transition"
                  >
                    <Avatar user={user} size="md" />
                    <div className="text-left flex-1">
                      <p className="flex items-center gap-1 text-[13.5px] font-semibold text-slate-900">
                        {user.displayName}
                        {user.verified && <span className="text-xs">✅</span>}
                      </p>
                      <p className="text-[12px] text-slate-400">@{user.username}</p>
                    </div>
                    <span className="text-slate-300 text-xl">›</span>
                  </button>
                ))}
              </div>
            )
          ) : likers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="text-4xl mb-2">❤️</span>
              <p className="text-sm text-slate-400">No likes yet</p>
              <p className="text-xs text-slate-300 mt-1">Likes will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {likers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => onOpenProfile(user.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50 transition"
                >
                  <div className="relative">
                    <Avatar user={user} size="md" />
                    <span className="absolute -bottom-0.5 -right-0.5 text-sm">❤️</span>
                  </div>
                  <div className="text-left flex-1">
                    <p className="flex items-center gap-1 text-[13.5px] font-semibold text-slate-900">
                      {user.displayName}
                      {user.verified && <span className="text-xs">✅</span>}
                    </p>
                    <p className="text-[12px] text-slate-400">@{user.username}</p>
                  </div>
                  <span className="text-slate-300 text-xl">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
