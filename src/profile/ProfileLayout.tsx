import { GlassSwitch } from "../components/ui/glass-switch";
import { ProfileCard } from "./ProfileCard";
import { GlassButton } from "../components/ui/glass-button";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/glass-dialog";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BookOpen,
  Boxes,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Crown,
  Gauge,
  Heart,
  Layers,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Rocket,
  Save,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  UserCheck,
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
  normal: <Crown className="h-5 w-5" />,
  basic: <Crown className="h-5 w-5" />,
  premium: <Sparkles className="h-5 w-5" />,
  pro: <Zap className="h-5 w-5" />,
};

/* ── Design tokens ───────────────────────────────────────────────────── */
const BTN = "[&>span>div]:h-10 [&>span>div]:px-4 [&_span]:text-xs [&_span]:font-semibold";
const BTN_PRIMARY = `w-full [&>span>div]:w-full ${BTN}`;
const BTN_SECONDARY = `w-full [&>span>div]:w-full ${BTN}`;
const BTN_SMALL = "[&>span>div]:h-9 [&>span>div]:px-3.5 [&_span]:text-[11px] [&_span]:font-semibold";
const ICON_CHIP = "grid h-10 w-10 shrink-0 place-items-center rounded-2xl ring-1";

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

  onOpenSettings: () => void;
  saving: boolean;
  message?: string;
  onLogout: () => void;
  isAdmin: boolean;
  onOpenDashboard: () => void;
};

/* ── Complete From-Scratch Profile Workspace Layout ─────────────────── */
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
  onOpenSettings,
  saving,
  message,
  onLogout,
  isAdmin,
  onOpenDashboard,
}: ProfileLayoutProps) {
  return (
    <div data-profile-layout>
      {/* ── Top Workspace Command Bar ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-0.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30">
            <UserCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="dc-scene-ink dc-profile-title truncate font-bold text-white">Profile</h1>
              {membershipBadge}
            </div>
            <p className="dc-profile-card-meta truncate">Identity, membership &amp; learning workspace</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {saving ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[10px] font-semibold text-violet-200">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-violet-300" />
              <span>Syncing</span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={onOpenUsageLimits}
            className="dc-profile-tile hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-indigo-200 sm:inline-flex"
          >
            <Gauge className="h-3.5 w-3.5 text-indigo-300" />
            <span>Quotas</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="dc-profile-tile inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white/85"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-300" />
            <span>Preferences</span>
          </button>
        </div>
      </header>

      {message ? (
        <div role="status" className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-200">
          {message}
        </div>
      ) : null}

      {/* ── Executive Identity & Metrics Bento Hero (spans full width) ── */}
      <ProfileHero
        name={name}
        email={email}
        photoURL={photoURL}
        bio={bio}
        initials={initials}
        memberSince={memberSince}
        planLabel={membership.subscriber ? membership.planLabel : PLAN_LABELS.normal}
        subscriber={membership.subscriber}
        active={membership.active}
        onEdit={onEdit}
        onChoosePhoto={onChoosePhoto}
        photoUploading={photoUploading}
        photoError={photoError}
        stats={stats}
      />

      {/* ── Primary Workspace Column (7/12 on Desktop & Tablet Landscape, Left on Tablet Portrait) ── */}
      <div data-profile-col="main">
        {membership.subscriber ? (
          <MembershipCard
            tier={membership.tier}
            active={membership.active}
            tierLabel={membership.tierLabel}
            planLabel={membership.planLabel}
            subscription={membership.subscription}
            renewal={renewal}
            onOpenPlans={onOpenPlans}
          />
        ) : (
          <UpgradeCard
            onOpenPlans={onOpenPlans}
            onOpenSubscriberExperience={onOpenSubscriberExperience}
          />
        )}

        <LearningWorkspaceCard
          onOpenStudyLibrary={onOpenStudyLibrary}
          items={library.items}
          ownedCount={library.ownedCount}
          onOpenCourse={library.onOpenCourse}
          onOpenPurchases={library.onOpenPurchases}
        />
      </div>

      {/* ── Secondary Workspace Column (5/12 on Desktop & Tablet Landscape, Right on Tablet Portrait) ── */}
      <div data-profile-col="side">
        <UsageQuotasLaunchpadCard onOpenUsageLimits={onOpenUsageLimits} />

        <PreferencesAndReferralCard
          onOpenSettings={onOpenSettings}
          referral={referral}
        />

        <AccountSessionCard
          email={email}
          onLogout={onLogout}
          isAdmin={isAdmin}
          onOpenDashboard={onOpenDashboard}
        />
      </div>
    </div>
  );
}

/* ── 1. Executive Identity & Metrics Bento Hero ─────────────────────── */
function ProfileHero({
  name,
  email,
  photoURL,
  bio,
  initials,
  memberSince,
  planLabel,
  subscriber,
  active,
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
  subscriber: boolean;
  active: boolean;
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
    <ProfileCard data-profile-hero
      className="relative overflow-hidden"
      contentClassName="p-4 sm:p-5 lg:p-6"
    >
      {/* Top Identity Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5 sm:gap-4 min-w-0 flex-1">
          {/* Interactive Avatar Studio */}
          <div className="shrink-0 text-center">
            <button
              type="button"
              onClick={onChoosePhoto}
              disabled={!onChoosePhoto || photoUploading}
              aria-label={photoURL ? "Change profile photo" : "Add profile photo"}
              title={photoURL ? "Change photo" : "Add photo"}
              className="group relative block rounded-full p-[3px] ring-2 ring-indigo-400/45 transition hover:ring-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-default"
              data-profile-photo-upload
            >
              {showPhoto ? (
                <img
                  src={src}
                  alt=""
                  decoding="async"
                  width={72}
                  height={72}
                  className="h-16 w-16 rounded-full object-cover sm:h-[72px] sm:w-[72px]"
                  referrerPolicy="no-referrer"
                  draggable={false}
                  data-profile-photo
                  onError={() => setBrokenPhoto(src)}
                />
              ) : (
                <span
                  className="grid h-16 w-16 place-items-center rounded-full bg-indigo-600 text-xl font-bold text-white sm:h-[72px] sm:w-[72px] sm:text-2xl"
                  data-profile-photo-fallback
                >
                  {initials}
                </span>
              )}
              {onChoosePhoto ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full border-2 border-slate-950 bg-indigo-500 text-white shadow transition group-hover:scale-105 group-hover:bg-indigo-400"
                >
                  {photoUploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                </span>
              ) : null}
            </button>
            {onChoosePhoto ? (
              <span className="mt-1.5 block text-[10px] font-semibold text-indigo-200/80">
                {photoUploading ? "Uploading…" : photoURL ? "Change photo" : "Add photo"}
              </span>
            ) : null}
          </div>

          {/* Identity Details */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-profile-plan-label
                className="dc-profile-card-accent inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-indigo-400/35"
              >
                <BadgeCheck className="h-3.5 w-3.5 text-indigo-300" />
                <span>{planLabel}</span>
              </span>
              <span className="dc-profile-card-meta inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5">
                <CalendarDays className="h-3 w-3 text-indigo-300/80" />
                <span>Since {memberSince}</span>
              </span>
              {subscriber ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
                    active
                      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                      : "bg-rose-500/15 text-rose-200 ring-rose-400/30"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-rose-400"}`} />
                  {active ? "Verified Member" : "Plan Expired"}
                </span>
              ) : null}
            </div>

            <h2 className="mt-2 truncate text-lg font-bold tracking-tight text-white sm:text-xl lg:text-2xl">
              {name}
            </h2>

            <p className="dc-profile-card-meta mt-0.5 flex items-center gap-1.5 truncate">
              <Mail className="h-3.5 w-3.5 shrink-0 text-indigo-300/75" aria-hidden="true" />
              <span className="truncate">{email}</span>
            </p>

            {bio ? (
              <div className="dc-profile-subpanel mt-3 px-3.5 py-2.5">
                <p className="dc-profile-card-note line-clamp-2">{bio}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={onEdit}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300/85 transition hover:text-indigo-200"
              >
                <Pencil className="h-3 w-3" />
                <span>Add a short bio to personalize your profile</span>
              </button>
            )}
          </div>
        </div>

        {/* Edit Profile Action */}
        <div className="flex shrink-0 items-center justify-end self-end sm:self-start">
          <GlassButton
            variant="capsule"
            onClick={onEdit}
            aria-label="Edit profile"
            className={`shrink-0 ${BTN_SMALL}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Pencil size={13} />
              <span>Edit profile</span>
            </span>
          </GlassButton>
        </div>
      </div>

      {photoError ? (
        <p role="alert" data-profile-photo-error className="mt-3.5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-200">
          {photoError}
        </p>
      ) : null}

      {/* Integrated 3-Tile Bento Quick Stats Strip */}
      <div
        data-profile-stats
        className="mt-5 grid grid-cols-3 gap-2.5 border-t border-white/[0.08] pt-4 sm:gap-3.5"
      >
        <QuickStatTile
          icon={<ShoppingBag className="h-4 w-4" />}
          value={stats.ownedCount}
          label="Purchased"
          caption="Owned courses"
          tone="bg-indigo-500/15 text-indigo-300 ring-indigo-400/30"
          onClick={stats.onOpenPurchases}
        />
        <QuickStatTile
          icon={<Heart className="h-4 w-4" />}
          value={stats.favoriteCount}
          label="Favorites"
          caption="Saved items"
          tone="bg-rose-500/15 text-rose-300 ring-rose-400/30"
          onClick={stats.onOpenFavorites}
        />
        <QuickStatTile
          icon={<Boxes className="h-4 w-4" />}
          value={stats.cartCount}
          label="In cart"
          caption="Ready to buy"
          tone="bg-amber-500/15 text-amber-300 ring-amber-400/30"
          onClick={stats.onOpenCart}
        />
      </div>
    </ProfileCard>
  );
}

/* ── 2A. Membership & Subscription Command Center (Subscriber) ──────── */
function MembershipCard({
  tier,
  active,
  tierLabel,
  planLabel,
  subscription,
  renewal,
  onOpenPlans,
}: {
  tier: MembershipTier;
  active: boolean;
  tierLabel: string;
  planLabel: string;
  subscription: SubscriptionSnapshot | null;
  renewal: ProfileLayoutProps["renewal"];
  onOpenPlans: () => void;
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
      className="relative overflow-hidden"
      contentClassName="p-4 sm:p-5"
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`${ICON_CHIP} ${
              active
                ? "bg-indigo-500/20 text-indigo-200 ring-indigo-400/35"
                : "bg-rose-500/20 text-rose-200 ring-rose-400/35"
            }`}
          >
            {TIER_ICONS[tier]}
          </span>
          <div className="min-w-0">
            <p className="dc-profile-card-accent uppercase tracking-wider">Membership &amp; Billing</p>
            <h3 data-renewal-card-headline className="dc-profile-card-title mt-0.5 truncate text-base font-bold text-white">
              {tierLabel} membership
            </h3>
            <p className="dc-profile-card-meta mt-0.5 truncate">
              {planLabel}
              {snapshot ? ` · ${cycleLabel(snapshot.cycle)} billing` : ""}
            </p>
          </div>
        </div>

        <span
          data-profile-plan-status={active ? "active" : "expired"}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${
            active
              ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
              : "bg-rose-500/15 text-rose-300 ring-rose-400/30"
          }`}
        >
          {active ? "Active" : "Expired"}
        </span>
      </div>

      {/* Subscription Timeline & Progress Telemetry Box */}
      {snapshot ? (
        <div className="dc-profile-subpanel mt-4 p-3.5">
          <div className="grid grid-cols-2 gap-2.5 pb-3 border-b border-white/[0.06] sm:grid-cols-3">
            <div>
              <span className="dc-profile-card-meta block">Active Plan</span>
              <span className="dc-profile-card-title mt-0.5 block truncate">{planLabel}</span>
            </div>
            <div>
              <span className="dc-profile-card-meta block">Billing Cycle</span>
              <span className="dc-profile-card-title mt-0.5 block truncate">{cycleLabel(snapshot.cycle)}</span>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="dc-profile-card-meta block">Renewal Policy</span>
              <span className="dc-profile-card-title mt-0.5 block truncate text-emerald-200">Manual control</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span data-renewal-expiry className="dc-profile-card-meta flex items-center gap-1.5 truncate text-white/85">
              <Clock3 className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
              <span>{expired ? `Ended ${formatDate(snapshot.expiresAt)}` : `Access until ${formatDate(snapshot.expiresAt)}`}</span>
            </span>
            <span data-renewal-remaining className="dc-profile-card-accent shrink-0 font-bold">
              {expired ? "Renew to continue" : `${daysRemaining} days left`}
            </span>
          </div>

          {expired ? null : (
            <div className="dc-profile-bar mt-2.5">
              <span data-renewal-progress style={{ width: `${Math.max(4, progress)}%` }} />
            </div>
          )}
        </div>
      ) : null}

      {/* Primary Action Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <GlassButton variant="capsule" onClick={onOpenPlans} className={BTN_PRIMARY}>
          <span className="inline-flex items-center gap-2">
            <span>{active ? "Manage subscription" : "Renew subscription"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
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

      <p className="dc-profile-card-meta mt-3 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
        <span>Renewal is manual and secure — no automatic charge.</span>
      </p>
    </ProfileCard>
  );
}

/* ── 2B. Membership Upgrade Showcase (Free Learner) ─────────────────── */
function UpgradeCard({
  onOpenPlans,
  onOpenSubscriberExperience,
}: {
  onOpenPlans: () => void;
  onOpenSubscriberExperience: () => void;
}) {
  return (
    <ProfileCard
      data-profile-upgrade-card
      className="relative overflow-hidden"
      contentClassName="p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`${ICON_CHIP} bg-indigo-600 text-white ring-indigo-400/40`}>
            <Rocket className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="dc-profile-card-accent uppercase tracking-wider">Membership Tier</p>
            <h3 className="dc-profile-card-title mt-0.5 truncate text-base font-bold text-white">Free plan</h3>
            <p className="dc-profile-card-meta mt-0.5">Subscriber plans unlock more practice, notes and My Day.</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80">
          Standard
        </span>
      </div>

      {/* Value Highlights Grid */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="dc-profile-subpanel flex items-center gap-2.5 p-2.5">
          <Zap className="h-4 w-4 shrink-0 text-indigo-300" />
          <div className="min-w-0">
            <span className="dc-profile-card-title block truncate text-xs">Unlimited My Day</span>
            <span className="dc-profile-card-meta block truncate">Tasks &amp; daily notes</span>
          </div>
        </div>
        <div className="dc-profile-subpanel flex items-center gap-2.5 p-2.5">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
          <div className="min-w-0">
            <span className="dc-profile-card-title block truncate text-xs">Higher AI Quotas</span>
            <span className="dc-profile-card-meta block truncate">Expanded token cap</span>
          </div>
        </div>
        <div className="dc-profile-subpanel flex items-center gap-2.5 p-2.5">
          <Layers className="h-4 w-4 shrink-0 text-cyan-300" />
          <div className="min-w-0">
            <span className="dc-profile-card-title block truncate text-xs">Study Packs</span>
            <span className="dc-profile-card-meta block truncate">Full course unlocks</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <GlassButton variant="capsule" onClick={onOpenPlans} className={BTN_PRIMARY}>
          <span className="inline-flex items-center gap-2">
            <span>Explore plans</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
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
    </ProfileCard>
  );
}

/* ── 3. Learning Workspace & Enrolled Courses Hub ───────────────────── */
function LearningWorkspaceCard({
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
    <ProfileCard
      data-profile-study-library
      className="relative overflow-hidden"
      contentClassName="p-4 sm:p-5"
    >
      {/* My Study Library Banner */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`${ICON_CHIP} bg-cyan-500/15 text-cyan-200 ring-cyan-400/35`}>
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="dc-profile-card-accent uppercase tracking-wider">Learning Workspace</p>
            <h3 className="dc-profile-card-title mt-0.5 truncate text-base font-bold text-white">My Study Library</h3>
            <p className="dc-profile-card-meta mt-0.5 truncate">Your modules, saved items and recent resources.</p>
          </div>
        </div>

        <div className="shrink-0">
          <GlassButton variant="capsule" onClick={onOpenStudyLibrary} className={`w-full sm:w-auto ${BTN}`}>
            <span className="inline-flex items-center gap-2 text-cyan-100">
              <span>Open Study Library</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </GlassButton>
        </div>
      </div>

      {/* Enrolled Courses Section */}
      <div className="mt-4 border-t border-white/[0.08] pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="dc-profile-card-title truncate">Your courses</h3>
            <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-200 ring-1 ring-indigo-400/30">
              {ownedCount}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenPurchases}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-indigo-300 transition hover:text-indigo-200"
          >
            <span>View all</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {items.length > 0 ? (
          <div className="mt-3 space-y-2.5">
            {items.slice(0, 3).map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onOpenCourse(product.id)}
                className="dc-profile-tile group flex w-full items-center gap-3 p-2.5 text-left"
              >
                <img
                  src={product.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={68}
                  height={48}
                  className="h-12 w-16 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                  referrerPolicy="no-referrer"
                  onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                />
                <span className="min-w-0 flex-1">
                  <span className="dc-profile-card-title block truncate group-hover:text-indigo-200">
                    {product.title}
                  </span>
                  <span className="dc-profile-card-meta mt-0.5 inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>Owned · Ready to open</span>
                  </span>
                </span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-white/65 transition group-hover:bg-indigo-500/20 group-hover:text-indigo-200">
                  <ChevronRight size={16} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="dc-profile-subpanel mt-3 flex items-center justify-between gap-3 p-3.5">
            <p className="dc-profile-card-meta">
              Nothing owned yet — find a course in the store to start your library.
            </p>
            <button
              type="button"
              onClick={onOpenPurchases}
              className="shrink-0 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-[11px] font-semibold text-indigo-200 transition hover:bg-indigo-500/25"
            >
              Browse
            </button>
          </div>
        )}
      </div>
    </ProfileCard>
  );
}

/* ── 4. Daily Quotas & Usage Limits Launchpad Card ──────────────────── */
function UsageQuotasLaunchpadCard({
  onOpenUsageLimits,
}: {
  onOpenUsageLimits: () => void;
}) {
  return (
    <ProfileCard
      className="relative overflow-hidden"
      contentClassName="p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`${ICON_CHIP} bg-indigo-500/20 text-indigo-200 ring-indigo-400/35`}>
            <Gauge className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="dc-profile-card-accent uppercase tracking-wider">Resource Telemetry</p>
            <h3 className="dc-profile-card-title mt-0.5 truncate text-base font-bold text-white">Usage limits</h3>
            <p className="dc-profile-card-meta mt-0.5 truncate">View personal quotas and reset details</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live
        </span>
      </div>

      {/* 2-Column Quota Preview Strip */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <div className="dc-profile-subpanel p-2.5">
          <span className="dc-profile-card-meta block">My Day Creations</span>
          <span className="dc-profile-card-title mt-0.5 block truncate text-xs">Daily allowance</span>
        </div>
        <div className="dc-profile-subpanel p-2.5">
          <span className="dc-profile-card-meta block">School AI Budget</span>
          <span className="dc-profile-card-title mt-0.5 block truncate text-xs">Token &amp; test meter</span>
        </div>
      </div>

      <div data-profile-usage-limits-link className="mt-3.5">
        <button
          type="button"
          onClick={onOpenUsageLimits}
          className="dc-profile-tile flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          <span className="min-w-0">
            <span className="dc-profile-card-title block">Open Usage Limits Dashboard</span>
            <span className="dc-profile-card-meta mt-0.5 block">Real-time balances &amp; midnight reset clock</span>
          </span>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>
      </div>
    </ProfileCard>
  );
}

/* ── 5. Preferences, Privacy & Referral Studio Card ─────────────────── */
function PreferencesAndReferralCard({
  onOpenSettings,
  referral,
}: {
  onOpenSettings: () => void;
  referral: ProfileLayoutProps["referral"];
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!referral) return;
    referral.onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ProfileCard
      className="relative overflow-hidden"
      contentClassName="p-4 sm:p-5"
    >
      {/* Notifications & Privacy Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`${ICON_CHIP} bg-violet-500/15 text-violet-300 ring-violet-400/35`}>
            <Bell className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="dc-profile-card-accent uppercase tracking-wider">Account Controls</p>
            <h3 className="dc-profile-card-title mt-0.5 truncate text-base font-bold text-white">
              Notifications &amp; privacy
            </h3>
            <span className="dc-profile-card-meta mt-0.5 block truncate">
              Push, email &amp; learning preferences
            </span>
          </div>
        </div>

        <GlassButton
          onClick={onOpenSettings}
          className="shrink-0 [&_.size-12]:size-9 [&_svg]:text-indigo-200"
          aria-label="Open preferences"
        >
          <ChevronRight size={16} />
        </GlassButton>
      </div>

      {/* Interactive Preference Pills */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="dc-profile-tile mt-3.5 flex w-full flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-semibold text-white/85">
            Push Alerts
          </span>
          <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-semibold text-white/85">
            Email Updates
          </span>
          <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-semibold text-white/85">
            Activity Privacy
          </span>
        </div>
        <span className="dc-profile-card-accent inline-flex items-center gap-1">
          <span>Configure</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>

      {/* Referral Pass Studio */}
      {referral ? (
        <div data-profile-referral className="mt-4 border-t border-white/[0.08] pt-4">
          <div className="dc-profile-subpanel flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30">
                <Ticket className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="dc-profile-card-meta">Your referral code</p>
                <code
                  className={`mt-0.5 block truncate font-mono text-sm font-bold tracking-wider ${
                    referral.used ? "text-white/60 line-through decoration-2 decoration-rose-400" : "text-white"
                  }`}
                >
                  {referral.code}
                </code>
              </div>
            </div>

            {referral.used ? (
              <span
                data-profile-referral-used
                className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200 ring-1 ring-amber-400/30"
              >
                Used
              </span>
            ) : (
              <GlassButton variant="capsule" onClick={handleCopy} className={`shrink-0 ${BTN_SMALL}`}>
                <span className="inline-flex items-center gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </span>
              </GlassButton>
            )}
          </div>
          {referral.used ? (
            <p className="dc-profile-card-meta mt-2">This referral ID is no longer active.</p>
          ) : null}
        </div>
      ) : null}
    </ProfileCard>
  );
}

/* ── 6. Account Session & Security Footer Card ──────────────────────── */
function AccountSessionCard({
  email,
  onLogout,
  isAdmin,
  onOpenDashboard,
}: {
  email: string;
  onLogout: () => void;
  isAdmin: boolean;
  onOpenDashboard: () => void;
}) {
  return (
    <ProfileCard
      className="relative overflow-hidden"
      contentClassName="p-4 sm:p-5"
    >
      <div className="flex items-center gap-3 pb-3.5 border-b border-white/[0.08]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
          <Lock className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="dc-profile-card-title truncate">Active session</p>
          <p className="dc-profile-card-meta truncate">{email}</p>
        </div>
      </div>

      <div className="mt-3.5 space-y-3">
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
    </ProfileCard>
  );
}

/* ── Bento Quick Stat Tile ──────────────────────────────────────────── */
function QuickStatTile({
  icon,
  value,
  label,
  caption,
  tone,
  onClick,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  caption: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dc-profile-tile group flex items-center justify-between gap-2.5 p-3 text-left sm:p-3.5"
    >
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 transition group-hover:scale-105 ${tone}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <span className="dc-profile-card-value block group-hover:text-indigo-200">{value}</span>
          <span className="dc-profile-card-title mt-0.5 block truncate text-xs">{label}</span>
          <span className="dc-profile-card-meta hidden truncate sm:block">{caption}</span>
        </div>
      </div>
      <ArrowUpRight className="hidden h-4 w-4 shrink-0 text-white/40 transition group-hover:text-indigo-200 sm:block" />
    </button>
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
