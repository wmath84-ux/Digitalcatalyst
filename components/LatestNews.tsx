
import React, { useRef, useEffect } from 'react';
import { NewsArticle, WebsiteSettings } from '../App';
import GoogleAd from './GoogleAd';

interface LatestNewsProps {
  settings: WebsiteSettings;
  title: string;
  articles: NewsArticle[];
  onReadMoreClick: (article: NewsArticle) => void;
  onOpenHub: () => void;
}


const defaultReadingStyle = {
  backgroundColor: '#f7f9fc',
  backgroundOpacity: 96,
  cardOpacity: 94,
  accentColor: '#c2e7ff',
  accentOpacity: 62,
};

const chatPalette = {
  appCanvas: '#f7f9fc',
  searchBlue: '#edf4ff',
  activeBlue: '#c2e7ff',
  bubbleGray: '#f1f3f4',
  cardBorder: '#e0e3eb',
  primaryText: '#202124',
  secondaryText: '#5f6368',
  linkText: '#0b57d0',
};

const clampPercent = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, numeric));
};

const hexToRgba = (hex: string, opacityPercent: number, fallback = defaultReadingStyle.backgroundColor) => {
  const normalized = /^#?[0-9a-f]{6}$/i.test(hex || '') ? hex.replace('#', '') : fallback.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clampPercent(opacityPercent, defaultReadingStyle.backgroundOpacity) / 100})`;
};

const getArticleCoverImage = (article: NewsArticle, size = '800/600') => article.coverImage || article.thumbnailImage || `https://picsum.photos/seed/${article.imageSeed}/${size}`;

const NewsCard: React.FC<{ article: NewsArticle, animationDelay: number, settings: WebsiteSettings, cardBackground?: string, onReadMoreClick: (article: NewsArticle) => void }> = ({ article, animationDelay, settings, cardBackground, onReadMoreClick }) => {
    const animationClass = settings.animations.enabled ? `animate-child animate-delay-${(animationDelay % 8) + 1}` : '';
    return (
        <div style={{ backgroundColor: cardBackground, borderColor: chatPalette.cardBorder }} className={`backdrop-blur-2xl rounded-2xl lg:rounded-[1.75rem] shadow-[0_8px_30px_rgba(60,64,67,0.08)] hover:shadow-[0_16px_42px_rgba(60,64,67,0.14)] border overflow-hidden transform hover:-translate-y-2 transition-all duration-300 group flex flex-col h-full ${animationClass}`}>
            <div className="relative h-48 overflow-hidden rounded-t-2xl lg:h-56 lg:rounded-t-[1.75rem]" style={{ backgroundColor: chatPalette.searchBlue }}>
                <img 
                    src={getArticleCoverImage(article)} 
                    alt={article.title} 
                    className="h-full w-full rounded-t-2xl object-cover transition-transform duration-700 group-hover:scale-110 lg:rounded-t-[1.75rem]"
                />
                <div className="absolute left-4 top-4 rounded-md border px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-sm backdrop-blur-xl lg:left-5 lg:top-5 lg:px-4 lg:py-1.5 lg:text-[13px]" style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder, color: chatPalette.linkText }}>
                    {article.type === 'news' ? 'News' : article.category}
                </div>
            </div>
            <div className="flex flex-grow flex-col p-6 lg:p-7 xl:p-8">
                <div className="mb-3 text-xs font-medium lg:text-sm" style={{ color: chatPalette.secondaryText }}>
                    {new Date(article.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <h3 className="mb-3 text-xl font-bold leading-tight transition-colors lg:text-2xl lg:leading-snug" style={{ color: chatPalette.primaryText }}>
                    {article.title}
                </h3>
                <p className="mb-6 line-clamp-3 flex-grow text-sm leading-6 lg:text-base lg:leading-7" style={{ color: chatPalette.secondaryText }}>
                    {article.excerpt}
                </p>
                <button onClick={() => onReadMoreClick(article)} className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide transition-all group-hover:gap-3 lg:text-base" style={{ color: chatPalette.linkText }}>
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
  const readingStyle = { ...defaultReadingStyle, ...((settings.content as any).readingStyle || {}) };
  const sectionBackground = `linear-gradient(135deg, ${hexToRgba(readingStyle.backgroundColor, readingStyle.backgroundOpacity)}, rgba(237, 244, 255, 0.92), rgba(247, 249, 252, 0.98))`;
  const cardBackground = `rgba(255, 255, 255, ${clampPercent(readingStyle.cardOpacity, defaultReadingStyle.cardOpacity) / 100})`;

  if (newsArticles.length === 0) return null;

  return (
    <section 
      id="news" 
      ref={sectionRef}
      className={`py-24 lg:py-28 xl:py-32 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
      style={{ background: sectionBackground }}
    >
      <div className="container mx-auto px-6 lg:px-10 xl:px-12 2xl:max-w-[1480px]">
        <GoogleAd variant="display" label="Advertisement" className="mb-12 rounded-[2rem] border p-4 shadow-sm backdrop-blur-xl" style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder }} />

        <div className="mb-12 flex flex-col items-end justify-between gap-6 md:flex-row lg:mb-14">
            <div className="max-w-3xl">
                <h2 className="text-4xl font-extrabold tracking-tight lg:text-5xl xl:text-6xl" style={{ color: chatPalette.primaryText }}>{title}</h2>
                <p className="mt-4 text-lg leading-8 lg:text-xl" style={{ color: chatPalette.secondaryText }}>
                    Current student alerts, education updates, and opportunity signals from Digital Catalyst.
                </p>
            </div>
            <button onClick={onOpenHub} className="hidden rounded-full border px-6 py-3 text-sm font-bold backdrop-blur-xl transition hover:shadow-md md:block lg:px-8 lg:py-3.5 lg:text-base" style={{ backgroundColor: chatPalette.activeBlue, borderColor: chatPalette.activeBlue, color: chatPalette.primaryText }}>
                Open News
            </button>
        </div>

        <div 
            ref={gridRef} 
            className={`grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-9 xl:gap-10 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
        >
          {newsArticles.map((article, index) => (
            <React.Fragment key={article.id}>
              <NewsCard 
                settings={settings}
                article={article} 
                animationDelay={index}
                onReadMoreClick={onReadMoreClick}
                cardBackground={cardBackground}
              />
              {(index + 1) % 3 === 0 && index < newsArticles.length - 1 && (
                <GoogleAd variant="inFeed" label="Sponsored" className="md:col-span-2 lg:col-span-3 rounded-[2rem] border p-5 shadow-sm backdrop-blur-xl" style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder }} />
              )}
            </React.Fragment>
          ))}
        </div>
        
        <button onClick={onOpenHub} className="md:hidden w-full mt-8 border py-3 rounded-lg font-semibold" style={{ backgroundColor: chatPalette.activeBlue, borderColor: chatPalette.activeBlue, color: chatPalette.primaryText }}>
            Open News
        </button>

        <GoogleAd variant="display" label="Advertisement" className="mt-12 rounded-[2rem] border p-4 shadow-sm backdrop-blur-xl" style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder }} />
      </div>
    </section>
  );
};

export default LatestNews;
