import { AgentOperationsView, readAgentFilters } from "@/components/agent-operations";
import { loadAgentOperations } from "@/lib/load-agents";

export const dynamic = "force-dynamic";

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    agent?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
}) {
  const filters = readAgentFilters(await searchParams);
  const result = await loadAgentOperations(filters);

  if (!result.ok) {
    return (
      <section className="rounded-2xl bg-danger-soft p-5 text-danger ring-1 ring-danger/20">
        <h2 className="text-lg font-semibold">Agent tasks are unavailable</h2>
        <p className="mt-2 text-sm">{result.message}</p>
      </section>
    );
  }

  return <AgentOperationsView data={result.data} filters={filters} />;
}
