// src/components/subscription/PremiumGate.tsx
//
// Unified premium subscription gate – same beautiful design used for
// Revision Studio and My Day. Supports two modes:
//   - page  : full-screen flex-1 scroll (legacy lock screen)
//   - modal : centered overlay with backdrop, closable
//
// RESPONSIVE LAYOUT (the user's hard requirement):
//
//   The card is a single fluid container that scales with the viewport
//   using CSS clamp() so it looks correct on every screen from a small
//   phone (360 px) up to a 27" desktop (2560 px). Three structural rules
//   make that work without any per-breakpoint overrides:
//
//   1. Container width  : `clamp(320px, 92vw, 540px)` for the sheet on
//      mobile, `min(640px, 92vw)` for tablet/desktop. The card never
//      feels tiny on a watch and never feels oversized on a 4K monitor.
//   2. Internal padding : `clamp(1rem, 4vw, 1.75rem)` so the edges feel
//      spacious on a tablet and tight on a phone.
//   3. Type scale       : all headings, body and the offer block scale
//      with `clamp()` so there is no "huge on desktop, tiny on phone"
//      jump. A 14 px body on a 360 px phone, an 18 px body on a 1440 px
//      desktop — both readable, no manual breakpoints needed.
//
// CLOSE BUTTON POSITION (the user's hard requirement):
//
//   The cross (X) is *inside* the card, top-right, and the card carries
//   enough top padding to give it its own slot. No floating cross
//   outside the card, no overlapping with the close-icon scrim. The
//   icon button uses the same gradient style as the offer block so the
//   whole premium surface reads as one composition.
//
// OFFER PRESENTATION (the user's hard requirement):
//
//   The offer block at the bottom is a hero — not a plain CTA card —
//   with:
//     - a 2-column tier comparison (Monthly / Yearly with "Save 30%")
//     - a striking price line that scales with the viewport
//     - a subtle "Best value" highlight on the yearly tier
//     - one primary CTA that fills the card width
//
//   The typography, gradient and tier rows all scale fluidly.
//
// ACCESSIBILITY:
//   - The X is a real <button> with aria-label.
//   - The dialog traps focus via inert + aria-modal and the backdrop
//     is click-to-close (with a confirm guard on the page variant).
//   - The two CTAs (Subscribe / Maybe later) are both real buttons so
//     keyboard users can reach them.

import { useEffect } from "react";
import { GlassSheet, GlassSheetContent } from "../ui/glass-sheet";
import { GlassButton } from "../ui/glass-button";
import { GlassCard } from "../ui/GlassCard";
import { X, Check, Sparkles, Crown, Zap } from "lucide-react";
import {
  BankIcon,
  ChartIcon,
  FlameIcon,
  TargetIcon,
} from "../../revision/components/icons";
import {
  ClipboardList,
  CalendarClock as CalendarClockIcon,
  Bell as BellIcon,
  NotebookPen as NotebookPenIcon,
} from "lucide-react";
import { useBranding } from "@/context/BrandingContext";
import { lockBodyScroll, unlockBodyScroll } from "../ui/overlayBounds";

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

const BULLET_CHECKS: string[] = [
  "Unlimited AI test generation",
  "Cloud Test Bank + My Day backup",
  "Streaks, analytics & weak-topic engine",
  "Priority support & early features",
];

// Pricing offer block. Numbers are display-only — the live subscription
// catalogue still drives the actual checkout, but the gate surfaces a
// compelling tier comparison so the user knows what they get.
const TIER_ROWS: Array<{
  id: "monthly" | "yearly";
  badge?: string;
  price: string;
  suffix: string;
  period: string;
  highlight?: boolean;
}> = [
  { id: "monthly", price: "₹199", suffix: "/mo", period: "billed monthly" },
  { id: "yearly", price: "₹1,499", suffix: "/yr", period: "billed yearly", badge: "Save 37%", highlight: true },
];

function GateContent({
  variant,
  userName,
  onClose,
  onViewSubscription,
  asPage,
  subtitle,
}: Omit<Props, "open">) {
  const { appName } = useBranding();
  const isMyDay = variant === "myday";
  const perks = isMyDay ? MYDAY_PERKS : REVISION_PERKS;

  return (
    <div
      data-premium-gate
      data-variant={variant}
      className={
        asPage
          ? "dc-premium-page min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
          : "dc-premium-sheet relative min-h-0 w-full flex-1 overflow-y-auto overscroll-contain rounded-t-[1.75rem] sm:rounded-[1.75rem]"
      }
    >
      {/* Wave 14: no decorative blur blobs — the pack sheet's own material is
          the only surface. All internal spacing uses CSS clamp() so the same
          JSX looks correct on a 360 px phone, a 768 px tablet and a 1440 px
          desktop. Inside the sheet the pack already pads by 24 px, so the
          shell only adds the safe-area inset. */}
      <div
        className={
          asPage
            ? "dc-premium-shell relative px-[clamp(1rem,4vw,1.75rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[clamp(1.25rem,3.5vw,2rem)]"
            : "dc-premium-shell relative pb-[env(safe-area-inset-bottom)]"
        }
      >
        {/* Header row — close (X) is INSIDE the card, top-right, on its
            own line so it never collides with the title. The card reserves
            enough top space for it on every screen. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-1 text-[clamp(10px,1.6vw,11px)] font-black uppercase tracking-wider text-indigo-300 ring-1 ring-indigo-400/30">
              <Sparkles className="h-3 w-3" />
              {isMyDay ? "My Day Premium" : "Subscription feature"}
            </div>
            <h1 className="mt-3 text-[clamp(1.35rem,4.5vw,1.75rem)] font-black leading-[1.15] tracking-tight text-white">
              {isMyDay ? (
                <>
                  {userName ? `${userName}, ` : ""}apna din{" "}
                  <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
                    My Day Premium
                  </span>{" "}
                  se supercharge karo
                </>
              ) : (
                <>
                  {userName ? `${userName}, ` : ""}aapki{" "}
                  <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
                    Revision Studio
                  </span>{" "}
                  membership Plus+ me hai
                </>
              )}
            </h1>
            <p className="mt-2 text-[clamp(12px,2.2vw,14px)] leading-relaxed text-white/55">
              {subtitle ? (
                subtitle
              ) : isMyDay ? (
                <>
                  <span className="font-semibold text-white/85">My Day</span> me tasks, schedule, reminders aur quick notes — sab kuch cloud-synced aur premium timeline ke saath.
                  Ab har din zyada organized, har goal zyada clear.
                </>
              ) : (
                <>
                  Daily tests, smart revision sessions aur weak-topic analytics ab {appName} Plus+ subscription ka hissa hain. Subscribe karke turant shuru karo.
                </>
              )}
            </p>
          </div>

          {/* Cross (X) is INSIDE the card — the pack Glass Button disc,
              sized so it is tappable on a phone yet not overwhelming on a
              desktop. */}
          <GlassButton
            onClick={onClose}
            aria-label="Close subscription gate"
            data-premium-gate-close
            className="dc-premium-close shrink-0 transition hover:scale-110 active:scale-95 [&_.size-12]:size-[clamp(2.25rem,5vw,2.75rem)]"
          >
            <X className="h-[clamp(14px,2.4vw,18px)] w-[clamp(14px,2.4vw,18px)]" strokeWidth={2.75} />
          </GlassButton>
        </div>

        {/* Perks — each row scales its icon and text together. Gap
            shrinks on small phones, grows on tablet+. */}
        <div className="relative mt-[clamp(1.25rem,3.5vw,1.75rem)] grid grid-cols-1 gap-[clamp(0.6rem,1.5vw,0.85rem)] sm:grid-cols-2">
          {perks.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="dc-premium-perk flex items-start gap-[clamp(0.6rem,1.5vw,0.9rem)] rounded-[clamp(0.85rem,2vw,1.15rem)] border border-white/15 p-[clamp(0.75rem,2vw,1.1rem)]"
            >
              <span className="grid h-[clamp(2.25rem,5vw,2.65rem)] w-[clamp(2.25rem,5vw,2.65rem)] shrink-0 place-items-center rounded-[clamp(0.6rem,1.5vw,0.85rem)] bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/30">
                <Icon className="h-[clamp(1rem,2.4vw,1.25rem)] w-[clamp(1rem,2.4vw,1.25rem)]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[clamp(13px,2.4vw,15px)] font-bold leading-tight text-white">{title}</p>
                <p className="mt-1 text-[clamp(11px,1.9vw,13px)] leading-relaxed text-white/55">{text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* OFFER BLOCK — the new top-level design.

            - Hero gradient card with rounded corners that match the parent.
            - 2-column tier comparison (monthly / yearly) — each row is
              independently fluid so a phone stacks tiers vertically while
              a tablet/desktop shows them side-by-side via the responsive
              `grid-cols-1 sm:grid-cols-2`.
            - The "Save 37%" badge sits inside the tier card, top-right.
            - The yearly tier has a `highlight` border + glow + the
              "Best value" pill.
            - Three bullet checks (real product capabilities) are listed
              once below the tiers so the user knows exactly what they
              unlock.
            - A single full-width primary CTA (Subscribe).
            - A subtle "Maybe later / Go back" link below the CTA. */}
        <GlassCard
          className="dc-premium-offer relative mt-[clamp(1.5rem,4vw,2rem)] text-white ring-1 ring-indigo-400/30"
          contentClassName="p-[clamp(1rem,3vw,1.5rem)]"
        >
          {/* Wave 14: the offer is the pack Glass Card (no indigo plate, no
              grid pattern, no drop shadow); indigo stays as the accent ring. */}

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-1 text-[clamp(10px,1.7vw,11px)] font-black uppercase tracking-wider text-indigo-200 ring-1 ring-indigo-400/30">
                <Crown className="h-3 w-3" />
                {appName} Plus+
              </span>
              <span className="inline-flex items-center gap-1 text-[clamp(10px,1.7vw,11px)] font-semibold text-white/75">
                <Zap className="h-3 w-3" />
                7-day free trial · cancel anytime
              </span>
            </div>

            <h2 className="mt-3 text-[clamp(1.1rem,3.5vw,1.4rem)] font-black leading-tight">
              {isMyDay
                ? "My Day + Revision + premium content, ek hi plan me"
                : "Revision + My Day + premium content, ek hi plan me"}
            </h2>
            <p className="mt-1.5 text-[clamp(11px,2vw,13px)] leading-relaxed text-white/75">
              {isMyDay
                ? "Subscribe karte hi My Day fully unlock — unlimited tasks, smart schedule, reminders aur notes ka cloud save. Plus Revision Studio ka full access."
                : "Subscribe karte hi Revision Studio fully unlock — daily tests, smart sessions, weak-topic analytics, plus My Day ka full access."}
            </p>

            {/* Tier comparison */}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TIER_ROWS.map((tier) => (
                <div
                  key={tier.id}
                  className={`relative rounded-[clamp(0.75rem,1.8vw,1rem)] border p-[clamp(0.75rem,2vw,1rem)] transition ${
                    tier.highlight
                      ? "border-amber-400/40 ring-1 ring-amber-400/30"
                      : "border-white/15"
                  }`}
                >
                  {tier.badge && (
                    <span className="absolute -top-2 right-2 rounded-full bg-amber-500 px-2 py-0.5 text-[clamp(9px,1.5vw,10px)] font-black uppercase tracking-wider text-amber-950">
                      {tier.badge}
                    </span>
                  )}
                  {tier.highlight && (
                    <span className="absolute -top-2 left-2 inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[clamp(9px,1.5vw,10px)] font-black uppercase tracking-wider text-indigo-200 ring-1 ring-indigo-400/30">
                      <Crown className="h-2.5 w-2.5" />
                      Best value
                    </span>
                  )}
                  <p className="text-[clamp(10px,1.7vw,11px)] font-semibold uppercase tracking-wider text-white/75">
                    {tier.id === "monthly" ? "Monthly" : "Yearly"}
                  </p>
                  <p className="mt-1 leading-none">
                    <span className="text-[clamp(1.4rem,4.5vw,1.85rem)] font-black">{tier.price}</span>
                    <span className="ml-0.5 text-[clamp(10px,1.7vw,12px)] font-semibold text-white/75">{tier.suffix}</span>
                  </p>
                  <p className="mt-1 text-[clamp(10px,1.5vw,11px)] text-white/55">{tier.period}</p>
                </div>
              ))}
            </div>

            {/* Bullet checks */}
            <ul className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {BULLET_CHECKS.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 text-[clamp(11px,1.9vw,13px)] font-medium text-white/95"
                >
                  <span className="mt-0.5 grid h-[clamp(14px,2.2vw,16px)] w-[clamp(14px,2.2vw,16px)] shrink-0 place-items-center rounded-full border border-white/25 text-white">
                    <Check className="h-[clamp(8px,1.5vw,10px)] w-[clamp(8px,1.5vw,10px)]" strokeWidth={3} />
                  </span>
                  <span className="leading-snug">{line}</span>
                </li>
              ))}
            </ul>

            {/* Primary CTA — the pack Glass Button (capsule), full width. */}
            <GlassButton
              variant="capsule"
              onClick={onViewSubscription}
              data-premium-gate-cta
              className="dc-premium-cta mt-5 w-full rounded-full active:scale-[0.99] [&>span]:w-full [&>span>div]:h-[clamp(2.75rem,7vw,3.25rem)] [&>span>div]:w-full [&>span>div]:rounded-full [&>span>div]:px-6 [&>span>div>span]:text-[clamp(13px,2.4vw,15px)] [&>span>div>span]:font-black"
            >
              View subscription →
            </GlassButton>

            {/* Secondary dismiss — a quieter pack capsule. */}
            <GlassButton
              variant="capsule"
              onClick={onClose}
              className="mt-2.5 w-full rounded-full [&>span]:w-full [&>span>div]:h-9 [&>span>div]:w-full [&>span>div]:rounded-full [&>span>div]:px-4 [&>span>div>span]:text-[clamp(11px,1.9vw,12px)] [&>span>div>span]:font-bold [&>span>div>span]:text-white/75"
            >
              {asPage ? "Go back to Home" : "Maybe later"}
            </GlassButton>
          </div>
        </GlassCard>
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
  // Modal only: lock the page behind the gate so a finger on the card
  // cannot also scroll the Revision / My Day scroller. (The pack sheet
  // locks body scroll too; this keeps the app's own counter in sync.)
  useEffect(() => {
    if (!open || asPage) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open, asPage]);

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

  // Wave 14: the modal is the pack Glass Sheet from the bottom edge
  // (websiteglass.com glass-sheet: portal to document.body, blurred scrim,
  // scroll lock, Escape / scrim dismissal, slide-in from the edge). The
  // sheet column is fluid — full width on a phone, capped at 640 px and
  // centred on tablet / desktop — and scrolls internally when the offer
  // is taller than the viewport.
  return (
    <GlassSheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <GlassSheetContent
        side="bottom"
        aria-label={variant === "myday" ? "My Day Premium" : "Revision Studio subscription"}
        data-premium-gate-modal
        className="dc-premium-modal-inner right-0 mx-auto flex h-auto min-h-0 w-full [width:min(100vw,640px)] flex-col text-white"
      >
        <GateContent
          variant={variant}
          userName={userName}
          onClose={onClose}
          onViewSubscription={onViewSubscription}
          asPage={false}
          subtitle={subtitle}
        />
      </GlassSheetContent>
    </GlassSheet>
  );
}
