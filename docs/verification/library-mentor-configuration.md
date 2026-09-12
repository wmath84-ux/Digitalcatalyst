# Study Library / AI Mentor configuration update

## Traced architecture

- Library: `StudyLibraryPage` → `usePersonalModules` → `personalCourseClient` → authenticated POST `personalCourse.library` → existing `api/referral-leaderboard` multiplexer → `handlePersonalCourse` → subscription/current + subscriptionPlans + owner module collection and `resources` collection-group query → `{ok,data:{access,usage,modules,savedResources}}`.
- Personal resources, including official-resource references saved into the library, are read from the existing owner hierarchy. Purchased course ownership is still provided separately by Catalog/Commerce and checked by the existing official-resource access logic. No purchased/enrolled collection was replaced or duplicated.
- The requested `components/AiMentor.tsx` does not exist in this checkout. The production Course Player uses `src/lumen/App.tsx` → `productionAi.ts` → `askModuleAi` → `personalAi.ask` → existing Revision provider adapters and transactional allowance ledger.
- Revision's learner configuration is **UID-scoped localStorage**, `dc_ai_user_config_<uid>`, not a remotely persisted user config. School settings are the existing remote `settings/revisionCatalog.aiSettings` document. No new configuration document/storage key was introduced.

## Confirmed code defects corrected

1. Lumen discarded the actual request error when setting assistant status to `error`. It now retains safe text/category/retryability, preserves the original user message, and invokes the existing request on retry.
2. The chat hardcoded school source independently of Revision. Own-source overrides could send the effective school config as the learner's own config. Requests now re-read Revision's saved source and own config, refuse disabled/missing config, and verify the supplied UID against Firebase's current user.
3. Model/source picker now subscribes to the existing school document and Revision save/storage/focus events. It displays saved provider/model values rather than a static model catalog. Selecting a source updates Revision's existing preference. School requests still resolve the latest school model on the server, not from browser credentials.
4. Saved missing models are no longer fabricated from the known-model registry. Mentor opts out of the existing Revision backend's retired-model migration. The Revision question generator's explicitly implemented fallback remains intact. Unscoped legacy browser keys are no longer silently assigned to a newly signed-in learner; those users must explicitly reconnect their key.
5. Provider adapters previously flattened HTTP failures into untyped 502 responses. Mentor now distinguishes rejected keys, missing/unsupported model, invalid provider settings, provider quota, school credentials and temporary provider failures. Unknown/provider diagnostics are not echoed to the learner. Subscription/token-budget error codes and their safe plan/reset messages remain authoritative.
6. A synchronous in-flight guard prevents duplicate sends/retries before React rerenders. Model picker is disabled during generation. Timeout/cancellation also covers response-body reading. Existing viewport/keyboard code is unchanged.

## Library deployment dependency and remaining diagnosis

The actual library query is:

`collectionGroup("resources").where("ownerUid", "==", verifiedUid)`

Firestore requires a collection-group-scoped single-field index for this query. This checkout had no index manifest or `firebase.json` index deployment wiring. `firestore.indexes.json` now declares that index, preserving the collection-scope index modes, and Firebase deployment config references it. Server handling identifies the actual Firestore missing-index failure code without exposing the index-console URL. Library reads have a 30-second request/body timeout, await Firebase initial auth, distinguish sign-in/access errors, validate snapshots including usage, and keep empty arrays as successful loaded-empty results. Retry reissues the read.

**This is a confirmed missing deployment declaration, not proof that the production database currently lacks the index.** The sandbox has no Firebase Admin credentials or authenticated learner session. Unauthenticated production probes to both endpoints failed during TLS establishment, before an HTTP response. Production logs/network evidence and a live Basic-account retest are still required to identify/confirm the exact reported account failure. No remote deployment was performed.

Deployment follow-up:

1. Inspect production Library failure code/logs. If `LIBRARY_INDEX_REQUIRED` / Firestore failed-precondition mentions an index, deploy the declared `resources.ownerUid` collection-group index and wait until READY.
2. Use the project's Firebase deployment process (`firebase deploy --only firestore:indexes --project <target>`). Review existing remote indexes and preserve unrelated indexes; do not approve unrelated deletions or use `--force` blindly.
3. Deploy the frontend/shared API changes together.
4. Verify real logged-in Library items/empty state/retry and School/Own AI requests with the account's actual feature grants and allowance.

## Entitlement behavior

No Basic/Pro name-based frontend restriction was introduced. Server policy still reads active subscription and configured Revision/AI Mentor feature grants. The existing Basic test fixture grants both `revision` and `ai-mentor`; it succeeds through the real Mentor handler and allowance transaction with a mocked provider. School AI still reserves/finalizes the existing budget; own-key AI retains the existing unmetered school-budget policy. No authorization or quota bypass was added. Production account grants, school credentials and remaining allowance were not available for inspection.

## Navigation

The existing primary `BottomNav` / `GlassDock` gets My Study Library, pointing at `#/study-library`, with correct active state on the Library route. Scoped CSS provides always-readable wrapping labels, 44px buttons and wider tablet spacing. It preserves safe-area padding and the existing measured footer clearance. Flow's own dock, course-player dock and desktop navigation are unchanged.

## Validation (Node 22.22.3, pnpm 10.34.5)

- `git diff --check`: pass.
- `pnpm run build`: pass.
- Frontend `tsc --noEmit`: 8 pre-existing diagnostics; byte-for-byte same diagnostics as an untouched HEAD archive.
- API `tsc -p tsconfig.api.json --noEmit`: 31 pre-existing diagnostics, same as HEAD aside from line offsets (FlowPath, Study Packs, and the existing Revision usage-tally variable shadowing).
- `pnpm run lint`: unavailable; package has no lint script/configuration. Not reported as a pass.
- Full `node --test tests/*.test.mjs`: **2325 pass, 1 fail, 0 skipped** (2326 total). Remaining failure is `liquidGlassWaveFiveContract`: pre-existing native controls in Lumen CoursePlayer / Study Pack dialogs/pages. Reproduced against untouched HEAD.
- Focused new/extended runtime files: **25/25 pass**. Actual client and server modules are bundled; Firebase/network boundaries are mocked, not production code paths replaced with fake success.
- Explicit esbuild dev dependency added because existing tests require its root package/bin; pnpm otherwise leaves it as an inaccessible transitive Vite dependency and skips/fails those runtime tests.
- Library runtime: owner-scoped server query, module/saved mapping, cross-owner path exclusion, empty success, auth failure, missing-index classification, client malformed snapshot, network retry, safe permission text.
- Mentor runtime: Basic school-provider success, changed school model, own model, budget ledger, provider failures releasing reservations, no secret leakage, saved source/model refresh, disabled/missing config, UID mismatch, invalid/unknown errors, no fabricated model or unowned legacy key.
- Navigation React/jsdom runtime: one shared dock, seven destinations, active Library label, correct Library/Flow routing and existing Home callback.
- Real-browser/mobile/tablet geometry and keyboard interaction **not verified**: Chromium is absent and Playwright's download failed with TLS ECONNRESET. DOM interaction tests do not establish pixel geometry. Real-device width/safe-area/model-picker/keyboard checks remain pending.
