import { useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { CURRENT_USER_ID } from "../data/seed";
import Avatar from "../components/Avatar";
import { cn } from "../utils/cn";
import type { Post } from "../types";

interface ProfileScreenProps {
  userId: string;
  showBack?: boolean;
  onBack?: () => void;
  onOpenFollowers: (userId: string) => void;
  onOpenFollowing: (userId: string) => void;
  onOpenPost: (post: Post, focusAI?: boolean) => void;
  onOpenChat?: (userId: string) => void;
}

const GridIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const ListIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
  </svg>
);
const BookmarkIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const MessageIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.9-.9L3 20l1-5.4A8.5 8.5 0 1 1 21 11.5Z" />
  </svg>
);
const CameraIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export default function ProfileScreen({
  userId,
  showBack,
  onBack,
  onOpenFollowers,
  onOpenFollowing,
  onOpenPost,
  onOpenChat,
}: ProfileScreenProps) {
  const { state, currentUser, follow, unfollow, updateProfile, deletePost } = useApp();
  const user = state.users[userId];
  const [view, setView] = useState<"grid" | "list" | "bookmarks">("grid");
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.displayName ?? "");
  const [usernameDraft, setUsernameDraft] = useState(user?.username ?? "");
  const [bioDraft, setBioDraft] = useState(user?.bio ?? "");
  const [bannerDraft, setBannerDraft] = useState(user?.bannerUrl ?? "");
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const posts = useMemo(
    () => state.posts.filter((p) => p.authorId === userId).sort((a, b) => b.createdAt - a.createdAt),
    [state.posts, userId]
  );

  const bookmarkedPosts = useMemo(
    () => state.posts.filter((p) => (currentUser.bookmarks || []).includes(p.id)),
    [state.posts, currentUser.bookmarks]
  );

  if (!user) return null;

  const isSelf = userId === CURRENT_USER_ID;
  const isFollowing = currentUser.following.includes(userId);

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBannerDraft(URL.createObjectURL(file));
    }
  };

  const saveEdit = () => {
    const usernameClean = usernameDraft.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "");
    updateProfile(userId, { 
      displayName: nameDraft.trim() || user.displayName, 
      username: usernameClean || user.username,
      bio: bioDraft,
      bannerUrl: bannerDraft || undefined,
    });
    setEditOpen(false);
  };

  const handleDeletePost = (postId: string) => {
    deletePost(postId);
    setMenuPostId(null);
  };

  return (
    <div className="relative h-full overflow-y-auto bg-white pb-6">
      {/* Banner */}
      {user.bannerUrl ? (
        <div className="h-28 overflow-hidden">
          <img src={user.bannerUrl} className="h-full w-full object-cover" alt="Banner" />
        </div>
      ) : (
        <div className={cn("h-28 bg-gradient-to-br", user.gradient)} />
      )}

      <div className="flex items-center justify-between px-4">
        {showBack ? (
          <button
            onClick={onBack}
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-lg text-white backdrop-blur"
          >
            ←
          </button>
        ) : (
          <div />
        )}
      </div>

      <div className="px-4">
        <div className="-mt-12 flex items-end justify-between">
          <div className="rounded-full ring-4 ring-white">
            <Avatar user={user} size="xl" />
          </div>
          <div className="mb-1 flex gap-2">
            {!isSelf && onOpenChat && (
              <button
                onClick={() => onOpenChat(userId)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600"
              >
                <MessageIcon />
              </button>
            )}
            {isSelf ? (
              <button
                onClick={() => {
                  setNameDraft(user.displayName);
                  setUsernameDraft(user.username);
                  setBioDraft(user.bio);
                  setBannerDraft(user.bannerUrl || "");
                  setEditOpen(true);
                }}
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Edit Profile
              </button>
            ) : (
              <button
                onClick={() => (isFollowing ? unfollow(userId) : follow(userId))}
                disabled={user.isAdmin && isFollowing}
                title={user.isAdmin && isFollowing ? "You can't unfollow the Admin" : undefined}
                className={cn(
                  "rounded-full px-5 py-2 text-xs font-bold transition active:scale-95",
                  isFollowing
                    ? "border border-slate-300 text-slate-500 disabled:opacity-50"
                    : "bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white shadow-md"
                )}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-2">
          <p className="flex items-center gap-1 text-lg font-extrabold text-slate-900">
            {user.displayName}
            {user.verified && <span className="text-sm">✅</span>}
          </p>
          <p className="text-[13px] text-slate-400">@{user.username}</p>
          {user.isAdmin && (
            <span className="mt-1 inline-block rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">
              OFFICIAL ADMIN
            </span>
          )}
        </div>

        <p className="mt-2 text-[13.5px] leading-snug text-slate-700">{user.bio}</p>

        <div className="mt-4 flex items-center gap-6">
          <div className="text-center">
            <p className="text-[15px] font-extrabold text-slate-900">{posts.length}</p>
            <p className="text-[11px] text-slate-400">Posts</p>
          </div>
          <button onClick={() => onOpenFollowers(userId)} className="text-center">
            <p className="text-[15px] font-extrabold text-slate-900">{user.followers.length}</p>
            <p className="text-[11px] text-slate-400">Followers</p>
          </button>
          <button onClick={() => onOpenFollowing(userId)} className="text-center">
            <p className="text-[15px] font-extrabold text-slate-900">{user.following.length}</p>
            <p className="text-[11px] text-slate-400">Following</p>
          </button>
        </div>
      </div>

      <div className="mt-4 flex border-y border-slate-100">
        <button
          onClick={() => setView("grid")}
          className={cn("flex-1 py-2.5 flex items-center justify-center", view === "grid" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-300")}
        >
          <GridIcon />
        </button>
        <button
          onClick={() => setView("list")}
          className={cn("flex-1 py-2.5 flex items-center justify-center", view === "list" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-300")}
        >
          <ListIcon />
        </button>
        {isSelf && (
          <button
            onClick={() => setView("bookmarks")}
            className={cn("flex-1 py-2.5 flex items-center justify-center", view === "bookmarks" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-300")}
          >
            <BookmarkIcon />
          </button>
        )}
      </div>

      {view === "bookmarks" ? (
        bookmarkedPosts.length === 0 ? (
          <p className="py-14 text-center text-sm text-slate-400">No bookmarks yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {bookmarkedPosts.map((p) => (
              <button key={p.id} onClick={() => onOpenPost(p)} className="relative aspect-square overflow-hidden bg-slate-100">
                {p.imageUrl ? (
                  <img src={p.imageUrl} className="h-full w-full object-cover" alt="" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 p-2">
                    <p className="line-clamp-4 text-center text-[10px] font-medium text-white">{p.text}</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )
      ) : posts.length === 0 ? (
        <p className="py-14 text-center text-sm text-slate-400">No posts yet.</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-3 gap-0.5">
          {posts.map((p) => (
            <div key={p.id} className="relative">
              <button onClick={() => onOpenPost(p)} className="relative aspect-square w-full overflow-hidden bg-slate-100">
                {p.imageUrl ? (
                  <img src={p.imageUrl} className="h-full w-full object-cover" alt="" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 p-2">
                    <p className="line-clamp-4 text-center text-[10px] font-medium text-white">{p.text}</p>
                  </div>
                )}
                {p.type === "poll" && (
                  <span className="absolute right-1 top-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] text-white">📊</span>
                )}
              </button>
              {isSelf && (
                <button
                  onClick={() => setMenuPostId(menuPostId === p.id ? null : p.id)}
                  className="absolute right-1 bottom-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white text-xs"
                >
                  ⋯
                </button>
              )}
              {menuPostId === p.id && (
                <div className="absolute right-1 bottom-8 z-10 rounded-xl bg-white shadow-xl border border-slate-100 overflow-hidden">
                  <button
                    onClick={() => onOpenPost(p, true)}
                    className="block w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    ✨ AI Reply
                  </button>
                  <button
                    onClick={() => handleDeletePost(p.id)}
                    className="block w-full px-4 py-2.5 text-left text-xs font-medium text-red-500 hover:bg-red-50"
                  >
                    🗑️ Delete Post
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {posts.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <button onClick={() => onOpenPost(p)} className="flex-1 text-left">
                <p className="line-clamp-2 text-[13.5px] text-slate-700">{p.text || "📊 Poll"}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {p.likes.length} likes · {p.comments.length} comments
                </p>
              </button>
              {isSelf && (
                <div className="flex gap-2">
                  <button
                    onClick={() => onOpenPost(p, true)}
                    className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-600"
                  >
                    ✨ AI
                  </button>
                  <button
                    onClick={() => handleDeletePost(p.id)}
                    className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold text-red-500"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Profile Modal */}
      {editOpen && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditOpen(false)} />
          <div className="relative max-h-[85%] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl animate-[slideUp_0.25s_ease-out]">
            <div className="flex items-center justify-center pb-2">
              <div className="h-1.5 w-10 rounded-full bg-slate-200" />
            </div>
            <h3 className="mb-4 text-center text-sm font-bold text-slate-900">Edit Profile</h3>
            
            {/* Banner Upload */}
            <label className="mb-1 block text-xs font-semibold text-slate-500">Cover Photo</label>
            <div className="relative mb-4 h-24 overflow-hidden rounded-xl bg-slate-100">
              {bannerDraft ? (
                <img src={bannerDraft} className="h-full w-full object-cover" alt="Banner preview" />
              ) : (
                <div className={cn("h-full w-full bg-gradient-to-br", user.gradient)} />
              )}
              <button
                onClick={() => bannerInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center bg-black/30 text-white"
              >
                <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                  <CameraIcon /> Change Cover
                </div>
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerUpload}
              />
            </div>

            <label className="mb-1 block text-xs font-semibold text-slate-500">Display Name</label>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="mb-3 w-full rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
            
            <label className="mb-1 block text-xs font-semibold text-slate-500">Username</label>
            <div className="mb-3 flex items-center rounded-xl bg-slate-100 px-3.5 py-2.5">
              <span className="text-sm text-slate-400">@</span>
              <input
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                className="flex-1 bg-transparent text-sm outline-none ml-0.5"
                placeholder="username"
              />
            </div>
            
            <label className="mb-1 block text-xs font-semibold text-slate-500">Bio</label>
            <textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              rows={3}
              className="mb-4 w-full resize-none rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
            <button onClick={saveEdit} className="w-full rounded-full bg-slate-900 py-3 text-sm font-bold text-white">
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
