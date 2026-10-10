# Functional Settings and PDP Paid content

Date: 2026-10-10
Branch: `arena/18f9d121-digitalcatalyst`
Published starting point: `41eda995a0c2adc5dfbdde1dd5f68bae2bb4320c`
PR: <https://github.com/wmath84-ux/Digitalcatalyst/pull/703>

## Requested result

- Redesign the complete Settings page without merely saving cosmetic flags.
- Make switches reversible, including off → on, failed saves, retry and synchronization.
- Add **About / Content / Paid** to PDPs, including paid additions to a free base product.
- Show remaining content first, a divider, then clearly named already-acquired content.
- Keep genuine individual prices, discounts, final payable, access prerequisites and existing commerce/navigation.

## Implementation

### Settings

- Plain professional sections, readable descriptions, native labelled checkbox switches, 44px targets, keyboard/focus support, explicit on/off/saving states and mobile-only breadcrumb removal.
- One UID-scoped preference store and one shared account listener across mounted consumers. Initial HTTP reads no longer reconnect the just-opened listener. Explicit retry reconnects the existing registry entry without orphaning its consumers; old-generation callbacks are discarded.
- Authenticated GET/PATCH reuse the existing serverless dispatcher. Single-field Firestore transactions preserve other fields, increment a bounded revision and record activity consent separately. Neither client-supplied UIDs nor whole-object overwrites select the account being changed.
- Optimistic per-field updates, rollback, intended-change retry, concurrent independent fields, confirmed-snapshot/lost-HTTP-ACK recovery and a bounded authentication/request deadline.
- Explicit malformed values fail closed. Recovering a malformed preference container does not implicitly re-enable email or public visibility.
- Push, email and promotions affect their delivery policies; promotions also filter the inbox and badge. Service updates are not promotions. In-app service alerts and the learner's reminders/data are not deleted by a push opt-out.
- Account consent is separate from OS permission and cloud registration. No Home/startup permission prompts. Explicit browser/native setup is retryable; unsupported/denied permission does not disable the account switch. Denied browser permission requires a change in browser/OS settings, not an impossible programmatic reset.
- Browser registration is bounded and UID-checked; explicit authorization refusals cannot fall through to a cached SDK registration. Native setup is single-flight through permission/channel/listener setup and only reports connection after an authenticated matching-UID server acknowledgement. Late acknowledgements cannot complete a retry. Foreground displays and local alarms are guarded by the UID/opt-out generation across awaits.
- Email uses a bounded, deduplicated private outbox and the current verified Firebase Auth email. It rechecks consent before delivery, skips opted-out/unverified recipients and preserves retryable provider failures. The TLS SMTP client handles fragmented/multiline replies and reports acceptance only after DATA is accepted.
- Public profiles expose only permitted identity and explicitly opted-in aggregate counts. Public identity/activity routes recheck current visibility. The leaderboard no longer falls back to unverified browser Firestore cache; even server cache responses require fresh per-user privacy verification.

### Paid content and ownership

- Remaining named modules/resources/update packages precede `<hr data-pdp-paid-divider>` and the acquired list. Labels distinguish purchased modules/resources/updates, base inclusion and time-limited subscription access.
- Paid selections feed the retained purchase builder and one verified quote/checkout controller. Dependencies normalize synchronously; rapid scope changes cannot display a previous scope's verified total. Clear/reselect works, account changes reset intent, and incoming purchases remove repeated purchase intent while moving their rows below the divider.
- Owners can still apply a real coupon to a payable add-on. Itemised MRP/sale and coupon reductions and final payable remain visible. Coupon normalization preserves null/unlimited usage limits and discount caps instead of treating null as a zero-use coupon.
- Shared catalogue mapping carries update membership, hidden ancestry, optional bundle boundaries, resource membership and legacy `courseContent`/`files` consistently into Paid, access and pricing. About/Content describe the genuine base bundle, not optional additions.
- An update/module/resource receipt never grants its parent product. The real CatalogProvider uses UID-scoped, active, provenance-aware ownership, not every purchase document's parent ID. PDP ownership is authoritative/readiness-safe.
- Canonical grants recognize actual `module`, `resource` and free-grant kinds. Missing/null expiry remains indefinite, while explicit malformed/elapsed expiry does not. Numeric, Timestamp and seconds/_seconds representations are supported.
- Canonical scope authority prevents old legacy receipts/arrays resurrecting an expired or revoked grant. Independent scopes and a currently active subscription remain valid. A genuinely new verified order can replace inactive scope; an old verified payment replay cannot reactivate a revoked grant.
- An acquired update without its base and a dependency-blocked acquired module remain acquired, with prerequisite guidance, rather than becoming another purchase offer.
- Explicit sale ₹0 remains zero; an above-MRP sale cannot overcharge; junk prices do not turn into free grants. Server quotes remain the price authority; no missing original price is invented.

## Executed verification

| Check | Result |
|---|---|
| New Settings/Paid production-component browser suite | **30/30 passed** |
| Full selected browser regression run, 6 files | **104/104 passed**, no skipped checks, about 279.77s |
| Authenticated preference/public/delivery/quote/grant/native runtime suite | **23/23 passed**, mocked external boundaries |
| Broad focused commerce/access/preferences/notification suites, 59 files | **914 executed: 911 passed, 3 reproduced pre-existing failures** |
| Production build, 3072MB heap | **Passed, 49.78s**, existing large-chunk warnings |
| TypeScript exact diagnostic fingerprints | **37 baseline / 37 current / 0 new / 0 removed** |
| Five real API-entry esbuild bundles | **Passed** |
| `git diff --check` | **Passed** |

Browser suite: `tests/settingsPaidBrowser.test.mjs` uses the actual Settings/PDP pages, preference/access/shared-listener/quote controllers, pricing engine and styles. It also mounts the actual CatalogProvider. Only Auth/Firestore/HTTP/OS I/O boundaries are deterministic fixtures. Covered 320–1920px bounds, desktop/mobile breadcrumbs, keyboard switches, reload persistence, concurrent saves, rollback/retry/lost ACK, cross-device snapshots, UID changes, failed stream recovery, OS denial/configuration, native ACK/listener reuse, public withdrawal, partial/expired/revoked grants, dependencies, genuine numeric ₹0, coupons, quote races, scoped checkout, acquisition while open and remaining/divider/acquired ordering.

Existing browser suites exercised Home/PDP, Profile/Purchases/Usage Limits, Subscription, Review → Payment → Done, Study Library, native overlays, Store and desktop Leaderboard. Obsolete two-tab/automatic-owned-upgrade assertions were updated to the requested explicit Paid surface; authority, payment, navigation and pricing assertions were not removed.

### Pre-existing failures, not concealed as an all-green repository

The following three tests also fail against a read-only mirror of published `41eda99`:

1. `notificationBrandingLogoContract`: service-worker icon expression is pinned to branding-only rather than the already-published contextual-icon/fallback expression.
2. `notificationBrandingLogoContract`: local system icon expression is similarly pinned to branding-only.
3. `userQueryCardContract`: expects the previously removed Home Explore queries button. The queries route/card are outside this request.

The mirror run executed 19 checks: 16 passed and exactly these 3 failed. The current broad run has the same failure names and no additional failures. These tests are left unchanged, not weakened to make the result look green.

## Deployment and limits

- Deploy the updated API dispatcher/routes and **`firestore.rules` together**. Rules now deny direct public leaderboard-cache reads and protect preference revisions/maps and purchase-receipt creation from direct purchaser writes. Admin/server payment grants remain authorized. Rules were source-reviewed, not compiled in a live Firestore emulator in this sandbox.
- Configure browser VAPID/FCM as appropriate and the existing TLS SMTP environment (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) in the hosting provider, never in chat or source control. An environment-present capability is not proof of delivery health.
- No live bank payments, production account writes, mailbox deliveries or physical Android background deliveries were performed. Browser/SDK/HTTP boundaries are fixtures; real OS/provider/background/shared-device registration rotation still needs deployment/device QA.
- Outbox deduplication and a stable Message-ID are not a claim of exactly-once mailbox delivery: SMTP acceptance followed by a process crash can still require operational reconciliation.
- Hiding a profile prevents future publication, not retroactive erasure of a previously learned identity/photo URL.
- The repository remains non-TypeScript-clean because of the unchanged 37 diagnostics outside this task.
- Dependency manifests are unchanged. Generated builds, browser dependencies/binaries, screenshots, temporary baseline mirrors and validation logs remain ignored under `scratch/`/`dist`/`node_modules`, not in the patch.
