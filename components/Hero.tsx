import React, { useEffect, useRef } from 'react';
import LiquidMetalButton from './ui/LiquidMetalButton';
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

const ArrowIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
);

const Hero: React.FC<HeroProps> = ({ settings, onNavigateToPolicies, onNavigateToAllProducts, onOpenBlogModal, onOpenFreeModal, onOpenAnnouncementsModal, realMetrics }) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    }, { threshold: 0.1 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const useRealData = settings.content.heroMetrics?.enableRealData;
  const revenueDisplay = useRealData && realMetrics
    ? `₹${realMetrics.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : settings.content.heroMetrics?.customRevenue || '₹0';
  const revenueChange = useRealData ? '+100%' : settings.content.heroMetrics?.customRevenueChange || '+0%';
  const usersDisplay = useRealData && realMetrics ? `${realMetrics.users}` : settings.content.heroMetrics?.customActiveUsers || '0+';
  const metrics = [
    { value: revenueChange, label: 'Revenue lift', detail: useRealData ? revenueDisplay : undefined },
    { value: usersDisplay, label: 'Active learners' },
    { value: '24/7', label: 'Digital access' },
  ];
  const resources = [
    { label: 'Read the blog', description: 'Practical learning guides', action: onOpenBlogModal },
    { label: 'Free resources', description: 'Start learning at no cost', action: onOpenFreeModal },
    { label: 'Latest news', description: 'New releases and updates', action: onOpenAnnouncementsModal },
  ];

  return (
    <section ref={sectionRef} className="stagger-animate-container relative overflow-hidden bg-[#F7F9FC] text-[#10213F]">
      <div className="container mx-auto grid min-h-[78vh] items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 md:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)] lg:gap-16">
        <div className="max-w-3xl">
          <div className="animate-child animate-delay-1 inline-flex items-center gap-2 rounded-full border border-[#C8D7EE] bg-[#FFFFFF] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#1557B0]">
            <span className="h-2 w-2 rounded-full bg-[#1557B0]" />
            Built for focused learners
          </div>
          <h1 className="animate-child animate-delay-2 mt-6 text-balance text-4xl font-black leading-[1.05] tracking-[-0.04em] text-[#10213F] sm:text-6xl lg:text-7xl">
            {settings.content.heroTitle}
          </h1>
          <p className="animate-child animate-delay-3 mt-6 max-w-2xl text-pretty text-base leading-7 text-[#526179] sm:text-xl sm:leading-8">
            {settings.content.heroSubtitle}
          </p>
          <div className="animate-child animate-delay-4 mt-8 flex flex-col gap-3 sm:flex-row">
            <LiquidMetalButton tone="blue" onClick={onNavigateToAllProducts} className="w-full rounded-xl px-7 py-4 text-base font-bold sm:w-auto">
              Explore products
            </LiquidMetalButton>
            <button onClick={onNavigateToPolicies} className="w-full rounded-xl border border-[#C8D7EE] bg-[#FFFFFF] px-7 py-4 text-base font-bold text-[#10213F] transition hover:border-[#1557B0] hover:text-[#1557B0] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C8D7EE] sm:w-auto">
              How it works
            </button>
          </div>
          <p className="animate-child animate-delay-5 mt-5 text-sm font-semibold text-[#526179]">Instant access · Secure checkout · Learner support</p>
        </div>

        <aside className="animate-child animate-delay-4 rounded-3xl border border-[#C8D7EE] bg-[#FFFFFF] p-5 shadow-[0_24px_70px_rgba(16,33,63,0.10)] sm:p-7" aria-label="Marketplace highlights">
          <div className="flex items-start justify-between gap-4 border-b border-[#E4EAF2] pb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1557B0]">Digital marketplace</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-[#10213F]">Learn at your pace</h2>
            </div>
            <span className="rounded-full bg-[#E9F1FC] px-3 py-1 text-xs font-bold text-[#1557B0]">Always open</span>
          </div>
          <div className="grid grid-cols-3 gap-2 py-5">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl bg-[#F7F9FC] p-3 sm:p-4">
                <p className="text-xl font-black text-[#10213F] sm:text-2xl">{metric.value}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[#526179]">{metric.label}</p>
                {metric.detail ? <p className="mt-1 text-xs font-bold text-[#1557B0]">{metric.detail}</p> : null}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {resources.map((resource) => (
              <button key={resource.label} onClick={resource.action} className="group flex items-center justify-between rounded-2xl border border-[#E4EAF2] px-4 py-3 text-left transition hover:border-[#1557B0] hover:bg-[#F7F9FC] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C8D7EE]">
                <span>
                  <span className="block text-sm font-bold text-[#10213F]">{resource.label}</span>
                  <span className="mt-0.5 block text-xs text-[#526179]">{resource.description}</span>
                </span>
                <span className="text-[#1557B0] transition-transform group-hover:translate-x-1"><ArrowIcon /></span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
};

export default Hero;
