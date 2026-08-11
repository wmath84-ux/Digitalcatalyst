import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { AppNotification, Chat, ChatMessage, Comment, Post, Story, User } from "../types";
import {
  CURRENT_USER_ID,
  seedChats,
  seedNotifications,
  seedPosts,
  seedStories,
  seedUsers,
} from "../data/seed";

interface State {
  users: Record<string, User>;
  posts: Post[];
  stories: Story[];
  notifications: AppNotification[];
  chats: Chat[];
}

const initialState: State = {
  users: Object.fromEntries(seedUsers.map((u) => [u.id, u])),
  posts: seedPosts,
  stories: seedStories,
  notifications: seedNotifications,
  chats: seedChats,
};

type Action =
  | { type: "TOGGLE_LIKE_POST"; postId: string }
  | { type: "ADD_COMMENT"; postId: string; text: string }
  | { type: "TOGGLE_LIKE_COMMENT"; postId: string; commentId: string }
  | { type: "DELETE_COMMENT"; postId: string; commentId: string }
  | { type: "VOTE_POLL"; postId: string; optionId: string }
  | { type: "VOTE_STORY_POLL"; storyId: string; optionId: string }
  | { type: "TOGGLE_LIKE_STORY"; storyId: string }
  | { type: "MARK_STORY_VIEWED"; storyId: string }
  | { type: "FOLLOW"; userId: string }
  | { type: "UNFOLLOW"; userId: string }
  | { type: "ADD_POST"; post: Post }
  | { type: "DELETE_POST"; postId: string }
  | { type: "ADD_STORY"; story: Story }
  | { type: "DELETE_STORY"; storyId: string }
  | { type: "SHARE_POST"; postId: string }
  | { type: "REPOST"; postId: string }
  | { type: "TOGGLE_BOOKMARK"; postId: string }
  | { type: "MARK_NOTIFICATIONS_READ" }
  | { type: "TOGGLE_NOTIFICATION_READ"; notificationId: string }
  | { type: "DELETE_NOTIFICATION"; notificationId: string }
  | { type: "ADD_NOTIFICATION"; notification: AppNotification }
  | { type: "UPDATE_PROFILE"; userId: string; updates: Partial<User> }
  | { type: "SEND_MESSAGE"; chatId: string; message: ChatMessage }
  | { type: "CREATE_CHAT"; chat: Chat }
  | { type: "DELETE_MESSAGE"; chatId: string; messageId: string }
  | { type: "DELETE_CHAT"; chatId: string }
  | { type: "MARK_CHAT_READ"; chatId: string }
  | { type: "BLOCK_USER"; userId: string }
  | { type: "UNBLOCK_USER"; userId: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "TOGGLE_LIKE_POST": {
      return {
        ...state,
        posts: state.posts.map((p) => {
          if (p.id !== action.postId) return p;
          const liked = p.likes.includes(CURRENT_USER_ID);
          return {
            ...p,
            likes: liked
              ? p.likes.filter((id) => id !== CURRENT_USER_ID)
              : [...p.likes, CURRENT_USER_ID],
          };
        }),
      };
    }
    case "ADD_COMMENT": {
      const comment: Comment = {
        id: `c${Date.now()}`,
        authorId: CURRENT_USER_ID,
        text: action.text,
        createdAt: Date.now(),
        likes: [],
      };
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId ? { ...p, comments: [...p.comments, comment] } : p
        ),
      };
    }
    case "TOGGLE_LIKE_COMMENT": {
      return {
        ...state,
        posts: state.posts.map((p) => {
          if (p.id !== action.postId) return p;
          return {
            ...p,
            comments: p.comments.map((c) => {
              if (c.id !== action.commentId) return c;
              const liked = c.likes.includes(CURRENT_USER_ID);
              return {
                ...c,
                likes: liked
                  ? c.likes.filter((id) => id !== CURRENT_USER_ID)
                  : [...c.likes, CURRENT_USER_ID],
              };
            }),
          };
        }),
      };
    }
    case "DELETE_COMMENT": {
      return {
        ...state,
        posts: state.posts.map((p) => {
          if (p.id !== action.postId) return p;
          return {
            ...p,
            comments: p.comments.filter((c) => c.id !== action.commentId),
          };
        }),
      };
    }
    case "VOTE_POLL": {
      return {
        ...state,
        posts: state.posts.map((p) => {
          if (p.id !== action.postId || !p.poll) return p;
          if (p.poll.votedOptionId) return p;
          return {
            ...p,
            poll: {
              ...p.poll,
              votedOptionId: action.optionId,
              options: p.poll.options.map((o) =>
                o.id === action.optionId ? { ...o, votes: o.votes + 1 } : o
              ),
            },
          };
        }),
      };
    }
    case "VOTE_STORY_POLL": {
      return {
        ...state,
        stories: state.stories.map((s) => {
          if (s.id !== action.storyId || !s.poll) return s;
          if (s.poll.votedOptionId) return s;
          return {
            ...s,
            poll: {
              ...s.poll,
              votedOptionId: action.optionId,
              options: s.poll.options.map((o) =>
                o.id === action.optionId ? { ...o, votes: o.votes + 1 } : o
              ),
            },
          };
        }),
      };
    }
    case "TOGGLE_LIKE_STORY": {
      return {
        ...state,
        stories: state.stories.map((s) => {
          if (s.id !== action.storyId) return s;
          const liked = s.likes.includes(CURRENT_USER_ID);
          return {
            ...s,
            likes: liked
              ? s.likes.filter((id) => id !== CURRENT_USER_ID)
              : [...s.likes, CURRENT_USER_ID],
          };
        }),
      };
    }
    case "MARK_STORY_VIEWED": {
      return {
        ...state,
        stories: state.stories.map((s) =>
          s.id === action.storyId && !s.viewedBy.includes(CURRENT_USER_ID)
            ? { ...s, viewedBy: [...s.viewedBy, CURRENT_USER_ID] }
            : s
        ),
      };
    }
    case "FOLLOW": {
      const me = state.users[CURRENT_USER_ID];
      const target = state.users[action.userId];
      if (!me || !target || me.following.includes(action.userId)) return state;
      return {
        ...state,
        users: {
          ...state.users,
          [CURRENT_USER_ID]: { ...me, following: [...me.following, action.userId] },
          [action.userId]: { ...target, followers: [...target.followers, CURRENT_USER_ID] },
        },
      };
    }
    case "UNFOLLOW": {
      const me = state.users[CURRENT_USER_ID];
      const target = state.users[action.userId];
      if (!me || !target || target.isAdmin) return state;
      return {
        ...state,
        users: {
          ...state.users,
          [CURRENT_USER_ID]: {
            ...me,
            following: me.following.filter((id) => id !== action.userId),
          },
          [action.userId]: {
            ...target,
            followers: target.followers.filter((id) => id !== CURRENT_USER_ID),
          },
        },
      };
    }
    case "ADD_POST": {
      return { ...state, posts: [action.post, ...state.posts] };
    }
    case "DELETE_POST": {
      return {
        ...state,
        posts: state.posts.filter((p) => p.id !== action.postId),
      };
    }
    case "ADD_STORY": {
      return { ...state, stories: [action.story, ...state.stories] };
    }
    case "DELETE_STORY": {
      return {
        ...state,
        stories: state.stories.filter((s) => s.id !== action.storyId),
      };
    }
    case "SHARE_POST": {
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId ? { ...p, shares: p.shares + 1 } : p
        ),
      };
    }
    case "REPOST": {
      return {
        ...state,
        posts: state.posts.map((p) => {
          if (p.id !== action.postId) return p;
          const reposted = p.repostedBy?.includes(CURRENT_USER_ID);
          return {
            ...p,
            repostedBy: reposted
              ? (p.repostedBy || []).filter((id) => id !== CURRENT_USER_ID)
              : [...(p.repostedBy || []), CURRENT_USER_ID],
          };
        }),
      };
    }
    case "TOGGLE_BOOKMARK": {
      const me = state.users[CURRENT_USER_ID];
      if (!me) return state;
      const bookmarks = me.bookmarks || [];
      const isBookmarked = bookmarks.includes(action.postId);
      return {
        ...state,
        users: {
          ...state.users,
          [CURRENT_USER_ID]: {
            ...me,
            bookmarks: isBookmarked
              ? bookmarks.filter((id) => id !== action.postId)
              : [...bookmarks, action.postId],
          },
        },
      };
    }
    case "MARK_NOTIFICATIONS_READ": {
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      };
    }
    case "TOGGLE_NOTIFICATION_READ": {
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.notificationId ? { ...n, read: !n.read } : n
        ),
      };
    }
    case "DELETE_NOTIFICATION": {
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.notificationId),
      };
    }
    case "ADD_NOTIFICATION": {
      return { ...state, notifications: [action.notification, ...state.notifications] };
    }
    case "UPDATE_PROFILE": {
      const user = state.users[action.userId];
      if (!user) return state;
      return { ...state, users: { ...state.users, [action.userId]: { ...user, ...action.updates } } };
    }
    case "SEND_MESSAGE": {
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.id === action.chatId
            ? { ...c, messages: [...c.messages, action.message], lastMessageAt: action.message.createdAt }
            : c
        ),
      };
    }
    case "CREATE_CHAT": {
      return { ...state, chats: [action.chat, ...state.chats] };
    }
    case "DELETE_MESSAGE": {
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.id === action.chatId
            ? { ...c, messages: c.messages.filter((m) => m.id !== action.messageId) }
            : c
        ),
      };
    }
    case "DELETE_CHAT": {
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.id === action.chatId
            ? { ...c, deletedFor: [...(c.deletedFor || []), CURRENT_USER_ID] }
            : c
        ),
      };
    }
    case "MARK_CHAT_READ": {
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.id === action.chatId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.senderId !== CURRENT_USER_ID ? { ...m, read: true } : m
                ),
              }
            : c
        ),
      };
    }
    case "BLOCK_USER": {
      const me = state.users[CURRENT_USER_ID];
      if (!me) return state;
      const blocked = me.blockedUsers || [];
      if (blocked.includes(action.userId)) return state;
      return {
        ...state,
        users: {
          ...state.users,
          [CURRENT_USER_ID]: { ...me, blockedUsers: [...blocked, action.userId] },
        },
      };
    }
    case "UNBLOCK_USER": {
      const me = state.users[CURRENT_USER_ID];
      if (!me) return state;
      return {
        ...state,
        users: {
          ...state.users,
          [CURRENT_USER_ID]: {
            ...me,
            blockedUsers: (me.blockedUsers || []).filter((id) => id !== action.userId),
          },
        },
      };
    }
    default:
      return state;
  }
}

interface AppContextValue {
  state: State;
  currentUser: User;
  dispatch: React.Dispatch<Action>;
  toggleLikePost: (postId: string) => void;
  addComment: (postId: string, text: string) => void;
  toggleLikeComment: (postId: string, commentId: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  votePoll: (postId: string, optionId: string) => void;
  voteStoryPoll: (storyId: string, optionId: string) => void;
  toggleLikeStory: (storyId: string) => void;
  markStoryViewed: (storyId: string) => void;
  follow: (userId: string) => void;
  unfollow: (userId: string) => void;
  addPost: (post: Post) => void;
  deletePost: (postId: string) => void;
  addStory: (story: Story) => void;
  deleteStory: (storyId: string) => void;
  sharePost: (postId: string) => void;
  repost: (postId: string) => void;
  toggleBookmark: (postId: string) => void;
  markNotificationsRead: () => void;
  toggleNotificationRead: (notificationId: string) => void;
  deleteNotification: (notificationId: string) => void;
  updateProfile: (userId: string, updates: Partial<User>) => void;
  sendMessage: (chatId: string, message: ChatMessage) => void;
  createChat: (chat: Chat) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  deleteChat: (chatId: string) => void;
  markChatRead: (chatId: string) => void;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  getOrCreateChat: (userId: string) => Chat;
}

const AppContext = createContext<AppContextValue | null>(null);

let notifCounter = 0;
function makeNotification(partial: Omit<AppNotification, "id" | "createdAt" | "read">): AppNotification {
  notifCounter += 1;
  return { ...partial, id: `n-gen-${Date.now()}-${notifCounter}`, createdAt: Date.now(), read: false };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const toggleLikePost = useCallback((postId: string) => {
    dispatch({ type: "TOGGLE_LIKE_POST", postId });
  }, []);

  const addComment = useCallback((postId: string, text: string) => {
    dispatch({ type: "ADD_COMMENT", postId, text });
  }, []);

  const toggleLikeComment = useCallback((postId: string, commentId: string) => {
    dispatch({ type: "TOGGLE_LIKE_COMMENT", postId, commentId });
  }, []);

  const deleteComment = useCallback((postId: string, commentId: string) => {
    dispatch({ type: "DELETE_COMMENT", postId, commentId });
  }, []);

  const votePoll = useCallback((postId: string, optionId: string) => {
    dispatch({ type: "VOTE_POLL", postId, optionId });
  }, []);

  const voteStoryPoll = useCallback((storyId: string, optionId: string) => {
    dispatch({ type: "VOTE_STORY_POLL", storyId, optionId });
  }, []);

  const toggleLikeStory = useCallback((storyId: string) => {
    dispatch({ type: "TOGGLE_LIKE_STORY", storyId });
  }, []);

  const markStoryViewed = useCallback((storyId: string) => {
    dispatch({ type: "MARK_STORY_VIEWED", storyId });
  }, []);

  const follow = useCallback((userId: string) => {
    dispatch({ type: "FOLLOW", userId });
    if (Math.random() > 0.4) {
      setTimeout(() => {
        dispatch({
          type: "ADD_NOTIFICATION",
          notification: makeNotification({
            type: "follow",
            fromUserId: userId,
            text: "followed you back",
          }),
        });
      }, 1800 + Math.random() * 1200);
    }
  }, []);

  const unfollow = useCallback((userId: string) => {
    dispatch({ type: "UNFOLLOW", userId });
  }, []);

  const addPost = useCallback((post: Post) => {
    dispatch({ type: "ADD_POST", post });
    const engagers = ["admin", "u2", "u3", "u4", "u5"].filter((id) => id !== post.authorId);
    const engager = engagers[Math.floor(Math.random() * engagers.length)];
    setTimeout(() => {
      dispatch({ type: "TOGGLE_LIKE_POST", postId: post.id });
      dispatch({
        type: "ADD_NOTIFICATION",
        notification: makeNotification({ type: "like", fromUserId: engager, postId: post.id, text: "liked your post" }),
      });
    }, 2500);
  }, []);

  const deletePost = useCallback((postId: string) => {
    dispatch({ type: "DELETE_POST", postId });
  }, []);

  const addStory = useCallback((story: Story) => {
    dispatch({ type: "ADD_STORY", story });
  }, []);

  const deleteStory = useCallback((storyId: string) => {
    dispatch({ type: "DELETE_STORY", storyId });
  }, []);

  const sharePost = useCallback((postId: string) => {
    dispatch({ type: "SHARE_POST", postId });
  }, []);

  const repost = useCallback((postId: string) => {
    dispatch({ type: "REPOST", postId });
  }, []);

  const toggleBookmark = useCallback((postId: string) => {
    dispatch({ type: "TOGGLE_BOOKMARK", postId });
  }, []);

  const markNotificationsRead = useCallback(() => {
    dispatch({ type: "MARK_NOTIFICATIONS_READ" });
  }, []);

  const toggleNotificationRead = useCallback((notificationId: string) => {
    dispatch({ type: "TOGGLE_NOTIFICATION_READ", notificationId });
  }, []);

  const deleteNotification = useCallback((notificationId: string) => {
    dispatch({ type: "DELETE_NOTIFICATION", notificationId });
  }, []);

  const updateProfile = useCallback((userId: string, updates: Partial<User>) => {
    dispatch({ type: "UPDATE_PROFILE", userId, updates });
  }, []);

  const sendMessage = useCallback((chatId: string, message: ChatMessage) => {
    dispatch({ type: "SEND_MESSAGE", chatId, message });
  }, []);

  const createChat = useCallback((chat: Chat) => {
    dispatch({ type: "CREATE_CHAT", chat });
  }, []);

  const deleteMessage = useCallback((chatId: string, messageId: string) => {
    dispatch({ type: "DELETE_MESSAGE", chatId, messageId });
  }, []);

  const deleteChat = useCallback((chatId: string) => {
    dispatch({ type: "DELETE_CHAT", chatId });
  }, []);

  const markChatRead = useCallback((chatId: string) => {
    dispatch({ type: "MARK_CHAT_READ", chatId });
  }, []);

  const blockUser = useCallback((userId: string) => {
    dispatch({ type: "BLOCK_USER", userId });
  }, []);

  const unblockUser = useCallback((userId: string) => {
    dispatch({ type: "UNBLOCK_USER", userId });
  }, []);

  const getOrCreateChat = useCallback(
    (userId: string): Chat => {
      const existing = state.chats.find(
        (c) =>
          c.participantIds.includes(CURRENT_USER_ID) &&
          c.participantIds.includes(userId) &&
          !(c.deletedFor || []).includes(CURRENT_USER_ID)
      );
      if (existing) return existing;
      const newChat: Chat = {
        id: `chat-${Date.now()}`,
        participantIds: [CURRENT_USER_ID, userId],
        messages: [],
        lastMessageAt: Date.now(),
      };
      dispatch({ type: "CREATE_CHAT", chat: newChat });
      return newChat;
    },
    [state.chats]
  );

  const currentUser = state.users[CURRENT_USER_ID];

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      currentUser,
      dispatch,
      toggleLikePost,
      addComment,
      toggleLikeComment,
      deleteComment,
      votePoll,
      voteStoryPoll,
      toggleLikeStory,
      markStoryViewed,
      follow,
      unfollow,
      addPost,
      deletePost,
      addStory,
      deleteStory,
      sharePost,
      repost,
      toggleBookmark,
      markNotificationsRead,
      toggleNotificationRead,
      deleteNotification,
      updateProfile,
      sendMessage,
      createChat,
      deleteMessage,
      deleteChat,
      markChatRead,
      blockUser,
      unblockUser,
      getOrCreateChat,
    }),
    [state, currentUser, toggleLikePost, addComment, toggleLikeComment, deleteComment, votePoll, voteStoryPoll, toggleLikeStory, markStoryViewed, follow, unfollow, addPost, deletePost, addStory, deleteStory, sharePost, repost, toggleBookmark, markNotificationsRead, toggleNotificationRead, deleteNotification, updateProfile, sendMessage, createChat, deleteMessage, deleteChat, markChatRead, blockUser, unblockUser, getOrCreateChat]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
