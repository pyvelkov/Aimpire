import { AgentOperationsView, readAgentFilters } from "@/components/agent-operations";
import { Unavailable } from "@/components/command/chrome";
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
      <Unavailable title="Agent tasks are unavailable" message={result.message} />
    );
  }

  return <AgentOperationsView data={result.data} filters={filters} />;
}
