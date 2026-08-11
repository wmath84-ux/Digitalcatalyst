export type ThemeMode = "light" | "dark";

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  isCustom: boolean;
  apiKey?: string;
  baseUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelId: string;
  createdAt: number;
  updatedAt: number;
}

export interface SuggestionChip {
  icon: string;
  label: string;
  prompt: string;
}
