import { GlassSheet, GlassSheetContent, GlassSheetTitle, GlassSheetDescription } from "../../components/ui/glass-sheet";
import { GlassAccordion, GlassAccordionItem, GlassAccordionTrigger, GlassAccordionContent } from "../../components/ui/glass-accordion";
import { GlassButton } from "../../components/ui/glass-button";
import { GlassCard } from "../../components/ui/GlassCard";
import {
  X,
  MessageCircle,
  Mail,
  Phone,
  Shield,
  CreditCard,
  RefreshCw,
  BookOpen,
  Zap,
} from "lucide-react";
import { useBranding } from "../../context/BrandingContext";

interface FaqItem {
  q: string;
  a: string;
  icon: React.ReactNode;
}

const FAQS: FaqItem[] = [
  {
    q: "What is the Pro Unified Plan?",
    a: "The Pro Unified Plan gives you a single subscription to access all courses and premium features. You can choose a monthly or yearly billing cycle and customize exactly which courses and add-on features you want.",
    icon: <Zap className="h-4 w-4 text-violet-500" />,
  },
  {
    q: "How does pricing work?",
    a: "Your final price is the base plan fee plus the total of selected courses and add-on features. Apply coupon or referral codes for extra discounts. The yearly plan saves you up to 50% compared to monthly billing.",
    icon: <CreditCard className="h-4 w-4 text-emerald-500" />,
  },
  {
    q: "Can I change my selected courses later?",
    a: "Yes! You can add or remove courses and features anytime from your account settings. Price adjustments will reflect in your next billing cycle.",
    icon: <BookOpen className="h-4 w-4 text-blue-500" />,
  },
  {
    q: "What is the cancellation policy?",
    a: "You can cancel anytime. Monthly plans stop at the end of the current month. Yearly plans run until the end of the year. No hidden charges or cancellation fees.",
    icon: <RefreshCw className="h-4 w-4 text-amber-500" />,
  },
  {
    q: "Is my payment secure?",
    a: "Absolutely. We use 256-bit SSL encryption and are PCI-DSS compliant. Your payment data is never stored on our servers. We partner with Stripe for safe processing.",
    icon: <Shield className="h-4 w-4 text-rose-500" />,
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function HelpModal({ open, onClose }: Props) {
  // Support contact comes from the admin-branded settings (settings/branding)
  // so the email + phone shown here are the real ones, not placeholders.
  const { supportEmail, supportPhone } = useBranding();

  // Phase A: the sheet, the FAQ accordion and the CTA are the website-glass
  // pack at its defaults — no hand-painted white sheet, no framer drag.
  return (
    <GlassSheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <GlassSheetContent side="bottom" className="max-h-[88vh] text-white" aria-label="Help & FAQ" data-subscription-help-sheet>
        <div className="flex items-center justify-between pb-4">
          <div>
            <GlassSheetTitle>Help &amp; FAQ</GlassSheetTitle>
            <GlassSheetDescription>Everything you need to know</GlassSheetDescription>
          </div>
          <GlassButton onClick={onClose} aria-label="Close" className="[&_.size-12]:size-9">
            <X className="h-4 w-4" />
          </GlassButton>
        </div>

        <GlassAccordion type="single" data-subscription-help-faq>
          {FAQS.map((faq, i) => (
            <GlassAccordionItem key={i} value={`faq-${i}`}>
              <GlassAccordionTrigger>
                <span className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-200">{faq.icon}</span>
                  <span className="text-sm font-bold">{faq.q}</span>
                </span>
              </GlassAccordionTrigger>
              <GlassAccordionContent>
                <p className="text-[13px] leading-relaxed text-white/70">{faq.a}</p>
              </GlassAccordionContent>
            </GlassAccordionItem>
          ))}
        </GlassAccordion>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-bold text-white/85">Still need help?</h3>
          <div className="space-y-2">
            <GlassCard contentClassName="flex items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
                <MessageCircle className="h-5 w-5 text-blue-300" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-bold">Live Chat</p>
                <p className="text-[11px] text-white/55">Available 24/7 — average response 2 min</p>
              </div>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
            </GlassCard>
            <GlassCard contentClassName="flex items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15">
                <Mail className="h-5 w-5 text-violet-300" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-bold">Email Support</p>
                <p className="text-[11px] text-white/55">{supportEmail}</p>
              </div>
            </GlassCard>
            <GlassCard contentClassName="flex items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
                <Phone className="h-5 w-5 text-amber-300" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-bold">Call Us</p>
                <p className="text-[11px] text-white/55">{supportPhone}</p>
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="pt-5 pb-[env(safe-area-inset-bottom)]">
          <GlassButton variant="capsule" onClick={onClose} className="w-full [&>span>div]:w-full">
            Got it, thanks!
          </GlassButton>
        </div>
      </GlassSheetContent>
    </GlassSheet>
  );
}
