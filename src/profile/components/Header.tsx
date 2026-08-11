import { Bell, GraduationCap } from "lucide-react";
import { useApp } from "../context/AppContext";
import type { TabId } from "../types";

const titles: Record<TabId, { title: string; subtitle: string }> = {
  profile: { title: "My Profile", subtitle: "Manage your account" },
  coupons: { title: "Coupon Store", subtitle: "Redeem EduCoins for rewards" },
  leaderboard: { title: "Leaderboard", subtitle: "Top learners this month" },
  rewards: { title: "Rewards", subtitle: "Badges & streaks" },
};

export function Header() {
  const { activeTab, coins, showToast } = useApp();
  const { title, subtitle } = titles[activeTab];

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-bold text-neutral-900">{title}</p>
            <p className="text-[11px] text-neutral-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => showToast(`You have ${coins} EduCoins available`, "info")}
            className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200 active:scale-95 transition"
          >
            🪙 {coins}
          </button>
          <button
            type="button"
            onClick={() => showToast("No new notifications", "info")}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 active:scale-95 transition"
            aria-label="Notifications"
          >
            <Bell className="h-4.5 w-4.5" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
          </button>
        </div>
      </div>
    </header>
  );
}
