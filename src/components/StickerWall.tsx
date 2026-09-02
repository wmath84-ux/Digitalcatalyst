'use client'

/**
 * Sticker Wall — the AI Canvas component
 * (https://aicanvas.me/components/sticker-wall): a matter.js feedback wall
 * where notes and emoji stickers collide, pile up and can be dragged / tossed.
 * Tuning constants, palettes, seed algorithm, the custom 2D canvas renderer,
 * the sticker cap + fade, the pill / Send button states and the DPR-aware
 * ResizeObserver boot sequence all follow the reference.
 *
 * Two project-specific changes:
 *   1. It is wired to real data — a submitted note becomes a USER QUERY
 *      (see src/utils/userQueries.ts) that the owner answers from
 *      #/queries, and the reply is emailed back to the sender.
 *   2. Mobile is a first-class layout, not a shrunken desktop one: the wall
 *      is shorter, the seed count and sticker cap are lower, text cards wrap
 *      narrower and the copy + input sizing step down so the whole thing fits
 *      a phone without horizontal spill.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Body, Engine, Runner, World } from 'matter-js'

const GRAVITY_SCALE = 0.0012
const RESTITUTION = 0.05
const FRICTION = 0.6
const FRICTION_AIR = 0.02
const DENSITY = 0.0015
const FADE_MS = 250
const WALL_THICKNESS = 60
const TEXT_PAD_X = 14
const TEXT_PAD_Y = 10
const TEXT_LINE_H = 20
const EMOJI_SIZE = 72
const CARD_RADIUS = 32
const BORDER_WIDTH = 2

const PALETTE_DARK = ['#FDE68A', '#BBF7D0', '#FBCFE8', '#C7D2FE', '#BAE6FD', '#FED7AA']
const STICKER_TEXT_COLOR_DARK = '#111827'

const SEED_QUOTES = [
  'love the new layout',
  'prompts are 🔥',
  'found a tiny bug on hover',
  'please add a search',
  'this saved me hours',
  'fonts feel just right',
  'mobile nav could be bigger',
  'the physics here rules',
  'more components please',
  'onboarding was smooth',
]
const SEED_EMOJIS = ['👏', '💡', '🙌', '👀', '💬', '✅', '🔥', '💯', '🎉', '❤️', '🤔', '⭐']

type StickerKind = 'text' | 'emoji'
interface Sticker {
  body: Body
  kind: StickerKind
  content: string
  w: number
  h: number
  color: string
  lines: string[]
  createdAt: number
  fadeStart?: number
}
type BodyWithPlugin = Body & { plugin: { sticker?: Sticker } }

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate
    } else {
      if (line) lines.push(line)
      if (ctx.measureText(word).width > maxWidth) {
        lines.push(word)
        line = ''
      } else {
        line = word
      }
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export default function StickerWall({
  title = 'Feedback Wall',
  subtitle = 'Drop a note, toss an emoji, drag anything around. Real physics, no rules. Just leave your mark on the wall.',
  onSubmitNote,
  footer,
}: {
  title?: string
  subtitle?: string
  /** Called with the trimmed note when the visitor presses Send. */
  onSubmitNote?: (note: string) => void | Promise<void>
  /** Rendered under the input pill (the "Explore user queries" button). */
  footer?: React.ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matterRef = useRef<any>(null)
  const engineRef = useRef<Engine | null>(null)
  const worldRef = useRef<World | null>(null)
  const runnerRef = useRef<Runner | null>(null)
  const stickersRef = useRef<Sticker[]>([])
  const sizeRef = useRef({ w: 480, h: 480 })
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const paletteRef = useRef(PALETTE_DARK)

  // Mobile gets its own tuning so the wall reads well on a phone instead of
  // being a squeezed desktop canvas.
  const [isPhone, setIsPhone] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 640 : false),
  )
  const isPhoneRef = useRef(isPhone)
  isPhoneRef.current = isPhone
  useEffect(() => {
    const read = () => setIsPhone(window.innerWidth < 640)
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  const textFontPx = isPhone ? 13 : 15
  const textMaxWidth = isPhone ? 130 : 180
  const emojiFontPx = isPhone ? 30 : 42
  const emojiSize = isPhone ? 52 : EMOJI_SIZE
  const stickerCap = isPhone ? 34 : 60
  const cardRadius = isPhone ? 22 : CARD_RADIUS

  useEffect(() => {
    let alive = true
    let rafId = 0
    let ro: ResizeObserver | null = null

    const boot = async () => {
      const Matter = await import('matter-js')
      if (!alive) return
      matterRef.current = Matter
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      measureCtxRef.current = ctx

      const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: GRAVITY_SCALE } })
      engine.timing.timeScale = 0.6
      engineRef.current = engine
      const world = engine.world
      worldRef.current = world

      const runner = Matter.Runner.create()
      Matter.Runner.run(runner, engine)
      runnerRef.current = runner

      let dpr = Math.min(window.devicePixelRatio || 1, 2)
      let walls: Body[] = []

      const buildWalls = (w: number, h: number) => {
        if (walls.length) Matter.Composite.remove(world, walls)
        walls = [
          Matter.Bodies.rectangle(w / 2, -WALL_THICKNESS / 2, w + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true }),
          Matter.Bodies.rectangle(w / 2, h + WALL_THICKNESS / 2, w + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true }),
          Matter.Bodies.rectangle(-WALL_THICKNESS / 2, h / 2, WALL_THICKNESS, h + WALL_THICKNESS * 2, { isStatic: true }),
          Matter.Bodies.rectangle(w + WALL_THICKNESS / 2, h / 2, WALL_THICKNESS, h + WALL_THICKNESS * 2, { isStatic: true }),
        ]
        Matter.Composite.add(world, walls)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mouse: any = null

      const resize = () => {
        const w = container.clientWidth || 480
        const h = container.clientHeight || 480
        dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        buildWalls(w, h)
        for (const sticker of stickersRef.current) {
          const p = sticker.body.position
          Matter.Body.setPosition(sticker.body, {
            x: Math.max(20, Math.min(w - 20, p.x)),
            y: Math.min(h - 20, p.y),
          })
        }
        if (mouse) mouse.pixelRatio = dpr
        sizeRef.current = { w, h }
      }

      resize()

      mouse = Matter.Mouse.create(canvas)
      mouse.pixelRatio = dpr
      const mouseConstraint = Matter.MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.2, damping: 0.1, render: { visible: false } },
      })
      Matter.Composite.add(world, mouseConstraint)

      const bodyOpts = {
        restitution: RESTITUTION,
        friction: FRICTION,
        frictionAir: FRICTION_AIR,
        density: DENSITY,
      }

      const measureTextCard = (text: string) => {
        ctx.font = `600 ${textFontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Manrope, sans-serif`
        const lines = wrapText(ctx, text, textMaxWidth)
        const longest = Math.max(...lines.map((l) => ctx.measureText(l).width))
        const w = Math.max(70, Math.round(longest + TEXT_PAD_X * 2))
        const h = Math.max(40, Math.round(lines.length * TEXT_LINE_H + TEXT_PAD_Y * 2))
        return { lines, w, h }
      }

      const addSticker = (sticker: Omit<Sticker, 'body' | 'createdAt'> & { x: number; y: number; angle: number }) => {
        const { x, y, angle, ...rest } = sticker
        const body = Matter.Bodies.rectangle(x, y, rest.w, rest.h, { ...bodyOpts, angle })
        const record: Sticker = { ...rest, body, createdAt: performance.now() }
        ;(body as BodyWithPlugin).plugin = { sticker: record }
        Matter.Composite.add(world, body)
        stickersRef.current.push(record)
        return record
      }

      const seed = () => {
        const { w, h } = sizeRef.current
        const palette = paletteRef.current
        // Phones seed fewer bodies so the pile stays readable on a short wall.
        const quotes = isPhoneRef.current ? SEED_QUOTES.slice(0, 5) : SEED_QUOTES
        const emojis = isPhoneRef.current ? SEED_EMOJIS.slice(0, 7) : SEED_EMOJIS
        quotes.forEach((quote, i) => {
          const { lines, w: cw, h: ch } = measureTextCard(quote)
          const record = addSticker({
            kind: 'text',
            content: quote,
            lines,
            w: cw,
            h: ch,
            color: palette[i % palette.length],
            x: 100 + Math.random() * Math.max(20, w - 200),
            y: 80 + Math.random() * Math.max(40, h - 200),
            angle: (Math.random() - 0.5) * 0.5,
          })
          Matter.Body.setAngularVelocity(record.body, (Math.random() - 0.5) * 0.1)
          Matter.Body.setVelocity(record.body, { x: (Math.random() - 0.5) * 1, y: (Math.random() - 0.5) * 1 })
        })
        emojis.forEach((emoji, i) => {
          const record = addSticker({
            kind: 'emoji',
            content: emoji,
            lines: [],
            w: emojiSize,
            h: emojiSize,
            color: palette[(i + 3) % palette.length],
            x: 80 + Math.random() * Math.max(20, w - 160),
            y: 80 + Math.random() * Math.max(40, h - 200),
            angle: (Math.random() - 0.5) * 0.5,
          })
          Matter.Body.setAngularVelocity(record.body, (Math.random() - 0.5) * 0.1)
          Matter.Body.setVelocity(record.body, { x: (Math.random() - 0.5) * 1, y: (Math.random() - 0.5) * 1 })
        })
      }

      seed()

      // Exposed to the submit handler below.
      submitRef.current = (text: string) => {
        const { w } = sizeRef.current
        const { lines, w: cw, h: ch } = measureTextCard(text)
        const palette = paletteRef.current
        const record = addSticker({
          kind: 'text',
          content: text,
          lines,
          w: cw,
          h: ch,
          color: palette[Math.floor(Math.random() * palette.length)],
          x: 80 + Math.random() * Math.max(20, w - 160),
          y: -30,
          angle: (Math.random() - 0.5) * 0.5,
        })
        Matter.Body.setAngularVelocity(record.body, (Math.random() - 0.5) * 0.06)
        Matter.Body.setVelocity(record.body, { x: (Math.random() - 0.5) * 0.6, y: 0 })
        if (stickersRef.current.length > stickerCap) {
          const oldest = stickersRef.current.find((s) => !s.fadeStart)
          if (oldest) oldest.fadeStart = performance.now()
        }
      }

      ro = new ResizeObserver(resize)
      ro.observe(container)

      const render = () => {
        if (!alive) return
        const now = performance.now()
        const { w, h } = sizeRef.current
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)

        for (let i = stickersRef.current.length - 1; i >= 0; i -= 1) {
          const sticker = stickersRef.current[i]
          if (sticker.fadeStart && now - sticker.fadeStart >= FADE_MS) {
            Matter.Composite.remove(world, sticker.body)
            stickersRef.current.splice(i, 1)
          }
        }

        for (const sticker of stickersRef.current) {
          const alpha = sticker.fadeStart ? Math.max(0, 1 - (now - sticker.fadeStart) / FADE_MS) : 1
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.translate(sticker.body.position.x, sticker.body.position.y)
          ctx.rotate(sticker.body.angle)

          ctx.fillStyle = sticker.color
          roundedRect(ctx, -sticker.w / 2, -sticker.h / 2, sticker.w, sticker.h, cardRadius)
          ctx.fill()

          ctx.strokeStyle = 'rgba(255,255,255,0.7)'
          ctx.lineWidth = BORDER_WIDTH
          roundedRect(
            ctx,
            -sticker.w / 2 + BORDER_WIDTH,
            -sticker.h / 2 + BORDER_WIDTH,
            sticker.w - BORDER_WIDTH * 2,
            sticker.h - BORDER_WIDTH * 2,
            Math.max(1, cardRadius - BORDER_WIDTH),
          )
          ctx.stroke()

          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          if (sticker.kind === 'text') {
            ctx.fillStyle = STICKER_TEXT_COLOR_DARK
            ctx.font = `600 ${textFontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Manrope, sans-serif`
            const totalH = sticker.lines.length * TEXT_LINE_H
            const startY = -totalH / 2 + TEXT_LINE_H / 2
            sticker.lines.forEach((line, index) => {
              ctx.fillText(line, 0, startY + index * TEXT_LINE_H)
            })
          } else {
            ctx.font = `${emojiFontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
            ctx.fillText(sticker.content, 0, 2)
          }
          ctx.restore()
        }

        rafId = requestAnimationFrame(render)
      }
      rafId = requestAnimationFrame(render)
    }

    void boot()

    return () => {
      alive = false
      cancelAnimationFrame(rafId)
      ro?.disconnect()
      const Matter = matterRef.current
      if (Matter && runnerRef.current && engineRef.current && worldRef.current) {
        Matter.Runner.stop(runnerRef.current)
        Matter.Composite.clear(worldRef.current, false, true)
        Matter.Engine.clear(engineRef.current)
      }
      matterRef.current = null
      engineRef.current = null
      worldRef.current = null
      measureCtxRef.current = null
      stickersRef.current = []
      submitRef.current = null
    }
    // The wall reboots when the phone/desktop tuning flips.
  }, [textFontPx, textMaxWidth, emojiFontPx, emojiSize, stickerCap, cardRadius])

  const submitRef = useRef<((text: string) => void) | null>(null)
  const [sending, setSending] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const input = inputRef.current
    const text = input?.value.trim()
    if (!text) return
    submitRef.current?.(text)
    if (input) input.value = ''
    if (!onSubmitNote) return
    setSending(true)
    try {
      await onSubmitNote(text)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center" data-sticker-wall>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative h-full w-full overflow-hidden"
        style={{ touchAction: 'none' }}
      >
        <style>{`
          .sticker-wall-pill {
            transition: background 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
          }
          .sticker-wall-pill:hover {
            background: rgba(0,0,0,0.95) !important;
            border-color: rgba(255,255,255,0.85) !important;
            transform: translateY(-1px);
          }
          .sticker-wall-pill:focus-within {
            background: rgba(0,0,0,1) !important;
            border-color: #FFFFFF !important;
            transform: translateY(-1px) scale(1.015);
            box-shadow: 0 10px 24px rgba(0,0,0,0.3), 0 0 0 4px rgba(255,255,255,0.12) !important;
          }
          .sticker-wall-pill:active { transform: translateY(0) scale(0.99); }
          .sticker-wall-input::placeholder { color: rgba(255,255,255,0.55); }
          .sticker-wall-send {
            transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
            cursor: pointer;
          }
          .sticker-wall-send:hover { transform: translateY(-1px); filter: brightness(1.15); }
          .sticker-wall-send:active { transform: translateY(3px); filter: brightness(0.95); }
        `}</style>

        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

        <form
          onSubmit={handleSubmit}
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 sm:gap-5"
          style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: isPhone ? '12%' : '18vh' }}
        >
          <div className="pointer-events-none flex flex-col items-center gap-2 text-center">
            <h2
              style={{
                color: 'rgba(255,255,255,0.95)',
                fontSize: isPhone ? 'clamp(26px, 8vw, 34px)' : 'clamp(32px, 6vw, 56px)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                margin: 0,
                textShadow: '0 2px 20px rgba(0,0,0,0.4)',
              }}
            >
              {title}
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: isPhone ? 13 : 16,
                fontWeight: 500,
                letterSpacing: '-0.005em',
                lineHeight: 1.45,
                maxWidth: '46ch',
                margin: 0,
              }}
            >
              {subtitle}
            </p>
          </div>

          <div
            className="sticker-wall-pill pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-full p-1"
            style={{
              background: 'rgba(0,0,0,0.9)',
              border: '2px solid rgba(255,255,255,0.7)',
              boxShadow: '0 6px 14px rgba(0,0,0,0.25), 0 2px 0 rgba(0,0,0,0.08)',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              maxLength={80}
              placeholder="Leave feedback…"
              aria-label="Leave feedback"
              className="sticker-wall-input flex-1 bg-transparent px-4 py-2 text-sm font-medium outline-none"
              style={{ color: 'rgba(255,255,255,0.95)', minWidth: 0 }}
            />
            <button
              type="submit"
              disabled={sending}
              className="sticker-wall-send flex items-center rounded-2xl px-5 py-2 text-sm font-bold tracking-wide disabled:opacity-60"
              style={{ background: '#8A9CF4', color: '#111827', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>

          {footer ? <div className="pointer-events-auto">{footer}</div> : null}
        </form>
      </motion.div>
    </div>
  )
}
