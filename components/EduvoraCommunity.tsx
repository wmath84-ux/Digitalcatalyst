import React, { useEffect, useMemo, useRef, useState } from 'react';

interface EduvoraCommunityProps {
  onClose?: () => void;
}

type CommunityView = 'feed' | 'status' | 'calls';
type CommunityPage = 'chat' | 'thread' | 'profile' | 'creators' | 'network' | 'following';
type PostType = 'text' | 'image' | 'poll';
type Reply = { id: number; author: string; text: string; time: string };
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
  creatorId?: string;
  postType?: PostType;
};

type Creator = { id: string; name: string; avatar: string; role: string; followers: number };

const creators: Creator[] = [
  { id: 'riya', name: 'Riya Sharma', avatar: '🧕', role: 'Funnel creator', followers: 1280 },
  { id: 'kabir', name: 'Kabir Khan', avatar: '🧑‍🎨', role: 'Offer strategist', followers: 940 },
  { id: 'meera', name: 'Meera Joshi', avatar: '👩‍💻', role: 'Automation mentor', followers: 1510 },
];

const initialMessages: FeedMessage[] = [
  {
    id: 1,
    admin: 'Admin Aarya',
    badge: 'Pinned announcement',
    avatar: '🧑‍💻',
    title: 'New creator funnel PDF is live',
    body: 'Batch 06 students can now download the revised funnel checklist. Reply below with your best landing page hook and we will review the strongest ones in tomorrow\'s sprint.',
    time: '9:41 AM',
    creatorId: 'riya',
    postType: 'text',
    reactions: ['🔥 24', '🚀 12', '✅ 31'],
    replies: [
      { id: 1, author: 'Riya', text: 'My hook: Stop wasting ad spend on cold pages. Build trust first.', time: '9:48 AM' },
      { id: 2, author: 'Kabir', text: 'Can we include a one-page audit template too?', time: '9:55 AM' },
      { id: 3, author: 'Meera', text: 'The CTA examples are super clear now.', time: '10:02 AM' },
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
    creatorId: 'kabir',
    postType: 'poll',
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
    creatorId: 'meera',
    postType: 'image',
    reactions: ['🗳️ 42', '✨ 16', '👀 22'],
    replies: [
      { id: 1, author: 'Tara', text: 'Email automation please. It feels most confusing right now.', time: '1:17 PM' },
      { id: 2, author: 'Yash', text: 'Beginner ads + budget sheet would be amazing.', time: '1:22 PM' },
    ],
  },
];

const statusCards = [
  { id: 1, title: 'Morning sprint template', gradient: 'from-blue-500 via-sky-500 to-emerald-400', likedBy: 28, slots: 'PDF · 780KB' },
  { id: 2, title: 'Offer-stack swipe file', gradient: 'from-white via-sky-400 to-blue-700', likedBy: 41, slots: 'Image · 940KB' },
  { id: 3, title: 'Workshop poll snapshot', gradient: 'from-emerald-400 via-teal-500 to-blue-700', likedBy: 19, slots: 'Poll · 1 min' },
];

const postOptions: Array<{ type: PostType; icon: string; label: string; helper: string }> = [
  { type: 'text', icon: '✍️', label: 'Text', helper: 'Daily text post' },
  { type: 'image', icon: '🖼️', label: 'Image', helper: 'Daily image post' },
  { type: 'poll', icon: '📊', label: 'Poll', helper: 'Daily poll post' },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

const EduvoraCommunity: React.FC<EduvoraCommunityProps> = ({ onClose }) => {
  const [activeView, setActiveView] = useState<CommunityView>('feed');
  const [page, setPage] = useState<CommunityPage>('chat');
  const [pageStack, setPageStack] = useState<CommunityPage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState(initialMessages[0].id);
  const [messages, setMessages] = useState<FeedMessage[]>(initialMessages);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [postDraft, setPostDraft] = useState('');
  const [postType, setPostType] = useState<PostType>('text');
  const [creatorQuota, setCreatorQuota] = useState<Record<string, string[]>>({ [todayKey()]: [] });
  const [followedIds, setFollowedIds] = useState<string[]>(['riya', 'meera']);
  const [isDark, setIsDark] = useState(false);
  const [profile, setProfile] = useState({ name: 'Eduvora Member', avatar: '🧑‍🎓', bio: 'Building digital skills daily.' });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedMessage = useMemo(() => messages.find((message) => message.id === selectedMessageId) || messages[0], [messages, selectedMessageId]);
  const followingMessages = useMemo(() => messages.filter((message) => message.creatorId && followedIds.includes(message.creatorId)), [messages, followedIds]);
  const isPostUsedToday = creatorQuota[todayKey()]?.includes(postType) || false;

  const pushPage = (nextPage: CommunityPage) => {
    setPageStack((stack) => [...stack, page]);
    setPage(nextPage);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    const previous = pageStack[pageStack.length - 1];
    if (previous) {
      setPage(previous);
      setPageStack((stack) => stack.slice(0, -1));
      return;
    }
    onClose?.();
  };

  useEffect(() => {
    const getDock = () => document.getElementById('community-bottom-dock');
    const getReplyBars = () => Array.from(document.querySelectorAll<HTMLElement>('[data-community-replybar="true"]'));
    const shouldUseDesktopPointerReveal = () => window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)').matches;
    const revealZonePx = 180;
    let lastPointerY = Number.POSITIVE_INFINITY;

    const setChromeHidden = (hidden: boolean) => {
      const hiddenValue = hidden ? 'true' : 'false';
      const dock = getDock();
      if (dock) dock.dataset.hidden = hiddenValue;
      getReplyBars().forEach((bar) => { bar.dataset.hidden = hiddenValue; });
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
      dock.dataset.scrollHidden = y < last && y > 80 ? 'true' : 'false';
      dock.dataset.lastY = String(y);
      if (Number.isFinite(lastPointerY)) updatePointerReveal(lastPointerY);
      else applyDockVisibility();
    };

    const onPointerMove = (event: PointerEvent | MouseEvent) => updatePointerReveal(event.clientY);
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
  }, [activeView, page, selectedMessageId]);

  const switchView = (view: CommunityView) => {
    setActiveView(view);
    setPage('chat');
    setPageStack([]);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openMessage = (messageId: number) => {
    setSelectedMessageId(messageId);
    const shouldOpenNestedThread = page === 'following' || window.matchMedia('(max-width: 767px)').matches;
    if (shouldOpenNestedThread) pushPage('thread');
  };

  const submitReply = (messageId: number) => {
    const draft = (replyDrafts[messageId] || '').trim();
    if (!draft) return;
    setMessages((current) => current.map((message) => (
      message.id === messageId
        ? { ...message, replies: [...message.replies, { id: Date.now(), author: profile.name, text: draft, time: 'Just now' }] }
        : message
    )));
    setReplyDrafts((current) => ({ ...current, [messageId]: '' }));
  };

  const submitCreatorPost = () => {
    const draft = postDraft.trim();
    if (!draft || isPostUsedToday) return;
    const labels: Record<PostType, { badge: string; title: string; avatar: string }> = {
      text: { badge: 'Creator text', title: `${profile.name} shared a note`, avatar: profile.avatar },
      image: { badge: 'Creator image', title: `${profile.name} shared an image idea`, avatar: '🖼️' },
      poll: { badge: 'Creator poll', title: `${profile.name} opened a poll`, avatar: '📊' },
    };
    const meta = labels[postType];
    const newMessage: FeedMessage = {
      id: Date.now(),
      admin: profile.name,
      badge: meta.badge,
      avatar: meta.avatar,
      title: meta.title,
      body: draft,
      time: 'Just now',
      creatorId: 'me',
      postType,
      reactions: ['🔥 0', '❤️ 0', '💬 0'],
      replies: [],
    };
    setMessages((current) => [newMessage, ...current]);
    setCreatorQuota((current) => ({ ...current, [todayKey()]: [...(current[todayKey()] || []), postType] }));
    setPostDraft('');
    setSelectedMessageId(newMessage.id);
    setActiveView('feed');
    setPage('chat');
    setPageStack([]);
  };

  const MessageSummaryCard: React.FC<{ message: FeedMessage; isActive?: boolean }> = ({ message, isActive = false }) => (
    <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${isActive ? 'border-blue-200 shadow-[0_16px_44px_rgba(37,99,235,0.10)] ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-100 hover:shadow-md'}`}>
      <button type="button" onClick={() => openMessage(message.id)} className="flex w-full items-center gap-3 p-3 text-left sm:p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white via-sky-50 to-emerald-50 text-xl shadow-inner ring-1 ring-blue-100">{message.avatar}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-slate-950 sm:text-base">{message.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
            <span>{message.admin}</span><span>•</span><span>{message.time}</span>
            <span className="rounded-full border border-blue-100 px-2 py-0.5 text-blue-800">{message.badge}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.reactions.slice(0, 2).map((reaction) => <span key={reaction} className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-700">{reaction}</span>)}
            <span className="rounded-full bg-cyan-50 px-2 py-1 text-[11px] font-black text-cyan-800">💬 {message.replies.length}</span>
          </div>
        </div>
      </button>
    </article>
  );

  const renderMessageDetails = (message: FeedMessage, fullScreen = false) => (
    <div className={`flex min-h-0 flex-col overflow-hidden bg-white ${fullScreen ? 'min-h-[calc(100vh-9rem)]' : 'h-full rounded-[1.75rem] border border-slate-200 shadow-sm'}`}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar lg:p-7">
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
        <div className="mt-5 space-y-3 pb-4">
          {message.replies.map((reply) => (
            <div key={reply.id} className="ml-auto max-w-[92%] rounded-[1.35rem] rounded-br-md border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 px-4 py-3 shadow-[0_10px_30px_rgba(37,99,235,0.08)] ring-1 ring-blue-50 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-black text-blue-950">{reply.author}</span>
                <span className="text-[11px] font-bold text-slate-500">{reply.time}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-700">{reply.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div data-community-replybar="true" className="sticky bottom-0 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-16px_42px_rgba(15,23,42,0.08)] transition-all duration-500 data-[hidden=true]:translate-y-20 data-[hidden=true]:opacity-0">
        <div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-white p-2 shadow-inner">
          <input value={replyDrafts[message.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [message.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') submitReply(message.id); }} placeholder="Write a thread reply..." className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400" />
          <button type="button" onClick={() => submitReply(message.id)} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-blue-800">Reply</button>
        </div>
      </div>
    </div>
  );

  const pageShellClass = isDark ? 'bg-slate-950 text-white' : 'bg-white text-slate-950';
  const mainBackgroundClass = isDark ? 'bg-slate-950' : 'bg-white';

  return (
    <section className={`relative h-screen overflow-hidden ${pageShellClass}`}>
      <header className={`relative z-30 flex h-[76px] items-center justify-between border-b px-4 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:px-6 lg:px-10 ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={goBack} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-lg font-black shadow-sm transition hover:-translate-x-0.5 ${isDark ? 'border-slate-700 bg-slate-900 text-white hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-800 hover:bg-blue-50 hover:text-slate-950'}`} aria-label="Back">←</button>
          <h1 className="truncate text-2xl font-black tracking-tight sm:text-4xl">EDUVORA BOND</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          <button type="button" onClick={() => setIsDark((value) => !value)} className={`rounded-full border px-4 py-2 text-xs font-black shadow-sm transition ${isDark ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-blue-50'}`}>{isDark ? 'Dark' : 'Light'}</button>
          <button type="button" onClick={() => pushPage('profile')} className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-xl shadow-sm" aria-label="Profile">{profile.avatar}</button>
          <button type="button" onClick={() => pushPage('creators')} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-800 shadow-sm transition hover:bg-blue-50">Creators</button>
          <button type="button" onClick={() => pushPage('network')} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-800 shadow-sm transition hover:bg-blue-50">Follow & Followers</button>
          <button type="button" onClick={() => pushPage('following')} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-800 shadow-sm transition hover:bg-blue-50">Following Feed</button>
        </div>
      </header>

      <main ref={scrollContainerRef} className={`relative z-10 h-[calc(100vh-76px)] overflow-y-auto px-3 pb-36 pt-4 custom-scrollbar sm:px-5 lg:px-8 xl:px-10 ${mainBackgroundClass}`}>
        {page === 'chat' && activeView === 'feed' && (
          <div className="mx-auto grid w-full max-w-[1800px] gap-5 md:h-[calc(100vh-9rem)] md:grid-cols-[minmax(300px,420px)_1fr]">
            <aside className={`hidden min-h-0 overflow-y-auto rounded-[1.75rem] border p-3 custom-scrollbar md:block ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50/70'}`}>
              <div className="mb-3 px-2"><h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-500">Chats</h2><p className="mt-1 text-xs font-semibold text-slate-500">Thin updates. Click to expand on the right.</p></div>
              <div className="space-y-2">{messages.map((message) => <MessageSummaryCard key={message.id} message={message} isActive={message.id === selectedMessage.id} />)}</div>
            </aside>
            <section className="hidden min-h-0 md:block">{renderMessageDetails(selectedMessage)}</section>
            <section className="space-y-3 md:hidden">{messages.map((message) => <MessageSummaryCard key={message.id} message={message} />)}</section>
          </div>
        )}

        {page === 'thread' && renderMessageDetails(selectedMessage, true)}

        {page === 'profile' && (
          <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-3xl font-black">Profile customization</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-[120px_1fr]">
              <input value={profile.avatar} onChange={(e) => setProfile((p) => ({ ...p, avatar: e.target.value }))} className="h-24 rounded-3xl border border-blue-100 bg-blue-50 text-center text-5xl outline-none" />
              <div className="space-y-3">
                <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-300" placeholder="Name" />
                <textarea value={profile.bio} onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))} className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-blue-300" placeholder="Bio" />
              </div>
            </div>
          </div>
        )}

        {page === 'creators' && (
          <div className="mx-auto max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-3xl font-black">Creators daily post</h2>
            <p className="mt-2 text-sm font-semibold text-slate-600">Daily limit: one text, one image, and one poll post only.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {postOptions.map((option) => <button key={option.type} type="button" onClick={() => setPostType(option.type)} className={`rounded-2xl border p-4 text-left transition ${postType === option.type ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><span className="text-3xl">{option.icon}</span><span className="mt-2 block font-black">{option.label}</span><span className="text-xs font-bold text-slate-500">{creatorQuota[todayKey()]?.includes(option.type) ? 'Used today' : option.helper}</span></button>)}
            </div>
            <div className="mt-5 rounded-2xl border border-blue-100 p-3">
              <textarea value={postDraft} onChange={(e) => setPostDraft(e.target.value)} placeholder={`Write your daily ${postType} post...`} className="min-h-32 w-full resize-none bg-transparent p-2 font-semibold outline-none" />
              <button type="button" disabled={isPostUsedToday || !postDraft.trim()} onClick={submitCreatorPost} className="mt-2 rounded-xl bg-blue-700 px-5 py-3 text-xs font-black text-white shadow-lg disabled:cursor-not-allowed disabled:bg-slate-300">Post to chat feed</button>
            </div>
          </div>
        )}

        {page === 'network' && (
          <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-3">
            {creators.map((creator) => {
              const followed = followedIds.includes(creator.id);
              return <article key={creator.id} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="text-5xl">{creator.avatar}</div><h3 className="mt-3 text-xl font-black">{creator.name}</h3><p className="text-sm font-semibold text-slate-600">{creator.role}</p><p className="mt-2 text-xs font-black text-blue-800">{creator.followers + (followed ? 1 : 0)} followers</p><button type="button" onClick={() => setFollowedIds((ids) => followed ? ids.filter((id) => id !== creator.id) : [...ids, creator.id])} className={`mt-4 rounded-xl px-4 py-2 text-xs font-black ${followed ? 'bg-slate-100 text-slate-800' : 'bg-blue-700 text-white'}`}>{followed ? 'Unfollow' : 'Follow'}</button></article>;
            })}
          </div>
        )}

        {page === 'following' && (
          <div className="mx-auto max-w-5xl space-y-3">
            <h2 className="text-3xl font-black">Your followers feed</h2>
            <p className="text-sm font-semibold text-slate-600">Only posts from creators you follow are shown here.</p>
            {followingMessages.length ? followingMessages.map((message) => <MessageSummaryCard key={message.id} message={message} isActive={message.id === selectedMessageId} />) : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center font-bold text-slate-500">Follow creators to build this feed.</div>}
          </div>
        )}

        {page === 'chat' && activeView === 'status' && (
          <div className="mx-auto max-w-[1800px] space-y-5">
            <div className="rounded-[1.6rem] border border-blue-100 bg-gradient-to-r from-white via-sky-50/90 to-emerald-50/80 p-4 text-center shadow-[0_18px_54px_rgba(15,23,42,0.06)]"><p className="text-sm font-black text-blue-900 sm:text-base">1MB Limit &amp; 150 Slots Left</p></div>
            <div className="grid min-h-[58vh] gap-5 lg:grid-cols-3">{statusCards.map((card) => <article key={card.id} className="group relative min-h-[22rem] overflow-hidden rounded-[2rem] border border-white/80 bg-white/40 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)] lg:min-h-[30rem]"><div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-95 transition duration-700 group-hover:scale-105`} /><div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_16%,rgba(255,255,255,0.72),transparent_24%),linear-gradient(180deg,transparent,rgba(2,6,23,0.48))]" /><div className="relative flex h-full flex-col justify-between text-white"><span className="w-max rounded-full border border-white/35 bg-white/22 px-4 py-2 text-xs font-black backdrop-blur-xl">{card.slots}</span><div><h3 className="text-3xl font-black tracking-tight lg:text-4xl">{card.title}</h3><p className="mt-5 w-max rounded-full border border-white/25 bg-white/20 px-4 py-2 text-sm font-black backdrop-blur-xl">❤️ Liked by {card.likedBy}</p></div></div></article>)}</div>
          </div>
        )}

        {page === 'chat' && activeView === 'calls' && (
          <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-[1800px] items-center justify-center rounded-[2rem] border border-white/80 bg-gradient-to-br from-blue-950 via-slate-950 to-emerald-950 p-8 text-center text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"><div className="max-w-xl"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white/10 text-4xl shadow-inner ring-1 ring-white/15">📞</div><h2 className="mt-6 text-4xl font-black tracking-tight">Community Calls</h2><p className="mt-3 text-sm leading-7 text-slate-300 sm:text-base">Live voice rooms will open here as a full-screen nested page.</p></div></div>
        )}
      </main>

      <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center px-3 pointer-events-none">
        <nav id="community-bottom-dock" className="pointer-events-auto flex max-w-[96vw] items-center gap-2 rounded-[2rem] border border-slate-200 bg-white p-2 shadow-[0_22px_70px_rgba(15,23,42,0.18)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] data-[hidden=true]:translate-y-5 data-[hidden=true]:scale-75 data-[hidden=true]:opacity-80" aria-label="Community dock">
          <button type="button" onClick={() => switchView('feed')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'feed' && page === 'chat' ? 'bg-blue-700 text-white shadow-lg shadow-blue-700/20 ring-1 ring-blue-100' : 'bg-white text-slate-800'}`}><span className="block text-2xl">📢</span><span className="text-[11px] font-black">Feed</span></button>
          <button type="button" onClick={() => switchView('status')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'status' && page === 'chat' ? 'bg-blue-700 text-white shadow-lg shadow-blue-700/20 ring-1 ring-blue-100' : 'bg-white text-slate-800'}`}><span className="block text-2xl">⭕</span><span className="text-[11px] font-black">Status</span></button>
          <button type="button" onClick={() => switchView('calls')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center transition hover:-translate-y-1 ${activeView === 'calls' && page === 'chat' ? 'bg-blue-700 text-white shadow-lg shadow-blue-700/20 ring-1 ring-blue-100' : 'bg-white text-slate-800'}`}><span className="block text-2xl">📞</span><span className="text-[11px] font-black">Calls</span></button>
        </nav>
      </div>
    </section>
  );
};

export default EduvoraCommunity;
