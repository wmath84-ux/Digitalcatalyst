import type { AIModel, SuggestionChip } from "../types";

export const DEFAULT_MODELS: AIModel[] = [
  {
    id: "gemini-3-1-flash",
    name: "Gemini 3.1 Flash",
    provider: "Google",
    description: "Fast & versatile for everyday tasks",
    isCustom: false,
  },
  {
    id: "gemini-3-1-pro",
    name: "Gemini 3.1 Pro",
    provider: "Google",
    description: "Advanced reasoning for complex tasks",
    isCustom: false,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "Multimodal flagship model",
    isCustom: false,
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    description: "Thoughtful, nuanced writing",
    isCustom: false,
  },
  {
    id: "llama-3-70b",
    name: "Llama 3 70B",
    provider: "Meta",
    description: "Open-weight powerhouse",
    isCustom: false,
  },
];

export const SUGGESTION_CHIPS: SuggestionChip[] = [
  { icon: "✍️", label: "Help me write", prompt: "Help me write a short, friendly email about " },
  { icon: "📝", label: "Summarize this", prompt: "Summarize this in 3 bullet points: " },
  { icon: "💡", label: "Brainstorm ideas", prompt: "Brainstorm 5 creative ideas about " },
  { icon: "🧮", label: "Explain a concept", prompt: "Explain like I'm five: " },
  { icon: "🐛", label: "Debug my code", prompt: "Help me debug this code:\n\n" },
  { icon: "🗓️", label: "Plan my day", prompt: "Help me plan my day. My tasks are: " },
];

export const CANNED_REPLIES: string[] = [
  "That's a great question! Here's a quick take: I've broken it down into a few clear points so it's easy to follow, and I can go deeper on any part you'd like.",
  "Sure thing — here's a draft to get you started. Let me know if you'd like it shorter, more formal, or more playful in tone.",
  "Good thinking. Based on what you shared, here are a few directions worth exploring, ranked roughly by how quickly you could act on them.",
  "Here's a simple explanation without the jargon, plus a real-world analogy that should make it click faster.",
  "I spotted a likely issue and a couple of edge cases worth checking. Want me to walk through the fix step by step?",
  "Here's a balanced plan that leaves room for breaks — feel free to tell me your priorities and I'll reorder it.",
];
