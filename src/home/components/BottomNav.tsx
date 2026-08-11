export type NavTab = "home" | "myday" | "search" | "favorites" | "profile";

interface BottomNavProps {
  active: NavTab;
  favoritesCount: number;
  onChange: (tab: NavTab) => void;
}

const tabs: { id: NavTab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "myday", label: "My Day", icon: "📅" },
  { id: "search", label: "Search", icon: "🔍" },
  { id: "favorites", label: "Saved", icon: "❤️" },
  { id: "profile", label: "Profile", icon: "👤" },
];

export default function BottomNav({ active, favoritesCount, onChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 mx-auto flex max-w-md items-center justify-around border-t border-slate-100 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition active:scale-95"
          >
            <span
              className={`relative text-lg transition-transform ${isActive ? "scale-110" : "opacity-60"}`}
            >
              {tab.icon}
              {tab.id === "favorites" && favoritesCount > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {favoritesCount}
                </span>
              )}
            </span>
            <span
              className={`text-[10px] font-semibold ${isActive ? "text-slate-900" : "text-slate-400"}`}
            >
              {tab.label}
            </span>
            {isActive && (
              <span className="absolute -top-2 h-1 w-5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
