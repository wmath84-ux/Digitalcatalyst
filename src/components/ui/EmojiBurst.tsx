'use client'

/**
 * Emoji Burst — the AI Canvas component
 * (https://aicanvas.me/components/emoji-burst), animation exact:
 *   · 18 particles fired simultaneously in a circular pattern,
 *     `baseAngle = (i/18) * 2π` with `±((2π/18) * 0.8) / 2` jitter,
 *   · distance 85 + rand*95, rotation ±320°, size 1.4–2.3rem,
 *     duration 0.55–0.80s, keyframed x/y/scale/opacity/rotate with the
 *     `times [0, 0.2, 1]` arc lift (`18 + |cos(angle)| * 22`),
 *   · cleared after 850 ms.
 *
 * Owner's direction: every LIKE button in the app uses the burst's
 * "Love!" set — the ❤️ 💜 💙 💚 💛 🧡 💖 💝 cluster — so a like always
 * explodes hearts. `useEmojiBurst` gives any existing button the effect
 * without changing its markup; `<EmojiBurstLayer/>` is the overlay.
 */

import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export const LOVE_EMOJIS = ['❤️', '💜', '💙', '💚', '💛', '🧡', '💖', '💝'] as const

const PARTICLE_COUNT = 18
let uid = 0

export interface BurstParticle {
  id: number
  emoji: string
  angle: number
  distance: number
  rotation: number
  size: number
  duration: number
}

function EmojiParticle({ p }: { p: BurstParticle }) {
  const tx = Math.cos(p.angle) * p.distance
  const ty = Math.sin(p.angle) * p.distance
  // Horizontal particles arc higher, exactly like the reference.
  const lift = 18 + Math.abs(Math.cos(p.angle)) * 22
  return (
    <motion.span
      className="pointer-events-none absolute select-none"
      style={{
        left: '50%',
        top: '50%',
        fontSize: `${p.size}rem`,
        lineHeight: 1,
        transformOrigin: 'center center',
        translateX: '-50%',
        translateY: '-50%',
      }}
      initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
      animate={{
        x: [0, tx * 0.5, tx],
        y: [0, ty * 0.5 - lift, ty],
        scale: [0, 1.25, 0.55],
        opacity: [1, 1, 0],
        rotate: [0, p.rotation * 0.5, p.rotation],
      }}
      transition={{
        duration: p.duration,
        ease: [[0.08, 0.82, 0.17, 1], 'linear'] as never,
        times: [0, 0.2, 1],
      }}
    >
      {p.emoji}
    </motion.span>
  )
}

/**
 * Renders the burst particles. Drop it inside a `relative` wrapper around
 * any like button — it is `pointer-events-none` and never affects layout.
 */
export function EmojiBurstLayer({ particles }: { particles: BurstParticle[] }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2 z-50 h-0 w-0">
      <AnimatePresence>
        {particles.map((p) => (
          <EmojiParticle key={p.id} p={p} />
        ))}
      </AnimatePresence>
    </span>
  )
}

/**
 * Hook form: `const { particles, burst } = useEmojiBurst()`. Call `burst()`
 * in the like handler and render `<EmojiBurstLayer particles={particles} />`
 * next to the button.
 *
 * @param emojis  Defaults to the reference's "Love!" set.
 */
export function useEmojiBurst(emojis: readonly string[] = LOVE_EMOJIS) {
  const [particles, setParticles] = useState<BurstParticle[]>([])
  const poppingRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const burst = useCallback(() => {
    if (poppingRef.current) return
    poppingRef.current = true
    const next: BurstParticle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const baseAngle = (i / PARTICLE_COUNT) * Math.PI * 2
      const jitter = (Math.random() - 0.5) * ((Math.PI * 2) / PARTICLE_COUNT) * 0.8
      return {
        id: uid++,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        angle: baseAngle + jitter,
        distance: 85 + Math.random() * 95,
        rotation: (Math.random() - 0.5) * 640,
        size: 1.4 + Math.random() * 0.9,
        duration: 0.55 + Math.random() * 0.25,
      }
    })
    setParticles(next)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setParticles([])
      poppingRef.current = false
    }, 850)
  }, [emojis])

  return { particles, burst }
}

/**
 * Convenience wrapper: wraps a like control and fires the heart burst on
 * click. `onClick` still runs — the burst is purely additive.
 */
export default function EmojiBurst({
  children,
  onClick,
  className = '',
  /** Only burst when turning the like ON (so un-liking stays quiet). */
  active,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  active?: boolean
}) {
  const { particles, burst } = useEmojiBurst()
  return (
    <span
      className={`relative inline-flex ${className}`}
      data-emoji-burst
      onClickCapture={() => {
        // `active` is the state BEFORE the click, so burst when it is about
        // to become liked (or always, when the caller does not track state).
        if (active === undefined || !active) burst()
      }}
    >
      <EmojiBurstLayer particles={particles} />
      <span className="contents" onClick={onClick}>
        {children}
      </span>
    </span>
  )
}
