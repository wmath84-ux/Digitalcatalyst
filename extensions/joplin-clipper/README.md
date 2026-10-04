# My Day Web Clipper (Chrome / Firefox, Manifest V3)

Clip the page you are reading into your My Day workspace as a note in the
**Web Clippings** notebook.

## Install (developer build)

```bash
node scripts/joplin/build-clipper.mjs          # writes dist/joplin-clipper-chrome.zip and -firefox.zip
```

* **Chrome / Edge / Brave:** `chrome://extensions` → *Developer mode* → *Load
  unpacked* → pick `extensions/joplin-clipper`.
* **Firefox:** `about:debugging#/runtime/this-extension` → *Load Temporary
  Add-on* → pick `extensions/joplin-clipper/manifest.json`. For a permanent
  install, sign the `-firefox.zip` artifact produced by the script above
  (`web-ext sign` or AMO).

## Pair it (one time)

1. In the app: **Profile → Usage & Limits → Web Clipper → Pair a browser**.
2. Type the code (e.g. `K7QM-4RTZ`) into the extension popup, together with
   your workspace address if it is not `https://eduvora.shop`.
3. The popup confirms the account name. That is the whole flow.

## What the extension stores

| Stored | Not stored |
| --- | --- |
| The API origin | Firebase session / refresh token |
| A scoped `clip:write` token (revocable, 90 days) | Password, cookies, ID tokens |
| The account label and token expiry | Page content (it is uploaded, never cached) |

* The pairing code is **single-use** and expires after **10 minutes**; only its
  SHA-256 is stored server-side.
* The token is stored server-side as a SHA-256 hash. Revoking it in the app
  (or pairing a sixth browser) kills it immediately — the extension has no way
  to keep working.
* Clips are validated server-side: http(s) source, ≤ 2 MB payload, ≤ 500-char
  title, ≤ 20 tags, rate-limited by the same daily allowance that governs every
  other creation in the workspace.
* Clipping the same page twice in one day **updates** the note it created
  instead of duplicating it (the id is derived from the owner, the canonical
  URL and the day).

## Permissions, and why

| Permission | Used for |
| --- | --- |
| `activeTab`, `scripting` | Read the page **only when you click Clip** (no background page scraping) |
| `storage` | The token + origin above |
| `contextMenus` | Right-click → *Clip to My Day* |
| `host_permissions` (app origins) | Post the clip to `/api/joplin/clipper` |

There is no content script that runs on page load, no analytics, and no remote
code: everything in this folder is the shipped source.
