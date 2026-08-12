"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState, SectionCard, StatCard } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/client";

export function RewardsOverview() {
  const [data, setData] = useState<{
    badges: { active: number; draft: number; archived: number };
    streaks: { active: number };
    challenges: { active: number };
    redeemItems: { active: number };
    coins: { issued: number; redeemed: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [badges, streaks, challenges, redeem, transactions] = await Promise.all([
          adminFetch<{ badges: { status: string }[] }>("/api/admin/rewards/badges"),
          adminFetch<{ streaks: { status: string }[] }>("/api/admin/rewards/streaks"),
          adminFetch<{ challenges: { status: string }[] }>("/api/admin/rewards/challenges"),
          adminFetch<{ redeemItems: { status: string }[] }>("/api/admin/rewards/redeem-items"),
          adminFetch<{ transactions: { type: string; amount: number }[] }>("/api/admin/rewards/transactions"),
        ]);
        setData({
          badges: {
            active: badges.badges.filter((b) => b.status === "active").length,
            draft: badges.badges.filter((b) => b.status === "draft").length,
            archived: badges.badges.filter((b) => b.status === "archived").length,
          },
          streaks: { active: streaks.streaks.filter((s) => s.status === "active").length },
          challenges: { active: challenges.challenges.filter((c) => c.status === "active").length },
          redeemItems: { active: redeem.redeemItems.filter((r) => r.status === "active").length },
          coins: {
            issued: transactions.transactions.filter((t) => t.type === "earn").reduce((s, t) => s + t.amount, 0),
            redeemed: Math.abs(transactions.transactions.filter((t) => t.type === "spend").reduce((s, t) => s + t.amount, 0)),
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load rewards overview.");
      }
    })();
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  return (
    <div className="space-y-3">
      <SectionCard title="Reward status">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Active badges" value={data.badges.active} />
          <StatCard label="Draft" value={data.badges.draft} />
          <StatCard label="Archived" value={data.badges.archived} />
        </div>
      </SectionCard>
      <SectionCard title="Programs">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Active streaks" value={data.streaks.active} />
          <StatCard label="Active challenges" value={data.challenges.active} />
          <StatCard label="Redeem items" value={data.redeemItems.active} />
        </div>
      </SectionCard>
      <SectionCard title="Coin economy">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Coins issued" value={data.coins.issued} />
          <StatCard label="Coins spent" value={data.coins.redeemed} />
        </div>
      </SectionCard>
    </div>
  );
}
