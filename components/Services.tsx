
import React, { useEffect, useRef } from 'react';
import { WebsiteSettings } from '../App';

export interface ServiceItem {
    id: number;
    title: string;
    description: string;
}

const ServiceIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
    <div className={`animate-child animate-delay-${animationDelay} relative overflow-hidden bg-white p-8 rounded-2xl shadow-lg border border-gray-100 text-center h-full flex flex-col transition-all duration-300 ease-out hover:shadow-2xl hover:-translate-y-2 product-card-shine group`}>
        <div className="flex justify-center mb-6 transform group-hover:scale-110 transition-transform duration-300">
           <ServiceIcon />
        </div>
        <h3 className="text-xl font-bold text-primary mb-3">{title}</h3>
        <p className="text-text-muted flex-grow leading-relaxed">{description}</p>
        <button onClick={onRequestQuote} className="text-primary font-bold mt-6 inline-flex items-center justify-center hover:underline gap-1 group-hover:translate-x-1 transition-transform">
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
            className={`py-24 bg-gradient-to-b from-white to-gray-50 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
        >
            <div className="container mx-auto px-6">
                <div className="text-center max-w-3xl mx-auto mb-16 animate-child animate-delay-1">
                    <h2 className="text-4xl font-extrabold text-primary tracking-tight">Our Marketing Services</h2>
                    <p className="mt-4 text-lg text-text-muted">
                        Let our experts handle the marketing, so you can focus on your business.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
