import { useState } from "react";
import type { AIModel } from "../types";
import {
  ChevronDownIcon,
  CheckIcon,
  CpuIcon,
  GlobeIcon,
  KeyIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  XIcon,
} from "./icons";
import { cn } from "../utils/cn";

interface ModelConfigModalProps {
  open: boolean;
  onClose: () => void;
  models: AIModel[];
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  onAddModel: (model: Omit<AIModel, "id" | "isCustom">) => void;
  onDeleteModel: (id: string) => void;
}

const PROVIDER_OPTIONS = [
  "OpenAI-compatible",
  "Google Gemini",
  "Anthropic",
  "OpenRouter",
  "Ollama (local)",
  "Custom / Other",
];

export default function ModelConfigModal({
  open,
  onClose,
  models,
  selectedModelId,
  onSelectModel,
  onAddModel,
  onDeleteModel,
}: ModelConfigModalProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState(PROVIDER_OPTIONS[0]);
  const [providerOpen, setProviderOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setName("");
    setProvider(PROVIDER_OPTIONS[0]);
    setApiKey("");
    setBaseUrl("");
    setError("");
    setShowKey(false);
  };

  const handleSave = () => {
    if (!name.trim()) {
      setError("Please give your model a name.");
      return;
    }
    onAddModel({
      name: name.trim(),
      provider,
      description: baseUrl ? `Custom endpoint` : "Custom integration",
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
    });
    resetForm();
    setShowForm(false);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2200);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-[#0b0c0f] animate-fade-in-up">
      <div
        className="flex items-center justify-between px-4 pb-3 border-b border-zinc-100 dark:border-white/5"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
      >
        <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-50">
          Choose &amp; Manage Models
        </h2>
        <button
          onClick={() => {
            onClose();
            setShowForm(false);
            resetForm();
          }}
          className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <XIcon width={18} height={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {justAdded && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3.5 py-2.5 text-[12.5px] font-medium animate-fade-in-up">
            <CheckIcon width={15} height={15} />
            Custom model added successfully
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Available Models
          </p>
          <span className="text-[11px] text-zinc-400">{models.length} total</span>
        </div>

        <div className="space-y-2 mb-5">
          {models.map((m) => {
            const active = m.id === selectedModelId;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-3.5 transition",
                  active
                    ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10 dark:border-indigo-500/40"
                    : "border-zinc-150 dark:border-white/10 bg-white dark:bg-white/[0.02]"
                )}
              >
                <button
                  onClick={() => onSelectModel(m.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <span
                    className={cn(
                      "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                      active
                        ? "bg-gradient-to-br from-indigo-500 to-blue-500 text-white"
                        : "bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-300"
                    )}
                  >
                    {m.isCustom ? <CpuIcon width={16} height={16} /> : <SparkleIcon width={15} height={15} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-medium text-zinc-800 dark:text-zinc-100 truncate">
                        {m.name}
                      </span>
                      {m.isCustom && (
                        <span className="text-[9.5px] shrink-0 uppercase font-semibold tracking-wide text-purple-500 bg-purple-50 dark:bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                          Custom
                        </span>
                      )}
                    </span>
                    <span className="block text-[11.5px] text-zinc-400 truncate">
                      {m.provider}
                      {m.description ? ` · ${m.description}` : ""}
                    </span>
                  </span>
                </button>
                {active && (
                  <span className="h-6 w-6 rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0">
                    <CheckIcon width={13} height={13} />
                  </span>
                )}
                {m.isCustom && !active && (
                  <button
                    onClick={() => setConfirmDeleteId(m.id)}
                    className="h-8 w-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-white/15 py-4 text-[13.5px] font-medium text-indigo-500 dark:text-indigo-400 active:scale-[0.98] transition"
          >
            <PlusIcon width={17} height={17} />
            Add Custom Model / API
          </button>
        ) : (
          <div className="rounded-2xl border border-zinc-150 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] p-4 space-y-4 animate-fade-in-up">
            <p className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">
              New custom model
            </p>

            <div>
              <label className="block text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                Model name
              </label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError("");
                }}
                placeholder="e.g. Mistral Large, DeepSeek V3..."
                className="w-full rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3.5 py-2.5 text-[13.5px] text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-400/50 placeholder:text-zinc-400"
              />
            </div>

            <div className="relative">
              <label className="block text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                Provider / API type
              </label>
              <button
                onClick={() => setProviderOpen((v) => !v)}
                className="w-full flex items-center justify-between rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3.5 py-2.5 text-[13.5px] text-zinc-800 dark:text-zinc-100"
              >
                {provider}
                <ChevronDownIcon
                  width={15}
                  height={15}
                  className={cn("text-zinc-400 transition-transform", providerOpen && "rotate-180")}
                />
              </button>
              {providerOpen && (
                <div className="absolute z-10 mt-1.5 w-full rounded-xl bg-white dark:bg-[#1c1d22] shadow-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden animate-pop-in">
                  {PROVIDER_OPTIONS.map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setProvider(p);
                        setProviderOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3.5 py-2.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-white/5",
                        p === provider
                          ? "text-indigo-600 dark:text-indigo-300 font-medium"
                          : "text-zinc-700 dark:text-zinc-200"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                API key <span className="text-zinc-350 font-normal">(optional for local models)</span>
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3.5 py-2.5">
                <KeyIcon width={15} height={15} className="text-zinc-400 shrink-0" />
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type={showKey ? "text" : "password"}
                  placeholder="sk-••••••••••••••••"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="text-[11px] font-semibold text-indigo-500 shrink-0"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                Base URL <span className="text-zinc-350 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3.5 py-2.5">
                <GlobeIcon width={15} height={15} className="text-zinc-400 shrink-0" />
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>
            </div>

            {error && <p className="text-[12px] text-red-500">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="flex-1 rounded-xl py-2.5 text-[13.5px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/5 active:scale-[0.98] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-xl py-2.5 text-[13.5px] font-medium text-white bg-gradient-to-r from-indigo-500 to-blue-500 active:scale-[0.98] transition shadow-lg shadow-indigo-500/20"
              >
                Save model
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] px-4 pb-6 sm:pb-0">
          <div className="w-full max-w-[340px] rounded-2xl bg-white dark:bg-[#16171c] p-5 shadow-2xl animate-pop-in">
            <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50 mb-1.5">
              Delete this model?
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">
              This will remove it from your model list. Chats already using it will keep showing
              the model name.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 rounded-xl py-2.5 text-[13.5px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteModel(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="flex-1 rounded-xl py-2.5 text-[13.5px] font-medium text-white bg-red-500 active:scale-[0.98] transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
