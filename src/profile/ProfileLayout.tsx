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
  ChevronRight,
  Crown,
  Heart,
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

/** Google avatars 403 in the APK WebView when a localhost Referer is sent. */
function profilePhotoSrc(url?: string): string {
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

/* ── Design tokens ─────────────────────────────────────────────────────
   Owner brief (2026-09-30): the Profile page wears the HOME page's card —
   material, type and tone ("home page ke card ka design … vahi exactly hi
   look aur design profile ke cards per apply karo … text design bhi exactly
   jaisa home page ka hai vaise hi profile page ka ho jaaye … bahut jyada text
   … ekadam clean professional aur classic look").

   So there is no card-local material here any more: `ProfileCard` is the Home
   plate (see ./ProfileCard.tsx) and the copy wears the Home card ramp pinned
   in src/profile-glass.css (`.dc-profile-card-title` · `-meta` · `-note` ·
   `-accent` · `-value` · `.dc-profile-bar`). Every action stays the pack's
   <GlassButton variant="capsule"> (websiteglass.com). What is left below is
   the pill metric, the icon chip and the form field's ink. */
/* Home's pill metrics: 40px tall with a 12px label, instead of the pack
   capsule's 48px default, so a Profile action sits at the weight Home's
   "Resume" / "View All" controls do. The label is the pack's own inner
   <span>, so the size override targets it (a font-size on the root would be
   beaten by that span's own `text-sm`). */
const BTN = "[&>span>div]:h-10 [&>span>div]:px-4 [&_span]:text-xs [&_span]:font-semibold";
const BTN_PRIMARY = `w-full [&>span>div]:w-full ${BTN}`;
const BTN_SECONDARY = `w-full [&>span>div]:w-full ${BTN}`;
const BTN_SMALL = "[&>span>div]:h-9 [&>span>div]:px-3.5 [&_span]:text-[11px] [&_span]:font-semibold";
const ICON_CHIP = "grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1";
// Wave 5: `glass-input` is the pack's *search* pill (radius 9999, focus glow,
// no textarea twin), so profile fields do not wear it as a skin. Same material,
// right anatomy: the frost + rim come from `.dc-field` in src/glass.css and the
// native `<input>`/`<textarea>` keep `required`, `inputMode`, `rows` and the
// validation copy exactly as the profile contract expects.
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

  myDayCard: ReactNode;
  aiQuotaCard: ReactNode;

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
      {/* ── Page header ──
          Three lines became one: the "Account overview" eyebrow and the
          one-line subtitle repeated what the page itself already shows. The
          title wears Home's greeting type (`.dc-profile-title`) and keeps the
          scrim, because it is the one line of copy sitting straight on the
          scene. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="dc-scene-ink dc-profile-title truncate">My profile</h1>
          {membershipBadge}
        </div>
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin text-violet-300" /> : null}
      </header>

      {message ? (
        <div role="status" className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-200">
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
        onEdit={onEdit}
      />

      {/* ── Full-width quick stats ── */}
      <div className="grid grid-cols-3 gap-2.5 md:gap-3" data-profile-stats>
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

      {/* ── Primary column: membership + allowances ── */}
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
          <UpgradeCard onOpenPlans={onOpenPlans} onOpenSubscriberExperience={onOpenSubscriberExperience} />
        )}

        {myDayCard}

        {aiQuotaCard}
      </div>

      {/* ── Side column: library + preferences + account actions ── */}
      <div data-profile-col="side">
        {referral ? <ReferralCard code={referral.code} used={referral.used} onCopy={referral.onCopy} /> : null}

        <StudyLibraryCard onOpen={onOpenStudyLibrary} />

        <LibraryCard
          items={library.items}
          ownedCount={library.ownedCount}
          onOpenCourse={library.onOpenCourse}
          onOpenPurchases={library.onOpenPurchases}
        />

        <PreferencesCard onOpen={onOpenSettings} />

        <GlassButton
          variant="capsule"
          onClick={onLogout}
          className="w-full text-rose-300 [&>span>div]:w-full [&>span>div]:ring-1 [&>span>div]:ring-rose-400/30 [&_span]:text-sm [&_span]:font-semibold"
        >
          <span className="inline-flex items-center gap-2 text-rose-300"><LogOut size={16} /> Log out</span>
        </GlassButton>

        <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-[11px] font-medium text-white/70">
          <a href="/privacy-policy.html" className="dc-scene-ink transition hover:text-violet-300 hover:underline">Privacy Policy</a>
          <span aria-hidden="true" className="text-white/40">·</span>
          <a href="/terms-of-service.html" className="dc-scene-ink transition hover:text-violet-300 hover:underline">Terms of Service</a>
        </nav>

        {isAdmin ? (
          <button
            type="button"
            data-profile-open-dashboard
            onClick={onOpenDashboard}
            className="mx-auto block text-[9px] font-medium tracking-wide text-white/55 transition hover:text-white/55"
          >
            Open dashboard
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ── Profile hero (identity) ──────────────────────────────────────────
   One Home-card block: avatar, name, email, one 11px fact line and the edit
   pencil. The old stack (plan pill · name · email · bordered "Member since"
   row · bio block · a second full-width "Edit profile" button) said the same
   four things twice; the duplicate CTA is gone and the bio clamps to two
   lines, exactly like a card's copy clamp on Home. */
function ProfileHero({
  name,
  email,
  photoURL,
  bio,
  initials,
  memberSince,
  planLabel,
  onEdit,
}: {
  name: string;
  email: string;
  photoURL?: string;
  bio?: string;
  initials: string;
  memberSince: string;
  planLabel: string;
  onEdit: () => void;
}) {
  const src = profilePhotoSrc(photoURL);
  const [brokenPhoto, setBrokenPhoto] = useState("");
  const showPhoto = Boolean(src) && src !== brokenPhoto;
  return (
    <ProfileCard data-profile-hero className="relative overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-full p-[2px] ring-2 ring-white/25">
          {showPhoto ? (
            <img
              src={src}
              alt=""
              decoding="async"
              width={64}
              height={64}
              className="h-14 w-14 rounded-full object-cover md:h-16 md:w-16"
              referrerPolicy="no-referrer"
              draggable={false}
              data-profile-photo
              onError={() => setBrokenPhoto(src)}
            />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-full bg-indigo-600 text-lg font-bold text-white md:h-16 md:w-16 md:text-xl" data-profile-photo-fallback>
              {initials}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold tracking-tight text-white md:text-lg">{name}</h2>
          <p className="dc-profile-card-meta mt-0.5 truncate">{email}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span data-profile-plan-label className="dc-profile-card-accent inline-flex items-center gap-1">
              <BadgeCheck className="h-3 w-3" /> {planLabel}
            </span>
            <span aria-hidden="true" className="text-[10px] text-white/40">·</span>
            <span className="dc-profile-card-meta inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> Since {memberSince}
            </span>
          </div>
        </div>

        <GlassButton onClick={onEdit} aria-label="Edit profile" className="shrink-0 [&_.size-12]:size-9">
          <Pencil size={15} />
        </GlassButton>
      </div>

      {bio ? <p className="dc-profile-card-note mt-3 line-clamp-2">{bio}</p> : null}
    </ProfileCard>
  );
}

/* ── Membership card (subscriber) ─────────────────────────────────────
   Membership and renewal were two cards saying the same thing — tier, plan,
   billing cycle, status, expiry, a manual-renewal note — one right under the
   other. They are one card now, on Home's material: the tier + status line,
   one fact line, Home's progress bar and the two actions. All the hooks the
   rest of the app reads (`data-profile-membership-*`, `data-renewal-*`) stay
   on the same elements, so nothing that deep-links into them changes. */
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
    >
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${active ? "bg-indigo-500/15 text-indigo-300 ring-indigo-400/30" : "bg-rose-500/15 text-rose-300 ring-rose-400/30"}`}>
          {TIER_ICONS[tier]}
        </span>

        <div className="min-w-0 flex-1">
          <h3 data-renewal-card-headline className="dc-profile-card-title truncate">{tierLabel} membership</h3>
          <p className="dc-profile-card-meta mt-0.5 truncate">
            {planLabel}
            {snapshot ? ` · ${cycleLabel(snapshot.cycle)} billing` : ""}
          </p>
        </div>

        <span
          data-profile-plan-status={active ? "active" : "expired"}
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${active ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30" : "bg-rose-500/15 text-rose-300 ring-rose-400/30"}`}
        >
          {active ? "Active" : "Expired"}
        </span>
      </div>

      {snapshot ? (
        <div className="mt-3">
          <div className="dc-profile-card-meta flex items-center justify-between gap-2">
            <span data-renewal-expiry className="truncate">
              {expired ? `Ended ${formatDate(snapshot.expiresAt)}` : `Access until ${formatDate(snapshot.expiresAt)}`}
            </span>
            <span data-renewal-remaining className="shrink-0">
              {expired ? "Renew to continue" : `${daysRemaining} days left`}
            </span>
          </div>
          {expired ? null : (
            <div className="dc-profile-bar mt-1.5">
              <span data-renewal-progress style={{ width: `${Math.max(4, progress)}%` }} />
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
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

      <p className="dc-profile-card-meta mt-2 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-indigo-300" /> Renewal is manual and secure — no automatic charge.
      </p>
    </ProfileCard>
  );
}

/* ── Upgrade card (free learner) ──────────────────────────────────────
   The paragraph + three checkpoints + two stacked CTAs became one line and
   the same two actions, side by side. */
function UpgradeCard({
  onOpenPlans,
  onOpenSubscriberExperience,
}: {
  onOpenPlans: () => void;
  onOpenSubscriberExperience: () => void;
}) {
  return (
    <ProfileCard data-profile-upgrade-card>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white ring-1 ring-indigo-400/40">
          <Rocket className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="dc-profile-card-title truncate">Free plan</h3>
          <p className="dc-profile-card-meta mt-0.5">Subscriber plans unlock more practice, notes and My Day.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <GlassButton variant="capsule" onClick={onOpenPlans} className={BTN_PRIMARY}>
          Explore plans <ArrowRight className="h-3.5 w-3.5" />
        </GlassButton>
        <GlassButton variant="capsule" onClick={onOpenSubscriberExperience} data-subscriber-experience-cta className={BTN_SECONDARY}>
          Subscriber experience
        </GlassButton>
      </div>
    </ProfileCard>
  );
}

/* ── Referral card ────────────────────────────────────────────────────
   The code is the card: label, code, Copy (or the Used badge). The header
   icon chip, the "Share it with a learner joining …" line and the two-line
   used note are gone — the used state still strikes the code through and
   still says it is no longer active, in one short line. */
function ReferralCard({ code, used, onCopy }: { code: string; used: boolean; onCopy: () => void }) {
  return (
    <ProfileCard data-profile-referral>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="dc-profile-card-meta">Your referral code</p>
          <code className={`mt-0.5 block truncate text-sm font-bold ${used ? "text-white/60 line-through decoration-2 decoration-rose-400" : "text-white"}`}>
            {code}
          </code>
        </div>
        {used ? (
          <span data-profile-referral-used className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Used</span>
        ) : (
          <GlassButton variant="capsule" onClick={onCopy} className={`shrink-0 ${BTN_SMALL}`}>
            Copy
          </GlassButton>
        )}
      </div>
      {used ? <p className="dc-profile-card-meta mt-2">This referral ID is no longer active.</p> : null}
    </ProfileCard>
  );
}

/* ── Personal Study Library card ────────────────────────────────────── */
function StudyLibraryCard({ onOpen }: { onOpen: () => void }) {
  return (
    <ProfileCard data-profile-study-library>
      <div className="flex items-center gap-3">
        <span className={`${ICON_CHIP} bg-cyan-500/15 text-cyan-200 ring-cyan-400/30`}>
          <Boxes className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="dc-profile-card-title truncate">My Study Library</h3>
          <p className="dc-profile-card-meta mt-0.5 truncate">Your modules, saved items and recent resources.</p>
        </div>
      </div>
      <GlassButton variant="capsule" onClick={onOpen} className={`mt-3 text-cyan-100 ${BTN_PRIMARY}`}>
        <span className="inline-flex items-center gap-2">Open Study Library <ArrowRight className="h-3.5 w-3.5" /></span>
      </GlassButton>
    </ProfileCard>
  );
}

/* ── Owned course library card ────────────────────────────────────────
   Home's list row, on a Home card: the artwork thumbnail, the title, one
   meta line and the chevron. "View all" is Home's quiet section link. */
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
    <ProfileCard>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="dc-profile-card-title truncate">Your courses</h3>
          {items.length > 0 ? (
            <p className="dc-profile-card-meta mt-0.5">{ownedCount} course{ownedCount === 1 ? "" : "s"}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onOpenPurchases}
          className="shrink-0 text-xs font-semibold text-white/55 transition hover:text-white/85"
        >
          View all
        </button>
      </div>

      {items.length > 0 ? (
        <div className="mt-3 space-y-2.5">
          {items.slice(0, 3).map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onOpenCourse(product.id)}
              className="flex w-full items-center gap-3 text-left transition active:scale-[0.99]"
            >
              <img
                src={product.image}
                alt=""
                loading="lazy"
                decoding="async"
                width={64}
                height={48}
                className="h-12 w-16 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                referrerPolicy="no-referrer"
                onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
              />
              <span className="min-w-0 flex-1">
                <span className="dc-profile-card-title block truncate">{product.title}</span>
                <span className="dc-profile-card-meta block">Owned</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-white/40" />
            </button>
          ))}
        </div>
      ) : (
        <p className="dc-profile-card-meta mt-3">
          Nothing owned yet — find a course in the store to start your library.
        </p>
      )}
    </ProfileCard>
  );
}

/* ── Preferences card ───────────────────────────────────────────────── */
function PreferencesCard({ onOpen }: { onOpen: () => void }) {
  return (
    <ProfileCard>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="dc-profile-card-title truncate">Notifications &amp; privacy</h3>
          <p className="dc-profile-card-meta mt-0.5">Saved securely to your account.</p>
        </div>
        <GlassButton
          onClick={onOpen}
          className="shrink-0 [&_.size-12]:size-9 [&_svg]:text-indigo-300"
          aria-label="Open preferences"
        >
          <Bell size={16} />
        </GlassButton>
      </div>
    </ProfileCard>
  );
}

/* ── Small building blocks ──────────────────────────────────────────── */
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
    /* The Home stat tile: a small icon chip, the number at Home's card value
       weight and one 11px label. Press feedback (active:scale) stays; it is
       not a lift. */
    <ProfileCard
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="cursor-pointer text-center transition active:scale-[0.97]"
      contentClassName="p-3"
    >
      <span className={`mx-auto grid h-9 w-9 place-items-center rounded-xl ring-1 ${tone}`}>{icon}</span>
      <span className="dc-profile-card-value mt-2 block">{value}</span>
      <span className="dc-profile-card-meta block">{label}</span>
    </ProfileCard>
  );
}

/* ── Modals (shared) ────────────────────────────────────────────────── */
export function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Phase A: the pack's Dialog at its defaults (websiteglass.com/docs/components/glass-dialog).
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
