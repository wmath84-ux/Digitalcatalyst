import { GlassSwitch } from "../components/ui/glass-switch";
import { ProfileCard } from "./ProfileCard";
import { GlassButton } from "../components/ui/glass-button";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/glass-dialog";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Boxes,
  CalendarDays,
  Camera,
  ChevronRight,
  Crown,
  Gauge,
  Heart,
  Layers,
  LoaderCircle,
  LogOut,
  Pencil,
  Rocket,
  Save,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
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
};

export const TIER_LABELS: Record<MembershipTier, string> = {
  normal: "Free learner",
  basic: "Basic",
  premium: "Premium",
  pro: "Pro",
};

export const PLAN_LABELS: Record<MembershipTier, string> = {
  normal: "Free plan",
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

/* ── Design tokens ───────────────────────────────────────────────────── */
const BTN = "[&>span>div]:h-10 [&>span>div]:px-4 [&_span]:text-xs [&_span]:font-semibold";
const BTN_PRIMARY = `w-full [&>span>div]:w-full ${BTN}`;
const BTN_SECONDARY = `w-full [&>span>div]:w-full ${BTN}`;
const BTN_SMALL = "[&>span>div]:h-9 [&>span>div]:px-3.5 [&_span]:text-[11px] [&_span]:font-semibold";
const ICON_CHIP = "grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1";

const INPUT =
  "dc-field w-full rounded-full border border-white/10 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 disabled:text-white/55";

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
  membershipBadge?: ReactNode;
  onOpenPlans: () => void;
  onOpenSubscriberExperience: () => void;

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

  /** Opens the dedicated page that owns the personal allowance cards. */
  onOpenUsageLimits: () => void;
  onOpenStudyLibrary: () => void;

  library: {
    items: { id: string; title: string; image: string }[];
    ownedCount: number;
    onOpenCourse: (id: string) => void;
    onOpenPurchases: () => void;
  };

  cleanBackgroundEnabled: boolean;
  onCleanBackgroundChange: (enabled: boolean) => void;
  onOpenSettings: () => void;
  saving: boolean;
  message?: string;
  onLogout: () => void;
  isAdmin: boolean;
  onOpenDashboard: () => void;
};

/* ── Layout ─────────────────────────────────────────────────────────── */
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
  membershipBadge,
  onOpenPlans,
  onOpenSubscriberExperience,
  stats,
  referral,
  renewal,
  onOpenUsageLimits,
  onOpenStudyLibrary,
  library,
  cleanBackgroundEnabled,
  onCleanBackgroundChange,
  onOpenSettings,
  saving,
  message,
  onLogout,
  isAdmin,
  onOpenDashboard,
}: ProfileLayoutProps) {
  return (
    <div data-profile-layout className="space-y-4">
      {/* ── Page Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-0.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="dc-scene-ink dc-profile-title truncate font-bold text-white">Profile</h1>
          {membershipBadge}
        </div>
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin text-violet-300" /> : null}
      </header>

      {message ? (
        <div role="status" className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-200">
          {message}
        </div>
      ) : null}

      {/* ── Identity & Quick Stats Card ── */}
      <ProfileHero
        name={name}
        email={email}
        photoURL={photoURL}
        bio={bio}
        initials={initials}
        memberSince={memberSince}
        planLabel={membership.subscriber ? membership.planLabel : PLAN_LABELS.normal}
        onEdit={onEdit}
        onChoosePhoto={onChoosePhoto}
        photoUploading={photoUploading}
        photoError={photoError}
        stats={stats}
      />

      {/* ── 2-Column Responsive Workspace Grid ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-5">
        {/* ── Primary Column: Membership & Usage (col-span-7) ── */}
        <div data-profile-col="main" className="space-y-4 lg:col-span-7">
          {membership.subscriber ? (
            <MembershipCard
              tier={membership.tier}
              active={membership.active}
              tierLabel={membership.tierLabel}
              planLabel={membership.planLabel}
              subscription={membership.subscription}
              renewal={renewal}
              onOpenPlans={onOpenPlans}
              onOpenUsageLimits={onOpenUsageLimits}
            />
          ) : (
            <UpgradeCard
              onOpenPlans={onOpenPlans}
              onOpenSubscriberExperience={onOpenSubscriberExperience}
              onOpenUsageLimits={onOpenUsageLimits}
            />
          )}

          {/* ── Learning Hub & Enrolled Courses Card ── */}
          <LearningCard
            onOpenStudyLibrary={onOpenStudyLibrary}
            items={library.items}
            ownedCount={library.ownedCount}
            onOpenCourse={library.onOpenCourse}
            onOpenPurchases={library.onOpenPurchases}
          />
        </div>

        {/* ── Side Column: Preferences, Referral & Account (col-span-5) ── */}
        <div data-profile-col="side" className="space-y-4 lg:col-span-5">
          <PreferencesHubCard
            cleanBackgroundEnabled={cleanBackgroundEnabled}
            onCleanBackgroundChange={onCleanBackgroundChange}
            onOpenSettings={onOpenSettings}
            referral={referral}
          />

          <div className="space-y-3 pt-1">
            <GlassButton
              variant="capsule"
              onClick={onLogout}
              className="w-full text-rose-300 [&>span>div]:w-full [&>span>div]:ring-1 [&>span>div]:ring-rose-400/30 [&_span]:text-sm [&_span]:font-semibold"
            >
              <span className="inline-flex items-center gap-2 text-rose-300">
                <LogOut size={16} /> Log out
              </span>
            </GlassButton>

            <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium text-white/70">
              <a href="/privacy-policy.html" className="dc-scene-ink transition hover:text-violet-300 hover:underline">
                Privacy Policy
              </a>
              <span aria-hidden="true" className="text-white/40">·</span>
              <a href="/terms-of-service.html" className="dc-scene-ink transition hover:text-violet-300 hover:underline">
                Terms of Service
              </a>
            </nav>

            {isAdmin ? (
              <button
                type="button"
                data-profile-open-dashboard
                onClick={onOpenDashboard}
                className="mx-auto block text-[9px] font-medium tracking-wide text-white/55 transition hover:text-white/80"
              >
                Open dashboard
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Profile Hero (Identity + Quick Stats) ──────────────────────────── */
function ProfileHero({
  name,
  email,
  photoURL,
  bio,
  initials,
  memberSince,
  planLabel,
  onEdit,
  onChoosePhoto,
  photoUploading,
  photoError,
  stats,
}: {
  name: string;
  email: string;
  photoURL?: string;
  bio?: string;
  initials: string;
  memberSince: string;
  planLabel: string;
  onEdit: () => void;
  onChoosePhoto?: () => void;
  photoUploading: boolean;
  photoError?: string;
  stats: ProfileLayoutProps["stats"];
}) {
  const src = profilePhotoSrc(photoURL);
  const [brokenPhoto, setBrokenPhoto] = useState("");
  const showPhoto = Boolean(src) && src !== brokenPhoto;

  return (
    <ProfileCard data-profile-hero className="relative overflow-hidden border border-white/10">
      {/* Top identity banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5 sm:gap-4">
          <div className="shrink-0 text-center">
            <button
              type="button"
              onClick={onChoosePhoto}
              disabled={!onChoosePhoto || photoUploading}
              aria-label={photoURL ? "Change profile photo" : "Add profile photo"}
              title={photoURL ? "Change photo" : "Add photo"}
              className="group relative block rounded-full p-[2px] ring-2 ring-indigo-400/40 ring-offset-2 ring-offset-slate-950 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-default"
              data-profile-photo-upload
            >
              {showPhoto ? (
                <img
                  src={src}
                  alt=""
                  decoding="async"
                  width={64}
                  height={64}
                  className="h-14 w-14 rounded-full object-cover sm:h-16 sm:w-16"
                  referrerPolicy="no-referrer"
                  draggable={false}
                  data-profile-photo
                  onError={() => setBrokenPhoto(src)}
                />
              ) : (
                <span
                  className="grid h-14 w-14 place-items-center rounded-full bg-indigo-600 text-lg font-bold text-white sm:h-16 sm:w-16 sm:text-xl"
                  data-profile-photo-fallback
                >
                  {initials}
                </span>
              )}
              {onChoosePhoto ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full border-2 border-slate-950 bg-indigo-500 text-white shadow transition group-hover:bg-indigo-400"
                >
                  {photoUploading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                </span>
              ) : null}
            </button>
            {onChoosePhoto ? (
              <span className="mt-1 block text-[9px] font-semibold text-white/55">
                {photoUploading ? "Uploading…" : photoURL ? "Change photo" : "Add photo"}
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-bold tracking-tight text-white sm:text-lg md:text-xl">{name}</h2>
            </div>
            <p className="dc-profile-card-meta mt-0.5 truncate text-white/70">{email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                data-profile-plan-label
                className="dc-profile-card-accent inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-indigo-400/30"
              >
                <BadgeCheck className="h-3 w-3 text-indigo-300" /> {planLabel}
              </span>
              <span aria-hidden="true" className="text-[10px] text-white/40">·</span>
              <span className="dc-profile-card-meta inline-flex items-center gap-1 text-white/60">
                <CalendarDays className="h-3 w-3 text-white/50" /> Since {memberSince}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end">
          <GlassButton onClick={onEdit} aria-label="Edit profile" className="shrink-0 [&_.size-12]:size-9">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <Pencil size={14} />
              <span className="hidden sm:inline">Edit</span>
            </span>
          </GlassButton>
        </div>
      </div>

      {photoError ? (
        <p role="alert" data-profile-photo-error className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-200">
          {photoError}
        </p>
      ) : null}

      {bio ? (
        <div className="mt-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
          <p className="dc-profile-card-note line-clamp-2 text-white/80">{bio}</p>
        </div>
      ) : null}

      {/* Integrated Quick Stats */}
      <div className="mt-4 border-t border-white/[0.08] pt-3.5" data-profile-stats>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <QuickStat
            icon={<ShoppingBag className="h-4 w-4" />}
            value={stats.ownedCount}
            label="Purchased"
            tone="bg-indigo-500/15 text-indigo-300 ring-indigo-400/30"
            onClick={stats.onOpenPurchases}
          />
          <QuickStat
            icon={<Heart className="h-4 w-4" />}
            value={stats.favoriteCount}
            label="Favorites"
            tone="bg-rose-500/15 text-rose-400 ring-rose-400/30"
            onClick={stats.onOpenFavorites}
          />
          <QuickStat
            icon={<Boxes className="h-4 w-4" />}
            value={stats.cartCount}
            label="In cart"
            tone="bg-amber-500/15 text-amber-300 ring-amber-400/30"
            onClick={stats.onOpenCart}
          />
        </div>
      </div>
    </ProfileCard>
  );
}

/* ── Membership Card (Subscriber) ───────────────────────────────────── */
function MembershipCard({
  tier,
  active,
  tierLabel,
  planLabel,
  subscription,
  renewal,
  onOpenPlans,
  onOpenUsageLimits,
}: {
  tier: MembershipTier;
  active: boolean;
  tierLabel: string;
  planLabel: string;
  subscription: SubscriptionSnapshot | null;
  renewal: ProfileLayoutProps["renewal"];
  onOpenPlans: () => void;
  onOpenUsageLimits: () => void;
}) {
  const snapshot = renewal?.subscription || subscription;
  const now = renewal?.now || Date.now();
  const expired = !active;
  const daysRemaining = snapshot && snapshot.expiresAt > now
    ? Math.max(1, Math.ceil((snapshot.expiresAt - now) / 86400000))
    : 0;
  const totalDays = snapshot?.cycle === "yearly" ? 365 : 30;
  const progress = snapshot && snapshot.expiresAt > 0
    ? Math.max(0, Math.min(100, Math.round((daysRemaining / totalDays) * 100)))
    : 0;

  return (
    <ProfileCard data-profile-membership-tier={tier}
      data-profile-membership-card
      data-renewal-card
      data-stage={expired ? "expired" : "active"}
      className="relative overflow-hidden border border-white/10"
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${
            active ? "bg-indigo-500/15 text-indigo-300 ring-indigo-400/30" : "bg-rose-500/15 text-rose-300 ring-rose-400/30"
          }`}
        >
          {TIER_ICONS[tier]}
        </span>

        <div className="min-w-0 flex-1">
          <h3 data-renewal-card-headline className="dc-profile-card-title truncate text-base font-bold text-white">
            {tierLabel} membership
          </h3>
          <p className="dc-profile-card-meta mt-0.5 truncate text-white/70">
            {planLabel}
            {snapshot ? ` · ${cycleLabel(snapshot.cycle)} billing` : ""}
          </p>
        </div>

        <span
          data-profile-plan-status={active ? "active" : "expired"}
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${
            active ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30" : "bg-rose-500/15 text-rose-300 ring-rose-400/30"
          }`}
        >
          {active ? "Active" : "Expired"}
        </span>
      </div>

      {snapshot ? (
        <div className="mt-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="dc-profile-card-meta flex items-center justify-between gap-2 text-xs font-medium">
            <span data-renewal-expiry className="truncate text-white/80">
              {expired ? `Ended ${formatDate(snapshot.expiresAt)}` : `Access until ${formatDate(snapshot.expiresAt)}`}
            </span>
            <span data-renewal-remaining className="shrink-0 font-semibold text-indigo-300">
              {expired ? "Renew to continue" : `${daysRemaining} days left`}
            </span>
          </div>
          {expired ? null : (
            <div className="dc-profile-bar mt-2">
              <span data-renewal-progress style={{ width: `${Math.max(4, progress)}%` }} />
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-3.5 flex items-center gap-2">
        <GlassButton variant="capsule" onClick={onOpenPlans} className={BTN_PRIMARY}>
          {active ? "Manage subscription" : "Renew subscription"} <ArrowRight className="h-3.5 w-3.5" />
        </GlassButton>
        {snapshot && renewal ? (
          <GlassButton
            variant="capsule"
            data-renewal-reminder-toggle
            onClick={() => renewal.onToggleReminders(!snapshot.reminderOptOut)}
            className={`shrink-0 ${BTN_SMALL}`}
          >
            {snapshot.reminderOptOut ? "Reminders off" : "Reminders on"}
          </GlassButton>
        ) : null}
      </div>

      {/* Integrated Usage Limits Link */}
      <div data-profile-usage-limits-link className="mt-3 border-t border-white/[0.08] pt-3">
        <button
          type="button"
          onClick={onOpenUsageLimits}
          className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          <span className={`${ICON_CHIP} bg-indigo-500/15 text-indigo-200 ring-indigo-400/30`}>
            <Gauge size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="dc-profile-card-title block">Usage limits</span>
            <span className="dc-profile-card-meta mt-0.5 block">View personal quotas and reset details</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" />
        </button>
      </div>

      <p className="dc-profile-card-meta mt-2.5 flex items-center gap-1.5 text-white/60">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-indigo-300" /> Renewal is manual and secure — no automatic charge.
      </p>
    </ProfileCard>
  );
}

/* ── Upgrade Card (Free Learner) ────────────────────────────────────── */
function UpgradeCard({
  onOpenPlans,
  onOpenSubscriberExperience,
  onOpenUsageLimits,
}: {
  onOpenPlans: () => void;
  onOpenSubscriberExperience: () => void;
  onOpenUsageLimits: () => void;
}) {
  return (
    <ProfileCard data-profile-upgrade-card className="relative overflow-hidden border border-white/10">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white ring-1 ring-indigo-400/40">
          <Rocket className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="dc-profile-card-title truncate text-base font-bold text-white">Free plan</h3>
          <p className="dc-profile-card-meta mt-0.5 text-white/70">Subscriber plans unlock more practice, notes and My Day.</p>
        </div>
      </div>

      <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
        <GlassButton variant="capsule" onClick={onOpenPlans} className={BTN_PRIMARY}>
          Explore plans <ArrowRight className="h-3.5 w-3.5" />
        </GlassButton>
        <GlassButton
          variant="capsule"
          onClick={onOpenSubscriberExperience}
          data-subscriber-experience-cta
          className={BTN_SECONDARY}
        >
          Subscriber experience
        </GlassButton>
      </div>

      {/* Integrated Usage Limits Link */}
      <div data-profile-usage-limits-link className="mt-3 border-t border-white/[0.08] pt-3">
        <button
          type="button"
          onClick={onOpenUsageLimits}
          className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          <span className={`${ICON_CHIP} bg-indigo-500/15 text-indigo-200 ring-indigo-400/30`}>
            <Gauge size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="dc-profile-card-title block">Usage limits</span>
            <span className="dc-profile-card-meta mt-0.5 block">View personal quotas and reset details</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" />
        </button>
      </div>
    </ProfileCard>
  );
}

/* ── Learning Hub Card (Study Library + Course Shelf) ───────────────── */
function LearningCard({
  onOpenStudyLibrary,
  items,
  ownedCount,
  onOpenCourse,
  onOpenPurchases,
}: {
  onOpenStudyLibrary: () => void;
  items: { id: string; title: string; image: string }[];
  ownedCount: number;
  onOpenCourse: (id: string) => void;
  onOpenPurchases: () => void;
}) {
  return (
    <ProfileCard data-profile-study-library className="relative overflow-hidden border border-white/10">
      {/* Study Library Section */}
      <div className="flex items-center gap-3">
        <span className={`${ICON_CHIP} bg-cyan-500/15 text-cyan-200 ring-cyan-400/30`}>
          <Boxes className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="dc-profile-card-title truncate text-base font-bold text-white">My Study Library</h3>
          <p className="dc-profile-card-meta mt-0.5 truncate text-white/70">Your modules, saved items and recent resources.</p>
        </div>
      </div>

      <GlassButton variant="capsule" onClick={onOpenStudyLibrary} className={`mt-3 text-cyan-100 ${BTN_PRIMARY}`}>
        <span className="inline-flex items-center gap-2">
          Open Study Library <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </GlassButton>

      {/* Courses Section */}
      <div className="my-4 border-t border-white/[0.08]" />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="dc-profile-card-title truncate text-sm font-semibold text-white">Your courses</h3>
          {items.length > 0 ? (
            <p className="dc-profile-card-meta mt-0.5 text-white/60">{ownedCount} course{ownedCount === 1 ? "" : "s"}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onOpenPurchases}
          className="shrink-0 text-xs font-semibold text-indigo-300 transition hover:text-indigo-200"
        >
          View all
        </button>
      </div>

      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.slice(0, 3).map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onOpenCourse(product.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2 text-left transition hover:bg-white/[0.05] active:scale-[0.99]"
            >
              <img
                src={product.image}
                alt=""
                loading="lazy"
                decoding="async"
                width={64}
                height={48}
                className="h-11 w-14 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                referrerPolicy="no-referrer"
                onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
              />
              <span className="min-w-0 flex-1">
                <span className="dc-profile-card-title block truncate">{product.title}</span>
                <span className="dc-profile-card-meta block text-white/60">Owned</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-white/40" />
            </button>
          ))}
        </div>
      ) : (
        <p className="dc-profile-card-meta mt-2 text-white/60">
          Nothing owned yet — find a course in the store to start your library.
        </p>
      )}
    </ProfileCard>
  );
}

/* ── Preferences, Referral & Settings Hub ───────────────────────────── */
function PreferencesHubCard({
  cleanBackgroundEnabled,
  onCleanBackgroundChange,
  onOpenSettings,
  referral,
}: {
  cleanBackgroundEnabled: boolean;
  onCleanBackgroundChange: (enabled: boolean) => void;
  onOpenSettings: () => void;
  referral: ProfileLayoutProps["referral"];
}) {
  return (
    <ProfileCard className="relative overflow-hidden border border-white/10">
      {/* Clean Background Toggle */}
      <div data-profile-background-preference className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30">
          <Layers size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="dc-profile-card-title block font-semibold text-white">Clean background</span>
          <span className="dc-profile-card-meta block text-white/70">
            {cleanBackgroundEnabled ? "On · snowfall off" : "Off · snowfall on"}
          </span>
        </span>
        <GlassSwitch
          checked={cleanBackgroundEnabled}
          onCheckedChange={onCleanBackgroundChange}
          ariaLabel="Clean background"
          data-on={cleanBackgroundEnabled ? "true" : "false"}
          className="dc-switch shrink-0"
        />
      </div>

      {/* Notifications & Privacy */}
      <div className="my-3.5 border-t border-white/[0.08]" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30">
            <Bell size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <h3 className="dc-profile-card-title truncate font-semibold text-white">Notifications &amp; privacy</h3>
            <span className="dc-profile-card-meta block truncate text-white/70">Push, email &amp; learning preferences</span>
          </span>
        </div>
        <GlassButton
          onClick={onOpenSettings}
          className="shrink-0 [&_.size-12]:size-9 [&_svg]:text-indigo-300"
          aria-label="Open preferences"
        >
          <ChevronRight size={16} />
        </GlassButton>
      </div>

      {/* Referral Code (if available) */}
      {referral ? (
        <div data-profile-referral className="mt-3.5 border-t border-white/[0.08] pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="dc-profile-card-meta text-white/70">Your referral code</p>
              <code className={`mt-0.5 block truncate text-sm font-bold ${referral.used ? "text-white/60 line-through decoration-2 decoration-rose-400" : "text-white"}`}>
                {referral.code}
              </code>
            </div>
            {referral.used ? (
              <span data-profile-referral-used className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Used</span>
            ) : (
              <GlassButton variant="capsule" onClick={referral.onCopy} className={`shrink-0 ${BTN_SMALL}`}>
                Copy
              </GlassButton>
            )}
          </div>
          {referral.used ? <p className="dc-profile-card-meta mt-1.5 text-white/60">This referral ID is no longer active.</p> : null}
        </div>
      ) : null}
    </ProfileCard>
  );
}

/* ── Small Building Blocks ──────────────────────────────────────────── */
function QuickStat({
  icon,
  value,
  label,
  tone,
  onClick,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-center transition hover:bg-white/[0.05] active:scale-[0.97]"
    >
      <span className={`grid h-8 w-8 place-items-center rounded-lg ring-1 transition group-hover:scale-105 ${tone}`}>{icon}</span>
      <span className="dc-profile-card-value mt-1.5 block text-base font-bold text-white group-hover:text-indigo-200">{value}</span>
      <span className="dc-profile-card-meta block text-[10px] text-white/70">{label}</span>
    </button>
  );
}

/* ── Modals (shared) ────────────────────────────────────────────────── */
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
        {error && <p className="rounded-xl bg-rose-500/15 p-3 text-sm font-semibold text-rose-200">{error}</p>}
        <GlassButton variant="capsule" type="submit" disabled={saving} className="w-full [&>span>div]:w-full disabled:opacity-60">
          <span className="inline-flex items-center gap-2">
            {saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />} {saving ? "Saving…" : "Save changes"}
          </span>
        </GlassButton>
      </form>
    </BaseModal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-white/70">{label}</span>
      {children}
    </label>
  );
}
