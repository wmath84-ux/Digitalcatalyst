import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ChatArea from "./components/ChatArea";
import ChatInput from "./components/ChatInput";
import SettingsSheet from "./components/SettingsSheet";
import ModelConfigModal from "./components/ModelConfigModal";
import { RenameDialog, ConfirmDialog } from "./components/Dialogs";
import { DEFAULT_MODELS, SUGGESTION_CHIPS, CANNED_REPLIES } from "./data/models";
import type { AIModel, Chat, ChatMessage, ThemeMode } from "./types";

const DEFAULT_MODEL_ID = "gemini-3-1-flash";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function makeChat(modelId: string, title = "New chat"): Chat {
  const now = Date.now();
  return { id: uid(), title, messages: [], modelId, createdAt: now, updatedAt: now };
}

export default function AiChatApp() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [models, setModels] = useState<AIModel[]>(DEFAULT_MODELS);
  const [chats, setChats] = useState<Chat[]>(() => [makeChat(DEFAULT_MODEL_ID, "Welcome chat")]);
  const [activeChatId, setActiveChatId] = useState<string>(() => chats[0]?.id ?? "");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);

  const [renameTarget, setRenameTarget] = useState<Chat | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Chat | null>(null);

  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    };
  }, []);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? chats[0],
    [chats, activeChatId]
  );

  const activeModel = useMemo(
    () => models.find((m) => m.id === activeChat?.modelId) ?? models[0],
    [models, activeChat]
  );

  const updateChat = (id: string, updater: (c: Chat) => Chat) => {
    setChats((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  };

  const handleNewChat = () => {
    const newChat = makeChat(activeModel?.id ?? DEFAULT_MODEL_ID);
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setDraft("");
    setSidebarOpen(false);
  };

  const handleSelectChat = (id: string) => {
    setActiveChatId(id);
    setDraft("");
  };

  const handleRenameChat = (id: string) => {
    const chat = chats.find((c) => c.id === id);
    if (chat) setRenameTarget(chat);
  };

  const confirmRename = (value: string) => {
    if (renameTarget) {
      updateChat(renameTarget.id, (c) => ({ ...c, title: value }));
    }
    setRenameTarget(null);
  };

  const handleDeleteChat = (id: string) => {
    const chat = chats.find((c) => c.id === id);
    if (chat) setDeleteTarget(chat);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== deleteTarget.id);
      if (next.length === 0) {
        const fresh = makeChat(activeModel?.id ?? DEFAULT_MODEL_ID);
        if (activeChatId === deleteTarget.id) setActiveChatId(fresh.id);
        return [fresh];
      }
      if (activeChatId === deleteTarget.id) {
        setActiveChatId(next[0].id);
      }
      return next;
    });
    setDeleteTarget(null);
  };

  const handleSelectModel = (modelId: string) => {
    if (!activeChat) return;
    updateChat(activeChat.id, (c) => ({ ...c, modelId, updatedAt: Date.now() }));
  };

  const handleSuggestion = (prompt: string) => {
    setDraft(prompt);
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !activeChat) return;

    const userMessage: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const isFirstMessage = activeChat.messages.length === 0;
    const autoTitle = text.length > 32 ? text.slice(0, 32).trim() + "…" : text;

    updateChat(activeChat.id, (c) => ({
      ...c,
      messages: [...c.messages, userMessage],
      title: isFirstMessage && c.title === "New chat" ? autoTitle : c.title,
      updatedAt: Date.now(),
    }));
    setDraft("");
    setIsTyping(true);

    const chatId = activeChat.id;
    const modelName = activeModel?.name ?? "the assistant";
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    typingTimeout.current = window.setTimeout(() => {
      const reply = CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)];
      const assistantMessage: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `${reply}\n\n— via ${modelName}`,
        timestamp: Date.now(),
      };
      updateChat(chatId, (c) => ({
        ...c,
        messages: [...c.messages, assistantMessage],
        updatedAt: Date.now(),
      }));
      setIsTyping(false);
    }, 1100 + Math.random() * 900);
  };

  const handleAddModel = (model: Omit<AIModel, "id" | "isCustom">) => {
    const newModel: AIModel = { ...model, id: uid(), isCustom: true };
    setModels((prev) => [...prev, newModel]);
  };

  const handleDeleteModel = (id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
    setChats((prev) =>
      prev.map((c) => (c.modelId === id ? { ...c, modelId: DEFAULT_MODEL_ID } : c))
    );
  };

  if (!activeChat) return null;

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      {/* Desktop wrappers REMOVED — full-screen 100vw × 100dvh */}
      <div className="relative h-dvh w-dvw overflow-hidden bg-white dark:bg-[#0b0c0f] flex flex-col">
        <Header
          onOpenSidebar={() => setSidebarOpen(true)}
          onNewChat={handleNewChat}
          models={models}
          selectedModelId={activeChat.modelId}
          onSelectModel={handleSelectModel}
        />

        <ChatArea
          chat={activeChat}
          model={activeModel}
          isTyping={isTyping}
          suggestions={SUGGESTION_CHIPS}
          onSuggestion={handleSuggestion}
        />

        <ChatInput
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          suggestions={SUGGESTION_CHIPS}
          onSuggestion={handleSuggestion}
          onOpenSettings={() => setSettingsOpen(true)}
          showSuggestions={activeChat.messages.length > 0}
        />

        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          chats={chats}
          activeChatId={activeChat.id}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onRenameChat={handleRenameChat}
          onDeleteChat={handleDeleteChat}
        />

        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          theme={theme}
          onToggleTheme={setTheme}
          onOpenModelConfig={() => {
            setSettingsOpen(false);
            setModelModalOpen(true);
          }}
        />

        <ModelConfigModal
          open={modelModalOpen}
          onClose={() => setModelModalOpen(false)}
          models={models}
          selectedModelId={activeChat.modelId}
          onSelectModel={handleSelectModel}
          onAddModel={handleAddModel}
          onDeleteModel={handleDeleteModel}
        />

        <RenameDialog
          open={!!renameTarget}
          initialValue={renameTarget?.title ?? ""}
          onCancel={() => setRenameTarget(null)}
          onConfirm={confirmRename}
        />

        <ConfirmDialog
          open={!!deleteTarget}
          title="Delete this chat?"
          description={`"${deleteTarget?.title ?? ""}" will be permanently removed. This action can't be undone.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      </div>
    </div>
  );
}
