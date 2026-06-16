import React from 'react';
import { WebsiteSettings } from '../App';
import PlatformExperience from './PlatformExperience';

interface MobileAppHomeProps {
  settings: WebsiteSettings;
  onNavigateToAllProducts: () => void;
  onNavigateToPurchases: () => void;
}

const MobileAppHome: React.FC<MobileAppHomeProps> = ({ settings, onNavigateToAllProducts, onNavigateToPurchases }) => {
  return (
    <div className="mobile-home-secondary">
      <section className="px-4 pb-6 pt-4 sm:px-6 sm:pt-6">
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[26px] border border-white/70 bg-gradient-to-br from-[#EEF5FF] via-[#EEF2FF] to-[#EDE9FE] p-5 text-slate-950 shadow-[0_20px_60px_rgba(79,70,229,0.16)] sm:p-7">
          <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-blue-300/35 blur-3xl" />
          <div className="absolute -bottom-14 -left-8 h-36 w-36 rounded-full bg-violet-300/40 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700 shadow-sm backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Premium Learning Store
            </div>

            <h1 className="mt-4 text-3xl font-black leading-tight tracking-[-0.04em] text-slate-950 sm:text-4xl">
              Welcome to Digital Catalyst
            </h1>

            <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-600 sm:text-base">
              Learn, buy and access premium notes, courses and digital products.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:flex">
              <button
                type="button"
                onClick={onNavigateToAllProducts}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(15,23,42,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
              >
                Explore Products
              </button>
              <button
                type="button"
                onClick={onNavigateToPurchases}
                className="rounded-2xl border border-white/80 bg-white/75 px-5 py-3 text-sm font-black text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2"
              >
                My Purchases
              </button>
            </div>
          </div>
        </div>
      </section>
      <PlatformExperience settings={settings} />
    </div>
  );
};

export default MobileAppHome;
