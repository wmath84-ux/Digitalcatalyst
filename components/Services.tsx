import React, { useEffect, useRef } from 'react';
import { WebsiteSettings } from '../App';

export interface ServiceItem {
    id: number;
    title: string;
    description: string;
}

const ServiceIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
);

interface ServiceCardProps {
    title: string;
    description: string;
    onRequestQuote: () => void;
    animationDelay: number;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ title, description, onRequestQuote, animationDelay }) => (
    <div className={`animate-child animate-delay-${animationDelay} product-card-shine group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-white p-5 text-center shadow-[var(--shadow-card)] shadow-black/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[var(--border-active)] hover:shadow-[var(--shadow-card)] sm:p-8`}>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[28px] border border-[var(--border-soft)] bg-white shadow-[var(--shadow-card)] transition-transform duration-300 group-hover:scale-110 sm:mb-6 sm:h-20 sm:w-20">
           <ServiceIcon />
        </div>
        <h3 className="mb-2 text-lg font-bold text-[var(--text-heading)] sm:mb-3 sm:text-xl">{title}</h3>
        <p className="flex-grow text-sm leading-6 text-[var(--text-body)] sm:text-base sm:leading-relaxed">{description}</p>
        <button onClick={onRequestQuote} className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--primary-hover)] sm:mt-7 sm:px-5 sm:text-base">
            Request a Quote <span>&rarr;</span>
        </button>
    </div>
);

interface ServicesProps {
    settings: WebsiteSettings;
    services: ServiceItem[];
    onNavigateToHomeAndScroll: (sectionId: string) => void;
}

const Services: React.FC<ServicesProps> = ({ settings, services, onNavigateToHomeAndScroll }) => {
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
        if (currentRef) observer.observe(currentRef);

        return () => {
            if (currentRef) observer.unobserve(currentRef);
        };
    }, []);

    return (
        <section 
            id="services" 
            ref={sectionRef}
            className={`tagmaster-section-theme relative overflow-hidden bg-sky-50 bg-gradient-to-br from-sky-50 via-indigo-100/50 to-violet-100 py-20 text-[var(--text-body)] sm:py-24 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.32),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(124,58,237,0.28),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.16),rgba(239,246,255,0.78))]" />
            <div className="container relative z-10 mx-auto px-4 sm:px-6">
                <div className="animate-child animate-delay-1 mx-auto mb-10 max-w-3xl rounded-[28px] border border-[var(--border-soft)] bg-white p-5 text-center backdrop-blur-xl sm:mb-16 sm:p-8">
                    <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--primary)] sm:text-sm sm:tracking-[0.35em]">Services</p>
                    <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-heading)] sm:mt-3 sm:text-4xl">Our Marketing Services</h2>
                    <p className="mt-3 text-base text-[var(--text-body)] sm:mt-4 sm:text-lg">
                        Let our experts handle the marketing, so you can focus on your business.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:gap-8 md:grid-cols-3">
                    {services.map((service, index) => (
                        <ServiceCard 
                            key={service.id} 
                            {...service} 
                            onRequestQuote={() => onNavigateToHomeAndScroll('contact')}
                            animationDelay={index + 2}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Services;
