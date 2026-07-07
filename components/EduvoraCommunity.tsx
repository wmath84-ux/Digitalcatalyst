import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, deleteDoc, deleteField, doc, getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { db, storage } from '../firebase';
import { deleteObject, getDownloadURL, ref, uploadString } from 'firebase/storage';
import type { WebsiteSettings } from '../App';
import { mergeCommunitySupportTickets, isSupportTicketNeedsAttention } from '../utils/communitySupportBadge';
import CommunityAiMentor from './CommunityAiMentor';

interface EduvoraCommunityProps {
  onClose?: () => void;
  isAuthenticated?: boolean;
  settings?: WebsiteSettings;
}

type CommunityView = 'feed' | 'status';
type CommunityPage = 'chat' | 'adminPosts' | 'thread' | 'profile' | 'creators' | 'network' | 'following' | 'tagMaster' | 'masterTags' | 'masterTagDetail' | 'statusUpload' | 'statusMine' | 'statusReel' | 'directChat' | 'directChatThread' | 'statusDetail';
type PostType = 'text' | 'image' | 'poll';
type Reply = { id: number; author: string; text: string; time: string; avatar?: string; docId?: string; createdAt?: number; ownerId?: string; senderId?: string; clientMessageId?: string; status?: 'sending' | 'sent' | 'failed' | 'deleted' | 'hidden'; replyToMessageId?: string; replyToSenderName?: string; replyToTextPreview?: string; replyToType?: 'feed_message'; replyToDeleted?: boolean };
type FeedMessage = { id: number; admin: string; badge: string; avatar: string; title: string; body: string; time: string; reactions: string[]; replies: Reply[]; creatorId?: string; ownerId?: string; postType?: PostType; imagePreview?: string; imageLayout?: 'thumbnail' | 'original'; pollOptions?: string[]; pollVotes?: number[]; likeCount?: number; docId?: string; createdAt?: number; reactionCounts?: Record<string, number>; replyCount?: number; likedByUsers?: Record<string, boolean>; pollVoters?: Record<string, number>; reactionUsers?: Record<string, string>; storagePath?: string; uploadBytes?: number; expiresAt?: number; source?: 'creator' | 'admin' };
type Creator = {
  id: string;
  username: string;
  name: string;
  avatar: string;
  role: string;
  followers: number;
  mutual: boolean;
  verified?: boolean;
  ownerId?: string;
  followerCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
  isFollower?: boolean;
  isOnline?: boolean;
  source?: 'profile' | 'seed';
  bio?: string;
  subjects?: string[];
  masterTags?: string[];
  creatorCategory?: string;
  searchTokens?: string[];
  isCreator?: boolean;
  isPublic?: boolean;
  isSuspended?: boolean;
};
type StatusCard = { id: number; title: string; body: string; gradient: string; likedBy: number; views: number; slots: string; type: PostType; ownerId?: string; imagePreview?: string; imageLayout?: 'thumbnail' | 'original'; pollOptions?: string[]; pollVotes?: number[]; docId?: string; createdAt?: number; likedByUsers?: Record<string, boolean>; pollVoters?: Record<string, number>; storagePath?: string; uploadBytes?: number; expiresAt?: number; source?: 'status' };
type PrivateSharedItem = {
  sourceType: 'status' | 'feed_message';
  sourceId: string;
  sourceCollection: string;
  sourceOwnerId?: string;
  title: string;
  previewText: string;
  imageUrl?: string;
  imageLayout?: 'thumbnail' | 'original';
  storagePath?: string;
  originalCreatedAt?: number;
  originalExpiresAt?: number;
};

type ShareTarget =
  | { sourceType: 'status'; status: StatusCard }
  | { sourceType: 'feed_message'; message: FeedMessage };

type PrivateChatMessageType = 'text' | 'poll' | 'shared_item';

const normalizePrivateChatMessageType = (value: unknown): PrivateChatMessageType =>
  value === 'poll' || value === 'shared_item' ? value : 'text';

type PrivateChatPoll = {
  question: string;
  options: string[];
  votes: number[];
  voters: Record<string, number>;
  totalVotes: number;
};

type PrivateChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  receiverName: string;
  type: PrivateChatMessageType;
  text?: string;
  caption?: string;
  imageUrl?: string;
  storagePath?: string;
  archiveStoragePath?: string;
  uploadBytes?: number;
  poll?: PrivateChatPoll;
  sharedItem?: PrivateSharedItem;
  createdAt: number;
  expiresAt: number;
  readBy: Record<string, boolean>;
  status: 'sent' | 'failed';
};

type PrivateConversation = {
  id: string;
  participants: string[];
  participantMap: Record<string, boolean>;
  participantNames: Record<string, string>;
  participantAvatars: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  lastMessage: string;
  lastMessageType: PrivateChatMessageType;
  lastMessageAt: number;
  lastSenderId: string;
  unreadCounts: Record<string, number>;
  pinnedMessageId?: string;
};
type MasterTagRequest = { id: number; author: string; avatar: string; category: string; title: string; detail: string; time: string; likes: number; reactions: Record<string, number>; ownerId?: string; docId?: string; likedByUsers?: Record<string, boolean>; reactionUsers?: Record<string, string>; storagePath?: string; uploadBytes?: number; expiresAt?: number; source?: 'creator' | 'admin'; targetMasterId?: string; targetMasterName?: string; targetMasterAvatar?: string; targetMasterUsername?: string; targetMasterRole?: string; targetMasterSubject?: string; tagType?: string; visibility?: 'public' | 'followers' | 'private'; isExternalMaster?: boolean; normalizedSearchText?: string; searchTokens?: string[]; status?: 'active' | 'hidden' | 'reported' | 'deleted'; verifiedMaster?: boolean; createdAt?: number };
type CommunitySupportTicket = { id: string; customerName: string; customerEmail: string; subject: string; message: string; date: string; status: 'Open' | 'Resolved' | 'Pending'; customerUid?: string; source?: 'contact' | 'masterTag'; communityThreadId?: number; customerAvatar?: string; category?: string; adminReply?: string; repliedAt?: string; inboxMessage?: string; inboxRead?: boolean };
type CommunityNotification = { id: string; title: string; body: string; time: string; read: boolean; type: 'reply' | 'masterTag' | 'status' | 'creator' | 'follow'; targetPage?: CommunityPage; targetId?: number | string };
type CommunityProfile = { name: string; username: string; avatar: string; bio: string };
type ProfileFeedback = { type: 'success' | 'error'; message: string } | null;
type ProfilePanel = 'privacy' | 'notifications' | 'connected' | 'logout';
type PrivacySettings = { profileVisible: boolean; showActivity: boolean; allowMessages: boolean; allowFollowRequests: boolean };
type NotificationPreferences = { replies: boolean; masterTags: boolean; statuses: boolean; creatorPosts: boolean; follows: boolean };
type NotificationFilter = 'all' | CommunityNotification['type'];

const stripUndefinedDeep = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => stripUndefinedDeep(item)) as T;
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce((acc, [key, entry]) => {
      if (entry !== undefined) (acc as Record<string, unknown>)[key] = stripUndefinedDeep(entry);
      return acc;
    }, {} as Record<string, unknown>) as T;
  }
  return value;
};

const MASTER_TAG_STORAGE_KEY = 'eduvoraMasterTagRequests';
const SUPPORT_TICKETS_STORAGE_KEY = 'siteSupportTickets';
const SUPPORT_TICKETS_COLLECTION = 'siteSupportTickets';
const COMMUNITY_NOTIFICATION_READ_KEY = 'eduvoraCommunityNotificationReads';
const COMMUNITY_PROFILE_STORAGE_KEY = 'eduvoraCommunityProfile';
const COMMUNITY_PRIVACY_STORAGE_KEY = 'eduvoraCommunityPrivacySettings';
const COMMUNITY_NOTIFICATION_PREFS_KEY = 'eduvoraCommunityNotificationPreferences';
const COMMUNITY_CREATOR_QUOTA_KEY = 'eduvoraCommunityCreatorQuota';
const COMMUNITY_STATUS_QUOTA_KEY = 'eduvoraCommunityStatusQuota';
const COMMUNITY_DESKTOP_SIDEBAR_COLLAPSED_KEY = 'eduvoraCommunityDesktopSidebarCollapsed';
const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const DAILY_UPLOAD_LOCK_MS = 24 * 60 * 60 * 1000;
const PROFILE_BIO_MAX_LENGTH = 180;

const mergeSeedSupportTickets = (tickets: CommunitySupportTicket[]) => mergeCommunitySupportTickets(
  tickets,
  initialMasterTagRequests.map(buildMasterTagTicket)
);

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
const defaultNotificationPreferences: NotificationPreferences = { replies: true, masterTags: true, statuses: true, creatorPosts: true, follows: true };

const defaultCommunityStyle = {
  pageBackground: '#F8FBFF',
  surfaceColor: '#FFFFFF',
  cardColor: '#FFFFFF',
  softBackground: '#EEF6FF',
  primaryColor: '#1769FF',
  secondaryColor: '#7B61FF',
  accentColor: '#C2E7FF',
  headingColor: '#081A45',
  bodyColor: '#536178',
  mutedColor: '#7C879A',
  borderColor: '#D9E7F8',
  activeTabBackground: '#E8F2FF',
  activeTabText: '#1769FF',
  dockBackground: '#FFFFFF',
  dockItemBackground: '#F8FBFF',
  dockActiveBackground: '#E8F2FF',
  dockTextColor: '#536178',
  dockActiveTextColor: '#1769FF',
  outgoingBubble: '#1769FF',
  incomingBubble: '#FFFFFF',
  shadowOpacity: 16,
};

const toCommunityCssVars = (style: Partial<typeof defaultCommunityStyle> = {}): CSSProperties => {
  const merged = { ...defaultCommunityStyle, ...style };
  return {
    '--community-page-bg': merged.pageBackground,
    '--community-surface': merged.surfaceColor,
    '--community-card': merged.cardColor,
    '--community-soft': merged.softBackground,
    '--community-primary': merged.primaryColor,
    '--community-secondary': merged.secondaryColor,
    '--community-accent': merged.accentColor,
    '--community-heading': merged.headingColor,
    '--community-body': merged.bodyColor,
    '--community-muted': merged.mutedColor,
    '--community-border': merged.borderColor,
    '--community-active-bg': merged.activeTabBackground,
    '--community-active-text': merged.activeTabText,
    '--community-dock-bg': merged.dockBackground,
    '--community-dock-item-bg': merged.dockItemBackground,
    '--community-dock-active-bg': merged.dockActiveBackground,
    '--community-dock-text': merged.dockTextColor,
    '--community-dock-active-text': merged.dockActiveTextColor,
    '--community-outgoing-bubble': merged.outgoingBubble,
    '--community-incoming-bubble': merged.incomingBubble,
    '--community-shadow': `0 18px 54px rgba(23, 105, 255, ${Math.min(40, Math.max(0, Number(merged.shadowOpacity))) / 100})`,
  } as CSSProperties;
};

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

const masterTagCategories = ['Math', 'Physics', 'Chemistry', 'Biology', 'English', 'SST', 'Coding', 'Motivation', 'Exam Strategy', 'Life Skills', 'Other'] as const;
const masterTagTypes = ['Teacher', 'Creator', 'Mentor', 'Friend', 'Senior', 'Community Master'] as const;
const MASTER_TAG_MESSAGE_MIN = 20;
const MASTER_TAG_MESSAGE_MAX = 500;

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
const isTimestampFromToday = (value: unknown) => typeof value === 'number' && new Date(value).toISOString().slice(0, 10) === todayKey();
const STATUS_IMAGE_FALLBACK = '🖼️';
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const COMMUNITY_FEED = 'community_feed';
const COMMUNITY_STATUS = 'community_status';
const COMMUNITY_MASTER_TAGS = 'community_master_tags';
const COMMUNITY_UPLOAD_QUOTAS = 'community_upload_quotas';
const COMMUNITY_STORAGE_META = 'community_storage_meta';
const COMMUNITY_PROFILES = 'community_profiles';
const PUBLIC_PROFILES = 'publicProfiles';
const COMMUNITY_FOLLOWS = 'community_follows';
const COMMUNITY_NOTIFICATIONS = 'community_notifications';
const PRIVATE_CHATS = 'private_chats';
const PRIVATE_CHAT_MESSAGES = 'messages';
const PRIVATE_CHAT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const COMMUNITY_REPLY_MAX_LENGTH = 1000;
const COMMUNITY_REPLY_PREVIEW_LENGTH = 140;

const getPrivateConversationId = (firstUid: string, secondUid: string) => {
  const first = firstUid.trim();
  const second = secondUid.trim();
  return first < second ? `${first}__${second}` : `${second}__${first}`;
};

const getPrivateConversationParticipants = (firstUid: string, secondUid: string) =>
  Array.from(new Set([firstUid.trim(), secondUid.trim()].filter(Boolean))).sort();

const getPrivateParticipantMap = (participants: string[]) =>
  participants.reduce<Record<string, boolean>>((map, participantId) => ({ ...map, [participantId]: true }), {});
const getFollowDocId = (followerId: string, followingId: string) => `${followerId}_${followingId}`;
const compactCount = (value: unknown) => {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(count);
};

const normalizeSearchText = (value: unknown) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const buildSearchTokens = (...values: unknown[]) => {
  const tokens = new Set<string>();
  values.flatMap((value) => Array.isArray(value) ? value : [value]).forEach((value) => {
    const normalized = normalizeSearchText(value);
    if (!normalized) return;
    tokens.add(normalized);
    normalized.split(' ').filter((token) => token.length > 1).forEach((token) => {
      tokens.add(token);
      for (let size = 3; size <= Math.min(token.length, 12); size += 1) tokens.add(token.slice(0, size));
    });
  });
  return Array.from(tokens).slice(0, 80);
};

const getCreatorSearchHaystack = (creator: Creator) => normalizeSearchText([
  creator.name,
  creator.username,
  creator.role,
  (creator as any).bio,
  ...(((creator as any).subjects || []) as string[]),
  ...(((creator as any).masterTags || []) as string[]),
  (creator as any).creatorCategory,
  ...(((creator as any).searchTokens || []) as string[]),
].filter(Boolean).join(' '));

const scoreCreatorSearch = (creator: Creator, rawQuery: string) => {
  const query = normalizeSearchText(rawQuery);
  if (!query) return (creator.verified ? 50 : 0) + (creator.followerCount || creator.followers || 0) / 1000;
  const username = normalizeSearchText(creator.username);
  const name = normalizeSearchText(creator.name);
  const role = normalizeSearchText(creator.role);
  const bio = normalizeSearchText((creator as any).bio);
  const subjects = normalizeSearchText(((creator as any).subjects || []).join(' '));
  const masterTags = normalizeSearchText(((creator as any).masterTags || []).join(' '));
  const category = normalizeSearchText((creator as any).creatorCategory);
  const haystack = getCreatorSearchHaystack(creator);
  let score = 0;
  if (username === query || username === query.replace(/^@/, '')) score += 1000;
  if (name.startsWith(query)) score += 820;
  if (name.includes(query)) score += 700;
  if (username.includes(query)) score += 680;
  if (masterTags.includes(query) || subjects.includes(query)) score += 560;
  if (role.includes(query) || category.includes(query)) score += 420;
  if (bio.includes(query) || haystack.includes(query)) score += 260;
  query.split(' ').forEach((part) => { if (part && haystack.includes(part)) score += 45; });
  if (creator.verified) score += 30;
  if ((creator as any).isCreator) score += 20;
  score += Math.min(50, (creator.followerCount || creator.followers || 0) / 100);
  return score;
};
const ADMIN_POST_FALLBACK_STORAGE_KEY = 'eduvoraAdminPostFallbacks';
const ADMIN_POST_FALLBACK_EVENT = 'eduvoraAdminPostFallbackUpdated';
const POST_TTL_MS = 15 * 24 * 60 * 60 * 1000;
const STORAGE_LOCK_BYTES = 4 * 1024 * 1024 * 1024;
const STORAGE_TOTAL_BYTES = 5 * 1024 * 1024 * 1024;
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


const normalizeFeedMessage = (message: FeedMessage): FeedMessage => ({
  ...message,
  reactions: Array.isArray(message.reactions) ? message.reactions : [],
  replies: Array.isArray(message.replies) ? message.replies : [],
  reactionCounts: message.reactionCounts && typeof message.reactionCounts === 'object' ? message.reactionCounts : {},
  likeCount: Number(message.likeCount) || 0,
  replyCount: Number(message.replyCount) || (Array.isArray(message.replies) ? message.replies.length : 0),
  pollOptions: Array.isArray(message.pollOptions) ? message.pollOptions : undefined,
  pollVotes: Array.isArray(message.pollVotes) ? message.pollVotes : (Array.isArray(message.pollOptions) ? message.pollOptions.map(() => 0) : undefined),
  imagePreview: message.imagePreview || undefined,
  createdAt: message.createdAt || Date.now(),
  expiresAt: message.expiresAt || Date.now() + POST_TTL_MS,
  source: message.source || 'creator',
});

const isUnexpired = (item: { expiresAt?: number; createdAt?: number }, ttlMs: number) => {
  const expiresAt = item.expiresAt || ((item.createdAt || Date.now()) + ttlMs);
  return expiresAt > Date.now();
};

const isWithinRollingUploadLock = (timestamp: number) => {
  return Number.isFinite(timestamp) && Date.now() - timestamp < DAILY_UPLOAD_LOCK_MS;
};

const mergeUnexpiredByIdentity = <T extends { id: number; docId?: string; createdAt?: number; expiresAt?: number }>(remoteItems: T[], currentItems: T[], seedItems: T[], ttlMs: number): T[] => {
  const merged = new Map<string, T>();
  const put = (item: T) => {
    if (!isUnexpired(item, ttlMs)) return;
    const idKey = `id:${item.id}`;
    const hasSyncedVersion = Array.from(merged.values()).some((existing) => existing.id === item.id && existing.docId);
    if (!item.docId && hasSyncedVersion) return;
    const key = item.docId ? `doc:${item.docId}` : idKey;
    if (item.docId) merged.delete(idKey);
    merged.set(key, { ...merged.get(key), ...item });
  };
  seedItems.forEach(put);
  currentItems.forEach(put);
  remoteItems.forEach(put);
  return Array.from(merged.values()).sort((a, b) => (b.createdAt || b.id) - (a.createdAt || a.id));
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
    storagePath: data.storagePath,
    uploadBytes: Number(data.uploadBytes) || 0,
    expiresAt: asMillis(data.expiresAt),
    source: data.source || 'creator',
    pollOptions: Array.isArray(data.pollOptions) ? data.pollOptions : undefined,
    pollVotes: Array.isArray(data.pollVotes) ? data.pollVotes : undefined,
    reactions: Array.isArray(data.reactions) ? data.reactions : [],
    reactionCounts: data.reactionCounts || data.reactions || {},
    likeCount: Number(data.likeCount) || 0,
    likedByUsers: data.likedByUsers || {},
    pollVoters: data.pollVoters || {},
    reactionUsers: data.reactionUsers || {},
    replyCount: Number(data.replyCount) || (Array.isArray(data.replies) ? data.replies.length : 0),
    replies: Array.isArray(data.replies) ? data.replies : [],
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
    category: (masterTagCategories as readonly string[]).includes(data.category) ? data.category : 'Other',
    title: data.title || data.targetMasterName || data.externalMasterName || 'A respected master',
    detail: data.detail || data.message || data.body || '',
    time: data.time || formatCommunityTime(data.createdAt),
    likes: resolveAccountBackedCount(data.likes, data.likedByUsers),
    reactions: resolveAccountBackedReactions(data.reactions, data.reactionUsers),
    ownerId: data.ownerId,
    likedByUsers: data.likedByUsers || {},
    reactionUsers: data.reactionUsers || {},
    targetMasterId: data.targetMasterId || '',
    targetMasterName: data.targetMasterName || data.externalMasterName || data.title || '',
    targetMasterAvatar: data.targetMasterAvatar || '',
    targetMasterUsername: data.targetMasterUsername || '',
    targetMasterRole: data.targetMasterRole || '',
    targetMasterSubject: data.subject || data.targetMasterSubject || data.category || '',
    tagType: data.tagType || 'Community Master',
    visibility: data.visibility || 'public',
    isExternalMaster: Boolean(data.isExternalMaster),
    status: data.status || 'active',
    verifiedMaster: Boolean(data.verifiedMaster),
    normalizedSearchText: data.normalizedSearchText || '',
    searchTokens: Array.isArray(data.searchTokens) ? data.searchTokens : [],
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
    likedByUsers: data.likedByUsers || {},
    pollVoters: data.pollVoters || {},
    createdAt: asMillis(data.createdAt),
    storagePath: data.storagePath,
    uploadBytes: Number(data.uploadBytes) || 0,
    expiresAt: asMillis(data.expiresAt),
    source: data.source || 'status',
  };
};

const mapPrivateConversationDoc = (snapshotDoc: { id: string; data: () => Record<string, any> }): PrivateConversation => {
  const data = snapshotDoc.data();
  return {
    id: snapshotDoc.id,
    participants: Array.isArray(data.participants) ? data.participants : [],
    participantMap: data.participantMap || {},
    participantNames: data.participantNames || {},
    participantAvatars: data.participantAvatars || {},
    createdAt: asMillis(data.createdAt),
    updatedAt: asMillis(data.updatedAt),
    lastMessage: data.lastMessage || '',
    lastMessageType: normalizePrivateChatMessageType(data.lastMessageType),
    lastMessageAt: asMillis(data.lastMessageAt || data.updatedAt),
    lastSenderId: data.lastSenderId || '',
    unreadCounts: data.unreadCounts || {},
    pinnedMessageId: data.pinnedMessageId,
  };
};

const mapPrivateChatMessageDoc = (snapshotDoc: { id: string; data: () => Record<string, any> }): PrivateChatMessage => {
  const data = snapshotDoc.data();
  return {
    id: snapshotDoc.id,
    conversationId: data.conversationId || '',
    senderId: data.senderId || '',
    receiverId: data.receiverId || '',
    senderName: data.senderName || 'Member',
    receiverName: data.receiverName || 'Member',
    type: normalizePrivateChatMessageType(data.type),
    text: data.text || '',
    caption: data.caption || '',
    imageUrl: data.imageUrl || '',
    storagePath: data.storagePath || '',
    archiveStoragePath: data.archiveStoragePath || '',
    uploadBytes: Number(data.uploadBytes) || 0,
    poll: data.poll,
    sharedItem: data.sharedItem && typeof data.sharedItem === 'object' ? data.sharedItem as PrivateSharedItem : undefined,
    createdAt: asMillis(data.createdAt),
    expiresAt: asMillis(data.expiresAt),
    readBy: data.readBy || {},
    status: data.status || 'sent',
  };
};

const dataUrlBytes = (value = '') => {
  const base64 = value.split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
};

const storagePercent = (bytes: number) => Math.min(100, Math.round((bytes / STORAGE_LOCK_BYTES) * 100));
const safeText = (value: string, maxLength = 240) => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);

const communityPolishCss = `
  .eduvora-community-polish {
    background:
      radial-gradient(circle at top left, rgba(23,105,255,0.14), transparent 30rem),
      radial-gradient(circle at 86% 8%, rgba(123,97,255,0.12), transparent 28rem),
      linear-gradient(135deg, #F8FBFF 0%, #EEF6FF 48%, #F8FBFF 100%);
  }
  .eduvora-community-app {
    position: relative;
    isolation: isolate;
  }
  .eduvora-community-app::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(255,255,255,0.78), rgba(255,255,255,0.18) 42%, rgba(23,105,255,0.08));
    opacity: 0.82;
    z-index: -1;
  }
  .eduvora-community-main {
    background:
      radial-gradient(circle at 50% 0%, rgba(23,105,255,0.08), transparent 32rem),
      linear-gradient(180deg, rgba(248,251,255,0.88), rgba(248,251,255,0.98));
  }
  .community-content-stage > * {
    scroll-margin-top: 7rem;
  }
  .eduvora-community-polish :is(button, a, input, textarea, select):focus-visible {
    outline: 3px solid rgba(23,105,255,0.22);
    outline-offset: 3px;
  }
  .eduvora-community-polish :is(input, textarea, select)::placeholder {
    color: #7C879A;
  }
  .eduvora-community-polish button:disabled {
    box-shadow: none !important;
  }
  @media (max-width: 767px) {
    .eduvora-community-app {
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    .eduvora-community-main {
      padding-left: clamp(0.875rem, 4vw, 1rem) !important;
      padding-right: clamp(0.875rem, 4vw, 1rem) !important;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .eduvora-community-polish *, .eduvora-community-polish *::before, .eduvora-community-polish *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }
  }
`;

const EduvoraCommunity: React.FC<EduvoraCommunityProps> = ({ onClose, isAuthenticated = false, settings }) => {
  const navigate = useNavigate();
  const guardedAuth = getAuth();
  const [isCommunityAllowed, setIsCommunityAllowed] = useState(false);
  const [activeView, setActiveView] = useState<CommunityView>('feed');
  const [page, setPage] = useState<CommunityPage>('chat');
  const [pageStack, setPageStack] = useState<CommunityPage[]>([]);
  const pageRef = useRef<CommunityPage>('chat');
  const activeViewRef = useRef<CommunityView>('feed');
  const pageStackRef = useRef<CommunityPage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState(initialMessages[0].id);
  const [selectedStatusId, setSelectedStatusId] = useState(initialStatusCards[0].id);
  const [messages, setMessages] = useState<FeedMessage[]>(initialMessages);
  const [statusCards, setStatusCards] = useState<StatusCard[]>(initialStatusCards);
  const [likedStatuses, setLikedStatuses] = useState<number[]>([]);
  const [likedMessages, setLikedMessages] = useState<number[]>([]);
  const [viewedStatusIds, setViewedStatusIds] = useState<number[]>([]);
  const [imageLightbox, setImageLightbox] = useState<{ src: string; alt: string; mode: 'thumbnail' | 'original' } | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [shareRecipientSearch, setShareRecipientSearch] = useState('');
  const [shareCaption, setShareCaption] = useState('');
  const [shareSendingId, setShareSendingId] = useState('');
  const [shareFeedback, setShareFeedback] = useState('');
  const [selectedChatId, setSelectedChatId] = useState(creators[0].id);
  const [privateConversations, setPrivateConversations] = useState<PrivateConversation[]>([]);
  const [privateMessages, setPrivateMessages] = useState<PrivateChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatPollQuestion, setChatPollQuestion] = useState('');
  const [chatPollOptions, setChatPollOptions] = useState(['', '']);
  const [chatAttachmentMode, setChatAttachmentMode] = useState<PrivateChatMessageType | null>(null);
  const [pendingPrivateChatSends, setPendingPrivateChatSends] = useState(0);
  const isPrivateChatSending = pendingPrivateChatSends > 0;
  const [privateChatError, setPrivateChatError] = useState('');
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(COMMUNITY_DESKTOP_SIDEBAR_COLLAPSED_KEY) === 'true';
  });
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [expandedReplyId, setExpandedReplyId] = useState<number | null>(null);
  const [replySendingIds, setReplySendingIds] = useState<Record<number, boolean>>({});
  const [highlightedThreadId, setHighlightedThreadId] = useState<number | null>(null);
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
  const [isPublishingCreator, setIsPublishingCreator] = useState(false);
  const [isPublishingStatus, setIsPublishingStatus] = useState(false);
  const [creatorQuota, setCreatorQuota] = useState<Record<string, string[]>>(() => readJsonObject<Record<string, string[]>>(COMMUNITY_CREATOR_QUOTA_KEY, { [todayKey()]: [] }));
  const [statusQuota, setStatusQuota] = useState<Record<string, string[]>>(() => readJsonObject<Record<string, string[]>>(COMMUNITY_STATUS_QUOTA_KEY, { [todayKey()]: [] }));
  const [communityProfiles, setCommunityProfiles] = useState<Creator[]>([]);
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [followerIds, setFollowerIds] = useState<string[]>([]);
  const [followedByCreatorIds, setFollowedByCreatorIds] = useState<Record<string, boolean>>({});
  const [followerByCreatorIds, setFollowerByCreatorIds] = useState<Record<string, boolean>>({});
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});
  const [followingCounts, setFollowingCounts] = useState<Record<string, number>>({});
  const [followLoadingIds, setFollowLoadingIds] = useState<Record<string, boolean>>({});
  const [networkTab, setNetworkTab] = useState<'all' | 'creators' | 'teachers' | 'students' | 'masters' | 'verified' | 'mutual' | 'followers' | 'following' | 'forYou'>('all');
  const [networkSearch, setNetworkSearch] = useState('');
  const [debouncedNetworkSearch, setDebouncedNetworkSearch] = useState('');
  const [masterTagRequests, setMasterTagRequests] = useState<MasterTagRequest[]>(() => readJsonArray(MASTER_TAG_STORAGE_KEY, initialMasterTagRequests));
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedNetworkSearch(networkSearch), 300);
    return () => window.clearTimeout(timer);
  }, [networkSearch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(COMMUNITY_DESKTOP_SIDEBAR_COLLAPSED_KEY, String(isDesktopSidebarCollapsed));
  }, [isDesktopSidebarCollapsed]);

  const [supportTickets, setSupportTickets] = useState<CommunitySupportTicket[]>(() => {
    const mergedTickets = mergeSeedSupportTickets(readJsonArray<CommunitySupportTicket>(SUPPORT_TICKETS_STORAGE_KEY, []));
    if (typeof window !== 'undefined') localStorage.setItem(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify(mergedTickets));
    return mergedTickets;
  });
  const [masterTagTitle, setMasterTagTitle] = useState('');
  const [masterTagDetail, setMasterTagDetail] = useState('');
  const [masterTagCategory, setMasterTagCategory] = useState<(typeof masterTagCategories)[number]>('Motivation');
  const [masterTagFilter, setMasterTagFilter] = useState<'All' | (typeof masterTagCategories)[number]>('All');
  const [masterTagsAudienceFilter, setMasterTagsAudienceFilter] = useState<'all' | 'mine' | 'following' | 'verified'>('all');
  const [masterTagSearch, setMasterTagSearch] = useState('');
  const [masterTagSort, setMasterTagSort] = useState<'recent' | 'appreciated' | 'trending'>('recent');
  const [masterSearch, setMasterSearch] = useState('');
  const [selectedMaster, setSelectedMaster] = useState<Creator | null>(null);
  const [masterTagType, setMasterTagType] = useState<(typeof masterTagTypes)[number]>('Teacher');
  const [isSubmittingMasterTag, setIsSubmittingMasterTag] = useState(false);
  const [masterTagSuccess, setMasterTagSuccess] = useState<MasterTagRequest | null>(null);
  const [selectedMasterTagId, setSelectedMasterTagId] = useState(initialMasterTagRequests[0].id);
  const [isMasterTagDetailOpen, setIsMasterTagDetailOpen] = useState(false);
  const [masterTagDetailFeedback, setMasterTagDetailFeedback] = useState('');
  const masterTagDetailPanelRef = useRef<HTMLDivElement>(null);
  const masterTagViewReturnRef = useRef<HTMLButtonElement | null>(null);
  const [likedMasterTagIds, setLikedMasterTagIds] = useState<number[]>([]);
  const [profile, setProfile] = useState<CommunityProfile>(() => readJsonObject(COMMUNITY_PROFILE_STORAGE_KEY, defaultCommunityProfile));
  const [profileDraft, setProfileDraft] = useState<CommunityProfile>(() => readJsonObject(COMMUNITY_PROFILE_STORAGE_KEY, defaultCommunityProfile));
  const [profileFeedback, setProfileFeedback] = useState<ProfileFeedback>(null);
  const [composerError, setComposerError] = useState('');
  const [activeProfilePanel, setActiveProfilePanel] = useState<ProfilePanel>('privacy');
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(() => readJsonObject(COMMUNITY_PRIVACY_STORAGE_KEY, defaultPrivacySettings));
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(() => readJsonObject(COMMUNITY_NOTIFICATION_PREFS_KEY, defaultNotificationPreferences));
  const [showStatusActions, setShowStatusActions] = useState(false);
  const [notificationReads, setNotificationReads] = useState<Record<string, boolean>>(() => readJsonArray<string>(COMMUNITY_NOTIFICATION_READ_KEY, []).reduce<Record<string, boolean>>((reads, id) => ({ ...reads, [id]: true }), {}));
  const [firebaseNotifications, setFirebaseNotifications] = useState<CommunityNotification[]>([]);
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('all');
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [isCommunityAiOpen, setIsCommunityAiOpen] = useState(false);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [limitMessage, setLimitMessage] = useState('');
  const [adminPosts, setAdminPosts] = useState<FeedMessage[]>([]);
  const [authEmail, setAuthEmail] = useState<string | null>(() => guardedAuth.currentUser?.email || null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const feedScrollPositionsRef = useRef<Record<string, number>>({});
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const replyComposerRef = useRef<HTMLDivElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);
  const directChatMessagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserKey = guardedAuth.currentUser?.uid || authEmail || `profile-${normalizeUsername(profile.username || profile.name) || 'local'}`;
  const isOwnCommunityId = (id?: string) => id === currentUserKey || id === 'me';
  const selectedMessage = messages.find((message) => message.id === selectedMessageId) || messages[0];
  const selectedStatus = statusCards.find((status) => status.id === selectedStatusId) || statusCards[0];
  const currentProfileCreator = useMemo<Creator>(() => ({
    id: currentUserKey,
    ownerId: currentUserKey,
    username: normalizeUsername(profile.username) || 'eduvora_member',
    name: profile.name || 'Eduvora Member',
    avatar: profile.avatar || '🧑‍🎓',
    role: 'Community member',
    followers: followerIds.length,
    followerCount: followerIds.length,
    followingCount: followedIds.length,
    mutual: false,
    verified: false,
    source: 'profile',
  }), [currentUserKey, followedIds.length, followerIds.length, profile.avatar, profile.name, profile.username]);

  const allCreators = useMemo(() => {
    const merged = new Map<string, Creator>();

    communityProfiles.forEach((creator) => {
      if (!creator.id) return;
      merged.set(creator.id, {
        ...creator,
        followers: followerCounts[creator.id] || creator.followers || 0,
        followerCount: followerCounts[creator.id] || 0,
        followingCount: followingCounts[creator.id] || 0,
        mutual: Boolean(followedByCreatorIds[creator.id] && followerByCreatorIds[creator.id]),
        isFollowing: Boolean(followedByCreatorIds[creator.id]),
        isFollower: Boolean(followerByCreatorIds[creator.id]),
        source: 'profile',
      });
    });

    if (currentUserKey) {
      merged.set(currentUserKey, currentProfileCreator);
    }

    return Array.from(merged.values()).sort((a, b) => {
      if (Boolean(b.verified) !== Boolean(a.verified)) return Number(Boolean(b.verified)) - Number(Boolean(a.verified));
      return a.name.localeCompare(b.name);
    });
  }, [communityProfiles, currentProfileCreator, currentUserKey, followedByCreatorIds, followerByCreatorIds, followerCounts, followingCounts]);

  const followingMessages = messages.filter((message) => message.creatorId && (followedByCreatorIds[message.creatorId] || isOwnCommunityId(message.creatorId)));
  const usedCreatorTypesToday = creatorQuota[todayKey()] || [];
  const usedStatusTypesToday = statusQuota[todayKey()] || [];
  const isStorageLocked = storageUsedBytes >= STORAGE_LOCK_BYTES;
  const statusAvailableSlots = Math.max(0, Math.floor((STORAGE_LOCK_BYTES - storageUsedBytes) / MAX_STATUS_FILE_BYTES));
  const isCreatorTypeUsedToday = usedCreatorTypesToday.includes(postType);
  const isStatusTypeUsedToday = usedStatusTypesToday.includes(statusType);
  const myStatuses = statusCards.filter((status) => isOwnCommunityId(status.ownerId));
  const chatCreators = allCreators.length ? allCreators : [currentProfileCreator];
  const activeChatCreator = allCreators.find((creator) => creator.id === selectedChatId) || chatCreators[0];
  const activeConversationId = activeChatCreator ? getPrivateConversationId(currentUserKey, activeChatCreator.id) : '';
  const activeConversation = privateConversations.find((conversation) => conversation.id === activeConversationId);
  const activePrivateMessages = privateMessages
    .filter((message) => message.conversationId === activeConversationId && message.expiresAt > Date.now())
    .sort((a, b) => a.createdAt - b.createdAt);
  const activePinnedMessage = activeConversation?.pinnedMessageId
    ? activePrivateMessages.find((message) => message.id === activeConversation.pinnedMessageId)
    : undefined;
  const shouldShowStatusDetail = (card: StatusCard) => card.body.length > 140 || Boolean(card.imagePreview && card.body.trim().length > 0);
  const profileStats = useMemo(() => ({
    coinBalance: eduCoins,
    followers: followerIds.length,
    following: followedIds.length,
    creatorPosts: messages.filter((message) => isOwnCommunityId(message.creatorId)).length,
    myStatuses: myStatuses.length,
    masterTags: masterTagRequests.filter((request) => isOwnCommunityId(request.ownerId) || request.author === profile.name).length,
    repliesGiven: messages.reduce((count, message) => count + message.replies.filter((reply) => isOwnCommunityId(reply.ownerId) || reply.author === profile.name).length, 0),
  }), [eduCoins, followedIds.length, followerIds.length, masterTagRequests, messages, myStatuses.length, profile.name]);

  const visibleForYouCreators = useMemo(() => {
    return allCreators
      .sort((a, b) => {
        const aSelf = isOwnCommunityId(a.id) ? 1 : 0;
        const bSelf = isOwnCommunityId(b.id) ? 1 : 0;
        if (aSelf !== bSelf) return bSelf - aSelf;

        const aFollowing = followedByCreatorIds[a.id] ? 1 : 0;
        const bFollowing = followedByCreatorIds[b.id] ? 1 : 0;
        if (aFollowing !== bFollowing) return aFollowing - bFollowing;

        return a.name.localeCompare(b.name);
      });
  }, [allCreators, followedByCreatorIds, currentUserKey]);

  const notificationTypeLabels: Array<{ value: NotificationFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'follow', label: 'Follow' },
    { value: 'reply', label: 'Replies' },
    { value: 'status', label: 'Status' },
    { value: 'creator', label: 'Posts' },
  ];

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
    const masterTagAlerts = supportTickets
      .filter((ticket) => ticket.source === 'masterTag' && (!ticket.customerUid || ticket.customerUid === currentUserKey) && isSupportTicketNeedsAttention(ticket))
      .slice(0, 6)
      .map((ticket) => ({
        id: `master-${ticket.id}-${ticket.repliedAt || ticket.date}`,
        title: ticket.adminReply ? 'Master replied to your tag' : 'Master tag inbox update',
        body: ticket.adminReply || ticket.inboxMessage || ticket.subject,
        time: formatCommunityReplyTime(ticket.repliedAt || ticket.date),
        read: Boolean(notificationReads[`master-${ticket.id}-${ticket.repliedAt || ticket.date}`]) || !isSupportTicketNeedsAttention(ticket),
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
      ...(notificationPreferences.follows ? firebaseNotifications : []),
      ...(notificationPreferences.replies ? feedReplyAlerts : []),
      ...(notificationPreferences.masterTags ? masterTagAlerts : []),
      ...(notificationPreferences.statuses ? statusAlerts : []),
      ...(notificationPreferences.creatorPosts ? creatorAlerts : []),
    ].filter((notification) => notificationFilter === 'all' || notification.type === notificationFilter).slice(0, 30);
  }, [currentUserKey, firebaseNotifications, messages, notificationFilter, notificationPreferences, notificationReads, statusCards, supportTickets]);
  const unreadNotificationCount = supportTickets.filter((ticket) => {
    if (ticket.source !== 'masterTag') return false;
    if (ticket.customerUid && ticket.customerUid !== currentUserKey) return false;
    return isSupportTicketNeedsAttention(ticket);
  }).length;

  const updateSupportTicketReadState = (ticketIds: string[], inboxRead: boolean) => {
    if (!ticketIds.length) return;
    setSupportTickets((current) => {
      const updated = current.map((ticket) => ticketIds.includes(ticket.id) ? { ...ticket, inboxRead } : ticket);
      localStorage.setItem(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    ticketIds.forEach((ticketId) => {
      updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), { inboxRead }).catch((error) => console.warn('Support ticket read-state update failed', error));
    });
  };

  const deleteExpiredCommunityItem = (collectionName: string, itemId: string, storagePath?: string, uploadBytes = 0) => {
    deleteDoc(doc(db, collectionName, itemId)).catch((error) => console.warn('Expired community doc cleanup failed', error));
    if (storagePath) deleteObject(ref(storage, storagePath)).catch((error) => console.warn('Expired community file cleanup failed', error));
    if (uploadBytes > 0) updateDoc(doc(db, COMMUNITY_STORAGE_META, 'usage'), { usedBytes: increment(-uploadBytes), updatedAt: Date.now() }).catch((error) => console.warn('Storage usage decrement failed', error));
  };

  const cleanupExpiredCommunityCollection = (collectionName: string) => {
    getDocs(query(collection(db, collectionName), where('expiresAt', '<=', Date.now()), limit(50)))
      .then((snapshot) => snapshot.docs.forEach((item) => deleteExpiredCommunityItem(collectionName, item.id, item.data().storagePath, Number(item.data().uploadBytes) || 0)))
      .catch((error) => console.warn(`${collectionName} expired cleanup failed`, error));
  };

  const claimDailyUploadSlot = async (kind: 'creator' | 'status', type: PostType, uploadBytes = 0) => {
    const quotaRef = doc(db, COMMUNITY_UPLOAD_QUOTAS, `${currentUserKey}_${kind}`);
    const usageRef = doc(db, COMMUNITY_STORAGE_META, 'usage');
    await runTransaction(db, async (transaction) => {
      const quotaSnap = await transaction.get(quotaRef);
      const usageSnap = await transaction.get(usageRef);
      const usedTypes = quotaSnap.exists() ? (quotaSnap.data().usedTypes || {}) : {};
      const usedBytes = Number(usageSnap.exists() ? usageSnap.data().usedBytes : 0) || 0;
      if (usedBytes + uploadBytes >= STORAGE_LOCK_BYTES) throw new Error('Community uploads are paused because Firebase Storage reached the 4GB safety limit.');
      const lastUsed = Number(usedTypes[type] || 0);
      if (isWithinRollingUploadLock(lastUsed)) {
        const unlockAt = new Date(lastUsed + DAILY_UPLOAD_LOCK_MS).toLocaleString();
        throw new Error(`Daily ${type} ${kind} slot already used. Unlocks after ${unlockAt}.`);
      }
      transaction.set(quotaRef, { userId: currentUserKey, kind, usedTypes: { ...usedTypes, [type]: Date.now() }, updatedAt: Date.now() }, { merge: true });
      transaction.set(usageRef, { usedBytes: usedBytes + uploadBytes, limitBytes: STORAGE_LOCK_BYTES, bucketBytes: STORAGE_TOTAL_BYTES, updatedAt: Date.now() }, { merge: true });
    });
  };


  const releaseDailyUploadSlot = (kind: 'creator' | 'status', type: PostType, uploadBytes = 0) => {
    updateDoc(doc(db, COMMUNITY_UPLOAD_QUOTAS, `${currentUserKey}_${kind}`), { [`usedTypes.${type}`]: deleteField(), updatedAt: Date.now() }).catch((error) => console.warn('Quota rollback failed', error));
    if (uploadBytes > 0) updateDoc(doc(db, COMMUNITY_STORAGE_META, 'usage'), { usedBytes: increment(-uploadBytes), updatedAt: Date.now() }).catch((error) => console.warn('Storage rollback failed', error));
  };

  const uploadCommunityImage = async (kind: 'creator-posts' | 'stories', localId: number, dataUrl: string) => {
    if (!dataUrl.startsWith('data:')) return { imageUrl: dataUrl, storagePath: undefined, uploadBytes: 0 };
    const storagePath = `community/${kind}/${currentUserKey}/${localId}.jpg`;
    await uploadString(ref(storage, storagePath), dataUrl, 'data_url');
    return { imageUrl: await getDownloadURL(ref(storage, storagePath)), storagePath, uploadBytes: dataUrlBytes(dataUrl) };
  };

  const uploadPrivateChatMessageArchive = async (conversationId: string, messageId: string, message: PrivateChatMessage) => {
    const archiveStoragePath = `privateChats/${conversationId}/${messageId}/message.json`;

    try {
      await uploadString(ref(storage, archiveStoragePath), JSON.stringify(message), 'raw');
      return archiveStoragePath;
    } catch (error) {
      console.warn('Private chat message archive upload failed; keeping Firestore message as source of truth.', error);
      return '';
    }
  };

  const resetPrivateChatComposer = () => {
    setChatDraft('');
    setChatPollQuestion('');
    setChatPollOptions(['', '']);
    setChatAttachmentMode(null);
    setPrivateChatError('');
  };

  const ensurePrivateConversation = async (conversationId: string, receiver: Creator) => {
    const existingConversation = privateConversations.find((conversation) => conversation.id === conversationId);
    const conversationRef = doc(db, PRIVATE_CHATS, conversationId);
    const participants = getPrivateConversationParticipants(currentUserKey, receiver.id);
    const participantMap = getPrivateParticipantMap(participants);
    const baseUnreadCounts = participants.reduce<Record<string, number>>((counts, participantId) => ({ ...counts, [participantId]: 0 }), {});

    await setDoc(conversationRef, stripUndefinedDeep({
      participants,
      participantMap,
      participantNames: {
        [currentUserKey]: profile.name,
        [receiver.id]: isOwnCommunityId(receiver.id) ? 'Saved messages' : receiver.name,
      },
      participantAvatars: { [currentUserKey]: profile.avatar, [receiver.id]: receiver.avatar },
      createdAt: existingConversation?.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastMessage: existingConversation?.lastMessage || '',
      lastMessageType: existingConversation?.lastMessageType || 'text',
      lastMessageAt: existingConversation?.lastMessageAt || Date.now(),
      lastSenderId: existingConversation?.lastSenderId || '',
      unreadCounts: existingConversation?.unreadCounts || baseUnreadCounts,
    }), { merge: true });
  };

  const sendPrivateChatMessage = async (forcedType?: PrivateChatMessageType) => {
    if (!guardedAuth.currentUser || !currentUserKey) {
      redirectToAuth();
      return;
    }

    if (!activeChatCreator || !activeConversationId) return;

    const type = forcedType || chatAttachmentMode || 'text';
    const text = chatDraft.trim();
    const pollQuestion = chatPollQuestion.trim();
    const cleanedPollOptions = chatPollOptions.map((option) => option.trim()).filter(Boolean);

    if (type === 'text' && !text) return;

    if (type === 'poll' && (!pollQuestion || cleanedPollOptions.length < 2)) {
      setPrivateChatError('Poll needs one question and at least 2 options.');
      return;
    }

    const messageId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = Date.now();
    const expiresAt = createdAt + PRIVATE_CHAT_TTL_MS;
    const receiver = activeChatCreator;
    const conversationId = activeConversationId;
    const participants = getPrivateConversationParticipants(currentUserKey, receiver.id);
    const participantMap = getPrivateParticipantMap(participants);

    let archiveStoragePath = '';

    setPendingPrivateChatSends((count) => count + 1);
    setPrivateChatError('');

    const optimisticMessage: PrivateChatMessage = {
      id: messageId,
      conversationId,
      senderId: currentUserKey,
      receiverId: receiver.id,
      senderName: profile.name,
      receiverName: getCreatorDisplayName(receiver),
      type,
      text: type === 'text' ? text : undefined,
      poll: type === 'poll'
        ? {
            question: pollQuestion,
            options: cleanedPollOptions,
            votes: cleanedPollOptions.map(() => 0),
            voters: {},
            totalVotes: 0,
          }
        : undefined,
      createdAt,
      expiresAt,
      readBy: { [currentUserKey]: true },
      status: 'sent',
    };

    setPrivateMessages((current) => {
      if (current.some((message) => message.id === optimisticMessage.id)) return current;
      return [...current, optimisticMessage].sort((a, b) => a.createdAt - b.createdAt);
    });

    resetPrivateChatComposer();

    try {
      await ensurePrivateConversation(conversationId, receiver);

      const lastMessage = type === 'poll' ? `📊 ${pollQuestion}` : text;

      const messagePayload: PrivateChatMessage = {
        ...optimisticMessage,
      };

      archiveStoragePath = await uploadPrivateChatMessageArchive(conversationId, messageId, messagePayload);

      if (archiveStoragePath) {
        messagePayload.archiveStoragePath = archiveStoragePath;
      }

      await setDoc(
        doc(db, PRIVATE_CHATS, conversationId, PRIVATE_CHAT_MESSAGES, messageId),
        stripUndefinedDeep(messagePayload)
      );

      await setDoc(doc(db, PRIVATE_CHATS, conversationId), stripUndefinedDeep({
        participants,
        participantMap,
        participantNames: {
          [currentUserKey]: profile.name,
          [receiver.id]: getCreatorDisplayName(receiver),
        },
        participantAvatars: {
          [currentUserKey]: profile.avatar,
          [receiver.id]: receiver.avatar,
        },
        updatedAt: createdAt,
        lastMessage,
        lastMessageType: type,
        lastMessageAt: createdAt,
        lastSenderId: currentUserKey,
        unreadCounts: {
          ...(activeConversation?.unreadCounts || {}),
          [receiver.id]: receiver.id === currentUserKey ? 0 : (activeConversation?.unreadCounts?.[receiver.id] || 0) + 1,
          [currentUserKey]: 0,
        },
      }), { merge: true });

      setPrivateMessages((current) => current.map((message) => (
        message.id === messageId ? { ...messagePayload, status: 'sent' } : message
      )));

      requestAnimationFrame(() => {
        directChatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    } catch (error) {
      console.warn('Private chat send failed', error);

      if (archiveStoragePath) {
        deleteObject(ref(storage, archiveStoragePath)).catch((deleteError) => console.warn('Private chat archive rollback failed', deleteError));
      }

      setPrivateMessages((current) => current.filter((message) => message.id !== messageId));

      if (type === 'text') setChatDraft(text);
      if (type === 'poll') {
        setChatPollQuestion(pollQuestion);
        setChatPollOptions(cleanedPollOptions.length ? cleanedPollOptions : ['', '']);
        setChatAttachmentMode('poll');
      }

      setPrivateChatError(error instanceof Error ? error.message : 'Message failed. Please try again.');
    } finally {
      setPendingPrivateChatSends((count) => Math.max(0, count - 1));
    }
  };

  const votePrivatePoll = async (message: PrivateChatMessage, optionIndex: number) => {
    if (!message.poll || message.poll.voters?.[currentUserKey] !== undefined) return;
    const messageRef = doc(db, PRIVATE_CHATS, message.conversationId, PRIVATE_CHAT_MESSAGES, message.id);

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(messageRef);
        if (!snap.exists()) return;

        const data = snap.data();
        const poll = data.poll as PrivateChatPoll | undefined;
        if (!poll || poll.voters?.[currentUserKey] !== undefined) return;

        const votes = Array.isArray(poll.votes) ? [...poll.votes] : poll.options.map(() => 0);
        votes[optionIndex] = (votes[optionIndex] || 0) + 1;

        transaction.update(messageRef, {
          poll: {
            ...poll,
            votes,
            voters: { ...(poll.voters || {}), [currentUserKey]: optionIndex },
            totalVotes: votes.reduce((sum, count) => sum + count, 0),
          },
        });
      });
    } catch (error) {
      console.warn('Private poll vote failed', error);
      setPrivateChatError('Vote failed. Please try again.');
    }
  };

  const pinLatestPrivateMessage = () => {
    const latest = activePrivateMessages[activePrivateMessages.length - 1];
    if (!latest || !activeConversationId) return;
    updateDoc(doc(db, PRIVATE_CHATS, activeConversationId), {
      pinnedMessageId: latest.id,
      updatedAt: Date.now(),
    }).catch((error) => {
      console.warn('Pin private message failed', error);
      setPrivateChatError('Could not pin this message.');
    });
    setChatMenuOpen(false);
  };

  const clearPinnedPrivateMessage = () => {
    if (!activeConversationId) return;
    updateDoc(doc(db, PRIVATE_CHATS, activeConversationId), {
      pinnedMessageId: deleteField(),
      updatedAt: Date.now(),
    }).catch((error) => {
      console.warn('Unpin private message failed', error);
      setPrivateChatError('Could not unpin message.');
    });
    setChatMenuOpen(false);
  };

  const cleanupExpiredPrivateChatMessages = (conversationIds: string[]) => {
    conversationIds.slice(0, 20).forEach((conversationId) => {
      getDocs(query(collection(db, PRIVATE_CHATS, conversationId, PRIVATE_CHAT_MESSAGES), where('expiresAt', '<=', Date.now()), limit(25)))
        .then((snapshot) => {
          snapshot.docs.forEach((item) => {
            const data = item.data();
            deleteDoc(doc(db, PRIVATE_CHATS, conversationId, PRIVATE_CHAT_MESSAGES, item.id)).catch((error) => console.warn('Expired private message cleanup failed', error));
            if (data.storagePath) deleteObject(ref(storage, data.storagePath)).catch((error) => console.warn('Expired private media cleanup failed', error));
            if (data.archiveStoragePath) deleteObject(ref(storage, data.archiveStoragePath)).catch((error) => console.warn('Expired private archive cleanup failed', error));
          });
        })
        .catch((error) => console.warn('Private chat cleanup query failed', error));
    });
  };

  useEffect(() => {
    if (!isCommunityAllowed || !currentUserKey) return undefined;

    const cleanupVisibleExpiredMessages = () => {
      setPrivateMessages((current) => current.filter((message) => message.expiresAt > Date.now()));
      cleanupExpiredPrivateChatMessages(privateConversations.map((conversation) => conversation.id));
    };

    cleanupVisibleExpiredMessages();
    const cleanupTimer = window.setInterval(cleanupVisibleExpiredMessages, 60 * 60 * 1000);

    return () => window.clearInterval(cleanupTimer);
  }, [isCommunityAllowed, currentUserKey, privateConversations]);

  useEffect(() => {
    if (!isCommunityAllowed || !guardedAuth.currentUser || !currentUserKey) return undefined;

    const conversationsQuery = query(collection(db, PRIVATE_CHATS), where('participants', 'array-contains', currentUserKey), limit(100));

    return onSnapshot(conversationsQuery, (snapshot) => {
      const conversations = snapshot.docs
        .map((item) => mapPrivateConversationDoc(item))
        .sort((a, b) => b.updatedAt - a.updatedAt);

      setPrivateConversations(conversations);
      cleanupExpiredPrivateChatMessages(conversations.map((conversation) => conversation.id));
    }, (error) => console.warn('Private conversations sync failed', error));
  }, [isCommunityAllowed, currentUserKey, guardedAuth.currentUser?.uid]);

  useEffect(() => {
    if (!isCommunityAllowed || !activeConversationId) {
      setPrivateMessages([]);
      return undefined;
    }

    const messagesQuery = query(
      collection(db, PRIVATE_CHATS, activeConversationId, PRIVATE_CHAT_MESSAGES),
      where('expiresAt', '>', Date.now()),
      orderBy('expiresAt', 'desc'),
      limit(150)
    );

    return onSnapshot(messagesQuery, (snapshot) => {
      const liveMessages = snapshot.docs
        .map((item) => mapPrivateChatMessageDoc(item))
        .filter((message) => message.expiresAt > Date.now())
        .sort((a, b) => a.createdAt - b.createdAt);

      setPrivateMessages(liveMessages);

      if (guardedAuth.currentUser && activeConversationId) {
        updateDoc(doc(db, PRIVATE_CHATS, activeConversationId), {
          [`unreadCounts.${currentUserKey}`]: 0,
        }).catch((error) => console.warn('Private chat read update failed', error));
      }
    }, (error) => console.warn('Private messages sync failed', error));
  }, [isCommunityAllowed, activeConversationId, currentUserKey, guardedAuth.currentUser?.uid]);

  useEffect(() => {
    directChatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeConversationId, activePrivateMessages.length]);

  useEffect(() => {
    if (!isPrivateChatSending || typeof window === 'undefined') return undefined;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [isPrivateChatSending]);

  useEffect(() => {
    pageRef.current = page;
    activeViewRef.current = activeView;
    pageStackRef.current = pageStack;
  }, [page, activeView, pageStack]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onCommunityPopState = (event: PopStateEvent) => {
      const state = event.state || {};
      if (state.dcView !== 'community') {
        if (pageRef.current !== 'chat' || activeViewRef.current !== 'feed') {
          activeViewRef.current = 'feed';
          pageRef.current = 'chat';
          pageStackRef.current = [];
          setActiveView('feed');
          setPage('chat');
          setPageStack([]);
          window.history.pushState({ ...(window.history.state || {}), dcView: 'community', dcCommunityPage: 'chat' }, '', window.location.href);
        }
        return;
      }

      const targetPage = state.dcCommunityPage as CommunityPage | undefined;
      if (targetPage) {
        pageRef.current = targetPage;
        setPage(targetPage);
        if (targetPage === 'chat') {
          activeViewRef.current = 'feed';
          setActiveView('feed');
        }
      } else {
        activeViewRef.current = 'feed';
        pageRef.current = 'chat';
        pageStackRef.current = [];
        setActiveView('feed');
        setPage('chat');
        setPageStack([]);
      }
    };

    window.addEventListener('popstate', onCommunityPopState);
    return () => window.removeEventListener('popstate', onCommunityPopState);
  }, []);

  const pushPage = (nextPage: CommunityPage, options: { preserveScroll?: boolean } = {}) => {
    setIsNotificationPanelOpen(false);
    setShowStatusActions(false);
    setShareTarget(null);
    setShareRecipientSearch('');
    setShareCaption('');
    setShareSendingId('');
    setShareFeedback('');
    setExpandedReplyId(null);

    if (page === 'chat' && activeView === 'feed' && scrollContainerRef.current) {
      feedScrollPositionsRef.current.chatFeed = scrollContainerRef.current.scrollTop;
    }

    const nextStack = [...pageStackRef.current, pageRef.current];
    pageStackRef.current = nextStack;
    setPageStack(nextStack);
    setPage(nextPage);
    pageRef.current = nextPage;

    if (typeof window !== 'undefined') {
      window.history.pushState({ ...(window.history.state || {}), dcView: 'community', dcCommunityPage: nextPage }, '', window.location.href);
    }

    if (!options.preserveScroll) {
      requestAnimationFrame(() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  };

  const goBack = (options: { fromBrowser?: boolean } = {}): boolean => {
    setIsNotificationPanelOpen(false);
    setExpandedReplyId(null);

    const replaceCommunityHistory = (nextPage: CommunityPage) => {
      if (typeof window === 'undefined') return;
      window.history.replaceState(
        { ...(window.history.state || {}), dcView: 'community', dcCommunityPage: nextPage },
        '',
        window.location.href
      );
    };

    const stack = pageStackRef.current;

    if (stack.length) {
      const previous = stack[stack.length - 1];
      const nextStack = stack.slice(0, -1);

      pageStackRef.current = nextStack;
      setPage(previous);
      setPageStack(nextStack);
      pageRef.current = previous;
      replaceCommunityHistory(previous);
      return true;
    }

    if (pageRef.current !== 'chat' || activeViewRef.current !== 'feed') {
      activeViewRef.current = 'feed';
      pageRef.current = 'chat';
      pageStackRef.current = [];
      setActiveView('feed');
      setPage('chat');
      setPageStack([]);
      replaceCommunityHistory('chat');
      return true;
    }

    if (options.fromBrowser) return false;

    onClose?.();
    return false;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleCommunityBackRequest = () => {
      const handledInsideCommunity = goBack({ fromBrowser: true });
      (window as any).__eduvoraCommunityHandledBack = handledInsideCommunity;
    };

    window.addEventListener('eduvora-community-back-request', handleCommunityBackRequest);
    return () => window.removeEventListener('eduvora-community-back-request', handleCommunityBackRequest);
  }, []);

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
    const syncSupportTickets = () => setSupportTickets(mergeSeedSupportTickets(readJsonArray<CommunitySupportTicket>(SUPPORT_TICKETS_STORAGE_KEY, [])));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SUPPORT_TICKETS_STORAGE_KEY) syncSupportTickets();
    };

    const unsubscribeTickets = onSnapshot(collection(db, SUPPORT_TICKETS_COLLECTION), (snapshot) => {
      if (snapshot.empty) return;
      const remoteTickets = mergeSeedSupportTickets(snapshot.docs.map((item) => item.data() as CommunitySupportTicket));
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
    const syncLocalAdminPosts = () => {
      const localAdminPosts = readJsonArray<FeedMessage>(ADMIN_POST_FALLBACK_STORAGE_KEY, [])
        .map((post) => normalizeFeedMessage({ ...post, source: 'admin', badge: post.badge || 'ADMIN POST', creatorId: post.creatorId || 'admin', ownerId: post.ownerId || 'admin' }))
        .filter((message) => isUnexpired(message, POST_TTL_MS));
      if (!localAdminPosts.length) return;
      setMessages((current) => {
        const mergedMessages = mergeUnexpiredByIdentity(localAdminPosts, current.map(normalizeFeedMessage), initialMessages.map(normalizeFeedMessage), POST_TTL_MS);
        setAdminPosts(mergedMessages.filter((message) => message.source === 'admin' || message.badge === 'ADMIN POST' || message.creatorId === 'admin'));
        return mergedMessages;
      });
    };
    syncLocalAdminPosts();
    window.addEventListener(ADMIN_POST_FALLBACK_EVENT, syncLocalAdminPosts);
    window.addEventListener('storage', syncLocalAdminPosts);
    return () => {
      window.removeEventListener(ADMIN_POST_FALLBACK_EVENT, syncLocalAdminPosts);
      window.removeEventListener('storage', syncLocalAdminPosts);
    };
  }, [isCommunityAllowed]);


  useEffect(() => {
    if (!isCommunityAllowed) return undefined;
    const cleanup = () => {
      cleanupExpiredCommunityCollection(COMMUNITY_FEED);
      cleanupExpiredCommunityCollection(COMMUNITY_STATUS);
    };
    cleanup();
    const cleanupInterval = window.setInterval(cleanup, 5 * 60 * 1000);
    return () => window.clearInterval(cleanupInterval);
  }, [isCommunityAllowed]);

  useEffect(() => {
    if (!isCommunityAllowed) return undefined;
    const feedQuery = query(collection(db, COMMUNITY_FEED), where('expiresAt', '>', Date.now()), orderBy('expiresAt', 'desc'), limit(150));
    return onSnapshot(feedQuery, (snapshot) => {
      snapshot.docs.forEach((item) => { const expiresAt = asMillis(item.data().expiresAt); if (expiresAt <= Date.now()) deleteExpiredCommunityItem(COMMUNITY_FEED, item.id, item.data().storagePath, Number(item.data().uploadBytes) || 0); });
      const firebaseMessages = snapshot.docs.map((item) => normalizeFeedMessage(mapFeedDoc(item))).filter((message) => isUnexpired(message, POST_TTL_MS));
      setMessages((current) => {
        const mergedMessages = mergeUnexpiredByIdentity(firebaseMessages, current.map(normalizeFeedMessage), initialMessages.map(normalizeFeedMessage), POST_TTL_MS);
        setAdminPosts(mergedMessages.filter((message) => message.source === 'admin' || message.badge === 'ADMIN POST' || message.creatorId === 'admin'));
        return mergedMessages;
      });
    }, (error) => console.warn('community_feed snapshot failed; using local fallback', error));
  }, [isCommunityAllowed]);

  useEffect(() => {
    if (!isCommunityAllowed) return undefined;
    const statusQuery = query(collection(db, COMMUNITY_STATUS), where('expiresAt', '>', Date.now()), orderBy('expiresAt', 'desc'), limit(150));
    return onSnapshot(statusQuery, (snapshot) => {
      snapshot.docs.forEach((item) => {
        const expiresAt = asMillis(item.data().expiresAt);
        if (expiresAt <= Date.now()) deleteExpiredCommunityItem(COMMUNITY_STATUS, item.id, item.data().storagePath, Number(item.data().uploadBytes) || 0);
      });
      const firebaseStatuses = snapshot.docs.map((item) => mapStatusDoc(item)).filter((status) => isUnexpired(status, STORY_TTL_MS));
      setStatusCards((current) => mergeUnexpiredByIdentity(firebaseStatuses, current, initialStatusCards, STORY_TTL_MS));
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
    if (!isCommunityAllowed) return undefined;
    return onSnapshot(doc(db, COMMUNITY_STORAGE_META, 'usage'), (snapshot) => {
      const usedBytes = Number(snapshot.data()?.usedBytes) || 0;
      setStorageUsedBytes(Math.max(0, usedBytes));
      setLimitMessage(usedBytes >= STORAGE_LOCK_BYTES ? 'Firebase Storage 4GB safety limit reached. Uploads are locked for all users until expired 24-hour stories/posts are cleaned up.' : '');
    }, (error) => console.warn('Storage usage sync failed', error));
  }, [isCommunityAllowed]);


  useEffect(() => {
    if (!isCommunityAllowed || !currentUserKey) return undefined;
    const unsubCreator = onSnapshot(doc(db, COMMUNITY_UPLOAD_QUOTAS, `${currentUserKey}_creator`), (snapshot) => {
      const used = snapshot.data()?.usedTypes || {};
      setCreatorQuota({ [todayKey()]: postOptions.map((option) => option.type).filter((type) => isWithinRollingUploadLock(Number(used[type]))) });
    }, (error) => console.warn('Creator quota sync failed', error));
    const unsubStatus = onSnapshot(doc(db, COMMUNITY_UPLOAD_QUOTAS, `${currentUserKey}_status`), (snapshot) => {
      const used = snapshot.data()?.usedTypes || {};
      setStatusQuota({ [todayKey()]: postOptions.map((option) => option.type).filter((type) => isWithinRollingUploadLock(Number(used[type]))) });
    }, (error) => console.warn('Status quota sync failed', error));
    return () => { unsubCreator(); unsubStatus(); };
  }, [currentUserKey, isCommunityAllowed]);


  useEffect(() => {
    if (!isCommunityAllowed || !guardedAuth.currentUser || !currentUserKey) return undefined;

    const publicName = profile.name || 'Eduvora Member';
    const publicUsername = normalizeUsername(profile.username || profile.name) || `member_${currentUserKey.slice(0, 6)}`;
    const publicBio = profile.bio || '';
    const searchableText = normalizeSearchText([publicName, publicUsername, 'Community member', publicBio].join(' '));
    const publicProfilePayload = stripUndefinedDeep({
      uid: currentUserKey,
      id: currentUserKey,
      userId: currentUserKey,
      ownerId: currentUserKey,
      displayName: publicName,
      name: publicName,
      username: publicUsername,
      photoURL: isImageAvatar(profile.avatar || '') ? profile.avatar : '',
      avatar: profile.avatar || '🧑‍🎓',
      role: 'student',
      bio: publicBio,
      subjects: [],
      masterTags: [],
      creatorCategory: '',
      searchableText,
      searchTokens: buildSearchTokens(publicName, publicUsername, 'student', 'Community member', publicBio),
      followerCount: Math.max(0, followerCounts[currentUserKey] || followerIds.length),
      followingCount: Math.max(0, followingCounts[currentUserKey] || followedIds.length),
      postCount: messages.filter((message) => isOwnCommunityId(message.creatorId)).length,
      isCreator: false,
      isVerified: false,
      isPublic: privacySettings.profileVisible,
      isSuspended: false,
      isOnline: true,
      lastActiveAt: Date.now(),
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });

    setDoc(doc(db, COMMUNITY_PROFILES, currentUserKey), publicProfilePayload, { merge: true })
      .catch((error) => console.warn('Community profile sync failed', error));
    setDoc(doc(db, PUBLIC_PROFILES, currentUserKey), publicProfilePayload, { merge: true })
      .catch((error) => console.warn('Public profile sync failed', error));

    return undefined;
  }, [currentUserKey, guardedAuth.currentUser, isCommunityAllowed, profile.avatar, profile.bio, profile.name, profile.username, privacySettings.profileVisible, followerCounts, followerIds.length, followingCounts, followedIds.length, messages]);

  useEffect(() => {
    if (!isCommunityAllowed) return undefined;

    const profilesQuery = query(collection(db, PUBLIC_PROFILES), limit(500));
    return onSnapshot(profilesQuery, (snapshot) => {
      const firebaseProfiles = snapshot.docs.map((item): Creator => {
        const data = item.data() as Record<string, unknown>;
        const userId = String(data.uid || data.userId || data.ownerId || item.id);
        const rawName = typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName : typeof data.name === 'string' && data.name.trim() ? data.name : 'Eduvora Member';
        const rawUsername = typeof data.username === 'string' && data.username.trim() ? data.username : rawName;
        const rawAvatar = typeof data.avatar === 'string' && data.avatar.trim() ? data.avatar : typeof data.photoURL === 'string' && data.photoURL.trim() ? data.photoURL : '🧑‍🎓';
        const rawRole = typeof data.role === 'string' && data.role.trim() ? data.role : 'student';
        const subjects = Array.isArray(data.subjects) ? data.subjects.filter((value): value is string => typeof value === 'string') : [];
        const masterTags = Array.isArray(data.masterTags) ? data.masterTags.filter((value): value is string => typeof value === 'string') : [];
        const isPublic = data.isPublic !== false;
        const isSuspended = Boolean(data.isSuspended || data.suspended || data.blocked || data.hidden);

        return {
          id: userId,
          ownerId: userId,
          username: normalizeUsername(rawUsername) || `member_${userId.slice(0, 6)}`,
          name: rawName,
          avatar: rawAvatar,
          role: rawRole,
          bio: typeof data.bio === 'string' ? data.bio : '',
          subjects,
          masterTags,
          creatorCategory: typeof data.creatorCategory === 'string' ? data.creatorCategory : '',
          searchTokens: Array.isArray(data.searchTokens) ? data.searchTokens.filter((value): value is string => typeof value === 'string') : [],
          followers: Math.max(0, Number(data.followerCount) || 0),
          followerCount: Math.max(0, Number(data.followerCount) || 0),
          followingCount: Math.max(0, Number(data.followingCount) || 0),
          mutual: false,
          verified: Boolean(data.isVerified || data.verified),
          isCreator: Boolean(data.isCreator),
          isPublic,
          isSuspended,
          isOnline: Boolean(data.isOnline),
          source: 'profile',
        };
      }).filter((creator) => Boolean(creator.id) && creator.isPublic !== false && !creator.isSuspended);

      setCommunityProfiles(firebaseProfiles);
    }, (error) => console.warn('Community profiles sync failed', error));
  }, [isCommunityAllowed]);

  useEffect(() => {
    if (!isCommunityAllowed || !currentUserKey) return undefined;

    const followsQuery = query(collection(db, COMMUNITY_FOLLOWS), limit(2000));
    return onSnapshot(followsQuery, (snapshot) => {
      const nextFollowedIds: string[] = [];
      const nextFollowerIds: string[] = [];
      const nextFollowedByCreatorIds: Record<string, boolean> = {};
      const nextFollowerByCreatorIds: Record<string, boolean> = {};
      const nextFollowerCounts: Record<string, number> = {};
      const nextFollowingCounts: Record<string, number> = {};

      const seenActiveEdges = new Set<string>();
      snapshot.docs.forEach((item) => {
        const data = item.data() as Record<string, unknown>;
        const followerId = typeof data.followerId === 'string' ? data.followerId : '';
        const followingId = typeof data.followingId === 'string' ? data.followingId : '';
        const status = typeof data.status === 'string' ? data.status : 'active';
        const edgeKey = getFollowDocId(followerId, followingId);

        if (!followerId || !followingId || followerId === followingId || status !== 'active' || seenActiveEdges.has(edgeKey)) return;
        seenActiveEdges.add(edgeKey);

        nextFollowerCounts[followingId] = (nextFollowerCounts[followingId] || 0) + 1;
        nextFollowingCounts[followerId] = (nextFollowingCounts[followerId] || 0) + 1;

        if (followerId === currentUserKey) {
          nextFollowedByCreatorIds[followingId] = true;
          nextFollowedIds.push(followingId);
        }

        if (followingId === currentUserKey) {
          nextFollowerByCreatorIds[followerId] = true;
          nextFollowerIds.push(followerId);
        }
      });

      setFollowedIds(Array.from(new Set(nextFollowedIds)));
      setFollowerIds(Array.from(new Set(nextFollowerIds)));
      setFollowedByCreatorIds(nextFollowedByCreatorIds);
      setFollowerByCreatorIds(nextFollowerByCreatorIds);
      setFollowerCounts(nextFollowerCounts);
      setFollowingCounts(nextFollowingCounts);
    }, (error) => console.warn('Community follows sync failed', error));
  }, [currentUserKey, isCommunityAllowed]);

  useEffect(() => {
    if (!isCommunityAllowed || !currentUserKey) return undefined;

    const notificationsQuery = query(
      collection(db, COMMUNITY_NOTIFICATIONS),
      where('recipientId', '==', currentUserKey),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    return onSnapshot(notificationsQuery, (snapshot) => {
      const nextNotifications = snapshot.docs.map((item): CommunityNotification => {
        const data = item.data() as Record<string, unknown>;
        const createdAt = typeof data.createdAt === 'number' ? data.createdAt : Date.now();
        const type = data.type === 'follow' ? 'follow' : 'creator';

        return {
          id: item.id,
          title: typeof data.title === 'string' ? data.title : 'Community notification',
          body: typeof data.body === 'string' ? data.body : '',
          time: formatCommunityReplyTime(new Date(createdAt).toISOString()),
          read: Boolean(notificationReads[item.id]),
          type,
          targetPage: typeof data.targetPage === 'string' ? data.targetPage as CommunityPage : 'network',
          targetId: typeof data.targetId === 'string' || typeof data.targetId === 'number' ? data.targetId : undefined,
        };
      });

      setFirebaseNotifications(nextNotifications);
    }, (error) => console.warn('Community notification sync failed', error));
  }, [currentUserKey, isCommunityAllowed, notificationReads]);

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

  const markAllNotificationsRead = () => {
    setNotificationReads((current) => ({ ...current, ...Object.fromEntries(notifications.map((notification) => [notification.id, true])) }));
    const ticketIds = supportTickets.filter((ticket) => isSupportTicketNeedsAttention(ticket)).map((ticket) => ticket.id);
    updateSupportTicketReadState(ticketIds, true);
  };

  const openNotification = (notification: CommunityNotification) => {
    setNotificationReads((current) => ({ ...current, [notification.id]: true }));
    if (notification.type === 'masterTag') {
      const matchingTicket = supportTickets.find((ticket) => notification.id.includes(`${ticket.id}-`) || notification.id === `master-${ticket.id}`);
      if (matchingTicket) updateSupportTicketReadState([matchingTicket.id], true);
    }
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
        return { id: Number.parseInt(replyDoc.id.replace(/\D/g, '').slice(-9), 10) || Date.now(), docId: replyDoc.id, author: data.author || data.authorName || 'Member', avatar: data.avatar || '👤', text: data.text || '', time: data.time || formatCommunityTime(data.createdAt), createdAt: asMillis(data.createdAt), ownerId: data.ownerId, senderId: data.senderId || data.ownerId, clientMessageId: data.clientMessageId, status: data.status || 'sent', replyToMessageId: data.replyToMessageId, replyToSenderName: data.replyToSenderName, replyToTextPreview: data.replyToTextPreview, replyToType: data.replyToType || 'feed_message', replyToDeleted: Boolean(data.replyToDeleted) };
      });
      setMessages((current) => current.map((item) => item.docId === message.docId ? { ...item, replies } : item));
    }, (error) => console.warn('Lazy replies failed', error));
  };

  const openMessage = (messageId: number) => {
    setExpandedReplyId(null);

    if (page === 'chat' && activeView === 'feed' && scrollContainerRef.current) {
      feedScrollPositionsRef.current.chatFeed = scrollContainerRef.current.scrollTop;
    }

    setSelectedMessageId(messageId);

    if (window.matchMedia('(max-width: 767px)').matches) {
      pushPage('thread', { preserveScroll: true });
    }
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

  const buildReplyPreview = (message: FeedMessage) => ({
    replyToMessageId: String(message.docId || message.id),
    replyToSenderName: resolveName(message),
    replyToTextPreview: safeText(`${message.title}: ${message.body}`, COMMUNITY_REPLY_PREVIEW_LENGTH),
    replyToType: 'feed_message' as const,
    replyToDeleted: false,
  });

  const submitReply = async (messageId: number, retryReply?: Reply) => {
    const targetMessage = messages.find((message) => message.id === messageId);
    if (!targetMessage || replySendingIds[messageId]) return;
    if (!guardedAuth.currentUser) {
      redirectToAuth();
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setProfileFeedback({ type: 'error', message: 'You appear to be offline. Reconnect to send your reply.' });
      return;
    }

    const draft = (retryReply?.text || replyDrafts[messageId] || '').trim().slice(0, COMMUNITY_REPLY_MAX_LENGTH);
    if (!draft) return;

    const optimisticId = retryReply?.id || Date.now();
    const clientMessageId = retryReply?.clientMessageId || `${currentUserKey}_${messageId}_${optimisticId}`;
    const preview = buildReplyPreview(targetMessage);
    const reply: Reply = {
      id: optimisticId,
      author: profile.name || 'Eduvora Member',
      avatar: profile.avatar || '🧑‍🎓',
      text: draft,
      time: retryReply ? 'Retrying…' : 'Sending…',
      createdAt: retryReply?.createdAt || Date.now(),
      ownerId: currentUserKey,
      senderId: currentUserKey,
      clientMessageId,
      status: 'sending',
      ...preview,
    };

    setReplySendingIds((current) => ({ ...current, [messageId]: true }));
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId) return message;
      const withoutDuplicate = message.replies.filter((item) => item.clientMessageId !== clientMessageId && item.id !== optimisticId);
      return { ...message, replies: [...withoutDuplicate, reply], replyCount: Math.max(message.replyCount || 0, withoutDuplicate.length) + 1 };
    }));

    try {
      if (!targetMessage.docId) throw new Error('This thread is still syncing. Try again in a moment.');
      const replyPayload = stripUndefinedDeep({
        ...reply,
        time: 'Just now',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        senderName: reply.author,
      });
      const replyRef = await addDoc(collection(db, COMMUNITY_FEED, targetMessage.docId, 'replies'), replyPayload);
      await updateDoc(doc(db, COMMUNITY_FEED, targetMessage.docId), { replyCount: increment(1), updatedAt: Date.now() });
      setMessages((current) => current.map((message) => message.id === messageId ? {
        ...message,
        replies: message.replies.map((item) => item.clientMessageId === clientMessageId ? { ...reply, docId: replyRef.id, status: 'sent', time: 'Just now' } : item),
      } : message));
      setReplyDrafts((current) => ({ ...current, [messageId]: '' }));
      setExpandedReplyId(null);
    } catch (error) {
      console.warn('Reply write failed', error);
      setMessages((current) => current.map((message) => message.id === messageId ? {
        ...message,
        replies: message.replies.map((item) => item.clientMessageId === clientMessageId ? { ...item, status: 'failed', time: 'Failed to send' } : item),
      } : message));
      setProfileFeedback({ type: 'error', message: 'Could not send reply. Use Retry from the failed bubble.' });
    } finally {
      setReplySendingIds((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }
  };


  const openPublishedCreatorPost = (messageId: number) => {
    setSelectedMessageId(messageId);
    setActiveView('feed');
    setPage(window.matchMedia('(max-width: 767px)').matches ? 'thread' : 'chat');
    setPageStack([]);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openPublishedStatusStory = (statusId: number) => {
    setSelectedStatusId(statusId);
    setActiveView('status');
    setPage('statusReel');
    setPageStack([]);
    recordStatusView(statusId);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setShowStatusActions(false);
  };

  const openStatusUploadFromTop = () => {
    setActiveView('status');
    setShowStatusActions(false);
    pushPage('statusUpload');
  };

  const openMyStatusesFromTop = () => {
    setActiveView('status');
    setShowStatusActions(false);
    pushPage('statusMine');
  };


  const toggleFollowCreator = async (creator: Creator) => {
    if (!guardedAuth.currentUser || !currentUserKey) {
      redirectToAuth();
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setProfileFeedback({ type: 'error', message: 'You appear to be offline. Reconnect to update follows.' });
      return;
    }

    const followerId = currentUserKey;
    const followingId = creator.id;

    if (!followingId || followerId === followingId || followLoadingIds[followingId] || creator.isPublic === false || creator.isSuspended) return;

    const isAlreadyFollowing = Boolean(followedByCreatorIds[followingId]);
    const followRef = doc(db, COMMUNITY_FOLLOWS, getFollowDocId(followerId, followingId));
    const followerPublicRef = doc(db, PUBLIC_PROFILES, followerId);
    const followingPublicRef = doc(db, PUBLIC_PROFILES, followingId);
    const followerLegacyRef = doc(db, COMMUNITY_PROFILES, followerId);
    const followingLegacyRef = doc(db, COMMUNITY_PROFILES, followingId);

    setFollowLoadingIds((current) => ({ ...current, [followingId]: true }));
    setFollowedByCreatorIds((current) => ({ ...current, [followingId]: !isAlreadyFollowing }));
    setFollowedIds((current) => isAlreadyFollowing ? current.filter((id) => id !== followingId) : Array.from(new Set([...current, followingId])));
    setFollowerCounts((current) => ({ ...current, [followingId]: Math.max(0, (current[followingId] || creator.followerCount || creator.followers || 0) + (isAlreadyFollowing ? -1 : 1)) }));
    setFollowingCounts((current) => ({ ...current, [followerId]: Math.max(0, (current[followerId] || followedIds.length) + (isAlreadyFollowing ? -1 : 1)) }));

    try {
      await runTransaction(db, async (transaction) => {
        const [followSnap, targetSnap, followerPublicSnap, followingLegacySnap, followerLegacySnap] = await Promise.all([
          transaction.get(followRef),
          transaction.get(followingPublicRef),
          transaction.get(followerPublicRef),
          transaction.get(followingLegacyRef),
          transaction.get(followerLegacyRef),
        ]);
        const targetData = targetSnap.data() as Record<string, unknown> | undefined;
        if (targetSnap.exists() && (targetData?.isPublic === false || targetData?.isSuspended || targetData?.blocked || targetData?.hidden)) {
          throw new Error('This profile is unavailable.');
        }

        const activeEdge = followSnap.exists() && followSnap.data()?.status === 'active';
        const now = Date.now();
        const targetFollowerCount = Math.max(0, Number(targetSnap.data()?.followerCount ?? followingLegacySnap.data()?.followerCount ?? creator.followerCount ?? creator.followers ?? 0) || 0);
        const currentFollowingCount = Math.max(0, Number(followerPublicSnap.data()?.followingCount ?? followerLegacySnap.data()?.followingCount ?? followedIds.length) || 0);

        const safeTargetProfile = stripUndefinedDeep({
          uid: followingId,
          id: followingId,
          userId: followingId,
          ownerId: followingId,
          displayName: creator.name || 'Eduvora Member',
          name: creator.name || 'Eduvora Member',
          username: normalizeUsername(creator.username || creator.name) || `member_${followingId.slice(0, 6)}`,
          avatar: creator.avatar || '🧑‍🎓',
          role: creator.role || 'student',
          bio: creator.bio || '',
          subjects: creator.subjects || [],
          masterTags: creator.masterTags || [],
          followerCount: targetFollowerCount,
          followingCount: Math.max(0, Number(targetSnap.data()?.followingCount ?? followingLegacySnap.data()?.followingCount ?? creator.followingCount ?? 0) || 0),
          isPublic: creator.isPublic !== false,
          isSuspended: Boolean(creator.isSuspended),
          updatedAt: now,
          createdAt: targetSnap.data()?.createdAt || now,
        });

        const safeFollowerProfile = stripUndefinedDeep({
          uid: followerId,
          id: followerId,
          userId: followerId,
          ownerId: followerId,
          displayName: profile.name || 'Eduvora Member',
          name: profile.name || 'Eduvora Member',
          username: normalizeUsername(profile.username || profile.name) || `member_${followerId.slice(0, 6)}`,
          avatar: profile.avatar || '🧑‍🎓',
          role: 'student',
          followerCount: Math.max(0, Number(followerPublicSnap.data()?.followerCount ?? followerLegacySnap.data()?.followerCount ?? followerIds.length) || 0),
          followingCount: currentFollowingCount,
          isPublic: privacySettings.profileVisible,
          isSuspended: false,
          updatedAt: now,
          createdAt: followerPublicSnap.data()?.createdAt || now,
        });

        if (isAlreadyFollowing) {
          if (!activeEdge) return;
          transaction.set(followRef, { status: 'removed', updatedAt: now, removedAt: now }, { merge: true });
          transaction.set(followingPublicRef, { ...safeTargetProfile, followerCount: Math.max(0, targetFollowerCount - 1), updatedAt: now, lastFollowerAt: now }, { merge: true });
          transaction.set(followerPublicRef, { ...safeFollowerProfile, followingCount: Math.max(0, currentFollowingCount - 1), updatedAt: now, lastFollowedAt: now }, { merge: true });
          transaction.set(followingLegacyRef, { followerCount: Math.max(0, targetFollowerCount - 1), updatedAt: now }, { merge: true });
          transaction.set(followerLegacyRef, { followingCount: Math.max(0, currentFollowingCount - 1), updatedAt: now }, { merge: true });
          return;
        }

        if (activeEdge) return;
        transaction.set(followRef, stripUndefinedDeep({
          followId: getFollowDocId(followerId, followingId),
          followerId,
          followingId,
          status: 'active',
          followerName: profile.name,
          followerUsername: normalizeUsername(profile.username || profile.name),
          followerAvatar: profile.avatar,
          followingName: creator.name,
          followingUsername: creator.username,
          followingAvatar: creator.avatar,
          createdAt: followSnap.exists() ? followSnap.data()?.createdAt || now : now,
          updatedAt: now,
        }), { merge: true });
        transaction.set(followingPublicRef, { ...safeTargetProfile, followerCount: targetFollowerCount + 1, updatedAt: now, lastFollowerAt: now }, { merge: true });
        transaction.set(followerPublicRef, { ...safeFollowerProfile, followingCount: currentFollowingCount + 1, updatedAt: now, lastFollowedAt: now }, { merge: true });
        transaction.set(followingLegacyRef, { followerCount: targetFollowerCount + 1, updatedAt: now }, { merge: true });
        transaction.set(followerLegacyRef, { followingCount: currentFollowingCount + 1, updatedAt: now }, { merge: true });
      });

      if (!isAlreadyFollowing) {
        await addDoc(collection(db, COMMUNITY_NOTIFICATIONS), stripUndefinedDeep({
          recipientId: followingId,
          actorId: followerId,
          actorName: profile.name,
          actorUsername: normalizeUsername(profile.username || profile.name),
          actorAvatar: profile.avatar,
          type: 'follow',
          title: `${profile.name} started following you`,
          body: `@${normalizeUsername(profile.username || profile.name)} followed your community profile.`,
          targetPage: 'network',
          targetId: followerId,
          createdAt: Date.now(),
          read: false,
        }));
      }
      setProfileFeedback({ type: 'success', message: isAlreadyFollowing ? `Unfollowed ${creator.name}.` : `You are now following ${creator.name}.` });
    } catch (error) {
      setFollowedByCreatorIds((current) => ({ ...current, [followingId]: isAlreadyFollowing }));
      setFollowedIds((current) => isAlreadyFollowing ? Array.from(new Set([...current, followingId])) : current.filter((id) => id !== followingId));
      setFollowerCounts((current) => ({ ...current, [followingId]: Math.max(0, (current[followingId] || creator.followerCount || creator.followers || 0) + (isAlreadyFollowing ? 1 : -1)) }));
      setFollowingCounts((current) => ({ ...current, [followerId]: Math.max(0, (current[followerId] || followedIds.length) + (isAlreadyFollowing ? 1 : -1)) }));
      console.warn('Follow update failed', error);
      setProfileFeedback({ type: 'error', message: isAlreadyFollowing ? 'Could not unfollow. Try again.' : 'Could not follow. Try again.' });
    } finally {
      setFollowLoadingIds((current) => {
        const next = { ...current };
        delete next[followingId];
        return next;
      });
    }
  };

  const submitCreatorPost = async () => {
    const draft = postDraft.trim();
    const cleanedOptions = postPollOptions.map((option) => option.trim()).filter(Boolean);
    if (!draft || isCreatorTypeUsedToday || isStorageLocked || isPublishingCreator) return;
    if (postType === 'poll' && cleanedOptions.length < 2) return;
    setComposerError('');
    setIsPublishingCreator(true);

    const publishType = postType;
    const publishImagePreview = postImagePreview;
    const publishImageBytes = publishType === 'image' ? dataUrlBytes(publishImagePreview) : 0;
    const labels: Record<PostType, { badge: string; title: string; avatar: string }> = {
      text: { badge: 'Creator text · +1 EduCoin', title: `${profile.name} shared a note`, avatar: profile.avatar },
      image: { badge: 'Creator image · +1 EduCoin', title: `${profile.name} shared an image idea`, avatar: profile.avatar },
      poll: { badge: 'Creator poll · +1 EduCoin', title: `${profile.name} opened a poll`, avatar: profile.avatar },
    };
    const meta = labels[publishType];
    const now = Date.now();
    const localMessage = normalizeFeedMessage({
      id: now,
      admin: profile.name,
      badge: meta.badge,
      avatar: meta.avatar,
      title: meta.title,
      body: draft,
      time: 'Just now',
      creatorId: currentUserKey,
      postType: publishType,
      imagePreview: publishType === 'image' ? (publishImagePreview || '🖼️') : undefined,
      imageLayout: publishType === 'image' ? 'thumbnail' : undefined,
      pollOptions: publishType === 'poll' ? cleanedOptions : undefined,
      pollVotes: publishType === 'poll' ? cleanedOptions.map(() => 0) : undefined,
      reactions: [],
      likeCount: 0,
      replies: [],
      createdAt: now,
      expiresAt: now + POST_TTL_MS,
      ownerId: currentUserKey,
      source: 'creator',
      reactionCounts: {},
      likedByUsers: {},
      pollVoters: {},
      reactionUsers: {},
      replyCount: 0,
    });

    flushSync(() => setMessages((current) => [localMessage, ...current.filter((message) => message.id !== localMessage.id)]));
    openPublishedCreatorPost(localMessage.id);
    setProfileFeedback({ type: 'success', message: 'Creator post published and opened.' });
    setEduCoins((coins) => coins + 1);
    setPostDraft('');
    setPostImageName('');
    setPostImagePreview('');
    setPostPollOptions(['', '', '']);
    setCreatorQuota((current) => ({ [todayKey()]: Array.from(new Set([...(current[todayKey()] || []), publishType])) }));
    setIsPublishingCreator(false);

    (async () => {
      try {
        await claimDailyUploadSlot('creator', publishType, publishImageBytes);
        const upload = publishType === 'image' && publishImagePreview
          ? await uploadCommunityImage('creator-posts', localMessage.id, publishImagePreview)
          : { imageUrl: localMessage.imagePreview, storagePath: undefined, uploadBytes: 0 };
        const cloudMessage = normalizeFeedMessage({
          ...localMessage,
          imagePreview: upload.imageUrl,
          storagePath: upload.storagePath,
          uploadBytes: upload.uploadBytes,
          ownerId: currentUserKey,
          creatorId: currentUserKey,
          createdAt: now,
          expiresAt: now + POST_TTL_MS,
          source: 'creator',
          reactionCounts: {},
          replyCount: 0,
        });
        const docRef = await addDoc(collection(db, COMMUNITY_FEED), stripUndefinedDeep(cloudMessage));
        setMessages((current) => current.map((message) => message.id === localMessage.id ? { ...cloudMessage, docId: docRef.id } : message));
        setSelectedMessageId(localMessage.id);
      } catch (error) {
        console.warn('Creator post remote publish failed; keeping local post visible', error);
        releaseDailyUploadSlot('creator', publishType, publishImageBytes);
      }
    })();

  };

  const submitStatus = async () => {
    const draft = statusDraft.trim();
    const cleanedOptions = statusPollOptions.map((option) => option.trim()).filter(Boolean);
    if ((!draft && statusType !== 'image') || isStatusTypeUsedToday || isStorageLocked || isPublishingStatus) return;
    if (statusType === 'poll' && cleanedOptions.length < 2) return;
    setComposerError('');
    setIsPublishingStatus(true);

    const publishType = statusType;
    const publishImagePreview = statusImagePreview;
    const publishImageBytes = publishType === 'image' ? dataUrlBytes(publishImagePreview) : 0;
    const title = publishType === 'image' ? (statusImageName || 'Image story') : draft.slice(0, 54) || 'Fresh status';
    const statusStoryId = Date.now();
    const statusStory = createStatusStory({
      id: statusStoryId,
      type: publishType,
      title,
      body: draft,
      imagePreview: publishImagePreview,
      pollOptions: cleanedOptions,
    });
    const now = Date.now();
    const localStory = {
      ...statusStory,
      ownerId: currentUserKey,
      createdAt: now,
      expiresAt: now + STORY_TTL_MS,
      source: 'status' as const,
    };
    flushSync(() => setStatusCards((current) => [localStory, ...current.filter((status) => status.id !== localStory.id)]));
    openPublishedStatusStory(statusStoryId);
    setProfileFeedback({ type: 'success', message: 'Status story published and opened.' });
    setStatusDraft('');
    setStatusImageName('');
    setStatusImagePreview('');
    setStatusPollOptions(['', '', '']);
    setStatusQuota((current) => ({ [todayKey()]: Array.from(new Set([...(current[todayKey()] || []), publishType])) }));
    setIsPublishingStatus(false);

    (async () => {
      try {
        await claimDailyUploadSlot('status', publishType, publishImageBytes);
        const upload = publishType === 'image' && publishImagePreview
          ? await uploadCommunityImage('stories', statusStoryId, publishImagePreview)
          : { imageUrl: localStory.imagePreview, storagePath: undefined, uploadBytes: 0 };
        const cloudStory = {
          ...localStory,
          imagePreview: upload.imageUrl,
          storagePath: upload.storagePath,
          uploadBytes: upload.uploadBytes,
          ownerId: currentUserKey,
          createdAt: now,
          expiresAt: now + STORY_TTL_MS,
          source: 'status' as const,
        };
        const docRef = await addDoc(collection(db, COMMUNITY_STATUS), stripUndefinedDeep(cloudStory));
        setStatusCards((current) => current.map((status) => status.id === statusStoryId ? { ...cloudStory, docId: docRef.id } : status));
        openPublishedStatusStory(statusStoryId);
      } catch (error) {
        console.warn('Status story remote publish failed; keeping local story visible', error);
        releaseDailyUploadSlot('status', publishType, publishImageBytes);
      }
    })();
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
    const imageClass = mode === 'thumbnail' ? 'h-full w-full object-contain' : 'max-h-full max-w-full object-contain';
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
    if (message.docId) updateDoc(doc(db, COMMUNITY_FEED, message.docId), { ...(previousEmoji ? { [`reactionCounts.${previousEmoji}`]: increment(-1) } : {}), [`reactionCounts.${emoji}`]: increment(1), [`reactionUsers.${currentUserKey}`]: emoji }).catch((error) => console.warn('Reaction update failed', error));
  };

  const renderReactionStrip = (message: FeedMessage) => <div className="mt-3 flex flex-wrap gap-2">{REACTION_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => reactToMessage(message, emoji)} title={`${emoji} reactions`} className="rounded-full border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-black text-[#202124] shadow-[0_1px_2px_rgba(60,64,67,0.16)] transition hover:border-[#1A73E8] hover:text-[#1967D2] hover:shadow-[0_2px_6px_rgba(60,64,67,0.18)]"><span>{emoji}</span> <span>{(message.reactionCounts || {})[emoji] || 0}</span></button>)}</div>;


  const voteOnStatusPoll = (statusId: number, optionIndex: number) => {
    const targetStatus = statusCards.find((status) => status.id === statusId);
    if (!targetStatus?.pollOptions || targetStatus.pollVoters?.[currentUserKey] !== undefined) return;
    setStatusCards((current) => current.map((status) => {
      if (status.id !== statusId || !status.pollOptions) return status;
      const votes = status.pollVotes || status.pollOptions.map(() => 0);
      return { ...status, pollVoters: { ...(status.pollVoters || {}), [currentUserKey]: optionIndex }, pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count) };
    }));
    if (targetStatus.docId) {
      const votes = targetStatus.pollVotes || targetStatus.pollOptions.map(() => 0);
      updateDoc(doc(db, COMMUNITY_STATUS, targetStatus.docId), { pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count), [`pollVoters.${currentUserKey}`]: optionIndex }).catch((error) => console.warn('Status poll vote update failed', error));
    }
  };

  const voteOnMessagePoll = (messageId: number, optionIndex: number) => {
    const targetMessage = messages.find((message) => message.id === messageId);
    if (!targetMessage?.pollOptions || targetMessage.pollVoters?.[currentUserKey] !== undefined) return;
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId || !message.pollOptions) return message;
      const votes = message.pollVotes || message.pollOptions.map(() => 0);
      return { ...message, pollVoters: { ...(message.pollVoters || {}), [currentUserKey]: optionIndex }, pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count) };
    }));
    if (targetMessage.docId) {
      const votes = targetMessage.pollVotes || targetMessage.pollOptions.map(() => 0);
      updateDoc(doc(db, COMMUNITY_FEED, targetMessage.docId), { pollVotes: votes.map((count, index) => index === optionIndex ? count + 1 : count), [`pollVoters.${currentUserKey}`]: optionIndex }).catch((error) => console.warn('Message poll vote update failed', error));
    }
  };

  const closeShareComposer = () => {
    setShareTarget(null);
    setShareRecipientSearch('');
    setShareCaption('');
    setShareSendingId('');
    setShareFeedback('');
  };

  const openShareComposer = (target: ShareTarget) => {
    if (!guardedAuth.currentUser || !currentUserKey) {
      redirectToAuth();
      return;
    }

    setShareTarget(target);
    setShareRecipientSearch('');
    setShareCaption('');
    setShareSendingId('');
    setShareFeedback('');
  };

  const getCreatorDisplayName = (creator?: Creator) => {
    if (!creator) return 'Private chat';
    return isOwnCommunityId(creator.id) ? 'Saved messages' : creator.name;
  };

  const getCreatorSubtitle = (creator?: Creator) => {
    if (!creator) return 'Private · Firebase synced · Auto-hidden after 30 days';
    return isOwnCommunityId(creator.id) ? 'Only you can see this' : 'Private · Firebase synced · Auto-hidden after 30 days';
  };

  const buildSharedItemFromTarget = (target: ShareTarget): PrivateSharedItem => {
    if (target.sourceType === 'status') {
      const status = target.status;

      return {
        sourceType: 'status',
        sourceId: status.docId || String(status.id),
        sourceCollection: COMMUNITY_STATUS,
        sourceOwnerId: status.ownerId,
        title: status.title || 'Shared status',
        previewText: status.body || status.slots || 'Status story',
        imageUrl: status.imagePreview,
        imageLayout: status.imageLayout || 'original',
        storagePath: undefined,
        originalCreatedAt: status.createdAt,
        originalExpiresAt: status.expiresAt,
      };
    }

    const message = target.message;

    return {
      sourceType: 'feed_message',
      sourceId: message.docId || String(message.id),
      sourceCollection: COMMUNITY_FEED,
      sourceOwnerId: message.ownerId || message.creatorId,
      title: message.title || 'Shared post',
      previewText: message.body || message.badge || 'Community feed post',
      imageUrl: message.imagePreview,
      imageLayout: message.imageLayout || 'thumbnail',
      storagePath: undefined,
      originalCreatedAt: message.createdAt,
      originalExpiresAt: message.expiresAt,
    };
  };

  const copySharedMediaIfNeeded = async (_conversationId: string, _messageId: string, sharedItem: PrivateSharedItem) => {
    return {
      ...sharedItem,
      storagePath: undefined,
    };
  };

  const sendSharedItemToPrivateChat = async (receiver: Creator) => {
    if (!shareTarget || !guardedAuth.currentUser || !currentUserKey) {
      redirectToAuth();
      return;
    }

    const conversationId = getPrivateConversationId(currentUserKey, receiver.id);
    const existingConversation = privateConversations.find((conversation) => conversation.id === conversationId);
    const messageId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = Date.now();
    const expiresAt = createdAt + PRIVATE_CHAT_TTL_MS;
    const caption = shareCaption.trim();
    let copiedStoragePath = '';
    let archiveStoragePath = '';

    setShareSendingId(receiver.id);
    setShareFeedback('');

    try {
      await ensurePrivateConversation(conversationId, receiver);

      const sharedItem = await copySharedMediaIfNeeded(conversationId, messageId, buildSharedItemFromTarget(shareTarget));
      copiedStoragePath = sharedItem.storagePath || '';

      const messagePayload: PrivateChatMessage = {
        id: messageId,
        conversationId,
        senderId: currentUserKey,
        receiverId: receiver.id,
        senderName: profile.name,
        receiverName: getCreatorDisplayName(receiver),
        type: 'shared_item',
        caption: caption || undefined,
        sharedItem,
        storagePath: sharedItem.storagePath,
        uploadBytes: 0,
        createdAt,
        expiresAt,
        readBy: { [currentUserKey]: true },
        status: 'sent',
      };

      archiveStoragePath = await uploadPrivateChatMessageArchive(conversationId, messageId, messagePayload);
      messagePayload.archiveStoragePath = archiveStoragePath;

      await setDoc(doc(db, PRIVATE_CHATS, conversationId, PRIVATE_CHAT_MESSAGES, messageId), stripUndefinedDeep(messagePayload));

      await setDoc(doc(db, PRIVATE_CHATS, conversationId), stripUndefinedDeep({
        participants: getPrivateConversationParticipants(currentUserKey, receiver.id),
        participantMap: getPrivateParticipantMap(getPrivateConversationParticipants(currentUserKey, receiver.id)),
        participantNames: {
          [currentUserKey]: profile.name,
          [receiver.id]: getCreatorDisplayName(receiver),
        },
        participantAvatars: { [currentUserKey]: profile.avatar, [receiver.id]: receiver.avatar },
        updatedAt: createdAt,
        lastMessage: shareTarget.sourceType === 'status' ? '↗️ Shared status' : '↗️ Shared post',
        lastMessageType: 'shared_item',
        lastMessageAt: createdAt,
        lastSenderId: currentUserKey,
        unreadCounts: {
          ...(existingConversation?.unreadCounts || {}),
          [receiver.id]: receiver.id === currentUserKey ? 0 : (existingConversation?.unreadCounts?.[receiver.id] || 0) + 1,
          [currentUserKey]: 0,
        },
      }), { merge: true });

      setSelectedChatId(receiver.id);
      setShareFeedback(`Shared to ${getCreatorDisplayName(receiver)}.`);
    } catch (error) {
      console.warn('Shared item send failed', error);
      if (copiedStoragePath) {
        deleteObject(ref(storage, copiedStoragePath)).catch((deleteError) => console.warn('Shared media rollback failed', deleteError));
      }
      if (archiveStoragePath) {
        deleteObject(ref(storage, archiveStoragePath)).catch((deleteError) => console.warn('Shared message archive rollback failed', deleteError));
      }
      setShareFeedback('Could not share. Please try again.');
    } finally {
      setShareSendingId('');
    }
  };

  const submitMasterTag = async () => {
    const targetName = (selectedMaster?.name || masterSearch).trim();
    const detail = masterTagDetail.trim().replace(/\s+/g, ' ');
    const duplicateKey = normalizeSearchText(`${selectedMaster?.id || targetName} ${detail}`);
    const authorDuplicate = masterTagRequests.some((request) => isOwnCommunityId(request.ownerId) && normalizeSearchText(`${request.targetMasterId || request.targetMasterName || request.title} ${request.detail}`) === duplicateKey);

    setComposerError('');
    if (!guardedAuth.currentUser && !authEmail) { setComposerError('Please login before publishing a master tag.'); return; }
    if (!targetName) { setComposerError('Search and select a public master, or type an external master name.'); return; }
    if (detail.length < MASTER_TAG_MESSAGE_MIN) { setComposerError(`Appreciation message must be at least ${MASTER_TAG_MESSAGE_MIN} characters.`); return; }
    if (detail.length > MASTER_TAG_MESSAGE_MAX) { setComposerError(`Appreciation message must stay under ${MASTER_TAG_MESSAGE_MAX} characters.`); return; }
    if (authorDuplicate) { setComposerError('You already published this exact appreciation for this master. Try adding a fresh thought.'); return; }
    if (isSubmittingMasterTag) return;

    const draftSnapshot = { masterSearch, selectedMaster, detail: masterTagDetail, category: masterTagCategory, tagType: masterTagType };
    const requestId = Date.now();
    const targetSubject = selectedMaster?.subjects?.[0] || selectedMaster?.masterTags?.[0] || masterTagCategory;
    const title = targetName;
    const normalizedSearchText = normalizeSearchText([profile.name, profile.username, targetName, selectedMaster?.username, selectedMaster?.role, targetSubject, masterTagCategory, masterTagType, detail].filter(Boolean).join(' '));
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
      ownerId: currentUserKey,
      targetMasterId: selectedMaster?.id,
      targetMasterName: targetName,
      targetMasterAvatar: selectedMaster?.avatar || '🌟',
      targetMasterUsername: selectedMaster?.username,
      targetMasterRole: selectedMaster?.role || (selectedMaster ? 'Community master' : 'External master'),
      targetMasterSubject: targetSubject,
      tagType: masterTagType,
      visibility: 'public',
      isExternalMaster: !selectedMaster,
      verifiedMaster: Boolean(selectedMaster?.verified),
      status: 'active',
      normalizedSearchText,
      searchTokens: buildSearchTokens(profile.name, profile.username, targetName, selectedMaster?.username, selectedMaster?.role, targetSubject, masterTagCategory, masterTagType, detail),
      createdAt: Date.now(),
    };

    setIsSubmittingMasterTag(true);
    try {
      const docRef = await addDoc(collection(db, COMMUNITY_MASTER_TAGS), stripUndefinedDeep({ ...request, authorId: currentUserKey, authorName: profile.name, authorAvatar: profile.avatar, message: detail, subject: targetSubject, createdAt: Date.now(), updatedAt: Date.now(), likedByUsers: {}, reactionUsers: {} }));
      const publishedRequest = { ...request, docId: docRef.id };
      const supportTicket: CommunitySupportTicket = { ...buildMasterTagTicket(publishedRequest), customerUid: currentUserKey };
      const updatedTickets = mergeSeedSupportTickets([supportTicket, ...readJsonArray<CommunitySupportTicket>(SUPPORT_TICKETS_STORAGE_KEY, []).filter((ticket) => ticket.id !== supportTicket.id)]);
      localStorage.setItem(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify(updatedTickets));
      setDoc(doc(db, SUPPORT_TICKETS_COLLECTION, supportTicket.id), stripUndefinedDeep(supportTicket)).catch((error) => console.warn('Master tag ticket Firebase write failed', error));
      window.dispatchEvent(new Event('siteSupportTicketsUpdated'));
      setSupportTickets(updatedTickets);
      setMasterTagRequests((current) => [publishedRequest, ...current.filter((item) => item.id !== publishedRequest.id)]);
      setMasterTagFilter('All');
      setMasterTagsAudienceFilter('all');
      setSelectedMasterTagId(publishedRequest.id);
      setMasterTagSuccess(publishedRequest);
      setMasterSearch('');
      setSelectedMaster(null);
      setMasterTagDetail('');
      setMasterTagCategory('Motivation');
      setPage('masterTags');
      setPageStack([]);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.warn('Master tag Firebase write failed; restoring draft fallback', error);
      setMasterSearch(draftSnapshot.masterSearch);
      setSelectedMaster(draftSnapshot.selectedMaster);
      setMasterTagDetail(draftSnapshot.detail);
      setMasterTagCategory(draftSnapshot.category);
      setMasterTagType(draftSnapshot.tagType);
      setComposerError('Master tag failed to publish. Your draft was kept — please retry when your connection is stable.');
    } finally {
      setIsSubmittingMasterTag(false);
    }
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

  const publicMasterCandidates = useMemo(() => allCreators.filter((creator) => creator.isPublic !== false && !creator.isSuspended && !isOwnCommunityId(creator.id)), [allCreators, currentUserKey]);
  const masterSearchResults = useMemo(() => {
    const query = masterSearch.trim();
    if (selectedMaster && normalizeSearchText(query) === normalizeSearchText(selectedMaster.name)) return [selectedMaster];
    return publicMasterCandidates
      .map((creator) => ({ creator, score: scoreCreatorSearch(creator, query) }))
      .filter(({ score }) => normalizeSearchText(query) ? score > 0 : true)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ creator }) => creator);
  }, [masterSearch, publicMasterCandidates, selectedMaster]);
  const masterTagPreview: MasterTagRequest = {
    id: 0,
    author: profile.name || 'You',
    avatar: profile.avatar || '🧑‍🎓',
    category: masterTagCategory,
    title: selectedMaster?.name || masterSearch || 'A respected master',
    detail: masterTagDetail || 'Write what you learned from this master and why you appreciate them…',
    time: 'Preview',
    likes: 0,
    reactions: {},
    targetMasterName: selectedMaster?.name || masterSearch || 'A respected master',
    targetMasterAvatar: selectedMaster?.avatar || '🌟',
    targetMasterUsername: selectedMaster?.username,
    targetMasterRole: selectedMaster?.role || (masterSearch.trim() ? 'External master' : 'Teacher / mentor'),
    targetMasterSubject: selectedMaster?.subjects?.[0] || selectedMaster?.masterTags?.[0] || masterTagCategory,
    tagType: masterTagType,
    isExternalMaster: !selectedMaster && Boolean(masterSearch.trim()),
    verifiedMaster: Boolean(selectedMaster?.verified),
  };
  const normalizedMasterTagQuery = normalizeSearchText(masterTagSearch);
  const audienceFilteredMasterTagRequests = masterTagRequests.filter((request) => {
    if (request.status && request.status !== 'active') return false;
    if (request.visibility && request.visibility !== 'public' && !isOwnCommunityId(request.ownerId)) return false;
    if (masterTagsAudienceFilter === 'mine') return isOwnCommunityId(request.ownerId) || request.author.trim().toLowerCase() === profile.name.trim().toLowerCase();
    if (masterTagsAudienceFilter === 'following') return Boolean(request.targetMasterId && followedByCreatorIds[request.targetMasterId]);
    if (masterTagsAudienceFilter === 'verified') return Boolean(request.verifiedMaster);
    return true;
  });
  const filteredMasterTagRequests = audienceFilteredMasterTagRequests
    .filter((request) => masterTagFilter === 'All' || request.category === masterTagFilter)
    .filter((request) => !normalizedMasterTagQuery || normalizeSearchText([request.targetMasterName, request.targetMasterUsername, request.targetMasterRole, request.targetMasterSubject, request.author, request.category, request.detail, request.normalizedSearchText, ...(request.searchTokens || [])].join(' ')).includes(normalizedMasterTagQuery))
    .sort((a, b) => masterTagSort === 'appreciated' ? b.likes - a.likes : masterTagSort === 'trending' ? (b.likes + Object.values(b.reactions || {}).reduce((x, y) => Number(x) + Number(y), 0)) - (a.likes + Object.values(a.reactions || {}).reduce((x, y) => Number(x) + Number(y), 0)) : (b.createdAt || b.id) - (a.createdAt || a.id));
  const selectedMasterTag = masterTagRequests.find((request) => request.id === selectedMasterTagId) || null;
  const masterTagAdminReplies = useMemo(() => supportTickets.reduce<Record<number, CommunitySupportTicket>>((replyMap, ticket) => {
    if (ticket.source === 'masterTag' && ticket.communityThreadId && ticket.adminReply) replyMap[ticket.communityThreadId] = ticket;
    return replyMap;
  }, {}), [supportTickets]);
  const selectedMasterTagReply = selectedMasterTag ? masterTagAdminReplies[selectedMasterTag.id] : undefined;
  const masterTagGroupedRequests = masterTagCategories.map((category) => ({
    category,
    requests: filteredMasterTagRequests.filter((request) => request.category === category),
  })).filter((group) => group.requests.length);
  const trendingMasterTags = [...masterTagRequests].filter((request) => !request.status || request.status === 'active').sort((a, b) => b.likes - a.likes).slice(0, 5);
  const relatedMasterTags = selectedMasterTag ? masterTagRequests
    .filter((request) => request.id !== selectedMasterTag.id && (!request.status || request.status === 'active') && (
      (selectedMasterTag.targetMasterId && request.targetMasterId === selectedMasterTag.targetMasterId) ||
      (selectedMasterTag.targetMasterName && request.targetMasterName === selectedMasterTag.targetMasterName) ||
      request.category === selectedMasterTag.category
    ))
    .slice(0, 4) : [];

  const renderMasterTagCard = (request: MasterTagRequest, compact = false) => (
    <article key={request.id || 'preview'} className={`group rounded-[1.75rem] border border-[#D9E7F8] bg-white p-4 shadow-[0_18px_54px_rgba(23,105,255,0.10)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(123,97,255,0.16)] ${masterTagSuccess?.id === request.id ? 'ring-4 ring-[#F5B82E]/25' : ''} ${compact ? 'p-4' : 'sm:p-5'}`}>
      <div className="flex items-start gap-3">
        <Avatar value={request.targetMasterAvatar || request.avatar || '🌟'} size="h-13 w-13" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-black text-[#081A45]">{request.targetMasterName || request.title}</h3>{request.verifiedMaster ? <span className="rounded-full bg-[#E8F2FF] px-2 py-0.5 text-[10px] font-black text-[#1769FF]">✓ Verified</span> : null}{request.isExternalMaster ? <span className="rounded-full bg-[#FEF7E0] px-2 py-0.5 text-[10px] font-black text-[#9A6500]">External</span> : null}</div>
          <p className="mt-1 text-xs font-bold text-[#7C879A]">{request.targetMasterRole || request.tagType || 'Master'}{request.targetMasterUsername ? ` · @${request.targetMasterUsername}` : ''}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#EEF6FF] px-3 py-1 text-[11px] font-black text-[#1769FF]">{request.category}</span>
      </div>
      <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#536178] sm:text-base">“{request.detail}”</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF6FF] pt-4">
        <div className="flex min-w-0 items-center gap-2"><Avatar value={request.avatar} size="h-8 w-8" /><p className="truncate text-xs font-bold text-[#7C879A]">Tagged by <span className="text-[#081A45]">{request.author}</span> · {request.time}</p></div>
        <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); if (request.id) likeMasterTag(request.id); }} className={`rounded-full px-3 py-1.5 text-xs font-black transition ${(request.likedByUsers?.[currentUserKey] || likedMasterTagIds.includes(request.id)) ? 'bg-[#FCE8E6] text-[#C5221F]' : 'bg-[#EEF6FF] text-[#1769FF] hover:bg-[#E8F2FF]'}`}>💛 {request.likes}</button>{!compact && <button type="button" ref={selectedMasterTagId === request.id ? masterTagViewReturnRef : undefined} onClick={(event) => { event.stopPropagation(); if (request.id) openMasterTagDetail(request.id, event.currentTarget); }} aria-label={`View master tag from ${request.targetMasterName || request.title || request.author}`} className="rounded-full bg-[#081A45] px-3 py-1.5 text-xs font-black text-white transition hover:-translate-y-0.5 hover:bg-[#1769FF] focus:outline-none focus:ring-4 focus:ring-[#1769FF]/20">View</button>}</div>
      </div>
    </article>
  );

  const openMasterTagDetail = (requestId: number, returnButton?: HTMLButtonElement | null) => {
    const target = masterTagRequests.find((request) => request.id === requestId);
    setSelectedMasterTagId(requestId);
    setMasterTagDetailFeedback(target && target.status && target.status !== 'active' ? 'This master tag is no longer available.' : '');
    setIsMasterTagDetailOpen(true);
    if (returnButton) masterTagViewReturnRef.current = returnButton;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('masterTagId', String(requestId));
      window.history.pushState({ ...(window.history.state || {}), dcView: 'community', dcCommunityMasterTagId: requestId }, '', url.toString());
    }
    requestAnimationFrame(() => masterTagDetailPanelRef.current?.focus());
  };

  const closeMasterTagDetail = () => {
    setIsMasterTagDetailOpen(false);
    setMasterTagDetailFeedback('');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('masterTagId');
      window.history.replaceState({ ...(window.history.state || {}), dcView: 'community' }, '', url.toString());
    }
    requestAnimationFrame(() => masterTagViewReturnRef.current?.focus());
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !masterTagRequests.length) return;
    const rawTagId = new URL(window.location.href).searchParams.get('masterTagId');
    const tagId = rawTagId ? Number(rawTagId) : 0;
    if (!tagId || Number.isNaN(tagId) || isMasterTagDetailOpen) return;
    setPage('masterTags');
    setSelectedMasterTagId(tagId);
    setIsMasterTagDetailOpen(true);
    const target = masterTagRequests.find((request) => request.id === tagId);
    setMasterTagDetailFeedback(target && target.status && target.status !== 'active' ? 'This master tag is no longer available.' : '');
  }, [isMasterTagDetailOpen, masterTagRequests]);

  useEffect(() => {
    if (!isMasterTagDetailOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMasterTagDetail(); };
    window.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => masterTagDetailPanelRef.current?.focus());
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMasterTagDetailOpen]);

  const renderMasterTagUnavailable = () => (
    <div className="rounded-[2rem] border border-dashed border-[#D9E7F8] bg-white p-8 text-center shadow-[0_20px_60px_rgba(23,105,255,0.10)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6FF] text-2xl">🏷️</div>
      <h3 className="mt-4 text-2xl font-black text-[#081A45]">This master tag is no longer available.</h3>
      <p className="mt-2 text-sm font-bold leading-6 text-[#536178]">It may have been deleted, hidden, or it is not visible to your account.</p>
      <button type="button" onClick={closeMasterTagDetail} className="mt-5 rounded-2xl bg-[#1769FF] px-5 py-3 text-sm font-black text-white">Back to Master Tags</button>
    </div>
  );

  const renderMasterTagDetailContent = () => {
    if (!selectedMasterTag || (selectedMasterTag.status && selectedMasterTag.status !== 'active')) return renderMasterTagUnavailable();

    const appreciated = Boolean(selectedMasterTag.likedByUsers?.[currentUserKey] || likedMasterTagIds.includes(selectedMasterTag.id));
    const related = relatedMasterTags.filter((tag) => !tag.status || tag.status === 'active');
    const masterName = selectedMasterTag.targetMasterName || selectedMasterTag.title || 'Community Master';

    return (
      <div className="space-y-4">
        {masterTagDetailFeedback ? <div className="rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] px-4 py-3 text-sm font-black text-[#C5221F]">{masterTagDetailFeedback}</div> : null}
        <section className="relative overflow-hidden rounded-[2rem] border border-[#D9E7F8] bg-gradient-to-br from-[#EEF6FF] via-white to-[#F1EEFF] p-5 shadow-[0_24px_70px_rgba(23,105,255,0.14)] sm:p-6">
          <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#7B61FF]/12 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <Avatar value={selectedMasterTag.targetMasterAvatar || selectedMasterTag.avatar || '🌟'} size="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 truncate text-2xl font-black text-[#081A45] sm:text-3xl">{masterName}</h2>{selectedMasterTag.verifiedMaster ? <span className="rounded-full bg-[#E8F2FF] px-2 py-1 text-[10px] font-black text-[#1769FF]">✓ Verified</span> : null}{selectedMasterTag.isExternalMaster ? <span className="rounded-full bg-[#FEF7E0] px-2 py-1 text-[10px] font-black text-[#9A6500]">External</span> : null}</div>
              <p className="mt-1 text-sm font-bold text-[#536178]">{selectedMasterTag.targetMasterRole || selectedMasterTag.tagType || 'Community Master'}{selectedMasterTag.targetMasterUsername ? ` · @${selectedMasterTag.targetMasterUsername}` : ''}</p>
              <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#1769FF] shadow-sm">{selectedMasterTag.category}</span><span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#7B61FF] shadow-sm">{selectedMasterTag.tagType || 'Appreciation'}</span>{selectedMasterTag.targetMasterSubject ? <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#536178] shadow-sm">{selectedMasterTag.targetMasterSubject}</span> : null}</div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#D9E7F8] bg-white p-5 shadow-[0_20px_60px_rgba(23,105,255,0.10)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#7B61FF]">Appreciation message</p>
          <p className="mt-4 whitespace-pre-wrap text-lg font-semibold leading-8 text-[#081A45] sm:text-xl sm:leading-9">“{selectedMasterTag.detail}”</p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF6FF] pt-4">
            <div className="flex min-w-0 items-center gap-3"><Avatar value={selectedMasterTag.avatar || '🧑‍🎓'} size="h-10 w-10" /><div className="min-w-0"><p className="truncate text-sm font-black text-[#081A45]">Tagged by {selectedMasterTag.author || 'Eduvora Member'}</p><p className="truncate text-xs font-bold text-[#7C879A]">{selectedMasterTag.time || (selectedMasterTag.createdAt ? new Date(selectedMasterTag.createdAt).toLocaleString() : 'Recently')}</p></div></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => likeMasterTag(selectedMasterTag.id)} className={`min-h-11 rounded-full px-4 text-sm font-black transition ${appreciated ? 'bg-[#FEF7E0] text-[#9A6500]' : 'bg-[#EEF6FF] text-[#1769FF] hover:bg-[#E8F2FF]'}`}>💛 {appreciated ? 'Appreciated' : 'Appreciate'} · {selectedMasterTag.likes}</button><button type="button" onClick={() => { const shareUrl = new URL(window.location.href); shareUrl.searchParams.set('masterTagId', String(selectedMasterTag.id)); navigator.clipboard?.writeText(shareUrl.toString()).then(() => setMasterTagDetailFeedback('Link copied.')).catch(() => setMasterTagDetailFeedback('Share link is ready, but copy failed.')); }} className="min-h-11 rounded-full border border-[#D9E7F8] bg-white px-4 text-sm font-black text-[#536178]">Share</button></div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#D9E7F8] bg-[#F8FBFF] p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#1769FF]">Community response</p>
          <p className="mt-2 text-sm font-semibold leading-7 text-[#536178]">{selectedMasterTagReply?.adminReply || 'No master reply yet. Community members can still appreciate and react respectfully.'}</p>
          <div className="mt-4 flex flex-wrap gap-2">{REACTION_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => reactToMasterTag(selectedMasterTag.id, emoji)} className="min-h-11 rounded-full border border-[#D9E7F8] bg-white px-4 text-sm font-black text-[#081A45] transition hover:border-[#1769FF]">{emoji} {selectedMasterTag.reactions[emoji] || 0}</button>)}</div>
        </section>

        {related.length ? <section className="rounded-[2rem] border border-[#D9E7F8] bg-white p-5 shadow-sm"><h3 className="text-lg font-black text-[#081A45]">Related appreciation</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{related.map((tag) => <button key={tag.id} type="button" onClick={() => openMasterTagDetail(tag.id)} className="rounded-2xl bg-[#F8FBFF] p-3 text-left transition hover:bg-[#EEF6FF]"><p className="truncate text-sm font-black text-[#081A45]">{tag.targetMasterName || tag.title}</p><p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-[#536178]">{tag.detail}</p><span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#1769FF]">💛 {tag.likes}</span></button>)}</div></section> : null}
      </div>
    );
  };

  const renderMasterTagDetailPage = (showBackButton = true) => (
    <div className="space-y-4 pb-28 md:pb-0">
      {showBackButton ? <button type="button" onClick={() => setPage('masterTags')} className="rounded-2xl border border-[#D9E7F8] bg-white px-4 py-3 text-sm font-black text-[#536178] shadow-sm transition hover:bg-[#EEF6FF]">← Back to Master Tags</button> : null}
      {renderMasterTagDetailContent()}
    </div>
  );

  const renderMasterTagDetailOverlay = () => isMasterTagDetailOpen ? (
    <div className="fixed inset-0 z-[1700] flex justify-end bg-[#081A45]/35 p-0 backdrop-blur-[3px] md:p-3" role="dialog" aria-modal="true" aria-label="Master Tag detail">
      <div ref={masterTagDetailPanelRef} tabIndex={-1} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F8FBFF] text-[#081A45] shadow-[0_30px_90px_rgba(8,26,69,0.22)] outline-none md:h-[calc(100dvh-1.5rem)] md:max-w-[560px] md:rounded-[2rem] md:border md:border-[#D9E7F8]">
        <header className="flex shrink-0 items-center gap-3 border-b border-[#D9E7F8] bg-white/94 px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-2xl md:pt-3">
          <button type="button" onClick={closeMasterTagDetail} aria-label="Close master tag detail" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-white text-lg font-black text-[#081A45] shadow-sm">←</button>
          <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.24em] text-[#1769FF]">Master Tag</p><h2 className="truncate text-lg font-black">{selectedMasterTag?.targetMasterName || selectedMasterTag?.title || 'Master Tag'}</h2></div>
          <button type="button" onClick={closeMasterTagDetail} aria-label="Close master tag detail" className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-white text-lg font-black text-[#081A45] shadow-sm md:flex">×</button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] custom-scrollbar md:px-5">
          {renderMasterTagDetailContent()}
        </main>
      </div>
    </div>
  ) : null;

  const renderTagMasterPage = () => (
    <div className="mx-auto max-w-7xl space-y-5 pb-28 md:pb-6">
      <section className="overflow-hidden rounded-[2rem] border border-[#D9E7F8] bg-gradient-to-br from-[#F8FBFF] via-white to-[#EEF6FF] p-4 shadow-[0_30px_90px_rgba(23,105,255,0.14)] sm:p-6 lg:p-8">
        <div className="rounded-[1.8rem] bg-gradient-to-br from-[#1769FF] via-[#7B61FF] to-[#081A45] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[0.28em] text-white/75">Tag Your Master</p><h2 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Appreciate the person who helped you grow.</h2><p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-white/82 sm:text-base">Write a respectful public appreciation for a teacher, mentor, creator, senior, or community master. Your tag becomes part of the Eduvora appreciation wall.</p></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="rounded-[1.8rem] border border-[#D9E7F8] bg-white p-4 shadow-sm sm:p-6">
            <label className="text-sm font-black text-[#081A45]">Search/select master</label>
            <input value={masterSearch} onChange={(event) => { setMasterSearch(event.target.value); setSelectedMaster(null); }} placeholder="Search by name, username, subject, role…" className="mt-2 h-12 w-full rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] px-4 text-sm font-bold outline-none focus:border-[#1769FF]" />
            <div className="mt-3 space-y-2">{masterSearchResults.length ? masterSearchResults.map((creator) => <button key={creator.id} type="button" onClick={() => { setSelectedMaster(creator); setMasterSearch(creator.name); }} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedMaster?.id === creator.id ? 'border-[#1769FF] bg-[#EEF6FF]' : 'border-[#D9E7F8] bg-white hover:bg-[#F8FBFF]'}`}><Avatar value={creator.avatar} size="h-10 w-10" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-[#081A45]">{creator.name} {creator.verified ? '✓' : ''}</span><span className="block truncate text-xs font-bold text-[#7C879A]">@{creator.username} · {creator.role} · {[...(creator.subjects || []), ...(creator.masterTags || [])].slice(0, 2).join(', ') || 'Community profile'}</span></span></button>) : <div className="rounded-2xl border border-dashed border-[#D9E7F8] bg-[#F8FBFF] p-4 text-sm font-bold text-[#7C879A]">No master found. Try searching by name, subject, or username. You can still tag an external master by keeping the typed name.</div>}</div>
            <label className="mt-5 block text-sm font-black text-[#081A45]">Appreciation message</label>
            <textarea value={masterTagDetail} maxLength={MASTER_TAG_MESSAGE_MAX} onChange={(event) => setMasterTagDetail(event.target.value)} placeholder="Write what you learned from this master and why you appreciate them…" rows={6} className="mt-2 min-h-[140px] w-full resize-none rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] px-4 py-3 text-sm font-semibold leading-7 outline-none focus:border-[#1769FF]" />
            <div className="mt-2 flex justify-between text-xs font-black"><span className={masterTagDetail.trim().length && masterTagDetail.trim().length < MASTER_TAG_MESSAGE_MIN ? 'text-[#EF4444]' : 'text-[#7C879A]'}>{MASTER_TAG_MESSAGE_MIN}-{MASTER_TAG_MESSAGE_MAX} characters</span><span className="text-[#1769FF]">{masterTagDetail.length}/{MASTER_TAG_MESSAGE_MAX}</span></div>
            <div className="mt-5"><p className="text-sm font-black text-[#081A45]">Category / subject</p><div className="mt-2 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">{masterTagCategories.map((category) => <button key={category} type="button" onClick={() => setMasterTagCategory(category)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${masterTagCategory === category ? 'border-[#1769FF] bg-[#1769FF] text-white' : 'border-[#D9E7F8] bg-white text-[#536178]'}`}>{category}</button>)}</div></div>
            <div className="mt-5"><p className="text-sm font-black text-[#081A45]">Tag type</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{masterTagTypes.map((type) => <button key={type} type="button" onClick={() => setMasterTagType(type)} className={`rounded-2xl border px-3 py-2 text-xs font-black ${masterTagType === type ? 'border-[#7B61FF] bg-[#F2EFFF] text-[#5B42D6]' : 'border-[#D9E7F8] bg-white text-[#536178]'}`}>{type}</button>)}</div></div>
            {composerError ? <div className="mt-4 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] px-4 py-3 text-sm font-black text-[#C5221F]">{composerError}</div> : null}
            <button type="button" onClick={submitMasterTag} disabled={isSubmittingMasterTag || !masterSearch.trim() || masterTagDetail.trim().length < MASTER_TAG_MESSAGE_MIN} className="mt-5 w-full rounded-2xl bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-5 py-4 text-sm font-black text-white shadow-[0_16px_42px_rgba(23,105,255,0.28)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55">{isSubmittingMasterTag ? 'Publishing…' : 'Publish Master Tag'}</button>
          </div>
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start"><div><p className="mb-2 px-1 text-xs font-black uppercase tracking-[0.24em] text-[#1769FF]">Live preview</p>{renderMasterTagCard(masterTagPreview, true)}</div><div className="rounded-[1.8rem] border border-[#D9E7F8] bg-white p-5"><h3 className="text-lg font-black text-[#081A45]">Why tag a master?</h3><p className="mt-2 text-sm font-semibold leading-7 text-[#536178]">Specific, kind appreciation helps learners discover respected teachers and reminds mentors their work matters.</p><div className="mt-4 space-y-2 text-sm font-bold text-[#536178]"><p>• “I learned ___ because you explained ___.”</p><p>• “Your guidance helped me stay consistent with ___.”</p><p>• “Thank you for making ___ feel possible.”</p></div></div><div className="rounded-[1.8rem] border border-[#D9E7F8] bg-white p-5"><h3 className="text-lg font-black text-[#081A45]">Trending appreciation</h3><div className="mt-3 space-y-2">{trendingMasterTags.slice(0, 3).map((tag) => <button key={tag.id} type="button" onClick={() => openMasterTagDetail(tag.id)} className="flex w-full items-center justify-between rounded-2xl bg-[#F8FBFF] px-3 py-2 text-left text-xs font-black text-[#536178]"><span className="truncate">{tag.targetMasterName || tag.title}</span><span>💛 {tag.likes}</span></button>)}</div></div></aside>
        </div>
      </section>
    </div>
  );

  const renderMasterTagFilters = (compact = false) => (
    <div className={compact ? 'space-y-4' : 'rounded-[2rem] border border-[#D9E7F8] bg-gradient-to-br from-[#EEF6FF] via-white to-[#F8FBFF] p-5 shadow-[0_24px_70px_rgba(23,105,255,0.12)] sm:p-7'}>
      <p className="text-xs font-black uppercase tracking-[0.28em] text-[#1769FF]">Master Tags</p><h2 className="mt-2 text-3xl font-black tracking-tight text-[#081A45] sm:text-5xl">A community wall of gratitude.</h2><p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-[#536178]">Discover masters through respectful appreciation posts, filter by category, and search names, subjects, authors, or message words.</p>
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]"><input value={masterTagSearch} onChange={(event) => setMasterTagSearch(event.target.value)} placeholder="Search master tags…" className="h-12 rounded-2xl border border-[#D9E7F8] bg-white px-4 text-sm font-bold outline-none focus:border-[#1769FF]" /><select value={masterTagSort} onChange={(event) => setMasterTagSort(event.target.value as typeof masterTagSort)} className="h-12 rounded-2xl border border-[#D9E7F8] bg-white px-4 text-sm font-black text-[#081A45]"><option value="recent">Recent</option><option value="appreciated">Most appreciated</option><option value="trending">Trending</option></select></div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">{(['all', 'mine', 'following', 'verified'] as const).map((filter) => <button key={filter} type="button" onClick={() => setMasterTagsAudienceFilter(filter)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black capitalize ${masterTagsAudienceFilter === filter ? 'border-[#1769FF] bg-[#1769FF] text-white' : 'border-[#D9E7F8] bg-white text-[#536178]'}`}>{filter === 'all' ? 'All' : filter}</button>)}{(['All', ...masterTagCategories] as Array<'All' | (typeof masterTagCategories)[number]>).map((category) => <button key={category} type="button" onClick={() => setMasterTagFilter(category)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black ${masterTagFilter === category ? 'border-[#7B61FF] bg-[#7B61FF] text-white' : 'border-[#D9E7F8] bg-white text-[#536178]'}`}>{category}</button>)}</div>
    </div>
  );

  const renderMasterTagRows = () => filteredMasterTagRequests.length ? filteredMasterTagRequests.map((request) => <div key={request.id} role="button" tabIndex={0} onClick={() => openMasterTagDetail(request.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openMasterTagDetail(request.id); }}>{renderMasterTagCard(request)}</div>) : <div className="rounded-[2rem] border border-dashed border-[#D9E7F8] bg-white p-10 text-center"><h3 className="text-2xl font-black text-[#081A45]">No master tags found</h3><p className="mt-2 text-sm font-bold text-[#7C879A]">Try another search/category or be the first to appreciate someone who helped you grow.</p><button type="button" onClick={() => setPage('tagMaster')} className="mt-5 rounded-2xl bg-[#1769FF] px-5 py-3 text-sm font-black text-white">Tag your first master</button></div>;

  const renderMasterTagsPage = () => (
    <div className="mx-auto max-w-7xl pb-28 md:pb-6">
      <div className="space-y-5 md:hidden">{renderMasterTagFilters()}<div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">{trendingMasterTags.slice(0, 6).map((tag) => <button key={tag.id} onClick={() => openMasterTagDetail(tag.id)} className="min-w-[220px] rounded-2xl border border-[#D9E7F8] bg-white p-3 text-left shadow-sm"><p className="truncate text-sm font-black text-[#081A45]">{tag.targetMasterName || tag.title}</p><p className="mt-1 text-xs font-bold text-[#7C879A]">💛 {tag.likes} appreciations</p></button>)}</div><div className="space-y-3">{renderMasterTagRows()}</div><button type="button" onClick={() => setPage('tagMaster')} className="fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] right-4 z-[1200] rounded-full bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-5 py-3 text-sm font-black text-white shadow-[0_18px_48px_rgba(23,105,255,0.32)]">+ Tag</button></div>
      <div className="hidden grid-cols-[minmax(0,1fr)_330px] gap-6 md:grid"><main className="space-y-5">{renderMasterTagFilters()}<div className="grid gap-4 xl:grid-cols-2">{renderMasterTagRows()}</div></main><aside className="space-y-4"><div className="rounded-[2rem] border border-[#D9E7F8] bg-white p-5 shadow-sm"><h3 className="text-xl font-black text-[#081A45]">Trending masters</h3><div className="mt-3 space-y-2">{trendingMasterTags.map((tag) => <button key={tag.id} onClick={() => openMasterTagDetail(tag.id)} className="flex w-full items-center gap-3 rounded-2xl bg-[#F8FBFF] p-3 text-left"><Avatar value={tag.targetMasterAvatar || '🌟'} size="h-9 w-9" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-[#081A45]">{tag.targetMasterName || tag.title}</span><span className="text-xs font-bold text-[#7C879A]">💛 {tag.likes} · {tag.category}</span></span></button>)}</div></div><div className="rounded-[2rem] border border-[#D9E7F8] bg-white p-5 shadow-sm"><h3 className="text-xl font-black text-[#081A45]">Top categories</h3><div className="mt-3 flex flex-wrap gap-2">{masterTagCategories.slice(0, 8).map((category) => <button key={category} onClick={() => setMasterTagFilter(category)} className="rounded-full bg-[#EEF6FF] px-3 py-2 text-xs font-black text-[#1769FF]">{category}</button>)}</div></div><button type="button" onClick={() => setPage('tagMaster')} className="w-full rounded-2xl bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-5 py-4 text-sm font-black text-white shadow-[0_18px_48px_rgba(23,105,255,0.24)]">Tag Your Master</button></aside></div>
    </div>
  );

  const MessageSummaryCard: React.FC<{ message: FeedMessage; isActive?: boolean }> = ({ message, isActive = false }) => (
    <article className={`overflow-hidden rounded-[1.35rem] border bg-white shadow-sm transition duration-300 ${isActive ? 'border-[#1769FF] bg-[#F8FBFF] shadow-[0_14px_34px_rgba(26,115,232,0.10)] ring-2 ring-[#E8F2FF]' : 'border-[#D9E7F8] hover:border-[#BFD7FF] hover:bg-[#F8FBFF]'}`}>
      <button type="button" onClick={() => openMessage(message.id)} className={`flex w-full items-center gap-3 border-l-4 px-3 py-2.5 text-left transition sm:px-4 ${isActive ? 'border-[#1769FF]' : 'border-transparent'}`}>
        <Avatar value={resolveAvatar(message)} size="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h3 className="truncate text-sm font-black text-[#081A45] sm:text-base">{message.title}</h3>
            <span className="shrink-0 text-[11px] font-black text-[#7C879A]">{message.time}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[#536178] sm:text-xs">
            <span className="truncate">{resolveName(message)}</span>
            <span>•</span>
            <span className="rounded-full border border-[#D9E7F8] bg-[#F8FBFF] px-2 py-0.5 text-[#1769FF]">{message.badge}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#FCE8E6] px-2 py-1 text-[11px] font-black text-[#C5221F]">❤️ {message.likeCount || 0}</span>
            <span className="rounded-full bg-[#E8F2FF] px-2 py-1 text-[11px] font-black text-[#1769FF]">💬 {message.replyCount || message.replies.length}</span>
            <button type="button" onClick={(event) => { event.stopPropagation(); openShareComposer({ sourceType: 'feed_message', message }); }} className="rounded-full border border-[#D9E7F8] bg-white px-2 py-1 text-[11px] font-black text-[#081A45] transition hover:border-[#1769FF] hover:text-[#1769FF]">↗️ Share</button>
            {REACTION_EMOJIS.slice(0, 3).map((emoji) => <button key={emoji} type="button" onClick={(event) => { event.stopPropagation(); reactToMessage(message, emoji); }} className="rounded-full border border-[#D9E7F8] bg-white px-2 py-1 text-[11px] font-black text-[#081A45]">{emoji} {(message.reactionCounts || {})[emoji] || 0}</button>)}
          </div>
        </div>
      </button>
    </article>
  );

  const renderReplyBubble = (message: FeedMessage, reply: Reply) => {
    const mine = isOwnCommunityId(reply.ownerId || reply.senderId) || reply.author === profile.name;
    const failed = reply.status === 'failed';
    const deleted = reply.status === 'deleted' || reply.status === 'hidden';
    return (
      <div key={reply.clientMessageId || reply.docId || reply.id} className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
        {!mine ? <Avatar value={reply.avatar || '👤'} size="h-8 w-8" className="mb-1 text-base" /> : null}
        <div className={`max-w-[86%] rounded-[1.45rem] px-4 py-3 shadow-[0_12px_34px_rgba(23,105,255,0.10)] sm:max-w-[74%] ${mine ? 'rounded-br-md bg-gradient-to-r from-[#1769FF] to-[#7B61FF] text-white' : 'rounded-bl-md border border-[#D9E7F8] bg-white text-[#081A45]'}`}>
          {reply.replyToTextPreview ? (
            <button type="button" onClick={() => { setHighlightedThreadId(message.id); setTimeout(() => setHighlightedThreadId(null), 1400); }} className={`mb-2 w-full rounded-2xl border-l-4 px-3 py-2 text-left text-xs font-bold ${mine ? 'border-l-white/80 bg-white/15 text-white/90' : 'border-l-[#7B61FF] bg-[#F1EEFF] text-[#536178]'}`}>
              <span className="block font-black">Replying to {reply.replyToSenderName || resolveName(message)}</span>
              <span className="mt-0.5 block line-clamp-2">{reply.replyToDeleted ? 'Original message unavailable' : reply.replyToTextPreview}</span>
            </button>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {!mine ? <span className="text-xs font-black text-[#1769FF]">{reply.author || 'Member'}</span> : null}
            <span className={`text-[11px] font-bold ${mine ? 'text-white/75' : 'text-[#7C879A]'}`}>{reply.time}</span>
            {reply.status === 'sending' ? <span className={`text-[11px] font-black ${mine ? 'text-white/80' : 'text-[#7C879A]'}`}>Sending…</span> : null}
          </div>
          <p className={`mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 sm:text-base ${deleted ? 'italic opacity-70' : ''}`}>{deleted ? 'This message was deleted' : reply.text}</p>
          {failed ? <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-[#FCE8E6] px-3 py-2 text-xs font-black text-[#C5221F]"><span>Failed to send.</span><button type="button" onClick={() => submitReply(message.id, reply)} disabled={Boolean(replySendingIds[message.id])} className="rounded-full bg-white px-3 py-1 text-[#C5221F] disabled:opacity-50">Retry</button></div> : null}
        </div>
        {mine ? <Avatar value={profile.avatar || reply.avatar || '🧑‍🎓'} size="h-8 w-8" className="mb-1 text-base" /> : null}
      </div>
    );
  };

  const renderMessageDetails = (message: FeedMessage, fullScreen = false) => {
    const draft = replyDrafts[message.id] || '';
    const canSendReply = Boolean(draft.trim()) && !replySendingIds[message.id] && !(typeof navigator !== 'undefined' && !navigator.onLine);
    const threadHighlighted = highlightedThreadId === message.id;
    return (
      <div className={`flex min-h-0 flex-col overflow-hidden bg-[#F8FBFF] ${fullScreen ? 'h-[calc(100dvh-8.75rem)] md:h-[calc(100dvh-10rem)]' : 'h-[calc(100dvh-11rem)] rounded-[1.75rem] border border-[#D9E7F8] shadow-[0_16px_48px_rgba(23,105,255,0.08)]'}`}>
        <div className="sticky top-0 z-10 border-b border-[#D9E7F8] bg-white/95 px-4 py-3 backdrop-blur-xl lg:px-6">
          <div className="flex items-center gap-3">
            <Avatar value={resolveAvatar(message)} size="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-black text-[#081A45] sm:text-lg">{resolveName(message)}</h2><span className="rounded-full bg-[#E8F2FF] px-2.5 py-1 text-[11px] font-black text-[#1769FF]">{message.badge}</span></div>
              <p className="truncate text-xs font-bold text-[#7C879A]">{message.time} · {message.replyCount || message.replies.length} replies</p>
            </div>
            <button type="button" onClick={() => openShareComposer({ sourceType: 'feed_message', message })} className="min-h-11 rounded-2xl border border-[#D9E7F8] bg-white px-4 text-xs font-black text-[#1769FF]">Share</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 pb-6 custom-scrollbar sm:px-5 lg:px-7">
          <article className={`mx-auto max-w-3xl rounded-[1.8rem] border bg-white p-4 shadow-[0_14px_44px_rgba(23,105,255,0.08)] transition ${threadHighlighted ? 'border-[#7B61FF] ring-4 ring-[#F1EEFF]' : 'border-[#D9E7F8]'}`}>
            <h3 className="text-2xl font-black tracking-tight text-[#081A45] lg:text-4xl">{message.title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-8 text-[#536178] sm:text-lg">{message.body}</p>
            {message.imagePreview ? <div className="mt-5 aspect-square max-w-md overflow-hidden rounded-[2rem] border border-[#BFD7FF] bg-gradient-to-br from-[#E8F2FF] via-[#F8FBFF] to-[#F1EEFF] shadow-inner">{renderUploadedImage(message.imagePreview, message.title, message.imageLayout || 'thumbnail')}</div> : null}
            {message.pollOptions ? <div className="mt-5 space-y-3 rounded-[1.6rem] border border-[#CEEAD6] bg-[#E6F4EA] p-4">{message.pollOptions.map((option, index) => { const votes = message.pollVotes || message.pollOptions!.map(() => 0); const total = Math.max(1, votes.reduce((sum, count) => sum + count, 0)); const percent = Math.round((votes[index] / total) * 100); const selectedOption = message.pollVoters?.[currentUserKey]; const selected = selectedOption === index; return <button key={option} type="button" onClick={() => voteOnMessagePoll(message.id, index)} disabled={selectedOption !== undefined} className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left font-black transition disabled:cursor-not-allowed ${selected ? 'border-[#34A853] bg-white text-[#137333]' : 'border-[#CEEAD6] bg-white text-[#081A45] hover:border-[#34A853] disabled:hover:border-[#CEEAD6]'}`}><span className="absolute inset-y-0 left-0 bg-[#CEEAD6]" style={{ width: selectedOption !== undefined ? `${percent}%` : '0%' }} /><span className="relative flex items-center justify-between"><span>{option}</span>{selectedOption !== undefined ? <span>{percent}% · {votes[index]}</span> : <span>Vote</span>}</span></button>; })}</div> : null}
            {renderReactionStrip(message)}<div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => toggleMessageLike(message.id)} className={`rounded-full border px-3 py-1.5 text-sm font-black transition ${(message.likedByUsers?.[currentUserKey] || likedMessages.includes(message.id)) ? 'border-[#F8D7DA] bg-[#FCE8E6] text-[#C5221F]' : 'border-[#D9E7F8] bg-[#E8F2FF] text-[#1769FF]'}`}>❤️ {message.likeCount || 0}</button><span className="rounded-full border border-[#D9E7F8] bg-[#E8F2FF] px-3 py-1.5 text-sm font-black text-[#1769FF]">💬 {message.replyCount || message.replies.length}</span></div>
          </article>
          <div className="mx-auto mt-5 max-w-3xl space-y-3 pb-4">{message.replies.length ? message.replies.map((reply) => renderReplyBubble(message, reply)) : <div className="rounded-[1.6rem] border border-dashed border-[#D9E7F8] bg-white p-6 text-center text-sm font-bold text-[#7C879A]">No replies yet. Start the conversation.</div>}</div>
        </div>
        <div ref={replyComposerRef} data-community-replybar="true" className="shrink-0 border-t border-[#D9E7F8] bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl lg:p-4">
          {expandedReplyId === message.id ? <div className="mx-auto mb-3 max-w-3xl rounded-[1.25rem] border border-[#D9E7F8] bg-[#F1EEFF] px-4 py-3 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#7B61FF]">Replying to {resolveName(message)}</p><p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-[#536178]">{safeText(`${message.title}: ${message.body}`, COMMUNITY_REPLY_PREVIEW_LENGTH)}</p></div><button type="button" onClick={() => setExpandedReplyId(null)} className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#7B61FF]">Cancel</button></div></div> : null}
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea ref={replyInputRef} value={draft} onChange={(event) => setReplyDrafts((current) => ({ ...current, [message.id]: event.target.value.slice(0, COMMUNITY_REPLY_MAX_LENGTH) }))} onFocus={() => { loadRepliesForMessage(message); setExpandedReplyId(message.id); }} placeholder="Write a respectful reply…" maxLength={COMMUNITY_REPLY_MAX_LENGTH} rows={1} className="min-h-12 min-w-0 flex-1 resize-none rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] px-4 py-3 text-sm font-bold leading-6 text-[#081A45] outline-none transition focus:border-[#1769FF] focus:bg-white" />
            <button type="button" onClick={() => submitReply(message.id)} disabled={!canSendReply} className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-4 text-sm font-black text-white shadow-[0_14px_34px_rgba(23,105,255,0.22)] disabled:cursor-not-allowed disabled:opacity-45">{replySendingIds[message.id] ? 'Sending…' : 'Send'}</button>
          </div>
          {typeof navigator !== 'undefined' && !navigator.onLine ? <p className="mx-auto mt-2 max-w-3xl rounded-2xl bg-[#FCE8E6] px-3 py-2 text-xs font-black text-[#C5221F]">Offline — reconnect before sending.</p> : null}
        </div>
      </div>
    );
  };

  const renderFeedLayout = (feedMessages: FeedMessage[], title = 'Chats', subtitle = 'Thin updates. Click to expand on the right.') => {
    const activeMessage = feedMessages.find((message) => message.id === selectedMessageId) || feedMessages[0];
    const isFollowingFeed = title.toLowerCase().includes('followers');
    const isAdminFeed = title.toLowerCase().includes('admin');
    if (!feedMessages.length) return <div className="mx-auto max-w-5xl rounded-[2rem] border border-dashed border-[#C2E7FF] bg-gradient-to-br from-[#F8FAFD] via-white to-[#E8F0FE] p-8 text-center font-bold text-[#536178] shadow-[0_18px_54px_rgba(37,99,235,0.10)]"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white text-3xl shadow-inner">{isAdminFeed ? '📣' : '💬'}</div>{isAdminFeed ? 'No unexpired admin posts are available right now.' : 'No messages yet. Start the conversation.'}</div>;
    return <div className="mx-auto grid h-[clamp(34rem,calc(100dvh-9.5rem),78rem)] min-h-0 w-full min-w-0 max-w-[1600px] gap-4 overflow-hidden lg:gap-5 md:grid-cols-[minmax(0,clamp(18rem,28vw,25rem))_minmax(0,1fr)]"><aside className="hidden h-full min-h-0 min-w-0 overflow-y-auto rounded-[2rem] border border-[#D9E7F8] bg-white p-3 shadow-[0_20px_60px_rgba(23,105,255,0.08)] ring-1 ring-[#EEF6FF] backdrop-blur-xl custom-scrollbar md:block"><div className="space-y-3">{feedMessages.map((message) => <MessageSummaryCard key={message.id} message={message} isActive={activeMessage?.id === message.id} />)}</div></aside><section className="hidden min-h-0 min-w-0 overflow-hidden md:block">{activeMessage ? renderMessageDetails(activeMessage) : null}</section><div className="h-full space-y-3 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+6rem)] custom-scrollbar md:hidden">{feedMessages.map((message) => <MessageSummaryCard key={message.id} message={message} />)}</div></div>;
  };

  const renderTypeComposer = (activeType: PostType, setActiveType: (type: PostType) => void, accent: 'sky' | 'orange' = 'sky', isStatus = false) => {
    const usedTypes = isStatus ? usedStatusTypesToday : usedCreatorTypesToday;
    const activeClass = accent === 'orange'
      ? 'border-[#FDD663] bg-[#FEF7E0] shadow-[0_18px_42px_rgba(251,188,4,0.14)] ring-2 ring-white'
      : 'border-[#C2E7FF] bg-[#E8F0FE] shadow-[0_18px_42px_rgba(26,115,232,0.12)] ring-2 ring-white';

    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {postOptions.map((option) => {
          const isUsedToday = usedTypes.includes(option.type);
          return (
            <button key={option.type} type="button" disabled={isUsedToday} onClick={() => setActiveType(option.type)} className={`rounded-[1.35rem] border p-4 text-left transition duration-300 disabled:cursor-not-allowed disabled:opacity-55 ${isUsedToday ? 'border-[#E0E3EB] bg-[#F1F3F4]' : activeType === option.type ? activeClass : 'border-[#E0E3EB] bg-white hover:-translate-y-1 hover:bg-[#E8F0FE]'}`}>
              <span className="text-3xl">{option.icon}</span>
              <span className="mt-3 block text-lg font-black text-[#202124]">{option.label}</span>
              <span className="mt-1 block text-sm font-bold text-[#5F6368]">{isUsedToday ? 'Used today · unlocks tomorrow' : option.helper}</span>
            </button>
          );
        })}
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

  const renderStatusPoll = (card: StatusCard) => {
    if (!card.pollOptions) return null;

    const selectedOption = card.pollVoters?.[currentUserKey];

    return (
      <div className="mt-4 space-y-2">
        {card.pollOptions.map((option, index) => {
          const votes = card.pollVotes || card.pollOptions!.map(() => 0);
          const total = Math.max(1, votes.reduce((sum, count) => sum + count, 0));
          const percent = Math.round((votes[index] / total) * 100);
          const selected = selectedOption === index;

          return (
            <button
              key={option}
              type="button"
              onClick={() => voteOnStatusPoll(card.id, index)}
              disabled={selectedOption !== undefined}
              className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left text-sm font-black shadow-inner transition sm:text-base disabled:cursor-not-allowed ${selected ? 'border-white bg-white text-[#137333]' : 'border-white/30 bg-white/18 text-white hover:bg-white/25 disabled:hover:bg-white/18'}`}
            >
              <span className="absolute inset-y-0 left-0 bg-white/30" style={{ width: selectedOption !== undefined ? `${percent}%` : '0%' }} />
              <span className="relative flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate">
                  <span className="mr-2 opacity-70">{index + 1}.</span>
                  {option}
                </span>
                {selectedOption !== undefined ? <span className="shrink-0">{percent}% · {votes[index]}</span> : <span className="shrink-0">Vote</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

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
              <div className="mx-auto flex flex-row justify-center gap-3 md:flex-col"><button type="button" onClick={() => toggleStatusLike(card.id)} className={`flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/20 ${(card.likedByUsers?.[currentUserKey] || likedStatuses.includes(card.id)) ? 'bg-[#FCE8E6] text-[#C5221F]' : 'bg-[#202124]/20 text-white'} shadow-2xl backdrop-blur-xl transition hover:scale-105`}><span>❤️</span><span className="text-[11px] font-black">{card.likedBy}</span></button><button type="button" onClick={() => openShareComposer({ sourceType: 'status', status: card })} className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-white/20 bg-[#202124]/20 text-white shadow-2xl backdrop-blur-xl transition hover:scale-105"><span>↗️</span><span className="text-[11px] font-black">Share</span></button></div>
            </div>
          </section>
        ))}
      </div>

      </div>
    );
  };

  const openChatCreator = (creatorId: string) => {
    setSelectedChatId(creatorId);
    setChatMenuOpen(false);
    resetPrivateChatComposer();

    // Only mobile phones should open the nested full chat page.
    // Tablet and desktop keep the normal split chat layout.
    if (window.matchMedia('(max-width: 767px)').matches) {
      pushPage('directChatThread');
      return;
    }

    if (page !== 'directChat') pushPage('directChat');
  };

  const renderPrivateChatInbox = () => {
    const inboxCreators = chatCreators.length ? chatCreators : [];

    return (
      <div className="mx-auto flex h-[calc(100dvh-10.5rem)] max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-[#D9E7F8] bg-white shadow-[0_26px_80px_rgba(8,26,69,0.10)]">
        <div className="border-b border-[#D9E7F8] bg-gradient-to-br from-[#F8FBFF] to-white p-5">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#1769FF]">Private messages</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-[#081A45]">Chats</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-[#536178]">Tap a chat to open the mobile full-screen thread. Messages stay private for 30 days.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#F8FBFF] p-3 custom-scrollbar">
          {inboxCreators.map((creator) => {
            const conversationId = getPrivateConversationId(currentUserKey, creator.id);
            const conversation = privateConversations.find((item) => item.id === conversationId);
            const unread = conversation?.unreadCounts?.[currentUserKey] || 0;

            return (
              <button key={creator.id} type="button" onClick={() => openChatCreator(creator.id)} className="flex w-full items-center gap-3 rounded-2xl border border-[#D9E7F8] bg-white p-3 text-left shadow-sm transition hover:bg-[#F8FBFF]">
                <Avatar value={creator.avatar} size="h-12 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-black text-[#081A45]">{getCreatorDisplayName(creator)}</span>
                  <span className="block truncate text-xs font-bold text-[#7C879A]">{conversation?.lastMessage || 'Start private chat'}</span>
                </span>
                {unread ? <span className="rounded-full bg-[#1769FF] px-2.5 py-1 text-xs font-black text-white">{unread > 9 ? '9+' : unread}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPrivateMessageBubble = (message: PrivateChatMessage) => {
    const mine = message.senderId === currentUserKey;
    const poll = message.poll;
    const selectedPollOption = poll?.voters?.[currentUserKey];
    const sharedItem = message.sharedItem;

    const openSharedItem = () => {
      if (!sharedItem) return;

      if (sharedItem.sourceType === 'status') {
        const targetStatus = statusCards.find((status) => String(status.docId || status.id) === sharedItem.sourceId);
        if (targetStatus) {
          openStatusReel(targetStatus.id);
          return;
        }
        setPrivateChatError('Original status has expired, but this shared preview is still saved here.');
        return;
      }

      const targetMessage = messages.find((item) => String(item.docId || item.id) === sharedItem.sourceId);
      if (targetMessage) {
        setSelectedMessageId(targetMessage.id);
        setActiveView('feed');
        setPage(window.matchMedia('(max-width: 767px)').matches ? 'thread' : 'chat');
        setPageStack([]);
        return;
      }

      setPrivateChatError('Original post is not available, but this shared preview is still saved here.');
    };

    return (
      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <article className={`max-w-[min(86%,34rem)] overflow-hidden rounded-[1.65rem] px-4 py-3 shadow-[0_12px_34px_rgba(15,23,42,0.08)] ${mine ? 'rounded-br-md bg-gradient-to-br from-[#1769FF] to-[#7B61FF] text-white' : 'rounded-bl-md border border-[#D9E7F8] bg-white text-[#081A45]'}`}>          
          {message.type === 'shared_item' && sharedItem ? (
            <button type="button" onClick={openSharedItem} className={`block w-full overflow-hidden rounded-[1.35rem] border text-left transition hover:scale-[1.01] ${mine ? 'border-white/25 bg-white/12' : 'border-[#D9E7F8] bg-[#F8FBFF]'}`}>
              {sharedItem.imageUrl ? (
                <div className="max-h-56 overflow-hidden bg-white/15">
                  {renderUploadedImage(sharedItem.imageUrl, sharedItem.title, sharedItem.imageLayout || 'thumbnail')}
                </div>
              ) : null}
              <div className="p-3">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${mine ? 'bg-white/20 text-white' : 'bg-[#E8F2FF] text-[#1769FF]'}`}>
                  {sharedItem.sourceType === 'status' ? 'Shared status' : 'Shared post'}
                </span>
                <h4 className="mt-2 line-clamp-2 text-sm font-black">{sharedItem.title}</h4>
                <p className={`mt-1 line-clamp-3 text-xs font-semibold leading-5 ${mine ? 'text-white/82' : 'text-[#536178]'}`}>{sharedItem.previewText}</p>
                {message.caption ? <p className={`mt-3 whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs font-bold ${mine ? 'bg-white/12 text-white' : 'bg-white text-[#081A45]'}`}>{message.caption}</p> : null}
              </div>
            </button>
          ) : null}

          {message.type === 'poll' && poll ? (
            <div>
              <p className="text-sm font-black">{poll.question}</p>
              <div className="mt-3 space-y-2">
                {poll.options.map((option, index) => {
                  const total = Math.max(1, poll.totalVotes || poll.votes.reduce((sum, count) => sum + count, 0));
                  const percent = Math.round(((poll.votes[index] || 0) / total) * 100);
                  const selected = selectedPollOption === index;

                  return (
                    <button
                      key={`${message.id}-${option}`}
                      type="button"
                      onClick={() => votePrivatePoll(message, index)}
                      disabled={selectedPollOption !== undefined}
                      className={`relative w-full overflow-hidden rounded-2xl border px-3 py-2 text-left text-xs font-black transition ${mine ? 'border-white/30 bg-white/10 text-white disabled:opacity-95' : 'border-[#D9E7F8] bg-[#F8FBFF] text-[#081A45] disabled:opacity-95'}`}
                    >
                      <span className={`absolute inset-y-0 left-0 ${mine ? 'bg-white/20' : 'bg-[#E8F2FF]'}`} style={{ width: selectedPollOption !== undefined ? `${percent}%` : '0%' }} />
                      <span className="relative flex items-center justify-between gap-3">
                        <span>{selected ? '✓ ' : ''}{option}</span>
                        <span>{selectedPollOption !== undefined ? `${percent}%` : 'Vote'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : message.type !== 'shared_item' ? (
            <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6">{message.text}</p>
          ) : null}

          <div className={`mt-2 text-right text-[10px] font-black ${mine ? 'text-white/70' : 'text-[#7C879A]'}`}>
            {formatCommunityTime(message.createdAt)} · expires in 30d
          </div>
        </article>
      </div>
    );
  };

  const renderPrivateChatShell = (mobile = false) => {
    const sidebarCreators = chatCreators.length ? chatCreators : [];
    const canSendText = Boolean(chatDraft.trim()) && !chatAttachmentMode;
    const canSendPoll = chatAttachmentMode === 'poll' && Boolean(chatPollQuestion.trim()) && chatPollOptions.filter((option) => option.trim()).length >= 2;
    const canSendAnyPrivateMessage = canSendText || canSendPoll;
    const sendDisabled = !canSendAnyPrivateMessage;
    return (
      <div className={`mx-auto grid overflow-hidden bg-white ${mobile ? 'h-full min-h-0 w-full overscroll-none border-0 shadow-none' : 'h-[calc(100dvh-10.5rem)] max-w-[1800px] rounded-[2.4rem] border border-[#D9E7F8] shadow-[0_26px_80px_rgba(8,26,69,0.10)] lg:grid-cols-[360px_1fr]'}`}>
        {!mobile ? (
          <aside className="flex min-h-0 flex-col border-r border-[#D9E7F8] bg-gradient-to-b from-[#F8FBFF] to-white">
            <div className="border-b border-[#D9E7F8] p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#1769FF]">Private messages</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-[#081A45]">Chats</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-[#536178]">1-to-1 text and poll messages stay private for 30 days.</p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">
              {sidebarCreators.map((creator) => {
                const conversationId = getPrivateConversationId(currentUserKey, creator.id);
                const conversation = privateConversations.find((item) => item.id === conversationId);
                const active = activeChatCreator?.id === creator.id;
                const unread = conversation?.unreadCounts?.[currentUserKey] || 0;

                return (
                  <button key={creator.id} type="button" onClick={() => openChatCreator(creator.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-[#BFD7FF] bg-[#E8F2FF] shadow-md' : 'border-transparent bg-white hover:bg-[#F8FBFF]'}`}>
                    <Avatar value={creator.avatar} size="h-12 w-12" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-black text-[#081A45]">{getCreatorDisplayName(creator)}</span>
                      <span className="block truncate text-xs font-bold text-[#7C879A]">{conversation?.lastMessage || 'Start private chat'}</span>
                    </span>
                    {unread ? <span className="rounded-full bg-[#1769FF] px-2.5 py-1 text-xs font-black text-white">{unread > 9 ? '9+' : unread}</span> : null}
                  </button>
                );
              })}
            </div>
          </aside>
        ) : null}

        <section className="flex min-h-0 overflow-hidden flex-col bg-[radial-gradient(circle_at_18%_10%,rgba(23,105,255,0.10),transparent_28%),linear-gradient(180deg,#ffffff,#f8fbff)]">
          <div className={`flex items-center gap-3 border-b border-[#D9E7F8] bg-white/95 backdrop-blur-xl ${mobile ? 'sticky top-0 z-20 p-3' : 'p-4 sm:p-5'}`}>
            {mobile ? <button type="button" onClick={() => goBack()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-white text-lg font-black text-[#081A45] shadow-sm">←</button> : null}
            <Avatar value={activeChatCreator?.avatar || '👤'} size={mobile ? 'h-10 w-10' : 'h-12 w-12'} />
            <div className="min-w-0 flex-1">
              <h3 className={`truncate font-black text-[#081A45] ${mobile ? 'text-lg' : 'text-xl sm:text-2xl'}`}>{getCreatorDisplayName(activeChatCreator)}</h3>
              <p className="truncate text-xs font-bold text-[#7C879A]">{activePrivateMessages.length ? `${activePrivateMessages.length} active messages · 30-day expiry` : getCreatorSubtitle(activeChatCreator)}</p>
            </div>
            <div className="relative">
              <button type="button" onClick={() => setChatMenuOpen((open) => !open)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-white text-xl font-black text-[#081A45]">⋯</button>
              {chatMenuOpen ? (
                <div className="absolute right-0 top-12 z-20 w-56 overflow-hidden rounded-2xl border border-[#D9E7F8] bg-white p-2 shadow-[0_20px_60px_rgba(8,26,69,0.18)]">
                  <button type="button" onClick={pinLatestPrivateMessage} className="w-full rounded-xl px-3 py-2 text-left text-xs font-black text-[#081A45] hover:bg-[#F8FBFF]">📌 Pin latest message</button>
                  <button type="button" onClick={clearPinnedPrivateMessage} className="w-full rounded-xl px-3 py-2 text-left text-xs font-black text-[#081A45] hover:bg-[#F8FBFF]">🧹 Clear pinned message</button>
                  <button type="button" onClick={() => { resetPrivateChatComposer(); setChatMenuOpen(false); }} className="w-full rounded-xl px-3 py-2 text-left text-xs font-black text-[#081A45] hover:bg-[#F8FBFF]">✍️ Clear draft</button>
                </div>
              ) : null}
            </div>
          </div>

          {activePinnedMessage ? (
            <div className="border-b border-[#D9E7F8] bg-[#EEF6FF] px-4 py-3">
              <div className="flex items-start gap-3 rounded-2xl border border-[#BFD7FF] bg-white px-4 py-3">
                <span className="text-lg">📌</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1769FF]">Pinned message</p>
                  <p className="mt-1 line-clamp-2 text-sm font-bold text-[#536178]">{activePinnedMessage.text || activePinnedMessage.caption || activePinnedMessage.poll?.question || activePinnedMessage.sharedItem?.title || 'Pinned media'}</p>
                </div>
                <button type="button" onClick={clearPinnedPrivateMessage} className="text-xs font-black text-[#EF4444]">Remove</button>
              </div>
            </div>
          ) : null}

          <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain custom-scrollbar ${mobile ? 'bg-[radial-gradient(circle_at_20%_0%,rgba(23,105,255,0.10),transparent_28%),#F8FBFF] px-3 py-4' : 'p-4 sm:p-6'}`}>
            {activePrivateMessages.length ? (
              activePrivateMessages.map(renderPrivateMessageBubble)
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div className="max-w-md rounded-[2rem] border border-dashed border-[#BFD7FF] bg-white/90 p-8 shadow-inner">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F2FF] text-3xl">💬</div>
                  <h3 className="mt-4 text-2xl font-black text-[#081A45]">Start a private conversation</h3>
                  <p className="mt-2 text-sm font-bold leading-6 text-[#536178]">Send text or a private poll. Nothing is saved to public Chat Feed.</p>
                </div>
              </div>
            )}
            <div ref={directChatMessagesEndRef} />
          </div>

          <div className={`shrink-0 border-t border-[#D9E7F8] bg-white/95 p-3 backdrop-blur-xl ${mobile ? 'z-20 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-18px_45px_rgba(8,26,69,0.08)]' : 'sm:p-4'}`}>
            {privateChatError ? <div className="mb-3 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] px-4 py-3 text-xs font-black text-[#C5221F]">{privateChatError}</div> : null}
            {isPrivateChatSending ? <div className="mb-3 rounded-2xl border border-[#BFD7FF] bg-[#EEF6FF] px-4 py-3 text-xs font-black text-[#1769FF]">Sending…</div> : null}

            {chatAttachmentMode === 'poll' ? (
              <div className="mb-3 space-y-2 rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] p-3">
                <input value={chatPollQuestion} onChange={(event) => setChatPollQuestion(event.target.value)} placeholder="Poll question..." className="w-full rounded-2xl border border-[#D9E7F8] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#1769FF]" />
                {chatPollOptions.map((option, index) => (
                  <input key={index} value={option} onChange={(event) => setChatPollOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Option ${index + 1}`} className="w-full rounded-2xl border border-[#D9E7F8] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#1769FF]" />
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setChatPollOptions((current) => current.length >= 5 ? current : [...current, ''])} className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#1769FF]">+ Option</button>
                  <button type="button" onClick={() => setChatAttachmentMode(null)} className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#EF4444]">Cancel poll</button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setChatAttachmentMode((mode) => mode === 'poll' ? null : 'poll')} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] text-xl">📊</button>

              <input
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !sendDisabled) {
                    event.preventDefault();
                    sendPrivateChatMessage();
                  }
                }}
                placeholder={chatAttachmentMode === 'poll' ? 'Add optional message...' : 'Type a message...'}
                maxLength={1200}
                className="min-w-0 flex-1 rounded-2xl border border-[#D9E7F8] bg-white px-4 py-3 text-sm font-bold text-[#081A45] outline-none focus:border-[#1769FF]"
              />
              <button type="button" onClick={() => sendPrivateChatMessage()} disabled={sendDisabled} className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-4 text-sm font-black text-white shadow-[0_14px_34px_rgba(23,105,255,0.22)] disabled:cursor-not-allowed disabled:opacity-45">Send</button>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const ShareComposerModal = () => {
    if (!shareTarget) return null;

    const sharedItemPreview = buildSharedItemFromTarget(shareTarget);

    return (
      <div className="fixed inset-0 z-[1700] flex items-end justify-center bg-[#081A45]/45 p-3 backdrop-blur-sm sm:items-center sm:p-5">
        <div className="grid max-h-[88dvh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/40 bg-white shadow-[0_32px_120px_rgba(8,26,69,0.30)] sm:grid-cols-[1fr_1.15fr]">
          <section className="border-b border-[#D9E7F8] bg-gradient-to-br from-[#EEF6FF] via-white to-[#E8F2FF] p-5 sm:border-b-0 sm:border-r">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#1769FF]">Share privately</p>
                <h3 className="mt-2 text-2xl font-black text-[#081A45]">Send to chat</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-[#536178]">This creates a private 30-day chat message. It will not appear in public feed.</p>
              </div>
              <button type="button" onClick={closeShareComposer} className="rounded-full border border-[#D9E7F8] bg-white px-3 py-2 text-sm font-black text-[#081A45]">✕</button>
            </div>

            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-[#D9E7F8] bg-white shadow-sm">
              {sharedItemPreview.imageUrl ? (
                <div className="max-h-48 overflow-hidden bg-[#EEF6FF]">
                  {renderUploadedImage(sharedItemPreview.imageUrl, sharedItemPreview.title, sharedItemPreview.imageLayout || 'thumbnail')}
                </div>
              ) : null}
              <div className="p-4">
                <span className="rounded-full bg-[#E8F2FF] px-3 py-1 text-[11px] font-black text-[#1769FF]">{sharedItemPreview.sourceType === 'status' ? 'Status story' : 'Feed post'}</span>
                <h4 className="mt-3 line-clamp-2 text-lg font-black text-[#081A45]">{sharedItemPreview.title}</h4>
                <p className="mt-2 line-clamp-3 text-sm font-bold leading-6 text-[#536178]">{sharedItemPreview.previewText}</p>
              </div>
            </div>

            <textarea
              value={shareCaption}
              onChange={(event) => setShareCaption(event.target.value.slice(0, 280))}
              placeholder="Add optional caption..."
              rows={4}
              className="mt-4 w-full resize-none rounded-[1.35rem] border border-[#D9E7F8] bg-white px-4 py-3 text-sm font-bold text-[#081A45] outline-none focus:border-[#1769FF]"
            />

            {shareFeedback ? <div className="mt-3 rounded-2xl border border-[#D9E7F8] bg-white px-4 py-3 text-xs font-black text-[#081A45]">{shareFeedback}</div> : null}
          </section>

          <section className="flex min-h-0 flex-col bg-white">
            <div className="border-b border-[#D9E7F8] p-4">
              <input
                value={shareRecipientSearch}
                onChange={(event) => setShareRecipientSearch(event.target.value)}
                placeholder="Search users to share..."
                className="w-full rounded-2xl border border-[#D9E7F8] bg-[#F8FBFF] px-4 py-3 text-sm font-bold text-[#081A45] outline-none focus:border-[#1769FF]"
              />
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">
              {shareRecipients.length ? shareRecipients.map((creator) => (
                <button
                  key={creator.id}
                  type="button"
                  onClick={() => sendSharedItemToPrivateChat(creator)}
                  disabled={Boolean(shareSendingId)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-[#D9E7F8] bg-white p-3 text-left transition hover:-translate-y-0.5 hover:bg-[#F8FBFF] hover:shadow-md disabled:opacity-60"
                >
                  <Avatar value={creator.avatar} size="h-12 w-12" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-[#081A45]">
                      {getCreatorDisplayName(creator)} {isOwnCommunityId(creator.id) ? <span className="text-[#1769FF]">· You</span> : null}
                    </span>
                    <span className="block truncate text-xs font-bold text-[#7C879A]">@{creator.username} · {creator.role}</span>
                  </span>
                  <span className="rounded-full bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-3 py-2 text-xs font-black text-white">
                    {shareSendingId === creator.id ? 'Sending...' : 'Send'}
                  </span>
                </button>
              )) : (
                <div className="rounded-2xl border border-dashed border-[#BFD7FF] bg-[#F8FBFF] p-8 text-center text-sm font-black text-[#536178]">
                  No user found.
                </div>
              )}
            </div>

            <div className="border-t border-[#D9E7F8] p-3">
              <button type="button" onClick={() => { closeShareComposer(); pushPage('directChat'); }} className="w-full rounded-2xl bg-[#081A45] px-4 py-3 text-sm font-black text-white">Open private chats</button>
            </div>
          </section>
        </div>
      </div>
    );
  };

  const renderChatPage = () => (
    <>
      <div className="md:hidden">
        {renderPrivateChatInbox()}
      </div>
      <div className="hidden md:block">
        {renderPrivateChatShell(false)}
      </div>
    </>
  );

  const renderChatThreadPage = () => (
    <div className="fixed inset-0 z-[1450] flex h-[100svh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-white pt-[env(safe-area-inset-top)] md:static md:z-auto md:h-auto md:max-h-none md:bg-transparent md:p-0">
      {renderPrivateChatShell(true)}
    </div>
  );

  const renderStatusDetailPage = () => <div className="mx-auto flex h-[calc(100dvh-10.5rem)] max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-[#E0E3EB] bg-white shadow-[0_22px_70px_rgba(15,23,42,0.10)]"><div className="flex items-center justify-between gap-3 border-b border-[#E0E3EB] bg-white p-4"><button type="button" onClick={() => setPage('statusReel')} className="rounded-2xl border border-[#E0E3EB] bg-white px-4 py-3 text-sm font-black text-[#5F6368]">← Back to story</button><span className="rounded-full bg-[#E8F0FE] px-3 py-1 text-xs font-black text-[#1967D2]">{selectedStatus.slots}</span></div><div className={`min-h-0 flex-1 overflow-y-auto bg-gradient-to-br ${selectedStatus.gradient} p-5 text-white custom-scrollbar sm:p-8`}><article className="mx-auto max-w-3xl rounded-[2rem] border border-white/20 bg-[#202124]/10 p-5 shadow-2xl backdrop-blur-xl sm:p-8">{selectedStatus.imagePreview ? <div className={`mb-6 ${selectedStatus.imageLayout === 'original' ? 'max-h-[54dvh] min-h-48' : 'aspect-square'} flex items-center justify-center overflow-hidden rounded-[2rem] bg-[#202124]/20 shadow-inner`}>{renderUploadedImage(selectedStatus.imagePreview, selectedStatus.title, selectedStatus.imageLayout || 'original')}</div> : null}<h2 className="text-4xl font-black tracking-tight sm:text-6xl">{selectedStatus.title}</h2><p className="mt-5 whitespace-pre-wrap text-lg font-semibold leading-9 text-white/90">{selectedStatus.body}</p>{renderStatusPoll(selectedStatus)}</article></div></div>;

  const filteredCreators = useMemo(() => {
    const query = debouncedNetworkSearch;
    return allCreators
      .map((creator) => ({ creator, score: scoreCreatorSearch(creator, query) }))
      .filter(({ creator, score }) => {
        const selfSearchMatch = Boolean(normalizeSearchText(query)) && isOwnCommunityId(creator.id) && score > 0;
        const tabMatches =
          networkTab === 'mutual'
            ? creator.mutual
            : networkTab === 'followers'
              ? followerIds.includes(creator.id)
              : networkTab === 'following'
                ? followedIds.includes(creator.id)
                : networkTab === 'creators'
                  ? Boolean(creator.isCreator) || /creator/i.test(creator.role)
                  : networkTab === 'teachers'
                    ? /teacher|mentor|faculty/i.test(creator.role)
                    : networkTab === 'students'
                      ? /student|member/i.test(creator.role)
                      : networkTab === 'masters'
                        ? (creator.masterTags || []).length > 0 || /master/i.test(getCreatorSearchHaystack(creator))
                        : networkTab === 'verified'
                          ? Boolean(creator.verified)
                          : true;
        return (score > 0 || !normalizeSearchText(query)) && (tabMatches || selfSearchMatch);
      })
      .sort((a, b) => b.score - a.score || (b.creator.followerCount || b.creator.followers || 0) - (a.creator.followerCount || a.creator.followers || 0))
      .map(({ creator }) => creator);
  }, [allCreators, debouncedNetworkSearch, networkTab, followerIds, followedIds, currentUserKey]);

  const shareRecipientQuery = shareRecipientSearch.trim().toLowerCase();
  const shareRecipients = allCreators.filter((creator) => {
    if (!shareRecipientQuery) return true;
    return `${creator.username} ${creator.name} ${creator.role}`.toLowerCase().includes(shareRecipientQuery);
  });

  const networkVisibleCreators = networkTab === 'forYou' ? visibleForYouCreators.filter((creator) => !normalizeSearchText(debouncedNetworkSearch) || scoreCreatorSearch(creator, debouncedNetworkSearch) > 0) : filteredCreators;


  const NotificationDropdown = () => (
    <div ref={notificationDropdownRef} className="fixed right-[clamp(0.75rem,3vw,2.5rem)] top-[calc(env(safe-area-inset-top)+5.75rem)] z-[2147483647] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.75rem] border border-[#E3ECF8] bg-white/95 shadow-[0_28px_90px_rgba(8,27,92,0.22)] backdrop-blur-2xl isolate">
      <div className="flex items-center justify-between gap-3 border-b border-[#E3ECF8] bg-gradient-to-br from-[#EEF2FF] to-white p-4"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-[#4F7BFF]">Notifications</p><h2 className="text-lg font-black text-[#081B5C]">Community updates</h2></div><button type="button" onClick={markAllNotificationsRead} disabled={!unreadNotificationCount} className="rounded-full bg-white px-3 py-2 text-[11px] font-black text-[#4F46E5] shadow-sm disabled:opacity-45">Mark all as read</button></div>
      <div className="border-b border-[#E3ECF8] bg-white px-3 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">{notificationTypeLabels.map((item) => <button key={item.value} type="button" onClick={() => setNotificationFilter(item.value)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black transition ${notificationFilter === item.value ? 'bg-[#4F7BFF] text-white shadow-sm' : 'bg-[#F8FBFF] text-[#64748B]'}`}>{item.label}</button>)}</div>
      </div>
      <div className="max-h-[min(54dvh,28rem)] overflow-y-auto p-2 custom-scrollbar">{notifications.length ? notifications.map((notification) => <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`flex w-full gap-3 rounded-[1.35rem] p-3 text-left transition hover:bg-[#F8FBFF] ${notification.read ? 'opacity-70' : 'bg-[#EEF2FF]'}`}><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.read ? 'bg-[#DADCE0]' : 'bg-[#4F7BFF]'}`} /><span className="min-w-0 flex-1"><span className="block text-sm font-black text-[#081B5C]">{notification.title}</span><span className="mt-1 line-clamp-2 block text-xs font-bold leading-5 text-[#64748B]">{notification.body}</span><span className="mt-2 block text-[11px] font-black uppercase tracking-[0.16em] text-[#4F7BFF]">{notification.time}</span></span></button>) : <div className="p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-2xl">🔕</div><p className="mt-3 text-sm font-black text-[#081B5C]">No notifications yet</p><p className="mt-1 text-xs font-bold text-[#64748B]">Follow, replies, status interactions, and master tag updates will appear here.</p></div>}</div>
    </div>
  );

  const notificationDropdownPortal = isNotificationPanelOpen && typeof document !== 'undefined' ? createPortal(<NotificationDropdown />, document.body) : null;

  const communityStyle = {
    ...defaultCommunityStyle,
    ...((settings?.content as any)?.communityStyle || {}),
  };

  const communityCssVars = useMemo(
    () => toCommunityCssVars(communityStyle),
    [settings?.content]
  );

  const communityDockScrollRef = useRef<HTMLDivElement>(null);
  const communityDockScrollLeftRef = useRef(0);

  const preserveCommunityDockScroll = () => {
    if (communityDockScrollRef.current) {
      communityDockScrollLeftRef.current = communityDockScrollRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    const dock = communityDockScrollRef.current;
    if (!dock) return;
    dock.scrollLeft = communityDockScrollLeftRef.current;
  }, [page, activeView, showStatusActions]);

  const navItems = [
    { label: 'Feed', icon: '📢', active: activeView === 'feed' && page === 'chat', action: () => switchView('feed') },
    { label: 'Status', icon: '⭕', active: activeView === 'status' && page === 'chat', action: () => { setActiveView('status'); setPage('chat'); setPageStack([]); setShowStatusActions((value) => window.matchMedia('(min-width: 768px) and (max-width: 1023px)').matches ? !value : false); } },
    { label: 'Chat', icon: '💬', active: page === 'directChat' || page === 'directChatThread', action: () => pushPage('directChat') },
    { label: 'Creators', icon: '✍️', active: page === 'creators', action: () => pushPage('creators') },
    { label: 'Admin Post', icon: '📣', active: page === 'adminPosts', action: () => pushPage('adminPosts') },
    { label: 'Follow', icon: '🤝', active: page === 'network', action: () => pushPage('network') },
    { label: 'Following', icon: '👥', active: page === 'following', action: () => pushPage('following') },
    { label: 'Tag your master', icon: '🏷️', active: page === 'tagMaster', action: () => pushPage('tagMaster') },
    { label: 'Master Tags', icon: '📚', active: page === 'masterTags' || page === 'masterTagDetail', action: () => pushPage('masterTags') },
  ];

  const activeNavItem = navItems.find((item) => item.active) || navItems[0];
  const showCreateCta = page === 'creators' || (page === 'chat' && activeView === 'status') || page === 'statusUpload';
  const communityAiButtonRef = useRef<HTMLButtonElement>(null);
  const openCommunityAiMentor = () => setIsCommunityAiOpen(true);
  const handleHeaderCreate = () => {
    if (page === 'creators') return undefined;
    if (activeView === 'status' || page === 'statusUpload') return openStatusUploadFromTop();
    return pushPage('creators');
  };

  const communityAiContext = useMemo(() => {
    const activeLabel = activeNavItem.label;
    const visibleSnippet = page === 'thread'
      ? `${selectedMessage.title}: ${selectedMessage.body}`
      : page === 'masterTagDetail'
        ? `${selectedMasterTag?.targetMasterName || selectedMasterTag?.title || 'Master Tag'}: ${selectedMasterTag?.detail || ''}`
        : page === 'directChatThread'
          ? `Direct chat with ${(allCreators.find((creator) => creator.id === activeConversationId)?.name || 'selected member')}`
          : page === 'chat' && activeView === 'feed'
            ? `${selectedMessage.title}: ${selectedMessage.body}`
            : page === 'chat' && activeView === 'status'
              ? selectedStatus.caption
              : '';

    return {
      tab: activeLabel,
      page,
      title: activeLabel === 'Feed' ? 'Community Feed' : activeLabel,
      helperText: `${activeLabel === 'Feed' ? 'Feed' : activeLabel} support for safe writing, summaries, and learning ideas.`,
      visibleSnippet: visibleSnippet ? safeText(visibleSnippet, 260) : '',
      userDisplayName: profile.name || 'Eduvora Member',
    };
  }, [activeConversationId, activeNavItem.label, activeView, allCreators, page, profile.name, selectedMasterTag, selectedMessage.body, selectedMessage.title, selectedStatus.caption]);

  const CommunityHeader = () => (
    <header className="sticky top-0 z-[1200] shrink-0 border-b border-[#D9E7F8] bg-white/92 px-3 py-2.5 shadow-[0_14px_36px_rgba(23,105,255,0.08)] backdrop-blur-2xl sm:px-5 lg:px-6 lg:py-3">
      <div className="mx-auto grid max-w-[1500px] items-center gap-3 lg:grid-cols-[minmax(13rem,0.78fr)_minmax(28rem,1.35fr)_minmax(15rem,0.78fr)]">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={goBack} aria-label="Back from Community" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-white text-lg font-black text-[#081A45] shadow-[0_12px_30px_rgba(23,105,255,0.10)] transition hover:-translate-y-0.5 hover:border-[#BFD7FF] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#1769FF]/16">←</button>
          <div className="min-w-0">
            <p className="hidden text-[0.68rem] font-black uppercase tracking-[0.24em] text-[#1769FF] sm:block">Eduvora Community</p>
            <h1 className="truncate text-lg font-black tracking-tight text-[#081A45] sm:text-2xl lg:text-3xl">{activeNavItem.label === 'Feed' ? 'Community Feed' : activeNavItem.label}</h1>
          </div>
        </div>

        <div className="hidden min-w-0 items-center justify-center gap-2 lg:flex">
          <button
            type="button"
            ref={communityAiButtonRef}
            onClick={openCommunityAiMentor}
            aria-label="Open Community AI Mentor"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[1.35rem] border border-[#BFD7FF]/80 bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-4 py-2.5 text-xs font-black text-white shadow-[0_16px_38px_rgba(123,97,255,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(123,97,255,0.30)] focus:outline-none focus:ring-4 focus:ring-[#7B61FF]/20 active:scale-95"
          >
            <span aria-hidden="true">✦</span>
            <span>AI Mentor</span>
          </button>
          <nav aria-label="Community shortcut sections" className="flex min-w-0 max-w-[48rem] flex-1 items-center justify-center gap-1 overflow-x-auto rounded-[1.55rem] border border-[#D9E7F8] bg-[#F8FBFF]/90 p-1 shadow-[0_14px_36px_rgba(23,105,255,0.08)] custom-scrollbar">
            {navItems.slice(0, 7).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                aria-label={item.label}
                aria-current={item.active ? 'page' : undefined}
                className={`inline-flex min-h-10 shrink-0 items-center rounded-[1.15rem] px-3 py-2 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-[#1769FF]/16 ${item.active ? 'bg-white text-[#1769FF] shadow-[0_10px_24px_rgba(23,105,255,0.13)] ring-1 ring-[#D9E7F8]' : 'text-[#536178] hover:bg-white hover:text-[#081A45] hover:shadow-sm'}`}
              >
                <span className="mr-1.5" aria-hidden="true">{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
          {showCreateCta ? <button type="button" onClick={handleHeaderCreate} className="hidden rounded-2xl bg-gradient-to-r from-[#7B61FF] to-[#1769FF] px-4 py-3 text-xs font-black text-white shadow-[0_16px_38px_rgba(23,105,255,0.22)] transition hover:-translate-y-0.5 sm:inline-flex">Create</button> : null}
          <button type="button" onClick={() => pushPage('network')} className="hidden h-11 items-center gap-2 rounded-2xl border border-[#D9E7F8] bg-white px-3 text-xs font-black text-[#081A45] shadow-sm transition hover:-translate-y-0.5 hover:border-[#BFD7FF] md:flex">⌕ Search</button>
          <button type="button" onClick={() => pushPage('profile')} className="flex min-w-0 items-center gap-2 rounded-full border border-[#D9E7F8] bg-white px-2 py-2 text-xs font-black text-[#081A45] shadow-sm transition hover:-translate-y-0.5 hover:border-[#BFD7FF] sm:px-3"><Avatar value={profile.avatar || '🧑‍🎓'} size="h-8 w-8" /><span className="hidden max-w-[8rem] truncate sm:inline">{profile.name || 'Eduvora Member'}</span></button>
          <span className="hidden rounded-full border border-[#FFE8A8] bg-[#FFF7D7] px-3 py-2 text-xs font-black text-[#9A6400] sm:inline-flex">🪙 {eduCoins}</span>
          <div ref={notificationPanelRef} className="relative"><button type="button" onClick={() => setIsNotificationPanelOpen((open) => !open)} aria-expanded={isNotificationPanelOpen} aria-label="Community notifications" className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D9E7F8] bg-white text-lg shadow-sm transition hover:-translate-y-0.5 hover:border-[#BFD7FF] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#1769FF]/16"><span aria-hidden="true">🔔</span>{unreadNotificationCount ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#FF3B5C] px-1.5 py-0.5 text-[10px] font-black leading-none text-white ring-2 ring-white">{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</span> : null}</button></div>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden lg:hidden">
        <button
          type="button"
          onClick={openCommunityAiMentor}
          aria-label="Open Community AI Mentor"
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-3 text-xs font-black text-white shadow-[0_14px_32px_rgba(123,97,255,0.24)] focus:outline-none focus:ring-4 focus:ring-[#7B61FF]/20 active:scale-95"
        >
          <span aria-hidden="true">✦</span><span>AI</span>
        </button>
        <nav aria-label="Community shortcut sections" className="flex min-w-0 flex-1 gap-2 overflow-x-auto rounded-[1.45rem] border border-[#D9E7F8] bg-[#F8FBFF]/85 p-1 custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              aria-label={item.label}
              aria-current={item.active ? 'page' : undefined}
              className={`min-h-10 shrink-0 rounded-[1.15rem] px-3 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-[#1769FF]/16 ${item.active ? 'bg-white text-[#1769FF] shadow-sm ring-1 ring-[#D9E7F8]' : 'text-[#536178] hover:bg-white hover:text-[#081A45]'}`}
            >
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );

  const CommunitySidebar = () => {
    const sidebarExpanded = !isDesktopSidebarCollapsed;
    const memberName = profile.name?.trim() || 'Eduvora Member';
    const memberUsername = normalizeUsername(profile.username || memberName) || 'eduvora_member';

    return (
      <aside
        aria-label="Community sidebar"
        className={`hidden min-h-0 shrink-0 flex-col overflow-hidden border-r border-[#D9E7F8] bg-gradient-to-b from-white/94 via-[#FBFDFF]/92 to-[#EEF6FF]/78 shadow-[18px_0_60px_rgba(23,105,255,0.08)] backdrop-blur-2xl transition-[width,padding] duration-300 ease-out lg:flex ${sidebarExpanded ? 'w-[clamp(16.5rem,20vw,18.5rem)] p-4 xl:p-5' : 'w-[5.5rem] p-3'}`}
      >
        <div className={`mb-4 flex items-center gap-2 ${sidebarExpanded ? 'justify-between' : 'justify-center'}`}>
          {sidebarExpanded ? (
            <div className="group relative min-w-0 flex-1 overflow-hidden rounded-[1.55rem] border border-[#D9E7F8] bg-gradient-to-br from-white via-[#F8FBFF] to-[#EEF6FF] p-2 shadow-[0_18px_42px_rgba(23,105,255,0.12)]">
              <span className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#7B61FF]/14 blur-2xl" />
              <span className="pointer-events-none absolute inset-y-2 left-0 w-1 rounded-r-full bg-gradient-to-b from-[#1769FF] to-[#7B61FF]" />
              <div className="relative flex min-w-0 items-center gap-3 pl-1">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.15rem] bg-gradient-to-br from-[#1769FF] to-[#7B61FF] text-lg text-white shadow-[0_14px_30px_rgba(23,105,255,0.28)]" aria-hidden="true">✦</span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.7rem] font-black uppercase tracking-[0.32em] text-[#081A45]">EDUVORA</span>
                  <span className="mt-0.5 inline-flex rounded-full bg-gradient-to-r from-[#1769FF]/10 to-[#7B61FF]/10 px-2 py-0.5 text-[0.64rem] font-black uppercase tracking-[0.22em] text-[#1769FF]">Bond</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] border border-[#D9E7F8] bg-gradient-to-br from-[#1769FF] to-[#7B61FF] text-lg text-white shadow-[0_14px_32px_rgba(23,105,255,0.22)]" title="EDUVORA BOND" aria-label="EDUVORA BOND">✦</div>
          )}
          <button
            type="button"
            onClick={() => setIsDesktopSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarExpanded ? 'Collapse community sidebar' : 'Expand community sidebar'}
            aria-expanded={sidebarExpanded}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.1rem] border border-[#D9E7F8] bg-white/92 text-base font-black text-[#1769FF] shadow-[0_10px_28px_rgba(23,105,255,0.10)] transition hover:-translate-y-0.5 hover:border-[#BFD7FF] hover:text-[#7B61FF] hover:shadow-[0_16px_34px_rgba(23,105,255,0.16)] focus:outline-none focus:ring-4 focus:ring-[#1769FF]/18 active:scale-95"
            title={sidebarExpanded ? 'Collapse community sidebar' : 'Expand community sidebar'}
          >
            <span aria-hidden="true">{sidebarExpanded ? '‹' : '›'}</span>
          </button>
        </div>

        <nav aria-label="Community sections" className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              title={item.label}
              aria-label={item.label}
              aria-current={item.active ? 'page' : undefined}
              className={`group relative flex min-h-[52px] w-full items-center gap-3 overflow-hidden rounded-[1.35rem] px-2.5 text-left text-sm font-black transition duration-200 focus:outline-none focus:ring-4 focus:ring-[#1769FF]/16 ${sidebarExpanded ? 'justify-start' : 'justify-center'} ${item.active ? 'bg-gradient-to-r from-[#E8F2FF] to-[#F1EEFF] text-[#1769FF] shadow-[0_16px_38px_rgba(23,105,255,0.13)]' : 'text-[#536178] hover:bg-[#F8FBFF] hover:text-[#081A45]'}`}
            >
              {item.active ? <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-gradient-to-b from-[#1769FF] to-[#7B61FF]" aria-hidden="true" /> : null}
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[1.05rem] text-lg transition ${item.active ? 'bg-gradient-to-br from-[#1769FF] to-[#7B61FF] text-white shadow-[0_10px_24px_rgba(23,105,255,0.24)]' : 'bg-[#EEF6FF] text-[#1769FF] group-hover:bg-white group-hover:text-[#7B61FF] group-hover:shadow-sm'}`} aria-hidden="true">{item.icon}</span>
              {sidebarExpanded ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
            </button>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => pushPage('profile')}
          aria-label={`Open profile for ${memberName}`}
          className={`mt-4 flex w-full items-center gap-3 rounded-[1.6rem] border border-[#D9E7F8] bg-gradient-to-br from-white to-[#F8FBFF] p-3 text-left shadow-[0_16px_38px_rgba(23,105,255,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_46px_rgba(123,97,255,0.13)] focus:outline-none focus:ring-4 focus:ring-[#1769FF]/16 ${sidebarExpanded ? 'justify-start' : 'justify-center'}`}
          title={memberName}
        >
          <Avatar value={profile.avatar || '🧑‍🎓'} size="h-11 w-11" />
          {sidebarExpanded ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-[#081A45]">{memberName}</span>
              <span className="block truncate text-xs font-bold text-[#7C879A]">@{memberUsername}</span>
              <span className="mt-2 inline-flex rounded-full bg-[#EEF6FF] px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] text-[#1769FF]">Member</span>
            </span>
          ) : null}
        </button>
      </aside>
    );
  };

  const shouldHideCommunityDockOnMobile = !(page === 'chat' && activeView === 'feed');

  const CommunityBottomNav = () => (
    <nav
      ref={communityDockScrollRef}
      id="community-bottom-dock"
      className={`fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[1300] flex items-center gap-1 overflow-x-auto rounded-[1.65rem] border border-[var(--community-border)] bg-[var(--community-dock-bg)]/95 p-2 shadow-[var(--community-shadow)] backdrop-blur-2xl transition-all duration-300 custom-scrollbar lg:hidden ${
        shouldHideCommunityDockOnMobile
          ? 'max-md:pointer-events-none max-md:translate-y-[calc(100%+2rem)] max-md:opacity-0'
          : 'max-md:translate-y-0 max-md:opacity-100'
      }`}
      onScroll={preserveCommunityDockScroll}
    >
      {navItems.map((item) => (
        <button
          key={item.label}
          type="button"
          onPointerDown={preserveCommunityDockScroll}
          onClick={() => {
            preserveCommunityDockScroll();
            item.action();
            requestAnimationFrame(() => {
              if (communityDockScrollRef.current) {
                communityDockScrollRef.current.scrollLeft = communityDockScrollLeftRef.current;
              }
            });
          }}
          className={`min-w-[76px] rounded-[1.2rem] px-2 py-2 text-center transition ${
            item.active
              ? 'bg-[var(--community-dock-active-bg)] text-[var(--community-dock-active-text)]'
              : 'bg-[var(--community-dock-item-bg)] text-[var(--community-dock-text)]'
          }`}
        >
          <span className="block text-xl">{item.icon}</span>
          <span className="text-[10px] font-black">{item.label}</span>
        </button>
      ))}
    </nav>
  );

  const ProfileHeroCard = () => <section className="overflow-hidden rounded-[2rem] border border-[#E3ECF8] bg-white shadow-[0_20px_60px_rgba(79,123,255,0.12)]"><div className="relative min-h-48 bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] p-6"><div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#6C4CF6]/18 blur-3xl" /><div className="absolute bottom-4 left-10 h-28 w-28 rounded-full bg-[#4F7BFF]/20 blur-2xl" /><div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left"><div className="relative"><Avatar value={profile.avatar} size="h-28 w-28" className="text-5xl ring-4 ring-white" /><label className="absolute bottom-1 right-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-[#6C4CF6] to-[#4F7BFF] text-white shadow-lg"><input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />📷</label></div><div className="min-w-0 flex-1"><h2 className="break-words text-4xl font-black text-[#081B5C]">{profile.name}</h2><p className="mt-1 text-sm font-black text-[#4F7BFF]">@{profile.username}</p><p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#64748B]">{profile.bio}</p><label className="mt-4 inline-flex cursor-pointer rounded-2xl border border-[#E3ECF8] bg-white px-4 py-3 text-sm font-black text-[#081B5C] shadow-sm"><input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />Stage new avatar</label></div></div></div></section>;

  const ProfileSummaryCard = () => {
    const items = [
      ['Coin Balance', compactCount(profileStats.coinBalance)],
      ['Followers', compactCount(profileStats.followers)],
      ['Following', compactCount(profileStats.following)],
      ['Creator Posts', compactCount(profileStats.creatorPosts)],
      ['My Statuses', compactCount(profileStats.myStatuses)],
      ['Master Tags', compactCount(profileStats.masterTags)],
      ['Replies Given', compactCount(profileStats.repliesGiven)],
      ['Sample Level', `Builder ${Math.max(1, Math.min(99, profileStats.creatorPosts + profileStats.myStatuses + 1)).toString().padStart(2, '0')}`],
    ];
    const accountButtons: Array<[ProfilePanel, string]> = [['privacy', 'Privacy Settings'], ['notifications', 'Notification Preferences'], ['connected', 'Connected Accounts'], ['logout', 'Log Out']];
    return <aside className="space-y-4"><div className="rounded-[2rem] border border-[#E3ECF8] bg-white p-5 shadow-[0_16px_48px_rgba(79,123,255,0.10)]"><h3 className="text-xl font-black text-[#081B5C]">Profile Summary</h3>{items.map(([k,v])=><div key={k} className="mt-3 flex justify-between gap-3 rounded-2xl bg-[#F8FBFF] px-4 py-3 text-sm"><span className="font-bold text-[#64748B]">{k}</span><span className="font-black text-[#081B5C]">{v}</span></div>)}</div><div className="rounded-[2rem] border border-[#E3ECF8] bg-[#EEF2FF] p-5"><h3 className="font-black text-[#081B5C]">Quick Tip</h3><p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">Keep your bio outcome-focused so creators know how to collaborate with you.</p></div><div className="rounded-[2rem] border border-[#E3ECF8] bg-white p-5"><h3 className="text-xl font-black text-[#081B5C]">Account</h3>{accountButtons.map(([panel, label])=><button key={panel} type="button" onClick={() => setActiveProfilePanel(panel)} className={`mt-2 flex w-full justify-between rounded-2xl px-4 py-3 text-sm font-black transition ${activeProfilePanel === panel ? 'bg-[#4F7BFF] text-white shadow-md' : 'bg-[#F8FBFF] text-[#081B5C] hover:bg-[#EEF2FF]'}`}>{label}<span>›</span></button>)}</div></aside>;
  };

  const ToggleRow = ({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) => <label className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[#E3ECF8] bg-[#F8FBFF] p-4"><span className="min-w-0"><span className="block text-sm font-black text-[#081B5C]">{label}</span><span className="mt-1 block text-xs font-bold leading-5 text-[#64748B]">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-[#4F7BFF]" /></label>;

  const ProfileSettingsPanel = () => <section className="rounded-[2rem] border border-[#E3ECF8] bg-white p-5 shadow-[0_18px_54px_rgba(79,123,255,0.10)]"><h3 className="text-2xl font-black text-[#081B5C]">Account Settings</h3>{activeProfilePanel === 'privacy' && <div className="mt-5 space-y-3"><ToggleRow label="Public profile" description="Allow your profile card to be visible inside the community." checked={privacySettings.profileVisible} onChange={(value) => setPrivacySettings((current) => ({ ...current, profileVisible: value }))} /><ToggleRow label="Show activity" description="Show your creator posts, replies, statuses, and master-tag activity in summaries." checked={privacySettings.showActivity} onChange={(value) => setPrivacySettings((current) => ({ ...current, showActivity: value }))} /><ToggleRow label="Allow messages" description="Let creators receive status shares and future direct-message requests from you." checked={privacySettings.allowMessages} onChange={(value) => setPrivacySettings((current) => ({ ...current, allowMessages: value }))} /><ToggleRow label="Allow follow requests" description="Keep your profile available for follow-request features when they launch." checked={privacySettings.allowFollowRequests} onChange={(value) => setPrivacySettings((current) => ({ ...current, allowFollowRequests: value }))} /></div>}{activeProfilePanel === 'notifications' && <div className="mt-5 space-y-3"><ToggleRow label="Replies" description="Show reply alerts in the bell dropdown." checked={notificationPreferences.replies} onChange={(value) => setNotificationPreferences((current) => ({ ...current, replies: value }))} /><ToggleRow label="Master-tag replies" description="Show admin/master responses to your tag requests." checked={notificationPreferences.masterTags} onChange={(value) => setNotificationPreferences((current) => ({ ...current, masterTags: value }))} /><ToggleRow label="Status interactions" description="Show likes and views for your statuses." checked={notificationPreferences.statuses} onChange={(value) => setNotificationPreferences((current) => ({ ...current, statuses: value }))} /><ToggleRow label="Creator posts" description="Show new post alerts from community creators." checked={notificationPreferences.creatorPosts} onChange={(value) => setNotificationPreferences((current) => ({ ...current, creatorPosts: value }))} />
<ToggleRow label="Follows" description="Show alerts when someone follows your community profile." checked={notificationPreferences.follows} onChange={(value) => setNotificationPreferences((current) => ({ ...current, follows: value }))} /></div>}{activeProfilePanel === 'connected' && <div className="mt-5 space-y-3"><div className="rounded-2xl bg-[#F8FBFF] p-4 text-sm font-bold text-[#64748B]">Signed in email: <span className="font-black text-[#081B5C]">{authEmail || 'Local community session'}</span></div>{['Google', 'Email password', 'Social account'].map((account) => <button key={account} type="button" disabled className="flex w-full justify-between rounded-2xl border border-[#E3ECF8] bg-[#F8FBFF] px-4 py-3 text-sm font-black text-[#64748B] opacity-70"><span>{account}</span><span>Coming soon</span></button>)}</div>}{activeProfilePanel === 'logout' && <div className="mt-5 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] p-4"><p className="text-sm font-bold leading-6 text-[#5F6368]">Sign out of Firebase when available and return to the app auth flow. Local profile preferences remain saved for the next session.</p><button type="button" onClick={handleLogout} className="mt-4 w-full rounded-2xl bg-[#C5221F] px-5 py-3 font-black text-white">Log out and go to auth</button></div>}</section>;

  const ProfileAccountCard = () => <section className="rounded-[2rem] border border-[#E3ECF8] bg-white p-5 shadow-[0_18px_54px_rgba(79,123,255,0.10)]"><h3 className="text-2xl font-black text-[#081B5C]">Edit Profile</h3>{profileFeedback ? <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-black ${profileFeedback.type === 'success' ? 'border-[#CEEAD6] bg-[#E6F4EA] text-[#137333]' : 'border-[#FAD2CF] bg-[#FCE8E6] text-[#C5221F]'}`}>{profileFeedback.message}</div> : null}<div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2"><label className="min-w-0 text-sm font-black text-[#081B5C]">Display Name<input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-[#E3ECF8] px-4 py-3 font-bold outline-none focus:border-[#4F7BFF]" /></label><label className="min-w-0 text-sm font-black text-[#081B5C]">Username<input value={profileDraft.username} onChange={(event) => setProfileDraft((current) => ({ ...current, username: normalizeUsername(event.target.value) }))} className="mt-2 w-full rounded-2xl border border-[#E3ECF8] px-4 py-3 font-bold outline-none focus:border-[#4F7BFF]" /></label><label className="min-w-0 text-sm font-black text-[#081B5C] sm:col-span-2">Bio<textarea value={profileDraft.bio} maxLength={PROFILE_BIO_MAX_LENGTH} onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value.slice(0, PROFILE_BIO_MAX_LENGTH) }))} className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-[#E3ECF8] px-4 py-3 font-bold leading-7 outline-none focus:border-[#4F7BFF]" /><span className="mt-1 block text-right text-xs font-bold text-[#64748B]">{profileDraft.bio.length}/{PROFILE_BIO_MAX_LENGTH}</span></label></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={saveProfileChanges} className="flex-1 rounded-2xl bg-gradient-to-r from-[#6C4CF6] to-[#4F7BFF] px-5 py-4 font-black text-white shadow-[0_18px_44px_rgba(79,123,255,0.22)]">Save Changes</button><button type="button" onClick={resetProfileDraft} className="rounded-2xl border border-[#E3ECF8] bg-white px-5 py-4 font-black text-[#081B5C]">Cancel / Reset</button></div></section>;

  const renderProfilePage = () => <div className="mx-auto grid min-w-0 max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="min-w-0 space-y-5"><ProfileHeroCard /><ProfileAccountCard /><ProfileSettingsPanel /></div><div className="hidden min-w-0 lg:block"><ProfileSummaryCard /></div><div className="min-w-0 lg:hidden"><ProfileSummaryCard /></div></div>;


  const followSuggestions = ['Math', 'Physics', 'Creator', 'Master', 'Class 10', 'Class 12'];
  const followFilters: Array<{ key: typeof networkTab; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'creators', label: 'Creators' },
    { key: 'teachers', label: 'Teachers' },
    { key: 'students', label: 'Students' },
    { key: 'masters', label: 'Masters' },
    { key: 'verified', label: 'Verified' },
  ];

  const renderFollowCard = (creator: Creator) => {
    const followed = followedIds.includes(creator.id) || Boolean(followedByCreatorIds[creator.id]);
    const self = isOwnCommunityId(creator.id);
    const tags = [...(creator.masterTags || []), ...(creator.subjects || [])].slice(0, 3);
    return (
      <article key={creator.id} className="group flex min-w-0 flex-col gap-4 rounded-[1.7rem] border border-[var(--community-border)] bg-white p-4 shadow-[0_14px_38px_rgba(23,105,255,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_54px_rgba(23,105,255,0.14)] sm:flex-row sm:items-center">
        <Avatar value={creator.avatar} size="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-black text-[var(--community-heading)]">{self ? `${creator.name} (You)` : creator.name}</h3>
            {creator.verified ? <span className="rounded-full bg-[#E8F2FF] px-2 py-0.5 text-xs font-black text-[#1769FF]">✓ Verified</span> : null}
            <span className="rounded-full bg-[#EEF6FF] px-2 py-0.5 text-xs font-black capitalize text-[var(--community-body)]">{creator.role}</span>
          </div>
          <p className="mt-1 truncate text-sm font-bold text-[var(--community-muted)]">@{creator.username}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-[#EEF6FF] px-3 py-1.5 text-[#1769FF]">{compactCount(followerCounts[creator.id] ?? creator.followerCount ?? creator.followers)} Followers</span><span className="rounded-full bg-[#F1EEFF] px-3 py-1.5 text-[#7B61FF]">{compactCount(followingCounts[creator.id] ?? creator.followingCount)} Following</span></div>
          {creator.bio ? <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[var(--community-body)]">{creator.bio}</p> : null}
          {tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{tags.map((tag) => <span key={tag} className="rounded-full border border-[var(--community-border)] bg-[#F8FBFF] px-2.5 py-1 text-[11px] font-black text-[var(--community-primary)]">#{tag}</span>)}</div> : null}
        </div>
        <div className="flex shrink-0 gap-2 sm:flex-col">
          <button type="button" onClick={() => openChatCreator(creator.id)} className="min-h-11 rounded-2xl border border-[var(--community-border)] bg-[#F8FBFF] px-4 text-sm font-black text-[var(--community-heading)]">Message</button>
          <button type="button" onClick={() => toggleFollowCreator(creator)} disabled={Boolean(followLoadingIds[creator.id]) || self || creator.isSuspended || creator.isPublic === false} className={`min-h-11 rounded-2xl px-5 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${followed ? 'border border-[#D9E7F8] bg-white text-[#1769FF] shadow-sm hover:bg-[#EEF6FF]' : 'bg-gradient-to-r from-[#1769FF] to-[#7B61FF] text-white shadow-[0_14px_32px_rgba(23,105,255,0.22)]'}`}>{self ? 'You' : followLoadingIds[creator.id] ? 'Saving…' : followed ? '✓ Following' : 'Follow'}</button>
        </div>
      </article>
    );
  };

  const renderFollowingPage = () => {
    const followedCreators = allCreators.filter((creator) => followedIds.includes(creator.id) && !isOwnCommunityId(creator.id));
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-[2rem] border border-[var(--community-border)] bg-gradient-to-br from-[#EEF6FF] via-white to-[#F1EEFF] p-5 shadow-[0_24px_70px_rgba(23,105,255,0.12)] sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#1769FF]">Following</p>
          <h2 className="mt-2 text-3xl font-black text-[#081A45]">People you follow</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-[#536178]">{compactCount(followedCreators.length)} active community profiles from your backend follow graph.</p>
        </section>
        {followedCreators.length ? <div className="grid gap-3">{followedCreators.map(renderFollowCard)}</div> : <div className="rounded-[2rem] border border-dashed border-[#D9E7F8] bg-white p-10 text-center shadow-sm"><h3 className="text-2xl font-black text-[#081A45]">You are not following anyone yet.</h3><p className="mt-2 text-sm font-bold text-[#7C879A]">Find creators, teachers, and learning partners to personalize your community feed.</p><button type="button" onClick={() => pushPage('network')} className="mt-5 rounded-2xl bg-gradient-to-r from-[#1769FF] to-[#7B61FF] px-5 py-3 text-sm font-black text-white">Find people to follow</button></div>}
      </div>
    );
  };

  const renderFollowPage = () => (
    <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 overflow-hidden rounded-[2rem] border border-[var(--community-border)] bg-white/92 shadow-[0_24px_70px_rgba(23,105,255,0.12)]">
        <div className="sticky top-0 z-20 border-b border-[var(--community-border)] bg-white/95 p-4 backdrop-blur-xl sm:p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--community-primary)]">Follow community</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-[var(--community-heading)] sm:text-4xl">Discover learners, creators & masters</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--community-body)]">Search public profiles by name, username, role, subject, master tag, creator category, and bio keywords.</p>
          <div className="mt-4 flex min-h-12 items-center gap-3 rounded-[1.35rem] border border-[var(--community-border)] bg-[#F8FBFF] px-4 focus-within:border-[var(--community-primary)]">
            <span className="text-lg text-[var(--community-muted)]">⌕</span>
            <input value={networkSearch} onChange={(event) => setNetworkSearch(event.target.value)} placeholder="Search Shiv, math, physics, creator, class 10…" className="min-w-0 flex-1 bg-transparent py-3 text-sm font-bold text-[var(--community-heading)] outline-none placeholder:text-[var(--community-muted)]" />
            {networkSearch ? <button type="button" onClick={() => setNetworkSearch('')} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[var(--community-primary)] shadow-sm">Clear</button> : null}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">{followSuggestions.map((chip) => <button key={chip} type="button" onClick={() => setNetworkSearch(chip)} className="min-h-10 shrink-0 rounded-full border border-[var(--community-border)] bg-[#EEF6FF] px-3 text-xs font-black text-[var(--community-primary)]">{chip}</button>)}</div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">{followFilters.map((filter) => <button key={filter.key} type="button" onClick={() => setNetworkTab(filter.key)} className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-black transition ${networkTab === filter.key ? 'bg-[var(--community-primary)] text-white shadow-sm' : 'bg-[#F8FBFF] text-[var(--community-body)]'}`}>{filter.label}</button>)}</div>
        </div>
        <div className="space-y-3 p-3 sm:p-5">{networkVisibleCreators.length ? networkVisibleCreators.map(renderFollowCard) : <div className="rounded-[1.7rem] border border-dashed border-[#BFD7FF] bg-[#F8FBFF] p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F2FF] text-2xl">🔎</div><h3 className="mt-4 text-xl font-black text-[var(--community-heading)]">No users found</h3><p className="mt-2 text-sm font-semibold text-[var(--community-body)]">Try a subject, role, creator category, or suggested chip.</p><button type="button" onClick={() => setNetworkSearch('')} className="mt-4 rounded-2xl bg-[var(--community-primary)] px-5 py-3 text-sm font-black text-white">Clear search</button></div>}</div>
      </section>
      <aside className="hidden space-y-4 xl:block">
        <div className="rounded-[2rem] border border-[var(--community-border)] bg-white p-5 shadow-[0_18px_54px_rgba(23,105,255,0.10)]"><h3 className="text-xl font-black text-[var(--community-heading)]">Your follow stats</h3><div className="mt-4 grid grid-cols-2 gap-3">{[['Followers', followerIds.length], ['Following', followedIds.length]].map(([label, value]) => <div key={label} className="rounded-2xl bg-[#F8FBFF] p-4"><p className="text-xs font-black uppercase text-[var(--community-muted)]">{label}</p><p className="mt-1 text-2xl font-black text-[var(--community-heading)]">{compactCount(value)}</p></div>)}</div></div>
        <div className="rounded-[2rem] border border-[var(--community-border)] bg-[#EEF6FF] p-5"><h3 className="font-black text-[var(--community-heading)]">Trending master tags</h3><div className="mt-3 flex flex-wrap gap-2">{['Math', 'Physics', 'Class 10', 'Funnels', 'Automation'].map((tag) => <button key={tag} type="button" onClick={() => setNetworkSearch(tag)} className="rounded-full bg-white px-3 py-2 text-xs font-black text-[var(--community-primary)]">#{tag}</button>)}</div></div>
      </aside>
    </div>
  );

  const renderMainContent = () => (
    <div className="community-content-stage animate-in fade-in slide-in-from-bottom-3 duration-500">
      {page === 'chat' && activeView === 'feed' && renderFeedLayout(messages, 'Chat Feed', 'Fresh community prompts, replies, and streak ideas are shown here.')}
      {page === 'thread' && <div className="space-y-3"><button type="button" onClick={() => { goBack(); requestAnimationFrame(() => scrollContainerRef.current?.scrollTo({ top: feedScrollPositionsRef.current.chatFeed || 0, behavior: 'auto' })); }} className="rounded-2xl border border-[#E3ECF8] bg-white px-4 py-3 text-sm font-black text-[#64748B] shadow-sm">← Back to posts</button>{renderMessageDetails(selectedMessage, true)}</div>}
      {page === 'profile' && renderProfilePage()}
      {page === 'creators' && <div className="mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-[#E3ECF8] bg-white shadow-[0_28px_90px_rgba(79,123,255,0.16)]"><div className="relative overflow-hidden bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] p-6 text-[#081B5C] sm:p-8"><p className="text-sm font-black uppercase tracking-[0.28em] text-[#4F7BFF]">Motivational rule</p><h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Post once per type daily. Stories expire after 24 hours.</h2><p className="mt-4 max-w-2xl text-base font-semibold leading-8 text-[#64748B]">Each user can publish one text, one image, and one poll creator post per day. The used type locks immediately and syncs through Firebase for all users. Status stories expire after 24 hours.</p></div><div className="bg-gradient-to-br from-[#F8FBFF] via-white to-[#EAF5FF] p-5 sm:p-7">{limitMessage ? <div className="mb-4 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] px-4 py-3 text-sm font-black text-[#C5221F]">{limitMessage}</div> : null}<div className="mb-5">{renderTypeComposer(postType, setPostType)}</div>{renderUploadFields(postType, postDraft, setPostDraft)}<button type="button" onClick={submitCreatorPost} disabled={isPublishingCreator || isCreatorTypeUsedToday || !postDraft.trim() || isStorageLocked || (postType === 'poll' && postPollOptions.filter((option) => option.trim()).length < 2)} className="mt-5 w-full rounded-[1.55rem] bg-gradient-to-r from-[#6C4CF6] to-[#4F7BFF] px-6 py-4 text-base font-black text-white shadow-[0_18px_44px_rgba(79,123,255,0.28)] disabled:opacity-45">{isPublishingCreator ? 'Publishing creator post...' : isCreatorTypeUsedToday ? `${postType} post used today` : isStorageLocked ? 'Storage limit reached' : 'Publish creator post'}</button></div></div>}
      {page === 'network' && renderFollowPage()}
      {page === 'following' && renderFollowingPage()}
      {page === 'adminPosts' && renderFeedLayout(adminPosts, 'ADMIN POST', 'Official admin posts from Firebase. Like, react, vote, and reply here.')}
      {page === 'tagMaster' && renderTagMasterPage()}{page === 'masterTags' && renderMasterTagsPage()}{page === 'masterTagDetail' && renderMasterTagDetailPage()}
      {page === 'directChat' && renderChatPage()}{page === 'directChatThread' && renderChatThreadPage()}{page === 'statusDetail' && renderStatusDetailPage()}
      {page === 'chat' && activeView === 'status' && <div className="mx-auto max-w-[1800px] space-y-5 rounded-[2rem] bg-white/70 p-4"><div className="rounded-[1.8rem] border border-[#E3ECF8] bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] p-5 text-center text-[#081B5C] shadow-[0_22px_70px_rgba(79,123,255,0.16)]"><p className="text-lg font-black sm:text-2xl">Daily one per type · {statusAvailableSlots.toLocaleString()} real slots left</p><p className="mt-2 text-sm font-bold text-[#64748B]">Text, image, and poll stories each lock after one daily use and stay visible for 24 hours via Firebase.</p><div className="mt-4 flex justify-center gap-2"><button type="button" onClick={openStatusUploadFromTop} disabled={isStorageLocked} className="rounded-2xl bg-[#4F7BFF] px-4 py-3 text-xs font-black text-white disabled:bg-transparent disabled:text-[#64748B] disabled:ring-2 disabled:ring-[#E3ECF8]">{isStorageLocked ? 'Uploads locked' : 'Upload your status'}</button><button type="button" onClick={openMyStatusesFromTop} className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-[#081B5C]">View your status</button></div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{statusCards.map(renderStatusTile)}</div></div>}
      {page === 'statusUpload' && <div className="mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-[#E3ECF8] bg-white shadow-[0_30px_90px_rgba(79,123,255,0.16)]"><div className="bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] p-6 text-[#081B5C] sm:p-8"><p className="text-sm font-black uppercase tracking-[0.3em] text-[#4F7BFF]">Story studio</p><h2 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Upload your status</h2></div><div className="p-5 sm:p-7">{limitMessage ? <div className="mb-4 rounded-2xl border border-[#FAD2CF] bg-[#FCE8E6] px-4 py-3 text-sm font-black text-[#C5221F]">{limitMessage}</div> : <div className="mb-4 rounded-2xl border border-[#D2E3FC] bg-[#E8F0FE] px-4 py-3 text-sm font-black text-[#1967D2]">Each story type locks after one daily publish · Visible for 24 hours · Storage used: {storagePercent(storageUsedBytes)}%</div>}<div className="mb-5">{renderTypeComposer(statusType, setStatusType, 'orange', true)}</div>{renderUploadFields(statusType, statusDraft, setStatusDraft, true)}<button type="button" onClick={submitStatus} disabled={isPublishingStatus || isStatusTypeUsedToday || isStorageLocked || (statusType === 'image' && !statusImagePreview) || (statusType === 'poll' && statusPollOptions.filter((option) => option.trim()).length < 2)} className="mt-5 w-full rounded-[1.55rem] bg-gradient-to-r from-[#6C4CF6] to-[#4F7BFF] px-6 py-4 text-base font-black text-white disabled:opacity-45">{isPublishingStatus ? 'Publishing status story...' : isStatusTypeUsedToday ? `${statusType} story used today` : isStorageLocked ? 'Storage limit reached' : 'Publish status story'}</button></div></div>}
      {page === 'statusMine' && <div className="mx-auto max-w-[1800px] space-y-5 rounded-[2rem] bg-white/70 p-4"><div className="rounded-[2rem] border border-[#E3ECF8] bg-white p-6"><h2 className="text-4xl font-black tracking-tight text-[#081B5C]">View your status</h2><p className="mt-2 text-sm font-bold text-[#64748B]">Tap a card to open reel view.</p></div>{myStatuses.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{myStatuses.map(renderStatusTile)}</div> : <div className="rounded-[2rem] border border-dashed border-[#E3ECF8] bg-white p-10 text-center font-black text-[#64748B]">No status uploaded yet.</div>}</div>}
    </div>
  );

  if (!isCommunityAllowed) {
    return <section className="flex h-[100dvh] items-center justify-center bg-gradient-to-br from-[#DCEEFF] via-[#EAF5FF] to-[#F8FBFF] px-4 text-[#081B5C]"><div className="max-w-md rounded-[2rem] border border-[#E3ECF8] bg-white p-6 text-center shadow-[0_24px_70px_rgba(79,123,255,0.14)]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-2xl">🔐</div><h2 className="mt-4 text-2xl font-black">Login required</h2><p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">Community is protected. Redirecting you to login...</p><button type="button" onClick={redirectToAuth} className="mt-5 rounded-2xl bg-[#4F7BFF] px-5 py-3 text-sm font-black text-white">Open login</button></div></section>;
  }

  return (
    <section style={communityCssVars} className="eduvora-community-polish relative h-[100dvh] overflow-hidden bg-[var(--community-page-bg)] p-0 text-[var(--community-body)] sm:p-4 lg:p-6">
      <style>{`
        @keyframes eduvoraBondShine {
          0% { transform: translateX(0); opacity: 0; }
          22% { opacity: 1; }
          55% { transform: translateX(220px); opacity: 0.75; }
          100% { transform: translateX(320px); opacity: 0; }
        }
        ${communityPolishCss}
      `}</style>
      {notificationDropdownPortal}
      {renderMasterTagDetailOverlay()}
      {imageLightbox ? <div className="fixed inset-0 z-[1800] flex items-center justify-center bg-[#081B5C]/80 p-4 backdrop-blur-xl"><button type="button" onClick={() => setImageLightbox(null)} className="absolute right-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-black text-[#081B5C]">Close</button><div className="flex max-h-[90dvh] max-w-[94vw] items-center justify-center overflow-hidden rounded-[2rem] bg-white p-3 shadow-2xl">{renderUploadedImage(imageLightbox.src, imageLightbox.alt, 'original')}</div></div> : null}
      <CommunityAiMentor
        isOpen={isCommunityAiOpen}
        userId={guardedAuth.currentUser?.uid || ''}
        context={communityAiContext}
        onClose={() => setIsCommunityAiOpen(false)}
        returnFocusRef={communityAiButtonRef}
      />
      {page === 'statusReel' ? renderStatusReel() : null}
      <ShareComposerModal />
      <div className="eduvora-community-app mx-auto flex h-full min-w-0 max-w-[1720px] overflow-hidden border border-[var(--community-border)] bg-[var(--community-surface)]/62 shadow-[var(--community-shadow)] backdrop-blur-2xl sm:rounded-[2rem] lg:rounded-[2.5rem]">
        <CommunitySidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <CommunityHeader />
          <main ref={scrollContainerRef} className={`eduvora-community-main min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pt-4 custom-scrollbar sm:px-5 lg:px-7 lg:pb-7 ${
            shouldHideCommunityDockOnMobile
              ? 'pb-32 max-md:pb-0 max-md:overscroll-contain'
              : 'pb-32 max-md:pb-32 max-md:overscroll-contain'
          }`}>
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
