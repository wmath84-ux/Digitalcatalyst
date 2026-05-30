import React, { useEffect, useRef } from 'react';
import { WebsiteSettings } from '../App';

export interface ServiceItem {
    id: number;
    title: string;
    description: string;
}

const ServiceIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-cyan-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
    <div className={`animate-child animate-delay-${animationDelay} product-card-shine group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/50 bg-white/70 p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-300/30 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]`}>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-transform duration-300 group-hover:scale-110">
           <ServiceIcon />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
        <p className="text-slate-600 flex-grow leading-relaxed">{description}</p>
        <button onClick={onRequestQuote} className="mt-7 inline-flex items-center justify-center gap-2 rounded-full border border-white/50 bg-white/70 px-5 py-2.5 font-bold text-cyan-700 backdrop-blur-xl transition-all duration-300 hover:border-cyan-300/50 hover:bg-cyan-300/10 hover:text-slate-900 group-hover:translate-x-1">
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
            className={`relative overflow-hidden bg-slate-100 bg-gradient-to-br from-slate-100 via-slate-200/80 to-slate-300/70 py-24 text-slate-900 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.22),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(168,85,247,0.18),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.25),rgba(248,250,252,0.9))]" />
            <div className="container relative z-10 mx-auto px-6">
                <div className="animate-child animate-delay-1 mx-auto mb-16 max-w-3xl rounded-2xl border border-white/50 bg-white/70 p-8 text-center backdrop-blur-xl">
                    <p className="text-sm font-bold uppercase tracking-[0.35em] text-cyan-200">Services</p>
                    <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900">Our Marketing Services</h2>
                    <p className="mt-4 text-lg text-slate-600">
                        Let our experts handle the marketing, so you can focus on your business.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
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
