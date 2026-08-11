import { useState } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { NavProvider, useNav } from "./context/NavContext";
import { CURRENT_USER_ID } from "./data/seed";
import type { Post } from "./types";

import BottomNav, { type TabName } from "./components/BottomNav";
import CommentSheet from "./components/CommentSheet";
import CreateModal from "./components/CreateModal";
import StoryViewer from "./components/StoryViewer";
import Toast from "./components/Toast";

import FeedScreen from "./screens/FeedScreen";
import SearchScreen from "./screens/SearchScreen";
import ProfileScreen from "./screens/ProfileScreen";
import FollowListScreen from "./screens/FollowListScreen";
import NotificationsScreen from "./screens/NotificationsScreen";
import ChatsListScreen from "./screens/ChatsListScreen";
import ChatScreen from "./screens/ChatScreen";
import ShareToChatSheet from "./components/ShareToChatSheet";

// AI Chat Icon placeholder - just the button, no functionality yet
const AIIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 2l1.6 4.9L18.5 8l-4.9 1.6L12 14.5l-1.6-4.9L5.5 8l4.9-1.1L12 2Z" />
    <path d="M5 19l1.2 3.6L10 24l-3.8 1.4L5 29l-1.2-3.6L0 24l3.8-1.4L5 19Z" opacity="0.5" />
  </svg>
);

function AppShell() {
  const { state, getOrCreateChat } = useApp();
  const { stack, push, pop, popAll } = useNav();

  const [activeTab, setActiveTab] = useState<TabName>("feed");
  const [searchQuery, setSearchQuery] = useState("");
  const [storiesInitialId, setStoriesInitialId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultTab, setCreateDefaultTab] = useState<"post" | "story">("post");

  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [commentFocusAI, setCommentFocusAI] = useState(false);
  const [commentShowFull, setCommentShowFull] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [shareContent, setShareContent] = useState<{ type: "post" | "story"; id: string; preview?: string } | null>(null);

  const changeTab = (tab: TabName) => {
    popAll();
    setActiveTab(tab);
  };

  const openProfile = (userId: string) => {
    push({ name: "profile", userId });
  };

  const openComments = (post: Post, focusAI?: boolean) => {
    setCommentPost(post);
    setCommentFocusAI(!!focusAI);
    setCommentShowFull(false);
  };

  const openPostDetail = (post: Post, focusAI?: boolean) => {
    setCommentPost(post);
    setCommentFocusAI(!!focusAI);
    setCommentShowFull(true);
  };

  const openTag = (tag: string) => {
    setSearchQuery(tag);
    changeTab("search");
  };

  const openStory = (storyId: string) => {
    setStoriesInitialId(storyId);
    changeTab("stories");
  };

  const openCreate = (tab: "post" | "story") => {
    setCreateDefaultTab(tab);
    setCreateOpen(true);
  };

  const openChat = (userId: string) => {
    const chat = getOrCreateChat(userId);
    push({ name: "chat", chatId: chat.id });
  };

  const openChatById = (chatId: string) => {
    push({ name: "chat", chatId });
  };

  const unreadCount = state.notifications.filter((n) => !n.read).length;
  const unreadChatCount = state.chats
    .filter((c) => c.participantIds.includes(CURRENT_USER_ID) && !(c.deletedFor || []).includes(CURRENT_USER_ID))
    .reduce((sum, c) => sum + c.messages.filter((m) => m.senderId !== CURRENT_USER_ID && !m.read).length, 0);
  
  const topOverlay = stack[stack.length - 1];

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      {/* Root tabs - kept mounted to preserve scroll/search state */}
      <div className="absolute inset-0" style={{ display: activeTab === "feed" ? "block" : "none" }}>
        <FeedScreen
          onOpenProfile={openProfile}
          onOpenComments={openComments}
          onOpenNotifications={() => push({ name: "notifications" })}
          onOpenChats={() => push({ name: "chats" })}
          onOpenStory={openStory}
          onCreateStory={() => openCreate("story")}
          onOpenTag={openTag}
          unreadCount={unreadCount}
          unreadChatCount={unreadChatCount}
        />
      </div>

      <div className="absolute inset-0 pb-16" style={{ display: activeTab === "search" ? "block" : "none" }}>
        <SearchScreen
          onOpenProfile={openProfile}
          onOpenPost={openPostDetail}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onOpenChat={openChat}
        />
      </div>

      <div className="absolute inset-0" style={{ display: activeTab === "stories" ? "block" : "none" }}>
        {activeTab === "stories" && state.stories.length > 0 && (
          <StoryViewer
            initialStoryId={storiesInitialId ?? state.stories[0].id}
            onClose={() => changeTab("feed")}
            onOpenProfile={openProfile}
          />
        )}
      </div>

      <div className="absolute inset-0 pb-16" style={{ display: activeTab === "profile" ? "block" : "none" }}>
        <ProfileScreen
          userId={CURRENT_USER_ID}
          onOpenFollowers={(id) => push({ name: "followers", userId: id })}
          onOpenFollowing={(id) => push({ name: "following", userId: id })}
          onOpenPost={openPostDetail}
          onOpenChat={openChat}
        />
      </div>

      {/* Bottom nav (hidden during full-screen immersive stories) */}
      {activeTab !== "stories" && !topOverlay && (
        <BottomNav active={activeTab} onChange={changeTab} onCreate={() => openCreate("post")} />
      )}

      {/* AI Chat floating button */}
      {activeTab !== "stories" && !topOverlay && (
        <button
          onClick={() => setToast("🤖 AI Chat coming soon!")}
          className="absolute right-4 bottom-20 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200 active:scale-95 transition"
        >
          <AIIcon />
        </button>
      )}

      {/* Pushed overlay stack */}
      {stack.map((entry, idx) => {
        const isTop = idx === stack.length - 1;
        return (
          <div
            key={idx}
            className="absolute inset-0 z-30 bg-white"
            style={{ display: isTop ? "block" : "none" }}
          >
            {entry.name === "notifications" && (
              <NotificationsScreen onBack={pop} onOpenProfile={openProfile} />
            )}
            {entry.name === "followers" && (
              <FollowListScreen userId={entry.userId} mode="followers" onBack={pop} onOpenProfile={openProfile} />
            )}
            {entry.name === "following" && (
              <FollowListScreen userId={entry.userId} mode="following" onBack={pop} onOpenProfile={openProfile} />
            )}
            {entry.name === "profile" && (
              <ProfileScreen
                userId={entry.userId}
                showBack
                onBack={pop}
                onOpenFollowers={(id) => push({ name: "followers", userId: id })}
                onOpenFollowing={(id) => push({ name: "following", userId: id })}
                onOpenPost={openPostDetail}
                onOpenChat={openChat}
              />
            )}
            {entry.name === "chats" && (
              <ChatsListScreen
                onBack={pop}
                onOpenChat={openChatById}
                onOpenProfile={openProfile}
                onNewChat={() => {
                  pop();
                  setSearchQuery("");
                  changeTab("search");
                  setToast("💬 Search a user to start chatting!");
                }}
              />
            )}
            {entry.name === "chat" && (
              <ChatScreen
                chatId={entry.chatId}
                onBack={pop}
                onOpenProfile={openProfile}
              />
            )}
          </div>
        );
      })}

      {commentPost && (
        <CommentSheet
          post={state.posts.find((p) => p.id === commentPost.id) ?? commentPost}
          onClose={() => setCommentPost(null)}
          onOpenProfile={(id) => {
            setCommentPost(null);
            openProfile(id);
          }}
          focusAI={commentFocusAI}
          showFullPost={commentShowFull}
        />
      )}

      {createOpen && (
        <CreateModal
          defaultTab={createDefaultTab}
          onClose={() => {
            setCreateOpen(false);
            setToast(createDefaultTab === "post" ? "🎉 Posted to your feed!" : "✨ Added to your story!");
          }}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-0 sm:p-6">
      <div className="relative h-[100dvh] w-full overflow-hidden bg-white sm:h-[850px] sm:max-h-[92vh] sm:w-[420px] sm:rounded-[2.5rem] sm:shadow-2xl sm:ring-8 sm:ring-black">
        <AppProvider>
          <NavProvider>
            <AppShell />
          </NavProvider>
        </AppProvider>
      </div>
    </div>
  );
}
