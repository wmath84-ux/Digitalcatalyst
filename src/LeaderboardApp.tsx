import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "./components/ui/GlassCard";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/glass-tabs";
import { GlassButton } from "./components/ui/glass-button";
import { doc, getDoc } from "firebase/firestore";
import { BadgeCheck, Check, Copy, Crown, LoaderCircle, Trophy, Users } from "lucide-react";
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

function Avatar({ name, photoURL }: { name: string; photoURL: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = photoURL && photoURL.trim() && !failed ? photoURL.trim() : "";
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-11 w-11 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="grid h-11 w-11 place-items-center rounded-full bg-violet-100 font-black text-violet-700">
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
        const data = await response.json().catch(() => ({})) as {
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
        const reason = data.code === "firebase_admin_not_configured"
          ? "Leaderboard service is not configured. Add the Firebase service account on the server, then try again."
          : data.error || "Could not open leaderboard.";
        throw new Error(reason);
      } catch (loadError) {
        try {
          const cached = await getDoc(doc(db, "publicLeaderboard", "referrals"));
          const payload = cached.exists() ? cached.data() || {} : {};
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
        const message = loadError instanceof Error && loadError.message ? loadError.message : "Could not open leaderboard. Please try again shortly.";
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

  const unusedSubscribers = useMemo(
    () => subscribers.filter((row) => row.usedCount < 1 && row.available),
    [subscribers],
  );

  const listedSubscribers = view === "unused" ? unusedSubscribers : subscribers;

  return (
    <div className="min-h-screen sm:py-6">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] md:max-w-none md:rounded-none">
        <Header
          cartCount={cartIds.size}
          notifCount={1}
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />
        <main className="flex-1 overflow-y-auto px-4 py-5">
          <GlassCard>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-300"><Trophy /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/70">Community</p>
                <h1 className="text-xl font-black">Leaderboard</h1>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/75">
              {view === "all"
                ? `Every learner on ${appName}. Switch to subscribers to see unique referral IDs.`
                : view === "unused"
                  ? "Only subscribers whose referral ID has not been used yet. Each ID works once."
                  : "Every verified subscriber receives a unique referral ID. Each ID can be used only once for ₹250 off."}
            </p>
          </GlassCard>

          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1 gap-1 text-[11px] font-black"><Users size={13} /> All users</TabsTrigger>
              <TabsTrigger value="subscribers" className="flex-1 gap-1 text-[11px] font-black"><Crown size={13} /> Subscribers</TabsTrigger>
              <TabsTrigger value="unused" className="flex-1 gap-1 text-[11px] font-black"><BadgeCheck size={13} /> Unused IDs</TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="grid place-items-center py-16"><LoaderCircle className="animate-spin text-violet-300" /></div>
          ) : error ? (
            <p className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-semibold text-rose-200">{error}</p>
          ) : view === "all" ? (
            allUsers.length === 0 ? (
              <p className="py-16 text-center text-sm text-white/55">No users are listed yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {allUsers.map((row, index) => (
                  <GlassCard key={row.uid}>
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-sm font-black text-white/55">#{index + 1}</span>
                      <Avatar name={row.name} photoURL={row.photoURL} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-white">{row.name}</p>
                        <p className="text-[10px] font-semibold uppercase text-white/55">Learner</p>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )
          ) : listedSubscribers.length === 0 ? (
            <p className="py-16 text-center text-sm text-white/55">
              {view === "unused" ? "No unused referral IDs are available right now." : "No subscribers are listed yet."}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {listedSubscribers.map((row, index) => {
                const used = row.usedCount > 0 || !row.available;
                return (
                <GlassCard key={row.uid} data-referral-used={used ? "true" : "false"}>
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-black text-white/55">#{index + 1}</span>
                    <Avatar name={row.name} photoURL={row.photoURL} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-white">{row.name}</p>
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-violet-300"><Crown size={11} /> {row.planId}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${used ? "bg-amber-500/20 text-amber-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                      {used ? "Used" : "Use now"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <span className="shrink-0 text-[10px] font-bold uppercase text-white/55">Referral ID</span>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <code className={`min-w-0 max-w-[190px] truncate text-xs font-black ${used ? "text-white/40 line-through decoration-2 decoration-rose-400" : "text-white"}`}>{row.referralCode}</code>
                      <GlassButton
                        onClick={() => void copyReferralCode(row.referralCode)}
                        className="shrink-0 [&_.size-12]:size-8"
                        aria-label={`Copy referral ID ${row.referralCode}`}
                      >
                        {copiedReferralCode === row.referralCode ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
                      </GlassButton>
                    </div>
                  </div>
                  {used ? (
                    <p className="mt-2 text-[10px] font-semibold text-amber-200">This referral ID has been used and is discontinued.</p>
                  ) : null}
                </GlassCard>
                );
              })}
            </div>
          )}
        </main>
        <BottomNav active={null} onChange={(tab) => {
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
