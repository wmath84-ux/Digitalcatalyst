"use client";

import { useEffect, useState } from "react";
import { ErrorState, Field, LoadingState, PrimaryButton, SectionCard, inputClass } from "@/components/admin/ui";
import { useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

type Settings = {
  coinsPerVideoMinute: number;
  coinsPerPurchase: number;
  coinsToInrRatio: string;
  maxCheckoutDiscountPercent: number;
};

export function CoinEconomyPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();

  const load = async () => {
    try {
      const res = await adminFetch<{ settings: Settings }>("/api/admin/rewards/coin-economy");
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coin economy settings.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await adminFetch<{ settings: Settings }>("/api/admin/rewards/coin-economy", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      notify("success", "Coin economy updated.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <LoadingState />;

  return (
    <SectionCard title="Coin economy configuration" description="Article/quiz coin rules are hidden — those features are not active in this app.">
      <div className="space-y-3">
        <Field label="Coins per video minute watched">
          <input className={inputClass} type="number" value={settings.coinsPerVideoMinute} onChange={(e) => setSettings({ ...settings, coinsPerVideoMinute: Number(e.target.value) })} />
        </Field>
        <Field label="Coins per purchase">
          <input className={inputClass} type="number" value={settings.coinsPerPurchase} onChange={(e) => setSettings({ ...settings, coinsPerPurchase: Number(e.target.value) })} />
        </Field>
        <Field label="Coins-to-INR ratio" hint="e.g. 1 coin = ₹1">
          <input className={inputClass} type="number" step="0.01" value={settings.coinsToInrRatio} onChange={(e) => setSettings({ ...settings, coinsToInrRatio: e.target.value })} />
        </Field>
        <Field label="Max checkout discount (%)">
          <input className={inputClass} type="number" value={settings.maxCheckoutDiscountPercent} onChange={(e) => setSettings({ ...settings, maxCheckoutDiscountPercent: Number(e.target.value) })} />
        </Field>
        <PrimaryButton className="w-full" loading={saving} onClick={save}>Save coin economy</PrimaryButton>
      </div>
    </SectionCard>
  );
}
