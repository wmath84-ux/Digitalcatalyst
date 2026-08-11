import { Award, Gift, Trophy, User } from "lucide-react";
import { useApp } from "../context/AppContext";
import type { TabId } from "../types";
import { cn } from "../utils/cn";

const navItems: { id: TabId; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "coupons", label: "Coupons", icon: Gift },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy },
  { id: "rewards", label: "Rewards", icon: Award },
];

export function BottomNav() {
  const { activeTab, setActiveTab } = useApp();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 backdrop-blur-md pb-[max(env(safe-area-inset-bottom),0.5rem)]">
      <div className="mx-auto flex max-w-md items-stretch justify-between px-2 pt-1.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className="relative flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition active:scale-95"
            >
              {active && (
                <span className="absolute -top-1.5 h-1 w-6 rounded-full bg-indigo-600" />
              )}
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition",
                  active ? "bg-indigo-50 text-indigo-600" : "text-neutral-400"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              </span>
              <span
                className={cn(
                  "text-[10.5px] font-semibold transition",
                  active ? "text-indigo-600" : "text-neutral-400"
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
