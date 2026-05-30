import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Announcement, NewsArticle } from '../App';

type ReadingView = 'hub' | 'article' | 'announcement';

interface ReadingDrawerProps {
  isOpen: boolean;
  view: ReadingView;
  articles: NewsArticle[];
  announcements: Announcement[];
  selectedArticle: NewsArticle | null;
  selectedAnnouncement: Announcement | null;
  onClose: () => void;
  onSelectArticle: (article: NewsArticle) => void;
  onSelectAnnouncement: (announcement: Announcement) => void;
}

const estimateReadMinutes = (text?: string) => Math.max(1, Math.ceil((text || '').split(/\s+/).filter(Boolean).length / 180));
const formatDate = (date: string) => new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const isExternalArticle = (article: NewsArticle | null) => {
  if (!article) return false;
  const possibleUrl = (article as NewsArticle & { externalUrl?: string }).externalUrl || article.content;
  return /^https?:\/\//i.test(possibleUrl.trim());
};
const getArticleUrl = (article: NewsArticle) => ((article as NewsArticle & { externalUrl?: string }).externalUrl || article.content).trim();

const SponsoredPartnerCard = () => (
  <aside className="my-12 overflow-hidden rounded-[2rem] border border-purple-500/30 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-1 shadow-[0_0_40px_rgba(129,140,248,0.16)]">
    <div className="rounded-[1.75rem] bg-slate-950/50 p-6 backdrop-blur-2xl sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-purple-200/80">Sponsored Partner</p>
          <h3 className="mt-3 text-2xl font-black text-white">Level up tonight's study sprint</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Discover a handpicked premium resource built for sharper notes, faster revision, and calmer exam weeks.
          </p>
        </div>
        <button className="rounded-full bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-purple-400 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_0_30px_rgba(168,85,247,0.45)] transition hover:scale-105">
          Explore Feature
        </button>
      </div>
    </div>
  </aside>
);

const HubCard: React.FC<{ title: string; meta: string; excerpt: string; badge: string; imageSeed?: string; onClick: () => void; }> = ({ title, meta, excerpt, badge, imageSeed, onClick }) => (
  <button onClick={onClick} className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 text-left shadow-2xl backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-indigo-300/40 hover:bg-white/[0.07]">
    {imageSeed && (
      <div className="mb-5 h-44 overflow-hidden rounded-[1.5rem] bg-slate-900">
        <img src={`https://picsum.photos/seed/${imageSeed}/900/540`} alt="" className="h-full w-full object-cover opacity-85 transition duration-700 group-hover:scale-110 group-hover:opacity-100" />
      </div>
    )}
    <div className="flex items-center justify-between gap-4">
      <span className="rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-indigo-200">{badge}</span>
      <span className="text-xs text-slate-500">{meta}</span>
    </div>
    <h3 className="mt-4 text-xl font-black leading-tight text-white transition group-hover:text-indigo-100">{title}</h3>
    <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">{excerpt}</p>
    <div className="mt-5 text-sm font-black text-indigo-200">Open in reading hub →</div>
  </button>
);

const ReadingDrawer: React.FC<ReadingDrawerProps> = ({ isOpen, view, articles, announcements, selectedArticle, selectedAnnouncement, onClose, onSelectArticle, onSelectAnnouncement }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    scrollRef.current?.scrollTo({ top: 0 });
    setProgress(0);
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, view, selectedArticle?.id, selectedAnnouncement?.id]);

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
    return { title: 'Daily Reading Hub', source: 'Curated for students', date: new Date().toISOString(), readTime: 6 };
  }, [selectedArticle, selectedAnnouncement, view]);

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
    <div className="fixed inset-0 z-[1200] bg-slate-950/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reading-drawer-title" onMouseDown={onClose}>
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <section onMouseDown={(e) => e.stopPropagation()} className="relative h-full w-full overflow-hidden border-l border-white/10 bg-slate-950/90 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-3xl animate-slide-in-right md:w-[88vw] xl:w-[85vw]">
          <div className="sticky top-0 z-30 h-1 bg-slate-900/80">
            <div className="h-full rounded-r-full bg-gradient-to-r from-cyan-300 via-indigo-400 to-fuchsia-400 shadow-[0_0_20px_rgba(129,140,248,0.85)] transition-all duration-150" style={{ width: `${progress}%` }} />
          </div>

          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.24),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.18),transparent_28%)]" />

          <header className="relative z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-slate-950/65 px-4 py-4 backdrop-blur-2xl sm:px-8">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-indigo-200/80">Premium Reading Mode</p>
              <h2 id="reading-drawer-title" className="mt-1 truncate text-lg font-black text-white sm:text-2xl">{activeMeta.title}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button onClick={handleShare} className="rounded-full border border-white/10 bg-white/5 p-3 text-slate-200 transition hover:border-indigo-300/40 hover:bg-indigo-400/10" aria-label="Share reading item">↗</button>
              <button onClick={onClose} className="rounded-full border border-white/10 bg-white/5 p-3 text-slate-200 transition hover:border-rose-300/40 hover:bg-rose-400/10" aria-label="Close reading drawer">✕</button>
            </div>
          </header>

          <div ref={scrollRef} onScroll={handleScroll} className="relative z-10 h-[calc(100%-73px)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="px-5 py-8 sm:px-10 lg:px-16">
              <div className="mx-auto max-w-3xl">
                <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-2xl">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                    <span className="rounded-full bg-indigo-400/10 px-3 py-1 font-bold text-indigo-200">{activeMeta.source}</span>
                    <span>{formatDate(activeMeta.date)}</span>
                    <span>⏳ {activeMeta.readTime} min read</span>
                  </div>
                </div>
              </div>

              {view === 'hub' && (
                <div className="mx-auto max-w-7xl">
                  <div className="mb-10 max-w-3xl">
                    <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">Daily Reading Hub</h1>
                    <p className="mt-5 text-lg leading-8 text-slate-300">A focused, dark-glass stream of news, blog insights, and official updates designed to keep students reading inside the app every day.</p>
                  </div>
                  <div className="grid gap-6 lg:grid-cols-3">
                    {articles.map((article) => <HubCard key={`article-${article.id}`} title={article.title} meta={`${formatDate(article.date)} · ${estimateReadMinutes(article.content)} min`} excerpt={article.excerpt} badge={article.category || 'Blog'} imageSeed={article.imageSeed} onClick={() => onSelectArticle(article)} />)}
                    {announcements.map((announcement) => <HubCard key={`announcement-${announcement.id}`} title={announcement.title} meta={formatDate(announcement.date)} excerpt={announcement.content} badge="Announcement" onClick={() => onSelectAnnouncement(announcement)} />)}
                  </div>
                </div>
              )}

              {view === 'article' && selectedArticle && (
                <article className="mx-auto max-w-3xl">
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-indigo-200">{selectedArticle.category}</p>
                  <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-6xl">{selectedArticle.title}</h1>
                  <p className="mt-6 text-xl leading-8 text-slate-300">{selectedArticle.excerpt}</p>
                  {isExternalArticle(selectedArticle) ? (
                    <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-2 shadow-[0_0_40px_rgba(15,23,42,0.9)] backdrop-blur-2xl">
                      <iframe src={getArticleUrl(selectedArticle)} title={selectedArticle.title} className="h-[72vh] w-full rounded-[1.5rem] border-0 bg-slate-950 [scrollbar-width:none]" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" />
                    </div>
                  ) : (
                    <>
                      <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80 shadow-2xl">
                        <img src={`https://picsum.photos/seed/${selectedArticle.imageSeed}/1400/800`} alt={selectedArticle.title} className="h-full w-full object-cover opacity-90" />
                      </div>
                      <div className="mt-12 space-y-7 text-lg leading-9 text-slate-300">
                        {selectedArticle.content.split('\n').filter(Boolean).map((paragraph, index) => (
                          <React.Fragment key={index}>
                            {index === Math.ceil(selectedArticle.content.split('\n').filter(Boolean).length / 2) && <SponsoredPartnerCard />}
                            <p>{paragraph}</p>
                          </React.Fragment>
                        ))}
                      </div>
                    </>
                  )}
                </article>
              )}

              {view === 'announcement' && selectedAnnouncement && (
                <article className="mx-auto max-w-3xl">
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-purple-200">Official Announcement</p>
                  <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-6xl">{selectedAnnouncement.title}</h1>
                  <div className="mt-12 space-y-7 text-lg leading-9 text-slate-300">
                    {selectedAnnouncement.content.split('\n').filter(Boolean).map((paragraph, index) => (
                      <React.Fragment key={index}>
                        {index === 1 && <SponsoredPartnerCard />}
                        <p>{paragraph}</p>
                      </React.Fragment>
                    ))}
                  </div>
                </article>
              )}

              <div className="h-32" />
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-5 left-1/2 z-30 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-full border border-emerald-300/20 bg-slate-950/80 px-5 py-3 text-center text-sm font-bold text-emerald-100 shadow-[0_0_35px_rgba(16,185,129,0.22)] backdrop-blur-2xl">
            📚 Read 1 more article today to earn +10 EduPoints!
          </div>
        </section>
      </div>
    </div>
  );
};

export default ReadingDrawer;
export type { ReadingView };
