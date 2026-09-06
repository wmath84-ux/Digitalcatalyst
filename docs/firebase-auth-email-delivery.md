# Password reset emails — why they don't arrive, and how to fix it

This is a **Firebase Console configuration** task, not a code task. The app
already calls `sendPasswordResetEmail` correctly
(`resetPassword()` in `src/context/AuthContext.tsx`).

---

## First: rule out the two false alarms

Before changing any settings, check these — most "no email" reports are one of
them.

### 1. The account doesn't exist

With **Email Enumeration Protection** ON (default for projects created after
Sept 2023), `sendPasswordResetEmail` **succeeds without sending anything** when
no account matches the address. Firebase refuses to confirm or deny that an
email is registered.

This project's Authentication → Users list currently has **one** account:
`wmath84@gmail.com`. A reset requested for any other address is silently a
no-op — working exactly as designed.

The app's success message now says this outright: *"…2–3 मिनट में link न मिले
तो इसका मतलब है कि इस email से कोई account नहीं है — पहले Sign Up करें।"*

### 2. It went to Spam

Check **Spam** and **Promotions**. The sender is
`noreply@my-website-761e9.firebaseapp.com`, which is very often filtered —
see below.

---

## The real fix: send from your own verified domain

Gmail, Outlook and most providers score `*.firebaseapp.com` poorly because the
domain is shared by thousands of projects and its DNS is not under your
control. Moving the sender to `eduvora.shop` is the single change that makes
delivery reliable.

### Step 1 — Check the template is enabled

Firebase Console → **Authentication** → **Templates** → **Password reset**

Confirm the template exists and note the *From* address. While you're there,
set a sensible **From name** (e.g. `Eduvora`) and reply-to.

### Step 2 — Customise the sender domain

On that same Templates screen, click the ✏️ pencil, then **Customize domain**.

Firebase will ask you to add DNS records at your domain registrar (wherever
`eduvora.shop` is managed). Typically:

| Type | Host | Purpose |
| --- | --- | --- |
| `TXT` | `@` | domain ownership verification |
| `TXT` | `@` | SPF — authorises Google to send as your domain |
| `CNAME` | `firebase1._domainkey` | DKIM — cryptographically signs your mail |
| `CNAME` | `firebase2._domainkey` | DKIM (second key) |

Add exactly what the Console shows you — the values are project-specific.
DNS propagation takes anywhere from a few minutes to a few hours; Firebase
shows a **Verify** button that goes green when it can see the records.

Once verified, the sender becomes `noreply@eduvora.shop` and the mail is
SPF+DKIM authenticated. Deliverability improves immediately.

### Step 3 — Authorised domains

Firebase Console → **Authentication** → **Settings** → **Authorized domains**

Every origin the app is served from must be listed, otherwise the reset link's
`continueUrl` is rejected with `auth/unauthorized-continue-uri`:

- `eduvora.shop`
- `localhost`
- your Vercel preview domain (`*.vercel.app`)
- `my-website-761e9.firebaseapp.com` (already there by default)

The code tolerates a missing entry — `resetPassword()` catches that specific
error and retries without the continue URL, so the email still goes out — but
the learner then lands on Firebase's bare page instead of coming back to the
app.

### Step 4 — Test it properly

Use a **real** account. Because of enumeration protection, testing with an
address that has no account tells you nothing.

```
1. Sign up a throwaway account in the app (or Console → Users → Add user)
2. Log out, tap "Forgot password? Reset link भेजें"
3. Check Inbox, then Spam, then Promotions
4. Open the link, set a new password, confirm you land back on #/auth
```

---

## Bonus: fixing the Google-only account

`wmath84@gmail.com` has **only** the Google provider, so it has no password —
that is why a "correct" password was rejected. Two ways to fix it:

- **Easiest:** sign in with *Continue with Google*. Nothing else needed.
- **To add a password too:** tap *Forgot password*, follow the emailed link and
  set one. This attaches a `password` provider to the same account, after which
  **both** sign-in methods work for that user.

The second option is only possible once email delivery above is working — which
is why these two issues are worth fixing together.

---

## Quick reference

| Symptom | Cause | Fix |
| --- | --- | --- |
| No email, no error | No account for that address | Sign up first |
| Email in Spam | Unauthenticated `firebaseapp.com` sender | Custom domain (Step 2) |
| `auth/unauthorized-continue-uri` | Origin not authorised | Add it (Step 3) |
| `auth/invalid-email` | Malformed address | App now blocks this before sending |
| Correct password rejected | Google-only account, no password set | Sign in with Google, or reset to add one |
