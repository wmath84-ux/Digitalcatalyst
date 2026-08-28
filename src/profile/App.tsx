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

// Keep the plan name in the profile hero tied to the resolved subscription
// tier. This avoids a stale "Basic member" badge after a Premium/Pro upgrade.
const PLAN_LABELS: Record<MembershipTier, string> = {
  normal: "Free plan",
  basic: "Basic Plan",
  premium: "Premium Plan",
  pro: "Pro Plan",
};

const TIER_ICONS: Record<MembershipTier, ReactNode> = {
  normal: <Crown className="h-5 w-5" />,
  basic: <Crown className="h-5 w-5" />,
  premium: <Sparkles className="h-5 w-5" />,
  pro: <Zap className="h-5 w-5" />,
};

/* ── Clean design tokens ──────────────────────────────────────────────
   The redesigned profile borrows the Store page's visual language:
   solid white cards on a soft indigo wash, and the brand CTA gradient
   (indigo → violet → fuchsia) used for actions only. No glassmorphism,
   no aurora orbs, no animated gradients — flat, calm and readable. */
const CARD = "rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_14px_40px_-24px_rgba(49,46,129,0.35)] lg:rounded-2xl lg:p-3.5 lg:shadow-sm lg:border-slate-200/70 xl:p-4";
const CARD_COMPACT = "rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm lg:p-3.5";
const BTN_PRIMARY =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 active:scale-[0.99] lg:py-2.5 lg:text-[13px] lg:rounded-xl";
const BTN_SECONDARY =
  "flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]";
const EYEBROW = "text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600";
const ICON_CHIP = "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 lg:h-9 lg:w-9 lg:rounded-xl";
const STAT_CHIP = "rounded-2xl bg-slate-50 px-2.5 py-2.5 text-center ring-1 ring-slate-100";
const INPUT = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

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

export default function ProfileApp() {
  const { user, logout, updateAccount } = useAuth();
  const { appName } = useBranding();
  const { products, purchasedIds } = useCatalog();
  const { favoriteIds, cartIds } = useCommerce();
  // Full product ownership from the canonical entitlements collection.
  // The Profile uses this as the authoritative Purchased count.
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
  const tierLabel = TIER_LABELS[membership.tier];
  const planLabel = PLAN_LABELS[membership.tier];

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

  const membershipBadge = membershipLoaded && membership.subscriber ? (
    <span
      data-profile-membership-status={membership.active ? "active" : "expired"}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
        membership.active ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-600 ring-1 ring-rose-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${membership.active ? "bg-emerald-500" : "bg-rose-500"}`} />
      {membership.active ? "Active" : "Expired"}
    </span>
  ) : null;

  return (
    <div
      data-profile-page
      className="min-h-screen bg-gradient-to-b from-indigo-50 via-slate-50 to-white text-slate-900 sm:py-0 lg:py-0"
    >
      <div
        data-app-frame
        className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:overflow-hidden sm:rounded-none sm:border-0 lg:max-w-full lg:rounded-none lg:border-0"
      >
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          onNavigateToSubscription={openPlans}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main ref={mainRef} data-profile-content className="relative z-[1] flex-1 overflow-y-auto px-4 pt-3 pb-6 md:px-6 lg:px-6 xl:px-8">
          <div data-profile-layout className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-start lg:max-w-[1200px] lg:mx-auto">
            {/* ── Page header ── Compact identity zone for desktop */}
            <header className="flex items-end justify-between gap-3 px-1 pb-1 lg:col-span-12 lg:px-1 lg:pb-2">
              <div>
                <p className={EYEBROW}>Your space</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 lg:text-[1.6rem]">Profile</h1>
                <p className="mt-0.5 text-xs font-medium text-slate-500 lg:text-[0.8rem]">Account, plan and library — in one place.</p>
              </div>
              <div className="flex flex-col items-end gap-2 pb-0.5">
                {membershipBadge}
                {preferencesSaving ? <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" /> : null}
              </div>
            </header>

            {message && (
              <div
                role="status"
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 lg:col-span-12"
              >
                {message}
              </div>
            )}

            {/* ── LEFT COLUMN: Identity + Quick Stats + Referral ── */}
            <div className="space-y-4 lg:col-span-4 lg:space-y-3" data-profile-col="left">

            {/* ── Identity card ──────────────────────────────────────────
                Clean white card: avatar, name, email, member-since and the
                edit action. The only gradient here is the thin avatar ring
                that borrows the store brand colours. */}
            <section className={CARD}>
              <div className="flex items-center gap-4">
                <div className="shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-[2px] shadow-md shadow-indigo-500/20 lg:rounded-xl">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="h-16 w-16 rounded-[14px] object-cover lg:h-12 lg:w-12 lg:rounded-[10px]" />
                  ) : (
                    <div className="grid h-16 w-16 place-items-center rounded-[14px] bg-indigo-50 text-xl font-black text-indigo-700 lg:h-12 lg:w-12 lg:rounded-[10px] lg:text-base">
                      {initials}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-black tracking-tight text-slate-950 lg:text-[1.1rem]">{user.name}</h2>
                  <p className="truncate text-sm font-medium text-slate-500 lg:text-xs">{user.email}</p>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    <CalendarDays className="h-3.5 w-3.5" /> Member since {memberSince}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModal("edit")}
                  aria-label="Edit profile"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95"
                >
                  <Pencil size={17} />
                </button>
              </div>

              {user.bio ? (
                <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 ring-1 ring-slate-100">
                  {user.bio}
                </p>
              ) : null}

              <button type="button" onClick={() => setModal("edit")} className={`${BTN_PRIMARY} mt-4`}>
                <Pencil size={15} /> Edit profile
              </button>
            </section>

            {/* ── Quick stats ────────────────────────────────────────────
                At-a-glance counts. Tappable tiles that jump straight to the
                purchases / favorites / cart screens. */}
            <div className="grid grid-cols-3 gap-2.5">
              <QuickStat
                icon={<ShoppingBag className="h-5 w-5" />}
                value={ownedCount}
                label="Purchased"
                tone="bg-indigo-50 text-indigo-600 ring-indigo-100"
                onClick={() => { window.location.hash = "#/store/purchases"; }}
              />
              <QuickStat
                icon={<Heart className="h-5 w-5" />}
                value={favoriteIds.size}
                label="Favorites"
                tone="bg-rose-50 text-rose-500 ring-rose-100"
                onClick={() => { window.location.hash = "#/favorites"; }}
              />
              <QuickStat
                icon={<Boxes className="h-5 w-5" />}
                value={cartIds.size}
                label="In cart"
                tone="bg-amber-50 text-amber-600 ring-amber-100"
                onClick={() => { window.location.hash = "#/cart"; }}
              />
            </div>
            {referralCode ? (
              <section className={`${CARD} p-4 lg:p-3.5`} data-profile-referral>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600">Your referral code</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 lg:text-[11px]">{`Share it with a learner joining ${appName}.`}</p>
                  </div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 lg:h-8 lg:w-8">
                    <Sparkles className="h-5 w-5 lg:h-4 lg:w-4" />
                  </span>
                </div>
                {referralUsed ? (
                  <div data-profile-referral-used className="mt-3">
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                      <code className="min-w-0 truncate text-sm font-black text-slate-400 line-through decoration-2 decoration-rose-400 lg:text-xs">{referralCode}</code>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-800">Used</span>
                    </div>
                    <p className="mt-1.5 text-[11px] font-medium text-slate-400">This referral ID has been used and is no longer active.</p>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
                    <code className="min-w-0 truncate text-sm font-black text-indigo-900 lg:text-xs">{referralCode}</code>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(referralCode)}
                      className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[10px] font-black text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </section>
            ) : null}
            </div>

            {/* ── MIDDLE COLUMN: Membership + Allowances ── */}
            <div className="space-y-4 lg:col-span-5 lg:space-y-3" data-profile-col="middle">
            {/* ── Subscription / upgrade section ─────────────────────── */}
            {membership.subscriber ? (
              <section
                data-profile-membership-tier={membership.tier}
                data-profile-membership-card
                className={CARD}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/30">
                      {TIER_ICONS[membership.tier]}
                    </span>
                    <div>
                      <p className={EYEBROW}>Membership</p>
                      <h3 className="mt-0.5 text-lg font-black text-slate-950">{tierLabel} membership</h3>
                      <span
                        data-profile-plan-label
                        className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-700 ring-1 ring-indigo-100"
                      >
                        {membership.subscriber ? <BadgeCheck className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                        {membership.subscriber ? planLabel : PLAN_LABELS.normal}
                      </span>
                    </div>
                  </div>
                  <span
                    data-profile-plan-status={membership.active ? "active" : "expired"}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                      membership.active ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-600 ring-1 ring-rose-200"
                    }`}
                  >
                    {membership.active ? "Subscribed" : "Expired"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <StatChip label="Plan" value={tierLabel} />
                  <StatChip label="Billing" value={cycleLabel(membership.subscription?.cycle || "monthly")} />
                  <StatChip label="Access" value={membership.active ? "Active" : "Ended"} />
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {membership.active
                    ? `You are enjoying the ${tierLabel} experience. Manage your plan or extend access whenever you are ready.`
                    : `Your ${tierLabel} access has ended. Renew to bring your saved learning experience back instantly.`}
                </p>
                <button type="button" onClick={openPlans} className={BTN_PRIMARY}>
                  <RefreshCcw className="h-4 w-4" /> {membership.active ? "Manage subscription" : "Renew subscription"} <ArrowRight className="h-4 w-4" />
                </button>
              </section>
            ) : (
              <section data-profile-upgrade-card className={CARD}>
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/30">
                    <Rocket className="h-5 w-5" />
                  </span>
                  <div>
                    <p className={EYEBROW}>Basic learner access</p>
                    <h3 className="mt-0.5 text-lg font-black leading-tight text-slate-950">Upgrade your learning space</h3>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  You are currently learning on the free plan. Move to a subscriber plan for a richer app experience, more focused tools, and benefits designed around your progress.
                </p>
                <div className="mt-4 space-y-2.5">
                  <UpgradePoint>Unlock subscriber-only learning features</UpgradePoint>
                  <UpgradePoint>Choose the plan that fits your learning goals</UpgradePoint>
                  <UpgradePoint>Keep your learning journey organised in one place</UpgradePoint>
                </div>
                <div className="mt-5 grid gap-2.5">
                  <button type="button" onClick={openPlans} className={BTN_PRIMARY}>
                    Explore plans <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={openSubscriberExperience}
                    data-subscriber-experience-cta
                    className={BTN_SECONDARY}
                  >
                    <Sparkles className="h-4 w-4" /> See the subscriber app experience
                  </button>
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

            {/* My Day daily free-creation allowance. Usage/allowance data
                belongs with the account cards, so it is presented here in the
                same card language as membership and AI allowance. */}
            <MyDayAllowanceCard
              onOpenMyDay={() => { window.location.hash = "#/my-day"; }}
              onSubscribe={openPlans}
            />

            {/* AI usage limits are a subscription benefit. The card is hidden
                for users who have not purchased a subscription yet — showing
                usage limits before any plan exists would display limits that
                do not apply to them. */}
            {membership.subscriber ? <AiQuotaCard uid={user.id} /> : null}
            </div>

            {/* ── RIGHT COLUMN: Library + Preferences + Actions ── */}
            <div className="space-y-4 lg:col-span-3 lg:space-y-3" data-profile-col="right">
            {/* ── Library container ───────────────────────────────────── */}
            <section className={CARD}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={EYEBROW}>My library</p>
                  <h3 className="mt-1 text-base font-black text-slate-950">Your saved learning activity</h3>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">At-a-glance counts of what you own and what you saved.</p>
                </div>
                <span className={ICON_CHIP}>
                  <ShoppingBag className="h-5 w-5" />
                </span>
              </div>
              <div className="my-4 h-px bg-slate-100" />
              <div className="grid grid-cols-3 gap-3">
                <LibraryStat icon={<ShoppingBag />} value={ownedCount} label="Purchased" tone="text-indigo-600" onClick={() => { window.location.hash = "#/store/purchases"; }} />
                <LibraryStat icon={<Heart />} value={favoriteIds.size} label="Favorites" tone="text-rose-500" onClick={() => { window.location.hash = "#/favorites"; }} />
                <LibraryStat icon={<Boxes />} value={cartIds.size} label="In cart" tone="text-amber-600" onClick={() => { window.location.hash = "#/cart"; }} />
              </div>
              {purchasedProducts.length > 0 ? (
                <div className="mt-5 space-y-2">
                  {purchasedProducts.slice(0, 3).map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => { window.location.hash = `#/course/${encodeURIComponent(product.id)}`; }}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-2 text-left transition hover:bg-slate-50 active:scale-[0.99]"
                    >
                      <img src={product.image} alt="" className="h-12 w-16 shrink-0 rounded-xl object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-900">{product.title}</span>
                        <span className="text-xs font-medium text-slate-400">Owned · Open course</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-slate-300" />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            {/* ── Preferences shortcut ────────────────────────────────── */}
            <section className={CARD}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={EYEBROW}>Preferences</p>
                  <h3 className="mt-1 text-base font-black text-slate-950">Notifications & privacy</h3>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Saved securely to your account.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModal("settings")}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 transition hover:bg-indigo-100 active:scale-95"
                  aria-label="Open preferences"
                >
                  <Bell size={18} />
                </button>
              </div>
            </section>

            <button
              type="button"
              onClick={() => void logout().then(() => { window.location.hash = "#/auth?mode=login"; })}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-4 text-sm font-black text-rose-600 transition hover:bg-rose-100 active:scale-[0.99]"
            >
              <LogOut size={17} /> Log out
            </button>

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
                className="mx-auto mt-4 block text-[9px] font-medium tracking-wide text-slate-400 transition hover:text-slate-500 lg:mt-2"
              >Open dashboard</button>
            ) : null}
            </div>
          </div>
        </main>

        <BottomNav active="profile" onChange={handleFooterChange} purchasesBadge={ownedCount} />

        {modal === "edit" && (
          <EditModal
            user={user}
            onClose={() => setModal(null)}
            onSave={async (details) => {
              const result = await updateAccount(details);
              setMessage(result.message);
              if (result.success) setModal(null);
              return result.success;
            }}
          />
        )}
        {modal === "settings" && (
          <BaseModal title="Preferences" onClose={() => setModal(null)}>
            <div className="space-y-2">
              <PreferenceRow icon={<Bell />} label="Push notifications" checked={preferences.push} onChange={(checked) => void handlePushToggle(checked)} />
              <PreferenceRow icon={<Sparkles />} label="Email updates" checked={preferences.email} onChange={(checked) => void savePreferences({ ...preferences, email: checked })} />
              <PreferenceRow icon={<Bell />} label="Promotions" checked={preferences.promotions} onChange={(checked) => void savePreferences({ ...preferences, promotions: checked })} />
              <PreferenceRow icon={<UserRound />} label="Public profile" checked={preferences.profileVisible} onChange={(checked) => void savePreferences({ ...preferences, profileVisible: checked })} />
              <PreferenceRow icon={<Lock />} label="Share learning activity" checked={preferences.shareActivity} onChange={(checked) => void savePreferences({ ...preferences, shareActivity: checked })} />
            </div>
          </BaseModal>
        )}
      </div>
    </div>
  );
}

function ProfileRenewalCard({ tier, subscription, now, onRenew, onToggleReminders }: { tier: MembershipTier; subscription: SubscriptionSnapshot; now: number; onRenew: () => void; onToggleReminders: (next: boolean) => void }) {
  const expired = !isActiveSubscription(subscription, now);
  const daysRemaining = subscription.expiresAt > now ? Math.max(1, Math.ceil((subscription.expiresAt - now) / 86400000)) : 0;
  const totalDays = subscription.cycle === "yearly" ? 365 : 30;
  const progress = subscription.expiresAt > 0 ? Math.max(0, Math.min(100, Math.round((daysRemaining / totalDays) * 100))) : 100;

  return (
    <section
      data-renewal-card
      data-stage={expired ? "expired" : "active"}
      className={CARD}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${expired ? "bg-rose-50 text-rose-600 ring-rose-100" : "bg-indigo-50 text-indigo-600 ring-indigo-100"}`}>
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${expired ? "text-rose-600" : "text-indigo-600"}`}>Membership renewal</p>
            <h3 data-renewal-card-headline className="mt-0.5 text-lg font-black leading-tight text-slate-950">{expired ? "Your access needs a refresh" : "Your access is active"}</h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{TIER_LABELS[tier]} · {cycleLabel(subscription.cycle)}</p>
          </div>
        </div>
        <span
          data-renewal-remaining
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${expired ? "bg-rose-50 text-rose-600 ring-rose-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}
        >
          {expired ? "Renew now" : daysRemaining > 0 ? `${daysRemaining}d left` : "Active"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <StatChip label="Access until" value={subscription.expiresAt ? formatDate(subscription.expiresAt) : "Active access"} valueAttr="data-renewal-expiry" />
        <StatChip label="Renewal mode" value="Manual & secure" />
      </div>

      {!expired ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>Current access window</span>
            <span>{progress}% remaining</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              data-renewal-progress
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700 ring-1 ring-rose-100">
          Your saved learning data is safe. Renew to restore your plan access.
        </p>
      )}

      <p className="mt-4 text-xs leading-5 text-slate-600">
        {expired
          ? "Choose Renew access to return to your plan. Renewal is manual and secure."
          : "Renewal is manual and secure. We will never charge you automatically; every renewal needs your confirmation."}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onRenew}
          data-renewal-card-cta
          className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-lg transition active:scale-[0.98] ${
            expired
              ? "bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-500/30"
              : "bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 shadow-indigo-500/30"
          }`}
        >
          {expired ? "Renew access" : "Renew / extend access"}
        </button>
        <button
          type="button"
          onClick={() => onToggleReminders(!subscription.reminderOptOut)}
          data-renewal-reminder-toggle
          className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[11px] font-black text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
        >
          {subscription.reminderOptOut ? "Reminders off" : "Reminders on"}
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> No automatic charge without your confirmation.
      </p>
    </section>
  );
}

function StatChip({ label, value, valueAttr }: { label: string; value: string; valueAttr?: string }) {
  return (
    <div className={STAT_CHIP}>
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p {...(valueAttr ? { [valueAttr]: true } : {})} className="mt-1 truncate text-xs font-black text-slate-900">{value}</p>
    </div>
  );
}

function QuickStat({ icon, value, label, tone, onClick }: { icon: ReactNode; value: number; label: string; tone: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-[0_8px_24px_-18px_rgba(49,46,129,0.5)] transition hover:border-indigo-100 active:scale-[0.97] lg:rounded-xl lg:p-2.5 lg:shadow-sm"
    >
      <span className={`mx-auto grid h-10 w-10 place-items-center rounded-xl ring-1 lg:h-8 lg:w-8 lg:rounded-lg ${tone}`}>{icon}</span>
      <span className="mt-2 block text-2xl font-black text-slate-950 lg:mt-1.5 lg:text-xl">{value}</span>
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:text-[9px]">{label}</span>
    </button>
  );
}

function UpgradePoint({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 text-xs font-bold text-slate-700"><CircleCheck className="h-4 w-4 shrink-0 text-indigo-600" />{children}</div>;
}

function LibraryStat({ icon, value, label, onClick, tone = "text-violet-600" }: { icon: ReactNode; value: number; label: string; onClick: () => void; tone?: string }) {
  return (
    <button type="button" onClick={onClick} className="block w-full rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-[0_8px_24px_-18px_rgba(49,46,129,0.5)] transition hover:border-indigo-100 active:scale-[0.97] lg:rounded-xl lg:p-2.5 lg:shadow-sm">
      <span className={`mx-auto grid h-8 w-8 place-items-center rounded-lg lg:h-7 lg:w-7 ${tone} bg-indigo-50 ring-1 ring-indigo-100`}>{icon}</span>
      <span className="mt-1.5 block text-lg font-black text-slate-950 lg:text-base">{value}</span>
      <span className="block text-[10px] font-bold text-slate-500 lg:text-[9px]">{label}</span>
    </button>
  );
}

function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-6">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200">
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PreferenceRow({ icon, label, checked, onChange }: { icon: ReactNode; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">{icon}</span>
      <span className="flex-1 text-sm font-bold text-slate-900">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-on={checked ? "true" : "false"}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-gradient-to-r from-indigo-600 to-violet-600" : "bg-slate-200"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
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
  return (
    <BaseModal title="Edit profile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email address">
          <input className={INPUT} value={user.email} disabled />
        </Field>
        <Field label="Mobile number">
          <input className={INPUT} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10 digit number" />
        </Field>
        <Field label="Bio">
          <textarea className={INPUT} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 240))} rows={3} placeholder="Tell learners about yourself" />
        </Field>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
        <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-500/30 disabled:opacity-60">
          {saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />} {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </BaseModal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
