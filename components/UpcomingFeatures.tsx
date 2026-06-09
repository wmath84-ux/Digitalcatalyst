import React, { useRef, useEffect } from 'react';
import { WebsiteSettings } from '../App';

export interface UpcomingFeatureItem {
    id: number;
    title: string;
    description: string;
    status: 'In Development' | 'Coming Soon' | 'Beta';
    icon: string;
}

interface UpcomingFeaturesProps {
    settings: WebsiteSettings;
    title: string;
    features: UpcomingFeatureItem[];
    onOpenCommunity?: () => void;
}

const Icon: React.FC<{ name: string }> = ({ name }) => {
    const icons: { [key: string]: React.ReactNode } = {
        rocket: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,
        brain: <path strokeLinecap="round" strokeLinejoin="round" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 004.472-.69a.75.75 0 01.819.162l1.305 1.305a.75.75 0 01-.23 1.053l-2.022 1.348a11.25 11.25 0 01-1.636 1.023c-1.35.8-2.94 1.2-4.634 1.2-1.694 0-3.284-.4-4.634-1.2a11.25 11.25 0 01-1.636-1.023l-2.022-1.348a.75.75 0 01-.23-1.053l1.305-1.305a.75.75 0 01.819-.162A8.97 8.97 0 0015 15a9 9 0 00-5.472-8.31a.75.75 0 01.162-.819l1.305-1.305a.75.75 0 011.053.23l1.348 2.022a11.25 11.25 0 011.023 1.636c.8 1.35 1.2 2.94 1.2 4.634 0 1.694-.4 3.284-1.2 4.634a11.25 11.25 0 01-1.023 1.636l-1.348 2.022a.75.75 0 01-1.053.23z" />,
        people: <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.289 2.72a3 3 0 01-4.682-2.72 9.094 9.094 0 013.741.479M14.879 14.879a3 3 0 104.242 0 3 3 0 00-4.242 0zM9.12 8.72a3 3 0 104.242 0 3 3 0 00-4.242 0zM.479 12a9.094 9.094 0 01-.479 3.741 3 3 0 012.72-4.682m2.72 7.289a3 3 0 002.72 4.682 9.094 9.094 0 003.741-.479m-7.289-2.72a9.094 9.094 0 00-.479-3.741 3 3 0 00-4.682 2.72M12 12a3 3 0 100-6 3 3 0 000 6z" />,
        default: <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.624l.21-1.02a3.375 3.375 0 00-2.455-2.455l-1.02-.211 1.02-.21a3.375 3.375 0 002.455-2.456l.21-1.02.21 1.02a3.375 3.375 0 00-2.455 2.455l-.21 1.02z" />
    };
    return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {icons[name] || icons.default}
        </svg>
    );
};

const statusColors: { [key in UpcomingFeatureItem['status']]: string } = {
    'In Development': 'border-blue-300/30 bg-blue-400/10 text-blue-700',
    'Coming Soon': 'border-purple-300/30 bg-purple-400/10 text-purple-700',
    'Beta': 'border-emerald-300/30 bg-emerald-400/10 text-emerald-700',
};

const UpcomingFeatures: React.FC<UpcomingFeaturesProps> = ({ settings, title, features, onOpenCommunity }) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
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

  if (features.length === 0) return null;

  return (
    <section 
      id="upcoming"
      ref={sectionRef}
      className={`relative overflow-hidden bg-sky-50 bg-gradient-to-br from-sky-50 via-indigo-100/50 to-violet-100 py-24 text-slate-900 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.34),transparent_34%),radial-gradient(circle_at_10%_70%,rgba(37,99,235,0.28),transparent_30%)]" />
      <div className="container relative z-10 mx-auto px-6">
        <div className="animate-child animate-delay-1 mx-auto mb-16 max-w-3xl rounded-2xl border border-indigo-100/80 bg-white/80 p-8 text-center backdrop-blur-xl">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-purple-700">Roadmap</p>
          <h2 className="mt-3 text-4xl font-extrabold text-slate-900">{title}</h2>
          <p className="mt-4 text-lg text-slate-700">
            We're always working on new ways to help you succeed. Here's a sneak peek at what's coming next.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <div key={feature.id} className={`animate-child animate-delay-${index + 2} product-card-shine group flex h-full flex-col rounded-2xl border border-indigo-100/80 bg-white/80 p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-300/30 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]`}>
                <div className="mb-6 flex justify-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-indigo-100/80 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-transform duration-300 group-hover:scale-110">
                        <Icon name={feature.icon} />
                    </div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="mt-2 flex-grow text-sm leading-relaxed text-slate-700">{feature.description}</p>
                <div className="mt-6 border-t border-white/50 pt-6">
                    <span className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-sm backdrop-blur-xl ${statusColors[feature.status]}`}>
                        {feature.status}
                    </span>
                    {feature.title === 'Community Forum' && onOpenCommunity && (
                        <button type="button" onClick={onOpenCommunity} className="mt-4 w-full rounded-full border border-white/70 bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_16px_40px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-indigo-950">
                            Open Liquid Community
                        </button>
                    )}
                </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UpcomingFeatures;
