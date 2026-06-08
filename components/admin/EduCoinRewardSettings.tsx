import React from 'react';
import { EconomySettings, normalizeEconomySettings, saveEconomySettings } from '../../utils/economy';

interface EduCoinRewardSettingsProps {
  economySettings: EconomySettings;
}

const fieldClass = 'w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm font-black text-slate-900 shadow-sm outline-none backdrop-blur-xl transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100';
const labelClass = 'text-xs font-black uppercase tracking-[0.24em] text-slate-500';
const panelClass = 'rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl';

const EduCoinRewardSettings: React.FC<EduCoinRewardSettingsProps> = ({ economySettings }) => {
  const [draft, setDraft] = React.useState<EconomySettings>(economySettings);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState('Reward logic loaded from Firebase document settings/economy.');

  React.useEffect(() => setDraft(economySettings), [economySettings]);

  const updateNumber = (key: keyof EconomySettings, value: string) => {
    setDraft(prev => normalizeEconomySettings({ ...prev, [key]: Number(value) }));
  };

  const persist = async () => {
    setSaving(true);
    setStatus('Saving EduCoin reward logic...');
    try {
      await saveEconomySettings(draft);
      setStatus('Saved. Reading drawer reward tracking will use the updated minimum time and scroll percentage live.');
    } catch (error) {
      console.error(error);
      setStatus('Save failed. Check Firebase permissions/network and retry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#d8e0ef] bg-[radial-gradient(circle_at_12%_8%,rgba(79,70,229,0.14),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.12),transparent_26%),linear-gradient(135deg,#d8e0ef,#e6ebf4_48%,#d5deec)] p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/75 p-8 shadow-[0_20px_70px_rgba(79,70,229,0.10)] backdrop-blur-3xl">
          <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-emerald-300/30 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.34em] text-emerald-500">EduCoin Reward Logic</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Reading Reward Settings</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                Control the article-read reward gate through the shared economy singleton: <span className="font-black text-slate-900">settings/economy</span>.
              </p>
            </div>
            <button onClick={persist} disabled={saving} className="rounded-2xl bg-gradient-to-r from-emerald-600 to-indigo-600 px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70">
              {saving ? 'Saving...' : 'Save Reward Logic'}
            </button>
          </div>
          <p className="relative mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-5 py-3 text-sm font-bold text-emerald-700">{status}</p>
        </section>

        <section className={panelClass}>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-indigo-500">Read-to-earn gate</p>
          <h2 className="mt-2 text-2xl font-black">Article reward requirements</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <label>
              <span className={labelClass}>Reward coins</span>
              <input className={fieldClass} type="number" min="0" value={draft.coinPerArticleRead} onChange={e => updateNumber('coinPerArticleRead', e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>Minimum time (seconds)</span>
              <input className={fieldClass} type="number" min="0" value={draft.articleReadTimeRequiredSec} onChange={e => updateNumber('articleReadTimeRequiredSec', e.target.value)} />
            </label>
            <label>
              <span className={labelClass}>Minimum scroll (%)</span>
              <input className={fieldClass} type="number" min="0" max="100" value={draft.articleReadScrollRequiredPercent} onChange={e => updateNumber('articleReadScrollRequiredPercent', e.target.value)} />
            </label>
          </div>
          <div className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5 text-sm font-bold leading-7 text-indigo-800">
            Current rule: user must stay active for {draft.articleReadTimeRequiredSec} seconds and scroll at least {draft.articleReadScrollRequiredPercent}% of the article before +{draft.coinPerArticleRead} EduCoins are issued.
          </div>
        </section>

        <section className={panelClass}>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-500">Integration contract</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/60 bg-white/80 p-5">
              <h3 className="font-black">Global state</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-600">App subscribes to settings/economy via subscribeEconomySettings and passes the live EconomySettings object into the reading drawer.</p>
            </div>
            <div className="rounded-3xl border border-white/60 bg-white/80 p-5">
              <h3 className="font-black">Database structure</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Fields saved: coinPerArticleRead, articleReadTimeRequiredSec, articleReadScrollRequiredPercent, and the existing economy fields on the same Firebase document.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default EduCoinRewardSettings;
