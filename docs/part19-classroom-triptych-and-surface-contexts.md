# Part 19 — the boards load, the mind map saves, and the front wall is a triptych

> Owner report, sitting in the room:
> *"content play nahin ho raha main board par — **Lecture board could not load.
> The rest of the classroom is still live.** Aur mind map aur note save nahin ho
> rahe. Center mein main board jis par modules content dikhenge, left side mein
> mind map, right side mein note — aur size utna hi bada kar do jitna bada main
> board ka size hai. Zoom button ko three-tap functional banao: pahle click mein
> board par focus, dusre mein note, teesre mein mind map. Aur fit screen ko dual
> functional: pahle click mein fit, dusre click mein keval board zoom, aur again
> click wapas fit — ese continuous chalta rahe. Board itna acche se ho jaaye ki
> screen par zoom in hokar fit ho jaaye aur kuchh na dikhe aaspaas."*

Five separate faults and one layout change. Each is pinned by
`tests/classroom3dTriptychAndContextBridgeContract.test.mjs`.

---

## 1. Why the lecture board could not load — drei's `<Html>` is a second React root

`@react-three/drei`'s `<Html>` does **not** portal its children. Read the
installed source (`node_modules/@react-three/drei/web/Html.js`):

```js
React.useLayoutEffect(() => {
  const currentRoot = root.current = ReactDOM.createRoot(el);   // ← a NEW root
  …
}, [target, transform]);

React.useLayoutEffect(() => {
  root.current.render(<div …>{children}</div>);
});                                        // ← every render
```

`createPortal` would have carried React context across. `createRoot` does not:
**a new root is a new context universe.** Everything provided above `<Canvas>`
— `AuthProvider`, `BrandingProvider`, all of it — was invisible on every surface
in the room.

That stayed hidden until a panel reached for one. The lecture board's body is
the player's own `ResourceViewer`, and it calls `useAuth()`:

```ts
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
```

So the board threw on mount, `SurfaceFrame`'s error boundary caught it and
painted *"Lecture board could not load."* The notes and mind boards consumed no
app context, kept working, and made a room-wide failure look board-specific.

R3F already solves this one level up — `<Canvas>` wraps its children in its own
`useContextBridge()`, so a component **inside** the canvas can read the app's
contexts normally. The room was simply missing the second hop.

### The fix: `src/classroom3d/SurfaceContexts.tsx`

```tsx
const contexts = useSurfaceContexts();     // inside the canvas — contexts exist here
…
<Html transform …>
  <SurfaceContexts value={contexts}>       // re-provided inside the <Html> root
    <PanelBoundary label={label}>{children}</PanelBoundary>
  </SurfaceContexts>
</Html>
```

* `useSurfaceContexts()` reads a **fixed, unconditional** list of `useContext`
  calls (auth, branding, catalog, commerce, connectivity, feature visibility),
  so hook order can never vary between the focus hops and pinch ticks that
  re-render a surface.
* The snapshot is `useMemo`'d, so a pinch tick does not hand every consumer a
  fresh identity.
* Only **values** cross — never a provider. No duplicated Firestore listener,
  no second auth subscription, no copied state.
* `SurfaceFrame` **and** `DeskConsole` wear it: the desk tablet is a `<Html>` of
  its own and had exactly the same hole.
* The six context objects are now exported from `src/context/*`. A context added
  later only has to be appended to the one list.

The contract test asserts the premise against the **installed** drei source
(`ReactDOM.createRoot(el)`, and *no* `createPortal`), so a library bump that
changes this fails the suite instead of silently emptying the room again.

### A crashed panel is no longer a dead end

`PanelBoundary` swallowed the reason, which is how a one-line context error
survived long enough to be reported as "content play nahin ho raha". It now
prints the real message on the slab itself and offers **Try again** — a
transient throw (a suspended asset, a first-frame race) usually renders fine the
second time, and a persistent one can finally be named out loud.

## 2. Why the mind map did not save

`useCourseMindMap` debounces every edit by 700 ms. `scopeRef` — which document
that edit belongs to — is reassigned **on every render**. So a lesson or module
switch inside the debounce window left the timer pointing at a scope that no
longer existed, and the load effect dropped `readyRef` before the timer fired,
at which point `persist()` refuses to run. The branch the learner had just added
was silently thrown away.

In the flat player a tab change called `flush()` and covered it. **The room has
no tabs**, so switching lesson from the desk console hit the hole every time.

* `pendingScopeRef` captures the scope when the write is **queued**.
* `persist(override?)` accepts it, so a stale debounce still lands on the map
  the learner was drawing on.
* The load effect flushes the outgoing map **before** it drops `readyRef`.
* `flush()` honours the pending scope too, so leaving the room stays safe.

## 3. Why the notes / mind boards were unusable

Two things, both fixed by the layout:

* Entering the room reset the mind board to its **library overlay** — a grid of
  maps covering the canvas. That made sense for the flat player, where the mind
  map tab *is* the map chooser. The room has a dedicated mind board and its own
  **Maps** key in the tray, so the overlay just hid the thing the wall exists to
  show: the learner tapped the wall, nothing seemed to happen, and the map read
  as "save nahin ho raha". `returnStudySurfacesToLibrary(room)` now opens the
  room on the **canvas** and leaves the flat player on the library.
* The notes wall was turned **56°** and the mind wall **90°** away from the
  seat. A DOM panel on a slab that is angled away is projected through a CSS 3D
  perspective, and every pointer→content mapping inside it — React Flow's node
  dragging, a `contentEditable` caret — is computed against a bounding box that
  no longer matches the pixels. **All three boards now face the seat square-on**,
  and the FILL pose below puts the camera dead in front of whichever one is
  focused, so the projection is a pure uniform scale and the panels behave like
  ordinary flat UI.

## 4. The front wall is a triptych

```
   ┌──── MIND MAP ────┬──── LECTURE BOARD ────┬──── NOTES ────┐
   │   (left board)   │  (centre: the lesson)  │ (right board) │
   └──────────────────┴────────────────────────┴───────────────┘
```

Three slabs, **all the same size** (6.4 × 3.05 m — the lecture board's existing
size, so nothing shrank), all flat on the front wall, all square-on to the seat.

Every measurement moved into **`src/classroom3d/roomGeometry.ts`**, because four
files have to agree and the bug class that creates is a board that moved in one
of them and not the others:

| Consumer | Reads |
|---|---|
| `Room.tsx` | `ROOM` (the shell widened 12 m → **21.5 m** so the side walls sit outside the outer bezels), fog pushed out |
| `mergedStatics.ts` | `ROOM` → the window bays and the bookshelf derive their wall x; a hardcoded `5.94` would have left the windows floating six metres inside the new wall |
| `Classroom3D.tsx` | `BOARD`, `BOARD_X` → the three `SurfaceFrame`s and the 21 m chalk slab behind them |
| `state.ts` | `yawToBoard()` / `pitchToBoard()` → the focus presets are **derived**, never retyped |
| `SeatRig.tsx` | `BOARD`, `BOARD_X`, `fillDistance()` → the FILL pose |
| `WallVisibility.tsx` | `BOARD`, `BOARD_X`, `bearingToBoard()` → which walls are on screen |

Yaw and pitch limits follow the row: it spans ±10.1 m from a seat 5.9 m away, so
`YAW_LIMIT` opened to ±~1.15 rad — the head turn can actually reach the end
boards now.

`WallVisibility` also stopped using **seat-relative** angles. The FILL pose
slides the eye up to 7 m sideways, and a baked seat angle would have kept the
other two boards "on screen" long after the camera had glided past them. It now
takes the bearing from the **live camera position** and the board's angular
half-width at the **live distance** — still edge-triggered, so the DOM is touched
only on visibility edges.

## 5. FIT ⇄ FILL — "kuchh na dikhe aaspaas"

`boardZoom` is no longer "how far the seat leans forward in metres". It is a
**blend between two camera poses**, interpolated on the same spring as the head
turn:

| | pose |
|---|---|
| **FIT** (`1`) | the camera at the seat, head turned to the focused board — that board in perspective with its neighbours at the edges of the frame. The room. |
| **FILL** (`2`) | the camera glides **square-on** to the focused board and stops at the distance where the slab covers the entire viewport. Only the board. |

The distance is computed, not tuned — `fillDistance(width, height, fovDeg,
aspect)` in `roomGeometry.ts`. three.js `fov` is the **vertical** angle and the
horizontal one follows from the aspect (`tan h = tan v × aspect`); the slab
covers the frame only when it covers **both** axes, so the tighter constraint
wins, with a 3 % overscan so not even a rounded bezel pixel can show:

```
landscape 16:9 (47.4° v) → 3.42 m   portrait 9:16 (96° v, clamped) → 1.33 m
```

That is why the hand-tuned `BOARD_ZOOM_PORTRAIT_FIT = 1.15` is gone: SeatRig
reads the **live** `camera.fov` and `size`, so the same call is exact in both
orientations and survives a lens change. The test executes the function and
asserts the resulting distance really does cover the frame in both.

Two details that make FILL usable rather than merely impressive:

* **Square-on means zero skew** — the board's DOM is a pure uniform scale, which
  is what makes React Flow dragging and the note editor's caret land where the
  finger actually is (§3).
* **The breathing sway is damped out** as the blend approaches FILL, so a board
  that is supposed to cover the screen never drifts a pixel off its own edges.

The path was checked against every prop: the test walks the seat→FILL line for
all three boards and fails if the camera ever comes within 0.35 m above the
learner's desk, the mug, the teacher's desk or the front desk row.

## 6. The two keys

**THREE-TAP FOCUS** — *"pahle click mein board, dusre mein note, teesre mein
mind map, aur ese baar baar click karne par switch hota rahe."*

```ts
export const FOCUS_CYCLE = ["board", "notes", "mind"] as const;
export const nextFocusInCycle = (current) => {
  const index = FOCUS_CYCLE.indexOf(current);
  if (index < 0) return FOCUS_CYCLE[0];                    // the desk starts at the board
  return FOCUS_CYCLE[(index + 1) % FOCUS_CYCLE.length];    // …and it never stops cycling
};
```

The key carries the surface it is **on**, not the one it is going to, so the
order never has to be remembered. The desk is deliberately not in the cycle —
cycling into it would drop the learner's head onto the tablet every third tap.
The blend is left alone, so a filled learner cycles through **three full-screen
boards** and a fitted one cycles through the room.

**DUAL-FUNCTION FIT** — *"pahle click mein fit, dusre click mein keval board
zoom, aur again click wapas fit."*

```ts
setBoardZoom((current) => (current > BOARD_ZOOM_MIN + 1e-6 ? BOARD_ZOOM_MIN : BOARD_ZOOM_MAX));
```

One key, two states, alternating for as long as it is tapped. "Am I at fit?" is
read from the **live blend** rather than a second flag, so the wheel and a pinch
— which sweep the same blend continuously — can never leave the key disagreeing
with the camera. The glyph flips `Maximize` ⇄ `Minimize` and the key lights amber
while the board is covering the screen.

Both keys live **twice**: on the lecture board's chrome and in the always-visible
control tray, because the board chrome is only readable while the board is faced
and the whole point of the focus key is to leave the board you are looking at.
Double-tap / double-click on a board is the same FIT ⇄ FILL flip
(`toggleBoardZoom === toggleFitFill`), and the keyboard gains `C` (cycle) and
`F` (fit/fill) alongside the existing `1–4`, `←/→`, `+`/`−` and `0`.

The old `+` / `−` pair is gone from the board chrome — one cycle key and one
two-state fit key replace them. Continuous sweep survives on the wheel, the
pinch and `+`/`−` on the keyboard.

## 7. Unchanged on purpose

* The room is still a **shell**: `{board}`, `{notes}` and `{mind}` each appear
  exactly once, no portal, no duplicated viewer. Firestore progress, resume
  playback, paid modules, rich-text notes and the full mind map editor all still
  come from the player's own panels.
* Part 13's performance contract: merged statics (the extra lamps are boxes in
  the same single mesh), the same light **count**, shadows baked once, the fps
  governor, edge-triggered wall gating, drag fidelity.
* Part 14's embed treatment: impostor swap, YouTube step-down, transform
  throttle, lazy boot. Wheel and pinch now work on **any** of the three boards
  rather than the centre one only; the motion signal still excludes the sway.
* Part 18's px→metre mapping: all three boards still go through `surfaceScale()`.
* The flat player. Every change here is inside `src/classroom3d` plus the two
  targeted fixes in `useCourseMindMap` and `CoursePlayerApp`.

## 8. Verification

| | |
|---|---|
| `npx tsc --noEmit` | byte-identical to the baseline — only the 6 pre-existing unrelated errors |
| `npm run build` | ✓ 3381 modules, `dist/index.html` ≈ 4,306 kB (1,188 kB gzipped) |
| `node --test tests/*.test.mjs` | **2229 pass, 0 fail** |

Three older contract files were **updated rather than worked around** —
`classroom3dBoardZoomFullscreenContract` (the lean is a pose blend now; the
cluster is cycle + fit/fill), `classroom3dPerformanceContract` (wall visibility
reads live camera position) and `classroom3dEmbedImpostorContract` (the sway is
damped by the blend) — with the new behaviour asserted in place of the old.

Review the room without auth or Firestore at **`#/dev/classroom-3d`**; it feeds
the demo course and local-only notes / mind map, and now exercises the context
bridge exactly like the real player does.
