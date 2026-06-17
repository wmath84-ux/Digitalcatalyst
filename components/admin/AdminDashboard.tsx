
import React, { useState } from 'react';
import { Product, ProductWithRating, Review, User, Coupon, WebsiteSettings, Order, AdminUser, SupportTicket, NewsletterSubscriber } from '../../App';
import { EconomySettings } from '../../utils/economy';
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
import EduCoinRewardSettings from './EduCoinRewardSettings';
import NewsletterSubscribers from './NewsletterSubscribers';
import AdminPostManagement from './AdminPostManagement';

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
    onAddProduct: (product: Omit<Product, 'id'>) => void;
    onUpdateProduct: (product: Product) => void;
    onDeleteProduct: (id: number) => void;
    onDeleteUser: (id: number) => void;
    onAdminUsersUpdate: (users: AdminUser[]) => void;
    onCouponsUpdate: (coupons: Coupon[]) => void;
    onTicketsUpdate: (tickets: SupportTicket[]) => void;
    onSubscribersUpdate: (subscribers: NewsletterSubscriber[]) => void;
    onWebsiteSettingsChange: (settings: WebsiteSettings) => void;
    onLogout: () => void;
    onSwitchToHome: () => void;
}

export type AdminView = 'dashboard' | 'adminPosts' | 'economy' | 'rewardSettings' | 'products' | 'newsBlog' | 'reviews' | 'reports' | 'users' | 'admins' | 'orders' | 'coupons' | 'support' | 'subscribers' | 'analytics' | 'websiteSettings';

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

const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
    const [currentView, setCurrentView] = useState<AdminView>('dashboard');
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const renderView = () => {
        switch (currentView) {
            case 'adminPosts': return <AdminPostManagement />;
            case 'economy': return <CoinEconomyManagement economySettings={props.economySettings} products={props.products} websiteSettings={props.websiteSettings} />;
            case 'rewardSettings': return <EduCoinRewardSettings economySettings={props.economySettings} />;
            case 'products': return <ProductManagement products={props.products} users={props.users} coupons={props.coupons} onAddProduct={props.onAddProduct} onUpdateProduct={props.onUpdateProduct} onDeleteProduct={props.onDeleteProduct} />;
            case 'newsBlog': return <NewsBlogManagement settings={props.websiteSettings} onSettingsChange={props.onWebsiteSettingsChange} />;
            case 'reviews': return <AdminReviewManagement products={props.products} reviews={props.reviews} />;
            case 'reports': return <Reports products={props.products} reviews={props.reviews} />;
            case 'users': return <UserManagement users={props.users} onDeleteUser={props.onDeleteUser} />;
            case 'admins': return <AdminManagement adminUsers={props.adminUsers} currentAdminUser={props.currentAdminUser} onUpdateAdminUsers={props.onAdminUsersUpdate} />;
            case 'orders': return <OrderManagement orders={props.orders} />;
            case 'coupons': return <CouponManagement coupons={props.coupons} onUpdate={props.onCouponsUpdate} />;
            case 'support': return <SupportManagement tickets={props.tickets} onUpdate={props.onTicketsUpdate} />;
            case 'subscribers': return <NewsletterSubscribers subscribers={props.newsletterSubscribers} onUpdate={props.onSubscribersUpdate} />;
            case 'analytics': return <Analytics orders={props.orders} products={props.products} users={props.users} reviews={props.reviews} />;
            case 'websiteSettings': return <WebsiteSettingsComponent settings={props.websiteSettings} products={props.products} onSettingsChange={props.onWebsiteSettingsChange} />;
            case 'dashboard': default: 
                const completedOrders = props.orders.filter(o => o.status === 'Completed');
                const totalRevenue = completedOrders.reduce((sum, order) => sum + parseFloat(order.total.replace('₹', '').replace(/,/g, '') || '0'), 0);
                const totalReviews = Object.values(props.reviews).flat().length;
                
                return (
                    <div className="space-y-6 animate-fade-in sm:space-y-10">
                        <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 tracking-tight">
                                    Hello, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{props.currentAdminUser.email.split('@')[0]}</span> 👋
                                </h1>
                                <p className="mt-2 text-base text-slate-700 sm:text-lg">Here's what's happening in your store today.</p>
                            </div>
                            <div className="mt-4 md:mt-0 hidden md:block">
                                <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-white/80 backdrop-blur-xl border border-slate-300/70 text-slate-700 shadow-sm">
                                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                                    System Operational
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
                            <DashboardCard 
                                title="Total Revenue" 
                                value={`₹${totalRevenue.toLocaleString('en-IN')}`} 
                                subtitle="+12.5% from last month"
                                gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
                                icon={<svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.15-1.46-3.27-3.4h1.97c.1 1.05.95 1.83 2.63 1.83 1.76 0 2.69-.84 2.69-2.03 0-1.21-.75-1.9-2.61-2.36-2.25-.57-4.23-1.39-4.23-3.93 0-1.98 1.47-3.21 3.22-3.53V3h2.67v1.93c1.5.27 2.81 1.23 3.05 3.07h-1.97c-.15-.93-.98-1.53-2.37-1.53-1.58 0-2.38.81-2.38 1.83 0 1.1.75 1.7 2.61 2.19 2.28.59 4.25 1.45 4.25 4.05 0 2.1-1.56 3.36-3.4 3.55z"/></svg>}
                            />
                            <DashboardCard 
                                title="Total Products" 
                                value={props.products.length} 
                                subtitle="4 low stock alerts"
                                gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
                                icon={<svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                            />
                            <DashboardCard 
                                title="Active Users" 
                                value={props.users.length} 
                                subtitle="+28 new this week"
                                gradient="bg-gradient-to-br from-violet-500 to-purple-600"
                                icon={<svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>}
                            />
                            <DashboardCard 
                                title="Total Reviews" 
                                value={totalReviews} 
                                subtitle="4.8 average rating"
                                gradient="bg-gradient-to-br from-amber-400 to-orange-500"
                                icon={<svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>}
                            />
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8">
                            <h2 className="mb-3 text-xl font-bold text-slate-800 sm:mb-4 sm:text-2xl">Quick Actions</h2>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                                <button onClick={() => setCurrentView('products')} className="flex items-center justify-center gap-3 rounded-xl bg-blue-50 p-3 font-semibold text-blue-700 transition-colors hover:bg-blue-100 sm:justify-start sm:p-4">
                                    <span className="bg-blue-200 p-2 rounded-lg">📦</span> Manage Products
                                </button>
                                <button onClick={() => setCurrentView('orders')} className="flex items-center justify-center gap-3 rounded-xl bg-green-50 p-3 font-semibold text-green-700 transition-colors hover:bg-green-100 sm:justify-start sm:p-4">
                                    <span className="bg-green-200 p-2 rounded-lg">💰</span> View Orders
                                </button>
                                <button onClick={() => setCurrentView('support')} className="flex items-center justify-center gap-3 rounded-xl bg-purple-50 p-3 font-semibold text-purple-700 transition-colors hover:bg-purple-100 sm:justify-start sm:p-4">
                                    <span className="bg-purple-200 p-2 rounded-lg">💬</span> Support Tickets
                                </button>
                            </div>
                        </div>
                    </div>
                );
        }
    }

    return (
        <div className="admin-mobile-scope tagmaster-admin-theme flex h-[100dvh] min-h-[100dvh] w-full max-w-full overflow-hidden bg-[#d8e0ef] bg-[radial-gradient(circle_at_10%_10%,rgba(79,70,229,0.16),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(14,165,233,0.13),transparent_28%),linear-gradient(135deg,#d8e0ef,#e6ebf4_48%,#d5deec)] font-sans">
            <Sidebar 
                onNavigate={setCurrentView} 
                onLogout={props.onLogout} 
                onSwitchToHome={props.onSwitchToHome} 
                currentView={currentView} 
                isOpen={isMobileSidebarOpen}
                onClose={() => setIsMobileSidebarOpen(false)}
            />
            
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Mobile Header */}
                <header className="z-30 flex shrink-0 items-center justify-between border-b border-slate-300/70 bg-white/85 px-3 py-2.5 shadow-sm backdrop-blur-xl md:hidden">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsMobileSidebarOpen(true)}
                            className="-ml-1 rounded-xl p-2 text-slate-700 transition-colors hover:bg-white/80"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <span className="text-sm font-bold text-slate-800">Admin Panel</span>
                    </div>
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-700 to-indigo-800 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {props.currentAdminUser.email.charAt(0).toUpperCase()}
                    </div>
                </header>

                <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white/20 p-3 backdrop-blur-sm custom-scrollbar sm:p-6 lg:p-10">
                    <div className="mx-auto w-full max-w-7xl">
                        {renderView()}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AdminDashboard;
