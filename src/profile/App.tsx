import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db, getFirebaseStorage } from "../../firebase";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { useOwnedProducts } from "../hooks/useCourseAccess";
import { APPROVED_ADMIN_EMAIL } from "../utils/adminSession";
import { resolveFeaturePrice } from "../../utils/featurePricing";
import { FALLBACK_SUBSCRIPTION_CATALOG } from "../subscription/data/fallbackCatalog";
import { loadSubscriptionCatalog } from "../subscription/utils/loadSubscriptionCatalog";
import type { SubscriptionCatalog } from "../subscription/utils/subscriptionCatalog";
import ProfileLayout, {
  EditModal,
  PLAN_LABELS,
  TIER_LABELS,
  type MembershipTier,
  type ProfileLayoutMembership,
  type SubscriptionSnapshot,
} from "./ProfileLayout";

type Modal = "edit" | null;

const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function profilePhotoContentType(file: File): string | null {
  const mimeType = String(file.type || "").toLowerCase();
  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return mimeType;
  if (mimeType && mimeType !== "application/octet-stream") return null;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return PROFILE_PHOTO_TYPES[extension] || null;
}

// Backwards-compatible type exports; Settings no longer imports this route.
export { DEFAULT_PREFERENCES } from "../../utils/userPreferences";
export type { Preferences } from "../../utils/userPreferences";

type MembershipState = {
  tier: MembershipTier;
  subscription: SubscriptionSnapshot | null;
  active: boolean;
  expired: boolean;
  subscriber: boolean;
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
  const { user, logout, updateAccount, setUser } = useAuth();
  const { products, purchasedIds } = useCatalog();
  const { favoriteIds, cartIds } = useCommerce();
  // Count products with any purchased content scope, not only full courses.
  // Individual module/resource buyers must still find their purchases here.
  const { ownedProductIds: fullOwnedIds, accessibleProductIds, signedIn } = useOwnedProducts();
  const canonicalOwnedIds = accessibleProductIds || fullOwnedIds;
  const [modal, setModal] = useState<Modal>(null);
  const [message, setMessage] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralUsed, setReferralUsed] = useState(false);
  const [subscriptionRenewal, setSubscriptionRenewal] = useState<SubscriptionSnapshot | null>(null);
  const [profileSubscription, setProfileSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [subscriptionCatalog, setSubscriptionCatalog] = useState<SubscriptionCatalog>(FALLBACK_SUBSCRIPTION_CATALOG);
  const [now, setNow] = useState(() => Date.now());
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const mainRef = useRef<HTMLElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSubscriptionCatalog()
      .then((catalog) => {
        if (!cancelled && catalog.plans.length > 0) setSubscriptionCatalog(catalog);
      })
      .catch((error) => console.warn("Profile subscription catalog unavailable; using defaults.", error));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const unsubscribeProfile = onSnapshot(doc(db, "users", user.id), (snapshot) => {
      const data = snapshot.data() || {};
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
        features: Array.isArray(data.subscriptionFeatures) ? data.subscriptionFeatures.map(String) : [],
        includedProductIds: Array.isArray(data.includedProductIds) ? data.includedProductIds.map(String) : [],
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
          features: Array.isArray(data.features) ? data.features.map(String) : [],
          includedProductIds: Array.isArray(data.includedProductIds) ? data.includedProductIds.map(String) : [],
          revisionTestBankLimit: data.revisionTestBankLimit === null || data.revisionTestBankLimit === undefined
            ? null
            : Number.isFinite(Number(data.revisionTestBankLimit)) ? Number(data.revisionTestBankLimit) : null,
        } : null);
      },
      (error) => {
        console.warn("Subscription profile sync failed", error);
        setSubscriptionRenewal(null);
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

  const membershipPlan = useMemo(
    () => membership.subscription
      ? subscriptionCatalog.plans.find((plan) => plan.id === membership.subscription?.planId) || null
      : null,
    [membership.subscription, subscriptionCatalog],
  );
  const profileMembershipFeatures = useMemo(() => {
    if (!membership.subscriber || !membership.subscription) return [];
    const planId = membership.subscription.planId;
    const cycle = membership.subscription.cycle === "yearly" ? "yearly" : "monthly";
    const includedIds = new Set([
      ...(membership.subscription.features || []),
      ...(membershipPlan?.includedFeatureIds || []),
    ].map(String));
    for (const feature of subscriptionCatalog.features) {
      if (feature.included || resolveFeaturePrice(feature as never, planId, cycle).included) {
        includedIds.add(String(feature.id));
      }
    }
    return subscriptionCatalog.features
      .filter((feature) => includedIds.has(String(feature.id)))
      .map((feature) => ({ id: String(feature.id), name: feature.name, description: feature.description || "" }));
  }, [membership.subscriber, membership.subscription, membershipPlan, subscriptionCatalog]);
  const profileMembershipCourses = useMemo(() => {
    if (!membership.subscriber || !membership.subscription) return [];
    const planId = membership.subscription.planId;
    const includedIds = new Set([
      ...(membership.subscription.includedProductIds || []),
      ...(membershipPlan?.includedProductIds || []),
      ...subscriptionCatalog.productUnlocks
        .filter((unlock) => unlock.active && unlock.planId === planId)
        .map((unlock) => unlock.productId),
    ].map(String));
    return products
      .filter((product) => includedIds.has(String(product.id)) || Boolean(product.documentId && includedIds.has(String(product.documentId))))
      .map((product) => ({ id: String(product.documentId || product.id), title: product.title, image: product.image || "" }));
  }, [membership.subscriber, membership.subscription, membershipPlan, subscriptionCatalog, products]);

  const initials = user?.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "Recently";
  const ownedCount = signedIn ? Math.max(purchasedIds.size, canonicalOwnedIds.length) : purchasedIds.size;
  const tierLabel = TIER_LABELS[membership.tier];
  const planLabel = membershipPlan?.name || (membership.subscription ? membership.subscription.planId : PLAN_LABELS[membership.tier]);
  const cycle = membership.subscription?.cycle === "yearly" ? "yearly" : "monthly";
  const storedTestBankLimit = membership.subscription?.revisionTestBankLimit;
  const revisionTestBankLimit = storedTestBankLimit !== null && storedTestBankLimit !== undefined && Number.isFinite(Number(storedTestBankLimit))
    ? Number(storedTestBankLimit)
    : membershipPlan?.revisionTestBankLimits?.[cycle] ?? null;

  const handleFooterChange = (tab: TabKey) => {
    if (tab === "home") window.location.hash = "#/home";
    else if (tab === "myday") window.location.hash = "#/my-day";
    else if (tab === "store") window.location.hash = "#/store";
    else if (tab === "purchases") window.location.hash = "#/store/purchases";
    else if (tab === "profile") mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!user) return null;

  const handleProfilePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] || null;
    event.currentTarget.value = "";
    if (!file) return;

    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setPhotoError("Choose a profile photo under 5 MB.");
      return;
    }
    const contentType = profilePhotoContentType(file);
    if (!contentType) {
      setPhotoError("Choose a JPG, PNG, or WebP image.");
      return;
    }

    setPhotoError("");
    setPhotoUploading(true);
    try {
      const storage = await getFirebaseStorage();
      const { getDownloadURL, ref, uploadBytes } = await import("firebase/storage");
      const photoRef = ref(storage, `userProfilePhotos/${user.id}/avatar`);
      const uploaded = await uploadBytes(photoRef, file, {
        contentType,
        cacheControl: "public,max-age=3600",
      });
      const photoUrl = new URL(await getDownloadURL(uploaded.ref));
      photoUrl.searchParams.set("v", String(Date.now()));
      const photoURL = photoUrl.toString();
      await setDoc(doc(db, "users", user.id), { photoURL, updatedAt: serverTimestamp() }, { merge: true });
      setUser({ ...user, photoURL });
    } catch (error) {
      console.error("Profile photo upload failed", error);
      setPhotoError("Could not upload the photo. Check your connection and try again.");
    } finally {
      setPhotoUploading(false);
    }
  };

  const openPlans = () => {
    window.location.hash = "#/subscription";
  };

  const openMembershipFeature = (featureId: string) => {
    const id = featureId.trim().toLowerCase().replace(/_/g, "-");
    if (id === "myday" || id.includes("my-day")) window.location.hash = "#/my-day";
    else if (id === "revision" || id.includes("revision") || id.includes("test-bank")) window.location.hash = "#/revision";
    else openPlans();
  };

  const membershipPayload: ProfileLayoutMembership = {
    tier: membership.tier,
    subscriber: membership.subscriber,
    active: membership.active,
    expired: membership.expired,
    tierLabel,
    planLabel,
    planDescription: membershipPlan?.description || "",
    revisionTestBankLimit,
    features: profileMembershipFeatures,
    includedCourses: profileMembershipCourses,
    subscription: membership.subscription,
  };

  return (
    <div data-profile-page className="min-h-screen text-white sm:py-0 lg:py-0">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:max-w-none sm:overflow-hidden sm:rounded-none sm:border-0">
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          onNavigateToSubscription={openPlans}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main ref={mainRef} data-profile-content className="relative z-[1] flex-1 overflow-y-auto px-3.5 sm:px-6 md:px-8 lg:px-10 pt-3 pb-32 sm:pb-36 md:pb-12">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose a profile photo"
            data-profile-photo-input
            onChange={handleProfilePhotoChange}
          />
          <ProfileLayout
            name={user.name}
            email={user.email}
            photoURL={user.photoURL}
            bio={user.bio}
            initials={initials}
            memberSince={memberSince}
            onEdit={() => setModal("edit")}
            onChoosePhoto={() => {
              setPhotoError("");
              photoInputRef.current?.click();
            }}
            photoUploading={photoUploading}
            photoError={photoError}
            membership={membershipPayload}
            onOpenPlans={openPlans}
            onOpenFeature={openMembershipFeature}
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
              onCopy: () => void navigator.clipboard?.writeText(referralCode),
            } : null}
            renewal={membership.subscriber && membership.subscription ? {
              tier: membership.tier,
              subscription: membership.subscription,
              now,
              onRenew: openPlans,
              onToggleReminders: (next) => {
                if (!user) return;
                const reminderRef = subscriptionRenewal
                  ? doc(db, "users", user.id, "subscription", "current")
                  : doc(db, "users", user.id);
                void updateDoc(reminderRef, { renewalReminderOptOut: next }).catch(() => undefined);
              },
            } : null}
            onOpenUsageLimits={() => { window.location.hash = "#/usage-limits"; }}
            onOpenStudyLibrary={() => { window.location.hash = "#/study-library"; }}
            library={{
              items: purchasedProducts.map((p) => ({ id: p.id, title: p.title, image: p.image })),
              ownedCount,
              onOpenCourse: (id) => { window.location.hash = `#/course/${encodeURIComponent(id)}`; },
              onOpenPurchases: () => { window.location.hash = "#/store/purchases"; },
            }}
            onOpenSettings={() => { window.location.hash = "#/settings"; }}
            saving={photoUploading}
            message={message}
            onLogout={() => void logout().finally(() => { window.location.hash = "#/auth?mode=login"; })}
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

      </div>
    </div>
  );
}
