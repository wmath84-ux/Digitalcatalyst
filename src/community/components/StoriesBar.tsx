import { useApp } from "../context/AppContext";
import { CURRENT_USER_ID } from "../data/seed";
import Avatar from "./Avatar";
import { cn } from "../utils/cn";

interface StoriesBarProps {
  onOpenStory: (storyId: string) => void;
  onCreateStory: () => void;
}

export default function StoriesBar({ onOpenStory, onCreateStory }: StoriesBarProps) {
  const { state, currentUser } = useApp();

  const authorIds = Array.from(new Set(state.stories.map((s) => s.authorId)));
  const groups = authorIds
    .map((id) => ({
      user: state.users[id],
      stories: state.stories.filter((s) => s.authorId === id),
    }))
    .filter((g) => g.user);

  const hasUnviewed = (storyIds: string[]) =>
    state.stories.some((s) => storyIds.includes(s.id) && !s.viewedBy.includes(CURRENT_USER_ID));

  return (
    <div className="flex gap-3.5 overflow-x-auto px-3.5 py-3">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <button onClick={onCreateStory} className="relative">
          <Avatar user={currentUser} size="lg" />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white ring-2 ring-white">
            +
          </span>
        </button>
        <span className="text-[11px] font-medium text-slate-600">Your Story</span>
      </div>

      {groups.map(({ user, stories }) => {
        const unviewed = hasUnviewed(stories.map((s) => s.id));
        return (
          <div key={user.id} className="flex shrink-0 flex-col items-center gap-1">
            <div
              onClick={() => onOpenStory(stories[0].id)}
              className={cn(
                "cursor-pointer rounded-full p-[2.5px]",
                unviewed
                  ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-fuchsia-600"
                  : "bg-slate-200"
              )}
            >
              <div className="rounded-full bg-white p-[2px]">
                <Avatar user={user} size="lg" />
              </div>
            </div>
            <span className="max-w-[64px] truncate text-[11px] font-medium text-slate-600">
              {user.id === "admin" ? "Admin" : user.displayName.split(" ")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
