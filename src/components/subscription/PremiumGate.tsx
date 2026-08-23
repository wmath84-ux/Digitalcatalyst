// src/components/subscription/PremiumGate.tsx
// Unified premium subscription gate – same beautiful design used for
// Revision Studio and now also for My Day. Supports two modes:
//  - page  : full-screen flex-1 scroll (legacy lock screen)
//  - modal : centered overlay with backdrop, closable

import { X } from "lucide-react";
import {
  BankIcon,
  ChartIcon,
  FlameIcon,
  TargetIcon,
} from "../../revision/components/icons";

type GateVariant = "revision" | "myday";

type Props = {
  variant: GateVariant;
  userName?: string;
  open: boolean;
  onClose: () => void;
  /** called when View subscription CTA clicked */
  onViewSubscription: () => void;
  /** when true renders as page (flex-1) not modal overlay – used for legacy full block */
  asPage?: boolean;
  /** Optional one-liner shown under the heading, e.g. why access is needed. */
  subtitle?: string;
};

type Perk = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
};

const REVISION_PERKS: Perk[] = [
  {
    icon: FlameIcon,
    title: "Daily tests & revision sessions",
    text: "Smart question sets built from your subjects, with instant scoring.",
  },
  {
    icon: BankIcon,
    title: "Full revision bank",
    text: "Every question organised by topic, difficulty and past attempts.",
  },
  {
    icon: TargetIcon,
    title: "Weak-topic detection",
    text: "The engine finds the chapters where marks are leaking and drills them.",
  },
  {
    icon: ChartIcon,
    title: "Progress & analytics",
    text: "Streaks, accuracy trends and session history on one dashboard.",
  },
];

// My Day icons – we keep using the same premium icon family but wrap lucide
// names into component shape to keep uniform rendering path
import {
  ClipboardList,
  CalendarClock as CalendarClockIcon,
  Bell as BellIcon,
  NotebookPen as NotebookPenIcon,
} from "lucide-react";
import { useBranding } from "@/context/BrandingContext";

function wrapLucide(Lucide: React.ComponentType<{ className?: string }>) {
  return (props: { className?: string }) => <Lucide {...props} />;
}

const MYDAY_PERKS: Perk[] = [
  {
    icon: wrapLucide(ClipboardList),
    title: "Today Tasks & Goals",
    text: "Har din ke tasks plan karo, priority set karo aur progress live track karo.",
  },
  {
    icon: wrapLucide(CalendarClockIcon),
    title: "Smart Schedule & Timeline",
    text: "Classes, study blocks aur breaks ko ek hi beautiful timeline me manage karo.",
  },
  {
    icon: wrapLucide(BellIcon),
    title: "Reminders & Smart Alerts",
    text: "Koi bhi deadline miss mat karo — time par notifications pao.",
  },
  {
    icon: wrapLucide(NotebookPenIcon),
    title: "Quick Notes & Cloud Sync",
    text: "Ideas turant capture karo, sab devices me auto-sync aur safe cloud backup.",
  },
];

function GateContent({
  variant,
  userName,
  onClose,
  onViewSubscription,
  asPage,
  subtitle,
}: Omit<Props, "open">) {
  const isMyDay = variant === "myday";
  const perks = isMyDay ? MYDAY_PERKS : REVISION_PERKS;

  return (
    <div
      className={
        asPage
          ? "min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-white [-webkit-overflow-scrolling:touch]"
          : "relative w-full max-h-[92vh] overflow-y-auto overscroll-y-contain rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-[2rem]"
      }
    >
      <div className="relative px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
        {/* blurred blobs for premium feel */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 top-40 h-56 w-56 rounded-full bg-violet-100/60 blur-3xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-indigo-600 ring-1 ring-indigo-100">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            {isMyDay ? "My Day Premium" : "Subscription feature"}
          </div>

          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
            {isMyDay ? (
              <>
                {userName ? `${userName}, ` : ""}apna din{" "}
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  My Day Premium
                </span>{" "}
                se supercharge karo
              </>
            ) : (
              <>
                {userName ? `${userName}, ` : ""}aapki{" "}
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  Revision Studio
                </span>{" "}
                membership Plus+ me hai
              </>
            )}
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {subtitle ? (
              subtitle
            ) : isMyDay ? (
              <>
                <span className="font-semibold text-slate-700">My Day</span> me tasks, schedule, reminders aur quick notes — sab kuch cloud-synced aur premium timeline ke saath.
                Ab har din zyada organized, har goal zyada clear.
              </>
            ) : (
              <>
                Daily tests, smart revision sessions aur weak-topic analytics ab {appName} Plus+ subscription ka hissa hain. Subscribe karke turant shuru karo.
              </>
            )}
          </p>
        </div>

        <div className="relative mt-6 space-y-3">
          {perks.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 ring-1 ring-indigo-100">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-7 rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-violet-700 p-5 text-white shadow-xl shadow-indigo-200">
          <p className="text-[11px] font-black uppercase tracking-wider text-indigo-200">{`${appName} Plus+`}</p>
          <h2 className="mt-1 text-lg font-black">
            {isMyDay ? "My Day + Revision + premium content, ek hi plan me" : "Revision + My Day + premium content, ek hi plan mein"}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-indigo-100">
            {isMyDay ? (
              "Subscribe karte hi My Day fully unlock — unlimited tasks, smart schedule, reminders aur notes ka cloud save. Plus Revision Studio ka full access."
            ) : (
              "Feature kharidte hi Revision Studio khul jata hai — aur subscription active rahte tak aapke saare tests, streaks aur progress saved rehte hain."
            )}
          </p>
          <button
            type="button"
            onClick={onViewSubscription}
            className="mt-4 w-full rounded-2xl bg-white py-3.5 text-sm font-black text-indigo-700 shadow-lg transition hover:bg-indigo-50 active:scale-[0.99]"
          >
            View subscription
          </button>
          {asPage ? (
            <button
              type="button"
              onClick={onClose}
              className="mt-2.5 w-full rounded-2xl py-2.5 text-xs font-bold text-indigo-100 transition hover:text-white"
            >
              Go back to Home
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="mt-2.5 w-full rounded-2xl py-2 text-xs font-bold text-indigo-200 transition hover:text-white"
            >
              Maybe later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PremiumGate({
  variant,
  userName,
  open,
  onClose,
  onViewSubscription,
  asPage = false,
  subtitle,
}: Props) {
  const { appName } = useBranding();
  if (!open) return null;

  if (asPage) {
    return (
      <GateContent
        variant={variant}
        userName={userName}
        onClose={onClose}
        onViewSubscription={onViewSubscription}
        asPage
        subtitle={subtitle}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating iframe-style frame for the subscription gate */}
        <div className="overflow-hidden rounded-[1.75rem] border-4 border-white/80 bg-white shadow-[0_25px_70px_-12px_rgba(79,70,229,0.5)] ring-1 ring-indigo-200">
          <GateContent
            variant={variant}
            userName={userName}
            onClose={onClose}
            onViewSubscription={onViewSubscription}
            asPage={false}
            subtitle={subtitle}
          />
        </div>

        {/* Gradient blue shadow cross button, OUTSIDE the frame, to close the gate */}
        <div className="mt-4 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close subscription gate"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-indigo-600 to-violet-700 text-white shadow-[0_12px_32px_-4px_rgba(37,99,235,0.75)] ring-4 ring-white/40 transition hover:scale-110 active:scale-95"
          >
            <X className="h-6 w-6" strokeWidth={2.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
