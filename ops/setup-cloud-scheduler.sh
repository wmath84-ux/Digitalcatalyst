#!/usr/bin/env bash
#
# ops/setup-cloud-scheduler.sh
#
# Makes Google Cloud Scheduler the PRIMARY minute-level pinger for the push
# scheduler endpoint. Cloud Scheduler fires a real cron every 60 seconds —
# unlike GitHub Actions' `schedule` trigger, which this repo measured
# delivering start events 1h20m–5h20m apart (and silently dropping most
# minute events), which is why notifications used to arrive only "when I
# opened the app". The GitHub workflows stay in place as a free backup;
# every ping is idempotent, so the two overlap harmlessly.
#
# WHAT THIS CREATES
#   Cloud Scheduler HTTP job  push-scheduler-minute
#     GET https://eduvora.app/api/cron/subscription-renewals
#     schedule      * * * * *   (every minute, interpreted in UTC)
#     header        Authorization: Bearer $CRON_SECRET
#     deadline      120s per attempt
#     retry         max 2 attempts, 5s → 60s backoff, 3 doublings
#   ...plus enabling the cloudscheduler.googleapis.com API.
#
# WHY NO OIDC
#   The target is an external Vercel URL that authenticates with a shared
#   secret. An OIDC token and a custom `Authorization` header are mutually
#   exclusive on a Cloud Scheduler HTTP target, so this job deliberately
#   sends NO OIDC token and instead sets `Authorization: Bearer <secret>`,
#   which is what api/cron/subscription-renewals.ts validates.
#
# IDEMPOTENT
#   Safe to re-run: it creates the job, and if the job already exists it
#   updates it in place instead. It also re-enables the API and resumes the
#   job if someone paused it.
#
# COST
#   Cloud Scheduler is free for the first 3 jobs per billing account, then
#   $0.10/job/month. This creates ONE job. HTTP-target invocations of the
#   external URL are not charged. Requires a billing account (Blaze) on the
#   project — see ops/cloud-scheduler-setup.md.
#
# SECRET HANDLING
#   CRON_SECRET is read from the environment only. It is never hard-coded,
#   never echoed, never written to a file, and every byte of gcloud output
#   this script prints is passed through `redact` first — because
#   `gcloud scheduler jobs describe` prints the Authorization header back,
#   and a failed gcloud call echoes its full command line.
#   Never `set -x` in this file.
#
# USAGE
#   export CRON_SECRET='<the CRON_SECRET env var from Vercel>'
#   bash ops/setup-cloud-scheduler.sh
#
#   Optional overrides (all have working defaults):
#     PROJECT_ID=my-website-761e9 \
#     REGION=asia-south1 \
#     SCHEDULER_URL=https://eduvora.app/api/cron/subscription-renewals \
#     bash ops/setup-cloud-scheduler.sh
#
#   bash ops/setup-cloud-scheduler.sh --dry-run   # print the plan, change nothing
#
# Step-by-step (हिन्दी + English), including the console-only click path and
# the ₹100 budget alert: ops/cloud-scheduler-setup.md

set -euo pipefail

readonly JOB_ID="push-scheduler-minute"
readonly SCHEDULE="* * * * *"
readonly TIME_ZONE="UTC"
readonly HTTP_METHOD="GET"
readonly ATTEMPT_DEADLINE="120s"
readonly MAX_RETRY_ATTEMPTS="2"
readonly MIN_BACKOFF="5s"
readonly MAX_BACKOFF="60s"
readonly MAX_DOUBLINGS="3"
readonly SCHEDULER_API="cloudscheduler.googleapis.com"

PROJECT_ID="${PROJECT_ID:-my-website-761e9}"
REGION="${REGION:-asia-south1}"
SCHEDULER_URL="${SCHEDULER_URL:-https://eduvora.app/api/cron/subscription-renewals}"
CRON_SECRET="${CRON_SECRET:-}"
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage: CRON_SECRET=<secret> bash ops/setup-cloud-scheduler.sh [options]

Creates (or updates) the Cloud Scheduler job that pings the push scheduler
every minute. Re-runnable: an existing job is updated in place.

Options:
  --dry-run          Print the resolved configuration and exit without
                     calling gcloud. The secret stays masked.
  --project=<id>     Google Cloud project   (default: $PROJECT_ID or my-website-761e9)
  --region=<region>  Scheduler region       (default: $REGION or asia-south1)
  --url=<url>        Scheduler endpoint     (default: $SCHEDULER_URL)
  -h, --help         This help

Environment:
  PROJECT_ID       Google Cloud / Firebase project id  (default my-website-761e9)
  REGION           Cloud Scheduler region              (default asia-south1)
  SCHEDULER_URL    Endpoint to ping                    (default https://eduvora.app/api/cron/subscription-renewals)
  CRON_SECRET      REQUIRED. Same value as the CRON_SECRET env var on Vercel.
                   Read from the environment only; never logged, never stored.

The header sent on every ping is  Authorization: Bearer <CRON_SECRET>.
No OIDC token is attached: an OIDC token and a custom Authorization header
cannot be combined on a Cloud Scheduler HTTP target, and the endpoint
authenticates with the shared secret.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY_RUN=1 ;;
    --project=*) PROJECT_ID="${1#*=}" ;;
    --region=*) REGION="${1#*=}" ;;
    --url=*) SCHEDULER_URL="${1#*=}" ;;
    *) printf 'Unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Strip the secret out of any text before it reaches the terminal or a CI log.
# `gcloud scheduler jobs describe` prints the Authorization header back, and a
# failing gcloud invocation echoes its own command line (which contains the
# header value), so nothing gcloud prints is shown unfiltered.
redact() {
  local text="$1"
  if [ -n "${CRON_SECRET:-}" ]; then
    printf '%s\n' "${text//"$CRON_SECRET"/[REDACTED]}"
  else
    printf '%s\n' "$text"
  fi
}

# Run gcloud, capturing combined output, printing it redacted, and preserving
# the exit code for the caller.
run_gcloud() {
  local out="" rc=0
  out="$("$@" 2>&1)" || rc=$?
  if [ -n "$out" ]; then redact "$out"; fi
  return "$rc"
}

# ---------------------------------------------------------------- validation
[ -n "$CRON_SECRET" ] || die "CRON_SECRET is not set. Get it from Vercel (Project → Settings → Environment Variables → CRON_SECRET) and run:

    export CRON_SECRET='<paste it here>'
    bash ops/setup-cloud-scheduler.sh

It is required, never hard-coded in this repo, and never printed by this script."

# A comma would make gcloud split the --headers value into two entries, and a
# newline would forge a second header. Reject both rather than sending a job
# that silently authenticates with a truncated secret.
case "$CRON_SECRET" in
  *,*) die "CRON_SECRET contains a comma, which breaks the --headers KEY=VALUE parsing. Rotate it to a comma-free value." ;;
  *$'\n'*|*$'\r'*) die "CRON_SECRET contains a newline, which is not a legal HTTP header value." ;;
esac

case "$SCHEDULER_URL" in
  https://*) : ;;
  *) die "SCHEDULER_URL must be an https:// URL (got: ${SCHEDULER_URL})." ;;
esac

say "Cloud Scheduler setup — ${JOB_ID}"
say "  project    : ${PROJECT_ID}"
say "  region     : ${REGION}"
say "  schedule   : ${SCHEDULE}  (${TIME_ZONE})"
say "  target     : ${HTTP_METHOD} ${SCHEDULER_URL}"
say "  auth header: Authorization: Bearer <hidden, ${#CRON_SECRET} chars>"
say "  attempt    : deadline ${ATTEMPT_DEADLINE}; retries ${MAX_RETRY_ATTEMPTS} (${MIN_BACKOFF}→${MAX_BACKOFF}, ${MAX_DOUBLINGS} doublings)"

if [ "$DRY_RUN" -eq 1 ]; then
  say ""
  say "--dry-run: nothing was changed. The commands that would run are:"
  say "  gcloud services enable ${SCHEDULER_API} --project=${PROJECT_ID}"
  say "  gcloud scheduler jobs create http ${JOB_ID} --location=${REGION} --uri=${SCHEDULER_URL} \\"
  say "      --schedule='${SCHEDULE}' --time-zone=${TIME_ZONE} --http-method=${HTTP_METHOD} \\"
  say "      --headers='Authorization=Bearer <CRON_SECRET>' \\"
  say "      --attempt-deadline=${ATTEMPT_DEADLINE} --max-retry-attempts=${MAX_RETRY_ATTEMPTS} \\"
  say "      --min-backoff=${MIN_BACKOFF} --max-backoff=${MAX_BACKOFF} --max-doublings=${MAX_DOUBLINGS}"
  say "  # …falling back to 'gcloud scheduler jobs update http' (with --update-headers) if the job exists"
  say "  gcloud scheduler jobs describe ${JOB_ID} --location=${REGION}"
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || die "gcloud is not on PATH. Install the Google Cloud SDK, or run this from Cloud Shell (https://console.cloud.google.com → terminal icon), which has it preinstalled."

active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n 1 || true)"
[ -n "$active_account" ] || die "No active gcloud account. Run 'gcloud auth login' (Cloud Shell is already authenticated)."
say "  account    : ${active_account}"

if ! run_gcloud gcloud projects describe "$PROJECT_ID" --format='value(projectId)'; then
  die "Project '${PROJECT_ID}' is not reachable by ${active_account}. Check PROJECT_ID and that the account has access (it is the project in .firebaserc)."
fi

# ------------------------------------------------------------------- 1. API
step "1/4 Enabling ${SCHEDULER_API} in ${PROJECT_ID}"
if ! run_gcloud gcloud services enable "$SCHEDULER_API" --project="$PROJECT_ID" --quiet; then
  die "Could not enable ${SCHEDULER_API}. Cloud Scheduler needs a billing account on the project (Blaze plan) — see ops/cloud-scheduler-setup.md, step 1."
fi

# ------------------------------------------------------------------- 2. job
step "2/4 Creating Cloud Scheduler job '${JOB_ID}' in ${REGION}"

# Shared flags for create AND update. Note the asymmetry gcloud forces:
# create takes --headers, update takes --update-headers.
job_flags=(
  --location="$REGION"
  --project="$PROJECT_ID"
  --uri="$SCHEDULER_URL"
  --schedule="$SCHEDULE"
  --time-zone="$TIME_ZONE"
  --http-method="$HTTP_METHOD"
  --description="Primary minute pinger for the Eduvora push scheduler (/api/cron/subscription-renewals). GitHub Actions push-scheduler*.yml is the free backup."
  --attempt-deadline="$ATTEMPT_DEADLINE"
  --max-retry-attempts="$MAX_RETRY_ATTEMPTS"
  --min-backoff="$MIN_BACKOFF"
  --max-backoff="$MAX_BACKOFF"
  --max-doublings="$MAX_DOUBLINGS"
  --quiet
)

create_out=""
create_rc=0
create_out="$(run_gcloud gcloud scheduler jobs create http "$JOB_ID" "${job_flags[@]}" --headers="Authorization=Bearer ${CRON_SECRET}")" || create_rc=$?

if [ "$create_rc" -eq 0 ]; then
  if [ -n "$create_out" ]; then printf '%s\n' "$create_out"; fi
  say "Job '${JOB_ID}' created."
elif printf '%s' "$create_out" | grep -qi -e 'ALREADY_EXISTS' -e 'already exists'; then
  say "Job '${JOB_ID}' already exists — updating it in place (idempotent re-run)."
  if ! run_gcloud gcloud scheduler jobs update http "$JOB_ID" "${job_flags[@]}" --update-headers="Authorization=Bearer ${CRON_SECRET}"; then
    die "The job exists but 'gcloud scheduler jobs update http' failed. See the redacted output above."
  fi
  say "Job '${JOB_ID}' updated."
else
  if [ -n "$create_out" ]; then printf '%s\n' "$create_out"; fi
  die "'gcloud scheduler jobs create http' failed. Common causes: no billing account on ${PROJECT_ID} (needs Blaze), or the account lacks roles/cloudscheduler.admin."
fi

# --------------------------------------------------------------- 3. describe
step "3/4 Verifying the job (Authorization header value redacted)"
run_gcloud gcloud scheduler jobs describe "$JOB_ID" --location="$REGION" --project="$PROJECT_ID"

# An update never un-pauses a job, so resume it if a human paused it: a paused
# primary pinger means notifications silently degrade to the backup cadence.
job_state="$(gcloud scheduler jobs describe "$JOB_ID" --location="$REGION" --project="$PROJECT_ID" --format='value(state)' 2>/dev/null || true)"
if [ "$job_state" = "PAUSED" ] || [ "$job_state" = "DISABLED" ]; then
  say "Job state is ${job_state} — resuming it."
  run_gcloud gcloud scheduler jobs resume "$JOB_ID" --location="$REGION" --project="$PROJECT_ID" --quiet
fi

# ------------------------------------------------------------- 4. next steps
step "4/4 Done. Manual verification (only you can do these)"
cat <<NEXT

1. Fire one execution by hand and read the response:

     gcloud scheduler jobs run ${JOB_ID} --location=${REGION} --project=${PROJECT_ID}

   or in the console: Cloud Scheduler → ${JOB_ID} → RUN NOW.
   Expect HTTP 200 with the JSON summary, e.g.
   {"ok":true,"renewals":{"scanned":…,"created":0,"pushed":0},
    "myDayLookbackMs":900000,"myDay":{"scanned":…,"usersWithDueItems":…},
    "flowPathJobs":{…},"content":{…}}
   A 401 means CRON_SECRET does not match the Vercel env var; a 503 means
   CRON_SECRET is not set on Vercel at all.

2. Read the execution history (one line per minute, "Last run" = SUCCEEDED):

     gcloud logging read 'resource.type="cloud_scheduler_job" resource.labels.job_id="${JOB_ID}"' \\
       --limit=10 --freshness=15m --project=${PROJECT_ID} \\
       --format='table(timestamp, httpRequest.status, jsonPayload.status)'

   Console: Cloud Scheduler → ${JOB_ID} → Logs / Cloud Logging →
   log name cloudscheduler.googleapis.com/executions.

3. Confirm the endpoint really ran (not just that the ping returned 200):
   Firestore → settings/pushSchedulerState → lastRunAt should now advance
   every minute.

4. Optional but recommended — alert when a ping stops succeeding:
   create an email notification channel, then
     gcloud alpha monitoring policies create \\
       --policy-from-file=ops/cloud-scheduler-alert-policy.json
   (instructions and the log-based fallback: ops/cloud-scheduler-setup.md).

5. Leave .github/workflows/push-scheduler.yml and push-scheduler-backup.yml
   enabled. They are the free backup; every ping is idempotent and the
   endpoint dedupes per item per local day, so Cloud Scheduler and GitHub
   overlapping changes nothing except reliability.

6. Keep the secret out of git: CRON_SECRET lives in your shell history (run
   'history -d' on the export line if that matters to you), in Vercel, and in
   this job. Never commit it. Full walkthrough: ops/cloud-scheduler-setup.md

NEXT
