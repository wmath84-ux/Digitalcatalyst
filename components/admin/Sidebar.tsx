
import React from 'react';
import { AdminView } from './AdminDashboard';

interface SidebarProps {
    currentView: AdminView;
    onNavigate: (view: AdminView) => void;
    onLogout: () => void;
    onSwitchToHome: () => void;
    isOpen: boolean;
    onClose: () => void;
}

const NavLink: React.FC<{
    label: string;
    view: AdminView;
    currentView: AdminView;
    onClick: (view: AdminView) => void;
    isFeatured?: boolean;
    icon: React.ReactNode;
}> = ({ label, view, currentView, onClick, isFeatured, icon }) => {
    const isActive = currentView === view;
    return (
        <button
            onClick={() => onClick(view)}
            className={`group w-full text-left px-4 py-3 rounded-xl transition-all duration-300 flex items-center justify-between relative overflow-hidden ${
                isActive
                    ? 'bg-white/80 text-slate-950 shadow-[0_12px_30px_rgba(51,65,85,0.12)] border border-white/70 backdrop-blur-sm'
                    : 'text-slate-700 hover:bg-white/80 hover:shadow-sm hover:text-slate-950'
            }`}
        >
            <div className="flex items-center gap-3 relative z-10">
                <span className={`transition-colors ${isActive ? 'text-indigo-700' : 'text-slate-600 group-hover:text-indigo-700'}`}>
                    {icon}
                </span>
                <span className="font-medium tracking-wide">{label}</span>
            </div>
            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-700 rounded-r-full"></div>}
            {isFeatured && (
                <span className="relative z-10 text-[10px] font-bold bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-2 py-0.5 rounded-full shadow-sm">
                    NEW
                </span>
            )}
        </button>
    );
};

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, onLogout, onSwitchToHome, isOpen, onClose }) => {
    const navItems: { label: string; view: AdminView; isFeatured?: boolean; icon: React.ReactNode }[] = [
        { label: 'Dashboard', view: 'dashboard', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
        { label: 'EduCoin Economy', view: 'economy', isFeatured: true, icon: <span className="text-lg">🪙</span> },
        { label: 'Reward Logic', view: 'rewardSettings', isFeatured: true, icon: <span className="text-lg">📖</span> },
        { label: 'Analytics', view: 'analytics', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
        { label: 'Products', view: 'products', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
        { label: 'News & Blog', view: 'newsBlog', isFeatured: true, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v8a2 2 0 01-2 2zM14 4v6h6M8 13h8M8 17h8M8 9h2" /></svg> },
        { label: 'Orders', view: 'orders', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg> },
        { label: 'Customers', view: 'users', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
        { label: 'Reviews', view: 'reviews', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> },
        { label: 'Coupons', view: 'coupons', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2a2 2 0 002 2h2a2 2 0 00-2-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2zM5 5v2a2 2 0 002 2h2a2 2 0 00-2-2H7a2 2 0 00-2 2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2zM15 15v2a2 2 0 002 2h2a2 2 0 00-2-2h-2a2 2 0 00-2 2zm0 0v2a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2zM5 15v2a2 2 0 002 2h2a2 2 0 00-2-2H7a2 2 0 00-2 2zm0 0v2a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2z" /></svg> },

        { label: 'Subscribers', view: 'subscribers', isFeatured: true, icon: <span className="text-lg">📬</span> },
        { label: 'Support', view: 'support', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
        { label: 'Store Config', view: 'websiteSettings', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
        { label: 'Admin Users', view: 'admins', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> },
        { label: 'Reports', view: 'reports', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
    ];

    // Mobile overlay classes vs Desktop static classes
    const containerClasses = isOpen 
        ? "fixed inset-y-0 left-0 z-50 w-[17rem] bg-gradient-to-b from-[#cbd5e8] via-[#dbe3f1] to-[#c8d3e6] shadow-[0_18px_55px_rgba(51,65,85,0.18)] transition-transform transform translate-x-0"
        : "hidden md:flex md:h-full md:w-72 md:shrink-0 md:flex-col md:overflow-hidden bg-gradient-to-b from-[#cbd5e8] via-[#dbe3f1] to-[#c8d3e6] shadow-[0_18px_55px_rgba(51,65,85,0.16)]";

    return (
        <>
            {/* Mobile Backdrop */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/20 z-40 md:hidden backdrop-blur-sm"
                    onClick={onClose}
                ></div>
            )}

            <aside className={`${containerClasses} flex h-full max-h-[100dvh] flex-col overflow-hidden text-slate-900`}>
                <div className="shrink-0 border-b border-white/60 px-4 py-4 sm:py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 to-indigo-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:h-10 sm:w-10">
                                <span className="text-xl font-bold text-white">DC</span>
                            </div>
                            <div>
                                <div className="text-base font-bold tracking-tight sm:text-lg">Digital Catalyst</div>
                                <div className="text-xs text-slate-700 font-medium uppercase tracking-widest">Admin Panel</div>
                            </div>
                        </div>
                        {/* Mobile Close Button */}
                        <button onClick={onClose} className="md:hidden text-slate-700 hover:text-slate-900 p-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-0 py-2 custom-scrollbar sm:py-4">
                    {navItems.map(item => (
                        <NavLink
                            key={item.view}
                            label={item.label}
                            view={item.view}
                            currentView={currentView}
                            onClick={(v) => { onNavigate(v); onClose(); }} // Close sidebar on navigation (mobile)
                            isFeatured={item.isFeatured}
                            icon={item.icon}
                        />
                    ))}
                </div>
                
                <div className="shrink-0 space-y-2 border-t border-white/60 p-3 pt-3 sm:p-4 sm:pt-4">
                    <button
                        onClick={onSwitchToHome}
                        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-blue-800 transition-colors hover:bg-white/80 hover:text-slate-950 sm:px-4 sm:py-3"
                    >
                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        <span className="font-medium">Go to Website</span>
                    </button>
                    <button
                        onClick={onLogout}
                        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-red-700 transition-colors hover:bg-white/80 hover:text-red-800 sm:px-4 sm:py-3"
                    >
                        <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        <span className="font-medium">Sign Out</span>
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
