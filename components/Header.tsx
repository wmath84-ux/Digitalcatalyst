import React, { useState, useEffect } from 'react';
import { User, WebsiteSettings, ThemeName, themes } from '../App';

const LogoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.59L5.41 12 4 13.41l7 7 9-9L18.59 10 11 17.59z" />
    </svg>
);

const HeartIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
    </svg>
);

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
    onLogout: () => void;
    onLoginClick: () => void;
    authButtonLabel: string;
    activeTheme: ThemeName;
    onThemeChange: (themeName: ThemeName) => void;
}

const Header: React.FC<HeaderProps> = ({ settings, wishlistCount, cartItemCount, cartToastMessage, onHomeClick, onCartClick, onNavigateToAllProducts, onNavigateToPurchases, onNavigateToWishlist, onNavigateToProfile, onNavigateToHomeAndScroll, currentUser, onLogout, onLoginClick, authButtonLabel, activeTheme, onThemeChange }) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);

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

  const authButtonClass = "rounded-full bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 px-6 py-2 font-semibold text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:opacity-90";
  const mobileAuthButtonClass = "rounded-full bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 px-4 py-2 text-sm font-bold text-white shadow-[0_8px_24px_rgba(79,70,229,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:opacity-90";

  return (
    <>
      <header className="border-b border-indigo-100/70 bg-background/90 shadow-[0_12px_34px_rgba(79,70,229,0.08)] backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button onClick={onHomeClick} className="flex items-center space-x-2 cursor-pointer" aria-label="Back to Homepage">
              <LogoIcon />
              <span className="text-xl font-bold text-primary">{(settings.content as any).siteName || "Digital Catalyst"}</span>
            </button>
            
            <nav className="hidden md:flex items-center justify-center gap-x-7 lg:gap-x-9">
              {navItems.map((item) => (
                  <button key={item.name} onClick={item.action} className="text-text-muted hover:text-primary transition-colors duration-300">
                    {item.name}
                  </button>
              ))}
            </nav>

            <div className="flex items-center justify-end">
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
                            <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center space-x-2 text-text-muted">
                                <UserIcon />
                                <span className="text-sm font-medium">{currentUser.name || currentUser.email.split('@')[0]}</span>
                            </button>
                            {isUserMenuOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white/70 backdrop-blur-xl rounded-md shadow-[0_8px_30px_rgb(0,0,0,0.04)] py-1 z-20">
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
                <div className="flex items-center space-x-3 md:hidden">
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
                            <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 text-white shadow-[0_8px_24px_rgba(79,70,229,0.18)]" aria-label="Open account menu">
                                <UserIcon />
                            </button>
                            {isUserMenuOpen && (
                                <div className="absolute right-0 mt-3 w-48 overflow-hidden rounded-2xl border border-slate-100 bg-white/90 py-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl z-20">
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
                        <button onClick={onLoginClick} className={mobileAuthButtonClass}>
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
