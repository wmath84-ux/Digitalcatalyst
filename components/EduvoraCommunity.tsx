import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, increment, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';

interface EduvoraCommunityProps {
  onClose?: () => void;
}

type CommunityView = 'feed' | 'status';
type CommunityPage = 'chat' | 'thread' | 'profile' | 'creators' | 'network' | 'following' | 'statusUpload' | 'statusMine' | 'statusReel' | 'directChat' | 'directChatThread' | 'statusDetail';
type PostType = 'text' | 'image' | 'poll';
type Reply = { id: number; author: string; text: string; time: string; avatar?: string; docId?: string; createdAt?: number };
type FeedMessage = { id: number; admin: string; badge: string; avatar: string; title: string; body: string; time: string; reactions: string[]; replies: Reply[]; creatorId?: string; postType?: PostType; imagePreview?: string; imageLayout?: 'thumbnail' | 'original'; pollOptions?: string[]; pollVotes?: number[]; selectedPollOption?: number; likeCount?: number; docId?: string; createdAt?: number; reactionCounts?: Record<string, number>; replyCount?: number };
type Creator = { id: string; username: string; name: string; avatar: string; role: string; followers: number; mutual: boolean; verified?: boolean };
type StatusCard = { id: number; title: string; body: string; gradient: string; likedBy: number; views: number; slots: string; type: PostType; ownerId?: string; imagePreview?: string; imageLayout?: 'thumbnail' | 'original'; pollOptions?: string[]; pollVotes?: number[]; selectedPollOption?: number; docId?: string; createdAt?: number };
type SharedStory = { id: number; statusId: number; recipientId: string; senderId: 'me'; senderName: string; time: string };

const creators: Creator[] = [
  { id: 'riya', username: 'riyafunnels', name: 'Riya Sharma', avatar: '🧕', role: 'Funnel creator', followers: 1280, mutual: true },
  { id: 'kabir', username: 'kabir_offers', name: 'Kabir Khan', avatar: '🧑‍🎨', role: 'Offer strategist', followers: 940, mutual: false },
  { id: 'meera', username: 'meeraauto', name: 'Meera Joshi', avatar: '👩‍💻', role: 'Automation mentor', followers: 1510, mutual: true, verified: true },
  { id: 'tara', username: 'taracreates', name: 'Tara Singh', avatar: '👩‍🎤', role: 'Content systems', followers: 820, mutual: false, verified: true },
  { id: 'yash', username: 'yashgrowth', name: 'Yash Verma', avatar: '🧑‍🚀', role: 'Growth experiments', followers: 690, mutual: false },
];

const initialMessages: FeedMessage[] = [
  { id: 1, admin: 'Admin Aarya', badge: 'Pinned announcement', avatar: '🧑‍💻', title: 'New creator funnel PDF is live', body: 'Batch 06 students can now download the revised funnel checklist. Reply below with your best landing page hook and we will review the strongest ones in tomorrow\'s sprint.', time: '9:41 AM', creatorId: 'riya', postType: 'text', reactions: ['🔥 24', '🚀 12', '✅ 31'], replies: [{ id: 1, author: 'Riya', avatar: '🧕', text: 'My hook: Stop wasting ad spend on cold pages. Build trust first.', time: '9:48 AM' }, { id: 2, author: 'Kabir', avatar: '🧑‍🎨', text: 'Can we include a one-page audit template too?', time: '9:55 AM' }, { id: 3, author: 'Meera', avatar: '👩‍💻', text: 'The CTA examples are super clear now.', time: '10:02 AM' }] },
  { id: 2, admin: 'Admin Veer', badge: 'Daily task', avatar: '👨‍🏫', title: 'Drop your 3-line offer stack', body: 'Normal users cannot create main feed posts, but everyone can contribute inside the thread. Keep your offer short: product, bonus, guarantee.', time: '11:20 AM', creatorId: 'kabir', postType: 'poll', pollOptions: ['Product', 'Bonus', 'Guarantee'], pollVotes: [12, 9, 6], reactions: ['💡 18', '❤️ 29', '📌 7'], replies: [{ id: 1, author: 'Nisha', avatar: '👩‍🎓', text: 'Product: Canva kit. Bonus: 25 captions. Guarantee: 7-day launch clarity.', time: '11:26 AM' }, { id: 2, author: 'Arjun', avatar: '🧑‍💼', text: 'I need help making my guarantee stronger.', time: '11:31 AM' }] },
  { id: 3, admin: 'Admin Sia', badge: 'Poll reminder', avatar: '👩‍🚀', title: 'Choose next workshop topic', body: 'Poll closes tonight. Vote for reels scripting, email automation, or beginner ads. Detailed notes will be uploaded in Status after the workshop.', time: '1:05 PM', creatorId: 'meera', postType: 'image', imagePreview: '🖼️', reactions: ['🗳️ 42', '✨ 16', '👀 22'], replies: [{ id: 1, author: 'Tara', avatar: '👩‍🎤', text: 'Email automation please. It feels most confusing right now.', time: '1:17 PM' }, { id: 2, author: 'Yash', avatar: '🧑‍🚀', text: 'Beginner ads + budget sheet would be amazing.', time: '1:22 PM' }] },
];

const initialStatusCards: StatusCard[] = [
  { id: 1, title: 'Morning sprint template', body: 'Use this prompt stack before your first sales call today.', gradient: 'from-sky-400 via-blue-300 to-emerald-300', likedBy: 0, views: 0, slots: 'Text · 1 min', type: 'text' },
  { id: 2, title: 'Offer-stack swipe file', body: 'A clean preview board for offer, bonus, guarantee, and urgency blocks.', gradient: 'from-violet-400 via-fuchsia-300 to-sky-300', likedBy: 0, views: 0, slots: 'Image · 940KB', type: 'image', imagePreview: '🧩' },
  { id: 3, title: 'Workshop poll snapshot', body: 'Vote for the topic we should break down in the next live workshop.', gradient: 'from-emerald-400 via-teal-300 to-cyan-300', likedBy: 0, views: 0, slots: 'Poll · 1 min', type: 'poll', pollOptions: ['Reels scripting', 'Email automation', 'Beginner ads'], pollVotes: [18, 27, 11] },
];

const postOptions: Array<{ type: PostType; icon: string; label: string; helper: string }> = [
  { type: 'text', icon: '✍️', label: 'Text', helper: 'Daily text post' },
  { type: 'image', icon: '🖼️', label: 'Image', helper: 'Daily image post' },
  { type: 'poll', icon: '📊', label: 'Poll', helper: 'Daily poll post' },
];

const statusTone: Record<PostType, string> = {
  text: 'from-amber-400 via-orange-300 to-rose-300',
  image: 'from-indigo-500 via-sky-400 to-cyan-300',
  poll: 'from-emerald-500 via-lime-300 to-teal-300',
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const STATUS_IMAGE_FALLBACK = '🖼️';
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const COMMUNITY_FEED = 'community_feed';
const COMMUNITY_STATUS = 'community_status';
const MAX_STATUS_FILE_BYTES = 1048576;
const isImageAvatar = (value: string) => value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://');

const createStatusStory = ({
  id,
  type,
  title,
  body,
  imagePreview,
  pollOptions,
}: {
  id: number;
  type: PostType;
  title: string;
  body: string;
  imagePreview?: string;
  pollOptions?: string[];
}): StatusCard => ({
  id,
  title,
  body: body || 'Image story uploaded for today\'s community streak.',
  gradient: statusTone[type],
  likedBy: 0,
  views: 0,
  slots: `${type[0].toUpperCase()}${type.slice(1)} · Just now`,
  type,
  ownerId: 'me',
  imagePreview: type === 'image' ? (imagePreview || STATUS_IMAGE_FALLBACK) : undefined,
  imageLayout: type === 'image' ? 'original' : undefined,
  pollOptions: type === 'poll' ? pollOptions : undefined,
  pollVotes: type === 'poll' ? (pollOptions || []).map(() => 0) : undefined,
});

const asMillis = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis();
  return Date.now();
};

const formatCommunityTime = (value: unknown, fallback = 'Just now') => {
  const millis = asMillis(value);
  if (!Number.isFinite(millis)) return fallback;
  return new Date(millis).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const mapFeedDoc = (snapshotDoc: { id: string; data: () => Record<string, any> }): FeedMessage => {
  const data = snapshotDoc.data();
  const numericId = typeof data.id === 'number' ? data.id : Number.parseInt(snapshotDoc.id.replace(/\D/g, '').slice(-9), 10) || Date.now();
  return {
    id: numericId,
    docId: snapshotDoc.id,
    admin: data.admin || data.authorName || 'Eduvora Creator',
    badge: data.badge || 'Community post',
    avatar: data.avatar || '🧑‍🎓',
    title: data.title || 'Fresh community update',
    body: data.body || data.text || '',
    time: data.time || formatCommunityTime(data.createdAt),
    creatorId: data.creatorId,
    postType: data.postType || data.type || 'text',
    imagePreview: data.imagePreview,
    imageLayout: data.imageLayout || 'thumbnail',
    pollOptions: Array.isArray(data.pollOptions) ? data.pollOptions : undefined,
    pollVotes: Array.isArray(data.pollVotes) ? data.pollVotes : undefined,
    reactions: [],
    reactionCounts: data.reactions || data.reactionCounts || {},
    likeCount: data.likeCount || 0,
    replyCount: data.replyCount || 0,
    replies: [],
    createdAt: asMillis(data.createdAt),
  };
};

const mapStatusDoc = (snapshotDoc: { id: string; data: () => Record<string, any> }): StatusCard => {
  const data = snapshotDoc.data();
  return {
    id: typeof data.id === 'number' ? data.id : Number.parseInt(snapshotDoc.id.replace(/\D/g, '').slice(-9), 10) || Date.now(),
    docId: snapshotDoc.id,
    title: data.title || 'Fresh status',
    body: data.body || '',
    gradient: data.gradient || statusTone[data.type as PostType] || statusTone.text,
    likedBy: data.likedBy || 0,
    views: data.views || 0,
    slots: data.slots || `${data.type || 'Text'} · Just now`,
    type: data.type || 'text',
    ownerId: data.ownerId,
    imagePreview: data.imagePreview,
    imageLayout: data.imageLayout || (data.type === 'image' ? 'original' : undefined),
    pollOptions: Array.isArray(data.pollOptions) ? data.pollOptions : undefined,
    pollVotes: Array.isArray(data.pollVotes) ? data.pollVotes : undefined,
    selectedPollOption: data.selectedPollOption,
    createdAt: asMillis(data.createdAt),
  };
};

const EduvoraCommunity: React.FC<EduvoraCommunityProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const guardedAuth = getAuth();
  const [activeView, setActiveView] = useState<CommunityView>('feed');
  const [page, setPage] = useState<CommunityPage>('chat');
  const [pageStack, setPageStack] = useState<CommunityPage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState(initialMessages[0].id);
  const [selectedStatusId, setSelectedStatusId] = useState(initialStatusCards[0].id);
  const [messages, setMessages] = useState<FeedMessage[]>(initialMessages);
  const [statusCards, setStatusCards] = useState<StatusCard[]>(initialStatusCards);
  const [likedStatuses, setLikedStatuses] = useState<number[]>([]);
  const [likedMessages, setLikedMessages] = useState<number[]>([]);
  const [imageLightbox, setImageLightbox] = useState<{ src: string; alt: string; mode: 'thumbnail' | 'original' } | null>(null);
  const [sharedStories, setSharedStories] = useState<SharedStory[]>([]);
  const [shareStatusId, setShareStatusId] = useState<number | null>(null);
  const [selectedChatId, setSelectedChatId] = useState(creators[0].id);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [expandedReplyId, setExpandedReplyId] = useState<number | null>(null);
  const [loadedReplyDocIds, setLoadedReplyDocIds] = useState<Record<string, boolean>>({});
  const [postDraft, setPostDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [statusImageName, setStatusImageName] = useState('');
  const [statusPollOptions, setStatusPollOptions] = useState(['', '', '']);
  const [postPollOptions, setPostPollOptions] = useState(['', '', '']);
  const [postImageName, setPostImageName] = useState('');
  const [postImagePreview, setPostImagePreview] = useState('');
  const [statusImagePreview, setStatusImagePreview] = useState('');
  const [eduCoins, setEduCoins] = useState(0);
  const [postType, setPostType] = useState<PostType>('text');
  const [statusType, setStatusType] = useState<PostType>('text');
  const [creatorQuota, setCreatorQuota] = useState<Record<string, string[]>>({ [todayKey()]: [] });
  const [followedIds, setFollowedIds] = useState<string[]>(['riya', 'meera']);
  const [networkTab, setNetworkTab] = useState<'mutual' | 'followers' | 'following' | 'forYou'>('following');
  const [networkSearch, setNetworkSearch] = useState('');
  const [profile, setProfile] = useState({ name: 'Eduvora Member', username: 'eduvora_member', avatar: '🧑‍🎓', bio: 'Building digital skills daily.' });
  const [showStatusActions, setShowStatusActions] = useState(false);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const replyComposerRef = useRef<HTMLDivElement>(null);
  const selectedMessage = messages.find((message) => message.id === selectedMessageId) || messages[0];
  const selectedStatus = statusCards.find((status) => status.id === selectedStatusId) || statusCards[0];
  const allCreators = useMemo(() => creators.map((creator) => creator.id === 'me' ? { ...creator, name: profile.name, username: profile.username, avatar: profile.avatar } : creator), [profile]);
  const followingMessages = messages.filter((message) => message.creatorId && (followedIds.includes(message.creatorId) || message.creatorId === 'me'));
  const isPostUsedToday = (creatorQuota[todayKey()] || []).length > 0;
  const myStatuses = statusCards.filter((status) => status.ownerId === 'me');
  const chatCreators = allCreators.filter((creator) => sharedStories.some((story) => story.recipientId === creator.id));
  const activeChatCreator = allCreators.find((creator) => creator.id === selectedChatId) || chatCreators[0] || allCreators[0];
  const activeChatStories = sharedStories.filter((story) => story.recipientId === activeChatCreator?.id);
  const shouldShowStatusDetail = (card: StatusCard) => card.body.length > 140 || Boolean(card.imagePreview && card.body.trim().length > 0);

  const pushPage = (nextPage: CommunityPage) => {
    setShowStatusActions(false);
    setShareStatusId(null);
    setExpandedReplyId(null);
    setPageStack((stack) => [...stack, page]);
    setPage(nextPage);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setExpandedReplyId(null);
    if (pageStack.length) {
      const previous = pageStack[pageStack.length - 1];
      setPage(previous);
      setPageStack((stack) => stack.slice(0, -1));
      return;
    }
    onClose?.();
  };

  useEffect(() => {
    if (!guardedAuth.currentUser) navigate('/auth', { replace: true });
  }, [guardedAuth, navigate]);

  useEffect(() => {
    const feedQuery = query(collection(db, COMMUNITY_FEED), orderBy('createdAt', 'desc'), limit(15));
    return onSnapshot(feedQuery, (snapshot) => {
      const firebaseMessages = snapshot.docs.map((item) => mapFeedDoc(item));
      setMessages(firebaseMessages.length ? firebaseMessages : initialMessages);
    }, (error) => console.warn('community_feed snapshot failed; using local fallback', error));
  }, []);

  useEffect(() => {
    const statusQuery = query(collection(db, COMMUNITY_STATUS), where('createdAt', '>', Date.now() - 86400000), orderBy('createdAt', 'desc'), limit(150));
    return onSnapshot(statusQuery, (snapshot) => {
      const firebaseStatuses = snapshot.docs.map((item) => mapStatusDoc(item));
      setStatusCards(firebaseStatuses.length ? firebaseStatuses : initialStatusCards);
    }, (error) => console.warn('community_status snapshot failed; using local fallback', error));
  }, []);

  useEffect(() => {
    const getDock = () => document.getElementById('community-bottom-dock');
    const getReplyBars = () => Array.from(document.querySelectorAll<HTMLElement>('[data-community-replybar="true"]'));
    const shouldUseDesktopPointerReveal = () => window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)').matches;
    const revealZonePx = 180;
    let lastPointerY = Number.POSITIVE_INFINITY;

    const setChromeHidden = (hidden: boolean) => {
      const dockHiddenValue = hidden || expandedReplyId !== null || page === 'statusReel' ? 'true' : 'false';
      const replyHiddenValue = hidden && expandedReplyId === null ? 'true' : 'false';
      const dock = getDock();
      if (dock) dock.dataset.hidden = dockHiddenValue;
      getReplyBars().forEach((bar) => { bar.dataset.hidden = replyHiddenValue; });
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
      const delta = y - last;
      if (Math.abs(delta) > 2) {
        dock.dataset.scrollHidden = delta > 0 && y > 120 ? 'true' : 'false';
        dock.dataset.lastY = String(y);
      }
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
    const dock = getDock();
    if (dock) {
      dock.dataset.hidden = page === 'statusReel' ? 'true' : 'false';
      dock.dataset.scrollHidden = 'false';
      dock.dataset.pointerReveal = 'false';
      dock.dataset.lastY = String(scrollContainer?.scrollTop || 0);
    }
    setChromeHidden(false);
    return () => {
      scrollContainer?.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseleave', onPointerLeave);
    };
  }, [activeView, page, selectedMessageId, expandedReplyId]);

  useEffect(() => {
    if (expandedReplyId !== null) replyInputRef.current?.focus();
  }, [expandedReplyId]);

  useEffect(() => {
    if (expandedReplyId === null) return undefined;
    const onOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (replyComposerRef.current && !replyComposerRef.current.contains(target)) setExpandedReplyId(null);
    };
    window.addEventListener('pointerdown', onOutsidePointer);
    return () => window.removeEventListener('pointerdown', onOutsidePointer);
  }, [expandedReplyId]);

  const switchView = (view: CommunityView) => {
    setExpandedReplyId(null);
    setShowStatusActions(false);
    setActiveView(view);
    setPage('chat');
    setPageStack([]);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resolveAvatar = (message: FeedMessage) => message.creatorId === 'me' ? profile.avatar : message.avatar;
  const resolveName = (message: FeedMessage) => message.creatorId === 'me' ? profile.name : message.admin;

  const Avatar: React.FC<{ value: string; size?: string; className?: string }> = ({ value, size = 'h-12 w-12', className = '' }) => (
    <div className={`${size} shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-[#111827] via-[#0B0F19] to-cyan-950 text-xl shadow-inner ring-1 ring-blue-100 ${className}`}>{isImageAvatar(value) ? <img src={value} alt="Profile avatar" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center">{value}</span>}</div>
  );

  const loadRepliesForMessage = (message: FeedMessage) => {
    if (!message.docId || loadedReplyDocIds[message.docId]) return;
    const repliesQuery = query(collection(db, COMMUNITY_FEED, message.docId, 'replies'), orderBy('createdAt', 'asc'), limit(50));
    setLoadedReplyDocIds((current) => ({ ...current, [message.docId!]: true }));
    onSnapshot(repliesQuery, (snapshot) => {
      const replies = snapshot.docs.map((replyDoc) => {
        const data = replyDoc.data();
        return { id: Number.parseInt(replyDoc.id.replace(/\D/g, '').slice(-9), 10) || Date.now(), docId: replyDoc.id, author: data.author || data.authorName || 'Member', avatar: data.avatar || '👤', text: data.text || '', time: data.time || formatCommunityTime(data.createdAt), createdAt: asMillis(data.createdAt) };
      });
      setMessages((current) => current.map((item) => item.docId === message.docId ? { ...item, replies } : item));
    }, (error) => console.warn('Lazy replies failed', error));
  };

  const openMessage = (messageId: number) => {
    setExpandedReplyId(null);
    setSelectedMessageId(messageId);
    if (window.matchMedia('(max-width: 767px)').matches) pushPage('thread');
  };

  const openStatusReel = (statusId: number) => {
    setSelectedStatusId(statusId);
    setActiveView('status');
    pushPage('statusReel');
  };

  const submitReply = (messageId: number) => {
    const draft = (replyDrafts[messageId] || '').trim();
    if (!draft) return;
    const targetMessage = messages.find((message) => message.id === messageId);
    const reply = { id: Date.now(), author: profile.name, avatar: profile.avatar, text: draft, time: 'Just now', createdAt: Date.now() };
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, replies: [...message.replies, reply], replyCount: (message.replyCount || message.replies.length) + 1 } : message
    )));
    if (targetMessage?.docId) {
      addDoc(collection(db, COMMUNITY_FEED, targetMessage.docId, 'replies'), reply).catch((error) => console.warn('Reply write failed', error));
      updateDoc(doc(db, COMMUNITY_FEED, targetMessage.docId), { replyCount: increment(1) }).catch((error) => console.warn('Reply count update failed', error));
    }
    setReplyDrafts((current) => ({ ...current, [messageId]: '' }));
    setExpandedReplyId(null);
  };

  const submitCreatorPost = () => {
    const draft = postDraft.trim();
    const cleanedOptions = postPollOptions.map((option) => option.trim()).filter(Boolean);
    if (!draft || isPostUsedToday) return;
    if (postType === 'poll' && cleanedOptions.length < 2) return;
    const labels: Record<PostType, { badge: string; title: string; avatar: string }> = {
      text: { badge: 'Creator text · +1 EduCoin', title: `${profile.name} shared a note`, avatar: profile.avatar },
      image: { badge: 'Creator image · +1 EduCoin', title: `${profile.name} shared an image idea`, avatar: profile.avatar },
      poll: { badge: 'Creator poll · +1 EduCoin', title: `${profile.name} opened a poll`, avatar: profile.avatar },
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
      imagePreview: postType === 'image' ? (postImagePreview || '🖼️') : undefined,
      imageLayout: postType === 'image' ? 'thumbnail' : undefined,
      pollOptions: postType === 'poll' ? cleanedOptions : undefined,
      pollVotes: postType === 'poll' ? cleanedOptions.map(() => 0) : undefined,
      reactions: [],
      likeCount: 0,
      replies: [],
    };
    setMessages((current) => [newMessage, ...current]);
    addDoc(collection(db, COMMUNITY_FEED), { ...newMessage, createdAt: Date.now(), reactionCounts: {}, replyCount: 0 }).catch((error) => console.warn('Creator post write failed', error));
    setCreatorQuota((current) => ({ ...current, [todayKey()]: [postType] }));
    setEduCoins((coins) => coins + 1);
    setPostDraft('');
    setPostImageName('');
    setPostImagePreview('');
    setPostPollOptions(['', '', '']);
    setSelectedMessageId(newMessage.id);
    setActiveView('feed');
    setPage('chat');
    setPageStack([]);
  };

  const submitStatus = () => {
    const draft = statusDraft.trim();
    const cleanedOptions = statusPollOptions.map((option) => option.trim()).filter(Boolean);
    if (!draft && statusType !== 'image') return;
    if (statusType === 'poll' && cleanedOptions.length < 2) return;
    const title = statusType === 'image' ? (statusImageName || 'Image story') : draft.slice(0, 54) || 'Fresh status';
    const statusStoryId = Date.now();
    const statusStory = createStatusStory({
      id: statusStoryId,
      type: statusType,
      title,
      body: draft,
      imagePreview: statusImagePreview,
      pollOptions: cleanedOptions,
    });
    setStatusCards((current) => [statusStory, ...current]);
    addDoc(collection(db, COMMUNITY_STATUS), { ...statusStory, createdAt: Date.now() }).catch((error) => console.warn('Status write failed', error));
    setSelectedStatusId(statusStoryId);
    setStatusDraft('');
    setStatusImageName('');
    setStatusImagePreview('');
    setStatusPollOptions(['', '', '']);
    setActiveView('status');
    setPage('statusReel');
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setProfile((current) => ({ ...current, avatar: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>, setName: (value: string) => void, setPreview: (value: string) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_STATUS_FILE_BYTES) { alert('Max 1MB allowed'); return; }
    setName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const renderUploadedImage = (src: string, alt: string, mode: 'thumbnail' | 'original' = 'original', className = '') => {
    const isRealImage = isImageAvatar(src);
    if (!isRealImage) return <button type="button" onClick={() => setImageLightbox({ src, alt, mode })} className={`flex h-full w-full items-center justify-center text-7xl ${className}`}>{src}</button>;
    const imageClass = mode === 'thumbnail' ? 'h-full w-full object-cover' : 'max-h-full max-w-full object-contain';
    return <button type="button" onClick={() => setImageLightbox({ src, alt, mode })} className="flex h-full w-full items-center justify-center"><img src={src} alt={alt} className={`${imageClass} ${className}`} /></button>;
  };

  const toggleStatusLike = (statusId: number) => {
    const alreadyLiked = likedStatuses.includes(statusId);
    setLikedStatuses((current) => alreadyLiked ? current.filter((id) => id !== statusId) : [...current, statusId]);
    setStatusCards((current) => current.map((status) => status.id === statusId ? { ...status, likedBy: Math.max(0, status.likedBy + (alreadyLiked ? -1 : 1)) } : status));
  };

  const toggleMessageLike = (messageId: number) => {
    const alreadyLiked = likedMessages.includes(messageId);
    setLikedMessages((current) => alreadyLiked ? current.filter((id) => id !== messageId) : [...current, messageId]);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, likeCount: Math.max(0, (message.likeCount || 0) + (alreadyLiked ? -1 : 1)) } : message));
  };

  const reactToMessage = (message: FeedMessage, emoji: string) => {
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, reactionCounts: { ...(item.reactionCounts || {}), [emoji]: ((item.reactionCounts || {})[emoji] || 0) + 1 } } : item));
    if (message.docId) updateDoc(doc(db, COMMUNITY_FEED, message.docId), { [`reactions.${emoji}`]: increment(1) }).catch((error) => console.warn('Reaction update failed', error));
  };

  const renderReactionStrip = (message: FeedMessage) => <div className="mt-3 flex flex-wrap gap-2">{REACTION_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => reactToMessage(message, emoji)} title={`${emoji} reactions`} className="rounded-full border border-slate-700 bg-[#111827]/80 px-3 py-1.5 text-xs font-black text-slate-200 shadow-[0_0_14px_rgba(34,211,238,0.10)] transition hover:border-cyan-400 hover:text-cyan-300 hover:shadow-[0_0_16px_rgba(34,211,238,0.25)]"><span>{emoji}</span> <span>{(message.reactionCounts || {})[emoji] || 0}</span></button>)}</div>;


  const voteOnStatusPoll = (statusId: number, optionIndex: number) => {
    setStatusCards((current) => current.map((status) => {
      if (status.id !== statusId || !status.pollOptions) return status;
      if (status.selectedPollOption !== undefined) return status;
      const votes = status.pollVotes || status.pollOptions.map(() => 0);
      return { ...status, selectedPollOption: optionIndex, pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count) };
    }));
  };

  const voteOnMessagePoll = (messageId: number, optionIndex: number) => {
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId || !message.pollOptions) return message;
      if (message.selectedPollOption !== undefined) return message;
      const votes = message.pollVotes || message.pollOptions.map(() => 0);
      return { ...message, selectedPollOption: optionIndex, pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count) };
    }));
  };

  const shareStatusWithCreator = (statusId: number, recipientId: string) => {
    const sharedStory: SharedStory = { id: Date.now() + Math.floor(Math.random() * 1000), statusId, recipientId, senderId: 'me', senderName: profile.name, time: 'Just now' };
    setSharedStories((current) => [sharedStory, ...current]);
    setSelectedChatId(recipientId);
  };


  const MessageSummaryCard: React.FC<{ message: FeedMessage; isActive?: boolean }> = ({ message, isActive = false }) => (
    <article className={`overflow-hidden rounded-2xl border bg-[#111827]/80 shadow-sm transition duration-300 ${isActive ? 'scale-[1.012] border-sky-200 shadow-[0_18px_48px_rgba(14,165,233,0.10)] ring-2 ring-sky-50' : 'border-slate-800 hover:-translate-y-0.5 hover:border-cyan-900/70 hover:shadow-[0_16px_40px_rgba(14,165,233,0.08)]'}`}>
      <button type="button" onClick={() => openMessage(message.id)} className={`flex w-full items-center gap-3 border-l-4 p-3 text-left transition sm:p-4 ${isActive ? 'border-sky-400 bg-cyan-950/30/55' : 'border-transparent'}`}>
        <Avatar value={resolveAvatar(message)} size="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-black text-white sm:text-lg">{message.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400 sm:text-sm"><span>{resolveName(message)}</span><span>•</span><span>{message.time}</span><span className="rounded-full border border-cyan-900/70 px-2 py-0.5 text-cyan-300">{message.badge}</span></div>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-400 sm:text-[15px]">{message.body}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-rose-950/70 px-2 py-1 text-[11px] font-black text-pink-300">❤️ {message.likeCount || 0}</span><span className="rounded-full bg-cyan-950/70 px-2 py-1 text-[11px] font-black text-cyan-300">💬 {message.replyCount || message.replies.length}</span></div>{renderReactionStrip(message)}
        </div>
      </button>
    </article>
  );

  const renderMessageDetails = (message: FeedMessage, fullScreen = false) => (
    <div className={`flex min-h-0 flex-col overflow-hidden bg-white ${fullScreen ? 'h-[calc(100dvh-10rem)]' : 'h-[calc(100dvh-11rem)] rounded-[1.75rem] border border-slate-800 shadow-[0_16px_48px_rgba(15,23,42,0.07)]'}`}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-6 custom-scrollbar lg:p-7">
        <div className="flex items-start gap-3">
          <Avatar value={resolveAvatar(message)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-white sm:text-xl">{resolveName(message)}</h2><span className="rounded-full border border-cyan-900/70 bg-white px-2.5 py-1 text-[11px] font-black text-cyan-300">{message.badge}</span><span className="text-xs font-bold text-slate-400">{message.time}</span></div>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-white lg:text-4xl">{message.title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-8 text-slate-400 sm:text-lg">{message.body}</p>{message.imagePreview ? <div className="mt-5 aspect-square max-w-md overflow-hidden rounded-[2rem] border border-cyan-900/70 bg-gradient-to-br from-[#0B0F19] via-[#111827] to-cyan-950 shadow-inner">{renderUploadedImage(message.imagePreview, message.title, message.imageLayout || 'thumbnail')}</div> : null}{message.pollOptions ? <div className="mt-5 space-y-3 rounded-[1.6rem] border border-emerald-900/70 bg-emerald-950/30/50 p-4">{message.pollOptions.map((option, index) => { const votes = message.pollVotes || message.pollOptions!.map(() => 0); const total = Math.max(1, votes.reduce((sum, count) => sum + count, 0)); const percent = Math.round((votes[index] / total) * 100); const selected = message.selectedPollOption === index; return <button key={option} type="button" onClick={() => voteOnMessagePoll(message.id, index)} className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left font-black transition ${selected ? 'border-emerald-400 bg-white text-emerald-800' : 'border-emerald-900/70 bg-[#111827]/80 text-slate-200 hover:border-emerald-300'}`}><span className="absolute inset-y-0 left-0 bg-emerald-200/50" style={{ width: message.selectedPollOption !== undefined ? `${percent}%` : '0%' }} /><span className="relative flex items-center justify-between"><span>{option}</span>{message.selectedPollOption !== undefined ? <span>{percent}% · {votes[index]}</span> : <span>Vote</span>}</span></button>; })}</div> : null}
            {renderReactionStrip(message)}<div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => toggleMessageLike(message.id)} className={`rounded-full border px-3 py-1.5 text-sm font-black transition ${likedMessages.includes(message.id) ? 'border-pink-800 bg-pink-950/30 text-pink-300' : 'border-cyan-900/70 bg-cyan-950/30 text-cyan-300'}`}>❤️ {message.likeCount || 0}</button><span className="rounded-full border border-cyan-900/70 bg-cyan-950/30 px-3 py-1.5 text-sm font-black text-cyan-300">💬 {message.replyCount || message.replies.length}</span></div>
          </div>
        </div>
        <div className="mt-5 space-y-3 pb-4">{message.replies.map((reply) => <div key={reply.id} className="flex items-start gap-3"><Avatar value={reply.avatar || (reply.author === profile.name ? profile.avatar : '👤')} size="h-9 w-9" className="mt-1 text-base shadow-[0_8px_24px_rgba(37,99,235,0.12)]" /><div className="max-w-[92%] flex-1 rounded-[1.35rem] rounded-bl-md border border-cyan-900/70 border-l-4 border-l-slate-900/60 bg-gradient-to-br from-white via-sky-50 to-slate-50 px-4 py-3 shadow-[0_10px_32px_rgba(15,23,42,0.06)]"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-white">{reply.author}</span><span className="text-xs font-bold text-slate-400">{reply.time}</span></div><p className="mt-1 text-sm font-semibold leading-6 text-slate-400 sm:text-base">{reply.text}</p></div></div>)}</div>
      </div>
      {expandedReplyId === message.id ? <div ref={replyComposerRef} data-community-replybar="true" className="fixed bottom-[calc(env(safe-area-inset-bottom)+7.75rem)] left-3 right-3 z-[1600] rounded-[1.65rem] border border-cyan-900/70 bg-[#111827]/95 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.20)] backdrop-blur-2xl transition-all duration-500 data-[hidden=true]:translate-y-8 data-[hidden=true]:opacity-0 md:bottom-28 md:left-auto md:right-8 md:w-[min(760px,calc(100vw-4rem))]"><div className="flex items-center gap-2"><input ref={replyInputRef} value={replyDrafts[message.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [message.id]: event.target.value }))} placeholder="Write a quick reply..." maxLength={1000} className="min-w-0 flex-1 rounded-2xl border border-slate-800 bg-[#111827]/80 px-4 py-3 text-sm font-bold outline-none transition focus:border-sky-300 focus:bg-white" /><button type="button" onClick={() => submitReply(message.id)} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5">Send</button></div></div> : <div className="shrink-0 border-t border-slate-100 bg-[#111827]/95 p-3 backdrop-blur-xl lg:p-4"><button type="button" onClick={() => { loadRepliesForMessage(message); setExpandedReplyId(message.id); }} className="w-full rounded-2xl border border-slate-800 bg-[#111827]/80 px-4 py-3 text-left text-sm font-black text-slate-300 transition hover:bg-cyan-950/30">💬 Reply to this thread</button></div>}
    </div>
  );

  const renderFeedLayout = (feedMessages: FeedMessage[], title = 'Chats', subtitle = 'Thin updates. Click to expand on the right.') => {
    const activeMessage = feedMessages.find((message) => message.id === selectedMessageId) || feedMessages[0];
    const isFollowingFeed = title.toLowerCase().includes('followers');
    const heroGradient = isFollowingFeed ? 'from-fuchsia-500 via-violet-500 to-sky-400' : 'from-slate-900 via-sky-800 to-cyan-500';
    const heroEyebrow = isFollowingFeed ? 'Following pulse' : 'Chat feed live';
    const heroIcon = isFollowingFeed ? '👥' : '💬';
    if (!feedMessages.length) return <div className="mx-auto max-w-5xl rounded-[2rem] border border-dashed border-sky-300 bg-gradient-to-br from-sky-50 via-white to-fuchsia-50 p-8 text-center font-bold text-slate-400 shadow-[0_18px_54px_rgba(37,99,235,0.10)]"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white text-3xl shadow-inner">👀</div>Follow creators to build this feed.</div>;
    return <div className="mx-auto grid h-[calc(100dvh-10.5rem)] w-full max-w-[1800px] gap-5 overflow-hidden md:grid-cols-[minmax(300px,440px)_1fr]"><aside className="hidden h-full min-h-0 overflow-y-auto rounded-[2rem] border border-white/80 bg-[#111827]/90 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] ring-1 ring-sky-100/70 backdrop-blur-xl custom-scrollbar md:block"><div className={`relative mb-4 overflow-hidden rounded-[1.6rem] bg-gradient-to-br ${heroGradient} p-5 text-white shadow-[0_18px_50px_rgba(37,99,235,0.18)]`}><div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/20 blur-2xl" /><p className="relative text-xs font-black uppercase tracking-[0.28em] text-white/80">{heroEyebrow}</p><h2 className="relative mt-2 text-3xl font-black tracking-tight">{heroIcon} {title}</h2><p className="relative mt-2 text-sm font-semibold leading-6 text-white/78">{subtitle}</p></div><div className="space-y-3">{feedMessages.map((message) => <MessageSummaryCard key={message.id} message={message} isActive={activeMessage?.id === message.id} />)}</div></aside><section className="hidden min-h-0 overflow-hidden md:block">{activeMessage ? renderMessageDetails(activeMessage) : null}</section><div className="h-full space-y-3 overflow-y-auto pb-4 custom-scrollbar md:hidden">{feedMessages.map((message) => <MessageSummaryCard key={message.id} message={message} />)}</div></div>;
  };

  const renderTypeComposer = (activeType: PostType, setActiveType: (type: PostType) => void, accent: 'sky' | 'orange' = 'sky') => {
    const activeClass = accent === 'orange'
      ? 'border-orange-200 bg-[#111827]/80 shadow-[0_18px_42px_rgba(249,115,22,0.16)] ring-2 ring-white'
      : 'border-sky-200 bg-[#111827]/80 shadow-[0_18px_42px_rgba(14,165,233,0.14)] ring-2 ring-white';

    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {postOptions.map((option) => (
          <button key={option.type} type="button" onClick={() => setActiveType(option.type)} className={`rounded-[1.35rem] border p-4 text-left transition duration-300 hover:-translate-y-1 ${activeType === option.type ? activeClass : 'border-white/50 bg-white/55 hover:bg-white'}`}>
            <span className="text-3xl">{option.icon}</span>
            <span className="mt-3 block text-lg font-black text-white">{option.label}</span>
            <span className="mt-1 block text-sm font-bold text-slate-400">{option.helper}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderUploadFields = (type: PostType, draft: string, setDraft: (value: string) => void, isStatus = false) => {
    const imageName = isStatus ? statusImageName : postImageName;
    const imagePreview = isStatus ? statusImagePreview : postImagePreview;
    const setImageName = isStatus ? setStatusImageName : setPostImageName;
    const setImagePreview = isStatus ? setStatusImagePreview : setPostImagePreview;
    const options = isStatus ? statusPollOptions : postPollOptions;
    const setOptions = isStatus ? setStatusPollOptions : setPostPollOptions;

    if (type === 'image') {
      return <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]"><label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border-2 border-dashed border-sky-200 bg-[#111827]/80 p-4 text-center shadow-inner transition hover:bg-white"><input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageUpload(event, setImageName, setImagePreview)} /><span className={`${isStatus ? 'min-h-44 w-full' : 'aspect-square w-36'} flex overflow-hidden rounded-[2rem] bg-gradient-to-br from-sky-100 to-cyan-100 shadow-inner`}>{imagePreview ? renderUploadedImage(imagePreview, imageName || 'Uploaded preview', isStatus ? 'original' : 'thumbnail') : <span className="m-auto text-5xl">🖼️</span>}</span><span className="mt-3 text-lg font-black text-white">{isStatus ? 'Upload original-ratio image' : 'Upload thumbnail image'}</span><span className="mt-1 text-sm font-bold text-slate-400">{imageName || (isStatus ? 'Original ratio will be preserved' : 'Thumbnail will be square cropped')}</span></label><textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1000))} maxLength={1000} placeholder={isStatus ? 'Add image status caption...' : 'Describe your image post...'} className="min-h-[180px] rounded-[1.75rem] border border-slate-800 bg-[#111827]/80 px-5 py-4 text-base font-semibold leading-7 outline-none transition focus:border-sky-300 focus:bg-white" /></div>;
    }
    if (type === 'poll') {
      return <div className="space-y-4"><textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1000))} maxLength={1000} placeholder={isStatus ? 'Ask your status poll question...' : 'Write your poll question...'} className="min-h-[120px] w-full rounded-[1.75rem] border border-slate-800 bg-[#111827]/80 px-5 py-4 text-base font-semibold leading-7 outline-none transition focus:border-emerald-300 focus:bg-white" /><div className="grid gap-3 sm:grid-cols-3">{options.map((option, index) => <input key={index} value={option} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Option ${index + 1}`} className="rounded-2xl border border-emerald-900/70 bg-[#111827]/80 px-4 py-3 text-sm font-bold outline-none focus:border-emerald-300" />)}</div></div>;
    }
    return <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1000))} maxLength={1000} placeholder={isStatus ? 'Write your daily text status...' : 'Write your daily creator post...'} className="min-h-[190px] w-full rounded-[1.75rem] border border-slate-800 bg-[#111827]/80 px-5 py-4 text-base font-semibold leading-7 outline-none transition focus:border-orange-300 focus:bg-white" />;
  };

  const renderStatusPoll = (card: StatusCard) => card.pollOptions ? <div className="mt-4 space-y-2">{card.pollOptions.map((option, index) => { const votes = card.pollVotes || card.pollOptions!.map(() => 0); const total = Math.max(1, votes.reduce((sum, count) => sum + count, 0)); const percent = Math.round((votes[index] / total) * 100); const selected = card.selectedPollOption === index; return <button key={option} type="button" onClick={() => voteOnStatusPoll(card.id, index)} className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left text-sm font-black shadow-inner transition sm:text-base ${selected ? 'border-white bg-[#0B0F19] text-slate-200' : 'border-white/20 bg-black/40 text-white hover:bg-white/24'}`}><span className="absolute inset-y-0 left-0 bg-white/30" style={{ width: card.selectedPollOption !== undefined ? `${percent}%` : '0%' }} /><span className="relative flex items-center justify-between gap-3"><span className="min-w-0 flex-1 truncate"><span className="mr-2 opacity-70">{index + 1}.</span>{option}</span>{card.selectedPollOption !== undefined ? <span className="shrink-0">{percent}% · {votes[index]}</span> : <span className="shrink-0">Vote</span>}</span></button>; })}</div> : null;

  const renderStatusReelContent = (card: StatusCard) => {
    const hasDetail = shouldShowStatusDetail(card);
    const title = card.title.length > 64 ? `${card.title.slice(0, 64)}...` : card.title;
    const preview = hasDetail ? `${card.body.slice(0, card.imagePreview ? 96 : 150)}...` : card.body;

    return <div className="min-h-0 flex-1 overflow-hidden"><div className="min-h-0 max-h-[62dvh] overflow-y-auto pr-1 custom-scrollbar">{card.imagePreview ? <div className={`mb-4 ${card.imageLayout === 'original' ? 'h-[min(34dvh,320px)] w-full' : 'mx-auto aspect-square w-full max-w-[320px]'} flex items-center justify-center overflow-hidden rounded-[2rem] bg-black/40 shadow-2xl`}>{renderUploadedImage(card.imagePreview, card.title, card.imageLayout || 'original')}</div> : null}<h2 className="line-clamp-3 text-2xl font-black tracking-tight sm:text-4xl">{title}</h2>{card.body ? <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-white/88 sm:text-base sm:leading-7">{preview}</p> : null}{hasDetail ? <button type="button" onClick={() => { setSelectedStatusId(card.id); pushPage('statusDetail'); }} className="mt-4 rounded-full border border-white/25 bg-white/18 px-4 py-2 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white/28">Learn more</button> : null}{renderStatusPoll(card)}</div></div>;
  };

  const renderStatusTile = (card: StatusCard) => (
    <button key={card.id} type="button" onClick={() => openStatusReel(card.id)} className="group relative aspect-[9/14] overflow-hidden rounded-[1.8rem] border border-white/80 bg-white p-3 text-left shadow-[0_18px_52px_rgba(15,23,42,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className={`absolute inset-2 rounded-[1.35rem] bg-gradient-to-br ${card.gradient} transition duration-500 group-hover:scale-[1.04]`} />
      <div className="absolute inset-2 rounded-[1.35rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.30),rgba(255,255,255,0.04)_38%,rgba(15,23,42,0.60))]" />
      <div className="relative flex h-full flex-col justify-between p-2 text-white">
        <span className="w-max rounded-full border border-white/70 bg-[#111827]/80 px-3 py-1 text-[10px] font-black text-slate-200 shadow-sm backdrop-blur-xl">{card.slots}</span>
        <div>{card.imagePreview ? <div className="mb-5 aspect-square w-24 overflow-hidden rounded-2xl bg-white/18 shadow-inner">{renderUploadedImage(card.imagePreview, card.title, card.imageLayout || 'thumbnail')}</div> : null}<h3 className="line-clamp-2 text-xl font-black tracking-tight drop-shadow sm:text-2xl">{card.title}</h3><p className="mt-2 line-clamp-2 text-sm font-bold text-white/86">{card.body}</p><p className="mt-3 w-max rounded-full border border-white/60 bg-white/85 px-3 py-1 text-[11px] font-black text-slate-200 shadow-sm backdrop-blur-xl">❤️ {card.likedBy} · 👁️ {card.views}</p></div>
      </div>
    </button>
  );

  const renderStatusReel = () => {
    const selectedIndex = Math.max(0, statusCards.findIndex((card) => card.id === selectedStatus.id));
    const reelStatuses = [...statusCards.slice(selectedIndex), ...statusCards.slice(0, selectedIndex)];

    return (
      <div className="fixed inset-0 z-[1500] bg-slate-950 text-white">
      <button type="button" onClick={goBack} className="fixed left-4 top-4 z-20 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white/20">← Back</button>
      <div className="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth custom-scrollbar">
        {reelStatuses.map((card) => (
          <section key={card.id} className="relative flex h-[100dvh] snap-start items-center justify-center p-4" onMouseEnter={() => setSelectedStatusId(card.id)}>
            <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient}`} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.36),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.06),rgba(2,6,23,0.72))]" />
            <div className="relative grid w-full max-w-5xl items-center gap-5 md:grid-cols-[1fr_96px]">
              <article className="mx-auto flex min-h-[74dvh] w-full max-w-[520px] flex-col justify-between rounded-[2.5rem] border border-white/20 bg-black/40 p-6 shadow-[0_32px_120px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
                <div className="flex items-center justify-between gap-3"><span className="rounded-full border border-white/30 bg-white/18 px-4 py-2 text-xs font-black uppercase tracking-[0.22em]">{card.slots}</span><span className="text-sm font-black">{card.ownerId === 'me' ? 'Your status' : 'Community'}</span></div>
                {renderStatusReelContent(card)}
                <div className="flex items-center justify-between text-sm font-black text-white/80"><span>Swipe for next status</span><span>👁️ {card.views} views</span></div>
              </article>
              <div className="mx-auto flex flex-row justify-center gap-3 md:flex-col"><button type="button" onClick={() => toggleStatusLike(card.id)} className={`flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/20 ${likedStatuses.includes(card.id) ? 'bg-pink-950/300 text-white' : 'bg-black/40 text-white'} shadow-2xl backdrop-blur-xl transition hover:scale-105`}><span>❤️</span><span className="text-[11px] font-black">{card.likedBy}</span></button><button type="button" onClick={() => setShareStatusId(card.id)} className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-2xl backdrop-blur-xl transition hover:scale-105"><span>↗️</span><span className="text-[11px] font-black">Share</span></button></div>
            </div>
          </section>
        ))}
      </div>
      {shareStatusId !== null ? <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center"><div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/20 bg-[#0B0F19] text-slate-200 shadow-[0_28px_90px_rgba(0,0,0,0.35)]"><div className="bg-gradient-to-br from-slate-950 via-sky-900 to-cyan-700 p-5 text-white"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100">Send story</p><h3 className="mt-2 text-2xl font-black">Share with followers</h3></div><button type="button" onClick={() => setShareStatusId(null)} className="rounded-full bg-black/40 px-3 py-2 text-sm font-black">✕</button></div><p className="mt-2 text-sm font-semibold text-white/75">Story chat abhi sirf shared stories dikhata hai — direct messages pending rakhe gaye hain.</p></div><div className="max-h-[55vh] space-y-2 overflow-y-auto p-3 custom-scrollbar">{allCreators.map((creator) => { const sent = sharedStories.some((story) => story.statusId === shareStatusId && story.recipientId === creator.id); return <button key={creator.id} type="button" onClick={() => shareStatusWithCreator(shareStatusId, creator.id)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-[#111827]/80 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"><Avatar value={creator.avatar} size="h-11 w-11" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-white">{creator.name}</span><span className="block truncate text-xs font-bold text-slate-400">@{creator.username}</span></span><span className={`rounded-full px-3 py-1 text-xs font-black ${sent ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-950 text-white'}`}>{sent ? 'Sent' : 'Send'}</span></button>; })}</div><button type="button" onClick={() => { setShareStatusId(null); pushPage('directChat'); }} className="m-3 mt-0 w-[calc(100%-1.5rem)] rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Open Chat</button></div></div> : null}
      </div>
    );
  };

  const openChatCreator = (creatorId: string) => {
    setSelectedChatId(creatorId);
    if (window.matchMedia('(max-width: 1023px)').matches) pushPage('directChatThread');
  };

  const renderChatPage = () => {
    const sidebarCreators = chatCreators.length ? chatCreators : allCreators;

    return <div className="mx-auto grid h-[calc(100dvh-10.5rem)] max-w-[1800px] overflow-hidden rounded-[2.4rem] border border-slate-800 bg-[#111827]/80 shadow-[0_26px_80px_rgba(15,23,42,0.10)] lg:grid-cols-[380px_1fr]"><aside className="flex h-full min-h-0 flex-col border-b border-slate-800 bg-gradient-to-b from-slate-50 to-white lg:border-b-0 lg:border-r"><div className="border-b border-slate-800 p-5"><p className="text-xs font-black uppercase tracking-[0.28em] text-sky-600">Story inbox</p><h2 className="mt-2 text-3xl font-black tracking-tight">Chats</h2><p className="mt-2 text-sm font-bold leading-6 text-slate-400">Abhi yahan sirf shared stories dikhengi. Direct text chat baad mein enable hoga.</p></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">{sidebarCreators.map((creator) => { const count = sharedStories.filter((story) => story.recipientId === creator.id).length; const active = activeChatCreator?.id === creator.id; return <button key={creator.id} type="button" onClick={() => openChatCreator(creator.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-sky-200 bg-cyan-950/30 shadow-md' : 'border-transparent bg-[#111827]/80 hover:bg-white hover:shadow-sm'}`}><Avatar value={creator.avatar} size="h-12 w-12" /><span className="min-w-0 flex-1"><span className="block truncate text-base font-black text-white">{creator.name}</span><span className="block truncate text-xs font-bold text-slate-400">{count ? `${count} shared ${count === 1 ? 'story' : 'stories'}` : 'No shared story yet'}</span></span>{count ? <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-black text-white">{count}</span> : null}</button>; })}</div></aside><section className="hidden min-h-0 flex-col bg-[radial-gradient(circle_at_18%_10%,rgba(14,165,233,0.10),transparent_28%),linear-gradient(180deg,#ffffff,#f8fafc)] lg:flex"><div className="flex items-center gap-3 border-b border-slate-800 bg-[#111827]/86 p-5 backdrop-blur-xl"><Avatar value={activeChatCreator?.avatar || '👤'} size="h-12 w-12" /><div className="min-w-0 flex-1"><h3 className="truncate text-2xl font-black text-white">{activeChatCreator?.name || 'Story chat'}</h3><p className="text-sm font-bold text-slate-400">Stories shared with this follower appear here for both sides.</p></div><button type="button" onClick={() => { setActiveView('status'); setPage('chat'); }} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5">Share more</button></div><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar sm:p-6">{activeChatStories.length ? activeChatStories.map((story) => { const status = statusCards.find((card) => card.id === story.statusId); if (!status) return null; return <div key={story.id} className="flex justify-end"><article className="max-w-[min(520px,92%)] overflow-hidden rounded-[2rem] rounded-br-md border border-slate-800 bg-[#111827]/80 shadow-[0_18px_48px_rgba(15,23,42,0.10)]"><div className={`bg-gradient-to-br ${status.gradient} p-5 text-white`}><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-white/82 px-3 py-1 text-xs font-black text-slate-200">{status.slots}</span><span className="text-xs font-black text-white/80">{story.time}</span></div>{status.imagePreview ? <div className="my-8 aspect-square overflow-hidden rounded-[1.5rem] bg-black/40 shadow-inner">{renderUploadedImage(status.imagePreview, status.title, status.imageLayout || 'thumbnail')}</div> : null}<h4 className="mt-16 text-3xl font-black tracking-tight">{status.title}</h4><p className="mt-3 text-sm font-semibold leading-6 text-white/84">{status.body}</p></div><div className="flex items-center justify-between gap-3 p-4"><p className="text-xs font-bold text-slate-400">Sent by {story.senderName}</p><button type="button" onClick={() => openStatusReel(status.id)} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Open story</button></div></article></div>; }) : <div className="flex h-full items-center justify-center text-center"><div className="max-w-md rounded-[2rem] border border-dashed border-sky-200 bg-[#111827]/80 p-8 shadow-inner"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-950/30 text-3xl">↗️</div><h3 className="mt-4 text-2xl font-black">No story shared yet</h3><p className="mt-2 text-sm font-bold leading-6 text-slate-400">Status reel mein Share dabao, follower select karo, phir story yahan chat mein dikhegi.</p></div></div>}</div><div className="border-t border-slate-800 bg-[#111827]/90 p-4 text-center text-xs font-black text-slate-400 backdrop-blur-xl">Text messages disabled · Stories only chat</div></section></div>;
  };

  const renderChatThreadPage = () => <div className="mx-auto flex h-[calc(100dvh-10.5rem)] max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-[#111827]/80 shadow-[0_22px_70px_rgba(15,23,42,0.10)]"><div className="flex items-center gap-3 border-b border-slate-800 bg-[#111827]/80 p-4"><button type="button" onClick={() => setPage('directChat')} className="rounded-2xl border border-slate-800 bg-[#111827]/80 px-4 py-3 text-sm font-black text-slate-300">← Back to Chat</button><Avatar value={activeChatCreator?.avatar || '👤'} size="h-11 w-11" /><div className="min-w-0"><h3 className="truncate text-xl font-black">{activeChatCreator?.name || 'Story chat'}</h3><p className="text-xs font-bold text-slate-400">Shared stories only</p></div></div><div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#111827]/80 p-4 custom-scrollbar">{activeChatStories.length ? activeChatStories.map((story) => { const status = statusCards.find((card) => card.id === story.statusId); if (!status) return null; return <article key={story.id} className="overflow-hidden rounded-[2rem] border border-slate-800 bg-[#111827]/80 shadow-[0_16px_44px_rgba(15,23,42,0.08)]"><div className={`bg-gradient-to-br ${status.gradient} p-5 text-white`}><span className="rounded-full bg-white/82 px-3 py-1 text-xs font-black text-slate-200">{status.slots}</span>{status.imagePreview ? <div className="my-8 aspect-square overflow-hidden rounded-[2rem] bg-black/40 shadow-inner">{renderUploadedImage(status.imagePreview, status.title, status.imageLayout || 'thumbnail')}</div> : null}<h4 className="mt-10 text-3xl font-black">{status.title}</h4><p className="mt-3 text-sm font-semibold leading-6 text-white/84">{status.body}</p></div><div className="flex items-center justify-between gap-3 p-4"><p className="text-xs font-bold text-slate-400">{story.time}</p><button type="button" onClick={() => openStatusReel(status.id)} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Open story</button></div></article>; }) : <div className="flex h-full items-center justify-center text-center"><div className="rounded-[2rem] border border-dashed border-sky-200 bg-[#111827]/80 p-8"><h3 className="text-2xl font-black">No story shared yet</h3><p className="mt-2 text-sm font-bold text-slate-400">Share a status to this follower first.</p></div></div>}</div><div className="border-t border-slate-800 p-3 text-center text-xs font-black text-slate-400">Text messages disabled · Stories only chat</div></div>;

  const renderStatusDetailPage = () => <div className="mx-auto flex h-[calc(100dvh-10.5rem)] max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-[#111827]/80 shadow-[0_22px_70px_rgba(15,23,42,0.10)]"><div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-[#111827]/80 p-4"><button type="button" onClick={() => setPage('statusReel')} className="rounded-2xl border border-slate-800 bg-[#111827]/80 px-4 py-3 text-sm font-black text-slate-300">← Back to story</button><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-400">{selectedStatus.slots}</span></div><div className={`min-h-0 flex-1 overflow-y-auto bg-gradient-to-br ${selectedStatus.gradient} p-5 text-white custom-scrollbar sm:p-8`}><article className="mx-auto max-w-3xl rounded-[2rem] border border-white/20 bg-black/40 p-5 shadow-2xl backdrop-blur-xl sm:p-8">{selectedStatus.imagePreview ? <div className={`mb-6 ${selectedStatus.imageLayout === 'original' ? 'max-h-[54dvh] min-h-48' : 'aspect-square'} flex items-center justify-center overflow-hidden rounded-[2rem] bg-black/40 shadow-inner`}>{renderUploadedImage(selectedStatus.imagePreview, selectedStatus.title, selectedStatus.imageLayout || 'original')}</div> : null}<h2 className="text-4xl font-black tracking-tight sm:text-6xl">{selectedStatus.title}</h2><p className="mt-5 whitespace-pre-wrap text-lg font-semibold leading-9 text-white/90">{selectedStatus.body}</p>{renderStatusPoll(selectedStatus)}</article></div></div>;

  const filteredCreators = allCreators.filter((creator) => {
    const textMatches = `${creator.username} ${creator.name} ${creator.role}`.toLowerCase().includes(networkSearch.toLowerCase());
    const tabMatches = networkTab === 'mutual' ? creator.mutual : networkTab === 'following' ? followedIds.includes(creator.id) : true;
    return textMatches && tabMatches;
  });

  return (
    <section className="relative h-[100dvh] overflow-hidden bg-[#0B0F19] text-slate-200">
      {imageLightbox ? <div className="fixed inset-0 z-[1800] flex items-center justify-center bg-slate-950/88 p-4 backdrop-blur-xl"><button type="button" onClick={() => setImageLightbox(null)} className="absolute right-4 top-4 rounded-full bg-[#111827]/80 px-4 py-2 text-sm font-black text-white">Close</button><div className="flex max-h-[90dvh] max-w-[94vw] items-center justify-center overflow-hidden rounded-[2rem] bg-black/40 p-3 shadow-2xl">{renderUploadedImage(imageLightbox.src, imageLightbox.alt, 'original')}</div></div> : null}
      {page === 'statusReel' ? renderStatusReel() : null}
      <header className="relative z-30 flex h-[76px] items-center justify-between gap-3 border-b border-slate-800 bg-[#0B0F19]/95 backdrop-blur-xl px-3 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={goBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-white text-lg font-black text-slate-200 shadow-sm transition duration-300 hover:-translate-x-0.5 hover:scale-105 hover:bg-cyan-950/30 hover:text-white active:scale-95" aria-label="Back">←</button><h1 className="truncate text-xl font-black tracking-tight sm:text-4xl">EDUVORA BOND</h1></div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3"><button type="button" onClick={() => pushPage('profile')} className="flex items-center gap-2 rounded-full border border-slate-800 bg-[#0B0F19]/95 px-3 py-2 text-xs font-black text-slate-200 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:bg-cyan-950/30 sm:px-4"><Avatar value={profile.avatar} size="h-8 w-8" /><span className="hidden sm:inline">Profile</span></button><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">🪙 {eduCoins}</span></div>
      </header>

      <main ref={scrollContainerRef} className="relative z-10 h-[calc(100dvh-76px)] overflow-y-auto bg-[#0B0F19]/95 px-3 pb-60 pt-4 custom-scrollbar sm:px-5 lg:px-8 xl:px-10">
        <div key={`${page}-${activeView}`} className="animate-in fade-in slide-in-from-bottom-3 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
          {page === 'chat' && activeView === 'feed' && renderFeedLayout(messages, 'Chat Feed', 'Fresh community prompts, replies, and streak ideas are shown here.')}
          {page === 'thread' && <div className="space-y-3"><button type="button" onClick={goBack} className="rounded-2xl border border-slate-800 bg-[#111827]/80 px-4 py-3 text-sm font-black text-slate-300 shadow-sm">← Back to posts</button>{renderMessageDetails(selectedMessage, true)}</div>}
          {page === 'profile' && <div className="mx-auto max-w-5xl overflow-hidden rounded-[2.25rem] border border-slate-800 bg-[#111827]/80 shadow-[0_24px_70px_rgba(15,23,42,0.08)]"><div className="relative bg-gradient-to-br from-slate-900 via-sky-800 to-cyan-600 p-6 text-white sm:p-8"><div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.28),transparent_28%),radial-gradient(circle_at_78%_8%,rgba(255,255,255,0.18),transparent_20%)]" /><div className="relative flex flex-col gap-5 sm:flex-row sm:items-end"><Avatar value={profile.avatar} size="h-24 w-24" className="text-4xl ring-cyan-400/30" /><div className="min-w-0 flex-1"><h2 className="text-4xl font-black tracking-tight">{profile.name}</h2><p className="mt-1 text-sm font-black text-white/75">@{profile.username}</p><p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/80">{profile.bio}</p></div><label className="w-max cursor-pointer rounded-2xl border border-white/30 bg-black/40 px-4 py-3 text-sm font-black shadow-lg backdrop-blur-xl transition hover:bg-white/25"><input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />Upload avatar</label></div></div><div className="grid gap-4 p-5 sm:grid-cols-2"><input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} className="rounded-2xl border border-slate-800 px-4 py-3 font-bold outline-none focus:border-sky-300" /><input value={profile.username} onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value }))} className="rounded-2xl border border-slate-800 px-4 py-3 font-bold outline-none focus:border-sky-300" /><textarea value={profile.bio} onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))} className="min-h-28 rounded-2xl border border-slate-800 px-4 py-3 font-bold outline-none focus:border-sky-300 sm:col-span-2" /></div></div>}
          {page === 'creators' && <div className="mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/80 bg-[#111827]/80 shadow-[0_28px_90px_rgba(37,99,235,0.16)] ring-1 ring-sky-100"><div className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-sky-700 to-cyan-500 p-6 text-white sm:p-8"><div className="absolute -right-14 -top-16 h-52 w-52 rounded-full bg-white/20 blur-3xl" /><div className="absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-cyan-200/30 blur-3xl" /><div className="relative grid gap-6 lg:grid-cols-[1fr_0.86fr]"><div><p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-100">Motivational rule</p><h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">One powerful post per day. Make it count.</h2><p className="mt-4 max-w-2xl text-base font-semibold leading-8 text-white/82">Choose text, image, or poll. The composer below changes instantly so creators get only the upload tools they need.</p></div><div className="rounded-[2rem] border border-white/25 bg-black/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-2xl"><div className="flex items-center justify-between"><span className="text-sm font-black text-white/80">Today reward</span><span className="rounded-full bg-[#0B0F19]/95 px-3 py-1 text-xs font-black text-cyan-300">+1 EduCoin</span></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-white/20"><div className={`h-full rounded-full bg-white transition-all ${isPostUsedToday ? 'w-full' : 'w-1/3'}`} /></div><p className="mt-3 text-sm font-bold text-white/75">{isPostUsedToday ? 'Daily creator slot used.' : 'Your creator slot is ready.'}</p></div></div></div><div className="bg-gradient-to-br from-[#0B0F19] via-[#111827] to-purple-950 p-5 sm:p-7"><div className="mb-5">{renderTypeComposer(postType, setPostType)}</div>{renderUploadFields(postType, postDraft, setPostDraft)}<button type="button" onClick={submitCreatorPost} disabled={!postDraft.trim() || isPostUsedToday || (postType === 'poll' && postPollOptions.filter((option) => option.trim()).length < 2)} className="mt-5 w-full rounded-[1.55rem] bg-gradient-to-r from-slate-950 via-sky-900 to-cyan-700 px-6 py-4 text-base font-black text-white shadow-[0_18px_44px_rgba(14,165,233,0.28)] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-45">{isPostUsedToday ? 'Daily post already shared' : 'Publish creator post'}</button></div></div>}
          {page === 'network' && <div className="mx-auto max-w-5xl bg-white"><div className="sticky top-0 z-10 bg-white pb-3"><div className="flex items-center gap-4"><h2 className="text-4xl font-black">{profile.username}</h2></div><div className="mt-6 grid grid-cols-4 border-b border-slate-800 text-center text-sm font-black sm:text-lg">{(['mutual', 'followers', 'following', 'forYou'] as const).map((tab) => <button key={tab} type="button" onClick={() => setNetworkTab(tab)} className={`pb-3 capitalize ${networkTab === tab ? 'border-b-4 border-black text-black' : 'text-slate-400'}`}>{tab === 'forYou' ? 'For you' : tab}</button>)}</div><input value={networkSearch} onChange={(event) => setNetworkSearch(event.target.value)} placeholder="Search creators..." className="mt-4 w-full rounded-2xl border border-slate-800 px-4 py-3 font-bold outline-none focus:border-sky-300" /></div><div className="space-y-3 pt-3">{filteredCreators.map((creator) => { const followed = followedIds.includes(creator.id); return <article key={creator.id} className="flex items-center gap-3 rounded-3xl border border-slate-800 bg-[#111827]/80 p-4 shadow-sm"><Avatar value={creator.avatar} /><div className="min-w-0 flex-1"><h3 className="truncate text-xl font-black text-white">{creator.name} {creator.verified ? '✅' : ''}</h3><p className="text-sm font-bold text-slate-400">@{creator.username} · {creator.role}</p><p className="text-sm font-black text-slate-300">{creator.followers.toLocaleString()} followers</p></div><button type="button" onClick={() => setFollowedIds((current) => followed ? current.filter((id) => id !== creator.id) : [...current, creator.id])} className={`rounded-full px-4 py-2 text-sm font-black transition ${followed ? 'bg-slate-100 text-slate-300' : 'bg-slate-950 text-white'}`}>{followed ? 'Following' : 'Follow'}</button></article>; })}</div></div>}
          {page === 'following' && renderFeedLayout(followingMessages, 'Your followers feed', 'Only posts from creators you follow are shown here.')}
          {page === 'directChat' && renderChatPage()}
          {page === 'directChatThread' && renderChatThreadPage()}
          {page === 'statusDetail' && renderStatusDetailPage()}
          {page === 'chat' && activeView === 'status' && <div className="mx-auto max-w-[1800px] space-y-5 bg-white"><div className="rounded-[1.8rem] border border-slate-800 bg-gradient-to-br from-slate-950 via-sky-900 to-cyan-700 p-5 text-center text-white shadow-[0_22px_70px_rgba(14,165,233,0.20)]"><p className="text-lg font-black sm:text-2xl">1MB Limit &amp; 150 Slots Left</p><p className="mt-2 text-sm font-bold text-white/72">Tap any status to open a scroll-snap reel. Swipe/scroll to jump directly to the next feed like Shorts.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{statusCards.map(renderStatusTile)}</div></div>}
          {page === 'statusUpload' && <div className="mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/70 bg-[#111827]/80 shadow-[0_30px_90px_rgba(249,115,22,0.16)]"><div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 p-6 text-white sm:p-8"><div className="absolute -right-16 top-0 h-64 w-64 rounded-full bg-white/20 blur-3xl" /><p className="relative text-sm font-black uppercase tracking-[0.3em] text-orange-100">Story studio</p><h2 className="relative mt-3 text-4xl font-black tracking-tight sm:text-6xl">Upload your status</h2><p className="relative mt-4 max-w-2xl text-base font-semibold leading-8 text-white/80">Pick text, image, or poll. The upload area changes to match your status type and keeps this page visually different from creator posts.</p></div><div className="bg-gradient-to-br from-orange-50 via-white to-fuchsia-50 p-5 sm:p-7"><div className="mb-5">{renderTypeComposer(statusType, setStatusType, 'orange')}</div>{renderUploadFields(statusType, statusDraft, setStatusDraft, true)}<button type="button" onClick={submitStatus} disabled={(statusType === 'image' && !statusImagePreview) || (statusType === 'poll' && statusPollOptions.filter((option) => option.trim()).length < 2)} className="mt-5 w-full rounded-[1.55rem] bg-gradient-to-r from-orange-600 via-rose-600 to-fuchsia-700 px-6 py-4 text-base font-black text-white shadow-[0_18px_44px_rgba(244,63,94,0.28)] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-45">Publish status story</button></div></div>}
          {page === 'statusMine' && <div className="mx-auto max-w-6xl space-y-5"><div className="rounded-[2rem] border border-purple-900/70 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-6 shadow-[0_22px_70px_rgba(124,58,237,0.12)]"><p className="text-sm font-black uppercase tracking-[0.28em] text-violet-600">Your status analytics</p><h2 className="mt-2 text-4xl font-black tracking-tight">View your status</h2><p className="mt-2 text-base font-semibold text-slate-400">Check views, likes, and open any story in reel view.</p></div>{myStatuses.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{myStatuses.map((status) => <article key={status.id} className="overflow-hidden rounded-[2rem] border border-slate-800 bg-[#111827]/80 p-4 shadow-[0_16px_48px_rgba(15,23,42,0.08)]"><div className={`rounded-[1.5rem] bg-gradient-to-br ${status.gradient} p-5 text-white`}><p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">{status.slots}</p>{status.imagePreview ? <div className="my-5 aspect-square overflow-hidden rounded-2xl bg-black/40 shadow-inner">{renderUploadedImage(status.imagePreview, status.title, status.imageLayout || 'thumbnail')}</div> : null}<h3 className="mt-6 line-clamp-3 text-2xl font-black">{status.title}</h3></div><div className="mt-4 grid grid-cols-2 gap-3 text-center"><div className="rounded-2xl bg-[#111827]/80 p-3"><p className="text-2xl font-black">{status.views}</p><p className="text-xs font-bold text-slate-400">Views</p></div><div className="rounded-2xl bg-pink-950/30 p-3"><p className="text-2xl font-black text-rose-600">{status.likedBy}</p><p className="text-xs font-bold text-slate-400">Likes</p></div></div><button type="button" onClick={() => openStatusReel(status.id)} className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5">Open reel view</button></article>)}</div> : <div className="rounded-[2rem] border border-dashed border-violet-200 bg-white p-10 text-center font-black text-slate-400">No status uploaded yet. Use “Upload your status” first.</div>}</div>}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[1300] flex justify-center px-3 pointer-events-none md:bottom-5"><div className="relative pointer-events-auto"><div className={`absolute bottom-[calc(100%+0.75rem)] left-1/2 z-10 flex -translate-x-1/2 flex-col gap-2 transition duration-300 ${showStatusActions ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}><button type="button" onClick={() => { setShowStatusActions(false); pushPage('statusUpload'); }} className="whitespace-nowrap rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-3 text-xs font-black text-white shadow-[0_16px_40px_rgba(244,63,94,0.26)]">⬆️ Upload your status</button><button type="button" onClick={() => { setShowStatusActions(false); pushPage('statusMine'); }} className="whitespace-nowrap rounded-2xl border border-sky-200 bg-[#111827]/80 px-4 py-3 text-xs font-black text-slate-100 shadow-[0_16px_40px_rgba(14,165,233,0.18)]">👁️ View your status</button></div><nav id="community-bottom-dock" className="flex max-w-[96vw] items-center gap-2 overflow-x-auto rounded-[2rem] border border-slate-800 bg-[#111827]/88 p-2 shadow-[0_28px_90px_rgba(15,23,42,0.24)] ring-1 ring-cyan-400/30 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] data-[hidden=true]:translate-y-5 data-[hidden=true]:scale-75 data-[hidden=true]:opacity-80 custom-scrollbar" aria-label="Community dock"><button type="button" onClick={() => switchView('feed')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center text-black transition duration-300 hover:-translate-y-1 active:scale-95 ${activeView === 'feed' && page === 'chat' ? 'bg-[#0B0F19] text-cyan-200 shadow-[0_0_15px_rgba(236,72,153,0.3)] shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30' : 'bg-[#111827]/80 hover:bg-white'}`}><span className="block text-2xl">📢</span><span className="text-[11px] font-black">Feed</span></button><button type="button" onClick={() => { setShowStatusActions((value) => !value); setActiveView('status'); if (page !== 'chat') { setPage('chat'); setPageStack([]); } }} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center text-black transition duration-300 hover:-translate-y-1 active:scale-95 ${activeView === 'status' && page === 'chat' ? 'bg-[#0B0F19] text-cyan-200 shadow-[0_0_15px_rgba(236,72,153,0.3)] shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30' : 'bg-[#111827]/80 hover:bg-white'}`}><span className="block text-2xl">⭕</span><span className="text-[11px] font-black">Status</span></button><button type="button" onClick={() => pushPage('directChat')} className={`min-w-[76px] rounded-2xl px-3 py-2 text-center text-black transition duration-300 hover:-translate-y-1 active:scale-95 ${page === 'directChat' ? 'bg-[#0B0F19] text-cyan-200 shadow-[0_0_15px_rgba(236,72,153,0.3)] shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30' : 'bg-[#111827]/80 hover:bg-white'}`}><span className="block text-2xl">💬</span><span className="text-[11px] font-black">Chat</span></button><button type="button" onClick={() => pushPage('creators')} className={`min-w-[86px] rounded-2xl px-3 py-2 text-center text-black transition duration-300 hover:-translate-y-1 active:scale-95 ${page === 'creators' ? 'bg-[#0B0F19] text-cyan-200 shadow-[0_0_15px_rgba(236,72,153,0.3)] shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30' : 'bg-[#111827]/80 hover:bg-white'}`}><span className="block text-2xl">✍️</span><span className="text-[11px] font-black">Creators</span></button><button type="button" onClick={() => pushPage('network')} className={`min-w-[86px] rounded-2xl px-3 py-2 text-center text-black transition duration-300 hover:-translate-y-1 active:scale-95 ${page === 'network' ? 'bg-[#0B0F19] text-cyan-200 shadow-[0_0_15px_rgba(236,72,153,0.3)] shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30' : 'bg-[#111827]/80 hover:bg-white'}`}><span className="block text-2xl">🤝</span><span className="text-[11px] font-black">Follow</span></button><button type="button" onClick={() => pushPage('following')} className={`min-w-[96px] rounded-2xl px-3 py-2 text-center text-black transition duration-300 hover:-translate-y-1 active:scale-95 ${page === 'following' ? 'bg-[#0B0F19] text-cyan-200 shadow-[0_0_15px_rgba(236,72,153,0.3)] shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30' : 'bg-[#111827]/80 hover:bg-white'}`}><span className="block text-2xl">👥</span><span className="text-[11px] font-black">Following</span></button></nav></div></div>
    </section>
  );
};

export default EduvoraCommunity;
