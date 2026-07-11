import React, { useRef, useEffect } from 'react';
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
      className="relative isolate min-h-[82vh] overflow-hidden bg-[#F8FAFD] bg-gradient-to-br from-[#F8FAFD] via-[#E8F0FE] to-[#C2E7FF] text-[#202124] stagger-animate-container flex items-center sm:min-h-[92vh]"
    >
      <div className="absolute inset-0 -z-30 animate-gradient-flow bg-gradient-to-r from-[#F8FAFD] via-[#E8F0FE] to-[#C2E7FF] bg-[length:400%_400%]" />
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top_left,rgba(26,115,232,0.22),transparent_34%),radial-gradient(circle_at_70%_20%,rgba(211,227,253,0.78),transparent_32%),radial-gradient(circle_at_50%_85%,rgba(194,231,255,0.62),transparent_36%)]" />
      <div className="absolute inset-0 -z-10 bg-white/45" />
      <div className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_74%)]" />
      <div className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-[#C2E7FF]/55 blur-3xl animate-pulse" />
      <div className="absolute -right-24 bottom-1/4 h-96 w-96 rounded-full bg-[#1A73E8]/18 blur-3xl animate-icon-float" />

      <div className="container relative z-10 mx-auto px-4 py-16 text-center sm:px-6 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="animate-child animate-delay-1 inline-flex items-center gap-2 rounded-full border border-[#D2E3FC] bg-white/95 px-4 py-2 text-xs font-semibold tracking-wide text-[#1967D2] shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:px-5 sm:text-sm">
            <span className="h-2 w-2 rounded-full bg-[#1A73E8] shadow-sm" />
            🚀 Boost Your Digital Growth
          </div>

          <h1
            className="animate-child animate-delay-2 mt-6 text-[2.55rem] font-black leading-[1.04] tracking-[-0.04em] [text-shadow:_0_8px_30px_rgba(255,255,255,0.7)] sm:mt-8 sm:text-6xl lg:text-8xl"
          >
            {settings.content.heroTitle}
          </h1>

          <p className="animate-child animate-delay-3 mx-auto mt-5 max-w-3xl text-base leading-7 text-[#5F6368] sm:mt-7 sm:text-xl sm:leading-8">
            {settings.content.heroSubtitle}
          </p>

          <div className="animate-child animate-delay-4 mt-8 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:flex-row sm:gap-4">
            <LiquidMetalButton
              tone="blue"
              onClick={onNavigateToAllProducts}
              className="w-full rounded-full px-6 py-3.5 text-base font-bold sm:w-auto sm:px-9 sm:py-4 sm:text-lg"
            >
              Explore Products
            </LiquidMetalButton>
            <button
              onClick={onNavigateToPolicies}
              className="w-full rounded-full border border-[#D2E3FC] bg-white/95 px-6 py-3.5 text-base font-semibold text-[#202124] shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-[#1A73E8] hover:bg-white/80 hover:shadow-sm sm:w-auto sm:px-9 sm:py-4 sm:text-lg"
            >
              Our Policies
            </button>
          </div>

          <div className="animate-child animate-delay-5 mx-auto mt-8 grid max-w-3xl grid-cols-3 gap-2 sm:mt-12 sm:gap-4">
            <div className="rounded-2xl border border-[#D2E3FC] bg-white/95 p-3 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#C2E7FF] hover:shadow-sm sm:p-5">
              <p className="text-xl font-extrabold text-[#202124] sm:text-2xl">{revenueChange}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-[#5F6368]">Revenue Lift</p>
              {useRealData && <p className="mt-2 text-sm text-[#1967D2]">{revenueDisplay}</p>}
            </div>
            <div className="rounded-2xl border border-[#D2E3FC] bg-white/95 p-3 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#D2E3FC] hover:shadow-sm sm:p-5">
              <p className="text-xl font-extrabold text-[#202124] sm:text-2xl">{usersDisplay}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-[#5F6368]">Active Users</p>
            </div>
            <div className="rounded-2xl border border-[#D2E3FC] bg-white/95 p-3 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#C2E7FF] hover:shadow-sm sm:p-5">
              <p className="text-xl font-extrabold text-[#202124] sm:text-2xl">24/7</p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-[#5F6368]">Digital Support</p>
            </div>
          </div>

          <div className="animate-child animate-delay-6 mt-8 grid grid-cols-1 gap-3 border-t border-[#D2E3FC] pt-6 sm:mt-12 sm:flex sm:flex-wrap sm:justify-center sm:gap-4 sm:pt-8">
            <button onClick={onOpenBlogModal} className="group flex w-full items-center justify-center gap-2 rounded-full border border-[#D2E3FC] bg-white/95 px-4 py-2.5 text-sm font-medium text-[#1967D2] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C2E7FF] hover:bg-[#E8F0FE] hover:shadow-sm hover:text-[#202124] sm:w-auto sm:justify-start sm:py-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8FAFD] transition-colors group-hover:bg-[#E8F0FE] hover:shadow-sm">📝</span>
              <span>Read Blog</span>
            </button>
            <button onClick={onOpenFreeModal} className="group flex w-full items-center justify-center gap-2 rounded-full border border-[#D2E3FC] bg-white/95 px-4 py-2.5 text-sm font-medium text-[#1967D2] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C2E7FF] hover:bg-[#E8F0FE] hover:shadow-sm hover:text-[#202124] sm:w-auto sm:justify-start sm:py-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8FAFD] transition-colors group-hover:bg-[#E8F0FE] hover:shadow-sm">🎁</span>
              <span>Free Resources</span>
            </button>
            <button onClick={onOpenAnnouncementsModal} className="group flex w-full items-center justify-center gap-2 rounded-full border border-[#D2E3FC] bg-white/95 px-4 py-2.5 text-sm font-medium text-[#1967D2] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C2E7FF] hover:bg-[#E8F0FE] hover:shadow-sm hover:text-[#202124] sm:w-auto sm:justify-start sm:py-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8FAFD] transition-colors group-hover:bg-[#E8F0FE] hover:shadow-sm">📢</span>
              <span>News</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
