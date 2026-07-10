import React, { useEffect, useMemo, useState } from 'react';
import { Coupon, ProductWithRating, User, WebsiteSettings } from '../App';
import UserAvatar from './common/UserAvatar';
import { RememberedAuthAccount } from '../utils/rememberedAuth';
import { ProductImageSlot, getProductImage, getProductImageFallback } from '../utils/productImages';
import SafeImage from './common/SafeImage';
import { ensureUserCoinWallet, watchUserCoinWallet } from '../utils/coinWallet';

interface MobileAppHomeProps {
  settings: WebsiteSettings;
  currentUser: User | null;
  isLoggedIn: boolean;
  rememberedAccount?: RememberedAuthAccount | null;
  purchasedProducts: ProductWithRating[];
  topRatedProducts: ProductWithRating[];
  visibleProducts: ProductWithRating[];
  purchasedProductIds: number[];
  wishlist: number[];
  coupons: Coupon[];
  cartCount: number;
  onViewPurchasedProduct: (product: ProductWithRating) => void;
  onViewProduct: (product: ProductWithRating, sectionId?: string) => void;
  onToggleWishlist: (id: number) => void;
  onNavigateToAllProducts: () => void;
  onNavigateToPurchases: () => void;
  onNavigateToFreeProducts: () => void;
  onOpenNews: () => void;
  onCartClick: () => void;
  onProfileClick: () => void;
  onAuthClick: (mode: 'login' | 'signup') => void;
}

const currency = (product: ProductWithRating) => product.salePrice || product.price || '₹0';
const progressFor = (product: ProductWithRating, index = 0) => Math.min(92, Math.max(18, ((product.id * 17) + (index * 11)) % 100));
const ProductCover: React.FC<{ product: ProductWithRating; compact?: boolean; slot: ProductImageSlot; priority?: boolean }> = ({ product, compact, slot, priority = false }) => {
  const image = getProductImage(product, slot);
  if (image) return <SafeImage src={image} fallbackSrc={getProductImageFallback(product)} alt={product.title} className="h-full w-full object-contain" fallbackTitle={product.title} fallbackBadge={product.category || 'Course'} fallbackIcon="🎓" fallbackMessage="Image preview unavailable" aspect={compact ? 'square' : 'video'} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" loadTimeoutMs={priority ? 7000 : 9000} />;
  return (
    <div className="flex h-full w-full flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_20%_15%,#7C4DFF_0,transparent_34%),linear-gradient(135deg,#071742,#0B63FF_58%,#DCCBFF)] p-3 text-white">
      <span className="w-fit rounded-full bg-white/18 px-2 py-1 text-[9px] font-black uppercase tracking-wider">{product.category || 'Course'}</span>
      <div>
        <p className={`${compact ? 'text-[11px]' : 'text-sm'} font-black leading-tight text-white line-clamp-2`}>{product.title}</p>
        <p className="mt-1 text-[9px] font-bold text-blue-100">Digital Catalyst</p>
      </div>
    </div>
  );
};

const SectionHead: React.FC<{ title: string; subtitle?: string; onViewAll?: () => void }> = ({ title, subtitle, onViewAll }) => (
  <div className="mb-3 flex items-end justify-between gap-3 px-1">
    <div>
      <h2 className="text-xl font-black tracking-tight text-[#081A44]">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-xs font-semibold text-[#64708F]">{subtitle}</p> : null}
    </div>
    {onViewAll ? <button type="button" onClick={onViewAll} className="shrink-0 text-xs font-black text-[#0B63FF]">View All ›</button> : null}
  </div>
);

const MobileAppHome: React.FC<MobileAppHomeProps> = ({
  settings,
  currentUser,
  isLoggedIn,
  rememberedAccount,
  purchasedProducts,
  topRatedProducts,
  visibleProducts,
  purchasedProductIds,
  wishlist,
  coupons,
  cartCount,
  onViewPurchasedProduct,
  onViewProduct,
  onToggleWishlist,
  onNavigateToAllProducts,
  onNavigateToPurchases,
  onNavigateToFreeProducts,
  onOpenNews,
  onCartClick,
  onProfileClick,
  onAuthClick,
}) => {
  const [query, setQuery] = useState('');
  const siteName = settings.content.siteName || 'Digital Catalyst';
  const ownedPreview = purchasedProducts[0];
  const allPreview = useMemo(() => visibleProducts.filter(product => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [product.title, product.description, product.category, ...(product.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(q);
  }).slice(0, 6), [visibleProducts, query]);
  const topPreview = topRatedProducts.slice(0, 4);
  const [mobileCoinBalance, setMobileCoinBalance] = useState<number | null>(null);
  const walletUserId = currentUser?.uid || (currentUser?.id ? String(currentUser.id) : '');

  useEffect(() => {
    if (!isLoggedIn || !walletUserId) {
      setMobileCoinBalance(null);
      return undefined;
    }

    ensureUserCoinWallet(walletUserId).catch((error) => {
      console.error('Mobile home coin wallet setup failed:', error);
    });

    const unsubscribe = watchUserCoinWallet(
      walletUserId,
      (wallet) => setMobileCoinBalance(wallet.coinBalance),
      (error) => {
        console.error('Mobile home coin wallet watch failed:', error);
        setMobileCoinBalance(null);
      }
    );

    return () => unsubscribe();
  }, [isLoggedIn, walletUserId]);

  const coins = mobileCoinBalance ?? currentUser?.eduCoins ?? 0;
  const resolvedPhotoURL = currentUser?.profilePhotoSet === true ? String(currentUser.photoURL || '').trim() : '';
  const loggedOutAuthMode: 'login' | 'signup' = rememberedAccount ? 'login' : 'signup';
  const loggedOutAuthLabel = rememberedAccount ? 'Login' : 'Sign Up';
  const activeCoupons = coupons.filter(coupon => coupon.isActive).slice(0, 3);
  const scrollToMobileSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const chips = [
    { label: 'My Purchases', icon: '📚', action: onNavigateToPurchases, active: true },
    { label: 'Free Resources', icon: '🎁', action: onNavigateToFreeProducts },
    { label: 'Top Rated', icon: '⭐', action: () => scrollToMobileSection('mobile-top-rated-products') },
    { label: 'Coupons', icon: '🏷️', action: () => scrollToMobileSection('mobile-coupons'), count: activeCoupons.length },
    { label: 'News', icon: '📰', action: onOpenNews },
  ];

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_12%_3%,rgba(191,215,255,0.78),transparent_30%),radial-gradient(circle_at_92%_12%,rgba(220,203,255,0.52),transparent_28%),linear-gradient(180deg,#F5F9FF_0%,#EEF6FF_44%,#FFFFFF_100%)] px-4 pb-44 pt-[max(14px,env(safe-area-inset-top))] text-[#64708F]">
      <header className="sticky top-2 z-30 mb-5 flex items-center gap-3 rounded-[28px] border border-[#D8E6FF]/90 bg-white/86 p-3 shadow-[0_18px_50px_rgba(11,99,255,0.12)] backdrop-blur-2xl">
        <button type="button" onClick={onNavigateToAllProducts} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#0B63FF] to-[#7C4DFF] text-xl shadow-[0_10px_24px_rgba(11,99,255,0.28)]">⚡</button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-[#081A44]">{siteName}</p>
          <p className="text-[11px] font-bold text-[#64708F]">Premium learning store</p>
        </div>
        <button type="button" onClick={onCartClick} className="relative grid h-10 w-10 place-items-center rounded-2xl border border-[#D8E6FF] bg-[#F5F9FF] text-lg text-[#081A44]">🛒{cartCount > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-[#0B63FF] px-1.5 text-[10px] font-black text-white">{cartCount}</span> : null}</button>
        {isLoggedIn && currentUser ? (
          <>
            <button type="button" onClick={onProfileClick} className="grid h-10 w-10 place-items-center rounded-2xl border border-[#D8E6FF] bg-white text-lg" aria-label="Open profile"><UserAvatar name={currentUser.name} email={currentUser.email} photoURL={resolvedPhotoURL} size={34} /></button>
            <button type="button" onClick={onProfileClick} className="flex h-10 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-black text-[#081A44]">🪙 {coins}</button>
          </>
        ) : (
          <button type="button" onClick={() => onAuthClick(loggedOutAuthMode)} className="flex h-10 shrink-0 items-center rounded-full border border-[#BFD7FF] bg-white/95 px-3 text-xs font-black text-[#081A44] shadow-[0_10px_24px_rgba(11,99,255,0.10)] transition hover:-translate-y-0.5 hover:border-[#0B63FF] hover:text-[#0B63FF]" aria-label={loggedOutAuthLabel}>
            {loggedOutAuthLabel}
          </button>
        )}
      </header>

      <section className="relative overflow-hidden rounded-[28px] border border-[#D8E6FF] bg-[linear-gradient(135deg,#FFFFFF_0%,#EEF6FF_42%,#EDE7FF_100%)] p-5 shadow-[0_24px_70px_rgba(11,99,255,0.14)]">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#DCCBFF]/70 blur-2xl" />
        <div className="absolute bottom-0 right-3 h-28 w-28 rounded-full bg-[#BFD7FF]/80 blur-2xl" />
        <div className="relative grid grid-cols-[1.1fr_0.9fr] gap-2">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#BFD7FF] bg-white/70 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#0B63FF]">💎 Premium Learning Store</span>
            <h1 className="mt-4 text-[28px] font-black leading-[1.03] tracking-tight text-[#081A44]">Welcome to Digital Catalyst</h1>
            <p className="mt-3 text-[13px] font-semibold leading-5 text-[#64708F]">Learn, buy and access premium notes, courses and digital products.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={onNavigateToAllProducts} className="rounded-2xl bg-[#0B63FF] px-4 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(11,99,255,0.30)]">🛍️ Explore Products</button>
              <button type="button" onClick={onNavigateToPurchases} className="rounded-2xl border border-[#D8E6FF] bg-white/82 px-4 py-3 text-sm font-black text-[#081A44]">📄 My Purchases</button>
            </div>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="relative h-40 w-full rounded-[26px] bg-white/40">
              <div className="absolute left-3 top-8 h-20 w-20 rotate-[-10deg] rounded-2xl bg-gradient-to-br from-[#071742] to-[#0B63FF] shadow-xl"><span className="absolute left-3 top-3 text-4xl">🎓</span></div>
              <div className="absolute bottom-6 right-2 h-24 w-20 rotate-6 rounded-2xl bg-gradient-to-br from-[#7C4DFF] to-[#DCCBFF] p-2 shadow-xl"><div className="h-full rounded-xl bg-white/30" /><span className="absolute bottom-2 left-4 text-3xl">📚</span></div>
              <div className="absolute right-8 top-2 h-16 w-14 -rotate-6 rounded-xl bg-white p-2 shadow-lg"><div className="h-1.5 rounded bg-[#0B63FF]/50" /><div className="mt-2 h-1.5 rounded bg-[#D8E6FF]" /><div className="mt-2 h-1.5 rounded bg-[#D8E6FF]" /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[24px] border border-[#D8E6FF] bg-white p-3 shadow-[0_16px_42px_rgba(11,99,255,0.10)]">
        <label className="flex items-center gap-3 rounded-[20px] bg-[#F5F9FF] px-4 py-3">
          <span>🔎</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onNavigateToAllProducts(); }} placeholder="Search notes, courses, resources..." className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#081A44] outline-none placeholder:text-[#64708F]/75" /><button type="button" onClick={onNavigateToAllProducts}>🎚️</button>
        </label>
      </section>

      <nav className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-2 custom-scrollbar">
        {chips.map(chip => <button key={chip.label} type="button" onClick={chip.action} className={`shrink-0 rounded-full border px-4 py-3 text-xs font-black shadow-[0_10px_24px_rgba(11,99,255,0.08)] ${chip.active ? 'border-[#0B63FF] bg-[#0B63FF] text-white' : 'border-[#D8E6FF] bg-white text-[#081A44]'}`}>{chip.icon} {chip.label}{chip.count ? ` (${chip.count})` : ''}</button>)}
      </nav>

      <section className="mt-5"><SectionHead title="Continue Learning" subtitle="Access your purchased products instantly." onViewAll={onNavigateToPurchases} />
        {ownedPreview ? <article className="rounded-[26px] border border-[#D8E6FF] bg-white p-3 shadow-[0_18px_50px_rgba(11,99,255,0.10)]"><div className="flex gap-3"><div className="h-28 w-28 shrink-0 overflow-hidden rounded-[22px]"><ProductCover product={ownedPreview} slot="purchaseSquare" priority /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><span className="rounded-full bg-[#E9F8F0] px-2 py-1 text-[10px] font-black text-[#16B364]">Purchased</span><button className="text-[#64708F]">⋯</button></div><h3 className="mt-2 line-clamp-1 text-base font-black text-[#081A44]">{ownedPreview.title}</h3><p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#64708F]">{ownedPreview.description}</p><p className="mt-2 text-[11px] font-black text-[#0B63FF]">{progressFor(ownedPreview)}% Completed</p><div className="mt-1 h-2 rounded-full bg-[#EEF6FF]"><div className="h-full rounded-full bg-[#0B63FF]" style={{ width: `${progressFor(ownedPreview)}%` }} /></div><button onClick={() => onViewPurchasedProduct(ownedPreview)} className="mt-3 rounded-xl bg-[#081A44] px-3 py-2 text-xs font-black text-white">Access Files</button></div></div></article> : <div className="rounded-[26px] border border-dashed border-[#BFD7FF] bg-white/78 p-5 text-center shadow-[0_18px_50px_rgba(11,99,255,0.08)]"><p className="text-3xl">📚</p><h3 className="mt-2 text-lg font-black text-[#081A44]">No purchases yet</h3><p className="mt-1 text-sm font-semibold text-[#64708F]">Start with a premium course or free resource.</p><button onClick={onNavigateToAllProducts} className="mt-4 rounded-2xl bg-[#0B63FF] px-5 py-3 text-sm font-black text-white">Explore Products</button></div>}
      </section>

      {topPreview.length > 0 && <section id="mobile-top-rated-products" className="mt-7 scroll-mt-24"><SectionHead title="Top Rated Products" onViewAll={onNavigateToAllProducts} /><div className="grid grid-cols-2 gap-3">{topPreview.map(product => <article key={product.id} className="rounded-[24px] border border-[#D8E6FF] bg-white p-2.5 shadow-[0_16px_42px_rgba(11,99,255,0.09)]"><div className="relative aspect-square overflow-hidden rounded-[20px]"><ProductCover product={product} compact slot="homeTopRated" /><button onClick={() => onToggleWishlist(product.id)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow">{wishlist.includes(product.id) ? '❤️' : '♡'}</button></div><h3 className="mt-2 line-clamp-2 min-h-9 text-sm font-black leading-tight text-[#081A44]">{product.title}</h3><p className="mt-1 text-[11px] font-bold text-[#64708F]">⭐ <span className="text-[#FFB020]">{product.rating.toFixed(1)}</span> ({product.reviewCount})</p><div className="mt-2 flex items-center justify-between"><span className="font-black text-[#081A44]">{currency(product)}</span><button onClick={() => onViewProduct(product)} className="rounded-full bg-[#EEF6FF] px-3 py-1.5 text-xs font-black text-[#0B63FF]">View</button></div></article>)}</div></section>}

      <section id="mobile-coupons" className="mt-7 scroll-mt-24"><SectionHead title="Coupons" subtitle="Apply active offers during checkout." onViewAll={onNavigateToAllProducts} /><div className="space-y-3">{activeCoupons.length > 0 ? activeCoupons.map(coupon => <article key={coupon.id} className="flex items-center justify-between gap-3 rounded-[24px] border border-[#D8E6FF] bg-white p-4 shadow-[0_14px_36px_rgba(11,99,255,0.08)]"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#0B63FF]">Active Coupon</p><h3 className="mt-1 text-lg font-black text-[#081A44]">{coupon.code}</h3><p className="mt-1 text-xs font-bold text-[#64708F]">{coupon.type === 'percentage' ? `${coupon.value}% off` : `₹${coupon.value} off`} • valid till {coupon.expiryDate || 'checkout'}</p></div><button type="button" onClick={onNavigateToAllProducts} className="shrink-0 rounded-2xl bg-[#EEF6FF] px-4 py-2 text-xs font-black text-[#0B63FF]">Use</button></article>) : <div className="rounded-[24px] border border-dashed border-[#BFD7FF] bg-white/78 p-5 text-center font-bold text-[#64708F]">No active coupons right now.</div>}</div></section>

      <section className="mt-7"><SectionHead title="All Products" subtitle="Browse all premium learning products." onViewAll={onNavigateToAllProducts} /><div className="space-y-3">{allPreview.length > 0 ? allPreview.map(product => <article key={product.id} className="relative rounded-[26px] border border-[#D8E6FF] bg-white p-3 shadow-[0_16px_42px_rgba(11,99,255,0.08)]"><button onClick={() => onToggleWishlist(product.id)} className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow">{wishlist.includes(product.id) ? '❤️' : '♡'}</button><div className="flex gap-3"><div className="w-24 shrink-0 overflow-hidden rounded-[22px] aspect-[6/7]"><ProductCover product={product} slot="homeList" /></div><div className="min-w-0 flex-1 pr-10"><div className="flex max-w-full flex-wrap items-center gap-2 overflow-visible pb-0.5">{purchasedProductIds.includes(product.id) && (<span className="inline-flex max-w-full shrink-0 items-center rounded-full border border-emerald-300/70 bg-emerald-500/15 px-2.5 py-1 text-[9px] font-black uppercase leading-none tracking-[0.08em] text-emerald-700 shadow-[0_6px_16px_rgba(5,150,105,0.16)] ring-1 ring-emerald-100/80">Purchased</span>)}<span className="inline-flex max-w-full items-center rounded-full border border-emerald-300/70 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black leading-none text-emerald-700 shadow-[0_6px_16px_rgba(5,150,105,0.16)] ring-1 ring-emerald-100/80">{product.category || 'Learning'}</span></div><h3 className="mt-2 line-clamp-1 text-base font-black text-[#081A44]">{product.title}</h3><p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#64708F]">{product.description}</p><div className="mt-2 flex items-center justify-between"><p className="text-[11px] font-bold text-[#64708F]">⭐ <span className="text-[#FFB020]">{product.rating.toFixed(1)}</span> ({product.reviewCount})</p><span className="font-black text-[#081A44]">{currency(product)}</span></div><button onClick={() => onViewProduct(product)} className="mt-2 rounded-xl bg-[#0B63FF] px-3 py-2 text-xs font-black text-white">View Details</button></div></div></article>) : <div className="rounded-[24px] border border-[#D8E6FF] bg-white p-5 text-center font-bold text-[#64708F]">No products found. Try another search.</div>}</div></section>
    </div>
  );
};

export default MobileAppHome;
