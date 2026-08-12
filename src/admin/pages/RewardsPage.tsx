"use client";

import { Suspense, useEffect, useState } from "react";
import { useAdminRouter as useRouter, useAdminSearchParams as useSearchParams } from "@/lib/admin/router";
import { Tabs } from "@/components/admin/ui";
import { RewardsOverview } from "@/components/admin/rewards/Overview";
import { CoinEconomyPanel } from "@/components/admin/rewards/CoinEconomy";
import { BadgesPanel } from "@/components/admin/rewards/Badges";
import { StreaksPanel } from "@/components/admin/rewards/Streaks";
import { ChallengesPanel } from "@/components/admin/rewards/Challenges";
import { RedeemStorePanel } from "@/components/admin/rewards/RedeemStore";
import { TransactionsPanel } from "@/components/admin/rewards/Transactions";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "coins", label: "Coin Economy" },
  { key: "badges", label: "Badges" },
  { key: "streaks", label: "Streaks" },
  { key: "challenges", label: "Challenges" },
  { key: "redeem", label: "Redeem Store" },
  { key: "transactions", label: "Transactions" },
];

function RewardsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(searchParams.get("tab") || "overview");
  }, [searchParams]);

  function changeTab(key: string) {
    setTab(key);
    router.replace(`/admin/rewards?tab=${key}`);
  }

  return (
    <div className="pb-6">
      <Tabs tabs={TABS} active={tab} onChange={changeTab} />
      <div className="mt-3">
        {tab === "overview" && <RewardsOverview />}
        {tab === "coins" && <CoinEconomyPanel />}
        {tab === "badges" && <BadgesPanel />}
        {tab === "streaks" && <StreaksPanel />}
        {tab === "challenges" && <ChallengesPanel />}
        {tab === "redeem" && <RedeemStorePanel />}
        {tab === "transactions" && <TransactionsPanel />}
      </div>
    </div>
  );
}

export default function RewardsPage() {
  return (
    <Suspense fallback={null}>
      <RewardsPageInner />
    </Suspense>
  );
}
