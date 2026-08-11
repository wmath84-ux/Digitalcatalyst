import { ChevronRight, FileText, Lock, ShieldCheck } from "lucide-react";
import { Sheet } from "./Sheet";
import { useApp } from "../context/AppContext";
import type { NotificationSettings, PrivacySettings } from "../types";

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-neutral-200"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notifSettings, toggleNotif, privacySettings, togglePrivacy, showToast } = useApp();

  const notifLabels: { key: keyof NotificationSettings; label: string; desc: string }[] = [
    { key: "push", label: "Push Notifications", desc: "Reminders, streaks & alerts" },
    { key: "email", label: "Email Updates", desc: "Weekly digest & receipts" },
    { key: "sms", label: "SMS Alerts", desc: "OTP & urgent account alerts" },
    { key: "promotions", label: "Promotions", desc: "Offers, coupons & discounts" },
  ];

  const privacyLabels: { key: keyof PrivacySettings; label: string; desc: string }[] = [
    { key: "profileVisible", label: "Public Profile", desc: "Show my profile on leaderboard" },
    { key: "shareActivity", label: "Share Activity", desc: "Let friends see your progress" },
    { key: "personalizedAds", label: "Personalized Ads", desc: "Use activity to tailor ads" },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <section className="mb-6">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-400">
          Notifications
        </p>
        <div className="divide-y divide-neutral-100 rounded-2xl bg-neutral-50 ring-1 ring-neutral-100">
          {notifLabels.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-neutral-800">{label}</p>
                <p className="text-[10.5px] text-neutral-400">{desc}</p>
              </div>
              <Toggle checked={notifSettings[key]} onChange={() => toggleNotif(key)} />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-400">
          <Lock className="h-3.5 w-3.5" /> Privacy
        </p>
        <div className="divide-y divide-neutral-100 rounded-2xl bg-neutral-50 ring-1 ring-neutral-100">
          {privacyLabels.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-neutral-800">{label}</p>
                <p className="text-[10.5px] text-neutral-400">{desc}</p>
              </div>
              <Toggle checked={privacySettings[key]} onChange={() => togglePrivacy(key)} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-neutral-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Legal & Policies
        </p>
        <div className="divide-y divide-neutral-100 rounded-2xl bg-neutral-50 ring-1 ring-neutral-100">
          {["Terms of Service", "Privacy Policy", "Refund Policy", "Community Guidelines"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => showToast(`Opening ${item}...`, "info")}
              className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-neutral-100"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-neutral-800">
                <FileText className="h-3.5 w-3.5 text-neutral-400" />
                {item}
              </span>
              <ChevronRight className="h-4 w-4 text-neutral-300" />
            </button>
          ))}
        </div>
      </section>
    </Sheet>
  );
}
