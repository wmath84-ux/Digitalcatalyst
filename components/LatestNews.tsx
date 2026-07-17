
import React, { useRef, useEffect } from 'react';
import { NewsPalette } from '../utils/colorPalettes';
import { NewsArticle, WebsiteSettings } from '../App';
import GoogleAd from './GoogleAd';
import { hasUnsafePublicPlaceholder } from '../utils/reviewStableMode';
import { buildArticleImageFallback, resolveNewsCover } from '../utils/mediaCompat';
import SafeImage from './common/SafeImage';

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
  appCanvas: NewsPalette.softCyanSurface,
  searchBlue: NewsPalette.softCyanSurface,
  activeBlue: NewsPalette.primaryCyan,
  bubbleGray: NewsPalette.mainCard,
  cardBorder: NewsPalette.border,
  primaryText: NewsPalette.headingText,
  secondaryText: NewsPalette.bodyText,
  linkText: NewsPalette.primaryCyan,
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

const escapeSvgText = (value = '') => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] || char));
const buildPremiumArticleImage = (article: NewsArticle) => {
  const isNews = article.type === 'news';
  const palette = NewsPalette;
  const badge = escapeSvgText(isNews ? 'NEWS' : 'BLOG');
  const category = escapeSvgText(article.category || 'Eduvora');
  const title = escapeSvgText((article.title || 'Premium Reading').slice(0, 82));
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.gradientStart}"/><stop offset="0.55" stop-color="${palette.gradientEnd}"/><stop offset="1" stop-color="${palette.gradientEnd}"/></linearGradient><radialGradient id="r" cx="22%" cy="18%" r="70%"><stop stop-color="#FFFFFF" stop-opacity="0.34"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="675" rx="42" fill="url(#g)"/><rect width="1200" height="675" fill="url(#r)"/><circle cx="1010" cy="125" r="170" fill="#ffffff" opacity="0.12"/><circle cx="180" cy="575" r="210" fill="#ffffff" opacity="0.10"/><path d="M70 470 C230 380 310 525 470 430 S760 300 1125 400" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="18" stroke-linecap="round"/><rect x="78" y="74" width="220" height="58" rx="29" fill="#ffffff" opacity="0.95"/><text x="188" y="112" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="900" fill="${palette.primaryCyan}" letter-spacing="5">${badge}</text><text x="82" y="230" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="800" fill="#E8F2FF" letter-spacing="2">${category}</text><foreignObject x="78" y="265" width="900" height="230"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,Arial,sans-serif;font-size:56px;line-height:1.05;font-weight:900;color:white;letter-spacing:-1.8px;">${title}</div></foreignObject><text x="82" y="590" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#E8F2FF">Premium reading cover · URL image fallback</text></svg>`)}`;
};
const getArticleCoverImage = (article: NewsArticle, size = '800/600') => resolveNewsCover(article) || buildPremiumArticleImage(article);

const NewsCard: React.FC<{ article: NewsArticle, animationDelay: number, settings: WebsiteSettings, cardBackground?: string, onReadMoreClick: (article: NewsArticle) => void }> = ({ article, animationDelay, settings, cardBackground, onReadMoreClick }) => {
    const animationClass = settings.animations.enabled ? `animate-child animate-delay-${(animationDelay % 8) + 1}` : '';
    return (
        <div style={{ backgroundColor: cardBackground, borderColor: chatPalette.cardBorder }} className={`latest-news-mobile-card group flex h-full min-h-[17rem] flex-col overflow-hidden rounded-[1.25rem] border bg-white/95 shadow-[0_6px_18px_rgba(60,64,67,0.08)] transition-[border-color,box-shadow,transform] duration-200 sm:min-h-0 sm:rounded-2xl sm:hover:-translate-y-1 sm:hover:shadow-[0_12px_30px_rgba(60,64,67,0.12)] ${animationClass}`}>
            <div className="relative h-28 overflow-hidden rounded-t-[1.25rem] sm:h-48 sm:rounded-t-2xl" style={{ backgroundColor: chatPalette.searchBlue }}>
                <SafeImage
                    src={getArticleCoverImage(article)}
                    fallbackSrc={buildArticleImageFallback(article)}
                    alt={article.title}
                    wrapperClassName="h-full w-full rounded-t-2xl"
                    className="h-full w-full rounded-t-[1.25rem] object-cover transition-transform duration-300 sm:rounded-t-2xl sm:group-hover:scale-105"
                    fallbackTitle={article.title}
                    fallbackBadge={article.type === 'news' ? 'News' : article.category || 'Blog'}
                    fallbackIcon="📰"
                    fallbackMessage="Image preview unavailable"
                    aspect="video"
                />
                <div className="absolute left-2 top-2 max-w-[80%] truncate rounded-md border bg-white/95 px-2 py-1 text-[9px] font-bold uppercase tracking-wide shadow-sm sm:left-4 sm:top-4 sm:px-3 sm:text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder, color: chatPalette.linkText }}>
                    {article.type === 'news' ? 'News' : article.category}
                </div>
            </div>
            <div className="flex flex-grow flex-col p-3 sm:p-6">
                <div className="mb-2 truncate text-[9px] font-medium sm:mb-3 sm:text-xs" style={{ color: chatPalette.secondaryText }}>
                    {new Date(article.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <h3 className="mb-2 line-clamp-2 text-[14px] font-bold leading-[1.22] transition-colors sm:mb-3 sm:text-xl sm:leading-tight" style={{ color: chatPalette.primaryText }}>
                    {article.title}
                </h3>
                <p className="mb-6 hidden flex-grow text-sm sm:line-clamp-3 sm:block" style={{ color: chatPalette.secondaryText }}>
                    {article.excerpt}
                </p>
                <button onClick={() => onReadMoreClick(article)} className="mt-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide transition-[gap] sm:gap-2 sm:text-sm sm:group-hover:gap-3" style={{ color: chatPalette.linkText }}>
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

  const newsArticles = articles.filter(
    article =>
      article.type === 'news' &&
      !hasUnsafePublicPlaceholder(article.title, article.excerpt, article.content)
  );
  const storedReadingStyle = ((settings.content as any).readingStyle || {}) as Partial<typeof defaultReadingStyle>;
  const readingStyle = {
    ...defaultReadingStyle,
    cardOpacity: storedReadingStyle.cardOpacity ?? defaultReadingStyle.cardOpacity,
    backgroundColor: defaultReadingStyle.backgroundColor,
    backgroundOpacity: defaultReadingStyle.backgroundOpacity,
    accentColor: defaultReadingStyle.accentColor,
    accentOpacity: defaultReadingStyle.accentOpacity,
  };
  const sectionBackground = `radial-gradient(circle at 0% 12%, ${NewsPalette.primaryCyan}33, transparent 30%), radial-gradient(circle at 100% 15%, ${NewsPalette.brightAccent}22, transparent 28%), linear-gradient(135deg, ${NewsPalette.softCyanSurface}, ${NewsPalette.mainCard})`;
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
        <GoogleAd
          variant="display"
          label="Advertisement"
          pageType="news-list"
          realContentCardCount={newsArticles.length}
          isContentLoaded={true}
          className="mb-12 rounded-[2rem] border p-4 shadow-sm backdrop-blur-xl"
          style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder }}
        />

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
            className={`latest-news-mobile-two-column grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
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
                <GoogleAd
                  variant="inFeed"
                  label="Sponsored"
                  pageType="news-list"
                  realContentCardCount={newsArticles.length}
                  isContentLoaded={true}
                  className="col-span-2 rounded-[1.25rem] border p-4 shadow-sm md:col-span-2 lg:col-span-3 lg:rounded-[2rem] lg:p-5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
        
        <button onClick={onOpenHub} className="md:hidden w-full mt-8 border py-3 rounded-lg font-semibold" style={{ backgroundColor: chatPalette.activeBlue, borderColor: chatPalette.activeBlue, color: chatPalette.primaryText }}>
            Open News
        </button>

        <GoogleAd
          variant="display"
          label="Advertisement"
          pageType="news-list"
          realContentCardCount={newsArticles.length}
          isContentLoaded={true}
          className="mt-12 rounded-[2rem] border p-4 shadow-sm backdrop-blur-xl"
          style={{ backgroundColor: 'rgba(255,255,255,0.86)', borderColor: chatPalette.cardBorder }}
        />
      </div>
    </section>
  );
};

export default LatestNews;
