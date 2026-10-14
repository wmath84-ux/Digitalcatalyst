# AI chat opening and split-resize performance

## Problems found

- The two container ResizeObservers published every pixel into the Lumen App's React state. A divider drag rerendered the chat tree even when no responsive layout decision changed.
- Assistant messages passed freshly allocated image callbacks to memoized Markdown. Crossing a tier (or toggling message UI) reparsed unchanged answers.
- Pagination count belonged to the previously opened chat until an effect reset it. Switching from expanded history could render and parse that entire window for the next chat first.
- IntersectionObserver used the browser viewport as its root. Initial scroll anchoring and resize-induced scroll events could fetch earlier pages without learner input. A real Chromium regression fixture reproduced this during initial open.
- The Composer's unmount draft callback read the mutable *current* active chat ID. After a switch, it could put the previous chat's unsent draft into the newly opened chat.
- Chat updates cloned untouched conversation objects; sidebar rows were nested component definitions that remounted on every Sidebar render.

## Changes

- Publish only semantic layout buckets: frame breakpoints 520/900; column breakpoints include every tier and course-context viewport threshold (272/400/580/700/820/1020/1120). Zero-width hidden tabs retain their previous layout. CSS still reflows continuously as the divider moves.
- Memoize MessageList and stabilize Markdown image callbacks without ignoring callback changes.
- Key the message list by conversation identity (with a unique sibling key), resetting pagination/scroll state before the first render of the next chat. Background generation and cloud history stay in the parent and are not remounted.
- Scope IntersectionObserver to the conversation scroller, require learner scroll intent for automatic pagination, and offer an explicit Load earlier messages button for short histories/keyboard access.
- Remove the artificial 240 ms delay for history already in memory. Retain asynchronous single-flight pagination, cancel timers on unmount/chat change, and prevent stale completions from releasing another request's guard.
- Capture draft ownership in the callback's chat ID rather than a mutable active-chat ref.
- Preserve untouched chat identities, skip no-op history publishes/mirror schedules, hoist sidebar rows, and cancel pending throttled scroll work on unmount.
- Use a stable empty notes default so omitted notes do not repeatedly rehydrate the course bridge.

## Verification

`npm run test:chat` covers the existing chat persistence/theme/capture and split swap tests plus a full Lumen App runtime fixture using the real persistence hook. Only cloud I/O, auth, model configuration and theme I/O are stubbed.

Measured regression assertions (100-message conversations):

- 90 consecutive same-bucket ResizeObserver updates: zero chat commits, message renders or Markdown parses.
- Crossing a layout tier updates the tier without reparsing unchanged Markdown.
- An expanded 45-message history followed by another conversation: exactly 5 initial Markdown parses, not 45.
- Layout-generated scroll/intersection events do not expand history; intentional upward scrolling and the explicit history button still work.
- A new chat opens empty and unsent text remains in its original conversation.
- Untouched conversation identity and no-op updates remain stable.

When Playwright Chromium is installed, the same suite also runs a real browser case: continuously changes the chat container width across animation frames, loads history, opens another old chat, creates a new chat, and verifies draft ownership. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for a system Chromium. Browser runs use the real Lumen components/hooks and native ResizeObserver/IntersectionObserver, with minimal fixture layout CSS, not a production-backend or device benchmark.

Also verified: `npm run test:read`, `npx tsc --noEmit`, and `npm run build:low-heap`. The production build still reports the existing large-chunk warning.
