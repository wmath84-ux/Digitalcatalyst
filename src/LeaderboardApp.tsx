import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Crown, LoaderCircle, Trophy } from "lucide-react";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import { useCatalog } from "./context/CatalogContext";
import { useCommerce } from "./context/CommerceContext";
import { db } from "../firebase";

type Row = { uid: string; name: string; photoURL: string | null; planId: string; referralCode: string; usedCount: number; available: boolean };

export default function LeaderboardApp() {
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/referral-leaderboard");
        const data = await response.json().catch(() => ({})) as { ok?: boolean; subscribers?: Row[]; error?: string };
        if (response.ok && data.ok) {
          if (!cancelled) setRows(Array.isArray(data.subscribers) ? data.subscribers : []);
          return;
        }
        throw new Error(data.error || "Could not open leaderboard.");
      } catch {
        try {
          const cached = await getDoc(doc(db, "publicLeaderboard", "referrals"));
          const subscribers = cached.exists() ? (cached.data()?.subscribers || []) : [];
          if (Array.isArray(subscribers) && subscribers.length >= 0 && cached.exists()) {
            if (!cancelled) setRows(subscribers as Row[]);
            return;
          }
        } catch {
          // Both the live API and the public cache are unavailable.
        }
        if (!cancelled) setError("Could not open leaderboard. Please try again shortly.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  return <div className="min-h-screen bg-slate-100 sm:py-6"><div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200">
    <Header cartCount={cartIds.size} notifCount={1} onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }} onNavigateToCart={() => { window.location.hash = "#/cart"; }} onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }} />
    <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
      <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-xl shadow-violet-200"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><Trophy /></span><div><p className="text-xs font-bold uppercase tracking-wider text-white/70">Subscriber community</p><h1 className="text-xl font-black">Referral Leaderboard</h1></div></div><p className="mt-3 text-xs leading-relaxed text-white/75">Every verified subscriber receives a unique referral code. Redeemed codes rank first.</p></div>
      {loading ? <div className="grid place-items-center py-16"><LoaderCircle className="animate-spin text-violet-600" /></div> : error ? <p className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p> : rows.length === 0 ? <p className="py-16 text-center text-sm text-slate-400">No subscribers are listed yet.</p> : <div className="mt-4 space-y-3">{rows.map((row, index) => <article key={row.uid} className={`rounded-2xl border p-4 shadow-sm ${row.usedCount > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}><div className="flex items-center gap-3"><span className="w-6 text-center text-sm font-black text-slate-400">#{index + 1}</span>{row.photoURL ? <img src={row.photoURL} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-violet-100 font-black text-violet-700">{row.name.slice(0, 1).toUpperCase()}</span>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{row.name}</p><p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-violet-600"><Crown size={11} /> {row.planId}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${row.usedCount > 0 ? "bg-amber-200 text-amber-800" : row.available ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{row.usedCount > 0 ? `Used ${row.usedCount}×` : row.available ? "Use now" : "Unavailable"}</span></div><div className="mt-3 flex items-center justify-between rounded-xl bg-white/70 px-3 py-2"><span className="text-[10px] font-bold uppercase text-slate-400">Referral code</span><code className="max-w-[230px] truncate text-xs font-black text-slate-800">{row.referralCode}</code></div></article>)}</div>}
    </main>
    <BottomNav active="leaderboard" onChange={(tab) => {
      if (tab === "home") window.location.hash = "#/home";
      else if (tab === "myday") window.location.hash = "#/my-day";
      else if (tab === "store") window.location.hash = "#/store";
      else if (tab === "purchases") window.location.hash = "#/store/purchases";
      else if (tab === "profile") window.location.hash = "#/profile";
    }} purchasesBadge={purchasedIds.size} />
  </div></div>;
}
