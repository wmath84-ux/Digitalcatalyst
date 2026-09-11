// tests/myDayExactTimeDeliveryContract.test.mjs
//
// "A reminder must arrive at the exact time the user set it, whether
// the app is open or closed."
//
// The delivery machinery already existed; what did not was a scheduler
// that actually ran often enough, and a catch-up window that could
// survive one being missed. These tests pin the three failures that
// made reminders silently never arrive:
//
//   1. The window was a fixed 15 minutes, so anything due between two
//      widely-spaced runs fell outside it and was dropped forever.
//   2. Vercel's Hobby plan caps cron at ONE run per day (a sub-daily
//      expression fails at deploy time), so the only in-repo scheduler
//      could not deliver minute-accurate reminders at all.
//   3. Push notifications were tagged per KIND, so three tasks due at
//      the same minute collapsed into one system notification, and the
//      tag disagreed with the foreground path, allowing a duplicate.
//   4. The pinger itself was only as reliable as GitHub's `schedule`
//      trigger, which this repo measured starting runs 1h20m-5h20m apart.
//      Google Cloud Scheduler is now the PRIMARY pinger (a real cron, every
//      60 seconds); both workflows stay on as the free backup. The tests at
//      the bottom of this file pin that setup, its secret handling and its
//      docs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MYDAY_LOOKBACK_MS,
  MYDAY_MAX_CATCHUP_MS,
  collectDueMyDayItems,
  resolveLookbackMs,
} from "../utils/pushScheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(repoRoot, rel));
// Files the Cloud Scheduler work added are read lazily, so a missing one
// fails an assertion instead of blowing up at module load.
const readIfExists = (rel) => (exists(rel) ? read(rel) : "");

const cron = read("api/cron/subscription-renewals.ts");
const workflow = read("ops/push-scheduler.workflow.yml");
const liveWorkflow = read(".github/workflows/push-scheduler.yml");
const backupWorkflow = read(".github/workflows/push-scheduler-backup.yml");
// The actual ping loop (auth header, secrets, 60s ticks) lives in this
// composite action; both live workflows and the ops template just call it.
const pingLoop = read(".github/actions/ping-loop/action.yml");
const vercelConfig = JSON.parse(read("vercel.json"));
// The PRIMARY pinger: one Cloud Scheduler job, created by this script.
const cloudScript = readIfExists("ops/setup-cloud-scheduler.sh");
const cloudGuide = readIfExists("ops/cloud-scheduler-setup.md");
const opsReadme = readIfExists("ops/README-push-scheduler.md");
const unifiedDoc = readIfExists("docs/unified-server-push-notifications.md");
const parseIfExists = (rel) => {
  const text = readIfExists(rel);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    assert.fail(`${rel} is not valid JSON: ${error.message}`);
    return null;
  }
};
const alertPolicy = parseIfExists("ops/cloud-scheduler-alert-policy.json");
const logMatchPolicy = parseIfExists("ops/cloud-scheduler-alert-policy-logmatch.json");

// 2026-08-13T04:30:00Z is exactly 10:00 IST (offset -330).
const IST = -330;
const NOW = Date.parse("2026-08-13T04:30:00.000Z");
const DAY = "2026-08-13";
const MINUTE = 60 * 1000;

test("the catch-up window grows to cover the gap since the last run", () => {
  // Never smaller than the default, whatever the input.
  assert.equal(resolveLookbackMs(0, NOW), MYDAY_LOOKBACK_MS);
  assert.equal(resolveLookbackMs(null, NOW), MYDAY_LOOKBACK_MS);
  assert.equal(resolveLookbackMs(NOW, NOW), MYDAY_LOOKBACK_MS);
  // A clock that jumped backwards must not produce a negative window.
  assert.equal(resolveLookbackMs(NOW + 5 * MINUTE, NOW), MYDAY_LOOKBACK_MS);

  // A 40-minute outage must be covered, not skipped.
  const gap = 40 * MINUTE;
  assert.ok(resolveLookbackMs(NOW - gap, NOW) >= gap);

  // But an hours-long gap is capped — a breakfast reminder at dinner
  // time is noise, not a reminder.
  assert.equal(resolveLookbackMs(NOW - 8 * 60 * MINUTE, NOW), MYDAY_MAX_CATCHUP_MS);
});

test("an item due during a scheduler outage still fires on the next run", () => {
  const data = {
    tasks: [{ id: "t1", title: "Physics numericals", time: "09:35", status: "pending" }],
  };
  // 25 minutes late: outside the old fixed window, so it used to vanish.
  assert.equal(collectDueMyDayItems(data, NOW, IST).length, 0);

  const lookback = resolveLookbackMs(NOW - 30 * MINUTE, NOW);
  const due = collectDueMyDayItems(data, NOW, IST, lookback);
  assert.equal(due.length, 1);
  assert.equal(due[0].key, `task:t1:${DAY}`);
});

test("the scheduler records its run only after every job succeeds", () => {
  assert.match(cron, /pushSchedulerState/);
  assert.match(cron, /lastRunAt/);
  assert.match(cron, /resolveLookbackMs\(lastRunAt, now\)/);
  // The write must be the last thing before the response — a handler
  // that throws halfway must leave the window open for a retry.
  const writeIndex = cron.indexOf("runStateRef.set({ lastRunAt: now");
  const responseIndex = cron.indexOf("return res.status(200).json({ ok: true, ...summary })");
  assert.ok(writeIndex > 0 && writeIndex < responseIndex, "lastRunAt must be written just before the success response");
  assert.ok(writeIndex > cron.indexOf("3. content announces"), "lastRunAt must be written after all three jobs");
});

test("each due item gets its own notification instead of collapsing", () => {
  // Three tasks at the same minute must produce three distinct keys...
  const data = {
    tasks: [
      { id: "t1", title: "Physics", time: "10:00", status: "pending" },
      { id: "t2", title: "Chemistry", time: "10:00", status: "pending" },
      { id: "t3", title: "Maths", time: "10:00", status: "pending" },
    ],
  };
  const due = collectDueMyDayItems(data, NOW, IST);
  assert.equal(due.length, 3);
  assert.equal(new Set(due.map((item) => item.key)).size, 3);

  // ...and the push tag must be derived from the key, not the kind.
  assert.match(cron, /tag: `myday-\$\{item\.key\}`/);
  assert.doesNotMatch(cron, /tag: `myday-\$\{item\.kind\}`/);
});

test("the foreground and server paths agree on the notification tag", () => {
  // Same tag means the OS replaces rather than duplicates when a push
  // lands while the app is open.
  assert.match(read("src/main.tsx"), /`myday-\$\{item\.key\}`/);
  assert.match(cron, /`myday-\$\{item\.key\}`/);
});

test("a minute-level scheduler workflow is committed and active", () => {
  // The live primary AND a backup workflow (same minute cron, same action)
  // must live under .github/workflows/ — that is the only location GitHub
  // Actions schedules from. A template that only lived in ops/ meant
  // reminders silently fell back to once-a-day.
  assert.match(liveWorkflow, /name: Push scheduler/);
  assert.match(backupWorkflow, /name: Push scheduler \(backup\)/);
  // Every workflow entry point must support manual runs, serialize through
  // the shared concurrency group, and delegate to the shared ping loop.
  for (const source of [liveWorkflow, backupWorkflow, workflow]) {
    assert.match(source, /workflow_dispatch/, "manual runs make this testable");
    assert.match(source, /concurrency:/, "a slow run must not overlap the next tick");
    assert.match(source, /group: push-scheduler/, "primary and backup must share one concurrency group");
    assert.match(source, /uses: \.\/\.github\/actions\/ping-loop/, "workflows must delegate to the shared loop");
  }
  // The auth header and secret references live in the shared loop action.
  assert.match(pingLoop, /Authorization: Bearer/);
  assert.match(pingLoop, /\$\{\{ secrets\.CRON_SECRET \}\}/);
  assert.match(pingLoop, /\$\{\{ secrets\.SCHEDULER_URL \}\}/);
});

test("the scheduler pings every minute for exact-time delivery", () => {
  // Exact-time reminders need a one-minute tick (the endpoint's own
  // lookback window absorbs jitter). Any coarser cadence makes a
  // reminder late, so guard the cron expression against loosening.
  for (const source of [liveWorkflow, backupWorkflow, workflow]) {
    assert.match(source, /cron: "\* \* \* \* \*"/, "scheduler must run every minute");
  }
});

test("each scheduled run loops long enough to bridge GitHub schedule drift", () => {
  // GitHub's schedule trigger starts runs 1–5+ hours apart and often drops
  // minute events. A run that pings once (or loops only ~21 minutes) leaves
  // multi-hour holes in which reminders arrive late or past the catch-up
  // cap never. The loop therefore spans ~5h (GitHub's per-job ceiling is
  // 6h), and the job timeout gives every tick headroom. Pin both so nobody
  // shortens the loop back into the broken regime.
  assert.match(pingLoop, /default: "300"/, "loop default must be 300 one-minute ticks (5h)");
  assert.match(pingLoop, /LOOP_MINUTES:\s*\$\{\{ inputs\.loop-minutes \}\}/);
  for (const source of [liveWorkflow, backupWorkflow, workflow]) {
    assert.match(source, /loop-minutes: 300/, "workflow must request the 5h loop");
    assert.match(source, /timeout-minutes: 330/, "job timeout must exceed the 5h loop");
  }
});

test("a minute-level scheduler exists, because Vercel Hobby cron cannot do it", () => {
  // Hobby rejects any sub-daily expression at deploy time, so the
  // committed vercel.json must stay daily.
  const schedule = vercelConfig.crons[0].schedule;
  assert.doesNotMatch(schedule, /^\*/, "a sub-daily Vercel cron breaks Hobby deployments");
  assert.equal(schedule.split(" ").length, 5);
});

test("the scheduler endpoint stays authenticated", () => {
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /Unauthorized/);
  // The loop must not hard-code the secret or the host — both come from
  // repository secrets (this also catches a workflow silently missing its
  // env wiring, whose symptom is an all-failing red Actions run).
  assert.match(pingLoop, /\$\{\{ secrets\.CRON_SECRET \}\}/);
  assert.match(pingLoop, /\$\{\{ secrets\.SCHEDULER_URL \}\}/);
});

test("the daily Vercel cron still works as a fallback", () => {
  assert.equal(vercelConfig.crons[0].path, "/api/cron/subscription-renewals");
  // Both schedulers hit the same idempotent endpoint, so overlap is safe.
  assert.match(cron, /notificationLog/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Google Cloud Scheduler: the PRIMARY minute pinger.
//
// GitHub's `schedule` trigger drifts by hours (see the header), so the two
// workflows above are a backup rather than the guarantee. These tests pin the
// Cloud Scheduler job that actually delivers on the minute: its schedule, its
// secret handling, its alerting, and the docs a human follows to create it.
// ─────────────────────────────────────────────────────────────────────────────

test("Google Cloud Scheduler is the primary minute pinger", () => {
  assert.ok(exists("ops/setup-cloud-scheduler.sh"), "ops/setup-cloud-scheduler.sh must be committed");
  assert.match(cloudScript, /^#!\/usr\/bin\/env bash/);
  assert.match(cloudScript, /^set -euo pipefail$/m, "the script must fail loudly on any error");

  // Job identity plus the every-minute schedule, interpreted in UTC.
  assert.match(cloudScript, /JOB_ID="push-scheduler-minute"/);
  assert.match(cloudScript, /SCHEDULE="\* \* \* \* \*"/, "the job must run every minute");
  assert.match(cloudScript, /--schedule="\$SCHEDULE"/);
  assert.match(cloudScript, /TIME_ZONE="UTC"/);
  assert.match(cloudScript, /--time-zone="\$TIME_ZONE"/);

  // Defaults: the Firebase project, the nearest region, the live endpoint.
  assert.match(cloudScript, /PROJECT_ID="\$\{PROJECT_ID:-my-website-761e9\}"/);
  assert.match(cloudScript, /REGION="\$\{REGION:-asia-south1\}"/);
  assert.match(
    cloudScript,
    /SCHEDULER_URL="\$\{SCHEDULER_URL:-https:\/\/eduvora\.app\/api\/cron\/subscription-renewals\}"/,
  );

  // GET plus the shared-secret header — and deliberately no OIDC token, since
  // an OIDC token and a custom Authorization header are mutually exclusive on
  // a Cloud Scheduler HTTP target and the endpoint checks the secret.
  assert.match(cloudScript, /HTTP_METHOD="GET"/);
  assert.match(cloudScript, /--http-method="\$HTTP_METHOD"/);
  assert.match(cloudScript, /--headers="Authorization=Bearer \$\{CRON_SECRET\}"/);
  assert.doesNotMatch(
    cloudScript,
    /--oidc-service-account-email/,
    "an OIDC token would displace the Authorization header the endpoint requires",
  );

  // One attempt may take the whole function budget; a failure retries twice.
  assert.match(cloudScript, /ATTEMPT_DEADLINE="120s"/);
  assert.match(cloudScript, /MAX_RETRY_ATTEMPTS="2"/);
  assert.match(cloudScript, /MIN_BACKOFF="5s"/);
  assert.match(cloudScript, /MAX_BACKOFF="60s"/);
  assert.match(cloudScript, /MAX_DOUBLINGS="3"/);
  for (const flag of ["attempt-deadline", "max-retry-attempts", "min-backoff", "max-backoff", "max-doublings"]) {
    assert.match(cloudScript, new RegExp(`--${flag}=`), `the job must set --${flag}`);
  }

  // Enables the API, creates the job, updates it when it already exists, then
  // describes it — so re-running the script is a no-op, not a second job.
  assert.match(cloudScript, /SCHEDULER_API="cloudscheduler\.googleapis\.com"/);
  assert.match(cloudScript, /gcloud services enable "\$SCHEDULER_API"/);
  assert.match(cloudScript, /gcloud scheduler jobs create http "\$JOB_ID"/);
  assert.match(cloudScript, /gcloud scheduler jobs update http "\$JOB_ID"/);
  assert.match(cloudScript, /ALREADY_EXISTS/, "the update path must trigger on an existing job");
  assert.match(cloudScript, /gcloud scheduler jobs describe "\$JOB_ID"/);
  // gcloud's asymmetry: create takes --headers, update takes --update-headers.
  assert.match(cloudScript, /--update-headers="Authorization=Bearer \$\{CRON_SECRET\}"/);
});

test("the setup script requires the cron secret and never leaks it", () => {
  // Read from the environment only, and mandatory.
  assert.deepEqual(
    cloudScript.match(/^CRON_SECRET=.*$/gm),
    ['CRON_SECRET="${CRON_SECRET:-}"'],
    "CRON_SECRET must come from the environment and never be hard-coded",
  );
  assert.match(cloudScript, /\[ -n "\$CRON_SECRET" \] \|\| die/, "a missing secret must abort with instructions");
  // No trace mode (it would print the header), and nothing gcloud prints is
  // shown unfiltered — `jobs describe` echoes the Authorization header back.
  assert.doesNotMatch(cloudScript, /^\s*set -[a-z]*x/m, "set -x would print the Authorization header");
  assert.doesNotMatch(cloudScript, /echo[^\n]*\$\{?CRON_SECRET/, "the secret must never be echoed");
  assert.match(cloudScript, /redact\(\)/);
  assert.match(cloudScript, /\[REDACTED\]/);
  // The human-facing summary shows only the length, never the value.
  assert.match(cloudScript, /\$\{#CRON_SECRET\}/);
  // A comma would split the header in two; a newline would forge a second one.
  assert.match(cloudScript, /breaks the --headers KEY=VALUE parsing/);
});

test("the setup guide covers the one-time Google Cloud work", () => {
  assert.ok(exists("ops/cloud-scheduler-setup.md"));
  assert.match(cloudGuide, /Blaze/, "the Blaze upgrade must be documented");
  assert.match(cloudGuide, /₹100/, "the ₹100 budget must be spelled out");
  assert.match(cloudGuide, /Budgets & alerts/, "the budget alert click path must be spelled out");
  assert.match(cloudGuide, /50%/);
  assert.match(cloudGuide, /100%/);
  assert.match(cloudGuide, /Cloud Shell/);
  assert.match(cloudGuide, /export CRON_SECRET/);
  // The console-only alternative, with the exact field values and the OIDC note.
  assert.match(cloudGuide, /Create Job/);
  assert.match(cloudGuide, /asia-south1/);
  assert.match(cloudGuide, /Bearer <CRON_SECRET>/);
  assert.match(cloudGuide, /OIDC/);
  // Verification: Run now, expect HTTP 200 plus the JSON summary, then history.
  assert.match(cloudGuide, /Run now/);
  assert.match(cloudGuide, /"ok": true/);
  assert.match(cloudGuide, /execution history|Executions/i);
  // GitHub stays the documented free backup.
  assert.match(cloudGuide, /push-scheduler\.yml/);
  assert.match(cloudGuide, /push-scheduler-backup\.yml/);
  assert.match(cloudGuide, /backup/i);
  // Alerting: create an email channel, then deploy the policy from this repo.
  assert.match(cloudGuide, /gcloud alpha monitoring channels create/);
  assert.match(cloudGuide, /gcloud alpha monitoring policies create/);
  assert.match(cloudGuide, /--policy-from-file=ops\/cloud-scheduler-alert-policy\.json/);
});

test("the alert policy watches this job and non-success responses", () => {
  assert.ok(alertPolicy, "ops/cloud-scheduler-alert-policy.json must exist and parse");
  assert.equal(alertPolicy.combiner, "OR");
  assert.equal(alertPolicy.enabled, true);
  assert.ok(alertPolicy.notificationChannels.length > 0, "the policy needs a notification channel placeholder");

  const threshold = alertPolicy.conditions.find((condition) => condition.conditionThreshold);
  assert.ok(threshold, "the policy needs a metric-threshold condition");
  const filter = threshold.conditionThreshold.filter;
  assert.match(filter, /metric\.type = "cloudscheduler\.googleapis\.com\/job\/execution_count"/);
  assert.match(filter, /resource\.label\."job_id" = "push-scheduler-minute"/);
  assert.match(filter, /metric\.label\."response_code" != "200"/, "non-success responses must be the trigger");
  assert.equal(threshold.conditionThreshold.comparison, "COMPARISON_GT");
  assert.equal(Number(threshold.conditionThreshold.thresholdValue), 0);

  // A paused or deleted job produces no failures at all, so the policy also
  // fires when the metric simply goes quiet.
  const absent = alertPolicy.conditions.find((condition) => condition.conditionAbsent);
  assert.ok(absent, "a silently paused job must also alert");
  assert.match(absent.conditionAbsent.filter, /push-scheduler-minute/);

  // The log-based twin covers projects that emit no cloudscheduler metric
  // (the family is absent from the public metrics catalog).
  assert.ok(logMatchPolicy, "the log-based fallback policy must exist and parse");
  assert.equal(logMatchPolicy.conditions.length, 1, "a log-based alerting policy may hold exactly one condition");
  assert.match(logMatchPolicy.conditions[0].conditionMatchedLog.filter, /push-scheduler-minute/);
  assert.match(logMatchPolicy.conditions[0].conditionMatchedLog.filter, /severity>=WARNING/);
});

test("the cron function gets the full Hobby budget so a cold start cannot 504", () => {
  const cronRoute = vercelConfig.crons[0].path;
  const fnKey = `${cronRoute.replace(/^\//, "")}.ts`;
  assert.ok(exists(fnKey), `${fnKey} must be the file serving ${cronRoute}`);
  assert.equal(
    vercelConfig.functions?.[fnKey]?.maxDuration,
    60,
    "the pinger's target must be allowed the full 60s Hobby window",
  );
  for (const [key, cfg] of Object.entries(vercelConfig.functions)) {
    assert.ok(Number(cfg.maxDuration) <= 60, `${key} exceeds the Hobby 60s cap`);
  }
  // The job's attempt deadline must sit above the function budget, or Cloud
  // Scheduler would kill an invocation that is still working.
  assert.match(cloudScript, /ATTEMPT_DEADLINE="120s"/);
});

test("both GitHub workflows stay documented as the free backup", () => {
  for (const source of [opsReadme, unifiedDoc, cloudGuide]) {
    assert.match(source, /push-scheduler\.yml/);
    assert.match(source, /push-scheduler-backup\.yml/);
    assert.match(source, /backup/i, "the workflows must read as the backup, not the primary");
  }
  // Overlap is safe because the endpoint is idempotent — the docs must say why,
  // not merely assert that it is fine.
  assert.match(opsReadme, /idempotent/i);
  assert.match(opsReadme, /notificationLog/);
  assert.match(unifiedDoc, /idempotent/i);
  // And the backup keeps its own minute cron + 5h loop, because it becomes the
  // only pinger the moment the Cloud Scheduler job is removed.
  for (const source of [liveWorkflow, backupWorkflow]) {
    assert.match(source, /cron: "\* \* \* \* \*"/);
    assert.match(source, /loop-minutes: 300/);
  }
});

test("the docs state the precision promise and the device-side behaviour", () => {
  for (const source of [opsReadme, unifiedDoc]) {
    // "Within the scheduled minute" is the real guarantee: a minute pinger
    // plus a catch-up sweep, not a millisecond-accurate alarm.
    assert.match(source, /within the scheduled minute/i);
    // FCM: high priority beats Doze batching, and a 24h TTL survives an
    // offline device; the Web Push side uses the same 24h TTL.
    assert.match(source, /android\.priority: "high"/);
    assert.match(source, /24 ?h/);
    assert.match(source, /86400/);
    // OEM autostart is device-side, and the in-app guide is still a follow-up.
    assert.match(source, /Xiaomi/i);
    assert.match(source, /Vivo/i);
    assert.match(source, /Oppo/i);
    assert.match(
      source,
      /#followup/,
      "the battery-optimisation screen link placeholder must stay until that screen exists",
    );
  }
});
