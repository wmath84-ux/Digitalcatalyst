import React, { useEffect, useRef, useState } from 'react';
import { User, WebsiteSettings, ThemeName } from '../App';
import UserAvatar from './common/UserAvatar';
import { RememberedAuthAccount } from '../utils/rememberedAuth';
import { BellIcon, BookIcon, CartIcon, UserIcon } from './store-new/icons';

interface HeaderProps {
    settings: WebsiteSettings;
    wishlistCount: number;
    cartItemCount: number;
    cartToastMessage: string;
    notificationCount?: number;
    onOpenNotifications?: () => void;
    onHomeClick: () => void;
    onCartClick: () => void;
    onNavigateToAllProducts: () => void;
    onNavigateToPurchases: () => void;
    onNavigateToWishlist: () => void;
    onNavigateToProfile: () => void;
    onNavigateToHomeAndScroll: (sectionId: string) => void;
    currentUser: User | null;
    isLoggedIn: boolean;
    rememberedAccount?: RememberedAuthAccount | null;
    onLogout: () => void;
    onAuthClick: (mode: 'login' | 'signup') => void;
    activeTheme: ThemeName;
    onThemeChange: (themeName: ThemeName) => void;
}

const Header: React.FC<HeaderProps> = ({ settings, wishlistCount, cartItemCount, cartToastMessage, notificationCount = 0, onOpenNotifications, onHomeClick, onCartClick, onNavigateToAllProducts, onNavigateToPurchases, onNavigateToWishlist, onNavigateToProfile, onNavigateToHomeAndScroll, currentUser, isLoggedIn, rememberedAccount, onLogout, onAuthClick, activeTheme, onThemeChange }) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const accountMenuAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cartToastMessage) {
        setIsToastVisible(true);
        // This timer ensures the toast is removed from the DOM after the animation
        const timer = setTimeout(() => {
            setIsToastVisible(false);
        }, 2800); // Should be slightly less than the timeout in App.tsx
        return () => clearTimeout(timer);
    }
  }, [cartToastMessage]);

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && !accountMenuAreaRef.current?.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleScroll = () => setIsUserMenuOpen(false);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsUserMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isLoggedIn) setIsUserMenuOpen(false);
  }, [isLoggedIn]);

  const handleProfileClick = () => {
    setIsUserMenuOpen(false);
    onNavigateToProfile();
  };

  const handleLogoutClick = () => {
    setIsUserMenuOpen(false);
    onLogout();
  };

  const resolvedPhotoURL = currentUser?.profilePhotoSet === true ? String(currentUser.photoURL || '').trim() : '';
  const loggedOutAuthMode: 'login' | 'signup' = rememberedAccount ? 'login' : 'signup';
  const loggedOutAuthLabel = rememberedAccount ? `Continue as ${rememberedAccount.name || rememberedAccount.email.split('@')[0]}` : 'Login';

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
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

          <div ref={accountMenuAreaRef} className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`View your cart with ${cartItemCount} items`}
              onClick={onCartClick}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
            >
              <CartIcon className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {cartItemCount}
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
              <div className="relative">
                <button
                  type="button"
                  aria-label="Open profile"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                >
                  <UserAvatar name={currentUser.name} email={currentUser.email} photoURL={resolvedPhotoURL} size={24} className="ring-0" />
                </button>
                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full z-[1000] mt-2 w-52 overflow-hidden rounded-2xl border border-slate-100 bg-white/95 py-1 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                    <button onClick={handleProfileClick} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100">
                      Profile & EduCoins
                    </button>
                    <button onClick={handleLogoutClick} className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100">
                      Logout
                    </button>
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

       {/* Cart Toast Notification */}
       <div className={`cart-toast ${isToastVisible ? 'is-visible' : ''}`} role="status" aria-live="polite">
          {cartToastMessage}
      </div>

    </>
  );
};

export default Header;
