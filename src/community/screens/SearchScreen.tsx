import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import Avatar from "../components/Avatar";
import { TRENDING_TAGS, CURRENT_USER_ID } from "../data/seed";
import type { Post } from "../types";
import { cn } from "../utils/cn";

interface SearchScreenProps {
  onOpenProfile: (userId: string) => void;
  onOpenPost: (post: Post) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onOpenChat?: (userId: string) => void;
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
);

export default function SearchScreen({ onOpenProfile, onOpenPost, query, onQueryChange, onOpenChat }: SearchScreenProps) {
  const { state, currentUser, follow, unfollow } = useApp();
  const setQuery = onQueryChange;

  // Clean query - remove @ symbol for username search
  const trimmed = query.trim().replace(/^@/, "").toLowerCase();

  // Search users by username or display name
  const userResults = useMemo(() => {
    if (!trimmed) return [];
    return Object.values(state.users)
      .filter(
        (u) =>
          u.id !== CURRENT_USER_ID &&
          (u.username.toLowerCase().includes(trimmed) || 
           u.displayName.toLowerCase().includes(trimmed))
      )
      .sort((a, b) => {
        // Prioritize exact username matches
        const aExact = a.username.toLowerCase() === trimmed;
        const bExact = b.username.toLowerCase() === trimmed;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        // Then prioritize username starts with
        const aStarts = a.username.toLowerCase().startsWith(trimmed);
        const bStarts = b.username.toLowerCase().startsWith(trimmed);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
  }, [trimmed, state.users]);

  // Search posts by text or tags
  const postResults = useMemo(() => {
    if (!trimmed) return [];
    return state.posts.filter(
      (p) =>
        p.text?.toLowerCase().includes(trimmed) ||
        p.tags?.some((t) => t.toLowerCase().includes(trimmed))
    );
  }, [trimmed, state.posts]);

  // Popular posts for Explore section
  const popularPosts = useMemo(
    () => [...state.posts].filter((p) => p.imageUrl).sort((a, b) => b.likes.length - a.likes.length),
    [state.posts]
  );

  // Suggested users (not following yet)
  const suggestedUsers = useMemo(
    () => Object.values(state.users)
      .filter((u) => u.id !== CURRENT_USER_ID && !currentUser.following.includes(u.id))
      .slice(0, 5),
    [state.users, currentUser.following]
  );

  return (
    <div className="h-full overflow-y-auto pb-6">
      <div className="sticky top-0 z-20 bg-white/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3.5 py-2.5">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search @username, name, or #tag"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-slate-400"
            autoCapitalize="none"
            autoCorrect="off"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-slate-400">
              ✕
            </button>
          )}
        </div>
        
        {/* Quick search hint */}
        {!query && (
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Tip: Type @username to find people directly
          </p>
        )}
      </div>

      {trimmed ? (
        <div className="px-4">
          {/* User Results */}
          {userResults.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">People</p>
              <div className="space-y-1">
                {userResults.map((u) => {
                  const isFollowing = currentUser.following.includes(u.id);
                  return (
                    <div key={u.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                      <button onClick={() => onOpenProfile(u.id)} className="flex items-center gap-3">
                        <Avatar user={u} size="md" />
                        <div className="text-left">
                          <p className="flex items-center gap-1 text-[13.5px] font-semibold text-slate-900">
                            {u.displayName} {u.verified && <span className="text-xs">✅</span>}
                          </p>
                          <p className="text-[12px] text-slate-400">@{u.username}</p>
                          <p className="text-[11px] text-slate-400">{u.followers.length} followers</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        {onOpenChat && (
                          <button
                            onClick={() => onOpenChat(u.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 text-sm"
                          >
                            💬
                          </button>
                        )}
                        <button
                          onClick={() => (isFollowing ? unfollow(u.id) : follow(u.id))}
                          disabled={u.isAdmin && isFollowing}
                          className={cn(
                            "rounded-full px-3.5 py-1.5 text-xs font-bold",
                            isFollowing ? "border border-slate-200 text-slate-400 disabled:opacity-60" : "bg-slate-900 text-white"
                          )}
                        >
                          {isFollowing ? "Following" : "Follow"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Post Results */}
          {postResults.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Posts</p>
              <div className="grid grid-cols-3 gap-0.5">
                {postResults.map((p) => (
                  <PostThumb key={p.id} post={p} onClick={() => onOpenPost(p)} />
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {userResults.length === 0 && postResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-2">🔍</span>
              <p className="text-sm font-semibold text-slate-700">No results for "{query}"</p>
              <p className="text-xs text-slate-400 mt-1">Try searching for a different username or tag</p>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4">
          {/* Suggested Users */}
          {suggestedUsers.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Suggested for you</p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {suggestedUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onOpenProfile(u.id)}
                    className="flex shrink-0 flex-col items-center gap-1.5 rounded-xl bg-slate-50 p-3 w-24"
                  >
                    <Avatar user={u} size="lg" />
                    <p className="text-[11px] font-semibold text-slate-800 truncate w-full text-center">
                      {u.displayName.split(" ")[0]}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        follow(u.id);
                      }}
                      className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-bold text-white"
                    >
                      Follow
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Trending Tags */}
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Trending Tags</p>
          <div className="mb-5 flex flex-wrap gap-2">
            {TRENDING_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => setQuery(tag)}
                className="rounded-full bg-gradient-to-r from-violet-50 to-fuchsia-50 px-3.5 py-1.5 text-[12.5px] font-semibold text-violet-700"
              >
                #{tag}
              </button>
            ))}
          </div>

          {/* Explore */}
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Explore</p>
          <div className="grid grid-cols-3 gap-0.5">
            {popularPosts.map((p) => (
              <PostThumb key={p.id} post={p} onClick={() => onOpenPost(p)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PostThumb({ post, onClick }: { post: Post; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative aspect-square overflow-hidden bg-slate-100">
      {post.imageUrl ? (
        <img src={post.imageUrl} className="h-full w-full object-cover" alt="" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 p-2">
          <p className="line-clamp-4 text-center text-[10px] font-medium text-white">{post.text}</p>
        </div>
      )}
      {post.type === "poll" && (
        <span className="absolute right-1 top-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] text-white">📊</span>
      )}
      <div className="absolute bottom-1 left-1 flex items-center gap-1">
        <span className="rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">❤️ {post.likes.length}</span>
      </div>
    </button>
  );
}
