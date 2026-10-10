const count = (value: number) => value.toLocaleString("en-IN");

/** Receives only resolved server values. Never manufactures usage counters. */
export default function UsageMetric({ label, used, limit, remaining, unlimited, resetAt, now, format = count, barHook, resetLabel = "Resets" }: {
  label: string; used: number; limit: number; remaining: number; unlimited: boolean;
  resetAt?: number; now: number; format?: (value: number) => string; barHook?: "ai" | "myday"; resetLabel?: string;
}) {
  const progress = unlimited || limit <= 0 ? null : Math.max(0, Math.min(limit, used));
  const minutes = resetAt && resetAt > now ? Math.max(1, Math.ceil((resetAt - now) / 60000)) : 0;
  const countdown = minutes > 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  return (
    <div className="dc-usage-metric">
      <header><h3>{label}</h3><strong>{unlimited ? "Unlimited" : `${format(Math.max(0, remaining))} left`}</strong></header>
      {!unlimited ? <p className="dc-account-note">Used <span data-usage-used>{format(used)}</span> · Limit <span data-usage-limit>{format(Math.max(0, limit))}</span></p> : null}
      {progress !== null ? <progress data-ai-quota-bar={barHook === "ai" ? "" : undefined} data-myday-allowance-bar={barHook === "myday" ? "" : undefined} aria-label={`${label} used`} value={progress} max={limit} /> : null}
      {!unlimited && resetAt ? <p className="dc-account-note" data-usage-reset>{resetLabel} {minutes ? `in ${countdown} · ` : ""}{new Date(resetAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p> : null}
    </div>
  );
}
