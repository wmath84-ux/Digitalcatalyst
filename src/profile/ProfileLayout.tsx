import { GlassSwitch } from "../components/ui/glass-switch";
import { GlassSurface } from "../components/ui/glass";
import { useState, type FormEvent, type ReactNode } from "react";
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

/* ── Design tokens ─────────────────────────────────────────────────────
   Flat, calm and readable. One visual language across every breakpoint:
   solid white cards on a soft indigo wash, and the brand CTA gradient
   (indigo → violet → fuchsia) reserved for actions only. */
const CARD =
  "rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_14px_40px_-24px_rgba(49,46,129,0.35)] md:p-5 lg:rounded-2xl lg:p-4 xl:p-5";
const BTN_PRIMARY =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 active:scale-[0.99] md:rounded-xl lg:py-2.5 lg:text-[13px]";
const BTN_SECONDARY =
  "flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] lg:rounded-xl lg:py-2.5 lg:text-[13px]";
const EYEBROW = "text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600";
const ICON_CHIP =
  "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 md:h-12 md:w-12";
const STAT_CHIP = "rounded-2xl bg-slate-50 px-2.5 py-2.5 text-center ring-1 ring-slate-100";
// Wave 5: `glass-input` is the pack's *search* pill (radius 9999, focus glow,
// no textarea twin), so profile fields do not wear it as a skin. Same material,
// right anatomy: the frost + rim come from `.dc-field` in src/glass.css and the
// native `<input>`/`<textarea>` keep `required`, `inputMode`, `rows` and the
// validation copy exactly as the profile contract expects.
const INPUT =
  "dc-field w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const formatDate = (value: number): string => {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const cycleLabel = (cycle: string): string => (cycle === "yearly" ? "Yearly" : "Monthly");

const isActiveSubscription = (subscription: SubscriptionSnapshot, now: number): boolean =>
  subscription.status === "active" && subscription.expiresAt > now;

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
    appName: string;
    onCopy: () => void;
  } | null;

  renewal: {
    tier: MembershipTier;
    subscription: SubscriptionSnapshot;
    now: number;
    onRenew: () => void;
    onToggleReminders: (next: boolean) => void;
  } | null;

  myDayCard: ReactNode;
  aiQuotaCard: ReactNode;

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

/* ── Layout ─────────────────────────────────────────────────────────── */
export default function ProfileLayout({
  name,
  email,
  photoURL,
  bio,
  initials,
  memberSince,
  onEdit,
  membership,
  membershipBadge,
  onOpenPlans,
  onOpenSubscriberExperience,
  stats,
  referral,
  renewal,
  myDayCard,
  aiQuotaCard,
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
      {/* ── Page header ── */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className={EYEBROW}>Your space</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">Profile</h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500 md:text-sm sm:text-[0.8rem]">Account, plan and library — in one place.</p>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          {membershipBadge}
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" /> : null}
        </div>
      </header>

      {message ? (
        <div role="status" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {message}
        </div>
      ) : null}

      {/* ── Full-width identity hero ── */}
      <ProfileHero
        name={name}
        email={email}
        photoURL={photoURL}
        bio={bio}
        initials={initials}
        memberSince={memberSince}
        planLabel={membership.subscriber ? membership.planLabel : PLAN_LABELS.normal}
        active={membership.active}
        onEdit={onEdit}
      />

      {/* ── Full-width quick stats ── */}
      <div className="grid grid-cols-3 gap-2.5 md:gap-3" data-profile-stats>
        <QuickStat
          icon={<ShoppingBag className="h-5 w-5" />}
          value={stats.ownedCount}
          label="Purchased"
          tone="bg-indigo-50 text-indigo-600 ring-indigo-100"
          onClick={stats.onOpenPurchases}
        />
        <QuickStat
          icon={<Heart className="h-5 w-5" />}
          value={stats.favoriteCount}
          label="Favorites"
          tone="bg-rose-50 text-rose-500 ring-rose-100"
          onClick={stats.onOpenFavorites}
        />
        <QuickStat
          icon={<Boxes className="h-5 w-5" />}
          value={stats.cartCount}
          label="In cart"
          tone="bg-amber-50 text-amber-600 ring-amber-100"
          onClick={stats.onOpenCart}
        />
      </div>

      {/* ── Primary column: membership + allowances ── */}
      <div data-profile-col="main">
        {membership.subscriber ? (
          <MembershipCard
            tier={membership.tier}
            active={membership.active}
            tierLabel={membership.tierLabel}
            planLabel={membership.planLabel}
            subscription={membership.subscription}
            onOpenPlans={onOpenPlans}
          />
        ) : (
          <UpgradeCard onOpenPlans={onOpenPlans} onOpenSubscriberExperience={onOpenSubscriberExperience} />
        )}

        {renewal ? (
          <ProfileRenewalCard
            tier={renewal.tier}
            subscription={renewal.subscription}
            now={renewal.now}
            onRenew={renewal.onRenew}
            onToggleReminders={renewal.onToggleReminders}
          />
        ) : null}

        {myDayCard}

        {aiQuotaCard}
      </div>

      {/* ── Side column: library + preferences + account actions ── */}
      <div data-profile-col="side">
        {referral ? (
          <ReferralCard code={referral.code} used={referral.used} appName={referral.appName} onCopy={referral.onCopy} />
        ) : null}

        <LibraryCard
          items={library.items}
          ownedCount={library.ownedCount}
          onOpenCourse={library.onOpenCourse}
          onOpenPurchases={library.onOpenPurchases}
        />

        <section className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={EYEBROW}>Preferences</p>
              <h3 className="mt-1 text-base font-black text-slate-950">Notifications & privacy</h3>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Saved securely to your account.</p>
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 transition hover:bg-indigo-100 active:scale-95"
              aria-label="Open preferences"
            >
              <Bell size={18} />
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-4 text-sm font-black text-rose-600 transition hover:bg-rose-100 active:scale-[0.99] md:rounded-xl lg:py-3"
        >
          <LogOut size={17} /> Log out
        </button>

        <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-[11px] font-semibold text-slate-400">
          <a href="/privacy-policy.html" className="transition hover:text-violet-600 hover:underline">Privacy Policy</a>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <a href="/terms-of-service.html" className="transition hover:text-violet-600 hover:underline">Terms of Service</a>
        </nav>

        {isAdmin ? (
          <button
            type="button"
            data-profile-open-dashboard
            onClick={onOpenDashboard}
            className="mx-auto block text-[9px] font-medium tracking-wide text-slate-400 transition hover:text-slate-500"
          >
            Open dashboard
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ── Profile hero (identity) ────────────────────────────────────────── */
function ProfileHero({
  name,
  email,
  photoURL,
  bio,
  initials,
  memberSince,
  planLabel,
  active,
  onEdit,
}: {
  name: string;
  email: string;
  photoURL?: string;
  bio?: string;
  initials: string;
  memberSince: string;
  planLabel: string;
  active: boolean;
  onEdit: () => void;
}) {
  return (
    <section data-profile-hero className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-[0_20px_50px_-24px_rgba(79,70,229,0.6)] lg:rounded-2xl">
      {/* soft decorative glows */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-fuchsia-300/20 blur-2xl" />

      <div className="relative p-5 md:p-6">
        <div className="flex items-center gap-4">
          <div className="shrink-0 rounded-2xl bg-white/15 p-[3px] ring-1 ring-white/30 backdrop-blur">
            {photoURL ? (
              <img src={photoURL} alt="" className="h-16 w-16 rounded-[14px] object-cover md:h-20 md:w-20" />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-[14px] bg-white text-xl font-black text-indigo-700 md:h-20 md:w-20 md:text-2xl">
                {initials}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ring-white/20">
                {active ? <BadgeCheck className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                {planLabel}
              </span>
            </div>
            <h2 className="mt-2 truncate text-xl font-black tracking-tight md:text-2xl">{name}</h2>
            <p className="truncate text-sm font-medium text-white/85 md:text-base">{email}</p>
          </div>

          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit profile"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 transition hover:bg-white/25 active:scale-95"
          >
            <Pencil size={17} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-white/80">
          <CalendarDays className="h-3.5 w-3.5" /> Member since {memberSince}
        </div>

        {bio ? (
          <p className="mt-3 rounded-2xl bg-white/15 px-4 py-3 text-sm leading-6 text-white/90 ring-1 ring-white/15 backdrop-blur">
            {bio}
          </p>
        ) : null}

        <button type="button" onClick={onEdit} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-indigo-700 shadow-lg transition hover:bg-indigo-50 active:scale-[0.99]">
          <Pencil size={15} /> Edit profile
        </button>
      </div>
    </section>
  );
}

/* ── Membership (subscriber) card ───────────────────────────────────── */
function MembershipCard({
  tier,
  active,
  tierLabel,
  planLabel,
  subscription,
  onOpenPlans,
}: {
  tier: MembershipTier;
  active: boolean;
  tierLabel: string;
  planLabel: string;
  subscription: SubscriptionSnapshot | null;
  onOpenPlans: () => void;
}) {
  return (
    <section data-profile-membership-tier={tier} data-profile-membership-card className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl shadow-md ${active ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-indigo-500/30" : "bg-slate-100 text-slate-400"}`}>
            {TIER_ICONS[tier]}
          </span>
          <div>
            <p className={EYEBROW}>Membership</p>
            <h3 className="mt-0.5 text-lg font-black text-slate-950">{tierLabel} membership</h3>
            <span data-profile-plan-label className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-700 ring-1 ring-indigo-100">
              <BadgeCheck className="h-3 w-3" />
              {planLabel}
            </span>
          </div>
        </div>
        <span
          data-profile-plan-status={active ? "active" : "expired"}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${active ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-600 ring-1 ring-rose-200"}`}
        >
          {active ? "Subscribed" : "Expired"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatChip label="Plan" value={tierLabel} />
        <StatChip label="Billing" value={cycleLabel(subscription?.cycle || "monthly")} />
        <StatChip label="Access" value={active ? "Active" : "Ended"} />
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">
        {active
          ? `You are enjoying the ${tierLabel} experience. Manage your plan or extend access whenever you are ready.`
          : `Your ${tierLabel} access has ended. Renew to bring your saved learning experience back instantly.`}
      </p>
      <button type="button" onClick={onOpenPlans} className={BTN_PRIMARY}>
        <RefreshCcw className="h-4 w-4" /> {active ? "Manage subscription" : "Renew subscription"} <ArrowRight className="h-4 w-4" />
      </button>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> No automatic charge without your confirmation.
      </p>
    </section>
  );
}

/* ── Upgrade card (free learner) ────────────────────────────────────── */
function UpgradeCard({
  onOpenPlans,
  onOpenSubscriberExperience,
}: {
  onOpenPlans: () => void;
  onOpenSubscriberExperience: () => void;
}) {
  return (
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
        <button type="button" onClick={onOpenPlans} className={BTN_PRIMARY}>
          Explore plans <ArrowRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={onOpenSubscriberExperience} data-subscriber-experience-cta className={BTN_SECONDARY}>
          <Sparkles className="h-4 w-4" /> See the subscriber app experience
        </button>
      </div>
    </section>
  );
}

/* ── Referral card ──────────────────────────────────────────────────── */
function ReferralCard({ code, used, appName, onCopy }: { code: string; used: boolean; appName: string; onCopy: () => void }) {
  return (
    <section className={CARD} data-profile-referral>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600">Your referral code</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{`Share it with a learner joining ${appName}.`}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
          <Sparkles className="h-5 w-5" />
        </span>
      </div>
      {used ? (
        <div data-profile-referral-used className="mt-3">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
            <code className="min-w-0 truncate text-sm font-black text-slate-400 line-through decoration-2 decoration-rose-400">{code}</code>
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-800">Used</span>
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-slate-400">This referral ID has been used and is no longer active.</p>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
          <code className="min-w-0 truncate text-sm font-black text-indigo-900">{code}</code>
          <button type="button" onClick={onCopy} className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[10px] font-black text-indigo-700 shadow-sm ring-1 ring-indigo-100">
            Copy
          </button>
        </div>
      )}
    </section>
  );
}

/* ── Library card ───────────────────────────────────────────────────── */
function LibraryCard({
  items,
  ownedCount,
  onOpenCourse,
  onOpenPurchases,
}: {
  items: { id: string; title: string; image: string }[];
  ownedCount: number;
  onOpenCourse: (id: string) => void;
  onOpenPurchases: () => void;
}) {
  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={EYEBROW}>My library</p>
          <h3 className="mt-1 text-base font-black text-slate-950">Your courses</h3>
          <p className="mt-0.5 text-xs font-medium text-slate-500">Jump back into everything you own.</p>
        </div>
        <span className={`${ICON_CHIP}`}>
          <ShoppingBag className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl bg-indigo-50/60 px-3 py-2.5 ring-1 ring-indigo-100">
        <span className="text-xs font-bold text-slate-600">{ownedCount} owned {ownedCount === 1 ? "course" : "courses"}</span>
        <button
          type="button"
          onClick={onOpenPurchases}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[10px] font-black text-indigo-700 shadow-sm ring-1 ring-indigo-100 transition hover:bg-indigo-50"
        >
          View all <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {items.length > 0 ? (
        <div className="mt-4 space-y-2">
          {items.slice(0, 3).map((product) => (
            <button
              type="button"
              key={product.id}
              onClick={() => onOpenCourse(product.id)}
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
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-semibold leading-5 text-slate-500 ring-1 ring-slate-100">
          Nothing owned yet — find a course in the store to start your library.
        </p>
      )}
    </section>
  );
}

/* ── Renewal card ───────────────────────────────────────────────────── */
function ProfileRenewalCard({
  tier,
  subscription,
  now,
  onRenew,
  onToggleReminders,
}: {
  tier: MembershipTier;
  subscription: SubscriptionSnapshot;
  now: number;
  onRenew: () => void;
  onToggleReminders: (next: boolean) => void;
}) {
  const expired = !isActiveSubscription(subscription, now);
  const daysRemaining = subscription.expiresAt > now ? Math.max(1, Math.ceil((subscription.expiresAt - now) / 86400000)) : 0;
  const totalDays = subscription.cycle === "yearly" ? 365 : 30;
  const progress = subscription.expiresAt > 0 ? Math.max(0, Math.min(100, Math.round((daysRemaining / totalDays) * 100))) : 100;

  return (
    <section data-renewal-card data-stage={expired ? "expired" : "active"} className={CARD}>
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
        <span data-renewal-remaining className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${expired ? "bg-rose-50 text-rose-600 ring-rose-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>
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
            <div data-renewal-progress className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 transition-all" style={{ width: `${progress}%` }} />
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
          className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-lg transition active:scale-[0.98] ${expired ? "bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-500/30" : "bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 shadow-indigo-500/30"}`}
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

/* ── Small building blocks ──────────────────────────────────────────── */
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
      className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-[0_8px_24px_-18px_rgba(49,46,129,0.5)] transition hover:border-indigo-100 active:scale-[0.97] md:rounded-xl md:p-3.5 md:shadow-sm"
    >
      <span className={`mx-auto grid h-10 w-10 place-items-center rounded-xl ring-1 md:h-11 md:w-11 ${tone}`}>{icon}</span>
      <span className="mt-2 block text-2xl font-black text-slate-950 md:text-3xl">{value}</span>
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 md:text-[11px]">{label}</span>
    </button>
  );
}

function UpgradePoint({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 text-xs font-bold text-slate-700"><CircleCheck className="h-4 w-4 shrink-0 text-indigo-600" />{children}</div>;
}

/* ── Modals (shared) ────────────────────────────────────────────────── */
export function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-6">
      {/* Sheet corners on phones, card corners on desktop — the same rule the
          shared Modal has followed since Wave 1, so profile + settings dialogs
          now agree with the rest of the app. */}
      <GlassSurface
        tint={0.78}
        radius={24}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200">
            <X size={17} />
          </button>
        </div>
        {children}
      </GlassSurface>
    </div>
  );
}

export function PreferenceRow({ icon, label, checked, onChange }: { icon: ReactNode; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">{icon}</span>
      <span className="flex-1 text-sm font-bold text-slate-900">{label}</span>
      {/* Wave 5: this was a hand-built 44×24 track with a translated knob.
          The registry switch keeps the same { checked, onChange } API and adds
          what the fake one could not: the knob squashes along the travel while
          you drag, it can be flipped with Space/Enter, `role="switch"` +
          `aria-checked` come from the component, and holding it turns the knob
          into a real refracting lens. The indigo→violet identity is preserved
          in src/glass.css (`.dc-switch`), not by forking the component. */}
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
