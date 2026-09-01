'use client'

/**
 * WebsiteGlass lens chrome for our MAG dock — look only, no extra bar.
 *
 * Defaults from websiteglass GlassDock:
 *   radius 20 · strength 0.28 · frost 0.3
 *   tint = min(0.5, frost * 0.5) = 0.15
 *   blur = 2 + frost * 8 = 4.4
 *
 * No opaque white fill. The dock stays see-through; Chromium gets rim
 * refraction, everyone else gets frost blur on whatever is behind.
 */

import { useEffect, useId, useRef, useState } from 'react'

export const GLASS_RADIUS = 20
export const GLASS_STRENGTH = 0.28
export const GLASS_FROST = 0.3
export const GLASS_TINT = Math.min(0.5, GLASS_FROST * 0.5)
export const GLASS_BLUR = 2 + GLASS_FROST * 8
export const GLASS_ACCENT = '#38bdf8'
export const GLASS_PILL_RADIUS = Math.max(4, GLASS_RADIUS - 7)
export const GLASS_TINT_RGB = '255,255,255'

const MAP_CACHE = new Map<string, string>()

function clampByte(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

function refractionSupported() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const chromium = /\b(Chrome|Chromium|Edg|OPR)\//.test(ua)
  const safari = /^((?!chrome|android).)*safari/i.test(ua)
  return chromium && !safari
}

function buildLensMap(w: number, h: number, radius: number, strength: number) {
  if (typeof document === 'undefined' || w < 4 || h < 4) return null
  const key = `${Math.round(w)}x${Math.round(h)}|r${Math.round(radius)}|s${strength}`
  const hit = MAP_CACHE.get(key)
  if (hit) return hit

  const aspect = w / h
  const mw = aspect >= 1 ? 220 : Math.max(1, Math.round(220 * aspect))
  const mh = aspect >= 1 ? Math.max(1, Math.round(220 / aspect)) : 220
  const canvas = document.createElement('canvas')
  canvas.width = mw
  canvas.height = mh
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const img = ctx.createImageData(mw, mh)
  const buf = img.data
  const halfW = w / 2
  const halfH = h / 2
  const r = Math.min(radius, halfW, halfH)
  const band = Math.max(6, Math.min(w, h) * (0.12 + strength * 0.16))

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const px = ((x + 0.5) / mw - 0.5) * w
      const py = ((y + 0.5) / mh - 0.5) * h
      const qx = Math.abs(px) - (halfW - r)
      const qy = Math.abs(py) - (halfH - r)
      const sdf = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
      let nx = 0
      let ny = 0
      if (sdf < 0) {
        const depth = -sdf
        let dirX = qx > qy ? Math.sign(px) : 0
        let dirY = qy >= qx ? Math.sign(py) : 0
        if (qx > 0 && qy > 0) {
          const len = Math.hypot(qx, qy) || 1
          dirX = (Math.sign(px) * qx) / len
          dirY = (Math.sign(py) * qy) / len
        }
        const ramp = depth < band ? 1 - depth / band : 0
        const rim = ramp * ramp * (3 - 2 * ramp)
        nx = dirX * rim
        ny = dirY * rim
      }
      const i = (y * mw + x) * 4
      buf[i] = clampByte(128 + nx * 127)
      buf[i + 1] = clampByte(128 + ny * 127)
      buf[i + 2] = 128
      buf[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  const url = canvas.toDataURL('image/png')
  MAP_CACHE.set(key, url)
  return url
}

export default function GlassMaterial({
  strength = GLASS_STRENGTH,
  frost = GLASS_FROST,
  radius = GLASS_RADIUS,
}: {
  strength?: number
  frost?: number
  radius?: number
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const filterId = `dc-glass-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [map, setMap] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)

  const tint = Math.min(0.5, frost * 0.5)
  const blur = 2 + frost * 8
  const displace = 8 + strength * 60

  useEffect(() => {
    setSupported(refractionSupported())
  }, [])

  useEffect(() => {
    if (!supported) return
    const el = rootRef.current
    if (!el) return
    const refresh = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setMap(buildLensMap(w, h, radius, strength))
    }
    refresh()
    const ro = new ResizeObserver(refresh)
    ro.observe(el)
    return () => ro.disconnect()
  }, [supported, radius, strength])

  const backdrop =
    supported && map
      ? `url(#${filterId}) blur(${blur}px) saturate(1.6)`
      : `blur(${Math.max(blur, 12)}px) saturate(1.6)`

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ borderRadius: radius }}
      aria-hidden
    >
      {supported && map && (
        <svg width="0" height="0" className="absolute">
          <filter id={filterId} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
            <feImage href={map} result="map" preserveAspectRatio="none" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={displace} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <div
        className="absolute inset-0"
        style={{
          borderRadius: radius,
          background: `linear-gradient(165deg, rgba(186,230,253,${0.12 + tint * 0.2}), rgba(255,255,255,${tint * 0.1}) 42%, rgba(196,181,253,${0.1 + tint * 0.16}))`,
          backdropFilter: backdrop,
          WebkitBackdropFilter: backdrop,
        }}
      />
    </div>
  )
}
