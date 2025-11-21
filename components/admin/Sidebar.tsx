
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
                    ? 'bg-white/10 text-white shadow-lg border border-white/10 backdrop-blur-sm'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
        >
            <div className="flex items-center gap-3 relative z-10">
                <span className={`transition-colors ${isActive ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300'}`}>
                    {icon}
                </span>
                <span className="font-medium tracking-wide">{label}</span>
            </div>
            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-r-full"></div>}
            {isFeatured && (
                <span className="relative z-10 text-[10px] font-bold bg-gradient-to-r from-yellow-400 to-orange-500 text-slate-900 px-2 py-0.5 rounded-full shadow-sm">
                    NEW
                </span>
            )}
        </button>
    );
};

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, onLogout, onSwitchToHome, isOpen, onClose }) => {
    const navItems: { label: string; view: AdminView; isFeatured?: boolean; icon: React.ReactNode }[] = [
        { label: 'Dashboard', view: 'dashboard', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
        { label: 'Analytics', view: 'analytics', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
        { label: 'Products', view: 'products', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
        { label: 'Orders', view: 'orders', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg> },
        { label: 'Customers', view: 'users', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
        { label: 'Reviews', view: 'reviews', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> },
        { label: 'Coupons', view: 'coupons', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2a2 2 0 002 2h2a2 2 0 00-2-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2zM5 5v2a2 2 0 002 2h2a2 2 0 00-2-2H7a2 2 0 00-2 2zm0 0V5a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2zM15 15v2a2 2 0 002 2h2a2 2 0 00-2-2h-2a2 2 0 00-2 2zm0 0v2a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2zM5 15v2a2 2 0 002 2h2a2 2 0 00-2-2H7a2 2 0 00-2 2zm0 0v2a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2z" /></svg> },
        { label: 'Support', view: 'support', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
        { label: 'AI Assistant', view: 'gemini', isFeatured: true, icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
        { label: 'Store Config', view: 'websiteSettings', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
        { label: 'Admin Users', view: 'admins', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> },
        { label: 'Reports', view: 'reports', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
    ];

    // Mobile overlay classes vs Desktop static classes
    const containerClasses = isOpen 
        ? "fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-slate-900 to-slate-800 shadow-2xl transition-transform transform translate-x-0"
        : "hidden md:flex md:w-72 bg-gradient-to-b from-slate-900 to-slate-800 shadow-2xl flex-col";

    return (
        <>
            {/* Mobile Backdrop */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={onClose}
                ></div>
            )}

            <aside className={`${containerClasses} flex flex-col h-full text-white`}>
                <div className="px-4 py-6 mb-2 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                            <span className="text-xl font-bold">DC</span>
                        </div>
                        <div>
                            <div className="text-lg font-bold tracking-tight">Digital Catalyst</div>
                            <div className="text-xs text-slate-400 font-medium uppercase tracking-widest">Admin Panel</div>
                        </div>
                    </div>
                    {/* Mobile Close Button */}
                    <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white p-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto py-4 space-y-1 custom-scrollbar">
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
                
                <div className="pt-4 border-t border-white/10 mt-2 space-y-2 p-4">
                    <button
                        onClick={onSwitchToHome}
                        className="group w-full text-left px-4 py-3 rounded-xl transition-colors flex items-center gap-3 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200"
                    >
                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        <span className="font-medium">Go to Website</span>
                    </button>
                    <button
                        onClick={onLogout}
                        className="group w-full text-left px-4 py-3 rounded-xl transition-colors flex items-center gap-3 text-red-400 hover:bg-red-500/10 hover:text-red-300"
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
