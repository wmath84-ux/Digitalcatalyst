import { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";
import Composer from "./components/Composer";
import Header from "./components/Header";
import Lightbox from "./components/Lightbox";
import MessageList from "./components/MessageList";
import ScreenshotOverlay, { type ShotRect } from "./components/ScreenshotOverlay";
import Sidebar from "./components/Sidebar";
import { MODELS } from "./lib/data";
import { formatAnswerSheet, type GenerationSpec } from "./lib/engine";
import { tierOf, useElementWidth } from "./lib/tier";
import { buildCourseContext, gradeQuiz } from "./ai/tutor";
import { loadStudentModel, saveStudentModel } from "./ai/studentModel";
import type { StudentModel } from "./ai/types";
import { useViewportKeyboard } from "./lib/useViewportKeyboard";
import { courseBridge, getActiveContext, useCourseContextVersion } from "./course/bridge";
import { abortExcept } from "./course/contentService";
import { prefetchActive } from "./ai/courseGrounding";
import type { Attachment, Chat, Message, ThinkingStep } from "./lib/types";
import { makeScreenshotAttachment, uid } from "./lib/utils";
import { PERF, perf } from "./lib/perf";
import { productionThinkingSpec, runProductionAssistant, type LumenAiScope } from "./productionAi";
import { isValidPersonalId } from "../../utils/personalCourse";
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
}

const asPersonalId = (value?: string | null): string | undefined => {
  const id = String(value || "").trim();
  return isValidPersonalId(id) ? id : undefined;
};

/* Graceful visual fallback if DOM capture is unavailable in this browser. */
function fallbackShot(r: ShotRect): Attachment {
  const w = 640;
  const h = Math.max(220, Math.round((640 * r.h) / Math.max(1, r.w)));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f1efe8";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e2e0d5";
    for (let x = 20; x < w; x += 28) for (let y = 20; y < h; y += 28) ctx.fillRect(x, y, 2, 2);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 16, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#4f46e5";
    ctx.fill();
    ctx.fillStyle = "#dcdacc";
    ctx.fillRect(w / 2 - 120, h / 2 + 20, 240, 12);
    ctx.fillRect(w / 2 - 78, h / 2 + 42, 156, 12);
    ctx.fillStyle = "#8c8a7d";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Captured area · ${Math.round(r.w)} × ${Math.round(r.h)}`, w / 2, h - 18);
  }
  return makeScreenshotAttachment(canvas.toDataURL("image/png"), Math.round(r.w), Math.round(r.h));
}

export default function LumenChat({
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
}: LumenChatProps) {
  const shortLabel = courseShort || courseTitle;
  const initialIdRef = useRef(uid());
  const [chats, setChats] = useState<Chat[]>(() => [
    {
      id: initialIdRef.current,
      title: "New chat",
      course: courseTitle,
      courseShort: shortLabel,
      modelId: "default",
      messages: [],
    },
  ]);
  const [activeId, setActiveId] = useState(initialIdRef.current);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shotMode, setShotMode] = useState(false);
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
  useEffect(() => {
    const ctx = getActiveContext();
    abortExcept(ctx.resource.resourceId); // cancel extraction for stale resources
    prefetchActive(ctx);                  // warm the cache for the open one
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

  const scopeOf = (modelId: string): LumenAiScope => {
    const personal = Boolean(selectedFile && String(selectedFile.source || "") === "personal");
    return {
      uid: learnerUid,
      moduleId: personal ? asPersonalId(selectedFile?.personalModuleId) : undefined,
      storageModuleId: personal ? asPersonalId(selectedFile?.personalStorageModuleId) : undefined,
      resourceId: personal ? asPersonalId(selectedFile?.personalResourceId) : undefined,
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
      source: modelId === "own" ? "own" : "default",
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
    const model = MODELS.find((m) => m.id === c.modelId) ?? MODELS[0];
    const id = uid();
    const quizSpec = forcedSpec;
    const thinkingSpec = quizSpec ?? productionThinkingSpec(scopeOf(c.modelId), userText, atts);
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
          scope: scopeOf(c.modelId),
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
    if (generating || (!text && atts.length === 0)) return;
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
  const cbSuggestion = useCallback(
    (text: string) => setDrafts((d) => (d[activeChatRef.current.id] === text ? d : { ...d, [activeChatRef.current.id]: text })),
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
    let att: Attachment | null = null;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const scale = Math.min(PERF.SHOT_SCALE_MAX, window.devicePixelRatio || 1);
      const canvas = await html2canvas(document.documentElement, {
        scale,
        logging: false,
        backgroundColor: "#f7f6f2",
      });
      const sx = Math.max(0, Math.round((r.x + window.scrollX) * scale));
      const sy = Math.max(0, Math.round((r.y + window.scrollY) * scale));
      const sw = Math.max(2, Math.round(r.w * scale));
      const sh = Math.max(2, Math.round(r.h * scale));
      // Bound output size — caps memory + future upload cost on huge regions.
      const outScale = Math.min(1, PERF.SHOT_MAX_EDGE / Math.max(sw, sh));
      const crop = document.createElement("canvas");
      crop.width = Math.round(sw * outScale);
      crop.height = Math.round(sh * outScale);
      const ctx = crop.getContext("2d");
      if (!ctx) throw new Error("capture unsupported");
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
      // JPEG for UI captures: far smaller than PNG, visually identical here.
      att = makeScreenshotAttachment(crop.toDataURL("image/jpeg", PERF.SHOT_JPEG_QUALITY), Math.round(r.w), Math.round(r.h));
    } catch {
      att = fallbackShot(r);
    }
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
  };

  /* ── layout ────────────────────────────────────────────── */

  return (
    <div ref={rootRef} className="lumen-root">
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
            onSelectModel={(modelId) => patchChat(chat.id, { modelId })}
          />

          <MessageList
            chat={chat}
            tier={tier}
            generating={generating}
            onSuggestion={cbSuggestion}
            onRetry={cbRetry}
            onImageClick={setLightbox}
            onToggleThinking={cbToggleThinking}
            onQuizAnswer={cbQuizAnswer}
            onQuizSubmit={cbQuizSubmit}
            onFollowUp={cbFollowUp}
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

      {shotMode && <ScreenshotOverlay onCancel={() => setShotMode(false)} onCapture={captureRegion} />}
      {lightbox && <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
