
import React from 'react';
import { AdminView } from './AdminDashboard';

interface SidebarProps {
    currentView: AdminView;
    onNavigate: (view: AdminView) => void;
    onLogout: () => void;
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
            className={`group/nav relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[12px] font-semibold transition-colors ${
                isActive
                    ? 'bg-[#fde7e9] text-[#d94857]'
                    : 'text-[#62656d] hover:bg-[#f7f5f5] hover:text-[#24262a]'
            }`}
        >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center transition-colors ${isActive ? 'text-[#d94857]' : 'text-[#73767d] group-hover/nav:text-[#d94857]'}`}>
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {badge ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#ef4f5f] px-1.5 py-0.5 text-[9px] font-black leading-none text-white">
                    {badge}
                </span>
            ) : isFeatured ? (
                <span className="rounded-full bg-[#fff0d9] px-1.5 py-0.5 text-[8px] font-black text-[#b97214]">NEW</span>
            ) : null}
        </button>
    );
};

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, onLogout, onSwitchToHome, isOpen, onClose, supportUnreadCount = 0, adminEmail }) => {
    const navItems: { label: string; view: AdminView; isFeatured?: boolean; icon: React.ReactNode; badge?: string | number | null }[] = [
        { label: 'Dashboard', view: 'dashboard', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
        { label: 'Admin Post', view: 'adminPosts', isFeatured: true, icon: <span className="text-lg">📣</span> },
        { label: 'EduCoin Economy', view: 'economy', isFeatured: true, icon: <span className="text-lg">🪙</span> },
        { label: 'Reward Logic', view: 'rewardSettings', isFeatured: true, icon: <span className="text-lg">📖</span> },
        { label: 'Analytics', view: 'analytics', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
        { label: 'Firebase Admin', view: 'firebaseAdmin', isFeatured: true, icon: <span className="text-lg">🔥</span> },
        { label: 'Products', view: 'products', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
        { label: 'News & Blog', view: 'newsBlog', isFeatured: true, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v8a2 2 0 01-2 2zM14 4v6h6M8 13h8M8 17h8M8 9h2" /></svg> },
        { label: 'Orders', view: 'orders', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg> },
        { label: 'Customers', view: 'users', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
        { label: 'Reviews', view: 'reviews', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> },
        { label: 'Coupons', view: 'coupons', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2a2 2 0 002 2h2a2 2 0 00-2-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2zM5 5v2a2 2 0 002 2h2a2 2 0 00-2-2H7a2 2 0 00-2 2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2zM15 15v2a2 2 0 002 2h2a2 2 0 00-2-2h-2a2 2 0 00-2 2zm0 0v2a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2zM5 15v2a2 2 0 002 2h2a2 2 0 00-2-2H7a2 2 0 00-2 2zm0 0v2a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2z" /></svg> },

        { label: 'Subscribers', view: 'subscribers', isFeatured: true, icon: <span className="text-lg">📬</span> },
        { label: 'Support', view: 'support', badge: supportUnreadCount ? (supportUnreadCount > 9 ? '9+' : supportUnreadCount) : null, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
        { label: 'Store Config', view: 'websiteSettings', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
        { label: 'Admin Users', view: 'admins', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> },
        { label: 'Reports', view: 'reports', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
    ];

    // Mobile overlay classes vs Desktop static classes
    const containerClasses = isOpen
        ? "fixed inset-y-0 left-0 z-50 w-[min(16rem,calc(100vw-1.25rem))] translate-x-0 bg-white shadow-[0_24px_70px_rgba(43,32,34,0.20)]"
        : "hidden md:flex md:h-full md:w-[248px] md:shrink-0 md:flex-col md:overflow-hidden md:border-r md:border-[#eeeaea] md:bg-white";

    return (
        <>
            {/* Mobile Backdrop */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/20 z-40 md:hidden backdrop-blur-sm"
                    onClick={onClose}
                ></div>
            )}

            <aside className={`${containerClasses} flex h-full max-h-[100dvh] flex-col overflow-hidden text-[#25272b]`}>
                <div className="shrink-0 border-b border-[#f0eded] px-4 pb-3 pt-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ef4f5f] shadow-sm">
                                <img src="/icons/icon-192x192.svg" alt="Digital Catalyst logo" className="h-6 w-6 rounded-md" />
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-sm font-black tracking-[-0.02em] text-[#202124]">DIGITAL CATALYST</div>
                                <div className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-[#aaa4a6]">Admin workspace</div>
                            </div>
                        </div>
                        <button type="button" aria-label="Close admin navigation" onClick={onClose} className="rounded-lg p-2 text-[#7a7477] hover:bg-[#f8f5f5] md:hidden">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#eeeaea] bg-[#faf9f9] p-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fde7e9] text-[11px] font-black text-[#d94857]">
                            {adminEmail.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-bold text-[#2b2d31]">{adminEmail.split('@')[0]}</p>
                            <p className="truncate text-[9px] font-medium text-[#989295]">{adminEmail}</p>
                        </div>
                        <svg className="h-3.5 w-3.5 shrink-0 text-[#aaa4a6]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" /></svg>
                    </div>
                </div>

                <div className="shipnow-admin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-[#b0aaac]">Navigation</p>
                    <div className="space-y-0.5">
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

                <div className="shrink-0 border-t border-[#f0eded] p-3">
                    <div className="mb-2 rounded-xl bg-[#242426] p-3.5 text-white shadow-sm">
                        <p className="text-[13px] font-black leading-tight">Your store, fully controlled.</p>
                        <p className="mt-1.5 text-[9px] font-medium leading-4 text-white/65">Manage products, customers, orders, content, and support without leaving this workspace.</p>
                        <button type="button" onClick={onSwitchToHome} className="mt-3 w-full rounded-lg bg-white px-3 py-2 text-[10px] font-black text-[#242426] transition hover:bg-[#fde7e9]">
                            Open Store
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        <button type="button" onClick={onSwitchToHome} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-bold text-[#666168] transition hover:bg-[#f7f5f5] hover:text-[#d94857]">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4m-4-10h6m0 0v6m0-6L10 14" /></svg>
                            Website
                        </button>
                        <button type="button" onClick={onLogout} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-bold text-[#8c4d54] transition hover:bg-[#fdebed] hover:text-[#d94857]">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m17 16 4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" /></svg>
                            Sign Out
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
