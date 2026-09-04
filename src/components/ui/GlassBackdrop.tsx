// src/components/ui/GlassBackdrop.tsx
//
// The "Black Ice" backdrop — the one fixed layer the whole v2 design sits on.
//
// It carries NO paint of its own: every colour, position and falloff lives in
// `.dc-backdrop` in src/glass-theme.css, so the palette stays
// reviewable in one place and `scripts/glass-coverage.mjs` can assert the
// layer's invariants (no filter, no animation, no !important) against real
// CSS rather than against a component's inline styles.
//
// Contract (docs/liquid-glass-v2-brief.md §2 and §4):
//   · position: fixed, inset: 0, z-index: -1 — behind everything, never in
//     flow, never its own isolation context
//   · pointer-events: none — it must never intercept a tap
//   · no filter, no backdrop-filter, no @keyframes on this layer, ever. The
//     softness is the gradients' own falloff, not a blur.
//   · never `background-attachment: fixed` (broken on iOS Safari) — that is
//     why this is a real fixed element instead.
//
// MOUNTING: inside the app shells, never in main.tsx. Admin has its own
// background logic and must not inherit this layer; main.tsx already forces
// the admin tier to `off`, and every rule in glass-theme.css is gated on
// `html[data-glass="on"]`, so `?glass=off` restores the pre-rollout paint.
//
// Mount it exactly ONCE per route. `DesktopShell` is only ever rendered by
// `AppShell` (its single call site), so AppShell mounts the backdrop on the
// mobile/tablet-portrait branch and DesktopShell mounts it on the desktop
// branch — one layer either way.
//
// 2026-09-04 · owner direction: the v1 dither grain tile is gone — the pinned
// reference (the websiteglass docs playground backdrop) is smooth gradients
// plus the hairline grid, which now paints inside .dc-backdrop itself.
//
// 2026-09-04 · owner direction: ONE background, no switch. The universal
// gradient/grid backdrop and the classic/waves preference are gone; the
// pinned Winter Wonderland scene (src/components/backgrounds/WinterScene.tsx,
// ported from codepen.io/Raed-Ennab/pen/PwNdKZj) is the default and only
// background, and its snowfall runs continuously, without pausing.

import WinterScene from "@/components/backgrounds/WinterScene";

interface GlassBackdropProps {
  /**
   * Escape hatch for a shell that needs to suppress the layer without
   * unmounting the tree. Not used today.
   */
  hidden?: boolean;
}

export function GlassBackdrop({ hidden = false }: GlassBackdropProps) {
  if (hidden) return null;
  // aria-hidden lives on the scene root: a decorative fixed layer must never
  // enter the a11y tree or the tab order.
  return <WinterScene />;
}

export default GlassBackdrop;
