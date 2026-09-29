// MY DAY — HEADER SEARCH REMOVED · TASKS PAGE WEARS THE REMINDERS TYPE SCALE
//
// Owner brief (2026-09-29): two My Day asks.

# My Day: header search removed · Tasks page adopts the Reminders type scale

## 1. Header search icon removed

*"My day page per header mein search icon nahin dikhna chahiye — remove karo
use kyunki already page per hai."*

The pages own their search — Tasks has its glass search rail ("Search tasks
by title or subject...") and Reminders its own search box ("Search
reminders…") — so the header's search entry point was the duplicate. Removed
from **My Day only** (the store / revision headers keep theirs):

* the **Search icon tab** in the header's ExpandingTabs cluster (My Day no
  longer passes `onToggleSearch` / `searchActive`);
* the **desktop header search pill** (`centerSearch`, with its Ctrl+K hint);
* the **phone search strip** that only the icon could open, and the
  **Ctrl+K handler** that drove both;
* the now-dead `globalSearch` plumbing (state + the three page props).

The shared `Header.tsx` component is untouched — it still supports the
search props for the routes that use them.

## 2. Tasks page wears the Reminders type scale

*"My day ka reminder page ka jo font hai aur font ka size hai vahi task page
per bhi apply karo — jo heading ka size hai jo sub heading ka size hai etc."*

One shared rule pair now drives BOTH pages (so the sizes cannot drift):

| Element     | Reminders (reference)      | Tasks (now identical)             |
| ----------- | -------------------------- | --------------------------------- |
| Heading     | `.myrem-title` 1.32rem/800, −0.01em, lh 1.15 → 1.5rem from `sm` | `.myday-tasks-title` — same rules, same media step |
| Sub-heading | `.myrem-sub` 0.76rem/500, lh 1.45, muted → 0.83rem from `sm` | `.myday-tasks-sub` — same (muted via the var's fallback) |
| Row title   | `.myrem-card-title` 0.9rem/700 | task title `text-[0.9rem] font-bold` (was 14→15px) |
| Row note    | `.myrem-card-note` 0.74rem/500 | subject line `text-[0.74rem] font-medium` (was 11.5px/600) |
| Mini-card   | chip/note scale            | "Today's Progress" 0.78rem/700 + 0.74rem/500 (was 13px/11.5px) |

The old Tasks hero greeting (`1.9rem → 2.1rem → 2.4rem`) and its subtitle
sizes are gone — the heading dropped ~30–37%, matching Reminders exactly.

## Verification

* `tsc --noEmit` + `vite build` clean.
* `tests/myDayStoreHeaderContract.test.mjs` rewritten for the new shape —
  pins the header search REMOVAL (no toggle/pill/strip/Ctrl+K) and pins the
  shared `.myday-tasks-title/-sub` rules plus the row scale.
* `tests/myDayScenePlateContract.test.mjs` — the strip test now pins the
  strip's removal; the chrome token stays pinned.
* Full `node --test tests/*.test.mjs`: **76 failures, byte-for-byte the
  same set as before this change minus one rename — zero new failures.**
