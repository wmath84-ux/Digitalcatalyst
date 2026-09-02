# User Queries — email reply setup (SMTP)

Home page ke Sticker Wall pe jo note aata hai wo `#/queries` page pe query ban jata hai.
Owner jab reply karta hai to reply **user ki email pe** jata hai. Reply bhejne ke liye ek
SMTP account chahiye. Neeche 3 free options hain — koi ek chuno.

> **Zaroori:** hamara mail client **implicit TLS** use karta hai, isliye hamesha
> **port 465** wala SSL endpoint dena hai (587/STARTTLS nahi).

---

## Option A — Brevo (recommended, free forever)

- **Free limit:** 300 emails/day (~9,000/month), unlimited contacts, credit card nahi chahiye.
- Transactional SMTP free plan me included hai; emails pe "Sent with Brevo" branding aati hai.

**Steps**
1. https://www.brevo.com pe free account banao.
2. Login → **SMTP & API** → **SMTP** tab.
3. Wahan milega:
   - Server: `smtp-relay.brevo.com`
   - Port: `465` (SSL) — yahi use karna hai
   - Login: tumhari Brevo account email
   - Password: **SMTP key** (Generate a new SMTP key button se banao — ye account password NAHI hai)
4. **Senders** section me apna "from" email add karke verify karo (verification mail aayegi).

**Env values**
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=465
SMTP_USER=tumhari-brevo-login-email@example.com
SMTP_PASS=<Brevo SMTP key>
SMTP_FROM=verified-sender@tumharadomain.com
OWNER_EMAILS=tumhari-owner-email@gmail.com
```

---

## Option B — Gmail (sabse fast, chhote volume ke liye)

- **Free:** Gmail account ke saath, ~500 emails/day.
- 2-Step Verification ON hona zaroori hai, phir **App Password** banana padta hai.

**Steps**
1. Google Account → **Security** → 2-Step Verification ON karo.
2. Security → **App passwords** → app "Mail", device "Other" → 16-character password copy karo.
3. Wahi password `SMTP_PASS` me daalo (Gmail ka normal password kaam nahi karega).

**Env values**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=tumhara-gmail@gmail.com
SMTP_PASS=<16-char app password, bina spaces ke>
SMTP_FROM=tumhara-gmail@gmail.com
OWNER_EMAILS=tumhara-gmail@gmail.com
```

Note: reply hamesha tumhare Gmail se hi jayegi (Gmail `From` override allow nahi karta).

---

## Option C — Resend

- **Free limit:** 3,000 emails/month, **100/day**, 1–3 verified domains.
- Apna domain verify karna padta hai (DNS records), isliye setup thoda lamba hai.

**Env values**
```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<Resend API key (re_...)>
SMTP_FROM=noreply@tumhara-verified-domain.com
OWNER_EMAILS=tumhari-owner-email@gmail.com
```

---

## Environment variables kaise set karein (Vercel)

1. Vercel dashboard → apna project → **Settings** → **Environment Variables**.
2. Har variable ek-ek karke add karo (Key + Value), Environment me **Production**,
   **Preview** aur **Development** teeno tick kar do.
3. Save karne ke baad **Deployments** → latest deployment → **Redeploy**
   (env vars sirf naye deployment me apply hote hain).

### Poori list

| Variable | Zaroori? | Kya hai |
|---|---|---|
| `SMTP_HOST` | Haan | Mail server host (upar option ke hisaab se) |
| `SMTP_PORT` | Nahi (default 465) | Hamesha `465` rakho |
| `SMTP_USER` | Haan | SMTP login |
| `SMTP_PASS` | Haan | SMTP key / app password |
| `SMTP_FROM` | Nahi (default = `SMTP_USER`) | Jis address se mail jayegi (verified hona chahiye) |
| `OWNER_EMAILS` | Haan | Comma-separated owner emails — sirf yahi log saari queries dekh aur reply kar sakte hain |

`OWNER_EMAILS` example (ek se zyada owner):
```
OWNER_EMAILS=owner@gmail.com,partner@gmail.com
```

### Local development (`.env` file)

Repo root me `.env` banao (ye git me commit mat karna):
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
OWNER_EMAILS=...
```

---

## Test kaise karein

1. Deploy ke baad Home page kholo → sabse neeche **Feedback Wall** me ek note bhejo.
2. **Explore user queries** button dabao → query "Awaiting reply" (amber) dikhegi.
3. Owner account se login karke reply likho → **Send reply**.
4. Sab theek hoga to card ke neeche `Emailed to <address>` dikhega aur query
   "Replied" (emerald) ban jayegi.

**Agar email na jaye:** reply phir bhi save hoga, aur card ke neeche exact wajah
likhi aayegi, jaise:
- `SMTP is not configured (...)` → env vars set nahi hue / redeploy nahi kiya.
- `Mail server said: 535 ...` → galat SMTP_USER/SMTP_PASS.
- `Mail server said: 550 ... sender not verified` → `SMTP_FROM` verify karna baaki hai.
- `The mail server timed out.` → port 465 ke bajay kuch aur diya gaya hai.

---

## Kaunsa chunein?

- Sirf shuru karna hai, jaldi chahiye → **Gmail** (5 minute me ho jayega).
- Proper product jaisa, zyada volume, logs/webhooks chahiye → **Brevo**.
- Apna domain hai aur professional `noreply@domain.com` chahiye → **Resend**.


---

## Professional look — kya kya set karna chahiye

Reply ab **branded HTML email** ke roop me jaati hai (`api/_lib/emailTemplate.ts`):
purple gradient header + logo, "You asked" quoted card, "Our reply" body,
CTA button aur footer. Preview: `docs/email-reply-preview.html` (browser me kholo).

Inbox me professional dikhne ke liye ye 3 optional env vars bhi set kar do:

| Variable | Example | Kya karta hai |
|---|---|---|
| `PUBLIC_SITE_ORIGIN` | `https://eduvora.shop` | CTA button ka link + fallback logo URL |
| `SUPPORT_EMAIL` | `support@eduvora.shop` | Footer me dikhta hai aur `Reply-To` banta hai |
| `SMTP_FROM` | `noreply@eduvora.shop` | Sender address (Brevo me verified hona chahiye) |

Sender ka display name apne aap `"<AppName> Support"` ban jata hai, yaani inbox me
`Eduvora Support` dikhega — bare email address nahi.

### Brevo me domain authenticate karo (sabse zaroori step)

Sirf sender verify karne se mail "via brevo.com" / spam me ja sakti hai.
Domain authenticate karne par ye problem khatam ho jaati hai:

1. Brevo → **Senders, Domains & Dedicated IPs** → **Domains** → **Add a domain**.
2. Apna domain daalo (jaise `eduvora.shop`).
3. Brevo 3 DNS records dega — apne domain provider (GoDaddy / Cloudflare / Hostinger) me add karo:
   - **DKIM** (TXT, `mail._domainkey`)
   - **Brevo code** (TXT verification record)
   - **DMARC** (TXT, `_dmarc` → `v=DMARC1; p=none;`)
4. 15–60 minute baad Brevo pe **Verify** dabao — green tick aa jayega.
5. Ab `SMTP_FROM` ko us domain ka address bana do, jaise `noreply@eduvora.shop`.

Iske baad emails Gmail ke Primary inbox me, "via" tag ke bina, tumhare brand naam se aayengi.

### Design kaisa dikhega

- 600px card, mobile pe automatically full-width (media query + fluid table).
- Sab CSS inline hai, table layout hai — Gmail, Outlook, Apple Mail sab me theek render hoga.
- `multipart/alternative`: HTML na chale to plain-text version dikh jayega.
- Preheader text set hai, to inbox list me subject ke baad reply ki pehli line dikhegi.
