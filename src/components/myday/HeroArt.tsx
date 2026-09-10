// Shared hero artwork for the My Day family of pages.
//
// The night-mountain scene (mountains, moon glow, pines) was first drawn for
// the Overview hero (`GreetingHeader`); the Tasks hero is the same moment in
// the same world, so both pages render THIS component. One artwork, one
// atmosphere — the pages read as a single product because they literally share
// the same brush. Purely decorative: every layer behind it is pointer-events
// free and aria-hidden at the call sites.

export default function HeroMountains() {
  return (
    <svg viewBox="0 0 600 230" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id="mydayMoonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbcfe8" stopOpacity="0.9" />
          <stop offset="35%" stopColor="#c084fc" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mydayRidgeBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b2a7a" />
          <stop offset="100%" stopColor="#241a52" />
        </linearGradient>
        <linearGradient id="mydayRidgeMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#221845" />
          <stop offset="100%" stopColor="#14102e" />
        </linearGradient>
        <linearGradient id="mydayRidgeFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#100c26" />
          <stop offset="100%" stopColor="#080614" />
        </linearGradient>
      </defs>
      <circle cx="470" cy="78" r="66" fill="url(#mydayMoonGlow)" />
      <circle cx="470" cy="78" r="24" fill="#f9d5ec" opacity="0.95" />
      <circle cx="470" cy="78" r="30" fill="none" stroke="#f9d5ec" strokeOpacity="0.35" strokeWidth="2" />
      {/* Back ridge */}
      <path
        d="M40 190 L150 70 L205 130 L285 45 L360 125 L430 60 L520 150 L600 95 L600 230 L40 230 Z"
        fill="url(#mydayRidgeBack)"
        opacity="0.9"
      />
      {/* Snow caps on the back ridge */}
      <path d="M150 70 L168 90 L150 84 L134 94 L124 82 Z" fill="#e9f4ff" opacity="0.75" />
      <path d="M285 45 L306 68 L285 61 L266 72 L254 58 Z" fill="#e9f4ff" opacity="0.8" />
      <path d="M430 60 L449 81 L430 75 L413 85 L402 72 Z" fill="#e9f4ff" opacity="0.7" />
      {/* Mid ridge */}
      <path
        d="M0 210 L110 110 L190 175 L300 95 L395 180 L480 120 L600 195 L600 230 L0 230 Z"
        fill="url(#mydayRidgeMid)"
      />
      <path d="M110 110 L126 128 L110 122 L96 131 L86 120 Z" fill="#dbe7ff" opacity="0.55" />
      <path d="M300 95 L317 114 L300 108 L285 117 L275 106 Z" fill="#dbe7ff" opacity="0.6" />
      {/* Pine silhouettes */}
      <g fill="#070512" opacity="0.95">
        <path d="M60 230 L60 196 L48 196 L62 172 L52 172 L66 150 L80 172 L70 172 L84 196 L72 196 L72 230 Z" />
        <path d="M120 230 L120 202 L110 202 L122 182 L113 182 L125 162 L137 182 L128 182 L140 202 L130 202 L130 230 Z" />
        <path d="M530 230 L530 192 L516 192 L532 166 L521 166 L537 142 L553 166 L542 166 L558 192 L546 192 L546 230 Z" />
        <path d="M575 230 L575 200 L565 200 L577 180 L568 180 L580 160 L592 180 L583 180 L595 200 L585 200 L585 230 Z" />
      </g>
      {/* Front ridge */}
      <path d="M0 230 L0 205 L140 165 L260 205 L400 170 L520 210 L600 185 L600 230 Z" fill="url(#mydayRidgeFront)" />
      {/* Snow ground shimmer */}
      <path d="M0 230 L0 218 Q150 206 300 216 T600 212 L600 230 Z" fill="#dfe9ff" opacity="0.16" />
    </svg>
  );
}
