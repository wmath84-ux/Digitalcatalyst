import { GlassSwitch } from "../components/ui/glass-switch";
import { GlassButton } from "../components/ui/glass-button";
import { ThemeModeToggle } from "../components/ui/ThemeModeToggle";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/glass-dialog";
import { PaymentButton } from "../components/ui/PaymentButton";
import { buildRenewalView } from "../../utils/renewalPresentation";
import { getRenewalReminder } from "../../utils/subscriptionRenewal";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import "./profile-minimal.css";
import { ChevronRight, LoaderCircle, X } from "lucide-react";

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

/* Account facts and controls: plain sections, not a stack of nested cards. */
export default function ProfileLayout({ name, email, photoURL, bio, initials, memberSince, onEdit, onChoosePhoto, photoUploading = false, photoError, membership, onOpenPlans, onOpenFeature, stats, referral, renewal, onOpenUsageLimits, onOpenStudyLibrary, library, onOpenSettings, saving, message, onLogout, isAdmin, onOpenDashboard }: ProfileLayoutProps) {
  const src = profilePhotoSrc(photoURL);
  const [brokenPhoto, setBrokenPhoto] = useState("");
  const showPhoto = Boolean(src) && src !== brokenPhoto;
  const snapshot = renewal?.subscription || membership.subscription;
  const now = renewal?.now || Date.now();
  const active = membership.active;
  const reminderOptOut = Boolean(snapshot?.reminderOptOut);
  const daysRemaining = snapshot && snapshot.expiresAt > now ? Math.max(1, Math.ceil((snapshot.expiresAt - now) / 86400000)) : 0;
  const statusLabel = active ? "Active" : snapshot?.status === "cancelled" ? "Cancelled" : snapshot?.status === "pending" || snapshot?.status === "past_due" ? "Payment pending" : membership.expired ? "Expired" : "Inactive";
  const renewalView = snapshot && membership.subscriber ? buildRenewalView(getRenewalReminder({ status: snapshot.status, expiresAt: snapshot.expiresAt, planId: snapshot.planId, planName: membership.planLabel }, now), { planName: membership.planLabel, now }) : null;
  const renewLabel = renewalView?.canRenew ? renewalView.cta : active ? "Renew early" : "Renew membership";

  return (
    <div data-account-profile className="dc-account-layout">
      <header className="dc-account-header">
        <h1>Profile</h1>
        <button type="button" data-profile-settings onClick={onOpenSettings} className="dc-account-text-action">Settings</button>
      </header>
      {saving ? <p role="status" className="dc-account-note">Saving changes…</p> : null}
      {message ? <p role="status" className="dc-account-notice">{message}</p> : null}

      <section data-profile-hero className="dc-account-identity">
        <button type="button" data-profile-photo-upload aria-label={photoURL ? "Change profile photo" : "Add profile photo"} onClick={onChoosePhoto} disabled={!onChoosePhoto || photoUploading} aria-busy={photoUploading || undefined} className="dc-account-photo-action">
          {showPhoto ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBrokenPhoto(src)} /> : <span data-profile-photo-fallback className="dc-account-avatar">{initials}</span>}
          {onChoosePhoto ? <span>{photoUploading ? "Uploading…" : photoURL ? "Change photo" : "Add photo"}</span> : null}
        </button>
        <div className="dc-account-identity-copy">
          <h2>{name}</h2>
          <p className="dc-account-email">{email}</p>
          {bio ? <p className="dc-account-bio">{bio}</p> : null}
          <p className="dc-account-note">Member since {memberSince}</p>
          <button type="button" data-profile-edit onClick={onEdit} className="dc-account-text-action">Edit profile</button>
        </div>
      </section>
      {photoError ? <p role="alert" className="dc-account-error">{photoError}</p> : null}

      <nav aria-label="Profile shortcuts" className="dc-account-stats">
        <button type="button" onClick={stats.onOpenPurchases}><strong>{stats.ownedCount}</strong><span>Purchases</span></button>
        <button type="button" onClick={stats.onOpenFavorites}><strong>{stats.favoriteCount}</strong><span>Saved</span></button>
        <button type="button" onClick={stats.onOpenCart}><strong>{stats.cartCount}</strong><span>Cart</span></button>
      </nav>

      <section data-profile-membership-card data-profile-membership-tier={membership.tier} className="dc-account-section">
        <header className="dc-account-section-header">
          <div><h2>Membership</h2><p data-profile-plan-label className="dc-account-plan-name">{membership.subscriber ? membership.planLabel : PLAN_LABELS.normal}</p></div>
          {membership.subscriber ? <span data-profile-plan-status={active ? "active" : "expired"} data-profile-membership-status={active ? "active" : "expired"} className={`dc-account-status ${active ? "is-active" : "is-expired"}`}>{statusLabel}</span> : null}
        </header>
        {membership.subscriber && snapshot ? (
          <>
            <dl data-profile-membership-details className="dc-account-facts">
              <div><dt>Billing cycle</dt><dd>{cycleLabel(snapshot.cycle)}</dd></div>
              <div><dt>{active ? "Access ends" : snapshot.expiresAt > now ? "Plan expiry" : "Access ended"}</dt><dd>{formatDate(snapshot.expiresAt)}</dd></div>
              {active ? <div><dt>Remaining</dt><dd>{daysRemaining} {daysRemaining === 1 ? "day" : "days"}</dd></div> : null}
              {membership.revisionTestBankLimit !== null ? <div data-member-test-bank-capacity><dt>Cloud Test Bank</dt><dd>{membership.revisionTestBankLimit === -1 ? "Unlimited saved tests" : `${membership.revisionTestBankLimit} saved tests`}</dd></div> : null}
            </dl>
            <div data-renewal-card data-stage={renewalView?.stage || (active ? "active" : "expired")} className="dc-account-renewal">
              {renewalView?.canRenew || !active ? <p data-renewal-card-headline className={active ? "dc-account-note" : "dc-account-error"}>{renewalView?.headline || "Renew to restore plan access."}</p> : null}
              <p className="dc-account-note">Renewal is manual. {!active ? "Saved work is retained; renew to restore your plan access." : "No automatic charge."}</p>
              <div className="dc-account-actions" data-member-manage-actions>
                <PaymentButton block size="sm" icon={null} className="dc-account-primary" onClick={renewal?.onRenew || onOpenPlans} data-member-renew="" data-renewal-card-cta="" label={renewLabel} />
                <button type="button" data-member-change-plan onClick={onOpenPlans} className="dc-account-text-action">Change plan</button>
              </div>
              {renewal?.onToggleReminders ? <button type="button" data-renewal-reminder-toggle aria-pressed={!reminderOptOut} disabled={saving} onClick={() => renewal.onToggleReminders(!reminderOptOut)} className="dc-account-text-action">Renewal reminders {reminderOptOut ? "off" : "on"}</button> : null}
            </div>
            {membership.features.length > 0 ? <details data-member-features className="dc-account-disclosure"><summary>Included features <span>{membership.features.length}</span></summary><ul className="dc-account-link-list">{membership.features.map((feature) => <li key={feature.id}><button type="button" data-profile-membership-feature={feature.id} onClick={() => onOpenFeature(feature.id)}><span><strong>{feature.name}</strong>{feature.description ? <small>{feature.description}</small> : null}</span><ChevronRight aria-hidden="true" /></button></li>)}</ul></details> : null}
            {membership.includedCourses.length > 0 ? <details data-profile-membership-courses className="dc-account-disclosure"><summary>Courses in your plan <span>{membership.includedCourses.length}</span></summary><p className="dc-account-note">{active ? "Plan access lasts until the date above." : "These courses need an active membership unless purchased separately."}</p><ul className="dc-account-link-list">{membership.includedCourses.map((course) => <li key={course.id}><button type="button" onClick={() => library.onOpenCourse(course.id)}><span>{course.title}</span><ChevronRight aria-hidden="true" /></button></li>)}</ul></details> : null}
            {membership.planDescription ? <details className="dc-account-disclosure"><summary>Plan details</summary><p className="dc-account-note">{membership.planDescription}</p></details> : null}
          </>
        ) : <div data-profile-upgrade-card><p className="dc-account-note">No paid membership. Purchased content remains in My Purchases.</p><button type="button" onClick={onOpenPlans} className="dc-account-primary">View plans</button></div>}
      </section>

      <section data-profile-appearance aria-labelledby="profile-appearance-title" className="dc-account-section">
        <header className="dc-account-section-header">
          <div>
            <h2 id="profile-appearance-title">Appearance</h2>
            <p className="dc-account-note">Light is the default. Your choice is saved on this device and applies across the app.</p>
          </div>
          <ThemeModeToggle />
        </header>
      </section>

      <section aria-label="Account tools" className="dc-account-section">
        <ul className="dc-account-link-list">
          <li><button type="button" data-profile-usage-limits-link data-profile-usage-card onClick={onOpenUsageLimits}><span><strong>Usage Limits</strong><small>Used, remaining and reset times</small></span><ChevronRight aria-hidden="true" /></button></li>
          <li><button type="button" data-profile-study-library data-profile-library-card onClick={onOpenStudyLibrary}><span><strong>Study Library</strong><small>Your notes and study materials</small></span><ChevronRight aria-hidden="true" /></button></li>
        </ul>
      </section>
      {referral ? <details data-profile-referral-card className="dc-account-disclosure"><summary>Referral code</summary><div className="dc-account-referral"><code>{referral.code || "Not available"}</code><button type="button" disabled={referral.used || !referral.code} onClick={referral.onCopy} className="dc-account-text-action">Copy</button></div><p className="dc-account-note">{referral.used ? "Already redeemed. This single-use code cannot be used again." : "Single-use code."}</p></details> : null}

      <footer data-profile-account-card className="dc-account-footer">
        <button type="button" onClick={onLogout} className="dc-account-logout">Log out</button>
        <div className="dc-account-legal"><a href="/privacy-policy.html">Privacy</a><a href="/terms-of-service.html">Terms</a>{isAdmin ? <button type="button" data-profile-open-dashboard onClick={onOpenDashboard}>Open dashboard</button> : null}</div>
      </footer>
    </div>
  );
}

/* ── Modals (shared with SettingsPage) ──────────────────────────────── */
export function BaseModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent aria-label={title} className="dc-account-modal max-h-[90dvh] max-w-lg overflow-y-auto text-white">
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
    <div className="dc-account-preference-row">
      <span aria-hidden="true" className="dc-account-preference-icon">{icon}</span>
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
  const id = useId();
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
    try {
      const ok = await onSave({ name: name.trim(), mobile, bio });
      if (!ok) setError("Profile could not be updated.");
    } catch { setError("Profile could not be updated. Please retry."); }
    finally { setSaving(false); }
  };
  
  const INPUT = "w-full rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30";
  
  return (
    <BaseModal title="Edit Profile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={`${id}-name`} className="mb-1.5 block text-xs font-medium text-white/70">Full name</label>
          <input id={`${id}-name`} disabled={saving} className={INPUT} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className="mb-1.5 block text-xs font-medium text-white/70">Email address</label>
          <input id={`${id}-email`} className={INPUT} value={user.email} disabled />
        </div>
        <div>
          <label htmlFor={`${id}-mobile`} className="mb-1.5 block text-xs font-medium text-white/70">Mobile number</label>
          <input id={`${id}-mobile`} disabled={saving} className={INPUT} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10 digit number" />
        </div>
        <div>
          <label htmlFor={`${id}-bio`} className="mb-1.5 block text-xs font-medium text-white/70">Bio</label>
          <textarea id={`${id}-bio`} disabled={saving} maxLength={240} className={INPUT} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 240))} rows={3} placeholder="Tell learners about yourself" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-rose-500/15 p-3 text-sm text-rose-200">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </BaseModal>
  );
}
