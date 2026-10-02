'use client'

/**
 * Hover-to-reveal MAG dock for screens that use the desktop shell
 * (left rail / side panel instead of the always-on bottom footer).
 *
 * A thin frosted-glass line sits at the very bottom centre of the
 * PAGE column (`[data-desktop-main]`), not the full viewport — the
 * left rail is excluded so the line tracks page width. Always
 * visible. Pointer enter activates the same GlassDock (MAG, click).
 * Phone + tablet-portrait never mount this. The left rail never hides
 * with the dock.
 *
 * ── THE LINE AND THE DOCK ARE ONE INTERACTION AREA (owner brief 2026-10-02) ─
 *
 *   "Footer navigation tabhi hide ho jab user actual interaction area se bahar
 *    chala jaaye."
 *
 * The old wiring asked each element for its own enter/leave: the line revealed
 * the dock, and a leave on the LINE (or on the PANEL) scheduled the close with
 * an 80 ms grace. That grace only helps if the panel's own enter cancels it —
 * and there are real gestures where no such enter ever arrives while the
 * pointer is visibly travelling from the line to the buttons:
 *
 *   · a touch / pen drag (hover events do not exist while the contact is
 *     down), so lifting the finger on a button scheduled a close;
 *   · a pointer capture anywhere in the path (the browser suppresses
 *     enter/leave on every other element while a capture is live);
 *   · a fractional device-pixel ratio opening a sub-pixel seam between the
 *     line's top edge and the panel's bottom edge, or the panel's own
 *     open transition being sampled mid-way.
 *
 * The fix is the rule above, expressed as geometry: the dock's interaction area
 * is the UNION of the line's box and the panel's box (src/glass-dock/peekDockArea
 * adds the hairline of slack), the pointer's last known position is tracked
 * while the dock is live, and the close is only committed when that position is
 * genuinely outside the area. A pointer anywhere between the line and the
 * buttons can never hide the dock, whatever the event order was.
 *
 * Touch and pen have no hover, so a line TAP toggles the dock (exactly like the
 * course player's peek dock) and it stays open until an outside tap, a
 * selection, or another tap on the line — never because a synthetic leave
 * fired at the end of the contact. A press that travels from the line onto a
 * button ships the release as that button's click (a press-drag never produces
 * a click on its own), so dragging to reveal the dock ends with the tab the
 * pointer settled on, exactly like clicking it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { BagIcon, CalendarIcon, FlowPathIcon, HomeIcon, SparkBookIcon, StoreIcon } from '../icons'
import GlassDock, { type GlassDockItem } from './GlassDock'
import GlassMaterial from './GlassMaterial'
import { isInsidePeekDockArea, peekDockAreaOf } from './peekDockArea'
import type { TabKey } from '../BottomNav'
import type { DesktopRailKey } from '../DesktopShell'

const TABS: { key: TabKey; label: string; icon: typeof HomeIcon; color: string; hash: string }[] = [
  { key: 'home', label: 'Home', icon: HomeIcon, color: '#FFBE0B', hash: '#/home' },
  { key: 'myday', label: 'My Day', icon: CalendarIcon, color: '#06D6A0', hash: '#/my-day' },
  { key: 'store', label: 'Store', icon: StoreIcon, color: '#FF7B54', hash: '#/store' },
  { key: 'purchases', label: 'Purchases', icon: BagIcon, color: '#C9A96E', hash: '#/store/purchases' },
  // Profile moved to the header/rail. Owner (post Wave 14): Revision takes
  // the slot FlowPath had and FlowPath is the right-most item (same order as
  // the mobile footer dock in BottomNav).
  { key: 'revision', label: 'Revision', icon: SparkBookIcon, color: '#3A86FF', hash: '#/revision' },
  { key: 'flowpath', label: 'FlowPath', icon: FlowPathIcon, color: '#B388FF', hash: '#/flowpath' },
]

/** Horizontal/vertical travel (px) below which a press counts as a tap. */
const DRAG_SELECT_THRESHOLD = 12

/** The old element-level grace, unchanged: how long a real leave may take. */
const CLOSE_GRACE_MS = 80


function railToTab(active: DesktopRailKey): TabKey | null {
  // Rail entries that have no peek-dock slot of their own.
  if (
    active === 'favorites' || active === 'settings' || active === 'profile'
    || active === 'usage-limits' || active === 'study' || active === 'nature3d'
  ) return null
  return active
}

export default function DesktopPeekDock({
  active,
  purchasesBadge,
}: {
  active: DesktopRailKey
  purchasesBadge?: number
}) {
  const [open, setOpen] = useState(false)
  /**
   * Touch / pen have no hover: a tap on the line PINS the dock open, and only
   * an outside tap, a selection or another tap on the line releases it. Mouse
   * behaviour is unchanged — enter reveals, leaving the area hides.
   */
  const [pinned, setPinned] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /**
   * The pointer's last known position. The reveal/hide decision is made from
   * this + the measured boxes, never from event order alone (see the header).
   */
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const pointerTypeRef = useRef('mouse')
  const pressingRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })
  // Whether the dock was PINNED when the press started. Deliberately not
  // `open`: a touch contact fires a synthetic enter before its pointerdown, so
  // `open` is already true by then — reading it would turn the first tap into
  // a close. The pin is the learner's own toggle.
  const wasPinnedRef = useRef(false)
  // Read inside the close timer, which must see the CURRENT pin, not the pin
  // the callback was created with.
  const pinnedRef = useRef(false)
  pinnedRef.current = pinned

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const rememberPointer = useCallback((x: number, y: number) => {
    pointerRef.current = { x, y }
  }, [])

  /** Is the pointer still inside the line + panel interaction area? */
  const pointerInArea = useCallback(() => {
    const point = pointerRef.current
    if (!point) return false
    return isInsidePeekDockArea(point.x, point.y, [
      peekDockAreaOf(lineRef.current),
      peekDockAreaOf(panelRef.current),
    ])
  }, [])

  const show = useCallback(() => {
    cancelClose()
    setOpen(true)
  }, [cancelClose])

  /**
   * A leave schedules the close; the timer then asks the AREA, not the event,
   * whether the pointer really left. A pointer crossing the line → panel seam
   * (any event order, any pointer type, even mid-capture) is still inside.
   */
  const hide = useCallback(() => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      // Pinned = touch/pen: the outside tap (or a selection) owns the close.
      if (pinnedRef.current) return
      if (pointerInArea()) return
      setOpen(false)
    }, CLOSE_GRACE_MS)
  }, [cancelClose, pointerInArea])

  const close = useCallback(() => {
    cancelClose()
    setOpen(false)
    setPinned(false)
  }, [cancelClose])

  const navigate = useCallback((id: string) => {
    const tab = TABS.find((item) => item.key === id)
    if (!tab) return
    // Touch / pen: the selection ends the gesture, so the pinned dock closes
    // (the course player's peek dock behaves the same). Mouse keeps the old
    // behaviour — the dock stays for as long as the pointer rests in it.
    if (pointerTypeRef.current !== 'mouse') close()
    window.location.hash = tab.hash
  }, [close])

  /** The id of the dock item under the point — geometry, so capture is fine. */
  const idAtPoint = useCallback((clientX: number, clientY: number): string | null => {
    if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return null
    for (const node of document.elementsFromPoint(clientX, clientY)) {
      if (!(node instanceof Element)) continue
      const id = node.closest('[data-glass-dock-item]')?.getAttribute('data-glass-dock-item')
      if (id) return id
    }
    return null
  }, [])

  /**
   * While the dock is live, keep the pointer's position current — the close
   * decision reads it. Passive and window-level, so a pointer that drifts off
   * the line mid-gesture is still tracked (including under a pointer capture,
   * where `pointermove` is retargeted but still delivered).
   */
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    const onMove = (event: PointerEvent) => rememberPointer(event.clientX, event.clientY)
    // A mouse that leaves the document is out of the area by definition; a
    // touch/pen release must NOT be treated as one (its leave fires at the end
    // of every contact, on the very point the learner tapped).
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

  /**
   * A pinned (touch / pen) dock closes when the learner taps anywhere outside
   * it — the tap still lands, exactly like the course player's peek dock.
   */
  useEffect(() => {
    if (!pinned) return undefined
    const onDown = (event: PointerEvent) => {
      const host = hostRef.current
      if (host && event.target instanceof Node && host.contains(event.target)) return
      close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pinned, close])

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    },
    [],
  )

  // Seat the peek line + dock on the PAGE column (`[data-desktop-main]`),
  // never the full viewport. The left rail is therefore excluded so the
  // line stays in the centre of the page area, not the whole screen.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const apply = () => {
      const page = document.querySelector('.dc-desktop-shell [data-desktop-main]')
      if (!(page instanceof HTMLElement)) return
      const box = page.getBoundingClientRect()
      host.style.left = `${Math.max(0, box.left)}px`
      host.style.width = `${Math.max(0, box.width)}px`
      host.setAttribute('data-page-seat', 'true')
    }
    apply()
    const page = document.querySelector('.dc-desktop-shell [data-desktop-main]')
    const rail = document.querySelector('.dc-desktop-shell [data-desktop-rail]')
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply)
    if (ro && page instanceof HTMLElement) ro.observe(page)
    if (ro && rail instanceof HTMLElement) ro.observe(rail)
    window.addEventListener('resize', apply)
    const frame = requestAnimationFrame(apply)
    return () => {
      cancelAnimationFrame(frame)
      ro?.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [])

  const current = railToTab(active)

  const items: GlassDockItem[] = TABS.map(({ key, label, icon, color }) => {
    return {
      id: key,
      label,
      icon,
      color,
      active: current === key,
      badge: key === 'purchases' ? purchasesBadge : undefined,
    }
  })

  return (
    <>
      <div
        ref={hostRef}
        data-desktop-peek-dock=""
        data-open={open ? 'true' : 'false'}
        className="fixed bottom-0 z-50 flex flex-col items-center"
        onPointerUp={(event) => {
          // A press that started on the line and ended on a button IS that
          // button's click: the browser only dispatches a click when press and
          // release share a target, and a press-drag never does. The release is
          // handled here, on the host all of them bubble through.
          if (!pressingRef.current) return
          pressingRef.current = false
          try {
            event.currentTarget.releasePointerCapture?.(event.pointerId)
          } catch {
            /* ignore */
          }
          const dx = event.clientX - startRef.current.x
          const dy = event.clientY - startRef.current.y
          const isTap = Math.abs(dx) < DRAG_SELECT_THRESHOLD && Math.abs(dy) < DRAG_SELECT_THRESHOLD
          if (isTap) {
            // Touch / pen: the tap toggles the dock (mouse hover already did).
            // An explicit tap-close must win over the area guard below.
            if (pointerTypeRef.current !== 'mouse') {
              if (wasPinnedRef.current) close()
              else setPinned(true)
            }
            return
          }
          const id = idAtPoint(event.clientX, event.clientY)
          if (id) navigate(id)
        }}
        onPointerCancel={() => {
          pressingRef.current = false
        }}
      >
        <div
          ref={panelRef}
          data-desktop-peek-panel=""
          aria-hidden={!open}
          onPointerEnter={(event) => {
            rememberPointer(event.clientX, event.clientY)
            show()
          }}
          onPointerLeave={(event) => {
            rememberPointer(event.clientX, event.clientY)
            hide()
          }}
        >
          <GlassDock
            items={items}
            onSelect={(id) => navigate(id)}
          />
        </div>
        <div
          ref={lineRef}
          data-desktop-peek-line=""
          aria-label="Show navigation dock"
          onPointerEnter={(event) => {
            rememberPointer(event.clientX, event.clientY)
            show()
          }}
          onPointerLeave={(event) => {
            rememberPointer(event.clientX, event.clientY)
            hide()
          }}
          onPointerDown={(event) => {
            pointerTypeRef.current = event.pointerType
            wasPinnedRef.current = pinned
            pressingRef.current = true
            startRef.current = { x: event.clientX, y: event.clientY }
            rememberPointer(event.clientX, event.clientY)
            // Reveal immediately, so the dock is under the pointer for the
            // whole gesture — hover, click and drag all pass through here.
            cancelClose()
            setOpen(true)
            if (event.pointerType !== 'mouse') {
              setPinned(true)
              // A finger/pen drag keeps reporting to the line even when it
              // travels onto a button, so the release still lands on the item
              // the learner aimed at.
              try {
                event.currentTarget.setPointerCapture(event.pointerId)
              } catch {
                /* capture is a nicety — the drag still works without it */
              }
            }
          }}
        >
          <GlassMaterial radius={6} />
        </div>
      </div>
    </>
  )
}
