import React from 'react';
import { Coupon, ProductWithRating, ThemeName, themes, User, WebsiteSettings } from '../App';

const ProfilePage: React.FC<{ settings: WebsiteSettings; currentUser: User | null; purchasedProducts: ProductWithRating[]; coupons: Coupon[]; onBack: () => void; onExplore: () => void; activeTheme: ThemeName; onThemeChange: (themeName: ThemeName) => void; users: User[]; setUsers: (users: User[]) => void; setCurrentUser: (user: User | null) => void; }> = ({ settings, currentUser, purchasedProducts, coupons, onBack, onExplore, activeTheme, onThemeChange, users, setUsers, setCurrentUser }) => {
  const activeCoupons = coupons.filter(c => c.isActive);
  const studyMinutes = currentUser?.studyMinutes ?? purchasedProducts.length * 25;
  const rewards = (settings.content as any).redeemRewards || [];
  const [redeeming, setRedeeming] = React.useState<string | null>(null);
  const redeem = (r:any) => {
    if (!currentUser || redeeming) return;
    if ((currentUser.eduCoins || 0) < r.cost) return;
    setRedeeming(r.id);
    const updated = { ...currentUser, eduCoins: (currentUser.eduCoins || 0) - r.cost };
    const updatedUsers = users.map(u => u.id === updated.id ? updated : u);
    setUsers(updatedUsers);
    localStorage.setItem('siteUsers', JSON.stringify(updatedUsers));
    setCurrentUser(updated);
    setTimeout(() => setRedeeming(null), 500);
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-4 sm:p-8 text-white">
      <button onClick={onBack} className="mb-6 rounded-2xl bg-white/10 px-5 py-3 font-bold backdrop-blur hover:bg-white/20">← Back</button>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[2rem] border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-200">Learner profile</p>
          <h1 className="mt-3 text-4xl font-black">{currentUser?.name || 'Student'}</h1>
          <p className="mt-2 text-slate-300">{currentUser?.email} {currentUser?.mobile ? `• +91 ${currentUser.mobile}` : ''}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-white/15 p-5"><p className="text-sm text-blue-100">EduCoins</p><p className="text-4xl font-black">🪙 {currentUser?.eduCoins ?? 120}</p></div>
            <div className="rounded-3xl bg-white/15 p-5"><p className="text-sm text-blue-100">Study time</p><p className="text-4xl font-black">{Math.floor(studyMinutes / 60)}h {studyMinutes % 60}m</p></div>
            <div className="rounded-3xl bg-white/15 p-5"><p className="text-sm text-blue-100">Purchased</p><p className="text-4xl font-black">{purchasedProducts.length}</p></div>
          </div>
        </section>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-white/15 bg-white/95 p-6 text-slate-900 shadow-2xl">
            <h2 className="text-2xl font-black">Learning progress</h2>
            <div className="mt-4 space-y-3">
              {purchasedProducts.length ? purchasedProducts.map((product, index) => (
                <div key={product.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex justify-between font-bold"><span>{product.title}</span><span>{Math.min(100, 35 + index * 20)}%</span></div>
                  <div className="mt-2 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500" style={{ width: `${Math.min(100, 35 + index * 20)}%` }} /></div>
                </div>
              )) : <button onClick={onExplore} className="rounded-2xl bg-primary px-5 py-3 font-bold text-white">Explore products</button>}
            </div>
          </section>
          <section className="rounded-[2rem] border border-white/15 bg-white/95 p-6 text-slate-900 shadow-2xl">
            <h2 className="text-2xl font-black">Available coupons</h2>
            <div className="mt-4 grid gap-3">
              {activeCoupons.map(coupon => <div key={coupon.id} className="flex items-center justify-between rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-4"><span className="font-black text-primary">{coupon.code}</span><span className="text-sm font-bold">{coupon.type === 'percentage' ? `${coupon.value}% off` : `₹${coupon.value} off`}</span></div>)}
            </div>
          </section>
        </div>
        <section className="rounded-[2rem] border border-white/15 bg-white/95 p-6 text-slate-900 shadow-2xl">
          <h2 className="text-2xl font-black">What You Can Claim</h2>
          <div className="mt-4 grid gap-2">{rewards.map((r:any) => <button key={r.id} disabled={!!redeeming || (currentUser?.eduCoins||0)<r.cost} onClick={() => redeem(r)} className="flex items-center justify-between rounded-xl border p-3 disabled:opacity-50"><span>{r.title}</span><span className="font-black">🪙 {r.cost}</span></button>)}</div>
        </section>
        <section className="rounded-[2rem] border border-white/15 bg-white/95 p-6 text-slate-900 shadow-2xl">
          <h2 className="text-2xl font-black">Appearance</h2>
          <p className="mt-2 text-sm text-slate-600">Choose your app look from profile.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.values(themes).map((theme) => {
              const key = theme.name.toLowerCase() as ThemeName;
              return <button key={theme.name} onClick={() => onThemeChange(key)} className={`rounded-2xl border p-3 text-left ${activeTheme === key ? 'border-primary bg-primary/10' : 'border-slate-200 bg-white/10 backdrop-blur-xl'}`}>
                <div className="flex -space-x-1"><span className="h-4 w-4 rounded-full border border-white" style={{ background: theme.palette.primaryColor }}></span><span className="h-4 w-4 rounded-full border border-white" style={{ background: theme.palette.backgroundColor }}></span></div>
                <div className="mt-2 text-sm font-bold">{theme.name}</div>
              </button>;
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProfilePage;
