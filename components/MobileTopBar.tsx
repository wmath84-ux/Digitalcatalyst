import React, { useEffect, useRef, useState } from 'react';
import { User } from '../App';
import UserAvatar from './common/UserAvatar';
import { RememberedAuthAccount } from '../utils/rememberedAuth';
import { BellIcon, BookIcon, CartIcon, UserIcon } from './store-new/icons';

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
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileOpenedRef = useRef(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
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
      <header data-clean-neutral-region="shell.header" className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur md:hidden" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onHomeClick} aria-label="Back to Homepage" className="flex min-w-0 cursor-pointer items-center gap-3 text-left">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200">
              <BookIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-lg font-extrabold tracking-tight text-slate-900">Eduvora</h1>
              <p className="text-xs font-medium text-slate-400">Premium learning store</p>
            </div>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`View your cart with ${cartCount} items`}
              onClick={onCartClick}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
            >
              <CartIcon className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label={`Open notifications with ${notificationCount} unread`}
              onClick={onOpenNotifications}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
            >
              <BellIcon className="h-5 w-5" />
              {notificationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </button>
            {isLoggedIn && currentUser ? (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  aria-label="Open profile"
                  onClick={handleProfileIconClick}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                >
                  <UserAvatar name={currentUser.name} email={currentUser.email} photoURL={resolvedPhotoURL} size={24} className="ring-0" />
                </button>
                {isProfileMenuOpen && (
                  <div className="absolute right-0 top-full z-[100] mt-2 w-56 overflow-hidden rounded-2xl border border-slate-100 bg-white/95 py-1 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="truncate text-sm font-black text-slate-900">{currentUser.name || currentUser.email.split('@')[0]}</p>
                      <p className="truncate text-xs font-semibold text-slate-500">{currentUser.email}</p>
                    </div>
                    {[['👤','Profile', onProfileClick], ['💎','Subscriptions', onNavigateToSubscriptions], ['♡','Wishlist', onNavigateToWishlist], ['🛒','Cart', onCartClick]].map(([icon, label, action]: any) => (
                      <button key={label} type="button" onClick={() => handleProfileMenuAction(action)} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-bold text-slate-900 active:bg-slate-50"><span className="w-6 text-center text-base">{icon}</span><span>{label}</span></button>
                    ))}
                    <div className="my-2 h-px bg-slate-100" />
                    {[['🎁','Free', onNavigateToFreeProducts], ['📣','News', onOpenNews], ['📄','Blog', onOpenBlog], ['💬','Community', onOpenCommunity]].map(([icon, label, action]: any) => (
                      <button key={label} type="button" onClick={() => handleProfileMenuAction(action)} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-bold text-slate-900 active:bg-slate-50"><span className="w-6 text-center text-base">{icon}</span><span>{label}</span></button>
                    ))}
                    <div className="my-2 h-px bg-slate-100" />
                    <button type="button" onClick={handleLogoutClick} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-bold text-rose-700 active:bg-rose-50"><span className="w-6 text-center text-base">🚪</span><span>Log out</span></button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                aria-label={loggedOutAuthLabel}
                onClick={() => onAuthClick(loggedOutAuthMode)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
              >
                <UserIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </header>
    </>
  );
};

export default MobileTopBar;
