// src/settings/SettingsPage.tsx
//
// The dedicated Settings / Preferences page (`#/settings`).
//
// The desktop rail's "Settings" entry used to deep-link into the Profile page
// and the learner had to open a modal to reach the switches. This page is the
// real destination: the same five preference toggles the Profile modal shows,
// on their own screen, with the same Firestore field (`users/{uid}.preferences`)
// and the same web-push registration behind the Push switch.
//
// Nothing here is re-implemented:
//   • `PreferenceRow` (the toggle row) and `BaseModal` come from
//     `src/profile/ProfileLayout.tsx`.
//   • `Preferences` + `DEFAULT_PREFERENCES` come from `src/profile/App.tsx`.
//   • the two save handlers mirror `src/profile/App.tsx` exactly, so the
//     Profile and this page can never disagree about what "saved" means.
//
// Layout is the ordinary phone-shaped app frame (`[data-app-frame]` with a
// direct `<main>`), which is the shape the tablet scroll model already binds
// to the viewport — so this page scrolls on a tablet with no extra CSS.

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowLeft, Bell, Lock, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { db } from "../../firebase";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { ensureSavedWebPushSubscription, removeWebPushSubscription } from "../../utils/webPush";
import { BaseModal, PreferenceRow } from "../profile/ProfileLayout";
import { DEFAULT_PREFERENCES, type Preferences } from "../profile/App";

export default function SettingsPage() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pushHelpOpen, setPushHelpOpen] = useState(false);

  // Same listener the Profile uses: the switches always show what is stored on
  // the user document, so the two screens stay in sync while both are mounted.
  useEffect(() => {
    if (!user) return undefined;
    const unsubscribe = onSnapshot(
      doc(db, "users", user.id),
      (snapshot) => {
        const data = snapshot.data() || {};
        setPreferences({ ...DEFAULT_PREFERENCES, ...(data.preferences || {}) });
      },
      (error) => console.warn("Settings sync failed", error),
    );
    return unsubscribe;
  }, [user]);

  const handleFooterChange = (tab: TabKey) => {
    if (tab === "home") window.location.hash = "#/home";
    else if (tab === "myday") window.location.hash = "#/my-day";
    else if (tab === "store") window.location.hash = "#/store";
    else if (tab === "purchases") window.location.hash = "#/store/purchases";
    else if (tab === "profile") window.location.hash = "#/profile";
    else if (tab === "revision") window.location.hash = "#/revision";
  };

  if (!user) {
    return (
      <div data-settings-page className="min-h-screen bg-gradient-to-b from-indigo-50 via-slate-50 to-white text-slate-900">
        <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col">
          <main data-settings-content className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
              <ShieldCheck size={24} />
            </span>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Sign in to change settings</h1>
            <p className="max-w-xs text-sm font-medium text-slate-500">
              Notifications and privacy switches are saved to your account, so they need a signed-in learner.
            </p>
            <button
              type="button"
              onClick={() => { window.location.hash = "#/auth?mode=login"; }}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/25"
            >
              Sign in
            </button>
          </main>
        </div>
      </div>
    );
  }

  const savePreferences = async (next: Preferences) => {
    setPreferences(next);
    setSaving(true);
    try {
      await setDoc(doc(db, "users", user.id), { preferences: next, updatedAt: serverTimestamp() }, { merge: true });
      setMessage("");
    } catch (error) {
      console.error("Preference save failed", error);
      setMessage("Preferences could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  // The Push switch must actually register/remove this device, otherwise the
  // preference is cosmetic and system notifications never arrive.
  const handlePushToggle = async (checked: boolean) => {
    setSaving(true);
    try {
      if (checked) {
        const enabled = await ensureSavedWebPushSubscription(user.id);
        const permission = typeof window !== "undefined" ? window.Notification.permission : "denied";
        if (!enabled || permission !== "granted") {
          setMessage("Notifications are blocked in your browser. Enable them in the browser's site settings, then try again.");
          setPushHelpOpen(true);
          setPreferences((current) => ({ ...current, push: false }));
          await setDoc(doc(db, "users", user.id), { preferences: { ...preferences, push: false }, updatedAt: serverTimestamp() }, { merge: true });
          return;
        }
      } else {
        await removeWebPushSubscription(user.id);
      }
      await setDoc(doc(db, "users", user.id), { preferences: { ...preferences, push: checked }, updatedAt: serverTimestamp() }, { merge: true });
      setPreferences((current) => ({ ...current, push: checked }));
      setMessage("");
    } catch (error) {
      console.error("Push preference change failed", error);
      setMessage("Could not update push notifications.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-settings-page className="min-h-screen bg-gradient-to-b from-indigo-50 via-slate-50 to-white text-slate-900">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:overflow-hidden sm:rounded-none sm:border-0 lg:max-w-full">
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          title="Settings"
          subtitle="Notifications & privacy"
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main data-settings-content className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6 md:px-6 lg:px-6 xl:px-8">
          <div data-settings-layout className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={() => { window.location.hash = "#/profile"; }}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
                >
                  <ArrowLeft size={13} /> Back to Profile
                </button>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Your space</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Settings</h1>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  Saved securely to your account — changes apply on every device.
                </p>
              </div>
              {saving ? <span className="text-[11px] font-black text-violet-600">Saving…</span> : null}
            </header>

            {message ? (
              <div role="status" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {message}
              </div>
            ) : null}

            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(49,46,129,0.6)]">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Preferences</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Notifications & privacy</h2>
              <div className="mt-4 space-y-2">
                <PreferenceRow
                  icon={<Bell />}
                  label="Push notifications"
                  checked={preferences.push}
                  onChange={(checked) => void handlePushToggle(checked)}
                />
                <PreferenceRow
                  icon={<Sparkles />}
                  label="Email updates"
                  checked={preferences.email}
                  onChange={(checked) => void savePreferences({ ...preferences, email: checked })}
                />
                <PreferenceRow
                  icon={<Bell />}
                  label="Promotions"
                  checked={preferences.promotions}
                  onChange={(checked) => void savePreferences({ ...preferences, promotions: checked })}
                />
                <PreferenceRow
                  icon={<UserRound />}
                  label="Public profile"
                  checked={preferences.profileVisible}
                  onChange={(checked) => void savePreferences({ ...preferences, profileVisible: checked })}
                />
                <PreferenceRow
                  icon={<Lock />}
                  label="Share learning activity"
                  checked={preferences.shareActivity}
                  onChange={(checked) => void savePreferences({ ...preferences, shareActivity: checked })}
                />
              </div>
            </section>
          </div>
        </main>

        <BottomNav active="profile" onChange={handleFooterChange} purchasesBadge={purchasedIds.size} />
      </div>

      {pushHelpOpen ? (
        <BaseModal title="Notifications are blocked" onClose={() => setPushHelpOpen(false)}>
          <p className="text-sm font-medium text-slate-600">
            Your browser is blocking notifications for this site, so the switch was turned back off.
            Open the site settings (the lock icon in the address bar), allow notifications, then try again.
          </p>
          <button
            type="button"
            onClick={() => setPushHelpOpen(false)}
            className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white"
          >
            Got it
          </button>
        </BaseModal>
      ) : null}
    </div>
  );
}
