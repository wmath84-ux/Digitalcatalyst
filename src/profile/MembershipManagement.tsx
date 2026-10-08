// src/profile/MembershipManagement.tsx
//
// Membership management for an active subscriber, rendered inside the profile's
// Membership card. It replaces the old standalone member dashboard: the same
// facts (plan, Test Bank capacity, unlocked features, included courses, renewal
// status, reminders) in the profile's own card style, plus the two actions.

import type { ReactNode } from "react";
import { ArrowUpCircle, BadgeCheck, BookOpen, CalendarClock, ChevronRight, Layers, Settings2 } from "lucide-react";
import { GlassSwitch } from "../components/ui/glass-switch";
import type { RenewalView } from "../../utils/renewalPresentation";

export type ProfileMembershipManagement = {
  /** Billing cycle label source: "monthly" | "yearly". */
  cycle: string;
  /** Human label for the Test Bank capacity, e.g. "20 tests" or "Unlimited". */
  testBankLabel: string;
  /** Renewal status copy (null when no reminder window applies). */
  renewalView: RenewalView | null;
  expiresAtLabel: string;
  reminderOptOut: boolean;
  features: { id: string; name: string }[];
  courses: string[];
  /** True while the catalog that supplies feature and course names is loading. */
  loading?: boolean;
  onRenew: () => void;
  onChangePlan: () => void;
  /** Next higher plan's name and its upgrade action (absent on the top plan). */
  upgradePlanName?: string | null;
  onUpgrade?: () => void;
  onToggleReminders: (next: boolean) => void;
  onOpenFeature: (featureId: string) => void;
};

/** Features that have a destination inside the app. */
const OPENABLE_FEATURES = new Set(["my-day", "revision"]);

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-white/[0.02] p-3">
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
      <span className="text-white/60">{icon}</span>
      {children}
    </h4>
  );
}

export default function MembershipManagement({
  cycle,
  testBankLabel,
  renewalView,
  expiresAtLabel,
  reminderOptOut,
  features,
  courses,
  loading = false,
  onRenew,
  onChangePlan,
  upgradePlanName,
  onUpgrade,
  onToggleReminders,
  onOpenFeature,
}: ProfileMembershipManagement) {
  return (
    <div className="mt-5 space-y-5 border-t border-white/10 pt-5" data-profile-membership-management>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Fact label="Billing" value={cycle === "yearly" ? "Yearly" : "Monthly"} />
        <Fact label="Test Bank capacity" value={testBankLabel} />
        <Fact label="Courses included" value={loading ? "…" : courses.length} />
      </div>

      <div className="rounded-lg bg-white/[0.02] p-3" data-profile-renewal-status>
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <CalendarClock className="h-4 w-4 text-indigo-300" />
          {renewalView ? renewalView.headline : "Your membership is active"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-white/60">
          {renewalView ? renewalView.body : `Your current access stays active until ${expiresAtLabel}.`}
        </p>
      </div>

      <section data-profile-membership-features>
        <SectionTitle icon={<Layers className="h-4 w-4" />}>Your unlocked features</SectionTitle>
        {loading ? (
          <p className="text-xs text-white/50">Loading your features…</p>
        ) : features.length === 0 ? (
          <p className="text-xs text-white/50">No add-on features on this membership yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {features.map((feature) => {
              const openable = OPENABLE_FEATURES.has(feature.id);
              const body = (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{feature.name}</span>
                  {openable ? <ChevronRight className="h-4 w-4 text-white/40" /> : null}
                </>
              );
              return (
                <li key={feature.id}>
                  {openable ? (
                    <button
                      type="button"
                      onClick={() => onOpenFeature(feature.id)}
                      className="flex w-full items-center gap-3 rounded-lg bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.05]"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section data-profile-membership-courses>
        <SectionTitle icon={<BookOpen className="h-4 w-4" />}>Courses included with your plan</SectionTitle>
        {loading ? (
          <p className="text-xs text-white/50">Loading your courses…</p>
        ) : courses.length === 0 ? (
          <p className="text-xs text-white/50">No bonus courses on this membership.</p>
        ) : (
          <ul className="space-y-2">
            {courses.map((title) => (
              <li key={title} className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3">
                <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-300" />
                <span className="min-w-0 truncate text-sm text-white">{title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Renewal reminders</p>
          <p className="text-xs text-white/50">Secure and manual: no auto-charge. Renewal needs your confirmation.</p>
        </div>
        <GlassSwitch
          checked={!reminderOptOut}
          onCheckedChange={(on) => onToggleReminders(!on)}
          ariaLabel="Renewal reminders"
          className="dc-switch shrink-0"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {upgradePlanName && onUpgrade ? (
          <button
            type="button"
            onClick={onUpgrade}
            data-membership-upgrade
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 sm:col-span-2"
          >
            <ArrowUpCircle className="h-4 w-4" />
            Upgrade to {upgradePlanName}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRenew}
          className="rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          Renew early
        </button>
        <button
          type="button"
          onClick={onChangePlan}
          className="flex items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
        >
          <Settings2 className="h-4 w-4" />
          Change plan or features
        </button>
      </div>
      <p className="text-xs leading-relaxed text-white/50">
        Your current access stays active till {expiresAtLabel}. Upgrading to a higher plan keeps your current membership active until the cycle ends.
      </p>
    </div>
  );
}
