import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Announcement, NewsArticle } from '../App';

type ReadingListType = 'news' | 'blog';
type ReadingView = ReadingListType | 'article' | 'announcement';

interface ReadingDrawerProps {
  isOpen: boolean;
  view: ReadingView;
  articles: NewsArticle[];
  announcements: Announcement[];
  listType: ReadingListType;
  selectedArticle: NewsArticle | null;
  selectedAnnouncement: Announcement | null;
  onClose: () => void;
  onSelectArticle: (article: NewsArticle) => void;
  onSelectAnnouncement: (announcement: Announcement) => void;
  onBackToList: () => void;
  onExploreFeature: () => void;
  promoTitle?: string;
  promoDescription?: string;
  promoCtaLabel?: string;
  onReadingReward?: (article: NewsArticle) => void;
}


const estimateReadMinutes = (text?: string) => Math.max(1, Math.ceil((text || '').split(/\s+/).filter(Boolean).length / 180));
const formatDate = (date: string) => new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const isExternalArticle = (article: NewsArticle | null) => {
  if (!article) return false;
  const possibleUrl = (article as NewsArticle & { externalUrl?: string }).externalUrl || article.content;
  return /^https?:\/\//i.test(possibleUrl.trim());
};
const getArticleUrl = (article: NewsArticle) => ((article as NewsArticle & { externalUrl?: string }).externalUrl || article.content).trim();
const getArticleImage = (article: NewsArticle, size = '900/540') => article.thumbnailImage || `https://picsum.photos/seed/${article.imageSeed}/${size}`;
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

const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
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
    if (text) nodes.push(<p key={`p-${nodes.length}`} className="my-5 text-lg leading-9 text-slate-600"><InlineMarkdown text={text} /></p>);
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
          <p className="text-xs font-black uppercase tracking-[0.35em] text-purple-200/80">Sponsored Partner</p>
          <h3 className="mt-3 text-2xl font-black text-slate-900">{promoTitle}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{promoDescription}</p>
        </div>
        <button type="button" onClick={onExploreFeature} className="rounded-full bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-purple-400 px-6 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:scale-105">
          {promoCtaLabel}
        </button>
      </div>
    </div>
  </aside>
);

const HubCard: React.FC<{ title: string; meta: string; excerpt: string; badge: string; imageSeed?: string; onClick: () => void; }> = ({ title, meta, excerpt, badge, imageSeed, onClick }) => (
  <button onClick={onClick} className="group relative overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 p-4 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-indigo-300/40 hover:bg-white/80 hover:shadow-sm">
    {imageSeed && (
      <div className="mb-5 h-44 overflow-hidden rounded-[1.5rem] bg-white/70">
        <img src={imageSeed || ''} alt="" className="h-full w-full object-cover opacity-85 transition duration-700 group-hover:scale-110 group-hover:opacity-100" />
      </div>
    )}
    <div className="flex items-center justify-between gap-4">
      <span className="rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-indigo-200">{badge}</span>
      <span className="text-xs text-slate-600">{meta}</span>
    </div>
    <h3 className="mt-4 text-xl font-black leading-tight text-slate-900 transition group-hover:text-indigo-700">{title}</h3>
    <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{excerpt}</p>
    <div className="mt-5 text-sm font-black text-indigo-200">Open in reading hub →</div>
  </button>
);

const ReadingDrawer: React.FC<ReadingDrawerProps> = ({ isOpen, view, articles, announcements, listType, selectedArticle, selectedAnnouncement, onClose, onSelectArticle, onSelectAnnouncement, onBackToList, onExploreFeature, promoTitle, promoDescription, promoCtaLabel, onReadingReward }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const rewardIssuedRef = useRef<number | string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    scrollRef.current?.scrollTo({ top: 0 });
    setProgress(0);
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, view, selectedArticle?.id, selectedAnnouncement?.id]);

  useEffect(() => {
    if (!isOpen || view !== 'article' || !selectedArticle || !onReadingReward) return;
    let secondsRead = 0;
    rewardIssuedRef.current = rewardIssuedRef.current === selectedArticle.id ? rewardIssuedRef.current : null;
    const timer = window.setInterval(() => {
      secondsRead += 5;
      if (secondsRead >= 120 && rewardIssuedRef.current !== selectedArticle.id) {
        rewardIssuedRef.current = selectedArticle.id;
        onReadingReward(selectedArticle);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isOpen, onReadingReward, selectedArticle, view]);

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
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
  };

  const handleShare = async () => {
    const shareData = { title: activeMeta.title, text: `Read this on Digital Catalyst: ${activeMeta.title}`, url: window.location.href };
    if (navigator.share) await navigator.share(shareData);
    else await navigator.clipboard?.writeText(`${shareData.text} ${shareData.url}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] bg-white/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reading-drawer-title" onMouseDown={onClose}>
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <section onMouseDown={(e) => e.stopPropagation()} className="relative h-full w-full overflow-hidden border-l border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-3xl animate-slide-in-right md:w-[88vw] xl:w-[85vw]">
          <div className="sticky top-0 z-30 h-1 bg-white/70">
            <div className="h-full rounded-r-full bg-gradient-to-r from-cyan-300 via-indigo-400 to-fuchsia-400 shadow-sm transition-all duration-150" style={{ width: `${progress}%` }} />
          </div>

          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.24),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.18),transparent_28%)]" />

          <header className="relative z-20 flex items-center justify-between gap-4 border-b border-white/50 bg-white/70 px-4 py-4 backdrop-blur-2xl sm:px-8">
            <div className="flex min-w-0 items-center gap-4">
              {(view === 'article' || view === 'announcement') && (
                <button onClick={onBackToList} className="shrink-0 rounded-full border border-indigo-200/60 bg-white px-4 py-2 text-sm font-black text-indigo-700 shadow-sm transition hover:-translate-x-0.5 hover:bg-indigo-50 hover:shadow-md">
                  ← Back to List
                </button>
              )}
              <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-indigo-200/80">Premium Reading Mode</p>
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
                <div className="mb-8 rounded-[2rem] border border-white/50 bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <span className="rounded-full bg-indigo-400/10 px-3 py-1 font-bold text-indigo-200">{activeMeta.source}</span>
                    <span>{formatDate(activeMeta.date)}</span>
                    <span>⏳ {activeMeta.readTime} min read</span>
                  </div>
                </div>
              </div>

              {(view === 'news' || view === 'blog') && (
                <div className="mx-auto max-w-7xl">
                  <div className="mb-10 max-w-3xl">
                    <p className="text-xs font-black uppercase tracking-[0.35em] text-indigo-200/80">{listType === 'news' ? 'News Desk' : 'Learning Blog'}</p>
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
                    {visibleArticles.map((article) => <HubCard key={`article-${article.id}`} title={article.title} meta={`${formatDate(article.date)} · ${estimateReadMinutes(stripMarkdown(article.content))} min`} excerpt={article.excerpt} badge={article.type === 'news' ? 'News' : article.category || 'Blog'} imageSeed={getArticleImage(article)} onClick={() => onSelectArticle(article)} />)}
                    {listType === 'news' && announcements.map((announcement) => <HubCard key={`announcement-${announcement.id}`} title={announcement.title} meta={formatDate(announcement.date)} excerpt={announcement.content} badge="Announcement" onClick={() => onSelectAnnouncement(announcement)} />)}
                  </div>
                </div>
              )}

              {view === 'article' && selectedArticle && (
                <article className="mx-auto max-w-3xl">
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-indigo-200">{selectedArticle.category}</p>
                  <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900 sm:text-6xl">{selectedArticle.title}</h1>
                  <p className="mt-6 text-xl leading-8 text-slate-600">{selectedArticle.excerpt}</p>
                  {isExternalArticle(selectedArticle) ? (
                    <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
                      <iframe src={getArticleUrl(selectedArticle)} title={selectedArticle.title} className="h-[72vh] w-full rounded-[1.5rem] border-0 bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 [scrollbar-width:none]" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" />
                    </div>
                  ) : (
                    <>
                      <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                        <img src={getArticleImage(selectedArticle, '1400/800')} alt={selectedArticle.title} className="h-full w-full object-cover opacity-90" />
                      </div>
                      <div className="mt-12 text-lg leading-9 text-slate-600">
                        <MarkdownContent content={selectedArticle.content} />
                        <SponsoredPartnerCard promoTitle={promoTitle} promoDescription={promoDescription} promoCtaLabel={promoCtaLabel} onExploreFeature={onExploreFeature} />
                      </div>
                    </>
                  )}
                </article>
              )}

              {view === 'announcement' && selectedAnnouncement && (
                <article className="mx-auto max-w-3xl">
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-purple-200">Official Announcement</p>
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

          <div className="pointer-events-none absolute bottom-5 left-1/2 z-30 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-full border border-emerald-300/20 bg-white/70 px-5 py-3 text-center text-sm font-bold text-emerald-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            📚 Read 1 more article today to earn +10 EduPoints!
          </div>
        </section>
      </div>
    </div>
  );
};

export default ReadingDrawer;
export type { ReadingView, ReadingListType };
