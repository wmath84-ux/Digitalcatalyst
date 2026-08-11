import { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { CURRENT_USER_ID } from "../data/seed";
import type { Post, Story } from "../types";
import { generateCaptionSuggestions, generatePollSuggestions, generateStoryIdeas } from "../utils/ai";
import { cn } from "../utils/cn";

interface CreateModalProps {
  onClose: () => void;
  defaultTab?: "post" | "story";
}

const STORY_GRADIENTS = [
  "from-indigo-600 via-purple-600 to-fuchsia-600",
  "from-emerald-500 via-teal-500 to-cyan-600",
  "from-sky-500 via-blue-600 to-indigo-700",
  "from-rose-500 via-red-600 to-orange-500",
  "from-amber-400 via-orange-500 to-rose-500",
  "from-slate-700 via-slate-800 to-black",
];

const TOPICS = ["travel", "food", "fitness", "tech", "music", "funny", "motivation"];

export default function CreateModal({ onClose, defaultTab = "post" }: CreateModalProps) {
  const { addPost, addStory } = useApp();
  const [tab, setTab] = useState<"post" | "story">(defaultTab);

  // Shared
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Poll builder
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  // Story specific
  const [storyType, setStoryType] = useState<"text" | "image" | "poll">("text");
  const [storyGradient, setStoryGradient] = useState(STORY_GRADIENTS[0]);

  // AI assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState("travel");
  const [aiMode, setAiMode] = useState<"caption" | "poll" | "story">("caption");
  const [aiResults, setAiResults] = useState<string[]>([]);
  const [aiPollResults, setAiPollResults] = useState<{ question: string; options: string[] }[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setImageUrl(URL.createObjectURL(file));
  };

  const updateOption = (idx: number, val: string) => {
    setPollOptions((opts) => opts.map((o, i) => (i === idx ? val : o)));
  };
  const addOption = () => setPollOptions((opts) => (opts.length < 4 ? [...opts, ""] : opts));
  const removeOption = (idx: number) => setPollOptions((opts) => opts.filter((_, i) => i !== idx));

  const runAI = () => {
    if (aiMode === "caption") {
      setAiResults(generateCaptionSuggestions(aiTopic));
      setAiPollResults([]);
    } else if (aiMode === "poll") {
      setAiPollResults(generatePollSuggestions(aiTopic));
      setAiResults([]);
    } else {
      setAiResults(generateStoryIdeas(aiTopic));
      setAiPollResults([]);
    }
  };

  const applyPollSuggestion = (s: { question: string; options: string[] }) => {
    setPollEnabled(true);
    setPollQuestion(s.question);
    setPollOptions(s.options.slice(0, 4));
    if (tab === "story") setStoryType("poll");
    setAiOpen(false);
  };

  const canPost = tab === "post"
    ? pollEnabled
      ? pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2
      : text.trim() || imageUrl
    : storyType === "poll"
      ? pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2
      : storyType === "image"
        ? !!imageUrl
        : text.trim();

  const resetAll = () => {
    setText("");
    setImageUrl(null);
    setPollEnabled(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setStoryType("text");
    setAiOpen(false);
    setAiResults([]);
    setAiPollResults([]);
  };

  const handleSubmit = () => {
    if (!canPost) return;
    if (tab === "post") {
      const post: Post = {
        id: `p-${Date.now()}`,
        authorId: CURRENT_USER_ID,
        type: pollEnabled ? "poll" : imageUrl ? "image" : "text",
        text: text.trim() || undefined,
        imageUrl: !pollEnabled && imageUrl ? imageUrl : undefined,
        poll: pollEnabled
          ? {
              question: pollQuestion.trim(),
              options: pollOptions
                .filter((o) => o.trim())
                .map((o, i) => ({ id: `o${i}`, text: o.trim(), votes: 0 })),
              votedOptionId: null,
            }
          : undefined,
        createdAt: Date.now(),
        likes: [],
        comments: [],
        shares: 0,
        tags: text.match(/#(\w+)/g)?.map((t) => t.slice(1)) ?? [],
      };
      addPost(post);
    } else {
      const story: Story = {
        id: `s-${Date.now()}`,
        authorId: CURRENT_USER_ID,
        type: storyType,
        text: text.trim() || undefined,
        imageUrl: storyType === "image" ? imageUrl ?? undefined : undefined,
        bgGradient: storyType !== "image" ? storyGradient : undefined,
        poll:
          storyType === "poll"
            ? {
                question: pollQuestion.trim(),
                options: pollOptions
                  .filter((o) => o.trim())
                  .map((o, i) => ({ id: `o${i}`, text: o.trim(), votes: 0 })),
                votedOptionId: null,
              }
            : undefined,
        createdAt: Date.now(),
        likes: [],
        viewedBy: [],
      };
      addStory(story);
    }
    resetAll();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[92%] min-h-[75%] flex-col rounded-t-3xl bg-white shadow-2xl animate-[slideUp_0.25s_ease-out]">
        <div className="flex items-center justify-center pt-2.5">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onClose} className="text-sm font-medium text-slate-400">
            Cancel
          </button>
          <h3 className="text-sm font-bold text-slate-900">Create</h3>
          <button
            onClick={handleSubmit}
            disabled={!canPost}
            className="rounded-full bg-gradient-to-r from-fuchsia-500 to-orange-400 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-30"
          >
            {tab === "post" ? "Post" : "Share"}
          </button>
        </div>

        <div className="flex gap-2 px-4 pb-2">
          <button
            onClick={() => setTab("post")}
            className={cn(
              "flex-1 rounded-full py-2 text-xs font-bold transition",
              tab === "post" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
            )}
          >
            Main Feed Post
          </button>
          <button
            onClick={() => setTab("story")}
            className={cn(
              "flex-1 rounded-full py-2 text-xs font-bold transition",
              tab === "story" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
            )}
          >
            Add to Story
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {tab === "story" && (
            <div className="mb-3 flex gap-2">
              {(["text", "image", "poll"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setStoryType(t)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[11px] font-bold capitalize",
                    storyType === t ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-600"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {!(tab === "story" && storyType === "poll") && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tab === "story" ? "Write your story text..." : "What's happening? Use @ to mention, # to tag"}
              rows={tab === "story" && storyType === "text" ? 5 : 3}
              className="w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-violet-300"
            />
          )}

          {tab === "story" && storyType === "text" && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold text-slate-500">Background</p>
              <div className="flex gap-2">
                {STORY_GRADIENTS.map((g) => (
                  <button
                    key={g}
                    onClick={() => setStoryGradient(g)}
                    className={cn(
                      "h-8 w-8 shrink-0 rounded-full bg-gradient-to-br",
                      g,
                      storyGradient === g && "ring-2 ring-offset-2 ring-slate-900"
                    )}
                  />
                ))}
              </div>
              <div className={cn("mt-3 flex h-28 items-center justify-center rounded-2xl bg-gradient-to-br p-4", storyGradient)}>
                <p className="text-center text-sm font-bold text-white">{text || "Your story preview"}</p>
              </div>
            </div>
          )}

          {((tab === "post" && !pollEnabled) || (tab === "story" && storyType === "image")) && (
            <div className="mt-3">
              {imageUrl ? (
                <div className="relative">
                  <img src={imageUrl} className="max-h-56 w-full rounded-2xl object-cover" alt="" />
                  <button
                    onClick={() => setImageUrl(null)}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-200 py-8 text-slate-400"
                >
                  <span className="text-2xl">📷</span>
                  <span className="text-xs font-semibold">Upload a photo</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
          )}

          {tab === "post" && (
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-[13px] font-semibold text-slate-700">📊 Add a poll / quiz</span>
              <button
                onClick={() => setPollEnabled((v) => !v)}
                className={cn(
                  "h-6 w-11 rounded-full p-0.5 transition",
                  pollEnabled ? "bg-violet-600" : "bg-slate-300"
                )}
              >
                <div className={cn("h-5 w-5 rounded-full bg-white transition-transform", pollEnabled && "translate-x-5")} />
              </button>
            </div>
          )}

          {((tab === "post" && pollEnabled) || (tab === "story" && storyType === "poll")) && (
            <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-3.5">
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ask a question..."
                className="w-full rounded-xl bg-white px-3.5 py-2.5 text-sm outline-none ring-1 ring-slate-200 focus:ring-violet-300"
              />
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="w-full rounded-xl bg-white px-3.5 py-2.5 text-sm outline-none ring-1 ring-slate-200 focus:ring-violet-300"
                  />
                  {pollOptions.length > 2 && (
                    <button onClick={() => removeOption(i)} className="text-slate-400">
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 4 && (
                <button onClick={addOption} className="text-xs font-bold text-violet-600">
                  + Add option
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setAiOpen((v) => !v)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-md active:scale-[0.98] transition"
          >
            ✨ Ask AI for ideas
          </button>

          {aiOpen && (
            <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-3.5">
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {(["caption", "poll", "story"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setAiMode(m)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold capitalize",
                      aiMode === m ? "bg-violet-600 text-white" : "bg-white text-violet-600"
                    )}
                  >
                    {m === "caption" ? "Captions" : m === "poll" ? "Poll Ideas" : "Story Ideas"}
                  </button>
                ))}
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {TOPICS.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => setAiTopic(topic)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                      aiTopic === topic ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
                    )}
                  >
                    {topic}
                  </button>
                ))}
              </div>
              <button onClick={runAI} className="mb-2 w-full rounded-xl bg-white py-2 text-xs font-bold text-violet-700 ring-1 ring-violet-200">
                Generate ✨
              </button>

              <div className="space-y-1.5">
                {aiResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setText(r);
                      setAiOpen(false);
                    }}
                    className="block w-full rounded-xl bg-white px-3 py-2 text-left text-[12.5px] text-slate-700 ring-1 ring-slate-100"
                  >
                    {r}
                  </button>
                ))}
                {aiPollResults.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => applyPollSuggestion(s)}
                    className="block w-full rounded-xl bg-white px-3 py-2 text-left text-[12.5px] text-slate-700 ring-1 ring-slate-100"
                  >
                    <span className="font-semibold">{s.question}</span>
                    <br />
                    <span className="text-slate-400">{s.options.join(" · ")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
