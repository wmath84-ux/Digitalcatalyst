import React, { useRef, useState } from 'react';

interface EduvoraCommunityProps {
  onClose?: () => void;
}

type CommunityView = 'feed' | 'status' | 'calls';
type Reply = {
  id: number;
  author: string;
  text: string;
  time: string;
};

type FeedMessage = {
  id: number;
  admin: string;
  badge: string;
  avatar: string;
  title: string;
  body: string;
  time: string;
  reactions: string[];
  replies: Reply[];
};

const initialMessages: FeedMessage[] = [
  {
    id: 1,
    admin: 'Admin Aarya',
    badge: 'Pinned announcement',
    avatar: '🧑‍💻',
    title: 'New creator funnel PDF is live',
    body: 'Batch 06 students can now download the revised funnel checklist. Reply below with your best landing page hook and we will review the strongest ones in tomorrow\'s sprint.',
    time: '9:41 AM',
    reactions: ['🔥 24', '🚀 12', '✅ 31'],
    replies: [
      { id: 1, author: 'Riya', text: 'My hook: Stop wasting ad spend on cold pages. Build trust first.', time: '9:48 AM' },
      { id: 2, author: 'Kabir', text: 'Can we include a one-page audit template too?', time: '9:55 AM' },
      { id: 3, author: 'Meera', text: 'The CTA examples are super clear now.', time: '10:02 AM' },
      { id: 4, author: 'Dev', text: 'I am testing this with my skincare niche store.', time: '10:08 AM' },
      { id: 5, author: 'Anaya', text: 'Please review my headline in the live session.', time: '10:13 AM' },
    ],
  },
  {
    id: 2,
    admin: 'Admin Veer',
    badge: 'Daily task',
    avatar: '👨‍🏫',
    title: 'Drop your 3-line offer stack',
    body: 'Normal users cannot create main feed posts, but everyone can contribute inside the thread. Keep your offer short: product, bonus, guarantee.',
    time: '11:20 AM',
    reactions: ['💡 18', '❤️ 29', '📌 7'],
    replies: [
      { id: 1, author: 'Nisha', text: 'Product: Canva kit. Bonus: 25 captions. Guarantee: 7-day launch clarity.', time: '11:26 AM' },
      { id: 2, author: 'Arjun', text: 'I need help making my guarantee stronger.', time: '11:31 AM' },
    ],
  },
  {
    id: 3,
    admin: 'Admin Sia',
    badge: 'Poll reminder',
    avatar: '👩‍🚀',
    title: 'Choose next workshop topic',
    body: 'Poll closes tonight. Vote for reels scripting, email automation, or beginner ads. Detailed notes will be uploaded in Status after the workshop.',
    time: '1:05 PM',
    reactions: ['🗳️ 42', '✨ 16', '👀 22'],
    replies: [
      { id: 1, author: 'Tara', text: 'Email automation please. It feels most confusing right now.', time: '1:17 PM' },
      { id: 2, author: 'Yash', text: 'Beginner ads + budget sheet would be amazing.', time: '1:22 PM' },
      { id: 3, author: 'Ira', text: 'Reels scripting with hooks examples.', time: '1:24 PM' },
    ],
  },
];

const statusCards = [
  { id: 1, title: 'Morning sprint template', gradient: 'from-emerald-500 via-teal-500 to-cyan-600', likedBy: 28, slots: 'PDF · 780KB' },
  { id: 2, title: 'Offer-stack swipe file', gradient: 'from-sky-500 via-blue-600 to-indigo-700', likedBy: 41, slots: 'Image · 940KB' },
  { id: 3, title: 'Workshop poll snapshot', gradient: 'from-slate-900 via-zinc-800 to-emerald-700', likedBy: 19, slots: 'Poll · 1 min' },
];

const EduvoraCommunity: React.FC<EduvoraCommunityProps> = ({ onClose }) => {
  const [isAdmin, setIsAdmin] = useState(true);
  const [activeView, setActiveView] = useState<CommunityView>('feed');
  const [expandedThreads, setExpandedThreads] = useState<number[]>([1]);
  const [messages, setMessages] = useState<FeedMessage[]>(initialMessages);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [adminDraft, setAdminDraft] = useState('');
  const [isChromeHidden, setIsChromeHidden] = useState(false);
  const lastScrollTop = useRef(0);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const nextTop = event.currentTarget.scrollTop;
    const delta = nextTop - lastScrollTop.current;
    if (nextTop < 20 || delta < -10) setIsChromeHidden(false);
    if (delta > 14 && nextTop > 80) setIsChromeHidden(true);
    lastScrollTop.current = nextTop;
  };

  const switchView = (view: CommunityView) => {
    setActiveView(view);
    setIsChromeHidden(false);
    lastScrollTop.current = 0;
  };

  const toggleThread = (messageId: number) => {
    setExpandedThreads((current) => (
      current.includes(messageId) ? current.filter((id) => id !== messageId) : [...current, messageId]
    ));
  };

  const submitReply = (messageId: number) => {
    const draft = (replyDrafts[messageId] || '').trim();
    if (!draft) return;

    setMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
          ...message,
          replies: [
            ...message.replies,
            { id: Date.now(), author: 'You', text: draft, time: 'Just now' },
          ],
        }
        : message
    )));
    setReplyDrafts((current) => ({ ...current, [messageId]: '' }));
  };

  const submitAdminMessage = () => {
    const draft = adminDraft.trim();
    if (!draft) return;

    setMessages((current) => [
      {
        id: Date.now(),
        admin: 'Admin You',
        badge: 'Fresh update',
        avatar: '🛡️',
        title: 'Admin broadcast',
        body: draft,
        time: 'Just now',
        reactions: ['🔥 0', '❤️ 0', '💬 0'],
        replies: [],
      },
      ...current,
    ]);
    setAdminDraft('');
  };

  const bottomChromeClass = isChromeHidden ? 'translate-y-32 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100';

  return (
    <section className="relative h-screen overflow-hidden bg-[#f5fbfb] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_5%_12%,rgba(20,184,166,0.20),transparent_32%),radial-gradient(circle_at_96%_0%,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,rgba(236,253,245,0.95),rgba(248,250,252,0.96)_42%,rgba(236,254,255,0.86))]" />
      <div className="pointer-events-none absolute -left-28 bottom-0 h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-24 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />

      <header className="relative z-30 flex h-[76px] items-center justify-between border-b border-white/70 bg-white/70 px-4 shadow-[0_10px_40px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          {onClose && (
            <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-white/80 text-lg font-black text-slate-700 shadow-sm transition hover:-translate-x-0.5 hover:bg-emerald-50" aria-label="Back to home">
              ←
            </button>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-emerald-600 sm:text-xs">Trusted Community</p>
            <h1 className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-3xl">Eduvora Community</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/80 bg-white/75 p-1 shadow-[0_10px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          <button type="button" onClick={() => setIsAdmin(true)} className={`rounded-full px-4 py-2 text-xs font-black transition sm:px-5 ${isAdmin ? 'bg-[#07131f] text-white shadow-[0_10px_26px_rgba(7,19,31,0.28)]' : 'text-slate-600 hover:bg-emerald-50'}`}>Admin</button>
          <button type="button" onClick={() => setIsAdmin(false)} className={`rounded-full px-4 py-2 text-xs font-black transition sm:px-5 ${!isAdmin ? 'bg-[#07131f] text-white shadow-[0_10px_26px_rgba(7,19,31,0.28)]' : 'text-slate-600 hover:bg-emerald-50'}`}>User</button>
        </div>
      </header>

      <main onScroll={handleScroll} className="relative z-10 h-[calc(100vh-76px)] overflow-y-auto px-3 pb-40 pt-4 custom-scrollbar sm:px-5 lg:px-8 xl:px-10">
        <div className="mx-auto min-h-full w-full max-w-[1800px] rounded-[2rem] border border-white/80 bg-white/48 p-3 shadow-[0_28px_100px_rgba(15,23,42,0.10)] backdrop-blur-3xl sm:p-5 lg:p-7">
          {activeView === 'feed' && (
            <div className="space-y-4">
              {messages.map((message) => {
                const isExpanded = expandedThreads.includes(message.id);
                return (
                  <article key={message.id} className="overflow-hidden rounded-[1.8rem] border border-white/80 bg-white/78 shadow-[0_16px_50px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.025] backdrop-blur-2xl transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
                    <div className="p-4 sm:p-6 lg:p-8">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-cyan-100 text-2xl shadow-inner ring-1 ring-emerald-100 sm:h-14 sm:w-14">{message.avatar}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-black text-slate-950 sm:text-lg">{message.admin}</h2>
                            <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">{message.badge}</span>
                            <span className="text-xs font-bold text-slate-500">{message.time}</span>
                          </div>
                          <h3 className="mt-4 text-xl font-black tracking-tight text-slate-950 lg:text-2xl">{message.title}</h3>
                          <p className="mt-3 max-w-6xl text-sm leading-7 text-slate-700 sm:text-base">{message.body}</p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-2 pl-0 sm:pl-[4.5rem]">
                        {message.reactions.map((reaction) => <button type="button" key={reaction} className="rounded-full border border-slate-100 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50">{reaction}</button>)}
                        <button type="button" onClick={() => toggleThread(message.id)} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-100">
                          💬 {message.replies.length} Replies
                        </button>
                      </div>
                    </div>

                    <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/80 to-white/90 p-4 sm:p-6 lg:p-8">
                          <div className="space-y-3">
                            {message.replies.map((reply) => (
                              <div key={reply.id} className="rounded-[1.35rem] border border-slate-100 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:px-5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-black text-slate-900">{reply.author}</span>
                                  <span className="text-[11px] font-bold text-slate-500">{reply.time}</span>
                                </div>
                                <p className="mt-1 text-sm leading-6 text-slate-700">{reply.text}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-100 bg-white p-2 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
                            <input value={replyDrafts[message.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [message.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') submitReply(message.id); }} placeholder={isAdmin ? 'Preview a user suggestion...' : 'Write your reply suggestion...'} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400" />
                            <button type="button" onClick={() => submitReply(message.id)} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 hover:bg-emerald-700">Reply</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {activeView === 'status' && (
            <div className="min-h-[calc(100vh-12rem)] space-y-5">
              <div className="rounded-[1.6rem] border border-amber-200/80 bg-gradient-to-r from-amber-50 via-yellow-50 to-emerald-50 p-4 text-center shadow-[0_18px_54px_rgba(245,158,11,0.12)]">
                <p className="text-sm font-black text-amber-900 sm:text-base">1MB Limit &amp; 150 Slots Left</p>
              </div>
              <div className="grid min-h-[58vh] gap-5 lg:grid-cols-3">
                {statusCards.map((card) => (
                  <article key={card.id} className="group relative min-h-[22rem] overflow-hidden rounded-[2rem] border border-white/80 bg-white/40 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-2xl lg:min-h-[30rem]">
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-95 transition duration-700 group-hover:scale-105`} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_16%,rgba(255,255,255,0.72),transparent_24%),linear-gradient(180deg,transparent,rgba(2,6,23,0.48))]" />
                    <div className="relative flex h-full flex-col justify-between text-white">
                      <span className="w-max rounded-full border border-white/35 bg-white/22 px-4 py-2 text-xs font-black backdrop-blur-xl">{card.slots}</span>
                      <div>
                        <h3 className="text-3xl font-black tracking-tight lg:text-4xl">{card.title}</h3>
                        <p className="mt-5 w-max rounded-full border border-white/25 bg-white/20 px-4 py-2 text-sm font-black backdrop-blur-xl">❤️ Liked by {card.likedBy}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <button type="button" className="fixed bottom-28 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-white/45 bg-[#07131f] text-2xl text-white shadow-[0_18px_54px_rgba(15,23,42,0.32)] transition hover:-translate-y-1 md:bottom-24 md:right-10" aria-label="Upload status">＋</button>
            </div>
          )}

          {activeView === 'calls' && (
            <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center rounded-[2rem] border border-white/80 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-8 text-center text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
              <div className="max-w-xl">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white/10 text-4xl shadow-inner ring-1 ring-white/15">📞</div>
                <h2 className="mt-6 text-4xl font-black tracking-tight">Community Calls</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300 sm:text-base">Live voice rooms will open here as a full-screen nested page. For now, this keeps the dock interaction consistent and ready for the next call feature.</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {isAdmin && activeView === 'feed' && (
        <div className={`absolute inset-x-3 bottom-24 z-20 mx-auto max-w-4xl rounded-[1.5rem] border border-white/80 bg-white/78 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.16)] backdrop-blur-3xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:bottom-24 ${bottomChromeClass}`}>
          <div className="flex items-center gap-2 rounded-[1.25rem] border border-slate-100 bg-white/90 px-2 py-2 shadow-inner">
            <div className="hidden items-center gap-1 sm:flex">
              {['📄', '🖼️', '📊'].map((icon) => <button type="button" key={icon} className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-100">{icon}</button>)}
            </div>
            <input value={adminDraft} onChange={(event) => setAdminDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitAdminMessage(); }} placeholder="Admin-only broadcast message..." className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400" />
            <button type="button" onClick={submitAdminMessage} className="rounded-xl bg-[#07131f] px-5 py-3 text-xs font-black text-white shadow-[0_12px_30px_rgba(15,23,42,0.26)] transition hover:-translate-y-0.5 hover:bg-emerald-700">Send</button>
          </div>
        </div>
      )}

      <div className={`absolute inset-x-0 bottom-3 z-30 flex justify-center px-3 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${bottomChromeClass}`}>
        <nav className="flex max-w-[96vw] items-center gap-2 rounded-[2rem] border border-white/70 bg-white/76 p-2 shadow-[0_22px_70px_rgba(15,23,42,0.18)] backdrop-blur-3xl" aria-label="Community dock">
          <button type="button" onClick={() => switchView('feed')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'feed' ? 'bg-white shadow-lg ring-1 ring-emerald-100' : 'bg-white/40'}`}><span className="block text-2xl">📢</span><span className="text-[11px] font-black">Feed</span></button>
          <button type="button" onClick={() => switchView('status')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'status' ? 'bg-white shadow-lg ring-1 ring-emerald-100' : 'bg-white/40'}`}><span className="block text-2xl">⭕</span><span className="text-[11px] font-black">Status</span></button>
          <button type="button" onClick={() => switchView('calls')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'calls' ? 'bg-white shadow-lg ring-1 ring-emerald-100' : 'bg-white/40'}`}><span className="block text-2xl">📞</span><span className="text-[11px] font-black">Calls</span></button>
        </nav>
      </div>
    </section>
  );
};

export default EduvoraCommunity;
