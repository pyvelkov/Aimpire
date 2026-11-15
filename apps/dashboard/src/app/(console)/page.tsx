import { OverviewDashboard } from "@/components/overview-dashboard";
import { reviewsByDecision } from "@/lib/approval";
import { Unavailable } from "@/components/command/chrome";
import { loadApprovals } from "@/lib/load-approvals";
import { loadDashboardPage } from "@/lib/load-dashboard";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [result, reviews] = await Promise.all([loadDashboardPage(), loadApprovals()]);

  if (!result.ok) {
    return (
      <Unavailable title="Dashboard data is unavailable" message={result.message} />
    );
  }

  return (
    <OverviewDashboard
      data={result.data}
      reviewsByDecision={reviews.ok ? reviewsByDecision(reviews.approvals) : {}}
    />
  );
}
