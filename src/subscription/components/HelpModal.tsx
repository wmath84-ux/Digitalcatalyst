import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronDown,
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
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const toggle = (i: number) =>
    setExpandedIdx((prev) => (prev === i ? null : i));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-[28px] bg-white shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120) onClose();
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-slate-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4 pt-1">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Help & FAQ
                </h2>
                <p className="text-xs text-slate-400">
                  Everything you need to know
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform"
                aria-label="Close"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {/* FAQ Accordion */}
              <div className="space-y-2.5">
                {FAQS.map((faq, i) => {
                  const isOpen = expandedIdx === i;
                  return (
                    <div
                      key={i}
                      className={`overflow-hidden rounded-2xl border transition-colors ${
                        isOpen
                          ? "border-violet-200 bg-violet-50/50"
                          : "border-slate-100 bg-white"
                      }`}
                    >
                      <button
                        onClick={() => toggle(i)}
                        className="flex w-full items-center gap-3 p-3.5 text-left"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
                          {faq.icon}
                        </span>
                        <span className="flex-1 text-sm font-bold text-slate-800">
                          {faq.q}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <p className="px-3.5 pb-4 text-[13px] leading-relaxed text-slate-500">
                              {faq.a}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* Contact section */}
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-bold text-slate-700">
                  Still need help?
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                      <MessageCircle className="h-5 w-5 text-blue-500" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">
                        Live Chat
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Available 24/7 — average response 2 min
                      </p>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-100" />
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                      <Mail className="h-5 w-5 text-violet-500" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">
                        Email Support
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {supportEmail}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                      <Phone className="h-5 w-5 text-amber-500" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">
                        Call Us
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {supportPhone}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom button */}
            <div className="border-t border-slate-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                onClick={onClose}
                className="w-full rounded-2xl bg-slate-900 py-3.5 text-center text-sm font-bold text-white active:scale-[0.98] transition-transform"
              >
                Got it, thanks!
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
