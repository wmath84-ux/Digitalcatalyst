// extensions/joplin-clipper/background.js
//
// The service worker: pairing, clipping and token rotation.
//
// What is stored here, and what is deliberately not:
//
//   chrome.storage.local holds the API origin, the SCOPED token, its expiry and
//   a human label. That is all. No Firebase session, no refresh token, no ID
//   token, no cookie, no password — the extension never signs in to Firebase at
//   all. If this storage is copied off the machine the worst it yields is a
//   `clip:write` token that the learner can revoke from the app in one tap.

const STORAGE = {
  apiOrigin: "clipper.apiOrigin",
  token: "clipper.token",
  tokenExpiresAt: "clipper.tokenExpiresAt",
  account: "clipper.account",
  label: "clipper.label",
};

const DEFAULT_API_ORIGIN = "https://eduvora.shop";

const get = (keys) => chrome.storage.local.get(keys);
const set = (values) => chrome.storage.local.set(values);
const remove = (keys) => chrome.storage.local.remove(keys);

const apiOrigin = async () => {
  const stored = await get(STORAGE.apiOrigin);
  return String(stored[STORAGE.apiOrigin] || DEFAULT_API_ORIGIN).replace(/\/+$/, "");
};

/** Every call the extension makes goes through here — one place, one origin. */
async function call(action, body = {}, options = {}) {
  const origin = await apiOrigin();
  const stored = await get([STORAGE.token, STORAGE.tokenExpiresAt]);
  const token = String(stored[STORAGE.token] || "");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-Clipper-Token"] = token;
  const response = await fetch(`${origin}/api/joplin/clipper`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(String(payload.error || `The server refused that request (${response.status}).`));
    error.code = String(payload.code || `http_${response.status}`);
    throw error;
  }
  return payload;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "clip-to-myday",
    title: "Clip to My Day",
    contexts: ["page", "selection"],
  });
});

chrome.commands?.onCommand.addListener((command) => {
  if (command === "clip-page") void clipActiveTab();
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "clip-to-myday" || !tab?.id) return;
  void clipActiveTab(tab.id, Boolean(info.selectionText));
});

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (!message || typeof message !== "object") return false;
  if (message.type === "clip-active-tab") {
    clipActiveTab(message.tabId, message.selectionOnly)
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: error.message, code: error.code }));
    return true;
  }
  if (message.type === "pair") {
    pair(message.code, message.label)
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: error.message, code: error.code }));
    return true;
  }
  if (message.type === "status") {
    status()
      .then((result) => respond({ ok: true, result }))
      .catch((error) => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "disconnect") {
    remove([STORAGE.token, STORAGE.tokenExpiresAt, STORAGE.account]).then(() => respond({ ok: true }));
    return true;
  }
  if (message.type === "set-origin") {
    set({ [STORAGE.apiOrigin]: String(message.origin || "").replace(/\/+$/, "") }).then(() => respond({ ok: true }));
    return true;
  }
  return false;
});

/** Exchange a single-use pairing code for a scoped token. */
async function pair(rawCode, label) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) throw new Error("Enter the pairing code shown in My Day → Usage & Limits → Web Clipper.");
  const payload = await call("joplin.clipper.pair.claim", { code, label: label || "Browser extension" });
  await set({
    [STORAGE.token]: String(payload.token || ""),
    [STORAGE.tokenExpiresAt]: Number(payload.expiresAt) || 0,
    [STORAGE.account]: payload.account?.name || payload.account?.uid || "",
  });
  return { account: payload.account?.name || "", expiresAt: payload.expiresAt };
}

async function status() {
  const stored = await get([STORAGE.token, STORAGE.tokenExpiresAt, STORAGE.account, STORAGE.apiOrigin]);
  return {
    paired: Boolean(stored[STORAGE.token]),
    account: stored[STORAGE.account] || "",
    expiresAt: stored[STORAGE.tokenExpiresAt] || 0,
    apiOrigin: stored[STORAGE.apiOrigin] || DEFAULT_API_ORIGIN,
  };
}

/**
 * Clip: read the page in the tab, then hand it to the workspace.
 *
 * The content script runs in the page's own context (via `chrome.scripting`),
 * so nothing about the page is fetched by the worker itself — no extra network
 * request, no proxy, and the page's own cookies are irrelevant because the
 * extraction happens locally and only the TEXT/HTML is uploaded.
 */
async function clipActiveTab(tabId, selectionOnly = false) {
  const tabs = tabId ? [{ id: tabId }] : await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) throw new Error("No active tab to clip.");
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
  const page = injected?.result;
  if (!page || typeof page !== "object") throw new Error("This page could not be read.");
  const payload = await call("joplin.clipper.clip", {
    clip: {
      url: page.url,
      title: page.title,
      html: selectionOnly ? "" : page.html,
      selection: selectionOnly ? page.selection || page.text : page.selection,
      text: page.text,
      tags: page.tags,
    },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  return { noteId: payload.noteId, updated: payload.updated, deepLink: payload.deepLink };
}
