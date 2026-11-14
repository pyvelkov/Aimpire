import { OverviewDashboard } from "@/components/overview-dashboard";
import { loadDashboardPage } from "@/lib/load-dashboard";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const result = await loadDashboardPage();

  if (!result.ok) {
    return (
      <section className="rounded-2xl bg-danger-soft p-5 text-danger ring-1 ring-danger/20">
        <h2 className="text-lg font-semibold">Dashboard data is unavailable</h2>
        <p className="mt-2 text-sm">{result.message}</p>
      </section>
    );
  }

  return <OverviewDashboard data={result.data} />;
}
