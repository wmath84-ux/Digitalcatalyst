import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Boxes,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Crown,
  Heart,
  LoaderCircle,
  Lock,
  LogOut,
  Pencil,
  RefreshCcw,
  Rocket,
  Save,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { db } from "../../firebase";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { useBranding } from "../context/BrandingContext";
import { useOwnedProducts } from "../hooks/useCourseAccess";
import { APPROVED_ADMIN_EMAIL } from "../utils/adminSession";
import { ensureSavedWebPushSubscription, removeWebPushSubscription } from "../../utils/webPush";
import AiQuotaCard from "../components/AiQuotaCard";
import MyDayAllowanceCard from "../components/MyDayAllowanceCard";

type Modal = "edit" | "settings" | null;
type Preferences = {
  push: boolean;
  email: boolean;
  promotions: boolean;
  profileVisible: boolean;
  shareActivity: boolean;
};
type MembershipTier = "normal" | "basic" | "premium" | "pro";

type SubscriptionSnapshot = {
  status: string;
  expiresAt: number;
  cycle: string;
  planId: string;
  reminderOptOut: boolean;
};

type MembershipState = {
  tier: MembershipTier;
  subscription: SubscriptionSnapshot | null;
  active: boolean;
  expired: boolean;
  subscriber: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  push: true,
  email: true,
  promotions: false,
  profileVisible: true,
  shareActivity: true,
};

const TIER_LABELS: Record<MembershipTier, string> = {
  normal: "Free learner",
  basic: "Basic",
  premium: "Premium",
  pro: "Pro",
};

/**
 * The profile can be opened before the subscription listener has finished.
 * Keep the fallback conservative: the `basic` value on the user document is
 * the old default for every account, not proof that a paid Basic plan exists.
 */
const normalizeMembershipTier = (value: unknown): MembershipTier => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "subscription") return "normal";
  if (normalized.includes("pro") || normalized.includes("elite")) return "pro";
  if (normalized.includes("premium")) return "premium";
  if (normalized.includes("basic") || normalized.includes("starter")) return "basic";
  // A live, paid plan with a custom id still gets the entry-level visual
  // treatment instead of being mistaken for an unsubscribed account.
  return "basic";
};

const toMillis = (value: unknown): number => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return Number((value as { toMillis: () => number }).toMillis()) || 0;
  }
  if (value && typeof value === "object" && "_seconds" in value) {
    return Number((value as { _seconds?: unknown })._seconds || 0) * 1000;
  }
  const numeric = Number(value || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value: number): string => {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const cycleLabel = (cycle: string): string => cycle === "yearly" ? "Yearly" : "Monthly";

const isActiveSubscription = (subscription: SubscriptionSnapshot, now: number): boolean =>
  subscription.status === "active" && subscription.expiresAt > now;

const MEMBERSHIP_THEMES: Record<MembershipTier, {
  hero: string;
  heroGlow: string;
  heroBadge: string;
  membership: string;
  membershipIcon: string;
  membershipPill: string;
  primaryButton: string;
  secondaryButton: string;
  renewal: string;
  renewalIcon: string;
  progress: string;
  stat: string;
}> = {
  normal: {
    hero: "dc-glass-hero",
    heroGlow: "bg-violet-500/50",
    heroBadge: "bg-white/12 text-white ring-1 ring-white/20",
    membership: "dc-glass border-indigo-200/40",
    membershipIcon: "bg-indigo-500/15 text-indigo-600 ring-1 ring-indigo-300/40",
    membershipPill: "bg-slate-900/5 text-slate-600 ring-1 ring-white/60",
    primaryButton: "bg-gradient-to-r from-indigo-600 to-violet-600 dc-glow-btn hover:from-indigo-500 hover:to-violet-500",
    secondaryButton: "border-white/70 bg-white/45 text-indigo-700 backdrop-blur-md hover:bg-white/75",
    renewal: "dc-glass",
    renewalIcon: "bg-slate-900/5 text-slate-600 ring-1 ring-white/60",
    progress: "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-400",
    stat: "bg-white/45 ring-white/70 backdrop-blur-md",
  },
  basic: {
    // Basic is calm and fresh, so paid status is visible without looking loud.
    hero: "dc-glass-hero dc-glass-hero--basic",
    heroGlow: "bg-cyan-400/45",
    heroBadge: "bg-white/12 text-white ring-1 ring-white/20",
    membership: "dc-glass border-cyan-200/50",
    membershipIcon: "bg-cyan-500/15 text-cyan-700 ring-1 ring-cyan-300/40",
    membershipPill: "bg-cyan-500/12 text-cyan-800 ring-1 ring-cyan-200/50",
    primaryButton: "bg-gradient-to-r from-sky-500 to-cyan-500 shadow-[0_12px_28px_-10px_rgba(14,165,233,0.65)] hover:from-sky-400 hover:to-cyan-400",
    secondaryButton: "border-white/70 bg-white/45 text-sky-700 backdrop-blur-md hover:bg-white/75",
    renewal: "dc-glass border-cyan-200/40",
    renewalIcon: "bg-cyan-500/15 text-cyan-700 ring-1 ring-cyan-300/40",
    progress: "bg-gradient-to-r from-sky-400 to-cyan-500",
    stat: "bg-white/45 ring-cyan-100/80 backdrop-blur-md",
  },
  premium: {
    // Premium moves into the violet/fuchsia family.
    hero: "dc-glass-hero dc-glass-hero--premium",
    heroGlow: "bg-fuchsia-400/45",
    heroBadge: "bg-white/12 text-white ring-1 ring-white/20",
    membership: "dc-glass border-fuchsia-200/50",
    membershipIcon: "bg-fuchsia-500/15 text-fuchsia-700 ring-1 ring-fuchsia-300/40",
    membershipPill: "bg-fuchsia-500/12 text-fuchsia-800 ring-1 ring-fuchsia-200/50",
    primaryButton: "bg-gradient-to-r from-fuchsia-600 to-violet-600 shadow-[0_12px_28px_-10px_rgba(192,38,211,0.65)] hover:from-fuchsia-500 hover:to-violet-500",
    secondaryButton: "border-white/70 bg-white/45 text-fuchsia-700 backdrop-blur-md hover:bg-white/75",
    renewal: "dc-glass border-fuchsia-200/40",
    renewalIcon: "bg-fuchsia-500/15 text-fuchsia-700 ring-1 ring-fuchsia-300/40",
    progress: "bg-gradient-to-r from-fuchsia-500 to-violet-500",
    stat: "bg-white/45 ring-fuchsia-100/80 backdrop-blur-md",
  },
  pro: {
    // Pro is intentionally the strongest, most premium gradient.
    hero: "dc-glass-hero dc-glass-hero--pro",
    heroGlow: "bg-violet-400/55",
    heroBadge: "bg-white/12 text-white ring-1 ring-white/20",
    membership: "dc-glass border-violet-200/50",
    membershipIcon: "bg-violet-500/18 text-violet-700 ring-1 ring-violet-300/40",
    membershipPill: "bg-violet-500/12 text-violet-800 ring-1 ring-violet-200/50",
    primaryButton: "bg-gradient-to-r from-violet-700 via-indigo-600 to-fuchsia-600 dc-glow-btn hover:from-violet-600 hover:via-indigo-500 hover:to-fuchsia-500",
    secondaryButton: "border-white/70 bg-white/45 text-violet-800 backdrop-blur-md hover:bg-white/75",
    renewal: "dc-glass border-violet-200/40",
    renewalIcon: "bg-violet-500/15 text-violet-700 ring-1 ring-violet-300/40",
    progress: "bg-gradient-to-r from-violet-500 via-indigo-500 to-fuchsia-500",
    stat: "bg-white/45 ring-violet-100/80 backdrop-blur-md",
  },
};

export default function ProfileApp() {
  const { user, logout, updateAccount } = useAuth();
  const { appName } = useBranding();
  const { products, purchasedIds } = useCatalog();
  const { favoriteIds, cartIds } = useCommerce();
  // Part 10 — full product ownership from the canonical entitlements
  // collection. The Profile uses this as the authoritative Purchased count.
  const { ownedProductIds: canonicalOwnedIds, signedIn } = useOwnedProducts();
  const [modal, setModal] = useState<Modal>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralUsed, setReferralUsed] = useState(false);
  const [subscriptionRenewal, setSubscriptionRenewal] = useState<SubscriptionSnapshot | null>(null);
  const [profileSubscription, setProfileSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    setMembershipLoaded(false);
    const unsubscribeProfile = onSnapshot(doc(db, "users", user.id), (snapshot) => {
      const data = snapshot.data() || {};
      setPreferences({ ...DEFAULT_PREFERENCES, ...(data.preferences || {}) });
      setReferralCode(String(data.referralCode || ""));
      setReferralUsed(Math.max(0, Number(data.referralUsedCount || 0)) >= 1);

      // `subscriptionTier: basic` is created for every new user. Only use the
      // mirrored plan id (or a legacy non-basic tier) as a paid fallback.
      const mirroredPlanId = String(data.subscriptionPlanId || "").trim();
      const legacyTier = String(data.subscriptionTier || "").trim();
      const legacyPaidTier = legacyTier && normalizeMembershipTier(legacyTier) !== "normal" && legacyTier.toLowerCase() !== "basic";
      setProfileSubscription(mirroredPlanId || legacyPaidTier ? {
        status: String(data.subscriptionStatus || "active"),
        expiresAt: toMillis(data.subscriptionExpiresAt),
        cycle: String(data.subscriptionCycle || "monthly"),
        planId: mirroredPlanId || legacyTier,
        reminderOptOut: Boolean(data.renewalReminderOptOut),
      } : null);
    }, (error) => console.warn("Profile sync failed", error));

    const unsubscribeSubscription = onSnapshot(
      doc(db, "users", user.id, "subscription", "current"),
      (snapshot) => {
        const data = snapshot.data() || {};
        setSubscriptionRenewal(snapshot.exists() && String(data.planId || "").trim() ? {
          status: String(data.status || "active"),
          expiresAt: toMillis(data.expiresAt),
          cycle: String(data.cycle || "monthly"),
          planId: String(data.planId || ""),
          reminderOptOut: Boolean(data.renewalReminderOptOut),
        } : null);
        setMembershipLoaded(true);
      },
      (error) => {
        console.warn("Subscription profile sync failed", error);
        setSubscriptionRenewal(null);
        setMembershipLoaded(true);
      },
    );
    return () => {
      unsubscribeProfile();
      unsubscribeSubscription();
    };
  }, [user]);

  const purchasedProducts = useMemo(() => {
    const owned = new Set([...purchasedIds, ...canonicalOwnedIds]);
    return products.filter((product) =>
      owned.has(product.id) || Boolean(product.documentId && owned.has(product.documentId)),
    );
  }, [products, purchasedIds, canonicalOwnedIds]);

  const membership = useMemo<MembershipState>(() => {
    // The canonical subcollection wins. The user document mirror keeps old
    // paid accounts usable if they do not have the subcollection yet.
    const subscription = subscriptionRenewal || profileSubscription;
    if (!subscription || !subscription.planId) {
      return { tier: "normal", subscription: null, active: false, expired: false, subscriber: false };
    }
    const tier = normalizeMembershipTier(subscription.planId);
    // Match the access resolver and SubscriptionPage: a plan is active only
    // while its server-issued expiry is in the future.
    const active = isActiveSubscription(subscription, now);
    const expired = !active;
    return { tier, subscription, active, expired, subscriber: true };
  }, [now, profileSubscription, subscriptionRenewal]);

  const initials = user?.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "Recently";
  const ownedCount = signedIn ? Math.max(purchasedIds.size, canonicalOwnedIds.length) : purchasedIds.size;
  const theme = MEMBERSHIP_THEMES[membership.tier];
  const tierLabel = TIER_LABELS[membership.tier];

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

  // The Push notifications switch must actually register/remove this device,
  // otherwise the preference is cosmetic and system notifications never arrive.
  const handlePushToggle = async (checked: boolean) => {
    setPreferencesSaving(true);
    try {
      if (checked) {
        const enabled = await ensureSavedWebPushSubscription(user.id);
        const permission = typeof window !== "undefined" ? window.Notification.permission : "denied";
        if (!enabled || permission !== "granted") {
          setMessage("Notifications are blocked in your browser. Enable them in the browser's site settings, then try again.");
          setPreferences((current) => ({ ...current, push: false }));
          await setDoc(doc(db, "users", user.id), { preferences: { ...preferences, push: false }, updatedAt: serverTimestamp() }, { merge: true });
          return;
        }
      } else {
        await removeWebPushSubscription(user.id);
      }
      await setDoc(doc(db, "users", user.id), { preferences: { ...preferences, push: checked }, updatedAt: serverTimestamp() }, { merge: true });
      setPreferences((current) => ({ ...current, push: checked }));
    } catch (error) {
      console.error("Push preference change failed", error);
      setMessage("Could not update push notifications.");
    } finally {
      setPreferencesSaving(false);
    }
  };

  const openPlans = () => {
    window.location.hash = "#/subscription";
  };

  const openSubscriberExperience = () => {
    window.location.hash = "#/profile/subscriber-experience";
  };

  return (
    <div className="min-h-screen bg-[#eef1ff] text-slate-900 sm:py-6">
      <div data-app-frame data-profile-page className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden shadow-xl shadow-indigo-200/50 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-white/70">
        <div className="dc-profile-aurora" aria-hidden="true">
          <div className="dc-profile-orb dc-profile-orb-a" />
          <div className="dc-profile-orb dc-profile-orb-b" />
          <div className="dc-profile-orb dc-profile-orb-c" />
        </div>
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          onNavigateToSubscription={openPlans}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main ref={mainRef} className="relative z-[1] flex-1 overflow-y-auto px-4 pt-2 pb-5">
          <div className="space-y-5">
            <div className="flex items-center justify-between px-1">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Your space</p>
                <h1 className="mt-0.5 text-xl font-black tracking-tight text-slate-950">Profile & library</h1>
              </div>
              <div className="flex items-center gap-2">
                {membershipLoaded && membership.subscriber ? <span className="hidden rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-300/40 sm:inline-flex">{membership.active ? "Active" : "Expired"}</span> : null}
                {preferencesSaving && <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" />}
              </div>
            </div>

            {message && <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 p-3 text-sm font-semibold text-rose-700 shadow-[0_10px_24px_-16px_rgba(225,29,72,0.55)] backdrop-blur-md">{message}</div>}

            {/* This is the one profile hero. Paid plans keep the same layout,
                while the gradient changes by tier as requested. */}
            <section data-profile-membership-tier={membership.tier} className={`relative overflow-hidden rounded-[2rem] p-6 text-white ${theme.hero}`}>
              <div className={`pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full blur-3xl ${theme.heroGlow}`} />
              <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-cyan-400/30 blur-3xl" />
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400" />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur-md ${theme.heroBadge}`}>
                    {membership.subscriber ? <BadgeCheck className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                    {membership.subscriber ? `${tierLabel} member` : "Free learner"}
                  </span>
                  {membership.subscriber ? (
                    <span className="rounded-full bg-emerald-300/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-50 ring-1 ring-emerald-100/25 shadow-[0_0_18px_rgba(52,211,153,0.28)]">
                      {membership.active ? "Active" : "Renew access"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white/75 ring-1 ring-white/15">No plan yet</span>
                  )}
                </div>

                <div className="mt-5 flex items-center gap-4">
                  {user.photoURL ? <img src={user.photoURL} alt="" className="h-16 w-16 rounded-full object-cover dc-glow-ring" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-white/18 text-xl font-black dc-glow-ring">{initials}</div>}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-2xl font-black tracking-tight">{user.name}</h2>
                    <p className="truncate text-xs text-white/80">{user.email}</p>
                    <p className="mt-1 text-[11px] text-white/60">Member since {memberSince}</p>
                  </div>
                </div>
                <p className="relative mt-5 text-sm leading-6 text-white/85">{user.bio || (membership.subscriber ? `Your ${tierLabel} learning space is ready. Keep building momentum.` : "Add a short bio to personalize your learner profile.")}</p>
                <button type="button" onClick={() => setModal("edit")} className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/14 py-3 text-sm font-black ring-1 ring-white/30 shadow-[0_10px_24px_-12px_rgba(255,255,255,0.35)] backdrop-blur-md transition hover:bg-white/24 active:scale-[0.99]"><Pencil size={15} /> Edit profile</button>
              </div>
            </section>

            {membership.subscriber ? (
              <section data-profile-membership-card className={`rounded-[2rem] p-5 ${theme.membership}`}>
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-12 w-12 place-items-center rounded-2xl shadow-[0_10px_22px_-12px_rgba(79,70,229,0.7)] ${theme.membershipIcon}`}>
                      {membership.tier === "pro" ? <Zap className="h-6 w-6" /> : membership.tier === "premium" ? <Sparkles className="h-6 w-6" /> : <Crown className="h-6 w-6" />}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-400">Membership</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">{tierLabel} membership</h3>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${theme.membershipPill}`}>{membership.active ? "Subscribed" : "Expired"}</span>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <MembershipStat label="Plan" value={tierLabel} className={theme.stat} />
                  <MembershipStat label="Billing" value={cycleLabel(membership.subscription?.cycle || "monthly")} className={theme.stat} />
                  <MembershipStat label="Access" value={membership.active ? "Active" : "Ended"} className={theme.stat} />
                </div>

                <p className="mt-4 text-xs leading-5 text-slate-600">
                  {membership.active
                    ? `You are enjoying the ${tierLabel} experience. Manage your plan or extend access whenever you are ready.`
                    : `Your ${tierLabel} access has ended. Renew to bring your saved learning experience back instantly.`}
                </p>
                <button type="button" onClick={openPlans} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white shadow-lg transition active:scale-[0.99] ${theme.primaryButton}`}>
                  <RefreshCcw className="h-4 w-4" /> {membership.active ? "Manage subscription" : "Renew subscription"} <ArrowRight className="h-4 w-4" />
                </button>
              </section>
            ) : (
              <section data-profile-upgrade-card className="dc-glass relative overflow-hidden rounded-[2rem] p-5">
                <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-violet-400/30 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-cyan-300/25 blur-2xl" />
                <div className="relative">
                  <div className="flex items-start gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_12px_24px_-10px_rgba(79,70,229,0.8)]"><Rocket className="h-6 w-6" /></div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Basic learner access</p>
                      <h3 className="mt-1 text-xl font-black leading-tight text-slate-950">Upgrade your learning space</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    You are currently learning on the free plan. Move to a subscriber plan for a richer app experience, more focused tools, and benefits designed around your progress.
                  </p>
                  <div className="mt-4 space-y-2">
                    <UpgradePoint>Unlock subscriber-only learning features</UpgradePoint>
                    <UpgradePoint>Choose the plan that fits your learning goals</UpgradePoint>
                    <UpgradePoint>Keep your learning journey organised in one place</UpgradePoint>
                  </div>
                  <div className="mt-5 grid gap-2">
                    <button type="button" onClick={openPlans} className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white shadow-lg transition active:scale-[0.99] ${theme.primaryButton}`}>
                      Explore plans <ArrowRight className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={openSubscriberExperience} data-subscriber-experience-cta className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-black transition active:scale-[0.99] ${theme.secondaryButton}`}>
                      <Sparkles className="h-4 w-4" /> See the subscriber app experience
                    </button>
                  </div>
                </div>
              </section>
            )}

            {membership.subscriber && membership.subscription ? (
              <ProfileRenewalCard
                tier={membership.tier}
                subscription={membership.subscription}
                now={now}
                onRenew={openPlans}
                onToggleReminders={(next) => {
                  if (!user || !subscriptionRenewal) return;
                  void updateDoc(doc(db, "users", user.id, "subscription", "current"), { renewalReminderOptOut: next }).catch(() => undefined);
                }}
              />
            ) : null}

            {/* My Day daily free-creation allowance. This used to sit as a
                banner on top of the My Day dashboard; usage/allowance data
                belongs with the account cards, so it is presented here in the
                same premium card language as membership and AI allowance. */}
            <MyDayAllowanceCard
              onOpenMyDay={() => { window.location.hash = "#/my-day"; }}
              onSubscribe={openPlans}
            />

            {/* AI usage limits are a subscription benefit. The card is hidden
                for users who have not purchased a subscription yet — showing
                usage limits before any plan exists would display limits that
                do not apply to them. It appears once a subscription exists
                (active or expired — they did purchase). */}
            {membership.subscriber ? <AiQuotaCard uid={user.id} /> : null}

            {referralCode && (
              <section className="dc-glass rounded-[2rem] p-5">
                <div className="relative flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-500">Your referral code</p>
                    <p className="mt-1 text-xs text-slate-500">{`Share it with a learner joining ${appName}.`}</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-400/15 text-amber-600 ring-1 ring-amber-200/60 shadow-[0_8px_18px_-10px_rgba(245,158,11,0.7)]"><Sparkles className="h-5 w-5" /></div>
                </div>
                {referralUsed ? (
                  <div data-profile-referral-used className="relative mt-4 rounded-2xl bg-white/45 p-3 ring-1 ring-white/70 backdrop-blur-md">
                    <div className="flex items-center justify-between"><code className="min-w-0 truncate text-sm font-black text-slate-400 line-through decoration-2 decoration-rose-400">{referralCode}</code><span className="rounded-full bg-amber-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800">Used</span></div>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">This referral ID has been used and is no longer active.</p>
                  </div>
                ) : (
                  <div className="relative mt-4 flex items-center justify-between gap-2 rounded-2xl bg-violet-500/10 p-3 ring-1 ring-violet-200/50 backdrop-blur-md">
                    <code className="min-w-0 truncate text-sm font-black text-violet-900">{referralCode}</code>
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(referralCode)} className="shrink-0 rounded-xl bg-white/80 px-3 py-1.5 text-[10px] font-black text-violet-700 shadow-sm ring-1 ring-white/80">Copy</button>
                  </div>
                )}
              </section>
            )}

            <section className="dc-glass rounded-[2rem] p-5">
              <div className="relative flex items-center justify-between">
                <div><h3 className="text-xs font-black uppercase tracking-[0.16em] text-indigo-400">My library</h3><p className="mt-1 text-xs text-slate-500">Your saved learning activity at a glance</p></div>
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500/12 text-violet-600 ring-1 ring-violet-200/50"><ShoppingBag className="h-5 w-5" /></div>
              </div>
              <div className="relative mt-4 grid grid-cols-3 gap-3">
                <LibraryStat icon={<ShoppingBag />} value={ownedCount} label="Purchased" tone="text-indigo-600 bg-indigo-500/10" onClick={() => { window.location.hash = "#/store/purchases"; }} />
                <LibraryStat icon={<Heart />} value={favoriteIds.size} label="Favorites" tone="text-rose-500 bg-rose-500/10" onClick={() => { window.location.hash = "#/favorites"; }} />
                <LibraryStat icon={<Boxes />} value={cartIds.size} label="In cart" tone="text-amber-600 bg-amber-400/12" onClick={() => { window.location.hash = "#/cart"; }} />
              </div>
              {purchasedProducts.length > 0 && <div className="relative mt-5 space-y-2">{purchasedProducts.slice(0, 3).map((product) => <button type="button" key={product.id} onClick={() => { window.location.hash = `#/course/${encodeURIComponent(product.id)}`; }} className="flex w-full items-center gap-3 rounded-2xl bg-white/45 p-3 text-left ring-1 ring-white/70 backdrop-blur-md transition hover:bg-white/70"><img src={product.image} alt="" className="h-12 w-16 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{product.title}</span><span className="text-xs text-slate-400">Owned · Open course</span></span><ChevronRight size={16} className="text-slate-300" /></button>)}</div>}
            </section>

            <section className="dc-glass rounded-[2rem] p-5"><div className="relative flex items-center justify-between"><div><h3 className="text-xs font-black uppercase tracking-[0.16em] text-indigo-400">Preferences</h3><p className="mt-1 text-xs text-slate-500">Saved securely to your account</p></div><button type="button" onClick={() => setModal("settings")} className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/12 text-violet-600 ring-1 ring-violet-200/50 shadow-[0_8px_18px_-10px_rgba(109,40,217,0.7)]"><Bell size={18} /></button></div></section>

            <button type="button" onClick={() => void logout().then(() => { window.location.hash = "#/auth?mode=login"; })} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500/10 py-4 text-sm font-black text-rose-600 ring-1 ring-rose-200/70 shadow-[0_12px_24px_-16px_rgba(225,29,72,0.55)] backdrop-blur-md"><LogOut size={17} /> Log out</button>

            <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-[11px] font-semibold text-slate-400">
              <a href="/privacy-policy.html" className="transition hover:text-violet-600 hover:underline">Privacy Policy</a>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <a href="/terms-of-service.html" className="transition hover:text-violet-600 hover:underline">Terms of Service</a>
            </nav>

            {user.role === "admin" && String(user.email || "").trim().toLowerCase() === APPROVED_ADMIN_EMAIL ? (
              <button
                type="button"
                data-profile-open-dashboard
                onClick={() => { window.location.hash = "#/admin-login"; }}
                className="mx-auto mt-7 block text-[9px] font-medium tracking-wide text-slate-400 transition hover:text-slate-500"
              >Open dashboard</button>
            ) : null}
          </div>
        </main>

        <BottomNav active="profile" onChange={handleFooterChange} purchasesBadge={ownedCount} />

        {modal === "edit" && <EditModal user={user} onClose={() => setModal(null)} onSave={async (details) => { const result = await updateAccount(details); setMessage(result.message); if (result.success) setModal(null); return result.success; }} />}
        {modal === "settings" && <BaseModal title="Preferences" onClose={() => setModal(null)}><div className="space-y-2"><PreferenceRow icon={<Bell />} label="Push notifications" checked={preferences.push} onChange={(checked) => void handlePushToggle(checked)} /><PreferenceRow icon={<Sparkles />} label="Email updates" checked={preferences.email} onChange={(checked) => void savePreferences({ ...preferences, email: checked })} /><PreferenceRow icon={<Bell />} label="Promotions" checked={preferences.promotions} onChange={(checked) => void savePreferences({ ...preferences, promotions: checked })} /><PreferenceRow icon={<UserRound />} label="Public profile" checked={preferences.profileVisible} onChange={(checked) => void savePreferences({ ...preferences, profileVisible: checked })} /><PreferenceRow icon={<Lock />} label="Share learning activity" checked={preferences.shareActivity} onChange={(checked) => void savePreferences({ ...preferences, shareActivity: checked })} /></div></BaseModal>}
      </div>
    </div>
  );
}

function ProfileRenewalCard({ tier, subscription, now, onRenew, onToggleReminders }: { tier: MembershipTier; subscription: SubscriptionSnapshot; now: number; onRenew: () => void; onToggleReminders: (next: boolean) => void }) {
  const theme = MEMBERSHIP_THEMES[tier];
  const expired = !isActiveSubscription(subscription, now);
  const daysRemaining = subscription.expiresAt > now ? Math.max(1, Math.ceil((subscription.expiresAt - now) / 86400000)) : 0;
  const totalDays = subscription.cycle === "yearly" ? 365 : 30;
  const progress = subscription.expiresAt > 0 ? Math.max(0, Math.min(100, Math.round((daysRemaining / totalDays) * 100))) : 100;
  const renewalShell = expired ? "dc-glass border-rose-200/70" : theme.renewal;
  const renewalIcon = expired ? "bg-rose-500/12 text-rose-700 ring-1 ring-rose-200/60" : theme.renewalIcon;
  const renewalButton = expired ? "bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 shadow-[0_12px_28px_-10px_rgba(225,29,72,0.6)]" : theme.primaryButton;
  const accessLabel = subscription.expiresAt ? formatDate(subscription.expiresAt) : "Active access";

  return (
    <section data-renewal-card data-stage={expired ? "expired" : "active"} className={`relative overflow-hidden rounded-[2rem] p-5 ${renewalShell}`}>
      <div className={`pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full blur-2xl ${expired ? "bg-rose-400/30" : "bg-violet-400/25"}`} />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${renewalIcon}`}><CalendarDays className="h-6 w-6" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-400">Membership renewal</p>
              <h3 data-renewal-card-headline className="mt-1 text-lg font-black leading-tight text-slate-950">{expired ? "Your access needs a refresh" : "Your access is active"}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{TIER_LABELS[tier]} · {cycleLabel(subscription.cycle)}</p>
            </div>
          </div>
          <span data-renewal-remaining className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${expired ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{expired ? "Renew now" : daysRemaining > 0 ? `${daysRemaining}d left` : "Active"}</span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className={`rounded-2xl p-3 ring-1 ${theme.stat}`}><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Access until</p><p data-renewal-expiry className="mt-1 text-sm font-black text-slate-950">{accessLabel}</p></div>
          <div className={`rounded-2xl p-3 ring-1 ${theme.stat}`}><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Renewal mode</p><p className="mt-1 text-sm font-black text-slate-950">Manual & secure</p></div>
        </div>

        {!expired ? <div className="mt-4"><div className="flex items-center justify-between text-[10px] font-bold text-slate-400"><span>Current access window</span><span>{progress}% remaining</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/50 ring-1 ring-white/70"><div data-renewal-progress className={`h-full rounded-full transition-all ${theme.progress}`} style={{ width: `${progress}%` }} /></div></div> : <p className="mt-4 rounded-2xl bg-rose-50/80 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-800 ring-1 ring-rose-100/80 backdrop-blur-md">Your saved learning data is safe. Renew to restore your plan access.</p>}

        <p className="mt-4 text-xs leading-5 text-slate-600">{expired ? "Choose Renew access to return to your plan. Renewal is manual and secure." : "Renewal is manual and secure. We will never charge you automatically; every renewal needs your confirmation."}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onRenew} data-renewal-card-cta className={`flex-1 rounded-2xl py-3 text-sm font-black text-white shadow-lg transition active:scale-[0.98] ${renewalButton}`}>{expired ? "Renew access" : "Renew / extend access"}</button>
          <button type="button" onClick={() => onToggleReminders(!subscription.reminderOptOut)} data-renewal-reminder-toggle className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-white/55 px-3 py-3 text-[11px] font-black text-slate-600 ring-1 ring-white/70 backdrop-blur-md transition hover:bg-white/80 active:scale-[0.98]">{subscription.reminderOptOut ? "Reminders off" : "Reminders on"}</button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-400"><ShieldCheck className="h-3.5 w-3.5 shrink-0" /> No automatic charge without your confirmation.</p>
      </div>
    </section>
  );
}

function MembershipStat({ label, value, className }: { label: string; value: string; className: string }) {
  return <div className={`rounded-2xl p-3 text-center ring-1 ${className}`}><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-black text-slate-900">{value}</p></div>;
}

function UpgradePoint({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 text-xs font-bold text-slate-700"><CircleCheck className="h-4 w-4 shrink-0 text-indigo-600" />{children}</div>;
}

function LibraryStat({ icon, value, label, onClick, tone = "text-violet-600 bg-violet-500/10" }: { icon: ReactNode; value: number; label: string; onClick: () => void; tone?: string }) {
  return <button type="button" onClick={onClick} className="rounded-2xl bg-white/45 p-3 text-center ring-1 ring-white/70 backdrop-blur-md transition hover:bg-white/75 active:scale-[0.98]"><span className={`mx-auto grid h-9 w-9 place-items-center rounded-xl ${tone}`}>{icon}</span><span className="mt-2 block text-xl font-black text-slate-950">{value}</span><span className="block text-[10px] font-bold text-slate-400">{label}</span></button>;
}

function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-md sm:items-center sm:p-6"><div className="dc-modal-glass max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black text-slate-950">{title}</h2><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/60 ring-1 ring-white/80"><X size={17} /></button></div>{children}</div></div>;
}

function PreferenceRow({ icon, label, checked, onChange }: { icon: ReactNode; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-white/50 p-4 ring-1 ring-white/70 backdrop-blur-md"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/12 text-violet-600">{icon}</span><span className="flex-1 text-sm font-bold text-slate-900">{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full ${checked ? "bg-violet-600 shadow-[0_0_16px_rgba(124,58,237,0.45)]" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} /></button></div>;
}

function EditModal({ user, onClose, onSave }: { user: NonNullable<ReturnType<typeof useAuth>["user"]>; onClose: () => void; onSave: (details: { name: string; mobile: string; bio: string }) => Promise<boolean> }) {
  const [name, setName] = useState(user.name);
  const [mobile, setMobile] = useState(user.mobile || "");
  const [bio, setBio] = useState(user.bio || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) { setError("Enter your full name."); return; }
    if (mobile && mobile.replace(/\D/g, "").length !== 10) { setError("Enter a valid 10 digit mobile number."); return; }
    setSaving(true);
    setError("");
    const ok = await onSave({ name, mobile, bio });
    if (!ok) setError("Profile could not be updated.");
    setSaving(false);
  };
  return <BaseModal title="Edit profile" onClose={onClose}><form onSubmit={submit} className="space-y-4"><Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Email address"><input value={user.email} disabled /></Field><Field label="Mobile number"><input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10 digit number" /></Field><Field label="Bio"><textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 240))} rows={3} placeholder="Tell learners about yourself" /></Field>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}<button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 text-sm font-black text-white disabled:opacity-60">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />} {saving ? "Saving…" : "Save changes"}</button></form></BaseModal>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span><div className="[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-slate-50 [&_input]:px-4 [&_input]:py-3 [&_input]:text-sm [&_input]:outline-none [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:bg-slate-50 [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-sm [&_textarea]:outline-none">{children}</div></label>;
}
