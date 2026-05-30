import React from 'react';
import { ProductWithRating, WebsiteSettings } from '../App';

interface Plan { id: string; name: string; price: number; description: string; unlockProductIds: number[]; badge?: string; }

const SubscriptionPage: React.FC<{settings: WebsiteSettings; products: ProductWithRating[]; purchasedProductIds: number[]; onBack: () => void; onActivatePlan: (plan: Plan) => void;}> = ({ settings, products, purchasedProductIds, onBack, onActivatePlan }) => {
  const plans: Plan[] = (settings.content as any).subscriptionPlans || [];
  const totalUnlockedProducts = plans.reduce((ids, plan) => new Set([...ids, ...(plan.unlockProductIds || [])]), new Set<number>()).size;
  const highlightedPlanIndex = plans.length > 1 ? 1 : 0;
  const lowestPlanPrice = plans.length ? Math.min(...plans.map(plan => plan.price || 0)) : 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 pb-36 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(37,99,235,0.38),transparent_28%),radial-gradient(circle_at_82%_5%,rgba(168,85,247,0.28),transparent_30%),linear-gradient(180deg,rgba(2,6,23,0.90),rgba(2,6,23,1))]" />
      <div className="absolute left-1/2 top-0 h-px w-[84%] -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />

      <main className="relative mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10">
        <button onClick={onBack} className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 font-bold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/15">← Back</button>

        <section className="mt-10 grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-cyan-200">Premium learning access</p>
            <h1 className="mt-4 text-5xl font-black leading-tight sm:text-6xl">Subscription Studio</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">Choose a bundled plan and unlock premium notes, courses, and learning resources inside one focused workspace.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-center backdrop-blur-2xl">
              <p className="text-3xl font-black text-cyan-100">{plans.length}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Plans</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-center backdrop-blur-2xl">
              <p className="text-3xl font-black text-cyan-100">{totalUnlockedProducts}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Products</p>
            </div>
            <div className="col-span-2 rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-center backdrop-blur-2xl sm:col-span-1">
              <p className="text-3xl font-black text-cyan-100">₹{lowestPlanPrice}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Starts from</p>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const allUnlocked = (plan.unlockProductIds || []).every((id: number) => purchasedProductIds.includes(id));
            const isHighlighted = index === highlightedPlanIndex;
            const unlockedProducts = (plan.unlockProductIds || []).map((id:number) => products.find(product => product.id === id)?.title || `Product #${id}`);

            return (
              <article key={plan.id} className={`group relative flex min-h-[25rem] flex-col overflow-hidden rounded-[2rem] border p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_28px_80px_rgba(2,6,23,0.45)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 ${isHighlighted ? 'border-cyan-200/40 bg-cyan-200/[0.10]' : 'border-white/10 bg-white/[0.07]'}`}>
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-0 transition group-hover:opacity-100" />
                {isHighlighted && <span className="mb-5 w-fit rounded-full border border-cyan-200/40 bg-cyan-200/15 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-100">{plan.badge || 'Best Value'}</span>}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-black text-white">{plan.name}</h2>
                    <p className="mt-2 min-h-14 text-base leading-7 text-slate-300">{plan.description}</p>
                  </div>
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-2xl">💎</div>
                </div>

                <div className="mt-6 flex items-end gap-2">
                  <p className="text-5xl font-black tracking-tight">₹{plan.price}</p>
                  <p className="pb-2 text-sm font-bold text-slate-400">/ access</p>
                </div>

                <div className="mt-6 flex-1 rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100">Included</p>
                  <ul className="mt-3 space-y-3 text-sm text-slate-200">
                    {unlockedProducts.length ? unlockedProducts.map(title => <li key={title} className="flex gap-2"><span className="text-emerald-300">✓</span><span>{title}</span></li>) : <li className="text-slate-400">No products selected yet.</li>}
                  </ul>
                </div>

                <button disabled={allUnlocked} onClick={() => onActivatePlan(plan)} className={`mt-6 w-full rounded-2xl px-5 py-4 font-black transition ${allUnlocked ? 'cursor-not-allowed bg-white/10 text-slate-400' : 'bg-gradient-to-r from-cyan-200 to-blue-300 text-slate-950 shadow-2xl shadow-cyan-500/20 hover:-translate-y-0.5 hover:shadow-cyan-500/30'}`}>{allUnlocked ? 'Already Active' : 'Activate Plan'}</button>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
};

export default SubscriptionPage;
