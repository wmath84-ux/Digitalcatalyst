import React, { useMemo, useState } from 'react';

interface EduvoraCommunityProps {
  onClose?: () => void;
}

type CommunityView = 'feed' | 'status';
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
  { id: 1, title: 'Morning sprint template', gradient: 'from-rose-400 via-fuchsia-500 to-indigo-500', likedBy: 28, slots: 'PDF · 780KB' },
  { id: 2, title: 'Offer-stack swipe file', gradient: 'from-cyan-400 via-blue-500 to-violet-600', likedBy: 41, slots: 'Image · 940KB' },
  { id: 3, title: 'Workshop poll snapshot', gradient: 'from-emerald-300 via-teal-400 to-sky-500', likedBy: 19, slots: 'Poll · 1 min' },
];

const menuOptions = ['File', 'Edit', 'View'];

const EduvoraCommunity: React.FC<EduvoraCommunityProps> = ({ onClose }) => {
  const [isAdmin, setIsAdmin] = useState(true);
  const [activeView, setActiveView] = useState<CommunityView>('feed');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<number[]>([1]);
  const [messages, setMessages] = useState<FeedMessage[]>(initialMessages);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [adminDraft, setAdminDraft] = useState('');

  const currentTime = useMemo(() => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date()), []);

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
        avatar: '🍎',
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

  return (
    <div className="fixed inset-0 z-[1200] overflow-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(56,189,248,0.42),transparent_26%),radial-gradient(circle_at_86%_12%,rgba(168,85,247,0.38),transparent_28%),linear-gradient(135deg,#e0f2fe_0%,#f5f3ff_48%,#fdf2f8_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.72),rgba(255,255,255,0.18)),radial-gradient(circle_at_50%_115%,rgba(15,23,42,0.18),transparent_40%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/24 blur-3xl" />

      <header className="absolute inset-x-0 top-0 z-30 h-8 border-b border-white/30 bg-white/40 shadow-[0_8px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-3 text-[13px] font-semibold text-slate-800 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" aria-label="Mac window controls">
              <button type="button" onClick={onClose} className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12),0_1px_4px_rgba(255,95,87,0.5)] transition hover:scale-110" aria-label="Close Eduvora Community" />
              <span className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" />
            </div>
            <span className="font-black tracking-tight text-slate-950">EDUVORA</span>
            <nav className="hidden items-center gap-5 md:flex" aria-label="Desktop menu">
              {menuOptions.map((option) => <button type="button" key={option} className="text-slate-700 transition hover:text-slate-950">{option}</button>)}
            </nav>
          </div>
          <div className="hidden items-center gap-3 text-xs text-slate-700 md:flex">
            <span>Wi-Fi</span>
            <span>Battery 96%</span>
            <span>{currentTime}</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex h-full max-w-6xl flex-col px-3 pb-32 pt-12 sm:px-6 md:pb-28 md:pt-14">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-white/45 bg-white/35 p-3 shadow-[0_22px_70px_rgba(30,41,59,0.14)] backdrop-blur-2xl">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-indigo-700/80">Liquid Community</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Eduvora Community</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/50 bg-white/45 p-1 shadow-inner backdrop-blur-xl">
            <button type="button" onClick={() => setIsAdmin(true)} className={`rounded-full px-4 py-2 text-xs font-black transition ${isAdmin ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-700 hover:bg-white/50'}`}>Admin</button>
            <button type="button" onClick={() => setIsAdmin(false)} className={`rounded-full px-4 py-2 text-xs font-black transition ${!isAdmin ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-700 hover:bg-white/50'}`}>User</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-[2rem] border border-white/45 bg-white/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_28px_90px_rgba(15,23,42,0.16)] backdrop-blur-3xl custom-scrollbar sm:p-5">
          {activeView === 'feed' ? (
            <div className="space-y-4">
              {messages.map((message) => {
                const isExpanded = expandedThreads.includes(message.id);
                return (
                  <article key={message.id} className="overflow-hidden rounded-[1.75rem] border border-white/50 bg-white/52 shadow-[0_18px_54px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition duration-300 hover:-translate-y-0.5 hover:bg-white/62">
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/55 text-2xl shadow-inner">{message.avatar}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-black text-slate-950">{message.admin}</h2>
                            <span className="rounded-full border border-indigo-200/60 bg-indigo-100/70 px-2.5 py-1 text-[11px] font-black text-indigo-700">{message.badge}</span>
                            <span className="text-xs font-bold text-slate-500">{message.time}</span>
                          </div>
                          <h3 className="mt-3 text-lg font-black tracking-tight text-slate-950">{message.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{message.body}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 pl-0 sm:pl-[3.75rem]">
                        {message.reactions.map((reaction) => <button type="button" key={reaction} className="rounded-full border border-white/55 bg-white/55 px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/80">{reaction}</button>)}
                        <button type="button" onClick={() => toggleThread(message.id)} className="rounded-full border border-cyan-200/70 bg-cyan-100/65 px-3 py-1.5 text-xs font-black text-cyan-800 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-cyan-100">
                          💬 {message.replies.length} Replies
                        </button>
                      </div>
                    </div>

                    <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="border-t border-white/55 bg-white/35 p-4 backdrop-blur-2xl sm:p-5">
                          <div className="space-y-3">
                            {message.replies.map((reply) => (
                              <div key={reply.id} className="rounded-2xl border border-white/55 bg-white/60 px-4 py-3 shadow-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-black text-slate-900">{reply.author}</span>
                                  <span className="text-[11px] font-bold text-slate-500">{reply.time}</span>
                                </div>
                                <p className="mt-1 text-sm leading-5 text-slate-700">{reply.text}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/65 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-2xl">
                            <input value={replyDrafts[message.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [message.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') submitReply(message.id); }} placeholder={isAdmin ? 'Preview a user suggestion...' : 'Write your reply suggestion...'} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400" />
                            <button type="button" onClick={() => submitReply(message.id)} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-lg transition hover:-translate-y-0.5">Reply</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-amber-200/70 bg-amber-100/70 p-4 text-center shadow-[0_18px_54px_rgba(245,158,11,0.14)] backdrop-blur-2xl">
                <p className="text-sm font-black text-amber-800">1MB Limit &amp; 150 Slots Left</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {statusCards.map((card) => (
                  <article key={card.id} className="group relative min-h-[17rem] overflow-hidden rounded-[2rem] border border-white/45 bg-white/40 p-4 shadow-[0_22px_70px_rgba(15,23,42,0.16)] backdrop-blur-2xl">
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-80 transition duration-500 group-hover:scale-105`} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_16%,rgba(255,255,255,0.72),transparent_26%),linear-gradient(180deg,transparent,rgba(15,23,42,0.42))]" />
                    <div className="relative flex h-full flex-col justify-between text-white">
                      <span className="w-max rounded-full border border-white/30 bg-white/25 px-3 py-1 text-xs font-black backdrop-blur-xl">{card.slots}</span>
                      <div>
                        <h3 className="text-2xl font-black tracking-tight">{card.title}</h3>
                        <p className="mt-3 w-max rounded-full border border-white/25 bg-white/20 px-3 py-1.5 text-sm font-black backdrop-blur-xl">❤️ Liked by {card.likedBy}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <button type="button" className="fixed bottom-28 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-white/45 bg-slate-950 text-2xl text-white shadow-[0_18px_54px_rgba(15,23,42,0.32)] transition hover:-translate-y-1 md:bottom-24 md:right-10" aria-label="Upload status">＋</button>
            </div>
          )}
        </div>
      </main>

      {isAdmin && (
        <div className="absolute inset-x-3 bottom-24 z-20 mx-auto max-w-3xl rounded-[1.5rem] border border-white/50 bg-white/45 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur-3xl md:bottom-24">
          <div className="flex items-center gap-2 rounded-[1.25rem] border border-white/45 bg-white/55 px-2 py-2 shadow-inner">
            <div className="hidden items-center gap-1 sm:flex">
              {['📄', '🖼️', '📊'].map((icon) => <button type="button" key={icon} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/65 text-lg shadow-sm transition hover:-translate-y-0.5 hover:bg-white">{icon}</button>)}
            </div>
            <input value={adminDraft} onChange={(event) => setAdminDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitAdminMessage(); }} placeholder="Admin-only broadcast message..." className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400" />
            <button type="button" onClick={submitAdminMessage} className="rounded-xl bg-gradient-to-r from-slate-950 to-indigo-950 px-5 py-3 text-xs font-black text-white shadow-[0_12px_30px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5">Send</button>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
        <nav className="flex max-w-[96vw] items-center gap-2 rounded-[2rem] border border-white/35 bg-white/38 p-2 shadow-[0_22px_70px_rgba(15,23,42,0.22)] backdrop-blur-3xl" aria-label="Community dock">
          <button type="button" onClick={() => setActiveView('feed')} className={`min-w-[72px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'feed' ? 'bg-white/75 shadow-lg' : 'bg-white/25'}`}><span className="block text-2xl">📢</span><span className="text-[11px] font-black">Feed</span></button>
          <button type="button" onClick={() => setActiveView('status')} className={`min-w-[72px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'status' ? 'bg-white/75 shadow-lg' : 'bg-white/25'}`}><span className="block text-2xl">⭕</span><span className="text-[11px] font-black">Status</span></button>
          <button type="button" className="min-w-[72px] rounded-2xl bg-white/15 px-3 py-2 text-center opacity-45 grayscale transition"><span className="block text-2xl">📞</span><span className="text-[11px] font-black">Calls</span></button>
          <button type="button" onClick={() => setIsMenuOpen(true)} className="min-w-[72px] rounded-2xl bg-white/25 px-3 py-2 text-center transition hover:-translate-y-1 md:hidden"><span className="block text-2xl">🍔</span><span className="text-[11px] font-black">Menu</span></button>
        </nav>
      </div>

      <div className={`fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-sm transition md:hidden ${isMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setIsMenuOpen(false)}>
        <div className={`absolute inset-x-3 bottom-3 rounded-[2rem] border border-white/45 bg-white/62 p-4 shadow-[0_28px_90px_rgba(15,23,42,0.28)] backdrop-blur-3xl transition duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isMenuOpen ? 'translate-y-0' : 'translate-y-[120%]'}`} onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-400/60" />
          <p className="mb-3 px-2 text-xs font-black uppercase tracking-[0.25em] text-slate-500">Menu</p>
          <div className="space-y-2">
            {menuOptions.map((option) => <button type="button" key={option} onClick={() => setIsMenuOpen(false)} className="w-full rounded-2xl border border-white/55 bg-white/55 px-4 py-3 text-left text-sm font-black text-slate-800 shadow-sm transition hover:bg-white">{option}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EduvoraCommunity;
