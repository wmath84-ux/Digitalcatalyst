import React, { useMemo, useState } from 'react';
import { Coupon } from '../../App';
import MacWindowModal from '../ui/MacWindowModal';

const CouponFormModal: React.FC<{ coupon?: Coupon | null; onSave: (coupon: Omit<Coupon, 'id' | 'timesUsed'>) => void; onClose: () => void }> = ({ coupon, onSave, onClose }) => {
  const [formData, setFormData] = useState({ code: coupon?.code || '', type: coupon?.type || 'percentage', value: coupon?.value || 0, expiryDate: coupon?.expiryDate || '', isActive: coupon?.isActive ?? true, usageLimit: coupon?.usageLimit || 100 });
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
  };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave({ ...formData, value: Number(formData.value), usageLimit: Number(formData.usageLimit) }); };
  return (
    <MacWindowModal title={coupon ? 'Edit Coupon' : 'Create Coupon'} subtitle="Clean discount setup" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <input name="code" value={formData.code} onChange={handleChange} placeholder="Code e.g. SAVE20" required className="w-full rounded-2xl border bg-slate-50 p-4 font-black uppercase tracking-wider" />
        <div className="grid grid-cols-2 gap-4"><select name="type" value={formData.type} onChange={handleChange} className="rounded-2xl border bg-white/70 backdrop-blur-xl p-4"><option value="percentage">Percentage (%)</option><option value="fixed">Fixed (₹)</option></select><input name="value" type="number" value={formData.value} onChange={handleChange} placeholder="Value" required className="rounded-2xl border bg-slate-50 p-4" /></div>
        <input name="expiryDate" type="date" value={formData.expiryDate} onChange={handleChange} required className="w-full rounded-2xl border bg-slate-50 p-4" />
        <input name="usageLimit" type="number" value={formData.usageLimit} onChange={handleChange} placeholder="Usage limit" required className="w-full rounded-2xl border bg-slate-50 p-4" />
        <label className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4 font-bold text-emerald-800"><span>Active coupon</span><input name="isActive" type="checkbox" checked={formData.isActive} onChange={handleChange} className="h-5 w-5" /></label>
        <div className="flex justify-end gap-3 pt-3"><button type="button" onClick={onClose} className="rounded-xl px-5 py-3 font-bold text-slate-600">Cancel</button><button type="submit" className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 font-black text-white">Save Coupon</button></div>
      </form>
    </MacWindowModal>
  );
};

const StatCard: React.FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => <div className={`rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${tone}`}><p className="text-sm font-bold opacity-70">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>;

const CouponManagement: React.FC<{ coupons: Coupon[]; onUpdate: (coupons: Coupon[]) => void; }> = ({ coupons, onUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [query, setQuery] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const filtered = coupons.filter(c => c.code.toLowerCase().includes(query.toLowerCase()));
  const stats = useMemo(() => ({ active: coupons.filter(c => c.isActive).length, expired: coupons.filter(c => c.expiryDate < today).length, used: coupons.reduce((sum, c) => sum + c.timesUsed, 0), limited: coupons.filter(c => c.timesUsed >= c.usageLimit).length }), [coupons, today]);
  const handleSave = (couponData: Omit<Coupon, 'id' | 'timesUsed'>) => { if (editingCoupon) onUpdate(coupons.map(c => c.id === editingCoupon.id ? { ...c, ...couponData } : c)); else onUpdate([{ ...couponData, id: Date.now(), timesUsed: 0 }, ...coupons]); setIsModalOpen(false); setEditingCoupon(null); };
  const handleDelete = (id: number) => { if (window.confirm('Delete this coupon?')) onUpdate(coupons.filter(c => c.id !== id)); };
  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-black uppercase tracking-[0.25em] text-blue-500">Discount studio</p><h1 className="text-4xl font-black text-slate-900">Coupons</h1><p className="text-slate-600">Clean controls for offers, limits, and learner rewards.</p></div><button onClick={() => { setEditingCoupon(null); setIsModalOpen(true); }} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 font-black text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]">+ Create Coupon</button></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Active" value={stats.active} tone="bg-emerald-50 text-emerald-700" /><StatCard label="Expired" value={stats.expired} tone="bg-rose-50 text-rose-700" /><StatCard label="Redemptions" value={stats.used} tone="bg-blue-50 text-blue-700" /><StatCard label="Limit reached" value={stats.limited} tone="bg-amber-50 text-amber-700" /></div>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search coupon code..." className="w-full rounded-2xl border border-slate-200 bg-white/70 backdrop-blur-xl p-4 shadow-sm" />
      <div className="grid gap-4 lg:grid-cols-2">{filtered.map(coupon => <article key={coupon.id} className="rounded-[1.5rem] border border-slate-100 bg-white/70 backdrop-blur-xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex items-start justify-between gap-4"><div><p className="text-2xl font-black text-primary">{coupon.code}</p><p className="mt-1 text-sm text-slate-600">{coupon.type === 'percentage' ? `${coupon.value}% discount` : `₹${coupon.value} discount`} • expires {coupon.expiryDate}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${coupon.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{coupon.isActive ? 'ACTIVE' : 'OFF'}</span></div><div className="mt-4 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (coupon.timesUsed / Math.max(1, coupon.usageLimit)) * 100)}%` }} /></div><div className="mt-4 flex items-center justify-between text-sm font-bold text-slate-600"><span>{coupon.timesUsed}/{coupon.usageLimit} used</span><span className="space-x-3"><button onClick={() => { setEditingCoupon(coupon); setIsModalOpen(true); }} className="text-blue-600">Edit</button><button onClick={() => handleDelete(coupon.id)} className="text-rose-600">Delete</button></span></div></article>)}</div>
      {isModalOpen && <CouponFormModal coupon={editingCoupon} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};
export default CouponManagement;
