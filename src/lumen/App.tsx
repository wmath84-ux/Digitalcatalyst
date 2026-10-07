import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CloudOff, X } from "lucide-react";
import "./index.css";
import Composer from "./components/Composer";
import Header from "./components/Header";
import Lightbox from "./components/Lightbox";
import LumenErrorBoundary from "./components/LumenErrorBoundary";
import MessageList from "./components/MessageList";
import ScreenshotOverlay, { type ShotRect } from "./components/ScreenshotOverlay";
import Sidebar from "./components/Sidebar";
import { useRevisionAi } from "./useRevisionAi";
import useLumenChats from "./useLumenChats";
import { PersonalAiApiError } from "../ai/personalAiClient";
import { formatAnswerSheet, type GenerationSpec } from "./lib/engine";
import { tierOf, useElementWidth } from "./lib/tier";
import { buildCourseContext, gradeQuiz } from "./ai/tutor";
import { loadStudentModel, saveStudentModel } from "./ai/studentModel";
import type { StudentModel } from "./ai/types";
import { useViewportKeyboard } from "./lib/useViewportKeyboard";
import { courseBridge, getActiveContext, useCourseContextVersion } from "./course/bridge";
import { abortExcept } from "./course/contentService";
import type { Attachment, Chat, Message, ThinkingStep } from "./lib/types";
import { makeScreenshotAttachment, uid } from "./lib/utils";
import { PERF, perf } from "./lib/perf";
import { productionThinkingSpec, runProductionAssistant, type LumenAiScope } from "./productionAi";
import { isValidPersonalId } from "../../utils/personalCourse";
import { useCourseTheme } from "../course/playerPreferences";
import type { CourseFile, CoursePlayerNote } from "../types/course";

export interface LumenChatProps {
  uid: string;
  productId: string;
  courseTitle: string;
  courseShort?: string;
  moduleId?: string | null;
  moduleTitle?: string | null;
  resourceName?: string | null;
  resourceType?: string | null;
  selectedFile?: CourseFile | null;
  notes?: CoursePlayerNote[];
  profile?: { name: string; photoURL?: string };
  /**
   * Opens the subscription page. Passed down to the error card so a plan
   * problem ("needs an active subscription") offers the one action that
   * actually fixes it instead of a dead end.
   */
  onOpenSubscription?: () => void;
}

const asPersonalId = (value?: string | null): string | undefined => {
  const id = String(value || "").trim();
  return isValidPersonalId(id) ? id : undefined;
};

/**
 * True when a capture is a flat field — a region the browser refuses to
 * photograph (video players, cross-origin embeds) renders as exactly that.
 * Measured on a 32px probe, so it costs nothing; anything unprovable (a
 * tainted canvas throws on read) returns false and lets the normal error path
 * speak instead of silently filing a blank "screenshot".
 */
function isBlankCanvas(canvas: HTMLCanvasElement): boolean {
  try {
    const w = Math.min(32, canvas.width);
    const h = Math.min(32, Math.round((canvas.height * w) / Math.max(1, canvas.width)));
    if (!w || !h) return true;
    const probe = document.createElement("canvas");
    probe.width = w;
    probe.height = h;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(canvas, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let index = 0; index < data.length; index += 4) {
      const lum = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
      sum += lum;
      sumSq += lum * lum;
      n += 1;
    }
    const mean = sum / Math.max(1, n);
    return sumSq / Math.max(1, n) - mean * mean < 25;
  } catch {
    return false;
  }
}

function LumenChatInner({
  uid: learnerUid,
  productId,
  courseTitle,
  courseShort,
  moduleId,
  moduleTitle,
  resourceName,
  resourceType,
  selectedFile = null,
  notes = [],
  profile,
  onOpenSubscription,
}: LumenChatProps) {
  const revisionAi = useRevisionAi(learnerUid);
  const shortLabel = courseShort || courseTitle;

  // Light/Dark theme — reuses the Course Player's shared, per-user theme layer.
  const lumenThemeCtl = useCourseTheme("ai", learnerUid, "light");
  // Cloud-backed chat history. Before this hook the whole conversation list
  // lived in React state and vanished the moment the player unmounted — the
  // reported "course player ke andar jo AI chats hote hain vah save nahin ho
  // rahe". `useLumenChats` keeps Firestore as the source of truth
  // (users/{uid}/aiChats), mirrors every change to localStorage, and merges
  // the live cloud copy so the same chats open on every device.
  const {
    chats,
    activeId,
    setChats,
    setActiveId,
    status: chatSyncStatus,
    errorMessage: chatSyncError,
    flush: flushChats,
    reload: reloadChats,
  } = useLumenChats({
    uid: learnerUid,
    productId,
    courseTitle,
    courseShort: shortLabel,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shotMode, setShotMode] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);

  // A failed capture explains itself once, then gets out of the way.
  useEffect(() => {
    if (!captureNotice) return;
    const t = window.setTimeout(() => setCaptureNotice(null), 9000);
    return () => window.clearTimeout(t);
  }, [captureNotice]);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [studentModel, setStudentModel] = useState<StudentModel>(loadStudentModel);

  const rootRef = useRef<HTMLDivElement>(null);
  const [frameRef, frameW] = useElementWidth<HTMLDivElement>();
  const [colRef, colW] = useElementWidth<HTMLElement>();

  // Visual-viewport / keyboard system (CSS-variable driven, no re-render).
  useViewportKeyboard(rootRef);

  /* Course ↔ AI synchronization. The version counter changes only on
     STRUCTURAL events (resource/page/slide), never on playback ticks. */
  const courseVersion = useCourseContextVersion();
  /*
   * Resource-change housekeeping only. The simulated extractor used to be
   * warmed here (`prefetchActive`), which meant the real course player was
   * calling a playground endpoint with playground credentials and caching its
   * "no access" answer against the open lesson. Real grounding is fetched by
   * the server, per ask, under the learner's own token; nothing here may
   * pre-judge it.
   */
  useEffect(() => {
    abortExcept(getActiveContext().resource.resourceId); // cancel stale demo jobs
  }, [courseVersion]);

  useEffect(() => {
    courseBridge.hydrate({
      courseId: productId,
      courseTitle,
      subject: courseTitle,
      moduleId: moduleId || selectedFile?.personalModuleId || productId,
      moduleTitle: moduleTitle || courseTitle,
      file: selectedFile,
      notes: notes.map((n) => ({
        noteId: n.id,
        resourceId: n.resourceId || selectedFile?.id || "",
        text: n.text,
        createdAt: n.createdAt,
      })),
      accessState: "granted",
    });
  }, [productId, courseTitle, moduleId, moduleTitle, selectedFile, notes]);

  useEffect(() => {
    setChats((cs) =>
      cs.map((c) =>
        c.course === courseTitle && c.courseShort === shortLabel
          ? c
          : { ...c, course: courseTitle, courseShort: shortLabel },
      ),
    );
  }, [courseTitle, shortLabel]);

  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ).current;

  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  // The adaptive-learning layer: student model, persistence, introspection
  const studentModelRef = useRef(studentModel);
  studentModelRef.current = studentModel;
  useEffect(() => {
    saveStudentModel(studentModel);
  }, [studentModel]);
  useEffect(() => {
    (window as unknown as { __lumen?: unknown }).__lumen = {
      studentModel: () => studentModelRef.current,
      perf,
    };
  }, []);

  const timersRef = useRef(new Map<string, number[]>());
  const intervalsRef = useRef(new Map<string, number>());
  const abortByMsg = useRef(new Map<string, AbortController>());

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => t.forEach((id) => window.clearTimeout(id)));
      intervalsRef.current.forEach((id) => window.clearInterval(id));
      abortByMsg.current.forEach((c) => c.abort());
      abortByMsg.current.clear();
    },
    []
  );

  // Close the drawer with Escape when it's open
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const inPlayer = true;

  // Publish viewport/player mode so context is layout-independent.
  useEffect(() => {
    courseBridge.setViewport({
      playerMode: "split",
      viewportMode: colW < 400 ? "narrow-panel" : colW < 700 ? "mobile" : colW < 1020 ? "tablet" : "desktop",
      aiOpen: true,
    });
  }, [colW]);
  // Pinned panel: user preference keeps the sidebar docked through narrow
  // widths (down to a sensible floor). Unpinned: auto-dock on wide frames.
  const dockSidebar = sidebarPinned ? frameW >= 520 : frameW >= 900;
  const tier = tierOf(colW || frameW || 1280);
  const chat = chats.find((c) => c.id === activeId) ?? chats[0];
  const generating = chat.messages.some(
    (m) => m.role === "assistant" && (m.status === "thinking" || m.status === "streaming")
  );
  const draft = drafts[chat.id] ?? "";

  const scopeOf = (): LumenAiScope => {
    const personal = Boolean(selectedFile && String(selectedFile.source || "") === "personal");
    return {
      uid: learnerUid,
      moduleId: personal ? asPersonalId(selectedFile?.personalModuleId) : undefined,
      storageModuleId: personal ? asPersonalId(selectedFile?.personalStorageModuleId) : undefined,
      resourceId: personal ? asPersonalId(selectedFile?.personalResourceId) : undefined,
      // An official lesson is addressed by its place in the course tree. The
      // player already knows both ids; before they were sent, the server had no
      // way to find the open module and grounded every answer in nothing.
      official: personal ? false : true,
      officialModuleId: personal ? undefined : moduleId || undefined,
      officialResourceId: personal ? undefined : selectedFile?.id || undefined,
      notes: notes
        .filter((n) => n.text.trim())
        .slice(0, 12)
        .map((n) => ({ id: n.id, text: n.text, resourceId: n.resourceId || null })),
      courseTitle,
      courseShort: shortLabel,
      moduleTitle,
      resourceName: resourceName || selectedFile?.name || null,
      resourceType: resourceType || selectedFile?.type || null,
      productId,
      // Pass the currently selected source explicitly so the AI call uses
      // the exact source the user sees in the dropdown — no localStorage
      // round-trip race condition.
      source: revisionAi.source === "own" ? "own" : revisionAi.source === "default" ? "default" : undefined,
    };
  };

  /* ── state helpers ─────────────────────────────────────── */

  const patchChat = (chatId: string, patch: Partial<Chat> | ((c: Chat) => Partial<Chat>)) =>
    setChats((cs) => cs.map((c) => (c.id !== chatId ? c : { ...c, ...(typeof patch === "function" ? patch(c) : patch) })));

  const patchMessage = (chatId: string, msgId: string, patch: Partial<Message> | ((m: Message) => Partial<Message>)) =>
    setChats((cs) =>
      cs.map((c) =>
        c.id !== chatId
          ? c
          : { ...c, messages: c.messages.map((m) => (m.id !== msgId ? m : { ...m, ...(typeof patch === "function" ? patch(m) : patch) })) }
      )
    );

  const clearRun = (msgId: string) => {
    timersRef.current.get(msgId)?.forEach((id) => window.clearTimeout(id));
    timersRef.current.delete(msgId);
    const iv = intervalsRef.current.get(msgId);
    if (iv !== undefined) window.clearInterval(iv);
    intervalsRef.current.delete(msgId);
    abortByMsg.current.get(msgId)?.abort();
    abortByMsg.current.delete(msgId);
  };

  /* ── assistant run (ZIP thinking/stream chrome; production text) ─ */

  const runAssistant = (chatId: string, userText: string, atts: Attachment[], forcedSpec?: GenerationSpec) => {
    const c = chatsRef.current.find((x) => x.id === chatId);
    if (!c) return;
    if (abortByMsg.current.size) return;
    const model = revisionAi.models.find((m) => m.id === revisionAi.source) ?? { name: "AI disabled" };
    const id = uid();
    const quizSpec = forcedSpec;
    const thinkingSpec = quizSpec ?? productionThinkingSpec(scopeOf(), userText, atts);
    const steps: ThinkingStep[] = thinkingSpec.steps.map((s) => ({ ...s, status: "pending" as const }));
    const msg: Message = {
      id,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "thinking",
      thinking: steps,
      thinkingOpen: true,
      modelLabel: model.name,
      quiz: thinkingSpec.quiz,
      format: thinkingSpec.format,
      followUps: thinkingSpec.followUps,
      image: thinkingSpec.image ? { ...thinkingSpec.image, status: "rendering" } : undefined,
    };
    setChats((cs) => cs.map((x) => (x.id === chatId ? { ...x, messages: [...x.messages, msg] } : x)));
    const timers: number[] = [];
    timersRef.current.set(id, timers);

    const controller = new AbortController();
    abortByMsg.current.set(id, controller);

    let production: { spec: GenerationSpec; modelLabel: string } | null = quizSpec
      ? { spec: quizSpec, modelLabel: model.name }
      : null;
    let productionError: Error | null = null;
    const productionPromise = quizSpec
      ? Promise.resolve()
      : runProductionAssistant({
          chat: c,
          text: userText,
          attachments: atts,
          scope: scopeOf(),
          signal: controller.signal,
        })
          .then((run) => {
            production = run;
          })
          .catch((error: unknown) => {
            productionError = error instanceof Error ? error : new Error(String(error));
          });

    let i = 0;
    const total = steps.length;

    /** Images finish rendering shortly after the text lands. */
    const finishImage = (spec: GenerationSpec) => {
      if (!spec.image) return;
      const t = window.setTimeout(
        () => patchMessage(chatId, id, (m) => ({ image: m.image ? { ...m.image, status: "done" } : m.image })),
        reducedMotion ? 0 : 1500
      );
      timers.push(t);
    };

    const startStream = () => {
      void (async () => {
        await productionPromise;
        if (controller.signal.aborted) return;
        if (productionError) {
          if (productionError.name === "AbortError") return;
          patchMessage(chatId, id, (m) => ({
            status: "error",
            errorMessage: productionError?.message,
            errorRetryable: productionError instanceof PersonalAiApiError ? productionError.retryable : true,
            errorKind: productionError instanceof PersonalAiApiError ? productionError.kind : "unknown",
            thinkingOpen: false,
            thinkingMs: Date.now() - m.createdAt,
          }));
          abortByMsg.current.delete(id);
          timersRef.current.delete(id);
          return;
        }
        const spec = production?.spec ?? thinkingSpec;
        const label = production?.modelLabel ?? model.name;
        patchMessage(chatId, id, {
          modelLabel: label,
          format: spec.format,
          followUps: spec.followUps,
          quiz: spec.quiz,
          image: spec.image ? { ...spec.image, status: "rendering" } : undefined,
        });
        if (reducedMotion) {
          patchMessage(chatId, id, (m) => ({
            status: "complete",
            content: spec.text,
            thinkingOpen: false,
            thinkingMs: Date.now() - m.createdAt,
          }));
          finishImage(spec);
          timersRef.current.delete(id);
          abortByMsg.current.delete(id);
          return;
        }
        patchMessage(chatId, id, { status: "streaming", thinkingOpen: false });
        const tokens = spec.text.split(/(\s+)/);
        let wi = 0;
        let tick = 0;
        const iv = window.setInterval(() => {
          if (controller.signal.aborted) {
            window.clearInterval(iv);
            intervalsRef.current.delete(id);
            return;
          }
          tick += 1;
          wi += PERF.STREAM_WORDS - 2 + (tick % 3); // 3-4-2-word stagger, natural cadence
          const done = wi >= tokens.length;
          perf.bump("streamCommits");
          patchMessage(chatId, id, { content: done ? spec.text : tokens.slice(0, wi).join("") });
          if (done) {
            window.clearInterval(iv);
            intervalsRef.current.delete(id);
            patchMessage(chatId, id, (m) => ({ status: "complete", thinkingMs: Date.now() - m.createdAt }));
            finishImage(spec);
            abortByMsg.current.delete(id);
          }
        }, PERF.STREAM_COMMIT_MS);
        intervalsRef.current.set(id, iv);
      })();
    };

    const tick = () => {
      if (controller.signal.aborted) return;
      i += 1;
      patchMessage(chatId, id, (m) => ({
        thinking: (m.thinking ?? []).map((s, idx) => ({
          ...s,
          status: idx < i ? ("done" as const) : idx === i ? ("active" as const) : ("pending" as const),
        })),
      }));
      if (i < total) timers.push(window.setTimeout(tick, 560 + ((i * 173) % 460)));
      else timers.push(window.setTimeout(startStream, 380));
    };
    timers.push(window.setTimeout(tick, 460));
  };

  /* ── user actions ──────────────────────────────────────── */

  const send = (textIn?: string) => {
    const text = (textIn ?? draft).trim();
    const atts = attachments;
    if (generating || abortByMsg.current.size || (!text && atts.length === 0)) return;
    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: text,
      attachments: atts.length ? atts : undefined,
      createdAt: Date.now(),
      status: "complete",
    };
    setChats((cs) =>
      cs.map((c) => {
        if (c.id !== chat.id) return c;
        const title =
          c.title === "New chat"
            ? text
              ? text.length > 36
                ? `${text.slice(0, 36).trimEnd()}…`
                : text
              : "Screenshot question"
            : c.title;
        return { ...c, title, messages: [...c.messages, userMsg] };
      })
    );
    setDrafts((d) => ({ ...d, [chat.id]: "" }));
    setAttachments([]);
    runAssistant(chat.id, text, atts);
  };

  const stopActive = () => {
    const m = [...chat.messages]
      .reverse()
      .find((x) => x.role === "assistant" && (x.status === "thinking" || x.status === "streaming"));
    if (!m) return;
    clearRun(m.id);
    if (!m.content) {
      setChats((cs) => cs.map((c) => (c.id !== chat.id ? c : { ...c, messages: c.messages.filter((x) => x.id !== m.id) })));
    } else {
      patchMessage(chat.id, m.id, (mm) => ({
        status: "complete",
        thinkingOpen: false,
        thinkingMs: mm.thinkingMs ?? Date.now() - mm.createdAt,
      }));
    }
  };

  const retry = (msgId: string) => {
    if (generating || abortByMsg.current.size) return;
    const msgs = chat.messages;
    const idx = msgs.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const userMsg = msgs
      .slice(0, idx)
      .reverse()
      .find((m) => m.role === "user");
    if (!userMsg) return;
    const target = msgs[idx];
    clearRun(target.id);
    setChats((cs) => cs.map((c) => (c.id !== chat.id ? c : { ...c, messages: c.messages.filter((m) => m.id !== target.id) })));
    // Grading messages are regenerated from the quiz's final answer data.
    const quizMsg = userMsg.quizRef ? msgs.find((m) => m.id === userMsg.quizRef) : undefined;
    const regraded = quizMsg?.quiz
      ? gradeQuiz(quizMsg.quiz, chat.id, studentModelRef.current, buildCourseContext(chat, inPlayer))
      : undefined;
    if (regraded) setStudentModel(regraded.model);
    runAssistant(chat.id, userMsg.content, userMsg.attachments ?? [], regraded?.spec);
  };

  /* ── interactive practice quiz ─────────────────────────── */

  const quizAnswer = (msgId: string, qIdx: number, optIdx: number) => {
    patchMessage(chat.id, msgId, (m) => {
      if (!m.quiz || m.quiz.submitted) return {};
      const answers = m.quiz.answers.slice();
      answers[qIdx] = optIdx;
      return { quiz: { ...m.quiz, answers } };
    });
  };

  const quizSubmit = (msgId: string) => {
    if (generating) return;
    const quizMsg = chat.messages.find((m) => m.id === msgId);
    const quiz = quizMsg?.quiz;
    if (!quiz || quiz.submitted || quiz.answers.some((a) => a == null)) return;

    patchMessage(chat.id, msgId, (m) => ({ quiz: m.quiz ? { ...m.quiz, submitted: true } : m.quiz }));

    const sheet: Message = {
      id: uid(),
      role: "user",
      content: formatAnswerSheet(quiz),
      createdAt: Date.now(),
      status: "complete",
      quizRef: msgId,
    };
    setChats((cs) => cs.map((c) => (c.id !== chat.id ? c : { ...c, messages: [...c.messages, sheet] })));
    // Evaluate + classify mistakes + update the student model, then respond
    const graded = gradeQuiz(quiz, chat.id, studentModelRef.current, buildCourseContext(chat, inPlayer));
    setStudentModel(graded.model);
    runAssistant(chat.id, sheet.content, [], graded.spec);
  };

  /* ── stable callback layer ─────────────────────────────────
     Memoized message cells must re-render only when *their own*
     message changes — so conversation handlers delegate through
     refs and keep identity stable across every stream commit. */
  const handlersRef = useRef({ retry, quizAnswer, quizSubmit, send, patchMessage });
  handlersRef.current = { retry, quizAnswer, quizSubmit, send, patchMessage };
  const activeChatRef = useRef(chat);
  activeChatRef.current = chat;

  const cbRetry = useCallback((id: string) => handlersRef.current.retry(id), []);
  const cbQuizAnswer = useCallback((msgId: string, q: number, o: number) => handlersRef.current.quizAnswer(msgId, q, o), []);
  const cbQuizSubmit = useCallback((msgId: string) => handlersRef.current.quizSubmit(msgId), []);
  const cbFollowUp = useCallback((text: string) => handlersRef.current.send(text), []);
  const cbSend = useCallback((text: string) => handlersRef.current.send(text), []);
  const cbToggleThinking = useCallback(
    (msgId: string) => handlersRef.current.patchMessage(activeChatRef.current.id, msgId, (m) => ({ thinkingOpen: !m.thinkingOpen })),
    []
  );
  const cbDraftSync = useCallback(
    (v: string) => setDrafts((d) => (d[activeChatRef.current.id] === v ? d : { ...d, [activeChatRef.current.id]: v })),
    []
  );

  const newChat = () => {
    const id = uid();
    setChats((cs) => [
      { id, title: "New chat", course: courseTitle, courseShort: shortLabel, modelId: chat.modelId, messages: [] },
      ...cs,
    ]);
    setActiveId(id);
    setAttachments([]);
    setDrawerOpen(false);
  };

  const selectChat = (id: string) => {
    if (id !== activeId) {
      setActiveId(id);
      setAttachments([]);
    }
    setDrawerOpen(false);
  };

  /* ── screenshot capture ────────────────────────────────── */

  const captureRegion = async (r: ShotRect) => {
    const failCapture = (message: string) => {
      // Never file a fake placeholder: a capture that is not a photograph of
      // the region must say why, not attach a lookalike the AI would "read".
      setCaptureNotice(message);
      setShotMode(false);
    };
    try {
      const { default: html2canvas } = await import("html2canvas");
      const scale = Math.min(PERF.SHOT_SCALE_MAX, window.devicePixelRatio || 1);
      // Viewport-sized render + native crop. The selection rect is already in
      // viewport coordinates, so rendering the whole document and re-adding
      // scroll offsets is both slower and a classic source of shifted shots.
      // `useCORS` keeps cross-origin lesson images from tainting the canvas —
      // a tainted canvas throws on toDataURL, which used to surface as a
      // blank placeholder with no explanation at all.
      const canvas = await html2canvas(document.documentElement, {
        scale,
        logging: false,
        useCORS: true,
        backgroundColor: "#f7f6f2",
        windowWidth: document.documentElement.clientWidth,
        windowHeight: window.innerHeight,
        x: Math.max(0, Math.round(r.x)),
        y: Math.max(0, Math.round(r.y)),
        width: Math.max(2, Math.round(r.w)),
        height: Math.max(2, Math.round(r.h)),
      });
      // Bound output size — caps memory + future upload cost on huge regions.
      const outScale = Math.min(1, PERF.SHOT_MAX_EDGE / Math.max(canvas.width, canvas.height));
      let out = canvas;
      if (outScale < 1) {
        const small = document.createElement("canvas");
        small.width = Math.max(2, Math.round(canvas.width * outScale));
        small.height = Math.max(2, Math.round(canvas.height * outScale));
        const sctx = small.getContext("2d");
        if (sctx) {
          sctx.drawImage(canvas, 0, 0, small.width, small.height);
          out = small;
        }
      }
      if (isBlankCanvas(out)) {
        failCapture("That area couldn't be photographed — video players and embedded pages are protected by the browser. Take a device screenshot and attach it with + instead.");
        return;
      }
      // JPEG for UI captures: far smaller than PNG, visually identical here.
      let att: Attachment = makeScreenshotAttachment(out.toDataURL("image/jpeg", PERF.SHOT_JPEG_QUALITY), Math.round(r.w), Math.round(r.h));
    // Link the capture to what was on screen — the AI reads it as
    // "region of THIS resource at THIS position", not a loose image.
    if (inPlayer) {
      const ctx = getActiveContext();
      const pos = ctx.playbackState.currentTime != null
        ? `${Math.floor(ctx.playbackState.currentTime / 60)}m${String(Math.floor(ctx.playbackState.currentTime % 60)).padStart(2, "0")}`
        : ctx.locationState.currentPage != null
          ? `p${ctx.locationState.currentPage}`
          : ctx.locationState.currentSlide != null
            ? `s${ctx.locationState.currentSlide}`
            : "view";
      att = { ...att, name: `${ctx.resource.resourceName} · ${pos}.jpg` };
      courseBridge.noteInteraction(`captured a region of ${ctx.resource.resourceName}`);
    }
    setAttachments((p) => [...p, att]);
    setShotMode(false);
    } catch {
      failCapture("The capture failed in this browser. Take a device screenshot and attach it with + instead.");
    }
  };

  /* ── layout ────────────────────────────────────────────── */

  return (
    <div ref={rootRef} className={lumenThemeCtl.theme === "dark" ? "lumen-root lumen-dark" : "lumen-root"} data-lumen-theme={lumenThemeCtl.theme}>
      <div ref={frameRef} className="relative flex h-full min-h-0 min-w-0 w-full bg-[--bg]">
        {dockSidebar && (
          <div className="h-full flex-none">
            <Sidebar
              mode="docked"
              chats={chats}
              activeId={chat.id}
              panelPinned={sidebarPinned}
              profile={profile}
              onSelect={selectChat}
              onNewChat={newChat}
              onTogglePin={(id) => patchChat(id, (c) => ({ pinned: !c.pinned }))}
              onTogglePanelPin={() => setSidebarPinned((v) => !v)}
            />
          </div>
        )}

        <section ref={colRef} data-tier={tier} aria-label={`Chat: ${chat.title}`} className="relative flex h-full min-w-0 flex-1 flex-col bg-[--bg]">
          <Header
            chat={chat}
            tier={tier}
            showMenuButton={!dockSidebar}
            onOpenSidebar={() => setDrawerOpen(true)}
            onTogglePin={() => patchChat(chat.id, (c) => ({ pinned: !c.pinned }))}
            onRename={(title) => patchChat(chat.id, { title })}
            models={revisionAi.models}
            selectedSource={revisionAi.source}
            modelDisabled={generating}
            onSelectModel={revisionAi.select}
            syncState={chatSyncStatus}
            syncError={chatSyncError}
            onRetrySync={() => { flushChats(); reloadChats(); }}
            theme={lumenThemeCtl.theme}
            onToggleTheme={lumenThemeCtl.toggleTheme}
          />

          {/* A failed cloud save must never be a silent state: say what
              happened and offer the one action that retries it. */}
          {chatSyncError && (
            <div className="flex flex-none items-start gap-2 border-b border-[--border] bg-[--surface] px-3 py-2 text-[12px] leading-snug text-[--ink-2]" role="status">
              <CloudOff size={14} aria-hidden="true" className="mt-px flex-none text-[#b4392f]" />
              <span className="min-w-0 flex-1">{chatSyncError}</span>
              <button
                type="button"
                onClick={() => { reloadChats(); flushChats(); }}
                className="focus-ring flex-none rounded-full px-2 py-0.5 text-[11.5px] font-semibold text-[--accent-ink] hover:bg-[--hover]"
              >
                Retry
              </button>
            </div>
          )}

          <MessageList
            chat={chat}
            tier={tier}
            generating={generating}
            onRetry={cbRetry}
            onImageClick={setLightbox}
            onToggleThinking={cbToggleThinking}
            onQuizAnswer={cbQuizAnswer}
            onQuizSubmit={cbQuizSubmit}
            onFollowUp={cbFollowUp}
            onOpenPlans={onOpenSubscription}
          />

          <Composer
            key={chat.id}
            tier={tier}
            courseShort={chat.courseShort}
            initialDraft={drafts[chat.id] ?? ""}
            attachments={attachments}
            generating={generating}
            autofocus
            onDraftSync={cbDraftSync}
            onAddAttachments={(atts) => setAttachments((p) => [...p, ...atts])}
            onRemoveAttachment={(id) => setAttachments((p) => p.filter((a) => a.id !== id))}
            onSend={cbSend}
            onStop={stopActive}
            onScreenshot={() => setShotMode(true)}
          />

          {/* sidebar drawer (narrow containers) */}
          {!dockSidebar && drawerOpen && (
            <div className="absolute inset-0 z-40">
              <div
                className="anim-fade-in absolute inset-0 bg-[rgba(28,27,23,0.32)]"
                onClick={() => setDrawerOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute inset-y-0 left-0">
                <Sidebar
                  mode="drawer"
                  chats={chats}
                  activeId={chat.id}
                  panelPinned={sidebarPinned}
                  profile={profile}
                  onSelect={selectChat}
                  onNewChat={newChat}
                  onTogglePin={(id) => patchChat(id, (c) => ({ pinned: !c.pinned }))}
                  onTogglePanelPin={() => setSidebarPinned((v) => !v)}
                  onClose={() => setDrawerOpen(false)}
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {captureNotice && (
        <div
          className="fixed left-1/2 z-[95] w-[min(520px,calc(100%-32px))] -translate-x-1/2"
          style={{ bottom: "max(96px, calc(env(safe-area-inset-bottom) + 88px))" }}
          role="status"
        >
          <div className="anim-fade-up flex items-start gap-2.5 rounded-[14px] bg-[rgba(24,22,16,0.94)] px-3.5 py-3 text-[12.5px] leading-snug text-[#f1efe8] shadow-[var(--sh-pop)]">
            <Camera size={15} aria-hidden="true" className="mt-px flex-none opacity-80" />
            <span className="flex-1">{captureNotice}</span>
            <button
              type="button"
              onClick={() => setCaptureNotice(null)}
              aria-label="Dismiss"
              className="focus-ring flex-none rounded-full p-1 text-[#f1efe8]/70 transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[#f1efe8]"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {shotMode && <ScreenshotOverlay onCancel={() => setShotMode(false)} onCapture={captureRegion} />}
      {lightbox && <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/**
 * Public entry point — wraps the chat in an error boundary so a render crash
 * in the AI chat never takes down the entire course player. The boundary
 * catches the error, shows a recovery UI, and lets the learner reload.
 */
export default function LumenChat(props: LumenChatProps) {
  return (
    <LumenErrorBoundary>
      <LumenChatInner {...props} />
    </LumenErrorBoundary>
  );
}
