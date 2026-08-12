import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Bell,
  Boxes,
  ChevronRight,
  Crown,
  Heart,
  History,
  LoaderCircle,
  Lock,
  LogOut,
  Pencil,
  Save,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { db } from "../../firebase";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";

type Modal = "edit" | "coins" | "settings" | null;
type Preferences = {
  push: boolean;
  email: boolean;
  promotions: boolean;
  profileVisible: boolean;
  shareActivity: boolean;
};

type CoinEntry = { id: string; amount: number; reason: string; createdAt: Date | null };

const DEFAULT_PREFERENCES: Preferences = {
  push: true,
  email: true,
  promotions: false,
  profileVisible: true,
  shareActivity: true,
};

const toDate = (value: unknown): Date | null => {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
};

export default function ProfileApp() {
  const { user, logout, updateAccount } = useAuth();
  const { products, purchasedIds } = useCatalog();
  const { favoriteIds, cartIds } = useCommerce();
  const [modal, setModal] = useState<Modal>(null);
  const [coinHistory, setCoinHistory] = useState<CoinEntry[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    const unsubscribeProfile = onSnapshot(doc(db, "users", user.id), (snapshot) => {
      const data = snapshot.data() || {};
      setPreferences({ ...DEFAULT_PREFERENCES, ...(data.preferences || {}) });
    });
    const unsubscribeCoins = onSnapshot(collection(db, "users", user.id, "coinTransactions"), (snapshot) => {
      const entries = snapshot.docs.map((item) => {
        const data = item.data();
        return { id: item.id, amount: Number(data.amount || 0), reason: String(data.reason || data.title || "EduCoin activity"), createdAt: toDate(data.createdAt || data.date) };
      }).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      setCoinHistory(entries);
    }, (error) => console.warn("Coin history sync failed", error));
    return () => { unsubscribeProfile(); unsubscribeCoins(); };
  }, [user]);

  const purchasedProducts = useMemo(() => products.filter((product) => purchasedIds.has(product.id)), [products, purchasedIds]);
  const initials = user?.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "Recently";

  if (!user) return null;

  const savePreferences = async (next: Preferences) => {
    setPreferences(next);
    setPreferencesSaving(true);
    try {
      await setDoc(doc(db, "users", user.id), { preferences: next, updatedAt: serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error("Preference save failed", error);
      setMessage("Preferences could not be saved.");
    } finally {
      setPreferencesSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-100 pb-10 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <button onClick={() => { window.location.hash = "#/store"; }} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200" aria-label="Back to store"><ArrowLeft size={18} /></button>
          <div><p className="text-xs font-bold uppercase tracking-wider text-violet-600">My account</p><h1 className="text-sm font-black">Profile & library</h1></div>
          {preferencesSaving && <LoaderCircle className="ml-auto h-4 w-4 animate-spin text-violet-600" />}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {message && <div className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{message}</div>}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-violet-200">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            {user.photoURL ? <img src={user.photoURL} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-white/40" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-white/20 text-xl font-black ring-2 ring-white/40">{initials}</div>}
            <div className="min-w-0 flex-1"><h2 className="truncate text-xl font-black">{user.name}</h2><p className="truncate text-xs text-white/80">{user.email}</p><p className="mt-1 text-[11px] text-white/60">Member since {memberSince}</p></div>
            {user.role !== "user" && <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase">{user.role}</span>}
          </div>
          <p className="relative mt-4 text-sm leading-6 text-white/85">{user.bio || "Add a short bio to personalize your learner profile."}</p>
          <button onClick={() => setModal("edit")} className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-sm font-black ring-1 ring-white/30"><Pencil size={15} /> Edit profile</button>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-xl">🪙</div><Wallet className="text-slate-300" /></div><p className="mt-4 text-xs font-bold text-slate-400">EduCoin balance</p><p className="text-3xl font-black">{user.coins.toLocaleString("en-IN")}</p><button onClick={() => setModal("coins")} className="mt-4 flex items-center gap-2 text-xs font-black text-amber-700"><History size={14} /> View verified history</button></section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-100"><Crown className="text-violet-600" /></div><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">{user.subscriptionTier || "basic"}</span></div><p className="mt-4 text-xs font-bold text-slate-400">Membership</p><p className="text-xl font-black capitalize">{user.subscriptionTier === "basic" ? "Basic learner" : `${user.subscriptionTier} membership`}</p><button onClick={() => { window.location.hash = "#/subscription"; }} className="mt-4 flex items-center gap-1 text-xs font-black text-violet-700">Manage membership <ChevronRight size={14} /></button></section>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-xs font-black uppercase tracking-wider text-slate-400">My library</h3><div className="mt-4 grid grid-cols-3 gap-3"><LibraryStat icon={<ShoppingBag />} value={purchasedIds.size} label="Purchased" onClick={() => { window.location.hash = "#/store/purchases"; }} /><LibraryStat icon={<Heart />} value={favoriteIds.size} label="Favorites" onClick={() => { window.location.hash = "#/favorites"; }} /><LibraryStat icon={<Boxes />} value={cartIds.size} label="In cart" onClick={() => { window.location.hash = "#/cart"; }} /></div>{purchasedProducts.length > 0 && <div className="mt-5 space-y-2">{purchasedProducts.slice(0, 3).map((product) => <button key={product.id} onClick={() => { window.location.hash = `#/course/${encodeURIComponent(product.id)}`; }} className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left"><img src={product.image} alt="" className="h-12 w-16 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{product.title}</span><span className="text-xs text-slate-400">Owned · Open course</span></span><ChevronRight size={16} className="text-slate-300" /></button>)}</div>}</section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Preferences</h3><p className="mt-1 text-xs text-slate-400">Saved securely to your account</p></div><button onClick={() => setModal("settings")} className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><Bell size={18} /></button></div></section>

        {user.role !== "user" && <button onClick={() => { window.location.hash = "#/admin"; }} className="flex w-full items-center justify-between rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white"><span className="flex items-center gap-2"><ShieldCheck size={18} /> Open admin workspace</span><ChevronRight size={17} /></button>}
        <button onClick={() => void logout().then(() => { window.location.hash = "#/auth?mode=login"; })} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 py-4 text-sm font-black text-rose-600 ring-1 ring-rose-100"><LogOut size={17} /> Log out</button>
      </main>

      {modal === "edit" && <EditModal user={user} onClose={() => setModal(null)} onSave={async (details) => { const result = await updateAccount(details); setMessage(result.message); if (result.success) setModal(null); return result.success; }} />}
      {modal === "coins" && <BaseModal title="EduCoin history" onClose={() => setModal(null)}>{coinHistory.length === 0 ? <Empty icon={<History />} title="No coin activity yet" text="Verified rewards and spends will appear here." /> : <div className="space-y-2">{coinHistory.map((entry) => <div key={entry.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><p className="text-sm font-bold">{entry.reason}</p><p className="text-[11px] text-slate-400">{entry.createdAt?.toLocaleString("en-IN") || "Recently"}</p></div><span className={`font-black ${entry.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</span></div>)}</div>}</BaseModal>}
      {modal === "settings" && <BaseModal title="Preferences" onClose={() => setModal(null)}><div className="space-y-2"><PreferenceRow icon={<Bell />} label="Push notifications" checked={preferences.push} onChange={(checked) => void savePreferences({ ...preferences, push: checked })} /><PreferenceRow icon={<Sparkles />} label="Email updates" checked={preferences.email} onChange={(checked) => void savePreferences({ ...preferences, email: checked })} /><PreferenceRow icon={<Bell />} label="Promotions" checked={preferences.promotions} onChange={(checked) => void savePreferences({ ...preferences, promotions: checked })} /><PreferenceRow icon={<UserRound />} label="Public profile" checked={preferences.profileVisible} onChange={(checked) => void savePreferences({ ...preferences, profileVisible: checked })} /><PreferenceRow icon={<Lock />} label="Share learning activity" checked={preferences.shareActivity} onChange={(checked) => void savePreferences({ ...preferences, shareActivity: checked })} /></div></BaseModal>}
    </div>
  );
}

function LibraryStat({ icon, value, label, onClick }: { icon: React.ReactNode; value: number; label: string; onClick: () => void }) { return <button onClick={onClick} className="rounded-2xl bg-slate-50 p-3 text-center"><span className="mx-auto flex justify-center text-violet-600">{icon}</span><span className="mt-2 block text-xl font-black">{value}</span><span className="block text-[10px] font-bold text-slate-400">{label}</span></button>; }
function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6"><div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100"><X size={17} /></button></div>{children}</div></div>; }
function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="py-10 text-center text-slate-400"><div className="flex justify-center">{icon}</div><p className="mt-3 font-black text-slate-700">{title}</p><p className="mt-1 text-sm">{text}</p></div>; }
function PreferenceRow({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><span className="text-violet-600">{icon}</span><span className="flex-1 text-sm font-bold">{label}</span><button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full ${checked ? "bg-violet-600" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} /></button></div>; }

function EditModal({ user, onClose, onSave }: { user: NonNullable<ReturnType<typeof useAuth>["user"]>; onClose: () => void; onSave: (details: { name: string; mobile: string; bio: string }) => Promise<boolean> }) {
  const [name, setName] = useState(user.name); const [mobile, setMobile] = useState(user.mobile || ""); const [bio, setBio] = useState(user.bio || ""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (name.trim().length < 2) { setError("Enter your full name."); return; } if (mobile && mobile.replace(/\D/g, "").length !== 10) { setError("Enter a valid 10 digit mobile number."); return; } setSaving(true); setError(""); const ok = await onSave({ name, mobile, bio }); if (!ok) setError("Profile could not be updated."); setSaving(false); };
  return <BaseModal title="Edit profile" onClose={onClose}><form onSubmit={submit} className="space-y-4"><Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Email address"><input value={user.email} disabled /></Field><Field label="Mobile number"><input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10 digit number" /></Field><Field label="Bio"><textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 240))} rows={3} placeholder="Tell learners about yourself" /></Field>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}<button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 text-sm font-black text-white disabled:opacity-60">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />} {saving ? "Saving…" : "Save changes"}</button></form></BaseModal>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span><div className="[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-slate-50 [&_input]:px-4 [&_input]:py-3 [&_input]:text-sm [&_input]:outline-none [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:bg-slate-50 [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-sm [&_textarea]:outline-none">{children}</div></label>; }
