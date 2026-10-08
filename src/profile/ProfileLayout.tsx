import { GlassSwitch } from "../components/ui/glass-switch";
import { GlassButton } from "../components/ui/glass-button";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/glass-dialog";
import { PaymentButton } from "../components/ui/PaymentButton";
import RenewalStatusCard from "../components/subscription/RenewalStatusCard";
import { buildRenewalView } from "../../utils/renewalPresentation";
import { getRenewalReminder } from "../../utils/subscriptionRenewal";
import { useState, type FormEvent, type ReactNode } from "react";
import { ProfileCard } from "./ProfileCard";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  Crown,
  Gauge,
  Heart,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Save,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  X,
  Zap,
} from "lucide-react";

/**
 * Normalize Google-hosted avatars for embedded WebViews, where the default
 * image size can occasionally return 403 when a localhost Referer is sent.
 * Other image providers (including Firebase Storage) keep their URL as-is.
 */
export function profilePhotoSrc(url?: string): string {
  const src = String(url || "").trim();
  if (!src) return "";
  if (/googleusercontent\.com/i.test(src)) {
    if (/=s\d+/.test(src)) return src.replace(/=s\d+(-c)?/, "=s256-c");
    return `${src}${src.includes("?") ? "" : "=s256-c"}`;
  }
  return src;
}

/* ── Shared types ───────────────────────────────────────────────────── */
export type MembershipTier = "normal" | "basic" | "premium" | "pro";

export type SubscriptionSnapshot = {
  status: string;
  expiresAt: number;
  cycle: string;
  planId: string;
  reminderOptOut: boolean;
  features?: string[];
  includedProductIds?: string[];
  revisionTestBankLimit?: number | null;
};

export type ProfileMembershipFeature = { id: string; name: string; description?: string };
export type ProfileMembershipCourse = { id: string; title: string; image: string };

export const TIER_LABELS: Record<MembershipTier, string> = {
  normal: "Free",
  basic: "Basic",
  premium: "Premium",
  pro: "Pro",
};

export const PLAN_LABELS: Record<MembershipTier, string> = {
  normal: "Free Plan",
  basic: "Basic Plan",
  premium: "Premium Plan",
  pro: "Pro Plan",
};

const TIER_ICONS: Record<MembershipTier, ReactNode> = {
  normal: <Crown className="h-4 w-4" />,
  basic: <Crown className="h-4 w-4" />,
  premium: <Sparkles className="h-4 w-4" />,
  pro: <Zap className="h-4 w-4" />,
};

const formatDate = (value: number): string => {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const cycleLabel = (cycle: string): string => (cycle === "yearly" ? "Yearly" : "Monthly");

/* ── Props ──────────────────────────────────────────────────────────── */
export interface ProfileLayoutMembership {
  tier: MembershipTier;
  subscriber: boolean;
  active: boolean;
  expired: boolean;
  tierLabel: string;
  planLabel: string;
  planDescription: string;
  revisionTestBankLimit: number | null;
  features: ProfileMembershipFeature[];
  includedCourses: ProfileMembershipCourse[];
  subscription: SubscriptionSnapshot | null;
}

export type ProfileLayoutProps = {
  name: string;
  email: string;
  photoURL?: string;
  bio?: string;
  initials: string;
  memberSince: string;
  onEdit: () => void;
  onChoosePhoto?: () => void;
  photoUploading?: boolean;
  photoError?: string;

  membership: ProfileLayoutMembership;
  onOpenPlans: () => void;
  onOpenFeature: (featureId: string) => void;

  stats: {
    ownedCount: number;
    favoriteCount: number;
    cartCount: number;
    onOpenPurchases: () => void;
    onOpenFavorites: () => void;
    onOpenCart: () => void;
  };

  referral: {
    code: string;
    used: boolean;
    onCopy: () => void;
  } | null;

  renewal: {
    tier: MembershipTier;
    subscription: SubscriptionSnapshot;
    now: number;
    onRenew: () => void;
    onToggleReminders: (next: boolean) => void;
  } | null;

  onOpenUsageLimits: () => void;
  onOpenStudyLibrary: () => void;

  library: {
    items: { id: string; title: string; image: string }[];
    ownedCount: number;
    onOpenCourse: (id: string) => void;
    onOpenPurchases: () => void;
  };

  onOpenSettings: () => void;
  saving: boolean;
  message?: string;
  onLogout: () => void;
  isAdmin: boolean;
  onOpenDashboard: () => void;
};

/* ── Clean Professional Profile Layout ─────────────────────────────── */
export default function ProfileLayout({
  name,
  email,
  photoURL,
  bio,
  initials,
  memberSince,
  onEdit,
  onChoosePhoto,
  photoUploading = false,
  photoError,
  membership,
  onOpenPlans,
  onOpenFeature,
  stats,
  referral,
  renewal,
  onOpenUsageLimits,
  onOpenStudyLibrary,
  library,
  onOpenSettings,
  saving,
  message,
  onLogout,
  isAdmin,
  onOpenDashboard,
}: ProfileLayoutProps) {
  const src = profilePhotoSrc(photoURL);
  const [brokenPhoto, setBrokenPhoto] = useState("");
  const showPhoto = Boolean(src) && src !== brokenPhoto;

  const snapshot = renewal?.subscription || membership.subscription;
  const now = renewal?.now || Date.now();
  const active = membership.active;
  const daysRemaining = snapshot && snapshot.expiresAt > now
    ? Math.max(1, Math.ceil((snapshot.expiresAt - now) / 86400000))
    : 0;
  const reminderOptOut = Boolean(snapshot?.reminderOptOut);
  const renewalView = snapshot && membership.subscriber
    ? buildRenewalView(
        getRenewalReminder({
          status: snapshot.status,
          expiresAt: snapshot.expiresAt,
          planId: snapshot.planId,
          planName: membership.planLabel,
          // The card is account management, not a push/email notification.
          // Keep the status visible even when the learner opted out of reminders.
          renewalReminderOptOut: false,
        }, now),
        { planName: membership.planLabel, now },
      )
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Profile</h1>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-violet-300">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Saving
            </span>
          )}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {message}
        </div>
      )}

      {/* Profile summary */}
      <ProfileCard data-profile-hero className="mb-6" contentClassName="p-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="shrink-0">
            <button
              onClick={onChoosePhoto}
              disabled={!onChoosePhoto || photoUploading}
              className="group relative"
            >
              {showPhoto ? (
                <img
                  src={src}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover ring-2 ring-white/20 sm:h-24 sm:w-24"
                  onError={() => setBrokenPhoto(src)}
                />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-full bg-indigo-600 text-2xl font-bold text-white sm:h-24 sm:w-24">
                  {initials}
                </div>
              )}
              {onChoosePhoto && (
                <div className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-slate-950 bg-indigo-500 text-white">
                  {photoUploading ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                </div>
              )}
            </button>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span data-profile-plan-label className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-medium text-indigo-200">
                {membership.subscriber ? membership.planLabel : PLAN_LABELS.normal}
              </span>
              {membership.subscriber && (
                <span
                  data-profile-plan-status={active ? "active" : "expired"}
                  data-profile-membership-status={active ? "active" : "expired"}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${active ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}
                >
                  <BadgeCheck className="h-3 w-3" />
                  {active ? "Active" : "Expired"}
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold text-white sm:text-2xl">{name}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
              <Mail className="h-3.5 w-3.5" />
              {email}
            </p>

            {bio && <p className="mt-2 text-sm text-white/70">{bio}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Profile
              </button>
              <span className="flex items-center gap-1 text-xs text-white/50">
                <CalendarDays className="h-3 w-3" />
                Member since {memberSince}
              </span>
            </div>
          </div>
        </div>

        {photoError && (
          <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {photoError}
          </p>
        )}

        {/* Quick Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-6">
          <button
            onClick={stats.onOpenPurchases}
            className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.02] p-3 transition hover:bg-white/[0.05]"
          >
            <ShoppingBag className="h-5 w-5 text-indigo-300" />
            <span className="text-lg font-bold text-white">{stats.ownedCount}</span>
            <span className="text-xs text-white/60">Purchased</span>
          </button>
          <button
            onClick={stats.onOpenFavorites}
            className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.02] p-3 transition hover:bg-white/[0.05]"
          >
            <Heart className="h-5 w-5 text-rose-300" />
            <span className="text-lg font-bold text-white">{stats.favoriteCount}</span>
            <span className="text-xs text-white/60">Favorites</span>
          </button>
          <button
            onClick={stats.onOpenCart}
            className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.02] p-3 transition hover:bg-white/[0.05]"
          >
            <ShoppingBag className="h-5 w-5 text-amber-300" />
            <span className="text-lg font-bold text-white">{stats.cartCount}</span>
            <span className="text-xs text-white/60">In Cart</span>
          </button>
        </div>
      </ProfileCard>

      {/* Membership and renewal live together here; the Subscription page is for browsing plans. */}
      <ProfileCard
        data-profile-membership-card
        data-profile-membership-tier={membership.tier}
        className="mb-6"
        contentClassName="p-5 sm:p-6"
      >
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/25">
              {TIER_ICONS[membership.tier]}
            </div>
            <div>
              <h3 className="dc-profile-card-title">Membership</h3>
              <p className="dc-profile-card-meta">{membership.subscriber ? membership.planLabel : "Free plan"}</p>
            </div>
          </div>
          {membership.subscriber && (
            <span
              data-profile-membership-status={active ? "active" : "expired"}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${active ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}
            >
              {active ? "Active" : "Expired"}
            </span>
          )}
        </header>

        {membership.subscriber && snapshot ? (
          <>
            <div data-profile-membership-details className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                <p className="dc-profile-card-meta">Billing cycle</p>
                <p className="mt-1 text-sm font-semibold text-white">{cycleLabel(snapshot.cycle)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                <p className="dc-profile-card-meta">{active ? "Access ends" : "Access ended"}</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatDate(snapshot.expiresAt)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                <p className="dc-profile-card-meta">{active ? "Time remaining" : "Membership"}</p>
                <p className="mt-1 text-sm font-semibold text-white">{active ? `${daysRemaining} days` : "Expired"}</p>
              </div>
            </div>

            {membership.revisionTestBankLimit !== null ? (
              <p data-member-test-bank-capacity className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs font-semibold text-white/75">
                Cloud Test Bank: {membership.revisionTestBankLimit === -1 ? "Unlimited saved tests" : `up to ${membership.revisionTestBankLimit} saved tests`}
              </p>
            ) : null}

            {renewalView ? (
              <div className="mt-4">
                <RenewalStatusCard
                  view={renewalView}
                  cycle={snapshot.cycle === "yearly" ? "yearly" : "monthly"}
                  reminderOptOut={reminderOptOut}
                  onRenew={renewal?.onRenew || onOpenPlans}
                  onToggleReminders={renewal?.onToggleReminders}
                />
              </div>
            ) : (
              <section
                data-renewal-card
                data-stage={active ? "active" : "expired"}
                className={`mt-4 rounded-2xl border p-4 ${active ? "border-indigo-300/20 bg-indigo-500/[0.06]" : "border-rose-400/25 bg-rose-500/[0.08]"}`}
              >
                <p className="text-sm font-semibold text-white">{active ? "Your membership is active" : "Your membership has ended"}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/60">
                  {active ? `Your access is available until ${formatDate(snapshot.expiresAt)}.` : `Access ended ${formatDate(snapshot.expiresAt)}. Renew to restore your plan.`}
                  {" "}Renewal is manual and secure.
                </p>
                {renewal?.onToggleReminders ? (
                  <GlassButton
                    variant="capsule"
                    type="button"
                    data-renewal-reminder-toggle
                    onClick={() => renewal.onToggleReminders(!reminderOptOut)}
                    className="mt-3 [&>span>div]:h-9 [&>span>div]:px-3 [&>span>div]:text-[11px] [&>span>div]:font-semibold"
                  >
                    <span className="flex items-center gap-1.5">
                      <Bell className="h-3.5 w-3.5" />
                      {reminderOptOut ? "Turn reminders on" : "Turn reminders off"}
                    </span>
                  </GlassButton>
                ) : null}
              </section>
            )}

            {membership.planDescription ? (
              <p className="dc-profile-card-note mt-3 line-clamp-2">{membership.planDescription}</p>
            ) : null}

            {membership.features.length > 0 ? (
              <section className="mt-5" data-member-features>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="dc-profile-card-title">Included features</h4>
                  <span className="dc-profile-card-meta">{membership.features.length}</span>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {membership.features.map((feature) => (
                    <li key={feature.id}>
                      <button
                        type="button"
                        data-profile-membership-feature={feature.id}
                        onClick={() => onOpenFeature(feature.id)}
                        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-left transition hover:bg-white/[0.07]"
                      >
                        <Check className="h-4 w-4 shrink-0 text-emerald-300" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-white/85">{feature.name}</span>
                          {feature.description ? <span className="mt-0.5 block truncate text-[10px] text-white/50">{feature.description}</span> : null}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/45" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {membership.includedCourses.length > 0 ? (
              <section className="mt-5" data-profile-membership-courses>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="dc-profile-card-title">Courses in your plan</h4>
                  <span className="dc-profile-card-meta">{membership.includedCourses.length}</span>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {membership.includedCourses.map((course) => (
                    <li key={course.id}>
                      <button
                        type="button"
                        onClick={() => library.onOpenCourse(course.id)}
                        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-2.5 text-left transition hover:bg-white/[0.07]"
                      >
                        {course.image ? <img src={course.image} alt="" className="h-10 w-12 shrink-0 rounded-lg object-cover" /> : null}
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/85">{course.title}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/45" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2" data-member-manage-actions>
              {!renewalView?.canRenew ? (
                <PaymentButton
                  block
                  size="sm"
                  icon={<CreditCard className="h-4 w-4" />}
                  onClick={renewal?.onRenew || onOpenPlans}
                  data-member-renew=""
                  label={active ? "Renew early" : "Renew subscription"}
                />
              ) : null}
              <GlassButton
                variant="capsule"
                type="button"
                onClick={onOpenPlans}
                data-member-change-plan
                className="w-full [&>span>div]:h-10 [&>span>div]:w-full [&>span>div]:font-semibold"
              >
                Change plan or features
              </GlassButton>
            </div>
          </>
        ) : (
          <div data-profile-upgrade-card className="flex flex-col gap-3">
            <p className="dc-profile-card-note">Explore plans and their included features when you are ready.</p>
            <GlassButton
              variant="capsule"
              type="button"
              onClick={onOpenPlans}
              className="w-full [&>span>div]:h-10 [&>span>div]:w-full [&>span>div]:font-semibold"
            >
              Explore plans
            </GlassButton>
          </div>
        )}
      </ProfileCard>

      {/* Study Library */}
      <ProfileCard data-profile-library-card data-profile-study-library className="mb-6" contentClassName="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-500/20 text-cyan-300">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Study Library</h3>
              <p className="text-sm text-white/60">{library.ownedCount} courses</p>
            </div>
          </div>
          <button
            onClick={onOpenStudyLibrary}
            className="flex items-center gap-1 text-sm font-medium text-indigo-300 transition hover:text-indigo-200"
          >
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {library.items.length > 0 ? (
          <div className="space-y-2">
            {library.items.slice(0, 3).map((course) => (
              <button
                key={course.id}
                onClick={() => library.onOpenCourse(course.id)}
                className="flex w-full items-center gap-3 rounded-lg bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.05]"
              >
                <img
                  src={course.image}
                  alt=""
                  className="h-12 w-16 rounded-lg object-cover"
                  onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{course.title}</p>
                  <p className="text-xs text-white/50">Owned</p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/40" />
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-white/[0.02] p-4 text-center">
            <p className="text-sm text-white/60">No courses yet</p>
            <button
              onClick={library.onOpenPurchases}
              className="mt-2 text-sm font-medium text-indigo-300 transition hover:text-indigo-200"
            >
              Browse courses
            </button>
          </div>
        )}
        </ProfileCard>

      {/* Quick Actions */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProfileCard data-profile-usage-card contentClassName="p-4">
          <button
            type="button"
            onClick={onOpenUsageLimits}
            className="flex min-h-14 w-full items-center gap-3 text-left"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/25">
              <Gauge className="h-4 w-4" />
            </span>
            <span>
              <span className="block dc-profile-card-title">Usage Limits</span>
              <span className="mt-0.5 block dc-profile-card-meta">View quotas and reset details</span>
            </span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-white/45" />
          </button>
        </ProfileCard>

        {referral && (
          <ProfileCard data-profile-referral-card contentClassName="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Ticket className="h-4 w-4 text-amber-300" />
              <h3 className="dc-profile-card-title">Referral Code</h3>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate font-mono text-sm text-white">
                {referral.code}
              </code>
              <button
                type="button"
                onClick={referral.onCopy}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.09]"
              >
                Copy
              </button>
            </div>
          </ProfileCard>
        )}
      </div>

      {/* Account */}
      <ProfileCard data-profile-account-card contentClassName="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/20 text-emerald-300">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Account</h3>
            <p className="text-xs text-white/60">{email}</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full rounded-lg border border-rose-400/30 bg-rose-500/10 py-2.5 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20"
        >
          <span className="flex items-center justify-center gap-2">
            <LogOut className="h-4 w-4" />
            Log Out
          </span>
        </button>

        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-white/50">
          <a href="/privacy-policy.html" className="transition hover:text-white/70">
            Privacy Policy
          </a>
          <span>·</span>
          <a href="/terms-of-service.html" className="transition hover:text-white/70">
            Terms of Service
          </a>
        </div>

        {isAdmin && (
          <button
            onClick={onOpenDashboard}
            className="mt-3 block w-full text-center text-xs text-white/40 transition hover:text-white/60"
          >
            Open Dashboard
          </button>
        )}
      </ProfileCard>
    </div>
  );
}

/* ── Modals (shared with SettingsPage) ──────────────────────────────── */
export function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent aria-label={title} className="max-h-[90dvh] max-w-lg overflow-y-auto text-white">
        <div className="mb-5 flex items-center justify-between">
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <GlassButton onClick={onClose} aria-label="Close" className="[&_.size-12]:size-9">
            <X size={17} />
          </GlassButton>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function PreferenceRow({ icon, label, checked, onChange }: { icon: ReactNode; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-white">{label}</span>
      <GlassSwitch
        checked={checked}
        onCheckedChange={onChange}
        ariaLabel={label}
        data-on={checked ? "true" : "false"}
        className="dc-switch shrink-0"
      />
    </div>
  );
}

export function EditModal({
  user,
  onClose,
  onSave,
}: {
  user: { name: string; email: string; mobile?: string | null; bio?: string | null };
  onClose: () => void;
  onSave: (details: { name: string; mobile: string; bio: string }) => Promise<boolean>;
}) {
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
  
  const INPUT = "w-full rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30";
  
  return (
    <BaseModal title="Edit Profile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/70">Full name</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/70">Email address</label>
          <input className={INPUT} value={user.email} disabled />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/70">Mobile number</label>
          <input className={INPUT} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10 digit number" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/70">Bio</label>
          <textarea className={INPUT} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 240))} rows={3} placeholder="Tell learners about yourself" />
        </div>
        {error && <p className="rounded-lg bg-rose-500/15 p-3 text-sm text-rose-200">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </BaseModal>
  );
}
