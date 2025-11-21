
import React, { useRef, useEffect } from 'react';
import { NewsArticle, WebsiteSettings } from '../App';

interface LatestNewsProps {
  settings: WebsiteSettings;
  title: string;
  articles: NewsArticle[];
  onReadMoreClick: () => void;
}

const NewsCard: React.FC<{ article: NewsArticle, animationDelay: number, settings: WebsiteSettings, onReadMoreClick: () => void }> = ({ article, animationDelay, settings, onReadMoreClick }) => {
    const animationClass = settings.animations.enabled ? `animate-child animate-delay-${(animationDelay % 8) + 1}` : '';
    return (
        <div className={`bg-white rounded-2xl shadow-sm hover:shadow-xl border border-gray-100 overflow-hidden transform hover:-translate-y-2 transition-all duration-300 group flex flex-col h-full ${animationClass}`}>
            <div className="relative h-48 overflow-hidden bg-gray-200">
                <img 
                    src={`https://picsum.photos/seed/${article.imageSeed}/800/600`} 
                    alt={article.title} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary rounded-md shadow-sm">
                    {article.category}
                </div>
            </div>
            <div className="p-6 flex flex-col flex-grow">
                <div className="mb-3 text-xs text-gray-400 font-medium">
                    {new Date(article.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <h3 className="text-xl font-bold text-gray-900 group-hover:text-primary transition-colors mb-3 leading-tight">
                    {article.title}
                </h3>
                <p className="text-sm text-gray-500 line-clamp-3 mb-6 flex-grow">
                    {article.excerpt}
                </p>
                <button onClick={onReadMoreClick} className="text-primary font-bold text-sm uppercase tracking-wide flex items-center gap-2 group-hover:gap-3 transition-all">
                    Read Article <span className="text-lg leading-none">&rarr;</span>
                </button>
            </div>
        </div>
    );
};

const LatestNews: React.FC<LatestNewsProps> = ({ settings, title, articles, onReadMoreClick }) => {
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
      className={`py-24 bg-gray-50 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12">
            <div className="max-w-2xl">
                <h2 className="text-4xl font-extrabold text-primary tracking-tight">{title}</h2>
                <p className="mt-4 text-lg text-text-muted">
                    Insights, strategies, and updates from the Digital Catalyst team.
                </p>
            </div>
            <button className="hidden md:block text-primary font-semibold hover:underline">
                View All Posts
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
        
        <button className="md:hidden w-full mt-8 border border-gray-300 py-3 rounded-lg font-semibold text-gray-600">
            View All Posts
        </button>
      </div>
    </section>
  );
};

export default LatestNews;
