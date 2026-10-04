// public/my-day-workspace/app.bundle.js
//
// The Joplin My Day workspace sub-application.
// Provides the complete 3-pane personal workspace (notebooks, notes, to-dos, tags, schedules, search)
// and implements the bidirectional Digitalcatalyst frame bridge protocol.

(function () {
  "use strict";

  const DC_CHANNEL = "digitalcatalyst-myday";
  const DC_PROTOCOL = 1;

  // ── State ────────────────────────────────────────────────────────────────
  const state = {
    uid: null,
    displayName: null,
    email: null,
    timeZone: "UTC",
    notebooks: [],
    notes: [],
    tags: [],
    schedules: [],
    activeNotebookId: null,
    activeTagId: null,
    activeView: "all", // "all" | "todos" | "schedule" | "tags"
    activeNoteId: null,
    filter: "all", // "all" | "notes" | "todos" | "open" | "completed"
    searchQuery: "",
    previewMode: "split", // "editor" | "preview" | "split"
    isModalOpen: false,
    modalType: null, // "schedule" | "notebook" | "tag"
    tokenRequestCallbacks: new Map(),
    theme: "light",
    mobilePane: "list", // "list" | "editor"
    sidebarOpen: false,
  };

  // ── ID Helper ────────────────────────────────────────────────────────────
  function makeId() {
    let id = "";
    const chars = "0123456789abcdef";
    for (let i = 0; i < 32; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  function isHex32(value) {
    return /^[0-9a-f]{32}$/.test(String(value || ""));
  }

  function namedId(name) {
    const src = String(name || "");
    const seeds = [0x811c9dc5, 0x9e3779b1, 0x85ebca77, 0xc2b2ae3d];
    const out = [];
    for (let lane = 0; lane < 4; lane++) {
      let hash = seeds[lane] >>> 0;
      for (let i = 0; i < src.length; i++) {
        hash ^= src.charCodeAt(i);
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
      }
      out.push((hash >>> 0).toString(16).padStart(8, "0"));
    }
    return out.join("");
  }

  const NB = {
    root: namedId("notebook:My Day"),
    tasks: namedId("notebook:Tasks"),
    notes: namedId("notebook:Quick Notes"),
    reminders: namedId("notebook:Reminders"),
    clipper: namedId("notebook:Web Clippings"),
  };

  const LEGACY_NB = {
    "nb-root": NB.root,
    "nb-tasks": NB.tasks,
    "nb-notes": NB.notes,
    "nb-reminders": NB.reminders,
    "nb-clipper": NB.clipper,
  };

  // ── Default Hierarchy ────────────────────────────────────────────────────
  function getDefaultNotebooks() {
    const now = Date.now();
    return [
      { id: NB.root, type_: 2, title: "My Day", parent_id: "", created_time: now, updated_time: now },
      { id: NB.tasks, type_: 2, title: "Tasks", parent_id: NB.root, created_time: now, updated_time: now },
      { id: NB.notes, type_: 2, title: "Quick Notes", parent_id: NB.root, created_time: now, updated_time: now },
      { id: NB.reminders, type_: 2, title: "Reminders", parent_id: NB.root, created_time: now, updated_time: now },
      { id: NB.clipper, type_: 2, title: "Web Clippings", parent_id: NB.root, created_time: now, updated_time: now },
    ];
  }

  function remapLegacyId(id) {
    const raw = String(id || "");
    if (!raw) return "";
    if (LEGACY_NB[raw]) return LEGACY_NB[raw];
    if (isHex32(raw)) return raw;
    return namedId("id:" + raw);
  }

  const THEME_KEY = "eduvora.joplin_theme";

  function readStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark" || stored === "light") return stored;
    } catch (_) {}
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch (_) {}
    return "light";
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    try {
      localStorage.setItem(THEME_KEY, state.theme);
    } catch (_) {}
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    render();
  }

  function isPhone() {
    return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
  }

  // ── Bridge Communication ─────────────────────────────────────────────────
  function postToHost(type, payload = {}) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          channel: DC_CHANNEL,
          version: 1,
          type,
          payload,
        },
        "*"
      );
    }
  }

  function requestToken() {
    return new Promise((resolve) => {
      const requestId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      const timeout = setTimeout(() => {
        state.tokenRequestCallbacks.delete(requestId);
        resolve(null);
      }, 5000);

      state.tokenRequestCallbacks.set(requestId, (token) => {
        clearTimeout(timeout);
        resolve(token);
      });

      postToHost("token-request", { requestId });
    });
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object" || data.channel !== DC_CHANNEL) return;

    switch (data.type) {
      case "host-hello": {
        postToHost("app-ready", { protocol: DC_PROTOCOL, app: "joplin-web" });
        break;
      }
      case "identity": {
        const payload = data.payload || {};
        state.uid = payload.uid || null;
        state.displayName = payload.displayName || null;
        state.email = payload.email || null;
        state.timeZone = payload.timeZone || "UTC";
        try {
          if (state.uid) sessionStorage.setItem("dc.uid", state.uid);
        } catch (_) {}
        loadData();
        break;
      }
      case "token": {
        const payload = data.payload || {};
        const cb = state.tokenRequestCallbacks.get(payload.requestId);
        if (cb) {
          state.tokenRequestCallbacks.delete(payload.requestId);
          cb(payload.token);
        }
        break;
      }
      case "open": {
        const href = String(data.payload?.href || "");
        handleDeepLink(href);
        break;
      }
      case "signout": {
        state.uid = null;
        state.notes = [];
        state.notebooks = [];
        state.schedules = [];
        state.activeNoteId = null;
        render();
        break;
      }
    }
  });

  // Announce ready immediately on script evaluation
  postToHost("app-ready", { protocol: DC_PROTOCOL, app: "joplin-web" });

  // ── Deep Link Handling ───────────────────────────────────────────────────
  function handleDeepLink(href) {
    if (!href) return;
    try {
      const url = new URL(href, window.location.origin);
      const params = new URLSearchParams(url.hash.includes("?") ? url.hash.split("?")[1] : url.search);

      const noteId = params.get("note") || params.get("noteId");
      const notebookId = params.get("notebook") || params.get("notebookId");
      const tagId = params.get("tag") || params.get("tagId");
      const scheduleId = params.get("schedule") || params.get("scheduleId");
      const view = params.get("view");

      if (view) {
        state.activeView = view;
      }
      if (notebookId) {
        state.activeNotebookId = notebookId;
        state.activeView = "notebook";
      }
      if (tagId) {
        state.activeTagId = tagId;
        state.activeView = "tags";
      }
      if (noteId) {
        state.activeNoteId = noteId;
        state.mobilePane = "editor";
      }
      if (scheduleId) {
        state.activeView = "schedule";
      }
      render();
    } catch (_) {}
  }

  // ── Data Persistence ─────────────────────────────────────────────────────
  function storageKey(type) {
    return `eduvora.joplin_${type}:${state.uid || "local"}`;
  }

  function loadData() {
    const uid = state.uid || "local";
    let loadedNotebooks = null;
    let loadedNotes = null;
    let loadedTags = null;
    let loadedSchedules = null;

    try {
      const rawNb = localStorage.getItem(storageKey("notebooks"));
      if (rawNb) loadedNotebooks = JSON.parse(rawNb);
      const rawNotes = localStorage.getItem(storageKey("notes"));
      if (rawNotes) loadedNotes = JSON.parse(rawNotes);
      const rawTags = localStorage.getItem(storageKey("tags"));
      if (rawTags) loadedTags = JSON.parse(rawTags);
      const rawSchedules = localStorage.getItem(storageKey("schedules"));
      if (rawSchedules) loadedSchedules = JSON.parse(rawSchedules);
    } catch (_) {}

    // Fallback: import legacy items if available and joplin store is empty
    if (!loadedNotes || loadedNotes.length === 0) {
      const legacyNotes = [];
      try {
        const tasks = JSON.parse(localStorage.getItem("myday_tasks") || "[]");
        tasks.forEach((t) => {
          legacyNotes.push({
            id: makeId(),
            type_: 1,
            parent_id: NB.tasks,
            title: t.title || "Untitled Task",
            body: t.subject ? `Subject: ${t.subject}\n` : "",
            is_todo: 1,
            todo_due: t.time ? Date.now() + 3600000 : 0,
            todo_completed: t.status === "completed" ? Date.now() : 0,
            tag_ids: t.priority ? [`tag-${t.priority}`] : [],
            tag_titles: t.priority ? [t.priority] : [],
            created_time: Date.now(),
            updated_time: Date.now(),
          });
        });

        const notes = JSON.parse(localStorage.getItem("myday_notes") || "[]");
        notes.forEach((n) => {
          legacyNotes.push({
            id: makeId(),
            type_: 1,
            parent_id: NB.notes,
            title: (n.text || "Note").split("\n")[0].slice(0, 50),
            body: n.text || "",
            is_todo: 0,
            todo_due: 0,
            todo_completed: 0,
            tag_ids: [],
            tag_titles: [],
            created_time: n.createdAt || Date.now(),
            updated_time: n.createdAt || Date.now(),
          });
        });

        const reminders = JSON.parse(localStorage.getItem("myday_reminders") || "[]");
        reminders.forEach((r) => {
          legacyNotes.push({
            id: makeId(),
            type_: 1,
            parent_id: NB.reminders,
            title: r.text || "Reminder",
            body: r.note || "",
            is_todo: 1,
            todo_due: Date.now() + 7200000,
            todo_completed: r.done ? Date.now() : 0,
            tag_ids: ["tag-reminder"],
            tag_titles: ["reminder"],
            created_time: r.createdAt || Date.now(),
            updated_time: r.createdAt || Date.now(),
          });
        });
      } catch (_) {}

      if (legacyNotes.length > 0) {
        loadedNotes = legacyNotes;
      }
    }

    const notebooksIn = loadedNotebooks && loadedNotebooks.length > 0 ? loadedNotebooks : getDefaultNotebooks();
    state.notebooks = notebooksIn.map((nb) => ({
      ...nb,
      id: remapLegacyId(nb.id),
      parent_id: remapLegacyId(nb.parent_id),
    }));
    state.notes = (loadedNotes || []).map((note) => ({
      ...note,
      id: remapLegacyId(note.id),
      parent_id: remapLegacyId(note.parent_id),
    }));
    state.tags = (loadedTags || [
      { id: namedId("tag:high"), type_: 5, title: "high" },
      { id: namedId("tag:medium"), type_: 5, title: "medium" },
      { id: namedId("tag:study"), type_: 5, title: "study" },
    ]).map((tag) => ({ ...tag, id: remapLegacyId(tag.id) }));
    state.schedules = loadedSchedules || [];

    if (!state.activeNoteId && state.notes.length > 0) {
      state.activeNoteId = state.notes[0].id;
    }
    if (!state.activeNotebookId && state.notebooks.length > 0) {
      state.activeNotebookId = state.notebooks[0].id;
    }

    saveLocally();
    render();
  }

  function saveLocally() {
    try {
      localStorage.setItem(storageKey("notebooks"), JSON.stringify(state.notebooks));
      localStorage.setItem(storageKey("notes"), JSON.stringify(state.notes));
      localStorage.setItem(storageKey("tags"), JSON.stringify(state.tags));
      localStorage.setItem(storageKey("schedules"), JSON.stringify(state.schedules));
    } catch (_) {}
  }

  // ── Sync to Host / API ───────────────────────────────────────────────────
  async function syncItemToCloud(item, collection = "joplinItems") {
    try {
      const token = await requestToken();
      if (!token) return;
      await fetch("/api/joplin/items", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          collection,
          item,
          clientTimeZone: state.timeZone,
        }),
      });
    } catch (_) {}
  }

  async function syncScheduleToCloud(schedule) {
    try {
      const token = await requestToken();
      if (!token) return;
      await fetch("/api/joplin/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schedule,
          clientTimeZone: state.timeZone,
        }),
      });
      postToHost("schedule-create", { schedule });
    } catch (_) {}
  }

  // ── Canonical Markdown → sanitized rich preview + KaTeX ──────────────────
  // My Day note bodies stay Markdown in local storage and Firestore. Rendering
  // happens once from that canonical representation; HTML is never saved back.
  function parseMarkdown(md) {
    return window.DCMyDayNoteFormatting.renderMyDayMarkdown(String(md || ""));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ── Note Actions ─────────────────────────────────────────────────────────
  function createNewNote(isTodo = false) {
    const parentId = state.activeNotebookId || (state.notebooks[0] ? state.notebooks[0].id : NB.root);
    const newNote = {
      id: makeId(),
      type_: 1,
      parent_id: parentId,
      title: isTodo ? "New To-do" : "New Note",
      body: "",
      is_todo: isTodo ? 1 : 0,
      todo_due: isTodo ? Date.now() + 86400000 : 0,
      todo_completed: 0,
      tag_ids: [],
      tag_titles: [],
      created_time: Date.now(),
      updated_time: Date.now(),
    };
    state.notes.unshift(newNote);
    state.activeNoteId = newNote.id;
    state.mobilePane = "editor";
    state.sidebarOpen = false;
    saveLocally();
    syncItemToCloud(newNote);
    postToHost("analytics", { event: isTodo ? "joplin_todo_create" : "joplin_note_create" });
    render();
  }

  function createNewNotebook(title) {
    if (!title || !title.trim()) return;
    const parentId = state.activeNotebookId || NB.root;
    const nb = {
      id: makeId(),
      type_: 2,
      parent_id: parentId === NB.root ? "" : parentId,
      title: title.trim(),
      created_time: Date.now(),
      updated_time: Date.now(),
    };
    state.notebooks.push(nb);
    state.activeNotebookId = nb.id;
    saveLocally();
    syncItemToCloud(nb);
    render();
  }

  function toggleTodo(noteId, event) {
    if (event) event.stopPropagation();
    const note = state.notes.find((n) => n.id === noteId);
    if (!note) return;
    note.todo_completed = note.todo_completed ? 0 : Date.now();
    note.updated_time = Date.now();
    saveLocally();
    syncItemToCloud(note);
    if (note.todo_completed) {
      postToHost("analytics", { event: "joplin_todo_complete" });
    }
    render();
  }

  function updateActiveNote(patch) {
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    if (!note) return;
    Object.assign(note, patch, { updated_time: Date.now() });
    saveLocally();
    syncItemToCloud(note);
    render();
  }

  function persistEditedNoteBody(note, body) {
    note.body = String(body ?? "");
    note.updated_time = Date.now();
    saveLocally();
    syncItemToCloud(note);
    const preview = document.querySelector(".editor-preview");
    if (preview) preview.innerHTML = parseMarkdown(note.body);
    const snippet = document.querySelector(`.note-card[data-note-id="${note.id}"] .note-snippet`);
    if (snippet) snippet.textContent = note.body.slice(0, 120) || "No additional text";
  }

  function deleteActiveNote() {
    if (!state.activeNoteId) return;
    if (!confirm("Are you sure you want to delete this item?")) return;
    const idx = state.notes.findIndex((n) => n.id === state.activeNoteId);
    if (idx !== -1) {
      state.notes.splice(idx, 1);
      state.activeNoteId = state.notes[0] ? state.notes[0].id : null;
      saveLocally();
      render();
    }
  }

  // ── Scheduling Action ────────────────────────────────────────────────────
  function saveSchedule(dueAtMs, recurrenceFreq, reminderTitle) {
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    const scheduleId = makeId();
    const item = {
      id: scheduleId,
      ownerId: state.uid || "local",
      targetType: note ? (note.is_todo ? "todo" : "note") : "custom",
      targetId: note ? note.id : scheduleId,
      notebookId: note ? note.parent_id : NB.reminders,
      title: reminderTitle || (note ? note.title : "Reminder"),
      body: note ? note.body.slice(0, 200) : "",
      dueAt: dueAtMs,
      timeZone: state.timeZone,
      recurrence: { freq: recurrenceFreq, interval: 1 },
      enabled: true,
      completionHandling: "continue",
      deepLink: `#/my-day?schedule=${scheduleId}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.schedules.push(item);
    if (note && note.is_todo) {
      note.todo_due = dueAtMs;
      syncItemToCloud(note);
    }
    saveLocally();
    syncScheduleToCloud(item);
    closeModal();
    render();
  }

  function closeModal() {
    state.isModalOpen = false;
    state.modalType = null;
    render();
  }

  // ── Filtered Notes List ──────────────────────────────────────────────────
  function getFilteredNotes() {
    let list = [...state.notes];

    // Filter by view / notebook / tag
    if (state.activeView === "todos") {
      list = list.filter((n) => n.is_todo === 1);
    } else if (state.activeView === "schedule") {
      list = list.filter((n) => n.todo_due > 0 || state.schedules.some((s) => s.targetId === n.id));
    } else if (state.activeView === "tags" && state.activeTagId) {
      list = list.filter((n) => n.tag_ids && n.tag_ids.includes(state.activeTagId));
    } else if (state.activeNotebookId) {
      list = list.filter((n) => n.parent_id === state.activeNotebookId);
    }

    // Filter by type pill
    if (state.filter === "notes") {
      list = list.filter((n) => n.is_todo !== 1);
    } else if (state.filter === "todos") {
      list = list.filter((n) => n.is_todo === 1);
    } else if (state.filter === "open") {
      list = list.filter((n) => n.is_todo === 1 && !n.todo_completed);
    } else if (state.filter === "completed") {
      list = list.filter((n) => n.is_todo === 1 && n.todo_completed > 0);
    }

    // Search query
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
    }

    return list.sort((a, b) => (b.updated_time || 0) - (a.updated_time || 0));
  }

  // ── Render Helpers ───────────────────────────────────────────────────────
  function formatDate(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  // ── UI Rendering ─────────────────────────────────────────────────────────
  function render() {
    const root = document.getElementById("app");
    if (!root) return;

    const filteredNotes = getFilteredNotes();
    const activeNote = state.notes.find((n) => n.id === state.activeNoteId) || null;

    // Counts
    const totalTodos = state.notes.filter((n) => n.is_todo === 1).length;
    const pendingTodos = state.notes.filter((n) => n.is_todo === 1 && !n.todo_completed).length;

    const themeIcon = state.theme === "dark" ? "☀️" : "🌙";
    const themeLabel = state.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    const paneTitle = state.activeView === "todos"
      ? "To-dos"
      : state.activeView === "schedule"
        ? "Schedule"
        : state.activeNotebookId
          ? (state.notebooks.find((n) => n.id === state.activeNotebookId) || {}).title || "Notebook"
          : "All notes";

    let html = `
      <div class="workspace-container ${state.sidebarOpen ? "sidebar-open" : ""}" data-pane="${state.mobilePane}" data-theme-active="${state.theme}">
        <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
        <div class="mobile-topbar" data-bar="list">
          <button class="icon-btn" id="btn-open-sidebar" title="Notebooks" aria-label="Open notebooks">☰</button>
          <span class="mobile-title">${escapeHtml(paneTitle)}</span>
          <button class="theme-toggle" id="btn-theme-mobile" title="${themeLabel}" aria-label="${themeLabel}">${themeIcon}</button>
          <button class="icon-btn" id="btn-add-notebook-mobile" title="New Notebook">📁+</button>
        </div>
        <!-- 1. Left Sidebar: Notebooks & Views -->
        <aside class="workspace-sidebar">
          <div class="sidebar-header">
            <span class="sidebar-title">My Day</span>
            <div class="sidebar-actions">
              <button class="theme-toggle" id="btn-theme" title="${themeLabel}" aria-label="${themeLabel}">${themeIcon}</button>
              <button class="icon-btn" id="btn-add-notebook" title="New Notebook">📁+</button>
            </div>
          </div>
          <div class="sidebar-scroll">
            <div class="nav-section">
              <div class="nav-section-title">Views</div>
              <div class="nav-item ${state.activeView === "all" ? "active" : ""}" data-view="all">
                <span>📝 All Items</span>
                <span class="nav-count">${state.notes.length}</span>
              </div>
              <div class="nav-item ${state.activeView === "todos" ? "active" : ""}" data-view="todos">
                <span>✓ To-dos</span>
                <span class="nav-count">${pendingTodos}</span>
              </div>
              <div class="nav-item ${state.activeView === "schedule" ? "active" : ""}" data-view="schedule">
                <span>📅 Schedule</span>
                <span class="nav-count">${state.schedules.length}</span>
              </div>
            </div>

            <div class="nav-section">
              <div class="nav-section-title">
                <span>Notebooks</span>
                <span class="cursor-pointer" id="btn-quick-nb">+</span>
              </div>
              ${state.notebooks
                .map(
                  (nb) => `
                <div class="nav-item ${nb.parent_id ? "tree-folder" : ""} ${state.activeNotebookId === nb.id && state.activeView === "notebook" ? "active" : ""}" data-notebook-id="${nb.id}">
                  <span>📂 ${escapeHtml(nb.title)}</span>
                  <span class="nav-count">${state.notes.filter((n) => n.parent_id === nb.id).length}</span>
                </div>
              `
                )
                .join("")}
            </div>

            <div class="nav-section">
              <div class="nav-section-title">Tags</div>
              ${state.tags
                .map(
                  (tag) => `
                <div class="nav-item ${state.activeTagId === tag.id && state.activeView === "tags" ? "active" : ""}" data-tag-id="${tag.id}">
                  <span>🏷️ ${escapeHtml(tag.title)}</span>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        </aside>

        <!-- 2. Middle Pane: Note List -->
        <section class="workspace-list">
          <div class="list-header">
            <div class="search-box">
              <span>🔍</span>
              <input type="text" id="search-input" placeholder="Search notes and to-dos…" value="${escapeHtml(state.searchQuery)}" />
            </div>
            <div class="list-quick-bar">
              <div class="filter-chips">
                <button class="chip-btn ${state.filter === "all" ? "active" : ""}" data-filter="all">All</button>
                <button class="chip-btn ${state.filter === "notes" ? "active" : ""}" data-filter="notes">Notes</button>
                <button class="chip-btn ${state.filter === "todos" ? "active" : ""}" data-filter="todos">To-dos</button>
              </div>
              <div style="display: flex; gap: 4px;">
                <button class="btn-primary" id="btn-new-note">+ Note</button>
                <button class="btn-primary" id="btn-new-todo" style="background: #0f9d58;">+ To-do</button>
              </div>
            </div>
          </div>

          <div class="notes-scroll">
            ${
              filteredNotes.length === 0
                ? `<div class="empty-state">
                    <p style="font-size: 24px;">📭</p>
                    <p style="font-size: 13px; font-weight: 500;">No items in this view</p>
                    <p style="font-size: 11px;">Create a new note or to-do to start</p>
                   </div>`
                : filteredNotes
                    .map(
                      (note) => `
                <div class="note-card ${note.id === state.activeNoteId ? "active" : ""}" data-note-id="${note.id}">
                  <div class="note-card-header">
                    ${
                      note.is_todo
                        ? `<input type="checkbox" class="todo-checkbox" ${note.todo_completed ? "checked" : ""} data-toggle-id="${note.id}" />`
                        : `<span style="font-size: 13px; color: var(--jp-subtext);">📄</span>`
                    }
                    <div class="note-title ${note.todo_completed ? "completed" : ""}">${escapeHtml(note.title || "Untitled")}</div>
                  </div>
                  <div class="note-snippet">${escapeHtml(note.body.slice(0, 120) || "No additional text")}</div>
                  <div class="note-meta-row">
                    <span>${formatDate(note.updated_time)}</span>
                    ${note.todo_due ? `<span class="due-badge">Due ${formatDate(note.todo_due)}</span>` : ""}
                    ${(note.tag_titles || []).map((t) => `<span class="tag-badge">#${escapeHtml(t)}</span>`).join("")}
                  </div>
                </div>
              `
                    )
                    .join("")
            }
          </div>
        </section>

        <!-- 3. Right Pane: Note Editor & Viewer -->
        <main class="workspace-editor">
          ${
            activeNote
              ? `
            <div class="editor-toolbar" role="toolbar" aria-label="Note formatting">
              <div class="toolbar-group editor-format-tools" role="group" tabindex="0" aria-label="Formatting tools; scroll horizontally on small screens">
                <button class="toolbar-btn editor-back" id="btn-editor-back" aria-label="Back to notes">← Back</button>
                <button type="button" class="toolbar-btn" data-action="bold" aria-label="Bold" title="Bold"><strong>B</strong></button>
                <button type="button" class="toolbar-btn" data-action="italic" aria-label="Italic" title="Italic"><i>I</i></button>
                <button type="button" class="toolbar-btn" data-action="bold-italic" aria-label="Bold and italic" title="Bold and italic"><strong><i>B/I</i></strong></button>
                <button type="button" class="toolbar-btn" data-action="strike" aria-label="Strikethrough" title="Strikethrough"><s>S</s></button>
                <button type="button" class="toolbar-btn" data-action="heading" data-heading-level="1" aria-label="Heading 1" title="Heading 1">H1</button>
                <button type="button" class="toolbar-btn" data-action="heading" data-heading-level="2" aria-label="Heading 2" title="Heading 2">H2</button>
                <button type="button" class="toolbar-btn" data-action="heading" data-heading-level="3" aria-label="Heading 3" title="Heading 3">H3</button>
                <button type="button" class="toolbar-btn" data-action="heading" data-heading-level="4" aria-label="Heading 4" title="Heading 4">H4</button>
                <button type="button" class="toolbar-btn" data-action="bullet" aria-label="Bullet list" title="Bullet list">• List</button>
                <button type="button" class="toolbar-btn" data-action="numbered" aria-label="Numbered list" title="Numbered list">1. List</button>
                <button type="button" class="toolbar-btn" data-action="checklist" aria-label="Checklist" title="Checklist">☐ Task</button>
                <button type="button" class="toolbar-btn" data-action="check-complete" aria-label="Toggle completed checklist item" title="Toggle checklist completion">☑ Done</button>
                <button type="button" class="toolbar-btn" data-action="quote" aria-label="Blockquote" title="Blockquote">❝ Quote</button>
                <button type="button" class="toolbar-btn" data-action="inline-code" aria-label="Inline code" title="Inline code">&#96; Code</button>
                <button type="button" class="toolbar-btn" data-action="code-block" aria-label="Code block" title="Fenced code block">&lt;&gt;</button>
                <button type="button" class="toolbar-btn" data-action="link" aria-label="Insert link" title="Text link">🔗 Link</button>
                <button type="button" class="toolbar-btn" data-action="table" aria-label="Insert table" title="Insert table">▦ Table</button>
                <button type="button" class="toolbar-btn" data-action="inline-math" aria-label="Inline formula" title="Inline formula">ƒx</button>
                <button type="button" class="toolbar-btn" data-action="block-math" aria-label="Display formula" title="Display formula">∑</button>
                <button type="button" class="toolbar-btn" data-action="horizontal-rule" aria-label="Horizontal rule" title="Horizontal rule">―</button>
              </div>
              <div class="toolbar-group editor-toolbar-actions">
                <button class="toolbar-btn" id="btn-schedule-modal" style="color: var(--jp-primary);">⏰ Remind</button>
                <button class="toolbar-btn ${state.previewMode === "preview" ? "active" : ""}" id="btn-toggle-preview" aria-pressed="${state.previewMode === "preview"}">${state.previewMode === "preview" ? "Edit" : "Preview"}</button>
                <button class="toolbar-btn ${state.previewMode === "split" ? "active" : ""}" id="btn-toggle-split" aria-pressed="${state.previewMode === "split"}">${state.previewMode === "split" ? "Editor only" : "Split"}</button>
                <button class="toolbar-btn" id="btn-delete-note" aria-label="Delete note" style="color: var(--jp-danger);">🗑️</button>
              </div>
            </div>

            <div class="editor-body">
              <input type="text" class="editor-title-input" id="editor-title" value="${escapeHtml(activeNote.title)}" placeholder="Note Title" />

              <div class="editor-meta-bar">
                <span>Notebook:</span>
                <select id="editor-notebook-select">
                  ${state.notebooks
                    .map((nb) => `<option value="${nb.id}" ${nb.id === activeNote.parent_id ? "selected" : ""}>${escapeHtml(nb.title)}</option>`)
                    .join("")}
                </select>
                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                  <input type="checkbox" id="editor-is-todo" ${activeNote.is_todo ? "checked" : ""} />
                  <span>Is To-do</span>
                </label>
                ${
                  activeNote.todo_due
                    ? `<span class="due-badge">Due: ${new Date(activeNote.todo_due).toLocaleString()}</span>`
                    : ""
                }
              </div>

              <div class="editor-textarea-container editor-view-${state.previewMode}" data-preview-mode="${state.previewMode}">
                <textarea class="editor-textarea" id="editor-body-input" aria-label="Markdown note body" placeholder="Type notes here in Markdown...">${escapeHtml(activeNote.body)}</textarea>
                ${
                  state.previewMode !== "editor"
                    ? `<div class="editor-preview" aria-label="Rendered note preview">${parseMarkdown(activeNote.body)}</div>`
                    : ""
                }
              </div>
            </div>
          `
              : `
            <div class="empty-state">
              <p style="font-size: 32px;">📝</p>
              <h2 style="font-size: 16px; font-weight: 600;">Select or create a note</h2>
              <p style="font-size: 13px;">Manage your daily studies, revision schedules and notebooks.</p>
              <button class="btn-primary" id="btn-empty-create" style="margin-top: 8px;">+ Create Note</button>
            </div>
          `
          }
        </main>
      </div>

      <!-- Schedule Modal -->
      ${
        state.isModalOpen && state.modalType === "schedule"
          ? `
        <div class="modal-overlay" id="modal-overlay">
          <div class="modal-dialog">
            <h2 class="modal-title">⏰ Schedule Reminder</h2>
            <div class="form-group">
              <label>Reminder Title</label>
              <input type="text" id="schedule-title" value="${escapeHtml(activeNote ? activeNote.title : "Study Reminder")}" />
            </div>
            <div class="form-group">
              <label>Date & Time</label>
              <input type="datetime-local" id="schedule-datetime" value="${new Date(Date.now() + 3600000).toISOString().slice(0, 16)}" />
            </div>
            <div class="form-group">
              <label>Repeat / Recurrence</label>
              <select id="schedule-freq">
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div class="modal-buttons">
              <button class="btn-secondary" id="btn-modal-cancel">Cancel</button>
              <button class="btn-primary" id="btn-modal-save-schedule">Save Schedule</button>
            </div>
          </div>
        </div>
      `
          : ""
      }
    `;

    root.innerHTML = html;
    bindEvents();
  }

  // ── Event Handlers ───────────────────────────────────────────────────────
  function bindEvents() {
    const themeBtn = document.getElementById("btn-theme");
    const themeBtnMobile = document.getElementById("btn-theme-mobile");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
    if (themeBtnMobile) themeBtnMobile.addEventListener("click", toggleTheme);

    const openSidebar = document.getElementById("btn-open-sidebar");
    if (openSidebar) {
      openSidebar.addEventListener("click", () => {
        state.sidebarOpen = true;
        render();
      });
    }
    const backdrop = document.getElementById("sidebar-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", () => {
        state.sidebarOpen = false;
        render();
      });
    }
    const editorBack = document.getElementById("btn-editor-back");
    if (editorBack) {
      editorBack.addEventListener("click", () => {
        state.mobilePane = "list";
        render();
      });
    }

    // Nav Views
    document.querySelectorAll(".nav-item[data-view]").forEach((el) => {
      el.addEventListener("click", () => {
        state.activeView = el.getAttribute("data-view");
        state.activeNotebookId = null;
        state.activeTagId = null;
        state.sidebarOpen = false;
        state.mobilePane = "list";
        render();
      });
    });

    // Nav Notebooks
    document.querySelectorAll(".nav-item[data-notebook-id]").forEach((el) => {
      el.addEventListener("click", () => {
        state.activeNotebookId = el.getAttribute("data-notebook-id");
        state.activeView = "notebook";
        state.activeTagId = null;
        state.sidebarOpen = false;
        state.mobilePane = "list";
        render();
      });
    });

    // Nav Tags
    document.querySelectorAll(".nav-item[data-tag-id]").forEach((el) => {
      el.addEventListener("click", () => {
        state.activeTagId = el.getAttribute("data-tag-id");
        state.activeView = "tags";
        state.activeNotebookId = null;
        state.sidebarOpen = false;
        state.mobilePane = "list";
        render();
      });
    });

    // Add Notebook
    const addNotebook = () => {
      const title = prompt("Enter notebook name:");
      if (title) createNewNotebook(title);
    };
    ["btn-add-notebook", "btn-quick-nb", "btn-add-notebook-mobile"].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener("click", addNotebook);
    });

    // Filter Chips
    document.querySelectorAll(".chip-btn[data-filter]").forEach((el) => {
      el.addEventListener("click", () => {
        state.filter = el.getAttribute("data-filter");
        render();
      });
    });

    // Search Input
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value;
        const notesScroll = document.querySelector(".notes-scroll");
        if (notesScroll) {
          // Update middle pane without full DOM reset to maintain cursor
          const filtered = getFilteredNotes();
          notesScroll.innerHTML = filtered
            .map(
              (note) => `
            <div class="note-card ${note.id === state.activeNoteId ? "active" : ""}" data-note-id="${note.id}">
              <div class="note-card-header">
                ${
                  note.is_todo
                    ? `<input type="checkbox" class="todo-checkbox" ${note.todo_completed ? "checked" : ""} data-toggle-id="${note.id}" />`
                    : `<span style="font-size: 13px; color: var(--jp-subtext);">📄</span>`
                }
                <div class="note-title ${note.todo_completed ? "completed" : ""}">${escapeHtml(note.title || "Untitled")}</div>
              </div>
              <div class="note-snippet">${escapeHtml(note.body.slice(0, 120) || "No additional text")}</div>
              <div class="note-meta-row">
                <span>${formatDate(note.updated_time)}</span>
                ${note.todo_due ? `<span class="due-badge">Due ${formatDate(note.todo_due)}</span>` : ""}
              </div>
            </div>
          `
            )
            .join("");
          bindNoteCardEvents();
        }
      });
    }

    // Note Selection & Todo Toggle
    bindNoteCardEvents();

    // Create Note / Todo Buttons
    const newNoteBtn = document.getElementById("btn-new-note") || document.getElementById("btn-empty-create");
    if (newNoteBtn) newNoteBtn.addEventListener("click", () => createNewNote(false));

    const newTodoBtn = document.getElementById("btn-new-todo");
    if (newTodoBtn) newTodoBtn.addEventListener("click", () => createNewNote(true));

    // Editor Title Input
    const editorTitle = document.getElementById("editor-title");
    if (editorTitle) {
      editorTitle.addEventListener("input", (e) => {
        const note = state.notes.find((n) => n.id === state.activeNoteId);
        if (note) {
          note.title = e.target.value;
          note.updated_time = Date.now();
          saveLocally();
          syncItemToCloud(note);
          // Update in note card list
          const cardTitle = document.querySelector(`.note-card[data-note-id="${note.id}"] .note-title`);
          if (cardTitle) cardTitle.textContent = note.title || "Untitled";
        }
      });
    }

    // Editor Notebook Selector
    const editorNbSelect = document.getElementById("editor-notebook-select");
    if (editorNbSelect) {
      editorNbSelect.addEventListener("change", (e) => {
        updateActiveNote({ parent_id: e.target.value });
      });
    }

    // Editor Is-Todo Toggle
    const editorIsTodo = document.getElementById("editor-is-todo");
    if (editorIsTodo) {
      editorIsTodo.addEventListener("change", (e) => {
        updateActiveNote({ is_todo: e.target.checked ? 1 : 0 });
      });
    }

    // Editor Body: Markdown is the persisted form; preview HTML is transient.
    const editorBody = document.getElementById("editor-body-input");
    if (editorBody) {
      editorBody.addEventListener("input", (event) => {
        const note = state.notes.find((item) => item.id === state.activeNoteId);
        if (note) persistEditedNoteBody(note, event.target.value);
      });
      editorBody.addEventListener("paste", (event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return;
        const html = clipboard.getData("text/html");
        const plain = clipboard.getData("text/plain");
        let pasted = "";
        if (html) pasted = window.DCMyDayNoteFormatting.richHtmlToMyDayMarkdown(html);
        if (!pasted) pasted = window.DCMyDayNoteFormatting.normalizeMyDayPlainTextPaste(plain);
        if (!pasted && !html && !plain) return;
        event.preventDefault();
        const start = editorBody.selectionStart;
        const end = editorBody.selectionEnd;
        const before = editorBody.value.slice(0, start);
        const after = editorBody.value.slice(end);
        const isBlockHtml = Boolean(html && /<(?:p|div|h[1-6]|ul|ol|blockquote|pre|table|hr)\b/i.test(html));
        if (isBlockHtml && pasted) {
          const leading = before && !/\n\n$/.test(before) ? before.endsWith("\n") ? "\n" : "\n\n" : "";
          const trailing = after && !/^\n\n/.test(after) ? after.startsWith("\n") ? "\n" : "\n\n" : "";
          pasted = `${leading}${pasted}${trailing}`;
        }
        editorBody.setRangeText(pasted, start, end, "end");
        const note = state.notes.find((item) => item.id === state.activeNoteId);
        if (note) persistEditedNoteBody(note, editorBody.value);
      });
    }

    // Toolbar Formatting Buttons — selections remain editable Markdown.
    document.querySelectorAll(".toolbar-btn[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        const headingLevel = Number(btn.getAttribute("data-heading-level") || 1);
        applyFormatting(action, { headingLevel });
      });
    });

    // Toggle rendered preview (including on phones and tablets).
    const previewBtn = document.getElementById("btn-toggle-preview");
    if (previewBtn) {
      previewBtn.addEventListener("click", () => {
        state.previewMode = state.previewMode === "preview" ? "editor" : "preview";
        render();
      });
    }

    // Toggle source/preview split view.
    const splitBtn = document.getElementById("btn-toggle-split");
    if (splitBtn) {
      splitBtn.addEventListener("click", () => {
        state.previewMode = state.previewMode === "split" ? "editor" : "split";
        render();
      });
    }

    // Delete Note
    const deleteBtn = document.getElementById("btn-delete-note");
    if (deleteBtn) deleteBtn.addEventListener("click", deleteActiveNote);

    // Schedule Modal Open
    const scheduleModalBtn = document.getElementById("btn-schedule-modal");
    if (scheduleModalBtn) {
      scheduleModalBtn.addEventListener("click", () => {
        state.isModalOpen = true;
        state.modalType = "schedule";
        render();
      });
    }

    // Modal Cancel
    const modalCancelBtn = document.getElementById("btn-modal-cancel");
    if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeModal);

    // Modal Save Schedule
    const modalSaveBtn = document.getElementById("btn-modal-save-schedule");
    if (modalSaveBtn) {
      modalSaveBtn.addEventListener("click", () => {
        const title = document.getElementById("schedule-title")?.value || "Reminder";
        const dtVal = document.getElementById("schedule-datetime")?.value;
        const freqVal = document.getElementById("schedule-freq")?.value || "once";
        const dueAt = dtVal ? new Date(dtVal).getTime() : Date.now() + 3600000;
        saveSchedule(dueAt, freqVal, title);
      });
    }
  }

  function bindNoteCardEvents() {
    document.querySelectorAll(".note-card[data-note-id]").forEach((card) => {
      card.addEventListener("click", () => {
        state.activeNoteId = card.getAttribute("data-note-id");
        state.mobilePane = "editor";
        render();
      });
    });

    document.querySelectorAll(".todo-checkbox[data-toggle-id]").forEach((chk) => {
      chk.addEventListener("click", (e) => {
        toggleTodo(chk.getAttribute("data-toggle-id"), e);
      });
    });
  }

  function applyFormatting(action, options = {}) {
    const textarea = document.getElementById("editor-body-input");
    if (!textarea || !action) return;
    const aliases = { h1: "heading", h2: "heading", h3: "heading", h4: "heading", ul: "bullet", todo: "checklist", code: "code-block" };
    const normalizedAction = aliases[action] || action;
    const headingLevel = options.headingLevel || (action === "h2" ? 2 : action === "h3" ? 3 : action === "h4" ? 4 : 1);
    const formatOptions = { ...options, headingLevel };
    if (normalizedAction === "link") {
      const linkUrl = window.prompt("Enter a safe link address (https, http, mailto or tel):", "https://");
      if (linkUrl === null) return;
      formatOptions.linkUrl = linkUrl;
    }
    const formatted = window.DCMyDayNoteFormatting.formatMyDayMarkdown(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
      normalizedAction,
      formatOptions,
    );
    if (formatted.value === textarea.value) return;
    textarea.value = formatted.value;
    textarea.focus();
    textarea.setSelectionRange(formatted.selectionStart, formatted.selectionEnd);

    const note = state.notes.find((item) => item.id === state.activeNoteId);
    if (note) persistEditedNoteBody(note, textarea.value);
  }

  // Initial Boot
  state.theme = readStoredTheme();
  applyTheme();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadData);
  } else {
    loadData();
  }
  window.addEventListener("resize", () => {
    if (!isPhone() && state.sidebarOpen) {
      state.sidebarOpen = false;
      render();
    }
  });
})();
