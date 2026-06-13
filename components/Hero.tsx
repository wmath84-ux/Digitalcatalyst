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
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    }, { threshold: 0.1 });
    const currentRef = sectionRef.current;
    if (currentRef) observer.observe(currentRef);
    return () => { if (currentRef) observer.unobserve(currentRef); };
  }, []);

  const useRealData = settings.content.heroMetrics?.enableRealData;
  const revenueDisplay = useRealData && realMetrics
    ? `₹${realMetrics.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : settings.content.heroMetrics?.customRevenue || '₹0';
  const usersDisplay = useRealData && realMetrics
    ? `${realMetrics.users}`
    : settings.content.heroMetrics?.customActiveUsers || '0+';

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden text-[var(--text-body)] stagger-animate-container"
      style={{
        background: 'radial-gradient(circle at 12% 12%, rgba(191, 231, 255, 0.75), transparent 32%), radial-gradient(circle at 88% 18%, rgba(219, 210, 255, 0.65), transparent 30%), radial-gradient(circle at 50% 80%, rgba(232, 242, 255, 0.9), transparent 42%), linear-gradient(135deg, #FAFCFF 0%, #F8FBFF 42%, #EEF6FF 100%)'
      }}
    >
      <div className="absolute -left-24 top-24 h-80 w-80 rounded-full bg-[#BFE7FF]/60 blur-3xl" />
      <div className="absolute -right-20 top-28 h-96 w-96 rounded-full bg-[#DBD2FF]/55 blur-3xl" />
      <div className="container relative z-10 mx-auto px-6 pb-20 pt-16 lg:pb-24 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="text-center lg:text-left">
            <div className="animate-child animate-delay-1 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white px-5 py-2.5 text-sm font-bold text-[var(--primary)] shadow-[var(--shadow-soft)]">
              🚀 Boost Your Digital Growth
            </div>
            <h1 className="animate-child animate-delay-2 mt-7 text-[clamp(3.8rem,6vw,6.4rem)] font-[850] leading-[0.95] tracking-[-0.055em] text-[var(--text-heading)]">
              Your Premium Storefront for Notes, Courses & Digital Products
            </h1>
            <p className="animate-child animate-delay-3 mt-7 max-w-2xl text-[1.12rem] leading-[1.7] text-[var(--text-body)] lg:mx-0 mx-auto">
              Sell premium notes, video courses, subscriptions, and focused learning resources inside one polished digital workspace.
            </p>
            <div className="animate-child animate-delay-4 mt-9 flex flex-col items-center gap-3 sm:flex-row lg:items-start">
              <button onClick={onNavigateToAllProducts} className="rounded-full bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-9 py-4 text-base font-bold text-white shadow-[var(--shadow-blue)] transition hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(23,105,255,0.28)]">
                Explore Products
              </button>
              <button onClick={onNavigateToPolicies} className="rounded-full border border-[var(--border-soft)] bg-white px-9 py-4 text-base font-bold text-[var(--text-heading)] shadow-[var(--shadow-soft)] transition hover:-translate-y-1 hover:border-[var(--border-active)]">
                Our Policies
              </button>
            </div>
            <div className="animate-child animate-delay-5 mt-10 grid gap-3 rounded-[2rem] border border-[var(--border-soft)] bg-white/80 p-3 shadow-[var(--shadow-card)] backdrop-blur-xl sm:grid-cols-3">
              <div className="rounded-[1.35rem] bg-white p-5"><p className="text-2xl font-black text-[var(--text-heading)]">+128%</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Revenue Lift</p>{useRealData && <p className="mt-2 text-sm font-bold text-[var(--primary)]">{revenueDisplay}</p>}</div>
              <div className="rounded-[1.35rem] bg-white p-5"><p className="text-2xl font-black text-[var(--text-heading)]">2.4k+</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Active Users</p>{useRealData && <p className="mt-2 text-sm font-bold text-[var(--primary)]">Live: {usersDisplay}</p>}</div>
              <div className="rounded-[1.35rem] bg-white p-5"><p className="text-2xl font-black text-[var(--text-heading)]">24/7</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Digital Support</p></div>
            </div>
            <div className="animate-child animate-delay-6 mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
              {[[onOpenBlogModal,'📝','Read Blog'],[onOpenFreeModal,'🎁','Free Resources'],[onOpenAnnouncementsModal,'📢','News']].map(([fn, icon, label]) => (
                <button key={label as string} onClick={fn as () => void} className="rounded-full border border-[var(--border-soft)] bg-white px-5 py-3 text-sm font-bold text-[var(--primary)] shadow-[var(--shadow-soft)] transition hover:-translate-y-1 hover:border-[var(--border-active)]">{icon as string} {label as string}</button>
              ))}
            </div>
          </div>
          <div className="animate-child animate-delay-4 hidden lg:block">
            <div className="relative rounded-[2.25rem] border border-[var(--border-soft)] bg-white/86 p-5 shadow-[var(--shadow-card)] backdrop-blur-2xl">
              <div className="rounded-[1.75rem] bg-gradient-to-br from-[#FBFDFF] to-[#EEF6FF] p-6">
                <div className="flex items-center justify-between"><span className="text-sm font-black text-[var(--text-heading)]">Learning Commerce Dashboard</span><span className="rounded-full bg-[#E8F2FF] px-3 py-1 text-xs font-bold text-[var(--primary)]">Live</span></div>
                <div className="mt-6 grid gap-4"><div className="rounded-3xl border border-[var(--border-soft)] bg-white p-5 shadow-[var(--shadow-soft)]"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">Catalog Health</p><div className="mt-4 h-3 rounded-full bg-[#E8F2FF]"><div className="h-3 w-[78%] rounded-full bg-gradient-to-r from-[#1769FF] to-[#7B61FF]" /></div></div>{['Premium Notes','Private Courses','Subscriptions'].map((x,i)=><div key={x} className="flex items-center justify-between rounded-2xl border border-[var(--border-soft)] bg-white px-5 py-4"><span className="font-bold text-[var(--text-title)]">{x}</span><span className="text-sm font-black text-[var(--primary)]">{[128,46,12][i]} items</span></div>)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
