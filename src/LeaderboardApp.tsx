import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { BadgeCheck, Crown, LoaderCircle, Trophy, Users } from "lucide-react";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import { useCatalog } from "./context/CatalogContext";
import { useCommerce } from "./context/CommerceContext";
import { useBranding } from "./context/BrandingContext";
import { db } from "../firebase";

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/referral-leaderboard");
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
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200">
        <Header
          cartCount={cartIds.size}
          notifCount={1}
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />
        <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
          <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-xl shadow-violet-200">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><Trophy /></span>
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
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setView("all")}
              className={`flex items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-black transition ${
                view === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              <Users size={13} /> All users
            </button>
            <button
              type="button"
              onClick={() => setView("subscribers")}
              className={`flex items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-black transition ${
                view === "subscribers" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              <Crown size={13} /> Subscribers
            </button>
            <button
              type="button"
              onClick={() => setView("unused")}
              className={`flex items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-black transition ${
                view === "unused" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              <BadgeCheck size={13} /> Unused IDs
            </button>
          </div>

          {loading ? (
            <div className="grid place-items-center py-16"><LoaderCircle className="animate-spin text-violet-600" /></div>
          ) : error ? (
            <p className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>
          ) : view === "all" ? (
            allUsers.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">No users are listed yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {allUsers.map((row, index) => (
                  <article key={row.uid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-sm font-black text-slate-400">#{index + 1}</span>
                      <Avatar name={row.name} photoURL={row.photoURL} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-900">{row.name}</p>
                        <p className="text-[10px] font-semibold uppercase text-slate-400">Learner</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : listedSubscribers.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              {view === "unused" ? "No unused referral IDs are available right now." : "No subscribers are listed yet."}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {listedSubscribers.map((row, index) => {
                const used = row.usedCount > 0 || !row.available;
                return (
                <article key={row.uid} className={`rounded-2xl border p-4 shadow-sm ${used ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-black text-slate-400">#{index + 1}</span>
                    <Avatar name={row.name} photoURL={row.photoURL} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-900">{row.name}</p>
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-violet-600"><Crown size={11} /> {row.planId}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${used ? "bg-amber-200 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                      {used ? "Used" : "Use now"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-white/70 px-3 py-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Referral ID</span>
                    <code className={`max-w-[230px] truncate text-xs font-black ${used ? "text-slate-400 line-through decoration-2 decoration-rose-400" : "text-slate-800"}`}>{row.referralCode}</code>
                  </div>
                  {used ? (
                    <p className="mt-2 text-[10px] font-semibold text-amber-700">This referral ID has been used and is discontinued.</p>
                  ) : null}
                </article>
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
