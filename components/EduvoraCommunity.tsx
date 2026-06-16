import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, deleteDoc, deleteField, doc, increment, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { db } from '../firebase';

interface EduvoraCommunityProps {
  onClose?: () => void;
  isAuthenticated?: boolean;
}

type CommunityView = 'feed' | 'status';
type CommunityPage = 'chat' | 'thread' | 'profile' | 'creators' | 'network' | 'following' | 'tagMaster' | 'masterTags' | 'masterTagDetail' | 'statusUpload' | 'statusMine' | 'statusReel' | 'directChat' | 'directChatThread' | 'statusDetail';
type PostType = 'text' | 'image' | 'poll';
type Reply = { id: number; author: string; text: string; time: string; avatar?: string; docId?: string; createdAt?: number; ownerId?: string };
type FeedMessage = { id: number; admin: string; badge: string; avatar: string; title: string; body: string; time: string; reactions: string[]; replies: Reply[]; creatorId?: string; postType?: PostType; imagePreview?: string; imageLayout?: 'thumbnail' | 'original'; pollOptions?: string[]; pollVotes?: number[]; selectedPollOption?: number; likeCount?: number; docId?: string; createdAt?: number; reactionCounts?: Record<string, number>; replyCount?: number; likedByUsers?: Record<string, boolean>; pollVoters?: Record<string, number>; reactionUsers?: Record<string, string> };
type Creator = { id: string; username: string; name: string; avatar: string; role: string; followers: number; mutual: boolean; verified?: boolean };
type StatusCard = { id: number; title: string; body: string; gradient: string; likedBy: number; views: number; slots: string; type: PostType; ownerId?: string; imagePreview?: string; imageLayout?: 'thumbnail' | 'original'; pollOptions?: string[]; pollVotes?: number[]; selectedPollOption?: number; docId?: string; createdAt?: number; likedByUsers?: Record<string, boolean>; pollVoters?: Record<string, number> };
type SharedStory = { id: number; statusId: number; recipientId: string; senderId: 'me'; senderName: string; time: string };
type MasterTagRequest = { id: number; author: string; avatar: string; category: string; title: string; detail: string; time: string; likes: number; reactions: Record<string, number>; ownerId?: string; docId?: string; likedByUsers?: Record<string, boolean>; reactionUsers?: Record<string, string> };
type CommunitySupportTicket = { id: string; customerName: string; customerEmail: string; subject: string; message: string; date: string; status: 'Open' | 'Resolved' | 'Pending'; source?: 'contact' | 'masterTag'; communityThreadId?: number; customerAvatar?: string; category?: string; adminReply?: string; repliedAt?: string; inboxMessage?: string; inboxRead?: boolean };
type CommunityNotification = { id: string; title: string; body: string; time: string; read: boolean; type: 'reply' | 'masterTag' | 'status' | 'creator'; targetPage?: CommunityPage; targetId?: number | string };
type CommunityProfile = { name: string; username: string; avatar: string; bio: string };
type ProfileFeedback = { type: 'success' | 'error'; message: string } | null;
type ProfilePanel = 'privacy' | 'notifications' | 'connected' | 'logout';
type PrivacySettings = { profileVisible: boolean; showActivity: boolean; allowMessages: boolean; allowFollowRequests: boolean };
type NotificationPreferences = { replies: boolean; masterTags: boolean; statuses: boolean; creatorPosts: boolean };

const MASTER_TAG_STORAGE_KEY = 'eduvoraMasterTagRequests';
const SUPPORT_TICKETS_STORAGE_KEY = 'siteSupportTickets';
const SUPPORT_TICKETS_COLLECTION = 'siteSupportTickets';
const COMMUNITY_NOTIFICATION_READ_KEY = 'eduvoraCommunityNotificationReads';
const COMMUNITY_PROFILE_STORAGE_KEY = 'eduvoraCommunityProfile';
const COMMUNITY_PRIVACY_STORAGE_KEY = 'eduvoraCommunityPrivacySettings';
const COMMUNITY_NOTIFICATION_PREFS_KEY = 'eduvoraCommunityNotificationPreferences';
const COMMUNITY_CREATOR_QUOTA_KEY = 'eduvoraCommunityCreatorQuota';
const COMMUNITY_STATUS_QUOTA_KEY = 'eduvoraCommunityStatusQuota';
const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_BIO_MAX_LENGTH = 180;


const readJsonObject = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const storedValue = localStorage.getItem(key);
    return storedValue ? { ...fallback, ...JSON.parse(storedValue) } : fallback;
  } catch (error) {
    console.warn(`Unable to read ${key}:`, error);
    return fallback;
  }
};

const defaultCommunityProfile: CommunityProfile = { name: 'Eduvora Member', username: 'eduvora_member', avatar: '🧑‍🎓', bio: 'Building digital skills daily.' };
const defaultPrivacySettings: PrivacySettings = { profileVisible: true, showActivity: true, allowMessages: true, allowFollowRequests: true };
const defaultNotificationPreferences: NotificationPreferences = { replies: true, masterTags: true, statuses: true, creatorPosts: true };

const normalizeUsername = (value: string) => value.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9._]/g, '').replace(/[.]{2,}/g, '.').replace(/_{2,}/g, '_').replace(/^[._]+|[._]+$/g, '');

const readJsonArray = <T,>(key: string, fallback: T[]): T[] => {
  if (typeof window === 'undefined') return fallback;
  try {
    const storedValue = localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallback;
  } catch (error) {
    console.warn(`Unable to read ${key}:`, error);
    return fallback;
  }
};

const formatCommunityReplyTime = (value?: string) => {
  if (!value) return 'Just now';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Just now';
  return parsed.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

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
  { id: 1, title: 'Morning sprint template', body: 'Use this prompt stack before your first sales call today.', gradient: 'from-[#1A73E8] via-[#34A853] to-[#C2E7FF]', likedBy: 0, views: 0, slots: 'Text · 1 min', type: 'text' },
  { id: 2, title: 'Offer-stack swipe file', body: 'A clean preview board for offer, bonus, guarantee, and urgency blocks.', gradient: 'from-[#1A73E8] via-[#AECBFA] to-[#FBBC04]', likedBy: 0, views: 0, slots: 'Image · 940KB', type: 'image', imagePreview: '🧩' },
  { id: 3, title: 'Workshop poll snapshot', body: 'Vote for the topic we should break down in the next live workshop.', gradient: 'from-[#34A853] via-[#81C995] to-[#C2E7FF]', likedBy: 0, views: 0, slots: 'Poll · 1 min', type: 'poll', pollOptions: ['Reels scripting', 'Email automation', 'Beginner ads'], pollVotes: [18, 27, 11] },
];

const masterTagCategories = ['Feature request', 'Doubt', 'Query', 'Update', 'Bug or issue', 'Demand'] as const;

const initialMasterTagRequests: MasterTagRequest[] = [
  { id: 1, author: 'Nisha Verma', avatar: '👩‍🎓', category: 'Feature request', title: 'Master, please add weekly live doubt room', detail: 'Many students need one fixed slot for funnel review, offer doubts, and quick action feedback.', time: '8:30 AM', likes: 38, reactions: { '👍': 14, '🔥': 9, '🙏': 11 } },
  { id: 2, author: 'Arjun Mehta', avatar: '🧑‍💼', category: 'Bug or issue', title: 'Video lesson notes are not opening on mobile', detail: 'The PDF opens on desktop but keeps loading on my Android phone. Please check the download button.', time: '10:05 AM', likes: 24, reactions: { '👍': 8, '😮': 5, '✅': 4 } },
  { id: 3, author: 'Riya Sharma', avatar: '🧕', category: 'Update', title: 'Need an update on next automation template', detail: 'Can master upload the promised WhatsApp automation template before the weekend sprint?', time: '12:15 PM', likes: 51, reactions: { '🔥': 18, '❤️': 12, '🙏': 10 } },
];


const buildMasterTagTicket = (request: MasterTagRequest): CommunitySupportTicket => ({
  id: `MT-${request.id}`,
  customerName: request.author,
  customerEmail: `${request.author.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'eduvora.member'}@eduvora.community`,
  subject: `@Master ${request.title}`,
  message: request.detail,
  date: new Date().toISOString(),
  status: 'Open',
  source: 'masterTag',
  communityThreadId: request.id,
  customerAvatar: request.avatar,
  category: request.category,
});

const postOptions: Array<{ type: PostType; icon: string; label: string; helper: string }> = [
  { type: 'text', icon: '✍️', label: 'Text', helper: 'Daily text post' },
  { type: 'image', icon: '🖼️', label: 'Image', helper: 'Daily image post' },
  { type: 'poll', icon: '📊', label: 'Poll', helper: 'Daily poll post' },
];

const statusTone: Record<PostType, string> = {
  text: 'from-[#FBBC04] via-[#FDD663] to-[#EA4335]',
  image: 'from-[#1A73E8] via-[#AECBFA] to-[#C2E7FF]',
  poll: 'from-[#34A853] via-[#CCFF90] to-[#81C995]',
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const STATUS_IMAGE_FALLBACK = '🖼️';
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const COMMUNITY_FEED = 'community_feed';
const COMMUNITY_STATUS = 'community_status';
const COMMUNITY_MASTER_TAGS = 'community_master_tags';
const MAX_STATUS_FILE_BYTES = 1048576;
const isImageAvatar = (value: string) => value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://');

const countTruthyValues = (value: unknown): number => {
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value as Record<string, unknown>).filter(Boolean).length;
};

const countEmojiUsers = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') return {};
  return Object.values(value as Record<string, unknown>).reduce<Record<string, number>>((counts, emoji) => {
    if (typeof emoji === 'string' && emoji) counts[emoji] = (counts[emoji] || 0) + 1;
    return counts;
  }, {});
};

const resolveAccountBackedCount = (storedCount: unknown, accountMap: unknown): number => Math.max(Number(storedCount) || 0, countTruthyValues(accountMap));

const resolveAccountBackedReactions = (storedReactions: unknown, reactionUsers: unknown): Record<string, number> => {
  const base = storedReactions && typeof storedReactions === 'object' ? { ...(storedReactions as Record<string, number>) } : {};
  const accountCounts = countEmojiUsers(reactionUsers);
  Object.entries(accountCounts).forEach(([emoji, count]) => {
    base[emoji] = Math.max(Number(base[emoji]) || 0, count);
  });
  return base;
};

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
    likedByUsers: data.likedByUsers || {},
    pollVoters: data.pollVoters || {},
    reactionUsers: data.reactionUsers || {},
    replyCount: data.replyCount || 0,
    replies: [],
    createdAt: asMillis(data.createdAt),
  };
};


const mapMasterTagDoc = (snapshotDoc: { id: string; data: () => Record<string, any> }): MasterTagRequest => {
  const data = snapshotDoc.data();
  return {
    id: typeof data.id === 'number' ? data.id : Number.parseInt(snapshotDoc.id.replace(/\D/g, '').slice(-9), 10) || Date.now(),
    docId: snapshotDoc.id,
    author: data.author || data.authorName || 'Eduvora Member',
    avatar: data.avatar || '🧑‍🎓',
    category: (masterTagCategories as readonly string[]).includes(data.category) ? data.category : 'Query',
    title: data.title || 'Community request',
    detail: data.detail || data.body || '',
    time: data.time || formatCommunityTime(data.createdAt),
    likes: resolveAccountBackedCount(data.likes, data.likedByUsers),
    reactions: resolveAccountBackedReactions(data.reactions, data.reactionUsers),
    ownerId: data.ownerId,
    likedByUsers: data.likedByUsers || {},
    reactionUsers: data.reactionUsers || {},
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
    likedByUsers: data.likedByUsers || {},
    pollVoters: data.pollVoters || {},
    createdAt: asMillis(data.createdAt),
  };
};

const EduvoraCommunity: React.FC<EduvoraCommunityProps> = ({ onClose, isAuthenticated = false }) => {
  const navigate = useNavigate();
  const guardedAuth = getAuth();
  const [isCommunityAllowed, setIsCommunityAllowed] = useState(false);
  const [activeView, setActiveView] = useState<CommunityView>('feed');
  const [page, setPage] = useState<CommunityPage>('chat');
  const [pageStack, setPageStack] = useState<CommunityPage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState(initialMessages[0].id);
  const [selectedStatusId, setSelectedStatusId] = useState(initialStatusCards[0].id);
  const [messages, setMessages] = useState<FeedMessage[]>(initialMessages);
  const [statusCards, setStatusCards] = useState<StatusCard[]>(initialStatusCards);
  const [likedStatuses, setLikedStatuses] = useState<number[]>([]);
  const [likedMessages, setLikedMessages] = useState<number[]>([]);
  const [viewedStatusIds, setViewedStatusIds] = useState<number[]>([]);
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
  const [creatorQuota, setCreatorQuota] = useState<Record<string, string[]>>(() => readJsonObject<Record<string, string[]>>(COMMUNITY_CREATOR_QUOTA_KEY, { [todayKey()]: [] }));
  const [statusQuota, setStatusQuota] = useState<Record<string, string[]>>(() => readJsonObject<Record<string, string[]>>(COMMUNITY_STATUS_QUOTA_KEY, { [todayKey()]: [] }));
  const [followedIds, setFollowedIds] = useState<string[]>(['riya', 'meera']);
  const [networkTab, setNetworkTab] = useState<'mutual' | 'followers' | 'following' | 'forYou'>('following');
  const [networkSearch, setNetworkSearch] = useState('');
  const [masterTagRequests, setMasterTagRequests] = useState<MasterTagRequest[]>(() => readJsonArray(MASTER_TAG_STORAGE_KEY, initialMasterTagRequests));
  const [supportTickets, setSupportTickets] = useState<CommunitySupportTicket[]>(() => {
    const storedTickets = readJsonArray<CommunitySupportTicket>(SUPPORT_TICKETS_STORAGE_KEY, []);
    const seededTickets = initialMasterTagRequests.map(buildMasterTagTicket);
    const mergedTickets = [...storedTickets];
    seededTickets.forEach(ticket => { if (!mergedTickets.some(item => item.id === ticket.id)) mergedTickets.push(ticket); });
    if (typeof window !== 'undefined') localStorage.setItem(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify(mergedTickets));
    return mergedTickets;
  });
  const [masterTagTitle, setMasterTagTitle] = useState('');
  const [masterTagDetail, setMasterTagDetail] = useState('');
  const [masterTagCategory, setMasterTagCategory] = useState<(typeof masterTagCategories)[number]>('Feature request');
  const [masterTagFilter, setMasterTagFilter] = useState<'All' | (typeof masterTagCategories)[number]>('All');
  const [masterTagsAudienceFilter, setMasterTagsAudienceFilter] = useState<'mine' | 'students'>('students');
  const [selectedMasterTagId, setSelectedMasterTagId] = useState(initialMasterTagRequests[0].id);
  const [likedMasterTagIds, setLikedMasterTagIds] = useState<number[]>([]);
  const [profile, setProfile] = useState<CommunityProfile>(() => readJsonObject(COMMUNITY_PROFILE_STORAGE_KEY, defaultCommunityProfile));
  const [profileDraft, setProfileDraft] = useState<CommunityProfile>(() => readJsonObject(COMMUNITY_PROFILE_STORAGE_KEY, defaultCommunityProfile));
  const [profileFeedback, setProfileFeedback] = useState<ProfileFeedback>(null);
  const [activeProfilePanel, setActiveProfilePanel] = useState<ProfilePanel>('privacy');
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(() => readJsonObject(COMMUNITY_PRIVACY_STORAGE_KEY, defaultPrivacySettings));
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(() => readJsonObject(COMMUNITY_NOTIFICATION_PREFS_KEY, defaultNotificationPreferences));
  const [showStatusActions, setShowStatusActions] = useState(false);
  const [notificationReads, setNotificationReads] = useState<Record<string, boolean>>(() => readJsonArray<string>(COMMUNITY_NOTIFICATION_READ_KEY, []).reduce<Record<string, boolean>>((reads, id) => ({ ...reads, [id]: true }), {}));
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(() => guardedAuth.currentUser?.email || null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const replyComposerRef = useRef<HTMLDivElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);
  const currentUserKey = guardedAuth.currentUser?.uid || authEmail || `profile-${normalizeUsername(profile.username || profile.name) || 'local'}`;
  const isOwnCommunityId = (id?: string) => id === currentUserKey || id === 'me';
  const selectedMessage = messages.find((message) => message.id === selectedMessageId) || messages[0];
  const selectedStatus = statusCards.find((status) => status.id === selectedStatusId) || statusCards[0];
  const allCreators = useMemo(() => creators.map((creator) => creator.id === 'me' ? { ...creator, name: profile.name, username: profile.username, avatar: profile.avatar } : creator), [profile]);
  const followingMessages = messages.filter((message) => message.creatorId && (followedIds.includes(message.creatorId) || isOwnCommunityId(message.creatorId)));
  const usedCreatorTypesToday = creatorQuota[todayKey()] || [];
  const usedStatusTypesToday = statusQuota[todayKey()] || [];
  const isCreatorTypeUsedToday = usedCreatorTypesToday.includes(postType);
  const isStatusTypeUsedToday = usedStatusTypesToday.includes(statusType);
  const myStatuses = statusCards.filter((status) => isOwnCommunityId(status.ownerId));
  const chatCreators = allCreators.filter((creator) => sharedStories.some((story) => story.recipientId === creator.id));
  const activeChatCreator = allCreators.find((creator) => creator.id === selectedChatId) || chatCreators[0] || allCreators[0];
  const activeChatStories = sharedStories.filter((story) => story.recipientId === activeChatCreator?.id);
  const shouldShowStatusDetail = (card: StatusCard) => card.body.length > 140 || Boolean(card.imagePreview && card.body.trim().length > 0);
  const profileStats = useMemo(() => ({
    coinBalance: eduCoins,
    following: followedIds.length,
    creatorPosts: messages.filter((message) => isOwnCommunityId(message.creatorId)).length,
    myStatuses: myStatuses.length,
    masterTags: masterTagRequests.filter((request) => isOwnCommunityId(request.ownerId) || request.author === profile.name).length,
    repliesGiven: messages.reduce((count, message) => count + message.replies.filter((reply) => isOwnCommunityId(reply.ownerId) || reply.author === profile.name).length, 0),
  }), [eduCoins, followedIds.length, masterTagRequests, messages, myStatuses.length, profile.name]);

  const notifications = useMemo<CommunityNotification[]>(() => {
    const feedReplyAlerts = messages.flatMap((message) => message.replies.slice(-2).map((reply) => ({
      id: `reply-${message.id}-${reply.id}`,
      title: `${reply.author} replied in ${message.title}`,
      body: reply.text,
      time: reply.time,
      read: Boolean(notificationReads[`reply-${message.id}-${reply.id}`]),
      type: 'reply' as const,
      targetPage: 'thread' as CommunityPage,
      targetId: message.id,
    })));
    const masterTagAlerts = supportTickets.filter((ticket) => ticket.source === 'masterTag' && (ticket.adminReply || ticket.inboxMessage)).slice(0, 6).map((ticket) => ({
      id: `master-${ticket.id}-${ticket.repliedAt || ticket.date}`,
      title: ticket.adminReply ? 'Master replied to your tag' : 'Master tag inbox update',
      body: ticket.adminReply || ticket.inboxMessage || ticket.subject,
      time: formatCommunityReplyTime(ticket.repliedAt || ticket.date),
      read: Boolean(notificationReads[`master-${ticket.id}-${ticket.repliedAt || ticket.date}`]),
      type: 'masterTag' as const,
      targetPage: 'masterTagDetail' as CommunityPage,
      targetId: ticket.communityThreadId,
    }));
    const statusAlerts = statusCards.filter((status) => status.likedBy > 0 || (status.views > 0 && isOwnCommunityId(status.ownerId))).slice(0, 5).map((status) => ({
      id: `status-${status.id}-${status.likedBy}-${status.views}`,
      title: status.likedBy > 0 ? 'Your status is getting love' : 'Your status has new views',
      body: `${status.title} · ❤️ ${status.likedBy} · 👁️ ${status.views}`,
      time: status.slots.split('·').pop()?.trim() || 'Just now',
      read: Boolean(notificationReads[`status-${status.id}-${status.likedBy}-${status.views}`]),
      type: 'status' as const,
      targetPage: 'statusReel' as CommunityPage,
      targetId: status.id,
    }));
    const creatorAlerts = messages.filter((message) => message.creatorId && !isOwnCommunityId(message.creatorId)).slice(0, 4).map((message) => ({
      id: `creator-${message.id}`,
      title: `${message.admin} posted in community`,
      body: message.title,
      time: message.time,
      read: Boolean(notificationReads[`creator-${message.id}`]),
      type: 'creator' as const,
      targetPage: 'thread' as CommunityPage,
      targetId: message.id,
    }));
    return [
      ...(notificationPreferences.replies ? feedReplyAlerts : []),
      ...(notificationPreferences.masterTags ? masterTagAlerts : []),
      ...(notificationPreferences.statuses ? statusAlerts : []),
      ...(notificationPreferences.creatorPosts ? creatorAlerts : []),
    ].slice(0, 20);
  }, [messages, notificationPreferences, notificationReads, statusCards, supportTickets]);
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;

  const pushPage = (nextPage: CommunityPage) => {
    setIsNotificationPanelOpen(false);
    setShowStatusActions(false);
    setShareStatusId(null);
    setExpandedReplyId(null);
    setPageStack((stack) => [...stack, page]);
    setPage(nextPage);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setIsNotificationPanelOpen(false);
    setExpandedReplyId(null);
    if (pageStack.length) {
      const previous = pageStack[pageStack.length - 1];
      setPage(previous);
      setPageStack((stack) => stack.slice(0, -1));
      return;
    }
    onClose?.();
  };

  const redirectToAuth = () => {
    const nextState = { ...(window.history.state || {}), dcView: 'auth' };
    window.history.replaceState(nextState, '', '/auth');
    window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
    navigate('/auth', { replace: true, state: { from: 'community' } });
  };

  useEffect(() => {
    localStorage.setItem(COMMUNITY_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(COMMUNITY_PRIVACY_STORAGE_KEY, JSON.stringify(privacySettings));
  }, [privacySettings]);

  useEffect(() => {
    localStorage.setItem(COMMUNITY_NOTIFICATION_PREFS_KEY, JSON.stringify(notificationPreferences));
  }, [notificationPreferences]);

  useEffect(() => {
    localStorage.setItem(MASTER_TAG_STORAGE_KEY, JSON.stringify(masterTagRequests));
  }, [masterTagRequests]);

  useEffect(() => {
    const mergeSeedTickets = (tickets: CommunitySupportTicket[]) => {
      const seededTickets = initialMasterTagRequests.map(buildMasterTagTicket);
      const mergedTickets = [...tickets];
      seededTickets.forEach(ticket => { if (!mergedTickets.some(item => item.id === ticket.id)) mergedTickets.push(ticket); });
      return mergedTickets.sort((a, b) => String(b.repliedAt || b.date).localeCompare(String(a.repliedAt || a.date)));
    };

    const syncSupportTickets = () => setSupportTickets(mergeSeedTickets(readJsonArray<CommunitySupportTicket>(SUPPORT_TICKETS_STORAGE_KEY, [])));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SUPPORT_TICKETS_STORAGE_KEY) syncSupportTickets();
    };

    const unsubscribeTickets = onSnapshot(collection(db, SUPPORT_TICKETS_COLLECTION), (snapshot) => {
      if (snapshot.empty) return;
      const remoteTickets = mergeSeedTickets(snapshot.docs.map((item) => item.data() as CommunitySupportTicket));
      localStorage.setItem(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify(remoteTickets));
      setSupportTickets(remoteTickets);
    }, (error) => console.warn('Community support ticket sync failed; using local fallback', error));

    window.addEventListener('siteSupportTicketsUpdated', syncSupportTickets);
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubscribeTickets();
      window.removeEventListener('siteSupportTicketsUpdated', syncSupportTickets);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setIsCommunityAllowed(true);
      return undefined;
    }
    const unsubscribe = onAuthStateChanged(guardedAuth, (user) => {
      const allowed = Boolean(user);
      setIsCommunityAllowed(allowed);
      setAuthEmail(user?.email || null);
      if (!allowed) redirectToAuth();
    });
    return unsubscribe;
  }, [guardedAuth, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isCommunityAllowed) return undefined;
    const feedQuery = query(collection(db, COMMUNITY_FEED), orderBy('createdAt', 'desc'), limit(150));
    return onSnapshot(feedQuery, (snapshot) => {
      const firebaseMessages = snapshot.docs.map((item) => mapFeedDoc(item));
      setMessages(firebaseMessages.length ? firebaseMessages : initialMessages);
    }, (error) => console.warn('community_feed snapshot failed; using local fallback', error));
  }, [isCommunityAllowed]);

  useEffect(() => {
    if (!isCommunityAllowed) return undefined;
    const statusQuery = query(collection(db, COMMUNITY_STATUS), where('createdAt', '>', Date.now() - 86400000), orderBy('createdAt', 'desc'), limit(150));
    return onSnapshot(statusQuery, (snapshot) => {
      snapshot.docs.forEach((item) => {
        const createdAt = asMillis(item.data().createdAt);
        if (createdAt < Date.now() - STORY_TTL_MS) deleteDoc(doc(db, COMMUNITY_STATUS, item.id)).catch((error) => console.warn('Expired status cleanup failed', error));
      });
      const firebaseStatuses = snapshot.docs.map((item) => mapStatusDoc(item)).filter((status) => (status.createdAt || Date.now()) > Date.now() - STORY_TTL_MS);
      setStatusCards(firebaseStatuses.length ? firebaseStatuses : initialStatusCards);
    }, (error) => console.warn('community_status snapshot failed; using local fallback', error));
  }, [isCommunityAllowed]);

  useEffect(() => {
    if (!isCommunityAllowed) return undefined;
    const masterTagsQuery = query(collection(db, COMMUNITY_MASTER_TAGS), orderBy('createdAt', 'desc'), limit(150));
    return onSnapshot(masterTagsQuery, (snapshot) => {
      const firebaseMasterTags = snapshot.docs.map((item) => mapMasterTagDoc(item));
      setMasterTagRequests(firebaseMasterTags.length ? firebaseMasterTags : readJsonArray(MASTER_TAG_STORAGE_KEY, initialMasterTagRequests));
    }, (error) => console.warn('community_master_tags snapshot failed; using local fallback', error));
  }, [isCommunityAllowed]);

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



  useEffect(() => {
    localStorage.setItem(COMMUNITY_NOTIFICATION_READ_KEY, JSON.stringify(Object.keys(notificationReads).filter((id) => notificationReads[id])));
  }, [notificationReads]);

  useEffect(() => {
    if (!isNotificationPanelOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const clickedBellWrapper = notificationPanelRef.current?.contains(target);
      const clickedDropdown = notificationDropdownRef.current?.contains(target);
      if (!clickedBellWrapper && !clickedDropdown) setIsNotificationPanelOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isNotificationPanelOpen]);

  const markAllNotificationsRead = () => setNotificationReads((current) => ({ ...current, ...Object.fromEntries(notifications.map((notification) => [notification.id, true])) }));

  const openNotification = (notification: CommunityNotification) => {
    setNotificationReads((current) => ({ ...current, [notification.id]: true }));
    setIsNotificationPanelOpen(false);
    if (!notification.targetPage) return;
    if ((notification.targetPage === 'thread' || notification.type === 'reply' || notification.type === 'creator') && typeof notification.targetId === 'number') {
      setSelectedMessageId(notification.targetId);
      setActiveView('feed');
      setPage(window.matchMedia('(max-width: 767px)').matches ? 'thread' : 'chat');
      setPageStack([]);
      return;
    }
    if (notification.targetPage === 'statusReel' && typeof notification.targetId === 'number') {
      setSelectedStatusId(notification.targetId);
      setActiveView('status');
      setPage('statusReel');
      setPageStack(['chat']);
      return;
    }
    if (notification.targetPage === 'masterTagDetail' && typeof notification.targetId === 'number') {
      setSelectedMasterTagId(notification.targetId);
      setPage('masterTagDetail');
      setPageStack(['tagMaster']);
    }
  };

  const switchView = (view: CommunityView) => {
    setIsNotificationPanelOpen(false);
    setExpandedReplyId(null);
    setShowStatusActions(false);
    setActiveView(view);
    setPage('chat');
    setPageStack([]);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resolveAvatar = (message: FeedMessage) => isOwnCommunityId(message.creatorId) ? profile.avatar : message.avatar;
  const resolveName = (message: FeedMessage) => isOwnCommunityId(message.creatorId) ? profile.name : message.admin;

  const Avatar: React.FC<{ value: string; size?: string; className?: string }> = ({ value, size = 'h-12 w-12', className = '' }) => (
    <div className={`${size} shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-[#E8F0FE] via-[#D3E3FD] to-[#C2E7FF] text-xl shadow-inner ring-1 ring-[#D2E3FC] text-[#202124] ${className}`}>{isImageAvatar(value) ? <img src={value} alt="Profile avatar" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center">{value}</span>}</div>
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

  const recordStatusView = (statusId: number) => {
    if (viewedStatusIds.includes(statusId)) return;
    const targetStatus = statusCards.find((status) => status.id === statusId);
    setViewedStatusIds((current) => [...current, statusId]);
    setStatusCards((current) => current.map((status) => status.id === statusId ? { ...status, views: status.views + 1 } : status));
    if (targetStatus?.docId) updateDoc(doc(db, COMMUNITY_STATUS, targetStatus.docId), { views: increment(1) }).catch((error) => console.warn('Status view update failed', error));
  };

  const openStatusReel = (statusId: number) => {
    setSelectedStatusId(statusId);
    recordStatusView(statusId);
    setActiveView('status');
    pushPage('statusReel');
  };

  const submitReply = (messageId: number) => {
    const draft = (replyDrafts[messageId] || '').trim();
    if (!draft) return;
    const targetMessage = messages.find((message) => message.id === messageId);
    const reply = { id: Date.now(), author: profile.name, avatar: profile.avatar, text: draft, time: 'Just now', createdAt: Date.now(), ownerId: 'me' };
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
    if (!draft || isCreatorTypeUsedToday) return;
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
      creatorId: currentUserKey,
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
    addDoc(collection(db, COMMUNITY_FEED), { ...newMessage, ownerId: currentUserKey, createdAt: Date.now(), expiresAt: null, reactionCounts: {}, replyCount: 0 }).catch((error) => console.warn('Creator post write failed', error));
    setCreatorQuota((current) => ({ ...current, [todayKey()]: Array.from(new Set([...(current[todayKey()] || []), postType])) }));
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
    if ((!draft && statusType !== 'image') || isStatusTypeUsedToday) return;
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
    const now = Date.now();
    addDoc(collection(db, COMMUNITY_STATUS), { ...statusStory, ownerId: currentUserKey, createdAt: now, expiresAt: now + STORY_TTL_MS }).catch((error) => console.warn('Status write failed', error));
    setStatusQuota((current) => ({ ...current, [todayKey()]: Array.from(new Set([...(current[todayKey()] || []), statusType])) }));
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
      if (typeof reader.result === 'string') {
        setProfileDraft((current) => ({ ...current, avatar: reader.result as string }));
        setProfileFeedback({ type: 'success', message: 'Avatar staged. Save changes to update your profile everywhere.' });
      }
    };
    reader.readAsDataURL(file);
  };

  const saveProfileChanges = () => {
    const name = profileDraft.name.trim();
    const username = normalizeUsername(profileDraft.username);
    const bio = profileDraft.bio.trim().slice(0, PROFILE_BIO_MAX_LENGTH);
    if (!name) { setProfileFeedback({ type: 'error', message: 'Display name is required.' }); return; }
    if (!username) { setProfileFeedback({ type: 'error', message: 'Username is required. Use lowercase letters, numbers, underscores, or dots.' }); return; }
    if (!/^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$/.test(username)) { setProfileFeedback({ type: 'error', message: 'Username must be 3-30 characters and can use lowercase letters, numbers, underscores, or dots.' }); return; }
    const nextProfile = { ...profileDraft, name, username, bio };
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    setProfileFeedback({ type: 'success', message: 'Profile saved. Header, sidebar, posts, and profile hero now use your latest details.' });
  };

  const resetProfileDraft = () => {
    setProfileDraft(profile);
    setProfileFeedback({ type: 'success', message: 'Draft reset to your saved profile.' });
  };

  const handleLogout = async () => {
    if (!window.confirm('Log out of Eduvora Community?')) return;
    try {
      if (guardedAuth.currentUser) await signOut(guardedAuth);
    } catch (error) {
      console.warn('Community sign-out failed', error);
    } finally {
      setIsCommunityAllowed(false);
      setPageStack([]);
      redirectToAuth();
    }
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
    const targetStatus = statusCards.find((status) => status.id === statusId);
    const alreadyLiked = Boolean(targetStatus?.likedByUsers?.[currentUserKey]) || likedStatuses.includes(statusId);
    setLikedStatuses((current) => alreadyLiked ? current.filter((id) => id !== statusId) : [...current, statusId]);
    setStatusCards((current) => current.map((status) => status.id === statusId ? { ...status, likedBy: Math.max(0, status.likedBy + (alreadyLiked ? -1 : 1)), likedByUsers: { ...(status.likedByUsers || {}), [currentUserKey]: !alreadyLiked } } : status));
    if (targetStatus?.docId) updateDoc(doc(db, COMMUNITY_STATUS, targetStatus.docId), { likedBy: increment(alreadyLiked ? -1 : 1), [`likedByUsers.${currentUserKey}`]: alreadyLiked ? deleteField() : true }).catch((error) => console.warn('Status like update failed', error));
  };

  const toggleMessageLike = (messageId: number) => {
    const targetMessage = messages.find((message) => message.id === messageId);
    const alreadyLiked = Boolean(targetMessage?.likedByUsers?.[currentUserKey]) || likedMessages.includes(messageId);
    setLikedMessages((current) => alreadyLiked ? current.filter((id) => id !== messageId) : [...current, messageId]);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, likeCount: Math.max(0, (message.likeCount || 0) + (alreadyLiked ? -1 : 1)), likedByUsers: { ...(message.likedByUsers || {}), [currentUserKey]: !alreadyLiked } } : message));
    if (targetMessage?.docId) updateDoc(doc(db, COMMUNITY_FEED, targetMessage.docId), { likeCount: increment(alreadyLiked ? -1 : 1), [`likedByUsers.${currentUserKey}`]: alreadyLiked ? deleteField() : true }).catch((error) => console.warn('Message like update failed', error));
  };

  const reactToMessage = (message: FeedMessage, emoji: string) => {
    const previousEmoji = message.reactionUsers?.[currentUserKey];
    if (previousEmoji === emoji) return;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, reactionCounts: { ...(item.reactionCounts || {}), ...(previousEmoji ? { [previousEmoji]: Math.max(0, ((item.reactionCounts || {})[previousEmoji] || 0) - 1) } : {}), [emoji]: ((item.reactionCounts || {})[emoji] || 0) + 1 }, reactionUsers: { ...(item.reactionUsers || {}), [currentUserKey]: emoji } } : item));
    if (message.docId) updateDoc(doc(db, COMMUNITY_FEED, message.docId), { ...(previousEmoji ? { [`reactions.${previousEmoji}`]: increment(-1) } : {}), [`reactions.${emoji}`]: increment(1), [`reactionUsers.${currentUserKey}`]: emoji }).catch((error) => console.warn('Reaction update failed', error));
  };

  const renderReactionStrip = (message: FeedMessage) => <div className="mt-3 flex flex-wrap gap-2">{REACTION_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => reactToMessage(message, emoji)} title={`${emoji} reactions`} className="rounded-full border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-black text-[#202124] shadow-[0_1px_2px_rgba(60,64,67,0.16)] transition hover:border-[#1A73E8] hover:text-[#1967D2] hover:shadow-[0_2px_6px_rgba(60,64,67,0.18)]"><span>{emoji}</span> <span>{(message.reactionCounts || {})[emoji] || 0}</span></button>)}</div>;


  const voteOnStatusPoll = (statusId: number, optionIndex: number) => {
    const targetStatus = statusCards.find((status) => status.id === statusId);
    if (!targetStatus?.pollOptions || targetStatus.pollVoters?.[currentUserKey] !== undefined || targetStatus.selectedPollOption !== undefined) return;
    setStatusCards((current) => current.map((status) => {
      if (status.id !== statusId || !status.pollOptions) return status;
      const votes = status.pollVotes || status.pollOptions.map(() => 0);
      return { ...status, selectedPollOption: optionIndex, pollVoters: { ...(status.pollVoters || {}), [currentUserKey]: optionIndex }, pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count) };
    }));
    if (targetStatus.docId) {
      const votes = targetStatus.pollVotes || targetStatus.pollOptions.map(() => 0);
      updateDoc(doc(db, COMMUNITY_STATUS, targetStatus.docId), { pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count), [`pollVoters.${currentUserKey}`]: optionIndex }).catch((error) => console.warn('Status poll vote update failed', error));
    }
  };

  const voteOnMessagePoll = (messageId: number, optionIndex: number) => {
    const targetMessage = messages.find((message) => message.id === messageId);
    if (!targetMessage?.pollOptions || targetMessage.pollVoters?.[currentUserKey] !== undefined || targetMessage.selectedPollOption !== undefined) return;
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId || !message.pollOptions) return message;
      const votes = message.pollVotes || message.pollOptions.map(() => 0);
      return { ...message, selectedPollOption: optionIndex, pollVoters: { ...(message.pollVoters || {}), [currentUserKey]: optionIndex }, pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count) };
    }));
    if (targetMessage.docId) {
      const votes = targetMessage.pollVotes || targetMessage.pollOptions.map(() => 0);
      updateDoc(doc(db, COMMUNITY_FEED, targetMessage.docId), { pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count), [`pollVoters.${currentUserKey}`]: optionIndex }).catch((error) => console.warn('Message poll vote update failed', error));
    }
  };

  const shareStatusWithCreator = (statusId: number, recipientId: string) => {
    const sharedStory: SharedStory = { id: Date.now() + Math.floor(Math.random() * 1000), statusId, recipientId, senderId: 'me', senderName: profile.name, time: 'Just now' };
    setSharedStories((current) => [sharedStory, ...current]);
    setSelectedChatId(recipientId);
  };

  const submitMasterTag = () => {
    const title = masterTagTitle.trim();
    const detail = masterTagDetail.trim();
    if (!title || !detail) return;
    const requestId = Date.now();
    const request: MasterTagRequest = {
      id: requestId,
      author: profile.name,
      avatar: profile.avatar,
      category: masterTagCategory,
      title,
      detail,
      time: 'Just now',
      likes: 0,
      reactions: {},
      ownerId: 'me',
    };
    const supportTicket: CommunitySupportTicket = buildMasterTagTicket(request);
    const updatedTickets = [supportTicket, ...readJsonArray<CommunitySupportTicket>(SUPPORT_TICKETS_STORAGE_KEY, []).filter((ticket) => ticket.id !== supportTicket.id)];
    localStorage.setItem(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify(updatedTickets));
    setDoc(doc(db, SUPPORT_TICKETS_COLLECTION, supportTicket.id), supportTicket).catch((error) => console.warn('Master tag ticket Firebase write failed', error));
    window.dispatchEvent(new Event('siteSupportTicketsUpdated'));
    setSupportTickets(updatedTickets);
    addDoc(collection(db, COMMUNITY_MASTER_TAGS), { ...request, createdAt: Date.now(), likedByUsers: {}, reactionUsers: {} }).catch((error) => console.warn('Master tag Firebase write failed; using local fallback', error));
    setMasterTagRequests((current) => [request, ...current]);
    setMasterTagFilter('All');
    setMasterTagsAudienceFilter('mine');
    setSelectedMasterTagId(request.id);
    setMasterTagTitle('');
    setMasterTagDetail('');
    setPage('masterTags');
    setPageStack([]);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const likeMasterTag = (requestId: number) => {
    const targetRequest = masterTagRequests.find((request) => request.id === requestId);
    const alreadyLiked = Boolean(targetRequest?.likedByUsers?.[currentUserKey]) || likedMasterTagIds.includes(requestId);
    setLikedMasterTagIds((current) => alreadyLiked ? current.filter((id) => id !== requestId) : [...current, requestId]);
    setMasterTagRequests((current) => current.map((request) => request.id === requestId ? { ...request, likes: Math.max(0, request.likes + (alreadyLiked ? -1 : 1)), likedByUsers: alreadyLiked ? Object.fromEntries(Object.entries(request.likedByUsers || {}).filter(([key]) => key !== currentUserKey)) : { ...(request.likedByUsers || {}), [currentUserKey]: true } } : request));
    if (targetRequest?.docId) updateDoc(doc(db, COMMUNITY_MASTER_TAGS, targetRequest.docId), { likes: increment(alreadyLiked ? -1 : 1), [`likedByUsers.${currentUserKey}`]: alreadyLiked ? deleteField() : true }).catch((error) => console.warn('Master tag like update failed', error));
  };

  const reactToMasterTag = (requestId: number, emoji: string) => {
    const targetRequest = masterTagRequests.find((request) => request.id === requestId);
    const previousEmoji = targetRequest?.reactionUsers?.[currentUserKey];
    if (previousEmoji === emoji) return;
    setMasterTagRequests((current) => current.map((request) => request.id === requestId ? { ...request, reactions: resolveAccountBackedReactions({ ...request.reactions, ...(previousEmoji ? { [previousEmoji]: Math.max(0, (request.reactions[previousEmoji] || 0) - 1) } : {}), [emoji]: (request.reactions[emoji] || 0) + 1 }, { ...(request.reactionUsers || {}), [currentUserKey]: emoji }), reactionUsers: { ...(request.reactionUsers || {}), [currentUserKey]: emoji } } : request));
    if (targetRequest?.docId) updateDoc(doc(db, COMMUNITY_MASTER_TAGS, targetRequest.docId), { ...(previousEmoji ? { [`reactions.${previousEmoji}`]: increment(-1) } : {}), [`reactions.${emoji}`]: increment(1), [`reactionUsers.${currentUserKey}`]: emoji }).catch((error) => console.warn('Master tag reaction update failed', error));
  };

  useEffect(() => { localStorage.setItem(COMMUNITY_CREATOR_QUOTA_KEY, JSON.stringify({ [todayKey()]: creatorQuota[todayKey()] || [] })); }, [creatorQuota]);
  useEffect(() => { localStorage.setItem(COMMUNITY_STATUS_QUOTA_KEY, JSON.stringify({ [todayKey()]: statusQuota[todayKey()] || [] })); }, [statusQuota]);

  const currentMasterTagAuthor = profile.name.trim().toLowerCase();
  const audienceFilteredMasterTagRequests = masterTagRequests.filter((request) => {
    const isCurrentUserRequest = request.author.trim().toLowerCase() === currentMasterTagAuthor;
    return masterTagsAudienceFilter === 'mine' ? isCurrentUserRequest : !isCurrentUserRequest;
  });
  const filteredMasterTagRequests = masterTagFilter === 'All' ? audienceFilteredMasterTagRequests : audienceFilteredMasterTagRequests.filter((request) => request.category === masterTagFilter);
  const selectedMasterTag = masterTagRequests.find((request) => request.id === selectedMasterTagId) || masterTagRequests[0];
  const masterTagAdminReplies = useMemo(() => supportTickets.reduce<Record<number, CommunitySupportTicket>>((replyMap, ticket) => {
    if (ticket.source === 'masterTag' && ticket.communityThreadId && ticket.adminReply) replyMap[ticket.communityThreadId] = ticket;
    return replyMap;
  }, {}), [supportTickets]);
  const selectedMasterTagReply = selectedMasterTag ? masterTagAdminReplies[selectedMasterTag.id] : undefined;
  const masterTagGroupedRequests = masterTagCategories.map((category) => ({
    category,
    requests: filteredMasterTagRequests.filter((request) => request.category === category),
  })).filter((group) => group.requests.length);

  const renderMasterTagCard = (request: MasterTagRequest, compact = false) => (
    <article key={request.id} className="overflow-hidden rounded-[1.75rem] border border-[#E0E3EB] bg-white shadow-[0_16px_42px_rgba(60,64,67,0.08)] transition duration-300 hover:-translate-y-0.5 hover:border-[#C2E7FF]">
      <div className="border-l-4 border-[#1A73E8] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Avatar value={isOwnCommunityId(request.ownerId) ? profile.avatar : request.avatar} size="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black text-[#5F6368]"><span className="text-[#202124]">{isOwnCommunityId(request.ownerId) ? profile.name : request.author}</span><span>•</span><span>{request.time}</span><span className="rounded-full border border-[#D2E3FC] bg-[#E8F0FE] px-2 py-1 text-[#1967D2]">{request.category}</span></div>
            <h3 className="mt-2 text-xl font-black tracking-tight text-[#202124] sm:text-2xl">@Master {request.title}</h3>{masterTagAdminReplies[request.id] && <span className="mt-2 inline-flex rounded-full bg-[#E6F4EA] px-3 py-1 text-[11px] font-black text-[#137333]">Master replied</span>}
            <p className={`mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#5F6368] ${compact ? 'line-clamp-3' : ''}`}>{request.detail}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => likeMasterTag(request.id)} className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${(request.likedByUsers?.[currentUserKey] || likedMasterTagIds.includes(request.id)) ? 'border-[#FAD2CF] bg-[#FCE8E6] text-[#C5221F]' : 'border-[#DADCE0] bg-white text-[#202124] hover:border-[#1A73E8] hover:text-[#1967D2]'}`}>❤️ {request.likes}</button>
              {REACTION_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => reactToMasterTag(request.id, emoji)} className="rounded-full border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-black text-[#202124] transition hover:border-[#1A73E8] hover:text-[#1967D2]">{emoji} {request.reactions[emoji] || 0}</button>)}
            </div>
          </div>
        </div>
      </div>
    </article>
  );

  const openMasterTagDetail = (requestId: number) => {
    setSelectedMasterTagId(requestId);
    if (window.matchMedia('(max-width: 767px)').matches) pushPage('masterTagDetail');
  };

  const renderMasterTagStrip = (request: MasterTagRequest) => (
    <article key={request.id} role="button" tabIndex={0} onClick={() => openMasterTagDetail(request.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openMasterTagDetail(request.id); }} className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-[#E0E3EB] bg-white px-3 py-2.5 text-left shadow-[0_8px_24px_rgba(60,64,67,0.06)] transition duration-300 hover:-translate-y-0.5 hover:border-[#C2E7FF] hover:bg-[#F8FAFD] sm:px-4">
      <Avatar value={isOwnCommunityId(request.ownerId) ? profile.avatar : request.avatar} size="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-black text-[#202124]">@Master {request.title}</span><span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-black text-[#1967D2]">{request.category}</span>{masterTagAdminReplies[request.id] && <span className="rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[10px] font-black text-[#137333]">Master replied</span>}</div>
        <p className="mt-1 line-clamp-1 text-xs font-semibold text-[#5F6368]">{request.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => likeMasterTag(request.id)} className={`rounded-full px-2.5 py-1 text-[11px] font-black transition ${(request.likedByUsers?.[currentUserKey] || likedMasterTagIds.includes(request.id)) ? 'bg-[#FCE8E6] text-[#C5221F]' : 'bg-[#F8FAFD] text-[#202124] hover:bg-[#E8F0FE]'}`}>❤️ {request.likes}</button>
        {REACTION_EMOJIS.slice(0, 3).map((emoji) => <button key={emoji} type="button" onClick={() => reactToMasterTag(request.id, emoji)} className="rounded-full bg-[#F8FAFD] px-2 py-1 text-[11px] font-black text-[#202124] transition hover:bg-[#E8F0FE] hover:text-[#1967D2]">{emoji} {request.reactions[emoji] || 0}</button>)}
      </div>
      <span className="hidden rounded-full bg-[#D3E3FD] px-3 py-1 text-[10px] font-black text-[#174EA6] transition group-hover:bg-[#1A73E8] group-hover:text-white sm:inline">Read</span>
    </article>
  );

  const renderMasterTagDetailPage = (showBackButton = true) => selectedMasterTag ? (
    <div className="mx-auto max-w-4xl space-y-4">
      {showBackButton ? <button type="button" onClick={() => setPage('masterTags')} className="rounded-2xl border border-[#E0E3EB] bg-white px-4 py-3 text-sm font-black text-[#5F6368] shadow-sm transition hover:bg-[#E8F0FE]">← Back to Master Tags</button> : null}
      <section className="overflow-hidden rounded-[2.4rem] border border-[#D2E3FC] bg-white shadow-[0_28px_86px_rgba(26,115,232,0.14)]">
        <div className="bg-gradient-to-br from-[#E8F0FE] via-[#D3E3FD] to-[#C2E7FF] p-6 sm:p-8">
          <div className="flex items-start gap-4"><Avatar value={selectedMasterTag.avatar} size="h-14 w-14" /><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.24em] text-[#1967D2]">{selectedMasterTag.category}</p><h2 className="mt-2 text-3xl font-black tracking-tight text-[#202124] sm:text-5xl">@Master {selectedMasterTag.title}</h2><p className="mt-2 text-sm font-bold text-[#5F6368]">{selectedMasterTag.author} • {selectedMasterTag.time}</p></div></div>
        </div>
        <div className="space-y-5 p-5 sm:p-7">
          <p className="whitespace-pre-wrap rounded-[2rem] border border-[#E0E3EB] bg-[#F8FAFD] p-5 text-base font-semibold leading-8 text-[#5F6368] sm:text-lg">{selectedMasterTag.detail}</p>
          <section className={`rounded-[2rem] border p-5 shadow-[0_12px_34px_rgba(52,168,83,0.10)] ${selectedMasterTagReply?.adminReply ? 'border-[#CEEAD6] bg-[#E6F4EA]' : 'border-[#E0E3EB] bg-[#F8FAFD]'}`}>
            <div className="flex items-start gap-3"><Avatar value="🧑‍💻" size="h-11 w-11" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-[#137333]">Master replied</p>{selectedMasterTagReply?.adminReply ? <span className="text-xs font-bold text-[#5F6368]">{formatCommunityReplyTime(selectedMasterTagReply.repliedAt)}</span> : null}</div><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#202124] sm:text-base">{selectedMasterTagReply?.adminReply || 'No reply yet'}</p></div></div>
          </section>
          <div className="rounded-[2rem] border border-[#E0E3EB] bg-white p-4"><p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#1967D2]">React only</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => likeMasterTag(selectedMasterTag.id)} className={`rounded-full border px-4 py-2 text-sm font-black transition ${(selectedMasterTag.likedByUsers?.[currentUserKey] || likedMasterTagIds.includes(selectedMasterTag.id)) ? 'border-[#FAD2CF] bg-[#FCE8E6] text-[#C5221F]' : 'border-[#DADCE0] bg-white text-[#202124] hover:border-[#1A73E8] hover:text-[#1967D2]'}`}>❤️ {selectedMasterTag.likes}</button>{REACTION_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => reactToMasterTag(selectedMasterTag.id, emoji)} className="rounded-full border border-[#DADCE0] bg-white px-4 py-2 text-sm font-black text-[#202124] transition hover:border-[#1A73E8] hover:text-[#1967D2]">{emoji} {selectedMasterTag.reactions[emoji] || 0}</button>)}</div></div>
        </div>
      </section>
    </div>
  ) : null;

  const renderMasterTagDock = () => (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[1350] flex justify-center px-3 pointer-events-none md:bottom-5">
      <nav className="pointer-events-auto flex max-w-[94vw] items-center gap-2 overflow-x-auto rounded-[2rem] border border-[#D2E3FC] bg-white/95 p-2 shadow-[0_18px_60px_rgba(26,115,232,0.22)] ring-1 ring-[#C2E7FF] backdrop-blur-2xl custom-scrollbar" aria-label="Master tag dock">
        <button type="button" onClick={() => setPage('tagMaster')} className={`min-w-[120px] rounded-2xl px-4 py-3 text-center transition duration-300 hover:-translate-y-1 active:scale-95 ${page === 'tagMaster' ? 'bg-[#D3E3FD] text-[#174EA6] shadow-lg shadow-[#D2E3FC]' : 'bg-white text-[#202124] hover:bg-[#E8F0FE]'}`}><span className="block text-2xl">🏷️</span><span className="text-[11px] font-black">Tag your master</span></button>
        <button type="button" onClick={() => setPage('masterTags')} className={`min-w-[120px] rounded-2xl px-4 py-3 text-center transition duration-300 hover:-translate-y-1 active:scale-95 ${page === 'masterTags' || page === 'masterTagDetail' ? 'bg-[#D3E3FD] text-[#174EA6] shadow-lg shadow-[#D2E3FC]' : 'bg-white text-[#202124] hover:bg-[#E8F0FE]'}`}><span className="block text-2xl">📚</span><span className="text-[11px] font-black">Master Tags</span></button>
      </nav>
    </div>
  );

  const renderTagMasterPage = () => (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="overflow-hidden rounded-[2.6rem] border border-[#D2E3FC] bg-white shadow-[0_30px_90px_rgba(26,115,232,0.16)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#E8F0FE] via-[#D3E3FD] to-[#C2E7FF] p-6 text-[#202124] sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/35 blur-3xl" />
          <div className="absolute bottom-0 left-12 h-44 w-44 rounded-full bg-[#1A73E8]/10 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <p className="text-left text-sm font-black uppercase tracking-[0.28em] text-[#1967D2]">tag your master</p>
              <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Directly tag master for action-worthy student demands.</h2>
              <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-[#202124]/72 sm:text-base">You can request feature, submit doubt, queries, updates you want, feature you want, any bug or issues, any demand, and other students can also react your comment with likes and emojis. After a huge request or demand master definitely take action on it.</p>
            </div>
            <div className="rounded-[2rem] border border-white/55 bg-white/70 p-4 shadow-[0_18px_54px_rgba(26,115,232,0.14)] backdrop-blur-xl">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#1967D2]">Live request meter</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-[#E8F0FE] p-3"><p className="text-2xl font-black text-[#174EA6]">{masterTagRequests.length}</p><p className="text-[11px] font-bold text-[#5F6368]">Requests</p></div>
                <div className="rounded-2xl bg-[#E6F4EA] p-3"><p className="text-2xl font-black text-[#137333]">{masterTagRequests.reduce((sum, item) => sum + item.likes, 0)}</p><p className="text-[11px] font-bold text-[#5F6368]">Likes</p></div>
                <div className="rounded-2xl bg-[#FEF7E0] p-3"><p className="text-2xl font-black text-[#B06000]">{masterTagGroupedRequests.length}</p><p className="text-[11px] font-bold text-[#5F6368]">Categories</p></div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-[#F8FAFD] via-white to-[#E8F0FE] p-5 sm:p-7">
          <div className="mx-auto max-w-3xl rounded-[2rem] border border-[#E0E3EB] bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#1967D2]">Direct tag composer</p>
            <label className="mt-4 block text-sm font-black text-[#202124]">Category</label>
            <select value={masterTagCategory} onChange={(event) => setMasterTagCategory(event.target.value as (typeof masterTagCategories)[number])} className="mt-2 w-full rounded-2xl border border-[#E0E3EB] bg-white px-4 py-3 text-sm font-bold text-[#202124] outline-none focus:border-[#1A73E8]">
              {masterTagCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <label className="mt-4 block text-sm font-black text-[#202124]">Tag title</label>
            <input value={masterTagTitle} onChange={(event) => setMasterTagTitle(event.target.value)} placeholder="Example: Master, please add doubt session" className="mt-2 w-full rounded-2xl border border-[#E0E3EB] px-4 py-3 text-sm font-bold outline-none focus:border-[#1A73E8]" />
            <label className="mt-4 block text-sm font-black text-[#202124]">Detailed request</label>
            <textarea value={masterTagDetail} onChange={(event) => setMasterTagDetail(event.target.value)} placeholder="Write your doubt, query, bug, feature demand, update request, or any important student need..." rows={8} className="mt-2 w-full resize-none rounded-2xl border border-[#E0E3EB] px-4 py-3 text-sm font-bold leading-6 outline-none focus:border-[#1A73E8]" />
            <button type="button" onClick={submitMasterTag} disabled={!masterTagTitle.trim() || !masterTagDetail.trim()} className="mt-4 w-full rounded-2xl bg-[#1A73E8] px-5 py-3 text-sm font-black text-white shadow-[0_14px_34px_rgba(26,115,232,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#AECBFA]">Tag master now</button>
          </div>
        </div>
      </section>
    </div>
  );

  const renderMasterTagFilters = (compact = false) => (
    <div className={compact ? 'space-y-4' : ''}>
      <div className={compact ? '' : 'rounded-[2.4rem] border border-[#D2E3FC] bg-gradient-to-br from-[#E8F0FE] via-white to-[#C2E7FF] p-6 shadow-[0_26px_80px_rgba(26,115,232,0.14)] sm:p-8'}>
        <p className="text-sm font-black uppercase tracking-[0.28em] text-[#1967D2]">Master Tags</p>
        <h2 className={compact ? 'mt-2 text-2xl font-black tracking-tight text-[#202124] lg:text-3xl' : 'mt-3 text-4xl font-black tracking-tight text-[#202124] sm:text-5xl'}>Category-wise student queries and demands.</h2>
        <p className={compact ? 'mt-2 text-sm font-semibold leading-6 text-[#5F6368]' : 'mt-3 max-w-3xl text-base font-semibold leading-7 text-[#5F6368]'}>Switch between your submitted tags and other students' tags, then use category filters below. Open any row for full reading, and react only with likes or emojis.</p>
        <div className="mt-5 grid gap-2 sm:inline-grid sm:grid-cols-2" aria-label="Master tag audience filter">
          {([{ key: 'mine', label: 'Your tags', helper: 'Only tags submitted by you' }, { key: 'students', label: 'Students tags', helper: 'Tags submitted by other students' }] as const).map((option) => <button key={option.key} type="button" onClick={() => setMasterTagsAudienceFilter(option.key)} className={`rounded-2xl border px-5 py-3 text-left transition ${masterTagsAudienceFilter === option.key ? 'border-[#1A73E8] bg-[#1A73E8] text-white shadow-[0_14px_34px_rgba(26,115,232,0.24)]' : 'border-[#D2E3FC] bg-white/85 text-[#1967D2] hover:bg-[#E8F0FE]'}`}><span className="block text-sm font-black">{option.label}</span><span className={`mt-1 block text-[11px] font-bold ${masterTagsAudienceFilter === option.key ? 'text-white/80' : 'text-[#5F6368]'}`}>{option.helper}</span></button>)}
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {(['All', ...masterTagCategories] as Array<'All' | (typeof masterTagCategories)[number]>).map((category) => <button key={category} type="button" onClick={() => setMasterTagFilter(category)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${masterTagFilter === category ? 'border-[#1A73E8] bg-[#1A73E8] text-white shadow-[0_10px_28px_rgba(26,115,232,0.24)]' : 'border-[#D2E3FC] bg-white/85 text-[#1967D2] hover:bg-[#E8F0FE]'}`}>{category === 'All' ? 'All tags' : category}</button>)}
        </div>
      </div>
    </div>
  );

  const renderMasterTagListHeader = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#1967D2]">{masterTagsAudienceFilter === 'mine' ? 'Your tags' : 'Students tags'} · {masterTagFilter === 'All' ? 'All categories' : masterTagFilter}</p>
        <h3 className="mt-1 text-2xl font-black text-[#202124]">{filteredMasterTagRequests.length} visible student {filteredMasterTagRequests.length === 1 ? 'tag' : 'tags'}</h3>
      </div>
      <span className="rounded-full bg-[#E8F0FE] px-4 py-2 text-xs font-black text-[#174EA6]">Click row to read</span>
    </div>
  );

  const renderMasterTagRows = () => filteredMasterTagRequests.length ? filteredMasterTagRequests.map(renderMasterTagStrip) : <div className="rounded-2xl border border-dashed border-[#C2E7FF] bg-[#F8FAFD] p-8 text-center text-sm font-black text-[#5F6368]">{masterTagsAudienceFilter === 'mine' ? 'No tags submitted by you yet. Use Tag your master to create your first request.' : 'No student tags found for this filter yet.'}</div>;

  const renderMasterTagsPage = () => (
    <div className="mx-auto max-w-7xl md:max-w-none">
      <div className="space-y-5 md:hidden">
        {renderMasterTagFilters()}
        <div className="rounded-[2rem] border border-[#E0E3EB] bg-white p-3 shadow-[0_18px_54px_rgba(60,64,67,0.08)] sm:p-4">
          <div className="mb-3">{renderMasterTagListHeader()}</div>
          <div className="space-y-2">{renderMasterTagRows()}</div>
        </div>
      </div>

      <div className="hidden h-[calc(100dvh-9.5rem)] min-h-0 grid-cols-[minmax(320px,0.92fr)_minmax(420px,1.08fr)] gap-5 overflow-hidden md:grid xl:h-[calc(100dvh-10rem)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[2.35rem] border border-[#D2E3FC] bg-white/90 shadow-[0_24px_80px_rgba(26,115,232,0.12)] ring-1 ring-white/70">
          <div className="shrink-0 border-b border-[#E0E3EB] bg-gradient-to-br from-[#E8F0FE] via-white to-[#C2E7FF] p-5 lg:p-6">
            {renderMasterTagFilters(true)}
          </div>
          <div className="shrink-0 bg-white/95 p-4 pb-3">
            {renderMasterTagListHeader()}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-5 custom-scrollbar lg:px-5">
            {renderMasterTagRows()}
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto rounded-[2.35rem] border border-[#D2E3FC] bg-white/88 p-4 shadow-[0_24px_80px_rgba(26,115,232,0.12)] ring-1 ring-white/70 custom-scrollbar lg:p-5">
          {selectedMasterTag ? renderMasterTagDetailPage(false) : <div className="flex h-full items-center justify-center rounded-[2rem] border border-dashed border-[#C2E7FF] bg-[#F8FAFD] p-8 text-center text-sm font-black text-[#5F6368]">Select a Master Tag to read the full detail.</div>}
        </aside>
      </div>
    </div>
  );

  const MessageSummaryCard: React.FC<{ message: FeedMessage; isActive?: boolean }> = ({ message, isActive = false }) => (
    <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition duration-300 ${isActive ? 'scale-[1.012] border-[#C2E7FF] shadow-[0_18px_48px_rgba(26,115,232,0.10)] ring-2 ring-[#E8F0FE]' : 'border-[#E0E3EB] hover:-translate-y-0.5 hover:border-[#C2E7FF] hover:shadow-[0_16px_40px_rgba(60,64,67,0.10)]'}`}>
      <button type="button" onClick={() => openMessage(message.id)} className={`flex w-full items-center gap-3 border-l-4 p-3 text-left transition sm:p-4 ${isActive ? 'border-[#1A73E8] bg-[#E8F0FE]' : 'border-transparent'}`}>
        <Avatar value={resolveAvatar(message)} size="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-black text-[#202124] sm:text-lg">{message.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-[#5F6368] sm:text-sm"><span>{resolveName(message)}</span><span>•</span><span>{message.time}</span><span className="rounded-full border border-[#D2E3FC] px-2 py-0.5 text-[#1967D2]">{message.badge}</span></div>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[#5F6368] sm:text-[15px]">{message.body}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-[#FCE8E6] px-2 py-1 text-[11px] font-black text-[#C5221F]">❤️ {message.likeCount || 0}</span><span className="rounded-full bg-[#E8F0FE] px-2 py-1 text-[11px] font-black text-[#1967D2]">💬 {message.replyCount || message.replies.length}</span></div>{renderReactionStrip(message)}
        </div>
      </button>
    </article>
  );

  const renderMessageDetails = (message: FeedMessage, fullScreen = false) => (
    <div className={`flex min-h-0 flex-col overflow-hidden bg-white ${fullScreen ? 'h-[calc(100dvh-10rem)]' : 'h-[calc(100dvh-11rem)] rounded-[1.75rem] border border-[#E0E3EB] shadow-[0_16px_48px_rgba(60,64,67,0.07)]'}`}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-6 custom-scrollbar lg:p-7">
        <div className="flex items-start gap-3">
          <Avatar value={resolveAvatar(message)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-[#202124] sm:text-xl">{resolveName(message)}</h2><span className="rounded-full border border-[#D2E3FC] bg-white px-2.5 py-1 text-[11px] font-black text-[#1967D2]">{message.badge}</span><span className="text-xs font-bold text-[#5F6368]">{message.time}</span></div>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-[#202124] lg:text-4xl">{message.title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-8 text-[#5F6368] sm:text-lg">{message.body}</p>{message.imagePreview ? <div className="mt-5 aspect-square max-w-md overflow-hidden rounded-[2rem] border border-[#C2E7FF] bg-gradient-to-br from-[#E8F0FE] via-[#EDF2FA] to-[#C2E7FF] shadow-inner">{renderUploadedImage(message.imagePreview, message.title, message.imageLayout || 'thumbnail')}</div> : null}{message.pollOptions ? <div className="mt-5 space-y-3 rounded-[1.6rem] border border-[#CEEAD6] bg-[#E6F4EA] p-4">{message.pollOptions.map((option, index) => { const votes = message.pollVotes || message.pollOptions!.map(() => 0); const total = Math.max(1, votes.reduce((sum, count) => sum + count, 0)); const percent = Math.round((votes[index] / total) * 100); const selectedOption = message.pollVoters?.[currentUserKey] ?? message.selectedPollOption; const selected = selectedOption === index; return <button key={option} type="button" onClick={() => voteOnMessagePoll(message.id, index)} className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left font-black transition ${selected ? 'border-[#34A853] bg-white text-[#137333]' : 'border-[#CEEAD6] bg-white text-[#202124] hover:border-[#34A853]'}`}><span className="absolute inset-y-0 left-0 bg-[#CEEAD6]" style={{ width: selectedOption !== undefined ? `${percent}%` : '0%' }} /><span className="relative flex items-center justify-between"><span>{option}</span>{selectedOption !== undefined ? <span>{percent}% · {votes[index]}</span> : <span>Vote</span>}</span></button>; })}</div> : null}
            {renderReactionStrip(message)}<div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => toggleMessageLike(message.id)} className={`rounded-full border px-3 py-1.5 text-sm font-black transition ${(message.likedByUsers?.[currentUserKey] || likedMessages.includes(message.id)) ? 'border-[#F8D7DA] bg-[#FCE8E6] text-[#C5221F]' : 'border-[#D2E3FC] bg-[#E8F0FE] text-[#1967D2]'}`}>❤️ {message.likeCount || 0}</button><span className="rounded-full border border-[#D2E3FC] bg-[#E8F0FE] px-3 py-1.5 text-sm font-black text-[#1967D2]">💬 {message.replyCount || message.replies.length}</span></div>
          </div>
        </div>
        <div className="mt-5 space-y-3 pb-4">{message.replies.map((reply) => <div key={reply.id} className="flex items-start gap-3"><Avatar value={isOwnCommunityId(reply.ownerId) || reply.author === profile.name ? profile.avatar : (reply.avatar || '👤')} size="h-9 w-9" className="mt-1 text-base shadow-[0_8px_24px_rgba(37,99,235,0.12)]" /><div className="max-w-[92%] flex-1 rounded-[1.35rem] rounded-bl-md border border-[#D2E3FC] border-l-4 border-l-[#1A73E8] bg-gradient-to-br from-white via-[#F8FAFD] to-[#EDF2FA] px-4 py-3 shadow-[0_10px_32px_rgba(15,23,42,0.06)]"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-[#202124]">{isOwnCommunityId(reply.ownerId) || reply.author === profile.name ? profile.name : reply.author}</span><span className="text-xs font-bold text-[#5F6368]">{reply.time}</span></div><p className="mt-1 text-sm font-semibold leading-6 text-[#5F6368] sm:text-base">{reply.text}</p></div></div>)}</div>
      </div>
      {expandedReplyId === message.id ? <div ref={replyComposerRef} data-community-replybar="true" className="fixed bottom-[calc(env(safe-area-inset-bottom)+7.75rem)] left-3 right-3 z-[1600] rounded-[1.65rem] border border-[#D2E3FC] bg-white/95 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.20)] backdrop-blur-2xl transition-all duration-500 data-[hidden=true]:translate-y-8 data-[hidden=true]:opacity-0 md:bottom-28 md:left-auto md:right-8 md:w-[min(760px,calc(100vw-4rem))]"><div className="flex items-center gap-2"><input ref={replyInputRef} value={replyDrafts[message.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [message.id]: event.target.value }))} placeholder="Write a quick reply..." maxLength={1000} className="min-w-0 flex-1 rounded-2xl border border-[#E0E3EB] bg-white px-4 py-3 text-sm font-bold text-[#202124] outline-none transition focus:border-[#1A73E8] focus:bg-white" /><button type="button" onClick={() => submitReply(message.id)} className="rounded-2xl bg-[#1A73E8] px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5">Send</button></div></div> : <div className="shrink-0 border-t border-[#E0E3EB] bg-white/95 p-3 backdrop-blur-xl lg:p-4"><button type="button" onClick={() => { loadRepliesForMessage(message); setExpandedReplyId(message.id); }} className="w-full rounded-2xl border border-[#E0E3EB] bg-white px-4 py-3 text-left text-sm font-black text-[#5F6368] transition hover:bg-[#E8F0FE]">💬 Reply to this thread</button></div>}
    </div>
  );

  const renderFeedLayout = (feedMessages: FeedMessage[], title = 'Chats', subtitle = 'Thin updates. Click to expand on the right.') => {
    const activeMessage = feedMessages.find((message) => message.id === selectedMessageId) || feedMessages[0];
    const isFollowingFeed = title.toLowerCase().includes('followers');
    const heroGradient = isFollowingFeed ? 'from-[#E8F0FE] via-[#D3E3FD] to-[#C2E7FF]' : 'from-[#EDF2FA] via-[#D3E3FD] to-[#C2E7FF]';
    const heroEyebrow = isFollowingFeed ? 'Following pulse' : 'Chat feed live';
    const heroIcon = isFollowingFeed ? '👥' : '💬';
    if (!feedMessages.length) return <div className="mx-auto max-w-5xl rounded-[2rem] border border-dashed border-[#C2E7FF] bg-gradient-to-br from-[#F8FAFD] via-white to-[#E8F0FE] p-8 text-center font-bold text-[#5F6368] shadow-[0_18px_54px_rgba(37,99,235,0.10)]"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white text-3xl shadow-inner">👀</div>Follow creators to build this feed.</div>;
    return <div className="mx-auto grid h-[clamp(32rem,calc(100dvh-10.5rem),76rem)] min-h-0 w-full min-w-0 max-w-[1800px] gap-4 overflow-hidden lg:gap-5 md:grid-cols-[minmax(0,clamp(17rem,30vw,27.5rem))_minmax(0,1fr)]"><aside className="hidden h-full min-h-0 min-w-0 overflow-y-auto rounded-[2rem] border border-[#E0E3EB] bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] ring-1 ring-[#D2E3FC] backdrop-blur-xl custom-scrollbar md:block"><div className={`relative mb-4 overflow-hidden rounded-[1.6rem] bg-gradient-to-br ${heroGradient} p-5 text-[#202124] shadow-[0_18px_50px_rgba(37,99,235,0.18)]`}><div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/20 blur-2xl" /><p className="relative text-xs font-black uppercase tracking-[0.28em] text-[#202124]/80">{heroEyebrow}</p><h2 className="relative mt-2 text-3xl font-black tracking-tight">{heroIcon} {title}</h2><p className="relative mt-2 text-sm font-semibold leading-6 text-[#202124]/78">{subtitle}</p></div><div className="space-y-3">{feedMessages.map((message) => <MessageSummaryCard key={message.id} message={message} isActive={activeMessage?.id === message.id} />)}</div></aside><section className="hidden min-h-0 min-w-0 overflow-hidden md:block">{activeMessage ? renderMessageDetails(activeMessage) : null}</section><div className="h-full space-y-3 overflow-y-auto pb-4 custom-scrollbar md:hidden">{feedMessages.map((message) => <MessageSummaryCard key={message.id} message={message} />)}</div></div>;
  };

  const renderTypeComposer = (activeType: PostType, setActiveType: (type: PostType) => void, accent: 'sky' | 'orange' = 'sky') => {
    const activeClass = accent === 'orange'
      ? 'border-[#FDD663] bg-[#FEF7E0] shadow-[0_18px_42px_rgba(251,188,4,0.14)] ring-2 ring-white'
      : 'border-[#C2E7FF] bg-[#E8F0FE] shadow-[0_18px_42px_rgba(26,115,232,0.12)] ring-2 ring-white';

    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {postOptions.map((option) => (
          <button key={option.type} type="button" onClick={() => setActiveType(option.type)} className={`rounded-[1.35rem] border p-4 text-left transition duration-300 hover:-translate-y-1 ${activeType === option.type ? activeClass : 'border-[#E0E3EB] bg-white hover:bg-[#E8F0FE]'}`}>
            <span className="text-3xl">{option.icon}</span>
            <span className="mt-3 block text-lg font-black text-[#202124]">{option.label}</span>
            <span className="mt-1 block text-sm font-bold text-[#5F6368]">{option.helper}</span>
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
      return <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]"><label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border-2 border-dashed border-[#C2E7FF] bg-white p-4 text-center shadow-inner transition hover:bg-white"><input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageUpload(event, setImageName, setImagePreview)} /><span className={`${isStatus ? 'min-h-44 w-full' : 'aspect-square w-36'} flex overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#E8F0FE] to-[#C2E7FF] shadow-inner`}>{imagePreview ? renderUploadedImage(imagePreview, imageName || 'Uploaded preview', isStatus ? 'original' : 'thumbnail') : <span className="m-auto text-5xl">🖼️</span>}</span><span className="mt-3 text-lg font-black text-[#202124]">{isStatus ? 'Upload original-ratio image' : 'Upload thumbnail image'}</span><span className="mt-1 text-sm font-bold text-[#5F6368]">{imageName || (isStatus ? 'Original ratio will be preserved' : 'Thumbnail will be square cropped')}</span></label><textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1000))} maxLength={1000} placeholder={isStatus ? 'Add image status caption...' : 'Describe your image post...'} className="min-h-[180px] rounded-[1.75rem] border border-[#E0E3EB] bg-white px-5 py-4 text-[#202124] text-base font-semibold leading-7 outline-none transition focus:border-[#1A73E8] focus:bg-white" /></div>;
    }
    if (type === 'poll') {
      return <div className="space-y-4"><textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1000))} maxLength={1000} placeholder={isStatus ? 'Ask your status poll question...' : 'Write your poll question...'} className="min-h-[120px] w-full rounded-[1.75rem] border border-[#E0E3EB] bg-white px-5 py-4 text-[#202124] text-base font-semibold leading-7 outline-none transition focus:border-[#34A853] focus:bg-white" /><div className="grid gap-3 sm:grid-cols-3">{options.map((option, index) => <input key={index} value={option} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Option ${index + 1}`} className="rounded-2xl border border-[#CEEAD6] bg-white px-4 py-3 text-[#202124] text-sm font-bold outline-none focus:border-[#34A853]" />)}</div></div>;
    }
    return <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1000))} maxLength={1000} placeholder={isStatus ? 'Write your daily text status...' : 'Write your daily creator post...'} className="min-h-[190px] w-full rounded-[1.75rem] border border-[#E0E3EB] bg-white px-5 py-4 text-[#202124] text-base font-semibold leading-7 outline-none transition focus:border-[#1A73E8] focus:bg-white" />;
  };

  const renderStatusPoll = (card: StatusCard) => card.pollOptions ? <div className="mt-4 space-y-2">{card.pollOptions.map((option, index) => { const votes = card.pollVotes || card.pollOptions!.map(() => 0); const total = Math.max(1, votes.reduce((sum, count) => sum + count, 0)); const percent = Math.round((votes[index] / total) * 100); const selectedOption = card.pollVoters?.[currentUserKey] ?? card.selectedPollOption; const selected = selectedOption === index; return <button key={option} type="button" onClick={() => voteOnStatusPoll(card.id, index)} className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left text-sm font-black shadow-inner transition sm:text-base ${selected ? 'border-white bg-white text-[#137333]' : 'border-white/30 bg-white/18 text-white hover:bg-white/25'}`}><span className="absolute inset-y-0 left-0 bg-white/30" style={{ width: selectedOption !== undefined ? `${percent}%` : '0%' }} /><span className="relative flex items-center justify-between gap-3"><span className="min-w-0 flex-1 truncate"><span className="mr-2 opacity-70">{index + 1}.</span>{option}</span>{selectedOption !== undefined ? <span className="shrink-0">{percent}% · {votes[index]}</span> : <span className="shrink-0">Vote</span>}</span></button>; })}</div> : null;

  const renderStatusReelContent = (card: StatusCard) => {
    const hasDetail = shouldShowStatusDetail(card);
    const title = card.title.length > 64 ? `${card.title.slice(0, 64)}...` : card.title;
    const preview = hasDetail ? `${card.body.slice(0, card.imagePreview ? 96 : 150)}...` : card.body;

    return <div className="min-h-0 flex-1 overflow-hidden"><div className="min-h-0 max-h-[62dvh] overflow-y-auto pr-1 custom-scrollbar">{card.imagePreview ? <div className={`mb-4 ${card.imageLayout === 'original' ? 'h-[min(34dvh,320px)] w-full' : 'mx-auto aspect-square w-full max-w-[320px]'} flex items-center justify-center overflow-hidden rounded-[2rem] bg-[#202124]/20 shadow-2xl`}>{renderUploadedImage(card.imagePreview, card.title, card.imageLayout || 'original')}</div> : null}<h2 className="line-clamp-3 text-2xl font-black tracking-tight sm:text-4xl">{title}</h2>{card.body ? <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-white/90 sm:text-base sm:leading-7">{preview}</p> : null}{hasDetail ? <button type="button" onClick={() => { setSelectedStatusId(card.id); pushPage('statusDetail'); }} className="mt-4 rounded-full border border-white/25 bg-white/18 px-4 py-2 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white/28">Learn more</button> : null}{renderStatusPoll(card)}</div></div>;
  };

  const renderStatusTile = (card: StatusCard) => (
    <button key={card.id} type="button" onClick={() => openStatusReel(card.id)} className="group relative aspect-[9/14] overflow-hidden rounded-[1.8rem] border border-white/80 bg-white p-3 text-left shadow-[0_18px_52px_rgba(15,23,42,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
      <div className={`absolute inset-2 rounded-[1.35rem] bg-gradient-to-br ${card.gradient} transition duration-500 group-hover:scale-[1.04]`} />
      <div className="absolute inset-2 rounded-[1.35rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.30),rgba(255,255,255,0.04)_38%,rgba(15,23,42,0.60))]" />
      <div className="relative flex h-full flex-col justify-between p-2 text-white">
        <span className="w-max rounded-full border border-white/70 bg-white px-3 py-1 text-[10px] font-black text-[#202124] shadow-sm backdrop-blur-xl">{card.slots}</span>
        <div>{card.imagePreview ? <div className="mb-5 aspect-square w-24 overflow-hidden rounded-2xl bg-white/18 shadow-inner">{renderUploadedImage(card.imagePreview, card.title, card.imageLayout || 'thumbnail')}</div> : null}<h3 className="line-clamp-2 text-xl font-black tracking-tight drop-shadow sm:text-2xl">{card.title}</h3><p className="mt-2 line-clamp-2 text-sm font-bold text-white/90 drop-shadow">{card.body}</p><p className="mt-3 w-max rounded-full border border-white/60 bg-white/85 px-3 py-1 text-[11px] font-black text-[#202124] shadow-sm backdrop-blur-xl">❤️ {card.likedBy} · 👁️ {card.views}</p></div>
      </div>
    </button>
  );

  const renderStatusReel = () => {
    const selectedIndex = Math.max(0, statusCards.findIndex((card) => card.id === selectedStatus.id));
    const reelStatuses = [...statusCards.slice(selectedIndex), ...statusCards.slice(0, selectedIndex)];

    return (
      <div className="fixed inset-0 z-[1500] bg-[#D3E3FD] text-white">
      <button type="button" onClick={goBack} className="fixed left-4 top-4 z-20 rounded-full border border-white/20 bg-[#202124]/20 px-4 py-2 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white/20">← Back</button>
      <div className="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth custom-scrollbar">
        {reelStatuses.map((card) => (
          <section key={card.id} className="relative flex h-[100dvh] snap-start items-center justify-center p-4" onMouseEnter={() => setSelectedStatusId(card.id)}>
            <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient}`} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.36),transparent_24%),linear-gradient(180deg,rgba(32,33,36,0.04),rgba(32,33,36,0.42))]" />
            <div className="relative grid w-full max-w-5xl items-center gap-5 md:grid-cols-[1fr_96px]">
              <article className="mx-auto flex min-h-[74dvh] w-full max-w-[520px] flex-col justify-between rounded-[2.5rem] border border-white/20 bg-[#202124]/18 p-6 shadow-[0_32px_120px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
                <div className="flex items-center justify-between gap-3"><span className="rounded-full border border-white/30 bg-white/18 px-4 py-2 text-xs font-black uppercase tracking-[0.22em]">{card.slots}</span><span className="text-sm font-black">{card.ownerId === 'me' ? 'Your status' : 'Community'}</span></div>
                {renderStatusReelContent(card)}
                <div className="flex items-center justify-between text-sm font-black text-white/80"><span>Swipe for next status</span><span>👁️ {card.views} views</span></div>
              </article>
              <div className="mx-auto flex flex-row justify-center gap-3 md:flex-col"><button type="button" onClick={() => toggleStatusLike(card.id)} className={`flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/20 ${(card.likedByUsers?.[currentUserKey] || likedStatuses.includes(card.id)) ? 'bg-[#FCE8E6] text-[#C5221F]' : 'bg-[#202124]/20 text-white'} shadow-2xl backdrop-blur-xl transition hover:scale-105`}><span>❤️</span><span className="text-[11px] font-black">{card.likedBy}</span></button><button type="button" onClick={() => setShareStatusId(card.id)} className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/20 bg-[#202124]/20 text-white shadow-2xl backdrop-blur-xl transition hover:scale-105"><span>↗️</span><span className="text-[11px] font-black">Share</span></button></div>
            </div>
          </section>
        ))}
      </div>
      {shareStatusId !== null ? <div className="fixed inset-0 z-30 flex items-end justify-center bg-[#1A73E8]/35 p-4 backdrop-blur-sm sm:items-center"><div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/20 bg-[#D3E3FD] text-[#202124] shadow-[0_28px_90px_rgba(0,0,0,0.35)]"><div className="bg-gradient-to-br from-[#E8F0FE] via-[#D3E3FD] to-[#C2E7FF] p-5 text-[#202124]"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-[#202124]/80">Send story</p><h3 className="mt-2 text-2xl font-black">Share with followers</h3></div><button type="button" onClick={() => setShareStatusId(null)} className="rounded-full bg-white/70 px-3 py-2 text-sm font-black text-[#202124]">✕</button></div><p className="mt-2 text-sm font-semibold text-[#202124]/75">Story chat abhi sirf shared stories dikhata hai — direct messages pending rakhe gaye hain.</p></div><div className="max-h-[55vh] space-y-2 overflow-y-auto p-3 custom-scrollbar">{allCreators.map((creator) => { const sent = sharedStories.some((story) => story.statusId === shareStatusId && story.recipientId === creator.id); return <button key={creator.id} type="button" onClick={() => shareStatusWithCreator(shareStatusId, creator.id)} className="flex w-full items-center gap-3 rounded-2xl border border-[#E0E3EB] bg-[#F8FAFD] p-3 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"><Avatar value={creator.avatar} size="h-11 w-11" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-[#202124]">{creator.name}</span><span className="block truncate text-xs font-bold text-[#5F6368]">@{creator.username}</span></span><span className={`rounded-full px-3 py-1 text-xs font-black ${sent ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#1A73E8] text-white'}`}>{sent ? 'Sent' : 'Send'}</span></button>; })}</div><button type="button" onClick={() => { setShareStatusId(null); pushPage('directChat'); }} className="m-3 mt-0 w-[calc(100%-1.5rem)] rounded-2xl bg-[#1A73E8] px-4 py-3 text-sm font-black text-white">Open Chat</button></div></div> : null}
      </div>
    );
  };

  const openChatCreator = (creatorId: string) => {
    setSelectedChatId(creatorId);
    if (window.matchMedia('(max-width: 1023px)').matches) pushPage('directChatThread');
  };

  const renderChatPage = () => {
    const sidebarCreators = chatCreators.length ? chatCreators : allCreators;

    return <div className="mx-auto grid h-[calc(100dvh-10.5rem)] max-w-[1800px] overflow-hidden rounded-[2.4rem] border border-[#E0E3EB] bg-white shadow-[0_26px_80px_rgba(15,23,42,0.10)] lg:grid-cols-[380px_1fr]"><aside className="flex h-full min-h-0 flex-col border-b border-[#E0E3EB] bg-gradient-to-b from-[#F8FAFD] to-white lg:border-b-0 lg:border-r"><div className="border-b border-[#E0E3EB] p-5"><p className="text-xs font-black uppercase tracking-[0.28em] text-[#1967D2]">Story inbox</p><h2 className="mt-2 text-3xl font-black tracking-tight">Chats</h2><p className="mt-2 text-sm font-bold leading-6 text-[#5F6368]">Abhi yahan sirf shared stories dikhengi. Direct text chat baad mein enable hoga.</p></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">{sidebarCreators.map((creator) => { const count = sharedStories.filter((story) => story.recipientId === creator.id).length; const active = activeChatCreator?.id === creator.id; return <button key={creator.id} type="button" onClick={() => openChatCreator(creator.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-[#C2E7FF] bg-[#E8F0FE] shadow-md text-[#202124]' : 'border-transparent bg-white hover:bg-[#E8F0FE] text-[#202124] hover:shadow-sm'}`}><Avatar value={creator.avatar} size="h-12 w-12" /><span className="min-w-0 flex-1"><span className="block truncate text-base font-black text-[#202124]">{creator.name}</span><span className="block truncate text-xs font-bold text-[#5F6368]">{count ? `${count} shared ${count === 1 ? 'story' : 'stories'}` : 'No shared story yet'}</span></span>{count ? <span className="rounded-full bg-[#1A73E8] px-2.5 py-1 text-xs font-black text-white">{count}</span> : null}</button>; })}</div></aside><section className="hidden min-h-0 flex-col bg-[radial-gradient(circle_at_18%_10%,rgba(14,165,233,0.10),transparent_28%),linear-gradient(180deg,#ffffff,#f8fafc)] lg:flex"><div className="flex items-center gap-3 border-b border-[#E0E3EB] bg-white/95 p-5 backdrop-blur-xl"><Avatar value={activeChatCreator?.avatar || '👤'} size="h-12 w-12" /><div className="min-w-0 flex-1"><h3 className="truncate text-2xl font-black text-[#202124]">{activeChatCreator?.name || 'Story chat'}</h3><p className="text-sm font-bold text-[#5F6368]">Stories shared with this follower appear here for both sides.</p></div><button type="button" onClick={() => { setActiveView('status'); setPage('chat'); }} className="rounded-2xl bg-[#1A73E8] px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5">Share more</button></div><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar sm:p-6">{activeChatStories.length ? activeChatStories.map((story) => { const status = statusCards.find((card) => card.id === story.statusId); if (!status) return null; return <div key={story.id} className="flex justify-end"><article className="max-w-[min(520px,92%)] overflow-hidden rounded-[2rem] rounded-br-md border border-[#E0E3EB] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.10)]"><div className={`bg-gradient-to-br ${status.gradient} p-5 text-white`}><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-white/85 px-3 py-1 text-xs font-black text-[#202124]">{status.slots}</span><span className="text-xs font-black text-[#202124]/80">{story.time}</span></div>{status.imagePreview ? <div className="my-8 aspect-square overflow-hidden rounded-[1.5rem] bg-[#202124]/20 shadow-inner">{renderUploadedImage(status.imagePreview, status.title, status.imageLayout || 'thumbnail')}</div> : null}<h4 className="mt-16 text-3xl font-black tracking-tight">{status.title}</h4><p className="mt-3 text-sm font-semibold leading-6 text-white/90">{status.body}</p></div><div className="flex items-center justify-between gap-3 p-4"><p className="text-xs font-bold text-[#5F6368]">Sent by {story.senderId === 'me' ? profile.name : story.senderName}</p><button type="button" onClick={() => openStatusReel(status.id)} className="rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-black text-white">Open story</button></div></article></div>; }) : <div className="flex h-full items-center justify-center text-center"><div className="max-w-md rounded-[2rem] border border-dashed border-[#D2E3FC] bg-white p-8 shadow-inner"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F0FE] text-3xl text-[#1A73E8]">↗️</div><h3 className="mt-4 text-2xl font-black">No story shared yet</h3><p className="mt-2 text-sm font-bold leading-6 text-[#5F6368]">Status reel mein Share dabao, follower select karo, phir story yahan chat mein dikhegi.</p></div></div>}</div><div className="border-t border-[#E0E3EB] bg-white/95 p-4 text-center text-xs font-black text-[#5F6368] backdrop-blur-xl">Text messages disabled · Stories only chat</div></section></div>;
  };

  const renderChatThreadPage = () => <div className="mx-auto flex h-[calc(100dvh-10.5rem)] max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-[#E0E3EB] bg-white shadow-[0_22px_70px_rgba(15,23,42,0.10)]"><div className="flex items-center gap-3 border-b border-[#E0E3EB] bg-white p-4"><button type="button" onClick={() => setPage('directChat')} className="rounded-2xl border border-[#E0E3EB] bg-white px-4 py-3 text-sm font-black text-[#5F6368]">← Back to Chat</button><Avatar value={activeChatCreator?.avatar || '👤'} size="h-11 w-11" /><div className="min-w-0"><h3 className="truncate text-xl font-black">{activeChatCreator?.name || 'Story chat'}</h3><p className="text-xs font-bold text-[#5F6368]">Shared stories only</p></div></div><div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white p-4 custom-scrollbar">{activeChatStories.length ? activeChatStories.map((story) => { const status = statusCards.find((card) => card.id === story.statusId); if (!status) return null; return <article key={story.id} className="overflow-hidden rounded-[2rem] border border-[#E0E3EB] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.08)]"><div className={`bg-gradient-to-br ${status.gradient} p-5 text-white`}><span className="rounded-full bg-white/85 px-3 py-1 text-xs font-black text-[#202124]">{status.slots}</span>{status.imagePreview ? <div className="my-8 aspect-square overflow-hidden rounded-[2rem] bg-[#202124]/20 shadow-inner">{renderUploadedImage(status.imagePreview, status.title, status.imageLayout || 'thumbnail')}</div> : null}<h4 className="mt-10 text-3xl font-black">{status.title}</h4><p className="mt-3 text-sm font-semibold leading-6 text-white/90">{status.body}</p></div><div className="flex items-center justify-between gap-3 p-4"><p className="text-xs font-bold text-[#5F6368]">{story.time}</p><button type="button" onClick={() => openStatusReel(status.id)} className="rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-black text-white">Open story</button></div></article>; }) : <div className="flex h-full items-center justify-center text-center"><div className="rounded-[2rem] border border-dashed border-[#D2E3FC] bg-white p-8"><h3 className="text-2xl font-black">No story shared yet</h3><p className="mt-2 text-sm font-bold text-[#5F6368]">Share a status to this follower first.</p></div></div>}</div><div className="border-t border-[#E0E3EB] p-3 text-center text-xs font-black text-[#5F6368]">Text messages disabled · Stories only chat</div></div>;

  const renderStatusDetailPage = () => <div className="mx-auto flex h-[calc(100dvh-10.5rem)] max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-[#E0E3EB] bg-white shadow-[0_22px_70px_rgba(15,23,42,0.10)]"><div className="flex items-center justify-between gap-3 border-b border-[#E0E3EB] bg-white p-4"><button type="button" onClick={() => setPage('statusReel')} className="rounded-2xl border border-[#E0E3EB] bg-white px-4 py-3 text-sm font-black text-[#5F6368]">← Back to story</button><span className="rounded-full bg-[#E8F0FE] px-3 py-1 text-xs font-black text-[#1967D2]">{selectedStatus.slots}</span></div><div className={`min-h-0 flex-1 overflow-y-auto bg-gradient-to-br ${selectedStatus.gradient} p-5 text-white custom-scrollbar sm:p-8`}><article className="mx-auto max-w-3xl rounded-[2rem] border border-white/20 bg-[#202124]/10 p-5 shadow-2xl backdrop-blur-xl sm:p-8">{selectedStatus.imagePreview ? <div className={`mb-6 ${selectedStatus.imageLayout === 'original' ? 'max-h-[54dvh] min-h-48' : 'aspect-square'} flex items-center justify-center overflow-hidden rounded-[2rem] bg-[#202124]/20 shadow-inner`}>{renderUploadedImage(selectedStatus.imagePreview, selectedStatus.title, selectedStatus.imageLayout || 'original')}</div> : null}<h2 className="text-4xl font-black tracking-tight sm:text-6xl">{selectedStatus.title}</h2><p className="mt-5 whitespace-pre-wrap text-lg font-semibold leading-9 text-white/90">{selectedStatus.body}</p>{renderStatusPoll(selectedStatus)}</article></div></div>;

  const filteredCreators = allCreators.filter((creator) => {
    const textMatches = `${creator.username} ${creator.name} ${creator.role}`.toLowerCase().includes(networkSearch.toLowerCase());
    const tabMatches = networkTab === 'mutual' ? creator.mutual : networkTab === 'following' ? followedIds.includes(creator.id) : true;
    return textMatches && tabMatches;
  });


  const NotificationDropdown = () => (
    <div ref={notificationDropdownRef} className="fixed right-[clamp(0.75rem,3vw,2.5rem)] top-[calc(env(safe-area-inset-top)+5.75rem)] z-[2147483647] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.75rem] border border-[#E3ECF8] bg-white/95 shadow-[0_28px_90px_rgba(8,27,92,0.22)] backdrop-blur-2xl isolate">
      <div className="flex items-center justify-between gap-3 border-b border-[#E3ECF8] bg-gradient-to-br from-[#EEF2FF] to-white p-4"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-[#4F7BFF]">Notifications</p><h2 className="text-lg font-black text-[#081B5C]">Community updates</h2></div><button type="button" onClick={markAllNotificationsRead} disabled={!unreadNotificationCount} className="rounded-full bg-white px-3 py-2 text-[11px] font-black text-[#4F46E5] shadow-sm disabled:opacity-45">Mark all as read</button></div>
      <div className="max-h-[min(54dvh,28rem)] overflow-y-auto p-2 custom-scrollbar">{notifications.length ? notifications.map((notification) => <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`flex w-full gap-3 rounded-[1.35rem] p-3 text-left transition hover:bg-[#F8FBFF] ${notification.read ? 'opacity-70' : 'bg-[#EEF2FF]'}`}><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.read ? 'bg-[#DADCE0]' : 'bg-[#4F7BFF]'}`} /><span className="min-w-0 flex-1"><span className="block text-sm font-black text-[#081B5C]">{notification.title}</span><span className="mt-1 line-clamp-2 block text-xs font-bold leading-5 text-[#64748B]">{notification.body}</span><span className="mt-2 block text-[11px] font-black uppercase tracking-[0.16em] text-[#4F7BFF]">{notification.time}</span></span></button>) : <div className="p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-2xl">🔕</div><p className="mt-3 text-sm font-black text-[#081B5C]">No notifications yet</p><p className="mt-1 text-xs font-bold text-[#64748B]">Replies, status interactions, and master tag updates will appear here.</p></div>}</div>
    </div>
  );

  const notificationDropdownPortal = isNotificationPanelOpen && typeof document !== 'undefined' ? createPortal(<NotificationDropdown />, document.body) : null;

  const navItems = [
    { label: 'Feed', icon: '📢', active: activeView === 'feed' && page === 'chat', action: () => switchView('feed') },
    { label: 'Status', icon: '⭕', active: activeView === 'status' && page === 'chat', action: () => { setActiveView('status'); setPage('chat'); setPageStack([]); setShowStatusActions((value) => !value); } },
    { label: 'Chat', icon: '💬', active: page === 'directChat' || page === 'directChatThread', action: () => pushPage('directChat') },
    { label: 'Creators', icon: '✍️', active: page === 'creators', action: () => pushPage('creators') },
    { label: 'Follow', icon: '🤝', active: page === 'network', action: () => pushPage('network') },
    { label: 'Following', icon: '👥', active: page === 'following', action: () => pushPage('following') },
    { label: 'Tag your master', icon: '🏷️', active: page === 'tagMaster', action: () => pushPage('tagMaster') },
    { label: 'Master Tags', icon: '📚', active: page === 'masterTags' || page === 'masterTagDetail', action: () => pushPage('masterTags') },
  ];

  const CommunityHeader = () => (
    <header className="flex h-[72px] min-w-0 shrink-0 items-center justify-between gap-3 border-b border-[#E3ECF8] bg-white/70 px-3 backdrop-blur-2xl sm:px-5 lg:h-[82px] lg:px-7">
      <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={goBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E3ECF8] bg-white text-xl font-black text-[#081B5C] shadow-[0_12px_30px_rgba(79,123,255,0.10)]">←</button><h1 className="truncate text-xl font-black tracking-tight text-[#081B5C] sm:text-3xl">EDUVORA BOND</h1></div>
      <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => pushPage('profile')} className="flex items-center gap-2 rounded-full border border-[#E3ECF8] bg-white px-2.5 py-2 text-xs font-black text-[#081B5C] shadow-sm sm:px-4"><Avatar value={profile.avatar} size="h-8 w-8" /><span className="hidden sm:inline">{profile.name}</span></button><span className="rounded-full border border-[#FFE8A8] bg-[#FFF7D7] px-3 py-2 text-xs font-black text-[#9A6400]">🪙 {eduCoins}</span><div ref={notificationPanelRef} className="relative"><button type="button" onClick={() => setIsNotificationPanelOpen((open) => !open)} aria-expanded={isNotificationPanelOpen} aria-label="Community notifications" className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E3ECF8] bg-white text-lg shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span>🔔</span>{unreadNotificationCount ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#FF3B5C] px-1.5 py-0.5 text-[10px] font-black leading-none text-white ring-2 ring-white">{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</span> : null}</button></div></div>
    </header>
  );

  const CommunitySidebar = () => (
    <aside className="hidden w-[clamp(12.5rem,16vw,15.5rem)] min-h-0 shrink-0 flex-col overflow-y-auto border-r border-[#E3ECF8] bg-white/58 p-3 custom-scrollbar lg:flex xl:p-4">
      <div className="mb-3 rounded-[1.6rem] bg-gradient-to-br from-[#6C4CF6] to-[#4F7BFF] p-3 xl:mb-5 xl:rounded-[2rem] xl:p-4 text-white shadow-[0_18px_42px_rgba(79,123,255,0.25)]"><p className="text-xs font-black uppercase tracking-[0.22em] text-white/75">Community</p><h2 className="mt-2 text-2xl font-black">Bond Hub</h2></div>
      <nav className="space-y-1.5 xl:space-y-2">{navItems.map((item) => <button key={item.label} type="button" onClick={item.action} className={`flex w-full items-center gap-2 rounded-[1.15rem] px-3 py-2.5 xl:gap-3 xl:rounded-[1.35rem] xl:px-4 xl:py-3 text-left text-sm font-black transition ${item.active ? 'bg-[#EEF2FF] text-[#4F46E5] shadow-[0_12px_34px_rgba(79,70,229,0.12)]' : 'text-[#64748B] hover:bg-white hover:text-[#081B5C]'}`}><span className={`flex h-9 w-9 items-center justify-center rounded-xl xl:h-10 xl:w-10 xl:rounded-2xl ${item.active ? 'bg-gradient-to-br from-[#6C4CF6] to-[#4F7BFF] text-white' : 'bg-[#F3F7FF]'}`}>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="mt-auto space-y-3 pt-3 xl:space-y-4"><div className="rounded-[1.6rem] bg-gradient-to-br from-[#081B5C] to-[#4F7BFF] p-3 xl:rounded-[2rem] xl:p-5 text-white shadow-[0_18px_48px_rgba(8,27,92,0.18)]"><p className="text-lg font-black">Go Premium</p><p className="mt-1 text-xs font-bold text-white/75">Unlock creator boosts and deep insights.</p><button type="button" className="mt-3 rounded-full bg-white px-3 py-2 xl:mt-4 xl:px-4 text-xs font-black text-[#4F46E5]">Upgrade Now</button></div><button type="button" onClick={() => pushPage('profile')} className="flex w-full items-center gap-3 rounded-[1.6rem] border border-[#E3ECF8] bg-white p-3 text-left"><Avatar value={profile.avatar} size="h-11 w-11" /><span className="min-w-0"><span className="block truncate text-sm font-black text-[#081B5C]">{profile.name}</span><span className="block truncate text-xs font-bold text-[#64748B]">@{profile.username}</span></span></button></div>
    </aside>
  );

  const CommunityBottomNav = () => <nav id="community-bottom-dock" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[1300] flex items-center gap-1 overflow-x-auto rounded-[1.65rem] border border-[#E3ECF8] bg-white/95 p-2 shadow-[0_18px_50px_rgba(79,123,255,0.18)] backdrop-blur-2xl custom-scrollbar lg:hidden">{navItems.map((item) => <button key={item.label} type="button" onClick={item.action} className={`min-w-[76px] rounded-[1.2rem] px-2 py-2 text-center transition ${item.active ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'text-[#64748B]'}`}><span className="block text-xl">{item.icon}</span><span className="text-[10px] font-black">{item.label}</span></button>)}</nav>;

  const ProfileHeroCard = () => <section className="overflow-hidden rounded-[2rem] border border-[#E3ECF8] bg-white shadow-[0_20px_60px_rgba(79,123,255,0.12)]"><div className="relative min-h-48 bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] p-6"><div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#6C4CF6]/18 blur-3xl" /><div className="absolute bottom-4 left-10 h-28 w-28 rounded-full bg-[#4F7BFF]/20 blur-2xl" /><div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left"><div className="relative"><Avatar value={profile.avatar} size="h-28 w-28" className="text-5xl ring-4 ring-white" /><label className="absolute bottom-1 right-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-[#6C4CF6] to-[#4F7BFF] text-white shadow-lg"><input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />📷</label></div><div className="min-w-0 flex-1"><h2 className="break-words text-4xl font-black text-[#081B5C]">{profile.name}</h2><p className="mt-1 text-sm font-black text-[#4F7BFF]">@{profile.username}</p><p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#64748B]">{profile.bio}</p><label className="mt-4 inline-flex cursor-pointer rounded-2xl border border-[#E3ECF8] bg-white px-4 py-3 text-sm font-black text-[#081B5C] shadow-sm"><input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />Stage new avatar</label></div></div></div></section>;

  const ProfileSummaryCard = () => {
    const items = [
      ['Coin Balance', String(profileStats.coinBalance)],
      ['Following', String(profileStats.following)],
      ['Creator Posts', String(profileStats.creatorPosts)],
      ['My Statuses', String(profileStats.myStatuses)],
      ['Master Tags', String(profileStats.masterTags)],
      ['Replies Given', String(profileStats.repliesGiven)],
      ['Sample Level', `Builder ${Math.max(1, Math.min(99, profileStats.creatorPosts + profileStats.myStatuses + 1)).toString().padStart(2, '0')}`],
    ];
    const accountButtons: Array<[ProfilePanel, string]> = [['privacy', 'Privacy Settings'], ['notifications', 'Notification Preferences'], ['connected', 'Connected Accounts'], ['logout', 'Log Out']];
    return <aside className="space-y-4"><div className="rounded-[2rem] border border-[#E3ECF8] bg-white p-5 shadow-[0_16px_48px_rgba(79,123,255,0.10)]"><h3 className="text-xl font-black text-[#081B5C]">Profile Summary</h3>{items.map(([k,v])=><div key={k} className="mt-3 flex justify-between gap-3 rounded-2xl bg-[#F8FBFF] px-4 py-3 text-sm"><span className="font-bold text-[#64748B]">{k}</span><span className="font-black text-[#081B5C]">{v}</span></div>)}</div><div className="rounded-[2rem] border border-[#E3ECF8] bg-[#EEF2FF] p-5"><h3 className="font-black text-[#081B5C]">Quick Tip</h3><p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">Keep your bio outcome-focused so creators know how to collaborate with you.</p></div><div className="rounded-[2rem] border border-[#E3ECF8] bg-white p-5"><h3 className="text-xl font-black text-[#081B5C]">Account</h3>{accountButtons.map(([panel, label])=><button key={panel} type="button" onClick={() => setActiveProfilePanel(panel)} className={`mt-2 flex w-full justify-between rounded-2xl px-4 py-3 text-sm font-black transition ${activeProfilePanel === panel ? 'bg-[#4F7BFF] text-white shadow-md' : 'bg-[#F8FBFF] text-[#081B5C] hover:bg-[#EEF2FF]'}`}>{label}<span>›</span></button>)}</div></aside>;
  };

  const ToggleRow = ({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) => <label className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[#E3ECF8] bg-[#F8FBFF] p-4"><span className="min-w-0"><span className="block text-sm font-black text-[#081B5C]">{label}</span><span className="mt-1 block text-xs font-bold leading-5 text-[#64748B]">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-[#4F7BFF]" /></label>;

  const ProfileSettingsPanel = () => <section className="rounded-[2rem] border border-[#E3ECF8] bg-white p-5 shadow-[0_18px_54px_rgba(79,123,255,0.10)]"><h3 className="text-2xl font-black text-[#081B5C]">Account Settings</h3>{activeProfilePanel === 'privacy' && <div className="mt-5 space-y-3"><ToggleRow label="Public profile" description="Allow your profile card to be visible inside the community." checked={privacySettings.profileVisible} onChange={(value) => setPrivacySettings((current) => ({ ...current, profileVisible: value }))} /><ToggleRow label="Show activity" description="Show your creator posts, replies, statuses, and master-tag activity in summaries." checked={privacySettings.showActivity} onChange={(value) => setPrivacySettings((current) => ({ ...current, showActivity: value }))} /><ToggleRow label="Allow messages" description="Let creators receive status shares and future direct-message requests from you." checked={privacySettings.allowMessages} onChange={(value) => setPrivacySettings((current) => ({ ...current, allowMessages: value }))} /><ToggleRow label="Allow follow requests" description="Keep your profile available for follow-request features when they launch." checked={privacySettings.allowFollowRequests} onChange={(value) => setPrivacySettings((current) => ({ ...current, allowFollowRequests: value }))} /></div>}{activeProfilePanel === 'notifications' && <div className="mt-5 space-y-3"><ToggleRow label="Replies" description="Show reply alerts in the bell dropdown." checked={notificationPreferences.replies} onChange={(value) => setNotificationPreferences((current) => ({ ...current, replies: value }))} /><ToggleRow label="Master-tag replies" description="Show admin/master responses to your tag requests." checked={notificationPreferences.masterTags} onChange={(value) => setNotificationPreferences((current) => ({ ...current, masterTags: value }))} /><ToggleRow label="Status interactions" description="Show likes and views for your statuses." checked={notificationPreferences.statuses} onChange={(value) => setNotificationPreferences((current) => ({ ...current, statuses: value }))} /><ToggleRow label="Creator posts" description="Show new post alerts from community creators." checked={notificationPreferences.creatorPosts} onChange={(value) => setNotificationPreferences((current) => ({ ...current, creatorPosts: value }))} /></div>}{activeProfilePanel === 'connected' && <div className="mt-5 space-y-3"><div className="rounded-2xl bg-[#F8FBFF] p-4 text-sm font-bold text-[#64748B]">Signed in email: <span className="font-black text-[#081B5C]">{authEmail || 'Local community session'}</span></div>{['Google', 'Email password', 'Social account'].map((account) => <button key={account} type="button" disabled className="flex w-full justify-between rounded-2xl border border-[#E3ECF8] bg-[#F8FBFF] px-4 py-3 text-sm font-black text-[#64748B] opacity-70"><span>{account}</span><span>Coming soon</span></button>)}</div>}{activeProfilePanel === 'logout' && <div className="mt-5 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] p-4"><p className="text-sm font-bold leading-6 text-[#5F6368]">Sign out of Firebase when available and return to the app auth flow. Local profile preferences remain saved for the next session.</p><button type="button" onClick={handleLogout} className="mt-4 w-full rounded-2xl bg-[#C5221F] px-5 py-3 font-black text-white">Log out and go to auth</button></div>}</section>;

  const ProfileAccountCard = () => <section className="rounded-[2rem] border border-[#E3ECF8] bg-white p-5 shadow-[0_18px_54px_rgba(79,123,255,0.10)]"><h3 className="text-2xl font-black text-[#081B5C]">Edit Profile</h3>{profileFeedback ? <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-black ${profileFeedback.type === 'success' ? 'border-[#CEEAD6] bg-[#E6F4EA] text-[#137333]' : 'border-[#FAD2CF] bg-[#FCE8E6] text-[#C5221F]'}`}>{profileFeedback.message}</div> : null}<div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2"><label className="min-w-0 text-sm font-black text-[#081B5C]">Display Name<input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-[#E3ECF8] px-4 py-3 font-bold outline-none focus:border-[#4F7BFF]" /></label><label className="min-w-0 text-sm font-black text-[#081B5C]">Username<input value={profileDraft.username} onChange={(event) => setProfileDraft((current) => ({ ...current, username: normalizeUsername(event.target.value) }))} className="mt-2 w-full rounded-2xl border border-[#E3ECF8] px-4 py-3 font-bold outline-none focus:border-[#4F7BFF]" /></label><label className="min-w-0 text-sm font-black text-[#081B5C] sm:col-span-2">Bio<textarea value={profileDraft.bio} maxLength={PROFILE_BIO_MAX_LENGTH} onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value.slice(0, PROFILE_BIO_MAX_LENGTH) }))} className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-[#E3ECF8] px-4 py-3 font-bold leading-7 outline-none focus:border-[#4F7BFF]" /><span className="mt-1 block text-right text-xs font-bold text-[#64748B]">{profileDraft.bio.length}/{PROFILE_BIO_MAX_LENGTH}</span></label></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={saveProfileChanges} className="flex-1 rounded-2xl bg-gradient-to-r from-[#6C4CF6] to-[#4F7BFF] px-5 py-4 font-black text-white shadow-[0_18px_44px_rgba(79,123,255,0.22)]">Save Changes</button><button type="button" onClick={resetProfileDraft} className="rounded-2xl border border-[#E3ECF8] bg-white px-5 py-4 font-black text-[#081B5C]">Cancel / Reset</button></div></section>;

  const renderProfilePage = () => <div className="mx-auto grid min-w-0 max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="min-w-0 space-y-5"><ProfileHeroCard /><ProfileAccountCard /><ProfileSettingsPanel /></div><div className="hidden min-w-0 lg:block"><ProfileSummaryCard /></div><div className="min-w-0 lg:hidden"><ProfileSummaryCard /></div></div>;

  const renderMainContent = () => (
    <div key={`${page}-${activeView}`} className="animate-in fade-in slide-in-from-bottom-3 duration-500">
      {page === 'chat' && activeView === 'feed' && renderFeedLayout(messages, 'Chat Feed', 'Fresh community prompts, replies, and streak ideas are shown here.')}
      {page === 'thread' && <div className="space-y-3"><button type="button" onClick={goBack} className="rounded-2xl border border-[#E3ECF8] bg-white px-4 py-3 text-sm font-black text-[#64748B] shadow-sm">← Back to posts</button>{renderMessageDetails(selectedMessage, true)}</div>}
      {page === 'profile' && renderProfilePage()}
      {page === 'creators' && <div className="mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-[#E3ECF8] bg-white shadow-[0_28px_90px_rgba(79,123,255,0.16)]"><div className="relative overflow-hidden bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] p-6 text-[#081B5C] sm:p-8"><p className="text-sm font-black uppercase tracking-[0.28em] text-[#4F7BFF]">Motivational rule</p><h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">One text, one image, one poll per day.</h2><p className="mt-4 max-w-2xl text-base font-semibold leading-8 text-[#64748B]">Each upload type can be used once per day. Creator posts go to the main chat feed and followers feed.</p></div><div className="bg-gradient-to-br from-[#F8FBFF] via-white to-[#EAF5FF] p-5 sm:p-7"><div className="mb-5">{renderTypeComposer(postType, setPostType)}</div>{renderUploadFields(postType, postDraft, setPostDraft)}<button type="button" onClick={submitCreatorPost} disabled={!postDraft.trim() || isCreatorTypeUsedToday || (postType === 'poll' && postPollOptions.filter((option) => option.trim()).length < 2)} className="mt-5 w-full rounded-[1.55rem] bg-gradient-to-r from-[#6C4CF6] to-[#4F7BFF] px-6 py-4 text-base font-black text-white shadow-[0_18px_44px_rgba(79,123,255,0.28)] disabled:opacity-45">{isCreatorTypeUsedToday ? 'This option already used today' : 'Publish creator post'}</button></div></div>}
      {page === 'network' && <div className="mx-auto max-w-5xl rounded-[2rem] bg-white p-4 shadow-[0_18px_54px_rgba(79,123,255,0.10)]"><div className="sticky top-0 z-10 bg-white pb-3"><h2 className="text-4xl font-black text-[#081B5C]">{profile.username}</h2><div className="mt-6 grid grid-cols-4 border-b border-[#E3ECF8] text-center text-sm font-black sm:text-lg">{(['mutual', 'followers', 'following', 'forYou'] as const).map((tab) => <button key={tab} type="button" onClick={() => setNetworkTab(tab)} className={`pb-3 capitalize ${networkTab === tab ? 'border-b-4 border-[#4F7BFF] text-[#4F46E5]' : 'text-[#64748B]'}`}>{tab === 'forYou' ? 'For you' : tab}</button>)}</div><input value={networkSearch} onChange={(event) => setNetworkSearch(event.target.value)} placeholder="Search creators..." className="mt-4 w-full rounded-2xl border border-[#E3ECF8] px-4 py-3 font-bold outline-none focus:border-[#4F7BFF]" /></div><div className="space-y-3 pt-3">{filteredCreators.map((creator) => { const followed = followedIds.includes(creator.id); return <article key={creator.id} className="flex items-center gap-3 rounded-3xl border border-[#E3ECF8] bg-white p-4 shadow-sm"><Avatar value={creator.avatar} /><div className="min-w-0 flex-1"><h3 className="truncate text-xl font-black text-[#081B5C]">{creator.name} {creator.verified ? '✅' : ''}</h3><p className="text-sm font-bold text-[#64748B]">@{creator.username} · {creator.role}</p><p className="text-sm font-black text-[#64748B]">{creator.followers.toLocaleString()} followers</p></div><button type="button" onClick={() => setFollowedIds((current) => followed ? current.filter((id) => id !== creator.id) : [...current, creator.id])} className={`rounded-full px-4 py-2 text-sm font-black transition ${followed ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'bg-[#4F7BFF] text-white'}`}>{followed ? 'Following' : 'Follow'}</button></article>; })}</div></div>}
      {page === 'following' && renderFeedLayout(followingMessages, 'Your followers feed', 'Only posts from creators you follow are shown here.')}
      {page === 'tagMaster' && renderTagMasterPage()}{page === 'masterTags' && renderMasterTagsPage()}{page === 'masterTagDetail' && renderMasterTagDetailPage()}
      {page === 'directChat' && renderChatPage()}{page === 'directChatThread' && renderChatThreadPage()}{page === 'statusDetail' && renderStatusDetailPage()}
      {page === 'chat' && activeView === 'status' && <div className="mx-auto max-w-[1800px] space-y-5 rounded-[2rem] bg-white/70 p-4"><div className="rounded-[1.8rem] border border-[#E3ECF8] bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] p-5 text-center text-[#081B5C] shadow-[0_22px_70px_rgba(79,123,255,0.16)]"><p className="text-lg font-black sm:text-2xl">1MB Limit &amp; 150 Slots Left</p><p className="mt-2 text-sm font-bold text-[#64748B]">Tap any status to open a scroll-snap reel.</p><div className="mt-4 flex justify-center gap-2"><button type="button" onClick={() => pushPage('statusUpload')} className="rounded-2xl bg-[#4F7BFF] px-4 py-3 text-xs font-black text-white">Upload your status</button><button type="button" onClick={() => pushPage('statusMine')} className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-[#081B5C]">View your status</button></div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{statusCards.map(renderStatusTile)}</div></div>}
      {page === 'statusUpload' && <div className="mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-[#E3ECF8] bg-white shadow-[0_30px_90px_rgba(79,123,255,0.16)]"><div className="bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] p-6 text-[#081B5C] sm:p-8"><p className="text-sm font-black uppercase tracking-[0.3em] text-[#4F7BFF]">Story studio</p><h2 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Upload your status</h2></div><div className="p-5 sm:p-7"><div className="mb-5">{renderTypeComposer(statusType, setStatusType, 'orange')}</div>{renderUploadFields(statusType, statusDraft, setStatusDraft, true)}<button type="button" onClick={submitStatus} disabled={isStatusTypeUsedToday || (statusType === 'image' && !statusImagePreview) || (statusType === 'poll' && statusPollOptions.filter((option) => option.trim()).length < 2)} className="mt-5 w-full rounded-[1.55rem] bg-gradient-to-r from-[#6C4CF6] to-[#4F7BFF] px-6 py-4 text-base font-black text-white disabled:opacity-45">{isStatusTypeUsedToday ? 'This status option already used today' : 'Publish status story'}</button></div></div>}
      {page === 'statusMine' && <div className="mx-auto max-w-6xl space-y-5"><div className="rounded-[2rem] border border-[#E3ECF8] bg-white p-6"><h2 className="text-4xl font-black tracking-tight text-[#081B5C]">View your status</h2></div>{myStatuses.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{myStatuses.map((status) => <article key={status.id} className="overflow-hidden rounded-[2rem] border border-[#E3ECF8] bg-white p-4"><div className={`rounded-[1.5rem] bg-gradient-to-br ${status.gradient} p-5 text-white`}><h3 className="line-clamp-3 text-2xl font-black">{status.title}</h3></div><button type="button" onClick={() => openStatusReel(status.id)} className="mt-4 w-full rounded-2xl bg-[#4F7BFF] px-4 py-3 text-sm font-black text-white">Open reel view</button></article>)}</div> : <div className="rounded-[2rem] border border-dashed border-[#E3ECF8] bg-white p-10 text-center font-black text-[#64748B]">No status uploaded yet.</div>}</div>}
    </div>
  );

  if (!isCommunityAllowed) {
    return <section className="flex h-[100dvh] items-center justify-center bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] px-4 text-[#081B5C]"><div className="max-w-md rounded-[2rem] border border-[#E3ECF8] bg-white p-6 text-center shadow-[0_24px_70px_rgba(79,123,255,0.14)]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-2xl">🔐</div><h2 className="mt-4 text-2xl font-black">Login required</h2><p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">Community is protected. Redirecting you to login...</p><button type="button" onClick={redirectToAuth} className="mt-5 rounded-2xl bg-[#4F7BFF] px-5 py-3 text-sm font-black text-white">Open login</button></div></section>;
  }

  return (
    <section className="relative h-[100dvh] overflow-hidden bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] p-0 text-[#081B5C] sm:p-4 lg:p-6">
      {notificationDropdownPortal}
      {imageLightbox ? <div className="fixed inset-0 z-[1800] flex items-center justify-center bg-[#081B5C]/80 p-4 backdrop-blur-xl"><button type="button" onClick={() => setImageLightbox(null)} className="absolute right-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-black text-[#081B5C]">Close</button><div className="flex max-h-[90dvh] max-w-[94vw] items-center justify-center overflow-hidden rounded-[2rem] bg-white p-3 shadow-2xl">{renderUploadedImage(imageLightbox.src, imageLightbox.alt, 'original')}</div></div> : null}
      {page === 'statusReel' ? renderStatusReel() : null}
      <div className="mx-auto flex h-full min-w-0 max-w-[1720px] overflow-hidden border border-[#E3ECF8] bg-white/55 shadow-[0_30px_100px_rgba(79,123,255,0.18)] backdrop-blur-2xl sm:rounded-[2rem] lg:rounded-[2.5rem]">
        <CommunitySidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <CommunityHeader />
          <main ref={scrollContainerRef} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-32 pt-4 custom-scrollbar sm:px-5 lg:px-7 lg:pb-7">
            {renderMainContent()}
          </main>
        </div>
      </div>
      {showStatusActions ? <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.3rem)] left-1/2 z-[1350] flex -translate-x-1/2 flex-col gap-2 lg:left-[310px] lg:translate-x-0"><button type="button" onClick={() => { setShowStatusActions(false); pushPage('statusUpload'); }} className="whitespace-nowrap rounded-2xl bg-[#4F7BFF] px-4 py-3 text-xs font-black text-white shadow-lg">⬆️ Upload your status</button><button type="button" onClick={() => { setShowStatusActions(false); pushPage('statusMine'); }} className="whitespace-nowrap rounded-2xl border border-[#E3ECF8] bg-white px-4 py-3 text-xs font-black text-[#081B5C] shadow-lg">👁️ View your status</button></div> : null}
      <CommunityBottomNav />
    </section>
  );
};

export default EduvoraCommunity;
