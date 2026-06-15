
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
  backgroundColor: '#F8FAFD',
  backgroundOpacity: 98,
  cardOpacity: 94,
  accentColor: '#C2E7FF',
  accentOpacity: 66,
};

const chatPalette = {
  appCanvas: '#F8FAFD',
  searchBlue: '#EAF2FF',
  activeBlue: '#CFE1FF',
  bubbleGray: '#F8FAFD',
  cardBorder: '#DDE6F7',
  primaryText: '#07133F',
  secondaryText: '#4F5B76',
  linkText: '#0057D8',
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

const buildPremiumArticleImage = (article: NewsArticle) => `https://image.pollinations.ai/prompt/${encodeURIComponent(`premium calm education editorial hero card, ${article.category || article.type} ${article.title}, soft white and ice blue background, deep navy typography space, blue to violet pastel gradient, minimal vector illustration, rounded glass card, subtle geometric lines and dots, student friendly reading mode, no realistic photo, no clutter, 16:9`)}?width=1200&height=675&nologo=true&enhance=true&model=flux`;
const getArticleCoverImage = (article: NewsArticle, size = '800/600') => article.coverImage || article.thumbnailImage || buildPremiumArticleImage(article);

const NewsCard: React.FC<{ article: NewsArticle, animationDelay: number, settings: WebsiteSettings, cardBackground?: string, onReadMoreClick: (article: NewsArticle) => void }> = ({ article, animationDelay, settings, cardBackground, onReadMoreClick }) => {
    const animationClass = settings.animations.enabled ? `animate-child animate-delay-${(animationDelay % 8) + 1}` : '';
    return (
        <div style={{ backgroundColor: cardBackground, borderColor: chatPalette.cardBorder }} className={`backdrop-blur-2xl rounded-2xl shadow-[0_8px_30px_rgba(60,64,67,0.08)] hover:shadow-[0_12px_34px_rgba(60,64,67,0.12)] border overflow-hidden transform hover:-translate-y-2 transition-all duration-300 group flex flex-col h-full ${animationClass}`}>
            <div className="relative h-48 overflow-hidden rounded-t-2xl" style={{ backgroundColor: chatPalette.searchBlue }}>
                <img 
                    src={getArticleCoverImage(article)} 
                    alt={article.title} 
                    className="h-full w-full rounded-t-2xl object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute top-4 left-4 backdrop-blur-xl px-3 py-1 text-xs font-bold uppercase tracking-wider border rounded-md shadow-sm" style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder, color: chatPalette.linkText }}>
                    {article.type === 'news' ? 'News' : article.category}
                </div>
            </div>
            <div className="p-6 flex flex-col flex-grow">
                <div className="mb-3 text-xs font-medium" style={{ color: chatPalette.secondaryText }}>
                    {new Date(article.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <h3 className="text-xl font-bold transition-colors mb-3 leading-tight" style={{ color: chatPalette.primaryText }}>
                    {article.title}
                </h3>
                <p className="text-sm line-clamp-3 mb-6 flex-grow" style={{ color: chatPalette.secondaryText }}>
                    {article.excerpt}
                </p>
                <button onClick={() => onReadMoreClick(article)} className="font-bold text-sm uppercase tracking-wide flex items-center gap-2 group-hover:gap-3 transition-all" style={{ color: chatPalette.linkText }}>
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
  const storedReadingStyle = ((settings.content as any).readingStyle || {}) as Partial<typeof defaultReadingStyle>;
  const readingStyle = {
    ...defaultReadingStyle,
    cardOpacity: storedReadingStyle.cardOpacity ?? defaultReadingStyle.cardOpacity,
    backgroundColor: defaultReadingStyle.backgroundColor,
    backgroundOpacity: defaultReadingStyle.backgroundOpacity,
    accentColor: defaultReadingStyle.accentColor,
    accentOpacity: defaultReadingStyle.accentOpacity,
  };
  const sectionBackground = `radial-gradient(circle at 0% 12%, rgba(194, 231, 255, 0.50), transparent 30%), radial-gradient(circle at 100% 15%, rgba(178, 158, 255, 0.22), transparent 28%), linear-gradient(135deg, ${hexToRgba(readingStyle.backgroundColor, readingStyle.backgroundOpacity)}, rgba(237, 244, 255, 0.92), rgba(248, 250, 253, 0.98))`;
  const cardBackground = `rgba(255, 255, 255, ${clampPercent(readingStyle.cardOpacity, defaultReadingStyle.cardOpacity) / 100})`;

  if (newsArticles.length === 0) return null;

  return (
    <section 
      id="news" 
      ref={sectionRef}
      className={`tagmaster-section-theme py-24 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
      style={{ background: sectionBackground }}
    >
      <div className="container mx-auto px-6">
        <GoogleAd variant="display" label="Advertisement" className="mb-12 rounded-[2rem] border p-4 shadow-sm backdrop-blur-xl" style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder }} />

        <div className="flex flex-col md:flex-row justify-between items-end mb-12">
            <div className="max-w-2xl">
                <h2 className="text-4xl font-extrabold tracking-tight" style={{ color: chatPalette.primaryText }}>{title}</h2>
                <p className="mt-4 text-lg" style={{ color: chatPalette.secondaryText }}>
                    Current student alerts, education updates, and opportunity signals from Digital Catalyst.
                </p>
            </div>
            <button onClick={onOpenHub} className="hidden md:block rounded-full border px-5 py-2 text-sm font-bold backdrop-blur-xl transition hover:shadow-md" style={{ backgroundColor: chatPalette.activeBlue, borderColor: chatPalette.activeBlue, color: chatPalette.primaryText }}>
                Open News
            </button>
        </div>

        <div 
            ref={gridRef} 
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
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
