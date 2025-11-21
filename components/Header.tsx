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

const PurchasesIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
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
    onNavigateToHomeAndScroll: (sectionId: string) => void;
    currentUser: User | null;
    onLogout: () => void;
    onLoginClick: () => void;
    activeTheme: ThemeName;
    onThemeChange: (themeName: ThemeName) => void;
}

const Header: React.FC<HeaderProps> = ({ settings, wishlistCount, cartItemCount, cartToastMessage, onHomeClick, onCartClick, onNavigateToAllProducts, onNavigateToPurchases, onNavigateToWishlist, onNavigateToHomeAndScroll, currentUser, onLogout, onLoginClick, activeTheme, onThemeChange }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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

  return (
    <>
      <header className="bg-background/80 backdrop-blur-md shadow-md sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button onClick={onHomeClick} className="flex items-center space-x-2 cursor-pointer" aria-label="Back to Homepage">
              <LogoIcon />
              <span className="text-xl font-bold text-primary">Digital Catalyst</span>
            </button>
            
            <nav className="hidden md:flex items-center space-x-8">
              {navItems.map((item) => (
                  <button key={item.name} onClick={item.action} className="text-text-muted hover:text-primary transition-colors duration-300">
                    {item.name}
                  </button>
              ))}
            </nav>

            <div className="flex items-center space-x-4">
                <div className="hidden md:flex items-center space-x-4">
                    <button onClick={onNavigateToPurchases} className="text-text-muted hover:text-primary transition-colors duration-300" aria-label="View your purchased items">
                        <PurchasesIcon />
                    </button>
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
                            <span className="absolute -top-2 -right-2 bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                {cartItemCount}
                            </span>
                        )}
                    </button>
                    {currentUser ? (
                         <div className="relative">
                            <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center space-x-2 text-text-muted">
                                <UserIcon />
                                <span className="text-sm font-medium">{currentUser.email.split('@')[0]}</span>
                            </button>
                            {isUserMenuOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20">
                                    <button onClick={onLogout} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                         <button onClick={onLoginClick} className="bg-primary text-white font-semibold px-6 py-2 rounded-lg hover:opacity-90 transition-opacity duration-300">
                            Login
                        </button>
                    )}
                </div>
                <div className="flex items-center space-x-2 md:hidden">
                    <button onClick={onCartClick} className="relative text-text-muted hover:text-primary transition-colors duration-300" aria-label={`View your cart with ${cartItemCount} items`}>
                        <CartIcon />
                        {cartItemCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                {cartItemCount}
                            </span>
                        )}
                    </button>
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-text-muted focus:outline-none" aria-expanded={isMenuOpen} aria-controls="mobile-menu-panel">
                    <span className="sr-only">Open main menu</span>
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                    </svg>
                    </button>
                </div>
            </div>
          </div>
        </div>
      </header>

       {/* Cart Toast Notification */}
       <div className={`cart-toast ${isToastVisible ? 'is-visible' : ''}`} role="status" aria-live="polite">
          {cartToastMessage}
      </div>

      {/* Mobile Menu Panel */}
      <div 
          className={`fixed inset-0 z-40 transition-opacity duration-300 ease-in-out md:hidden ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
      >
          <div className="absolute inset-0 bg-black/50"></div>
      </div>
      <div id="mobile-menu-panel" className={`fixed top-0 right-0 h-full w-full max-w-sm bg-background z-50 transform transition-transform duration-300 ease-in-out md:hidden ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-6">
              <div className="flex justify-between items-center mb-8">
                  <span className="text-xl font-bold text-primary">Digital Catalyst</span>
                  <button onClick={() => setIsMenuOpen(false)} className="p-2" aria-label="Close menu">
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
              </div>
              <nav className="flex flex-col space-y-1">
                  {navItems.map((item) => (
                    <button key={item.name} onClick={() => { item.action(); setIsMenuOpen(false); }} className="text-text hover:bg-gray-100 text-left p-3 rounded-md font-semibold transition-colors">
                        {item.name}
                    </button>
                  ))}

                  <div className="border-t my-3"></div>

                    <div className="px-3 mb-2">
                        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Appearance</h3>
                    </div>
                    <div className="flex flex-col space-y-1">
                        {Object.values(themes).map(theme => (
                            <button
                                key={theme.name}
                                onClick={() => { onThemeChange(theme.name.toLowerCase() as ThemeName); }}
                                className={`flex items-center p-3 rounded-md transition-colors ${activeTheme === theme.name.toLowerCase() ? 'bg-primary/10' : 'hover:bg-gray-100'}`}
                            >
                                <div className="flex -space-x-1">
                                    <div className="w-5 h-5 rounded-full border-2 border-white" style={{ backgroundColor: theme.palette.primaryColor }}></div>
                                    <div className="w-5 h-5 rounded-full border-2 border-white" style={{ backgroundColor: theme.palette.backgroundColor }}></div>
                                </div>
                                <span className={`ml-3 font-semibold ${activeTheme === theme.name.toLowerCase() ? 'text-primary' : 'text-text'}`}>
                                    {theme.name}
                                </span>
                            </button>
                        ))}
                    </div>
                    
                    <div className="border-t my-3"></div>

                   <button onClick={() => { onCartClick(); setIsMenuOpen(false); }} className="flex items-center relative text-text hover:bg-gray-100 p-3 rounded-md font-semibold transition-colors">
                        <CartIcon />
                        <span className="ml-3">My Cart</span>
                        {cartItemCount > 0 && (
                            <span className="ml-auto bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                {cartItemCount}
                            </span>
                        )}
                    </button>
                  <button onClick={() => { onNavigateToPurchases(); setIsMenuOpen(false); }} className="flex items-center text-text hover:bg-gray-100 p-3 rounded-md font-semibold transition-colors">
                    <PurchasesIcon />
                    <span className="ml-3">My Purchases</span>
                  </button>
                  {settings.features.showFavourites && (
                    <button onClick={() => { onNavigateToWishlist(); setIsMenuOpen(false); }} className="flex items-center relative text-text hover:bg-gray-100 p-3 rounded-md font-semibold transition-colors">
                        <HeartIcon />
                        <span className="ml-3">Wishlist</span>
                        {wishlistCount > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                {wishlistCount}
                            </span>
                        )}
                    </button>
                  )}
                   {currentUser ? (
                     <button onClick={() => { onLogout(); setIsMenuOpen(false); }} className="block mt-4 bg-red-500 text-white text-center font-semibold px-6 py-3 rounded-lg hover:bg-red-600 transition-colors duration-300">
                        Logout
                    </button>
                   ) : (
                    <button onClick={() => { onLoginClick(); setIsMenuOpen(false); }} className="block mt-4 bg-primary text-white text-center font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-colors duration-300">
                        Login / Sign Up
                    </button>
                   )}
              </nav>
          </div>
      </div>
    </>
  );
};

export default Header;
