import { useState } from "react";
import {
  BadgeCheck,
  Users,
  Clock,
  BarChart3,
  Globe,
  ShieldCheck,
  RotateCcw,
  Zap,
  Award,
  ShoppingCart,
  Bolt,
  Flame,
  CheckCircle2,
} from "lucide-react";
import { product } from "../../data/product";
import RatingStars from "./RatingStars";
import ShareButton from "./ShareButton";
import EduCoinsBadge from "./EduCoinsBadge";
import CountdownTimer from "./CountdownTimer";
import { cn } from "../../utils/cn";

const iconMap = { shield: ShieldCheck, rotate: RotateCcw, zap: Zap, award: Award };

const licenses = [
  { id: "personal", label: "Personal License", desc: "1 user · lifetime access", multiplier: 1 },
  { id: "team", label: "Team License", desc: "Up to 5 users · shared dashboard", multiplier: 2.5 },
];

export default function ProductInfo({ onCheckout }: { onCheckout: (finalPrice: number) => void }) {
  const [license, setLicense] = useState(licenses[0]);
  const discount = Math.round(
    ((product.compareAtPrice - product.price) / product.compareAtPrice) * 100
  );
  const finalPrice = (product.price * license.multiplier).toFixed(2);
  const finalCompare = (product.compareAtPrice * license.multiplier).toFixed(2);

  return (
    <div className="flex flex-col gap-6">
      {/* Title block */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            Bestseller
          </span>
          <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-600">
            <Flame className="h-3 w-3" /> Trending in AI
          </span>
          <span className="text-xs text-zinc-400">
            by <span className="font-medium text-zinc-600">{product.brand}</span>
          </span>
        </div>

        <h1 className="text-2xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-3xl">
          {product.title}
        </h1>
        <p className="text-sm leading-relaxed text-zinc-500 sm:text-base">{product.tagline}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm">
          <div className="flex items-center gap-2">
            <RatingStars rating={product.rating} />
            <span className="font-semibold text-zinc-800">{product.rating}</span>
            <a href="#reviews" className="text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline">
              ({product.ratingCount.toLocaleString()} ratings)
            </a>
          </div>
          <span className="h-1 w-1 rounded-full bg-zinc-300" />
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Users className="h-4 w-4" /> {product.studentsEnrolled.toLocaleString()} enrolled
          </div>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4 text-xs text-zinc-600 sm:grid-cols-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-zinc-400" />
          {product.hours}h content
        </div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-zinc-400" />
          {product.level}
        </div>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-zinc-400" />
          {product.language.split(" +")[0]}
        </div>
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-zinc-400" />
          Updated {product.lastUpdated}
        </div>
      </div>

      {/* Price card */}
      <div className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/70 p-5 shadow-[0_10px_50px_-15px_rgba(0,0,0,0.15)] backdrop-blur-xl sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-transparent to-zinc-100/60" />

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-end gap-3">
            <span className="text-4xl font-extrabold tracking-tight text-zinc-900">
              {product.currency}
              {finalPrice}
            </span>
            <span className="mb-1 text-lg text-zinc-400 line-through">
              {product.currency}
              {finalCompare}
            </span>
            <span className="mb-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
              -{discount}%
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-500">
              <Bolt className="h-3 w-3" /> Deal ends in
            </span>
            <CountdownTimer />
          </div>
        </div>

        {/* License selector */}
        <div className="relative mt-5 grid grid-cols-2 gap-3">
          {licenses.map((l) => (
            <button
              key={l.id}
              onClick={() => setLicense(l)}
              className={cn(
                "rounded-2xl border p-3 text-left transition",
                license.id === l.id
                  ? "border-zinc-900 bg-zinc-900 text-white shadow-lg"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
              )}
            >
              <p className="text-sm font-semibold">{l.label}</p>
              <p className={cn("text-[11px]", license.id === l.id ? "text-zinc-300" : "text-zinc-400")}>
                {l.desc}
              </p>
            </button>
          ))}
        </div>

        {/* EduCoins */}
        <EduCoinsBadge
          amount={Math.round(product.eduCoins * license.multiplier)}
          className="mt-5"
        />

        {/* CTAs */}
        <div className="relative mt-5 flex flex-col gap-3">
          <div className="flex gap-3">
            <button onClick={() => onCheckout(Number(finalPrice))} className="group relative flex-1 overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-700 via-zinc-900 to-black px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] transition active:scale-[0.98]">
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition duration-700 group-hover:translate-x-full" />
              <span className="relative flex items-center justify-center gap-2">
                <Zap className="h-4 w-4 fill-white" /> Buy Now
              </span>
            </button>
            <button className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl border border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-200 px-6 py-3.5 text-sm font-bold text-zinc-900 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.25)] transition hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] active:scale-[0.98]">
              <ShoppingCart className="h-4 w-4" /> Add to Cart
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Gift this course
            </button>
            <ShareButton className="h-10 w-10 shrink-0" />
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {product.trustBadges.map((b) => {
          const Icon = iconMap[b.icon as keyof typeof iconMap];
          return (
            <div
              key={b.label}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-zinc-100 bg-white py-3 text-center shadow-sm"
            >
              <Icon className="h-4.5 w-4.5 text-zinc-700" />
              <span className="text-[11px] font-medium text-zinc-500">{b.label}</span>
            </div>
          );
        })}
      </div>

      {/* Highlights */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-5">
        <p className="mb-3 text-sm font-semibold text-zinc-900">What's included</p>
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {product.highlights.map((h) => (
            <li key={h} className="flex items-start gap-2 text-sm text-zinc-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              {h}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
