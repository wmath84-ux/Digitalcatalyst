// api/_lib/emailTemplate.ts
//
// Branded HTML email used for the owner's replies to Sticker Wall queries.
//
// Design notes (email clients are not browsers):
//   · TABLE layout only — flexbox/grid are unreliable in Outlook/Gmail.
//   · Every style is INLINE; <style> blocks get stripped by Gmail's app.
//   · Max width 600px, the safe standard across desktop + mobile clients.
//   · A dark gradient header (rendered as a solid fallback colour for
//     Outlook, which ignores CSS gradients), a light readable body, the
//     question shown as a quoted card and the reply as the main message.
//   · Mobile: a media query shrinks the padding on phones — supported by
//     iOS Mail / Gmail app; clients that ignore it still get a fluid 100%
//     table, so nothing breaks.
//   · Sent as multipart/alternative so text-only clients still read fine.

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Preserve the writer's paragraphs / line breaks inside the HTML body. */
const toHtmlParagraphs = (value: string) =>
  escapeHtml(value)
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#1f2430;">${block.replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

export type ReplyEmailInput = {
  /** Recipient's display name. */
  name: string;
  /** The original question they asked. */
  question: string;
  /** The owner's answer. */
  reply: string;
  /** Brand name shown in the header and footer. */
  appName: string;
  /** Optional logo URL (must be a public https URL to render in email). */
  logoUrl?: string | null;
  /** Deep link back into the app's queries page. */
  actionUrl?: string;
  /** Optional support address shown in the footer. */
  supportEmail?: string;
};

export function buildReplyEmail(input: ReplyEmailInput): { subject: string; html: string; text: string } {
  const { name, question, reply, appName, logoUrl, actionUrl, supportEmail } = input;

  const subject = `Re: your query — ${appName}`;

  // Preheader: the grey preview line clients show next to the subject.
  const preheader = escapeHtml(reply.replace(/\s+/g, " ").slice(0, 110));

  const brandMark = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="44" height="44" alt="${escapeHtml(appName)}" style="display:block;border:0;border-radius:12px;" />`
    : `<div style="width:44px;height:44px;border-radius:12px;background:#6D28D9;color:#ffffff;font:700 20px/44px Helvetica,Arial,sans-serif;text-align:center;">${escapeHtml(appName.slice(0, 1).toUpperCase())}</div>`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(subject)}</title>
<style type="text/css">
  @media only screen and (max-width:620px) {
    .dc-shell { width:100% !important; }
    .dc-pad { padding-left:22px !important; padding-right:22px !important; }
    .dc-head-pad { padding:26px 22px !important; }
    .dc-title { font-size:21px !important; }
    .dc-btn { display:block !important; width:100% !important; box-sizing:border-box !important; }
  }
  a { color:#6D28D9; }
</style>
</head>
<body style="margin:0;padding:0;background:#eef0f6;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef0f6;">
  <tr>
    <td align="center" style="padding:28px 12px;">

      <table role="presentation" class="dc-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(23,25,42,0.10);">

        <!-- Header -->
        <tr>
          <td class="dc-head-pad" style="padding:30px 34px;background:#4C1D95;background-image:linear-gradient(135deg,#6D28D9 0%,#4C1D95 55%,#312E81 100%);">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="44" valign="middle" style="width:44px;">${brandMark}</td>
                <td valign="middle" style="padding-left:14px;">
                  <div style="font:700 17px/1.2 Helvetica,Arial,sans-serif;color:#ffffff;letter-spacing:-0.2px;">${escapeHtml(appName)}</div>
                  <div style="font:600 11px/1.4 Helvetica,Arial,sans-serif;color:rgba(255,255,255,0.72);letter-spacing:1.1px;text-transform:uppercase;margin-top:3px;">Reply to your query</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td class="dc-pad" style="padding:32px 34px 0;">
            <h1 class="dc-title" style="margin:0 0 6px;font:700 24px/1.3 Helvetica,Arial,sans-serif;color:#12141d;letter-spacing:-0.4px;">Hi ${escapeHtml(name)},</h1>
            <p style="margin:0 0 22px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#6b7186;">Thanks for reaching out. Here's our answer to your question.</p>
          </td>
        </tr>

        <!-- The original question, quoted -->
        <tr>
          <td class="dc-pad" style="padding:0 34px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f5ff;border-left:4px solid #C4B5FD;border-radius:0 12px 12px 0;">
              <tr>
                <td style="padding:14px 18px;">
                  <div style="font:700 10px/1 Helvetica,Arial,sans-serif;color:#7C6BC4;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:7px;">You asked</div>
                  <div style="font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#4a4f63;">${escapeHtml(question).replace(/\n/g, "<br />")}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- The reply -->
        <tr>
          <td class="dc-pad" style="padding:26px 34px 4px;font-family:Helvetica,Arial,sans-serif;">
            <div style="font:700 10px/1 Helvetica,Arial,sans-serif;color:#16A34A;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:12px;">Our reply</div>
            ${toHtmlParagraphs(reply)}
          </td>
        </tr>

        ${
          actionUrl
            ? `<!-- CTA -->
        <tr>
          <td class="dc-pad" style="padding:14px 34px 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="border-radius:999px;background:#6D28D9;">
                  <a class="dc-btn" href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 30px;font:700 14px/1 Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:999px;">Open the conversation</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
            : ""
        }

        <!-- Divider -->
        <tr>
          <td class="dc-pad" style="padding:26px 34px 0;">
            <div style="height:1px;background:#e8eaf1;line-height:1px;font-size:0;">&nbsp;</div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="dc-pad" style="padding:18px 34px 30px;">
            <p style="margin:0 0 4px;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:#98a0b3;">
              You're receiving this because you sent a question through the ${escapeHtml(appName)} feedback wall.
            </p>
            ${
              supportEmail
                ? `<p style="margin:0;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:#98a0b3;">Need more help? Just reply to this email${supportEmail ? ` or write to <a href="mailto:${escapeHtml(supportEmail)}" style="color:#6D28D9;text-decoration:none;">${escapeHtml(supportEmail)}</a>` : ""}.</p>`
                : `<p style="margin:0;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:#98a0b3;">Need more help? Just reply to this email.</p>`
            }
          </td>
        </tr>
      </table>

      <p style="margin:16px 0 0;font:400 11px/1.5 Helvetica,Arial,sans-serif;color:#a3aab9;">© ${new Date().getFullYear()} ${escapeHtml(appName)}</p>

    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    `Hi ${name},`,
    "",
    "Thanks for reaching out. Here's our answer to your question.",
    "",
    "YOU ASKED",
    question,
    "",
    "OUR REPLY",
    reply,
    "",
    actionUrl ? `Open the conversation: ${actionUrl}` : "",
    "",
    `— ${appName}`,
    "You're receiving this because you sent a question through the feedback wall.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { subject, html, text };
}
