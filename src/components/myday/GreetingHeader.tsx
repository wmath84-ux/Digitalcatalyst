import { CalendarDays, Flame, Target } from "lucide-react";
import ProgressRing from "./ProgressRing";
import { GlassSurface } from "../ui/glass";
import { quoteOfTheDay } from "./quotes";

interface GreetingHeaderProps {
  name: string;
  completed: number;
  total: number;
  streak: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function getMotivation(percent: number): string {
  if (percent === 100) return "All tasks completed! You're a champion! 🏆";
  if (percent >= 75) return "Almost there — finish strong today! 💪";
  if (percent >= 50) return "Halfway through — keep the momentum! 🔥";
  if (percent >= 25) return "Great start! Keep pushing forward! 🚀";
  return "A fresh day ahead — let's make it count! ✨";
}

const formattedDate = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** Night-mountain artwork for the hero — mountains, moon glow and pines. */
function HeroMountains() {
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

export default function GreetingHeader({ name, completed, total, streak }: GreetingHeaderProps) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const quote = quoteOfTheDay();

  // The pinned `dc-scene-plate` shell stays exactly as the legibility
  // contract requires; the hero art + content below are the redesign.
  return (
    <GlassSurface radius={24} className="dc-scene-plate relative overflow-hidden text-white">

      <div className="myday-hero-art">
        <HeroMountains />
      </div>
      <div className="myday-hero-stars" />
      <div className="myday-hero-shooting" />
      <div className="myday-hero-scrim" />

      <div className="relative px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex items-start justify-between gap-4">
          {/* Left content */}
          <div className="min-w-0 flex-1">
            <div className="myday-date-pill">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{formattedDate}</span>
            </div>

            <h1 className="myday-greeting mt-3 text-[1.55rem] leading-tight sm:text-3xl lg:text-[2rem]">
              {getGreeting()}, {name}! 👋
            </h1>

            <p className="myday-subtitle mt-1.5 max-w-md text-[0.83rem] leading-relaxed sm:text-[0.95rem]">
              {getMotivation(percent)}
            </p>

            {/* Stat pills */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="myday-stat-pill">
                <Target className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                <span>{completed} / {total} tasks</span>
              </div>
              <div className="myday-stat-pill myday-stat-pill--streak">
                <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                {streak}-day streak
              </div>
            </div>
          </div>

          {/* Right rail: quote + progress ring */}
          <div className="flex shrink-0 flex-col items-end gap-3">
            <p className="myday-hero-quote hidden min-[420px]:block">
              &ldquo;{quote.text}&rdquo;
            </p>
            <div className="myday-ring-glow">
              <ProgressRing percent={percent} size={104} strokeWidth={9} />
            </div>
          </div>
        </div>

        {/* Linear progress bar */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-white/60">Daily Progress</span>
            <span className="font-bold text-white/85">{completed} of {total} completed</span>
          </div>
          <div className="myday-progress-track">
            <div
              className="myday-progress-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </GlassSurface>
  );
}
