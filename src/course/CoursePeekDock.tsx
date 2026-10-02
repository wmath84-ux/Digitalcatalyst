// src/course/CoursePeekDock.tsx
//
// The Course Player's footer navigation, rebuilt as the SAME bottom-centre
// peek dock the desktop shell already uses
// (src/components/glass-dock/DesktopPeekDock.tsx):
//
//   · a thin frosted-glass LINE sits at the very bottom centre of the player;
//   · tapping the line (or hovering it with a pointer) OPENS the footer dock
//     — the exact same GlassDock the study pane used to hold;
//   · HOLD + DRAG across the line scrolls the dock: the dock opens on the
//     press, the magnification wave follows the finger left/right (the line
//     drives GlassDock's pointer X), and lifting the finger SELECTS the tab
//     nearest to it — the button the finger settles on is clicked;
//   · once open, swiping LEFT / RIGHT across the dock itself and lifting the
//     finger on a tab selects that tab (GlassDock's own onPointerUp);
//   · picking a tab (or tapping away / tapping the line again) closes it.
//
// Pointer (mouse) interaction works the desktop way: enter reveals, leave
// hides. Touch has no hover, so a tap TOGGLES the dock open/closed and it
// stays open while the learner swipes it. Selecting a tab always closes.
//
// ── ONE INTERACTION AREA, NOT TWO HOVER TARGETS (owner brief 2026-10-02) ──
//
//   "Footer navigation tabhi hide ho jab user actual interaction area se bahar
//    chala jaaye."
//
// The line (the hit strip) and the dock are one gesture path, so a pointer
// travelling from the line to the buttons must never hide the dock — even when
// no enter ever reaches the panel (a touch/pen drag has no hover events at all,
// a pointer capture suppresses enter/leave everywhere else, and a fractional
// device-pixel ratio can open a hairline seam between the strip's top edge and
// the panel's bottom edge). `hide()` therefore schedules the close and then
// asks the shared AREA rule (src/components/glass-dock/peekDockArea) instead of
// the event: while the pointer's last known position is inside the line + panel
// union, the dock stays exactly where it is.
//
// ── The ONE keyboard rule ────────────────────────────────────────────────
// While the soft keyboard is open the footer navigation is HIDDEN — in both
// of its homes (this peek dock and the legacy in-pane dock inside the study
// pane). It must never appear above the keyboard, between the keyboard and
// the writing surface: the screen belongs to the active feature (notes /
// mind map / AI chat) plus the keyboard, nothing else.
//
// The answer comes from the player's single keyboard state
// (`useCourseKeyboard()` — src/course/useCourseKeyboard.tsx), which is the
// same state the study pane takes the deck over with, so the footer, the
// lesson pane and the writing surface can never disagree. The dock is hidden
// as a class rather than unmounted on purpose: dismissing the keyboard brings
// back exactly the dock the learner had, with no remount flicker and no
// chance of a second footer existing while the first animates away.

'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useMotionValue, type MotionValue } from 'framer-motion'
import GlassDock, { type GlassDockItem } from '../components/glass-dock/GlassDock'
import GlassMaterial from '../components/glass-dock/GlassMaterial'
import { isInsidePeekDockArea, peekDockAreaOf } from '../components/glass-dock/peekDockArea'
import { buildDockItems, type DockTab } from './CourseOverlay'
import { useCourseKeyboard } from './useCourseKeyboard'

/** Horizontal travel (px) below which a press counts as a tap, not a drag. */
const DRAG_SELECT_THRESHOLD = 12

/** The element-level grace before a leave commits: long enough to cross a gap. */
const CLOSE_GRACE_MS = 80

export default function CoursePeekDock({
  tab,
  onTabChange,
  hiddenTabs,
}: {
  tab: DockTab
  onTabChange: (tab: DockTab) => void
  /** Tabs this player hides — a learner-authored course has no Paid tab. */
  hiddenTabs?: DockTab[]
}) {
  // The player's one keyboard state: while it says the keyboard is open, this
  // footer navigation is hidden entirely (rule + reasoning in the header).
  const { keyboardVisible } = useCourseKeyboard()
  // `hover` covers pointer (mouse) hover; `pinned` covers the touch tap
  // toggle. The dock is open while EITHER is true.
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  // Whether the dock was PINNED when the contact started. Deliberately not the
  // `open` flag: a touch fires a synthetic enter before its pointerdown, so the
  // dock is already open by then — reading that would turn the first tap into a
  // close.
  const wasPinnedRef = useRef(false)
  const pointerTypeRef = useRef('mouse')
  // The pointer's last known position, so the close below can be decided by
  // GEOMETRY (the line + panel area) instead of by whichever enter/leave the
  // browser happened to deliver.
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  // Read inside the close timer: it must see the CURRENT pin, not the one the
  // callback was created with.
  const pinnedRef = useRef(false)
  pinnedRef.current = pinned
  // The magnification wave's pointer X — the dock follows it. Shared so the
  // LINE's hold-drag drives the same wave the dock's own pointer moves do.
  const pointerX: MotionValue<number> = useMotionValue(-200)

  const open = hover || pinned

  const rememberPointer = useCallback((x: number, y: number) => {
    pointerRef.current = { x, y }
  }, [])

  /** Is the pointer still inside the line (hit strip) + panel area? */
  const pointerInArea = useCallback(() => {
    const point = pointerRef.current
    if (!point) return false
    return isInsidePeekDockArea(point.x, point.y, [
      peekDockAreaOf(lineRef.current),
      peekDockAreaOf(panelRef.current),
    ])
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const show = useCallback(
    (event?: ReactPointerEvent<HTMLElement>) => {
      if (event) rememberPointer(event.clientX, event.clientY)
      cancelClose()
      setHover(true)
    },
    [cancelClose, rememberPointer],
  )

  const hide = useCallback(
    (event?: ReactPointerEvent<HTMLElement>) => {
      if (event) rememberPointer(event.clientX, event.clientY)
      cancelClose()
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null
        // Pinned = touch/pen: the outside tap (or a selection) owns the close.
        if (pinnedRef.current) return
        // A pointer between the line and the buttons is still in the area.
        if (pointerInArea()) return
        setHover(false)
      }, CLOSE_GRACE_MS)
    },
    [cancelClose, pointerInArea, rememberPointer],
  )

  // A pinned (touch) dock closes when the learner taps anywhere outside it —
  // the content tap still lands, so a module row can be opened in one go.
  useEffect(() => {
    if (!pinned) return undefined
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && root.contains(event.target)) return
      setPinned(false)
      setHover(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pinned])

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    },
    [],
  )

  // While the dock is live, keep the pointer's position current — the close
  // timer reads it. Window-level, so the wave's finger is tracked even when a
  // pointer capture has retargeted its moves.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    const onMove = (event: PointerEvent) => rememberPointer(event.clientX, event.clientY)
    // A mouse leaving the document is out of the area by definition; a touch /
    // pen release must NOT be (its leave fires on the very point tapped).
    const onDocumentLeave = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      // Only a real exit from the WINDOW counts: `pointerout` fires for every
      // element-to-element move and bubbles here, and nulling the tracked
      // position on one of those would re-create the very bug this rule fixes.
      if (event.relatedTarget) return
      pointerRef.current = null
      hide()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onDocumentLeave)
    document.addEventListener('pointerout', onDocumentLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onDocumentLeave)
      document.removeEventListener('pointerout', onDocumentLeave)
    }
  }, [open, hide, rememberPointer])

  const items: GlassDockItem[] = buildDockItems(tab, hiddenTabs)

  /** The tab whose dock item's horizontal centre is nearest `clientX`. */
  const tabAtX = useCallback((clientX: number): string | null => {
    const root = rootRef.current
    if (!root) return null
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-glass-dock-item]'))
    let best: string | null = null
    let bestDist = Infinity
    for (const node of nodes) {
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const dist = Math.abs(rect.left + rect.width / 2 - clientX)
      if (dist < bestDist) {
        bestDist = dist
        best = node.getAttribute('data-glass-dock-item')
      }
    }
    return best
  }, [])

  const handleSelect = useCallback(
    (id: string) => {
      setPinned(false)
      setHover(false)
      pointerX.set(-200)
      onTabChange(id as DockTab)
    },
    [onTabChange, pointerX],
  )

  const close = useCallback(() => {
    setPinned(false)
    setHover(false)
    pointerX.set(-200)
  }, [pointerX])

  // `hidden` (display:none) takes the line AND the open dock out of the layout
  // entirely — no strip of glass above the keyboard, and no hit strip either,
  // so a stray tap near the keyboard can never open the footer mid-typing.
  return (
    <div
      ref={rootRef}
      data-course-peek-dock=""
      data-open={open ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      data-keyboard-hidden={keyboardVisible ? 'true' : 'false'}
      className={`fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center ${keyboardVisible ? 'hidden' : ''}`}
    >
      <div
        ref={panelRef}
        data-course-peek-panel=""
        aria-hidden={!open}
        inert={!open}
        onPointerEnter={show}
        onPointerLeave={hide}
      >
        <GlassDock compact items={items} onSelect={handleSelect} pointerX={pointerX} />
      </div>
      {/* The line's HIT STRIP: the 8px visual pill alone is a brutal touch
          target (and sits right on the Android gesture bar in fullscreen), so
          every pointer/keyboard handler lives on this taller transparent
          strip that centres the pill at its bottom. The pill itself is pure
          paint — same look, much more clickable. */}
      <div
        ref={lineRef}
        data-course-peek-line-hit=""
        role="button"
        tabIndex={0}
        aria-label="Show course navigation"
        aria-expanded={open}
        onPointerEnter={show}
        onPointerLeave={hide}
        onPointerDown={(event) => {
          pointerTypeRef.current = event.pointerType
          wasPinnedRef.current = pinned
          draggingRef.current = true
          startXRef.current = event.clientX
          startYRef.current = event.clientY
          rememberPointer(event.clientX, event.clientY)
          // Open immediately so the dock is visible under the finger while it
          // drags — the wave follows `pointerX` from here on.
          cancelClose()
          setHover(true)
          if (event.pointerType !== 'mouse') setPinned(true)
          pointerX.set(event.clientX)
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            /* capture is a nicety — the drag still works without it */
          }
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return
          rememberPointer(event.clientX, event.clientY)
          pointerX.set(event.clientX)
        }}
        onPointerUp={(event) => {
          if (!draggingRef.current) return
          draggingRef.current = false
          try {
            event.currentTarget.releasePointerCapture?.(event.pointerId)
          } catch {
            /* ignore */
          }
          const dx = event.clientX - startXRef.current
          const dy = event.clientY - startYRef.current
          const isTap = Math.abs(dx) < DRAG_SELECT_THRESHOLD && Math.abs(dy) < DRAG_SELECT_THRESHOLD
          if (isTap) {
            // Touch has no hover: a tap toggles the dock open/closed. Mouse
            // hover already covers the pointer case (the desktop behaviour).
            if (pointerTypeRef.current !== 'mouse') {
              if (wasPinnedRef.current) close()
              else setPinned(true)
            }
            return
          }
          // A drag only SELECTS when it is dominantly horizontal — a mostly
          // vertical swipe (a scroll / system-gesture intent) must never
          // activate a tab by accident.
          const isHorizontalDrag =
            Math.abs(dx) >= DRAG_SELECT_THRESHOLD && Math.abs(dx) > Math.abs(dy)
          if (!isHorizontalDrag) {
            close()
            return
          }
          // A real left/right drag: the button the finger settled on is the
          // one that is clicked.
          const id = tabAtX(event.clientX)
          if (id) handleSelect(id)
          else close()
        }}
        onPointerCancel={() => {
          draggingRef.current = false
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setPinned((value) => !value)
          }
        }}
      >
        <div data-course-peek-line="">
          <GlassMaterial radius={6} />
        </div>
      </div>
    </div>
  )
}
