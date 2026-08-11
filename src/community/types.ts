export interface User {
  id: string;
  username: string; // without @
  displayName: string;
  bio: string;
  gradient: string; // tailwind gradient classes for avatar
  bannerUrl?: string; // cover photo
  isAdmin?: boolean;
  verified?: boolean;
  followers: string[]; // user ids
  following: string[]; // user ids
  bookmarks?: string[]; // post ids
  blockedUsers?: string[]; // user ids
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  question: string;
  options: PollOption[];
  votedOptionId?: string | null;
}

export type PostType = "text" | "image" | "poll";

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
  likes: string[];
}

export interface Post {
  id: string;
  authorId: string;
  type: PostType;
  text?: string;
  imageUrl?: string;
  poll?: Poll;
  createdAt: number;
  likes: string[];
  comments: Comment[];
  shares: number;
  tags?: string[];
  repostedBy?: string[]; // user ids who reposted
  isPinned?: boolean;
}

export type StoryType = "text" | "image" | "poll";

export interface Story {
  id: string;
  authorId: string;
  type: StoryType;
  text?: string;
  imageUrl?: string;
  bgGradient?: string;
  poll?: Poll;
  createdAt: number;
  likes: string[];
  viewedBy: string[];
}

export type NotificationType =
  | "like"
  | "comment"
  | "follow"
  | "mention"
  | "poll_vote"
  | "story_like"
  | "repost"
  | "message";

export interface AppNotification {
  id: string;
  type: NotificationType;
  fromUserId: string;
  postId?: string;
  storyId?: string;
  text: string;
  createdAt: number;
  read: boolean;
}

// Chat/DM Types
export type MessageType = "text" | "image" | "post" | "story";

export interface ChatMessage {
  id: string;
  senderId: string;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  postId?: string;
  storyId?: string;
  createdAt: number;
  read: boolean;
}

export interface Chat {
  id: string;
  participantIds: string[]; // always 2 users
  messages: ChatMessage[];
  lastMessageAt: number;
  deletedFor?: string[]; // user ids who deleted this chat
}
