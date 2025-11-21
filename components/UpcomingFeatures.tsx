
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
}

const Icon: React.FC<{ name: string }> = ({ name }) => {
    const icons: { [key: string]: React.ReactNode } = {
        rocket: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,
        brain: <path strokeLinecap="round" strokeLinejoin="round" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 004.472-.69a.75.75 0 01.819.162l1.305 1.305a.75.75 0 01-.23 1.053l-2.022 1.348a11.25 11.25 0 01-1.636 1.023c-1.35.8-2.94 1.2-4.634 1.2-1.694 0-3.284-.4-4.634-1.2a11.25 11.25 0 01-1.636-1.023l-2.022-1.348a.75.75 0 01-.23-1.053l1.305-1.305a.75.75 0 01.819-.162A8.97 8.97 0 0015 15a9 9 0 00-5.472-8.31a.75.75 0 01.162-.819l1.305-1.305a.75.75 0 011.053.23l1.348 2.022a11.25 11.25 0 011.023 1.636c.8 1.35 1.2 2.94 1.2 4.634 0 1.694-.4 3.284-1.2 4.634a11.25 11.25 0 01-1.023 1.636l-1.348 2.022a.75.75 0 01-1.053.23z" />,
        people: <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.289 2.72a3 3 0 01-4.682-2.72 9.094 9.094 0 013.741.479M14.879 14.879a3 3 0 104.242 0 3 3 0 00-4.242 0zM9.12 8.72a3 3 0 104.242 0 3 3 0 00-4.242 0zM.479 12a9.094 9.094 0 01-.479 3.741 3 3 0 012.72-4.682m2.72 7.289a3 3 0 002.72 4.682 9.094 9.094 0 003.741-.479m-7.289-2.72a9.094 9.094 0 00-.479-3.741 3 3 0 00-4.682 2.72M12 12a3 3 0 100-6 3 3 0 000 6z" />,
        default: <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.624l.21-1.02a3.375 3.375 0 00-2.455-2.455l-1.02-.211 1.02-.21a3.375 3.375 0 002.455-2.456l.21-1.02.21 1.02a3.375 3.375 0 00-2.455 2.455l-.21 1.02z" />
    };
    return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {icons[name] || icons.default}
        </svg>
    );
};

const statusColors: { [key in UpcomingFeatureItem['status']]: string } = {
    'In Development': 'bg-blue-100 text-blue-800',
    'Coming Soon': 'bg-purple-100 text-purple-800',
    'Beta': 'bg-green-100 text-green-800',
};

const UpcomingFeatures: React.FC<UpcomingFeaturesProps> = ({ settings, title, features }) => {
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
      className={`py-24 bg-gray-50 border-t border-gray-200 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
    >
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16 animate-child animate-delay-1">
          <h2 className="text-4xl font-extrabold text-primary">{title}</h2>
          <p className="mt-4 text-lg text-text-muted">
            We're always working on new ways to help you succeed. Here's a sneak peek at what's coming next.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div key={feature.id} className={`animate-child animate-delay-${index + 2} bg-white p-8 rounded-2xl shadow-md border border-gray-100 text-center h-full flex flex-col transform hover:-translate-y-2 transition-all duration-300 hover:shadow-xl`}>
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-inner">
                        <Icon name={feature.icon} />
                    </div>
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">{feature.title}</h3>
                <p className="mt-2 text-text-muted flex-grow text-sm leading-relaxed">{feature.description}</p>
                <div className="mt-6 pt-6 border-t border-gray-100">
                    <span className={`text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm ${statusColors[feature.status]}`}>
                        {feature.status}
                    </span>
                </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UpcomingFeatures;
