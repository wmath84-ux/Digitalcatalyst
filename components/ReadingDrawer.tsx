import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Announcement, NewsArticle, User, WebsiteSettings } from '../App';
import { EconomySettings } from '../utils/economy';
import GoogleAd from './GoogleAd';
import { countVisibleWords, hasUnsafePublicPlaceholder } from '../utils/reviewStableMode';

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
}



const defaultReadingStyle = {
  backgroundColor: '#F8FAFD',
  backgroundOpacity: 98,
  panelOpacity: 96,
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
  green: '#1e8e3e',
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
  const badge = escapeSvgText(article.type === 'news' ? 'NEWS' : 'BLOG');
  const category = escapeSvgText(article.category || 'Eduvora');
  const title = escapeSvgText((article.title || 'Premium Reading').slice(0, 82));
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1769FF"/><stop offset="0.55" stop-color="#7B61FF"/><stop offset="1" stop-color="#081A45"/></linearGradient><radialGradient id="r" cx="22%" cy="18%" r="70%"><stop stop-color="#FFFFFF" stop-opacity="0.34"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="675" rx="42" fill="url(#g)"/><rect width="1200" height="675" fill="url(#r)"/><circle cx="1010" cy="125" r="170" fill="#ffffff" opacity="0.12"/><circle cx="180" cy="575" r="210" fill="#ffffff" opacity="0.10"/><path d="M70 470 C230 380 310 525 470 430 S760 300 1125 400" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="18" stroke-linecap="round"/><rect x="78" y="74" width="220" height="58" rx="29" fill="#ffffff" opacity="0.95"/><text x="188" y="112" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="900" fill="#1769FF" letter-spacing="5">${badge}</text><text x="82" y="230" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="800" fill="#E8F2FF" letter-spacing="2">${category}</text><foreignObject x="78" y="265" width="900" height="230"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,Arial,sans-serif;font-size:56px;line-height:1.05;font-weight:900;color:white;letter-spacing:-1.8px;">${title}</div></foreignObject><text x="82" y="590" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="800" fill="#E8F2FF">Premium reading cover · URL image fallback</text></svg>`)}`;
};
const getArticleImage = (article: NewsArticle, size = '900/540') => article.coverImage || article.thumbnailImage || buildPremiumArticleImage(article);
const getArticleType = (article: NewsArticle): ReadingListType => article.type === 'news' ? 'news' : 'blog';
const shouldShowPremiumLearningCta = (article: NewsArticle | null) => Boolean((article as (NewsArticle & { showPremiumLearningCta?: boolean }) | null)?.showPremiumLearningCta);
const stripMarkdown = (value = '') => value.replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim();

const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
        ? <strong key={index} className="font-black" style={{ color: chatPalette.primaryText }}>{part.slice(2, -2)}</strong>
        : <React.Fragment key={index}>{part}</React.Fragment>)}
    </>
  );
};

const MarkdownContent: React.FC<{ content: string; includeInArticleAd?: boolean; articleWordCount?: number; articleAdDisabled?: boolean }> = ({ content, includeInArticleAd = false, articleWordCount = 0, articleAdDisabled = false }) => {
  if (/<\/?[a-z][\s\S]*>/i.test(content)) {
    return <div className="reading-rich-html" dangerouslySetInnerHTML={{ __html: content }} />;
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
      <ul key={`ul-${nodes.length}`} className="my-6 space-y-3 rounded-[1.5rem] border p-5 shadow-sm backdrop-blur-xl" style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderColor: chatPalette.cardBorder }}>
        {current.map((item, index) => <li key={index} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chatPalette.activeBlue }} /><span><InlineMarkdown text={item} /></span></li>)}
      </ul>
    );
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text) {
      nodes.push(<p key={`p-${nodes.length}`} className="my-5 text-lg leading-9" style={{ color: chatPalette.secondaryText }}><InlineMarkdown text={text} /></p>);
      const paragraphCount = nodes.filter(node => React.isValidElement(node) && node.type === 'p').length;
      if (includeInArticleAd && paragraphCount === 2) {
        nodes.push(
          <GoogleAd
            key={`in-article-ad-${nodes.length}`}
            variant="inArticle"
            label="Advertisement"
            pageType="article"
            visibleWordCount={articleWordCount}
            isContentLoaded={true}
            disabled={articleAdDisabled}
            className="my-10 rounded-[2rem] border p-5 shadow-sm backdrop-blur-xl"
            style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderColor: chatPalette.cardBorder }}
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
      nodes.push(<h2 key={`h2-${nodes.length}`} className="mb-4 mt-12 text-3xl font-black tracking-tight" style={{ color: chatPalette.primaryText }}><InlineMarkdown text={line.slice(3).trim()} /></h2>);
      return;
    }
    if (line.startsWith('### ')) {
      flushParagraph();
      flushBullets();
      nodes.push(<h3 key={`h3-${nodes.length}`} className="mb-3 mt-8 text-2xl font-black" style={{ color: chatPalette.primaryText }}><InlineMarkdown text={line.slice(4).trim()} /></h3>);
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
}> = ({
  promoTitle = "Level up tonight's study sprint",
  promoDescription = 'Discover a handpicked premium resource built for sharper notes, faster revision, and calmer exam weeks.',
  promoCtaLabel = 'Explore Feature',
  onExploreFeature,
}) => (
  <aside className="my-12 overflow-hidden rounded-[2rem] border bg-gradient-to-r from-[#EAF2FF] via-[#F8FAFD] to-[#CFE1FF] p-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
    <div className="rounded-[1.75rem] p-6 backdrop-blur-2xl sm:p-8" style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: chatPalette.linkText }}>Sponsored Partner</p>
          <h3 className="mt-3 text-2xl font-black" style={{ color: chatPalette.primaryText }}>{promoTitle}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: chatPalette.secondaryText }}>{promoDescription}</p>
        </div>
        <button type="button" onClick={onExploreFeature} className="rounded-full px-6 py-3 text-sm font-black shadow-sm transition hover:scale-105" style={{ backgroundColor: chatPalette.activeBlue, color: chatPalette.primaryText }}>
          {promoCtaLabel}
        </button>
      </div>
    </div>
  </aside>
);

const HubCard: React.FC<{ title: string; meta: string; excerpt: string; badge: string; imageSeed?: string; fallbackImage?: string; onClick: () => void; }> = ({ title, meta, excerpt, badge, imageSeed, fallbackImage, onClick }) => (
  <button onClick={onClick} className="group relative overflow-hidden rounded-[1.75rem] border text-left shadow-[0_12px_36px_rgba(60,64,67,0.10)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_48px_rgba(60,64,67,0.14)]" style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder }}>
    {imageSeed && (
      <div className="aspect-video overflow-hidden rounded-t-[1.75rem]" style={{ backgroundColor: chatPalette.searchBlue }}>
        <img src={imageSeed || ''} alt="" className="h-full w-full rounded-t-[1.75rem] object-cover opacity-90 transition duration-700 group-hover:scale-110 group-hover:opacity-100" onError={(event) => { event.currentTarget.onerror = null; if (fallbackImage) event.currentTarget.src = fallbackImage; }} />
      </div>
    )}
    <div className="p-5">
      <div className="flex items-center justify-between gap-4">
        <span className="rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em]" style={{ backgroundColor: chatPalette.activeBlue, borderColor: chatPalette.activeBlue, color: chatPalette.primaryText }}>{badge}</span>
        <span className="text-xs font-semibold" style={{ color: chatPalette.secondaryText }}>{meta}</span>
      </div>
      <h3 className="mt-4 text-xl font-black leading-tight transition" style={{ color: chatPalette.primaryText }}>{title}</h3>
      <p className="mt-3 line-clamp-3 text-sm leading-6" style={{ color: chatPalette.secondaryText }}>{excerpt}</p>
      <div className="mt-5 text-sm font-black" style={{ color: chatPalette.linkText }}>Read comfortably →</div>
    </div>
  </button>
);

const ReadingDrawer: React.FC<ReadingDrawerProps> = ({ settings, economySettings, isOpen, view, articles, announcements, listType, selectedArticle, selectedAnnouncement, currentUser, onClose, onSelectArticle, onSelectAnnouncement, onBackToList, onExploreFeature, promoTitle, promoDescription, promoCtaLabel, onReadingReward }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const rewardIssuedRef = useRef<number | string | null>(null);
  const lastReadingActivityRef = useRef(0);
  const [rewardSecondsLeft, setRewardSecondsLeft] = useState(Math.max(0, economySettings.articleReadTimeRequiredSec));
  const [rewardStatus, setRewardStatus] = useState<'idle' | 'claimed' | 'already' | 'login'>('idle');

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    scrollRef.current?.scrollTo({ top: 0 });
    setProgress(0);
    progressRef.current = 0;
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, view, selectedArticle?.id, selectedAnnouncement?.id]);

  useEffect(() => {
    if (!isOpen || view !== 'article' || !selectedArticle) return;
    const readIds = [...(currentUser?.rewardedArticleIds || []), ...(currentUser?.readArticles || [])];
    if (!currentUser) setRewardStatus('login');
    else if (readIds.includes(selectedArticle.id)) setRewardStatus('already');
    else setRewardStatus('idle');
    setRewardSecondsLeft(Math.max(0, economySettings.articleReadTimeRequiredSec));
    lastReadingActivityRef.current = Date.now();
    rewardIssuedRef.current = null;
  }, [currentUser, economySettings.articleReadTimeRequiredSec, isOpen, selectedArticle, view]);

  useEffect(() => {
    if (!isOpen || view !== 'article' || !selectedArticle || !onReadingReward || rewardStatus !== 'idle') return;
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
  }, [economySettings.articleReadScrollRequiredPercent, isOpen, onReadingReward, rewardStatus, selectedArticle, view]);

  const activeMeta = useMemo(() => {
    if (view === 'article' && selectedArticle) {
      return {
        title: selectedArticle.title,
        source: selectedArticle.category || 'Digital Catalyst Editorial',
        date: selectedArticle.date,
        readTime: isExternalArticle(selectedArticle) ? 4 : estimateReadMinutes(selectedArticle.content),
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
  }, [listType, selectedArticle, selectedAnnouncement, view]);

  const visibleArticles = useMemo(
    () =>
      articles.filter(
        (article) =>
          getArticleType(article) === listType &&
          !hasUnsafePublicPlaceholder(article.title, article.excerpt, article.content)
      ),
    [articles, listType]
  );

  const selectedArticleWordCount = selectedArticle
    ? countVisibleWords(selectedArticle.title, selectedArticle.excerpt, selectedArticle.content)
    : 0;

  const selectedArticleAdDisabled = selectedArticle
    ? hasUnsafePublicPlaceholder(selectedArticle.title, selectedArticle.excerpt, selectedArticle.content)
    : true;

  const listTitle = listType === 'news' ? 'Student News' : 'Study Blog';
  const listDescription = listType === 'news'
    ? 'Current education updates, exam alerts, student opportunities, and quick signals curated for focused learners.'
    : 'In-depth how-to guides, study systems, career readiness playbooks, and practical learning strategies.';

  const handleScroll = () => {
    lastReadingActivityRef.current = Date.now();
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const nextProgress = max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 100;
    progressRef.current = nextProgress;
    setProgress(nextProgress);

    if (
      isOpen &&
      view === 'article' &&
      selectedArticle &&
      onReadingReward &&
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

  const rewardMinutes = Math.floor(rewardSecondsLeft / 60);
  const rewardSeconds = String(rewardSecondsLeft % 60).padStart(2, '0');
  const storedReadingStyle = ((settings.content as any).readingStyle || {}) as Partial<typeof defaultReadingStyle>;
  const readingStyle = {
    ...defaultReadingStyle,
    cardOpacity: storedReadingStyle.cardOpacity ?? defaultReadingStyle.cardOpacity,
    backgroundColor: defaultReadingStyle.backgroundColor,
    backgroundOpacity: defaultReadingStyle.backgroundOpacity,
    panelOpacity: defaultReadingStyle.panelOpacity,
    accentColor: defaultReadingStyle.accentColor,
    accentOpacity: defaultReadingStyle.accentOpacity,
  };
  const readingBackground = hexToRgba(readingStyle.backgroundColor, readingStyle.backgroundOpacity);
  const panelBackground = hexToRgba(readingStyle.backgroundColor, readingStyle.panelOpacity);
  const cardBackground = `rgba(255, 255, 255, ${clampPercent(readingStyle.cardOpacity, defaultReadingStyle.cardOpacity) / 100})`;
  const accentSoftBackground = hexToRgba(readingStyle.accentColor, readingStyle.accentOpacity, defaultReadingStyle.accentColor);
  const accentStrongBackground = hexToRgba(readingStyle.accentColor, 92, defaultReadingStyle.accentColor);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] backdrop-blur-sm"
      style={{ backgroundColor: readingBackground }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reading-drawer-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <section onMouseDown={(e) => e.stopPropagation()} className="relative h-full w-full overflow-hidden border-l shadow-[0_8px_30px_rgba(60,64,67,0.10)] backdrop-blur-3xl animate-slide-in-right md:w-[88vw] xl:w-[85vw]" style={{ backgroundColor: panelBackground, borderColor: chatPalette.cardBorder }}>
          <div className="sticky top-0 z-30 h-1" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}>
            <div className="h-full rounded-r-full shadow-sm transition-all duration-150" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accentStrongBackground}, rgba(194, 231, 255, 0.92), rgba(11, 87, 208, 0.72))` }} />
          </div>

          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at top left, ${accentSoftBackground}, transparent 30%), radial-gradient(circle at 82% 12%, rgba(178, 158, 255, 0.20), transparent 28%), radial-gradient(circle at bottom right, rgba(194, 231, 255, 0.38), transparent 30%)` }} />

          <header className="relative z-20 flex items-center justify-between gap-4 border-b px-4 py-4 backdrop-blur-2xl sm:px-8" style={{ backgroundColor: cardBackground, borderColor: chatPalette.cardBorder }}>
            <div className="flex min-w-0 items-center gap-4">
              {(view === 'article' || view === 'announcement') && (
                <button onClick={onBackToList} className="shrink-0 rounded-full border px-4 py-2 text-sm font-black shadow-sm transition hover:-translate-x-0.5 hover:shadow-md" style={{ backgroundColor: chatPalette.activeBlue, borderColor: chatPalette.activeBlue, color: chatPalette.primaryText }}>
                  ← Back to List
                </button>
              )}
              <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: chatPalette.linkText }}>Premium Reading Mode</p>
              <h2 id="reading-drawer-title" className="mt-1 truncate text-lg font-black sm:text-2xl" style={{ color: chatPalette.primaryText }}>{activeMeta.title}</h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button onClick={handleShare} className="rounded-full border p-3 transition hover:shadow-sm" style={{ backgroundColor: chatPalette.searchBlue, borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }} aria-label="Share reading item">↗</button>
              <button onClick={onClose} className="rounded-full border p-3 transition hover:shadow-sm" style={{ backgroundColor: chatPalette.searchBlue, borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }} aria-label="Close reading drawer">✕</button>
            </div>
          </header>

          <div ref={scrollRef} onScroll={handleScroll} className="relative z-10 h-[calc(100%-73px)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="px-5 py-8 sm:px-10 lg:px-16">
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
                    <p className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: chatPalette.linkText }}>{listType === 'news' ? 'News Desk' : 'Learning Blog'}</p>
                    <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl" style={{ color: chatPalette.primaryText }}>{listTitle}</h1>
                    <p className="mt-5 text-lg leading-8" style={{ color: chatPalette.secondaryText }}>{listDescription}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      {['Comfort reading', 'Fresh insights', 'Calm layout'].map((label) => (
                        <span key={label} className="rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.22em] shadow-sm" style={{ backgroundColor: chatPalette.searchBlue, borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }}>{label}</span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-6 lg:grid-cols-3">
                    {visibleArticles.length === 0 && (
                      <div className="rounded-[2rem] border p-8 shadow-sm backdrop-blur-xl lg:col-span-3" style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder, color: chatPalette.secondaryText }}>
                        <p className="text-3xl">📚</p>
                        <h3 className="mt-3 text-2xl font-black" style={{ color: chatPalette.primaryText }}>No {listType} posts yet</h3>
                        <p className="mt-2">Fresh learning posts will appear here after they are reviewed and published.</p>
                      </div>
                    )}
                    {visibleArticles.map((article, index) => (
                      <React.Fragment key={`article-${article.id}`}>
                        <HubCard title={article.title} meta={`${formatDate(article.date)} · ${estimateReadMinutes(stripMarkdown(article.content))} min`} excerpt={article.excerpt} badge={article.type === 'news' ? 'News' : article.category || 'Blog'} imageSeed={getArticleImage(article)} fallbackImage={buildPremiumArticleImage(article)} onClick={() => onSelectArticle(article)} />
                        {(index + 1) % 3 === 0 && index < visibleArticles.length - 1 && (
                          <GoogleAd
                            variant="inFeed"
                            label="Sponsored"
                            pageType={listType === 'news' ? 'news-list' : 'blog-list'}
                            realContentCardCount={visibleArticles.length}
                            isContentLoaded={true}
                            className="lg:col-span-3 rounded-[2rem] border p-5 shadow-sm backdrop-blur-xl"
                            style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder }}
                          />
                        )}
                      </React.Fragment>
                    ))}
                    {listType === 'news' && announcements.map((announcement) => <HubCard key={`announcement-${announcement.id}`} title={announcement.title} meta={formatDate(announcement.date)} excerpt={announcement.content} badge="Announcement" onClick={() => onSelectAnnouncement(announcement)} />)}
                  </div>
                </div>
              )}

              {view === 'article' && selectedArticle && (
                <article className="mx-auto max-w-6xl">
                  <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: chatPalette.linkText }}>{selectedArticle.category}</p>
                      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl" style={{ color: chatPalette.primaryText }}>{selectedArticle.title}</h1>
                      <p className="mt-5 text-lg leading-8 sm:text-xl lg:max-w-3xl" style={{ color: chatPalette.secondaryText }}>{selectedArticle.excerpt}</p>
                      <div className="mt-6 flex flex-wrap gap-2 rounded-[1.5rem] border p-3 text-xs font-bold shadow-sm backdrop-blur-xl sm:gap-3 sm:p-4 sm:text-sm" style={{ backgroundColor: chatPalette.searchBlue, borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }}>
                        <span>📖 Focus-friendly article</span>
                        <span>•</span>
                        <span>Comfort spacing</span>
                        <span>•</span>
                        <span>Soft trusted palette</span>
                      </div>
                    </div>
                    {!isExternalArticle(selectedArticle) && (
                      <div className="hidden overflow-hidden rounded-[2rem] border shadow-sm backdrop-blur-2xl lg:block" style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder }}>
                        <img src={getArticleImage(selectedArticle, '900/700')} alt={selectedArticle.title} className="aspect-[4/3] h-full w-full object-cover opacity-90 animate-article-hero-image" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = buildPremiumArticleImage(selectedArticle); }} />
                      </div>
                    )}
                  </div>
                  {isExternalArticle(selectedArticle) ? (
                    <>
                      <div className="mt-8 overflow-hidden rounded-[2rem] border p-2 shadow-[0_8px_30px_rgba(60,64,67,0.08)] backdrop-blur-2xl lg:mt-10" style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder }}>
                        <iframe src={getArticleUrl(selectedArticle)} title={selectedArticle.title} className="h-[72vh] w-full rounded-[1.5rem] border-0 bg-white [scrollbar-width:none] lg:h-[76vh]" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" />
                      </div>
                      <GoogleAd
                        variant="multiplex"
                        label="Related Content"
                        pageType="article"
                        visibleWordCount={selectedArticleWordCount}
                        isContentLoaded={true}
                        disabled={selectedArticleAdDisabled}
                        className="mt-10 rounded-[2rem] border p-5 shadow-sm backdrop-blur-xl"
                        style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder }}
                      />
                    </>
                  ) : (
                    <>
                      <div className="mb-6 mt-8 aspect-video overflow-hidden rounded-2xl border shadow-sm backdrop-blur-2xl lg:hidden" style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder }}>
                        <img src={getArticleImage(selectedArticle, '1400/800')} alt={selectedArticle.title} className="h-full w-full object-cover opacity-90 animate-article-hero-image" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = buildPremiumArticleImage(selectedArticle); }} />
                      </div>
                      <div className="mx-auto mt-8 max-w-4xl rounded-[2rem] border p-6 text-lg leading-9 shadow-[0_18px_50px_rgba(60,64,67,0.08)] backdrop-blur-2xl sm:p-8 lg:mt-10" style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder, color: chatPalette.secondaryText }}>
                        <MarkdownContent
                          content={selectedArticle.content}
                          includeInArticleAd
                          articleWordCount={selectedArticleWordCount}
                          articleAdDisabled={selectedArticleAdDisabled}
                        />
                        {shouldShowPremiumLearningCta(selectedArticle) && <SponsoredPartnerCard promoTitle={promoTitle} promoDescription={promoDescription} promoCtaLabel={promoCtaLabel} onExploreFeature={onExploreFeature} />}
                        <GoogleAd
                          variant="multiplex"
                          label="Related Content"
                          pageType="article"
                          visibleWordCount={selectedArticleWordCount}
                          isContentLoaded={true}
                          disabled={selectedArticleAdDisabled}
                          className="mt-10 rounded-[2rem] border p-5 shadow-sm backdrop-blur-xl"
                          style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder }}
                        />
                      </div>
                    </>
                  )}
                </article>
              )}

              {view === 'announcement' && selectedAnnouncement && (
                <article className="mx-auto max-w-3xl">
                  <p className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: chatPalette.linkText }}>Official Announcement</p>
                  <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl" style={{ color: chatPalette.primaryText }}>{selectedAnnouncement.title}</h1>
                  <div className="mt-12 space-y-7 rounded-[2rem] border p-6 text-lg leading-9 shadow-sm backdrop-blur-2xl sm:p-8" style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderColor: chatPalette.cardBorder, color: chatPalette.secondaryText }}>
                    {selectedAnnouncement.content.split('\n').filter(Boolean).map((paragraph, index) => (
                      <React.Fragment key={index}>
                        {index === 1 && <SponsoredPartnerCard promoTitle={promoTitle} promoDescription={promoDescription} promoCtaLabel={promoCtaLabel} onExploreFeature={onExploreFeature} />}
                        <p>{paragraph}</p>
                      </React.Fragment>
                    ))}
                  </div>
                </article>
              )}

              <div className="h-32" />
            </div>
          </div>

          {view === 'article' && selectedArticle && (
            <div className="absolute bottom-5 right-5 z-30 max-w-sm rounded-[1.5rem] border px-5 py-4 text-sm font-black shadow-[0_12px_40px_rgba(60,64,67,0.14)] backdrop-blur-2xl animate-fade-in-up" style={{ backgroundColor: 'rgba(255,255,255,0.94)', borderColor: chatPalette.cardBorder, color: chatPalette.primaryText }}>
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
