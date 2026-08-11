import { useEffect, useState } from "react";

function getTimeLeft(target: number) {
  const diff = Math.max(0, target - Date.now());
  return {
    h: Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
  };
}

export default function CountdownTimer() {
  const [target] = useState(() => Date.now() + 1000 * 60 * 60 * 7 + 1000 * 60 * 42);
  const [time, setTime] = useState(getTimeLeft(target));

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="flex items-center gap-1 font-mono text-xs font-bold tabular-nums text-rose-600">
      <span className="rounded-md bg-rose-50 px-1.5 py-1">{pad(time.h)}</span>:
      <span className="rounded-md bg-rose-50 px-1.5 py-1">{pad(time.m)}</span>:
      <span className="rounded-md bg-rose-50 px-1.5 py-1">{pad(time.s)}</span>
    </div>
  );
}
