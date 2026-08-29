import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Bell, Lock, Sparkles, UserRound } from "lucide-react";
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
import ProfileLayout, {
  BaseModal,
  EditModal,
  PreferenceRow,
  PLAN_LABELS,
  TIER_LABELS,
  type MembershipTier,
  type ProfileLayoutMembership,
  type SubscriptionSnapshot,
} from "./ProfileLayout";

type Modal = "edit" | "settings" | null;
type Preferences = {
  push: boolean;
  email: boolean;
  promotions: boolean;
  profileVisible: boolean;
  shareActivity: boolean;
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

  const membershipPayload: ProfileLayoutMembership = {
    tier: membership.tier,
    subscriber: membership.subscriber,
    active: membership.active,
    expired: membership.expired,
    tierLabel,
    planLabel,
    subscription: membership.subscription,
  };

  return (
    <div data-profile-page className="min-h-screen bg-gradient-to-b from-indigo-50 via-slate-50 to-white text-slate-900 sm:py-0 lg:py-0">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:overflow-hidden sm:rounded-none sm:border-0 lg:max-w-full lg:rounded-none lg:border-0">
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          onNavigateToSubscription={openPlans}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main ref={mainRef} data-profile-content className="relative z-[1] flex-1 overflow-y-auto px-4 pt-3 pb-6 md:px-6 lg:px-6 xl:px-8">
          <ProfileLayout
            name={user.name}
            email={user.email}
            photoURL={user.photoURL}
            bio={user.bio}
            initials={initials}
            memberSince={memberSince}
            onEdit={() => setModal("edit")}
            membership={membershipPayload}
            membershipBadge={membershipBadge}
            onOpenPlans={openPlans}
            onOpenSubscriberExperience={openSubscriberExperience}
            stats={{
              ownedCount,
              favoriteCount: favoriteIds.size,
              cartCount: cartIds.size,
              onOpenPurchases: () => { window.location.hash = "#/store/purchases"; },
              onOpenFavorites: () => { window.location.hash = "#/favorites"; },
              onOpenCart: () => { window.location.hash = "#/cart"; },
            }}
            referral={referralCode ? {
              code: referralCode,
              used: referralUsed,
              appName,
              onCopy: () => void navigator.clipboard?.writeText(referralCode),
            } : null}
            renewal={membership.subscriber && membership.subscription ? {
              tier: membership.tier,
              subscription: membership.subscription,
              now,
              onRenew: openPlans,
              onToggleReminders: (next) => {
                if (!user || !subscriptionRenewal) return;
                void updateDoc(doc(db, "users", user.id, "subscription", "current"), { renewalReminderOptOut: next }).catch(() => undefined);
              },
            } : null}
            myDayCard={
              <MyDayAllowanceCard
                onOpenMyDay={() => { window.location.hash = "#/my-day"; }}
                onSubscribe={openPlans}
              />
            }
            aiQuotaCard={membership.subscriber ? <AiQuotaCard uid={user.id} /> : null}
            library={{
              items: purchasedProducts.map((p) => ({ id: p.id, title: p.title, image: p.image })),
              ownedCount,
              onOpenCourse: (id) => { window.location.hash = `#/course/${encodeURIComponent(id)}`; },
              onOpenPurchases: () => { window.location.hash = "#/store/purchases"; },
            }}
            onOpenSettings={() => setModal("settings")}
            saving={preferencesSaving}
            message={message}
            onLogout={() => void logout().then(() => { window.location.hash = "#/auth?mode=login"; })}
            isAdmin={String(user.role || "") === "admin" && String(user.email || "").trim().toLowerCase() === APPROVED_ADMIN_EMAIL}
            onOpenDashboard={() => { window.location.hash = "#/admin-login"; }}
          />
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
