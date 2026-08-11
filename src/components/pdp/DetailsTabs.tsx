import { useState } from "react";
import { ChevronDown, PlayCircle, Star } from "lucide-react";
import { product } from "../../data/product";
import { cn } from "../../utils/cn";

const tabs = ["Description", "Curriculum", "Instructor", "FAQ"] as const;
type Tab = (typeof tabs)[number];

function Description() {
  return (
    <div className="space-y-5">
      <p className="leading-relaxed text-zinc-600">{product.description}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          ["Lessons", product.lessons],
          ["Total Hours", `${product.hours}h`],
          ["Skill Level", product.level],
          ["Language", product.language],
          ["Last Updated", product.lastUpdated],
          ["Certificate", "Included"],
        ].map(([label, val]) => (
          <div key={label as string} className="rounded-xl bg-zinc-50 p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-800">{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Curriculum() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="flex flex-col gap-3">
      {product.curriculum.map((c, i) => (
        <div key={c.title} className="overflow-hidden rounded-2xl border border-zinc-100">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 bg-zinc-50/60 px-4 py-3.5 text-left transition hover:bg-zinc-100/70"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="text-sm font-semibold text-zinc-800">{c.title}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <span>{c.lessons} lessons</span>
              <span>{c.duration}</span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", open === i && "rotate-180")}
              />
            </div>
          </button>
          {open === i && (
            <div className="space-y-2 px-4 py-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 text-sm text-zinc-500">
                  <PlayCircle className="h-4 w-4 text-zinc-300" />
                  {c.title} — Part {j + 1}
                  <span className="ml-auto text-xs text-zinc-300">
                    {6 + j * 3}:{(20 + j * 7) % 60}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Instructor() {
  const { instructor } = product;
  return (
    <div className="flex flex-col items-start gap-5 sm:flex-row">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-700 via-zinc-500 to-zinc-800 text-2xl font-bold text-white shadow-lg">
        {instructor.avatarInitials}
      </div>
      <div className="flex-1">
        <p className="text-lg font-bold text-zinc-900">{instructor.name}</p>
        <p className="text-sm text-zinc-500">{instructor.title}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-600">
          <span className="flex items-center gap-1.5">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {instructor.rating} rating
          </span>
          <span>{instructor.students} students</span>
          <span>{instructor.courses} courses</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Dr. Mehta spent 6 years building large-scale ML systems at top research labs before
          turning to full-time AI education. His practical, no-fluff teaching style has helped
          hundreds of thousands of students break into AI careers.
        </p>
      </div>
    </div>
  );
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="flex flex-col gap-3">
      {product.faqs.map((f, i) => (
        <div
          key={f.q}
          className="overflow-hidden rounded-2xl border border-zinc-100 bg-white transition hover:border-zinc-200"
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
          >
            <span className="text-sm font-semibold text-zinc-800">{f.q}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-zinc-400 transition-transform",
                open === i && "rotate-180"
              )}
            />
          </button>
          {open === i && (
            <p className="border-t border-zinc-50 px-4 pb-4 pt-3 text-sm leading-relaxed text-zinc-500">
              {f.a}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DetailsTabs() {
  const [tab, setTab] = useState<Tab>("Description");

  return (
    <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl bg-zinc-100/70 p-1.5">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === t ? "bg-white text-zinc-900 shadow" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Description" && <Description />}
      {tab === "Curriculum" && <Curriculum />}
      {tab === "Instructor" && <Instructor />}
      {tab === "FAQ" && <FAQ />}
    </div>
  );
}
