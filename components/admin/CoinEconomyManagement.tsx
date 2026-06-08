import React from 'react';
import { ProductWithRating, WebsiteSettings } from '../../App';
import { EconomySettings, normalizeEconomySettings, saveEconomySettings } from '../../utils/economy';

interface CoinEconomyManagementProps {
  economySettings: EconomySettings;
  products: ProductWithRating[];
  websiteSettings: WebsiteSettings;
}

const fieldClass = 'w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm font-black text-slate-900 shadow-sm outline-none backdrop-blur-xl transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100';
const labelClass = 'text-xs font-black uppercase tracking-[0.24em] text-slate-500';
const panelClass = 'rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl';

const CoinEconomyManagement: React.FC<CoinEconomyManagementProps> = ({ economySettings, products, websiteSettings }) => {
  const [draft, setDraft] = React.useState<EconomySettings>(economySettings);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState('Live settings loaded from settings/economy.');
  const plans = (websiteSettings.content as any).subscriptionPlans || [];

  React.useEffect(() => setDraft(economySettings), [economySettings]);

  const updateNumber = (key: keyof EconomySettings, value: string) => {
    setDraft(prev => normalizeEconomySettings({ ...prev, [key]: Number(value) }));
  };

  const updateOverride = (bucket: 'productOverrides' | 'subscriptionOverrides', targetId: string, field: 'coinPrice' | 'maxDiscountPercentage', value: string) => {
    setDraft(prev => normalizeEconomySettings({
      ...prev,
      [bucket]: {
        ...prev[bucket],
        [targetId]: {
          ...(prev[bucket][targetId] || { targetId }),
          targetId,
          [field]: value === '' ? undefined : Number(value),
        },
      },
    }));
  };

  const removeOverride = (bucket: 'productOverrides' | 'subscriptionOverrides', targetId: string) => {
    setDraft(prev => {
      const next = { ...prev[bucket] };
      delete next[targetId];
      return normalizeEconomySettings({ ...prev, [bucket]: next });
    });
  };

  const persist = async () => {
    setSaving(true);
    setStatus('Saving economy settings...');
    try {
      await saveEconomySettings(draft);
      setStatus('Saved. Every learner checkout and reward screen will receive the live update.');
    } catch (error) {
      console.error(error);
      setStatus('Save failed. Check Firebase permissions/network and retry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#d8e0ef] bg-[radial-gradient(circle_at_12%_8%,rgba(79,70,229,0.14),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.12),transparent_26%),linear-gradient(135deg,#d8e0ef,#e6ebf4_48%,#d5deec)] p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/75 p-8 shadow-[0_20px_70px_rgba(79,70,229,0.10)] backdrop-blur-3xl">
          <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-indigo-300/30 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.34em] text-indigo-500">EduCoin Economy</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Central Control Dashboard</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">Tune earning rates, redemption ratio, maximum discounts, and per-product overrides from one Firebase singleton document: <span className="font-black text-slate-900">settings/economy</span>.</p>
            </div>
            <button onClick={persist} disabled={saving} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70">{saving ? 'Saving...' : 'Save Economy'}</button>
          </div>
          <p className="relative mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-5 py-3 text-sm font-bold text-indigo-700">{status}</p>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className={panelClass}>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-emerald-500">Earning Control Engine</p>
            <h2 className="mt-2 text-2xl font-black">Global learner rewards</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>Coins / video minute</span><input className={fieldClass} type="number" min="0" value={draft.coinPerVideoMinute} onChange={e => updateNumber('coinPerVideoMinute', e.target.value)} /></label>
              <label><span className={labelClass}>Coins / article read</span><input className={fieldClass} type="number" min="0" value={draft.coinPerArticleRead} onChange={e => updateNumber('coinPerArticleRead', e.target.value)} /></label>
              <label><span className={labelClass}>Article read time (sec)</span><input className={fieldClass} type="number" min="0" value={draft.articleReadTimeRequiredSec} onChange={e => updateNumber('articleReadTimeRequiredSec', e.target.value)} /></label>
              <label><span className={labelClass}>Coins / quiz correct</span><input className={fieldClass} type="number" min="0" value={draft.coinPerQuizCorrect} onChange={e => updateNumber('coinPerQuizCorrect', e.target.value)} /></label>
              <label><span className={labelClass}>Coins / purchase</span><input className={fieldClass} type="number" min="0" value={draft.coinPerPurchase} onChange={e => updateNumber('coinPerPurchase', e.target.value)} /></label>
            </div>
          </div>

          <div className={panelClass}>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-500">Redemption Control Engine</p>
            <h2 className="mt-2 text-2xl font-black">Global checkout conversion</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>Coins = ₹1</span><input className={fieldClass} type="number" min="1" value={draft.coinToFiatRatio} onChange={e => updateNumber('coinToFiatRatio', e.target.value)} /></label>
              <label><span className={labelClass}>Max discount %</span><input className={fieldClass} type="number" min="0" max="100" value={draft.maxDiscountPercentage} onChange={e => updateNumber('maxDiscountPercentage', e.target.value)} /></label>
            </div>
            <div className="mt-6 rounded-3xl border border-amber-100 bg-amber-50/70 p-5 text-sm font-bold text-amber-800">Current rule: {draft.coinToFiatRatio} Coins = ₹1, capped at {draft.maxDiscountPercentage}% unless an override is set.</div>
          </div>
        </section>

        <section className={panelClass}>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-fuchsia-500">Custom Overrides</p>
          <h2 className="mt-2 text-2xl font-black">Products and subscriptions</h2>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-black">Real Products</h3>
              {products.filter(product => product.isVisible !== false).map(product => {
                const override = draft.productOverrides[String(product.id)] || { targetId: String(product.id) };
                return <div key={product.id} className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-sm"><p className="font-black">{product.title}</p><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><input className={fieldClass} type="number" placeholder="Custom coin price" value={override.coinPrice ?? ''} onChange={e => updateOverride('productOverrides', String(product.id), 'coinPrice', e.target.value)} /><input className={fieldClass} type="number" placeholder="Max discount %" value={override.maxDiscountPercentage ?? ''} onChange={e => updateOverride('productOverrides', String(product.id), 'maxDiscountPercentage', e.target.value)} /><button className="rounded-2xl border border-rose-100 px-4 py-2 text-sm font-black text-rose-600" onClick={() => removeOverride('productOverrides', String(product.id))}>Clear</button></div></div>;
              })}
            </div>
            <div className="space-y-3">
              <h3 className="font-black">Subscriptions</h3>
              {plans.map((plan: any) => {
                const override = draft.subscriptionOverrides[String(plan.id)] || { targetId: String(plan.id) };
                return <div key={plan.id} className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-sm"><p className="font-black">{plan.name} • ₹{plan.price}</p><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><input className={fieldClass} type="number" placeholder="Custom coin price" value={override.coinPrice ?? ''} onChange={e => updateOverride('subscriptionOverrides', String(plan.id), 'coinPrice', e.target.value)} /><input className={fieldClass} type="number" placeholder="Max discount %" value={override.maxDiscountPercentage ?? ''} onChange={e => updateOverride('subscriptionOverrides', String(plan.id), 'maxDiscountPercentage', e.target.value)} /><button className="rounded-2xl border border-rose-100 px-4 py-2 text-sm font-black text-rose-600" onClick={() => removeOverride('subscriptionOverrides', String(plan.id))}>Clear</button></div></div>;
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CoinEconomyManagement;
