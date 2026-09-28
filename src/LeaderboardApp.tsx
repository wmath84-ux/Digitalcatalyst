import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "./components/ui/GlassCard";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/glass-tabs";
import { GlassButton } from "./components/ui/glass-button";
import { doc, getDoc } from "firebase/firestore";
import { BadgeCheck, Check, Copy, Crown, LoaderCircle, Trophy, Users, Sparkles, Medal, Star } from "lucide-react";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import { useCatalog } from "./context/CatalogContext";
import { useCommerce } from "./context/CommerceContext";
import { useBranding } from "./context/BrandingContext";
import { db } from "../firebase";
import { apiFetch } from "./utils/apiBase";

type SubscriberRow = {
  uid: string;
  name: string;
  photoURL: string | null;
  planId: string;
  referralCode: string;
  usedCount: number;
  available: boolean;
};

type UserRow = {
  uid: string;
  name: string;
  photoURL: string | null;
};

type View = "all" | "subscribers" | "unused";

function Avatar({ name, photoURL, size = 44 }: { name: string; photoURL: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = photoURL && photoURL.trim() && !failed ? photoURL.trim() : "";
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="grid place-items-center rounded-full bg-violet-100 font-black text-violet-700"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(name || "U").slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function LeaderboardApp() {
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const { appName } = useBranding();
  const [view, setView] = useState<View>("all");
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedReferralCode, setCopiedReferralCode] = useState("");

  const copyReferralCode = async (code: string) => {
    if (!code) return;
    try {
      await navigator.clipboard?.writeText(code);
      setCopiedReferralCode(code);
      window.setTimeout(() => setCopiedReferralCode((current) => (current === code ? "" : current)), 1400);
    } catch {
      setCopiedReferralCode("");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch("/api/referral-leaderboard");
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          subscribers?: SubscriberRow[];
          users?: UserRow[];
          error?: string;
          code?: string;
        };
        if (response.ok && data.ok) {
          if (!cancelled) {
            setSubscribers(Array.isArray(data.subscribers) ? data.subscribers : []);
            setUsers(Array.isArray(data.users) ? data.users : []);
          }
          return;
        }
        const reason =
          data.code === "firebase_admin_not_configured"
            ? "Leaderboard service is not configured. Add the Firebase service account on the server, then try again."
            : data.error || "Could not open leaderboard.";
        throw new Error(reason);
      } catch (loadError) {
        try {
          const cached = await getDoc(doc(db, "publicLeaderboard", "referrals"));
          const payload = cached.exists() ? (cached.data() || {}) : {};
          const cachedSubscribers = Array.isArray(payload.subscribers) ? payload.subscribers : [];
          const cachedUsers = Array.isArray(payload.users) ? payload.users : [];
          if (cached.exists() && (cachedSubscribers.length > 0 || cachedUsers.length > 0)) {
            if (!cancelled) {
              setSubscribers(cachedSubscribers as SubscriberRow[]);
              setUsers(cachedUsers as UserRow[]);
            }
            return;
          }
        } catch {
          // Both the live API and the public cache are unavailable.
        }
        const message =
          loadError instanceof Error && loadError.message ? loadError.message : "Could not open leaderboard. Please try again shortly.";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const allUsers = useMemo(() => {
    if (users.length > 0) return users;
    return subscribers.map((row) => ({ uid: row.uid, name: row.name, photoURL: row.photoURL }));
  }, [subscribers, users]);

  const unusedSubscribers = useMemo(() => subscribers.filter((row) => row.usedCount < 1 && row.available), [subscribers]);

  const listedSubscribers = view === "unused" ? unusedSubscribers : subscribers;

  // Stats for flexible header
  const stats = useMemo(() => {
    return {
      totalUsers: allUsers.length,
      totalSubscribers: subscribers.length,
      unused: unusedSubscribers.length,
    };
  }, [allUsers.length, subscribers.length, unusedSubscribers.length]);

  return (
    <div
      data-leaderboard-page
      className="relative min-h-screen pb-0 sm:pb-8 lg:pb-10"
      style={{
        // Mobile top safe area + spacing so card never sticks to status bar
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Mobile frame — on desktop the shell's [data-desktop-content] owns the scroll */}
      <div
        data-app-frame
        className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:max-w-2xl md:max-w-3xl lg:max-w-none lg:min-h-0 xl:max-w-[1400px]"
      >
        <Header
          cartCount={cartIds.size}
          notifCount={1}
          onNavigateToSubscription={() => {
            window.location.hash = "#/subscription";
          }}
          onNavigateToCart={() => {
            window.location.hash = "#/cart";
          }}
          onNavigateToNotifications={() => {
            window.location.hash = "#/notifications";
          }}
        />

        {/* Main scroll area — flexible padding for every breakpoint.
            `overflow-y-auto` is what makes the page scroll on a phone: the
            phone band pins [data-app-frame] to 100dvh + overflow hidden, so
            the frame clips and this <main> must be the scroller (without it
            everything below the fold was unreachable). `data-footer-nav-space`
            reserves the floating dock's clearance inside the scroller. */}
        <main data-footer-nav-space className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-6 sm:px-6 sm:pt-8 md:px-8 lg:px-8 xl:px-10 2xl:px-12">
          {/* Extra top spacer for mobile — user reported no gap above card and no scroll */}
          <div className="h-2 sm:h-4 lg:h-2" aria-hidden />

          <div className="mx-auto w-full max-w-7xl">
            {/* ── Hero Card ── */}
            <GlassCard className="relative overflow-hidden">
              {/* Subtle gradient orb for desktop polish */}
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-400/10 blur-2xl lg:h-56 lg:w-56" />
              <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-violet-400/10 blur-2xl lg:h-48 lg:w-48" />

              <div className="relative flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 text-amber-300 ring-1 ring-amber-400/20 sm:h-14 sm:w-14 lg:h-16 lg:w-16">
                    <Trophy className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8" />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/70 sm:text-xs">Community</p>
                    <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl lg:text-3xl xl:text-[32px]">Leaderboard</h1>
                    <p className="mt-0.5 hidden text-xs text-white/55 sm:block lg:text-sm">Top learners & referral champions</p>
                  </div>
                </div>

                {/* Stats row — flexible: 1 col mobile, 3 cols tablet+, inline on desktop */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:flex lg:gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-center backdrop-blur-md sm:px-4 sm:py-3 lg:min-w-[110px] lg:px-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/50 sm:text-[11px]">Users</p>
                    <p className="mt-0.5 text-base font-black text-white sm:text-lg lg:text-xl">{stats.totalUsers}</p>
                  </div>
                  <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5 text-center backdrop-blur-md sm:px-4 sm:py-3 lg:min-w-[110px] lg:px-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200/70 sm:text-[11px]">Subscribers</p>
                    <p className="mt-0.5 text-base font-black text-violet-100 sm:text-lg lg:text-xl">{stats.totalSubscribers}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5 text-center backdrop-blur-md sm:px-4 sm:py-3 lg:min-w-[110px] lg:px-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70 sm:text-[11px]">Unused</p>
                    <p className="mt-0.5 text-base font-black text-emerald-100 sm:text-lg lg:text-xl">{stats.unused}</p>
                  </div>
                </div>
              </div>

              <p className="relative mt-4 text-xs leading-relaxed text-white/70 sm:mt-5 sm:text-sm lg:text-[13px] lg:leading-6">
                {view === "all"
                  ? `Every learner on ${appName}. Switch to subscribers to see unique referral IDs and support the community.`
                  : view === "unused"
                    ? "Only subscribers whose referral ID has not been used yet. Each ID works once — grab yours before it's gone."
                    : "Every verified subscriber receives a unique referral ID. Each ID can be used only once for ₹250 off."}
              </p>
            </GlassCard>

            {/* ── Tabs — sticky on mobile for easy switching ── */}
            <div className="sticky top-0 z-10 -mx-4 mt-5 bg-gradient-to-b from-black/20 via-black/10 to-transparent px-4 py-2 backdrop-blur-[2px] sm:mx-0 sm:mt-6 sm:px-0 lg:mt-8">
              <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="w-full">
                <TabsList className="w-full justify-start gap-1.5 overflow-x-auto p-1 sm:w-auto sm:inline-flex lg:gap-2">
                  <TabsTrigger value="all" className="flex-1 gap-1.5 text-[11px] font-black sm:flex-none sm:px-5 lg:text-xs">
                    <Users size={14} /> All users
                  </TabsTrigger>
                  <TabsTrigger value="subscribers" className="flex-1 gap-1.5 text-[11px] font-black sm:flex-none sm:px-5 lg:text-xs">
                    <Crown size={14} /> Subscribers
                  </TabsTrigger>
                  <TabsTrigger value="unused" className="flex-1 gap-1.5 text-[11px] font-black sm:flex-none sm:px-5 lg:text-xs">
                    <BadgeCheck size={14} /> Unused IDs
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* ── Content ── */}
            <div className="mt-5 sm:mt-6 lg:mt-8">
              {loading ? (
                <div className="grid place-items-center py-20 lg:py-28">
                  <div className="flex flex-col items-center gap-3">
                    <LoaderCircle className="h-8 w-8 animate-spin text-violet-300 lg:h-10 lg:w-10" />
                    <p className="text-xs font-semibold text-white/50 lg:text-sm">Loading leaderboard…</p>
                  </div>
                </div>
              ) : error ? (
                <div className="rounded-[20px] border border-rose-400/20 bg-rose-500/10 p-5 backdrop-blur-md sm:p-6 lg:p-8">
                  <p className="text-sm font-bold text-rose-100 sm:text-base">{error}</p>
                  <p className="mt-2 text-xs leading-relaxed text-rose-200/70 sm:text-sm">Please check your connection and try again.</p>
                </div>
              ) : view === "all" ? (
                allUsers.length === 0 ? (
                  <div className="grid place-items-center rounded-[20px] border border-white/10 bg-white/[0.03] py-20 text-center backdrop-blur-md lg:py-28">
                    <Users className="h-10 w-10 text-white/20 lg:h-12 lg:w-12" />
                    <p className="mt-3 text-sm font-semibold text-white/60 lg:text-base">No users are listed yet.</p>
                    <p className="mt-1 max-w-sm text-xs text-white/40 lg:text-sm">Be the first to join the community!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4 2xl:grid-cols-4">
                    {allUsers.map((row, index) => {
                      const rank = index + 1;
                      const isTop3 = rank <= 3;
                      return (
                        <GlassCard
                          key={row.uid}
                          className={`group relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${isTop3 ? "ring-1 ring-amber-400/20" : ""}`}
                        >
                          {isTop3 && (
                            <div className="pointer-events-none absolute right-0 top-0">
                              <div
                                className={`rounded-bl-2xl px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                                  rank === 1
                                    ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white"
                                    : rank === 2
                                      ? "bg-gradient-to-br from-slate-300 to-slate-400 text-slate-900"
                                      : "bg-gradient-to-br from-amber-600 to-orange-700 text-white"
                                }`}
                              >
                                #{rank}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <span className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-black ${isTop3 ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30" : "bg-white/10 text-white/60"}`}>
                              {rank <= 3 ? <Medal size={12} className={rank === 1 ? "text-amber-300" : rank === 2 ? "text-slate-300" : "text-amber-600"} /> : `#${rank}`}
                            </span>
                            <Avatar name={row.name} photoURL={row.photoURL} size={44} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black text-white group-hover:text-amber-100 sm:text-[15px]">{row.name}</p>
                              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                                <Star size={10} className="text-amber-300/60" /> Learner
                              </p>
                            </div>
                          </div>
                        </GlassCard>
                      );
                    })}
                  </div>
                )
              ) : listedSubscribers.length === 0 ? (
                <div className="grid place-items-center rounded-[20px] border border-white/10 bg-white/[0.03] py-20 text-center backdrop-blur-md lg:py-28">
                  <Crown className="h-10 w-10 text-white/20 lg:h-12 lg:w-12" />
                  <p className="mt-3 text-sm font-semibold text-white/60 lg:text-base">
                    {view === "unused" ? "No unused referral IDs right now." : "No subscribers yet."}
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-white/40 lg:text-sm">
                    {view === "unused" ? "All referral codes have been used. Check back later!" : "Subscribe to get your own referral ID."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:gap-4 lg:grid-cols-2 xl:grid-cols-3 lg:gap-5 xl:gap-6">
                  {listedSubscribers.map((row, index) => {
                    const used = row.usedCount > 0 || !row.available;
                    const rank = index + 1;
                    return (
                      <GlassCard
                        key={row.uid}
                        data-referral-used={used ? "true" : "false"}
                        className={`group relative overflow-hidden transition-all duration-300 hover:scale-[1.01] hover:shadow-xl ${used ? "opacity-90" : "ring-1 ring-emerald-400/10 hover:ring-emerald-400/20"}`}
                      >
                        {/* Rank + status */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-black ${
                                rank === 1
                                  ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30"
                                  : rank === 2
                                    ? "bg-slate-400/20 text-slate-200 ring-1 ring-slate-300/20"
                                    : rank === 3
                                      ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/20"
                                      : "bg-white/10 text-white/60"
                              }`}
                            >
                              {rank <= 3 ? <Trophy size={11} /> : `#${rank}`}
                            </span>
                            <Avatar name={row.name} photoURL={row.photoURL} size={40} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-white sm:text-[15px]">{row.name}</p>
                              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-violet-300">
                                <Crown size={11} /> {row.planId}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ring-1 ${
                              used
                                ? "bg-amber-500/15 text-amber-200 ring-amber-400/20"
                                : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/20"
                            }`}
                          >
                            {used ? "Used" : "Active"}
                          </span>
                        </div>

                        {/* Referral ID */}
                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-md sm:px-3.5">
                          <div className="min-w-0 flex-1">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-white/40">Referral ID</span>
                            <code
                              className={`mt-0.5 block truncate text-sm font-black tracking-wide sm:text-[15px] ${used ? "text-white/40 line-through decoration-2 decoration-rose-400" : "text-white"}`}
                            >
                              {row.referralCode}
                            </code>
                          </div>
                          <GlassButton
                            onClick={() => void copyReferralCode(row.referralCode)}
                            className="shrink-0 [&_.size-12]:size-9"
                            aria-label={`Copy referral ID ${row.referralCode}`}
                          >
                            {copiedReferralCode === row.referralCode ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                          </GlassButton>
                        </div>

                        {used ? (
                          <p className="mt-2.5 flex items-center gap-1 text-[10px] font-semibold text-amber-200/80">
                            <Sparkles size={10} /> This referral ID has been used and is discontinued.
                          </p>
                        ) : (
                          <p className="mt-2.5 text-[10px] font-medium leading-relaxed text-emerald-200/60">
                            Share this code — new users get ₹250 off, you get rewards.
                          </p>
                        )}
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom spacing for scroll comfort */}
            <div className="h-6 sm:h-8 lg:h-10" aria-hidden />
          </div>
        </main>

        <BottomNav
          active={null}
          onChange={(tab) => {
            if (tab === "home") window.location.hash = "#/home";
            else if (tab === "myday") window.location.hash = "#/my-day";
            else if (tab === "store") window.location.hash = "#/store";
            else if (tab === "purchases") window.location.hash = "#/store/purchases";
            else if (tab === "profile") window.location.hash = "#/profile";
          }}
          purchasesBadge={purchasedIds.size}
        />
      </div>
    </div>
  );
}
