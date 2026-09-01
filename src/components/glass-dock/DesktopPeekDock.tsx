'use client'

/**
 * Hover-to-reveal MAG dock for screens that use the desktop shell
 * (left rail / side panel instead of the always-on bottom footer).
 *
 * A thin frosted-glass line sits at the very bottom centre of the
 * PAGE column (`[data-desktop-main]`), not the full viewport — the
 * left rail is excluded so the line tracks page width. Always
 * visible. Pointer enter activates the same GlassDock (MAG, click,
 * Home hold → FlowPath). Pointer leave hides it. Phone + tablet-
 * portrait never mount this. The left rail never hides with the dock.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { BagIcon, CalendarIcon, FlowPathIcon, HomeIcon, SparkBookIcon, StoreIcon } from '../icons'
import GlassDock, { type GlassDockItem } from './GlassDock'
import GlassMaterial from './GlassMaterial'
import type { TabKey } from '../BottomNav'
import type { DesktopRailKey } from '../DesktopShell'

const TABS: { key: TabKey; label: string; icon: typeof HomeIcon; color: string; hash: string }[] = [
  { key: 'home', label: 'Home', icon: HomeIcon, color: '#FFBE0B', hash: '#/home' },
  { key: 'myday', label: 'My Day', icon: CalendarIcon, color: '#06D6A0', hash: '#/my-day' },
  { key: 'store', label: 'Store', icon: StoreIcon, color: '#FF7B54', hash: '#/store' },
  { key: 'purchases', label: 'Purchases', icon: BagIcon, color: '#C9A96E', hash: '#/store/purchases' },
  // Profile moved to the header/rail; its dock slot opens FlowPath (same
  // swap as the mobile footer dock in BottomNav).
  { key: 'flowpath', label: 'FlowPath', icon: FlowPathIcon, color: '#B388FF', hash: '#/flowpath' },
  { key: 'revision', label: 'Revision', icon: SparkBookIcon, color: '#3A86FF', hash: '#/revision' },
]

const HOLD_DURATION = 1000
const RING_R = 18
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R

function railToTab(active: DesktopRailKey): TabKey | null {
  if (active === 'favorites' || active === 'settings' || active === 'profile') return null
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
  const [holding, setHolding] = useState(false)
  const [liquidExpand, setLiquidExpand] = useState(false)
  const holdTimerRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const homeBtnRef = useRef<HTMLButtonElement>(null)
  const closeTimerRef = useRef<number | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  const show = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setOpen(true)
  }, [])

  const hide = useCallback(() => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      closeTimerRef.current = null
    }, 80)
  }, [])

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

  const startHold = useCallback(() => {
    setHolding(true)
    holdTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true
      setHolding(false)
      setLiquidExpand(true)
      setTimeout(() => {
        window.location.hash = '#/flowpath'
        setTimeout(() => setLiquidExpand(false), 100)
      }, 750)
    }, HOLD_DURATION)
  }, [])

  const endHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    setHolding(false)
  }, [])

  const current = railToTab(active)

  const items: GlassDockItem[] = TABS.map(({ key, label, icon, color }) => {
    const isHome = key === 'home'
    return {
      id: key,
      label,
      icon,
      color,
      active: current === key,
      badge: key === 'purchases' ? purchasesBadge : undefined,
      buttonRef: isHome ? homeBtnRef : undefined,
      buttonProps: isHome
        ? {
            onPointerDown: () => startHold(),
            onPointerUp: endHold,
            onPointerLeave: endHold,
            onPointerCancel: endHold,
            onContextMenu: (event) => event.preventDefault(),
            className: holding ? '[touch-action:none]' : '',
          }
        : undefined,
      extra: isHome ? (
        <>
          <svg
            className="pointer-events-none absolute"
            viewBox="0 0 40 40"
            style={{
              left: '50%',
              top: '50%',
              width: 46,
              height: 46,
              transform: 'translate(-50%, -50%) rotate(-90deg)',
            }}
          >
            <circle cx="20" cy="20" r={RING_R} fill="none" stroke="rgba(99, 102, 241, 0.15)" strokeWidth="2.5" />
            <circle
              cx="20"
              cy="20"
              r={RING_R}
              fill="none"
              stroke="url(#peek-home-hold-gradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={holding ? 0 : RING_CIRCUMFERENCE}
              style={{
                transition: holding ? `stroke-dashoffset ${HOLD_DURATION}ms linear` : 'stroke-dashoffset 0.18s ease',
                filter: holding ? 'drop-shadow(0 0 5px rgba(99, 102, 241, 0.9))' : 'none',
              }}
            />
            <defs>
              <linearGradient id="peek-home-hold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
          {!holding && (
            <span
              className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-indigo-500"
              style={{
                animation: 'fp-pulse-ring 2.6s ease-out infinite',
                boxShadow: '0 0 6px 2px rgba(99, 102, 241, 0.6)',
              }}
            />
          )}
        </>
      ) : undefined,
    }
  })

  return (
    <>
      {liquidExpand && (
        <div className="pointer-events-none fixed inset-0 z-[9999] flex items-end justify-center">
          <div
            className="fp-liquid-expand"
            style={{
              position: 'fixed',
              left: homeBtnRef.current
                ? homeBtnRef.current.getBoundingClientRect().left + homeBtnRef.current.getBoundingClientRect().width / 2
                : '50%',
              top: homeBtnRef.current
                ? homeBtnRef.current.getBoundingClientRect().top + homeBtnRef.current.getBoundingClientRect().height / 2
                : '90%',
              width: 44,
              height: 44,
              marginLeft: -22,
              marginTop: -22,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)',
              borderRadius: '50%',
              transformOrigin: 'center center',
            }}
          />
        </div>
      )}

      <div
        ref={hostRef}
        data-desktop-peek-dock=""
        data-open={open ? 'true' : 'false'}
        className="fixed bottom-0 z-50 flex flex-col items-center"
      >
        <div data-desktop-peek-panel="" aria-hidden={!open} onPointerEnter={show} onPointerLeave={hide}>
          <GlassDock
            items={items}
            onSelect={(id) => {
              const key = id as TabKey
              if (key === 'home' && suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              const tab = TABS.find((item) => item.key === key)
              if (tab) window.location.hash = tab.hash
            }}
          />
        </div>
        <div
          data-desktop-peek-line=""
          aria-label="Show navigation dock"
          onPointerEnter={show}
          onPointerLeave={hide}
          onPointerDown={show}
        >
          <GlassMaterial radius={6} />
        </div>
      </div>
    </>
  )
}
