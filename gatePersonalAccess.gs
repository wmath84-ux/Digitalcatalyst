/**
 * gatePersonalAccess.gs — Standalone Apps Script Web App (OUTSIDE the main app)
 *
 * Deploy this OUTSIDE Digital Catalyst so the main app never triggers Google
 * OAuth verification. The app's /api/gatePersonalAccess simply POSTs here
 * (GATE_APPS_SCRIPT_URL) and this Script — running as YOU with Drive scope —
 * does the actual files.copy + permission insert + email.
 *
 * Setup:
 * 1) Create a new Apps Script project (script.google.com) → paste this file.
 * 2) Services → enable Drive API (Advanced) + GCP project → enable Drive API.
 * 3) Deploy → Web App → Execute as: Me, Who has access: Anyone (or Anyone with Google account).
 * 4) Copy the Web App URL → set env GATE_APPS_SCRIPT_URL in Vercel to that URL.
 * 5) Optionally set GATE_DRIVE_FOLDER_ID to a folder you own where copies land.
 * 6) Ensure the source master files are shared with the Script owner's account
 *    (or "Anyone with the link → Viewer" so the owner's Drive can read them).
 *
 * The learner's Drive consent screen is NEVER shown — no OAuth client, no
 * verification. The learner only gives ONE email address in the player
 * ("Gate personal access" → email → Submit → Confirm).
 *
 * POST JSON: { email, fileId, fileName?, folderId? }
 * Returns JSON: { ok:true, copyId, webViewLink, shared:true } or { ok:false, error }
 */

function doPost(e) {
  try {
    var body = {};
    try {
      body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : "{}");
    } catch (err) {
      // fallback to form
      body = e.parameter || {};
    }
    var email = String(body.email || "").trim().toLowerCase();
    var fileId = String(body.fileId || body.driveFileId || "").trim();
    var fileName = String(body.fileName || body.name || "").trim().slice(0, 240);
    var folderId = String(body.folderId || body.folder || "").trim();

    if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return json_({ ok: false, error: "Invalid email" }, 400);
    }
    if (!fileId) {
      // try extract from url
      var url = String(body.fileUrl || body.url || "");
      var m = url.match(/drive\\.google\\.com\\/file\\/d\\/([^/?#]+)/i) || url.match(/[?&]id=([^&#]+)/i);
      if (m) fileId = m[1];
    }
    if (!fileId) return json_({ ok: false, error: "Missing fileId" }, 400);

    // Use configured folder or script property
    if (!folderId) {
      try { folderId = String(PropertiesService.getScriptProperties().getProperty("GATE_DRIVE_FOLDER_ID") || "").trim(); } catch (_) {}
    }

    var copyName = fileName ? fileName + " - copy for " + email : null;
    var resource = {};
    if (copyName) resource.name = copyName;
    if (folderId) resource.parents = [folderId];

    // Drive v3 copy — works for Docs/Sheets/Slides and binaries if you own/read them
    var copied = Drive.Files.copy(resource, fileId, { supportsAllDrives: true, fields: "id,name,webViewLink,mimeType" });
    var copyId = String(copied.id || "");
    var webViewLink = String(copied.webViewLink || (copyId ? "https://drive.google.com/file/d/" + copyId + "/view" : ""));

    if (!copyId) return json_({ ok: false, error: "Copy returned no id" }, 500);

    // Share with learner's email (writer) + send email
    try {
      Drive.Permissions.insert({ role: "writer", type: "user", emailAddress: email }, copyId, { sendNotificationEmails: true, supportsAllDrives: true });
    } catch (permErr) {
      // still return copyId — share failed but copy exists
      return json_({ ok: true, copyId: copyId, id: copyId, webViewLink: webViewLink, shared: false, warning: String(permErr).slice(0, 300) });
    }

    // Optional: notify via email as well (in case Drive share email is suppressed)
    try {
      MailApp.sendEmail({
        to: email,
        subject: "Your personal copy is ready — Digital Catalyst",
        htmlBody: '<p>Hi,</p><p>Your personal copy' + (fileName ? ' of <b>' + esc_(fileName) + '</b>' : '') + ' is ready.</p><p><a href="' + esc_(webViewLink) + '">Open your copy in Drive</a></p><p>This copy is yours to edit — the master file stays untouched. Enjoy!</p><p style="color:#999;font-size:12px">If you didn’t request this, ignore this email.</p>'
      });
    } catch (_) {}

    return json_({ ok: true, copyId: copyId, id: copyId, webViewLink: webViewLink, shared: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 500) }, 500);
  }
}

function doGet() {
  return json_({ ok: true, usage: "POST {email,fileId,fileName?,folderId?} to create and share a personal Drive copy" });
}

function json_(obj, status) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script Web App ignores status for JSON, but we try
  return out;
}
function esc_(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
