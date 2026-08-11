import { useApp } from "../context/AppContext";
import PostCard from "../components/PostCard";
import StoriesBar from "../components/StoriesBar";
import type { Post } from "../types";

interface FeedScreenProps {
  onOpenProfile: (userId: string) => void;
  onOpenComments: (post: Post, focusAI?: boolean) => void;
  onOpenNotifications: () => void;
  onOpenChats: () => void;
  onOpenStory: (storyId: string) => void;
  onCreateStory: () => void;
  onOpenTag: (tag: string) => void;
  unreadCount: number;
  unreadChatCount: number;
}

const BellIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.9-.9L3 20l1-5.4A8.5 8.5 0 1 1 21 11.5Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function FeedScreen({
  onOpenProfile,
  onOpenComments,
  onOpenNotifications,
  onOpenChats,
  onOpenStory,
  onCreateStory,
  onOpenTag,
  unreadCount,
  unreadChatCount,
}: FeedScreenProps) {
  const { state } = useApp();

  return (
    <div className="h-full overflow-y-auto pb-4">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="bg-gradient-to-r from-fuchsia-600 to-orange-500 bg-clip-text text-xl font-extrabold text-transparent">
          Pulse
        </h1>
        <div className="flex items-center gap-3">
          <button onClick={onOpenChats} className="relative text-slate-700">
            <ChatIcon />
            {unreadChatCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-fuchsia-500 text-[9px] font-bold text-white">
                {unreadChatCount}
              </span>
            )}
          </button>
          <button onClick={onOpenNotifications} className="relative text-slate-700">
            <BellIcon />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="border-b border-slate-100">
        <StoriesBar onOpenStory={onOpenStory} onCreateStory={onCreateStory} />
      </div>

      <div>
        {state.posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onOpenProfile={onOpenProfile}
            onOpenComments={onOpenComments}
            onOpenTag={onOpenTag}
          />
        ))}
      </div>
    </div>
  );
}
