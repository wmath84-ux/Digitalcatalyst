import React, { useEffect, useState } from 'react';
import { Product, ProductWithRating, Review, User, Coupon, WebsiteSettings, Order, AdminUser, SupportTicket, NewsletterSubscriber } from '../../App';
import { EconomySettings } from '../../utils/economy';
import { isSupportTicketNeedsAttention } from '../../utils/communitySupportBadge.js';
import Sidebar from './Sidebar';
import ProductManagement from './ProductManagement';
import UserManagement from './UserManagement';
import OrderManagement from './OrderManagement';
import CouponManagement from './CouponManagement';
import SupportManagement from './SupportManagement';
import Analytics from './Analytics';
import AdminReviewManagement from './AdminReviewManagement';
import Reports from './Reports';
import WebsiteSettingsComponent from './WebsiteSettings';
import AdminManagement from './AdminManagement';
import NewsBlogManagement from './NewsBlogManagement';
import CoinEconomyManagement from './CoinEconomyManagement';
import NewsletterSubscribers from './NewsletterSubscribers';
import AdminPostManagement from './AdminPostManagement';
import AdminOverview from './AdminOverview';
import './adminShipNowPages.css';

interface AdminDashboardProps {
    products: ProductWithRating[];
    reviews: { [productId: number]: Review[] };
    users: User[];
    adminUsers: AdminUser[];
    currentAdminUser: AdminUser;
    coupons: Coupon[];
    orders: Order[];
    tickets: SupportTicket[];
    newsletterSubscribers: NewsletterSubscriber[];
    websiteSettings: WebsiteSettings;
    economySettings: EconomySettings;
    onAddProduct: (product: Omit<Product, 'id'>) => Promise<boolean>;
    onUpdateProduct: (product: Product) => Promise<boolean>;
    onDeleteProduct: (id: number) => Promise<boolean>;
    onDeleteUser: (id: string) => void;
    onDeleteAllUsers?: () => void;
    onAdminUsersUpdate: (users: AdminUser[]) => void;
    onCouponsUpdate: (coupons: Coupon[]) => void;
    onTicketsUpdate: (tickets: SupportTicket[]) => void;
    onSubscribersUpdate: (subscribers: NewsletterSubscriber[]) => void;
    onWebsiteSettingsChange: (settings: WebsiteSettings) => Promise<boolean>;
    onSwitchToHome: () => void;
}

export type AdminView = 'dashboard' | 'adminPosts' | 'economy' | 'products' | 'newsBlog' | 'reviews' | 'reports' | 'users' | 'admins' | 'orders' | 'coupons' | 'support' | 'subscribers' | 'analytics' | 'websiteSettings';

const ADMIN_VIEW_SESSION_KEY = 'eduvora.adminView.v1';
const ADMIN_VIEWS: AdminView[] = [
    'dashboard',
    'adminPosts',
    'economy',
    'products',
    'newsBlog',
    'reviews',
    'reports',
    'users',
    'admins',
    'orders',
    'coupons',
    'support',
    'subscribers',
    'analytics',
    'websiteSettings',
];

const readInitialAdminView = (): AdminView => {
    if (typeof window === 'undefined') return 'dashboard';
    const historyView = window.history.state?.dcAdminView;
    if (ADMIN_VIEWS.includes(historyView)) return historyView;
    try {
        const stored = window.sessionStorage.getItem(ADMIN_VIEW_SESSION_KEY);
        return ADMIN_VIEWS.includes(stored as AdminView) ? stored as AdminView : 'dashboard';
    } catch {
        return 'dashboard';
    }
};

const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
    const [currentView, setCurrentView] = useState<AdminView>(() => readInitialAdminView());
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isProductEditorOpen, setIsProductEditorOpen] = useState(false);
    const supportUnreadCount = props.tickets.filter((ticket) => isSupportTicketNeedsAttention(ticket)).length;
    const isProductEditorShellOpen = currentView === 'products' && isProductEditorOpen;

    useEffect(() => {
        if (currentView !== 'products') setIsProductEditorOpen(false);
    }, [currentView]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.sessionStorage.setItem(ADMIN_VIEW_SESSION_KEY, currentView);
        } catch {}
        window.history.replaceState({
            ...(window.history.state || {}),
            dcView: 'admin',
            dcAdminView: currentView,
            dcAppEntry: true,
        }, '', window.location.href);
    }, [currentView]);

    const renderView = () => {
        switch (currentView) {
            case 'adminPosts': return <AdminPostManagement />;
            case 'economy': return <CoinEconomyManagement economySettings={props.economySettings} products={props.products} websiteSettings={props.websiteSettings} />;
            case 'products': return <ProductManagement products={props.products} users={props.users} coupons={props.coupons} onAddProduct={props.onAddProduct} onUpdateProduct={props.onUpdateProduct} onDeleteProduct={props.onDeleteProduct} onEditorStateChange={setIsProductEditorOpen} />;
            case 'newsBlog': return <NewsBlogManagement settings={props.websiteSettings} onSettingsChange={props.onWebsiteSettingsChange} />;
            case 'reviews': return <AdminReviewManagement products={props.products} reviews={props.reviews} />;
            case 'reports': return <Reports products={props.products} reviews={props.reviews} orders={props.orders} users={props.users} tickets={props.tickets} />;
            case 'users': return <UserManagement users={props.users} onDeleteUser={props.onDeleteUser} onDeleteAllUsers={props.onDeleteAllUsers} />;
            case 'admins': return <AdminManagement adminUsers={props.adminUsers} currentAdminUser={props.currentAdminUser} onUpdateAdminUsers={props.onAdminUsersUpdate} />;
            case 'orders': return <OrderManagement orders={props.orders} />;
            case 'coupons': return <CouponManagement coupons={props.coupons} onUpdate={props.onCouponsUpdate} />;
            case 'support': return <SupportManagement tickets={props.tickets} onUpdate={props.onTicketsUpdate} />;
            case 'subscribers': return <NewsletterSubscribers subscribers={props.newsletterSubscribers} onUpdate={props.onSubscribersUpdate} />;
            case 'analytics': return <Analytics orders={props.orders} products={props.products} users={props.users} reviews={props.reviews} />;
            case 'websiteSettings': return <WebsiteSettingsComponent settings={props.websiteSettings} products={props.products} onSettingsChange={props.onWebsiteSettingsChange} />;
            case 'dashboard':
            default:
                return (
                    <AdminOverview
                        products={props.products}
                        reviews={props.reviews}
                        users={props.users}
                        orders={props.orders}
                        tickets={props.tickets}
                        currentAdminUser={props.currentAdminUser}
                        onNavigate={setCurrentView}
                    />
                );
        }
    }

    return (
        <>
            <style>{`
                .shipnow-admin-content { color: #111827; }
                .shipnow-admin-content thead th { background: #f9fafb; color: #6b7280; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.02em; }
                .shipnow-admin-content tbody td { border-color: #f3f4f6; }
                .shipnow-admin-content input, .shipnow-admin-content select, .shipnow-admin-content textarea { border-color: #e5e7eb; }
                .shipnow-admin-content input:focus, .shipnow-admin-content select:focus, .shipnow-admin-content textarea:focus { border-color: #111827; box-shadow: 0 0 0 3px rgba(0,0,0,0.08); outline: none; }
                .shipnow-admin-scrollbar { scrollbar-color: #d1d5db transparent; scrollbar-width: thin; }
                .shipnow-admin-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
                .shipnow-admin-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 999px; }
            `}</style>

            <div data-admin-shell="ADMIN_CLEAN_V2" className="min-h-screen w-full bg-[#f9fafb] font-sans">
                <div className="flex min-h-screen w-full">
                    <Sidebar
                        onNavigate={setCurrentView}
                        onSwitchToHome={props.onSwitchToHome}
                        currentView={currentView}
                        isOpen={isMobileSidebarOpen}
                        onClose={() => setIsMobileSidebarOpen(false)}
                        supportUnreadCount={supportUnreadCount}
                        adminEmail={props.currentAdminUser.email}
                    />

                    <div className="flex min-w-0 flex-1 flex-col bg-[#f9fafb]">
                        {/* Minimal mobile toggle - only when not editing product */}
                        {!isProductEditorShellOpen && (
                            <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[#e5e7eb] bg-white px-3 md:hidden">
                                <button type="button" aria-label="Open menu" onClick={() => setIsMobileSidebarOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl bg-black text-white">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                                </button>
                                <span className="text-[13px] font-black uppercase tracking-wide text-black">{currentView}</span>
                                <span className="ml-auto text-[10px] font-bold text-[#9ca3af]">Admin workspace</span>
                            </div>
                        )}

                        <main className="shipnow-admin-content shipnow-admin-scrollbar min-h-0 flex-1 overflow-x-hidden bg-[#f9fafb]">
                            <div className="w-full">
                                {currentView === 'analytics' ? renderView() : (
                                    <div data-admin-view={currentView} className="shipnow-admin-page-theme">
                                        {renderView()}
                                    </div>
                                )}
                            </div>
                        </main>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AdminDashboard;
