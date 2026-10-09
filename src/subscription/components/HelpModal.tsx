import {
  GlassSheet,
  GlassSheetContent,
  GlassSheetTitle,
  GlassSheetDescription,
} from "../../components/ui/glass-sheet";
import { useBranding } from "../../context/BrandingContext";

const FAQS = [
  {
    q: "What will I pay?",
    a: "The summary lists your plan, selected add-ons and any verified code discount. Included and already-purchased items are not charged again. Checkout checks the final payable and any minimum-payable rule before payment.",
  },
  {
    q: "How long does access last?",
    a: "Subscription access lasts for the selected monthly or yearly period. Add-ons bought for an active membership keep its existing expiry; they do not start a new membership period.",
  },
  {
    q: "Can I upgrade or renew?",
    a: "Active members can add new courses or features, or choose a higher plan. Already-paid items carry over at ₹0. A lower plan, or switching an active yearly plan to monthly, is not allowed. Renewal of the same package opens in the last 7 days before expiry.",
  },
  {
    q: "Will I be charged automatically?",
    a: "No. Renewals are manual and require your confirmation. You can manage renewal reminders and see your access expiry in Profile.",
  },
  {
    q: "What happens during payment?",
    a: "Paid orders use Razorpay. Access is granted only after the server verifies payment. If you cancel or a payment fails, return to checkout to retry. A server-verified ₹0 order does not require the payment gateway.",
  },
];
export default function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { supportEmail, supportPhone } = useBranding();
  return (
    <GlassSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <GlassSheetContent
        side="bottom"
        className="dc-subscription-picker max-h-[85vh] overflow-y-auto"
        aria-label="Subscription help"
        data-subscription-help-sheet
      >
        <header>
          <div>
            <GlassSheetTitle>Subscription help</GlassSheetTitle>
            <GlassSheetDescription>Pricing, access and renewal rules.</GlassSheetDescription>
          </div>
          <button type="button" className="dc-subscription-text-action" onClick={onClose}>
            Close
          </button>
        </header>
        <div data-subscription-help-faq>
          {FAQS.map((faq) => (
            <details key={faq.q} className="dc-subscription-disclosure">
              <summary>{faq.q}</summary>
              <p className="dc-subscription-note">{faq.a}</p>
            </details>
          ))}
        </div>
        <section className="dc-subscription-section">
          <h2>Contact support</h2>
          {supportEmail ? (
            <a className="dc-subscription-text-action" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
          ) : null}
          {supportPhone ? (
            <a className="dc-subscription-text-action" href={`tel:${supportPhone}`}>
              {supportPhone}
            </a>
          ) : null}
          {!supportEmail && !supportPhone ? (
            <p className="dc-subscription-note">No support contact is currently configured.</p>
          ) : null}
        </section>
      </GlassSheetContent>
    </GlassSheet>
  );
}
