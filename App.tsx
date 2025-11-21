
// FIX: Corrected the React import statement by removing the erroneous 'a' and fixing the destructuring syntax.
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import ProductShowcase from './components/ProductShowcase';
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
import EbookReader from './components/EbookReader';
import PolicyPage from './components/PolicyPage';
import AuthPage from './components/auth/AuthPage';
import WishlistPage from './components/FavouritesPage';
import CartSidebar from './components/CartSidebar';
import QuickViewModal from './components/QuickViewModal';
import PaymentModal from './components/PaymentModal';
import UpcomingFeatures, { UpcomingFeatureItem } from './components/UpcomingFeatures';
import SubscriptionSuccessModal from './components/SubscriptionSuccessModal';
import LatestNews from './components/LatestNews';
import ComingSoonModal from './components/ComingSoonModal';
import BlogModal from './components/Prerequisites';
import { FreeProductsModal, AnnouncementsModal } from './components/ContentModals';
import AnnouncementDetail from './components/AnnouncementDetail';

// NOTE: Firebase imports removed to prevent "Service not available" crashes.
// The app now runs in "Local Mode" using browser storage.

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
          <div className="max-w-lg bg-white p-8 rounded-xl shadow-2xl border border-red-100">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-6">The application encountered an unexpected error. This is likely due to storage limits or a temporary glitch.</p>
            
            {this.state.error?.message && (
                <div className="bg-gray-100 p-3 rounded text-left mb-6 overflow-auto max-h-32 text-xs font-mono text-gray-700 border border-gray-200">
                    Error: {this.state.error.message}
                </div>
            )}

            <div className="flex flex-col gap-3">
                <button onClick={() => window.location.reload()} className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg hover:bg-gray-900 font-semibold transition-colors">
                Reload Page
                </button>
                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full bg-white border border-red-200 text-red-600 px-4 py-3 rounded-lg hover:bg-red-50 font-semibold transition-colors">
                Reset App Data (Fixes Storage Issues)
                </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">Warning: Resetting app data will clear all products and settings saved in your browser.</p>
          </div>
        </div>
      );
    }

    // FIX: Explicitly cast 'this' to any to avoid "Property 'props' does not exist" error in some TS environments
    return (this as any).props.children;
  }
}

// Safe LocalStorage Wrapper
const safeSetItem = (key: string, value: any) => {
    try {
        const serializedState = JSON.stringify(value);
        localStorage.setItem(key, serializedState);
    } catch (err: any) {
        console.error(`Error saving state to localStorage for key "${key}":`, err);
        // Check for quota exceeded error
        if (
            err.name === 'QuotaExceededError' || 
            err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
            err.code === 22
        ) {
             alert(`⚠️ Storage Full!\n\nThe browser cannot save more data. \n1. Try deleting old products or images.\n2. Use Image URLs instead of pasting images directly to save space.`);
        }
    }
};

// Interface for uploaded product files with specific types
export type ProductFileType = 'youtube' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'link' | 'ebook';
export interface ProductFile {
  id: string;
  name: string;
  type: ProductFileType;
  url: string; // For uploads, this is a Base64 data URL. For links, it's the URL.
  content?: string; // For rich text e-book content (HTML)
}

// Interface for a course module, now supporting nested modules
export interface CourseModule {
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
export interface User {
    id: number;
    email: string;
    password: string; // NOTE: In a real app, this should be hashed and never stored in plaintext.
    createdAt: string;
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

export interface Order {
    id: string;
    customerName: string;
    customerEmail: string;
    date: string;
    total: string;
    status: 'Pending' | 'Shipped' | 'Completed' | 'Cancelled';
    items: OrderItem[];
    shippingAddress: string;
    billingAddress: string;
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
}


// New E-book Reader settings, configurable from admin panel
export interface EbookReaderSettings {
    defaultTheme: 'light' | 'sepia' | 'dark' | 'slate' | 'green';
    defaultFontSize: number;
    defaultFontFamily: string;
    availableFonts: string[];
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
            primaryColor: '#02042b',
            accentColor: '#528ff0',
            backgroundColor: '#f9fafb',
            textColor: '#1f2937',
            textMutedColor: '#6b7280',
        },
    },
    midnight: {
        name: 'Midnight',
        palette: {
            primaryColor: '#38bdf8', // light-blue-400
            accentColor: '#6366f1', // indigo-500
            backgroundColor: '#0f172a', // slate-900
            textColor: '#e2e8f0', // slate-200
            textMutedColor: '#94a3b8', // slate-400
        },
    },
    sunset: {
        name: 'Sunset',
        palette: {
            primaryColor: '#f97316', // orange-600
            accentColor: '#f59e0b', // amber-500
            backgroundColor: '#fff7ed', // orange-50
            textColor: '#44403c', // stone-700
            textMutedColor: '#78716c', // stone-500
        },
    },
    forest: {
        name: 'Forest',
        palette: {
            primaryColor: '#16a34a', // green-600
            accentColor: '#22c55e', // green-500
            backgroundColor: '#f0fdf4', // green-50
            textColor: '#1e3a8a', // blue-900
            textMutedColor: '#4338ca', // indigo-700
        },
    },
    rose: {
        name: 'Rose',
        palette: {
            primaryColor: '#db2777', // pink-600
            accentColor: '#e11d48', // rose-600
            backgroundColor: '#fff1f2', // rose-50
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
    content: {
        heroTitle: string;
        heroSubtitle: string;
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
    ebookReaderSettings: EbookReaderSettings;
}

// New Component for Blog Post Detail View
const BlogDetail: React.FC<{
  settings: WebsiteSettings;
  article: NewsArticle;
  onBack: () => void;
}> = ({ settings, article, onBack }) => {
  return (
    <div className="bg-background min-h-screen font-sans animate-fade-in">
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary truncate">Catalyst Blog</h1>
          <button
            onClick={onBack}
            className="bg-primary text-white font-semibold px-6 py-2 rounded-lg hover:opacity-90 transition-colors duration-300"
          >
            &larr; Back to Blog List
          </button>
        </div>
      </header>
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto bg-white p-8 sm:p-12 rounded-lg shadow-lg animate-fade-in-up">
          <div className="mb-8 border-b pb-6">
            <p className="text-sm font-semibold text-primary tracking-widest uppercase">{article.category}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-primary mt-2">{article.title}</h2>
            <p className="text-sm text-text-muted mt-4">
              Published on {new Date(article.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden mb-8 shadow-inner">
            <img src={`https://picsum.photos/seed/${article.imageSeed}/1200/675`} alt={article.title} className="w-full h-full object-cover" />
          </div>
          
          <div className="text-lg text-text leading-relaxed space-y-6">
            {article.content.split('\n').filter(p => p.trim() !== '').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};


const initialProducts: Product[] = [
  {
    id: 1,
    imageSeed: "ebook-marketing",
    images: [
        "https://picsum.photos/seed/digital-marketing-ebook-cover/800/600", 
        "https://picsum.photos/seed/marketing-analytics-dashboard/800/600",
        "https://picsum.photos/seed/social-media-strategy-mindmap/800/600",
        "https://picsum.photos/seed/seo-keyword-planner/800/600"
    ],
    title: "The Ultimate Marketing Guide",
    description: "A comprehensive e-book covering everything from SEO to social media marketing.",
    longDescription: "Unlock the secrets of digital marketing with this all-in-one guide. Perfect for beginners and seasoned marketers alike, this e-book provides actionable strategies for social media engagement, search engine optimization (SEO), content creation, email marketing, and analytics. Grow your audience and boost your sales with proven techniques.",
    features: ["In-depth SEO strategies", "Social Media content calendar", "Email marketing templates", "Analytics and tracking guide", "150+ pages of expert advice"],
    price: "₹499",
    salePrice: "₹299",
    category: "E-books",
    department: 'Unisex',
    inStock: true,
    isVisible: true,
    manualRating: 5,
    sku: "EBOOK-MARK-001",
    tags: ["seo", "marketing", "social media"],
    dimensions: "152 pages",
    fileFormat: "PDF",
    aspectRatio: "aspect-[3/4]",
    paymentLink: "https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view",
    wishlistCount: 243,
    viewCount: 1054,
    priceHistory: [
      { date: '2024-07-20', price: 499 },
      { date: '2024-07-21', price: 499 },
      { date: '2024-07-22', price: 450 },
      { date: '2024-07-23', price: 450 },
      { date: '2024-07-24', price: 399 },
      { date: '2024-07-25', price: 399 },
      { date: '2024-07-26', price: 299 },
    ],
    courseContent: [
      {
        id: 'mod-marketing-1',
        title: 'Module 1: Introduction to Digital Marketing',
        files: [
          {
            id: 'file-pdf-1',
            name: 'The Ultimate Marketing Guide.pdf',
            type: 'pdf',
            // In a real app, this would be a secure URL, not base64.
            // This is a placeholder for demonstration.
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' 
          }
        ],
        modules: []
      }
    ],
  },
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
  {
    id: 3,
    imageSeed: "seo-notes",
    images: [
        "https://picsum.photos/seed/seo-optimization-checklist/800/600",
        "https://picsum.photos/seed/website-audit-report/800/600",
        "https://picsum.photos/seed/google-search-console-graph/800/600",
        "https://picsum.photos/seed/technical-seo-flowchart/800/600"
    ],
    title: "SEO Checklist PDF",
    description: "A printable PDF checklist to optimize your website for search engines.",
    longDescription: "Never miss a crucial SEO step again. This printable checklist is your ultimate companion for website optimization. It covers everything from on-page SEO (meta tags, keywords) and technical SEO (site speed, mobile-friendliness) to off-page strategies (backlink building). It's the simplest way to ensure your website is primed to rank on Google.",
    features: ["On-Page SEO checklist", "Technical SEO audit points", "Off-Page SEO action plan", "Keyword research workflow", "Printable A4 format"],
    price: "₹3",
    isFree: true,
    category: "Digital Goods",
    department: 'Women',
    inStock: true,
    isVisible: true,
    manualRating: null,
    sku: "DIGI-SEO-CHK-001",
    tags: ["seo", "checklist", "website optimization"],
    dimensions: "8 pages",
    fileFormat: "PDF",
    aspectRatio: "aspect-square",
    paymentLink: "https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view",
    wishlistCount: 56,
    viewCount: 420,
    courseContent: [],
  },
  {
    id: 4,
    imageSeed: "advanced-seo-ebook",
    images: [
        "https://picsum.photos/seed/advanced-seo-book-cover/800/600", 
        "https://picsum.photos/seed/technical-seo-code/800/600",
        "https://picsum.photos/seed/structured-data-json/800/600",
        "https://picsum.photos/seed/international-seo-strategy/800/600"
    ],
    title: "Advanced SEO Techniques",
    description: "An e-book for experienced marketers looking to level up their SEO game.",
    longDescription: "Dive deep into the world of advanced search engine optimization. This e-book covers technical SEO, schema markup, international SEO, advanced link building, and algorithm analysis. It's designed for marketers who already have a solid foundation and want to achieve top rankings for competitive keywords.",
    features: ["Technical SEO deep dive", "Schema and structured data", "International & multilingual SEO", "Advanced backlink analysis", "Algorithm update preparation"],
    price: "₹799",
    salePrice: "₹599",
    category: "E-books",
    department: 'Unisex',
    inStock: true,
    isVisible: true,
    manualRating: 4.8,
    sku: "EBOOK-SEO-ADV-002",
    tags: ["seo", "marketing", "technical seo"],
    dimensions: "210 pages",
    fileFormat: "E-book",
    aspectRatio: "aspect-[3/4]",
    paymentLink: "https://pages.razorpay.com/pl_RIfTCxnYj73xqE/view",
    wishlistCount: 120,
    viewCount: 650,
    priceHistory: [
      { date: '2024-07-20', price: 799 },
      { date: '2024-07-21', price: 799 },
      { date: '2024-07-22', price: 799 },
      { date: '2024-07-23', price: 699 },
      { date: '2024-07-24', price: 699 },
      { date: '2024-07-25', price: 599 },
      { date: '2024-07-26', price: 599 },
    ],
    courseContent: [
      {
        id: 'mod-adv-seo-1',
        title: 'Chapter 1: The Evolution of SEO',
        files: [
          {
            id: 'file-ebook-1',
            name: 'The Ever-Changing Landscape',
            type: 'ebook',
            url: '', // Not needed for 'ebook' type with content
            content: `<h2>The Ever-Changing Landscape</h2><p>Search Engine Optimization (SEO) is not a static field. What worked five years ago might be obsolete today. Google's algorithms are constantly evolving, becoming more sophisticated in their quest to understand user intent and deliver the most relevant, high-quality results. <strong>This chapter explores that evolution.</strong></p><h3>From Keywords to Concepts</h3><p>Early SEO was heavily focused on keyword density. The more times you repeated a keyword, the more relevant your page was considered. This led to practices like <em>keyword stuffing</em>, which created a poor user experience.</p><ul><li>Initial algorithms were simple text-based crawlers.</li><li>The introduction of PageRank revolutionized search by considering backlinks.</li><li>Modern SEO is about topical authority, user experience, and semantic search.</li></ul><p>Understanding this history is crucial for developing a forward-thinking SEO strategy that can adapt to future changes.</p>`
          }
        ],
        modules: []
      }
    ],
  },
];

const initialReviews: { [productId: number]: Review[] } = {
    1: [
        { name: 'Rohan Sharma', rating: 5, comment: 'This guide was a game-changer for my business. Easy to follow and packed with value!', date: '2 weeks ago' },
        { name: 'Priya Patel', rating: 4, comment: 'Very informative and well-structured. I learned a lot.', date: '1 month ago' },
    ],
    2: [
        { name: 'Amit Singh', rating: 5, comment: 'Absolutely the best dropshipping course out there. Worth every penny!', date: '3 days ago' },
    ],
    4: [
      { name: 'Sneha Verma', rating: 5, comment: 'Finally, an SEO book that goes beyond the basics. Highly recommended!', date: '1 week ago'},
      { name: 'Rajesh Kumar', rating: 4, comment: 'Good content, but some parts are very technical. A great resource nonetheless.', date: '2 weeks ago'}
    ]
};

const initialCoupons: Coupon[] = [
    { id: 1, code: 'SUMMER25', type: 'percentage', value: 25, expiryDate: '2025-12-31', isActive: true, usageLimit: 100, timesUsed: 42 },
    { id: 2, code: 'WELCOME500', type: 'fixed', value: 500, expiryDate: '2024-12-31', isActive: true, usageLimit: 500, timesUsed: 150 },
    { id: 3, code: 'MONSOON10', type: 'percentage', value: 10, expiryDate: '2025-12-31', isActive: true, usageLimit: 200, timesUsed: 198 },
    { id: 4, code: 'FLAT150', type: 'fixed', value: 150, expiryDate: '2025-01-01', isActive: true, usageLimit: 1000, timesUsed: 0 },
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
    { 
        id: 'DC-1023', 
        customerName: 'Priya Patel', 
        customerEmail: 'priya.p@example.com', 
        date: '2024-07-20', 
        total: '₹299', 
        status: 'Pending', 
        items: [{ id: 1, name: 'The Ultimate Marketing Guide', quantity: 1, price: '₹299' }],
        shippingAddress: 'N/A (Digital Product)',
        billingAddress: '456 Commerce Rd, Mumbai, MH 400050',
    },
    { 
        id: 'DC-1022', 
        customerName: 'Amit Singh', 
        customerEmail: 'amit.singh@example.com', 
        date: '2024-07-20', 
        total: '₹898', 
        status: 'Pending', 
        items: [
            { id: 1, name: 'The Ultimate Marketing Guide', quantity: 1, price: '₹299' },
            { id: 4, name: 'Advanced SEO Techniques', quantity: 1, price: '₹599' },
        ],
        shippingAddress: 'N/A (Digital Product)',
        billingAddress: '789 Business Ave, New Delhi, DL 110001',
    },
    { 
        id: 'DC-1021', 
        customerName: 'Sneha Verma', 
        customerEmail: 'sneha.v@example.com', 
        date: '2024-07-19', 
        total: '₹3', 
        status: 'Pending', 
        items: [{ id: 3, name: 'SEO Checklist PDF', quantity: 1, price: '₹3' }],
        shippingAddress: 'N/A (Digital Product)',
        billingAddress: '101 Innovation Hub, Pune, MH 411007',
    },
    { 
        id: 'DC-1020', 
        customerName: 'Vikram Rathore', 
        customerEmail: 'vikram.r@example.com', 
        date: '2024-07-18', 
        total: '₹2298', 
        status: 'Cancelled', 
        items: [
            { id: 2, name: 'Dropshipping Masterclass', quantity: 1, price: '₹1999' },
            { id: 1, name: 'The Ultimate Marketing Guide', quantity: 1, price: '₹299' },
        ],
        shippingAddress: 'N/A (Digital Product)',
        billingAddress: '212 Startup Lane, Hyderabad, TS 500081',
    },
];

const initialSupportTickets: SupportTicket[] = [
    { 
        id: 'TKT-781A', 
        customerName: 'Priya Patel', 
        customerEmail: 'priya.p@example.com', 
        subject: 'Issue with E-book Download', 
        message: "Hello, I purchased 'The Ultimate Marketing Guide' but I'm having trouble downloading the file. The link seems to be broken. Can you please help?",
        date: '2024-07-21T10:30:00Z', 
        status: 'Open' 
    },
    { 
        id: 'TKT-780B', 
        customerName: 'Amit Singh', 
        customerEmail: 'amit.singh@example.com', 
        subject: 'Question about Dropshipping Course', 
        message: "Hi, I'm interested in the Dropshipping Masterclass. Does it cover international suppliers, specifically from Europe? Thanks!",
        date: '2024-07-20T14:00:00Z', 
        status: 'Open' 
    },
    { 
        id: 'TKT-779C', 
        customerName: 'Rohan Sharma', 
        customerEmail: 'rohan.s@example.com', 
        subject: 'Refund Request', 
        message: "I accidentally purchased the SEO checklist twice. Could I please get a refund for the duplicate order? My order ID is DC-1022.",
        date: '2024-07-19T09:15:00Z', 
        status: 'Resolved' 
    },
];

const initialNewsArticles: NewsArticle[] = [
  {
    id: 1,
    imageSeed: "futuristic-seo-trends",
    category: "SEO",
    title: "Top 5 SEO Trends to Watch in 2025",
    excerpt: "Google's algorithm is constantly evolving. Stay ahead of the competition by understanding the key trends that will shape search engine optimization next year.",
    date: "2024-07-28",
    content: "In the ever-shifting landscape of digital marketing, staying ahead of SEO trends is not just an advantage; it's a necessity. As we look towards 2025, several key developments are set to redefine how we approach search engine optimization.\n\nFirst, the rise of AI-driven search, like Google's Search Generative Experience (SGE), will continue to mature. This means a greater emphasis on providing direct, comprehensive answers within the search results themselves. Content creators will need to focus on creating authoritative, well-structured information that can be easily parsed and presented by AI.\n\nSecond, voice search and conversational queries are becoming more prevalent. Optimizing for natural language and long-tail keywords that mimic how people speak will be crucial. Think 'What are the best digital marketing strategies for a small business?' rather than just 'digital marketing small business'.\n\nThird, visual search is gaining traction. Tools like Google Lens are changing how users find information. This requires high-quality, well-tagged images and a solid image SEO strategy, including descriptive alt text and file names.\n\nFourth, Core Web Vitals and overall user experience (UX) remain a top priority for Google. A fast, mobile-friendly, and easy-to-navigate website is non-negotiable. Page speed, interactivity, and visual stability are direct ranking factors.\n\nFinally, building topical authority is more important than ever. Instead of focusing on single keywords, businesses should aim to create comprehensive content hubs that cover a subject in depth. This signals expertise and trustworthiness to both users and search engines, establishing your brand as a go-to resource in your niche."
  },
  {
    id: 2,
    imageSeed: "ecommerce-conversion-funnel",
    category: "E-commerce",
    title: "The Psychology of Online Shopping: How to Convert More Customers",
    excerpt: "Discover the psychological triggers that motivate users to buy. We break down the science behind high-converting product pages and checkout processes.",
    date: "2024-07-25",
    content: "Full content for e-commerce psychology. This article would delve into concepts like social proof, scarcity, urgency, and the power of color and imagery in influencing purchasing decisions."
  },
  {
    id: 3,
    imageSeed: "ai-writing-robot",
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
        primaryColor: '#02042b',
        accentColor: '#528ff0',
        backgroundColor: '#f9fafb', // gray-50
        textColor: '#1f2937', // gray-800
        textMutedColor: '#6b7280', // gray-500
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
        { id: 'faq', visible: true },
    ],
    features: {
        showFavourites: true,
        showReviews: true,
        showSaleBadges: true,
    },
    content: {
        heroTitle: "Elevate Your Digital Presence",
        heroSubtitle: "We provide top-tier digital products, marketing services, and e-commerce solutions to help you grow your business online. From e-books to SEO, we've got you covered.",
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
    ebookReaderSettings: {
        defaultTheme: 'light',
        defaultFontSize: 18,
        defaultFontFamily: 'serif',
        availableFonts: ['serif', 'sans-serif', 'lato', 'lora', 'roboto', 'merriweather'],
    },
};

const App: React.FC = () => {
  // Initialize products with default data immediately to prevent "white screen" or empty state
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<{ [productId: number]: Review[] }>({});
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [tickets, setTickets] = useState<SupportTicket[]>(initialSupportTickets);
  const [currentView, setCurrentView] = useState('home'); 
  const [selectedProduct, setSelectedProduct] = useState<ProductWithRating | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [purchasedProductIds, setPurchasedProductIds] = useState<number[]>([]);
  const [scrollToSection, setScrollToSection] = useState<string | null>(null);
  const [scrollToPolicySection, setScrollToPolicySection] = useState<string | null>(null);
  const [scrollToProductSection, setScrollToProductSection] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>(initialAdminUsers);
  const [currentAdminUser, setCurrentAdminUser] = useState<AdminUser | null>(null);
  const [productToBuyAfterLogin, setProductToBuyAfterLogin] = useState<ProductWithRating | null>(null);
  const [autoOpenPaymentModalFor, setAutoOpenPaymentModalFor] = useState<number | null>(null);
  
  const [websiteSettings, setWebsiteSettings] = useState<WebsiteSettings>(defaultWebsiteSettings);
  
  // New E-commerce State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<ProductWithRating | null>(null);
  const [cartToastMessage, setCartToastMessage] = useState('');
  const [isCartPaymentModalOpen, setIsCartPaymentModalOpen] = useState(false);
  const [appliedCartCoupon, setAppliedCartCoupon] = useState<Coupon | null>(null);
  const [cartCouponError, setCartCouponError] = useState<string | null>(null);

  // Subscription Modal State
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [subscribedEmail, setSubscribedEmail] = useState('');

  // Unified Info Modal State
  const [infoModal, setInfoModal] = useState<{ title: string; message: string; icon: string; } | null>(null);
  
  // New Large Content Modal States
  const [isBlogModalOpen, setIsBlogModalOpen] = useState(false);
  const [isFreeModalOpen, setIsFreeModalOpen] = useState(false);
  const [isAnnouncementsModalOpen, setIsAnnouncementsModalOpen] = useState(false);
  
  // User Theme State
  const [activeTheme, setActiveTheme] = useState<ThemeName>('default');


  // --- Data Loading and Persistence ---
  
  // --- SWITCHED TO LOCAL STORAGE MODE ---
  // Removed Firebase onSnapshot listener to prevent crashes.
  // Now loading products from localStorage or falling back to initialProducts.
  useEffect(() => {
    try {
      const storedProducts = localStorage.getItem('siteProducts');
      if (storedProducts) {
          setProducts(JSON.parse(storedProducts));
      } else {
          setProducts(initialProducts);
      }
    } catch (err) {
      console.error("Error loading products from localStorage:", err);
      setProducts(initialProducts);
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
    
    const storedPurchases = localStorage.getItem('purchasedProducts');
    if (storedPurchases) setPurchasedProductIds(JSON.parse(storedPurchases));

    const storedCart = localStorage.getItem('shoppingCart');
    if (storedCart) setCart(JSON.parse(storedCart));

    const storedUsers = localStorage.getItem('siteUsers');
    const loadedUsers: User[] = storedUsers ? JSON.parse(storedUsers) : [];
    setUsers(loadedUsers);
    
    const storedAdminUsers = localStorage.getItem('adminUsers');
    if (storedAdminUsers) setAdminUsers(JSON.parse(storedAdminUsers)); else setAdminUsers(initialAdminUsers);

    const storedSettings = localStorage.getItem('websiteSettings');
    if (storedSettings) setWebsiteSettings(JSON.parse(storedSettings));
    
    const storedCoupons = localStorage.getItem('siteCoupons');
    if (storedCoupons) setCoupons(JSON.parse(storedCoupons)); else setCoupons(initialCoupons);
    
    const storedOrders = localStorage.getItem('siteOrders');
    if (storedOrders) setOrders(JSON.parse(storedOrders)); else setOrders(initialOrders);

    const storedTickets = localStorage.getItem('siteSupportTickets');
    if (storedTickets) setTickets(JSON.parse(storedTickets)); else setTickets(initialSupportTickets);

    const storedCurrentUser = localStorage.getItem('currentUser');
    if (storedCurrentUser) {
        try {
            const currentUserData: User = JSON.parse(storedCurrentUser);
            const userIsValid = loadedUsers.some(user => user.id === currentUserData.id);
            if (userIsValid) setCurrentUser(currentUserData);
            else localStorage.removeItem('currentUser');
        } catch (error) {
            console.error("Error parsing current user:", error);
            localStorage.removeItem('currentUser');
        }
    }
    
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
    root.style.setProperty('--style-shadow-lg', shadows[adminTheme.shadowIntensity === 'light' ? 'medium' : 'heavy']);
    root.style.setProperty('--style-shadow-xl', shadows[adminTheme.shadowIntensity === 'heavy' ? 'heavy' : 'heavy']);

  }, [websiteSettings.theme, activeTheme]);

  const handleWebsiteSettingsUpdate = (newSettings: WebsiteSettings) => {
    // When admin saves, we don't want to override user's theme choice,
    // so we merge admin settings with the default theme palette.
    const mergedSettings = {
        ...newSettings,
        theme: {
            ...newSettings.theme,
            ...themes.default.palette,
        }
    };
    setWebsiteSettings(mergedSettings);
    safeSetItem('websiteSettings', mergedSettings);
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

  const productsWithRatings: ProductWithRating[] = products.map(p => {
    const { rating: calculatedRating, reviewCount } = calculateAverageRating(p.id);
    const displayRating = (p.manualRating !== null && p.manualRating !== undefined) ? p.manualRating : calculatedRating;
    return { ...p, rating: displayRating, reviewCount, calculatedRating };
  });

  const visibleProducts = productsWithRatings.filter(p => p.isVisible !== false);
  const topRatedProducts = [...visibleProducts].sort((a, b) => b.rating - a.rating).slice(0, 3);
  const purchasedProducts = productsWithRatings.filter(p => purchasedProductIds.includes(p.id));
  const wishlistProducts = visibleProducts.filter(p => wishlist.includes(p.id));
  const freeProducts = visibleProducts.filter(p => p.isFree);

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

  // --- Cart Handlers ---
  const handleAddToCart = (productId: number, quantity: number = 1) => {
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
      const product = products.find(p => p.id === productId);
      if (product) {
          setCartToastMessage(`'${product.title}' added to cart!`);
          setTimeout(() => setCartToastMessage(''), 3000);
      }
      setIsCartOpen(true);
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

  const handleInitiateCheckout = () => {
    if (cart.length === 0) return;
    setIsCartPaymentModalOpen(true);
    setIsCartOpen(false);
  };

  const handleConfirmCartPurchase = (appliedCouponCode: string | null) => {
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
      const finalPrice = currentCartSubtotal - finalDiscount;
      // --- End of recalculation ---

      const newPurchasedIds = [...new Set([...purchasedProductIds, ...cart.map(item => item.productId)])];
      setPurchasedProductIds(newPurchasedIds);
      safeSetItem('purchasedProducts', newPurchasedIds);

      if (appliedCouponCode) {
        setCoupons(prev => prev.map(c => c.code === appliedCouponCode ? { ...c, timesUsed: c.timesUsed + 1 } : c));
      }
      
      const newOrderItems: OrderItem[] = cartDetails.map(item => ({
        id: item.product.id,
        name: item.product.title,
        quantity: item.quantity,
        price: item.product.salePrice || item.product.price
      }));

      const newOrder: Order = {
        id: `DC-${Date.now()}`,
        customerName: currentUser?.email.split('@')[0] || 'Valued Customer',
        customerEmail: currentUser?.email || 'customer@example.com',
        date: new Date().toISOString().split('T')[0],
        total: `₹${finalPrice.toFixed(2)}`,
        status: 'Completed',
        items: newOrderItems,
        shippingAddress: 'N/A (Digital Product)',
        billingAddress: '123 E-commerce St, Web City, WC 54321'
      };
      setOrders(prevOrders => [newOrder, ...prevOrders]);

      const firstCartItemProduct = productsWithRatings.find(p => p.id === cart[0].productId);
      setSelectedProduct(firstCartItemProduct || null);

      setCart([]);
      setAppliedCartCoupon(null);
      setCartCouponError(null);
      setIsCartPaymentModalOpen(false);
      setCurrentView('congratulations');
      window.scrollTo(0, 0);
  };

  const cartDetails = cart.map(item => {
    const product = productsWithRatings.find(p => p.id === item.productId);
    return product ? { ...item, product } : null;
  }).filter((i): i is { product: ProductWithRating } & CartItem => i !== null);

  const cartSubtotal = cartDetails.reduce((acc, item) => {
    const priceStr = item.product.salePrice || item.product.price;
    const price = parseFloat(priceStr.replace('₹', ''));
    return acc + (price * item.quantity);
  }, 0);

  const calculateDiscount = (coupon: Coupon, price: number): number => {
    if (coupon.type === 'fixed') return Math.min(coupon.value, price);
    if (coupon.type === 'percentage') return (price * coupon.value) / 100;
    return 0;
  };
  
  const cartCouponDiscount = appliedCartCoupon ? calculateDiscount(appliedCartCoupon, cartSubtotal) : 0;
  const cartFinalPrice = cartSubtotal - cartCouponDiscount;

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

  // --- Auth Handlers ---
  const handleLogin = (email: string, password: string): boolean => {
      const user = users.find(u => u.email === email && u.password === password);
      if (user) {
          setCurrentUser(user);
          safeSetItem('currentUser', user);

          if (productToBuyAfterLogin) {
              setSelectedProduct(productToBuyAfterLogin);
              setCurrentView('product');
              setAutoOpenPaymentModalFor(productToBuyAfterLogin.id);
              setProductToBuyAfterLogin(null);
          } else {
              setCurrentView('home');
          }
          return true;
      }
      return false;
  };

  const handleSignup = (email: string, password: string): { success: boolean, message: string } => {
      if (users.some(u => u.email === email)) {
          return { success: false, message: 'An account with this email already exists.' };
      }
      const newUser: User = { id: Date.now(), email, password, createdAt: new Date().toISOString() };
      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);
      safeSetItem('siteUsers', updatedUsers);
      handleLogin(email, password);
      return { success: true, message: 'Account created successfully!' };
  };

  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('currentUser');
      setCurrentView('home');
  };
  
  const handleBackToHome = () => {
    if (currentView === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    else {
      setCurrentView('home');
      setSelectedProduct(null);
      window.scrollTo(0, 0);
    }
  };

  const handleBackFromAuth = () => {
    if (productToBuyAfterLogin) {
      setSelectedProduct(productToBuyAfterLogin);
      setCurrentView('product');
      setProductToBuyAfterLogin(null);
    } else {
      handleBackToHome();
    }
  };

  const handleNavigateToAuth = () => setCurrentView('auth');

  const handleLoginRequired = (product: ProductWithRating) => {
    setProductToBuyAfterLogin(product);
    setCurrentView('auth');
    window.scrollTo(0,0);
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
        name: currentUser?.email.split('@')[0] || 'Customer',
        date: 'Just now'
    };
    const updatedReviews = { ...reviews, [productId]: [newReview, ...(reviews[productId] || [])] };
    setReviews(updatedReviews);
    safeSetItem('productReviews', updatedReviews);
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
  
  const handleViewProductFromModal = (product: ProductWithRating) => {
    setIsBlogModalOpen(false);
    setIsFreeModalOpen(false);
    setIsAnnouncementsModalOpen(false);
    handleViewProduct(product);
  };
  
  const handleViewPurchasedProduct = (product: ProductWithRating) => {
    setSelectedProduct(product);
    if (product.category === 'E-books') {
        setCurrentView('ebookReader');
    } else {
        setCurrentView('coursePlayer');
    }
    window.scrollTo(0, 0);
  };

  const handlePurchaseComplete = (appliedCouponCode: string | null, quantity: number) => {
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
        const robustFinalPrice = preDiscountTotal - finalDiscount;

        const newPurchasedIds = [...new Set([...purchasedProductIds, selectedProduct.id])];
        setPurchasedProductIds(newPurchasedIds);
        safeSetItem('purchasedProducts', newPurchasedIds);

        const newOrder: Order = {
            id: `DC-${Date.now()}`,
            customerName: currentUser?.email.split('@')[0] || 'Valued Customer',
            customerEmail: currentUser?.email || 'customer@example.com',
            date: new Date().toISOString().split('T')[0],
            total: `₹${robustFinalPrice.toFixed(2)}`,
            status: 'Completed',
            items: [{
                id: selectedProduct.id,
                name: selectedProduct.title,
                quantity: quantity,
                price: selectedProduct.salePrice || selectedProduct.price
            }],
            shippingAddress: 'N/A (Digital Product)',
            billingAddress: '123 E-commerce St, Web City, WC 54321'
        };
        setOrders(prevOrders => [newOrder, ...prevOrders]);
    }
    if (appliedCouponCode) {
        setCoupons(prev => prev.map(c => c.code === appliedCouponCode ? { ...c, timesUsed: c.timesUsed + 1 } : c));
    }
    setCart([]); // Clear cart after single product purchase
    setCurrentView('congratulations');
    window.scrollTo(0, 0);
  };
  
  const handleNavigateToPolicies = (sectionId?: string) => {
    setCurrentView('policies');
    setScrollToPolicySection(sectionId || null);
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

  const handleNavigateToWishlist = () => {
    setCurrentView('wishlist');
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
    console.log(`Subscribing ${email} to the newsletter.`);
    setSubscribedEmail(email);
    setIsSubscriptionModalOpen(true);
    // In a real app, you would make an API call here to your backend.
  };

  const handleViewAnnouncement = (announcement: Announcement) => {
    setIsAnnouncementsModalOpen(false);
    setSelectedAnnouncement(announcement);
    setCurrentView('announcementDetail');
    window.scrollTo(0, 0);
  };

  const handleViewBlogArticle = (article: NewsArticle) => {
    setIsBlogModalOpen(false);
    setSelectedArticle(article);
    setCurrentView('blogDetail');
    window.scrollTo(0, 0);
  };

  const handleNavigateToAdminLogin = () => setCurrentView('adminLogin');
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

  // Product CRUD - Updated to use LocalStorage instead of Firebase to prevent crashes
  const handleAddProduct = async (product: Omit<Product, 'id'>) => {
      try {
          const newId = Date.now();
          const productWithId = { ...product, id: newId, manualRating: product.manualRating !== undefined ? product.manualRating : null };
          
          const updatedProducts = [...products, productWithId];
          setProducts(updatedProducts);
          safeSetItem('siteProducts', updatedProducts); // Save to LocalStorage
      } catch (e) {
          console.error("Error adding product: ", e);
          alert("Failed to add product locally.");
      }
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
      try {
            const updatedProducts = products.map(p => p.id === updatedProduct.id ? updatedProduct : p);
            setProducts(updatedProducts);
            safeSetItem('siteProducts', updatedProducts); // Save to LocalStorage
      } catch (e) {
          console.error("Error updating product: ", e);
          alert("Failed to update product.");
      }
  };

  const handleDeleteProduct = async (productId: number) => {
      try {
          const updatedProducts = products.filter(p => p.id !== productId);
          setProducts(updatedProducts);
          safeSetItem('siteProducts', updatedProducts); // Save to LocalStorage
          
          // Also clean up local reviews
          const updatedReviews = { ...reviews };
          delete updatedReviews[productId];
          setReviews(updatedReviews);
          safeSetItem('productReviews', updatedReviews);
      } catch (e) {
          console.error("Error deleting product: ", e);
          alert("Failed to delete product.");
      }
  };
  
  const handleDeleteUser = (userId: number) => {
    if (window.confirm("Delete this user? This cannot be undone.")) {
        const updatedUsers = users.filter(u => u.id !== userId);
        setUsers(updatedUsers);
        safeSetItem('siteUsers', updatedUsers);
    }
  };

  // --- RENDER LOGIC ---
  const renderHomePageContent = () => (
      <>
          {websiteSettings.layout.map(section => {
              if (!section.visible) return null;
              switch(section.id) {
                  case 'hero': return <Hero key={section.id} settings={websiteSettings} onNavigateToPolicies={() => handleNavigateToPolicies()} onNavigateToAllProducts={handleNavigateToAllProducts} onOpenBlogModal={() => setIsBlogModalOpen(true)} onOpenFreeModal={() => setIsFreeModalOpen(true)} onOpenAnnouncementsModal={() => setIsAnnouncementsModalOpen(true)} realMetrics={realMetrics} />;
                  case 'purchased': return purchasedProducts.length > 0 && <PurchasedProducts settings={websiteSettings} key={section.id} products={purchasedProducts} onViewPurchasedProduct={handleViewPurchasedProduct} />;
                  case 'topRated': return <FeaturedProducts settings={websiteSettings} key={section.id} title={section.title || "Top Rated Products"} products={topRatedProducts} onViewProduct={handleViewProduct} wishlist={wishlist} onToggleWishlist={handleToggleWishlist} onAddToCart={handleAddToCart} onQuickView={setQuickViewProduct} coupons={coupons} />;
                  case 'allProducts': return <ProductShowcase settings={websiteSettings} key={section.id} products={visibleProducts.filter(p => !purchasedProductIds.includes(p.id))} onViewProduct={handleViewProduct} wishlist={wishlist} onToggleWishlist={handleToggleWishlist} onAddToCart={handleAddToCart} onQuickView={setQuickViewProduct} coupons={coupons} />;
                  case 'services': return <Services settings={websiteSettings} key={section.id} services={websiteSettings.content.services} onNavigateToHomeAndScroll={handleNavigateToHomeAndScroll} />;
                  case 'news': return null;
                  case 'about': return <AboutUs settings={websiteSettings} key={section.id} title={websiteSettings.content.aboutUsTitle} text={websiteSettings.content.aboutUsText} imageSeed={websiteSettings.content.aboutUsImageSeed} />;
                  case 'trust': return <TrustBadges settings={websiteSettings} key={section.id} />;
                  case 'upcoming': return <UpcomingFeatures settings={websiteSettings} key={section.id} title={section.title || "What's Next?"} features={websiteSettings.content.upcomingFeatures} />;
                  case 'faq': return <Faq settings={websiteSettings} key={section.id} faqs={websiteSettings.content.faqs} />;
                  default: return null;
              }
          })}
      </>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'product': return selectedProduct && <ProductDetailPage settings={websiteSettings} product={selectedProduct} onBack={handleNavigateToAllProducts} onPurchase={(appliedCouponCode, quantity) => handlePurchaseComplete(appliedCouponCode, quantity)} isWishlisted={wishlist.includes(selectedProduct.id)} onToggleWishlist={handleToggleWishlist} reviews={reviews[selectedProduct.id] || []} onAddReview={(d) => handleAddReview(selectedProduct.id, d)} isLoggedIn={!!currentUser} onLoginRequired={() => handleLoginRequired(selectedProduct)} autoOpenPaymentModal={autoOpenPaymentModalFor === selectedProduct.id} onModalOpened={() => setAutoOpenPaymentModalFor(null)} coupons={coupons} scrollToSection={scrollToProductSection} onSectionScrolled={() => setScrollToProductSection(null)} onAddToCart={handleAddToCart} allProducts={productsWithRatings} onViewProduct={handleViewProduct} wishlist={wishlist} onQuickView={setQuickViewProduct} onGoHome={handleBackToHome} />;
      case 'coursePlayer': return selectedProduct && <CoursePlayer settings={websiteSettings} product={selectedProduct} onBack={handleNavigateToPurchases} />;
      case 'ebookReader': return selectedProduct && <EbookReader settings={websiteSettings} product={selectedProduct} onBack={handleNavigateToPurchases} />;
      case 'congratulations': return <Congratulations settings={websiteSettings} onBack={handleBackToHome} product={selectedProduct} reviews={selectedProduct ? reviews[selectedProduct.id] || [] : []} onAddReview={selectedProduct ? (d) => handleAddReview(selectedProduct.id, d) : () => {}} />;
      case 'allProducts': return <ProductShowcase settings={websiteSettings} products={visibleProducts.filter(p => !purchasedProductIds.includes(p.id))} onViewProduct={handleViewProduct} wishlist={wishlist} onToggleWishlist={handleToggleWishlist} onAddToCart={handleAddToCart} onQuickView={setQuickViewProduct} coupons={coupons} />;
      case 'myPurchases': return <PurchasedProducts settings={websiteSettings} products={purchasedProducts} onViewPurchasedProduct={handleViewPurchasedProduct} />;
      case 'wishlist': return <WishlistPage settings={websiteSettings} products={wishlistProducts} onViewProduct={handleViewProduct} wishlist={wishlist} onToggleWishlist={handleToggleWishlist} onNavigateToAllProducts={handleNavigateToAllProducts} onAddToCart={handleAddToCart} onQuickView={setQuickViewProduct} onClearWishlist={handleClearWishlist} coupons={coupons} />;
      case 'home': default: return renderHomePageContent();
    }
  };

  const renderPage = () => {
    if (currentView === 'policies') return <PolicyPage settings={websiteSettings} onBack={handleBackToHome} scrollToSection={scrollToPolicySection} onSectionScrolled={() => setScrollToPolicySection(null)} />;
    if (currentView === 'auth') return <AuthPage settings={websiteSettings} onLogin={handleLogin} onSignup={handleSignup} onBack={handleBackFromAuth} />;
    if (currentView === 'admin' && currentAdminUser) return <AdminDashboard websiteSettings={websiteSettings} onWebsiteSettingsChange={handleWebsiteSettingsUpdate} products={productsWithRatings} reviews={reviews} users={users} coupons={coupons} orders={orders} tickets={tickets} onTicketsUpdate={setTickets} onAddProduct={handleAddProduct} onUpdateProduct={handleUpdateProduct} onDeleteProduct={handleDeleteProduct} onDeleteUser={handleDeleteUser} onCouponsUpdate={setCoupons} onLogout={handleAdminLogout} onSwitchToHome={handleAdminSwitchToHome} adminUsers={adminUsers} currentAdminUser={currentAdminUser} onAdminUsersUpdate={(updatedUsers) => { setAdminUsers(updatedUsers); safeSetItem('adminUsers', updatedUsers); }} />;
    if (currentView === 'adminLogin') return <AdminLogin settings={websiteSettings} onLogin={handleAdminLogin} onBack={handleBackToHome} />;
    if (currentView === 'coursePlayer' || currentView === 'ebookReader') return renderContent();
    if (currentView === 'announcementDetail' && selectedAnnouncement) {
      return <AnnouncementDetail 
          settings={websiteSettings} 
          announcement={selectedAnnouncement} 
          onBack={() => {
              setCurrentView('home'); 
              setSelectedAnnouncement(null); 
              setIsAnnouncementsModalOpen(true);
          }} 
      />;
    }
    if (currentView === 'blogDetail' && selectedArticle) {
      return <BlogDetail 
          settings={websiteSettings} 
          article={selectedArticle} 
          onBack={() => {
              setCurrentView('home'); 
              setSelectedArticle(null); 
              setIsBlogModalOpen(true);
          }} 
      />;
    }

    return (
       <ErrorBoundary>
         <div className="font-sans">
            <Header settings={websiteSettings} wishlistCount={wishlist.length} cartItemCount={cartItemCount} cartToastMessage={cartToastMessage} onCartClick={() => setIsCartOpen(true)} onHomeClick={handleBackToHome} onNavigateToAllProducts={handleNavigateToAllProducts} onNavigateToPurchases={handleNavigateToPurchases} onNavigateToWishlist={handleNavigateToWishlist} onNavigateToHomeAndScroll={handleNavigateToHomeAndScroll} currentUser={currentUser} onLogout={handleLogout} onLoginClick={handleNavigateToAuth} activeTheme={activeTheme} onThemeChange={setActiveTheme} />
            <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} cartItems={cartDetails} onUpdateQuantity={handleUpdateCartQuantity} onRemoveItem={handleRemoveFromCart} onViewProduct={handleViewProduct} onCheckout={handleInitiateCheckout} onApplyCoupon={handleApplyCartCoupon} appliedCoupon={appliedCartCoupon} couponError={cartCouponError} onRemoveCoupon={() => { setAppliedCartCoupon(null); setCartCouponError(null); }} />
            {quickViewProduct && <QuickViewModal settings={websiteSettings} product={quickViewProduct} onClose={() => setQuickViewProduct(null)} onAddToCart={handleAddToCart} onToggleWishlist={handleToggleWishlist} isWishlisted={wishlist.includes(quickViewProduct.id)} onViewFullDetails={() => { handleViewProduct(quickViewProduct); setQuickViewProduct(null); }} />}
            {isCartPaymentModalOpen && <PaymentModal settings={websiteSettings} cartItems={cartDetails} originalPrice={cartSubtotal} couponDiscount={cartCouponDiscount} finalPrice={cartFinalPrice} onClose={() => setIsCartPaymentModalOpen(false)} onConfirm={() => handleConfirmCartPurchase(appliedCartCoupon ? appliedCartCoupon.code : null)} />}
            {isSubscriptionModalOpen && <SubscriptionSuccessModal isOpen={isSubscriptionModalOpen} onClose={() => setIsSubscriptionModalOpen(false)} email={subscribedEmail} products={topRatedProducts} onNavigateToAllProducts={() => { setIsSubscriptionModalOpen(false); handleNavigateToAllProducts(); }} />}
            <ComingSoonModal isOpen={!!infoModal} onClose={() => setInfoModal(null)} title={infoModal?.title} message={infoModal?.message} icon={infoModal?.icon} />
            <BlogModal isOpen={isBlogModalOpen} onClose={() => setIsBlogModalOpen(false)} articles={websiteSettings.content.newsArticles} onReadMoreClick={handleViewBlogArticle} settings={websiteSettings} />
            <FreeProductsModal isOpen={isFreeModalOpen} onClose={() => setIsFreeModalOpen(false)} products={freeProducts} settings={websiteSettings} onAddToCart={handleAddToCart} onViewProduct={handleViewProductFromModal} />
            <AnnouncementsModal isOpen={isAnnouncementsModalOpen} onClose={() => setIsAnnouncementsModalOpen(false)} announcements={websiteSettings.content.announcements} settings={websiteSettings} onViewAnnouncement={handleViewAnnouncement} />
            <main>{renderContent()}</main>
            <Footer settings={websiteSettings} socialLinks={websiteSettings.content.socialLinks} onAdminLoginClick={handleNavigateToAdminLogin} onLoginClick={handleNavigateToAuth} onNavigateToAllProducts={handleNavigateToAllProducts} onNavigateToHomeAndScroll={handleNavigateToHomeAndScroll} onNavigateToPolicies={handleNavigateToPolicies} onSubscribe={handleSubscribe} />
         </div>
       </ErrorBoundary>
    );
  }

  return (
      <ErrorBoundary>
        {renderPage()}
      </ErrorBoundary>
  );
};

export default App;
