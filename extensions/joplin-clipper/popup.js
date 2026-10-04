// extensions/joplin-clipper/popup.js
//
// The popup is a view over the service worker: it never talks to the API itself
// (the worker owns the token and the origin) and it never stores anything.

const $ = (id) => document.getElementById(id);

const setStatus = (message, isError = false) => {
  const node = $("status");
  node.textContent = message;
  node.dataset.error = isError ? "true" : "false";
};

const send = (message) =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response || { ok: false, error: "No response." }));
  });

const show = (paired) => {
  $("pairing").hidden = paired;
  $("clipping").hidden = !paired;
};

const refresh = async () => {
  const response = await send({ type: "status" });
  if (!response.ok) {
    setStatus(response.error || "Could not read the extension state.", true);
    return;
  }
  const { paired, account, apiOrigin } = response.result;
  show(paired);
  $("origin").value = apiOrigin || "";
  $("account").textContent = paired
    ? account
      ? `Connected as ${account}`
      : "Connected"
    : "Not connected";
  if (paired) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    $("page-title").textContent = tab?.title || "the current page";
  }
};

$("pair").addEventListener("click", async () => {
  const code = $("code").value.trim();
  const origin = $("origin").value.trim();
  setStatus("Connecting…");
  $("pair").disabled = true;
  if (origin) await send({ type: "set-origin", origin });
  const response = await send({ type: "pair", code, label: "Browser extension" });
  $("pair").disabled = false;
  if (!response.ok) {
    setStatus(response.error || "Pairing failed.", true);
    return;
  }
  setStatus("Connected. Clip a page to send it to Web Clippings.");
  await refresh();
});

$("clip").addEventListener("click", async () => {
  setStatus("Clipping…");
  $("clip").disabled = true;
  const selectionOnly = $("selection-only").checked;
  const response = await send({ type: "clip-active-tab", selectionOnly });
  $("clip").disabled = false;
  if (!response.ok) {
    setStatus(response.error || "Could not clip this page.", true);
    return;
  }
  setStatus(response.result?.updated ? "Updated today's note for this page." : "Saved to Web Clippings.");
});

$("disconnect").addEventListener("click", async () => {
  await send({ type: "disconnect" });
  setStatus("Disconnected. Generate a new pairing code in My Day to reconnect.");
  await refresh();
});

void refresh();
