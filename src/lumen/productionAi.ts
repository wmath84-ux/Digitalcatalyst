// Production boundary for the ZIP Lumen chat.
//
// The ZIP UI (thinking / streaming / error / retry / stop) stays exactly as
// designed. Only the mock tutor's generated *text* is replaced by a real
// authenticated Personal AI call that uses Revision AI Configuration.

import { askModuleAi, PersonalAiApiError, type AskModuleAiInput } from "../ai/personalAiClient";
import type { PersonalAiNoteInput } from "../types/personalAi";
import type { Attachment, Chat, ResponseFormat } from "./lib/types";
import type { GenerationSpec } from "./lib/engine";
import { FORMAT_LABEL } from "./lib/engine";

export interface LumenAiScope {
  uid: string;
  moduleId?: string | null;
  storageModuleId?: string | null;
  resourceId?: string | null;
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

const formatOf = (text: string): ResponseFormat => {
  const t = text.toLowerCase();
  if (/\b(practice|quiz|test me)\b/.test(t)) return "practice";
  if (/\b(step by step|steps|how do|walk me through)\b/.test(t)) return "steps";
  if (/\b(differen\w*|compare|versus|vs\.?|contrast)\b/.test(t)) return "comparison";
  if (/\b(brief\w*|short|quick|simply|summar\w*)\b/.test(t)) return "concise";
  return "deep-dive";
};

const withCourseLead = (text: string, scope: LumenAiScope, attachments: Attachment[]): string => {
  const where = [scope.courseTitle, scope.moduleTitle, scope.resourceName].filter(Boolean).join(" · ");
  const media = attachments.length
    ? `\nThe student attached ${attachments.length} image${attachments.length === 1 ? "" : "s"}: ${attachments.map((a) => a.name).join(", ")}.`
    : "";
  const body = text.trim() || (attachments.length ? "Please look at the attached image(s) and help me with what is on screen." : "");
  if (!where) return `${body}${media}`.trim();
  return `I'm currently studying: ${where}.${media}\n\n${body}`.trim();
};

const historyOf = (chat: Chat): { role: "user" | "assistant"; text: string }[] =>
  chat.messages
    .filter((m) => m.status === "complete" && m.content.trim())
    .slice(-8)
    .map((m) => ({ role: m.role, text: m.content.slice(0, 900) }));

export async function runProductionAssistant(input: {
  chat: Chat;
  text: string;
  attachments: Attachment[];
  scope: LumenAiScope;
  signal?: AbortSignal;
}): Promise<ProductionRun> {
  const { chat, text, attachments, scope, signal } = input;
  const format = formatOf(text);
  const question = withCourseLead(text, scope, attachments);
  const payload: AskModuleAiInput = {
    uid: scope.uid,
    question,
    moduleId: scope.moduleId,
    storageModuleId: scope.storageModuleId,
    resourceId: scope.resourceId,
    notes: scope.notes,
    history: historyOf(chat),
    signal,
    source: scope.source,
    courseContext: {
      productId: scope.productId,
      courseTitle: scope.courseTitle,
      moduleTitle: scope.moduleTitle,
      resourceName: scope.resourceName,
      resourceType: scope.resourceType,
    },
  };

  try {
    const result = await askModuleAi(payload);
    const followUps = Array.isArray(result.followUps) ? result.followUps.filter(Boolean).slice(0, 3) : [];
    return {
      modelLabel: [result.provider, result.model].filter(Boolean).join(" · ") || "Course AI",
      spec: {
        format,
        steps: thinkingSteps(scope, attachments.length > 0).map((s) =>
          s.label === "Asking your course AI"
            ? { ...s, detail: FORMAT_LABEL[format] }
            : s,
        ),
        text: result.answer || "I couldn't compose an answer from the readable material. Try asking again, or attach a screenshot of the part you mean.",
        followUps,
      },
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof PersonalAiApiError) throw error;
    throw new Error("Unable to connect to AI service. Please try again.");
  }
}

export function productionThinkingSpec(scope: LumenAiScope, text: string, attachments: Attachment[]): GenerationSpec {
  return {
    format: formatOf(text),
    steps: thinkingSteps(scope, attachments.length > 0),
    text: "",
  };
}
