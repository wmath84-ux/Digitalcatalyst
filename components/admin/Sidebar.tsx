import React from 'react';
import { AdminView } from './AdminDashboard';

interface SidebarProps {
    currentView: AdminView;
    onNavigate: (view: AdminView) => void;
    onSwitchToHome: () => void;
    isOpen: boolean;
    onClose: () => void;
    supportUnreadCount?: number;
    adminEmail: string;
}

const NavLink: React.FC<{
    label: string;
    view: AdminView;
    currentView: AdminView;
    onClick: (view: AdminView) => void;
    isFeatured?: boolean;
    icon: React.ReactNode;
    badge?: string | number | null;
}> = ({ label, view, currentView, onClick, isFeatured, icon, badge }) => {
    const isActive = currentView === view;
    return (
        <button
            onClick={() => onClick(view)}
            title={label}
            className={`group/nav relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition-all ${
                isActive
                    ? 'bg-black text-white shadow-sm'
                    : 'text-[#6b7280] hover:bg-[#f3f4f6] hover:text-black'
            }`}
        >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center transition-colors ${isActive ? 'text-white' : 'text-[#9ca3af] group-hover/nav:text-black'}`}>
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">{label}</span>
            {badge ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#0B63FF] px-1.5 py-0.5 text-[9px] font-black leading-none text-white">
                    {badge}
                </span>
            ) : isFeatured ? (
                <span className="rounded-full bg-[#EEF6FF] border border-[#BFD7FF] px-1.5 py-0.5 text-[8px] font-black text-[#0B63FF]">NEW</span>
            ) : null}
        </button>
    );
};

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, onSwitchToHome, isOpen, onClose, supportUnreadCount = 0, adminEmail }) => {
    const resolvedAdminEmail = adminEmail || 'admin@firebase.local';
    const navItems: { label: string; view: AdminView; isFeatured?: boolean; icon: React.ReactNode; badge?: string | number | null }[] = [
        { label: 'Dashboard', view: 'dashboard', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
        { label: 'Products', view: 'products', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
        { label: 'EduCoin Economy', view: 'economy', isFeatured: true, icon: <span className="text-[16px]">🪙</span> },
        { label: 'Analytics', view: 'analytics', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
        { label: 'News & Blog', view: 'newsBlog', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v8a2 2 0 01-2 2zM14 4v6h6M8 13h8M8 17h8M8 9h2" /></svg> },
        { label: 'Orders', view: 'orders', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg> },
        { label: 'Customers', view: 'users', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
        { label: 'Reviews', view: 'reviews', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> },
        { label: 'Coupons', view: 'coupons', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2h6a2 2 0 002-2M9 7h6M9 11h6M9 15h6" /></svg> },
        { label: 'Subscribers', view: 'subscribers', icon: <span className="text-[16px]">📬</span> },
        { label: 'Support', view: 'support', badge: supportUnreadCount ? (supportUnreadCount > 9 ? '9+' : supportUnreadCount) : null, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 11-12.728 0 9 9 0 0112.728 0zM12 8v4m0 4h.01" /></svg> },
        { label: 'Store Config', view: 'websiteSettings', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
        { label: 'Admin Users', view: 'admins', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> },
        { label: 'Reports', view: 'reports', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
    ];

    const containerClasses = isOpen
        ? "fixed inset-y-0 left-0 z-50 w-[min(16rem,calc(100vw-1.25rem))] translate-x-0 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        : "hidden md:flex md:min-h-screen md:w-[260px] md:shrink-0 md:flex-col md:overflow-hidden md:border-r md:border-[#E5E7EB] md:bg-white";

    return (
        <>
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/20 z-40 md:hidden backdrop-blur-sm"
                    onClick={onClose}
                ></div>
            )}

            <aside className={`${containerClasses} flex h-full max-h-[100dvh] flex-col overflow-hidden text-black`}>
                <div className="shrink-0 border-b border-[#F3F4F6] px-4 pb-4 pt-5">
                    <div className="flex items-center justify-between gap-3">
                        <button type="button" onClick={onSwitchToHome} className="flex min-w-0 items-center gap-2.5 rounded-xl p-1 text-left transition hover:bg-[#F9FAFB]" title="Click logo to open website">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black">
                                <img src="/icons/icon-192x192.svg" alt="Digital Catalyst" className="h-6 w-6 rounded-md" />
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-[13px] font-black tracking-[-0.02em] text-black">DIGITAL CATALYST</div>
                                <div className="truncate text-[8px] font-bold uppercase tracking-[0.16em] text-[#0B63FF]">Click logo → Website</div>
                            </div>
                        </button>
                        <button type="button" aria-label="Close navigation" onClick={onClose} className="rounded-lg p-2 text-[#6b7280] hover:bg-[#F3F4F6] md:hidden">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[#E5E7EB] bg-white p-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-[11px] font-black text-white">
                            {resolvedAdminEmail.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-bold text-black">{resolvedAdminEmail}</p>
                            <p className="truncate text-[9px] font-medium text-[#6b7280]">Admin • Trusted access</p>
                        </div>
                    </div>
                </div>

                <div className="shipnow-admin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4">
                    <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-[#9ca3af]">Navigation</p>
                    <div className="space-y-1">
                        {navItems.map(item => (
                            <NavLink
                                key={item.view}
                                label={item.label}
                                view={item.view}
                                currentView={currentView}
                                onClick={(view) => { onNavigate(view); onClose(); }}
                                isFeatured={item.isFeatured}
                                icon={item.icon}
                                badge={item.badge}
                            />
                        ))}
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
