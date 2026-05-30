
import React, { useRef, useEffect } from 'react';
import { NewsArticle, WebsiteSettings } from '../App';

interface LatestNewsProps {
  settings: WebsiteSettings;
  title: string;
  articles: NewsArticle[];
  onReadMoreClick: (article: NewsArticle) => void;
  onOpenHub: () => void;
}

const NewsCard: React.FC<{ article: NewsArticle, animationDelay: number, settings: WebsiteSettings, onReadMoreClick: (article: NewsArticle) => void }> = ({ article, animationDelay, settings, onReadMoreClick }) => {
    const animationClass = settings.animations.enabled ? `animate-child animate-delay-${(animationDelay % 8) + 1}` : '';
    return (
        <div className={`bg-slate-950/80 backdrop-blur-2xl rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.18)] hover:shadow-[0_25px_80px_rgba(79,70,229,0.25)] border border-white/10 overflow-hidden transform hover:-translate-y-2 transition-all duration-300 group flex flex-col h-full ${animationClass}`}>
            <div className="relative h-48 overflow-hidden bg-slate-900">
                <img 
                    src={`https://picsum.photos/seed/${article.imageSeed}/800/600`} 
                    alt={article.title} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                />
                <div className="absolute top-4 left-4 bg-slate-950/75 backdrop-blur-xl px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-100 border border-white/10 rounded-md shadow-sm">
                    {article.category}
                </div>
            </div>
            <div className="p-6 flex flex-col flex-grow">
                <div className="mb-3 text-xs text-slate-500 font-medium">
                    {new Date(article.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <h3 className="text-xl font-bold text-white group-hover:text-indigo-200 transition-colors mb-3 leading-tight">
                    {article.title}
                </h3>
                <p className="text-sm text-slate-400 line-clamp-3 mb-6 flex-grow">
                    {article.excerpt}
                </p>
                <button onClick={() => onReadMoreClick(article)} className="text-indigo-200 font-bold text-sm uppercase tracking-wide flex items-center gap-2 group-hover:gap-3 transition-all">
                    Read Article <span className="text-lg leading-none">&rarr;</span>
                </button>
            </div>
        </div>
    );
};

const LatestNews: React.FC<LatestNewsProps> = ({ settings, title, articles, onReadMoreClick, onOpenHub }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        }, { threshold: 0.1 }
    );
    const currentRef = sectionRef.current;
    if (currentRef) observer.observe(currentRef);
    
    const currentGridRef = gridRef.current;
    if(currentGridRef) observer.observe(currentGridRef);

    return () => {
        if (currentRef) observer.unobserve(currentRef);
        if (currentGridRef) observer.unobserve(currentGridRef);
    };
  }, []);

  if (articles.length === 0) return null;

  return (
    <section 
      id="news" 
      ref={sectionRef}
      className={`py-24 bg-slate-950 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12">
            <div className="max-w-2xl">
                <h2 className="text-4xl font-extrabold text-white tracking-tight">{title}</h2>
                <p className="mt-4 text-lg text-slate-300">
                    Insights, strategies, and updates from the Digital Catalyst team.
                </p>
            </div>
            <button onClick={onOpenHub} className="hidden md:block rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-bold text-indigo-100 backdrop-blur-xl transition hover:border-indigo-300/40 hover:bg-indigo-400/10">
                Open Reading Hub
            </button>
        </div>

        <div 
            ref={gridRef} 
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
        >
          {articles.map((article, index) => (
            <NewsCard 
              key={article.id}
              settings={settings}
              article={article} 
              animationDelay={index}
              onReadMoreClick={onReadMoreClick}
            />
          ))}
        </div>
        
        <button onClick={onOpenHub} className="md:hidden w-full mt-8 border border-white/10 bg-white/5 py-3 rounded-lg font-semibold text-indigo-100">
            Open Reading Hub
        </button>
      </div>
    </section>
  );
};

export default LatestNews;
