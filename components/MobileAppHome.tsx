import React, { useEffect, useMemo, useState } from 'react';
import { Coupon, ProductWithRating, User, WebsiteSettings } from '../App';
import UserAvatar from './common/UserAvatar';
import { RememberedAuthAccount } from '../utils/rememberedAuth';
import { ProductImageSlot, getProductImage, getProductImageFallback } from '../utils/productImages';
import SafeImage from './common/SafeImage';
import { ensureUserCoinWallet, watchUserCoinWallet } from '../utils/coinWallet';
import LiquidMetalButton from './ui/LiquidMetalButton';
import { pillClassForProductRoundness, resolveProductRoundnessSettings } from '../utils/productRoundness';
import MobileProductSearchPage from './MobileProductSearchPage';
import ProfessionalIcon from './common/ProfessionalIcon';
import type { CleanNeutralIconSlotId, ProfessionalIconName } from '../utils/cleanNeutralAdvancedCustomizer';

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
  onNavigateToWishlist: () => void;
  onNavigateToSubscriptions: () => void;
  onOpenNews: () => void;
  onOpenBlog: () => void;
  onOpenCommunity: () => void;
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
  onNavigateToWishlist,
  onNavigateToSubscriptions,
  onOpenNews,
  onOpenBlog,
  onOpenCommunity,
  onCartClick,
  onProfileClick,
  onAuthClick,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const siteName = 'EDUVORA';
  const ownedPreview = purchasedProducts[0];
  const allPreview = useMemo(() => visibleProducts.slice(0, 6), [visibleProducts]);
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
  const productRoundness = resolveProductRoundnessSettings(settings);
  const mobileHomePreviewCardRoundClass = productRoundness.homePreviewCards !== false ? 'rounded-[26px]' : 'rounded-xl';
  const mobileHomePreviewTileRoundClass = productRoundness.homePreviewCards !== false ? 'rounded-[24px]' : 'rounded-xl';
  const mobileHomePreviewMediaRoundClass = productRoundness.homePreviewCards !== false ? 'rounded-[22px]' : 'rounded-lg';
  const mobileHomeTopMediaRoundClass = productRoundness.homePreviewCards !== false ? 'rounded-[20px]' : 'rounded-lg';
  const mobilePurchaseCardRoundClass = productRoundness.myPurchasesCards !== false ? 'rounded-[26px]' : 'rounded-xl';
  const mobilePurchaseMediaRoundClass = productRoundness.myPurchasesCards !== false ? 'rounded-[22px]' : 'rounded-lg';
  const productBadgeRoundClass = pillClassForProductRoundness(productRoundness.productBadges !== false);
  const productActionButtonRoundClass = productRoundness.productActionButtons !== false ? 'rounded-2xl' : 'rounded-lg';
  const resolvedPhotoURL = currentUser?.profilePhotoSet === true ? String(currentUser.photoURL || '').trim() : '';
  const loggedOutAuthMode: 'login' | 'signup' = rememberedAccount ? 'login' : 'signup';
  const loggedOutAuthLabel = rememberedAccount ? 'Login' : 'Sign Up';
  const activeCoupons = coupons.filter(coupon => coupon.isActive).slice(0, 3);
  const scrollToMobileSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const chips: Array<{ label: string; icon: ProfessionalIconName; slot: CleanNeutralIconSlotId; action: () => void; active?: boolean; count?: number }> = [
    { label: 'My Purchases', icon: 'book-open', slot: 'nav.purchased', action: onNavigateToPurchases, active: true },
    { label: 'Free Resources', icon: 'gift', slot: 'nav.free', action: onNavigateToFreeProducts },
    { label: 'Top Rated', icon: 'star', slot: 'home.topRated', action: () => scrollToMobileSection('mobile-top-rated-products') },
    { label: 'Coupons', icon: 'tag', slot: 'home.coupons', action: () => scrollToMobileSection('mobile-coupons'), count: activeCoupons.length },
    { label: 'News', icon: 'megaphone', slot: 'nav.news', action: onOpenNews },
  ];

  return (
    <div data-clean-neutral-workspace="mobile-home" data-clean-neutral-region="shell.page" className="min-h-[100dvh] bg-[#F8FAFD] px-4 pb-32 pt-[max(10px,env(safe-area-inset-top))] font-['Roboto','Inter',system-ui,sans-serif] text-[#49454F]">
      <header data-clean-neutral-region="shell.header" className="sticky top-0 z-30 -mx-4 mb-4 flex min-h-16 items-center gap-3 border-b border-[#E7E0EC] bg-[#F8FAFD]/96 px-4 py-2 backdrop-blur-md">
        <button type="button" onClick={onNavigateToAllProducts} aria-label="Open Store" className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#0B63FF] to-[#7C4DFF] text-white "><img src="/icons/icon-192x192.svg" alt="Digital Catalyst" className="h-full w-full object-cover" loading="eager" fetchPriority="high" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black tracking-wide text-[#1D1B20]">{siteName}</p>
          <p className="text-[11px] font-normal text-[#625B71]">Premium learning store</p>
        </div>
        <button type="button" onClick={onCartClick} className="relative grid h-10 w-10 place-items-center rounded-full bg-transparent text-xl text-[#1D1B20] active:bg-[#E8DEF8]" aria-label="Open cart">🛒{cartCount > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-[#0B63FF] px-1.5 text-[10px] font-black text-white">{cartCount}</span> : null}</button>
        {isLoggedIn && currentUser ? (
          <>
            <button type="button" onClick={onProfileClick} className="grid h-10 w-10 place-items-center rounded-full bg-transparent text-lg active:bg-[#E8DEF8]" aria-label="Open profile"><UserAvatar name={currentUser.name} email={currentUser.email} photoURL={resolvedPhotoURL} size={34} /></button>
            <button type="button" onClick={() => setIsDrawerOpen(true)} className="grid h-10 w-10 place-items-center rounded-full text-[#1D1B20] active:bg-[#E8DEF8]" aria-label="Open menu"><span className="flex flex-col gap-1"><i className="block h-0.5 w-5 rounded-full bg-current"/><i className="block h-0.5 w-5 rounded-full bg-current"/><i className="block h-0.5 w-5 rounded-full bg-current"/></span></button>
          </>
        ) : (
          <button type="button" onClick={() => onAuthClick(loggedOutAuthMode)} className="flex h-10 shrink-0 items-center rounded-full border border-[#BFD7FF] bg-white/95 px-3 text-xs font-black text-[#081A44] shadow-[0_10px_24px_rgba(11,99,255,0.10)] transition hover:-translate-y-0.5 hover:border-[#0B63FF] hover:text-[#0B63FF]" aria-label={loggedOutAuthLabel}>
            {loggedOutAuthLabel}
          </button>
        )}
      </header>

      <section data-clean-neutral-region="content.hero" className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#EADDFF_0%,#D7E3FF_50%,#FFFBFE_100%)] p-5">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#DCCBFF]/70 blur-2xl" />
        <div className="absolute bottom-0 right-3 h-28 w-28 rounded-full bg-[#BFD7FF]/80 blur-2xl" />
        <div className="relative grid grid-cols-[1.1fr_0.9fr] gap-2">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#BFD7FF] bg-white/70 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#0B63FF]">💎 Premium Learning Store</span>
            <h1 className="mt-4 text-[28px] font-black leading-[1.03] tracking-tight text-[#081A44]">Welcome to Digital Catalyst</h1>
            <p className="mt-3 text-[13px] font-semibold leading-5 text-[#64708F]">Learn, buy and access premium notes, courses and digital products.</p>
            <div className="mt-4 flex flex-col gap-2">
              <LiquidMetalButton tone="blue" type="button" onClick={onNavigateToAllProducts} className="rounded-full px-4 py-3 text-sm font-black">🛍️ Explore Products</LiquidMetalButton>
              <button type="button" onClick={onNavigateToPurchases} className="rounded-full border border-[#79747E] bg-transparent px-4 py-3 text-sm font-black text-[#081A44]">📄 My Purchases</button>
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

      <section className="mt-5">
        <label className="flex items-center gap-3 rounded-full bg-[#ECE6F0] px-4 py-3">
          <span>🔎</span><input value={searchQuery} readOnly onFocus={() => setIsMobileSearchOpen(true)} onClick={() => setIsMobileSearchOpen(true)} placeholder="Search notes, courses, resources..." aria-label="Open product search" className="min-w-0 flex-1 cursor-pointer bg-transparent text-sm font-bold text-[#081A44] outline-none placeholder:text-[#64708F]/75" /><button type="button" onClick={() => setIsMobileSearchOpen(true)} aria-label="Voice search">🎙️</button>
        </label>
      </section>

      <nav data-clean-neutral-region="shell.navigation" className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map(chip => <button key={chip.label} type="button" onClick={chip.action} className={`shrink-0 rounded-full border px-4 py-3 text-xs font-black shadow-[0_10px_24px_rgba(11,99,255,0.08)] ${chip.active ? 'border-[#0B63FF] bg-[#0B63FF] text-white' : 'border-[#D8E6FF] bg-white text-[#081A44]'}`}><ProfessionalIcon slot={chip.slot} fallbackName={chip.icon} label={`${chip.label}${chip.count ? ` (${chip.count})` : ''}`} defaultDisplayMode="icon-with-text" defaultPosition="left" size={16} /></button>)}
      </nav>

      <section className="mt-5"><SectionHead title="Continue Learning" subtitle="Access your purchased products instantly." onViewAll={onNavigateToPurchases} />
        {ownedPreview ? <article className={`${mobilePurchaseCardRoundClass} border border-[#D8E6FF] bg-white p-3 shadow-[0_18px_50px_rgba(11,99,255,0.10)]`}><div className="flex gap-3"><div className={`h-28 w-28 shrink-0 overflow-hidden ${mobilePurchaseMediaRoundClass}`}><ProductCover product={ownedPreview} slot="purchaseSquare" priority /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><span className={`${productBadgeRoundClass} bg-[#E9F8F0] px-2 py-1 text-[10px] font-black text-[#16B364]`}>Purchased</span><button className="text-[#64708F]">⋯</button></div><h3 className="mt-2 line-clamp-1 text-base font-black text-[#081A44]">{ownedPreview.title}</h3><p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#64708F]">{ownedPreview.description}</p><p className="mt-2 text-[11px] font-black text-[#0B63FF]">{progressFor(ownedPreview)}% Completed</p><div className="mt-1 h-2 rounded-full bg-[#EEF6FF]"><div className="h-full rounded-full bg-[#0B63FF]" style={{ width: `${progressFor(ownedPreview)}%` }} /></div><button onClick={() => onViewPurchasedProduct(ownedPreview)} className={`mt-3 ${productActionButtonRoundClass} bg-[#081A44] px-3 py-2 text-xs font-black text-white`}>Access Files</button></div></div></article> : <div className="rounded-[26px] border border-dashed border-[#BFD7FF] bg-white/78 p-5 text-center shadow-[0_18px_50px_rgba(11,99,255,0.08)]"><p className="text-3xl">📚</p><h3 className="mt-2 text-lg font-black text-[#081A44]">No purchases yet</h3><p className="mt-1 text-sm font-semibold text-[#64708F]">Start with a premium course or free resource.</p><button onClick={onNavigateToAllProducts} className="mt-4 rounded-2xl bg-[#0B63FF] px-5 py-3 text-sm font-black text-white">Explore Products</button></div>}
      </section>

      {topPreview.length > 0 && <section id="mobile-top-rated-products" className="mt-7 scroll-mt-24"><SectionHead title="Top Rated Products" onViewAll={onNavigateToAllProducts} /><div className="grid grid-cols-2 gap-3">{topPreview.map(product => <article key={product.id} className={`${mobileHomePreviewTileRoundClass} border border-[#D8E6FF] bg-white p-2.5 shadow-[0_16px_42px_rgba(11,99,255,0.09)]`}><div className={`relative aspect-square overflow-hidden ${mobileHomeTopMediaRoundClass}`}><ProductCover product={product} compact slot="homeTopRated" />{purchasedProductIds.includes(product.id) && <span className={`absolute left-2 top-2 z-20 ${productBadgeRoundClass} border border-emerald-300/70 bg-white/95 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-700 shadow`}>Purchased</span>}<button onClick={() => onToggleWishlist(product.id)} className={`absolute right-2 top-2 grid h-8 w-8 place-items-center ${productBadgeRoundClass} bg-white/90 shadow`}>{wishlist.includes(product.id) ? '❤️' : '♡'}</button></div><h3 className="mt-2 line-clamp-2 min-h-9 text-sm font-black leading-tight text-[#081A44]">{product.title}</h3><p className="mt-1 text-[11px] font-bold text-[#64708F]">⭐ <span className="text-[#FFB020]">{product.rating.toFixed(1)}</span> ({product.reviewCount})</p><div className="mt-2 flex items-center justify-between"><span className="font-black text-[#081A44]">{currency(product)}</span><button onClick={() => onViewProduct(product)} className={`${productActionButtonRoundClass} bg-[#EEF6FF] px-3 py-1.5 text-xs font-black text-[#0B63FF]`}>View</button></div></article>)}</div></section>}

      <section id="mobile-coupons" className="mt-7 scroll-mt-24"><SectionHead title="Coupons" subtitle="Apply active offers during checkout." onViewAll={onNavigateToAllProducts} /><div className="space-y-3">{activeCoupons.length > 0 ? activeCoupons.map(coupon => <article key={coupon.id} className="flex items-center justify-between gap-3 rounded-[24px] border border-[#D8E6FF] bg-white p-4 shadow-[0_14px_36px_rgba(11,99,255,0.08)]"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#0B63FF]">Active Coupon</p><h3 className="mt-1 text-lg font-black text-[#081A44]">{coupon.code}</h3><p className="mt-1 text-xs font-bold text-[#64708F]">{coupon.type === 'percentage' ? `${coupon.value}% off` : `₹${coupon.value} off`} • valid till {coupon.expiryDate || 'checkout'}</p></div><button type="button" onClick={onNavigateToAllProducts} className="shrink-0 rounded-2xl bg-[#EEF6FF] px-4 py-2 text-xs font-black text-[#0B63FF]">Use</button></article>) : <div className="rounded-[24px] border border-dashed border-[#BFD7FF] bg-white/78 p-5 text-center font-bold text-[#64708F]">No active coupons right now.</div>}</div></section>

      <section className="mt-7"><SectionHead title="All Products" subtitle="Browse all premium learning products." onViewAll={onNavigateToAllProducts} /><div className="space-y-3">{allPreview.length > 0 ? allPreview.map(product => <article key={product.id} className={`relative ${mobileHomePreviewCardRoundClass} border border-[#D8E6FF] bg-white p-3 shadow-[0_16px_42px_rgba(11,99,255,0.08)]`}><button onClick={() => onToggleWishlist(product.id)} className={`absolute right-4 top-4 z-30 grid h-9 w-9 place-items-center ${productBadgeRoundClass} bg-white/90 shadow`}>{wishlist.includes(product.id) ? '❤️' : '♡'}</button><div className="flex gap-3"><div className={`relative w-24 shrink-0 overflow-hidden ${mobileHomePreviewMediaRoundClass} aspect-[6/7]`}><ProductCover product={product} slot="homeList" /><button type="button" onClick={() => onViewProduct(product)} aria-label={`Open ${product.title}`} className="absolute inset-0 z-10 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-[#0B63FF]" /></div><div className="min-w-0 flex-1 pr-10"><div className="flex max-w-full flex-wrap items-center gap-2 overflow-visible pb-0.5">{purchasedProductIds.includes(product.id) ? (<span className={`inline-flex max-w-full shrink-0 items-center ${productBadgeRoundClass} border border-emerald-300/70 bg-emerald-500/15 px-2.5 py-1 text-[9px] font-black uppercase leading-none tracking-[0.08em] text-emerald-700 shadow-[0_6px_16px_rgba(5,150,105,0.16)] ring-1 ring-emerald-100/80`}>Purchased</span>) : (<span className={`inline-flex max-w-full items-center ${productBadgeRoundClass} border border-emerald-300/70 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black leading-none text-emerald-700 shadow-[0_6px_16px_rgba(5,150,105,0.16)] ring-1 ring-emerald-100/80`}>{product.category || 'Learning'}</span>)}</div><h3 className="mt-2 line-clamp-1 text-base font-black text-[#081A44]"><button type="button" onClick={() => onViewProduct(product)} className="block w-full truncate text-left focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B63FF]">{product.title}</button></h3><p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#64708F]">{product.description}</p><div className="mt-2 flex items-center justify-between"><p className="text-[11px] font-bold text-[#64708F]">⭐ <span className="text-[#FFB020]">{product.rating.toFixed(1)}</span> ({product.reviewCount})</p><span className="font-black text-[#081A44]">{currency(product)}</span></div><button onClick={() => onViewProduct(product)} className={`mt-2 ${productActionButtonRoundClass} bg-[#0B63FF] px-3 py-2 text-xs font-black text-white`}>View Details</button></div></div></article>) : <div className="rounded-[24px] border border-[#D8E6FF] bg-white p-5 text-center font-bold text-[#64708F]">No products found. Try another search.</div>}</div></section>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-[90] bg-black/32" onClick={() => setIsDrawerOpen(false)} aria-hidden="true">
          <aside className="absolute right-0 top-0 flex h-full w-[80vw] max-w-sm flex-col rounded-l-[28px] bg-[#FFFBFE] text-[#1D1B20] shadow-none" onClick={(event) => event.stopPropagation()} aria-label="EDUVORA menu">
            <div className="flex items-start gap-3 border-b border-[#CAC4D0] p-5 pt-[max(24px,env(safe-area-inset-top))]">
              <UserAvatar name={currentUser?.name || 'Guest'} email={currentUser?.email || ''} photoURL={resolvedPhotoURL} size={52} />
              <div className="min-w-0 flex-1 pt-1"><p className="truncate text-base font-bold">{currentUser?.name || 'Guest user'}</p><p className="truncate text-sm text-[#625B71]">{currentUser?.email || 'Sign in to sync your account'}</p></div>
              <button type="button" onClick={() => setIsDrawerOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-[#ECE6F0] text-xl" aria-label="Close menu">×</button>
            </div>
            <nav className="flex flex-col gap-1 p-3 text-sm font-medium">
              {[['👤','Profile', onProfileClick], ['💎','Subscriptions', onNavigateToSubscriptions], ['♡','Wishlist', onNavigateToWishlist], ['🛒','Cart', onCartClick], ['🎁','Free', onNavigateToFreeProducts], ['📣','News', onOpenNews], ['📄','Blog', onOpenBlog], ['💬','Community', onOpenCommunity]].map(([icon,label,action]: any) => (
                <button key={label} type="button" onClick={() => { setIsDrawerOpen(false); action(); }} className="flex min-h-12 items-center gap-4 rounded-full px-4 text-left text-[#1D1B20] active:bg-[#E8DEF8]"><span className="w-6 text-center text-xl">{icon}</span><span>{label}</span></button>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      {isMobileSearchOpen ? <MobileProductSearchPage source="home" products={visibleProducts} query={searchQuery} onQueryChange={setSearchQuery} onClose={() => setIsMobileSearchOpen(false)} onViewProduct={(product) => onViewProduct(product)} wishlist={wishlist} onToggleWishlist={onToggleWishlist} purchasedProductIds={purchasedProductIds} /> : null}
    </div>
  );
};

export default MobileAppHome;
