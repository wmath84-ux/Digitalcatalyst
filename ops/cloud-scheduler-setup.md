# Google Cloud Scheduler — प्राइमरी मिनट पिंगर / Primary minute pinger

Cloud Scheduler अब **प्राइमरी** पिंगर है: यह हर मिनट (सच में, हर 60 सेकंड) push
scheduler endpoint को कॉल करता है। GitHub Actions की दोनों workflows
(`push-scheduler.yml` + `push-scheduler-backup.yml`) **फ्री बैकअप** की तरह चालू
रहती हैं। दोनों एक ही idempotent endpoint को हिट करते हैं, इसलिए overlap से कुछ
भी दोहराव नहीं होता (नीचे "Overlap क्यों harmless है" देखें)।

Cloud Scheduler is now the **primary** pinger: it calls the push scheduler
endpoint every minute — actually every 60 seconds, not "best effort". Both
GitHub workflows (`push-scheduler.yml` + `push-scheduler-backup.yml`) stay
enabled as a **free backup**. Both hit the same idempotent endpoint, so the
overlap cannot duplicate anything (see "Why the overlap is harmless").

| | प्राइमरी / Primary | बैकअप / Backup | बैकअप 2 / Safety net |
| --- | --- | --- | --- |
| कौन / Who | Google Cloud Scheduler job `push-scheduler-minute` | `.github/workflows/push-scheduler.yml` + `push-scheduler-backup.yml` | Vercel daily cron `30 0 * * *` |
| असल cadence | हर मिनट / every minute | 5 घंटे का loop, पर GitHub start events 1–5+ घंटे देर से आते हैं | दिन में एक बार |
| सेटअप | इस गाइड के स्टेप्स / steps below | पहले से चालू / already live | पहले से चालू / already live |
| खर्च / Cost | 3 jobs तक फ्री, फिर $0.10/job/महीना | फ्री (public repo) | फ्री |

**सब कुछ / Everything you need**

| चीज़ / Thing | वैल्यू / Value |
| --- | --- |
| Project ID | `my-website-761e9` (`.firebaserc` और `google-services.json` से) |
| Region | `asia-south1` (Mumbai — भारत के लिए सबसे नज़दीक) |
| Job ID | `push-scheduler-minute` |
| Target URL | `https://eduvora.app/api/cron/subscription-renewals` |
| Method | `GET` |
| Schedule | `* * * * *` (हर मिनट / every minute) |
| Time zone | `UTC` |
| Auth header | `Authorization: Bearer <CRON_SECRET>` |
| Auth token (OIDC) | **कुछ नहीं / NONE** — देखें "OIDC क्यों नहीं" |
| Timeout / attempt deadline | `120s` |
| Retry | max `2` attempts, min backoff `5s`, max backoff `60s`, max doublings `3` |
| Script | `ops/setup-cloud-scheduler.sh` |
| Alert policy | `ops/cloud-scheduler-alert-policy.json` (+ log-based fallback) |

---

## OIDC क्यों नहीं / Why no OIDC token

**हिन्दी:** Cloud Scheduler के HTTP target पर "Add OIDC token" और custom
`Authorization` header एक साथ नहीं चल सकते — एक चुनना पड़ता है। हमारा endpoint
Google service नहीं है; वह Vercel पर है और shared secret (`CRON_SECRET`) से
verify करता है (`api/cron/subscription-renewals.ts` में
`bearer(req) !== \`Bearer ${secret}\`` → 401)। इसलिए हम **OIDC बंद** रखते हैं और
`Authorization: Bearer <CRON_SECRET>` header भेजते हैं।

**English:** an OIDC token and a custom `Authorization` header are mutually
exclusive on a Cloud Scheduler HTTP target — you pick one. The endpoint is not a
Google service; it lives on Vercel and authenticates with the shared
`CRON_SECRET`. So the job sends **no OIDC token** and sets the `Authorization:
Bearer <CRON_SECRET>` header instead. If you ever switch the endpoint to require
OIDC, drop the header in the same step, not alongside it.

---

## Step 1 — Project को Blaze (billing) पर ले जाएँ / Upgrade the project to Blaze

**हिन्दी:** Cloud Scheduler चलाने के लिए project `my-website-761e9` पर billing
account जुड़ा होना ज़रूरी है (Spark/free plan पर API enable ही नहीं होगी)। डरने
की बात नहीं — यह एक job फ्री tier में है, और नीचे step 2 में ₹100 का budget alert
लगा रहे हैं, तो गलती से भी बड़ा bill नहीं आएगा।

1. https://console.cloud.google.com/billing खोलें और **ऊपर दाएँ project picker**
   से `my-website-761e9` चुनें।
2. **Billing** → **Manage billing** / **Link a billing account** →
   **Create billing account** (या मौजूदा account चुनें)।
3. Country **India**, account type **Individual** (या Business), currency
   **INR (₹)**, address + GSTIN (optional) भरें।
4. Payment method (card/UPI) डालें → **Submit and enable billing**।
5. वापस project पर आकर **Billing → Account management** में देखें कि billing
   account *linked* दिख रहा है।

**English:** Cloud Scheduler requires a billing account on
`my-website-761e9` — on the free Spark tier `gcloud services enable` fails with a
billing-related `FAILED_PRECONDITION` error. Link a billing
account (country India, currency INR, card/UPI) at
https://console.cloud.google.com/billing. The job itself stays inside the free
tier (see cost below), and step 2 caps the surprise with a ₹100 budget alert.

**खर्च / Cost:** 3 Cloud Scheduler jobs per billing account are **free**, then
**$0.10 per job/month**. This guide creates **one** job → ₹0. HTTP-target
invocations of the external Vercel URL are not billed by Cloud Scheduler.

---

## Step 2 — ₹100 का budget alert (email thresholds) / Budget alert

**हिन्दी:** यह safety net है। Budget alert कोई चीज़ बंद नहीं करता — वह सिर्फ़ email
भेजता है, ताकि उम्मीद से ज़्यादा खर्च दिखते ही पता चल जाए।

**English:** a budget alert never turns anything off; it only emails you. Set it
once and forget it.

1. https://console.cloud.google.com/billing → **Budgets & alerts** →
   **Create budget**.
2. **Scope:** Billing account = आपका account; **Projects** → *Add* →
   `my-website-761e9` (सिर्फ़ यही project, पूरा account नहीं)।
3. **Name:** `Eduvora push scheduler — Cloud Scheduler`. **Target amount:**
   `100` और currency **INR (₹)** (billing account INR में है तो currency अपने
   आप INR आएगी)। *Next*.
4. **Actions — trigger on `Actual` spend** (predicted नहीं, क्योंकि spend बहुत
   छोटा है) और तीन thresholds जोड़ें:

   | Trigger on | Threshold type | Amount | Action |
   | --- | --- | --- | --- |
   | Actual | Percentage | `50%` | Email alerts to billing admins and users |
   | Actual | Percentage | `90%` | Email alerts to billing admins and users |
   | Actual | Percentage | `100%` | Email alerts to billing admins and users |

5. **Email alerts to:** ✅ *Billing admins and users* ON रखें, और **Add email
   alerts** में अपना address डालें (Google account वाला address पहले से जुड़ा
   होता है — वही काफी है)।
6. (Optional) *Connect a Pub/Sub topic* खाली छोड़ दें — सिर्फ़ email चाहिए।
7. **Finish**.

> Note / ध्यान दें: threshold **percentage** इसलिए, क्योंकि ₹100 का absolute
> threshold ₹50/₹90 warning के बजाय सिर्फ़ एक ही email देता। Percentage
> thresholds 50/90/100 पर अलग-अलग email भेजते हैं।

---

## Step 3 — Cloud Shell खोलें / Open Cloud Shell

**हिन्दी:** Cloud Shell एक browser terminal है जिसमें `gcloud` पहले से installed
और आपके Google account से logged-in होता है — कुछ install नहीं करना पड़ता।

1. https://console.cloud.google.com खोलें (project `my-website-761e9` चुनें)।
2. ऊपर दाएँ कोने में **terminal icon** (`>_ Activate Cloud Shell`) क्लिक करें।
3. नीचे terminal खुलेगा। Check करें:

   ```bash
   gcloud config set project my-website-761e9
   gcloud auth list          # आपका email ACTIVE दिखना चाहिए
   ```

**English:** Cloud Shell is a browser terminal with `gcloud` preinstalled and
already authenticated as you. Click the `>_` icon at the top right of the
console, then `gcloud config set project my-website-761e9`.

---

## Step 4 — Script चलाएँ / Run the script

**हिन्दी:** पहले `CRON_SECRET` export करें (यह Vercel का वही value है), फिर script
चलाएँ। Secret कभी commit न करें और न ही किसी को भेजें।

### 4a. Secret निकालें / Get the secret

Vercel → आपका project → **Settings** → **Environment Variables** →
`CRON_SECRET` की value copy करें। (अगर नहीं दिख रही, **Add** करके वही value
दोबारा डालें — यह value GitHub Actions secret और इस Cloud Scheduler job, तीनों
जगह एक जैसी होनी चाहिए।)

### 4b. Cloud Shell में repo लाएँ / Get the repo into Cloud Shell

```bash
git clone https://github.com/wmath84-ux/Digitalcatalyst.git
cd Digitalcatalyst
```

### 4c. Dry run (कुछ नहीं बदलेगा) / Dry run first

```bash
export CRON_SECRET='यहाँ_Vercel_वाला_secret_paste_करें'
bash ops/setup-cloud-scheduler.sh --dry-run
```

**हिन्दी:** यह सिर्फ़ दिखाता है कि क्या बनेगा; कोई Google Cloud resource नहीं
बनता। Secret `<CRON_SECRET>` की जगह masked दिखेगा।

### 4d. असली run / The real thing

```bash
bash ops/setup-cloud-scheduler.sh
```

Script खुद यह करता है:
1. `cloudscheduler.googleapis.com` API enable करता है;
2. job `push-scheduler-minute` बनाता है — और अगर वह पहले से है तो उसी को
   **update** कर देता है (इसलिए दोबारा चलाना safe है);
3. `gcloud scheduler jobs describe` से job दिखाता है (Authorization header की
   value `[REDACTED]` दिखेगी — यह जानबूझकर है);
4. अगर कोई job को pause कर दिया हो तो उसे resume करता है;
5. आखिर में manual verification steps print करता है।

**अगर terminal बंद हो जाए / if you lose the shell:** बस दोबारा `export
CRON_SECRET=...` करें और script फिर चला दें।

**English:** export `CRON_SECRET` (the same value as the Vercel env var), run
`--dry-run` to preview, then run the script. It is idempotent: create → falls
back to `gcloud scheduler jobs update http` when the job already exists, and it
redacts the secret from everything it prints.

### 4e. Local machine से भी चला सकते हैं / Or from your own laptop

```bash
# gcloud install: https://cloud.google.com/sdk/docs/install
gcloud auth login
export CRON_SECRET='...'
bash ops/setup-cloud-scheduler.sh
```

---

## Step 5 — Console से (बिना command line) / Console click path

**हिन्दी:** अगर terminal नहीं चलाना, तो console से भी वही job बन जाएगी — हर field
की exact value नीचे है।

1. https://console.cloud.google.com/cloudscheduler → project
   `my-website-761e9` चुनें। (पहली बार **Enable** माँगेगा — दबा दें।)
2. **Create Job** पर क्लिक करें और ये values भरें:

   | Field | Value |
   | --- | --- |
   | **Name** | `push-scheduler-minute` |
   | **Region** | `asia-south1 (Mumbai)` |
   | **Frequency** | `* * * * *` |
   | **Timezone** | `UTC` (list में `Etc/UTC` दिखे तो वही चुनें) |
   | **Description** | `Primary minute pinger for the push scheduler` (optional) |
   | **Target** | `HTTP` |
   | **URL** | `https://eduvora.app/api/cron/subscription-renewals` |
   | **HTTP method** | `GET` |
   | **Body** | खाली छोड़ें / leave empty |
   | **Auth → Add OIDC token** | **UNCHECKED / बंद** |
   | **Headers → Add a header** | Name: `Authorization`  Value: `Bearer <CRON_SECRET>` |
   | **Timeout** | `120s` |
   | **Max retry attempts** | `2` |
   | **Min backoff** | `5s` |
   | **Max backoff** | `60s` |
   | **Max doublings** | `3` |
   | **Max retry duration** | खाली / empty |

3. **Create** दबाएँ।

> ⚠️ Header value में `Bearer` के बाद **एक space** ज़रूरी है:
> `Bearer sk_abc123…`. Space छूट गया तो endpoint 401 लौटाएगा।

**English:** same job, no terminal — Cloud Scheduler → **Create Job**, fill the
table above. Leave "Add OIDC token" unchecked and add the `Authorization: Bearer
<CRON_SECRET>` header. Note the single space after `Bearer`.

---

## Step 6 — "Run now" से verify करें / Verify with Run now

**हिन्दी:** पूरा minute wait करने की ज़रूरत नहीं — job को हाथ से चलाकर तुरंत देख
सकते हैं।

### Console से

1. Cloud Scheduler → job `push-scheduler-minute` की row में
   **Actions (⋮)** → **Force a job execution / Run now**.
2. Page refresh करें। **Status / Last run** = `SUCCEEDED` आना चाहिए (एक execution
   में कुछ सेकंड लगते हैं)।
3. job पर क्लिक करके **Logs** खोलें (न दिखे तो नीचे वाली Cloud Logging query
   use करें) — हर execution की row में HTTP status और duration होता है।
   **HTTP 200** चाहिए।

### Command line से

```bash
gcloud scheduler jobs run push-scheduler-minute \
  --location=asia-south1 --project=my-website-761e9
```

### क्या दिखना चाहिए / What "success" looks like

HTTP **200** और यह JSON summary (numbers आपके data पर depend करते हैं):

```json
{
  "ok": true,
  "renewals": { "scanned": 12, "created": 0, "pushed": 0 },
  "myDayLookbackMs": 900000,
  "myDay": { "scanned": 40, "usersWithDueItems": 1, "items": 1, "pushed": 1 },
  "flowPathJobs": { "scanned": 0, "fired": 0, "failed": 0, "pushed": 0 },
  "content": { "products": 18, "baseline": false, "newProductsAnnounced": 0, "courseUpdatePushes": 0 },
  "referralRepair": { "alreadyCompleted": true }
}
```

- `ok: true` = तीनों jobs (renewals, My Day, content) बिना error चले।
- `myDayLookbackMs` = इस run ने कितने समय का window cover किया। हर मिनट ping
  होने पर यह ~60000–900000 ms (1–15 min) रहेगा। बहुत बड़ी value (जैसे
  7200000 = 2h) का मतलब है pinger कुछ देर रुका था और अब catch-up कर रहा है।

**Status codes का मतलब / status code meanings**

| Code | मतलब / Meaning | ठीक कैसे करें / Fix |
| --- | --- | --- |
| `200` | ✅ सब ठीक | — |
| `401` | `CRON_SECRET` mismatch | job header और Vercel env var की value बिल्कुल एक जैसी करें (`Bearer ` prefix + space सहित) |
| `404` | गलत URL / path typo | URL ठीक करें: `/api/cron/subscription-renewals` |
| `405` | method गलत है | job का HTTP method `GET` होना चाहिए |
| `503` | Vercel पर `CRON_SECRET` set ही नहीं | Vercel → Settings → Environment Variables में जोड़ें, फिर redeploy |
| `504` | function 60s में ख़त्म नहीं हुई | `vercel.json` में इस function का `maxDuration: 60` है — deploy हुई है या नहीं देखें |
| `DEADLINE_EXCEEDED` | 120s में response नहीं | Vercel logs देखें; Firestore scans बड़े हो रहे हों तो catch-up window घटाएँ |

---

## Step 7 — Execution history कैसे पढ़ें / Reading execution history

**हिन्दी:** यहीं से पता चलता है कि pinger सच में हर मिनट चल रहा है या नहीं।

### Console

1. Cloud Scheduler → job पर क्लिक → **Executions / Logs** tab, या
2. https://console.cloud.google.com/logs/query → query:

   ```
   resource.type="cloud_scheduler_job"
   resource.labels.job_id="push-scheduler-minute"
   ```

3. हर entry में देखें: `httpRequest.status` (`200` चाहिए), `timestamp`
   (लगभग हर मिनट एक entry), और `jsonPayload.@type` — successful attempt
   `…scheduler.logging.AttemptFinished` लिखता है; failed attempts WARNING/ERROR
   severity के साथ आते हैं।

### Command line

```bash
# पिछले 15 मिनट की executions, table में
gcloud logging read \
  'resource.type="cloud_scheduler_job" resource.labels.job_id="push-scheduler-minute"' \
  --limit=15 --freshness=15m \
  --project=my-website-761e9 \
  --format='table(timestamp, httpRequest.status, jsonPayload.status)'
```

**स्वस्थ दिखने का मतलब / what healthy looks like:** लगभग हर मिनट एक row, हर row
में `200`। 1–2 मिनट का gap कभी-कभी ठीक है (Vercel cold start + retry से भर
जाता है); 5–10 मिनट का लगातार gap मतलब कुछ टूटा है।

**दूसरी जाँच / second check:** Firestore → `settings/pushSchedulerState` →
`lastRunAt` हर मिनट आगे बढ़ना चाहिए। यह इस बात का सबूत है कि endpoint सिर्फ़ 200
नहीं लौटाया, बल्कि सच में अपना काम करके state लिख गया।

---

## Step 8 — Alert लगाएँ (email) / Alerting

**हिन्दी:** ताकि pinger चुपचाप बंद हो जाए तो email आ जाए। दो policy files हैं:

1. **`ops/cloud-scheduler-alert-policy.json`** — metric-based policy, metric
   `cloudscheduler.googleapis.com/job/execution_count` पर, job
   `push-scheduler-minute` और non-success (`response_code != "200"`) filter के
   साथ, और साथ में एक "कोई execution ही नहीं आई" (absent-metric) condition।
2. **`ops/cloud-scheduler-alert-policy-logmatch.json`** — log-based fallback:
   Cloud Scheduler की execution logs में `severity >= WARNING` (attempt failed)
   पर email। **अगर ऊपर वाली policy deploy न हो पाए, यही use करें** — नीचे
   "Note on the metric" देखें।

### 8a. Email notification channel बनाएँ / Create the email channel

```bash
gcloud alpha monitoring channels create \
  --project=my-website-761e9 \
  --display-name="Push scheduler alerts" \
  --description="Email me when the minute pinger stops succeeding" \
  --type=email \
  --channel-labels=email_address=आपका@email.com
```

Output में `projects/my-website-761e9/notificationChannels/<CHANNEL_ID>` आएगा।
वह `<CHANNEL_ID>` copy करें। (Console से भी: **Monitoring → Alerting →
Edit notification channels → Add notification channel → Email**.)

### 8b. Channel ID policy में डालें / Put the channel id in the policy

`ops/cloud-scheduler-alert-policy.json` में
`projects/my-website-761e9/notificationChannels/REPLACE_WITH_CHANNEL_ID` की जगह
अपना channel name डालें (Cloud Shell में):

```bash
sed -i "s|REPLACE_WITH_CHANNEL_ID|असली_CHANNEL_ID|" ops/cloud-scheduler-alert-policy.json
```

### 8c. Policy deploy करें / Deploy the policy

```bash
gcloud alpha monitoring policies create \
  --project=my-website-761e9 \
  --policy-from-file=ops/cloud-scheduler-alert-policy.json
```

जाँच / verify:

```bash
gcloud alpha monitoring policies list --project=my-website-761e9 \
  --format='table(displayName, enabled)'
```

> **Note on the metric:** `cloudscheduler.googleapis.com/*` metric family
> आज Cloud Monitoring की public metrics catalog में list नहीं है, इसलिए कुछ
> projects में ऊपर वाला `create` command
> `Unknown metric type` / `Field response_code not found` जैसा error दे सकता
> है। तब घबराएँ नहीं — log-based policy deploy कर दें, वह उसी log पर चलती है
> जो Cloud Scheduler हर execution पर लिखता है:
>
> ```bash
> gcloud alpha monitoring policies create \
>   --project=my-website-761e9 \
>   --policy-from-file=ops/cloud-scheduler-alert-policy-logmatch.json
> ```
>
> दोनों एक साथ deploy करना भी ठीक है (दो अलग policies हैं, इसलिए कोई conflict
> नहीं)।

---

## Overlap क्यों harmless है / Why the overlap is harmless

**हिन्दी:** Cloud Scheduler, दोनों GitHub workflows और Vercel का daily cron —
चारों एक ही endpoint को हिट करते हैं, कभी-कभी एक ही मिनट में। कोई duplicate
notification नहीं आएगा, क्योंकि:

- **My Day items:** dedupe key `kind:itemId:localDate` है और server उसे
  `users/{uid}/myDay/current` के `notificationLog` में लिखता है। एक ही item एक
  ही local day में एक बार ही fire होता है (`collectDueMyDayItems`)।
- **Renewals / content / unlocks:** notification का **doc id deterministic** है
  (`subscription-renewal:{expiresAt}:{stage}`, `content:product:{id}`,
  `unlock:{orderId}`), इसलिए दूसरा run वही doc दोबारा लिखने की कोशिश करता है —
  बनता नहीं।
- **Push tag** भी deterministic है (`myday-${item.key}`), तो Android duplicate
  दिखाने की जगह वही notification replace कर देता है।

यानी extra pings की कीमत सिर्फ़ कुछ extra Firestore reads है — user को कोई फ़र्क़
नहीं दिखता। इसलिए backup को बंद करने की ज़रूरत नहीं।

**English:** every notification path is idempotent — My Day items dedupe on
`kind:itemId:localDate` in `notificationLog`, and renewals/content/unlocks use
deterministic notification doc ids — so two pingers landing in the same minute
cost a few extra Firestore reads and change nothing user-visible. Keep both.

---

## Precision, Doze और OEM autostart / Precision, Doze and OEM autostart

### Precision = "उसी मिनट के अंदर" / precision = "within the scheduled minute"

**हिन्दी:** हर run उन सभी items को sweep करता है जो पिछले successful run के बाद
due हुए (`resolveLookbackMs`)। पिंग हर 60 सेकंड आती है, इसलिए worst case देरी
~60 सेकंड होती है — घंटे नहीं। यही "exact-time" का व्यावहारिक मतलब है: reminder
उसी मिनट में आता है जिस मिनट के लिए set किया गया था।

**English:** each run sweeps everything that fell due since the previous
successful run, and a ping arrives every 60s, so worst-case lateness is about
one minute — the reminder lands in the minute it was set for. If pings ever
stop, the catch-up window (cap 2h, override with `MYDAY_MAX_CATCHUP_HOURS`)
turns "missed" into "late" instead of "never".

### FCM high priority, Doze और offline TTL

**हिन्दी:** endpoint हर push दो चैनलों पर भेजता है — Web Push (browser/PWA) और
FCM (installed Android TWA)। FCM message में:

- `android.priority: "high"` → message Doze/idle को bypass करने की कोशिश करता
  है, ताकि device सो रहा हो तब भी wake हो सके;
- `android.ttl: 24h` (`60 * 60 * 24 * 1000` ms) → device offline है तो FCM उसे
  **24 घंटे तक store** करके रखता है और device online होते ही deliver कर देता है
  (इसलिए रात भर phone बंद रहने पर भी सुबह notification मिलता है, बशर्ते 24h के
  अंदर online हो);
- `android.notification` block (`icon: ic_stat_eduvora`, tag, clickAction) →
  system tray में brand silhouette icon के साथ notification खुद render होता है,
  app खुली हो या बंद;
- `data` payload → app खुली हो/foreground handler चले तो Capacitor का
  `LocalNotifications` वही notification दिखाता है (tag same होने से duplicate
  नहीं बनता)।

Web Push side पर भी `TTL: 86400` (24h) set है, और 404/410 लौटाने वाले dead
endpoints automatically delete हो जाते हैं।

**English:** every push fans out to Web Push and FCM in parallel. The FCM
message is high priority with a 24h TTL and carries a `notification` block, so
it wakes the device out of Doze when possible, survives an offline device for
24 hours, and renders in the system tray with the brand silhouette icon whether
or not the app is running. Dead endpoints (404/410) are pruned on send.

### ⚠️ Xiaomi / Vivo / Oppo / Realme / Samsung — autostart caveat

**हिन्दी:** यह server-side ठीक नहीं किया जा सकता। कई Chinese-OEM skins (MIUI /
HyperOS, FuntouchOS, ColorOS, Realme UI) और कुछ Samsung builds ऐप को **"autostart"
बंद** रखते हैं और aggressive battery optimization चलाते हैं। नतीजा: FCM message
server से सही भेजा गया (Cloud Scheduler logs में 200 दिखेगा), पर device उसे app
तक पहुँचने ही नहीं देता — notification तब दिखता है जब user ऐप खोलता है। ठीक करने
का तरीका device settings में है, हमारी code में नहीं:

- **Xiaomi/Redmi (MIUI/HyperOS):** Settings → Apps → Eduvora → **Autostart**
  ON; Battery → **No restrictions**; Recent apps में app को lock करें।
- **Vivo/iQOO (FuntouchOS):** Settings → Battery → **High background power
  consumption** में Eduvora allow; i Manager → App management → **Autostart** ON।
- **Oppo/Realme/OnePlus (ColorOS/Realme UI):** Settings → Apps → App management →
  Eduvora → **Allow auto-launch** + Battery usage → **Allow background
  activity**; Recent apps में app lock।
- **Samsung:** Settings → Battery → **Background usage limits** → Eduvora को
  *Sleeping apps* से हटाकर **Never sleeping apps** में डालें।

इन steps को ऐप के अंदर एक screen पर दिखाना बाकी है: **[battery-optimisation
screen](#followup)** — route placeholder `#/notifications/battery-optimisation`,
अभी बना नहीं है (follow-up)। तब तक users को
https://dontkillmyapp.com/ पर अपने brand के steps बताए जा सकते हैं।

**English:** several OEM skins (MIUI/HyperOS, FuntouchOS, ColorOS, Realme UI,
some Samsung builds) block app autostart and apply aggressive battery
optimisation. The ping still succeeds server-side (200 in the execution log);
the device just refuses to wake the app, so the notification only appears when
the user opens it. This is fixed in device settings, not in our code — and an
in-app guide screen is still to be built:
**[battery-optimisation screen](#followup)** (route placeholder
`#/notifications/battery-optimisation`).

---

## Troubleshooting

| लक्षण / Symptom | कारण / Cause | समाधान / Fix |
| --- | --- | --- |
| Job list खाली है / job missing | script नहीं चला, या दूसरा project चुना हुआ है | ऊपर दाएँ project picker में `my-website-761e9` देखें; script दोबारा चलाएँ |
| API enable करते वक़्त billing वाला `FAILED_PRECONDITION` error | Blaze नहीं है | Step 1 |
| `PERMISSION_DENIED` | account के पास role नहीं | **IAM** → अपनी account को `Cloud Scheduler Admin` दें |
| Execution `FAILED` with `HTTP 401` | header value गलत | Step 5 का header table; `Bearer ` + space + वही secret जो Vercel पर है |
| Execution `SUCCEEDED` पर notification नहीं आया | device-side block | ऊपर autostart section; `#/notifications` पर permission check |
| कुछ मिनट executions गायब | Vercel cold start/timeout | `vercel.json` का `maxDuration: 60` deploy हुआ है? Vercel logs देखें |
| Job `PAUSED` दिख रहा है | किसी ने pause किया | script दोबारा चलाएँ (वह resume कर देता है) या console में **Resume** |
| GitHub workflow बंद हो गया | 60 दिन repo activity नहीं → GitHub disable कर देता है | default branch पर कोई भी commit; Cloud Scheduler primary है इसलिए reminders रुकते नहीं |

---

## Rollback — Cloud Scheduler हटाना / removing the job

**हिन्दी:** GitHub workflows backup की तरह पहले से चालू हैं, इसलिए job हटाने से
notifications पूरी तरह बंद नहीं होंगे — बस देर से आएँगे।

```bash
gcloud scheduler jobs delete push-scheduler-minute \
  --location=asia-south1 --project=my-website-761e9
gcloud alpha monitoring policies list --project=my-website-761e9   # policy भी हटानी हो तो
```

**English:** deleting the job falls back to the GitHub pingers automatically
(late, but alive). Delete the alert policy too if you no longer need it.

---

## इन्हें भी देखें / See also

- `ops/README-push-scheduler.md` — पूरा delivery model, pinger tiers, और
  "notification नहीं आया" checklist।
- `docs/unified-server-push-notifications.md` — हर notification kind कहाँ बनती
  है और उसका idempotent doc id क्या है।
- `ops/push-scheduler.workflow.yml` — GitHub workflow का kept-in-sync template।
- `.github/actions/ping-loop/action.yml` — backup pinger का असली loop।
- `utils/pushScheduler.js` — `resolveLookbackMs`, dedupe keys, catch-up cap.
