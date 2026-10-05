/**
 * Digitalcatalyst surfaces, expressed in the ported Recall design language.
 * =======================================================================
 *
 * The ported Recall tree owns the visual language (tokens, surfaces, type
 * scale, buttons). Digitalcatalyst screens that Recall has no equivalent for —
 * the Daily Test player, the Test Bank, Weak Topics, Progress, the plan and AI
 * settings, Bulk Import — are built from THESE primitives, which are thin
 * wrappers over `recall/lib/surface` + `recall/components/ui`.
 *
 * That is the whole point: a DC screen cannot invent its own look, because it
 * never touches a class string that Recall's design system does not publish.
 * There is exactly one visual language on screen (§1, §2).
 */

import type { ReactNode } from "react";

import { Button } from "../recall/components/ui/button";
import { Progress } from "../recall/components/ui/progress";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { cardSurface, softSurface, dashedSurface, successSurface, motivationSurface, brandSurface } from "../recall/lib/surface";

/* ------------------------------------------------------------------ */
/* Page chrome                                                         */
/* ------------------------------------------------------------------ */

export function RecallPage({
  title,
  subtitle,
  onBack,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8", className)}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {onBack ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back"
              className="mt-0.5 shrink-0"
              onClick={onBack}
            >
              ←
            </Button>
          ) : null}
          <div className="min-w-0">
            <h1 className={cn(typeClass["title-lg"], "truncate text-on-surface")}>{title}</h1>
            {subtitle ? (
              <p className={cn(typeClass["body-md"], "mt-1 text-on-surface-variant")}>{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className={cn(typeClass["title-md"], "text-on-surface")}>{children}</h2>
      {hint ? <span className={cn(typeClass.caption, "text-on-surface-variant")}>{hint}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function RecallCard({
  children,
  className,
  padded = true,
  onClick,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  onClick?: () => void;
  as?: "div" | "button" | "li";
}) {
  const classes = cardSurface(cn(padded && "p-4", onClick && "text-left transition-colors hover:bg-surface-container-low", className));
  if (as === "button" || onClick) {
    return (
      <button type="button" onClick={onClick} className={cn("block w-full", classes)}>
        {children}
      </button>
    );
  }
  if (as === "li") return <li className={classes}>{children}</li>;
  return <div className={classes}>{children}</div>;
}

export function RecallTile({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={softSurface(cn("p-3", className))}>{children}</div>;
}

export function RecallBrandPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={brandSurface(cn("p-4", className))}>{children}</div>;
}

export function RecallSuccessPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={successSurface(cn("p-4", className))}>{children}</div>;
}

export function RecallMotivationPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={motivationSurface(cn("p-4", className))}>{children}</div>;
}

export function RecallDashedPanel({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const classes = dashedSurface(cn("p-4", className));
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn("block w-full", classes)}>
        {children}
      </button>
    );
  }
  return <div className={classes}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Stats + lists                                                       */
/* ------------------------------------------------------------------ */

export function RecallStat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "brand" | "success" | "motivation";
}) {
  const toneClass =
    tone === "brand"
      ? "bg-primary-soft text-on-primary-container"
      : tone === "success"
        ? "bg-tertiary-container text-on-tertiary-container"
        : tone === "motivation"
          ? "bg-secondary-container text-on-secondary-container"
          : "bg-surface-container-low text-on-surface";
  return (
    <div className={cn("rounded-2xl border border-outline-variant px-3 py-3 text-center", toneClass)}>
      <p className={cn(typeClass["title-lg"], "leading-tight")}>{value}</p>
      <p className={cn(typeClass.caption, "mt-0.5 opacity-80")}>{label}</p>
      {hint ? <p className={cn(typeClass.caption, "mt-0.5 opacity-60")}>{hint}</p> : null}
    </div>
  );
}

export function RecallProgress({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-center justify-between">
          <span className={cn(typeClass.caption, "text-on-surface-variant")}>{label}</span>
          <span className={cn(typeClass.caption, "text-on-surface")}>{Math.round(value)}%</span>
        </div>
      ) : null}
      <Progress value={Math.max(0, Math.min(100, value))} />
    </div>
  );
}

export function RecallRow({
  title,
  meta,
  trailing,
  onClick,
  icon,
  tone = "default",
}: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  tone?: "default" | "danger";
}) {
  const content = (
    <div className="flex w-full items-center gap-3">
      {icon ? <span className="shrink-0 text-lg">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cn(typeClass["label-lg"], "block truncate text-on-surface")}>{title}</span>
        {meta ? (
          <span className={cn(typeClass.caption, "mt-0.5 block truncate text-on-surface-variant")}>{meta}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0 text-sm text-on-surface-variant">{trailing}</span> : null}
    </div>
  );

  if (!onClick) {
    return <RecallCard padded className="flex items-center">{content}</RecallCard>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        cardSurface("flex w-full items-center p-4 text-left transition-colors hover:bg-surface-container-low"),
        tone === "danger" && "hover:bg-error-container",
      )}
    >
      {content}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function RecallEmpty({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <RecallDashedPanel className="px-6 py-10 text-center">
      {icon ? <div className="mb-2 text-3xl">{icon}</div> : null}
      <p className={cn(typeClass["title-md"], "text-on-surface")}>{title}</p>
      {body ? <p className={cn(typeClass["body-md"], "mt-1 text-on-surface-variant")}>{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </RecallDashedPanel>
  );
}

export function RecallLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      <span className={cn(typeClass["body-md"], "text-on-surface-variant")}>{label}</span>
    </div>
  );
}

export function RecallError({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-error/40 bg-error-container p-5 text-on-error-container">
      <p className={cn(typeClass["title-md"], "text-on-error-container")}>{title}</p>
      {body ? <p className={cn(typeClass["body-md"], "mt-1 opacity-90")}>{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function RecallBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "success" | "warning" | "danger" }) {
  const toneClass =
    tone === "brand"
      ? "bg-primary-soft text-on-primary-container"
      : tone === "success"
        ? "bg-tertiary-container text-on-tertiary-container"
        : tone === "warning"
          ? "bg-secondary-container text-on-secondary-container"
          : tone === "danger"
            ? "bg-error-container text-on-error-container"
            : "bg-surface-container-high text-on-surface-variant";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", toneClass)}>
      {children}
    </span>
  );
}

export { Button };
