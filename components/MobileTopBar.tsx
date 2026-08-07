import React, { useState } from 'react';
import { User } from '../App';
import UserAvatar from './common/UserAvatar';
import { RememberedAuthAccount } from '../utils/rememberedAuth';

interface MobileTopBarProps {
  currentUser: User | null;
  isLoggedIn: boolean;
  rememberedAccount?: RememberedAuthAccount | null;
  cartCount: number;
  onHomeClick: () => void;
  onNavigateToSubscriptions: () => void;
  onNavigateToWishlist: () => void;
  onNavigateToFreeProducts: () => void;
  onOpenNews: () => void;
  onOpenBlog: () => void;
  onOpenCommunity: () => void;
  onCartClick: () => void;
  onProfileClick: () => void;
  onAuthClick: (mode: 'login' | 'signup') => void;
}

const MobileTopBar: React.FC<MobileTopBarProps> = ({
  currentUser,
  isLoggedIn,
  rememberedAccount,
  cartCount,
  onHomeClick,
  onNavigateToSubscriptions,
  onNavigateToWishlist,
  onNavigateToFreeProducts,
  onOpenNews,
  onOpenBlog,
  onOpenCommunity,
  onCartClick,
  onProfileClick,
  onAuthClick,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const siteName = 'EDUVORA';
  const resolvedPhotoURL = currentUser?.profilePhotoSet === true ? String(currentUser.photoURL || '').trim() : '';
  const loggedOutAuthMode: 'login' | 'signup' = rememberedAccount ? 'login' : 'signup';
  const loggedOutAuthLabel = rememberedAccount ? 'Login' : 'Sign Up';

  return (
    <>
      <header data-clean-neutral-region="shell.header" className="sticky top-0 z-50 border-b border-[#E7E0EC] bg-[#F8FAFD]/96 backdrop-blur-md md:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex min-h-16 items-center gap-3 px-4 py-2">
          <button type="button" onClick={onHomeClick} aria-label="Back to Homepage" className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#0B63FF] to-[#7C4DFF] text-white"><img src="/icons/icon-192x192.svg" alt="Digital Catalyst" className="h-full w-full object-cover" loading="eager" fetchPriority="high" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black tracking-wide text-[#1D1B20]">{siteName}</p>
            <p className="text-[11px] font-normal text-[#625B71]">Premium learning store</p>
          </div>
          <button type="button" onClick={onCartClick} className="relative grid h-10 w-10 place-items-center rounded-full bg-transparent text-xl text-[#1D1B20] active:bg-[#E8DEF8]" aria-label="Open cart">🛒{cartCount > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-[#0B63FF] px-1.5 text-[10px] font-black text-white">{cartCount}</span> : null}</button>
          {isLoggedIn && currentUser ? (
            <>
              <button type="button" onClick={onProfileClick} className="grid h-10 w-10 place-items-center rounded-full bg-transparent text-lg active:bg-[#E8DEF8]" aria-label="Open profile"><UserAvatar name={currentUser.name} email={currentUser.email} photoURL={resolvedPhotoURL} size={34} /></button>
              <button type="button" onClick={() => setIsDrawerOpen(true)} className="grid h-10 w-10 place-items-center rounded-full text-[#1D1B20] active:bg-[#E8DEF8]" aria-label="Open menu"><span className="flex flex-col gap-1"><i className="block h-0.5 w-5 rounded-full bg-current" /><i className="block h-0.5 w-5 rounded-full bg-current" /><i className="block h-0.5 w-5 rounded-full bg-current" /></span></button>
            </>
          ) : (
            <button type="button" onClick={() => onAuthClick(loggedOutAuthMode)} className="flex h-10 shrink-0 items-center rounded-full border border-[#BFD7FF] bg-white/95 px-3 text-xs font-black text-[#081A44] shadow-[0_10px_24px_rgba(11,99,255,0.10)] transition hover:-translate-y-0.5 hover:border-[#0B63FF] hover:text-[#0B63FF]" aria-label={loggedOutAuthLabel}>
              {loggedOutAuthLabel}
            </button>
          )}
        </div>
      </header>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-[90] bg-black/32" onClick={() => setIsDrawerOpen(false)} aria-hidden="true">
          <aside className="absolute right-0 top-0 flex h-full w-[80vw] max-w-sm flex-col rounded-l-[28px] bg-[#FFFBFE] text-[#1D1B20] shadow-none" onClick={(event) => event.stopPropagation()} aria-label="EDUVORA menu">
            <div className="flex items-start gap-3 border-b border-[#CAC4D0] p-5 pt-[max(24px,env(safe-area-inset-top))]">
              <UserAvatar name={currentUser?.name || 'Guest'} email={currentUser?.email || ''} photoURL={resolvedPhotoURL} size={52} />
              <div className="min-w-0 flex-1 pt-1"><p className="truncate text-base font-bold">{currentUser?.name || 'Guest user'}</p><p className="truncate text-sm text-[#625B71]">{currentUser?.email || 'Sign in to sync your account'}</p></div>
              <button type="button" onClick={() => setIsDrawerOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-[#ECE6F0] text-xl" aria-label="Close menu">×</button>
            </div>
            <nav className="flex flex-col gap-1 p-3 text-sm font-medium">
              {[['👤','Profile', onProfileClick], ['💎','Subscriptions', onNavigateToSubscriptions], ['♡','Wishlist', onNavigateToWishlist], ['🛒','Cart', onCartClick], ['🎁','Free', onNavigateToFreeProducts], ['📣','News', onOpenNews], ['📄','Blog', onOpenBlog], ['💬','Community', onOpenCommunity]].map(([icon, label, action]: any) => (
                <button key={label} type="button" onClick={() => { setIsDrawerOpen(false); action(); }} className="flex min-h-12 items-center gap-4 rounded-full px-4 text-left text-[#1D1B20] active:bg-[#E8DEF8]"><span className="w-6 text-center text-xl">{icon}</span><span>{label}</span></button>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
};

export default MobileTopBar;
