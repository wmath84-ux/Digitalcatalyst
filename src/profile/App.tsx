import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Bell,
  Boxes,
  ChevronRight,
  Crown,
  Heart,
  LoaderCircle,
  Lock,
  LogOut,
  Pencil,
  Save,
  ShoppingBag,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { db } from "../../firebase";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { useOwnedProducts } from "../hooks/useCourseAccess";

type Modal = "edit" | "settings" | null;
type Preferences = {
  push: boolean;
  email: boolean;
  promotions: boolean;
  profileVisible: boolean;
  shareActivity: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  push: true,
  email: true,
  promotions: false,
  profileVisible: true,
  shareActivity: true,
};

export default function ProfileApp() {
  const { user, logout, updateAccount } = useAuth();
  const { products, purchasedIds } = useCatalog();
  const { favoriteIds, cartIds } = useCommerce();
  // Part 10 — full product ownership from the canonical
  // entitlements collection. The Profile uses this as the
  // authoritative "Purchased" count.
  const { ownedProductIds: canonicalOwnedIds, signedIn } = useOwnedProducts();
  const [modal, setModal] = useState<Modal>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [message, setMessage] = useState("");
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!user) return undefined;
    const unsubscribeProfile = onSnapshot(doc(db, "users", user.id), (snapshot) => {
      const data = snapshot.data() || {};
      setPreferences({ ...DEFAULT_PREFERENCES, ...(data.preferences || {}) });
    });
    return () => { unsubscribeProfile(); };
  }, [user]);

  const purchasedProducts = useMemo(() => products.filter((product) => purchasedIds.has(product.id)), [products, purchasedIds]);
  const initials = user?.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "Recently";
  // Purchased count used by both the library stat and the footer badge.
  const ownedCount = signedIn ? Math.max(purchasedIds.size, canonicalOwnedIds.length) : purchasedIds.size;

  const handleFooterChange = (tab: TabKey) => {
    if (tab === "home") window.location.hash = "#/home";
    else if (tab === "myday") window.location.hash = "#/my-day";
    else if (tab === "store") window.location.hash = "#/store";
    else if (tab === "purchases") window.location.hash = "#/store/purchases";
    else if (tab === "profile") mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

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
    <div className="min-h-screen bg-slate-100 text-slate-900 sm:py-6">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200">
        <Header
          cartCount={cartIds.size}
          notifCount={1}
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main ref={mainRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-violet-600">My account</p>
                <h1 className="text-lg font-black">Profile & library</h1>
              </div>
              {preferencesSaving && <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" />}
            </div>
            {message && <div className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{message}</div>}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-violet-200">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            {user.photoURL ? <img src={user.photoURL} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-white/40" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-white/20 text-xl font-black ring-2 ring-white/40">{initials}</div>}
            <div className="min-w-0 flex-1"><h2 className="truncate text-xl font-black">{user.name}</h2><p className="truncate text-xs text-white/80">{user.email}</p><p className="mt-1 text-[11px] text-white/60">Member since {memberSince}</p></div>

          </div>
          <p className="relative mt-4 text-sm leading-6 text-white/85">{user.bio || "Add a short bio to personalize your learner profile."}</p>
          <button onClick={() => setModal("edit")} className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-sm font-black ring-1 ring-white/30"><Pencil size={15} /> Edit profile</button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-100"><Crown className="text-violet-600" /></div><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">{user.subscriptionTier || "basic"}</span></div><p className="mt-4 text-xs font-bold text-slate-400">Membership</p><p className="text-xl font-black capitalize">{user.subscriptionTier === "basic" ? "Basic learner" : `${user.subscriptionTier} membership`}</p><button onClick={() => { window.location.hash = "#/subscription"; }} className="mt-4 flex items-center gap-1 text-xs font-black text-violet-700">Manage membership <ChevronRight size={14} /></button></section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-xs font-black uppercase tracking-wider text-slate-400">My library</h3>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <LibraryStat icon={<ShoppingBag />} value={ownedCount} label="Purchased" onClick={() => { window.location.hash = "#/store/purchases"; }} />
            <LibraryStat icon={<Heart />} value={favoriteIds.size} label="Favorites" onClick={() => { window.location.hash = "#/favorites"; }} />
            <LibraryStat icon={<Boxes />} value={cartIds.size} label="In cart" onClick={() => { window.location.hash = "#/cart"; }} />
          </div>
          {purchasedProducts.length > 0 && <div className="mt-5 space-y-2">{purchasedProducts.slice(0, 3).map((product) => <button key={product.id} onClick={() => { window.location.hash = `#/course/${encodeURIComponent(product.id)}`; }} className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left"><img src={product.image} alt="" className="h-12 w-16 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{product.title}</span><span className="text-xs text-slate-400">Owned · Open course</span></span><ChevronRight size={16} className="text-slate-300" /></button>)}</div>}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Preferences</h3><p className="mt-1 text-xs text-slate-400">Saved securely to your account</p></div><button onClick={() => setModal("settings")} className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><Bell size={18} /></button></div></section>

        <button onClick={() => void logout().then(() => { window.location.hash = "#/auth?mode=login"; })} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 py-4 text-sm font-black text-rose-600 ring-1 ring-rose-100"><LogOut size={17} /> Log out</button>
          </div>
        </main>

        <BottomNav active="profile" onChange={handleFooterChange} purchasesBadge={ownedCount} />

        {modal === "edit" && <EditModal user={user} onClose={() => setModal(null)} onSave={async (details) => { const result = await updateAccount(details); setMessage(result.message); if (result.success) setModal(null); return result.success; }} />}
      {modal === "settings" && <BaseModal title="Preferences" onClose={() => setModal(null)}><div className="space-y-2"><PreferenceRow icon={<Bell />} label="Push notifications" checked={preferences.push} onChange={(checked) => void savePreferences({ ...preferences, push: checked })} /><PreferenceRow icon={<Sparkles />} label="Email updates" checked={preferences.email} onChange={(checked) => void savePreferences({ ...preferences, email: checked })} /><PreferenceRow icon={<Bell />} label="Promotions" checked={preferences.promotions} onChange={(checked) => void savePreferences({ ...preferences, promotions: checked })} /><PreferenceRow icon={<UserRound />} label="Public profile" checked={preferences.profileVisible} onChange={(checked) => void savePreferences({ ...preferences, profileVisible: checked })} /><PreferenceRow icon={<Lock />} label="Share learning activity" checked={preferences.shareActivity} onChange={(checked) => void savePreferences({ ...preferences, shareActivity: checked })} /></div></BaseModal>}
      </div>
    </div>
  );
}

function LibraryStat({ icon, value, label, onClick }: { icon: React.ReactNode; value: number; label: string; onClick: () => void }) { return <button onClick={onClick} className="rounded-2xl bg-slate-50 p-3 text-center"><span className="mx-auto flex justify-center text-violet-600">{icon}</span><span className="mt-2 block text-xl font-black">{value}</span><span className="block text-[10px] font-bold text-slate-400">{label}</span></button>; }
function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6"><div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100"><X size={17} /></button></div>{children}</div></div>; }
function PreferenceRow({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><span className="text-violet-600">{icon}</span><span className="flex-1 text-sm font-bold">{label}</span><button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full ${checked ? "bg-violet-600" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} /></button></div>; }

function EditModal({ user, onClose, onSave }: { user: NonNullable<ReturnType<typeof useAuth>["user"]>; onClose: () => void; onSave: (details: { name: string; mobile: string; bio: string }) => Promise<boolean> }) {
  const [name, setName] = useState(user.name); const [mobile, setMobile] = useState(user.mobile || ""); const [bio, setBio] = useState(user.bio || ""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (name.trim().length < 2) { setError("Enter your full name."); return; } if (mobile && mobile.replace(/\D/g, "").length !== 10) { setError("Enter a valid 10 digit mobile number."); return; } setSaving(true); setError(""); const ok = await onSave({ name, mobile, bio }); if (!ok) setError("Profile could not be updated."); setSaving(false); };
  return <BaseModal title="Edit profile" onClose={onClose}><form onSubmit={submit} className="space-y-4"><Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Email address"><input value={user.email} disabled /></Field><Field label="Mobile number"><input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10 digit number" /></Field><Field label="Bio"><textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 240))} rows={3} placeholder="Tell learners about yourself" /></Field>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}<button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 text-sm font-black text-white disabled:opacity-60">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />} {saving ? "Saving…" : "Save changes"}</button></form></BaseModal>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span><div className="[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-slate-50 [&_input]:px-4 [&_input]:py-3 [&_input]:text-sm [&_input]:outline-none [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:bg-slate-50 [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-sm [&_textarea]:outline-none">{children}</div></label>; }
