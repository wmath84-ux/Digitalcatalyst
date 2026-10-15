import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  CircleHelp,
  FileDown,
  FileUp,
  Layers3,
  LoaderCircle,
  PanelLeft,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import CourseBrainPanel, { type BrainPracticeSet } from "../course/CourseBrainPanel";
import { BrainCounter, BrainPill, BrainSurface } from "../course/BrainCards";
import type { CoursePlayerNote } from "../types/course";
import { collectBrainPracticeSets } from "../../utils/practiceSet.js";
import { getReviewVolume, getStreakInfo, getWorkload } from "../revision/engine/analytics";
import { buildStudyQueue } from "../revision/engine/queue";
import {
  AI_PROVIDERS,
  getProvider,
  generateQuestionsWithAi,
  loadUserAiConfig,
  saveUserAiConfig,
  type AIProviderId,
  type UserAiConfig,
} from "../revision/engine/aiConfig";
import { DEFAULT_MODEL, type GenerateInput } from "../revision/engine/aiGenerate";
import {
  createWorkRevisionDeck,
  createWorkRevisionSession,
  deleteWorkRevisionDeck,
  loadWorkRevisionSnapshot,
  recordWorkRevisionRating,
  saveWorkRevisionSnapshot,
  renameWorkRevisionDeck,
  skipWorkRevisionCard,
  workRevisionChangeEventName,
  type WorkRevisionCardInput,
} from "./storage/workRevisionDb";
import { parseWorkRevisionImport, type WorkRevisionImportResult } from "./storage/workRevisionImport";
import {
  createWorkRevisionBackup,
  parseWorkRevisionBackup,
  WORK_REVISION_BACKUP_MAX_BYTES,
  type WorkRevisionBackupEnvelope,
} from "./storage/workRevisionBackup";
import WorkRevisionTestPanel from "./WorkRevisionTestPanel";
import { WORK_DEVICE_UID } from "./workIdentity";
import type { UnifiedCard, UnifiedDeck, UnifiedRating, UnifiedSnapshot, UnifiedStudySession } from "../revision/domain/types";
import "./work-revision.css";

type View =
  | "dashboard"
  | "library"
  | "create-choice"
  | "create-flashcards"
  | "create-brain"
  | "import"
  | "ai"
  | "study-style"
  | "study-fsrs"
  | "study-result"
  | "study-brain";

type DraftFlashcard = { front: string; back: string; hint: string; tags: string };
type DraftBrainQuestion = { prompt: string; options: string[]; correctIndex: number; explanation: string; topic: string };
type WorkRevisionAppProps = {
  notes: CoursePlayerNote[];
  /**
   * Leaves Work for the app Home. The Revision page is headless in Work, so
   * its test panel carries this as the way out — the learner is never
   * trapped inside the Revision page.
   */
  onExit?: () => void;
};

const freshFlashcard = (): DraftFlashcard => ({ front: "", back: "", hint: "", tags: "" });
const freshBrainQuestion = (): DraftBrainQuestion => ({ prompt: "", options: ["", "", "", ""], correctIndex: 0, explanation: "", topic: "" });
const DEFAULT_MODELS: Record<AIProviderId, string> = {
  gemini: DEFAULT_MODEL,
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  groq: "llama-3.3-70b-versatile",
  custom: "",
};
const ratings: Array<{ key: UnifiedRating; label: string; tone: string }> = [
  { key: "again", label: "Again", tone: "again" },
  { key: "hard", label: "Hard", tone: "hard" },
  { key: "good", label: "Good", tone: "good" },
  { key: "easy", label: "Easy", tone: "easy" },
];

const relativeDate = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
};

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function WorkActionButton({
  children,
  onClick,
  icon,
  variant = "primary",
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const palette = {
    primary: "border-transparent bg-[var(--accent-color)] text-white hover:bg-[var(--accent-hover)]",
    secondary: "border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)]",
    quiet: "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]",
    danger: "border-rose-500/20 bg-rose-500/10 text-rose-600 hover:bg-rose-500/15 dark:text-rose-400",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-45",
        palette[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function WorkField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-relaxed text-[var(--text-tertiary)]">{hint}</span> : null}
    </label>
  );
}

const fieldClass = "w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/15";

function WorkRevisionDeckStrip({
  deck,
  cards,
  due,
  onStudy,
  onRename,
  onDelete,
  renaming,
}: {
  deck: UnifiedDeck;
  cards: UnifiedCard[];
  due: number;
  onStudy: () => void;
  onRename: (name?: string) => void;
  onDelete: () => void;
  renaming: boolean;
}) {
  const [draft, setDraft] = useState(deck.name);
  useEffect(() => setDraft(deck.name), [deck.name]);
  const brainCount = cards.filter((card) => card.cardType === "mcq" && (card.options?.length ?? 0) >= 2).length;
  return (
    <div className="work-revision-strip group flex min-w-0 flex-col gap-3 rounded-[18px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 shadow-[var(--work-shadow-card)] sm:flex-row sm:items-center" data-work-revision-deck={deck.id}>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[var(--border-color)] bg-[var(--accent-bg)] text-[var(--accent-color)]" aria-hidden="true">
        <Layers3 size={19} />
      </div>
      <div className="min-w-0 flex-1">
        {renaming ? (
          <form
            className="flex min-w-0 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onRename(draft);
            }}
          >
            <input
              name="deck-name"
              aria-label={`Rename ${deck.name}`}
              className={`${fieldClass} min-w-0 py-2`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
              onKeyDown={(event) => { if (event.key === "Escape") onRename(); }}
            />
            <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-bg)] text-[var(--accent-color)]" aria-label={`Save name for ${deck.name}`}>
              <Check size={16} />
            </button>
          </form>
        ) : (
          <>
            <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{deck.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
              <span>{cards.length} {cards.length === 1 ? "card" : "cards"}</span>
              {brainCount > 0 ? <span>{brainCount} Brain question{brainCount === 1 ? "" : "s"}</span> : null}
              <span>{due} due</span>
              <span>Edited {relativeDate(deck.updatedAt)}</span>
            </div>
          </>
        )}
      </div>
      {!renaming ? (
        <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
          <WorkActionButton variant="primary" className="min-h-9 px-3 py-1.5 text-xs" onClick={onStudy} icon={<BookOpen size={14} />}>Study</WorkActionButton>
          <button type="button" onClick={() => onRename()} aria-label={`Rename ${deck.name}`} title="Rename set" className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]"><Pencil size={15} /></button>
          <button type="button" onClick={onDelete} aria-label={`Delete ${deck.name}`} title="Delete set" className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-rose-500/10 hover:text-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"><Trash2 size={15} /></button>
        </div>
      ) : null}
    </div>
  );
}

/** The one test-panel button every Revision chrome carries at its top-left. */
function WorkRevisionPanelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open test panel"
      title="Switch test"
      data-work-revision-panel-button=""
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]"
    >
      <PanelLeft size={16} aria-hidden="true" />
    </button>
  );
}

function WorkRevisionTopline({
  title,
  subtitle,
  onBack,
  right,
  onOpenPanel,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  onOpenPanel?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-color)] px-3 py-2.5 sm:px-5" data-work-revision-subheader>
      {onOpenPanel ? <WorkRevisionPanelButton onClick={onOpenPanel} /> : null}
      {onBack ? <button type="button" onClick={onBack} aria-label="Back to Revision" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]"><ArrowLeft size={16} /></button> : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-extrabold text-[var(--text-primary)]">{title}</h2>
        {subtitle ? <p className="truncate text-[11px] text-[var(--text-tertiary)]">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

function WorkRevisionEmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[210px] max-w-[440px] flex-col items-center justify-center px-6 py-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--border-color)] bg-[var(--accent-bg)] text-[var(--accent-color)]"><BookOpen size={20} /></div>
      <h3 className="mt-3 text-base font-extrabold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1.5 max-w-[360px] text-sm leading-relaxed text-[var(--text-secondary)]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function WorkRevisionDeleteDialog({ deck, onCancel, onConfirm }: { deck: UnifiedDeck; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/45 p-4" role="presentation" data-work-revision-delete-dialog>
      <section role="dialog" aria-modal="true" aria-labelledby="work-revision-delete-title" className="w-full max-w-[420px] rounded-[22px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-5 text-[var(--text-primary)] shadow-[var(--work-shadow-pop)]">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/10 text-rose-600"><Trash2 size={18} /></div>
        <h3 id="work-revision-delete-title" className="mt-3 text-base font-extrabold">Delete this revision set?</h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]"><strong>{deck.name}</strong>, its cards, and its local review history will be removed from this device.</p>
        <div className="mt-5 flex justify-end gap-2"><WorkActionButton variant="secondary" onClick={onCancel}>Keep set</WorkActionButton><WorkActionButton variant="danger" onClick={onConfirm} icon={<Trash2 size={14} />}>Delete</WorkActionButton></div>
      </section>
    </div>
  );
}

function WorkRevisionRestoreDialog({
  fileName,
  backup,
  currentCounts,
  busy,
  onCancel,
  onConfirm,
}: {
  fileName: string;
  backup: WorkRevisionBackupEnvelope;
  currentCounts: { decks: number; cards: number; reviews: number };
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const incomingDecks = backup.snapshot.decks.length;
  const incomingCards = backup.snapshot.cards.length;
  const incomingReviews = backup.snapshot.reviewLogs.length;
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/45 p-4" role="presentation" data-work-revision-restore-dialog>
      <section role="dialog" aria-modal="true" aria-labelledby="work-revision-restore-title" className="w-full max-w-[460px] rounded-[22px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-5 text-[var(--text-primary)] shadow-[var(--work-shadow-pop)]">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-600"><FileUp size={18} /></div>
        <h3 id="work-revision-restore-title" className="mt-3 text-base font-extrabold">Replace this device’s Revision library?</h3>
        <p className="mt-1 break-words text-xs font-semibold text-[var(--text-tertiary)]">{fileName}</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          The backup contains {incomingDecks} set{incomingDecks === 1 ? "" : "s"}, {incomingCards} card{incomingCards === 1 ? "" : "s"}, and {incomingReviews} review{incomingReviews === 1 ? "" : "s"}. Restoring replaces the current Work Revision library ({currentCounts.decks} sets, {currentCounts.cards} cards, {currentCounts.reviews} reviews). This cannot be undone from inside Work.
        </p>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">The file is read locally and the restored data stays in the Work device namespace. Nothing is uploaded.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <WorkActionButton variant="secondary" onClick={onCancel} disabled={busy}>Cancel</WorkActionButton>
          <WorkActionButton variant="danger" onClick={onConfirm} disabled={busy} icon={busy ? <LoaderCircle className="animate-spin" size={14} /> : <FileUp size={14} />}>
            {busy ? "Restoring…" : "Replace with backup"}
          </WorkActionButton>
        </div>
      </section>
    </div>
  );
}

function asBrainSets(deck: UnifiedDeck, cards: UnifiedCard[]): BrainPracticeSet[] {
  const questions = cards
    .filter((card) => card.cardType === "mcq" && card.options && card.options.length >= 2)
    .map((card, index) => ({
      id: card.id,
      prompt: card.front,
      options: card.options ?? [],
      correctIndex: card.correctIndex ?? -1,
      explanation: card.explanation ?? card.back,
      difficulty: card.difficulty,
      topic: card.tags[0] ?? deck.name,
      _position: index,
    }));
  if (questions.length === 0) return [];
  return collectBrainPracticeSets(
    [{
      id: "work-revision-root",
      title: "Work Revision",
      accessLevel: "free",
      files: [{
        id: deck.id,
        name: deck.name,
        type: "brain",
        accessLevel: "free",
        practiceTitle: deck.name,
        practiceQuestions: questions,
      }],
    }],
    new Set(["work-revision-root"]),
  );
}

function WorkRevisionStylePreview({ variant, card = null }: { variant: "brain" | "convertible"; card?: UnifiedCard | null }) {
  const isBrain = variant === "brain";
  const prompt = card?.front ?? (isBrain ? "Which idea matters most?" : "What do you want to remember?");
  const options = isBrain && card?.options?.length ? card.options : ["The first idea", "A useful detail", "Something else"];
  return (
    <div className="pointer-events-none mx-auto w-full max-w-[360px]" data-work-revision-style-preview={variant} aria-hidden="true">
      <BrainSurface className="work-revision-card-face relative flex min-h-[142px] flex-col justify-center p-3 sm:p-4" shadow="rest">
        {isBrain ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Brain · question</span>
              <BrainCounter value={2} total={8} size={24} />
            </div>
            <p className="text-center text-xs font-extrabold leading-snug text-[var(--text-primary)]">{prompt}</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {options.slice(0, 4).map((option, index) => <span key={`${option}-${index}`} className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1.5 text-[9px] font-semibold text-[var(--text-primary)]">{String.fromCharCode(65 + index)} · {option}</span>)}
            </div>
          </>
        ) : (
          <>
            <span className="text-center text-[9px] font-black uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Convertible · FSRS</span>
            <p className="mt-2 text-center text-sm font-extrabold leading-snug text-[var(--text-primary)]">{prompt}</p>
            <div className="mt-3 flex justify-center"><BrainPill disabled className="text-[10px]" style={{ padding: "5px 12px", fontSize: 10, opacity: 1 }}>Show answer</BrainPill></div>
            {card?.back ? <p className="mt-2 line-clamp-1 text-center text-[10px] text-[var(--text-secondary)]">{card.back}</p> : null}
          </>
        )}
      </BrainSurface>
    </div>
  );
}

function WorkFlashcardReview({
  card,
  index,
  total,
  startedAt,
  busy,
  onReveal,
  revealed,
  selectedOption,
  submitted,
  onSelectOption,
  onSubmit,
  onRate,
  onSkip,
  onBack,
  onOpenPanel,
}: {
  card: UnifiedCard;
  index: number;
  total: number;
  startedAt: number;
  busy: boolean;
  onReveal: () => void;
  revealed: boolean;
  selectedOption: number | null;
  submitted: boolean;
  onSelectOption: (value: number) => void;
  onSubmit: () => void;
  onRate: (rating: UnifiedRating) => void;
  onSkip: () => void;
  /** Headless viewers keep their way back inside the card surface itself. */
  onBack?: () => void;
  /** Top-left test switcher: opens the test panel over this card. */
  onOpenPanel?: () => void;
}) {
  const isMcq = card.cardType === "mcq" && (card.options?.length ?? 0) >= 2;
  const isCorrect = selectedOption === card.correctIndex;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-6" data-work-revision-fsrs-card={card.id}>
      <div className="mx-auto flex w-full max-w-[780px] flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {onOpenPanel ? <WorkRevisionPanelButton onClick={onOpenPanel} /> : null}
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to study styles"
                title="Back to study styles"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]"
                data-work-revision-viewer-back=""
              >
                <ArrowLeft size={15} aria-hidden="true" />
              </button>
            ) : null}
            <span className="text-xs font-bold text-[var(--text-secondary)]">Card {index + 1} of {total}</span>
          </span>
          <span className="rounded-full border border-[var(--border-color)] px-2.5 py-1 text-[10px] font-semibold capitalize text-[var(--text-tertiary)]">{card.scheduling.state === "new" ? "New" : card.scheduling.state}</span>
        </div>
        <BrainSurface className="work-revision-card-face flex min-h-[190px] flex-1 flex-col justify-center border border-[var(--border-color)] p-5 sm:min-h-[240px] sm:p-8" shadow="top">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{isMcq ? "Choose an answer" : "Question"}</p>
          <h3 className="mt-4 whitespace-pre-wrap text-balance text-center text-[clamp(1.15rem,3.1vw,1.9rem)] font-extrabold leading-snug tracking-[-0.025em] text-[var(--text-primary)]">{card.front}</h3>
          {card.hint && !revealed && !submitted ? <p className="mt-4 text-center text-sm text-[var(--text-tertiary)]">Hint: {card.hint}</p> : null}
          {isMcq ? (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {(card.options ?? []).map((option, optionIndex) => {
                const correct = submitted && optionIndex === card.correctIndex;
                const wrong = submitted && optionIndex === selectedOption && !correct;
                return (
                  <button
                    key={`${card.id}-${optionIndex}`}
                    type="button"
                    disabled={submitted || busy}
                    aria-pressed={selectedOption === optionIndex}
                    onClick={() => onSelectOption(optionIndex)}
                    className={cx(
                      "min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)] disabled:cursor-default",
                      correct ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : wrong ? "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        : selectedOption === optionIndex ? "border-[var(--accent-color)] bg-[var(--accent-bg)] text-[var(--text-primary)]"
                          : "border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)]",
                    )}
                  >
                    <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full border border-current/20 text-[10px]">{String.fromCharCode(65 + optionIndex)}</span>{option}
                  </button>
                );
              })}
            </div>
          ) : null}
          {submitted ? (
            <div className={cx("mt-4 rounded-xl border p-3 text-sm", isCorrect ? "border-emerald-500/25 bg-emerald-500/10" : "border-rose-500/25 bg-rose-500/10")} role="status">
              <p className="font-bold">{isCorrect ? "Correct" : "Review this one"} · {card.options?.[card.correctIndex ?? 0] ?? card.back}</p>
              {card.explanation || card.back ? <p className="mt-1 text-[var(--text-secondary)]">{card.explanation || card.back}</p> : null}
            </div>
          ) : null}
          {!isMcq && revealed ? (
            <div className="mt-5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-bg)] p-4 text-center">
              <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-[var(--text-primary)]">{card.back}</p>
              {card.explanation && card.explanation !== card.back ? <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{card.explanation}</p> : null}
            </div>
          ) : null}
        </BrainSurface>
        <div className="mt-3 flex shrink-0 flex-col gap-2">
          {isMcq && !submitted ? (
            <div className="flex gap-2">
              <BrainPill tone="outline" className="min-h-11 flex-1" onClick={onSkip} disabled={busy}>Skip</BrainPill>
              <BrainPill className="min-h-11 flex-[2]" onClick={onSubmit} disabled={busy || selectedOption === null}>
                <span className="inline-flex items-center justify-center gap-2"><Check size={15} />Submit answer</span>
              </BrainPill>
            </div>
          ) : !isMcq && !revealed ? (
            <div className="flex gap-2">
              <BrainPill tone="outline" className="min-h-11" onClick={onSkip} disabled={busy}>Skip</BrainPill>
              <BrainPill className="min-h-11 flex-1" onClick={onReveal} disabled={busy}>Show answer</BrainPill>
            </div>
          ) : (
            <>
              <p className="text-center text-[11px] font-semibold text-[var(--text-tertiary)]">How well did you recall it? FSRS schedules the next review.</p>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                {ratings.map((rating) => (
                  <button
                    key={rating.key}
                    type="button"
                    disabled={busy}
                    onClick={() => onRate(rating.key)}
                    className={`work-revision-rating work-revision-rating-${rating.tone} min-h-11 rounded-xl border px-1.5 py-2 text-xs font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)] disabled:opacity-50 sm:px-3`}
                    title={`${rating.label} · ${Math.max(0, Math.round((Date.now() - startedAt) / 1000))} seconds`}
                  >{rating.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkRevisionApp({ notes, onExit }: WorkRevisionAppProps) {
  const [snapshot, setSnapshot] = useState<UnifiedSnapshot | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [panelOpen, setPanelOpen] = useState(false);
  const [brainAnswering, setBrainAnswering] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [studySession, setStudySession] = useState<UnifiedStudySession | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [cardStartedAt, setCardStartedAt] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingDeck, setDeletingDeck] = useState<UnifiedDeck | null>(null);
  const [deckName, setDeckName] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [flashcards, setFlashcards] = useState<DraftFlashcard[]>([freshFlashcard()]);
  const [brainQuestions, setBrainQuestions] = useState<DraftBrainQuestion[]>([freshBrainQuestion()]);
  const [importName, setImportName] = useState("");
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<WorkRevisionImportResult | null>(null);
  const [importSourceName, setImportSourceName] = useState("pasted.csv");
  const [pendingBackup, setPendingBackup] = useState<{ fileName: string; backup: WorkRevisionBackupEnvelope } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const backupFileRef = useRef<HTMLInputElement | null>(null);
  const [aiConfig, setAiConfig] = useState<UserAiConfig>(() => loadUserAiConfig(WORK_DEVICE_UID));
  const [aiTopic, setAiTopic] = useState("");
  const [aiSetName, setAiSetName] = useState("");
  const [aiCount, setAiCount] = useState(8);
  const [aiDifficulty, setAiDifficulty] = useState<GenerateInput["difficulty"]>("medium");
  const [aiOutput, setAiOutput] = useState<"brain" | "flashcards">("brain");
  const [aiUseNotes, setAiUseNotes] = useState(true);

  const refresh = useCallback(async () => {
    const next = await loadWorkRevisionSnapshot();
    setSnapshot(next);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await loadWorkRevisionSnapshot();
        if (alive) setSnapshot(next);
      } catch {
        if (alive) setError("Work Revision could not open its on-device library.");
      }
    };
    void load();
    const eventName = workRevisionChangeEventName();
    const onChange = () => void load();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "dc.work.revision.snapshot.v1") void load();
    };
    window.addEventListener(eventName, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.removeEventListener(eventName, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const decks = snapshot?.decks ?? [];
  const cards = snapshot?.cards.filter((card) => !card.deletedAt) ?? [];
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const selectedDeckCards = cards.filter((card) => card.deckId === selectedDeckId).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const mcqCount = selectedDeckCards.filter((card) => card.cardType === "mcq" && (card.options?.length ?? 0) >= 2).length;
  const overallWorkload = snapshot ? getWorkload(cards) : null;
  const volume = snapshot ? getReviewVolume(snapshot.reviewLogs) : null;
  const streak = snapshot ? getStreakInfo(snapshot.reviewLogs) : null;
  const activeCard = useMemo(() => {
    if (!snapshot || !studySession) return null;
    const cardId = studySession.cardIds[studySession.currentIndex];
    return snapshot.cards.find((card) => card.id === cardId && !card.deletedAt) ?? null;
  }, [snapshot, studySession]);

  // Headless in Work: the whole Revision page sits outside the outer Work
  // header — WorkPageSurface treats the Revision page itself as immersive,
  // exactly like the Sketch page, so this surface carries its own chrome
  // everywhere (toplines on page views, viewer headers on the card decks).
  // `brainAnswering` still governs the Brain answer viewer's internal
  // chrome: while a set is being answered, the viewer's own practice header
  // is the only band on screen.

  const enterCreateFlow = (next: View) => {
    setDeckName("");
    setDeckDescription("");
    setFlashcards([freshFlashcard()]);
    setBrainQuestions([freshBrainQuestion()]);
    setError(null);
    setNotice(null);
    setView(next);
  };

  const saveDeck = async (source: WorkRevisionCardInput["source"], inputCards: WorkRevisionCardInput[]) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createWorkRevisionDeck({
        name: deckName,
        description: deckDescription,
        cards: inputCards,
        source,
      });
      setSelectedDeckId(created.id);
      await refresh();
      setNotice(`“${created.name}” is saved on this device.`);
      setView("dashboard");
      setDeckName("");
      setDeckDescription("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this set.");
    } finally {
      setBusy(false);
    }
  };

  const saveFlashcards = async () => {
    const inputCards = flashcards.map((card) => ({
      front: card.front,
      back: card.back,
      hint: card.hint,
      tags: card.tags.split(/[;,]/).map((tag) => tag.trim()).filter(Boolean),
      cardType: "basic" as const,
      source: "user" as const,
    }));
    await saveDeck("user", inputCards);
  };

  const saveBrainQuestions = async () => {
    const inputCards = brainQuestions.map((question) => ({
      front: question.prompt,
      back: question.options[question.correctIndex] ?? "",
      options: question.options,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      tags: question.topic ? [question.topic] : [],
      cardType: "mcq" as const,
      source: "user" as const,
    }));
    await saveDeck("user", inputCards);
  };

  const parseImportText = (text = importText, name = importSourceName) => {
    try {
      const parsed = parseWorkRevisionImport(text, name);
      if (parsed.cards.length === 0) {
        setError("No usable cards were found. Check that every row has a question and answer.");
        setImportResult(null);
        return;
      }
      setImportResult(parsed);
      setDeckName((previous) => previous || importName || name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
      setError(null);
      setNotice(`${parsed.cards.length} cards ready to import${parsed.skipped ? ` · ${parsed.skipped} skipped` : ""}.`);
    } catch (caught) {
      setImportResult(null);
      setError(caught instanceof Error ? caught.message : "This file could not be parsed.");
    }
  };

  const onChooseImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".apkg")) {
      setError("Browser import accepts CSV, Markdown, JSON, and Anki text/TSV exports. Export an .apkg deck as Notes in Plain Text first.");
      event.target.value = "";
      return;
    }
    const text = await file.text();
    setImportText(text);
    setImportSourceName(file.name);
    setImportName(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    setDeckName(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    parseImportText(text, file.name);
  };

  const saveImport = async () => {
    if (!importResult) return;
    const cleaned: WorkRevisionCardInput[] = importResult.cards.map((card) => ({ ...card, source: "bulk-import" }));
    await saveDeck("bulk-import", cleaned);
    setImportResult(null);
    setImportText("");
  };

  const exportBackup = async () => {
    setError(null);
    try {
      const current = await loadWorkRevisionSnapshot();
      const contents = createWorkRevisionBackup(current);
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `digitalcatalyst-work-revision-${date}.json`;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Work Revision backup exported · ${current.decks.length} sets and ${current.cards.length} cards. The file was generated on this device.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export the Work Revision backup.");
    }
  };

  const onChooseBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > WORK_REVISION_BACKUP_MAX_BYTES) {
      setError("This backup is larger than the 50 MB import limit.");
      return;
    }
    try {
      const backup = parseWorkRevisionBackup(await file.text());
      setPendingBackup({ fileName: file.name, backup });
      setError(null);
      setNotice(null);
    } catch (caught) {
      setPendingBackup(null);
      setError(caught instanceof Error ? caught.message : "This file could not be read as a Work Revision backup.");
    }
  };

  const restoreBackup = async () => {
    if (!pendingBackup || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveWorkRevisionSnapshot(pendingBackup.backup.snapshot);
      setSnapshot(pendingBackup.backup.snapshot);
      setSelectedDeckId(null);
      setStudySession(null);
      setShowAnswer(false);
      setSubmitted(false);
      setSelectedOption(null);
      setPendingBackup(null);
      setView("dashboard");
      setNotice(`Restored ${pendingBackup.backup.snapshot.decks.length} sets from “${pendingBackup.fileName}” on this device.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The backup could not be restored.");
    } finally {
      setBusy(false);
    }
  };

  const generateWithAi = async () => {
    if (busy) return;
    const cfg = aiConfig.config;
    if (!cfg.apiKey.trim() || !cfg.model.trim()) {
      setError("Add your AI provider key and model first. These settings are saved only on this device.");
      return;
    }
    if (!aiTopic.trim()) {
      setError("Enter a topic or concept for the AI to use.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice("Generating directly with your selected AI provider…");
    try {
      const notesText = aiUseNotes
        ? notes.map((note) => String(note.text ?? "").trim()).filter(Boolean).join("\n\n").slice(0, 6000)
        : "";
      const topicWithNotes = notesText
        ? `${aiTopic.trim()}\n\nUse the following private Work notes as the source material. Prefer their facts and wording; do not invent details that conflict with them:\n${notesText}`
        : aiTopic.trim();
      const input: GenerateInput = {
        subject: "Personal revision",
        topic: topicWithNotes,
        topicNames: [topicWithNotes],
        difficulty: aiDifficulty,
        count: Math.max(1, Math.min(20, Math.round(aiCount))),
        minutes: 10,
        questionMode: "mixed",
      };
      const generated = await generateQuestionsWithAi({ ...cfg }, input);
      const questionCards: WorkRevisionCardInput[] = generated.map((question) => {
        const options = question.options.slice(0, 6);
        const correctIndex = Math.max(0, Math.min(options.length - 1, question.correctIndex));
        const answer = options[correctIndex] ?? "";
        return aiOutput === "brain"
          ? {
              front: question.prompt,
              back: answer,
              options,
              correctIndex,
              explanation: question.explanation,
              tags: [aiTopic.trim()],
              cardType: "mcq",
              source: "ai",
              difficulty: aiDifficulty,
            }
          : {
              front: question.prompt,
              back: [answer, question.explanation].filter(Boolean).join("\n\n"),
              explanation: question.explanation,
              tags: [aiTopic.trim()],
              cardType: "basic",
              source: "ai",
              difficulty: aiDifficulty,
            };
      });
      const title = aiSetName.trim() || `${aiTopic.trim()} · AI revision`;
      const created = await createWorkRevisionDeck({ name: title, description: "Generated on-device from your topic and optional Work notes.", cards: questionCards, source: "ai" });
      setSelectedDeckId(created.id);
      await refresh();
      setNotice(`${questionCards.length} AI cards saved locally as “${created.name}”.`);
      setView("dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI generation failed. Check the key and try again.");
    } finally {
      setBusy(false);
    }
  };

  const updateAiProvider = (provider: AIProviderId) => {
    const meta = getProvider(provider);
    setAiConfig((current) => ({
      ...current,
      source: "own",
      config: {
        ...current.config,
        provider,
        baseUrl: meta.baseUrl,
        model: DEFAULT_MODELS[provider],
      },
    }));
  };

  const persistAiConfig = () => {
    const next = { ...aiConfig, source: "own" as const, config: { ...aiConfig.config, apiKey: aiConfig.config.apiKey.trim(), model: aiConfig.config.model.trim() } };
    setAiConfig(next);
    saveUserAiConfig(WORK_DEVICE_UID, next);
    setNotice("AI settings saved on this device only.");
  };

  const startFsrsStudy = async (deck: UnifiedDeck, includeFuture = false) => {
    if (!snapshot) return;
    const queue = buildStudyQueue(snapshot, {
      deckId: deck.id,
      kind: "custom",
      limit: 500,
      newCardsAllowedToday: 500,
      prioritiseWeakTopics: false,
      interleave: false,
      ...(includeFuture ? { includeFuture: true } : {}),
    });
    const ids = queue.map((entry) => entry.cardId);
    if (ids.length === 0) {
      setError("There are no cards in this set to study.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await createWorkRevisionSession(deck.id, ids);
      setStudySession(session);
      setCardStartedAt(Date.now());
      setShowAnswer(false);
      setSelectedOption(null);
      setSubmitted(false);
      await refresh();
      setView("study-fsrs");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start this study session.");
    } finally {
      setBusy(false);
    }
  };

  const rateCurrentCard = async (rating: UnifiedRating) => {
    if (!studySession || !activeCard || busy) return;
    setBusy(true);
    try {
      await recordWorkRevisionRating(studySession.id, activeCard.id, rating, Date.now() - cardStartedAt);
      const latest = await loadWorkRevisionSnapshot();
      setSnapshot(latest);
      const updatedSession = latest.sessions.find((row) => row.id === studySession.id) ?? studySession;
      setStudySession(updatedSession);
      if (updatedSession.completed) {
        setView("study-result");
      } else {
        setShowAnswer(false);
        setSelectedOption(null);
        setSubmitted(false);
        setCardStartedAt(Date.now());
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this review.");
    } finally {
      setBusy(false);
    }
  };

  const skipCurrentCard = async () => {
    if (!studySession || !activeCard || busy) return;
    setBusy(true);
    try {
      await skipWorkRevisionCard(studySession.id, activeCard.id);
      const latest = await loadWorkRevisionSnapshot();
      setSnapshot(latest);
      const updatedSession = latest.sessions.find((row) => row.id === studySession.id) ?? studySession;
      setStudySession(updatedSession);
      if (updatedSession.completed) setView("study-result");
      setShowAnswer(false);
      setSelectedOption(null);
      setSubmitted(false);
      setCardStartedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not skip this card.");
    } finally {
      setBusy(false);
    }
  };

  const goToStudyStyle = (deck: UnifiedDeck) => {
    setSelectedDeckId(deck.id);
    setError(null);
    setView("study-style");
  };

  const saveRename = async (id: string, name?: string) => {
    const clean = name?.trim() ?? "";
    if (clean) {
      try {
        await renameWorkRevisionDeck(id, clean);
        await refresh();
        setNotice("Set name updated on this device.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not rename the set.");
      }
    }
    setRenamingId(null);
  };

  const handleRenameAction = (id: string, name?: string) => {
    if (renamingId !== id) {
      setRenamingId(id);
      return;
    }
    if (name?.trim()) void saveRename(id, name);
    else setRenamingId(null);
  };

  const confirmDelete = async () => {
    if (!deletingDeck) return;
    try {
      await deleteWorkRevisionDeck(deletingDeck.id);
      if (selectedDeckId === deletingDeck.id) setSelectedDeckId(null);
      await refresh();
      setDeletingDeck(null);
      setNotice(`“${deletingDeck.name}” was deleted from this device.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this set.");
    }
  };

  const cardsForDeck = (deckId: string) => cards.filter((card) => card.deckId === deckId);
  const deckDue = (deckId: string) => getWorkload(cardsForDeck(deckId)).dueToday;

  /* ── Test panel (the side-panel switcher) ───────────────────────────────
     One overlay for every Revision view: it lists the tests already on this
     device and opens one straight away, so tests can be switched mid-study.
     It renders as a sibling inside each view's root, so the screen under it
     (a half-answered card included) is never unmounted or reset. */
  const openTestPanel = () => setPanelOpen(true);
  const testRows = decks
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((deck) => ({
      id: deck.id,
      name: deck.name,
      cards: cardsForDeck(deck.id).length,
      due: deckDue(deck.id),
      active: deck.id === selectedDeckId,
    }));
  const openTestFromPanel = (id: string) => {
    const deck = decks.find((row) => row.id === id);
    setPanelOpen(false);
    if (deck) goToStudyStyle(deck);
  };
  const panelNode = (
    <WorkRevisionTestPanel
      open={panelOpen}
      tests={testRows}
      onClose={() => setPanelOpen(false)}
      onGoDashboard={() => { setPanelOpen(false); setView("dashboard"); }}
      onGoLibrary={() => { setPanelOpen(false); setView("library"); }}
      onOpenTest={openTestFromPanel}
      onExit={onExit}
    />
  );

  if (!snapshot) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-sm font-semibold text-[var(--text-secondary)]" data-work-revision="" data-work-revision-loading="">
        <LoaderCircle className="mr-2 animate-spin" size={18} /> Opening your on-device revision library…
      </div>
    );
  }

  if (view === "study-brain" && selectedDeck) {
    const studyCards = cards.filter((card) => card.deckId === selectedDeck.id);
    const brainSets = asBrainSets(selectedDeck, studyCards);
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-storage="device-only" data-work-revision-mode="brain" data-work-revision-headless={brainAnswering ? "true" : undefined}>
        {panelNode}
        {/* While the Brain answer deck is up, the viewer's own practice
            header is the only chrome (headless). The topline returns with
            the Brain library/review/result screens so the way back to the
            study styles is always visible outside the answer viewer. */}
        {brainAnswering ? null : (
          <WorkRevisionTopline onOpenPanel={openTestPanel} title={selectedDeck.name} subtitle="Slidable Brain-style review · local practice history" onBack={() => setView("study-style")} />
        )}
        {brainSets.length ? (
          <div className="work-revision-brain min-h-0 flex-1 overflow-hidden" data-work-revision-brain-root>
            <CourseBrainPanel
              key={selectedDeck.id}
              productId={`work-revision-${selectedDeck.id}`}
              sets={brainSets}
              selfSets={[]}
              activeModuleId="work-revision-root"
              openSetId={selectedDeck.id}
              uid={WORK_DEVICE_UID}
              workMode
              onAnsweringChange={setBrainAnswering}
              headerLeadingAction={<WorkRevisionPanelButton onClick={openTestPanel} />}
            />
          </div>
        ) : (
          <WorkRevisionEmptyState title="No Brain questions yet" body="Add multiple-choice cards to this set to use the slidable Brain review." />
        )}
      </div>
    );
  }

  if (view === "study-fsrs" && studySession && activeCard) {
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-storage="device-only" data-work-revision-mode="fsrs" data-work-revision-headless="true">
        {panelNode}
        {/* Headless card viewer: no subheader band. The card surface itself
            carries the back control (see WorkFlashcardReview). */}
        {error ? <p role="alert" className="mx-3 mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p> : null}
        <WorkFlashcardReview
          card={activeCard}
          index={studySession.currentIndex}
          total={studySession.cardIds.length}
          startedAt={cardStartedAt}
          busy={busy}
          revealed={showAnswer}
          onReveal={() => setShowAnswer(true)}
          selectedOption={selectedOption}
          submitted={submitted}
          onSelectOption={setSelectedOption}
          onSubmit={() => setSubmitted(true)}
          onRate={(rating) => void rateCurrentCard(rating)}
          onSkip={() => void skipCurrentCard()}
          onBack={() => setView("study-style")}
          onOpenPanel={openTestPanel}
        />
      </div>
    );
  }

  if (view === "study-fsrs" && studySession && !activeCard) {
    return (
      <WorkRevisionEmptyState
        title="Study session complete"
        body="Your answers and FSRS schedule are saved in this device’s Work Revision library."
        action={<WorkActionButton onClick={() => setView("study-result")} icon={<Check size={15} />}>See session summary</WorkActionButton>}
      />
    );
  }

  if (view === "study-result" && studySession) {
    const rated = Object.values(studySession.ratings).reduce((sum, count) => sum + count, 0);
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-mode="result">
        {panelNode}
        <WorkRevisionTopline onOpenPanel={openTestPanel} title="Review complete" subtitle="FSRS review history saved on this device" onBack={() => setView("study-style")} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-[620px] rounded-[24px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-5 shadow-[var(--work-shadow-card)] sm:p-7">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600"><Check size={23} /></div>
            <h3 className="mt-3 text-center text-xl font-extrabold text-[var(--text-primary)]">Nice work.</h3>
            <p className="mt-1 text-center text-sm text-[var(--text-secondary)]">{rated} rated · {studySession.cardIds.length - rated} skipped</p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ratings.map((rating) => <div key={rating.key} className="rounded-xl border border-[var(--border-color)] bg-[var(--workspace-bg)] p-3 text-center"><p className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">{rating.label}</p><p className="mt-1 text-xl font-black text-[var(--text-primary)]">{studySession.ratings[rating.key]}</p></div>)}
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <WorkActionButton variant="secondary" onClick={() => setView("study-style")} icon={<ArrowLeft size={14} />}>Back to study styles</WorkActionButton>
              {selectedDeck ? <WorkActionButton onClick={() => void startFsrsStudy(selectedDeck)} icon={<RotateCcw size={14} />}>Review due again</WorkActionButton> : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "study-style" && selectedDeck) {
    const studyCards = cards.filter((card) => card.deckId === selectedDeck.id);
    const brainAvailable = studyCards.some((card) => card.cardType === "mcq" && (card.options?.length ?? 0) >= 2);
    const dueCount = getWorkload(studyCards).dueToday;
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-storage="device-only" data-work-revision-style-choice="">
        {panelNode}
        <WorkRevisionTopline onOpenPanel={openTestPanel} title="Choose a study style" subtitle={selectedDeck.name} onBack={() => setView("library")} />
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
          <div className="mx-auto grid w-full max-w-[900px] gap-3 md:grid-cols-2">
            <button type="button" onClick={() => setView("study-brain")} disabled={!brainAvailable} className={cx("group rounded-[22px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-4 text-left shadow-[var(--work-shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-50 sm:p-5")} data-work-revision-style="brain">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[var(--accent-bg)] text-[var(--accent-color)]"><Brain size={21} /></span>
              <span className="mt-3 block text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">Brain style · Slidable</span>
              <span className="mt-2 block"><WorkRevisionStylePreview variant="brain" card={studyCards.find((card) => card.cardType === "mcq")} /></span>
              <span className="mt-3 block text-sm leading-relaxed text-[var(--text-secondary)]">Swipe multiple-choice cards, skip by flicking, then submit and review every answer.</span>
              <span className="mt-2 block text-[11px] font-bold text-[var(--text-tertiary)]">{brainAvailable ? `${mcqCount} Brain question${mcqCount === 1 ? "" : "s"}` : "Add multiple-choice cards to enable this style"}</span>
            </button>
            <button type="button" onClick={() => void startFsrsStudy(selectedDeck, dueCount === 0)} disabled={studyCards.length === 0 || busy} className="group rounded-[22px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-4 text-left shadow-[var(--work-shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-50 sm:p-5" data-work-revision-style="convertible">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-emerald-500/10 text-emerald-600"><RotateCcw size={21} /></span>
              <span className="mt-3 block text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">Deck style · Convertible FSRS</span>
              <span className="mt-2 block"><WorkRevisionStylePreview variant="convertible" card={studyCards[0]} /></span>
              <span className="mt-3 block text-sm leading-relaxed text-[var(--text-secondary)]">Submit your answer, review the explanation, then rate recall. FSRS schedules the next review.</span>
              <span className="mt-2 block text-[11px] font-bold text-[var(--text-tertiary)]">{dueCount ? `${dueCount} card${dueCount === 1 ? "" : "s"} due now` : `${studyCards.length} card${studyCards.length === 1 ? "" : "s"} · study all now`}</span>
            </button>
          </div>
          {error ? <p className="mx-auto mt-3 max-w-[900px] rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600" role="alert">{error}</p> : null}
          <p className="mx-auto mt-4 max-w-[900px] text-center text-[11px] text-[var(--text-tertiary)]">Both styles use only this device’s Work Revision namespace. Brain practice scores are local; Convertible reviews use the shared FSRS scheduler locally.</p>
        </div>
      </div>
    );
  }

  if (view === "create-choice") {
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-storage="device-only" data-work-revision-create-choice="">
        {panelNode}
        <WorkRevisionTopline onOpenPanel={openTestPanel} title="Create your revision cards" subtitle="Click your favourite deck styling to create your own revision cards" onBack={() => setView("dashboard")} />
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto grid max-w-[900px] gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => enterCreateFlow("create-flashcards")} className="rounded-[22px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-4 text-left shadow-[var(--work-shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--accent-color)] sm:p-5" data-work-revision-create="flashcards">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[var(--accent-bg)] text-[var(--accent-color)]"><Layers3 size={20} /></span>
              <span className="mt-3 block text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">Deck style</span>
              <span className="mt-3 block"><WorkRevisionStylePreview variant="convertible" /></span>
              <span className="mt-3 block text-sm text-[var(--text-secondary)]">Create question-and-answer cards with hints, tags and FSRS scheduling.</span>
            </button>
            <button type="button" onClick={() => enterCreateFlow("create-brain")} className="rounded-[22px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-4 text-left shadow-[var(--work-shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--accent-color)] sm:p-5" data-work-revision-create="brain">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-violet-500/10 text-violet-600"><Brain size={20} /></span>
              <span className="mt-3 block text-xs font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">Brain style</span>
              <span className="mt-3 block"><WorkRevisionStylePreview variant="brain" /></span>
              <span className="mt-3 block text-sm text-[var(--text-secondary)]">Create multiple-choice cards with answers and explanations for slidable review.</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "create-flashcards") {
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-storage="device-only" data-work-revision-create="flashcards">
        {panelNode}
        <WorkRevisionTopline onOpenPanel={openTestPanel} title="Build a flashcard deck" subtitle="Questions and answers save to this device" onBack={() => setView("create-choice")} right={<span className="hidden text-[10px] font-bold text-[var(--text-tertiary)] sm:inline">Local only</span>} />
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto max-w-[840px] space-y-3">
            <div className="rounded-[18px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <WorkField label="Set name"><input className={fieldClass} value={deckName} onChange={(event) => setDeckName(event.target.value)} maxLength={100} placeholder="e.g. Biology · Cell structure" /></WorkField>
                <WorkField label="Short description"><input className={fieldClass} value={deckDescription} onChange={(event) => setDeckDescription(event.target.value)} maxLength={500} placeholder="Optional" /></WorkField>
              </div>
            </div>
            {flashcards.map((card, index) => (
              <div key={index} className="rounded-[18px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 shadow-[var(--work-shadow-card)] sm:p-4" data-work-revision-card-editor={index}>
                <div className="mb-3 flex items-center justify-between"><p className="text-xs font-extrabold uppercase tracking-wide text-[var(--text-tertiary)]">Card {index + 1}</p>{flashcards.length > 1 ? <button type="button" onClick={() => setFlashcards((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Remove card ${index + 1}`} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-rose-500/10 hover:text-rose-500"><X size={15} /></button> : null}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <WorkField label="Front · question"><textarea className={`${fieldClass} min-h-[80px] resize-y`} value={card.front} onChange={(event) => setFlashcards((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, front: event.target.value } : row))} placeholder="What do you want to remember?" /></WorkField>
                  <WorkField label="Back · answer"><textarea className={`${fieldClass} min-h-[80px] resize-y`} value={card.back} onChange={(event) => setFlashcards((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, back: event.target.value } : row))} placeholder="Write the answer" /></WorkField>
                  <WorkField label="Hint (optional)"><input className={fieldClass} value={card.hint} onChange={(event) => setFlashcards((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, hint: event.target.value } : row))} placeholder="A memory cue" /></WorkField>
                  <WorkField label="Tags (optional)"><input className={fieldClass} value={card.tags} onChange={(event) => setFlashcards((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, tags: event.target.value } : row))} placeholder="chapter, formula" /></WorkField>
                </div>
              </div>
            ))}
            {error ? <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p> : null}
            <div className="flex flex-wrap justify-between gap-2 pb-3">
              <WorkActionButton variant="secondary" onClick={() => setFlashcards((rows) => [...rows, freshFlashcard()])} icon={<Plus size={15} />}>Add another card</WorkActionButton>
              <WorkActionButton onClick={() => void saveFlashcards()} disabled={busy} icon={busy ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}>Save to this device</WorkActionButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "create-brain") {
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-storage="device-only" data-work-revision-create="brain">
        {panelNode}
        <WorkRevisionTopline onOpenPanel={openTestPanel} title="Build a Brain practice set" subtitle="Multiple-choice cards · saved locally" onBack={() => setView("create-choice")} />
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto max-w-[840px] space-y-3">
            <div className="grid gap-3 rounded-[18px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 sm:grid-cols-2 sm:p-4">
              <WorkField label="Set name"><input className={fieldClass} value={deckName} onChange={(event) => setDeckName(event.target.value)} maxLength={100} placeholder="e.g. Cell biology practice" /></WorkField>
              <WorkField label="Short description"><input className={fieldClass} value={deckDescription} onChange={(event) => setDeckDescription(event.target.value)} maxLength={500} placeholder="Optional" /></WorkField>
            </div>
            {brainQuestions.map((question, index) => (
              <div key={index} className="rounded-[18px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 shadow-[var(--work-shadow-card)] sm:p-4" data-work-revision-brain-editor={index}>
                <div className="mb-3 flex items-center justify-between"><p className="text-xs font-extrabold uppercase tracking-wide text-[var(--text-tertiary)]">Question {index + 1}</p>{brainQuestions.length > 1 ? <button type="button" onClick={() => setBrainQuestions((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Remove question ${index + 1}`} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-rose-500/10 hover:text-rose-500"><X size={15} /></button> : null}</div>
                <WorkField label="Question"><textarea className={`${fieldClass} min-h-[72px] resize-y`} value={question.prompt} onChange={(event) => setBrainQuestions((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, prompt: event.target.value } : row))} placeholder="Write the question" /></WorkField>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => (
                    <label key={optionIndex} className={cx("flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2", question.correctIndex === optionIndex ? "border-emerald-500/40 bg-emerald-500/10" : "border-[var(--border-color)] bg-[var(--input-bg)]")}>
                      <input type="radio" name={`brain-answer-${index}`} checked={question.correctIndex === optionIndex} onChange={() => setBrainQuestions((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, correctIndex: optionIndex } : row))} aria-label={`Mark option ${optionIndex + 1} correct for question ${index + 1}`} />
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-tertiary)]">{String.fromCharCode(65 + optionIndex)}</span>
                      <input className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]" value={option} onChange={(event) => setBrainQuestions((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, options: row.options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item) } : row))} placeholder={`Option ${optionIndex + 1}`} aria-label={`Option ${optionIndex + 1} for question ${index + 1}`} />
                    </label>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <WorkField label="Why this answer? · explanation"><textarea className={`${fieldClass} min-h-[64px] resize-y`} value={question.explanation} onChange={(event) => setBrainQuestions((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, explanation: event.target.value } : row))} placeholder="A short explanation" /></WorkField>
                  <WorkField label="Topic tag (optional)"><input className={fieldClass} value={question.topic} onChange={(event) => setBrainQuestions((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, topic: event.target.value } : row))} placeholder="e.g. Cell structure" /></WorkField>
                </div>
              </div>
            ))}
            {error ? <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p> : null}
            <div className="flex flex-wrap justify-between gap-2 pb-3">
              <WorkActionButton variant="secondary" onClick={() => setBrainQuestions((rows) => [...rows, freshBrainQuestion()])} icon={<Plus size={15} />}>Add another question</WorkActionButton>
              <WorkActionButton onClick={() => void saveBrainQuestions()} disabled={busy} icon={busy ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}>Save to this device</WorkActionButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "import") {
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-storage="device-only" data-work-revision-import="">
        {panelNode}
        <WorkRevisionTopline onOpenPanel={openTestPanel} title="Import a revision set" subtitle="CSV · Markdown · JSON · Anki text/TSV · stays on this device" onBack={() => setView("dashboard")} />
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto max-w-[760px] space-y-3">
            <div className="rounded-[20px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-4 shadow-[var(--work-shadow-card)]">
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.md,.markdown,.json,.apkg" className="hidden" onChange={(event) => void onChooseImportFile(event)} />
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--accent-bg)] text-[var(--accent-color)]"><FileUp size={20} /></span>
                <div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-[var(--text-primary)]">Choose a file or paste its contents</p><p className="mt-1 text-xs leading-relaxed text-[var(--text-tertiary)]">CSV/TSV rows use question + answer columns. Brain CSV can include options, correct answer/index and explanation. Markdown accepts Q/A pairs or ## headings.</p></div>
                <WorkActionButton variant="secondary" onClick={() => fileRef.current?.click()} icon={<FileDown size={15} />}>Choose file</WorkActionButton>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <WorkField label="Set name"><input className={fieldClass} value={deckName || importName} onChange={(event) => { setDeckName(event.target.value); setImportName(event.target.value); }} placeholder="Imported revision set" /></WorkField>
                <WorkField label="Detected source"><div className="flex h-[42px] items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--workspace-bg)] px-3 text-xs font-semibold text-[var(--text-secondary)]"><FileUp size={14} />{importSourceName}</div></WorkField>
              </div>
              <WorkField label="Paste CSV, TSV, Markdown or JSON" hint="Anki .apkg files are not opened directly in the browser; export as Notes in Plain Text / TSV."><textarea className={`${fieldClass} mt-1 min-h-[150px] resize-y font-mono text-xs`} value={importText} onChange={(event) => { setImportText(event.target.value); setImportResult(null); }} placeholder={'Front,Back\nWhat is a cell?,The basic unit of life'} /></WorkField>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <WorkActionButton variant="secondary" onClick={() => parseImportText()} disabled={!importText.trim()} icon={<FileUp size={14} />}>Parse preview</WorkActionButton>
                {importResult ? <span className="text-xs font-semibold text-emerald-600">{importResult.cards.length} {importResult.kind === "brain" ? "Brain questions" : "flashcards"} ready{importResult.skipped ? ` · ${importResult.skipped} skipped` : ""}</span> : null}
              </div>
            </div>
            {importResult ? (
              <div className="rounded-[20px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-4">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Preview</h3>
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {importResult.cards.slice(0, 5).map((card, index) => <div key={index} className="rounded-xl border border-[var(--border-color)] bg-[var(--workspace-bg)] px-3 py-2"><p className="truncate text-xs font-bold text-[var(--text-primary)]">{card.front}</p><p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{card.cardType === "mcq" ? `${card.options?.length ?? 0} options · answer: ${card.options?.[card.correctIndex ?? 0]}` : card.back}</p></div>)}
                </div>
              </div>
            ) : null}
            {error ? <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p> : null}
            <div className="flex justify-end pb-3"><WorkActionButton onClick={() => void saveImport()} disabled={busy || !importResult} icon={busy ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}>Import to this device</WorkActionButton></div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "ai") {
    const provider = AI_PROVIDERS.find((item) => item.id === aiConfig.config.provider) ?? AI_PROVIDERS[0];
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-storage="device-only" data-work-revision-ai="">
        {panelNode}
        <WorkRevisionTopline onOpenPanel={openTestPanel} title="Make a set with AI" subtitle="Generation is direct to your chosen provider; the result is saved only here" onBack={() => setView("dashboard")} />
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto max-w-[780px] space-y-3">
            <div className="rounded-[20px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-4 shadow-[var(--work-shadow-card)] sm:p-5">
              <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-amber-500/10 text-amber-600"><WandSparkles size={19} /></span><div><h3 className="text-sm font-extrabold text-[var(--text-primary)]">AI provider · this device only</h3><p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">Your key is kept in this browser’s local storage. Work Revision never uploads the key, notes or generated set to Digitalcatalyst cloud storage. The topic/selected notes are sent directly to the provider for generation.</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <WorkField label="Provider"><select className={fieldClass} value={aiConfig.config.provider} onChange={(event) => updateAiProvider(event.target.value as AIProviderId)}>{AI_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></WorkField>
                <WorkField label="Model"><input className={fieldClass} value={aiConfig.config.model} onChange={(event) => setAiConfig((current) => ({ ...current, config: { ...current.config, model: event.target.value } }))} placeholder={DEFAULT_MODELS[aiConfig.config.provider]} /></WorkField>
                <WorkField label="API key" hint={provider.keyHint}><input type="password" autoComplete="off" className={fieldClass} value={aiConfig.config.apiKey} onChange={(event) => setAiConfig((current) => ({ ...current, config: { ...current.config, apiKey: event.target.value } }))} placeholder={provider.keyPlaceholder} /></WorkField>
                {aiConfig.config.provider === "custom" ? <WorkField label="Custom API base URL"><input className={fieldClass} value={aiConfig.config.baseUrl} onChange={(event) => setAiConfig((current) => ({ ...current, config: { ...current.config, baseUrl: event.target.value } }))} placeholder="https://your-endpoint.example/v1" /></WorkField> : null}
                <WorkField label="Topic / concept"><input className={fieldClass} value={aiTopic} onChange={(event) => setAiTopic(event.target.value)} placeholder="e.g. Photosynthesis" /></WorkField>
                <WorkField label="Set name"><input className={fieldClass} value={aiSetName} onChange={(event) => setAiSetName(event.target.value)} placeholder={aiTopic ? `${aiTopic} · AI revision` : "Optional"} /></WorkField>
                <WorkField label="Number of questions"><select className={fieldClass} value={aiCount} onChange={(event) => setAiCount(Number(event.target.value))}>{[5, 8, 10, 15, 20].map((count) => <option key={count} value={count}>{count}</option>)}</select></WorkField>
                <WorkField label="Difficulty"><select className={fieldClass} value={aiDifficulty} onChange={(event) => setAiDifficulty(event.target.value as GenerateInput["difficulty"])}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></WorkField>
              </div>
              {notes.length ? <label className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--workspace-bg)] p-3 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={aiUseNotes} onChange={(event) => setAiUseNotes(event.target.checked)} className="mt-0.5 accent-[var(--accent-color)]" /><span><strong className="text-[var(--text-primary)]">Use my Work notes as reference</strong><br />{notes.length} local note{notes.length === 1 ? "" : "s"} available. Up to 6,000 characters are included in this one generation request.</span></label> : <p className="mt-3 rounded-xl border border-[var(--border-color)] bg-[var(--workspace-bg)] p-3 text-xs text-[var(--text-tertiary)]">No Work notes yet. Add notes in the Work Notes page to use them as source material.</p>}
              <fieldset className="mt-4"><legend className="mb-2 text-xs font-bold text-[var(--text-secondary)]">Save the generated questions as</legend><div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={aiOutput === "brain"} onClick={() => setAiOutput("brain")} className={cx("rounded-xl border p-3 text-left text-xs font-bold", aiOutput === "brain" ? "border-[var(--accent-color)] bg-[var(--accent-bg)] text-[var(--accent-color)]" : "border-[var(--border-color)] text-[var(--text-secondary)]")}>Brain multiple-choice set</button><button type="button" aria-pressed={aiOutput === "flashcards"} onClick={() => setAiOutput("flashcards")} className={cx("rounded-xl border p-3 text-left text-xs font-bold", aiOutput === "flashcards" ? "border-[var(--accent-color)] bg-[var(--accent-bg)] text-[var(--accent-color)]" : "border-[var(--border-color)] text-[var(--text-secondary)]")}>Convertible flashcards</button></div></fieldset>
            </div>
            {error ? <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p> : null}
            {notice ? <p role="status" className="rounded-xl bg-[var(--accent-bg)] px-3 py-2 text-xs font-semibold text-[var(--accent-color)]">{notice}</p> : null}
            <div className="flex flex-wrap justify-between gap-2 pb-3"><WorkActionButton variant="secondary" onClick={persistAiConfig} icon={<Save size={14} />}>Save AI settings</WorkActionButton><WorkActionButton onClick={() => void generateWithAi()} disabled={busy} icon={busy ? <LoaderCircle className="animate-spin" size={15} /> : <Sparkles size={15} />}>{busy ? "Generating…" : "Generate & save locally"}</WorkActionButton></div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "library") {
    return (
      <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-library="" data-work-revision-storage="device-only">
        {panelNode}
        <WorkRevisionTopline onOpenPanel={openTestPanel} title="Revision library" subtitle={`${decks.length} set${decks.length === 1 ? "" : "s"} · saved on this device`} onBack={() => setView("dashboard")} right={<WorkActionButton className="min-h-9 px-3 py-1.5 text-xs" onClick={() => setView("create-choice")} icon={<Plus size={14} />}>Create</WorkActionButton>} />
        {decks.length ? (
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
            {decks.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((deck) => (
              <WorkRevisionDeckStrip key={deck.id} deck={deck} cards={cardsForDeck(deck.id)} due={deckDue(deck.id)} renaming={renamingId === deck.id} onStudy={() => goToStudyStyle(deck)} onRename={(name) => handleRenameAction(deck.id, name)} onDelete={() => setDeletingDeck(deck)} />
            ))}
          </div>
        ) : <div className="min-h-0 flex-1 overflow-y-auto"><WorkRevisionEmptyState title="Your library is ready" body="Create a flashcard deck or Brain practice set. Your sets stay in Work Revision on this device." action={<WorkActionButton onClick={() => setView("create-choice")} icon={<Plus size={15} />}>Create your first set</WorkActionButton>} /></div>}
        {error ? <p role="alert" className="mx-3 mb-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p> : null}
        {deletingDeck ? <WorkRevisionDeleteDialog deck={deletingDeck} onCancel={() => setDeletingDeck(null)} onConfirm={() => void confirmDelete()} /> : null}
      </div>
    );
  }

  const recentDecks = decks.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const dueCount = overallWorkload?.dueToday ?? 0;
  return (
    <div className="relative flex h-full min-h-0 flex-col" data-work-revision="" data-work-revision-dashboard="" data-work-revision-storage="device-only">
      {panelNode}
      <WorkRevisionTopline onOpenPanel={openTestPanel} title="Revision" subtitle="Private · this device" />
      {busy ? <div className="sr-only" aria-live="polite">Saving locally</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
        <div className="mx-auto max-w-[1100px] space-y-3">
          <section className="work-revision-hero relative overflow-hidden rounded-[24px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-4 shadow-[var(--work-shadow-card)] sm:p-5" data-work-revision-dashboard-hero>
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-emerald-400/10 blur-2xl" aria-hidden="true" />
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600"><Sparkles size={13} /> Work Revision</div>
                <h2 className="mt-1 text-[clamp(1.3rem,3.5vw,2rem)] font-black tracking-[-0.04em] text-[var(--text-primary)]">Your revision, kept here.</h2>
                <p className="mt-1 max-w-[520px] text-xs leading-relaxed text-[var(--text-secondary)]">Build sets, choose how to study, and keep every card and review on this device.</p>
              </div>
              <div className="flex flex-wrap gap-2" data-work-revision-backup-actions>
                <input
                  ref={backupFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => void onChooseBackupFile(event)}
                  aria-label="Choose a Work Revision backup to restore"
                />
                <WorkActionButton onClick={() => { setError(null); setView("create-choice"); }} icon={<Plus size={15} />}>Create set</WorkActionButton>
                <WorkActionButton variant="secondary" onClick={() => setView("library")} icon={<Layers3 size={15} />}>Open library</WorkActionButton>
                <WorkActionButton variant="secondary" onClick={() => void exportBackup()} icon={<FileDown size={15} />}>Export backup</WorkActionButton>
                <WorkActionButton variant="secondary" onClick={() => backupFileRef.current?.click()} icon={<FileUp size={15} />}>Restore backup</WorkActionButton>
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-[15px] border border-[var(--border-color)] bg-[var(--workspace-bg)] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Due today</p><p className="mt-1 text-2xl font-black tabular-nums text-[var(--text-primary)]">{dueCount}</p></div>
              <div className="rounded-[15px] border border-[var(--border-color)] bg-[var(--workspace-bg)] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Reviewed today</p><p className="mt-1 text-2xl font-black tabular-nums text-[var(--text-primary)]">{volume?.today ?? 0}</p></div>
              <div className="rounded-[15px] border border-[var(--border-color)] bg-[var(--workspace-bg)] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Streak</p><p className="mt-1 text-2xl font-black tabular-nums text-[var(--text-primary)]">{streak?.current ?? 0}<span className="ml-1 text-xs font-bold text-[var(--text-tertiary)]">days</span></p></div>
              <div className="rounded-[15px] border border-[var(--border-color)] bg-[var(--workspace-bg)] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Library</p><p className="mt-1 text-2xl font-black tabular-nums text-[var(--text-primary)]">{decks.length}<span className="ml-1 text-xs font-bold text-[var(--text-tertiary)]">sets</span></p></div>
            </div>
          </section>

          <section className="grid gap-2.5 sm:grid-cols-3" aria-label="Revision actions">
            <button type="button" onClick={() => { setError(null); setView("create-choice"); }} className="work-revision-action-card flex min-w-0 items-center gap-3 rounded-[18px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 text-left shadow-[var(--work-shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--accent-color)]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[var(--accent-bg)] text-[var(--accent-color)]"><Plus size={19} /></span><span className="min-w-0"><strong className="block text-sm font-extrabold text-[var(--text-primary)]">Make a revision set</strong><small className="mt-0.5 block text-[11px] text-[var(--text-tertiary)]">Flashcards or Brain practice</small></span><ChevronRight className="ml-auto shrink-0 text-[var(--text-tertiary)]" size={16} /></button>
            <button type="button" onClick={() => { setError(null); setView("ai"); setAiConfig(loadUserAiConfig(WORK_DEVICE_UID)); }} className="work-revision-action-card flex min-w-0 items-center gap-3 rounded-[18px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 text-left shadow-[var(--work-shadow-card)] transition hover:-translate-y-0.5 hover:border-amber-500"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-amber-500/10 text-amber-600"><WandSparkles size={18} /></span><span className="min-w-0"><strong className="block text-sm font-extrabold text-[var(--text-primary)]">Make with AI</strong><small className="mt-0.5 block text-[11px] text-[var(--text-tertiary)]">Generate and save locally</small></span><ChevronRight className="ml-auto shrink-0 text-[var(--text-tertiary)]" size={16} /></button>
            <button type="button" onClick={() => { setError(null); setImportResult(null); setImportText(""); setDeckName(""); setView("import"); }} className="work-revision-action-card flex min-w-0 items-center gap-3 rounded-[18px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 text-left shadow-[var(--work-shadow-card)] transition hover:-translate-y-0.5 hover:border-violet-500"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-violet-500/10 text-violet-600"><FileUp size={18} /></span><span className="min-w-0"><strong className="block text-sm font-extrabold text-[var(--text-primary)]">Direct import</strong><small className="mt-0.5 block text-[11px] text-[var(--text-tertiary)]">CSV, Markdown, JSON, Anki TSV</small></span><ChevronRight className="ml-auto shrink-0 text-[var(--text-tertiary)]" size={16} /></button>
          </section>

          <section className="rounded-[20px] border border-[var(--border-color)] bg-[var(--surface-bg)] p-3 shadow-[var(--work-shadow-card)] sm:p-4" data-work-revision-library-preview>
            <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="text-sm font-extrabold text-[var(--text-primary)]">Your library</h3><p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">Rectangular set strips · rename or delete any set</p></div><button type="button" onClick={() => setView("library")} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--accent-color)] hover:bg-[var(--accent-bg)]">View all</button></div>
            {recentDecks.length ? <div className="space-y-2">{recentDecks.map((deck) => <WorkRevisionDeckStrip key={deck.id} deck={deck} cards={cardsForDeck(deck.id)} due={deckDue(deck.id)} renaming={renamingId === deck.id} onStudy={() => goToStudyStyle(deck)} onRename={(name) => handleRenameAction(deck.id, name)} onDelete={() => setDeletingDeck(deck)} />)}</div> : <div className="rounded-[16px] border border-dashed border-[var(--border-color)] bg-[var(--workspace-bg)] px-3 py-5 text-center"><p className="text-sm font-bold text-[var(--text-primary)]">No revision sets yet</p><p className="mt-1 text-xs text-[var(--text-tertiary)]">Create, import, or generate one to start your local library.</p></div>}
          </section>
          {notice ? <p role="status" className="rounded-xl bg-[var(--accent-bg)] px-3 py-2 text-xs font-semibold text-[var(--accent-color)]">{notice}</p> : null}
          {error ? <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p> : null}
          <p className="pb-1 text-center text-[10px] font-medium text-[var(--text-tertiary)]" data-work-revision-device-status><CircleHelp className="mr-1 inline-block" size={11} />Work Revision data is stored only in this device’s Work namespace. It is not uploaded or cloud-synced.</p>
        </div>
        {deletingDeck ? <WorkRevisionDeleteDialog deck={deletingDeck} onCancel={() => setDeletingDeck(null)} onConfirm={() => void confirmDelete()} /> : null}
        {pendingBackup ? (
          <WorkRevisionRestoreDialog
            fileName={pendingBackup.fileName}
            backup={pendingBackup.backup}
            currentCounts={{ decks: decks.length, cards: cards.length, reviews: snapshot?.reviewLogs.length ?? 0 }}
            busy={busy}
            onCancel={() => setPendingBackup(null)}
            onConfirm={() => void restoreBackup()}
          />
        ) : null}
      </div>
    </div>
  );
}
