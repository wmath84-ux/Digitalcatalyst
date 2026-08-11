import { ChevronRight } from "lucide-react";

const crumbs = ["Home", "Courses", "Artificial Intelligence", "NeuraLearn Pro"];

export default function Breadcrumbs() {
  return (
    <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-1.5 px-5 pt-6 text-xs text-zinc-500 sm:px-8">
      {crumbs.map((c, i) => (
        <span key={c} className="flex items-center gap-1.5">
          <span
            className={
              i === crumbs.length - 1
                ? "font-medium text-zinc-900"
                : "cursor-pointer transition hover:text-zinc-700"
            }
          >
            {c}
          </span>
          {i < crumbs.length - 1 && <ChevronRight className="h-3 w-3 text-zinc-300" />}
        </span>
      ))}
    </nav>
  );
}
