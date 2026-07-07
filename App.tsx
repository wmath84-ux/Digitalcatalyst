
// FIX: Corrected the React import statement by removing the erroneous 'a' and fixing the destructuring syntax.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import MobileAppHome from './components/MobileAppHome';
import Hero from './components/Hero';
import ProductShowcase from './components/ProductShowcase';
import { isProductSearchVisible, withProductSearchIndex } from './utils/productSearch';
import Services, { ServiceItem } from './components/Services';
import AboutUs from './components/AboutUs';
import Faq, { FaqItem } from './components/Faq';
import Footer from './components/Footer';
import TrustBadges from './components/TrustBadges';
import Congratulations from './components/Congratulations';
import ProductDetailPage from './components/ProductDetailPage';
import AdminLogin from './components/admin/AdminLogin';
import AdminDashboard from './components/admin/AdminDashboard';
import FeaturedProducts from './components/FeaturedProducts';
import PurchasedProducts from './components/PurchasedProducts';
import CoursePlayer from './components/CoursePlayer';
import PolicyPage from './components/PolicyPage';
import AuthPage from './components/auth/AuthPage';
import WishlistPage from './components/FavouritesPage';
import CartSidebar from './components/CartSidebar';
import PaymentModal from './components/PaymentModal';
import UpcomingFeatures, { UpcomingFeatureItem } from './components/UpcomingFeatures';
import SubscriptionSuccessModal from './components/SubscriptionSuccessModal';
import LatestNews from './components/LatestNews';
import ComingSoonModal from './components/ComingSoonModal';
import { FreeProductsModal, FreeProductsPage } from './components/ContentModals';
import ReadingDrawer, { ReadingListType, ReadingView } from './components/ReadingDrawer';
import BottomGlassDock from './components/BottomGlassDock';
import ProfilePage from './components/ProfilePage';
import PlatformExperience from './components/PlatformExperience';
import SubscriptionPage from './components/SubscriptionPage';
import EduCoinGuidePage from './components/EduCoinGuidePage';
import EduvoraCommunity from './components/EduvoraCommunity';
import InstallAppButton from './components/InstallAppButton';
import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';
import { browserLocalPersistence, createUserWithEmailAndPassword, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile, User as FirebaseUser } from 'firebase/auth';
import { DEFAULT_ECONOMY_SETTINGS, EconomySettings, normalizeCoinPrice, resolveCoinPrice, subscribeEconomySettings } from './utils/economy';
import { ensureUserCoinWallet, spendUserCoinWallet } from './utils/coinWallet';
import { clearRememberedAuthAccount, getRememberedAuthAccount, RememberedAuthAccount, saveRememberedAuthAccount } from './utils/rememberedAuth';
import { isMobileViewport as getIsMobileViewport } from './utils/device';
import { getFirebaseAuthErrorMessageFromCode, mergePurchasedProductIds, normalizePurchaseIds as normalizeSharedPurchaseIds, shouldRestoreEntitlementStatus } from './utils/authParity';

// Firebase writes are best-effort with localStorage fallback so the app remains usable offline.
const GOOGLE_REDIRECT_ATTEMPT_KEY = 'digitalCatalyst.googleRedirectAttempt';

type MobileAuthFlowState = 'checking' | 'logged-out' | 'completing-session' | 'authenticated';
type AuthStatus = 'booting' | 'checking-session' | 'unauthenticated' | 'authenticated' | 'hydrating' | 'logout' | 'error';
type HydrationStatus = 'idle' | 'loading' | 'ready' | 'fallback' | 'error';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// --- SAFETY & UTILS ---

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Error Boundary Component to catch crashes and prevent White Screen of Death
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-6 text-center font-sans">
          <div className="max-w-lg bg-white/70 backdrop-blur-xl p-8 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-red-100">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-6">The application hit an unexpected error. Please reload the page; if the problem continues, share the error details with support.</p>
            
            {this.state.error?.message && (
                <div className="bg-gray-100 p-3 rounded text-left mb-6 overflow-auto max-h-32 text-xs font-mono text-gray-700 border border-gray-200">
                    Error: {this.state.error.message}
                </div>
            )}

            <div className="flex flex-col gap-3">
                <button onClick={() => window.location.reload()} className="w-full bg-white/70 text-slate-900 px-4 py-3 rounded-lg hover:bg-white/80 hover:shadow-sm font-semibold transition-colors">
                Reload Page
                </button>
                <details className="rounded-lg border border-red-100 bg-red-50/40 p-3 text-left">
                  <summary className="cursor-pointer text-sm font-bold text-red-700">Advanced troubleshooting</summary>
                  <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="mt-3 w-full bg-white/70 backdrop-blur-xl border border-red-200 text-red-600 px-4 py-3 rounded-lg hover:bg-red-50 font-semibold transition-colors">
                  Reset App Data
                  </button>
                  <p className="text-xs text-slate-600 mt-3">Warning: Resetting app data clears browser-only cache/settings. It should not be the first fix for content bugs.</p>
                </details>
            </div>
          </div>
        </div>
      );
    }

    // FIX: Explicitly cast 'this' to any to avoid "Property 'props' does not exist" error in some TS environments
    return (this as any).props.children;
  }
}

// Safe LocalStorage Wrapper
const safeSetItem = (key: string, value: any): boolean => {
    try {
        const serializedState = JSON.stringify(value);
        localStorage.setItem(key, serializedState);
        return true;
    } catch (err: any) {
        console.error(`Error saving state to localStorage for key "${key}":`, err);

        const isQuotaError =
            err?.name === 'QuotaExceededError' ||
            err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            err?.code === 22;

        if (isQuotaError) {
            console.warn(`Browser storage is full for "${key}". Firebase sync will still be attempted. Large admin assets should use Firebase Storage URLs instead of base64.`);
        }

        return false;
    }
};

const safeGetItem = <T,>(key: string, fallback: T): T => {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) as T : fallback;
    } catch (err) {
        console.warn(`Error reading state from localStorage for key "${key}":`, err);
        return fallback;
    }
};

// Interface for uploaded product files with specific types
export type ProductFileType = 'youtube' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'link' | 'ebook' | 'quiz';
export interface QuizQuestion {
  prompt: string;
  options: string[];
  correctAnswer: number;
}
export interface ProductQuiz {
  questions: QuizQuestion[];
}
export interface ProductDocPage {
  id: string;
  title: string;
  content: string;
  createdAt?: number;
  updatedAt?: number;
}
export type QuizAnswerState = Record<number, number>;
export type CourseAccessLevel = 'included' | 'paidUpdate' | 'hidden';

export interface CourseAccessMeta {
  accessLevel?: CourseAccessLevel;
  paidUpdateId?: string;
  paidUpdateTitle?: string;
  paidUpdatePrice?: string;
  paidUpdateCoinPrice?: number;
}

export interface ProductAccessState {
  productId: number;
  hasBaseAccess: boolean;
  ownedUpdateIds: string[];
  lockedPaidUpdateIds: string[];
  hasPaidLockedUpdates: boolean;
  lockedPaidUpdateCount: number;
}

export interface ProductFile extends CourseAccessMeta {
  id: string;
  name: string;
  type: ProductFileType;
  url: string; // For uploads, this is a hosted URL or a tiny safe data URL. For links, it's the URL.
  storagePath?: string;
  size?: number;
  contentType?: string;
  provider?: string;
  sourceType?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  embedUrl?: string;
  createdAt?: number;
  updatedAt?: number;
  content?: string; // Backward-compatible first page for Open Docs / e-book HTML content.
  docPages?: ProductDocPage[];
  quiz?: ProductQuiz;
}

// Interface for a course module, now supporting nested modules
export interface CourseModule extends CourseAccessMeta {
  id: string;
  title: string;
  files: ProductFile[];
  modules: CourseModule[]; // For nested modules
}

// New interface for price history
export interface PriceHistoryEntry {
    date: string; // YYYY-MM-DD
    price: number;
}

// Core product structure without rating
export interface Product {
  id: number;
  imageSeed: string;
  images: string[]; // First image is the primary thumbnail.
  productImages?: {
    card?: string;
    detailMobile?: string;
    detailDesktop?: string;
    homeTopRated?: string;
    homeList?: string;
    purchaseSquare?: string;
    purchaseCard?: string;
    galleryThumb?: string;
  };
  title: string;
  description: string;
  longDescription: string;
  features: string[];
  price: string;
  salePrice?: string;
  category?: string;
  department?: 'Men' | 'Women' | 'Unisex';
  inStock?: boolean;
  isVisible?: boolean; // To hide/show products from the store
  manualRating?: number | null;
  sku?: string;
  tags?: string[];
  dimensions?: string; 
  fileFormat?: string;
  courseContent?: CourseModule[];
  aspectRatio?: string;
  priceHistory?: PriceHistoryEntry[];
  isFree?: boolean;
  couponCode?: string;
  paymentLink: string; // Specific Razorpay Payment Page URL for this product (REQUIRED)
  wishlistCount?: number; // Analytics: How many people added to wishlist
  viewCount?: number; // Analytics: How many people viewed the details
  coinPrice?: number; // Optional EduCoin price. 0 disables coin checkout.
  keywords?: string[];
  normalizedTitle?: string;
  normalizedCategory?: string;
  normalizedTags?: string[];
  normalizedKeywords?: string[];
  searchableText?: string;
  normalizedSearchText?: string;
  searchTokens?: string[];
}


// Review structure
export interface Review {
    name: string;
    rating: number;
    comment: string;
    date: string;
}

// A derived type that includes the calculated rating for display
export interface ProductWithRating extends Product {
    rating: number; // This is the DISPLAY rating
    reviewCount: number;
    calculatedRating: number; // The actual rating from reviews
}

// User structure for authentication
export interface CoinTransaction {
    id?: string;
    amount: number;
    type: 'credit' | 'debit';
    source: string;
    title?: string;
    description: string;
    articleId?: number | string;
    productId?: number | string;
    createdAt: string;
    timestamp?: string;
}

export interface User {
    id: string;
    uid?: string;
    name: string;
    email: string;
    mobile: string;
    photoURL?: string;
    role?: 'user' | 'admin';
    status?: 'active' | 'blocked';
    blocked?: boolean;
    suspended?: boolean;
    password?: string; // Legacy local-mode fallback only. Never write Firebase passwords into this field.
    authProvider?: 'google' | 'password';
    providerIds?: string[];
    emailVerified?: boolean;
    createdAt: string;
    lastLoginAt?: string;
    eduCoins?: number; // Legacy mirror only. Checkout/profile must use coinBalance as source of truth.
    coinBalance?: number;
    totalCoinsEarned?: number;
    totalCoinsSpent?: number;
    studyMinutes?: number;
    totalWatchTimeMinutes?: number;
    totalLifetimeCoins?: number;
    rewardedArticleIds?: Array<number | string>;
    readArticles?: Array<number | string>;
    rewardedQuizIds?: Array<number | string>;
    claimedRewardIds?: Array<string>;
    profileStreakClaims?: Record<string, string>;
    coinTransactions?: CoinTransaction[];
    purchasedProductIds?: number[];
    purchasedProductUpdateIds?: Record<string, string[]>;
}

// New Admin User structure for multi-user admin management
export interface AdminUser {
    id: number;
    email: string;
    password: string; // NOTE: In a real app, this should be hashed.
    role: 'Developer' | 'Admin';
}

// Cart Item Structure
export interface CartItem {
    productId: number;
    quantity: number;
}

export interface ActiveCoinDiscount {
    type: 'coin';
    targetType: 'product' | 'subscription';
    amount: number;
    coins: number;
    productId?: number;
    subscriptionId?: string;
}


export type ProfileStreakMetric = 'dailyLogin' | 'studyMinutes' | 'watchMinutes' | 'pdfsRead' | 'coursesOwned' | 'completedCourses' | 'quizWins' | 'articlesRead' | 'lifetimeCoins' | 'coinTransactions' | 'milestonesClaimed' | 'badgesUnlocked';
export interface ProfileStreakConfig {
    id: string;
    title: string;
    icon: string;
    category?: string;
    metric: ProfileStreakMetric;
    goal: number;
    unit: string;
    coinReward: number;
    accent: string;
    note: string;
    active?: boolean;
    draft?: boolean;
    archived?: boolean;
    updatedAt?: string;
}
export type ProfileMilestoneMetric = 'lifetimeCoins' | 'studyMinutes' | 'watchMinutes' | 'coursesOwned' | 'completedCourses' | 'quizWins' | 'articlesRead' | 'pdfsRead' | 'streakClaims' | 'badgesUnlocked';
export interface ProfileMilestoneConfig {
    id: string;
    title: string;
    icon: string;
    category?: string;
    metric: ProfileMilestoneMetric;
    requirement: number;
    description: string;
    actionLabel: string;
    coinReward?: number;
    unlockProductIds?: number[];
    downloadContent?: string;
    active?: boolean;
    draft?: boolean;
    archived?: boolean;
    updatedAt?: string;
}
export interface ProfileStyleSettings {
    backgroundColor: string;
    backgroundTint: string;
    cardOpacity: number;
    heroOverlayOpacity: number;
    accentColor: string;
}

export interface CommunityStyleSettings {
    pageBackground: string;
    surfaceColor: string;
    cardColor: string;
    softBackground: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    headingColor: string;
    bodyColor: string;
    mutedColor: string;
    borderColor: string;
    activeTabBackground: string;
    activeTabText: string;
    dockBackground: string;
    dockItemBackground: string;
    dockActiveBackground: string;
    dockTextColor: string;
    dockActiveTextColor: string;
    outgoingBubble: string;
    incomingBubble: string;
    shadowOpacity: number;
}

// Coupon structure, now managed globally
export interface Coupon {
    id: number;
    code: string;
    type: 'percentage' | 'fixed';
    value: number;
    expiryDate: string;
    isActive: boolean;
    usageLimit: number;
    timesUsed: number;
}

// Homepage layout configuration
export interface HomepageSection {
  id: 'hero' | 'purchased' | 'topRated' | 'allProducts' | 'services' | 'about' | 'trust' | 'faq' | 'upcoming' | 'news';
  visible: boolean;
  title?: string;
}

// News Article structure
export interface NewsArticle {
  id: number;
  imageSeed: string;
  category: string;
  title: string;
  excerpt: string;
  date: string;
  content: string;
  type?: 'news' | 'blog';
  thumbnailImage?: string;
  coverImage: string;
  createdAt?: string;
  showPremiumLearningCta?: boolean;
}

// New Announcement structure
export interface Announcement {
  id: number;
  title: string;
  content: string;
  date: string;
}

// --- Order Management Types (centralized) ---
export interface OrderItem {
    id: number;
    name: string;
    quantity: number;
    price: string;
}

export interface OrderPaymentBreakdown {
    purchaseKind: 'product' | 'cart' | 'subscription';
    baseTotal: number;
    finalPrice: number;
    couponCode?: string | null;
    couponDiscount?: number;
    couponType?: 'percentage' | 'fixed';
    couponValue?: number;
    eduCoinsUsed?: number;
    eduCoinDiscount?: number;
    coinOnlyPurchase?: boolean;
    paymentLabel?: string;
    unlockedProductIds?: number[];
}

export interface Order {
    id: string;
    customerName: string;
    customerEmail: string;
    date: string;
    total: string;
    status: 'Pending' | 'Awaiting Verification' | 'Shipped' | 'Completed' | 'Cancelled';
    items: OrderItem[];
    shippingAddress: string;
    billingAddress: string;
    paymentBreakdown?: OrderPaymentBreakdown;
}

// New Support Ticket interface, centralized here
export interface SupportTicket {
    id: string;
    customerName: string;
    customerEmail: string;
    subject: string;
    message: string;
    date: string;
    status: 'Open' | 'Resolved' | 'Pending';
    source?: 'contact' | 'masterTag';
    communityThreadId?: number;
    customerAvatar?: string;
    category?: string;
    adminReply?: string;
    repliedAt?: string;
    inboxMessage?: string;
    inboxRead?: boolean;
}

export interface NewsletterSubscriber {
    id: string;
    email: string;
    subscribedAt: string;
}


// --- Theme Customization ---
export interface ThemePalette {
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    textMutedColor: string;
}

export type ThemeName = 'default' | 'midnight' | 'sunset' | 'forest' | 'rose';

export const themes: Record<ThemeName, { name: string; palette: ThemePalette }> = {
    default: {
        name: 'Default',
        palette: {
            primaryColor: '#172554',
            accentColor: '#4338ca',
            backgroundColor: '#eef4ff',
            textColor: '#0f172a',
            textMutedColor: '#334155',
        },
    },
    midnight: {
        name: 'Midnight',
        palette: {
            primaryColor: '#7dd3fc', // softer sky-300
            accentColor: '#818cf8', // softer indigo-400
            backgroundColor: '#0f172a', // slate-900
            textColor: '#e2e8f0', // slate-200
            textMutedColor: '#94a3b8', // slate-400
        },
    },
    sunset: {
        name: 'Sunset',
        palette: {
            primaryColor: '#c2410c', // muted orange-700
            accentColor: '#b45309', // muted amber-700
            backgroundColor: '#fffaf3', // softer warm canvas
            textColor: '#44403c', // stone-700
            textMutedColor: '#78716c', // stone-500
        },
    },
    forest: {
        name: 'Forest',
        palette: {
            primaryColor: '#166534', // green-800
            accentColor: '#15803d', // green-700
            backgroundColor: '#f6fbf7', // softened green canvas
            textColor: '#14532d', // green-950
            textMutedColor: '#3f6212', // olive-700
        },
    },
    rose: {
        name: 'Rose',
        palette: {
            primaryColor: '#be185d', // pink-700
            accentColor: '#be123c', // rose-700
            backgroundColor: '#fff7f8', // softer rose canvas
            textColor: '#500724', // rose-950
            textMutedColor: '#831843', // pink-900
        },
    },
};


// Comprehensive settings for the entire website, manageable from the admin panel
export interface WebsiteSettings {
    theme: {
        primaryColor: string;
        accentColor: string;
        backgroundColor: string;
        textColor: string;
        textMutedColor: string;
        fontPairing: 'inter-lato' | 'roboto-merriweather' | 'montserrat-oswald';
        cornerRadius: string; // e.g., '0.5rem'
        shadowIntensity: string; // e.g., '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
    };
    layout: HomepageSection[];
    features: {
        showFavourites: boolean;
        showReviews: boolean;
        showSaleBadges: boolean;
    };
    mobile: {
        hideFooter: boolean;
    };
    content: {
        siteName?: string;
        heroTitle: string;
        heroSubtitle: string;
        heroImageUrl?: string;
        heroMetrics: {
            enableRealData: boolean;
            customRevenue: string;
            customRevenueChange: string;
            customActiveUsers: string;
        };
        footerText: string;
        aboutUsTitle: string;
        aboutUsText: string;
        aboutUsImageSeed: string;
        services: ServiceItem[];
        faqs: FaqItem[];
        upcomingFeatures: UpcomingFeatureItem[];
        newsArticles: NewsArticle[];
        announcements: Announcement[];
        subscriptionPlans: [
            { id: 'starter', name: 'Starter', price: 199, coinPrice: 600, description: 'Best for beginners', unlockProductIds: [2] },
            { id: 'pro', name: 'Pro', price: 499, coinPrice: 1200, description: 'Unlock premium notes + course', unlockProductIds: [2] },
            { id: 'elite', name: 'Elite', price: 999, coinPrice: 2200, description: 'Full bundle access', unlockProductIds: [2] },
        ],
        eduCoinRules: { purchase: 25, redeemRate: 10 },
        redeemRewards: [{ id: 'r1', title: '₹50 discount', cost: 100 }, { id: 'r2', title: 'Premium PDF Pack', cost: 180 }],
        dockItems: ['Home','Store','Purchases','Wishlist','Cart','News','Community','Blog','Free','Profile','Subscriptions'],
        dockStyle?: {
            backgroundColor: string;
            backgroundOpacity: number;
            itemOpacity: number;
            accentOpacity: number;
            height?: number;
            iconSize?: number;
            labelSize?: number;
            padding?: number;
        };
        readingStyle?: {
            backgroundColor: string;
            backgroundOpacity: number;
            panelOpacity: number;
            cardOpacity: number;
            accentColor: string;
            accentOpacity: number;
        };
        profileStyle?: ProfileStyleSettings;
        communityStyle?: CommunityStyleSettings;
        profileStreaks?: ProfileStreakConfig[];
        profileMilestones?: ProfileMilestoneConfig[];
        socialLinks: {
            facebook: string;
            twitter: string;
            instagram: string;
            linkedin: string;
            pinterest: string;
            discord: string;
            reddit: string;
            quora: string;
        };
    };
    animations: {
        enabled: boolean;
        style: 'fade-up' | 'zoom-in';
    };
}

const initialProducts: Product[] = [
  {
    id: 2,
    imageSeed: "dropshipping-course",
    images: [
        "https://picsum.photos/seed/ecommerce-dashboard-course/800/600", 
        "https://picsum.photos/seed/dropshipping-supply-chain/800/600",
        "https://picsum.photos/seed/shopify-store-builder/800/600",
        "https://picsum.photos/seed/successful-online-business/800/600"
    ],
    title: "Dropshipping Masterclass",
    description: "Video course and PDF notes on how to start and scale a successful dropshipping business.",
    longDescription: "Launch your e-commerce empire without holding any inventory. Our Dropshipping Masterclass is a complete video course that walks you through every step: finding a profitable niche, sourcing reliable suppliers, building a high-converting Shopify store, and mastering Facebook Ads to drive traffic and sales. Includes downloadable resources and checklists.",
    features: ["Over 10 hours of video content", "Supplier vetting checklist", "Shopify store setup guide", "Facebook Ads blueprint", "Lifetime access to course updates"],
    price: "₹1999",
    category: "Online Courses",
    department: 'Men',
    inStock: true,
    isVisible: true,
    manualRating: null,
    sku: "COURSE-DROP-001",
    tags: ["dropshipping", "ecommerce", "video course"],
    dimensions: "10+ hours video",
    fileFormat: "MP4, PDF",
    aspectRatio: "aspect-video",
    paymentLink: "https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view",
    wishlistCount: 189,
    viewCount: 892,
    courseContent: [
       {
        id: 'mod-dropship-1',
        title: 'Module 1: Finding Your Niche',
        files: [
          {
            id: 'file-video-yt-1',
            name: 'Welcome to the Course!',
            type: 'youtube',
            url: 'https://www.youtube.com/watch?v=l6bTbg3aVIM'
          }
        ],
        modules: []
      }
    ],
    couponCode: 'WELCOME500',
  },
];

const initialReviews: { [productId: number]: Review[] } = {
    2: [
        { name: 'Amit Singh', rating: 5, comment: 'Absolutely the best dropshipping course out there. Worth every penny!', date: '3 days ago' },
    ],
};

const initialCoupons: Coupon[] = [
    { id: 1, code: 'SUMMER25', type: 'percentage', value: 25, expiryDate: '2027-12-31', isActive: true, usageLimit: 100, timesUsed: 42 },
    { id: 2, code: 'WELCOME500', type: 'fixed', value: 500, expiryDate: '2027-12-31', isActive: true, usageLimit: 500, timesUsed: 150 },
    { id: 3, code: 'MONSOON10', type: 'percentage', value: 10, expiryDate: '2027-12-31', isActive: true, usageLimit: 200, timesUsed: 198 },
    { id: 4, code: 'FLAT150', type: 'fixed', value: 150, expiryDate: '2027-12-31', isActive: true, usageLimit: 1000, timesUsed: 0 },
];

const initialOrders: Order[] = [
    { 
        id: 'DC-1024', 
        customerName: 'Rohan Sharma', 
        customerEmail: 'rohan.s@example.com', 
        date: '2024-07-21', 
        total: '₹1999', 
        status: 'Pending', 
        items: [{ id: 2, name: 'Dropshipping Masterclass', quantity: 1, price: '₹1999' }],
        shippingAddress: 'N/A (Digital Product)',
        billingAddress: '123 Tech Park, Bangalore, KA 560001',
    },
];


const initialMasterTagSupportTickets: SupportTicket[] = [
  { id: 'MT-1', customerName: 'Nisha Verma', customerEmail: 'nisha.verma@eduvora.community', subject: '@Master Master, please add weekly live doubt room', message: 'Many students need one fixed slot for funnel review, offer doubts, and quick action feedback.', date: new Date().toISOString(), status: 'Open', source: 'masterTag', communityThreadId: 1, customerAvatar: '👩‍🎓', category: 'Feature request' },
  { id: 'MT-2', customerName: 'Arjun Mehta', customerEmail: 'arjun.mehta@eduvora.community', subject: '@Master Video lesson notes are not opening on mobile', message: 'The PDF opens on desktop but keeps loading on my Android phone. Please check the download button.', date: new Date().toISOString(), status: 'Open', source: 'masterTag', communityThreadId: 2, customerAvatar: '🧑‍💼', category: 'Bug or issue' },
  { id: 'MT-3', customerName: 'Riya Sharma', customerEmail: 'riya.sharma@eduvora.community', subject: '@Master Need an update on next automation template', message: 'Can master upload the promised WhatsApp automation template before the weekend sprint?', date: new Date().toISOString(), status: 'Open', source: 'masterTag', communityThreadId: 3, customerAvatar: '🧕', category: 'Update' },
];

const initialSupportTickets: SupportTicket[] = [
    { 
        id: 'TKT-780B', 
        customerName: 'Amit Singh', 
        customerEmail: 'amit.singh@example.com', 
        subject: 'Question about Dropshipping Course', 
        message: "Hi, I'm interested in the Dropshipping Masterclass. Does it cover international suppliers, specifically from Europe? Thanks!",
        date: '2024-07-20T14:00:00Z', 
        status: 'Open' 
    },
];

const initialNewsArticles: NewsArticle[] = [
  {
    id: 1,
    imageSeed: "futuristic-seo-trends",
    type: "blog",
    thumbnailImage: "",
    coverImage: "https://placehold.co/800x400/e0e7ff/312e81?text=SEO+Trends",
    createdAt: "2024-07-28T09:00:00.000Z",
    category: "SEO",
    title: "Top 5 SEO Trends to Watch in 2025",
    excerpt: "Google's algorithm is constantly evolving. Stay ahead of the competition by understanding the key trends that will shape search engine optimization next year.",
    date: "2024-07-28",
    content: "In the ever-shifting landscape of digital marketing, staying ahead of SEO trends is not just an advantage; it's a necessity. As we look towards 2025, several key developments are set to redefine how we approach search engine optimization.\n\nFirst, the rise of AI-driven search, like Google's Search Generative Experience (SGE), will continue to mature. This means a greater emphasis on providing direct, comprehensive answers within the search results themselves. Content creators will need to focus on creating authoritative, well-structured information that can be easily parsed and presented by AI.\n\nSecond, voice search and conversational queries are becoming more prevalent. Optimizing for natural language and long-tail keywords that mimic how people speak will be crucial. Think 'What are the best digital marketing strategies for a small business?' rather than just 'digital marketing small business'.\n\nThird, visual search is gaining traction. Tools like Google Lens are changing how users find information. This requires high-quality, well-tagged images and a solid image SEO strategy, including descriptive alt text and file names.\n\nFourth, Core Web Vitals and overall user experience (UX) remain a top priority for Google. A fast, mobile-friendly, and easy-to-navigate website is non-negotiable. Page speed, interactivity, and visual stability are direct ranking factors.\n\nFinally, building topical authority is more important than ever. Instead of focusing on single keywords, businesses should aim to create comprehensive content hubs that cover a subject in depth. This signals expertise and trustworthiness to both users and search engines, establishing your brand as a go-to resource in your niche."
  },
  {
    id: 2,
    imageSeed: "ecommerce-conversion-funnel",
    type: "blog",
    thumbnailImage: "",
    coverImage: "https://placehold.co/800x400/e0e7ff/312e81?text=Ecommerce+Psychology",
    createdAt: "2024-07-25T09:00:00.000Z",
    category: "E-commerce",
    title: "The Psychology of Online Shopping: How to Convert More Customers",
    excerpt: "Discover the psychological triggers that motivate users to buy. We break down the science behind high-converting product pages and checkout processes.",
    date: "2024-07-25",
    content: "Full content for e-commerce psychology. This article would delve into concepts like social proof, scarcity, urgency, and the power of color and imagery in influencing purchasing decisions."
  },
  {
    id: 3,
    imageSeed: "ai-writing-robot",
    type: "news",
    thumbnailImage: "",
    coverImage: "https://placehold.co/800x400/e0e7ff/312e81?text=AI+Content+Marketing",
    createdAt: "2024-07-22T09:00:00.000Z",
    category: "Marketing",
    title: "AI in Content Marketing: A Practical Guide for Small Businesses",
    excerpt: "Artificial intelligence is no longer just for large corporations. Learn how you can leverage AI tools to create better content, faster and more efficiently.",
    date: "2024-07-22",
    content: "Full content for AI in marketing. This guide would provide a list of useful AI tools, prompts for generating blog post ideas, and strategies for using AI to analyze content performance."
  }
];

const initialAnnouncements: Announcement[] = [
    {
        id: 1,
        title: "Summer Sale Extended!",
        content: "Great news! Our annual Summer Sale has been extended by one more week due to popular demand. Enjoy up to 50% off on select courses and e-books until August 15th. Don't miss out on these hot deals!",
        date: "2024-08-01",
    },
    {
        id: 2,
        title: "New Course Launch: Social Media Mastery",
        content: "We're thrilled to announce the launch of our brand-new course, 'Social Media Mastery 2024'. Learn how to build a powerful brand presence, create engaging content, and drive sales through social media. The course is available now!",
        date: "2024-07-20",
    }
];

const initialAdminUsers: AdminUser[] = [
    { id: 1, email: 'developer@digitalcatalyst.com', password: 'admin', role: 'Developer' },
];


const defaultWebsiteSettings: WebsiteSettings = {
    theme: {
        primaryColor: '#1769FF',
        accentColor: '#7B61FF',
        backgroundColor: '#F8FBFF',
        textColor: '#081A45',
        textMutedColor: '#536178',
        fontPairing: 'inter-lato',
        cornerRadius: '0.75rem', // lg
        shadowIntensity: 'medium',
    },
    layout: [
        { id: 'hero', visible: true },
        { id: 'purchased', visible: true },
        { id: 'topRated', visible: true, title: 'Top Rated Products' },
        { id: 'allProducts', visible: true },
        { id: 'services', visible: true },
        { id: 'about', visible: true },
        { id: 'trust', visible: true },
        { id: 'upcoming', visible: true, title: "What's Next for Digital Catalyst?" },
        { id: 'news', visible: true, title: 'Daily Reading Hub' },
        { id: 'faq', visible: true },
    ],
    features: {
        showFavourites: true,
        showReviews: true,
        showSaleBadges: true,
    },
    mobile: {
        hideFooter: false,
    },
    content: {
        siteName: 'Digital Catalyst',
        heroTitle: "Elevate Your Digital Presence",
        heroSubtitle: "Learn premium notes, private courses, and focused study resources inside one beautiful learning workspace.",
        heroImageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1400&q=80",
        heroMetrics: {
            enableRealData: false,
            customRevenue: "+128%",
            customRevenueChange: "+128%",
            customActiveUsers: "2.4k+",
        },
        footerText: "© {year} Digital Catalyst. All rights reserved.",
        aboutUsTitle: "About Digital Catalyst",
        aboutUsText: "At Digital Catalyst, we are more than just a digital marketplace. We are a team of passionate marketers, creators, and strategists dedicated to empowering entrepreneurs and businesses to thrive in the online world. Our mission is to provide high-quality, actionable, and affordable digital resources. Whether you're starting a new e-commerce venture, looking to master digital marketing, or seeking expert guidance, we are your dedicated partner for growth.",
        aboutUsImageSeed: "creative-marketing-team",
        services: [
            { id: 1, title: "Digital Marketing Strategy", description: "We craft a tailored marketing plan for your business to boost online visibility and drive sales." },
            { id: 2, title: "Referral Marketing Setup", description: "Implement a powerful referral program to turn your customers into brand advocates." },
            { id: 3, title: "Dropshipping Consultation", description: "Get expert advice on product sourcing, store setup, and marketing for your dropshipping venture." },
        ],
        faqs: [
            { id: 1, question: "How will I receive my digital product after purchase?", answer: "Once your payment is confirmed, you will receive an email with a secure download link for your purchased e-book, PDF, or course materials. Please check your spam folder if you don't see it within a few minutes." },
            { id: 2, question: "What payment methods do you accept?", answer: "We accept all major credit cards, debit cards, UPI, and various net banking options through our secure Razorpay payment gateway." },
            { id: 3, question: "What is your refund policy for digital products?", answer: "Due to the nature of digital goods, all sales are final. However, if you encounter any issues with your download or the file, please contact our support team, and we'll be happy to assist you." },
            { id: 4, question: "How do I get started with one of our marketing services?", answer: "You can get started by visiting our 'Services' section and clicking 'Request a Quote' on the service you're interested in. Fill out the form, and our team will get back to you within 24 hours to discuss your project." },
        ],
        upcomingFeatures: [
            { id: 1, title: "AI-Powered Recommendations", description: "Get personalized product suggestions based on your browsing history and purchases.", status: 'In Development', icon: 'brain' },
            { id: 2, title: "Community Forum", description: "Connect with other entrepreneurs, share tips, and ask questions in our exclusive community.", status: 'Coming Soon', icon: 'people' },
            { id: 3, title: "Affiliate Program", description: "Earn commissions by referring new customers to our products and services.", status: 'Beta', icon: 'rocket' },
        ],
        newsArticles: initialNewsArticles,
        announcements: initialAnnouncements,
        subscriptionPlans: [
            { id: 'starter', name: 'Starter', price: 199, coinPrice: 600, description: 'Best for beginners', unlockProductIds: [2] },
            { id: 'pro', name: 'Pro', price: 499, coinPrice: 1200, description: 'Unlock premium notes + course', unlockProductIds: [2] },
            { id: 'elite', name: 'Elite', price: 999, coinPrice: 2200, description: 'Full bundle access', unlockProductIds: [2] },
        ],
        eduCoinRules: { purchase: 25, redeemRate: 10 },
        redeemRewards: [{ id: 'r1', title: '₹50 discount', cost: 100 }, { id: 'r2', title: 'Premium PDF Pack', cost: 180 }],
        dockItems: ['Home','Store','Purchases','Wishlist','Cart','News','Community','Blog','Free','Profile','Subscriptions'],
        dockStyle: {
            backgroundColor: '#FBFDFF',
            backgroundOpacity: 92,
            itemOpacity: 96,
            accentOpacity: 22,
            height: 76,
            iconSize: 36,
            labelSize: 11,
            padding: 12,
        },
        communityStyle: {
            pageBackground: '#F8FBFF',
            surfaceColor: '#FFFFFF',
            cardColor: '#FFFFFF',
            softBackground: '#EEF6FF',
            primaryColor: '#1769FF',
            secondaryColor: '#7B61FF',
            accentColor: '#C2E7FF',
            headingColor: '#081A45',
            bodyColor: '#536178',
            mutedColor: '#7C879A',
            borderColor: '#D9E7F8',
            activeTabBackground: '#E8F2FF',
            activeTabText: '#1769FF',
            dockBackground: '#FFFFFF',
            dockItemBackground: '#F8FBFF',
            dockActiveBackground: '#E8F2FF',
            dockTextColor: '#536178',
            dockActiveTextColor: '#1769FF',
            outgoingBubble: '#1769FF',
            incomingBubble: '#FFFFFF',
            shadowOpacity: 16,
        },
        readingStyle: {
            backgroundColor: '#F8FAFD',
            backgroundOpacity: 98,
            panelOpacity: 96,
            cardOpacity: 94,
            accentColor: '#C2E7FF',
            accentOpacity: 66,
        },
        profileStreaks: [
            { id: 'daily-login', title: 'Daily Login Spark', icon: '🔥', metric: 'dailyLogin', goal: 1, unit: 'day', coinReward: 10, accent: 'from-orange-400 via-amber-400 to-yellow-300', note: 'Open your hub every day and claim today’s flame.', active: true },
            { id: 'study-15', title: '15 Minute Focus', icon: '⏱️', metric: 'studyMinutes', goal: 15, unit: 'mins', coinReward: 15, accent: 'from-cyan-400 via-blue-500 to-indigo-500', note: 'Watch lessons or read learning content for 15 minutes.', active: true },
            { id: 'study-45', title: 'Deep Work Sprint', icon: '⚡', metric: 'studyMinutes', goal: 45, unit: 'mins', coinReward: 25, accent: 'from-violet-400 via-purple-500 to-fuchsia-500', note: 'Build a longer study session and earn a bigger boost.', active: true },
            { id: 'watch-60', title: 'Video Warrior', icon: '🎬', metric: 'watchMinutes', goal: 60, unit: 'mins', coinReward: 30, accent: 'from-blue-400 via-sky-500 to-cyan-400', note: 'Complete one hour of course video watch time.', active: true },
            { id: 'pdf-3', title: 'PDF Reader', icon: '📄', metric: 'pdfsRead', goal: 3, unit: 'PDFs', coinReward: 20, accent: 'from-emerald-400 via-teal-400 to-cyan-400', note: 'Read premium notes and document resources.', active: true },
            { id: 'article-3', title: 'Knowledge Hunter', icon: '🧠', metric: 'articlesRead', goal: 3, unit: 'reads', coinReward: 20, accent: 'from-lime-400 via-emerald-500 to-teal-500', note: 'Read news or blog lessons to keep learning daily.', active: true },
            { id: 'quiz-1', title: 'Quiz Ignition', icon: '🎯', metric: 'quizWins', goal: 1, unit: 'wins', coinReward: 25, accent: 'from-pink-400 via-rose-500 to-orange-400', note: 'Finish a quiz and claim your first quiz streak.', active: true },
            { id: 'quiz-3', title: 'Quiz Momentum', icon: '🏹', metric: 'quizWins', goal: 3, unit: 'wins', coinReward: 40, accent: 'from-fuchsia-400 via-purple-500 to-indigo-500', note: 'Stack multiple quiz rewards to keep momentum alive.', active: true },
            { id: 'course-1', title: 'Course Starter', icon: '📚', metric: 'coursesOwned', goal: 1, unit: 'course', coinReward: 25, accent: 'from-indigo-400 via-blue-500 to-cyan-400', note: 'Own your first course and start your premium path.', active: true },
            { id: 'complete-1', title: 'Completion Charge', icon: '✅', metric: 'completedCourses', goal: 1, unit: 'done', coinReward: 50, accent: 'from-green-400 via-emerald-500 to-teal-400', note: 'Complete a course progress target to unlock this.', active: true },
            { id: 'wallet-500', title: 'Coin Collector', icon: '🪙', metric: 'lifetimeCoins', goal: 500, unit: 'coins', coinReward: 35, accent: 'from-amber-300 via-yellow-400 to-orange-400', note: 'Earn lifetime coins from real platform activity.', active: true },
            { id: 'badge-3', title: 'Badge Builder', icon: '🏅', metric: 'badgesUnlocked', goal: 3, unit: 'badges', coinReward: 30, accent: 'from-slate-500 via-indigo-500 to-purple-500', note: 'Unlock badges by learning, reading, and completing.', active: true },
        ],
        profileMilestones: [
            { id: 'first-login-flame', title: 'First Login Flame', icon: '🔥', metric: 'studyMinutes', requirement: 1, description: 'Start learning with your first active minute.', actionLabel: 'Claim Coins', coinReward: 25, active: true },
            { id: 'article-reader', title: 'Article Reader', icon: '📰', metric: 'articlesRead', requirement: 3, description: 'Read three learning articles or blog lessons.', actionLabel: 'Claim Reading Bonus', coinReward: 40, active: true },
            { id: 'video-hour', title: 'One Hour Video Charge', icon: '🎬', metric: 'watchMinutes', requirement: 60, description: 'Complete 60 minutes of real course video watch time.', actionLabel: 'Claim Watch Bonus', coinReward: 60, active: true },
            { id: 'quiz-master-real', title: 'Quiz Master', icon: '🎯', metric: 'quizWins', requirement: 3, description: 'Claim rewards from three unique quizzes.', actionLabel: 'Claim Quiz Bonus', coinReward: 75, active: true },
            { id: 'pdf-scholar', title: 'PDF Scholar', icon: '📄', metric: 'pdfsRead', requirement: 5, description: 'Read or own five PDF/document resources.', actionLabel: 'Download Scholar Pack', coinReward: 50, downloadContent: 'Digital Catalyst PDF Scholar Pack\n\n- Reading checklist\n- Revision tracker\n- Daily active planner', active: true },
            { id: 'course-finisher', title: 'Course Finisher', icon: '✅', metric: 'completedCourses', requirement: 1, description: 'Reach 100% completion on a course progress tracker.', actionLabel: 'Claim Completion Bonus', coinReward: 100, active: true },
            { id: 'wallet-elite', title: 'Wallet Elite', icon: '💎', metric: 'lifetimeCoins', requirement: 1000, description: 'Earn 1000 lifetime EduCoins from real activity.', actionLabel: 'Claim Elite Badge', coinReward: 125, active: true },
            { id: 'premium-unlocker', title: 'Premium Unlocker', icon: '🎓', metric: 'coursesOwned', requirement: 2, description: 'Own two premium learning products.', actionLabel: 'Unlock Bonus Access', coinReward: 80, unlockProductIds: [], active: true },
        ],
        socialLinks: {
            facebook: "https://www.facebook.com/profile.php?viewas=100000686899395&id=61565419447036",
            twitter: "https://x.com/MathW12385",
            instagram: "https://www.instagram.com/earthbeforescientist/",
            linkedin: "https://www.linkedin.com/in/math-wallah-5363b7381/",
            pinterest: "https://in.pinterest.com/shuklahariomji1234/",
            discord: "https://canary.discord.com/channels/1439528570929020932/1439528571583467584",
            reddit: "https://www.reddit.com/user/Euphoric_View1193/",
            quora: "https://www.quora.com/profile/Math-Wallah02",
        }
    },
    animations: {
        enabled: true,
        style: 'fade-up',
    },
};


const GLOBAL_PRODUCTS_COLLECTION = 'siteProducts';
const GLOBAL_COUPONS_COLLECTION = 'siteCoupons';
const GLOBAL_TICKETS_COLLECTION = 'siteSupportTickets';
const GLOBAL_ORDERS_COLLECTION = 'siteOrders';
const GLOBAL_REVIEWS_DOC = ['siteData', 'productReviews'] as const;
const GLOBAL_WEBSITE_SETTINGS_DOC = ['settings', 'website'] as const;

const stripUndefinedDeep = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => stripUndefinedDeep(item)) as T;
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce((acc, [key, entry]) => {
      if (entry !== undefined) (acc as Record<string, unknown>)[key] = stripUndefinedDeep(entry);
      return acc;
    }, {} as Record<string, unknown>) as T;
  }
  return value;
};

const syncArrayCollectionToFirestore = async <T extends Record<string, any>>(
  collectionName: string,
  items: T[],
  getId: (item: T) => string,
) => {
  const collectionRef = collection(db, collectionName);
  const existingSnapshot = await getDocs(collectionRef);
  const batch = writeBatch(db);
  const nextIds = new Set(items.map(getId));

  existingSnapshot.docs.forEach(snapshot => {
    if (!nextIds.has(snapshot.id)) batch.delete(snapshot.ref);
  });

  items.forEach(item => {
    batch.set(doc(db, collectionName, getId(item)), stripUndefinedDeep(item), { merge: false });
  });

  await batch.commit();
};

const logGlobalSyncWarning = (scope: string, error: unknown) => {
  console.warn(`${scope} global sync failed; local data remains available.`, error);
};

const App: React.FC = () => {
  // Initialize products with default data immediately to prevent "white screen" or empty state
  const [products, setProducts] = useState<Product[]>([]);
  const [canShowInstallPrompt, setCanShowInstallPrompt] = useState(false);
  const [reviews, setReviews] = useState<{ [productId: number]: Review[] }>({});
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [tickets, setTickets] = useState<SupportTicket[]>(initialSupportTickets);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [currentView, setCurrentView] = useState('home'); 
  const [networkBanner, setNetworkBanner] = useState(() => (typeof navigator !== 'undefined' && !navigator.onLine ? 'You are offline. Some features may not work until internet is back.' : ''));
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'signup'>('login');
  const [isAuthStateReady, setIsAuthStateReady] = useState(false);
  const [isRedirectResultPending, setIsRedirectResultPending] = useState(false);
  const isRedirectResultPendingRef = useRef(false);
  const authOperationInProgressRef = useRef(false);
  const committedFirebaseUidRef = useRef<string | null>(null);
  const logoutInProgressRef = useRef(false);
  const [isLocalLogoutPending, setIsLocalLogoutPending] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => getIsMobileViewport());
  const [mobileAuthFlowState, setMobileAuthFlowState] = useState<MobileAuthFlowState>('checking');
  const [firebaseAuthUser, setFirebaseAuthUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const goOffline = () => setNetworkBanner('You are offline. Some features may not work until internet is back.');
    const goOnline = () => {
      setNetworkBanner('You are back online.');
      window.setTimeout(() => setNetworkBanner(''), 3500);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    if (typeof navigator !== 'undefined' && !navigator.onLine) goOffline();
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  const currentViewRef = React.useRef(currentView);
  const historyNavigationRef = React.useRef(false);
  const lastHistoryViewRef = React.useRef(currentView);
  const appViewStackRef = React.useRef<string[]>([currentView]);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithRating | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [purchasedProductIds, setPurchasedProductIds] = useState<number[]>([]);
  const [purchasedProductUpdateIds, setPurchasedProductUpdateIds] = useState<Record<string, string[]>>({});
  const [latestUpdateCheckout, setLatestUpdateCheckout] = useState<{ product: ProductWithRating; updateId?: string } | null>(null);
  const [isAuthRestoring, setIsAuthRestoring] = useState(false);
  const [authRestoreError, setAuthRestoreError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('booting');
  const [profileStatus, setProfileStatus] = useState<HydrationStatus>('idle');
  const [purchaseStatus, setPurchaseStatus] = useState<HydrationStatus>('idle');
  const [authError, setAuthError] = useState<string | null>(null);
  const [scrollToSection, setScrollToSection] = useState<string | null>(null);
  const [scrollToPolicySection, setScrollToPolicySection] = useState<string | null>(null);
  const [scrollToProductSection, setScrollToProductSection] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [liveEduCoinBalance, setLiveEduCoinBalance] = useState<number | null>(null);
  const [rememberedAuthAccount, setRememberedAuthAccount] = useState<RememberedAuthAccount | null>(() => getRememberedAuthAccount());
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>(initialAdminUsers);
  const [currentAdminUser, setCurrentAdminUser] = useState<AdminUser | null>(null);
  const [productToBuyAfterLogin, setProductToBuyAfterLogin] = useState<ProductWithRating | null>(null);
  const [resumeCartCheckoutAfterLogin, setResumeCartCheckoutAfterLogin] = useState(false);
  const [autoOpenPaymentModalFor, setAutoOpenPaymentModalFor] = useState<number | null>(null);
  const [activeCoinDiscount, setActiveCoinDiscount] = useState<ActiveCoinDiscount | null>(null);
  const [eduCoinGuideRequest, setEduCoinGuideRequest] = useState<{ requiredCoins: number; balance: number; missingCoins: number; productTitle?: string } | null>(null);
  
  const [websiteSettings, setWebsiteSettings] = useState<WebsiteSettings>(defaultWebsiteSettings);
  const [economySettings, setEconomySettings] = useState<EconomySettings>(DEFAULT_ECONOMY_SETTINGS);
  
  // New E-commerce State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartToastMessage, setCartToastMessage] = useState('');
  const [isCartPaymentModalOpen, setIsCartPaymentModalOpen] = useState(false);
  const isCartOpenRef = useRef(false);
  const isCartPaymentModalOpenRef = useRef(false);
  const latestUpdateCheckoutRef = useRef<typeof latestUpdateCheckout>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeSessionUidRef = useRef<string | null>(null);
  const sessionUnsubscribeRef = useRef<(() => void) | null>(null);
  const sessionCompletionRef = useRef<{ uid: string; startedAt: number } | null>(null);
  const sessionCompletionPromiseRef = useRef<Promise<User | null> | null>(null);
  const lastCompletedSessionRef = useRef<{ uid: string; at: number } | null>(null);
  const authRedirectHandledRef = useRef<{ uid: string; source?: string; at: number } | null>(null);
  const [mobileCompletionInput, setMobileCompletionInput] = useState('');
  const [mobileCompletionError, setMobileCompletionError] = useState('');
  const [isSavingMobileCompletion, setIsSavingMobileCompletion] = useState(false);
  const [isMobileCompletionModalOpen, setIsMobileCompletionModalOpen] = useState(false);

  const effectiveFirebaseUser = isLocalLogoutPending ? null : (firebaseAuthUser || auth.currentUser || null);
  const hasFirebaseUser = Boolean(effectiveFirebaseUser);
  const effectiveAppUser = currentUser || (effectiveFirebaseUser ? createFallbackUserFromFirebase(effectiveFirebaseUser) : null);
  const isLoggedIn = Boolean(effectiveFirebaseUser);
  const isAuthBooting = authStatus === 'booting' || authStatus === 'checking-session' || isRedirectResultPending;

  const readEduCoinBalance = (user?: Partial<User> | null) =>
    Math.max(0, Math.floor(Number(user?.coinBalance ?? user?.eduCoins ?? 0)));

  const liveWalletBalance = liveEduCoinBalance ?? readEduCoinBalance(effectiveAppUser);

  const normalizePurchasedProductUpdateIds = (value: unknown): Record<string, string[]> => {
    if (!value || typeof value !== 'object') return {};

    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string[]>>((acc, [productId, updateIds]) => {
      const cleanProductId = String(productId);
      const cleanUpdateIds = Array.isArray(updateIds)
        ? [...new Set(updateIds.map(item => String(item || '').trim()).filter(Boolean))]
        : [];

      if (cleanProductId && cleanUpdateIds.length > 0) {
        acc[cleanProductId] = cleanUpdateIds;
      }

      return acc;
    }, {});
  };

  const getCourseAccessLevel = (item?: Partial<CourseAccessMeta> | null): CourseAccessLevel => {
    if (item?.accessLevel === 'paidUpdate' || item?.accessLevel === 'hidden') return item.accessLevel;
    return 'included';
  };

  const getCourseItemUpdateId = (productId: number, item: Partial<CourseAccessMeta> & { id?: string }) =>
    String(item.paidUpdateId || `product-${productId}-update-${item.id || 'content'}`).trim();

  const mergeUpdateIds = (current: string[] = [], next: string[] = []) =>
    [...new Set([...current, ...next].map(item => String(item || '').trim()).filter(Boolean))];

  useEffect(() => {
    const uid = effectiveFirebaseUser?.uid || auth.currentUser?.uid;

    if (!uid || isLocalLogoutPending) {
      setLiveEduCoinBalance(null);
      return undefined;
    }

    void ensureUserCoinWallet(uid).catch((error) => {
      console.warn('EduCoin wallet initialization failed; live listener will continue with existing data.', error);
    });

    const userRef = doc(db, 'users', uid);

    return onSnapshot(userRef, (snapshot) => {
      if (!snapshot.exists()) {
        setLiveEduCoinBalance(0);
        return;
      }

      const remoteUser = snapshot.data() as Partial<User>;
      const remoteBalance = readEduCoinBalance(remoteUser);
      const remoteLifetimeCoins = Math.max(
        0,
        Math.floor(Number(remoteUser.totalCoinsEarned ?? remoteUser.totalLifetimeCoins ?? remoteBalance))
      );
      const remoteSpentCoins = Math.max(0, Math.floor(Number(remoteUser.totalCoinsSpent ?? 0)));

      setLiveEduCoinBalance(remoteBalance);

      setCurrentUser((current) => {
        if (!current || String(current.id) !== uid) return current;

        const syncedUser: User = {
          ...current,
          uid,
          coinBalance: remoteBalance,
          eduCoins: remoteBalance,
          totalCoinsEarned: remoteLifetimeCoins,
          totalCoinsSpent: remoteSpentCoins,
          totalLifetimeCoins: Math.max(Number(current.totalLifetimeCoins || 0), remoteLifetimeCoins),
        };

        safeSetItem('currentUser', syncedUser);
        return syncedUser;
      });

      setUsers((current) => {
        const nextUsers = current.map((user) =>
          String(user.id) === uid
            ? {
                ...user,
                uid,
                coinBalance: remoteBalance,
                eduCoins: remoteBalance,
                totalCoinsEarned: remoteLifetimeCoins,
                totalCoinsSpent: remoteSpentCoins,
                totalLifetimeCoins: Math.max(Number(user.totalLifetimeCoins || 0), remoteLifetimeCoins),
              }
            : user
        );

        safeSetItem('siteUsers', nextUsers);
        return nextUsers;
      });
    }, (error) => {
      console.warn('Live EduCoin wallet sync failed; using cached balance.', error);
    });
  }, [effectiveFirebaseUser?.uid, isLocalLogoutPending]);


  useEffect(() => {
    const updateMobileViewport = () => setIsMobileViewport(getIsMobileViewport());
    updateMobileViewport();
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 768px)');
    media.addEventListener?.('change', updateMobileViewport);
    window.addEventListener('resize', updateMobileViewport, { passive: true });
    return () => {
      media.removeEventListener?.('change', updateMobileViewport);
      window.removeEventListener('resize', updateMobileViewport);
    };
  }, []);


  const normalizeCourseModules = (modules?: CourseModule[]): CourseModule[] => (modules || []).map(module => ({
    ...module,
    accessLevel: getCourseAccessLevel(module),
    paidUpdateId: module.paidUpdateId || '',
    paidUpdateTitle: module.paidUpdateTitle || '',
    paidUpdatePrice: module.paidUpdatePrice || '',
    paidUpdateCoinPrice: Number(module.paidUpdateCoinPrice || 0),
    files: (module.files || []).map(file => ({
      ...file,
      accessLevel: getCourseAccessLevel(file),
      paidUpdateId: file.paidUpdateId || '',
      paidUpdateTitle: file.paidUpdateTitle || '',
      paidUpdatePrice: file.paidUpdatePrice || '',
      paidUpdateCoinPrice: Number(file.paidUpdateCoinPrice || 0),
      quiz: file.quiz
        ? { questions: (file.quiz.questions || []).map(question => ({ ...question, options: question.options || [] })) }
        : file.type === 'quiz' ? { questions: [] } : file.quiz,
    })),
    modules: normalizeCourseModules(module.modules || []),
  }));

  const normalizeProductArrays = (product: Product): Product => withProductSearchIndex({
    ...product,
    images: product.images || [],
    features: product.features || [],
    tags: product.tags || [],
    keywords: product.keywords || [],
    courseContent: normalizeCourseModules(product.courseContent || []),
    priceHistory: product.priceHistory || [],
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentState = window.history.state || {};
    if (currentState.dcView !== currentView) {
      window.history.replaceState({ ...currentState, dcView: currentView }, '', window.location.href);
    }
    lastHistoryViewRef.current = currentView;

    const onPopState = (event: PopStateEvent) => {
      if (latestUpdateCheckoutRef.current) {
        setLatestUpdateCheckout(null);
        return;
      }
      if (isCartPaymentModalOpenRef.current) {
        setIsCartPaymentModalOpen(false);
        return;
      }
      if (isCartOpenRef.current) {
        setIsCartOpen(false);
        return;
      }
      const nextView = event.state?.dcView;
      if (currentViewRef.current === 'community' && nextView !== 'community') {
        (window as any).__eduvoraCommunityHandledBack = false;
        window.dispatchEvent(new CustomEvent('eduvora-community-back-request'));

        if ((window as any).__eduvoraCommunityHandledBack) {
          (window as any).__eduvoraCommunityHandledBack = false;
          return;
        }
      }
      if (typeof nextView === 'string') {
        historyNavigationRef.current = true;
        setCurrentView(nextView);
        return;
      }
      if (currentViewRef.current !== 'home') {
        historyNavigationRef.current = true;
        window.history.pushState({ dcView: 'home' }, '', window.location.href);
        setCurrentView('home');
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    isCartOpenRef.current = isCartOpen;
  }, [isCartOpen]);

  useEffect(() => {
    isCartPaymentModalOpenRef.current = isCartPaymentModalOpen;
  }, [isCartPaymentModalOpen]);

  useEffect(() => {
    latestUpdateCheckoutRef.current = latestUpdateCheckout;
  }, [latestUpdateCheckout]);

  useEffect(() => {
    currentViewRef.current = currentView;
    if (typeof window === 'undefined') return;
    if (historyNavigationRef.current) {
      historyNavigationRef.current = false;
      lastHistoryViewRef.current = currentView;
      return;
    }
    if (lastHistoryViewRef.current === currentView) return;
    appViewStackRef.current = [...appViewStackRef.current.filter((view) => view !== currentView), currentView].slice(-12);
    window.history.pushState({ ...(window.history.state || {}), dcView: currentView }, '', window.location.href);
    lastHistoryViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const getDock = () => document.getElementById('main-bottom-dock');
    const shouldUseDesktopPointerReveal = () => window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)').matches;
    const revealZonePx = 180;
    let lastPointerY = Number.POSITIVE_INFINITY;

    const applyDockVisibility = () => {
      const dock = getDock();
      if (!dock) return;
      const isScrollHidden = dock.dataset.scrollHidden === 'true';
      const isPointerRevealActive = dock.dataset.pointerReveal === 'true';
      dock.dataset.hidden = isScrollHidden && !isPointerRevealActive ? 'true' : 'false';
    };

    const updatePointerReveal = (clientY: number) => {
      const dock = getDock();
      if (!dock) return;
      if (!shouldUseDesktopPointerReveal()) {
        dock.dataset.pointerReveal = 'false';
        applyDockVisibility();
        return;
      }
      lastPointerY = clientY;
      dock.dataset.pointerReveal = window.innerHeight - clientY <= revealZonePx ? 'true' : 'false';
      applyDockVisibility();
    };

    const onScroll = () => {
      const dock = getDock();
      if (!dock) return;
      const y = window.scrollY;
      const last = Number(dock.dataset.lastY || 0);
      const delta = y - last;
      if (Math.abs(delta) > 2) {
        dock.dataset.scrollHidden = delta > 0 && y > 120 ? 'true' : 'false';
        dock.dataset.lastY = String(y);
      }
      if (Number.isFinite(lastPointerY)) updatePointerReveal(lastPointerY);
      else applyDockVisibility();
    };

    const onPointerMove = (event: PointerEvent | MouseEvent) => {
      updatePointerReveal(event.clientY);
    };

    const onPointerLeave = () => {
      const dock = getDock();
      if (!dock) return;
      lastPointerY = Number.POSITIVE_INFINITY;
      dock.dataset.pointerReveal = 'false';
      applyDockVisibility();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('mousemove', onPointerMove, { passive: true });
    document.addEventListener('mouseleave', onPointerLeave);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseleave', onPointerLeave);
    };
  }, []);

  const playWelcomeVoice = useCallback(() => {
    setCanShowInstallPrompt(true);
  }, []);

  const [appliedCartCoupon, setAppliedCartCoupon] = useState<Coupon | null>(null);
  const [cartCouponError, setCartCouponError] = useState<string | null>(null);
  const [applyCartEduCoins, setApplyCartEduCoins] = useState(false);

  // Subscription Modal State
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [subscribedEmail, setSubscribedEmail] = useState('');
  const [coinToast, setCoinToast] = useState<string | null>(null);

  // Unified Info Modal State
  const [infoModal, setInfoModal] = useState<{ title: string; message: string; icon: string; } | null>(null);
  
  // New Large Content Modal States
  const [isReadingDrawerOpen, setIsReadingDrawerOpen] = useState(false);
  const [readingDrawerView, setReadingDrawerView] = useState<ReadingView>('blog');
  const [readingListType, setReadingListType] = useState<ReadingListType>('blog');
  const [isFreeModalOpen, setIsFreeModalOpen] = useState(false);
  
  // User Theme State
  const [activeTheme, setActiveTheme] = useState<ThemeName>('default');


  useEffect(() => {
    return subscribeEconomySettings(setEconomySettings, (error) => {
      console.warn('Economy settings sync failed; default economy settings are active.', error);
    });
  }, []);

  // --- Data Loading and Persistence ---
  
  // --- SWITCHED TO LOCAL STORAGE MODE ---
  // Removed Firebase onSnapshot listener to prevent crashes.
  // Now loading products from localStorage or falling back to initialProducts.
  useEffect(() => {
    try {
      const storedProducts = localStorage.getItem('siteProducts');
      const hasPurgedLegacyProducts = localStorage.getItem('legacyProductsPurged') === 'true';
      if (storedProducts && hasPurgedLegacyProducts) {
          
          const parsedProducts = JSON.parse(storedProducts);
          setProducts(Array.isArray(parsedProducts) ? parsedProducts.map(normalizeProductArrays) : initialProducts.map(normalizeProductArrays));
      } else {
          setProducts(initialProducts.map(normalizeProductArrays));
          safeSetItem('siteProducts', initialProducts.map(normalizeProductArrays));
          localStorage.setItem('legacyProductsPurged', 'true');
      }
    } catch (err) {
      console.error("Error loading products from localStorage:", err);
      setProducts(initialProducts.map(normalizeProductArrays));
    }
  }, []);

  // Persist products to localStorage whenever they change
  useEffect(() => {
      if (products.length > 0) {
          safeSetItem('siteProducts', products);
      }
  }, [products]);

  useEffect(() => {
    const storedWishlist = localStorage.getItem('productWishlist');
    if (storedWishlist) setWishlist(JSON.parse(storedWishlist));

    const storedReviews = localStorage.getItem('productReviews');
    if (storedReviews) setReviews(JSON.parse(storedReviews)); else setReviews(initialReviews);
    
    // Purchases are authenticated state. Never hydrate or clear global cached unlocks on startup;
    // Firestore entitlements are restored from Firebase Auth sessions only.

    const storedCart = localStorage.getItem('shoppingCart');
    if (storedCart) setCart(JSON.parse(storedCart));

    const storedUsers = localStorage.getItem('siteUsers');
    const parsedUsers: User[] = storedUsers ? JSON.parse(storedUsers) : [];
    const loadedUsers: User[] = parsedUsers.map(user => {
        const walletBalance = user.coinBalance ?? user.eduCoins ?? 0;
        const totalCoinsEarned = user.totalCoinsEarned ?? user.totalLifetimeCoins ?? user.eduCoins ?? 0;

        return {
            ...user,
            name: user.name || user.email?.split('@')[0] || 'Learner',
            mobile: user.mobile || '',
            coinBalance: walletBalance,
            totalCoinsEarned,
            totalCoinsSpent: user.totalCoinsSpent ?? 0,
            eduCoins: walletBalance,
            studyMinutes: user.studyMinutes ?? 0,
            totalWatchTimeMinutes: user.totalWatchTimeMinutes ?? user.studyMinutes ?? 0,
            totalLifetimeCoins: totalCoinsEarned,
            rewardedArticleIds: user.rewardedArticleIds || [],
            readArticles: user.readArticles || user.rewardedArticleIds || [],
            rewardedQuizIds: user.rewardedQuizIds || [],
            claimedRewardIds: user.claimedRewardIds || [],
            profileStreakClaims: user.profileStreakClaims || {},
            coinTransactions: user.coinTransactions || [],
        };
    });
    setUsers(loadedUsers);
    safeSetItem('siteUsers', loadedUsers);
    
    const storedAdminUsers = localStorage.getItem('adminUsers');
    if (storedAdminUsers) setAdminUsers(JSON.parse(storedAdminUsers)); else setAdminUsers(initialAdminUsers);

    const storedSettings = localStorage.getItem('websiteSettings');
    if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        setWebsiteSettings({
    ...defaultWebsiteSettings,
    ...parsedSettings,
    mobile: { ...defaultWebsiteSettings.mobile, ...(parsedSettings.mobile || {}) },
    content: {
        ...defaultWebsiteSettings.content,
        ...(parsedSettings.content || {}),
        dockStyle: {
            ...defaultWebsiteSettings.content.dockStyle,
            ...((parsedSettings.content as any)?.dockStyle || {}),
        },
        communityStyle: {
            ...defaultWebsiteSettings.content.communityStyle,
            ...((parsedSettings.content as any)?.communityStyle || {}),
        },
    },
});
    }
    
    const storedCoupons = localStorage.getItem('siteCoupons');
    if (storedCoupons) setCoupons(JSON.parse(storedCoupons)); else setCoupons(initialCoupons);
    
    const storedOrders = localStorage.getItem('siteOrders');
    if (storedOrders) setOrders(JSON.parse(storedOrders)); else setOrders(initialOrders);

    const storedTickets = localStorage.getItem('siteSupportTickets');
    if (storedTickets) {
      const parsedTickets: SupportTicket[] = JSON.parse(storedTickets);
      const mergedTickets = [...parsedTickets];
      initialMasterTagSupportTickets.forEach(ticket => { if (!mergedTickets.some(item => item.id === ticket.id)) mergedTickets.push(ticket); });
      setTickets(mergedTickets);
      safeSetItem('siteSupportTickets', mergedTickets);
    } else setTickets([...initialMasterTagSupportTickets, ...initialSupportTickets]);

    const storedSubscribers = localStorage.getItem('newsletterSubscribers');
    if (storedSubscribers) setNewsletterSubscribers(JSON.parse(storedSubscribers));

    const storedCurrentAdmin = localStorage.getItem('currentAdminUser');
    if (storedCurrentAdmin) {
      try {
        const currentAdminData: AdminUser = JSON.parse(storedCurrentAdmin);
        const adminIsValid = (storedAdminUsers ? JSON.parse(storedAdminUsers) : initialAdminUsers).some((u: AdminUser) => u.id === currentAdminData.id);
        if (adminIsValid) setCurrentAdminUser(currentAdminData);
        else localStorage.removeItem('currentAdminUser');
      } catch (e) {
        localStorage.removeItem('currentAdminUser');
      }
    }
    
    const storedTheme = localStorage.getItem('activeTheme') as ThemeName;
    if (storedTheme && themes[storedTheme]) {
        setActiveTheme(storedTheme);
    }

  }, []);
  
  useEffect(() => {
    const unsubscribeProducts = onSnapshot(collection(db, GLOBAL_PRODUCTS_COLLECTION), (snapshot) => {
      const remoteProducts = snapshot.docs
        .map(item => normalizeProductArrays(item.data() as Product))
        .filter(product => Number.isFinite(Number(product.id)))
        .sort((a, b) => Number(a.id) - Number(b.id));

      setProducts(remoteProducts);
      safeSetItem('siteProducts', remoteProducts);

      try {
        localStorage.setItem('legacyProductsPurged', 'true');
      } catch (error) {
        console.warn('Could not mark product cache as synced.', error);
      }
    }, error => {
      logGlobalSyncWarning('Products', error);
    });

    const unsubscribeCoupons = onSnapshot(collection(db, GLOBAL_COUPONS_COLLECTION), (snapshot) => {
      if (snapshot.empty) return;
      const remoteCoupons = snapshot.docs
        .map(item => item.data() as Coupon)
        .sort((a, b) => Number(b.id) - Number(a.id));
      setCoupons(remoteCoupons);
      safeSetItem('siteCoupons', remoteCoupons);
    }, error => logGlobalSyncWarning('Coupons', error));

    const unsubscribeTickets = onSnapshot(collection(db, GLOBAL_TICKETS_COLLECTION), (snapshot) => {
      if (snapshot.empty) return;
      const remoteTickets = snapshot.docs
        .map(item => item.data() as SupportTicket)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setTickets(remoteTickets);
      safeSetItem('siteSupportTickets', remoteTickets);
    }, error => logGlobalSyncWarning('Support tickets', error));

    const unsubscribeOrders = onSnapshot(collection(db, GLOBAL_ORDERS_COLLECTION), (snapshot) => {
      if (snapshot.empty) return;
      const remoteOrders = snapshot.docs
        .map(item => item.data() as Order)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setOrders(remoteOrders);
      safeSetItem('siteOrders', remoteOrders);
    }, error => logGlobalSyncWarning('Orders', error));

    const unsubscribeReviews = onSnapshot(doc(db, ...GLOBAL_REVIEWS_DOC), (snapshot) => {
      if (!snapshot.exists()) return;
      const remoteReviews = (snapshot.data()?.reviews || {}) as { [productId: number]: Review[] };
      setReviews(remoteReviews);
      safeSetItem('productReviews', remoteReviews);
    }, error => logGlobalSyncWarning('Reviews', error));

    const unsubscribeWebsiteSettings = onSnapshot(doc(db, ...GLOBAL_WEBSITE_SETTINGS_DOC), (snapshot) => {
      if (!snapshot.exists()) return;
      const remoteSettings = snapshot.data() as WebsiteSettings;
      const mergedSettings = {
  ...defaultWebsiteSettings,
  ...remoteSettings,
  mobile: { ...defaultWebsiteSettings.mobile, ...(remoteSettings.mobile || {}) },
  content: {
    ...defaultWebsiteSettings.content,
    ...(remoteSettings.content || {}),
    dockStyle: {
      ...defaultWebsiteSettings.content.dockStyle,
      ...((remoteSettings.content as any)?.dockStyle || {}),
    },
    communityStyle: {
      ...defaultWebsiteSettings.content.communityStyle,
      ...((remoteSettings.content as any)?.communityStyle || {}),
    },
  },
};
      setWebsiteSettings(mergedSettings);
      safeSetItem('websiteSettings', mergedSettings);
    }, error => logGlobalSyncWarning('Website settings', error));

    return () => {
      unsubscribeProducts();
      unsubscribeCoupons();
      unsubscribeTickets();
      unsubscribeOrders();
      unsubscribeReviews();
      unsubscribeWebsiteSettings();
    };
  }, []);

  // Use safeSetItem everywhere instead of direct localStorage.setItem
  useEffect(() => {
    safeSetItem('shoppingCart', cart);
  }, [cart]);
  
  useEffect(() => {
    safeSetItem('siteCoupons', coupons);
  }, [coupons]);

  useEffect(() => {
    safeSetItem('siteOrders', orders);
  }, [orders]);
  
  useEffect(() => {
    safeSetItem('siteSupportTickets', tickets);
  }, [tickets]);
  useEffect(() => {
    const syncTicketsFromStorage = () => {
      const storedTickets = localStorage.getItem('siteSupportTickets');
      if (!storedTickets) return;
      try {
        setTickets(JSON.parse(storedTickets));
      } catch (error) {
        console.error('Error syncing support tickets:', error);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'siteSupportTickets') syncTicketsFromStorage();
    };

    window.addEventListener('siteSupportTicketsUpdated', syncTicketsFromStorage);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('siteSupportTicketsUpdated', syncTicketsFromStorage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);


  useEffect(() => {
    safeSetItem('activeTheme', activeTheme);
  }, [activeTheme]);
  
  // --- Dynamic Theming ---
  useEffect(() => {
    const root = document.documentElement;
    
    // User-selectable color palette
    const activePalette = themes[activeTheme]?.palette || themes.default.palette;
    
    // Admin-controlled theme settings (structure, fonts, etc.)
    const adminTheme = websiteSettings.theme;
    
    // Apply colors from user's choice
    root.style.setProperty('--color-primary', activePalette.primaryColor);
    root.style.setProperty('--color-accent', activePalette.accentColor);
    root.style.setProperty('--color-background', activePalette.backgroundColor);
    root.style.setProperty('--color-text', activePalette.textColor);
    root.style.setProperty('--color-text-muted', activePalette.textMutedColor);

    // Apply structural styles from admin settings
    const fonts = {
        'inter-lato': { sans: 'Inter, sans-serif', serif: 'Lato, serif' },
        'roboto-merriweather': { sans: 'Roboto, sans-serif', serif: 'Merriweather, serif' },
        'montserrat-oswald': { sans: 'Montserrat, sans-serif', serif: 'Oswald, sans-serif' },
    };
    root.style.setProperty('--font-sans', fonts[adminTheme.fontPairing].sans);
    root.style.setProperty('--font-serif', fonts[adminTheme.fontPairing].serif);

    root.style.setProperty('--style-corner-radius', adminTheme.cornerRadius);
    const shadows = {
        'light': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'medium': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'heavy': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    };
    root.style.setProperty('--style-shadow-base', shadows[adminTheme.shadowIntensity] || shadows.medium);
    root.style.setProperty('--style-shadow-[0_8px_30px_rgb(0,0,0,0.04)]', shadows[adminTheme.shadowIntensity === 'light' ? 'medium' : 'heavy']);
    root.style.setProperty('--style-shadow-[0_8px_30px_rgb(0,0,0,0.04)]', shadows[adminTheme.shadowIntensity === 'heavy' ? 'heavy' : 'heavy']);

  }, [websiteSettings.theme, activeTheme]);

  const handleWebsiteSettingsUpdate = async (newSettings: WebsiteSettings): Promise<boolean> => {
    // When admin saves, we don't want to override user's theme choice,
    // so we merge admin settings with the default theme palette.
    const mergedSettings = {
        ...newSettings,
        theme: {
            ...newSettings.theme,
            ...themes.default.palette,
        },
        mobile: {
            ...defaultWebsiteSettings.mobile,
            ...(newSettings.mobile || {}),
        },
        content: {
            ...defaultWebsiteSettings.content,
            ...newSettings.content,
        },
    };
    setWebsiteSettings(mergedSettings);
    safeSetItem('websiteSettings', mergedSettings);
    return setDoc(doc(db, ...GLOBAL_WEBSITE_SETTINGS_DOC), stripUndefinedDeep(mergedSettings), { merge: true })
      .then(() => true)
      .catch(error => { logGlobalSyncWarning('Website settings', error); return false; });
  };
  
  useEffect(() => {
    if (currentView === 'home' && scrollToSection) {
        const timer = setTimeout(() => {
            const element = document.getElementById(scrollToSection);
            if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setScrollToSection(null);
        }, 100);
        return () => clearTimeout(timer);
    }
  }, [currentView, scrollToSection]);
  
  // --- Derived Data ---
  const calculateAverageRating = (productId: number): { rating: number, reviewCount: number } => {
    const pReviews = reviews[productId];
    if (!pReviews || pReviews.length === 0) return { rating: 0, reviewCount: 0 };
    const total = pReviews.reduce((acc, r) => acc + r.rating, 0);
    return { rating: total / pReviews.length, reviewCount: pReviews.length };
  };

  const productsWithRatings: ProductWithRating[] = (products || []).map(product => {
    const p = normalizeProductArrays(product);
    const { rating: calculatedRating, reviewCount } = calculateAverageRating(p.id);
    const displayRating = (p.manualRating !== null && p.manualRating !== undefined) ? p.manualRating : calculatedRating;
    return { ...p, rating: displayRating, reviewCount, calculatedRating };
  });

  const visibleProducts = productsWithRatings.filter(isProductSearchVisible);
  const topRatedProducts = [...visibleProducts].sort((a, b) => b.rating - a.rating).slice(0, 3);
  const purchasedProducts = productsWithRatings.filter(p => purchasedProductIds.includes(p.id));
  const wishlistProducts = visibleProducts.filter(p => wishlist.includes(p.id));
  const freeProducts = visibleProducts.filter(p => p.isFree);

  const collectPaidUpdateIdsFromModules = (productId: number, modules: CourseModule[] = []): string[] => {
    const updateIds: string[] = [];

    modules.forEach(module => {
      if (getCourseAccessLevel(module) === 'paidUpdate') {
        updateIds.push(getCourseItemUpdateId(productId, module));
      }

      (module.files || []).forEach(file => {
        if (getCourseAccessLevel(file) === 'paidUpdate') {
          updateIds.push(getCourseItemUpdateId(productId, file));
        }
      });

      updateIds.push(...collectPaidUpdateIdsFromModules(productId, module.modules || []));
    });

    return [...new Set(updateIds.filter(Boolean))];
  };

  const findLockedPaidUpdateMeta = (product: ProductWithRating, targetUpdateId?: string): CourseAccessMeta | null => {
    const ownedUpdateIds = purchasedProductUpdateIds[String(product.id)] || [];

    const scanModules = (modules: CourseModule[] = []): CourseAccessMeta | null => {
      for (const module of modules) {
        if (getCourseAccessLevel(module) === 'paidUpdate') {
          const updateId = getCourseItemUpdateId(product.id, module);
          if (!ownedUpdateIds.includes(updateId) && (!targetUpdateId || targetUpdateId === updateId)) return module;
        }

        for (const file of module.files || []) {
          if (getCourseAccessLevel(file) === 'paidUpdate') {
            const updateId = getCourseItemUpdateId(product.id, file);
            if (!ownedUpdateIds.includes(updateId) && (!targetUpdateId || targetUpdateId === updateId)) return file;
          }
        }

        const childMatch = scanModules(module.modules || []);
        if (childMatch) return childMatch;
      }

      return null;
    };

    return scanModules(product.courseContent || []);
  };

  const getProductAccessState = (product: ProductWithRating): ProductAccessState => {
    const ownedUpdateIds = purchasedProductUpdateIds[String(product.id)] || [];
    const paidUpdateIds = collectPaidUpdateIdsFromModules(product.id, product.courseContent || []);
    const lockedPaidUpdateIds = paidUpdateIds.filter(updateId => !ownedUpdateIds.includes(updateId));

    return {
      productId: product.id,
      hasBaseAccess: purchasedProductIds.includes(product.id),
      ownedUpdateIds,
      lockedPaidUpdateIds,
      hasPaidLockedUpdates: lockedPaidUpdateIds.length > 0,
      lockedPaidUpdateCount: lockedPaidUpdateIds.length,
    };
  };

  const productAccessById = productsWithRatings.reduce<Record<number, ProductAccessState>>((acc, product) => {
    acc[product.id] = getProductAccessState(product);
    return acc;
  }, {});

  // --- Real-time Metrics for Hero ---
  // Calculate total revenue from orders that are not cancelled
  const totalRevenueValue = orders
    .filter(o => o.status !== 'Cancelled')
    .reduce((acc, order) => {
        // Extract numeric value from string like "₹1,999"
        const numericValue = parseFloat(order.total.replace(/[^\d.]/g, '')) || 0;
        return acc + numericValue;
    }, 0);
  
  const realMetrics = {
      revenue: totalRevenueValue,
      users: users.length
  };

  const addGlobalOrder = (order: Order) => {
    setOrders(prevOrders => [order, ...prevOrders.filter(existingOrder => existingOrder.id !== order.id)]);
    void setDoc(doc(db, GLOBAL_ORDERS_COLLECTION, String(order.id)), stripUndefinedDeep({ ...order, customerUid: auth.currentUser?.uid || currentUser?.id || null }), { merge: false })
      .catch(error => logGlobalSyncWarning('Order create', error));
  };

  const updateCouponUsage = (couponCode: string) => {
    const normalizedCouponCode = couponCode.trim().toUpperCase();
    const updatedCoupons = coupons.map(c => c.code.trim().toUpperCase() === normalizedCouponCode ? { ...c, timesUsed: Number(c.timesUsed || 0) + 1 } : c);
    setCoupons(updatedCoupons);
    safeSetItem('siteCoupons', updatedCoupons);
    const changedCoupon = updatedCoupons.find(c => c.code.trim().toUpperCase() === normalizedCouponCode);
    if (changedCoupon) {
      void setDoc(doc(db, GLOBAL_COUPONS_COLLECTION, String(changedCoupon.id)), stripUndefinedDeep(changedCoupon), { merge: false })
        .catch(error => logGlobalSyncWarning('Coupon usage', error));
    }
  };

  // --- Cart Handlers ---
  const openCartSidebar = () => {
      if (typeof window !== 'undefined' && !isCartOpenRef.current) {
          window.history.pushState({ ...(window.history.state || {}), dcView: currentViewRef.current, dcOverlay: 'cart' }, '', window.location.href);
      }
      setIsCartOpen(true);
  };

  const handleAddToCart = (productId: number, quantity: number = 1) => {
      const product = productsWithRatings.find(p => p.id === productId);
      const access = product ? getProductAccessState(product) : null;

      if (access?.hasBaseAccess) {
          setInfoModal({
              title: 'Already purchased',
              message: access.hasPaidLockedUpdates
                  ? 'You already own the base course. Open the course player and use Purchase the latest update to unlock newly added paid content.'
                  : 'This product is already available in My Purchases.',
              icon: '✅',
          });
          return;
      }

      setCart(prevCart => {
          const existingItem = prevCart.find(item => item.productId === productId);
          if (existingItem) {
              return prevCart.map(item =>
                  item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item
              );
          } else {
              return [...prevCart, { productId, quantity }];
          }
      });

      if (product) {
          setCartToastMessage(`'${product.title}' added to cart!`);
          setTimeout(() => setCartToastMessage(''), 3000);
      }

      openCartSidebar();
  };
  
  const handleUpdateCartQuantity = (productId: number, newQuantity: number) => {
      setCart(prevCart => {
          if (newQuantity <= 0) {
              return prevCart.filter(item => item.productId !== productId);
          }
          return prevCart.map(item =>
              item.productId === productId ? { ...item, quantity: newQuantity } : item
          );
      });
  };

  const handleRemoveFromCart = (productId: number) => {
      setCart(prevCart => prevCart.filter(item => item.productId !== productId));
  };

  const getNormalizedMobile = (mobile?: string | null) => String(mobile || '').replace(/\D/g, '').slice(-10);

  const hasCompletedMobile = (user?: Pick<User, 'mobile'> | null) => getNormalizedMobile(user?.mobile).length === 10;

  const getResolvedSavedMobile = (user?: Pick<User, 'mobile'> | null, firebaseUser?: FirebaseUser | null) =>
    getNormalizedMobile(user?.mobile) || getNormalizedMobile(firebaseUser?.phoneNumber);

  const shouldAskForMobileCompletion = () => {
    if (!isLoggedIn || !effectiveAppUser) return false;
    if (profileStatus === 'loading' || profileStatus === 'idle') return false;
    return getResolvedSavedMobile(effectiveAppUser, effectiveFirebaseUser).length !== 10;
  };

  const mergeCompletedMobileIntoCurrentUser = (mobile: string) => {
    const normalizedMobile = getNormalizedMobile(mobile);
    if (!effectiveAppUser || normalizedMobile.length !== 10) return;

    const updatedUser = { ...effectiveAppUser, mobile: normalizedMobile } as User;

    setCurrentUser(updatedUser);
    setUsers(current => {
      const nextUsers = current.some(user => user.id === updatedUser.id)
        ? current.map(user => user.id === updatedUser.id ? { ...user, mobile: normalizedMobile } : user)
        : [...current, updatedUser];

      safeSetItem('siteUsers', nextUsers);
      return nextUsers;
    });

    safeSetItem('currentUser', updatedUser);
  };

  const promptForMobileCompletion = () => {
    setIsMobileCompletionModalOpen(true);
    setMobileCompletionError('Please add your 10 digit mobile number before purchases or profile-sensitive actions.');
  };

  const requiresMobileCompletion = () => shouldAskForMobileCompletion();

  useEffect(() => {
    if (!isLoggedIn) {
      setIsMobileCompletionModalOpen(false);
      setMobileCompletionError('');
      setMobileCompletionInput('');
      return;
    }

    if (!effectiveAppUser) return;

    const savedMobile = getResolvedSavedMobile(effectiveAppUser, effectiveFirebaseUser);

    if (savedMobile.length === 10) {
      mergeCompletedMobileIntoCurrentUser(savedMobile);
      setIsMobileCompletionModalOpen(false);
      setMobileCompletionError('');
      setMobileCompletionInput('');
      return;
    }

    if (profileStatus === 'loading' || profileStatus === 'idle') {
      return;
    }

    setMobileCompletionInput(current => getNormalizedMobile(current));
    setIsMobileCompletionModalOpen(true);
  }, [
    isLoggedIn,
    effectiveAppUser?.id,
    effectiveAppUser?.mobile,
    effectiveFirebaseUser?.phoneNumber,
    profileStatus,
  ]);

  const handleInitiateCheckout = () => {
    if (cart.length === 0) return;
    if (!hasFirebaseUser) {
      setResumeCartCheckoutAfterLogin(true);
      setIsCartOpen(false);
      setIsCartPaymentModalOpen(false);
      openAuthPage('login');
      window.scrollTo(0, 0);
      return;
    }
    if (requiresMobileCompletion()) { promptForMobileCompletion(); return; }
    setIsCartOpen(false);
    setIsCartPaymentModalOpen(true);
  };

  const handleConfirmCartPurchase = async (appliedCouponCode: string | null, appliedCoins = 0) => {
      if (cart.length === 0) return;

      // --- Recalculate price at the moment of confirmation for robustness ---
      const currentCartSubtotal = cartDetails.reduce((acc, item) => {
          const priceStr = item.product.salePrice || item.product.price;
          const price = parseFloat(priceStr.replace('₹', ''));
          return acc + (price * item.quantity);
      }, 0);

      const couponToApply = appliedCouponCode ? coupons.find(c => c.code === appliedCouponCode) : null;
      let finalDiscount = 0;
      if (couponToApply) {
          finalDiscount = calculateDiscount(couponToApply, currentCartSubtotal);
      }
      const afterCoupon = Math.max(0, currentCartSubtotal - finalDiscount);
      const liveCartCoinBalance = liveWalletBalance;
      const safeAppliedCoins = Math.min(liveCartCoinBalance, Math.max(0, appliedCoins), Math.floor(afterCoupon * eduCoinRedeemRate));
      const coinDiscount = Math.min(afterCoupon, safeAppliedCoins / eduCoinRedeemRate);
      const finalPrice = Math.max(0, afterCoupon - coinDiscount);
      if (safeAppliedCoins > 0) {
        const coinsDebited = await deductEduCoinsAtomically(safeAppliedCoins, {
          source: 'Checkout discount',
          description: `Applied ${safeAppliedCoins} EduCoins for ₹${coinDiscount.toFixed(2)} cart discount`,
        });

        if (!coinsDebited) return;
      }
      // --- End of recalculation ---

      if (!hasFirebaseUser || !auth.currentUser) { openAuthPage('login'); return; }
      const orderId = `DC-${Date.now()}`;
      try {
        await Promise.all(cartDetails.map(item => persistPurchaseEntitlement(auth.currentUser!.uid, item.product, { quantity: item.quantity, total: `₹${finalPrice.toFixed(2)}`, source: 'razorpay', orderId })));
      } catch (error) {
        setInfoModal({ title: 'Purchase sync failed', message: 'Payment was confirmed, but cart access could not be saved. Please retry sync before opening products.', icon: '⚠️' });
        console.warn('Cart entitlement write failed.', error);
        return;
      }
      const newPurchasedIds = mergePurchasedProductIds(purchasedProductIds, cart.map(item => item.productId));
      setPurchasedProductIds(newPurchasedIds);
      persistUserPurchasedProducts(newPurchasedIds);

      if (appliedCouponCode) {
        updateCouponUsage(appliedCouponCode);
      }
      
      const newOrderItems: OrderItem[] = cartDetails.map(item => ({
        id: item.product.id,
        name: item.product.title,
        quantity: item.quantity,
        price: item.product.salePrice || item.product.price
      }));

      const newOrder: Order = {
        id: `DC-${Date.now()}`,
        customerName: effectiveAppUser?.name || effectiveAppUser?.email.split('@')[0] || 'Valued Customer',
        customerEmail: effectiveAppUser?.email || 'customer@example.com',
        date: new Date().toISOString().split('T')[0],
        total: `₹${finalPrice.toFixed(2)}${safeAppliedCoins > 0 ? ` (🪙 ${safeAppliedCoins} applied)` : ''}`,
        status: 'Completed',
        items: newOrderItems,
        shippingAddress: 'N/A (Digital Product)',
        billingAddress: '123 E-commerce St, Web City, WC 54321',
        paymentBreakdown: {
          purchaseKind: 'cart',
          baseTotal: currentCartSubtotal,
          finalPrice,
          couponCode: couponToApply?.code || null,
          couponDiscount: finalDiscount,
          couponType: couponToApply?.type,
          couponValue: couponToApply?.value,
          eduCoinsUsed: safeAppliedCoins,
          eduCoinDiscount: coinDiscount,
          coinOnlyPurchase: false,
          paymentLabel: 'Cart checkout',
        }
      };
      addGlobalOrder(newOrder);

      const firstCartItemProduct = productsWithRatings.find(p => p.id === cart[0].productId);
      setSelectedProduct(firstCartItemProduct || null);

      setCart([]);
      setAppliedCartCoupon(null);
      setCartCouponError(null);
      setApplyCartEduCoins(false);
      setCurrentView('congratulations');
      window.scrollTo(0, 0);
  };

  const cartDetails = cart.map(item => {
    const product = productsWithRatings.find(p => p.id === item.productId);
    return product ? { ...item, product } : null;
  }).filter((i): i is { product: ProductWithRating } & CartItem => i !== null);

  const parseCurrency = (value: string | number | undefined | null) => parseFloat(String(value || '0').replace('₹', '').replace('🪙', '').replace(/,/g, '')) || 0;

  const cartUserCoinBalance = liveWalletBalance;

  const cartSubtotal = cartDetails.reduce((acc, item) => {
    const priceStr = item.product.salePrice || item.product.price;
    const price = parseCurrency(priceStr);
    return acc + (price * item.quantity);
  }, 0);

  const calculateDiscount = (coupon: Coupon, price: number): number => {
    if (coupon.type === 'fixed') return Math.min(coupon.value, price);
    if (coupon.type === 'percentage') return Math.min(price, (price * coupon.value) / 100);
    return 0;
  };
  
  const cartCouponDiscount = appliedCartCoupon ? calculateDiscount(appliedCartCoupon, cartSubtotal) : 0;
  const cartAfterCoupon = Math.max(0, cartSubtotal - cartCouponDiscount);
  const eduCoinRedeemRate = Math.max(1, Number(economySettings.coinToFiatRatio));
  const cartAppliedEduCoins = applyCartEduCoins ? Math.min(cartUserCoinBalance, Math.floor(cartAfterCoupon * eduCoinRedeemRate)) : 0;
  const cartEduCoinDiscount = Math.min(cartAfterCoupon, cartAppliedEduCoins / eduCoinRedeemRate);
  const cartFinalPrice = Math.max(0, cartAfterCoupon - cartEduCoinDiscount);

  const handleApplyCartCoupon = (code: string) => {
    setCartCouponError(null);
    const couponToApply = coupons.find(c => c.code.toUpperCase() === code.toUpperCase() && c.isActive);
    if (!couponToApply) { setCartCouponError("Invalid or inactive coupon."); setAppliedCartCoupon(null); return; }
    
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);

    try {
        const [year, month, day] = couponToApply.expiryDate.split('-').map(Number);
        const expiry = new Date(year, month - 1, day);
        expiry.setHours(23, 59, 59, 999); // Coupon is valid for the entire expiry day

        if (expiry < today) {
            setCartCouponError("This coupon has expired.");
            setAppliedCartCoupon(null);
            return;
        }
    } catch (e) {
        setCartCouponError("Invalid coupon date format.");
        setAppliedCartCoupon(null);
        return;
    }

    if (couponToApply.timesUsed >= couponToApply.usageLimit) { setCartCouponError("Coupon usage limit reached."); setAppliedCartCoupon(null); return; }
    setAppliedCartCoupon(couponToApply);
  };

  const cartItemCount = cart.reduce((total, item) => total + item.quantity, 0);
  const authButtonLabel = isLoggedIn ? 'Profile' : rememberedAuthAccount ? `Continue as ${rememberedAuthAccount.name || rememberedAuthAccount.email.split('@')[0]}` : 'Login';

  // --- Auth Handlers ---
  const normalizePurchaseIds = (ids: unknown): number[] => normalizeSharedPurchaseIds(ids);

  const getFirebaseAuthProvider = (firebaseUser: FirebaseUser): 'google' | 'password' =>
      firebaseUser.providerData.some(provider => provider.providerId === GoogleAuthProvider.PROVIDER_ID) ? 'google' : 'password';

  const getProviderIds = (firebaseUser: FirebaseUser): string[] =>
      [...new Set(firebaseUser.providerData.map(provider => provider.providerId).filter(Boolean))];

  const getFirebaseUserPhotoURL = (firebaseUser: FirebaseUser): string =>
      firebaseUser.photoURL || firebaseUser.providerData.find(provider => Boolean(provider.photoURL))?.photoURL || '';

  const shouldReplaceProfilePhoto = (existingPhotoURL: unknown, nextPhotoURL: string) => {
      if (!nextPhotoURL) return false;
      const existingPhoto = typeof existingPhotoURL === 'string' ? existingPhotoURL : '';
      if (!existingPhoto) return true;
      return existingPhoto.includes('googleusercontent.com') || existingPhoto === nextPhotoURL;
  };

  const toUserProfile = (firebaseUser: FirebaseUser, data: any = {}): User => {
      const existingBalance = data.coinBalance ?? data.eduCoins ?? 0;
      const totalCoinsEarned = data.totalCoinsEarned ?? data.totalLifetimeCoins ?? existingBalance;

      return {
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          name: data.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Learner',
          email: data.email || firebaseUser.email || '',
          mobile: data.mobile || firebaseUser.phoneNumber || '',
          photoURL: data.photoURL || getFirebaseUserPhotoURL(firebaseUser),
          authProvider: data.authProvider || getFirebaseAuthProvider(firebaseUser),
          providerIds: data.providerIds || getProviderIds(firebaseUser),
          emailVerified: data.emailVerified ?? firebaseUser.emailVerified,
          role: data.role === 'admin' ? 'admin' : 'user',
          status: data.status === 'blocked' ? 'blocked' : 'active',
          blocked: data.blocked === true,
          suspended: data.suspended === true,
          createdAt: data.createdAt || new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          coinBalance: existingBalance,
          totalCoinsEarned,
          totalCoinsSpent: data.totalCoinsSpent ?? 0,
          eduCoins: existingBalance,
          studyMinutes: data.studyMinutes ?? 0,
          totalWatchTimeMinutes: data.totalWatchTimeMinutes ?? data.studyMinutes ?? 0,
          totalLifetimeCoins: totalCoinsEarned,
          rewardedArticleIds: data.rewardedArticleIds || [],
          readArticles: data.readArticles || data.rewardedArticleIds || [],
          rewardedQuizIds: data.rewardedQuizIds || [],
          claimedRewardIds: data.claimedRewardIds || [],
          profileStreakClaims: data.profileStreakClaims || {},
          coinTransactions: data.coinTransactions || [],
      };
  };

  function createFallbackUserFromFirebase(firebaseUser: FirebaseUser): User {
      const fallbackDisplayName = firebaseUser.displayName || firebaseUser.email || 'Student';
      const fallbackPhotoURL = getFirebaseUserPhotoURL(firebaseUser);
      return {
          uid: firebaseUser.uid,
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: fallbackDisplayName,
          name: fallbackDisplayName,
          photoURL: fallbackPhotoURL,
          avatarUrl: fallbackPhotoURL,
          role: 'student',
          isFallbackProfile: true,
      } as unknown as User;
  }


  const rememberAndStoreUser = (user: User, firebaseUser: FirebaseUser) => {
      saveRememberedAuthAccount({ uid: user.id, email: user.email, name: user.name, photoURL: user.photoURL || getFirebaseUserPhotoURL(firebaseUser), providerIds: user.providerIds, authProvider: user.authProvider });
      setRememberedAuthAccount(getRememberedAuthAccount());
      setCurrentUser(user);
      setUsers(current => current.some(existingUser => existingUser.id === user.id) ? current.map(existingUser => existingUser.id === user.id ? user : existingUser) : [...current, user]);
  };

  const unlockMobileAuthWithUser = (firebaseUser: FirebaseUser, user: User) => {
      if (!getIsMobileViewport()) return;
      setFirebaseAuthUser(firebaseUser);
      rememberAndStoreUser(user, firebaseUser);
      finishMobileAuthSuccess(user);
  };

  const ensureUserProfile = async (firebaseUser: FirebaseUser, profile?: { name?: string; mobile?: string }): Promise<User> => {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);
      const existing = userSnap.exists() ? userSnap.data() : {};
      const providerIds = getProviderIds(firebaseUser);
      const authProvider = providerIds.includes(GoogleAuthProvider.PROVIDER_ID) ? 'google' : 'password';
      const existingName = String(existing.name || '').trim();
      const providerName = String(firebaseUser.displayName || '').trim();
      const fallbackName = firebaseUser.email?.split('@')[0] || 'Learner';
      const nextName = profile?.name || existingName || providerName || fallbackName;
      const nextMobile = profile?.mobile || existing.mobile || firebaseUser.phoneNumber || '';
      const firebasePhotoURL = getFirebaseUserPhotoURL(firebaseUser);
      const nextPhotoURL = shouldReplaceProfilePhoto(existing.photoURL, firebasePhotoURL) ? firebasePhotoURL : existing.photoURL || '';
      const existingBalance = existing.coinBalance ?? existing.eduCoins ?? 0;
      const totalCoinsEarned = existing.totalCoinsEarned ?? existing.totalLifetimeCoins ?? existingBalance;
      const safeProfileFields = {
          uid: firebaseUser.uid,
          name: nextName,
          email: firebaseUser.email || existing.email || '',
          mobile: nextMobile,
          photoURL: nextPhotoURL,
          role: existing.role === 'admin' ? 'admin' : 'user',
          status: existing.status === 'blocked' ? 'blocked' : 'active',
          blocked: existing.blocked === true,
          suspended: existing.suspended === true,
          authProvider,
          providerIds,
          emailVerified: firebaseUser.emailVerified,
          purchasedProductIds: normalizePurchaseIds(existing.purchasedProductIds),
          coinBalance: existingBalance,
          eduCoins: existingBalance,
          totalCoinsEarned,
          totalCoinsSpent: existing.totalCoinsSpent ?? 0,
          studyMinutes: existing.studyMinutes ?? 0,
          totalWatchTimeMinutes: existing.totalWatchTimeMinutes ?? existing.studyMinutes ?? 0,
          totalLifetimeCoins: totalCoinsEarned,
          rewardedArticleIds: existing.rewardedArticleIds || [],
          readArticles: existing.readArticles || existing.rewardedArticleIds || [],
          rewardedQuizIds: existing.rewardedQuizIds || [],
          claimedRewardIds: existing.claimedRewardIds || [],
          profileStreakClaims: existing.profileStreakClaims || {},
          coinTransactions: existing.coinTransactions || [],
          createdAt: existing.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
      };
      await setDoc(userRef, safeProfileFields, { merge: true });
      console.info('PROFILE_LOADED_OR_CREATED', { uid: firebaseUser.uid });
      const savedSnap = await getDoc(userRef);
      return toUserProfile(firebaseUser, savedSnap.exists() ? savedSnap.data() : safeProfileFields);
  };

  const restoreUserEntitlements = async (uid: string): Promise<number[]> => {
      const userDoc = await getDoc(doc(db, 'users', uid));
      const idsFromUserDoc = normalizePurchaseIds(userDoc.exists() ? userDoc.data()?.purchasedProductIds : []);
      const purchasesSnapshot = await getDocs(collection(db, 'users', uid, 'purchases'));
      const idsFromPurchaseDocs = normalizePurchaseIds(purchasesSnapshot.docs
        .filter(item => shouldRestoreEntitlementStatus(item.data()?.status))
        .map(item => item.data()?.productId ?? item.id));
      return mergePurchasedProductIds(idsFromUserDoc, idsFromPurchaseDocs);
  };

  // Frontend session locking is disabled. Firebase Auth is the source of truth on the client.
  // Any single-device enforcement must happen on a secure backend/Admin SDK, not from Firestore snapshots.
  const stopSessionWatchers = () => {
      sessionUnsubscribeRef.current?.();
      sessionUnsubscribeRef.current = null;
  };

  const getOrCreateDeviceSessionId = () => {
      const storedSessionId = sessionStorage.getItem('firebaseDeviceSessionId');
      if (storedSessionId) return storedSessionId;
      const sessionId = crypto.randomUUID();
      sessionStorage.setItem('firebaseDeviceSessionId', sessionId);
      return sessionId;
  };

  const writeCurrentSession = async (_uid: string, _sessionId: string) => {
      // Frontend session locking is disabled; never mutate users/{uid}/session/current from the client.
      return;
  };

  const clearCurrentSessionDocument = async () => {
      // Frontend session locking is disabled; never mutate users/{uid}/session/current from the client.
      return;
  };

  const subscribeToCurrentSession = (uid: string, sessionId: string) => {
      stopSessionWatchers();
      const sessionRef = doc(db, 'users', uid, 'session', 'current');
      sessionUnsubscribeRef.current = onSnapshot(sessionRef, snapshot => {
          const remoteSessionId = snapshot.data()?.sessionId;
          if (remoteSessionId && remoteSessionId !== sessionId) {
              console.warn('IGNORED_STALE_SESSION_MISMATCH', {
                  uid,
                  localSessionId: sessionId,
                  remoteSessionId,
              });
              return;
          }
      }, error => console.warn('Session listener failed; keeping Firebase Auth session active.', error));
  };



  const finishMobileAuthSuccess = (user: User | Pick<User, 'name' | 'email'>) => {
      if (!getIsMobileViewport()) return;
      console.info('[mobile-auth]', {
          step: 'finish-mobile-success',
          userId: 'id' in user ? user.id : user.email,
      });
      setIsAuthRestoring(false);
      setAuthRestoreError(null);
      setMobileAuthFlowState('authenticated');
      currentViewRef.current = 'home';
      setCurrentView('home');
      window.scrollTo(0, 0);
  };

  const redirectAfterSuccessfulAuth = (options: { source?: string; user?: User | Pick<User, 'name' | 'email'> | null; preserveCheckoutIntent?: boolean; force?: boolean } = {}) => {
      const { source, user, preserveCheckoutIntent = true, force = false } = options;
      const uid = ('id' in (user || {}) ? (user as User).id : '') || auth.currentUser?.uid || currentUser?.id || '';
      const lastRedirect = authRedirectHandledRef.current;
      const hasExplicitUser = Boolean(user);
      const isClosingAuthView = currentViewRef.current === 'auth';
      if (!force && !isClosingAuthView && !hasExplicitUser && uid && lastRedirect?.uid === uid && Date.now() - lastRedirect.at < 1200) return;
      if (uid) authRedirectHandledRef.current = { uid, source, at: Date.now() };
      setIsAuthRestoring(false);
      setAuthRestoreError(null);
      setAuthError(null);
      console.info('[mobile-auth] session completed', { uid, source, currentView: currentViewRef.current, isMobileViewport });

      const welcomeUser = user || currentUser || (auth.currentUser ? { name: auth.currentUser.displayName || '', email: auth.currentUser.email || '' } : null);

      if (preserveCheckoutIntent && productToBuyAfterLogin) {
          console.info('AUTH_REDIRECT_AFTER_COMMIT', { uid, target: 'product' });
          currentViewRef.current = 'product';
          setSelectedProduct(productToBuyAfterLogin);
          setCurrentView('product');
          setAutoOpenPaymentModalFor(productToBuyAfterLogin.id);
          setProductToBuyAfterLogin(null);
          window.scrollTo(0, 0);
          return;
      }

      if (preserveCheckoutIntent && resumeCartCheckoutAfterLogin && cart.length > 0) {
          console.info('AUTH_REDIRECT_AFTER_COMMIT', { uid, target: 'cart-checkout' });
          currentViewRef.current = 'home';
          setCurrentView('home');
          setIsCartOpen(false);
          setIsCartPaymentModalOpen(true);
          setResumeCartCheckoutAfterLogin(false);
          window.scrollTo(0, 0);
          return;
      }

      setProductToBuyAfterLogin(null);
      setResumeCartCheckoutAfterLogin(false);
      if (isMobileViewport && welcomeUser) {
          console.info('AUTH_REDIRECT_AFTER_COMMIT', { uid, target: 'home' });
          currentViewRef.current = 'home';
          finishMobileAuthSuccess(welcomeUser);
          console.info('[mobile-auth]', { step: 'mobile-redirect-home', source });
          return;
      }
      console.info('AUTH_REDIRECT_AFTER_COMMIT', { uid, target: 'home' });
      currentViewRef.current = 'home';
      setCurrentView('home');
      window.scrollTo(0, 0);
  };

  const isBlockedUserProfile = (user: User): boolean =>
      user.blocked === true || user.status === 'blocked' || user.suspended === true;

  const hydrateFirebaseUserSession = async (firebaseUser: FirebaseUser, fallbackUser: User, profile?: { name?: string; mobile?: string }) => {
      console.info('AUTH_HYDRATION_START', { uid: firebaseUser.uid });
      setAuthStatus('hydrating');
      let nextUser = fallbackUser;
      try {
          setProfileStatus('loading');
          const ensuredUser = await ensureUserProfile(firebaseUser, profile);
          if (logoutInProgressRef.current || auth.currentUser?.uid !== firebaseUser.uid) {
              console.info('AUTH_HYDRATION_CANCELLED_AFTER_LOGOUT', { uid: firebaseUser.uid });
              return null;
          }
          if (isBlockedUserProfile(ensuredUser)) {
              console.warn('AUTO_SIGNOUT_BLOCKED_REASON', { uid: firebaseUser.uid, status: ensuredUser.status });
              await signOut(auth);
              handleLogout(false);
              setInfoModal({ title: 'Account blocked', message: 'Your account is blocked. Please contact support.', icon: '🔒' });
              return null;
          }
          nextUser = { ...(fallbackUser as any), ...(ensuredUser as any), isFallbackProfile: false } as User;
          rememberAndStoreUser(nextUser, firebaseUser);
          setProfileStatus('ready');
          console.info('AUTH_PROFILE_READY', { uid: firebaseUser.uid, status: 'ready' });
      } catch (error) {
          console.warn('User profile hydration failed; keeping Firebase Auth fallback profile.', error);
          setProfileStatus('fallback');
          setAuthRestoreError('Login restored. Profile sync will retry when the database is reachable.');
          console.info('AUTH_PROFILE_READY', { uid: firebaseUser.uid, status: 'fallback' });
      }

      if (logoutInProgressRef.current || auth.currentUser?.uid !== firebaseUser.uid) {
          console.info('AUTH_HYDRATION_CANCELLED_AFTER_LOGOUT', { uid: firebaseUser.uid });
          return null;
      }

      try {
          console.info('PURCHASE_RESTORE_START', { uid: firebaseUser.uid });
          setPurchaseStatus('loading');
          const profilePurchasedIds = normalizePurchaseIds((nextUser as any).purchasedProductIds);
          const storedPurchasedUpdates = normalizePurchasedProductUpdateIds((nextUser as any).purchasedProductUpdateIds || safeGetItem(`purchasedProductUpdates:${firebaseUser.uid}`, {}));
          const restoredPurchasedIds = await restoreUserEntitlements(firebaseUser.uid);
          const initialPurchasedIds = mergePurchasedProductIds(profilePurchasedIds, restoredPurchasedIds);
          nextUser = { ...(nextUser as any), purchasedProductIds: initialPurchasedIds, purchasedProductUpdateIds: storedPurchasedUpdates } as User;
          setPurchasedProductIds(initialPurchasedIds);
          setPurchasedProductUpdateIds(storedPurchasedUpdates);
          safeSetItem(`purchasedProducts:${firebaseUser.uid}`, initialPurchasedIds);
          safeSetItem(`purchasedProductUpdates:${firebaseUser.uid}`, storedPurchasedUpdates);
          rememberAndStoreUser(nextUser, firebaseUser);
          setPurchaseStatus('ready');
          console.info('PURCHASE_RESTORE_DONE', { uid: firebaseUser.uid, count: initialPurchasedIds.length });
          console.info('AUTH_PURCHASES_READY', { uid: firebaseUser.uid, status: 'ready' });
      } catch (error) {
          console.warn('PURCHASE_RESTORE_FAILED_NON_BLOCKING', error);
          console.warn('Purchase access restore failed; keeping login active.', error);
          setPurchaseStatus('error');
          setAuthRestoreError('Login restored, but purchases could not be refreshed. Showing saved purchases if available.');
          console.info('AUTH_PURCHASES_READY', { uid: firebaseUser.uid, status: 'error' });
      }
      if (logoutInProgressRef.current || auth.currentUser?.uid !== firebaseUser.uid) {
          console.info('AUTH_HYDRATION_CANCELLED_AFTER_LOGOUT', { uid: firebaseUser.uid });
          return null;
      }
      setAuthStatus('authenticated');
      console.info('AUTH_COMPLETE_DONE', { uid: firebaseUser.uid });
      return nextUser;
  };

  const completeFirebaseUserSession = async (firebaseUser: FirebaseUser, options: { redirect?: boolean; profile?: { name?: string; mobile?: string }; source?: string; explicit?: boolean } = {}): Promise<User | null> => {
      if (!firebaseUser) return null;
      const { redirect = true, profile, source = 'unknown' } = options;
      const uid = firebaseUser.uid;
      if (logoutInProgressRef.current) return null;
      const fallbackUser = createFallbackUserFromFirebase(firebaseUser);

      console.info('AUTH_COMMIT_START', { uid, source });
      logoutInProgressRef.current = false;
      setIsLocalLogoutPending(false);
      committedFirebaseUidRef.current = firebaseUser.uid;
      setFirebaseAuthUser(firebaseUser);
      rememberAndStoreUser(fallbackUser, firebaseUser);
      setIsAuthStateReady(true);
      setIsAuthRestoring(false);
      setAuthRestoreError(null);
      setAuthError(null);
      setAuthStatus('authenticated');
      setProfileStatus('fallback');
      if (purchaseStatus === 'idle') setPurchaseStatus('idle');
      if (getIsMobileViewport()) setMobileAuthFlowState('authenticated');
      console.info('AUTH_FALLBACK_USER_SET', { uid });

      const recentCompletion = lastCompletedSessionRef.current;
      if (recentCompletion?.uid === uid && Date.now() - recentCompletion.at < 2000) {
          if (redirect) redirectAfterSuccessfulAuth({ source, user: fallbackUser });
          console.info('AUTH_COMMIT_DONE', { uid, source, dedupe: 'recent-completion' });
          return fallbackUser;
      }
      if (sessionCompletionRef.current?.uid === uid && sessionCompletionPromiseRef.current) {
          if (redirect) redirectAfterSuccessfulAuth({ source, user: fallbackUser });
          console.info('AUTH_COMMIT_DONE', { uid, source, dedupe: 'in-flight' });
          return fallbackUser;
      }

      sessionCompletionRef.current = { uid, startedAt: Date.now() };
      const hydrationPromise = hydrateFirebaseUserSession(firebaseUser, fallbackUser, profile).catch(error => {
          console.warn('Firebase session background hydration failed; login remains active.', error);
          setAuthStatus('authenticated');
          return fallbackUser;
      }).finally(() => {
          lastCompletedSessionRef.current = { uid, at: Date.now() };
          if (sessionCompletionPromiseRef.current === hydrationPromise) sessionCompletionPromiseRef.current = null;
      });
      sessionCompletionPromiseRef.current = hydrationPromise;
      void hydrationPromise;

      if (redirect) redirectAfterSuccessfulAuth({ source, user: fallbackUser });
      console.info('AUTH_COMMIT_DONE', { uid, source });
      return fallbackUser;
  };

  const ensureAuthPersistence = () => setPersistence(auth, browserLocalPersistence);

  const beginAuthOperation = () => {
      logoutInProgressRef.current = false;
      setIsLocalLogoutPending(false);
      authOperationInProgressRef.current = true;
  };

  const endAuthOperation = () => {
      authOperationInProgressRef.current = false;
  };

  useEffect(() => {
      console.info('APP_START_PUBLIC_HOME');
      const isReturningFromGoogleRedirect = consumeGoogleRedirectAttempt();
      setAuthStatus(isReturningFromGoogleRedirect ? 'checking-session' : 'booting');
      setIsAuthStateReady(false);
      isRedirectResultPendingRef.current = isReturningFromGoogleRedirect;
      setIsRedirectResultPending(isReturningFromGoogleRedirect);

      const redirectTimeout = window.setTimeout(() => {
          if (!isRedirectResultPendingRef.current) return;
          console.info('GOOGLE_REDIRECT_TIMEOUT_PUBLIC_HOME');
          isRedirectResultPendingRef.current = false;
          setIsRedirectResultPending(false);
          setAuthStatus(auth.currentUser ? 'authenticated' : 'unauthenticated');
          setIsAuthStateReady(true);
      }, 6000);

      void ensureAuthPersistence().then(() => getRedirectResult(auth)).then(async result => {
          if (result?.user) {
              console.info('GOOGLE_REDIRECT_RESULT_USER', { uid: result.user.uid });
              setFirebaseAuthUser(result.user);
              await result.user.getIdToken(true);
              console.info('LOGIN_FIREBASE_SUCCESS', { uid: result.user.uid, source: 'google-redirect' });
              const committedUser = await completeFirebaseUserSession(result.user, { redirect: false, source: 'google-redirect', explicit: true });
              if (!committedUser) {
                  setAuthRestoreError('Google login could not be completed. Please try again.');
                  return;
              }
              redirectAfterSuccessfulAuth({ source: 'google-redirect', user: committedUser, force: true });
              return;
          }
          console.info('GOOGLE_REDIRECT_RESULT_NULL_WAIT_FOR_LISTENER');
      }).catch(error => {
          console.warn('Google redirect result handling failed.', error);
          setAuthRestoreError(getFirebaseAuthErrorMessage(error));
          if (auth.currentUser) void completeFirebaseUserSession(auth.currentUser, { redirect: false, source: 'redirect-error-current-user' });
      }).finally(() => {
          window.clearTimeout(redirectTimeout);
          isRedirectResultPendingRef.current = false;
          setIsRedirectResultPending(false);
          setIsAuthStateReady(true);
          if (!auth.currentUser && !committedFirebaseUidRef.current) setAuthStatus('unauthenticated');
      });

      console.info('AUTH_LISTENER_ATTACHED');
      const unsubscribe = onAuthStateChanged(auth, user => {
          setAuthError(null);
          if (user) {
              console.info('AUTH_LISTENER_USER', { uid: user.uid });
              void completeFirebaseUserSession(user, { source: 'auth-listener', explicit: false, redirect: false }).catch(error => {
                  console.warn('Firebase session restore failed.', error);
              });
              return;
          }

          if (isRedirectResultPendingRef.current || authOperationInProgressRef.current || committedFirebaseUidRef.current) {
              console.info('AUTH_NULL_IGNORED_DURING_PENDING_OPERATION');
              return;
          }

          console.info('AUTH_LISTENER_NULL_PUBLIC_HOME');
          logoutInProgressRef.current = false;
          setIsLocalLogoutPending(false);
          setFirebaseAuthUser(null);
          setCurrentUser(null);
          setAuthStatus('unauthenticated');
          setIsAuthStateReady(true);
          setIsAuthRestoring(false);
          setAuthRestoreError(null);
          if (getIsMobileViewport()) setMobileAuthFlowState('logged-out');
          setIsMobileCompletionModalOpen(false);
          setMobileCompletionInput('');
          setMobileCompletionError('');
      });
      return () => {
          window.clearTimeout(redirectTimeout);
          unsubscribe();
          stopSessionWatchers();
      };
  }, []);

  useEffect(() => {
      if (!isMobileViewport) return;
      if (!isAuthStateReady) return;
      if (!isLoggedIn || !effectiveFirebaseUser || !currentUser) return;

      setMobileAuthFlowState('authenticated');

      if (currentView === 'auth') {
          setCurrentView('home');
          window.scrollTo(0, 0);
      }

  }, [isMobileViewport, isAuthStateReady, isLoggedIn, effectiveFirebaseUser?.uid, currentUser?.id, currentView]);


  useEffect(() => {
      const effectiveFirebaseUser = isLocalLogoutPending ? null : (firebaseAuthUser || auth.currentUser);
      if (isLocalLogoutPending || !isAuthStateReady || isRedirectResultPending || !effectiveFirebaseUser || currentView !== 'auth') return;
      const effectiveAppUser = currentUser || createFallbackUserFromFirebase(effectiveFirebaseUser);
      redirectAfterSuccessfulAuth({ source: 'auth-page-existing-user', user: effectiveAppUser, force: true });
  }, [isLocalLogoutPending, isAuthStateReady, isRedirectResultPending, firebaseAuthUser?.uid, auth.currentUser?.uid, currentUser?.id, currentView]);


  const handleRetryAuthRestore = () => {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
          setAuthRestoreError('Please log in again to restore purchases.');
          setCurrentView('auth');
          return;
      }
      void completeFirebaseUserSession(firebaseUser, { redirect: false, source: 'manual-retry' });
  };

  const getFirebaseAuthErrorMessage = (error: any) => getFirebaseAuthErrorMessageFromCode(error);



  const markGoogleRedirectAttempt = () => {
      try {
          sessionStorage.setItem(GOOGLE_REDIRECT_ATTEMPT_KEY, String(Date.now()));
      } catch {
          // Redirect marker is best-effort only.
      }
  };

  const consumeGoogleRedirectAttempt = () => {
      try {
          const value = sessionStorage.getItem(GOOGLE_REDIRECT_ATTEMPT_KEY);
          sessionStorage.removeItem(GOOGLE_REDIRECT_ATTEMPT_KEY);
          return Boolean(value);
      } catch {
          return false;
      }
  };

  const shouldUseGoogleRedirect = () => {
      const userAgent = navigator.userAgent || '';
      const isSmallScreen = window.matchMedia?.('(max-width: 768px)').matches;
      const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone;
      const isWebView = /wv|FBAN|FBAV|Instagram|Line|Twitter/i.test(userAgent);
      return Boolean(isSmallScreen || isStandalone || isWebView);
  };

  const handleGoogleLogin = async (): Promise<{ success: boolean, message: string }> => {
      setAuthError(null);
      setAuthRestoreError(null);
      beginAuthOperation();
      try {
          const source = 'google-popup';
          console.info('LOGIN_START', { source, mobileRedirectFallbackAvailable: shouldUseGoogleRedirect() });
          await ensureAuthPersistence();
          const credential = await signInWithPopup(auth, googleProvider);
          await credential.user.getIdToken(true);
          console.info('LOGIN_FIREBASE_SUCCESS', { uid: credential.user.uid, source: 'google-popup' });
          const committedUser = await completeFirebaseUserSession(credential.user, { redirect: false, source: 'google-popup', explicit: true });
          if (committedUser) {
              finishMobileAuthSuccess(committedUser);
              redirectAfterSuccessfulAuth({ source: 'google-popup', user: committedUser, force: true });
              return { success: true, message: 'Google login successful.' };
          }
          return { success: false, message: 'Login could not be completed. Please try again.' };
      } catch (error: any) {
          console.warn('Google login failed.', error);
          const shouldFallbackToRedirect = [
              'auth/popup-blocked',
              'auth/cancelled-popup-request',
              'auth/operation-not-supported-in-this-environment',
          ].includes(error?.code) || (shouldUseGoogleRedirect() && error?.code !== 'auth/popup-closed-by-user');
          if (shouldFallbackToRedirect) {
              try {
                  console.info('LOGIN_START', { source: 'google-redirect' });
                  await ensureAuthPersistence();
                  console.info('GOOGLE_REDIRECT_START');
                  markGoogleRedirectAttempt();
                  isRedirectResultPendingRef.current = true;
                  setIsRedirectResultPending(true);
                  await signInWithRedirect(auth, googleProvider);
                  return { success: true, message: 'Opening Google login...' };
              } catch (redirectError) {
                  console.warn('Google redirect fallback failed.', redirectError);
                  return { success: false, message: getFirebaseAuthErrorMessage(redirectError) };
              }
          }
          return { success: false, message: getFirebaseAuthErrorMessage(error) };
      } finally {
          if (auth.currentUser || !isRedirectResultPendingRef.current) endAuthOperation();
      }
  };

  const handleEmailLogin = async (email: string, password: string): Promise<{ success: boolean, message: string }> => {
      beginAuthOperation();
      try {
          const source = 'email-login';
          console.info('LOGIN_START', { source });
          await ensureAuthPersistence();
          const credential = await signInWithEmailAndPassword(auth, email, password);
          await credential.user.getIdToken(true);
          console.info('LOGIN_FIREBASE_SUCCESS', { uid: credential.user.uid, source });
          const committedUser = await completeFirebaseUserSession(credential.user, { redirect: false, profile: { name: credential.user.displayName || undefined, mobile: credential.user.phoneNumber || undefined }, source, explicit: true });
          if (committedUser) {
              finishMobileAuthSuccess(committedUser);
              redirectAfterSuccessfulAuth({ source, user: committedUser, force: true });
              return { success: true, message: 'Login successful.' };
          }
          return { success: false, message: 'Login could not be completed. Please try again.' };
      } catch (error) {
          return { success: false, message: getFirebaseAuthErrorMessage(error) };
      } finally {
          endAuthOperation();
      }
  };

  const handleEmailSignup = async (profile: { name: string; email: string; mobile: string }, password: string): Promise<{ success: boolean, message: string }> => {
      beginAuthOperation();
      try {
          const source = 'email-signup';
          console.info('LOGIN_START', { source });
          await ensureAuthPersistence();
          const credential = await createUserWithEmailAndPassword(auth, profile.email, password);
          await credential.user.getIdToken(true);
          console.info('LOGIN_FIREBASE_SUCCESS', { uid: credential.user.uid, source });
          await updateProfile(credential.user, { displayName: profile.name });
          const committedUser = await completeFirebaseUserSession(credential.user, { redirect: false, profile, source, explicit: true });
          if (committedUser) {
              finishMobileAuthSuccess(committedUser);
              redirectAfterSuccessfulAuth({ source, user: committedUser, force: true });
              return { success: true, message: 'Account created successfully.' };
          }
          return { success: false, message: 'Account could not be completed. Please try again.' };
      } catch (error) {
          return { success: false, message: getFirebaseAuthErrorMessage(error) };
      } finally {
          endAuthOperation();
      }
  };

  const getPasswordResetErrorMessage = (error: any) => {
      if (error?.code === 'auth/invalid-email') return 'Please enter a valid email address.';
      if (error?.code === 'auth/user-not-found') return 'No account found with this email.';
      if (error?.code === 'auth/too-many-requests') return 'Too many reset attempts. Please try again later.';
      if (error?.code === 'auth/network-request-failed') return 'Network error. Please check your internet connection.';
      return 'Could not send reset email. Please try again.';
  };

  const handlePasswordReset = async (email: string): Promise<{ success: boolean, message: string }> => {
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail) {
          return { success: false, message: 'Please enter a valid email address.' };
      }
      try {
          await sendPasswordResetEmail(auth, trimmedEmail);
          return { success: true, message: 'Password reset email sent. Please check your inbox/spam folder.' };
      } catch (error) {
          return { success: false, message: getPasswordResetErrorMessage(error) };
      }
  };

  const persistPurchaseEntitlement = async (uid: string, product: ProductWithRating, orderData: { quantity: number; total: string; source: 'razorpay' | 'educoin' | 'manual_admin'; orderId: string; paymentId?: string; status?: 'Completed' | 'Verified' | 'Active' }) => {
      if (!auth.currentUser || auth.currentUser.uid !== uid) throw new Error('Login is required to unlock purchases.');
      const status = orderData.status || 'Completed';
      await setDoc(doc(db, 'users', uid, 'purchases', String(product.id)), {
          productId: product.id,
          title: product.title,
          quantity: orderData.quantity,
          total: orderData.total,
          status,
          unlockedAt: serverTimestamp(),
          source: orderData.source,
          orderId: orderData.orderId,
          ...(orderData.paymentId ? { paymentId: orderData.paymentId } : {}),
      }, { merge: true });
      await setDoc(doc(db, 'users', uid), {
          uid,
          purchasedProductIds: arrayUnion(product.id),
          updatedAt: serverTimestamp(),
      }, { merge: true }).catch(error => {
          console.warn('User purchase id mirror was not updated; purchase subcollection remains the source of truth.', error);
      });
  };

  const persistUserPurchasedProducts = (nextPurchasedIds: number[]) => {
      if (!currentUser || !auth.currentUser || auth.currentUser.uid !== String(currentUser.id)) return;
      safeSetItem(`purchasedProducts:${currentUser.id}`, nextPurchasedIds);
      const updatedUsers = users.map(user => user.id === currentUser.id ? { ...(user as any), purchasedProductIds: nextPurchasedIds } : user);
      setUsers(updatedUsers as User[]);
      safeSetItem('siteUsers', updatedUsers);
      setCurrentUser({ ...(currentUser as any), purchasedProductIds: nextPurchasedIds });
  };

  const handleLogout = (remoteSignOut = true, options: { preserveSessionDocument?: boolean } = {}) => {
      logoutInProgressRef.current = true;
      setIsLocalLogoutPending(true);
      setAuthStatus('logout');
      const cleanup = async () => {
          stopSessionWatchers();
          if (!options.preserveSessionDocument) await clearCurrentSessionDocument();
          activeSessionUidRef.current = null;
          activeSessionIdRef.current = null;
          sessionStorage.removeItem('firebaseDeviceSessionId');
      };
      void cleanup();
      if (remoteSignOut) void signOut(auth).catch(error => console.warn('Firebase sign out failed.', error));
      committedFirebaseUidRef.current = null;
      sessionCompletionRef.current = null;
      sessionCompletionPromiseRef.current = null;
      lastCompletedSessionRef.current = null;
      setFirebaseAuthUser(null);
      setCurrentUser(null);
      setMobileAuthFlowState('logged-out');
      setIsMobileCompletionModalOpen(false);
      setMobileCompletionInput('');
      setMobileCompletionError('');
      setPurchasedProductIds([]);
      setPurchasedProductUpdateIds({});
      setIsAuthRestoring(false);
      setAuthRestoreError(null);
      setProfileStatus('idle');
      setPurchaseStatus('idle');
      setAuthStatus('unauthenticated');
      setWishlist([]);
      setCart([]);
      setSelectedProduct(null);
      setProductToBuyAfterLogin(null);
      setResumeCartCheckoutAfterLogin(false);
      setAutoOpenPaymentModalFor(null);
      setActiveCoinDiscount(null);
      setEduCoinGuideRequest(null);
      setIsCartOpen(false);
      setIsCartPaymentModalOpen(false);
      localStorage.removeItem('currentUser');
      localStorage.removeItem('purchasedProducts');
      localStorage.removeItem('productWishlist');
      localStorage.removeItem('shoppingCart');
      sessionStorage.removeItem('welcomeOverlaySeen');
      setCurrentView('home');
      window.scrollTo(0, 0);
  };
  
  const handleBackToHome = () => {
    if (currentView === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    else {
      appViewStackRef.current = ['home'];
      setCurrentView('home');
      window.scrollTo(0, 0);
    }
  };

  const handleNavigateBack = (fallbackView: string = 'home') => {
    if (latestUpdateCheckout) {
      setLatestUpdateCheckout(null);
      return;
    }

    const stack = appViewStackRef.current.filter(Boolean);
    const currentIndex = stack.lastIndexOf(currentView);
    const previousView = currentIndex > 0 ? stack[currentIndex - 1] : fallbackView;
    appViewStackRef.current = previousView === 'home' ? ['home'] : stack.slice(0, Math.max(1, currentIndex));
    historyNavigationRef.current = true;
    setCurrentView(previousView);
    if (typeof window !== 'undefined') {
      window.history.replaceState({ ...(window.history.state || {}), dcView: previousView }, '', window.location.href);
    }
    window.scrollTo(0, 0);
  };

  const handleBackFromAuth = () => {
    if (productToBuyAfterLogin) {
      setSelectedProduct(productToBuyAfterLogin);
      setCurrentView('product');
      setProductToBuyAfterLogin(null);
    } else if (resumeCartCheckoutAfterLogin) {
      setResumeCartCheckoutAfterLogin(false);
      setIsCartOpen(cart.length > 0);
      setCurrentView('home');
      window.scrollTo(0, 0);
    } else {
      handleBackToHome();
    }
  };

  const handleNavigateToProfile = () => {
    const hasActiveFirebaseSession = Boolean(firebaseAuthUser || auth.currentUser);

    if (isLoggedIn || hasActiveFirebaseSession || currentUser) {
      setCurrentView('profile');
    } else {
      openAuthPage(rememberedAuthAccount ? 'login' : 'signup');
    }

    window.scrollTo(0, 0);
  };

  const openAuthPage = (mode: 'login' | 'signup' = rememberedAuthAccount ? 'login' : 'signup') => {
    if (!auth.currentUser && !firebaseAuthUser && currentUser) setCurrentUser(null);
    setAuthInitialMode(mode);
    setCurrentView('auth');
  };

  const handleNavigateToAuth = () => openAuthPage(rememberedAuthAccount ? 'login' : 'signup');

  const handleLoginRequired = (product: ProductWithRating) => {
    setProductToBuyAfterLogin(product);
    setResumeCartCheckoutAfterLogin(false);
    setIsCartOpen(false);
    setIsCartPaymentModalOpen(false);
    openAuthPage('login');
    window.scrollTo(0,0);
  };


  const persistUserToFirestore = (user: User) => {
    try {
      void setDoc(doc(db, 'users', String(user.id)), user, { merge: true }).catch(error => {
        console.warn('User database sync failed; local wallet remains updated.', error);
      });
    } catch (error) {
      console.warn('User database sync failed before request; local wallet remains updated.', error);
    }
  };

  const recordCoinTransaction = (user: User, transaction: Omit<CoinTransaction, 'id' | 'createdAt'>) => {
    const timestamp = new Date().toISOString();
    const entry: CoinTransaction = { ...transaction, title: transaction.title || transaction.source, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: timestamp, timestamp };
    const storageKey = `coinTransactions-${user.id}`;
    try {
      const localLedger = JSON.parse(localStorage.getItem(storageKey) || '[]') as CoinTransaction[];
      const nextLedger = [entry, ...(Array.isArray(localLedger) ? localLedger : [])].slice(0, 100);
      safeSetItem(storageKey, nextLedger);
    } catch (error) {
      console.warn('Coin transaction local ledger write failed; wallet update will continue.', error);
    }
    try {
      void addDoc(collection(db, 'users', String(user.id), 'coinTransactions'), { ...entry, createdAt: serverTimestamp() }).catch(error => {
        console.warn('Coin transaction database write failed; local ledger remains updated.', error);
      });
    } catch (error) {
      console.warn('Coin transaction database write failed before request; local ledger remains updated.', error);
    }
    return entry;
  };

  const syncCurrentUser = (updater: (user: User) => User, transaction?: Omit<CoinTransaction, 'id' | 'createdAt'>) => {
    if (!currentUser || !auth.currentUser || auth.currentUser.uid !== String(currentUser.id)) return null;

    const rawUpdatedUser = updater(currentUser);
    const currentBalance = readEduCoinBalance(currentUser);
    const rawEduCoins = Math.max(0, Math.floor(Number(rawUpdatedUser.eduCoins ?? currentBalance) || 0));
    const rawCoinBalance = Math.max(0, Math.floor(Number(rawUpdatedUser.coinBalance ?? currentBalance) || 0));
    const balanceChangedViaEduCoins = rawUpdatedUser.eduCoins !== currentUser.eduCoins;
    const nextBalance = balanceChangedViaEduCoins ? rawEduCoins : rawCoinBalance;
    const transactionAmount = Math.floor(Number(transaction?.amount || 0));
    const creditAmount = transactionAmount > 0 ? transactionAmount : 0;
    const previousTotalEarned = Math.max(0, Math.floor(Number(currentUser.totalCoinsEarned ?? currentUser.totalLifetimeCoins ?? currentBalance) || 0));
    const nextTotalEarned = Math.max(
      Math.floor(Number(rawUpdatedUser.totalCoinsEarned ?? 0) || 0),
      previousTotalEarned + creditAmount
    );
    const nextTotalLifetimeCoins = Math.max(
      Math.floor(Number(rawUpdatedUser.totalLifetimeCoins ?? 0) || 0),
      nextTotalEarned
    );
    const updatedUser: User = {
      ...rawUpdatedUser,
      coinBalance: nextBalance,
      eduCoins: nextBalance,
      totalCoinsEarned: nextTotalEarned,
      totalLifetimeCoins: nextTotalLifetimeCoins,
    };

    const entry = transaction ? recordCoinTransaction(updatedUser, transaction) : null;
    const userWithLedger = entry ? { ...updatedUser, coinTransactions: [entry, ...(updatedUser.coinTransactions || [])].slice(0, 25) } : updatedUser;
    setCurrentUser(userWithLedger);
    const nextUsers = users.some(user => user.id === userWithLedger.id)
      ? users.map(user => user.id === userWithLedger.id ? userWithLedger : user)
      : [...users, userWithLedger];
    setUsers(nextUsers);
    safeSetItem('siteUsers', nextUsers);
    persistUserToFirestore(userWithLedger);
    return userWithLedger;
  };

  const showCoinToast = (message: string) => {
    setCoinToast(message);
    window.setTimeout(() => setCoinToast(null), 3000);
  };

  const showRewardSyncError = () => {
    setInfoModal({
      title: 'Please refresh/login again',
      message: 'Please refresh/login again before claiming rewards',
      icon: '⚠️',
    });
  };

  const creditEduCoins = (amount: number, message?: string, metadata?: Partial<Omit<CoinTransaction, 'amount' | 'type' | 'createdAt'>>) => {
    if (!currentUser || amount <= 0) return false;
    const synced = syncCurrentUser(
      user => ({ ...user, eduCoins: (user.eduCoins || 0) + amount, totalLifetimeCoins: (user.totalLifetimeCoins || 0) + amount }),
      { amount, type: 'credit', source: metadata?.source || 'EduCoin reward', description: metadata?.description || message || `+${amount} EduCoins earned`, articleId: metadata?.articleId, productId: metadata?.productId },
    );
    if (synced === null) {
      showRewardSyncError();
      return false;
    }
    showCoinToast(message || `✦ +${amount} EduCoins Earned`);
    return true;
  };

  const deductEduCoins = (amount: number, metadata?: Partial<Omit<CoinTransaction, 'amount' | 'type' | 'createdAt'>>) => {
    if (!currentUser || amount <= 0 || (currentUser.eduCoins || 0) < amount) return false;
    const synced = syncCurrentUser(
      user => ({ ...user, eduCoins: (user.eduCoins || 0) - amount }),
      { amount: -amount, type: 'debit', source: metadata?.source || 'EduCoin redemption', description: metadata?.description || `${amount} EduCoins redeemed`, productId: metadata?.productId, articleId: metadata?.articleId },
    );
    if (synced === null) {
      showRewardSyncError();
      return false;
    }
    return true;
  };

  const deductEduCoinsAtomically = async (
    amount: number,
    metadata?: Partial<Omit<CoinTransaction, 'amount' | 'type' | 'createdAt'>>
  ) => {
    const walletUser = currentUser || effectiveAppUser;
    const debitAmount = Math.max(0, Math.floor(Number(amount) || 0));

    if (!walletUser || !auth.currentUser || debitAmount <= 0) return false;

    const uid = auth.currentUser.uid;

    try {
      const spendResult = await spendUserCoinWallet({
        userId: uid,
        amount: debitAmount,
        source: metadata?.source || 'EduCoin redemption',
        description: metadata?.description || `${debitAmount} EduCoins redeemed`,
        productId: metadata?.productId,
        articleId: metadata?.articleId,
      });

      if (!spendResult.success) {
        throw new Error(spendResult.reason === 'not_enough_coins' ? 'INSUFFICIENT_EDUCOINS' : 'EDUCOIN_SPEND_FAILED');
      }

      const timestamp = new Date().toISOString();
      const ledgerEntry: CoinTransaction = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        amount: -debitAmount,
        type: 'debit',
        source: metadata?.source || 'EduCoin redemption',
        title: metadata?.title || metadata?.source || 'EduCoin redemption',
        description: metadata?.description || `${debitAmount} EduCoins redeemed`,
        productId: metadata?.productId,
        articleId: metadata?.articleId,
        createdAt: timestamp,
        timestamp,
      };

      const syncedUser: User = {
        ...(walletUser as User),
        id: uid,
        uid,
        coinBalance: spendResult.balanceAfter,
        eduCoins: spendResult.balanceAfter,
        totalCoinsEarned: spendResult.totalCoinsEarned,
        totalCoinsSpent: spendResult.totalCoinsSpent,
        totalLifetimeCoins: Math.max(Number((walletUser as User).totalLifetimeCoins || 0), spendResult.totalCoinsEarned),
      };

      const userWithLedger: User = {
        ...syncedUser,
        coinTransactions: [ledgerEntry, ...(syncedUser.coinTransactions || [])].slice(0, 25),
      };

      try {
        const storageKey = `coinTransactions-${uid}`;
        const localLedger = JSON.parse(localStorage.getItem(storageKey) || '[]') as CoinTransaction[];
        safeSetItem(storageKey, [ledgerEntry, ...(Array.isArray(localLedger) ? localLedger : [])].slice(0, 100));
      } catch (error) {
        console.warn('Coin transaction local ledger write failed after wallet spend.', error);
      }

      setLiveEduCoinBalance(spendResult.balanceAfter);
      setCurrentUser(userWithLedger);
      setUsers(current => {
        const nextUsers = current.some(user => user.id === userWithLedger.id)
          ? current.map(user => user.id === userWithLedger.id ? userWithLedger : user)
          : [...current, userWithLedger];

        safeSetItem('siteUsers', nextUsers);
        return nextUsers;
      });

      safeSetItem('currentUser', userWithLedger);
      showCoinToast(`🪙 ${debitAmount} EduCoins applied`);
      return true;
    } catch (error) {
      console.warn('Atomic EduCoin debit failed.', error);

      setInfoModal({
        title: 'EduCoin balance changed',
        message: error instanceof Error && error.message === 'INSUFFICIENT_EDUCOINS'
          ? 'Your live EduCoin wallet balance is lower than this checkout needs. Please earn more coins or reduce the coin discount.'
          : 'Could not verify your EduCoin wallet from Firebase. Please try again.',
        icon: '🪙',
      });

      return false;
    }
  };

  const handleReadingReward = (article: NewsArticle) => {
    const rewardCoins = Math.max(0, Number(economySettings.coinPerArticleRead));
    if (!currentUser) return false;
    const articleId = article.id;
    const alreadyRead = [...(currentUser.rewardedArticleIds || []), ...(currentUser.readArticles || [])].includes(articleId);
    if (alreadyRead) return false;
    const synced = syncCurrentUser(
      user => ({
        ...user,
        eduCoins: (user.eduCoins || 0) + rewardCoins,
        totalLifetimeCoins: (user.totalLifetimeCoins || 0) + rewardCoins,
        rewardedArticleIds: [...new Set([...(user.rewardedArticleIds || []), articleId])],
        readArticles: [...new Set([...(user.readArticles || []), articleId])],
      }),
      { amount: rewardCoins, type: 'credit', source: 'Article reading reward', description: `Read: ${article.title}`, articleId },
    );
    if (synced === null) {
      showRewardSyncError();
      return false;
    }
    showCoinToast(`✦ +${rewardCoins} EduCoins Earned`);
    return true;
  };

  const handleQuizReward = (quizId: string, quizTitle: string, correctAnswers: number, coins: number) => {
    if (!currentUser || coins <= 0) return false;
    if ((currentUser.rewardedQuizIds || []).includes(quizId)) return false;
    const synced = syncCurrentUser(
      user => ({
        ...user,
        eduCoins: (user.eduCoins || 0) + coins,
        totalLifetimeCoins: (user.totalLifetimeCoins || 0) + coins,
        rewardedQuizIds: [...new Set([...(user.rewardedQuizIds || []), quizId])],
      }),
      { amount: coins, type: 'credit', source: `Quiz: ${quizTitle}`, description: `${correctAnswers} correct answer${correctAnswers === 1 ? '' : 's'} in ${quizTitle}` },
    );
    if (synced === null) {
      showRewardSyncError();
      return false;
    }
    showCoinToast(`✦ +${coins} EduCoins Quiz Reward`);
    return true;
  };

  const handleClaimMilestoneReward = (reward: { id: string; title: string; requirement: number; unlockProductIds?: number[]; coinReward?: number; currentValue?: number }) => {
    if (!currentUser) return false;
    if ((reward.currentValue ?? currentUser.totalLifetimeCoins ?? 0) < reward.requirement || (currentUser.claimedRewardIds || []).includes(reward.id)) return false;
    const coinReward = Math.max(0, Number(reward.coinReward || 0));
    const synced = syncCurrentUser(
      user => ({
        ...user,
        claimedRewardIds: [...new Set([...(user.claimedRewardIds || []), reward.id])],
        eduCoins: (user.eduCoins || 0) + coinReward,
        totalLifetimeCoins: (user.totalLifetimeCoins || 0) + coinReward,
      }),
      { amount: coinReward, type: 'credit', source: 'Milestone unlocked', description: `Unlocked: ${reward.title}${coinReward ? ` (+${coinReward} EduCoins)` : ''}` },
    );
    if (synced === null) {
      showRewardSyncError();
      return false;
    }
    if (reward.unlockProductIds?.length) {
      const nextPurchasedIds = mergePurchasedProductIds(purchasedProductIds, reward.unlockProductIds);
      setPurchasedProductIds(nextPurchasedIds);
      persistUserPurchasedProducts(nextPurchasedIds);
    }
    setInfoModal({ title: 'Milestone unlocked', message: `${reward.title} is now available.${coinReward ? ` +${coinReward} EduCoins credited.` : ''}`, icon: '🏆' });
    return true;
  };

  const handleToggleWishlist = (productId: number) => {
    const isAdding = !wishlist.includes(productId);
    const updatedWishlist = isAdding ? [...wishlist, productId] : wishlist.filter(id => id !== productId);
    setWishlist(updatedWishlist);
    safeSetItem('productWishlist', updatedWishlist);

    // Update global product count
    setProducts(prevProducts => prevProducts.map(p => {
        if (p.id === productId) {
            const currentCount = p.wishlistCount || 0;
            return { ...p, wishlistCount: isAdding ? currentCount + 1 : Math.max(0, currentCount - 1) };
        }
        return p;
    }));
  };
  
  const handleClearWishlist = () => {
    if (window.confirm("Are you sure you want to clear your entire wishlist?")) {
        // We don't decrement counts here because we don't know exactly which counts belong to this user session vs others in a real app simulation,
        // but for local consistency we could iterate wishlist items. For simplicity, we just clear local list.
        setWishlist([]);
        safeSetItem('productWishlist', []);
    }
  };

  const handleAddReview = (productId: number, reviewData: Omit<Review, 'name' | 'date'>) => {
    const newReview: Review = {
        ...reviewData,
        name: currentUser?.name || currentUser?.email.split('@')[0] || 'Customer',
        date: 'Just now'
    };
    const updatedReviews = { ...reviews, [productId]: [newReview, ...(reviews[productId] || [])] };
    setReviews(updatedReviews);
    safeSetItem('productReviews', updatedReviews);
    void setDoc(doc(db, ...GLOBAL_REVIEWS_DOC), { reviews: stripUndefinedDeep(updatedReviews) }, { merge: true })
      .catch(error => logGlobalSyncWarning('Reviews', error));
  };

  const handleViewProduct = (product: ProductWithRating, sectionId?: string) => {
    // Increment view count
    const updatedProduct = { ...product, viewCount: (product.viewCount || 0) + 1 };
    
    // Update state
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, viewCount: (p.viewCount || 0) + 1 } : p));
    
    setSelectedProduct(updatedProduct);
    setCurrentView('product');
    setScrollToProductSection(sectionId || null);
    window.scrollTo(0, 0);
  };

  const handleBuyNowProduct = (product: ProductWithRating) => {
    setIsFreeModalOpen(false);
    if (purchasedProductIds.includes(product.id)) {
      setSelectedProduct(product);
      setActiveCoinDiscount(null);
      setScrollToProductSection(null);
      setAutoOpenPaymentModalFor(null);
      setCurrentView('product');
      window.scrollTo(0, 0);
      return;
    }
    if (!hasFirebaseUser) {
      handleLoginRequired(product);
      return;
    }

    if (requiresMobileCompletion()) { promptForMobileCompletion(); return; }

    const selected = { ...product, viewCount: (product.viewCount || 0) + 1 };
    setProducts(prev => prev.map(item => item.id === product.id ? { ...item, viewCount: (item.viewCount || 0) + 1 } : item));
    setSelectedProduct(selected);
    setActiveCoinDiscount(null);
    setScrollToProductSection(null);
    setAutoOpenPaymentModalFor(product.id);
    setCurrentView('product');
    window.scrollTo(0, 0);
  };
  
  const handleViewProductFromModal = (product: ProductWithRating) => {
    setIsReadingDrawerOpen(false);
    setIsFreeModalOpen(false);
    handleViewProduct(product);
  };

  const handleApplyCoinClaim = (claim: ActiveCoinDiscount) => {
    if (!hasFirebaseUser) { openAuthPage('login'); return; }
    setActiveCoinDiscount(claim);
    if (claim.targetType === 'product' && claim.productId) {
      const product = productsWithRatings.find(item => item.id === claim.productId);
      if (product) {
        setSelectedProduct(product);
        setAutoOpenPaymentModalFor(product.id);
        setCurrentView('product');
        window.scrollTo(0, 0);
      }
      return;
    }
    if (claim.targetType === 'subscription') {
      setCurrentView('subscription');
      window.scrollTo(0, 0);
    }
  };
  
  const handleViewPurchasedProduct = (product: ProductWithRating) => {
    if (!hasFirebaseUser || !purchasedProductIds.includes(product.id)) {
      setSelectedProduct(null);
      if (hasFirebaseUser) setCurrentView('myPurchases');
      else openAuthPage('login');
      window.scrollTo(0, 0);
      return;
    }
    setSelectedProduct(product);
    setCurrentView('coursePlayer');
    window.scrollTo(0, 0);
  };

  const handlePurchaseComplete = async (appliedCouponCode: string | null, quantity: number) => {
    if (selectedProduct) {
        // Recalculate price robustly at the moment of confirmation
        const originalPriceNum = parseFloat(selectedProduct.price.replace('₹', ''));
        const salePriceNum = selectedProduct.salePrice ? parseFloat(selectedProduct.salePrice.replace('₹', '')) : null;
        const currentPriceNum = salePriceNum ?? originalPriceNum;
        const preDiscountTotal = currentPriceNum * quantity;

        const couponToApply = appliedCouponCode ? coupons.find(c => c.code === appliedCouponCode) : null;
        let finalDiscount = 0;
        if (couponToApply) {
            finalDiscount = calculateDiscount(couponToApply, preDiscountTotal);
        }
        const coinDiscount = activeCoinDiscount?.targetType === 'product' && activeCoinDiscount.productId === selectedProduct.id ? Math.min(preDiscountTotal - finalDiscount, activeCoinDiscount.amount) : 0;
        const robustFinalPrice = Math.max(0, preDiscountTotal - finalDiscount - coinDiscount);
        if (activeCoinDiscount?.targetType === 'product' && activeCoinDiscount.productId === selectedProduct.id && activeCoinDiscount.coins > 0) {
          const coinsDebited = await deductEduCoinsAtomically(activeCoinDiscount.coins, {
            source: 'Profile coin claim',
            description: `Applied ${activeCoinDiscount.coins} EduCoins for ₹${coinDiscount.toFixed(2)} discount`,
            productId: selectedProduct.id,
          });

          if (!coinsDebited) return;
          setActiveCoinDiscount(null);
        }

        if (!hasFirebaseUser || !auth.currentUser) { openAuthPage('login'); return; }
        const orderId = `DC-${Date.now()}`;
        try {
          await persistPurchaseEntitlement(auth.currentUser.uid, selectedProduct, { quantity, total: `₹${robustFinalPrice.toFixed(2)}`, source: 'razorpay', orderId });
        } catch (error) {
          setInfoModal({ title: 'Purchase sync failed', message: 'Payment was confirmed, but access could not be saved. Please retry sync before opening this product.', icon: '⚠️' });
          console.warn('Purchase entitlement write failed.', error);
          return;
        }
        const newPurchasedIds = mergePurchasedProductIds(purchasedProductIds, [selectedProduct.id]);
        setPurchasedProductIds(newPurchasedIds);
        persistUserPurchasedProducts(newPurchasedIds);
        const purchaseCoins = Math.max(0, Number(economySettings.coinPerPurchase));
        try {
          creditEduCoins(purchaseCoins, `✦ +${purchaseCoins} EduCoins Purchase Reward`, { source: 'Purchase reward', description: `Purchased ${selectedProduct.title}`, productId: selectedProduct.id });
        } catch (error) {
          console.warn('Purchase reward credit failed; product unlock remains completed.', error);
        }

        const newOrder: Order = {
            id: `DC-${Date.now()}`,
            customerName: effectiveAppUser?.name || effectiveAppUser?.email.split('@')[0] || 'Valued Customer',
            customerEmail: effectiveAppUser?.email || 'customer@example.com',
            date: new Date().toISOString().split('T')[0],
            total: `₹${robustFinalPrice.toFixed(2)}${coinDiscount > 0 ? ` (🪙 ${activeCoinDiscount?.coins || 0} applied)` : ''}`,
            status: 'Completed',
            items: [{
                id: selectedProduct.id,
                name: selectedProduct.title,
                quantity: quantity,
                price: selectedProduct.salePrice || selectedProduct.price
            }],
            shippingAddress: 'N/A (Digital Product)',
            billingAddress: '123 E-commerce St, Web City, WC 54321',
            paymentBreakdown: {
                purchaseKind: 'product',
                baseTotal: preDiscountTotal,
                finalPrice: robustFinalPrice,
                couponCode: couponToApply?.code || null,
                couponDiscount: finalDiscount,
                couponType: couponToApply?.type,
                couponValue: couponToApply?.value,
                eduCoinsUsed: coinDiscount > 0 ? activeCoinDiscount?.coins || 0 : 0,
                eduCoinDiscount: coinDiscount,
                coinOnlyPurchase: false,
                paymentLabel: 'Product checkout',
            }
        };
        addGlobalOrder(newOrder);
    }
    if (appliedCouponCode) {
        updateCouponUsage(appliedCouponCode);
    }
    setCart([]); // Clear cart after single product purchase
    setCurrentView('congratulations');
    window.scrollTo(0, 0);
  };
  
  const completeProductUnlock = async (product: ProductWithRating, quantity: number, totalLabel: string, status: Order['status'] = 'Completed') => {
    if (!hasFirebaseUser || !auth.currentUser) { openAuthPage('login'); return false; }
    const orderId = `DC-${Date.now()}`;
    try {
      await persistPurchaseEntitlement(auth.currentUser.uid, product, { quantity, total: totalLabel, source: 'educoin', orderId, status: status as 'Completed' | 'Verified' | 'Active' });
    } catch (error) {
      setInfoModal({ title: 'Purchase sync failed', message: 'Your payment/coin checkout was confirmed, but backend access could not be saved. Please retry.', icon: '⚠️' });
      console.warn('Purchase entitlement write failed.', error);
      return false;
    }
    const newPurchasedIds = mergePurchasedProductIds(purchasedProductIds, [product.id]);
    setPurchasedProductIds(newPurchasedIds);
    persistUserPurchasedProducts(newPurchasedIds);
    addGlobalOrder({
      id: `DC-${Date.now()}`,
      customerName: effectiveAppUser?.name || effectiveAppUser?.email.split('@')[0] || 'Valued Customer',
      customerEmail: effectiveAppUser?.email || 'customer@example.com',
      date: new Date().toISOString().split('T')[0],
      total: totalLabel,
      status,
      items: [{ id: product.id, name: product.title, quantity, price: product.salePrice || product.price }],
      shippingAddress: 'N/A (Digital Product)',
      billingAddress: 'EduCoin Wallet',
      paymentBreakdown: {
        purchaseKind: 'product',
        baseTotal: parseCurrency(product.salePrice || product.price) * quantity,
        finalPrice: 0,
        eduCoinsUsed: parseCurrency(totalLabel),
        eduCoinDiscount: parseCurrency(product.salePrice || product.price) * quantity,
        coinOnlyPurchase: true,
        paymentLabel: 'EduCoin wallet purchase',
      },
    });
    setSelectedProduct(product);
    setCurrentView('congratulations');
    window.scrollTo(0, 0);
  };

  const handleProductCoinPurchase = async (
    product: ProductWithRating,
    quantity: number,
    options: { coinDebitAlreadyProcessed?: boolean; totalCoinsCharged?: number } = {}
  ): Promise<boolean> => {
    if (!hasFirebaseUser) {
      openAuthPage('login');
      window.scrollTo(0, 0);
      return false;
    }

    const totalCoinPrice = Math.max(
      0,
      Math.floor(options.totalCoinsCharged ?? (normalizeCoinPrice(product.coinPrice).normalizedCoinPrice * quantity))
    );

    if (!totalCoinPrice) {
      setInfoModal({
        title: 'EduCoin checkout unavailable',
        message: 'This product does not have an EduCoin price configured yet.',
        icon: '🪙',
      });
      return false;
    }

    if (!options.coinDebitAlreadyProcessed) {
      const success = await deductEduCoinsAtomically(totalCoinPrice, {
        source: 'Product EduCoin purchase',
        description: `Unlocked ${product.title} with EduCoins`,
        productId: product.id,
      });

      if (!success) return false;
    }

    return await completeProductUnlock(product, quantity, `🪙 ${totalCoinPrice}`) !== false;
  };

  const handleConfirmCartCoinPurchase = async () => {
    if (!hasFirebaseUser || cartDetails.length === 0) return false;
    const totalCoinPrice = cartDetails.reduce((total, item) => total + (resolveCoinPrice(item.product.coinPrice, economySettings, 'product', item.product.id) * item.quantity), 0);
    const allCoinEnabled = cartDetails.every(item => resolveCoinPrice(item.product.coinPrice, economySettings, 'product', item.product.id) > 0);
    const liveCoinBalance = liveWalletBalance;
    if (!allCoinEnabled || !totalCoinPrice || liveCoinBalance < totalCoinPrice) {
      return false;
    }
    const deducted = await deductEduCoinsAtomically(totalCoinPrice, {
      source: 'Cart EduCoin purchase',
      description: 'Unlocked cart with EduCoins',
    });

    if (!deducted) return false;
    const orderId = `DC-${Date.now()}`;
    try {
      await Promise.all(cartDetails.map(item => persistPurchaseEntitlement(auth.currentUser!.uid, item.product, { quantity: item.quantity, total: `🪙 ${resolveCoinPrice(item.product.coinPrice, economySettings, 'product', item.product.id) * item.quantity}`, source: 'educoin', orderId })));
    } catch (error) {
      setInfoModal({ title: 'Purchase sync failed', message: 'Coin checkout was confirmed, but cart access could not be saved. Please retry.', icon: '⚠️' });
      console.warn('Cart entitlement write failed.', error);
      return false;
    }
    const newPurchasedIds = mergePurchasedProductIds(purchasedProductIds, cart.map(item => item.productId));
    setPurchasedProductIds(newPurchasedIds);
    persistUserPurchasedProducts(newPurchasedIds);
    addGlobalOrder({
      id: `DC-${Date.now()}`,
      customerName: effectiveAppUser?.name || effectiveAppUser?.email?.split('@')[0] || 'Valued Customer',
      customerEmail: effectiveAppUser?.email || 'customer@example.com',
      date: new Date().toISOString().split('T')[0],
      total: `🪙 ${totalCoinPrice}`,
      status: 'Completed',
      items: cartDetails.map(item => ({ id: item.product.id, name: item.product.title, quantity: item.quantity, price: `🪙 ${resolveCoinPrice(item.product.coinPrice, economySettings, 'product', item.product.id)}` })),
      shippingAddress: 'N/A (Digital Product)',
      billingAddress: 'EduCoin Wallet',
      paymentBreakdown: {
        purchaseKind: 'cart',
        baseTotal: cartDetails.reduce((total, item) => total + (parseCurrency(item.product.salePrice || item.product.price) * item.quantity), 0),
        finalPrice: 0,
        eduCoinsUsed: totalCoinPrice,
        eduCoinDiscount: cartDetails.reduce((total, item) => total + (parseCurrency(item.product.salePrice || item.product.price) * item.quantity), 0),
        coinOnlyPurchase: true,
        paymentLabel: 'Cart EduCoin wallet purchase',
      },
    });
    setSelectedProduct(cartDetails[0]?.product || null);
    setCart([]);
    setAppliedCartCoupon(null);
    setCartCouponError(null);
    setApplyCartEduCoins(false);
    setCurrentView('congratulations');
    window.scrollTo(0, 0);
    return true;
  };

  const handleNavigateToPolicies = (sectionId?: string) => {
    setCurrentView('policies');
    setScrollToPolicySection(sectionId || null);
    window.scrollTo(0, 0);
  };


  const handleInsufficientEduCoins = (details: { requiredCoins: number; balance: number; missingCoins: number; productTitle?: string }) => {
    setEduCoinGuideRequest(details);
    setIsCartOpen(false);
    setIsCartPaymentModalOpen(false);
    setCurrentView('eduCoinGuide');
    window.scrollTo(0, 0);
  };

  const persistUserPurchasedProductUpdates = (nextUpdates: Record<string, string[]>) => {
    const uid = auth.currentUser?.uid || currentUser?.id || effectiveAppUser?.id;
    if (!uid) return;

    const cleanUpdates = normalizePurchasedProductUpdateIds(nextUpdates);
    setPurchasedProductUpdateIds(cleanUpdates);
    safeSetItem(`purchasedProductUpdates:${uid}`, cleanUpdates);

    setCurrentUser(current => {
      if (!current) return current;
      const updatedUser = { ...(current as any), purchasedProductUpdateIds: cleanUpdates } as User;
      safeSetItem('currentUser', updatedUser);
      return updatedUser;
    });

    setUsers(currentUsers => {
      const nextUsers = currentUsers.map(user =>
        String(user.id) === String(uid)
          ? ({ ...(user as any), purchasedProductUpdateIds: cleanUpdates } as User)
          : user
      );

      safeSetItem('siteUsers', nextUsers);
      return nextUsers;
    });

    void setDoc(doc(db, 'users', String(uid)), { purchasedProductUpdateIds: cleanUpdates, updatedAt: serverTimestamp() }, { merge: true })
      .catch(error => console.warn('Paid update entitlement sync failed; local unlock remains available.', error));
  };

  const getLatestUpdateCheckoutSummary = (product: ProductWithRating, targetUpdateId?: string) => {
    const access = getProductAccessState(product);
    const selectedUpdateIds = targetUpdateId
      ? (access.lockedPaidUpdateIds.includes(targetUpdateId) ? [targetUpdateId] : access.lockedPaidUpdateIds)
      : access.lockedPaidUpdateIds;

    const firstLockedMeta = findLockedPaidUpdateMeta(product, targetUpdateId);
    const fallbackPrice = product.salePrice || product.price;
    const rawPrice = firstLockedMeta?.paidUpdatePrice || fallbackPrice;
    const updatePrice = Math.max(0, parseCurrency(rawPrice));
    const updateTitle = firstLockedMeta?.paidUpdateTitle || 'Latest course update';
    const rawCoinPrice = firstLockedMeta?.paidUpdateCoinPrice ??
      (firstLockedMeta as any)?.updateEducoinPrice ??
      (firstLockedMeta as any)?.educoinPrice ??
      (firstLockedMeta as any)?.coinPrice;
    const coinPrice = normalizeCoinPrice(rawCoinPrice).normalizedCoinPrice;

    return {
      updateIds: selectedUpdateIds,
      title: updateTitle,
      price: updatePrice,
      coinPrice,
      priceLabel: updatePrice > 0 ? `₹${updatePrice.toFixed(2)}` : '₹0.00',
    };
  };

  const handleEducoinUpdateUnlockComplete = (product: ProductWithRating, updateIds: string[]) => {
    const productKey = String(product.id);
    persistUserPurchasedProductUpdates({
      ...purchasedProductUpdateIds,
      [productKey]: mergeUpdateIds(purchasedProductUpdateIds[productKey], updateIds),
    });
  };

  const handleOpenLatestUpdateCheckout = (product: ProductWithRating, updateId?: string) => {
    if (!hasFirebaseUser) {
      handleLoginRequired(product);
      return;
    }

    if (requiresMobileCompletion()) {
      promptForMobileCompletion();
      return;
    }

    const access = getProductAccessState(product);

    if (!access.hasBaseAccess) {
      handleBuyNowProduct(product);
      return;
    }

    if (!access.hasPaidLockedUpdates) {
      setInfoModal({
        title: 'No locked update',
        message: 'You already have access to all available course content.',
        icon: '✅',
      });
      return;
    }

    const summary = getLatestUpdateCheckoutSummary(product, updateId);

    if (!summary.updateIds.length) {
      setInfoModal({
        title: 'Already unlocked',
        message: 'This paid content is already available in your course player.',
        icon: '✅',
      });
      return;
    }

    setSelectedProduct(product);
    setLatestUpdateCheckout({ product, updateId });
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };

  const handleConfirmLatestUpdatePurchase = async (product: ProductWithRating, updateId?: string) => {
    if (!hasFirebaseUser || !auth.currentUser) {
      openAuthPage('login');
      return;
    }

    const summary = getLatestUpdateCheckoutSummary(product, updateId);

    if (!summary.updateIds.length) {
      setLatestUpdateCheckout(null);
      return;
    }

    const productKey = String(product.id);
    const nextUpdates = {
      ...purchasedProductUpdateIds,
      [productKey]: mergeUpdateIds(purchasedProductUpdateIds[productKey], summary.updateIds),
    };

    persistUserPurchasedProductUpdates(nextUpdates);

    addGlobalOrder({
      id: `DC-UPD-${Date.now()}`,
      customerName: effectiveAppUser?.name || effectiveAppUser?.email?.split('@')[0] || 'Valued Customer',
      customerEmail: effectiveAppUser?.email || 'customer@example.com',
      date: new Date().toISOString().split('T')[0],
      total: summary.priceLabel,
      status: 'Completed',
      items: [{
        id: product.id,
        name: `${product.title} · ${summary.title}`,
        quantity: 1,
        price: summary.priceLabel,
      }],
      shippingAddress: 'N/A (Digital Product Update)',
      billingAddress: 'Latest Update Checkout',
      paymentBreakdown: {
        purchaseKind: 'product',
        baseTotal: summary.price,
        finalPrice: summary.price,
        paymentLabel: 'Latest course update',
        unlockedProductIds: [product.id],
        unlockedUpdateIds: summary.updateIds,
      } as any,
    });

    setLatestUpdateCheckout(null);
    setSelectedProduct(product);
    setCurrentView('coursePlayer');
    window.scrollTo(0, 0);

    setInfoModal({
      title: 'Paid content unlocked',
      message: `${summary.title} is now available inside your course player.`,
      icon: '✅',
    });
  };


  const handleConfirmLatestUpdateCoinPurchase = async (product: ProductWithRating, updateId?: string): Promise<boolean> => {
    if (!hasFirebaseUser || !auth.currentUser) {
      openAuthPage('login');
      return false;
    }

    const summary = getLatestUpdateCheckoutSummary(product, updateId);

    if (!summary.updateIds.length) {
      setLatestUpdateCheckout(null);
      return true;
    }

    if (summary.coinPrice <= 0) {
      setInfoModal({
        title: 'EduCoin price missing',
        message: 'This paid update does not have an EduCoin price configured yet. Please set Update EduCoin Price from admin.',
        icon: '🪙',
      });
      return false;
    }

    const uid = auth.currentUser.uid;
    const productKey = String(product.id);

    try {
      const result = await runTransaction(db, async transaction => {
        const userRef = doc(db, 'users', uid);
        const userSnap = await transaction.get(userRef);
        const userData = userSnap.data() || {};

        const liveBalance = Math.max(
          0,
          Math.floor(Number((userData as any).coinBalance ?? (userData as any).eduCoins ?? liveWalletBalance ?? 0) || 0)
        );

        const remoteUpdates = normalizePurchasedProductUpdateIds((userData as any).purchasedProductUpdateIds || purchasedProductUpdateIds);
        const ownedUpdateIds = remoteUpdates[productKey] || [];
        const lockedUpdateIds = summary.updateIds.filter(updateIdValue => !ownedUpdateIds.includes(updateIdValue));

        if (!lockedUpdateIds.length) {
          return {
            success: true,
            alreadyUnlocked: true,
            balance: liveBalance,
            nextUpdates: remoteUpdates,
          };
        }

        if (liveBalance < summary.coinPrice) {
          return {
            success: false,
            alreadyUnlocked: false,
            balance: liveBalance,
            nextUpdates: remoteUpdates,
          };
        }

        const nextBalance = liveBalance - summary.coinPrice;
        const nextUpdates = {
          ...remoteUpdates,
          [productKey]: mergeUpdateIds(ownedUpdateIds, lockedUpdateIds),
        };

        transaction.set(userRef, {
          coinBalance: nextBalance,
          eduCoins: nextBalance,
          purchasedProductUpdateIds: nextUpdates,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        return {
          success: true,
          alreadyUnlocked: false,
          balance: nextBalance,
          nextUpdates,
        };
      });

      if (!result.success) {
        handleInsufficientEduCoins({
          requiredCoins: summary.coinPrice,
          balance: result.balance,
          missingCoins: Math.max(0, summary.coinPrice - result.balance),
          productTitle: `${product.title} · ${summary.title}`,
        });
        return false;
      }

      persistUserPurchasedProductUpdates(result.nextUpdates);

      addGlobalOrder({
        id: `DC-UPD-COIN-${Date.now()}`,
        customerName: effectiveAppUser?.name || effectiveAppUser?.email?.split('@')[0] || 'Valued Customer',
        customerEmail: effectiveAppUser?.email || 'customer@example.com',
        date: new Date().toISOString().split('T')[0],
        total: `${summary.coinPrice} EduCoins`,
        status: 'Completed',
        items: [{
          id: product.id,
          name: `${product.title} · ${summary.title}`,
          quantity: 1,
          price: `${summary.coinPrice} EduCoins`,
        }],
        shippingAddress: 'N/A (Digital Product Update)',
        billingAddress: 'EduCoin Latest Update Checkout',
        paymentBreakdown: {
          purchaseKind: 'product',
          baseTotal: summary.price,
          finalPrice: 0,
          paymentLabel: 'EduCoin latest update',
          unlockedProductIds: [product.id],
          unlockedUpdateIds: summary.updateIds,
          coinsCharged: result.alreadyUnlocked ? 0 : summary.coinPrice,
        } as any,
      });

      setLatestUpdateCheckout(null);
      setSelectedProduct(product);
      setCurrentView('coursePlayer');
      window.scrollTo(0, 0);

      setInfoModal({
        title: result.alreadyUnlocked ? 'Already unlocked' : 'Paid content unlocked',
        message: result.alreadyUnlocked
          ? `${summary.title} is already available inside your course player.`
          : `${summary.title} is now unlocked with EduCoins.`,
        icon: '✅',
      });

      return true;
    } catch (error) {
      console.error('Latest update EduCoin unlock failed:', error);
      setInfoModal({
        title: 'EduCoin unlock failed',
        message: 'Could not unlock this paid update with EduCoins. Please try again.',
        icon: '⚠️',
      });
      return false;
    }
  };

  const handleBackFromEduCoinGuide = () => {
    if (selectedProduct) {
      setCurrentView('product');
      window.setTimeout(() => setAutoOpenPaymentModalFor(selectedProduct.id), 0);
    } else {
      setCurrentView(cart.length > 0 ? 'allProducts' : 'home');
    }
    setEduCoinGuideRequest(null);
    window.scrollTo(0, 0);
  };

  const handleOpenReadingHubFromGuide = () => {
    setCurrentView('home');
    window.setTimeout(() => openReadingHub('blog'), 0);
    window.scrollTo(0, 0);
  };

  const handleNavigateToAllProducts = () => {
    setCurrentView('allProducts');
    setSelectedProduct(null);
    window.scrollTo(0, 0);
  };
  
  const handleNavigateToPurchases = () => {
    setCurrentView('myPurchases');
    setSelectedProduct(null);
    window.scrollTo(0, 0);
  };


  const unlockSubscriptionPlan = (plan: any, paymentLabel = 'Fiat checkout') => {
    const newPurchasedIds = mergePurchasedProductIds(purchasedProductIds, plan.unlockProductIds || []);
    setPurchasedProductIds(newPurchasedIds);
    persistUserPurchasedProducts(newPurchasedIds);
    setInfoModal({ title: 'Subscription active', message: `${plan.name} activated successfully via ${paymentLabel}.`, icon: '✅' });
  };

  const handleActivateSubscription = (plan: any, appliedCouponCode?: string | null) => {
    if (!hasFirebaseUser) { openAuthPage('login'); return; }

    const planPrice = Number(plan.price || 0);
    const couponToApply = appliedCouponCode ? coupons.find(c => c.code.trim().toUpperCase() === appliedCouponCode.trim().toUpperCase()) : null;
    let couponDiscount = 0;

    if (appliedCouponCode) {
      if (!couponToApply || !couponToApply.isActive) {
        setInfoModal({ title: 'Coupon unavailable', message: 'This coupon is invalid or inactive now. Please apply another coupon.', icon: '🎟️' });
        return;
      }

      if (couponToApply.expiryDate) {
        const [year, month, day] = couponToApply.expiryDate.split('-').map(Number);
        const expiry = new Date(year, month - 1, day);
        if (Number.isNaN(expiry.getTime())) {
          setInfoModal({ title: 'Coupon unavailable', message: 'This coupon has an invalid expiry date.', icon: '🎟️' });
          return;
        }
        expiry.setHours(23, 59, 59, 999);
        if (expiry < new Date()) {
          setInfoModal({ title: 'Coupon expired', message: 'This coupon has expired. Please remove it or use another coupon.', icon: '⌛' });
          return;
        }
      }

      if (Number(couponToApply.usageLimit) > 0 && Number(couponToApply.timesUsed || 0) >= Number(couponToApply.usageLimit)) {
        setInfoModal({ title: 'Coupon limit reached', message: 'This coupon has reached its usage limit.', icon: '🎟️' });
        return;
      }

      couponDiscount = calculateDiscount(couponToApply, planPrice);
    }

    const coinDiscount = activeCoinDiscount?.targetType === 'subscription' && activeCoinDiscount.subscriptionId === String(plan.id) ? Math.min(planPrice - couponDiscount, activeCoinDiscount.amount) : 0;
    const finalPrice = Math.max(0, planPrice - couponDiscount - coinDiscount);

    if (coinDiscount > 0 && activeCoinDiscount?.coins) {
      if (!deductEduCoins(activeCoinDiscount.coins, { source: 'Subscription EduCoin discount', description: `Applied ${activeCoinDiscount.coins} EduCoins for ₹${coinDiscount.toFixed(2)} subscription discount` })) return;
      setActiveCoinDiscount(null);
    }

    if (couponToApply) {
      updateCouponUsage(couponToApply.code);
    }

    const paymentParts = [`₹${finalPrice.toFixed(2)}`];
    if (couponToApply) paymentParts.push(`${couponToApply.code} coupon`);
    if (coinDiscount > 0) paymentParts.push(`${activeCoinDiscount?.coins || 0} EduCoins`);
    const paymentLabel = paymentParts.join(' + ');
    unlockSubscriptionPlan(plan, paymentLabel);
    addGlobalOrder({
      id: `DC-SUB-${Date.now()}`,
      customerName: effectiveAppUser?.name || effectiveAppUser?.email?.split('@')[0] || 'Valued Customer',
      customerEmail: effectiveAppUser?.email || 'customer@example.com',
      date: new Date().toISOString().split('T')[0],
      total: paymentLabel,
      status: 'Completed',
      items: [{ id: Number(plan.id) || Date.now(), name: `${plan.name} Subscription`, quantity: 1, price: `₹${planPrice.toFixed(2)}` }],
      shippingAddress: 'N/A (Digital Subscription)',
      billingAddress: 'Subscription Checkout',
      paymentBreakdown: {
        purchaseKind: 'subscription',
        baseTotal: planPrice,
        finalPrice,
        couponCode: couponToApply?.code || null,
        couponDiscount,
        couponType: couponToApply?.type,
        couponValue: couponToApply?.value,
        eduCoinsUsed: coinDiscount > 0 ? activeCoinDiscount?.coins || 0 : 0,
        eduCoinDiscount: coinDiscount,
        coinOnlyPurchase: false,
        paymentLabel,
        unlockedProductIds: plan.unlockProductIds || [],
      },
    });
  };

  const handleActivateSubscriptionWithCoins = (plan: any) => {
    if (!hasFirebaseUser) { openAuthPage('login'); return; }
    const coinPrice = activeCoinDiscount?.targetType === 'subscription' && activeCoinDiscount.subscriptionId === String(plan.id) ? activeCoinDiscount.coins : resolveCoinPrice(plan.coinPrice, economySettings, 'subscription', plan.id);
    if (!coinPrice || !deductEduCoins(coinPrice, { source: 'Subscription EduCoin purchase', description: `Activated ${plan.name} with EduCoins` })) return;
    if (activeCoinDiscount?.targetType === 'subscription' && activeCoinDiscount.subscriptionId === String(plan.id)) setActiveCoinDiscount(null);
    const paymentLabel = `${coinPrice} EduCoins`;
    unlockSubscriptionPlan(plan, paymentLabel);
    addGlobalOrder({
      id: `DC-SUB-${Date.now()}`,
      customerName: effectiveAppUser?.name || effectiveAppUser?.email?.split('@')[0] || 'Valued Customer',
      customerEmail: effectiveAppUser?.email || 'customer@example.com',
      date: new Date().toISOString().split('T')[0],
      total: `🪙 ${coinPrice}`,
      status: 'Completed',
      items: [{ id: Number(plan.id) || Date.now(), name: `${plan.name} Subscription`, quantity: 1, price: `🪙 ${coinPrice}` }],
      shippingAddress: 'N/A (Digital Subscription)',
      billingAddress: 'EduCoin Wallet',
      paymentBreakdown: {
        purchaseKind: 'subscription',
        baseTotal: Number(plan.price || 0),
        finalPrice: 0,
        eduCoinsUsed: coinPrice,
        eduCoinDiscount: Number(plan.price || 0),
        coinOnlyPurchase: true,
        paymentLabel,
        unlockedProductIds: plan.unlockProductIds || [],
      },
    });
  };
  const handleNavigateToSubscription = () => { setCurrentView('subscription'); window.scrollTo(0,0); };

  const handleNavigateToWishlist = () => {
    setCurrentView('wishlist');
    window.scrollTo(0, 0);
  };

  const handleNavigateToFreeProducts = () => {
    setIsFreeModalOpen(false);
    setCurrentView('freeProducts');
    window.scrollTo(0, 0);
  };

  const handleNavigateToHomeAndScroll = (sectionId: string) => {
    if (currentView === 'home') {
        const element = document.getElementById(sectionId);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        setCurrentView('home');
        setScrollToSection(sectionId);
    }
  };

  const handleSubscribe = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    const key = `subscribed:${normalizedEmail}`;
    if (!localStorage.getItem(key)) {
      const nextSubscribers = newsletterSubscribers.some(item => item.email.toLowerCase() === normalizedEmail)
        ? newsletterSubscribers
        : [{ id: `SUB-${Date.now()}`, email: normalizedEmail, subscribedAt: new Date().toISOString() }, ...newsletterSubscribers];
      setNewsletterSubscribers(nextSubscribers);
      safeSetItem('newsletterSubscribers', nextSubscribers);
      localStorage.setItem(key, '1');
    }
    setSubscribedEmail(normalizedEmail);
    setIsSubscriptionModalOpen(true);
  };

  const closeReadingDrawer = () => {
    setIsReadingDrawerOpen(false);
    setSelectedArticle(null);
    setSelectedAnnouncement(null);
  };

  const openReadingHub = (type: ReadingListType = 'blog') => {
    setSelectedArticle(null);
    setSelectedAnnouncement(null);
    setReadingListType(type);
    setReadingDrawerView(type);
    setIsReadingDrawerOpen(true);
  };

  const handleViewAnnouncement = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setSelectedArticle(null);
    setReadingListType('news');
    setReadingDrawerView('announcement');
    setIsReadingDrawerOpen(true);
  };

  const handleViewBlogArticle = (article: NewsArticle) => {
    setSelectedArticle(article);
    setSelectedAnnouncement(null);
    setReadingListType(article.type === 'news' ? 'news' : 'blog');
    setReadingDrawerView('article');
    setIsReadingDrawerOpen(true);
  };

  const handleBackToReadingList = () => {
    setSelectedArticle(null);
    setSelectedAnnouncement(null);
    setReadingDrawerView(readingListType);
  };

  const handleExploreReadingFeature = () => {
    closeReadingDrawer();
    handleNavigateToAllProducts();
  };

  // FIX: Changed to check for existing admin session before showing login screen
  const handleNavigateToAdminLogin = () => {
    if (currentAdminUser) {
      setCurrentView('admin');
    } else {
      setCurrentView('adminLogin');
    }
  };

  const handleAdminLogin = (email: string, password: string): boolean => {
    const admin = adminUsers.find(u => u.email === email && u.password === password);
    if (admin) {
        setCurrentAdminUser(admin);
        safeSetItem('currentAdminUser', admin);
        setCurrentView('admin');
        return true;
    }
    return false;
  };
  
  const handleAdminSwitchToHome = () => {
      // Does NOT clear currentAdminUser, just changes view
      setCurrentView('home');
  };

  const handleAdminLogout = () => {
    setCurrentAdminUser(null);
    localStorage.removeItem('currentAdminUser');
    setCurrentView('home');
  };

  const persistProductsLocalFallback = (nextProducts: Product[]) => {
      const normalizedProducts = nextProducts.map(normalizeProductArrays);
      safeSetItem('siteProducts', normalizedProducts);

      try {
          localStorage.setItem('legacyProductsPurged', 'true');
      } catch (error) {
          console.warn('Could not update product cache marker.', error);
      }
  };

  const upsertProductList = (currentProducts: Product[], product: Product) => {
      const normalizedProduct = normalizeProductArrays(product);
      const withoutCurrentProduct = currentProducts.filter(item => item.id !== normalizedProduct.id);
      return [...withoutCurrentProduct, normalizedProduct].sort((a, b) => Number(a.id) - Number(b.id));
  };

  const publishProductToFirebase = async (product: Product): Promise<Product> => {
      const normalizedProduct = normalizeProductArrays(product);
      await setDoc(
          doc(db, GLOBAL_PRODUCTS_COLLECTION, String(normalizedProduct.id)),
          stripUndefinedDeep(normalizedProduct),
          { merge: false }
      );
      return normalizedProduct;
  };

  // Product CRUD is Firebase-first. Local cache is only a fallback mirror.
  const handleAddProduct = async (product: Omit<Product, 'id'>): Promise<boolean> => {
      const productWithId = normalizeProductArrays({
          ...product,
          id: Date.now(),
          manualRating: product.manualRating !== undefined ? product.manualRating : null,
      });

      try {
          console.info('ADMIN_PRODUCT_SAVE_STARTED', { productId: productWithId.id, action: 'add' });
          console.info('ADMIN_PRODUCT_FIRESTORE_SAVE_STARTED', { productId: productWithId.id, action: 'add' });
          const savedProduct = await publishProductToFirebase(productWithId);
          console.info('ADMIN_PRODUCT_SAVE_SUCCESS', { productId: savedProduct.id, action: 'add' });
          console.info('ADMIN_PRODUCT_FIRESTORE_SAVE_SUCCESS', { productId: savedProduct.id, action: 'add' });
          console.info('ADMIN_PRODUCT_REFRESH_VERIFY_STARTED', { productId: savedProduct.id, action: 'add' });
          await getDoc(doc(db, GLOBAL_PRODUCTS_COLLECTION, String(savedProduct.id)));
          console.info('ADMIN_PRODUCT_REFRESH_VERIFY_SUCCESS', { productId: savedProduct.id, action: 'add' });
          const updatedProducts = upsertProductList(products, savedProduct);

          setProducts(updatedProducts);
          persistProductsLocalFallback(updatedProducts);
          return true;
      } catch (e) {
          console.error('ADMIN_PRODUCT_SAVE_FAILED', { action: 'add', error: e });
          console.error('ADMIN_PRODUCT_FIRESTORE_SAVE_FAILED', { action: 'add', error: e });
          console.error('Firebase product add failed:', e);
          alert('Product was not saved to Firebase. Please check Firebase admin permission/rules and try again.');
          return false;
      }
  };

  const handleUpdateProduct = async (updatedProduct: Product): Promise<boolean> => {
      try {
          console.info('ADMIN_PRODUCT_SAVE_STARTED', { productId: updatedProduct.id, action: 'update' });
          console.info('ADMIN_PRODUCT_FIRESTORE_SAVE_STARTED', { productId: updatedProduct.id, action: 'update' });
          const savedProduct = await publishProductToFirebase(updatedProduct);
          console.info('ADMIN_PRODUCT_SAVE_SUCCESS', { productId: savedProduct.id, action: 'update' });
          console.info('ADMIN_PRODUCT_FIRESTORE_SAVE_SUCCESS', { productId: savedProduct.id, action: 'update' });
          console.info('ADMIN_PRODUCT_REFRESH_VERIFY_STARTED', { productId: savedProduct.id, action: 'update' });
          await getDoc(doc(db, GLOBAL_PRODUCTS_COLLECTION, String(savedProduct.id)));
          console.info('ADMIN_PRODUCT_REFRESH_VERIFY_SUCCESS', { productId: savedProduct.id, action: 'update' });
          console.info('ADMIN_PURCHASED_USER_AUDIO_VERIFY_SUCCESS', { productId: savedProduct.id });
          const updatedProducts = upsertProductList(products, savedProduct);

          setProducts(updatedProducts);
          persistProductsLocalFallback(updatedProducts);

          setSelectedProduct(current =>
              current && current.id === savedProduct.id
                  ? { ...savedProduct, rating: current.rating, reviewCount: current.reviewCount, calculatedRating: current.calculatedRating }
                  : current
          );
          return true;
      } catch (e) {
          console.error('ADMIN_PRODUCT_SAVE_FAILED', { action: 'update', error: e });
          console.error('ADMIN_PRODUCT_FIRESTORE_SAVE_FAILED', { action: 'update', error: e });
          console.error('Firebase product update failed:', e);
          alert('Product update was not saved to Firebase. Please check Firebase admin permission/rules and try again.');
          return false;
      }
  };

  const handleDeleteProduct = async (productId: number): Promise<boolean> => {
      try {
          await deleteDoc(doc(db, GLOBAL_PRODUCTS_COLLECTION, String(productId)));

          const updatedProducts = products.filter(product => product.id !== productId);
          setProducts(updatedProducts);
          persistProductsLocalFallback(updatedProducts);

          const updatedReviews = { ...reviews };
          delete updatedReviews[productId];
          setReviews(updatedReviews);
          safeSetItem('productReviews', updatedReviews);

          void setDoc(doc(db, ...GLOBAL_REVIEWS_DOC), { reviews: stripUndefinedDeep(updatedReviews) }, { merge: true })
              .catch(error => logGlobalSyncWarning('Reviews cleanup', error));
          return true;
      } catch (e) {
          console.error('Firebase product delete failed:', e);
          alert('Product was not deleted from Firebase. Please check Firebase admin permission/rules and try again.');
          return false;
      }
  };
  
  const handleDeleteUser = (userId: number) => {
    if (window.confirm("Delete this user? This cannot be undone.")) {
        const updatedUsers = users.filter(u => u.id !== userId);
        setUsers(updatedUsers);
        safeSetItem('siteUsers', updatedUsers);
    }
  };

  const handleCouponsUpdate = (updatedCoupons: Coupon[]) => {
    setCoupons(updatedCoupons);
    safeSetItem('siteCoupons', updatedCoupons);
    void syncArrayCollectionToFirestore(GLOBAL_COUPONS_COLLECTION, updatedCoupons, coupon => String(coupon.id))
      .catch(error => logGlobalSyncWarning('Coupons update', error));
  };

  const handleTicketsUpdate = (updatedTickets: SupportTicket[]) => {
    setTickets(updatedTickets);
    safeSetItem('siteSupportTickets', updatedTickets);
    void syncArrayCollectionToFirestore(GLOBAL_TICKETS_COLLECTION, updatedTickets, ticket => String(ticket.id))
      .catch(error => logGlobalSyncWarning('Support tickets update', error));
    window.dispatchEvent(new Event('siteSupportTicketsUpdated'));
  };

  // --- RENDER LOGIC ---

  const renderAuthRestoreStatus = () => (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
          <div className="max-w-md w-full bg-white/75 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-[0_20px_70px_rgba(15,23,42,0.08)] p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-indigo-50 flex items-center justify-center text-3xl">{isAuthRestoring ? '⏳' : '🔒'}</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">{isAuthRestoring ? 'Restoring your account and purchases…' : 'Purchases are locked'}</h2>
              <p className="text-slate-600 mb-6">{isAuthRestoring ? 'Please wait while we securely restore your account and verified purchases.' : authRestoreError || 'Could not restore purchases. Please retry.'}</p>
              {!isAuthRestoring && authRestoreError && (
                  <button onClick={handleRetryAuthRestore} className="w-full bg-slate-900 text-white px-5 py-3 rounded-2xl font-semibold hover:bg-slate-800 transition-colors">
                      Retry restore
                  </button>
              )}
          </div>
      </div>
  );


  const renderMobileSessionStatus = (title: string, message: string, icon = '⏳') => (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-16">
          <div className="max-w-md w-full bg-white/80 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-[0_20px_70px_rgba(15,23,42,0.08)] p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-indigo-50 flex items-center justify-center text-3xl">{icon}</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">{title}</h2>
              <p className="text-slate-600">{message}</p>
          </div>
      </div>
  );

  const renderHomePageContent = () => {
      const visibleHomeSections = websiteSettings.layout.filter(section => section.visible);
      const topRatedSection = visibleHomeSections.find(section => section.id === 'topRated');
      const hasPurchasedSection = visibleHomeSections.some(section => section.id === 'purchased');
      const orderedHomeSections = topRatedSection && hasPurchasedSection
          ? visibleHomeSections.filter(section => section.id !== 'topRated').flatMap(section => section.id === 'purchased' ? [section, topRatedSection] : [section])
          : visibleHomeSections;

      return (
      <>
          {orderedHomeSections.map(section => {
              switch(section.id) {
                  case 'hero': return <React.Fragment key={section.id}><div className="mobile-home-secondary"><Hero settings={websiteSettings} onNavigateToPolicies={() => handleNavigateToPolicies()} onNavigateToAllProducts={handleNavigateToAllProducts} onOpenBlogModal={() => openReadingHub('blog')} onOpenFreeModal={handleNavigateToFreeProducts} onOpenAnnouncementsModal={() => openReadingHub('news')} realMetrics={realMetrics} /><PlatformExperience settings={websiteSettings} /></div></React.Fragment>;
                  case 'purchased': return purchasedProducts.length > 0 && <PurchasedProducts settings={websiteSettings} key={section.id} products={purchasedProducts} onViewPurchasedProduct={handleViewPurchasedProduct} />;
                  case 'topRated': return <FeaturedProducts settings={websiteSettings} key={section.id} title={section.title || "Top Rated Products"} subtitle="A quick look at the courses learners rate highest right now." products={topRatedProducts} onViewProduct={handleViewProduct} wishlist={wishlist} onToggleWishlist={handleToggleWishlist} onAddToCart={handleAddToCart} onBuyNow={handleBuyNowProduct} coupons={coupons} variant="mobileHome" />;
                  case 'allProducts': return <ProductShowcase settings={websiteSettings} key={section.id} products={visibleProducts} onViewProduct={handleViewProduct} wishlist={wishlist} onToggleWishlist={handleToggleWishlist} onAddToCart={handleAddToCart} onBuyNow={handleBuyNowProduct} coupons={coupons} purchasedProductIds={purchasedProductIds} />;
                  case 'services': return <div className="mobile-home-secondary"><Services settings={websiteSettings} key={section.id} services={websiteSettings.content.services} onNavigateToHomeAndScroll={handleNavigateToHomeAndScroll} /></div>;
                  case 'news': return <div className="mobile-home-secondary"><LatestNews settings={websiteSettings} key={section.id} title={section.title || 'Daily Reading Hub'} articles={websiteSettings.content.newsArticles.filter(article => article.type === 'news')} onReadMoreClick={handleViewBlogArticle} onOpenHub={() => openReadingHub('news')} /></div>;
                  case 'about': return <div className="mobile-home-secondary"><AboutUs settings={websiteSettings} key={section.id} title={websiteSettings.content.aboutUsTitle} text={websiteSettings.content.aboutUsText} imageSeed={websiteSettings.content.aboutUsImageSeed} /></div>;
                  case 'trust': return <div className="mobile-home-secondary"><TrustBadges settings={websiteSettings} key={section.id} /></div>;
                  case 'upcoming': return <div className="mobile-home-secondary"><UpcomingFeatures settings={websiteSettings} key={section.id} title={section.title || "What's Next?"} features={websiteSettings.content.upcomingFeatures} onOpenCommunity={() => { setCurrentView('community'); window.scrollTo(0, 0); }} /></div>;
                  case 'faq': return <div className="mobile-home-secondary"><Faq settings={websiteSettings} key={section.id} faqs={websiteSettings.content.faqs} /></div>;
                  default: return null;
              }
          })}
      </>
      );
  };

  const renderContent = (appUser: User | null = currentUser) => {
    switch (currentView) {
      case 'product': return selectedProduct && <ProductDetailPage economySettings={economySettings} activeCoinDiscount={activeCoinDiscount?.targetType === 'product' && activeCoinDiscount.productId === selectedProduct.id ? activeCoinDiscount : null} onConsumeCoinDiscount={() => setActiveCoinDiscount(null)} settings={websiteSettings} product={selectedProduct} onBack={() => handleNavigateBack('allProducts')} onPurchase={(appliedCouponCode, quantity) => handlePurchaseComplete(appliedCouponCode, quantity)} isWishlisted={wishlist.includes(selectedProduct.id)} onToggleWishlist={handleToggleWishlist} reviews={reviews[selectedProduct.id] || []} onAddReview={(d) => handleAddReview(selectedProduct.id, d)} isLoggedIn={isLoggedIn} onLoginRequired={() => handleLoginRequired(selectedProduct)} autoOpenPaymentModal={autoOpenPaymentModalFor === selectedProduct.id} onModalOpened={() => setAutoOpenPaymentModalFor(null)} coupons={coupons} scrollToSection={scrollToProductSection} onSectionScrolled={() => setScrollToProductSection(null)} onAddToCart={handleAddToCart} allProducts={productsWithRatings} onViewProduct={handleViewProduct} onBuyNow={handleBuyNowProduct} wishlist={wishlist} onGoHome={handleBackToHome} onStartEarning={handleNavigateToProfile} onInsufficientCoins={handleInsufficientEduCoins} isPurchased={purchasedProductIds.includes(selectedProduct.id)} currentUser={appUser} productAccess={selectedProduct ? productAccessById[selectedProduct.id] : null} onPurchaseLatestUpdate={handleOpenLatestUpdateCheckout} onCoinPurchase={(product, quantity, options) => handleProductCoinPurchase(product, quantity, options)} />;
      case 'coursePlayer':
        if (isAuthRestoring || authRestoreError) return renderAuthRestoreStatus();
        return isLoggedIn && appUser && selectedProduct && purchasedProductIds.includes(selectedProduct.id) ? <CoursePlayer settings={websiteSettings} economySettings={economySettings} product={selectedProduct} currentUser={appUser} onBack={() => handleNavigateBack('myPurchases')} onQuizReward={handleQuizReward} productAccess={selectedProduct ? productAccessById[selectedProduct.id] : null} onPurchaseLatestUpdate={handleOpenLatestUpdateCheckout} onEducoinUnlockComplete={handleEducoinUpdateUnlockComplete} /> : renderAuthRestoreStatus();
      case 'eduCoinGuide': return <EduCoinGuidePage settings={websiteSettings} economySettings={economySettings} currentUser={appUser} requiredCoins={eduCoinGuideRequest?.requiredCoins || 0} productTitle={eduCoinGuideRequest?.productTitle || selectedProduct?.title} onBack={handleBackFromEduCoinGuide} onExplorePurchases={handleNavigateToPurchases} onOpenProfile={handleNavigateToProfile} onOpenReadingHub={handleOpenReadingHubFromGuide} />;
      case 'congratulations': return <Congratulations settings={websiteSettings} onBack={() => handleNavigateBack('home')} onCheckProduct={handleNavigateToPurchases} product={selectedProduct} reviews={selectedProduct ? reviews[selectedProduct.id] || [] : []} onAddReview={selectedProduct ? (d) => handleAddReview(selectedProduct.id, d) : () => {}} />;
      case 'allProducts': return <ProductShowcase settings={websiteSettings} products={visibleProducts} onViewProduct={handleViewProduct} wishlist={wishlist} onToggleWishlist={handleToggleWishlist} onAddToCart={handleAddToCart} onBuyNow={handleBuyNowProduct} coupons={coupons} purchasedProductIds={purchasedProductIds} />;
      case 'myPurchases':
        if (!isAuthStateReady) return renderMobileSessionStatus('Checking session…', 'Please wait while we securely check your login status.');
        return isLoggedIn ? <PurchasedProducts settings={websiteSettings} products={purchasedProducts} onViewPurchasedProduct={handleViewPurchasedProduct} /> : <AuthPage settings={websiteSettings} initialMode={authInitialMode} rememberedAccount={rememberedAuthAccount} onForgetRememberedAccount={() => { clearRememberedAuthAccount(); setRememberedAuthAccount(null); }} onGoogleLogin={handleGoogleLogin} onEmailLogin={handleEmailLogin} onEmailSignup={handleEmailSignup} onPasswordReset={handlePasswordReset} onBack={handleBackFromAuth} />;
      case 'profile':
        if (!isAuthStateReady) return renderMobileSessionStatus('Checking session…', 'Please wait while we securely check your login status.');
        return isLoggedIn && appUser ? <ProfilePage economySettings={economySettings} onApplyCoinClaim={handleApplyCoinClaim} activeCoinDiscount={activeCoinDiscount} onClearCoinClaim={() => setActiveCoinDiscount(null)} settings={websiteSettings} currentUser={appUser} purchasedProducts={purchasedProducts} products={productsWithRatings} coupons={coupons} onBack={() => handleNavigateBack('home')} onExplore={handleNavigateToAllProducts} activeTheme={activeTheme} onThemeChange={setActiveTheme} onSyncCurrentUser={syncCurrentUser} onClaimMilestoneReward={handleClaimMilestoneReward} onOpenVerifiedCourse={handleViewPurchasedProduct} /> : <AuthPage settings={websiteSettings} initialMode={authInitialMode} rememberedAccount={rememberedAuthAccount} onForgetRememberedAccount={() => { clearRememberedAuthAccount(); setRememberedAuthAccount(null); }} onGoogleLogin={handleGoogleLogin} onEmailLogin={handleEmailLogin} onEmailSignup={handleEmailSignup} onPasswordReset={handlePasswordReset} onBack={handleBackFromAuth} />;
      case 'subscription': return <SubscriptionPage economySettings={economySettings} activeCoinDiscount={activeCoinDiscount?.targetType === 'subscription' ? activeCoinDiscount : null} onConsumeCoinDiscount={() => setActiveCoinDiscount(null)} settings={websiteSettings} products={productsWithRatings} purchasedProductIds={purchasedProductIds} onBack={() => handleNavigateBack('home')} onActivatePlan={handleActivateSubscription} currentUser={appUser} onActivatePlanWithCoins={handleActivateSubscriptionWithCoins} coupons={coupons} />;
      case 'freeProducts': return <FreeProductsPage settings={websiteSettings} products={freeProducts} onBack={() => handleNavigateBack('home')} onAddToCart={handleAddToCart} onBuyNow={handleBuyNowProduct} onViewProduct={handleViewProductFromModal} />;
      case 'wishlist': return <WishlistPage settings={websiteSettings} products={wishlistProducts} onViewProduct={handleViewProduct} wishlist={wishlist} onToggleWishlist={handleToggleWishlist} onNavigateToAllProducts={handleNavigateToAllProducts} onAddToCart={handleAddToCart} onBuyNow={handleBuyNowProduct} onClearWishlist={handleClearWishlist} coupons={coupons} />;
      case 'home': default: return (
        <>
          <div className="md:hidden">
            <MobileAppHome
              settings={websiteSettings}
              rememberedAccount={rememberedAuthAccount}
              currentUser={appUser}
              isLoggedIn={isLoggedIn}
              purchasedProducts={purchasedProducts}
              topRatedProducts={topRatedProducts}
              visibleProducts={visibleProducts}
              purchasedProductIds={purchasedProductIds}
              wishlist={wishlist}
              coupons={coupons}
              cartCount={cartItemCount}
              onViewPurchasedProduct={handleViewPurchasedProduct}
              onViewProduct={handleViewProduct}
              onToggleWishlist={handleToggleWishlist}
              onNavigateToAllProducts={handleNavigateToAllProducts}
              onNavigateToPurchases={handleNavigateToPurchases}
              onNavigateToFreeProducts={handleNavigateToFreeProducts}
              onOpenNews={() => openReadingHub('news')}
              onCartClick={openCartSidebar}
              onProfileClick={handleNavigateToProfile}
              onAuthClick={openAuthPage}
            />
          </div>
          <div className="hidden md:block">{renderHomePageContent()}</div>
        </>
      );
    }
  };

  const shouldHideFooterOnMobile = Boolean(websiteSettings.mobile?.hideFooter);
  const shouldHideMainDockOnMobile =
    currentView !== 'home' ||
    isCartOpen ||
    isReadingDrawerOpen ||
    isFreeModalOpen ||
    isCartPaymentModalOpen ||
    isSubscriptionModalOpen;

  const shouldShowMainPageBackButtonOnMobile =
    currentView !== 'home' &&
    currentView !== 'admin' &&
    currentView !== 'adminLogin';

  const appleOpenClass = "animate-in fade-in zoom-in-95 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]";

  const renderLatestUpdateCheckoutOverlay = () => {
    if (!latestUpdateCheckout) return null;

    const summary = getLatestUpdateCheckoutSummary(latestUpdateCheckout.product, latestUpdateCheckout.updateId);

    return (
      <PaymentModal
        settings={websiteSettings}
        economySettings={economySettings}
        productTitle={`${latestUpdateCheckout.product.title} · ${summary.title}`}
        originalPrice={summary.price}
        salePrice={null}
        couponDiscount={0}
        finalPrice={summary.price}
        eduCoinDiscount={0}
        appliedEduCoins={0}
        coinRedeemRate={eduCoinRedeemRate}
        onClose={() => setLatestUpdateCheckout(null)}
        onConfirm={() => void handleConfirmLatestUpdatePurchase(latestUpdateCheckout.product, latestUpdateCheckout.updateId)}
        paymentLink={latestUpdateCheckout.product.paymentLink}
        currentUser={effectiveAppUser ? { ...effectiveAppUser, coinBalance: liveWalletBalance, eduCoins: liveWalletBalance } : effectiveAppUser}
        coinPrice={summary.coinPrice}
        onConfirmWithCoins={summary.coinPrice > 0 ? () => handleConfirmLatestUpdateCoinPurchase(latestUpdateCheckout.product, latestUpdateCheckout.updateId) : undefined}
        onInsufficientCoins={(details) => handleInsufficientEduCoins({ ...details, productTitle: `${latestUpdateCheckout.product.title} · ${summary.title}` })}
        presentation="page"
      />
    );
  };

  const renderPage = () => {
    const isAuthChecking = isAuthBooting && !isAuthStateReady;
    const isSignedIn = !isAuthChecking && hasFirebaseUser;
    const isSignedOut = !isAuthChecking && !hasFirebaseUser;
    const protectedViews = new Set(['profile', 'myPurchases', 'coursePlayer']);
    const requiresAuthForView = protectedViews.has(currentView);
    console.info('AUTH_GATE_DECISION', { isLoggedIn, hasFirebaseUser, hasAppUser: Boolean(effectiveAppUser), currentView, isMobileViewport, authStatus, isRedirectResultPending });
    if (isAuthChecking && requiresAuthForView) return renderMobileSessionStatus('Checking session…', 'Please wait while we securely check your login status.');
    if (currentView === 'auth' && !hasFirebaseUser) return <div key="auth" className={appleOpenClass}><AuthPage settings={websiteSettings} initialMode={authInitialMode} rememberedAccount={rememberedAuthAccount} onForgetRememberedAccount={() => { clearRememberedAuthAccount(); setRememberedAuthAccount(null); }} onGoogleLogin={handleGoogleLogin} onEmailLogin={handleEmailLogin} onEmailSignup={handleEmailSignup} onPasswordReset={handlePasswordReset} onBack={handleBackFromAuth} /></div>;
    if (isSignedOut && requiresAuthForView) return <div key="auth" className={appleOpenClass}><AuthPage settings={websiteSettings} initialMode={rememberedAuthAccount ? 'login' : authInitialMode} rememberedAccount={rememberedAuthAccount} onForgetRememberedAccount={() => { clearRememberedAuthAccount(); setRememberedAuthAccount(null); }} onGoogleLogin={handleGoogleLogin} onEmailLogin={handleEmailLogin} onEmailSignup={handleEmailSignup} onPasswordReset={handlePasswordReset} onBack={handleBackFromAuth} /></div>;
    if (currentView === 'policies') return <div key="policies" className={appleOpenClass}><PolicyPage settings={websiteSettings} onBack={() => handleNavigateBack('home')} scrollToSection={scrollToPolicySection} onSectionScrolled={() => setScrollToPolicySection(null)} /></div>;
    if (currentView === 'admin' && currentAdminUser) return <div key="admin" className={appleOpenClass}><AdminDashboard economySettings={economySettings} websiteSettings={websiteSettings} onWebsiteSettingsChange={handleWebsiteSettingsUpdate} products={productsWithRatings} reviews={reviews} users={users} coupons={coupons} orders={orders} tickets={tickets} newsletterSubscribers={newsletterSubscribers} onSubscribersUpdate={(updatedSubscribers) => { setNewsletterSubscribers(updatedSubscribers); safeSetItem('newsletterSubscribers', updatedSubscribers); }} onTicketsUpdate={handleTicketsUpdate} onAddProduct={handleAddProduct} onUpdateProduct={handleUpdateProduct} onDeleteProduct={handleDeleteProduct} onDeleteUser={handleDeleteUser} onCouponsUpdate={handleCouponsUpdate} onLogout={handleAdminLogout} onSwitchToHome={handleAdminSwitchToHome} adminUsers={adminUsers} currentAdminUser={currentAdminUser} onAdminUsersUpdate={(updatedUsers) => { setAdminUsers(updatedUsers); safeSetItem('adminUsers', updatedUsers); }} /></div>;
    if (currentView === 'adminLogin') return <div key="adminLogin" className={appleOpenClass}><AdminLogin settings={websiteSettings} onLogin={handleAdminLogin} onBack={() => handleNavigateBack('home')} /></div>;
    if (currentView === 'coursePlayer') return <div key="coursePlayer" className={appleOpenClass}>{renderContent(effectiveAppUser)}</div>;
    if (currentView === 'community') return <div key="community" className={appleOpenClass}><EduvoraCommunity settings={websiteSettings} onClose={() => handleNavigateBack('home')}  isAuthenticated={isLoggedIn} /></div>;

    return (
       <ErrorBoundary>
         <div className={`font-sans ${currentView === 'home' ? 'desktop-home-performance' : ''} ${websiteSettings.animations.enabled ? '' : 'animations-off'}`}>
            <style>{`
              .animations-off .hub-animate {
                opacity: 1 !important;
                transform: none !important;
                animation: none !important;
              }
              @media (min-width: 1024px) {
                .desktop-home-performance .animate-pulse,
                .desktop-home-performance .animate-icon-float,
                .desktop-home-performance .animate-bounce,
                .desktop-home-performance .scroll-animate,
                .desktop-home-performance .stagger-animate-container > * {
                  animation: none !important;
                  transform: none !important;
                }
                .desktop-home-performance [class*="backdrop-blur"] {
                  -webkit-backdrop-filter: none !important;
                  backdrop-filter: none !important;
                }
              }
            `}</style>
            {/* Startup welcome overlay disabled. */}
                        {shouldShowMainPageBackButtonOnMobile && (
              <button
                type="button"
                onClick={() => handleNavigateBack('home')}
                aria-label="Back to home"
                className="fixed left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[1500] flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-white/95 text-xl font-black text-slate-950 shadow-[0_14px_40px_rgba(15,23,42,0.16)] backdrop-blur-2xl transition active:scale-95 md:hidden"
              >
                ←
              </button>
            )}
            <div className="mobile-site-header"><Header settings={websiteSettings} rememberedAccount={rememberedAuthAccount} wishlistCount={wishlist.length} cartItemCount={cartItemCount} cartToastMessage={cartToastMessage} onCartClick={openCartSidebar} onHomeClick={handleBackToHome} onNavigateToAllProducts={handleNavigateToAllProducts} onNavigateToPurchases={handleNavigateToPurchases} onNavigateToWishlist={handleNavigateToWishlist} onNavigateToProfile={handleNavigateToProfile} onNavigateToHomeAndScroll={handleNavigateToHomeAndScroll} currentUser={effectiveAppUser} isLoggedIn={isLoggedIn} onLogout={handleLogout} onAuthClick={openAuthPage} activeTheme={activeTheme} onThemeChange={setActiveTheme} /></div>
            {currentView !== 'admin' && currentView !== 'adminLogin' && (
              <div className={shouldHideMainDockOnMobile ? 'max-md:hidden' : ''}>
                <BottomGlassDock settings={websiteSettings} currentUser={effectiveAppUser} isLoggedIn={isLoggedIn} purchasedProducts={purchasedProducts} cartCount={cartItemCount} wishlistCount={wishlist.length} onHomeClick={handleBackToHome} onOpenBlogModal={() => openReadingHub('blog')} onOpenFreeModal={handleNavigateToFreeProducts} onOpenAnnouncementsModal={() => openReadingHub('news')} onNavigateToAllProducts={handleNavigateToAllProducts} onNavigateToWishlist={handleNavigateToWishlist} onNavigateToPurchases={handleNavigateToPurchases} onCartClick={openCartSidebar} onProfileClick={handleNavigateToProfile} authButtonLabel={authButtonLabel} onSubscriptionClick={handleNavigateToSubscription} onOpenCommunity={() => { setCurrentView('community'); window.scrollTo(0, 0); }} />
              </div>
            )}
            <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} cartItems={cartDetails} onUpdateQuantity={handleUpdateCartQuantity} onRemoveItem={handleRemoveFromCart} onViewProduct={handleViewProduct} onCheckout={handleInitiateCheckout} onApplyCoupon={handleApplyCartCoupon} appliedCoupon={appliedCartCoupon} couponError={cartCouponError} onRemoveCoupon={() => { setAppliedCartCoupon(null); setCartCouponError(null); }} coinBalance={cartUserCoinBalance} coinRedeemRate={eduCoinRedeemRate} applyEduCoins={applyCartEduCoins} onToggleEduCoins={setApplyCartEduCoins} appliedEduCoins={cartAppliedEduCoins} eduCoinDiscount={cartEduCoinDiscount} finalPrice={cartFinalPrice} />
            {isCartPaymentModalOpen && <PaymentModal settings={websiteSettings} economySettings={economySettings} cartItems={cartDetails} originalPrice={cartSubtotal} couponDiscount={cartCouponDiscount} finalPrice={cartFinalPrice} eduCoinDiscount={cartEduCoinDiscount} appliedEduCoins={cartAppliedEduCoins} coinRedeemRate={eduCoinRedeemRate} onClose={() => setIsCartPaymentModalOpen(false)} onConfirm={() => handleConfirmCartPurchase(appliedCartCoupon ? appliedCartCoupon.code : null, cartAppliedEduCoins)} currentUser={effectiveAppUser ? { ...effectiveAppUser, coinBalance: liveWalletBalance, eduCoins: liveWalletBalance } : effectiveAppUser} coinPrice={cartDetails.every(item => resolveCoinPrice(item.product.coinPrice, economySettings, 'product', item.product.id) > 0) ? cartDetails.reduce((total, item) => total + (resolveCoinPrice(item.product.coinPrice, economySettings, 'product', item.product.id) * item.quantity), 0) : 0} onConfirmWithCoins={handleConfirmCartCoinPurchase} onInsufficientCoins={handleInsufficientEduCoins} />}
            {isSubscriptionModalOpen && <SubscriptionSuccessModal isOpen={isSubscriptionModalOpen} onClose={() => setIsSubscriptionModalOpen(false)} email={subscribedEmail} products={topRatedProducts} onNavigateToAllProducts={() => { setIsSubscriptionModalOpen(false); handleNavigateToAllProducts(); }} />}
            <FreeProductsModal isOpen={isFreeModalOpen} onClose={() => setIsFreeModalOpen(false)} products={freeProducts} settings={websiteSettings} onAddToCart={handleAddToCart} onBuyNow={handleBuyNowProduct} onViewProduct={handleViewProductFromModal} />
            <ReadingDrawer settings={websiteSettings} economySettings={economySettings} isOpen={isReadingDrawerOpen} view={readingDrawerView} articles={websiteSettings.content.newsArticles} announcements={websiteSettings.content.announcements} listType={readingListType} selectedArticle={selectedArticle} selectedAnnouncement={selectedAnnouncement} currentUser={effectiveAppUser} onClose={closeReadingDrawer} onSelectArticle={handleViewBlogArticle} onSelectAnnouncement={handleViewAnnouncement} onBackToList={handleBackToReadingList} onExploreFeature={handleExploreReadingFeature} promoTitle="Explore premium learning resources" promoDescription="Jump from this reading session into the store to find notes, guides, and courses that match your next study sprint." promoCtaLabel="Explore Products" onReadingReward={handleReadingReward} />
            {coinToast && <div className="fixed bottom-24 left-1/2 z-[1400] -translate-x-1/2 rounded-full border border-amber-200/60 bg-white/80 px-5 py-3 text-sm font-black text-amber-700 shadow-[0_12px_40px_rgba(99,102,241,0.18)] backdrop-blur-2xl animate-fade-in-up">{coinToast}</div>}
            {isMobileCompletionModalOpen && effectiveAppUser && shouldAskForMobileCompletion() && (
              <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-[2rem] border border-blue-100 bg-white p-6 shadow-2xl">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-700">Complete profile</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950">Add your mobile number</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Google does not share your phone number. Add a 10 digit Indian mobile number to continue using your account for purchase support and profile-sensitive actions. No OTP or SMS verification is used.</p>
                  <div className="mt-5 flex overflow-hidden rounded-2xl border border-slate-300 bg-white focus-within:border-blue-700 focus-within:ring-4 focus-within:ring-blue-100">
                    <span className="bg-slate-100 px-4 py-3 font-bold text-slate-700">+91</span>
                    <input
                      value={mobileCompletionInput}
                      onChange={e => setMobileCompletionInput(e.target.value.replace(/\D/g, '').slice(-10))}
                      className="w-full bg-transparent px-4 py-3 outline-none"
                      placeholder="10 digit mobile"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      autoFocus
                    />
                  </div>
                  {mobileCompletionError && <p className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{mobileCompletionError}</p>}
                  <div className="mt-5">
                    <button type="button" disabled={isSavingMobileCompletion} onClick={async () => {
                      const normalizedMobile = getNormalizedMobile(mobileCompletionInput);
                      if (normalizedMobile.length !== 10) { setMobileCompletionError('Please enter a valid 10 digit mobile number.'); return; }
                      if (!effectiveAppUser || !auth.currentUser) return;
                      setIsSavingMobileCompletion(true); setMobileCompletionError('');
                      try {
                        await setDoc(doc(db, 'users', effectiveAppUser.id), { mobile: normalizedMobile, updatedAt: serverTimestamp() }, { merge: true });
                        mergeCompletedMobileIntoCurrentUser(normalizedMobile);
                        setIsMobileCompletionModalOpen(false);
                        setMobileCompletionInput('');
                        setMobileCompletionError('');
                      } catch (error) {
                        console.warn('Mobile profile completion failed.', error);
                        setMobileCompletionError('Could not save mobile number. Please try again.');
                      } finally { setIsSavingMobileCompletion(false); }
                    }} className="w-full rounded-2xl bg-gradient-to-r from-slate-950 to-blue-800 px-4 py-3 font-black text-white disabled:opacity-60">{isSavingMobileCompletion ? 'Saving...' : 'Save mobile'}</button>
                  </div>
                </div>
              </div>
            )}
            <main key={currentView} className={`${websiteSettings.animations.enabled ? appleOpenClass : ''} ${currentView === 'home' ? 'mobile-app-home' : ''}`}>{renderContent(effectiveAppUser)}</main>
            <div className="mobile-app-chrome"><InstallAppButton enabled={canShowInstallPrompt} /></div>
            {currentView === 'home' && (
              <div className={shouldHideFooterOnMobile ? 'max-md:hidden' : ''}>
                <Footer
                  settings={websiteSettings}
                  socialLinks={websiteSettings.content.socialLinks}
                  onAdminLoginClick={handleNavigateToAdminLogin}
                  onLoginClick={handleNavigateToAuth}
                  onNavigateToAllProducts={handleNavigateToAllProducts}
                  onNavigateToHomeAndScroll={handleNavigateToHomeAndScroll}
                  onNavigateToPolicies={handleNavigateToPolicies}
                  onSubscribe={handleSubscribe}
                />
              </div>
            )}
         </div>
       </ErrorBoundary>
    );
  }

  return (
      <ErrorBoundary>
        <style>{`.animations-off *:not(.welcome-overlay-safe):not(.welcome-overlay-safe *), .animations-off *:not(.welcome-overlay-safe):not(.welcome-overlay-safe *)::before, .animations-off *:not(.welcome-overlay-safe):not(.welcome-overlay-safe *)::after { animation: none !important; scroll-behavior: auto !important; } .animations-off .animate-child, .animations-off .scroll-animate, .animations-off .hub-animate { opacity: 1 !important; transform: none !important; } .animations-off *:not(.welcome-overlay-safe):not(.welcome-overlay-safe *) { transition-duration: 0.01ms !important; }`}</style>
        {networkBanner && <div className={`fixed left-1/2 top-3 z-[9999] w-[min(92vw,42rem)] -translate-x-1/2 rounded-2xl px-4 py-3 text-center text-sm font-black shadow-[0_18px_50px_rgba(15,23,42,0.22)] ${networkBanner.includes('back online') ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-950'}`}>{networkBanner}</div>}
        {renderPage()}
        {renderLatestUpdateCheckoutOverlay()}
        <ComingSoonModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title} message={infoModal?.message} icon={infoModal?.icon} />
      </ErrorBoundary>
  );
};

export default App;
