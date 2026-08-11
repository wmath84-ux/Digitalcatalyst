import { useApp } from "../context/AppContext";
import Avatar from "../components/Avatar";
import { CURRENT_USER_ID } from "../data/seed";
import { cn } from "../utils/cn";

interface FollowListScreenProps {
  userId: string;
  mode: "followers" | "following";
  onBack: () => void;
  onOpenProfile: (userId: string) => void;
}

export default function FollowListScreen({ userId, mode, onBack, onOpenProfile }: FollowListScreenProps) {
  const { state, currentUser, follow, unfollow } = useApp();
  const user = state.users[userId];
  if (!user) return null;

  const ids = mode === "followers" ? user.followers : user.following;
  const list = ids.map((id) => state.users[id]).filter(Boolean);

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white/95 px-3 py-3 backdrop-blur">
        <button onClick={onBack} className="text-xl text-slate-700">
          ←
        </button>
        <h2 className="text-sm font-bold capitalize text-slate-900">
          {mode} {user.id === CURRENT_USER_ID ? "" : `· ${user.displayName}`}
        </h2>
      </div>

      {list.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">No {mode} yet.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {list.map((u) => {
            const isFollowing = currentUser.following.includes(u.id);
            const isSelf = u.id === CURRENT_USER_ID;
            return (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <button onClick={() => onOpenProfile(u.id)} className="flex items-center gap-3">
                  <Avatar user={u} size="md" />
                  <div className="text-left">
                    <p className="flex items-center gap-1 text-[13.5px] font-semibold text-slate-900">
                      {u.displayName} {u.verified && <span className="text-xs">✅</span>}
                    </p>
                    <p className="text-[12px] text-slate-400">@{u.username}</p>
                  </div>
                </button>
                {!isSelf && (
                  <button
                    onClick={() => (isFollowing ? unfollow(u.id) : follow(u.id))}
                    disabled={u.isAdmin && isFollowing}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-xs font-bold",
                      isFollowing ? "border border-slate-200 text-slate-400 disabled:opacity-60" : "bg-slate-900 text-white"
                    )}
                    title={u.isAdmin && isFollowing ? "You can't unfollow the Admin" : undefined}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
