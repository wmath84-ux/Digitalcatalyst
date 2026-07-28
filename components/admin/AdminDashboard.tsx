
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
import { auth, db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import './adminShipNowPages.css'; // ADMIN_SHIPNOW_PAGES_THEME_V1

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

export type AdminView = 'dashboard' | 'firebaseAdmin' | 'adminPosts' | 'economy' | 'products' | 'newsBlog' | 'reviews' | 'reports' | 'users' | 'admins' | 'orders' | 'coupons' | 'support' | 'subscribers' | 'analytics' | 'websiteSettings';

const ADMIN_VIEW_SESSION_KEY = 'eduvora.adminView.v1';
const ADMIN_VIEWS: AdminView[] = [
    'dashboard',
    'firebaseAdmin',
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


const DashboardCard: React.FC<{ title: string; value: string | number; subtitle?: string; icon: React.ReactNode; gradient: string }> = ({ title, value, subtitle, icon, gradient }) => (
    <div className={`relative overflow-hidden rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-slate-900 sm:p-6 ${gradient} transform transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]`}>
        <div className="relative z-10">
            <p className="text-sm font-medium opacity-90 uppercase tracking-wider">{title}</p>
            <h3 className="mt-2 text-3xl font-extrabold sm:text-4xl">{value}</h3>
            {subtitle && <p className="text-xs mt-2 opacity-75 font-medium">{subtitle}</p>}
        </div>
        <div className="absolute -bottom-4 -right-4 opacity-20 text-black transform rotate-12 scale-150">
            {icon}
        </div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/80 backdrop-blur-xl opacity-10 rounded-full blur-2xl -mr-16 -mt-16"></div>
    </div>
);


const FirebaseAdminSetup: React.FC = () => {
    const [status, setStatus] = useState<{ uid: string; email: string; role: string; isAdmin: boolean; message: string }>({ uid: '', email: '', role: '', isAdmin: false, message: 'Checking Firebase admin session...' });

    const refresh = async () => {
        const user = auth.currentUser;

        if (!user) {
            setStatus({ uid: '', email: '', role: '', isAdmin: false, message: 'Firebase admin login required before uploading files.' });
            return;
        }

        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const role = userSnap.exists() ? String(userSnap.data().role || '') : '';
        const isAdmin = role === 'admin' || role === 'super_admin';

        setStatus({
            uid: user.uid,
            email: user.email || 'No email found',
            role: role || 'missing',
            isAdmin,
            message: isAdmin ? 'Firebase admin permission is ready for product uploads.' : `Your Firebase user is not marked as admin. Add role: admin in users/${user.uid}.`,
        });
    };

    useEffect(() => {
        void refresh();
    }, []);

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
            <div className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Firebase Admin Setup</p>
                <h1 className="mt-2 text-3xl font-black text-slate-900">Upload permission check</h1>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Product file uploads use Firebase Auth admin identity. Local admin login alone is not enough for Storage or Firestore writes.</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Firebase UID</p><p className="mt-1 break-all font-bold text-slate-900">{status.uid || 'Not signed in'}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Firebase Email</p><p className="mt-1 break-all font-bold text-slate-900">{status.email || 'Not signed in'}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Firestore Role</p><p className="mt-1 break-all font-bold text-slate-900">{status.role || 'missing'}</p></div>
                    <div className={`rounded-2xl p-4 ${status.isAdmin ? 'bg-emerald-50' : 'bg-rose-50'}`}><p className="text-xs font-black uppercase text-slate-500">Admin permission</p><p className={`mt-1 font-bold ${status.isAdmin ? 'text-emerald-700' : 'text-rose-700'}`}>{status.isAdmin ? 'PASS' : 'BLOCKED'}</p></div>
                </div>
                <div className={`mt-5 rounded-2xl p-4 text-sm font-bold ${status.isAdmin ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{status.message}</div>
                <button type="button" onClick={refresh} className="mt-5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">Refresh Firebase admin status</button>
            </div>
        </div>
    );
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
        } catch {
            // Admin navigation still works if storage is restricted.
        }
        window.history.replaceState({
            ...(window.history.state || {}),
            dcView: 'admin',
            dcAdminView: currentView,
            dcAppEntry: true,
        }, '', window.location.href);
    }, [currentView]);

    const viewMeta: Record<AdminView, { title: string; subtitle: string }> = {
        dashboard: { title: 'Dashboard', subtitle: 'Overview of your store operations' },
        firebaseAdmin: { title: 'Firebase Admin', subtitle: 'Verify Firebase permissions and upload access' },
        adminPosts: { title: 'Admin Post', subtitle: 'Publish and manage official community updates' },
        economy: { title: 'EduCoin Economy', subtitle: 'Control coin pricing and product economy' },
        products: { title: 'Products', subtitle: 'Create, update, and organize store products' },
        newsBlog: { title: 'News & Blog', subtitle: 'Manage articles, news, and blog content' },
        reviews: { title: 'Reviews', subtitle: 'Moderate customer ratings and feedback' },
        reports: { title: 'Reports', subtitle: 'Review store and product performance reports' },
        users: { title: 'Customers', subtitle: 'Manage registered customer accounts' },
        admins: { title: 'Admin Users', subtitle: 'Control administrator access and roles' },
        orders: { title: 'Orders', subtitle: 'Track purchases, payments, and fulfillment' },
        coupons: { title: 'Coupons', subtitle: 'Create and manage promotional offers' },
        support: { title: 'Support', subtitle: 'Respond to customer and community requests' },
        subscribers: { title: 'Subscribers', subtitle: 'Manage newsletter subscribers' },
        analytics: { title: 'Analytics', subtitle: 'Measure store, audience, and sales activity' },
        websiteSettings: { title: 'Store Config', subtitle: 'Configure storefront content and behavior' },
    };

    const currentViewMeta = viewMeta[currentView];

    const renderView = () => {
        switch (currentView) {
            case 'firebaseAdmin': return <FirebaseAdminSetup />;
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
            case 'dashboard': default:
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
                .shipnow-admin-content {
                    color: #202124;
                }
                .shipnow-admin-content table {
                    border-collapse: separate;
                    border-spacing: 0;
                }
                .shipnow-admin-content thead th {
                    background: #faf9f9;
                    color: #777176;
                    font-size: 0.7rem;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                    text-transform: none;
                }
                .shipnow-admin-content tbody td {
                    border-color: #f0eded;
                }
                .shipnow-admin-content input,
                .shipnow-admin-content select,
                .shipnow-admin-content textarea {
                    border-color: #e5e1e1;
                }
                .shipnow-admin-content input:focus,
                .shipnow-admin-content select:focus,
                .shipnow-admin-content textarea:focus {
                    border-color: #e85b68;
                    box-shadow: 0 0 0 3px rgba(232, 91, 104, 0.10);
                    outline: none;
                }
                .shipnow-admin-scrollbar {
                    scrollbar-color: #d9d3d3 transparent;
                    scrollbar-width: thin;
                }
                .shipnow-admin-scrollbar::-webkit-scrollbar {
                    height: 6px;
                    width: 6px;
                }
                .shipnow-admin-scrollbar::-webkit-scrollbar-thumb {
                    background: #d9d3d3;
                    border-radius: 999px;
                }
            `}</style>

            <div
                data-admin-shell="SHIPNOW_ADMIN_SHELL_V1"
                className="admin-mobile-scope tagmaster-admin-theme h-[100dvh] min-h-[100dvh] w-full max-w-full overflow-hidden bg-[#fbfbfb] p-0 font-sans"
            >
                <div className="flex h-full w-full max-w-none overflow-hidden border-0 bg-[#fbfbfb] shadow-none">
                    <Sidebar
                        onNavigate={setCurrentView}
                        onSwitchToHome={props.onSwitchToHome}
                        currentView={currentView}
                        isOpen={isMobileSidebarOpen}
                        onClose={() => setIsMobileSidebarOpen(false)}
                        supportUnreadCount={supportUnreadCount}
                        adminEmail={props.currentAdminUser.email}
                    />

                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#fbfbfb]">
                        {!isProductEditorShellOpen && (
                            <header className="z-30 flex shrink-0 items-center justify-between border-b border-[#ece8e8] bg-white px-3 py-2.5 md:hidden">
                                <div className="flex min-w-0 items-center gap-3">
                                    <button
                                        type="button"
                                        aria-label="Open admin navigation"
                                        onClick={() => setIsMobileSidebarOpen(true)}
                                        className="-ml-1 rounded-lg p-2 text-[#4f5258] transition-colors hover:bg-[#f7f4f4]"
                                    >
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                                    </button>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-[#24262a]">{currentViewMeta.title}</p>
                                        <p className="truncate text-[10px] font-medium text-[#a09a9d]">Admin / {currentViewMeta.title}</p>
                                    </div>
                                </div>
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fbe4e6] text-xs font-black text-[#dc4d5c]">
                                    {props.currentAdminUser.email.charAt(0).toUpperCase()}
                                </div>
                            </header>
                        )}

                        {!isProductEditorShellOpen && (
                            <header className="hidden shrink-0 items-center justify-between border-b border-[#efebeb] bg-white px-7 py-4 md:flex lg:px-9">
                                <div className="min-w-0">
                                    <h1 className="truncate text-[22px] font-bold tracking-[-0.02em] text-[#25272b]">{currentViewMeta.title}</h1>
                                    <p className="mt-1 truncate text-[11px] font-medium text-[#a29c9f]">Admin / {currentViewMeta.title} · {currentViewMeta.subtitle}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCurrentView('products')}
                                    className="shipnow-shell-action ml-5 inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#202124] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-black"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Manage Products
                                </button>
                            </header>
                        )}

                        <main className={`shipnow-admin-content shipnow-admin-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fbfbfb] ${isProductEditorShellOpen ? 'p-0' : 'p-0'}`}>
                            <div className={isProductEditorShellOpen ? 'w-full max-w-none' : 'w-full max-w-none'}>
                                {currentView === 'analytics' ? renderView() : (
                                    <div
                                        data-admin-view={currentView}
                                        data-admin-page-theme="ADMIN_SHIPNOW_PAGES_THEME_V1"
                                        className="shipnow-admin-page-theme"
                                    >
                                        {renderView()}
                                    </div>
                                )}
                            </div>
                        </main>

                        {!isProductEditorShellOpen && (
                            <footer className="hidden shrink-0 items-center justify-between border-t border-[#efebeb] bg-white px-8 py-3 text-[10px] font-medium text-[#999396] lg:flex">
                                <span>Copyright © 2026 Digital Catalyst</span>
                                <div className="flex items-center gap-5">
                                    <button type="button" onClick={props.onSwitchToHome} className="hover:text-[#dc4d5c]">Open Website</button>
                                    <span>Admin workspace</span>
                                    <span>Secure session</span>
                                </div>
                            </footer>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default AdminDashboard;
