import React, { useEffect, useRef, useState } from 'react';
import { User } from '../App';
import UserAvatar from './common/UserAvatar';
import { RememberedAuthAccount } from '../utils/rememberedAuth';

interface MobileTopBarProps {
  currentUser: User | null;
  isLoggedIn: boolean;
  rememberedAccount?: RememberedAuthAccount | null;
  cartCount: number;
  notificationCount?: number;
  currentView?: string;
  onHomeClick: () => void;
  onNavigateToSubscriptions: () => void;
  onNavigateToWishlist: () => void;
  onNavigateToFreeProducts: () => void;
  onOpenNews: () => void;
  onOpenBlog: () => void;
  onOpenCommunity: () => void;
  onCartClick: () => void;
  onOpenNotifications?: () => void;
  onProfileClick: () => void;
  onAuthClick: (mode: 'login' | 'signup') => void;
  onLogout: () => void;
}

const MobileTopBar: React.FC<MobileTopBarProps> = ({
  currentUser,
  isLoggedIn,
  rememberedAccount,
  cartCount,
  notificationCount = 0,
  currentView,
  onHomeClick,
  onNavigateToSubscriptions,
  onNavigateToWishlist,
  onNavigateToFreeProducts,
  onOpenNews,
  onOpenBlog,
  onOpenCommunity,
  onCartClick,
  onOpenNotifications,
  onProfileClick,
  onAuthClick,
  onLogout,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileOpenedRef = useRef(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const siteName = 'EDUVORA';
  const resolvedPhotoURL = currentUser?.profilePhotoSet === true ? String(currentUser.photoURL || '').trim() : '';
  const loggedOutAuthMode: 'login' | 'signup' = rememberedAccount ? 'login' : 'signup';
  const loggedOutAuthLabel = rememberedAccount ? 'Login' : 'Sign Up';

  useEffect(() => {
    if (currentView === 'home') profileOpenedRef.current = false;
    setIsProfileMenuOpen(false);
  }, [currentView]);

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && !profileMenuRef.current?.contains(target)) setIsProfileMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isProfileMenuOpen]);

  const handleProfileIconClick = () => {
    if (isProfileMenuOpen) {
      setIsProfileMenuOpen(false);
      return;
    }
    if (profileOpenedRef.current) {
      setIsProfileMenuOpen(true);
      return;
    }
    profileOpenedRef.current = true;
    onProfileClick();
  };

  const handleProfileMenuAction = (action: () => void) => {
    setIsProfileMenuOpen(false);
    action();
  };

  const handleLogoutClick = () => {
    setIsProfileMenuOpen(false);
    onLogout();
  };

  return (
    <>
      <header data-clean-neutral-region="shell.header" className="sticky top-0 z-50 bg-[#F8FAFD]/96 backdrop-blur-md md:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#0B63FF] via-[#7C4DFF] to-[#0B63FF]" />
        <div className="flex min-h-16 items-center gap-3 px-4 py-2">
          <button type="button" onClick={onHomeClick} aria-label="Back to Homepage" className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#0B63FF] to-[#7C4DFF] text-white"><img src="/icons/icon-192x192.svg" alt="Digital Catalyst" className="h-full w-full object-cover" loading="eager" fetchPriority="high" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black tracking-wide text-[#081A44]">{siteName}</p>
            <p className="text-[11px] font-normal text-[#64708F]">Premium learning store</p>
          </div>
          <button type="button" onClick={onCartClick} className="relative grid h-10 w-10 place-items-center rounded-full bg-transparent text-xl text-[#081A44] active:bg-[#EEF6FF]" aria-label="Open cart">🛒{cartCount > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-[#0B63FF] px-1.5 text-[10px] font-black text-white">{cartCount}</span> : null}</button>
          <button type="button" onClick={onOpenNotifications} className="relative grid h-10 w-10 place-items-center rounded-full bg-transparent text-[#081A44] active:bg-[#EEF6FF]" aria-label={`Open notifications with ${notificationCount} unread`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9" /></svg>
            {notificationCount > 0 ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0B63FF] px-1 text-[9px] font-black text-white">{notificationCount > 99 ? '99+' : notificationCount}</span> : null}
          </button>
          {isLoggedIn && currentUser ? (
            <>
              <div className="relative" ref={profileMenuRef}>
                <button type="button" onClick={handleProfileIconClick} className="grid h-10 w-10 place-items-center rounded-full bg-transparent text-lg active:bg-[#EEF6FF]" aria-label="Open profile"><UserAvatar name={currentUser.name} email={currentUser.email} photoURL={resolvedPhotoURL} size={34} /></button>
                {isProfileMenuOpen && (
                  <div className="absolute right-0 top-full z-[100] mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 py-1 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                    <div className="border-b border-[#D8E6FF] px-4 py-3">
                      <p className="truncate text-sm font-black text-[#081A44]">{currentUser.name || currentUser.email.split('@')[0]}</p>
                      <p className="truncate text-xs font-semibold text-[#64708F]">{currentUser.email}</p>
                    </div>
                    <button type="button" onClick={() => handleProfileMenuAction(onProfileClick)} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-bold text-[#081A44] active:bg-[#EEF6FF]"><span className="w-6 text-center text-base">👤</span><span>Profile &amp; EduCoins</span></button>
                    <button type="button" onClick={handleLogoutClick} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-bold text-rose-700 active:bg-rose-50"><span className="w-6 text-center text-base">🚪</span><span>Log out</span></button>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setIsDrawerOpen(true)} className="grid h-10 w-10 place-items-center rounded-full text-[#081A44] active:bg-[#EEF6FF]" aria-label="Open menu"><span className="flex flex-col gap-1"><i className="block h-0.5 w-5 rounded-full bg-current" /><i className="block h-0.5 w-5 rounded-full bg-current" /><i className="block h-0.5 w-5 rounded-full bg-current" /></span></button>
            </>
          ) : (
            <button type="button" onClick={() => onAuthClick(loggedOutAuthMode)} className="flex h-10 shrink-0 items-center rounded-full border border-[#BFD7FF] bg-white/95 px-3 text-xs font-black text-[#081A44] shadow-[0_10px_24px_rgba(11,99,255,0.10)] transition hover:-translate-y-0.5 hover:border-[#0B63FF] hover:text-[#0B63FF]" aria-label={loggedOutAuthLabel}>
              {loggedOutAuthLabel}
            </button>
          )}
        </div>
      </header>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)} aria-hidden="true">
          <aside className="absolute right-0 top-0 flex h-full w-[80vw] max-w-sm flex-col rounded-l-[28px] border-l border-[#D8E6FF] bg-white/95 text-[#081A44] shadow-2xl backdrop-blur-xl" onClick={(event) => event.stopPropagation()} aria-label="EDUVORA menu">
            <div className="flex items-start gap-3 border-b border-[#D8E6FF] p-5 pt-[max(24px,env(safe-area-inset-top))]">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#0B63FF] text-white"><span className="text-2xl font-black">{(currentUser?.name || 'G')[0].toUpperCase()}</span></div>
              <div className="min-w-0 flex-1 pt-1"><p className="truncate text-base font-black">{currentUser?.name || 'Guest user'}</p><p className="truncate text-sm text-[#64708F]">{currentUser?.email || 'Sign in to sync your account'}</p></div>
              <button type="button" onClick={() => setIsDrawerOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-[#F2F4F7] text-[#667085]" aria-label="Close menu">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3 text-sm font-medium">
              {[['👤','Profile', onProfileClick], ['💎','Subscriptions', onNavigateToSubscriptions], ['♡','Wishlist', onNavigateToWishlist], ['🛒','Cart', onCartClick]].map(([icon, label, action]: any) => (
                <button key={label} type="button" onClick={() => { setIsDrawerOpen(false); action(); }} className="flex min-h-12 items-center gap-4 rounded-full px-4 text-left text-[#344054] active:bg-[#EEF6FF]"><span className="w-6 text-center text-lg text-[#667085]">{icon}</span><span>{label}</span></button>
              ))}
              <div className="my-2 h-px bg-[#D8E6FF]" />
              {[['🎁','Free', onNavigateToFreeProducts], ['📣','News', onOpenNews], ['📄','Blog', onOpenBlog], ['💬','Community', onOpenCommunity]].map(([icon, label, action]: any) => (
                <button key={label} type="button" onClick={() => { setIsDrawerOpen(false); action(); }} className="flex min-h-12 items-center gap-4 rounded-full px-4 text-left text-[#344054] active:bg-[#EEF6FF]"><span className="w-6 text-center text-lg text-[#667085]">{icon}</span><span>{label}</span></button>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
};

export default MobileTopBar;
