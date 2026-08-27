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
  Eye,
  EyeOff,
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
type GlassMode = "clear" | "tinted" | "solid";
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

const GLASS_MODES: { id: GlassMode; label: string; hint: string }[] = [
  { id: "clear", label: "Clear", hint: "More transparency" },
  { id: "tinted", label: "Tinted", hint: "Subtle frost" },
  { id: "solid", label: "Solid", hint: "No transparency" },
];

/**
 * Membership tier palette.
 *
 * Following the transparency rules, only the *accent* of each tier varies;
 * the structural surface of every card uses the page-level `dc-glass-*`
 * tokens so the user can swap glass modes without the page falling apart.
 * Hero identity, status pill, icon container and progress bar carry the
 * tier color; everything else is shared.
 */
const MEMBERSHIP_THEMES: Record<MembershipTier, {
  heroBg: string;
  heroRing: string;
  heroGlow: string;
  iconBg: string;
  iconRing: string;
  pillBg: string;
  pillText: string;
  accentText: string;
  progress: string;
}> = {
  normal: {
    // Free / no plan — the neutral indigo accent that matches the rest of
    // the product brand. The page-level card style still applies.
    heroBg: "linear-gradient(160deg, #4f46e5 0%, #7c3aed 55%, #a21caf 100%)",
    heroRing: "rgba(167, 139, 250, 0.45)",
    heroGlow: "rgba(139, 92, 246, 0.45)",
    iconBg: "rgba(99, 102, 241, 0.12)",
    iconRing: "rgba(99, 102, 241, 0.3)",
    pillBg: "rgba(99, 102, 241, 0.1)",
    pillText: "#4338ca",
    accentText: "#4338ca",
    progress: "linear-gradient(90deg, #6366f1, #a78bfa)",
  },
  basic: {
    // Calm and fresh — sky / cyan family.
    heroBg: "linear-gradient(160deg, #0c4a6e 0%, #0e7490 55%, #0891b2 100%)",
    heroRing: "rgba(56, 189, 248, 0.4)",
    heroGlow: "rgba(56, 189, 248, 0.42)",
    iconBg: "rgba(14, 165, 233, 0.12)",
    iconRing: "rgba(14, 165, 233, 0.3)",
    pillBg: "rgba(14, 165, 233, 0.12)",
    pillText: "#0369a1",
    accentText: "#0369a1",
    progress: "linear-gradient(90deg, #38bdf8, #22d3ee)",
  },
  premium: {
    // Violet / fuchsia family.
    heroBg: "linear-gradient(160deg, #6b21a8 0%, #a21caf 55%, #c026d3 100%)",
    heroRing: "rgba(232, 121, 249, 0.4)",
    heroGlow: "rgba(232, 121, 249, 0.42)",
    iconBg: "rgba(192, 38, 211, 0.12)",
    iconRing: "rgba(192, 38, 211, 0.3)",
    pillBg: "rgba(192, 38, 211, 0.12)",
    pillText: "#86198f",
    accentText: "#86198f",
    progress: "linear-gradient(90deg, #d946ef, #a78bfa)",
  },
  pro: {
    // Pro — deepest, richest gradient.
    heroBg: "linear-gradient(160deg, #1e1b4b 0%, #4c1d95 45%, #831843 100%)",
    heroRing: "rgba(196, 181, 253, 0.45)",
    heroGlow: "rgba(139, 92, 246, 0.5)",
    iconBg: "rgba(124, 58, 237, 0.16)",
    iconRing: "rgba(167, 139, 250, 0.32)",
    pillBg: "rgba(124, 58, 237, 0.14)",
    pillText: "#5b21b6",
    accentText: "#5b21b6",
    progress: "linear-gradient(90deg, #8b5cf6, #d946ef)",
  },
};

const GLASS_MODE_STORAGE_KEY = "dc-profile-glass-mode";

const readStoredGlassMode = (): GlassMode => {
  if (typeof window === "undefined") return "clear";
  const raw = window.localStorage.getItem(GLASS_MODE_STORAGE_KEY);
  if (raw === "tinted" || raw === "solid" || raw === "clear") return raw;
  return "clear";
};

const systemPrefersReducedTransparency = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches
    || window.matchMedia?.("(prefers-contrast: more)").matches;
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
  // Glass mode is a *transparency variable*, not a static identity. The user
  // can switch between Clear / Tinted / Solid from the page header, and the
  // page automatically retreats to Solid when the OS reports it prefers
  // reduced transparency / high contrast.
  const [glassMode, setGlassMode] = useState<GlassMode>(() => {
    const stored = readStoredGlassMode();
    return systemPrefersReducedTransparency() ? "solid" : stored;
  });
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(GLASS_MODE_STORAGE_KEY, glassMode);
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [glassMode]);

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

  return (
    <div
      data-profile-page
      data-glass-mode={glassMode}
      className="min-h-screen text-slate-900 sm:py-6"
    >
      <div
        data-app-frame
        className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-[#eef1ff] shadow-xl shadow-indigo-200/50 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-white/70 md:max-w-none md:rounded-none md:border-0 md:shadow-none md:bg-transparent"
      >
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

        <main ref={mainRef} data-profile-content className="relative z-[1] flex-1 overflow-y-auto px-4 pt-2 pb-5 md:px-8">
          <div className="space-y-5">
            {/* ── Page header ───────────────────────────────────────────
                Eyebrow + title is a structural anchor (high opacity, no
                glass) so the page always has a clear hierarchy above the
                moving background. */}
            <header className="dc-profile-section-header">
              <div>
                <p className="dc-eyebrow">Your space</p>
                <h1 className="mt-1 text-[1.55rem] font-black tracking-tight text-slate-950">Profile & library</h1>
                <p className="mt-0.5 text-xs text-slate-500">Your account, plan, and learning library in one place.</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {membershipLoaded && membership.subscriber ? (
                  <span
                    data-profile-membership-status={membership.active ? "active" : "expired"}
                    className="dc-tonal-pill"
                    style={{
                      background: membership.active ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
                      color: membership.active ? "#047857" : "#be123c",
                      borderColor: membership.active ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)",
                    }}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${membership.active ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {membership.active ? "Active" : "Expired"}
                  </span>
                ) : null}
                {preferencesSaving ? <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" /> : null}
                {/* Glass mode toggle. Lets the user dial transparency up
                    (Clear) or retreat to a fully solid surface (Solid)
                    from inside the page, satisfying the "make
                    transparency conditional and adjustable" rule. */}
                <div
                  role="group"
                  aria-label="Glass mode"
                  className="dc-glass-mode"
                  data-profile-glass-mode
                >
                  {GLASS_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      aria-pressed={glassMode === mode.id}
                      title={mode.hint}
                      onClick={() => setGlassMode(mode.id)}
                    >
                      {mode.id === "clear" ? <Eye className="h-3 w-3" /> : null}
                      {mode.id === "tinted" ? <Eye className="h-3 w-3 opacity-70" /> : null}
                      {mode.id === "solid" ? <EyeOff className="h-3 w-3" /> : null}
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            {message && (
              <div
                role="status"
                className="rounded-2xl border border-rose-200/70 bg-rose-50/80 p-3 text-sm font-semibold text-rose-700 shadow-[0_10px_24px_-16px_rgba(225,29,72,0.55)] backdrop-blur-md"
              >
                {message}
              </div>
            )}

            {/* ── Plan hero ─────────────────────────────────────────────
                The hero is a "lens" — the only place on the page that
                uses dramatic transparency. It bends light (refracted
                top edge), holds a moving background (orbs) and uses the
                conic orbit, but the *text block* is wrapped in a
                scrim so the moving background never dictates
                legibility. */}
            <div className="dc-profile-plan-orbit">
              <section
                data-profile-membership-tier={membership.tier}
                className="dc-glass-lens relative rounded-[2rem] p-6 text-white"
                style={{
                  background: theme.heroBg,
                  borderColor: theme.heroRing,
                  boxShadow: `0 28px 56px -20px ${theme.heroGlow}, inset 0 1px 0 rgba(255,255,255,0.22), 0 0 0 1px ${theme.heroRing}`,
                }}
              >
                <div
                  className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full blur-3xl"
                  style={{ background: theme.heroGlow }}
                  aria-hidden="true"
                />
                <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-cyan-400/30 blur-3xl" aria-hidden="true" />
                <div className="dc-glass-edge-highlight" aria-hidden="true" />

                <div className="relative flex flex-col gap-5">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      data-profile-plan-label
                      className="dc-hero-lens-chip"
                    >
                      {membership.subscriber ? <BadgeCheck className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                      {membership.subscriber ? planLabel : PLAN_LABELS.normal}
                    </span>
                    {membership.subscriber ? (
                      <span
                        data-profile-plan-status={membership.active ? "active" : "expired"}
                        className={`dc-hero-lens-chip ${membership.active ? "dc-profile-status-orbit" : ""}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${membership.active ? "bg-emerald-300" : "bg-amber-300"}`} />
                        {membership.active ? "Active" : "Renew access"}
                      </span>
                    ) : (
                      <span className="dc-hero-lens-chip opacity-80">No plan yet</span>
                    )}
                  </div>

                  {/* Hero text scrim — a soft glass panel that lives
                      behind the name, email, member-since, bio and
                      edit button. Per the rules, glass must become
                      more opaque directly behind important text. */}
                  <div className="dc-hero-text-scrim">
                    <div className="flex items-center gap-4">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" className="h-16 w-16 rounded-full object-cover dc-glow-ring" />
                      ) : (
                        <div className="grid h-16 w-16 place-items-center rounded-full bg-white/18 text-xl font-black dc-glow-ring">{initials}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-2xl font-black tracking-tight text-white">{user.name}</h2>
                        <p className="truncate text-xs text-white/80">{user.email}</p>
                        <p className="mt-1 text-[11px] text-white/65">Member since {memberSince}</p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-white/90">
                      {user.bio || (membership.subscriber
                        ? `Your ${tierLabel} learning space is ready. Keep building momentum.`
                        : "Add a short bio to personalize your learner profile.")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setModal("edit")}
                      className="dc-action-lens mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm font-black"
                    >
                      <Pencil size={15} /> Edit profile
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* ── Subscription / upgrade section ───────────────────────
                Two parallel containers, one for paid members and one
                for the free tier. The content is structurally
                identical so the eye reads the page the same way
                regardless of plan. */}
            {membership.subscriber ? (
              <section
                data-profile-membership-card
                className="dc-glass-container rounded-[2rem] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-12 w-12 place-items-center rounded-2xl shadow-[0_10px_22px_-12px_rgba(79,70,229,0.55)]"
                      style={{ background: theme.iconBg, color: theme.accentText, boxShadow: `0 10px 22px -12px ${theme.heroGlow}, inset 0 0 0 1px ${theme.iconRing}` }}
                    >
                      {membership.tier === "pro" ? <Zap className="h-6 w-6" /> : membership.tier === "premium" ? <Sparkles className="h-6 w-6" /> : <Crown className="h-6 w-6" />}
                    </div>
                    <div>
                      <p className="dc-eyebrow" style={{ color: theme.accentText }}>Membership</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">{tierLabel} membership</h3>
                    </div>
                  </div>
                  <span
                    className="dc-tonal-pill"
                    style={{ background: theme.pillBg, color: theme.pillText, borderColor: theme.iconRing }}
                  >
                    {membership.active ? "Subscribed" : "Expired"}
                  </span>
                </div>

                {/* Stats row — solid chips inside the glass container
                    so the small labels never compete with the moving
                    background. */}
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <SolidStat label="Plan" value={tierLabel} />
                  <SolidStat label="Billing" value={cycleLabel(membership.subscription?.cycle || "monthly")} />
                  <SolidStat label="Access" value={membership.active ? "Active" : "Ended"} />
                </div>

                <p className="mt-4 text-xs leading-5 text-slate-600">
                  {membership.active
                    ? `You are enjoying the ${tierLabel} experience. Manage your plan or extend access whenever you are ready.`
                    : `Your ${tierLabel} access has ended. Renew to bring your saved learning experience back instantly.`}
                </p>
                <button
                  type="button"
                  onClick={openPlans}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white shadow-lg transition active:scale-[0.99]"
                  style={{
                    background: `linear-gradient(135deg, ${theme.accentText}, ${theme.pillText})`,
                    boxShadow: `0 12px 28px -10px ${theme.heroGlow}`,
                  }}
                >
                  <RefreshCcw className="h-4 w-4" /> {membership.active ? "Manage subscription" : "Renew subscription"} <ArrowRight className="h-4 w-4" />
                </button>
              </section>
            ) : (
              <section
                data-profile-upgrade-card
                className="dc-glass-container relative overflow-hidden rounded-[2rem] p-5"
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-violet-400/30 blur-2xl" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-cyan-300/25 blur-2xl" aria-hidden="true" />
                <div className="dc-glass-edge-highlight" aria-hidden="true" />
                <div className="relative">
                  <div className="flex items-start gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_12px_24px_-10px_rgba(79,70,229,0.8)]">
                      <Rocket className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="dc-eyebrow">Basic learner access</p>
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
                    <button
                      type="button"
                      onClick={openPlans}
                      className="flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white shadow-lg transition active:scale-[0.99]"
                      style={{
                        background: `linear-gradient(135deg, ${theme.accentText}, ${theme.pillText})`,
                        boxShadow: `0 12px 28px -10px ${theme.heroGlow}`,
                      }}
                    >
                      Explore plans <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={openSubscriberExperience}
                      data-subscriber-experience-cta
                      className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/70 py-3 text-sm font-black text-slate-800 transition active:scale-[0.99] hover:bg-white"
                    >
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
                belongs with the account cards, so it is presented here in the same
                premium card language as membership and AI allowance. */}
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

            {referralCode ? (
              <section className="dc-glass-container rounded-[2rem] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="dc-eyebrow dc-eyebrow--amber">Your referral code</p>
                    <p className="mt-1 text-xs text-slate-500">{`Share it with a learner joining ${appName}.`}</p>
                  </div>
                  <div
                    className="grid h-10 w-10 place-items-center rounded-2xl"
                    style={{ background: "rgba(245, 158, 11, 0.14)", color: "#b45309", boxShadow: "inset 0 0 0 1px rgba(245, 158, 11, 0.32)" }}
                  >
                    <Sparkles className="h-5 w-5" />
                  </div>
                </div>
                {referralUsed ? (
                  <div data-profile-referral-used className="mt-4 dc-stat-tile">
                    <div className="flex items-center justify-between">
                      <code className="min-w-0 truncate text-sm font-black text-slate-400 line-through decoration-2 decoration-rose-400">{referralCode}</code>
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800">Used</span>
                    </div>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">This referral ID has been used and is no longer active.</p>
                  </div>
                ) : (
                  <div
                    className="mt-4 flex items-center justify-between gap-2 rounded-2xl p-3"
                    style={{ background: "rgba(124, 58, 237, 0.08)", border: "1px solid rgba(124, 58, 237, 0.22)" }}
                  >
                    <code className="min-w-0 truncate text-sm font-black text-violet-900">{referralCode}</code>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(referralCode)}
                      className="shrink-0 rounded-xl bg-white/80 px-3 py-1.5 text-[10px] font-black text-violet-700 shadow-sm ring-1 ring-white/80"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </section>
            ) : null}

            {/* ── Library container ───────────────────────────────────
                Solid stat tiles inside a glass container. The numbers
                get the structural surface; the wrapper keeps the
                page language. */}
            <section className="dc-glass-container rounded-[2rem] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="dc-eyebrow">My library</p>
                  <h3 className="mt-1 text-base font-black text-slate-950">Your saved learning activity</h3>
                  <p className="mt-0.5 text-xs text-slate-500">At-a-glance counts of what you own and what you saved.</p>
                </div>
                <div
                  className="grid h-10 w-10 place-items-center rounded-2xl"
                  style={{ background: "rgba(124, 58, 237, 0.12)", color: "#6d28d9", boxShadow: "inset 0 0 0 1px rgba(124, 58, 237, 0.22)" }}
                >
                  <ShoppingBag className="h-5 w-5" />
                </div>
              </div>
              <div className="dc-glass-divider my-4" />
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
                      className="dc-stat-tile flex w-full items-center gap-3 !p-2 text-left !rounded-2xl"
                    >
                      <img src={product.image} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-black text-slate-900">{product.title}</span>
                        <span className="text-xs text-slate-400">Owned · Open course</span>
                      </span>
                      <ChevronRight size={16} className="text-slate-300" />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            {/* ── Preferences shortcut ────────────────────────────────
                Compact container with the bell as a refractive icon
                lens. Clicking opens the modal. */}
            <section className="dc-glass-container rounded-[2rem] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="dc-eyebrow">Preferences</p>
                  <h3 className="mt-1 text-base font-black text-slate-950">Notifications & privacy</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Saved securely to your account.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModal("settings")}
                  className="dc-action-lens grid h-10 w-10 place-items-center !rounded-2xl"
                  style={{ background: "rgba(124, 58, 237, 0.18)", borderColor: "rgba(124, 58, 237, 0.4)", color: "#6d28d9" }}
                  aria-label="Open preferences"
                >
                  <Bell size={18} />
                </button>
              </div>
            </section>

            <button
              type="button"
              onClick={() => void logout().then(() => { window.location.hash = "#/auth?mode=login"; })}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500/10 py-4 text-sm font-black text-rose-600 ring-1 ring-rose-200/70 shadow-[0_12px_24px_-16px_rgba(225,29,72,0.55)] backdrop-blur-md"
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
                className="mx-auto mt-7 block text-[9px] font-medium tracking-wide text-slate-400 transition hover:text-slate-500"
              >Open dashboard</button>
            ) : null}
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
  const theme = MEMBERSHIP_THEMES[tier];
  const expired = !isActiveSubscription(subscription, now);
  const daysRemaining = subscription.expiresAt > now ? Math.max(1, Math.ceil((subscription.expiresAt - now) / 86400000)) : 0;
  const totalDays = subscription.cycle === "yearly" ? 365 : 30;
  const progress = subscription.expiresAt > 0 ? Math.max(0, Math.min(100, Math.round((daysRemaining / totalDays) * 100))) : 100;
  const expiredAccent = "#be123c";
  const expiredRing = "rgba(244, 63, 94, 0.3)";

  return (
    <section
      data-renewal-card
      data-stage={expired ? "expired" : "active"}
      className="dc-glass-container relative overflow-hidden rounded-[2rem] p-5"
    >
      <div className="dc-glass-edge-highlight" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full blur-2xl"
        style={{ background: expired ? "rgba(244, 63, 94, 0.32)" : theme.heroGlow }}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
              style={{
                background: expired ? "rgba(244, 63, 94, 0.12)" : theme.iconBg,
                color: expired ? expiredAccent : theme.accentText,
                boxShadow: `inset 0 0 0 1px ${expired ? expiredRing : theme.iconRing}`,
              }}
            >
              <CalendarDays className="h-6 w-6" />
            </span>
            <div>
              <p className="dc-eyebrow" style={{ color: expired ? expiredAccent : theme.accentText }}>Membership renewal</p>
              <h3 data-renewal-card-headline className="mt-1 text-lg font-black leading-tight text-slate-950">{expired ? "Your access needs a refresh" : "Your access is active"}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{TIER_LABELS[tier]} · {cycleLabel(subscription.cycle)}</p>
            </div>
          </div>
          <span
            data-renewal-remaining
            className="dc-tonal-pill shrink-0"
            style={{
              background: expired ? "rgba(244, 63, 94, 0.12)" : "rgba(16, 185, 129, 0.12)",
              color: expired ? expiredAccent : "#047857",
              borderColor: expired ? expiredRing : "rgba(16, 185, 129, 0.3)",
            }}
          >
            {expired ? "Renew now" : daysRemaining > 0 ? `${daysRemaining}d left` : "Active"}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <SolidStat label="Access until" value={subscription.expiresAt ? formatDate(subscription.expiresAt) : "Active access"} valueAttr="data-renewal-expiry" />
          <SolidStat label="Renewal mode" value="Manual & secure" />
        </div>

        {!expired ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>Current access window</span>
              <span>{progress}% remaining</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/60 ring-1 ring-slate-200/70">
              <div
                data-renewal-progress
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: theme.progress }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-rose-50/80 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-800 ring-1 ring-rose-100/80 backdrop-blur-md">
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
            className="flex-1 rounded-2xl py-3 text-sm font-black text-white shadow-lg transition active:scale-[0.98]"
            style={{
              background: expired ? "linear-gradient(135deg, #e11d48, #f43f5e)" : `linear-gradient(135deg, ${theme.accentText}, ${theme.pillText})`,
              boxShadow: `0 12px 28px -10px ${expired ? "rgba(225,29,72,0.55)" : theme.heroGlow}`,
            }}
          >
            {expired ? "Renew access" : "Renew / extend access"}
          </button>
          <button
            type="button"
            onClick={() => onToggleReminders(!subscription.reminderOptOut)}
            data-renewal-reminder-toggle
            className="dc-stat-tile flex shrink-0 items-center gap-1.5 !rounded-2xl px-3 py-3 text-[11px] font-black text-slate-600"
          >
            {subscription.reminderOptOut ? "Reminders off" : "Reminders on"}
          </button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> No automatic charge without your confirmation.
        </p>
      </div>
    </section>
  );
}

function SolidStat({ label, value, valueAttr }: { label: string; value: string; valueAttr?: string }) {
  return (
    <div className="dc-stat-tile">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p {...(valueAttr ? { [valueAttr]: true } : {})} className="mt-1 truncate text-xs font-black text-slate-900">{value}</p>
    </div>
  );
}

function UpgradePoint({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 text-xs font-bold text-slate-700"><CircleCheck className="h-4 w-4 shrink-0 text-indigo-600" />{children}</div>;
}

function LibraryStat({ icon, value, label, onClick, tone = "text-violet-600" }: { icon: ReactNode; value: number; label: string; onClick: () => void; tone?: string }) {
  return (
    <button type="button" onClick={onClick} className="dc-stat-tile block w-full">
      <span className={`mx-auto grid h-9 w-9 place-items-center rounded-xl ${tone} bg-white/80 ring-1 ring-slate-200/70`}>{icon}</span>
      <span className="mt-2 block text-xl font-black text-slate-950">{value}</span>
      <span className="block text-[10px] font-bold text-slate-500">{label}</span>
    </button>
  );
}

function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="dc-modal-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="dc-modal-sheet max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 ring-1 ring-white/80">
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
    <div className="flex items-center gap-3 rounded-2xl bg-white/55 p-4 ring-1 ring-white/70 backdrop-blur-md">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/12 text-violet-600">{icon}</span>
      <span className="flex-1 text-sm font-bold text-slate-900">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-on={checked ? "true" : "false"}
        onClick={() => onChange(!checked)}
        className="dc-toggle"
      >
        <span />
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
          <input className="dc-glass-input w-full rounded-xl px-4 py-3 text-sm outline-none" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email address">
          <input className="dc-glass-input w-full rounded-xl px-4 py-3 text-sm outline-none" value={user.email} disabled />
        </Field>
        <Field label="Mobile number">
          <input className="dc-glass-input w-full rounded-xl px-4 py-3 text-sm outline-none" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10 digit number" />
        </Field>
        <Field label="Bio">
          <textarea className="dc-glass-input w-full rounded-xl px-4 py-3 text-sm outline-none" value={bio} onChange={(e) => setBio(e.target.value.slice(0, 240))} rows={3} placeholder="Tell learners about yourself" />
        </Field>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
        <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 text-sm font-black text-white disabled:opacity-60">
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
