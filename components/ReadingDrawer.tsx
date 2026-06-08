import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Announcement, NewsArticle, User, WebsiteSettings } from '../App';
import { EconomySettings } from '../utils/economy';
import GoogleAd from './GoogleAd';

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
  backgroundColor: '#e8edf6',
  backgroundOpacity: 88,
  panelOpacity: 90,
  cardOpacity: 76,
  accentColor: '#4f46e5',
  accentOpacity: 16,
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
const getArticleImage = (article: NewsArticle, size = '900/540') => article.coverImage || article.thumbnailImage || `https://picsum.photos/seed/${article.imageSeed}/${size}`;
const getArticleType = (article: NewsArticle): ReadingListType => article.type === 'news' ? 'news' : 'blog';
const stripMarkdown = (value = '') => value.replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim();

const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
        ? <strong key={index} className="font-black text-slate-900">{part.slice(2, -2)}</strong>
        : <React.Fragment key={index}>{part}</React.Fragment>)}
    </>
  );
};

const MarkdownContent: React.FC<{ content: string; includeInArticleAd?: boolean }> = ({ content, includeInArticleAd = false }) => {
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
      <ul key={`ul-${nodes.length}`} className="my-6 space-y-3 rounded-[1.5rem] border border-white/50 bg-white/70 p-5 shadow-sm backdrop-blur-xl">
        {current.map((item, index) => <li key={index} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-400" /><span><InlineMarkdown text={item} /></span></li>)}
      </ul>
    );
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text) {
      nodes.push(<p key={`p-${nodes.length}`} className="my-5 text-lg leading-9 text-slate-600"><InlineMarkdown text={text} /></p>);
      const paragraphCount = nodes.filter(node => React.isValidElement(node) && node.type === 'p').length;
      if (includeInArticleAd && paragraphCount === 2) {
        nodes.push(<GoogleAd key={`in-article-ad-${nodes.length}`} variant="inArticle" label="Advertisement" className="my-10 rounded-[2rem] border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur-xl" />);
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
      nodes.push(<h2 key={`h2-${nodes.length}`} className="mb-4 mt-12 text-3xl font-black tracking-tight text-slate-900"><InlineMarkdown text={line.slice(3).trim()} /></h2>);
      return;
    }
    if (line.startsWith('### ')) {
      flushParagraph();
      flushBullets();
      nodes.push(<h3 key={`h3-${nodes.length}`} className="mb-3 mt-8 text-2xl font-black text-slate-900"><InlineMarkdown text={line.slice(4).trim()} /></h3>);
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
  <aside className="my-12 overflow-hidden rounded-[2rem] border border-purple-500/30 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
    <div className="rounded-[1.75rem] bg-white/70 p-6 backdrop-blur-2xl sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-purple-700/80">Sponsored Partner</p>
          <h3 className="mt-3 text-2xl font-black text-slate-900">{promoTitle}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{promoDescription}</p>
        </div>
        <button type="button" onClick={onExploreFeature} className="rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:scale-105">
          {promoCtaLabel}
        </button>
      </div>
    </div>
  </aside>
);

const HubCard: React.FC<{ title: string; meta: string; excerpt: string; badge: string; imageSeed?: string; onClick: () => void; }> = ({ title, meta, excerpt, badge, imageSeed, onClick }) => (
  <button onClick={onClick} className="group relative overflow-hidden rounded-xl border border-white/50 bg-white/70 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-indigo-300/40 hover:bg-white/80 hover:shadow-sm">
    {imageSeed && (
      <div className="aspect-video overflow-hidden rounded-t-xl bg-white/70">
        <img src={imageSeed || ''} alt="" className="h-full w-full rounded-t-xl object-cover opacity-85 transition duration-700 group-hover:scale-110 group-hover:opacity-100" />
      </div>
    )}
    <div className="p-5">
      <div className="flex items-center justify-between gap-4">
        <span className="rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-indigo-700">{badge}</span>
        <span className="text-xs text-slate-600">{meta}</span>
      </div>
      <h3 className="mt-4 text-xl font-black leading-tight text-slate-900 transition group-hover:text-indigo-700">{title}</h3>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{excerpt}</p>
      <div className="mt-5 text-sm font-black text-indigo-700">Open in reading hub →</div>
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

  const visibleArticles = useMemo(() => articles.filter((article) => getArticleType(article) === listType), [articles, listType]);
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
  const readingStyle = { ...defaultReadingStyle, ...((settings.content as any).readingStyle || {}) };
  const readingBackground = hexToRgba(readingStyle.backgroundColor, readingStyle.backgroundOpacity);
  const panelBackground = hexToRgba(readingStyle.backgroundColor, readingStyle.panelOpacity);
  const cardBackground = `rgba(255, 255, 255, ${clampPercent(readingStyle.cardOpacity, defaultReadingStyle.cardOpacity) / 100})`;
  const accentSoftBackground = hexToRgba(readingStyle.accentColor, readingStyle.accentOpacity, defaultReadingStyle.accentColor);
  const accentStrongBackground = hexToRgba(readingStyle.accentColor, 92, defaultReadingStyle.accentColor);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] backdrop-blur-sm" style={{ backgroundColor: readingBackground }} role="dialog" aria-modal="true" aria-labelledby="reading-drawer-title" onMouseDown={onClose}>
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <section onMouseDown={(e) => e.stopPropagation()} className="relative h-full w-full overflow-hidden border-l border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-3xl animate-slide-in-right md:w-[88vw] xl:w-[85vw]" style={{ backgroundColor: panelBackground }}>
          <div className="sticky top-0 z-30 h-1 bg-white/70">
            <div className="h-full rounded-r-full shadow-sm transition-all duration-150" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accentStrongBackground}, rgba(14, 165, 233, 0.86), rgba(124, 58, 237, 0.86))` }} />
          </div>

          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at top left, ${accentSoftBackground}, transparent 32%), radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.10), transparent 28%)` }} />

          <header className="relative z-20 flex items-center justify-between gap-4 border-b border-white/50 px-4 py-4 backdrop-blur-2xl sm:px-8" style={{ backgroundColor: cardBackground }}>
            <div className="flex min-w-0 items-center gap-4">
              {(view === 'article' || view === 'announcement') && (
                <button onClick={onBackToList} className="shrink-0 rounded-full border border-indigo-200/60 bg-white px-4 py-2 text-sm font-black text-indigo-700 shadow-sm transition hover:-translate-x-0.5 hover:bg-indigo-50 hover:shadow-md">
                  ← Back to List
                </button>
              )}
              <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-indigo-700/80">Premium Reading Mode</p>
              <h2 id="reading-drawer-title" className="mt-1 truncate text-lg font-black text-slate-900 sm:text-2xl">{activeMeta.title}</h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button onClick={handleShare} className="rounded-full border border-white/50 bg-white/70 p-3 text-slate-600 transition hover:border-indigo-300/40 hover:bg-indigo-400/10" aria-label="Share reading item">↗</button>
              <button onClick={onClose} className="rounded-full border border-white/50 bg-white/70 p-3 text-slate-600 transition hover:border-rose-300/40 hover:bg-rose-400/10" aria-label="Close reading drawer">✕</button>
            </div>
          </header>

          <div ref={scrollRef} onScroll={handleScroll} className="relative z-10 h-[calc(100%-73px)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="px-5 py-8 sm:px-10 lg:px-16">
              <div className="mx-auto max-w-3xl">
                <div className="mb-8 rounded-[2rem] border border-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl" style={{ backgroundColor: cardBackground }}>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <span className="rounded-full px-3 py-1 font-bold text-indigo-700" style={{ backgroundColor: accentSoftBackground }}>{activeMeta.source}</span>
                    <span>{formatDate(activeMeta.date)}</span>
                    <span>⏳ {activeMeta.readTime} min read</span>
                  </div>
                </div>
              </div>

              {(view === 'news' || view === 'blog') && (
                <div className="mx-auto max-w-7xl">
                  <div className="mb-10 max-w-3xl">
                    <p className="text-xs font-black uppercase tracking-[0.35em] text-indigo-700/80">{listType === 'news' ? 'News Desk' : 'Learning Blog'}</p>
                    <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900 sm:text-6xl">{listTitle}</h1>
                    <p className="mt-5 text-lg leading-8 text-slate-600">{listDescription}</p>
                  </div>
                  <div className="grid gap-6 lg:grid-cols-3">
                    {visibleArticles.length === 0 && (
                      <div className="rounded-[2rem] border border-white/50 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur-xl lg:col-span-3">
                        <p className="text-3xl">📚</p>
                        <h3 className="mt-3 text-2xl font-black text-slate-900">No {listType} posts yet</h3>
                        <p className="mt-2">Run AI Fetch Now in the admin panel or add a manual {listType} post to fill this list.</p>
                      </div>
                    )}
                    {visibleArticles.map((article, index) => (
                      <React.Fragment key={`article-${article.id}`}>
                        <HubCard title={article.title} meta={`${formatDate(article.date)} · ${estimateReadMinutes(stripMarkdown(article.content))} min`} excerpt={article.excerpt} badge={article.type === 'news' ? 'News' : article.category || 'Blog'} imageSeed={getArticleImage(article)} onClick={() => onSelectArticle(article)} />
                        {(index + 1) % 3 === 0 && index < visibleArticles.length - 1 && (
                          <GoogleAd variant="inFeed" label="Sponsored" className="lg:col-span-3 rounded-[2rem] border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl" />
                        )}
                      </React.Fragment>
                    ))}
                    {listType === 'news' && announcements.map((announcement) => <HubCard key={`announcement-${announcement.id}`} title={announcement.title} meta={formatDate(announcement.date)} excerpt={announcement.content} badge="Announcement" onClick={() => onSelectAnnouncement(announcement)} />)}
                  </div>
                </div>
              )}

              {view === 'article' && selectedArticle && (
                <article className="mx-auto max-w-3xl">
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-indigo-700">{selectedArticle.category}</p>
                  <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900 sm:text-6xl">{selectedArticle.title}</h1>
                  <p className="mt-6 text-xl leading-8 text-slate-600">{selectedArticle.excerpt}</p>
                  {isExternalArticle(selectedArticle) ? (
                    <>
                      <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
                        <iframe src={getArticleUrl(selectedArticle)} title={selectedArticle.title} className="h-[72vh] w-full rounded-[1.5rem] border-0 bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 [scrollbar-width:none]" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" />
                      </div>
                      <GoogleAd variant="multiplex" label="Related Content" className="mt-12 rounded-[2rem] border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur-xl" />
                    </>
                  ) : (
                    <>
                      <div className="mb-6 mt-10 aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-white/70 shadow-sm backdrop-blur-2xl">
                        <img src={getArticleImage(selectedArticle, '1400/800')} alt={selectedArticle.title} className="h-full w-full object-cover opacity-90 animate-article-hero-image" />
                      </div>
                      <div className="mt-12 text-lg leading-9 text-slate-600">
                        <MarkdownContent content={selectedArticle.content} includeInArticleAd />
                        <SponsoredPartnerCard promoTitle={promoTitle} promoDescription={promoDescription} promoCtaLabel={promoCtaLabel} onExploreFeature={onExploreFeature} />
                        <GoogleAd variant="multiplex" label="Related Content" className="mt-12 rounded-[2rem] border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur-xl" />
                      </div>
                    </>
                  )}
                </article>
              )}

              {view === 'announcement' && selectedAnnouncement && (
                <article className="mx-auto max-w-3xl">
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-purple-700">Official Announcement</p>
                  <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900 sm:text-6xl">{selectedAnnouncement.title}</h1>
                  <div className="mt-12 space-y-7 text-lg leading-9 text-slate-600">
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
            <div className="absolute bottom-5 right-5 z-30 max-w-sm rounded-[1.5rem] border border-white/60 bg-white/80 px-5 py-4 text-sm font-black text-slate-900 shadow-[0_12px_40px_rgba(79,70,229,0.18)] backdrop-blur-2xl animate-fade-in-up">
              {rewardStatus === 'claimed' && <span className="text-emerald-700">🎉 +{economySettings.coinPerArticleRead} Coins Claimed!</span>}
              {rewardStatus === 'already' && <span className="text-indigo-700">✔️ Reward already claimed for this article</span>}
              {rewardStatus === 'login' && <span className="text-amber-700">🔐 Login to earn reading coins</span>}
              {rewardStatus === 'idle' && (
                <div>
                  <p className="text-indigo-700">⏳ {String(rewardMinutes).padStart(2, '0')}:{rewardSeconds} + {Math.floor(progress)}%/{economySettings.articleReadScrollRequiredPercent}% scroll to earn +{economySettings.coinPerArticleRead} Coins</p>
                  <p className="mt-1 text-xs font-bold text-slate-600">Timer pauses when this tab is hidden/minimized and reward unlocks only after the scroll target is reached.</p>
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
