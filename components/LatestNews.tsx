
import React, { useRef, useEffect } from 'react';
import { NewsArticle, WebsiteSettings } from '../App';

interface LatestNewsProps {
  settings: WebsiteSettings;
  title: string;
  articles: NewsArticle[];
  onReadMoreClick: (article: NewsArticle) => void;
  onOpenHub: () => void;
}

const getArticleCoverImage = (article: NewsArticle, size = '800/600') => article.coverImage || article.thumbnailImage || `https://picsum.photos/seed/${article.imageSeed}/${size}`;

const NewsCard: React.FC<{ article: NewsArticle, animationDelay: number, settings: WebsiteSettings, onReadMoreClick: (article: NewsArticle) => void }> = ({ article, animationDelay, settings, onReadMoreClick }) => {
    const animationClass = settings.animations.enabled ? `animate-child animate-delay-${(animationDelay % 8) + 1}` : '';
    return (
        <div className={`bg-white/70 backdrop-blur-2xl rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/50 overflow-hidden transform hover:-translate-y-2 transition-all duration-300 group flex flex-col h-full ${animationClass}`}>
            <div className="relative h-48 overflow-hidden rounded-t-xl bg-white/70">
                <img 
                    src={getArticleCoverImage(article)} 
                    alt={article.title} 
                    className="h-full w-full rounded-t-xl object-cover transition-transform duration-700 group-hover:scale-110" 
                />
                <div className="absolute top-4 left-4 bg-white/70 backdrop-blur-xl px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-700 border border-white/50 rounded-md shadow-sm">
                    {article.type === 'news' ? 'News' : article.category}
                </div>
            </div>
            <div className="p-6 flex flex-col flex-grow">
                <div className="mb-3 text-xs text-slate-600 font-medium">
                    {new Date(article.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-200 transition-colors mb-3 leading-tight">
                    {article.title}
                </h3>
                <p className="text-sm text-slate-600 line-clamp-3 mb-6 flex-grow">
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

  const newsArticles = articles.filter(article => article.type === 'news');

  if (newsArticles.length === 0) return null;

  return (
    <section 
      id="news" 
      ref={sectionRef}
      className={`py-24 bg-slate-100 bg-gradient-to-br from-slate-100 via-slate-200/80 to-slate-300/70 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12">
            <div className="max-w-2xl">
                <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
                <p className="mt-4 text-lg text-slate-600">
                    Current student alerts, education updates, and opportunity signals from Digital Catalyst.
                </p>
            </div>
            <button onClick={onOpenHub} className="hidden md:block rounded-full border border-white/50 bg-white/70 px-5 py-2 text-sm font-bold text-indigo-700 backdrop-blur-xl transition hover:border-indigo-300/40 hover:bg-indigo-400/10">
                Open News
            </button>
        </div>

        <div 
            ref={gridRef} 
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
        >
          {newsArticles.map((article, index) => (
            <NewsCard 
              key={article.id}
              settings={settings}
              article={article} 
              animationDelay={index}
              onReadMoreClick={onReadMoreClick}
            />
          ))}
        </div>
        
        <button onClick={onOpenHub} className="md:hidden w-full mt-8 border border-white/50 bg-white/70 py-3 rounded-lg font-semibold text-indigo-700">
            Open News
        </button>
      </div>
    </section>
  );
};

export default LatestNews;
