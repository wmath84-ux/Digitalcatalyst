import React, { useState, useEffect, useRef } from 'react';
import { User, WebsiteSettings, ThemeName, themes } from '../App';
import UserAvatar from './common/UserAvatar';
import { RememberedAuthAccount } from '../utils/rememberedAuth';

const LogoIcon = () => (
    <img
        src="/icons/icon-192x192.svg"
        alt="Digital Catalyst logo"
        className="h-9 w-9 rounded-xl shadow-[0_8px_18px_rgba(37,99,235,0.16)] ring-1 ring-white/70 md:h-12 md:w-12 md:rounded-2xl md:shadow-[0_10px_28px_rgba(37,99,235,0.22)]"
    />
);

const HeartIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
    </svg>
);

const CartIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);


interface HeaderProps {
    settings: WebsiteSettings;
    wishlistCount: number;
    cartItemCount: number;
    cartToastMessage: string;
    onHomeClick: () => void;
    onCartClick: () => void;
    onNavigateToAllProducts: () => void;
    onNavigateToPurchases: () => void;
    onNavigateToWishlist: () => void;
    onNavigateToProfile: () => void;
    onNavigateToHomeAndScroll: (sectionId: string) => void;
    currentUser: User | null;
    rememberedAccount?: RememberedAuthAccount | null;
    onLogout: () => void;
    onLoginClick: () => void;
    authButtonLabel: string;
    activeTheme: ThemeName;
    onThemeChange: (themeName: ThemeName) => void;
}

const Header: React.FC<HeaderProps> = ({ settings, wishlistCount, cartItemCount, cartToastMessage, onHomeClick, onCartClick, onNavigateToAllProducts, onNavigateToPurchases, onNavigateToWishlist, onNavigateToProfile, onNavigateToHomeAndScroll, currentUser, rememberedAccount, onLogout, onLoginClick, authButtonLabel, activeTheme, onThemeChange }) => {
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
    if (!currentUser) setIsUserMenuOpen(false);
  }, [currentUser]);

  const navItems = [
    { name: 'Home', action: onHomeClick },
    { name: 'Products', action: onNavigateToAllProducts },
    { name: 'Services', action: () => onNavigateToHomeAndScroll('services') },
    { name: 'FAQ', action: () => onNavigateToHomeAndScroll('faq') },
    { name: 'Contact', action: () => onNavigateToHomeAndScroll('contact') },
  ];

  const handleProfileClick = () => {
    setIsUserMenuOpen(false);
    onNavigateToProfile();
  };

  const handleLogoutClick = () => {
    setIsUserMenuOpen(false);
    onLogout();
  };

  const resolvedPhotoURL = currentUser?.photoURL || ((rememberedAccount?.uid && rememberedAccount.uid === currentUser?.id) || (rememberedAccount?.email && rememberedAccount.email === currentUser?.email) ? rememberedAccount.photoURL : '');
  const authButtonClass = "rounded-full bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 px-5 py-2 text-sm font-black text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:opacity-90";
  return (
    <>
      <header className="sticky top-0 z-50 w-full max-w-full border-b border-[#D9E7F8] bg-[rgba(248,251,255,0.92)] shadow-none backdrop-blur-[18px] md:border-indigo-100/70 md:bg-background/90 md:shadow-[0_12px_34px_rgba(79,70,229,0.08)] md:backdrop-blur-md">
        <div className="container mx-auto flex h-16 w-full max-w-full items-center px-3 py-0 md:block md:h-auto md:px-6 md:py-4">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 md:gap-3">
            <button onClick={onHomeClick} className="flex min-w-0 cursor-pointer items-center space-x-2 overflow-hidden md:space-x-3" aria-label="Back to Homepage">
              <LogoIcon />
              <span className="truncate text-base font-bold text-[#081A45] md:text-xl md:text-primary">{(settings.content as any).siteName || "Digital Catalyst"}</span>
            </button>
            
            <nav className="hidden md:flex items-center justify-center gap-x-7 lg:gap-x-9">
              {navItems.map((item) => (
                  <button key={item.name} onClick={item.action} className="text-text-muted hover:text-primary transition-colors duration-300">
                    {item.name}
                  </button>
              ))}
            </nav>

            <div ref={accountMenuAreaRef} className="flex min-w-0 shrink-0 items-center justify-end">
                <div className="hidden md:flex items-center gap-x-4 lg:gap-x-5">
                    {settings.features.showFavourites && (
                        <button onClick={onNavigateToWishlist} className="relative text-text-muted hover:text-primary transition-colors duration-300" aria-label={`View your wishlist with ${wishlistCount} items`}>
                            <HeartIcon />
                            {wishlistCount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                    {wishlistCount}
                                </span>
                            )}
                        </button>
                    )}
                    <button onClick={onCartClick} className="relative text-text-muted hover:text-primary transition-colors duration-300" aria-label={`View your cart with ${cartItemCount} items`}>
                        <CartIcon />
                        {cartItemCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                {cartItemCount}
                            </span>
                        )}
                    </button>
                    {currentUser ? (
                         <div className="relative">
                            <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 px-4 py-2 font-bold text-white shadow-[0_10px_28px_rgba(23,105,255,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(23,105,255,0.26)]">
                                <UserAvatar name={currentUser.name} email={currentUser.email} photoURL={resolvedPhotoURL} size={28} className="ring-2 ring-white/60" />
                                <span className="max-w-[9rem] truncate text-sm">{currentUser.name || currentUser.email.split('@')[0]}</span>
                            </button>
                            {isUserMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-2xl border border-slate-100 bg-white/95 py-1 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl z-[1000]">
                                    <button onClick={handleProfileClick} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                            Profile & EduCoins
                                        </button>
                                        <button onClick={handleLogoutClick} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                         <button onClick={onLoginClick} className={authButtonClass}>
                            {authButtonLabel}
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2 md:hidden">
                    <button onClick={onCartClick} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#D9E7F8] bg-white/55 text-[#081A45] transition-colors duration-300 hover:bg-white/80" aria-label={`View your cart with ${cartItemCount} items`}>
                        <CartIcon />
                        {cartItemCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                {cartItemCount}
                            </span>
                        )}
                    </button>
                    {currentUser ? (
                        <div className="relative">
                            <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D9E7F8] bg-white/55 text-[#081A45] transition-colors duration-300 hover:bg-white/80" aria-label="Open account menu">
                                <UserAvatar name={currentUser.name} email={currentUser.email} photoURL={resolvedPhotoURL} size={36} />
                            </button>
                            {isUserMenuOpen && (
                                <div className="absolute right-0 top-full mt-3 w-52 overflow-hidden rounded-2xl border border-slate-100 bg-white/95 py-1 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl z-[1000]">
                                    <div className="px-4 py-2 text-xs font-bold text-slate-500">{currentUser.name || currentUser.email.split('@')[0]}</div>
                                    <button onClick={handleProfileClick} className="block w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                                        Profile & EduCoins
                                    </button>
                                    <button onClick={handleLogoutClick} className="block w-full text-left px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button onClick={onLoginClick} className="flex h-10 items-center justify-center rounded-full border border-[#D9E7F8] bg-white/75 px-3 text-xs font-black text-[#081A45] transition-colors duration-300 hover:bg-white" aria-label={authButtonLabel}>
                            {authButtonLabel}
                        </button>
                    )}
                </div>
            </div>
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
