// Production boundary for the ZIP Lumen chat.
//
// The ZIP UI (thinking / streaming / error / retry / stop) stays exactly as
// designed. Only the mock tutor's generated *text* is replaced by a real
// authenticated Personal AI call that uses Revision AI Configuration.

import { askModuleAi, PersonalAiApiError, type AskModuleAiInput } from "../ai/personalAiClient";
import type { PersonalAiNoteInput } from "../types/personalAi";
import { detectMentorFormat, isMentorFormat } from "../../utils/mentorAnswer";
import type { Attachment, Chat, ResponseFormat } from "./lib/types";
import type { GenerationSpec } from "./lib/engine";
import { FORMAT_LABEL } from "./lib/engine";
import { toVisionImage } from "./lib/utils";

export interface LumenAiScope {
  uid: string;
  moduleId?: string | null;
  storageModuleId?: string | null;
  resourceId?: string | null;
  /**
   * Where the open lesson sits in the COURSE tree, for a file that is not a
   * personal module. These are the ids stored on the product document, so the
   * server can resolve the real module and read its files instead of being told
   * "no module" and refusing.
   */
  officialModuleId?: string | null;
  officialResourceId?: string | null;
  /** True when the open file comes from the course rather than My Modules. */
  official?: boolean;
  notes?: PersonalAiNoteInput[];
  courseTitle: string;
  courseShort: string;
  moduleTitle?: string | null;
  resourceName?: string | null;
  resourceType?: string | null;
  productId?: string | null;
  source?: "own" | "default";
}

export interface ProductionRun {
  spec: GenerationSpec;
  modelLabel: string;
}

const thinkingSteps = (scope: LumenAiScope, hasMedia: boolean): { label: string; detail?: string }[] => {
  const steps: { label: string; detail?: string }[] = [
    { label: "Reading your message" },
    { label: "Checking course context", detail: scope.courseShort || scope.courseTitle },
  ];
  if (scope.resourceName) steps.push({ label: "Reading the open resource", detail: scope.resourceName });
  if (hasMedia) steps.push({ label: "Noting attached image(s)" });
  steps.push({ label: "Asking your course AI" }, { label: "Composing response" });
  return steps;
};

/**
 * The layout this message is likely to get, for the "thinking" chip shown
 * BEFORE the answer arrives. It is the very function the server uses to pick
 * the layout (`utils/mentorAnswer.js`), so the early chip and the delivered
 * answer only ever differ when the server had to fall back to a simpler
 * layout — and the delivered answer's own `format` always wins.
 */
const formatOf = (text: string, hasMedia: boolean): ResponseFormat => detectMentorFormat(text, hasMedia);

/**
 * What the learner typed, and nothing else. Where they are (course, module,
 * open file) travels in `courseContext` and the server turns it into its own
 * prompt line — prefixing it here used to put the course's TITLE into the text
 * the layout is chosen from (a module called "Programming in Python" made every
 * question a code answer) and into the retrieval query.
 *
 * The one thing added is an honest flag for attachments that could not be
 * turned into images, so the mentor can say so instead of answering blind.
 */
const questionOf = (text: string, attachments: Attachment[], imagesSent: number): string => {
  const body = text.trim() || (attachments.length ? "Please look at the attached image(s) and help me with what is on screen." : "");
  const lost = attachments.length - imagesSent;
  if (attachments.length && lost > 0) {
    return `${body}\n\n(The learner attached ${attachments.length} image${attachments.length === 1 ? "" : "s"}; ${lost === attachments.length ? "none could be read" : `${lost} could not be read`}.)`.trim();
  }
  return body;
};

const historyOf = (chat: Chat): { role: "user" | "assistant"; text: string }[] =>
  chat.messages
    .filter((m) => m.status === "complete" && m.content.trim())
    .slice(-8)
    .map((m) => ({ role: m.role, text: m.content.slice(0, 900) }));

/**
 * Say where an answer came from — and never in the voice of a refusal or a
 * permissions problem.
 *
 * An answer that draws on the lesson's files needs no footnote. One that does
 * not (`grounded: false`) is the mentor teaching from its own knowledge because
 * the files did not cover the question or could not be read; the footnote says
 * so plainly and adds the server's own reason (which sub-modules are locked,
 * how many files opened) so the learner knows what to do if they want the
 * answer tied to their material. It used to be appended whenever nothing was
 * readable and told the learner the answer "comes from titles and your own
 * notes", which was a claim about a dead end rather than about the answer.
 */
const withGroundingNote = (result: Awaited<ReturnType<typeof askModuleAi>>, hasAttachments: boolean): string => {
  const answer = (result.answer || "").trim();
  if (!answer) {
    return hasAttachments
      ? "I couldn't read a clear answer out of that capture. Try a tighter screenshot of the exact part you mean."
      : "I couldn't put an answer together just now. Ask again, or attach a screenshot of the part you mean.";
  }
  if (result.grounded !== false) return answer;
  if (hasAttachments) return answer;
  const coverage = result.coverage;
  const total = Number(coverage?.total ?? 0);
  const readable = Number(coverage?.readable ?? 0);
  const note = typeof result.scopeNote === "string" ? result.scopeNote.replace(/\s+/g, " ").trim() : "";
  const lead = readable > 0
    ? "This wasn't in your lesson files, so I answered from general knowledge."
    : total > 0
      ? "None of this lesson's files could be opened for reading, so I answered from general knowledge."
      : "This lesson has no file I can read text from yet, so I answered from general knowledge.";
  return `${answer}\n\n---\n\n_${note ? `${lead} ${note}` : lead}_`;
};

export async function runProductionAssistant(input: {
  chat: Chat;
  text: string;
  attachments: Attachment[];
  scope: LumenAiScope;
  signal?: AbortSignal;
}): Promise<ProductionRun> {
  const { chat, text, attachments, scope, signal } = input;
  // Captures/uploads travel WITH the turn as vision inputs — the model looks
  // at the pixels, not just the filenames. Unrasterizable rows are skipped, so
  // one bad attachment can never fail the whole ask.
  const images = (await Promise.all(attachments.map((a) => toVisionImage(a.src, a.name))))
    .filter((row): row is { name: string; dataUrl: string } => Boolean(row))
    .slice(0, 3);
  const format = formatOf(text, images.length > 0);
  const question = questionOf(text, attachments, images.length);
  const payload: AskModuleAiInput = {
    uid: scope.uid,
    question,
    moduleId: scope.moduleId,
    storageModuleId: scope.storageModuleId,
    resourceId: scope.resourceId,
    notes: scope.notes,
    images,
    history: historyOf(chat),
    signal,
    source: scope.source,
    courseContext: {
      productId: scope.productId,
      courseTitle: scope.courseTitle,
      moduleTitle: scope.moduleTitle,
      resourceName: scope.resourceName,
      resourceType: scope.resourceType,
      // Which lesson is open, in the course's own terms. Personal-module asks
      // carry their own ids above and need none of this.
      moduleId: scope.official ? scope.officialModuleId || undefined : undefined,
      resourceId: scope.official ? scope.officialResourceId || undefined : undefined,
      official: scope.official ? true : undefined,
    },
  };

  try {
    const result = await askModuleAi(payload);
    const followUps = Array.isArray(result.followUps) ? result.followUps.filter(Boolean).slice(0, 3) : [];
    // The server reports the layout it actually delivered (it may have fallen
    // back to a simpler one), so the chip can never claim a structure the
    // answer does not have. Our own guess is only for a server that predates it.
    const delivered: ResponseFormat = isMentorFormat(result.format) ? result.format : format;
    return {
      modelLabel: [result.provider, result.model].filter(Boolean).join(" · ") || "Course AI",
      spec: {
        format: delivered,
        steps: thinkingSteps(scope, attachments.length > 0).map((s) =>
          s.label === "Asking your course AI"
            ? { ...s, detail: FORMAT_LABEL[delivered] }
            : s,
        ),
        text: withGroundingNote(result, attachments.length > 0),
        followUps,
      },
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof PersonalAiApiError) throw error;
    throw new Error(
      "The AI mentor couldn't connect right now. Please wait a moment and try again — your message is saved.",
    );
  }
}

export function productionThinkingSpec(scope: LumenAiScope, text: string, attachments: Attachment[]): GenerationSpec {
  return {
    format: formatOf(text, attachments.length > 0),
    steps: thinkingSteps(scope, attachments.length > 0),
    text: "",
  };
}
