
import React, { useState } from 'react';
import { Coupon } from '../../App';

// ... (Keep CouponFormModal exactly as before)
const CouponFormModal: React.FC<{ coupon?: Coupon | null; onSave: (coupon: Omit<Coupon, 'id' | 'timesUsed'>) => void; onClose: () => void }> = ({ coupon, onSave, onClose }) => {
    const [formData, setFormData] = useState({
        code: coupon?.code || '', type: coupon?.type || 'percentage', value: coupon?.value || 0, expiryDate: coupon?.expiryDate || '', isActive: coupon?.isActive ?? true, usageLimit: coupon?.usageLimit || 100,
    });
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
    };
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave({ ...formData, value: Number(formData.value), usageLimit: Number(formData.usageLimit) }); };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in-up">
                <div className="bg-slate-50 p-6 border-b border-slate-100"><h2 className="text-xl font-bold text-slate-800">{coupon ? 'Edit Coupon' : 'New Coupon'}</h2></div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <input name="code" value={formData.code} onChange={handleChange} placeholder="Code (e.g., SAVE20)" required className="w-full p-3 border rounded-lg bg-slate-50 font-bold text-slate-700 tracking-wide uppercase" />
                    <div className="grid grid-cols-2 gap-4">
                        <select name="type" value={formData.type} onChange={handleChange} className="w-full p-3 border rounded-lg bg-white"><option value="percentage">Percentage (%)</option><option value="fixed">Fixed (₹)</option></select>
                        <input name="value" type="number" value={formData.value} onChange={handleChange} placeholder="Value" required className="w-full p-3 border rounded-lg bg-slate-50" />
                    </div>
                    <input name="expiryDate" type="date" value={formData.expiryDate} onChange={handleChange} required className="w-full p-3 border rounded-lg bg-slate-50" />
                    <input name="usageLimit" type="number" value={formData.usageLimit} onChange={handleChange} placeholder="Limit" required className="w-full p-3 border rounded-lg bg-slate-50" />
                    <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50"><input type="checkbox" name="isActive" checked={formData.isActive} onChange={handleChange} className="w-5 h-5 text-blue-600 rounded" /><span className="font-medium text-slate-700">Active</span></label>
                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const CouponManagement: React.FC<{ coupons: Coupon[]; onUpdate: (updatedCoupons: Coupon[]) => void; }> = ({ coupons, onUpdate }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

    const handleSave = (couponData: Omit<Coupon, 'id' | 'timesUsed'>) => {
        if (editingCoupon) onUpdate(coupons.map(c => c.id === editingCoupon.id ? { ...editingCoupon, ...couponData } : c));
        else onUpdate([{ ...couponData, id: Date.now(), timesUsed: 0 }, ...coupons]);
        setIsModalOpen(false);
    };
    const handleDelete = (id: number) => { if (window.confirm('Delete coupon?')) onUpdate(coupons.filter(c => c.id !== id)); };
    const handleToggleStatus = (id: number) => onUpdate(coupons.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c));

    return (
        <div className="animate-fade-in-up">
            <div className="flex justify-between items-center mb-8">
                <div><h1 className="text-3xl font-extrabold text-slate-800">Coupons</h1><p className="text-slate-500 mt-1">Manage discounts and promo codes.</p></div>
                <button onClick={() => { setEditingCoupon(null); setIsModalOpen(true); }} className="bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl shadow-lg hover:bg-indigo-700 transition-all hover:-translate-y-0.5">+ Create Coupon</button>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Code</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Discount</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Usage</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {coupons.map(coupon => (
                                <tr key={coupon.id} className="hover:bg-slate-50/80 transition-all duration-200 hover:shadow-inner">
                                    <td className="p-3 sm:p-5"><span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">{coupon.code}</span></td>
                                    <td className="p-3 sm:p-5 font-medium text-slate-700">{coupon.type === 'percentage' ? `${coupon.value}%` : `₹${coupon.value}`}</td>
                                    <td className="p-3 sm:p-5 text-sm text-slate-500">{coupon.timesUsed} / {coupon.usageLimit}</td>
                                    <td className="p-3 sm:p-5"><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={coupon.isActive} onChange={() => handleToggleStatus(coupon.id)} className="sr-only peer" /><div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div></label></td>
                                    <td className="p-3 sm:p-5 text-right space-x-3"><button onClick={() => { setEditingCoupon(coupon); setIsModalOpen(true); }} className="text-blue-600 font-bold text-sm hover:underline">Edit</button><button onClick={() => handleDelete(coupon.id)} className="text-red-600 font-bold text-sm hover:underline">Delete</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {isModalOpen && <CouponFormModal coupon={editingCoupon} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

export default CouponManagement;
