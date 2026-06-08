import React, { useRef, useEffect } from 'react';
import { WebsiteSettings } from '../App';

interface HeroProps {
  settings: WebsiteSettings;
  onNavigateToPolicies: () => void;
  onNavigateToAllProducts: () => void;
  onOpenBlogModal: () => void;
  onOpenFreeModal: () => void;
  onOpenAnnouncementsModal: () => void;
  realMetrics?: { revenue: number; users: number };
}

const Hero: React.FC<HeroProps> = ({ settings, onNavigateToPolicies, onNavigateToAllProducts, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, realMetrics }) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            const [entry] = entries;
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        },
        { threshold: 0.1 }
    );

    const currentRef = sectionRef.current;
    if (currentRef) {
        observer.observe(currentRef);
    }

    return () => {
        if (currentRef) {
            observer.unobserve(currentRef);
        }
    };
  }, []);

  const useRealData = settings.content.heroMetrics?.enableRealData;
  const revenueDisplay = useRealData && realMetrics
    ? `₹${realMetrics.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : settings.content.heroMetrics?.customRevenue || '₹0';
  const revenueChange = useRealData
    ? '+100%'
    : settings.content.heroMetrics?.customRevenueChange || '+0%';
  const usersDisplay = useRealData && realMetrics
    ? `${realMetrics.users}`
    : settings.content.heroMetrics?.customActiveUsers || '0+';

  return (
    <section
      ref={sectionRef}
      className="relative isolate min-h-[92vh] overflow-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-slate-900 stagger-animate-container flex items-center"
    >
      <div className="absolute inset-0 -z-30 animate-gradient-flow bg-gradient-to-r from-slate-50 via-indigo-50/30 to-slate-100 bg-[length:400%_400%]" />
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_34%),radial-gradient(circle_at_70%_20%,rgba(168,85,247,0.30),transparent_32%),radial-gradient(circle_at_50%_85%,rgba(37,99,235,0.22),transparent_36%)]" />
      <div className="absolute inset-0 -z-10 bg-white/70" />
      <div className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_74%)]" />
      <div className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-pulse" />
      <div className="absolute -right-24 bottom-1/4 h-96 w-96 rounded-full bg-fuchsia-500/25 blur-3xl animate-icon-float" />

      <div className="container relative z-10 mx-auto px-6 py-28 text-center">
        <div className="mx-auto max-w-5xl">
          <div className="animate-child animate-delay-1 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-5 py-2 text-sm font-semibold tracking-wide text-indigo-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
            <span className="h-2 w-2 rounded-full bg-cyan-600 shadow-sm" />
            🚀 Boost Your Digital Growth
          </div>

          <h1
            className="animate-child animate-delay-2 mt-8 text-5xl font-black leading-tight tracking-[-0.04em] [text-shadow:_0_8px_30px_rgba(255,255,255,0.7)] sm:text-6xl lg:text-8xl"
          >
            {settings.content.heroTitle}
          </h1>

          <p className="animate-child animate-delay-3 mx-auto mt-7 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
            {settings.content.heroSubtitle}
          </p>

          <div className="animate-child animate-delay-4 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={onNavigateToAllProducts}
              className="group relative w-full overflow-hidden rounded-full border border-white/50 bg-white/70 px-9 py-4 text-lg font-bold text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-cyan-300/70 hover:shadow-sm sm:w-auto"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-blue-600/15 via-violet-600/15 to-cyan-600/15 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="relative">Explore Products</span>
            </button>
            <button
              onClick={onNavigateToPolicies}
              className="w-full rounded-full border border-white/50 bg-white/70 px-9 py-4 text-lg font-semibold text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-purple-300/70 hover:bg-white/80 hover:shadow-sm hover:shadow-sm sm:w-auto"
            >
              Our Policies
            </button>
          </div>

          <div className="animate-child animate-delay-5 mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/50 bg-white/70 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-sm">
              <p className="text-2xl font-extrabold text-slate-900">{revenueChange}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-600">Revenue Lift</p>
              {useRealData && <p className="mt-2 text-sm text-cyan-700">{revenueDisplay}</p>}
            </div>
            <div className="rounded-2xl border border-white/50 bg-white/70 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-300/40 hover:shadow-sm">
              <p className="text-2xl font-extrabold text-slate-900">{usersDisplay}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-600">Active Users</p>
            </div>
            <div className="rounded-2xl border border-white/50 bg-white/70 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-300/40 hover:shadow-sm">
              <p className="text-2xl font-extrabold text-slate-900">24/7</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-600">Digital Support</p>
            </div>
          </div>

          <div className="animate-child animate-delay-6 mt-12 flex flex-wrap justify-center gap-4 border-t border-white/50 pt-8">
            <button onClick={onOpenBlogModal} className="group flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-4 py-2 text-sm font-medium text-indigo-700 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/80 hover:shadow-sm hover:text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 transition-colors group-hover:bg-white/80 hover:shadow-sm">📝</span>
              <span>Read Blog</span>
            </button>
            <button onClick={onOpenFreeModal} className="group flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-4 py-2 text-sm font-medium text-indigo-700 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/80 hover:shadow-sm hover:text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 transition-colors group-hover:bg-white/80 hover:shadow-sm">🎁</span>
              <span>Free Resources</span>
            </button>
            <button onClick={onOpenAnnouncementsModal} className="group flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-4 py-2 text-sm font-medium text-indigo-700 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/80 hover:shadow-sm hover:text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 transition-colors group-hover:bg-white/80 hover:shadow-sm">📢</span>
              <span>News</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
