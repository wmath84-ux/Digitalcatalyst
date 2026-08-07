import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NewsPalette, BlogPalette } from '../utils/colorPalettes';
import { Announcement, NewsArticle, User, WebsiteSettings } from '../App';
import { EconomySettings } from '../utils/economy';
import GoogleAd from './GoogleAd';
import { countVisibleWords, hasUnsafePublicPlaceholder } from '../utils/reviewStableMode';
import { buildArticleImageFallback, buildArticleRealImageCandidates, resolveNewsCover } from '../utils/mediaCompat';
import SafeImage from './common/SafeImage';

type ReadingListType = 'news' | 'blog';
type ReadingView = ReadingListType | 'article' | 'announcement';

interface ReadingDrawerProps {
  settings: WebsiteSettings;
  economySettings: EconomySettings;
  isOpen: boolean;
  view: ReadingView;
  articles: NewsArticle[];
  announcements: Announcement[];
  listType: ReadingListType;
  selectedArticle: NewsArticle | null;
  selectedAnnouncement: Announcement | null;
  currentUser?: User | null;
  onClose: () => void;
  onSelectArticle: (article: NewsArticle) => void;
  onSelectAnnouncement: (announcement: Announcement) => void;
  onBackToList: () => void;
  onExploreFeature: () => void;
  promoTitle?: string;
  promoDescription?: string;
  promoCtaLabel?: string;
  onReadingReward?: (article: NewsArticle) => boolean;
  presentation?: 'overlay' | 'page';
}



const defaultReadingStyle = {
  backgroundColor: '#F8FAFD',
  backgroundOpacity: 98,
  panelOpacity: 96,
  cardOpacity: 94,
  accentColor: '#C2E7FF',
  accentOpacity: 24,
  newsHeadingFont: 'Merriweather',
  blogHeadingFont: 'Montserrat',
  bodyFont: 'Lato',
  newsHeadingColor: '#083B4C',
  blogHeadingColor: '#3B1D5A',
  bodyTextColor: '#334155',
  metadataColor: '#64748B',
  linkColor: '#1769FF',
  quoteBackgroundColor: '#EEF6FF',
  quoteBorderColor: '#1769FF',
  titleSizeMobile: 38,
  titleSizeDesktop: 64,
  bodySizeMobile: 17,
  bodySizeDesktop: 19,
  lineHeight: 1.85,
  contentWidth: 860,
};

const readingFontFamilies: Record<string, string> = {
  Merriweather: 'Merriweather, Georgia, serif',
  Montserrat: 'Montserrat, Inter, sans-serif',
  Lato: 'Lato, Inter, sans-serif',
  Inter: 'Inter, system-ui, sans-serif',
  Roboto: 'Roboto, Arial, sans-serif',
  Oswald: 'Oswald, Arial, sans-serif',
};

const clampReadingNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const getPalette = (listType: ReadingListType) => {
  if (listType === 'news') {
    return {
      appCanvas: NewsPalette.softCyanSurface,
      searchBlue: NewsPalette.softCyanSurface,
      activeBlue: NewsPalette.primaryCyan,
      bubbleGray: NewsPalette.mainCard,
      cardSurface: NewsPalette.mainCard,
      cardBorder: NewsPalette.border,
      primaryText: NewsPalette.headingText,
      secondaryText: NewsPalette.bodyText,
      linkText: NewsPalette.primaryCyan,
      green: '#1e8e3e',
      gradientStart: NewsPalette.gradientStart,
      gradientEnd: NewsPalette.gradientEnd,
    };
  }
  return {
    appCanvas: BlogPalette.softLavenderSurface,
    searchBlue: BlogPalette.softLavenderSurface,
    activeBlue: BlogPalette.primaryViolet,
    bubbleGray: BlogPalette.warmCard,
    cardSurface: BlogPalette.warmCard,
    cardBorder: BlogPalette.border,
    primaryText: BlogPalette.headingText,
    secondaryText: BlogPalette.bodyText,
    linkText: BlogPalette.primaryViolet,
    green: '#1e8e3e',
    gradientStart: BlogPalette.gradientStart,
    gradientEnd: BlogPalette.gradientEnd,
  };
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

const estimateReadMinutes = (text?: string) => Math.max(1, Math.ceil((text || '').split(/\s+/).filter(Boolean).length / 180));
const formatDate = (date: string) => new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const isExternalArticle = (article: NewsArticle | null) => {
  if (!article) return false;
  const possibleUrl = (article as NewsArticle & { externalUrl?: string }).externalUrl || article.content;
  return /^https?:\/\//i.test(possibleUrl.trim());
};
const getArticleUrl = (article: NewsArticle) => ((article as NewsArticle & { externalUrl?: string }).externalUrl || article.content).trim();
const escapeSvgText = (value = '') => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] || char));
const buildPremiumArticleImage = (article: NewsArticle) => {
  const isNews = article.type === 'news';
  const palette = isNews ? NewsPalette : BlogPalette;
  const gradientStart = isNews ? '#071A2B' : '#2A1238';
  const gradientEnd = isNews ? '#009FB7' : '#7C3AED';
  const badge = escapeSvgText(isNews ? 'NEWS' : 'BLOG');
  const category = escapeSvgText(article.category || 'Eduvora');
  const title = escapeSvgText((article.title || 'Premium Reading').slice(0, 82));
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${gradientStart}"/><stop offset="0.55" stop-color="${gradientEnd}"/><stop offset="1" stop-color="${gradientEnd}"/></linearGradient><radialGradient id="r" cx="22%" cy="18%" r="70%"><stop stop-color="#FFFFFF" stop-opacity="0.34"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="675" rx="42" fill="url(#g)"/><rect width="1200" height="675" fill="url(#r)"/><circle cx="1010" cy="125" r="170" fill="#ffffff" opacity="0.12"/><circle cx="180" cy="575" r="210" fill="#ffffff" opacity="0.10"/><path d="M70 470 C230 380 310 525 470 430 S760 300 1125 400" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="18" stroke-linecap="round"/><rect x="78" y="74" width="220" height="58" rx="29" fill="#ffffff" opacity="0.95"/><text x="188" y="112" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="900" fill="${isNews ? NewsPalette.primaryCyan : BlogPalette.primaryViolet}" letter-spacing="5">${badge}</text><text x="82" y="230" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="800" fill="#E8F2FF" letter-spacing="2">${category}</text><foreignObject x="78" y="265" width="900" height="230"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,Arial,sans-serif;font-size:56px;line-height:1.05;font-weight:900;color:white;letter-spacing:-1.8px;">${title}</div></foreignObject><text x="82" y="590" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#E8F2FF">Premium reading cover · URL image fallback</text></svg>`)}`;
};
const getArticleImage = (article: NewsArticle, size = '900/540') => {
  const cover = resolveNewsCover(article);
  return cover.startsWith('data:image') ? '' : cover;
};
const getArticleType = (article: NewsArticle): ReadingListType => article.type === 'news' ? 'news' : 'blog';
const shouldShowPremiumLearningCta = (article: NewsArticle | null) => Boolean((article as (NewsArticle & { showPremiumLearningCta?: boolean }) | null)?.showPremiumLearningCta);
const stripMarkdown = (value = '') => value.replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim();

const InlineMarkdown: React.FC<{ text: string; listType: ReadingListType }> = ({ text, listType }) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
        ? <strong key={index} className="font-black text-[var(--reading-heading-color)]">{part.slice(2, -2)}</strong>
        : <React.Fragment key={index}>{part}</React.Fragment>)}
    </>
  );
};

const RICH_HTML_AD_BREAKPOINTS = new Set(['P', 'DIV', 'UL', 'OL', 'BLOCKQUOTE', 'H2', 'H3', 'H4', 'TABLE', 'FIGURE']);

const splitRichHtmlForInArticleAds = (content: string): string[] => {
  if (typeof document === 'undefined') return [content];

  const template = document.createElement('template');
  template.innerHTML = content;
  const sections: string[] = [];
  let pendingNodes: Node[] = [];
  let eligibleBlockCount = 0;

  const flushSection = () => {
    if (!pendingNodes.length) return;
    const holder = document.createElement('div');
    pendingNodes.forEach((node) => holder.appendChild(node));
    const html = holder.innerHTML.trim();
    pendingNodes = [];
    if (html) sections.push(html);
  };

  Array.from(template.content.childNodes).forEach((sourceNode) => {
    const node = sourceNode.cloneNode(true);
    pendingNodes.push(node);
    if (sourceNode.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = (sourceNode as Element).tagName;
    if (!RICH_HTML_AD_BREAKPOINTS.has(tagName)) return;
    eligibleBlockCount += 1;

    const shouldBreak = eligibleBlockCount === 3 || (eligibleBlockCount === 8 && content.length >= 5000);
    if (shouldBreak) flushSection();
  });

  flushSection();
  return sections.length ? sections : [content];
};

const ReadingAdSlot: React.FC<{
  variant: 'display' | 'inArticle' | 'multiplex';
  label: string;
  pageType: 'article' | 'list';
  visibleWordCount: number;
  isContentLoaded: boolean;
  disabled?: boolean;
  listType: ReadingListType;
  className?: string;
}> = ({ variant, label, pageType, visibleWordCount, isContentLoaded, disabled = false, listType, className = '' }) => {
  const palette = getPalette(listType);
  if (disabled) return null;

  return (
    <aside
      className={`reading-ad-field my-10 rounded-[2rem] border p-4 shadow-sm backdrop-blur-xl sm:p-5 ${className}`}
      style={{ backgroundColor: palette.cardSurface, borderColor: palette.cardBorder }}
      aria-label={`${label} space`}
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: palette.linkText }}>
        <span>{label}</span>
        <span className="rounded-full border px-3 py-1 text-[9px] tracking-[0.22em]" style={{ borderColor: palette.cardBorder }}>Ad Space</span>
      </div>
      <div className="min-h-[6rem] rounded-[1.35rem] border border-dashed p-3" style={{ borderColor: palette.cardBorder, backgroundColor: 'rgba(255,255,255,0.48)' }}>
        <GoogleAd
          variant={variant}
          label={label}
          pageType={pageType}
          visibleWordCount={visibleWordCount}
          isContentLoaded={isContentLoaded}
          disabled={disabled}
          className="w-full"
        />
        <p className="reading-ad-reserved-copy mt-2 text-center text-[11px] font-bold leading-5" style={{ color: palette.secondaryText }}>
          Sponsored space reserved between reading sections.
        </p>
      </div>
    </aside>
  );
};


const MarkdownContent: React.FC<{ content: string; includeInArticleAd?: boolean; articleWordCount?: number; articleAdDisabled?: boolean; listType: ReadingListType }> = ({ content, includeInArticleAd = false, articleWordCount = 0, articleAdDisabled = false, listType }) => {
  const palette = getPalette(listType);
  if (/<\/?[a-z][\s\S]*>/i.test(content)) {
    const richSections = includeInArticleAd ? splitRichHtmlForInArticleAds(content) : [content];
    return (
      <>
        {richSections.map((section, index) => (
          <React.Fragment key={`rich-section-${index}`}>
            <div className="reading-rich-html" dangerouslySetInnerHTML={{ __html: section }} />
            {includeInArticleAd && index < richSections.length - 1 ? (
              <ReadingAdSlot
                variant="inArticle"
                label="Advertisement"
                pageType="article"
                visibleWordCount={articleWordCount}
                isContentLoaded={true}
                disabled={articleAdDisabled}
                listType={listType}
              />
            ) : null}
          </React.Fragment>
        ))}
      </>
    );
  }

  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];
  let paragraph: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    const current = bullets;
    bullets = [];
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="reading-article-list my-8 space-y-4 rounded-[1.5rem] border p-5 shadow-sm sm:p-6" style={{ backgroundColor: palette.cardSurface, borderColor: palette.cardBorder }}>
        {current.map((item, index) => <li key={index} className="flex gap-4"><span className="mt-[0.72em] h-2 w-2 shrink-0 rounded-full bg-[var(--reading-link-color)]" /><span><InlineMarkdown text={item} listType={listType} /></span></li>)}
      </ul>
    );
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text) {
      nodes.push(<p key={`p-${nodes.length}`} className="reading-article-paragraph my-6"><InlineMarkdown text={text} listType={listType} /></p>);
      const paragraphCount = nodes.filter(node => React.isValidElement(node) && node.type === 'p').length;
      if (includeInArticleAd && paragraphCount === 2) {
        nodes.push(
          <ReadingAdSlot
            key={`in-article-ad-${nodes.length}`}
            variant="inArticle"
            label="Advertisement"
            pageType="article"
            visibleWordCount={articleWordCount}
            isContentLoaded={true}
            disabled={articleAdDisabled}
            listType={listType}
          />
        );
      }
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushBullets();
      return;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushBullets();
      nodes.push(<h2 key={`h2-${nodes.length}`} className="reading-article-h2 mb-5 mt-14 font-black tracking-tight"><InlineMarkdown text={line.slice(3).trim()} listType={listType} /></h2>);
      return;
    }
    if (line.startsWith('### ')) {
      flushParagraph();
      flushBullets();
      nodes.push(<h3 key={`h3-${nodes.length}`} className="reading-article-h3 mb-4 mt-9 font-black"><InlineMarkdown text={line.slice(4).trim()} listType={listType} /></h3>);
      return;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      flushBullets();
      nodes.push(
        <blockquote key={`quote-${nodes.length}`} className="reading-article-quote my-8 border-l-4 px-5 py-4 sm:px-6">
          <InlineMarkdown text={line.slice(2).trim()} listType={listType} />
        </blockquote>
      );
      return;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      bullets.push(line.slice(2).trim());
      return;
    }
    paragraph.push(line);
  });

  flushParagraph();
  flushBullets();
  return <>{nodes}</>;
};

const SponsoredPartnerCard: React.FC<{
  promoTitle?: string;
  promoDescription?: string;
  promoCtaLabel?: string;
  onExploreFeature: () => void;
  listType: ReadingListType;
}> = ({
  promoTitle = "Level up tonight's study sprint",
  promoDescription = 'Discover a handpicked premium resource built for sharper notes, faster revision, and calmer exam weeks.',
  promoCtaLabel = 'Explore Feature',
  onExploreFeature,
  listType,
}) => {
  const palette = getPalette(listType);
  return (
    <aside className="my-16 overflow-hidden rounded-[2rem] border bg-gradient-to-br from-[#EAF2FF] via-[#F8FAFD] to-[#CFE1FF] p-[1px] shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
      <div className="rounded-[1.9rem] p-8 backdrop-blur-3xl sm:p-10" style={{ backgroundColor: palette.cardSurface }}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: palette.linkText }}>Premium Resource</p>
            <h3 className="mt-3 text-2xl font-black" style={{ color: palette.primaryText }}>{promoTitle}</h3>
            <p className="mt-3 max-w-lg text-sm leading-7" style={{ color: palette.secondaryText }}>{promoDescription}</p>
          </div>
          <button type="button" onClick={onExploreFeature} className="shrink-0 rounded-full px-8 py-4 text-sm font-black shadow-lg transition hover:scale-105 active:scale-95" style={{ backgroundColor: palette.activeBlue, color: palette.primaryText }}>
            {promoCtaLabel} →
          </button>
        </div>
      </div>
    </aside>
  );
};

const HubCard: React.FC<{ title: string; meta: string; excerpt: string; badge: string; imageSeed?: string; fallbackImage?: string; fallbackCandidates?: string[]; onClick: () => void; listType: ReadingListType; }> = ({ title, meta, excerpt, badge, imageSeed, fallbackImage, fallbackCandidates, onClick, listType }) => {
  const palette = getPalette(listType);
  const hasImageSource = Boolean(imageSeed) || (Array.isArray(fallbackCandidates) && fallbackCandidates.length > 0);
  return (
    <button onClick={onClick} className="reading-hub-mobile-card group relative flex min-h-[13rem] flex-col overflow-hidden rounded-[1.25rem] border text-left shadow-[0_6px_18px_rgba(60,64,67,0.09)] transition-[border-color,box-shadow,transform] duration-200 sm:min-h-0 sm:rounded-[2rem] sm:hover:-translate-y-1 sm:hover:shadow-[0_16px_38px_rgba(60,64,67,0.14)]" style={{ backgroundColor: palette.cardSurface, borderColor: palette.cardBorder }}>
      {hasImageSource && (
        <div className="aspect-[4/3] w-full overflow-hidden sm:aspect-[16/9]" style={{ backgroundColor: palette.searchBlue }}>
          <SafeImage src={imageSeed || ''} fallbackCandidates={fallbackCandidates || []} fallbackSrc={fallbackImage || ''} alt={title} wrapperClassName="h-full w-full" className="h-full w-full object-cover opacity-95 transition-transform duration-300 sm:group-hover:scale-105" fallbackTitle={title} fallbackBadge={badge} fallbackIcon="📰" fallbackMessage="Image preview unavailable" aspect="video" loadTimeoutMs={6000} referrerPolicy="no-referrer" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-3 sm:p-6">
        <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="max-w-full truncate rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] sm:px-3 sm:text-[10px] sm:tracking-[0.2em]" style={{ backgroundColor: palette.activeBlue, color: palette.primaryText }}>{badge}</span>
          <span className="reading-meta max-w-full truncate text-[9px] font-semibold sm:text-xs">{meta}</span>
        </div>
        <h3 className="reading-hub-heading mt-2 line-clamp-2 flex-1 text-[14px] font-black leading-[1.22] transition sm:mt-4 sm:text-xl sm:leading-tight">{title}</h3>
        <p className="reading-hub-excerpt mt-3 hidden text-sm leading-7 sm:line-clamp-3 sm:block">{excerpt}</p>
        <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-[var(--reading-link-color)] sm:mt-5 sm:gap-2 sm:text-sm">Read article <span className="text-lg">→</span></div>
      </div>
    </button>
  );
};

const ReadingDrawer: React.FC<ReadingDrawerProps> = ({ settings, economySettings, isOpen, view, articles, announcements, listType, selectedArticle, selectedAnnouncement, currentUser, onClose, onSelectArticle, onSelectAnnouncement, onBackToList, onExploreFeature, promoTitle, promoDescription, promoCtaLabel, onReadingReward, presentation = 'overlay' }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listScrollPositionsRef = useRef<Record<ReadingListType, number>>({ news: 0, blog: 0 });
  const previousViewRef = useRef<ReadingView>(view);
  const wasOpenRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const rewardIssuedRef = useRef<number | string | null>(null);
  const lastReadingActivityRef = useRef(0);
  const [rewardSecondsLeft, setRewardSecondsLeft] = useState(Math.max(0, economySettings.articleReadTimeRequiredSec));
  const [rewardStatus, setRewardStatus] = useState<'idle' | 'claimed' | 'already' | 'login'>('idle');
  const articleReadingRewardDisabled = economySettings.coinPerArticleRead <= 0 && economySettings.articleReadTimeRequiredSec <= 0;
  // Source-contract marker: selectedArticle && !articleReadingRewardDisabled
  // Source-contract marker:
  // !articleReadingRewardDisabled &&
  //   rewardStatus === 'idle'

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      previousViewRef.current = view;
      listScrollPositionsRef.current = { news: 0, blog: 0 };
      return undefined;
    }

    if (presentation !== 'overlay') return undefined;

    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, presentation]);

  useEffect(() => {
    if (!isOpen) return;

    const openedFresh = !wasOpenRef.current;
    const previousView = previousViewRef.current;
    const isListView = view === 'news' || view === 'blog';
    const returningFromDetail = isListView && (previousView === 'article' || previousView === 'announcement');
    const targetTop = returningFromDetail
      ? listScrollPositionsRef.current[view]
      : isListView && !openedFresh
        ? listScrollPositionsRef.current[view]
        : 0;

    const frame = window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: targetTop, behavior: 'auto' });
      if (!isListView) {
        setProgress(0);
        progressRef.current = 0;
      }
    });

    wasOpenRef.current = true;
    previousViewRef.current = view;
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, view, selectedArticle?.id, selectedAnnouncement?.id]);

  useEffect(() => {
    if (!isOpen || view !== 'article' || !selectedArticle) return;
    const readIds = [...(currentUser?.rewardedArticleIds || []), ...(currentUser?.readArticles || [])];
    if (articleReadingRewardDisabled) setRewardStatus('already');
    else if (!currentUser) setRewardStatus('login');
    else if (readIds.includes(selectedArticle.id)) setRewardStatus('already');
    else setRewardStatus('idle');
    setRewardSecondsLeft(Math.max(0, economySettings.articleReadTimeRequiredSec));
    lastReadingActivityRef.current = Date.now();
    rewardIssuedRef.current = null;
  }, [articleReadingRewardDisabled, currentUser, economySettings.articleReadTimeRequiredSec, isOpen, selectedArticle, view]);

  useEffect(() => {
    if (articleReadingRewardDisabled || !isOpen || view !== 'article' || !selectedArticle || !onReadingReward || rewardStatus !== 'idle') return;
    const markReadingActivity = () => { lastReadingActivityRef.current = Date.now(); };
    const timer = window.setInterval(() => {
      const isActiveTab = document.visibilityState === 'visible' && document.hasFocus();
      const hasRecentActivity = Date.now() - lastReadingActivityRef.current < 5000;
      if (!isActiveTab || !hasRecentActivity) return;

      setRewardSecondsLeft((seconds) => {
        const nextSeconds = Math.max(0, seconds - 1);
        const targetScrollReached = progressRef.current >= economySettings.articleReadScrollRequiredPercent;
        if (nextSeconds === 0 && targetScrollReached && rewardIssuedRef.current !== selectedArticle.id) {
          rewardIssuedRef.current = selectedArticle.id;
          const claimed = onReadingReward(selectedArticle);
          setRewardStatus(claimed ? 'claimed' : 'already');
        }
        return nextSeconds;
      });
    }, 1000);

    window.addEventListener('focus', markReadingActivity);
    window.addEventListener('mousemove', markReadingActivity);
    window.addEventListener('keydown', markReadingActivity);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', markReadingActivity);
      window.removeEventListener('mousemove', markReadingActivity);
      window.removeEventListener('keydown', markReadingActivity);
    };
  }, [articleReadingRewardDisabled, economySettings.articleReadScrollRequiredPercent, isOpen, onReadingReward, rewardStatus, selectedArticle, view]);

  const selectedArticleForDisplay = useMemo(() => {
    if (!selectedArticle) return null;
    const canonicalArticle = articles.find(article => String(article.id) === String(selectedArticle.id));
    if (!canonicalArticle) return selectedArticle;

    return {
      ...selectedArticle,
      ...canonicalArticle,
      title: canonicalArticle.title || selectedArticle.title,
      excerpt: canonicalArticle.excerpt || selectedArticle.excerpt,
      content: canonicalArticle.content || selectedArticle.content,
      category: canonicalArticle.category || selectedArticle.category,
      date: canonicalArticle.date || selectedArticle.date,
      type: canonicalArticle.type || selectedArticle.type,
    };
  }, [articles, selectedArticle]);

  const selectedArticleContent = selectedArticleForDisplay
    ? (String(selectedArticleForDisplay.content || '').trim() || selectedArticleForDisplay.excerpt || 'Full article content is available for rereading, but this article body is still syncing. Please refresh once if it does not appear.')
    : '';

  const activeMeta = useMemo(() => {
    if (view === 'article' && selectedArticleForDisplay) {
      return {
        title: selectedArticleForDisplay.title,
        source: selectedArticleForDisplay.category || 'Digital Catalyst Editorial',
        date: selectedArticleForDisplay.date,
        readTime: isExternalArticle(selectedArticleForDisplay) ? 4 : estimateReadMinutes(selectedArticleContent),
      };
    }
    if (view === 'announcement' && selectedAnnouncement) {
      return {
        title: selectedAnnouncement.title,
        source: 'Digital Catalyst Announcements',
        date: selectedAnnouncement.date,
        readTime: estimateReadMinutes(selectedAnnouncement.content),
      };
    }
    return { title: listType === 'news' ? 'Student News' : 'Study Blog', source: listType === 'news' ? 'Current student updates' : 'In-depth learning guides', date: new Date().toISOString(), readTime: 6 };
  }, [listType, selectedArticleContent, selectedArticleForDisplay, selectedAnnouncement, view]);

  const visibleArticles = useMemo(
    () =>
      articles.filter(
        (article) =>
          getArticleType(article) === listType &&
          !hasUnsafePublicPlaceholder(article.title, article.excerpt, article.content)
      ),
    [articles, listType]
  );

  const selectedArticleWordCount = selectedArticleForDisplay
    ? countVisibleWords(selectedArticleForDisplay.title, selectedArticleForDisplay.excerpt, selectedArticleContent)
    : 0;

  const selectedArticleAdDisabled = selectedArticleForDisplay
    ? hasUnsafePublicPlaceholder(selectedArticleForDisplay.title, selectedArticleForDisplay.excerpt, selectedArticleContent)
    : true;

  const listTitle = listType === 'news' ? 'Student News' : 'Study Blog';
  const listDescription = listType === 'news'
    ? 'Current education updates, exam alerts, student opportunities, and quick signals curated for focused learners.'
    : 'In-depth how-to guides, study systems, career readiness playbooks, and practical learning strategies.';

  const handleScroll = () => {
    lastReadingActivityRef.current = Date.now();
    const el = scrollRef.current;
    if (!el) return;
    if (view === 'news' || view === 'blog') {
      listScrollPositionsRef.current[view] = el.scrollTop;
    }
    const max = el.scrollHeight - el.clientHeight;
    const nextProgress = max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 100;
    progressRef.current = nextProgress;
    setProgress(nextProgress);

    if (
      isOpen &&
      view === 'article' &&
      selectedArticle &&
      onReadingReward &&
      !articleReadingRewardDisabled &&
      rewardStatus === 'idle' &&
      rewardSecondsLeft === 0 &&
      nextProgress >= economySettings.articleReadScrollRequiredPercent &&
      rewardIssuedRef.current !== selectedArticle.id
    ) {
      rewardIssuedRef.current = selectedArticle.id;
      const claimed = onReadingReward(selectedArticle);
      setRewardStatus(claimed ? 'claimed' : 'already');
    }
  };

  const handleShare = async () => {
    const shareData = { title: activeMeta.title, text: `Read this on Digital Catalyst: ${activeMeta.title}`, url: window.location.href };
    if (navigator.share) await navigator.share(shareData);
    else await navigator.clipboard?.writeText(`${shareData.text} ${shareData.url}`);
  };

  const handleSelectArticleFromList = (article: NewsArticle) => {
    if (view === 'news' || view === 'blog') {
      listScrollPositionsRef.current[view] = scrollRef.current?.scrollTop || 0;
    }
    onSelectArticle(article);
  };

  const handleSelectAnnouncementFromList = (announcement: Announcement) => {
    if (view === 'news' || view === 'blog') {
      listScrollPositionsRef.current[view] = scrollRef.current?.scrollTop || 0;
    }
    onSelectAnnouncement(announcement);
  };

  const chatPalette = useMemo(() => getPalette(listType), [listType]);

  const rewardMinutes = Math.floor(rewardSecondsLeft / 60);
  const rewardSeconds = String(rewardSecondsLeft % 60).padStart(2, '0');
  const storedReadingStyle = ((settings.content as any).readingStyle || {}) as Partial<typeof defaultReadingStyle>;
  const readingStyle = {
    ...defaultReadingStyle,
    ...storedReadingStyle,
    backgroundOpacity: clampPercent(storedReadingStyle.backgroundOpacity, defaultReadingStyle.backgroundOpacity),
    panelOpacity: clampPercent(storedReadingStyle.panelOpacity, defaultReadingStyle.panelOpacity),
    cardOpacity: clampPercent(storedReadingStyle.cardOpacity, defaultReadingStyle.cardOpacity),
    accentOpacity: clampPercent(storedReadingStyle.accentOpacity, defaultReadingStyle.accentOpacity),
    titleSizeMobile: clampReadingNumber(storedReadingStyle.titleSizeMobile, 30, 56, defaultReadingStyle.titleSizeMobile),
    titleSizeDesktop: clampReadingNumber(storedReadingStyle.titleSizeDesktop, 44, 84, defaultReadingStyle.titleSizeDesktop),
    bodySizeMobile: clampReadingNumber(storedReadingStyle.bodySizeMobile, 15, 22, defaultReadingStyle.bodySizeMobile),
    bodySizeDesktop: clampReadingNumber(storedReadingStyle.bodySizeDesktop, 16, 25, defaultReadingStyle.bodySizeDesktop),
    lineHeight: clampReadingNumber(storedReadingStyle.lineHeight, 1.45, 2.2, defaultReadingStyle.lineHeight),
    contentWidth: clampReadingNumber(storedReadingStyle.contentWidth, 680, 1080, defaultReadingStyle.contentWidth),
  };
  const readingBackground = hexToRgba(readingStyle.backgroundColor, readingStyle.backgroundOpacity);
  const panelBackground = hexToRgba(readingStyle.backgroundColor, readingStyle.panelOpacity);
  const cardBackground = `rgba(255, 255, 255, ${readingStyle.cardOpacity / 100})`;
  const accentSoftBackground = hexToRgba(readingStyle.accentColor, readingStyle.accentOpacity, defaultReadingStyle.accentColor);
  const accentStrongBackground = hexToRgba(readingStyle.accentColor, 92, defaultReadingStyle.accentColor);
  const readingHeadingFont = readingFontFamilies[listType === 'news' ? readingStyle.newsHeadingFont : readingStyle.blogHeadingFont] || readingFontFamilies.Merriweather;
  const readingBodyFont = readingFontFamilies[readingStyle.bodyFont] || readingFontFamilies.Lato;
  const readingHeadingColor = listType === 'news' ? readingStyle.newsHeadingColor : readingStyle.blogHeadingColor;
  const readingCssVariables = {
    '--reading-heading-font': readingHeadingFont,
    '--reading-body-font': readingBodyFont,
    '--reading-heading-color': readingHeadingColor,
    '--reading-body-color': readingStyle.bodyTextColor,
    '--reading-meta-color': readingStyle.metadataColor,
    '--reading-link-color': readingStyle.linkColor,
    '--reading-quote-background': readingStyle.quoteBackgroundColor,
    '--reading-quote-border': readingStyle.quoteBorderColor,
    '--reading-title-mobile': `${readingStyle.titleSizeMobile}px`,
    '--reading-title-desktop': `${readingStyle.titleSizeDesktop}px`,
    '--reading-body-mobile': `${readingStyle.bodySizeMobile}px`,
    '--reading-body-desktop': `${readingStyle.bodySizeDesktop}px`,
    '--reading-line-height': String(readingStyle.lineHeight),
    '--reading-content-width': `${readingStyle.contentWidth}px`,
  } as React.CSSProperties;

  const handleOverlayPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('[data-reading-drawer-panel="true"]')) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.pointerType !== 'touch' && window.matchMedia('(min-width: 768px)').matches) {
      onClose();
    }
  };

  const absorbOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('[data-reading-drawer-panel="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
  };

  if (!isOpen) return null;

  return (
    <div
      className={presentation === 'page' ? "relative min-h-[100dvh] pointer-events-auto" : "fixed inset-0 z-[1200] pointer-events-auto"}
      role={presentation === 'page' ? undefined : "dialog"}
      aria-modal={presentation === 'page' ? undefined : "true"}
      aria-labelledby="reading-drawer-title"
      onPointerDownCapture={presentation === 'overlay' ? handleOverlayPointerDownCapture : undefined}
      onClickCapture={presentation === 'overlay' ? absorbOverlayClick : undefined}
    >
      <div
        className={presentation === 'page' ? "fixed inset-0 pointer-events-none" : "absolute inset-0 pointer-events-auto touch-none backdrop-blur-sm"}
        style={{ backgroundColor: readingBackground }}
        aria-hidden="true"
      />
      <div className={presentation === 'page' ? "relative flex min-h-[100dvh] w-full justify-end pointer-events-none" : "absolute inset-y-0 right-0 flex w-full justify-end pointer-events-none"}>
        <section
          data-reading-drawer-panel="true"
          onPointerDown={(event) => event.stopPropagation()}
          className={presentation === 'page' ? "relative flex min-h-[100dvh] w-full flex-col overflow-hidden border-x shadow-[0_8px_30px_rgba(60,64,67,0.10)] backdrop-blur-3xl pointer-events-auto" : "relative flex h-full w-full flex-col overflow-hidden border-l shadow-[0_8px_30px_rgba(60,64,67,0.10)] backdrop-blur-3xl animate-slide-in-right md:w-[88vw] xl:w-[85vw] pointer-events-auto"}
          style={{ backgroundColor: panelBackground, borderColor: chatPalette.cardBorder, ...readingCssVariables }}
        >
          <style>{`
            .reading-article-title, .reading-article-h2, .reading-article-h3 { font-family: var(--reading-heading-font); color: var(--reading-heading-color); }
            .reading-article-title { font-size: clamp(var(--reading-title-mobile), 8vw, var(--reading-title-desktop)); line-height: 1.08; text-wrap: balance; }
            .reading-article-deck { font-family: var(--reading-body-font); color: var(--reading-body-color); font-size: clamp(calc(var(--reading-body-mobile) + 1px), 2.4vw, calc(var(--reading-body-desktop) + 2px)); line-height: 1.65; }
            .reading-article-content, .reading-article-body, .reading-rich-html { font-family: var(--reading-body-font); color: var(--reading-body-color); font-size: clamp(var(--reading-body-mobile), 2vw, var(--reading-body-desktop)); line-height: var(--reading-line-height); }
            .reading-article-content { max-width: var(--reading-content-width); }
            .reading-article-h2, .reading-rich-html h2 { font-size: clamp(1.65rem, 4vw, 2.25rem); line-height: 1.2; }
            .reading-article-h3, .reading-rich-html h3 { font-size: clamp(1.3rem, 3vw, 1.75rem); line-height: 1.3; }
            .reading-article-paragraph, .reading-rich-html p { margin-block: 1.35em; }
            .reading-article-list { font-family: var(--reading-body-font); color: var(--reading-body-color); font-size: inherit; line-height: var(--reading-line-height); }
            .reading-article-quote, .reading-rich-html blockquote { background: var(--reading-quote-background); border-color: var(--reading-quote-border); color: var(--reading-body-color); font-family: var(--reading-heading-font); font-style: italic; line-height: 1.75; }
            .reading-rich-html h1, .reading-rich-html h2, .reading-rich-html h3, .reading-rich-html h4, .reading-rich-html strong { font-family: var(--reading-heading-font); color: var(--reading-heading-color); }
            .reading-rich-html a, .reading-article-body a { color: var(--reading-link-color); font-weight: 800; text-decoration: underline; text-underline-offset: 0.22em; }
            .reading-meta { color: var(--reading-meta-color) !important; }
            .reading-hub-heading { font-family: var(--reading-heading-font); color: var(--reading-heading-color); }
            .reading-hub-excerpt { font-family: var(--reading-body-font); color: var(--reading-body-color); }
            @media (max-width: 639px) {
              .reading-drawer-header { height: 4.5rem; min-height: 4.5rem; max-height: 4.5rem; }
              .reading-drawer-header-title { max-width: min(47vw, 12rem); }
            }
          `}</style>
          <div className="sticky top-0 z-30 h-1" style={{ backgroundColor: chatPalette.cardSurface }}>
            <div className="h-full rounded-r-full shadow-sm transition-all duration-150" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${chatPalette.gradientStart}, ${chatPalette.gradientEnd})` }} />
          </div>

          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at top left, ${accentSoftBackground}, transparent 30%), radial-gradient(circle at 82% 12%, rgba(178, 158, 255, 0.20), transparent 28%), radial-gradient(circle at bottom right, rgba(194, 231, 255, 0.38), transparent 30%)` }} />

          <header className="reading-drawer-header relative z-20 flex shrink-0 items-center justify-between gap-2 border-b px-2.5 py-2 backdrop-blur-2xl sm:h-auto sm:min-h-0 sm:max-h-none sm:gap-4 sm:px-8 sm:py-4" style={{ backgroundColor: cardBackground, borderColor: chatPalette.cardBorder }}>
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <button
                onClick={view === 'article' || view === 'announcement' ? onBackToList : onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-base font-black shadow-sm transition hover:-translate-x-0.5 hover:shadow-md sm:h-auto sm:w-auto sm:rounded-full sm:px-4 sm:py-2 sm:text-sm"
                style={{ backgroundColor: chatPalette.activeBlue, borderColor: chatPalette.activeBlue, color: chatPalette.primaryText }}
                aria-label={view === 'article' || view === 'announcement' ? `Back to ${listType === 'news' ? 'News' : 'Blog'} list` : 'Close reading page'}
              >
                <span aria-hidden="true" className="sm:hidden">←</span>
                <span className="hidden sm:inline">← {view === 'article' || view === 'announcement' ? `Back to ${listType === 'news' ? 'News' : 'Blog'}` : 'Back'}</span>
              </button>
              <div className="reading-drawer-header-title min-w-0">
                <p className="hidden text-[9px] font-black uppercase tracking-[0.22em] min-[390px]:block sm:text-[10px] sm:tracking-[0.35em]" style={{ color: chatPalette.linkText }}>Premium Reading</p>
                <h2 id="reading-drawer-title" className="truncate text-sm font-black min-[390px]:mt-0.5 sm:mt-1 sm:text-2xl" style={{ color: chatPalette.primaryText }}>{activeMeta.title}</h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              <button onClick={handleShare} className="flex h-10 w-10 items-center justify-center rounded-xl border text-base transition hover:shadow-sm sm:rounded-full" style={{ backgroundColor: chatPalette.searchBlue, borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }} aria-label="Share reading item">↗</button>
              <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border text-base transition hover:shadow-sm sm:rounded-full" style={{ backgroundColor: chatPalette.searchBlue, borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }} aria-label="Close reading drawer">✕</button>
            </div>
          </header>

          <div ref={scrollRef} onScroll={handleScroll} className="relative z-10 min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className={presentation === 'page' ? 'px-5 pb-28 pt-8 sm:px-10 sm:pb-32 lg:px-16' : 'px-5 py-8 sm:px-10 lg:px-16'}>
              <div className="mx-auto max-w-3xl">
                <div className="mb-8 rounded-[2rem] border p-6 shadow-[0_8px_30px_rgba(60,64,67,0.08)] backdrop-blur-2xl" style={{ backgroundColor: cardBackground, borderColor: chatPalette.cardBorder }}>
                  <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: chatPalette.secondaryText }}>
                    <span className="rounded-full px-3 py-1 font-bold" style={{ backgroundColor: accentSoftBackground, color: chatPalette.primaryText }} >{activeMeta.source}</span>
                    <span>{formatDate(activeMeta.date)}</span>
                    <span>⏳ {activeMeta.readTime} min read</span>
                  </div>
                </div>
              </div>

              {(view === 'news' || view === 'blog') && (
                <div className="mx-auto max-w-7xl">
                  <div className="mb-10 max-w-3xl">
                    <p className="reading-meta text-xs font-black uppercase tracking-[0.35em]">{listType === 'news' ? 'News Desk' : 'Learning Blog'}</p>
                    <h1 className="reading-article-title mt-3 font-black tracking-tight">{listTitle}</h1>
                    <p className="reading-article-deck mt-5">{listDescription}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      {['Comfort reading', 'Fresh insights', 'Calm layout'].map((label) => (
                        <span key={label} className="rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.22em] shadow-sm" style={{ backgroundColor: chatPalette.searchBlue, borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }}>{label}</span>
                      ))}
                    </div>
                  </div>
                  <div className="reading-hub-mobile-grid grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 lg:gap-6">
                    {visibleArticles.length === 0 && (
                      <div className="col-span-2 rounded-[1.25rem] border p-5 shadow-sm lg:col-span-3 lg:rounded-[2rem] lg:p-8" style={{ backgroundColor: chatPalette.cardSurface, borderColor: chatPalette.cardBorder, color: chatPalette.secondaryText }}>
                        <p className="text-3xl">📚</p>
                        <h3 className="mt-3 text-2xl font-black" style={{ color: chatPalette.primaryText }}>No {listType} posts yet</h3>
                        <p className="mt-2">Fresh learning posts will appear here after they are reviewed and published.</p>
                      </div>
                    )}
                    {visibleArticles.map((article, index) => (
                      <React.Fragment key={`article-${article.id}`}>
                        <HubCard title={article.title} meta={`${formatDate(article.date)} · ${estimateReadMinutes(stripMarkdown(article.content))} min`} excerpt={article.excerpt} badge={article.type === 'news' ? 'News' : article.category || 'Blog'} imageSeed={getArticleImage(article)} fallbackImage={buildPremiumArticleImage(article)} fallbackCandidates={buildArticleRealImageCandidates(article)} onClick={() => handleSelectArticleFromList(article)} listType={listType} />
                        {(index + 1) % 3 === 0 && index < visibleArticles.length - 1 && (
                          <GoogleAd
                            variant="inFeed"
                            label="Sponsored"
                            pageType={listType === 'news' ? 'news-list' : 'blog-list'}
                            realContentCardCount={visibleArticles.length}
                            isContentLoaded={true}
                            className="col-span-2 rounded-[1.25rem] border p-4 shadow-sm lg:col-span-3 lg:rounded-[2rem] lg:p-5"
                            style={{ backgroundColor: chatPalette.cardSurface, borderColor: chatPalette.cardBorder }}
                          />
                        )}
                      </React.Fragment>
                    ))}
                    {listType === 'news' && announcements.map((announcement) => <HubCard key={`announcement-${announcement.id}`} title={announcement.title} meta={formatDate(announcement.date)} excerpt={announcement.content} badge="Announcement" onClick={() => handleSelectAnnouncementFromList(announcement)} listType={listType} />)}
                  </div>
                </div>
              )}

              {view === 'article' && selectedArticleForDisplay && (
                <article className="mx-auto max-w-6xl">
                  <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
                    <div className="min-w-0">
                      <p className="reading-meta text-xs font-black uppercase tracking-[0.35em]">{selectedArticleForDisplay.category}</p>
                      <h1 className="reading-article-title mt-3 font-black tracking-tight">{selectedArticleForDisplay.title}</h1>
                      <p className="reading-article-deck mt-5 lg:max-w-3xl">{selectedArticleForDisplay.excerpt}</p>
                      <div className="mt-6 flex flex-wrap gap-2 rounded-[1.5rem] border p-3 text-xs font-bold shadow-sm backdrop-blur-xl sm:gap-3 sm:p-4 sm:text-sm" style={{ backgroundColor: chatPalette.searchBlue, borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }}>
                        <span>📖 Focus-friendly article</span>
                        <span>•</span>
                        <span>Comfort spacing</span>
                        <span>•</span>
                        <span>Soft trusted palette</span>
                      </div>
                    </div>
                    {!isExternalArticle(selectedArticleForDisplay) && (
                      <div className="hidden overflow-hidden rounded-[2rem] border shadow-sm backdrop-blur-2xl lg:block" style={{ backgroundColor: chatPalette.cardSurface, borderColor: chatPalette.cardBorder }}>
                        <SafeImage src={getArticleImage(selectedArticleForDisplay, '900/700')} fallbackCandidates={buildArticleRealImageCandidates(selectedArticleForDisplay)} fallbackSrc={buildArticleImageFallback(selectedArticleForDisplay)} alt={selectedArticleForDisplay.title} wrapperClassName="aspect-[4/3] h-full w-full" className="h-full w-full object-cover opacity-90 animate-article-hero-image" fallbackTitle={selectedArticleForDisplay.title} fallbackBadge={selectedArticleForDisplay.type === 'news' ? 'News' : selectedArticleForDisplay.category || 'Blog'} fallbackIcon="📰" fallbackMessage="Image preview unavailable" aspect="video" loadTimeoutMs={6000} referrerPolicy="no-referrer" />
                      </div>
                    )}
                  </div>
                  <ReadingAdSlot
                    variant="display"
                    label="Advertisement"
                    pageType="article"
                    visibleWordCount={selectedArticleWordCount}
                    isContentLoaded={true}
                    disabled={selectedArticleAdDisabled}
                    listType={listType}
                    className="mx-auto mt-8 max-w-[var(--reading-content-width)]"
                  />
                  {isExternalArticle(selectedArticleForDisplay) ? (
                    <>
                      <div className="mt-8 overflow-hidden rounded-[2rem] border p-2 shadow-[0_8px_30px_rgba(60,64,67,0.08)] backdrop-blur-2xl lg:mt-10" style={{ backgroundColor: chatPalette.cardSurface, borderColor: chatPalette.cardBorder }}>
                        <iframe src={getArticleUrl(selectedArticleForDisplay)} title={selectedArticleForDisplay.title} className="h-[72vh] w-full rounded-[1.5rem] border-0 bg-white [scrollbar-width:none] lg:h-[76vh]" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" />
                      </div>
                      <ReadingAdSlot
                        variant="multiplex"
                        label="Related Content"
                        pageType="article"
                        visibleWordCount={selectedArticleWordCount}
                        isContentLoaded={true}
                        disabled={selectedArticleAdDisabled}
                        listType={listType}
                        className="mt-10"
                      />
                    </>
                  ) : (
                    <>
                      <div className="mb-6 mt-8 aspect-video overflow-hidden rounded-2xl border shadow-sm backdrop-blur-2xl lg:hidden" style={{ backgroundColor: chatPalette.cardSurface, borderColor: chatPalette.cardBorder }}>
                        <SafeImage src={getArticleImage(selectedArticleForDisplay, '1400/800')} fallbackCandidates={buildArticleRealImageCandidates(selectedArticleForDisplay)} fallbackSrc={buildArticleImageFallback(selectedArticleForDisplay)} alt={selectedArticleForDisplay.title} className="h-full w-full object-cover opacity-90 animate-article-hero-image" fallbackTitle={selectedArticleForDisplay.title} fallbackBadge={selectedArticleForDisplay.type === 'news' ? 'News' : selectedArticleForDisplay.category || 'Blog'} fallbackIcon="📰" fallbackMessage="Image preview unavailable" aspect="video" loadTimeoutMs={6000} referrerPolicy="no-referrer" />
                      </div>
                      <div className="reading-article-content reading-article-body mx-auto mt-8 rounded-[2rem] border p-6 shadow-[0_18px_50px_rgba(60,64,67,0.08)] sm:p-8 lg:mt-10" style={{ backgroundColor: cardBackground, borderColor: chatPalette.cardBorder }}>
                        <MarkdownContent
                          content={selectedArticleContent}
                          includeInArticleAd
                          articleWordCount={selectedArticleWordCount}
                          articleAdDisabled={selectedArticleAdDisabled}
                          listType={listType}
                        />
                        {shouldShowPremiumLearningCta(selectedArticleForDisplay) && <SponsoredPartnerCard promoTitle={promoTitle} promoDescription={promoDescription} promoCtaLabel={promoCtaLabel} onExploreFeature={onExploreFeature} listType={listType} />}
                        <ReadingAdSlot
                          variant="multiplex"
                          label="Related Content"
                          pageType="article"
                          visibleWordCount={selectedArticleWordCount}
                          isContentLoaded={true}
                          disabled={selectedArticleAdDisabled}
                          listType={listType}
                          className="mt-10"
                        />
                      </div>
                    </>
                  )}
                </article>
              )}

              {view === 'announcement' && selectedAnnouncement && (
                <article className="mx-auto max-w-6xl">
                  <p className="reading-meta text-xs font-black uppercase tracking-[0.35em]">Official Announcement</p>
                  <h1 className="reading-article-title mt-4 font-black tracking-tight">{selectedAnnouncement.title}</h1>
                  <div className="reading-article-content reading-article-body mx-auto mt-12 space-y-7 rounded-[2rem] border p-6 shadow-sm sm:p-8" style={{ backgroundColor: cardBackground, borderColor: chatPalette.cardBorder }}>
                    {selectedAnnouncement.content.split('\n').filter(Boolean).map((paragraph, index) => (
                      <React.Fragment key={index}>
                        {index === 1 && <SponsoredPartnerCard promoTitle={promoTitle} promoDescription={promoDescription} promoCtaLabel={promoCtaLabel} onExploreFeature={onExploreFeature} listType={listType} />}
                        <p>{paragraph}</p>
                      </React.Fragment>
                    ))}
                  </div>
                </article>
              )}

              <div className="h-32" />
            </div>
          </div>

          {view === 'article' && selectedArticleForDisplay && !articleReadingRewardDisabled && (
            <div className="absolute bottom-5 right-5 z-30 max-w-sm rounded-[1.5rem] border px-5 py-4 text-sm font-black shadow-[0_12px_40px_rgba(60,64,67,0.14)] backdrop-blur-2xl animate-fade-in-up" style={{ backgroundColor: chatPalette.cardSurface, borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }}>
              {rewardStatus === 'claimed' && <span className="text-emerald-700">🎉 +{economySettings.coinPerArticleRead} Coins Claimed!</span>}
              {rewardStatus === 'already' && <span style={{ color: chatPalette.linkText }}>✔️ Reward already claimed for this article</span>}
              {rewardStatus === 'login' && <span className="text-amber-700">🔐 Login to earn reading coins</span>}
              {rewardStatus === 'idle' && (
                <div>
                  <p style={{ color: chatPalette.linkText }}>⏳ {String(rewardMinutes).padStart(2, '0')}:{rewardSeconds} + {Math.floor(progress)}%/{economySettings.articleReadScrollRequiredPercent}% scroll to earn +{economySettings.coinPerArticleRead} Coins</p>
                  <p className="mt-1 text-xs font-bold" style={{ color: chatPalette.secondaryText }}>Timer pauses when this tab is hidden/minimized and reward unlocks only after the scroll target is reached.</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ReadingDrawer;
export type { ReadingView, ReadingListType };
