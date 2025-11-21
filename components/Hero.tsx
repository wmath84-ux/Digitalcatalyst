
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
            // Only toggle if intersecting to avoid re-triggering on scroll up unless desired
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

  // Metrics Logic
  const useRealData = settings.content.heroMetrics?.enableRealData;
  
  // Revenue
  const revenueDisplay = useRealData && realMetrics 
    ? `₹${realMetrics.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` 
    : settings.content.heroMetrics?.customRevenue || "₹0";
    
  const revenueChange = useRealData 
    ? "+100%" // Default growth indicator for real data mode
    : settings.content.heroMetrics?.customRevenueChange || "+0%";

  // Active Users
  const usersDisplay = useRealData && realMetrics
    ? `${realMetrics.users}`
    : settings.content.heroMetrics?.customActiveUsers || "0+";

  return (
    <section ref={sectionRef} className="relative bg-primary text-white overflow-hidden stagger-animate-container min-h-[85vh] flex items-center">
      {/* Animated Background */}
      <div className="absolute inset-0 -z-10 animate-gradient-flow bg-[length:400%_400%]" style={{
          background: `linear-gradient(-45deg, ${settings.theme.primaryColor}, ${settings.theme.accentColor}, #2563eb, #7c3aed)`
      }}></div>
      
      {/* Overlay Pattern */}
      <div className="absolute inset-0 -z-10 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>

      <div className="container mx-auto px-6 relative z-10 py-20">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            
            {/* Text Content */}
            <div className="lg:w-1/2 text-center lg:text-left">
                <div className="animate-child animate-delay-1 inline-block mb-4 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm text-sm font-medium tracking-wide text-indigo-100">
                    🚀 Boost Your Digital Growth
                </div>
                <h1 
                    className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight animate-child animate-delay-2"
                    style={{ textShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
                >
                    {settings.content.heroTitle}
                </h1>
                <p className="mt-6 text-xl text-indigo-100 leading-relaxed max-w-2xl mx-auto lg:mx-0 animate-child animate-delay-3">
                    {settings.content.heroSubtitle}
                </p>
                
                <div className="mt-10 flex flex-col sm:flex-row justify-center lg:justify-start items-center gap-4 animate-child animate-delay-4">
                    <button 
                        onClick={onNavigateToAllProducts} 
                        className="w-full sm:w-auto bg-white text-primary font-bold px-8 py-4 rounded-xl hover:bg-gray-100 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 text-lg shadow-lg ring-4 ring-white/30"
                    >
                        Explore Products
                    </button>
                    <button 
                        onClick={onNavigateToPolicies} 
                        className="w-full sm:w-auto bg-transparent border-2 border-white/30 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/10 transition-all duration-300 hover:border-white"
                    >
                        Our Policies
                    </button>
                </div>

                {/* Quick Links */}
                <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap justify-center lg:justify-start gap-6 animate-child animate-delay-5">
                     <button onClick={onOpenBlogModal} className="group flex items-center gap-2 text-sm font-medium text-indigo-200 hover:text-white transition-colors">
                        <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">📝</span>
                        <span>Read Blog</span>
                     </button>
                     <button onClick={onOpenFreeModal} className="group flex items-center gap-2 text-sm font-medium text-indigo-200 hover:text-white transition-colors">
                        <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">🎁</span>
                        <span>Free Resources</span>
                     </button>
                     <button onClick={onOpenAnnouncementsModal} className="group flex items-center gap-2 text-sm font-medium text-indigo-200 hover:text-white transition-colors">
                        <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">📢</span>
                        <span>Announcements</span>
                     </button>
                </div>
            </div>

            {/* Hero Image */}
            <div className="lg:w-1/2 animate-child animate-delay-3">
                <div className="relative">
                    {/* Decorative Blob */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-indigo-500/30 rounded-full blur-3xl -z-10 animate-pulse"></div>
                    
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/20 shadow-2xl transform rotate-2 hover:rotate-0 transition-transform duration-500">
                        <img 
                            src="https://picsum.photos/seed/online-business-growth/800/600" 
                            alt="Digital Growth" 
                            className="rounded-xl w-full h-auto shadow-inner"
                        />
                    </div>
                    
                    {/* Floating Cards */}
                    <div className="absolute -bottom-6 -left-6 bg-white text-gray-800 p-4 rounded-lg shadow-xl animate-icon-float" style={{ animationDelay: '0s' }}>
                        <div className="flex items-center gap-3">
                            <div className="bg-green-100 p-2 rounded-full text-green-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase">Revenue</p>
                                <p className="text-lg font-bold">{revenueChange}</p>
                                {useRealData && <p className="text-xs text-gray-400">({revenueDisplay})</p>}
                            </div>
                        </div>
                    </div>

                    <div className="absolute -top-6 -right-6 bg-white text-gray-800 p-4 rounded-lg shadow-xl animate-icon-float" style={{ animationDelay: '1.5s' }}>
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase">Active Users</p>
                                <p className="text-lg font-bold">{usersDisplay}</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
