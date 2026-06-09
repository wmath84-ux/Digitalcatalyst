import React, { useEffect, useMemo, useRef, useState } from 'react';

interface EduvoraCommunityProps {
  onClose?: () => void;
}

type CommunityView = 'feed' | 'status' | 'calls';
type AdminPostType = 'text' | 'image' | 'poll';
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
  { id: 1, title: 'Morning sprint template', gradient: 'from-blue-500 via-sky-500 to-emerald-400', likedBy: 28, slots: 'PDF · 780KB' },
  { id: 2, title: 'Offer-stack swipe file', gradient: 'from-white via-sky-400 to-blue-700', likedBy: 41, slots: 'Image · 940KB' },
  { id: 3, title: 'Workshop poll snapshot', gradient: 'from-emerald-400 via-teal-500 to-blue-700', likedBy: 19, slots: 'Poll · 1 min' },
];

const adminPostOptions: Array<{ type: AdminPostType; icon: string; label: string; helper: string }> = [
  { type: 'text', icon: '✍️', label: 'Text', helper: 'Broadcast a note' },
  { type: 'image', icon: '🖼️', label: 'Image', helper: 'Share visual update' },
  { type: 'poll', icon: '📊', label: 'Poll', helper: 'Ask the community' },
];

const EduvoraCommunity: React.FC<EduvoraCommunityProps> = ({ onClose }) => {
  const [isAdmin, setIsAdmin] = useState(true);
  const [activeView, setActiveView] = useState<CommunityView>('feed');
  const [selectedMessageId, setSelectedMessageId] = useState(initialMessages[0].id);
  const [mobileExpandedThreads, setMobileExpandedThreads] = useState<number[]>([]);
  const [messages, setMessages] = useState<FeedMessage[]>(initialMessages);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [adminDraft, setAdminDraft] = useState('');
  const [adminActionOpen, setAdminActionOpen] = useState(false);
  const [adminPostType, setAdminPostType] = useState<AdminPostType>('text');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedMessage = useMemo(() => messages.find((message) => message.id === selectedMessageId) || messages[0], [messages, selectedMessageId]);

  useEffect(() => {
    const getDock = () => document.getElementById('community-bottom-dock');
    const getAdminPanel = () => document.getElementById('community-admin-panel');
    const shouldUseDesktopPointerReveal = () => window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)').matches;
    const revealZonePx = 180;
    let lastPointerY = Number.POSITIVE_INFINITY;

    const setChromeHidden = (hidden: boolean) => {
      const hiddenValue = hidden ? 'true' : 'false';
      const dock = getDock();
      const adminPanel = getAdminPanel();
      if (dock) dock.dataset.hidden = hiddenValue;
      if (adminPanel) adminPanel.dataset.hidden = hiddenValue;
    };

    const applyDockVisibility = () => {
      const dock = getDock();
      if (!dock) return;
      const isScrollHidden = dock.dataset.scrollHidden === 'true';
      const isPointerRevealActive = dock.dataset.pointerReveal === 'true';
      setChromeHidden(isScrollHidden && !isPointerRevealActive);
    };

    const updatePointerReveal = (clientY: number) => {
      const dock = getDock();
      if (!dock) return;
      if (!shouldUseDesktopPointerReveal()) {
        dock.dataset.pointerReveal = 'false';
        applyDockVisibility();
        return;
      }
      lastPointerY = clientY;
      dock.dataset.pointerReveal = window.innerHeight - clientY <= revealZonePx ? 'true' : 'false';
      applyDockVisibility();
    };

    const onScroll = () => {
      const dock = getDock();
      const scrollContainer = scrollContainerRef.current;
      if (!dock || !scrollContainer) return;
      const y = scrollContainer.scrollTop;
      const last = Number(dock.dataset.lastY || 0);
      dock.dataset.scrollHidden = y > last && y > 120 ? 'true' : 'false';
      dock.dataset.lastY = String(y);
      if (Number.isFinite(lastPointerY)) updatePointerReveal(lastPointerY);
      else applyDockVisibility();
    };

    const onPointerMove = (event: PointerEvent | MouseEvent) => {
      updatePointerReveal(event.clientY);
    };

    const onPointerLeave = () => {
      const dock = getDock();
      if (!dock) return;
      lastPointerY = Number.POSITIVE_INFINITY;
      dock.dataset.pointerReveal = 'false';
      applyDockVisibility();
    };

    const scrollContainer = scrollContainerRef.current;
    scrollContainer?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('mousemove', onPointerMove, { passive: true });
    document.addEventListener('mouseleave', onPointerLeave);
    setChromeHidden(false);
    return () => {
      scrollContainer?.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseleave', onPointerLeave);
    };
  }, [activeView, isAdmin, adminActionOpen]);

  const switchView = (view: CommunityView) => {
    setActiveView(view);
    setAdminActionOpen(false);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openMessage = (messageId: number) => {
    setSelectedMessageId(messageId);
    setMobileExpandedThreads((current) => (
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
          replies: [...message.replies, { id: Date.now(), author: 'You', text: draft, time: 'Just now' }],
        }
        : message
    )));
    setReplyDrafts((current) => ({ ...current, [messageId]: '' }));
  };

  const submitAdminMessage = (postType: AdminPostType = adminPostType) => {
    const draft = adminDraft.trim();
    if (postType === 'text' && !draft) return;
    const labels: Record<AdminPostType, { badge: string; title: string; body: string; avatar: string }> = {
      text: { badge: 'Fresh update', title: 'Admin broadcast', body: draft, avatar: '🛡️' },
      image: { badge: 'Image update', title: 'New image resource shared', body: draft || 'Admin added a visual update for the community. Students can open this card to read details and reply.', avatar: '🖼️' },
      poll: { badge: 'Poll opened', title: 'New community poll', body: draft || 'Admin started a quick poll. Reply with your vote or suggestion in this thread.', avatar: '📊' },
    };
    const next = labels[postType];
    const newMessage: FeedMessage = {
      id: Date.now(),
      admin: 'Admin You',
      badge: next.badge,
      avatar: next.avatar,
      title: next.title,
      body: next.body,
      time: 'Just now',
      reactions: ['🔥 0', '❤️ 0', '💬 0'],
      replies: [],
    };
    setMessages((current) => [newMessage, ...current]);
    setSelectedMessageId(newMessage.id);
    setAdminDraft('');
    setAdminActionOpen(false);
  };

  const MessageSummaryCard: React.FC<{ message: FeedMessage; isActive?: boolean; isMobile?: boolean }> = ({ message, isActive = false, isMobile = false }) => {
    const isExpanded = mobileExpandedThreads.includes(message.id);
    return (
      <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${isActive ? 'border-blue-200 shadow-[0_16px_44px_rgba(37,99,235,0.10)] ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-100 hover:shadow-md'}`}>
        <button type="button" onClick={() => openMessage(message.id)} className="flex w-full items-center gap-3 p-3 text-left sm:p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white via-sky-50 to-emerald-50 text-xl shadow-inner ring-1 ring-blue-100">{message.avatar}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-black text-slate-950 sm:text-base">{message.title}</h3>
              <span className="hidden rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-800 sm:inline-flex">{message.replies.length}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
              <span>{message.admin}</span>
              <span>•</span>
              <span>{message.time}</span>
              <span className="rounded-full border border-blue-100 px-2 py-0.5 text-blue-800">{message.badge}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.reactions.slice(0, 2).map((reaction) => <span key={reaction} className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-700">{reaction}</span>)}
              <span className="rounded-full bg-cyan-50 px-2 py-1 text-[11px] font-black text-cyan-800">💬 {message.replies.length}</span>
            </div>
          </div>
          <span className={`text-slate-400 transition ${isExpanded ? 'rotate-180' : ''} ${isMobile ? '' : 'hidden md:inline'}`}>⌄</span>
        </button>
        {isMobile && isExpanded && <div className="border-t border-slate-100 p-3">{renderMessageDetails(message, true)}</div>}
      </article>
    );
  };

  const renderMessageDetails = (message: FeedMessage, compact = false) => (
    <div className={compact ? '' : 'h-full overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm custom-scrollbar lg:p-7'}>
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white via-sky-50 to-emerald-50 text-2xl shadow-inner ring-1 ring-blue-100">{message.avatar}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-black text-slate-950 sm:text-lg">{message.admin}</h2>
            <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[11px] font-black text-blue-800">{message.badge}</span>
            <span className="text-xs font-bold text-slate-500">{message.time}</span>
          </div>
          <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950 lg:text-3xl">{message.title}</h3>
          <p className="mt-3 text-sm leading-7 text-slate-700 sm:text-base">{message.body}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {message.reactions.map((reaction) => <button type="button" key={reaction} className="rounded-full border border-slate-100 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50">{reaction}</button>)}
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-800">💬 {message.replies.length} Replies</span>
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {message.replies.map((reply) => (
          <div key={reply.id} className="rounded-[1.35rem] border border-slate-100 bg-slate-50/80 px-4 py-3 shadow-sm sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-black text-slate-900">{reply.author}</span>
              <span className="text-[11px] font-bold text-slate-500">{reply.time}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-700">{reply.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-blue-100 bg-white p-2 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
        <input value={replyDrafts[message.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [message.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') submitReply(message.id); }} placeholder="Write a thread reply..." className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400" />
        <button type="button" onClick={() => submitReply(message.id)} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-blue-800">Reply</button>
      </div>
    </div>
  );

  return (
    <section className="relative h-screen overflow-hidden bg-white text-slate-950">
      <header className="relative z-30 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-4 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          {onClose && (
            <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg font-black text-slate-800 shadow-sm transition hover:-translate-x-0.5 hover:bg-blue-50 hover:text-slate-950" aria-label="Back to home">←</button>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-blue-800 sm:text-xs">Trusted Community</p>
            <h1 className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-3xl">Eduvora Community</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <button type="button" onClick={() => setIsAdmin(true)} className={`rounded-full px-4 py-2 text-xs font-black transition sm:px-5 ${isAdmin ? 'bg-blue-700 text-white shadow-[0_10px_26px_rgba(29,78,216,0.28)]' : 'text-slate-600 hover:bg-blue-50'}`}>Admin</button>
          <button type="button" onClick={() => setIsAdmin(false)} className={`rounded-full px-4 py-2 text-xs font-black transition sm:px-5 ${!isAdmin ? 'bg-blue-700 text-white shadow-[0_10px_26px_rgba(29,78,216,0.28)]' : 'text-slate-600 hover:bg-blue-50'}`}>User</button>
        </div>
      </header>

      <main ref={scrollContainerRef} className="relative z-10 h-[calc(100vh-76px)] overflow-y-auto bg-white px-3 pb-40 pt-4 custom-scrollbar sm:px-5 lg:px-8 xl:px-10">
        {activeView === 'feed' && (
          <div className="mx-auto grid w-full max-w-[1800px] gap-5 md:h-[calc(100vh-9rem)] md:grid-cols-[minmax(300px,420px)_1fr]">
            <aside className="hidden min-h-0 overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-3 custom-scrollbar md:block">
              <div className="mb-3 px-2">
                <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-500">Chats</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">Thin updates. Click to expand on the right.</p>
              </div>
              <div className="space-y-2">
                {messages.map((message) => <MessageSummaryCard key={message.id} message={message} isActive={message.id === selectedMessage.id} />)}
              </div>
            </aside>
            <section className="hidden min-h-0 md:block">{renderMessageDetails(selectedMessage)}</section>
            <section className="space-y-3 md:hidden">
              {messages.map((message) => <MessageSummaryCard key={message.id} message={message} isMobile />)}
            </section>
          </div>
        )}

        {activeView === 'status' && (
          <div className="mx-auto max-w-[1800px] space-y-5">
            <div className="rounded-[1.6rem] border border-blue-100 bg-gradient-to-r from-white via-sky-50/90 to-emerald-50/80 p-4 text-center shadow-[0_18px_54px_rgba(15,23,42,0.06)]">
              <p className="text-sm font-black text-blue-900 sm:text-base">1MB Limit &amp; 150 Slots Left</p>
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
            <button type="button" className="fixed bottom-28 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-white/45 bg-blue-700 text-2xl text-white shadow-[0_18px_54px_rgba(15,23,42,0.32)] transition hover:-translate-y-1 md:bottom-24 md:right-10" aria-label="Upload status">＋</button>
          </div>
        )}

        {activeView === 'calls' && (
          <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-[1800px] items-center justify-center rounded-[2rem] border border-white/80 bg-gradient-to-br from-blue-950 via-slate-950 to-emerald-950 p-8 text-center text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="max-w-xl">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white/10 text-4xl shadow-inner ring-1 ring-white/15">📞</div>
              <h2 className="mt-6 text-4xl font-black tracking-tight">Community Calls</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300 sm:text-base">Live voice rooms will open here as a full-screen nested page. For now, this keeps the dock interaction consistent and ready for the next call feature.</p>
            </div>
          </div>
        )}
      </main>

      {isAdmin && adminActionOpen && (
        <div id="community-admin-panel" className="absolute inset-x-3 bottom-24 z-20 mx-auto max-w-2xl rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.16)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] data-[hidden=true]:translate-y-28 data-[hidden=true]:opacity-0 data-[hidden=true]:pointer-events-none md:bottom-24">
          <div className="grid grid-cols-3 gap-2">
            {adminPostOptions.map((option) => (
              <button key={option.type} type="button" onClick={() => setAdminPostType(option.type)} className={`rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 ${adminPostType === option.type ? 'border-blue-200 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <span className="text-2xl">{option.icon}</span>
                <span className="mt-2 block text-sm font-black text-slate-950">{option.label}</span>
                <span className="mt-1 block text-[11px] font-bold text-slate-500">{option.helper}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-blue-100 bg-white p-2 shadow-inner">
            <input value={adminDraft} onChange={(event) => setAdminDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitAdminMessage(); }} placeholder={adminPostType === 'text' ? 'Write text message...' : `Optional caption for ${adminPostType}...`} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400" />
            <button type="button" onClick={() => submitAdminMessage()} className="rounded-xl bg-blue-700 px-5 py-3 text-xs font-black text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)] transition hover:-translate-y-0.5 hover:bg-blue-800">Send</button>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center px-3 pointer-events-none">
        <nav id="community-bottom-dock" className="pointer-events-auto flex max-w-[96vw] items-center gap-2 rounded-[2rem] border border-slate-200 bg-white p-2 shadow-[0_22px_70px_rgba(15,23,42,0.18)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] data-[hidden=true]:translate-y-24 data-[hidden=true]:opacity-0" aria-label="Community dock">
          <button type="button" onClick={() => switchView('feed')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'feed' ? 'bg-blue-700 text-white shadow-lg shadow-blue-700/20 ring-1 ring-blue-100' : 'bg-white text-slate-800'}`}><span className="block text-2xl">📢</span><span className="text-[11px] font-black">Feed</span></button>
          <button type="button" onClick={() => switchView('status')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'status' ? 'bg-blue-700 text-white shadow-lg shadow-blue-700/20 ring-1 ring-blue-100' : 'bg-white text-slate-800'}`}><span className="block text-2xl">⭕</span><span className="text-[11px] font-black">Status</span></button>
          <button type="button" onClick={() => switchView('calls')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'calls' ? 'bg-blue-700 text-white shadow-lg shadow-blue-700/20 ring-1 ring-blue-100' : 'bg-white text-slate-800'}`}><span className="block text-2xl">📞</span><span className="text-[11px] font-black">Calls</span></button>
          {isAdmin && <button type="button" onClick={() => setAdminActionOpen((open) => !open)} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${adminActionOpen ? 'bg-blue-700 text-white shadow-lg shadow-blue-700/20 ring-1 ring-blue-100' : 'bg-white text-slate-800'}`}><span className="block text-2xl">＋</span><span className="text-[11px] font-black">Post</span></button>}
        </nav>
      </div>
    </section>
  );
};

export default EduvoraCommunity;
