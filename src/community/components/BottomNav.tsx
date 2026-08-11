import { cn } from "../utils/cn";
import Avatar from "./Avatar";
import { useApp } from "../context/AppContext";

export type TabName = "feed" | "search" | "stories" | "profile";

interface BottomNavProps {
  active: TabName;
  onChange: (tab: TabName) => void;
  onCreate: () => void;
}

const HomeIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
    <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const StoriesIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
    <rect x="4" y="3" width="16" height="18" rx="3" />
    <path d="M10 9.5v5l4-2.5-4-2.5Z" fill={filled ? "white" : "currentColor"} stroke="none" />
  </svg>
);

export default function BottomNav({ active, onChange, onCreate }: BottomNavProps) {
  const { currentUser } = useApp();
  const tabs: { name: TabName; icon: (a: boolean) => React.ReactNode }[] = [
    { name: "feed", icon: (a) => <HomeIcon filled={a} /> },
    { name: "search", icon: () => <SearchIcon /> },
  ];

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-2">
        {tabs.map((t) => (
          <button
            key={t.name}
            onClick={() => onChange(t.name)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-1 transition",
              active === t.name ? "text-slate-900" : "text-slate-400"
            )}
          >
            {t.icon(active === t.name)}
          </button>
        ))}

        <button
          onClick={onCreate}
          className="mx-1 flex flex-1 items-center justify-center"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white shadow-lg shadow-fuchsia-200 active:scale-95 transition">
            <PlusIcon />
          </span>
        </button>

        <button
          onClick={() => onChange("stories")}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-1 transition",
            active === "stories" ? "text-slate-900" : "text-slate-400"
          )}
        >
          <StoriesIcon filled={active === "stories"} />
        </button>

        <button
          onClick={() => onChange("profile")}
          className="flex flex-1 flex-col items-center gap-0.5 py-1"
        >
          <div className={cn("rounded-full", active === "profile" ? "ring-2 ring-slate-900" : "ring-1 ring-slate-300")}>
            <Avatar user={currentUser} size="xs" />
          </div>
        </button>
      </div>
    </div>
  );
}
