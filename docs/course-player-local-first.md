# Course player: local-first persistence

## Behaviour

- The main lesson waits for access resolution and local playback restoration,
  not Notes, Mind Map or Sketch cloud reads. Access checks remain mandatory.
- Progress/resume use an account-and-course-scoped device copy and durable outbox.
  Changes are visible locally before backup. One initial cloud read merges pending
  per-file operations; there is no progress snapshot listener.
- Progress uploads coalesce on a 30-second interval. Completion uses array union/
  remove operations so unrelated completion IDs from other devices survive.
  In-flight acknowledgements only clear the revisions they actually uploaded.
- Notes restore the existing local mirror and fetch the remote list once, not via
  a live subscription. Remote edits are retrieved on reopen, an explicit
  refresh, **or when the learner comes back to the tab/app (visibilitychange /
  online) once the last read is older than a minute** — and the Mind Map library
  behaves the same way, plus on every fresh opening of its dock tab. Both reads
  are refused while this device still has unacknowledged edits, so freshness can
  never race a save (rule: `src/course/cloudFreshness.ts`). Existing merge,
  tombstone, retry and account-scope safeguards remain.
- Notes and Mind Map automatic backup use 30 seconds of quiet. Sketch uses 30
  seconds of quiet with a two-minute maximum while drawing continuously; its
  existing 350-ms local checkpoint remains. Explicit Save, lifecycle flushes,
  retry and delete operations may back up sooner.
- Cached sketches/maps may render before remote hydration finishes. The remote
  conflict guards are NOT bypassed by claiming a document is loaded early.
- Playback events update memory immediately; device writes coalesce for 1.5 s.
  Hide/exit flushes use the captured course store, not a newly opened course's data.

## Storage and limitations

This iteration reuses browser **localStorage** and existing formats; it does not
migrate notes/sketch attachments to IndexedDB or the user's filesystem. Browser
storage normally needs no permission prompt. No device-wide file permission is
requested. Quota/private-mode failures are surfaced for progress/notes/map edits;
cloud retry remains available. Storage capacity is browser-dependent.

Clearing site data before backup completes can erase unsynced work. Closing or
crashing within the small playback/sketch checkpoint window may lose that last
position/stroke. Lifecycle cloud uploads are best effort, not guaranteed on browser
termination; durable device copies/outboxes are used on the next open. Live remote
updates are intentionally no longer shown while editing Notes. This is not a
complete offline entitlement/course-content download system.

Runtime validation uses mocked network/storage boundaries. Browser profiling on
representative low-end devices is still needed; this change reduces known write/
listener/loading churn, not a measured guarantee that every source of lag is gone.
