import { useState } from "react";
import {
  ChevronRight,
  Copy,
  Crown,
  Download,
  Heart,
  History,
  LogOut,
  Pencil,
  ShoppingBag,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { membershipPlans } from "../data";
import { EditProfileSheet } from "../components/EditProfileSheet";
import { CoinHistorySheet } from "../components/CoinHistorySheet";
import { SettingsSheet } from "../components/SettingsSheet";
import { PurchasesSheet, FavoritesSheet, DownloadsSheet } from "../components/LibrarySheets";
import { ConfirmDialog } from "../components/ConfirmDialog";

type SheetKey =
  | "edit"
  | "coins"
  | "settings"
  | "purchases"
  | "favorites"
  | "downloads"
  | null;

export function ProfilePage() {
  const { user, coins, membership, purchases, favorites, downloads, logout, showToast } = useApp();
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const plan = membershipPlans.find((p) => p.id === membership.planId)!;
  const isBasic = membership.planId === "basic";

  function copyReferral() {
    navigator.clipboard?.writeText(user.referralId).catch(() => {});
    showToast("Referral ID copied to clipboard!");
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 pb-6 pt-5">
      {/* Header card */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-5 text-white shadow-xl shadow-indigo-200">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-xl font-extrabold ring-2 ring-white/40">
            {user.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold">{user.name}</p>
            <p className="truncate text-xs text-white/80">{user.email}</p>
            <p className="mt-0.5 text-[10.5px] text-white/60">Member since {user.joinDate}</p>
          </div>
        </div>
        <p className="relative mt-3 text-xs text-white/85">{user.bio}</p>

        <button
          type="button"
          onClick={() => setSheet("edit")}
          className="relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white/15 py-2.5 text-xs font-bold ring-1 ring-white/30 backdrop-blur active:scale-[0.98] transition"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit Profile
        </button>

        <button
          type="button"
          onClick={copyReferral}
          className="relative mt-2 flex w-full items-center justify-between rounded-2xl bg-black/15 px-3.5 py-2.5 text-xs font-semibold ring-1 ring-white/10 active:scale-[0.98] transition"
        >
          <span className="text-white/70">Referral ID: <span className="text-white">{user.referralId}</span></span>
          <Copy className="h-3.5 w-3.5 text-white/70" />
        </button>
      </section>

      {/* Wallet */}
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl shadow-md shadow-amber-100">
              🪙
            </div>
            <div>
              <p className="text-[11px] font-semibold text-neutral-400">EduCoin Balance</p>
              <p className="text-xl font-extrabold text-neutral-900">{coins} <span className="text-xs font-semibold text-neutral-400">coins</span></p>
            </div>
          </div>
          <Wallet className="h-5 w-5 text-neutral-300" />
        </div>
        <button
          type="button"
          onClick={() => setSheet("coins")}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-amber-50 py-2.5 text-xs font-bold text-amber-700 ring-1 ring-amber-100 active:scale-[0.98] transition"
        >
          <History className="h-3.5 w-3.5" /> View Coin History & Ways to Earn
        </button>
      </section>

      {/* Membership */}
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <div className="mb-3 flex items-center gap-2">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${plan.color} text-white`}>
            <Crown className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-neutral-400">Current Membership</p>
            <p className="text-sm font-extrabold text-neutral-900">{plan.name} {isBasic ? "" : "• Active"}</p>
          </div>
        </div>
        {isBasic ? (
          <button
            type="button"
            onClick={() => {
              window.location.hash = "#/subscription";
            }}
            className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white shadow-md shadow-indigo-200 active:scale-[0.98] transition"
          >
            <span className="flex items-center gap-2 text-xs font-bold">
              <Sparkles className="h-4 w-4" /> Upgrade Membership
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex items-center justify-between rounded-2xl bg-neutral-50 px-4 py-3 ring-1 ring-neutral-100">
            <span className="text-[11px] text-neutral-500">{membership.renewalDate}</span>
            <button
              type="button"
              onClick={() => {
                window.location.hash = "#/subscription";
              }}
              className="text-[11px] font-bold text-indigo-600"
            >
              Manage Plan
            </button>
          </div>
        )}
      </section>

      {/* My Library */}
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">My Library</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSheet("purchases")}
            className="flex flex-col items-start gap-2 rounded-2xl bg-indigo-50 p-3.5 text-left active:scale-[0.97] transition"
          >
            <ShoppingBag className="h-5 w-5 text-indigo-600" />
            <div>
              <p className="text-xs font-bold text-neutral-900">Purchases</p>
              <p className="text-[10.5px] text-neutral-500">{purchases.length} items</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSheet("favorites")}
            className="flex flex-col items-start gap-2 rounded-2xl bg-rose-50 p-3.5 text-left active:scale-[0.97] transition"
          >
            <Heart className="h-5 w-5 text-rose-500" />
            <div>
              <p className="text-xs font-bold text-neutral-900">Favorites</p>
              <p className="text-[10.5px] text-neutral-500">{favorites.length} items</p>
            </div>
          </button>
        </div>
      </section>

      {/* App Settings */}
      <section className="rounded-3xl bg-white p-2 shadow-sm ring-1 ring-neutral-100">
        <p className="px-3 pt-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-neutral-400">
          Settings & Utilities
        </p>
        <SettingsRow
          icon={<Download className="h-4.5 w-4.5 text-sky-600" />}
          bg="bg-sky-50"
          label="Offline Downloads"
          sub={`${downloads.length} files saved`}
          onClick={() => setSheet("downloads")}
        />
        <SettingsRow
          icon={<Sparkles className="h-4.5 w-4.5 text-violet-600" />}
          bg="bg-violet-50"
          label="Notifications, Privacy & Policies"
          sub="Manage your preferences"
          onClick={() => setSheet("settings")}
        />
      </section>

      {/* Logout */}
      <button
        type="button"
        onClick={() => setConfirmLogout(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 py-3.5 text-sm font-bold text-rose-600 ring-1 ring-rose-100 active:scale-[0.98] transition"
      >
        <LogOut className="h-4.5 w-4.5" /> Log Out
      </button>

      <p className="pb-2 text-center text-[10.5px] text-neutral-300">EduHive App • Version 2.4.1</p>

      {/* Sheets */}
      <EditProfileSheet open={sheet === "edit"} onClose={() => setSheet(null)} />
      <CoinHistorySheet open={sheet === "coins"} onClose={() => setSheet(null)} />
      <SettingsSheet open={sheet === "settings"} onClose={() => setSheet(null)} />
      <PurchasesSheet open={sheet === "purchases"} onClose={() => setSheet(null)} />
      <FavoritesSheet open={sheet === "favorites"} onClose={() => setSheet(null)} />
      <DownloadsSheet open={sheet === "downloads"} onClose={() => setSheet(null)} />

      <ConfirmDialog
        open={confirmLogout}
        title="Log out of EduHive?"
        description="You'll need to log back in to access your profile, wallet and progress."
        confirmLabel="Log Out"
        danger
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
      />
    </div>
  );
}

function SettingsRow({
  icon,
  bg,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-neutral-50 transition"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-neutral-900">{label}</p>
        <p className="text-[10.5px] text-neutral-400">{sub}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
    </button>
  );
}
