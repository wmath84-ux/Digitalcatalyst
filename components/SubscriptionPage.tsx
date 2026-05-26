import React from 'react';
import { ProductWithRating, WebsiteSettings } from '../App';

interface Plan { id: string; name: string; price: number; description: string; unlockProductIds: number[]; }

const SubscriptionPage: React.FC<{settings: WebsiteSettings; products: ProductWithRating[]; purchasedProductIds: number[]; onBack: () => void; onActivatePlan: (plan: Plan) => void;}> = ({ settings, products, purchasedProductIds, onBack, onActivatePlan }) => {
  const plans: Plan[] = (settings.content as any).subscriptionPlans || [];
  return <div className="min-h-screen bg-slate-950 p-6 text-white">
    <button onClick={onBack} className="mb-6 rounded-xl bg-white/10 px-4 py-2">← Back</button>
    <h1 className="text-4xl font-black">Subscription Studio</h1>
    <p className="mt-2 text-slate-300">Choose a plan to unlock bundled learning products.</p>
    <div className="mt-8 grid gap-5 md:grid-cols-3">
      {plans.map(plan => {
        const allUnlocked = plan.unlockProductIds.every((id: number) => purchasedProductIds.includes(id));
        return <div key={plan.id} className="rounded-3xl border border-white/20 bg-white/10 p-6 backdrop-blur-xl">
          <h3 className="text-2xl font-black">{plan.name}</h3>
          <p className="mt-1 text-slate-300">{plan.description}</p>
          <p className="mt-4 text-4xl font-black">₹{plan.price}</p>
          <ul className="mt-4 space-y-1 text-sm text-slate-200">{plan.unlockProductIds.map((id:number) => <li key={id}>• {products.find(p=>p.id===id)?.title || `Product #${id}`}</li>)}</ul>
          <button disabled={allUnlocked} onClick={() => onActivatePlan(plan)} className="mt-6 w-full rounded-2xl bg-indigo-500 px-4 py-3 font-black disabled:opacity-40">{allUnlocked ? 'Already Active' : 'Activate Plan'}</button>
        </div>
      })}
    </div>
  </div>
};

export default SubscriptionPage;
