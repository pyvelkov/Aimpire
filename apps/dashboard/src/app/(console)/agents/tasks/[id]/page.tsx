import { notFound } from "next/navigation";
import { AgentTaskView } from "@/components/agent-task";
import { Unavailable } from "@/components/command/chrome";
import { loadAgentTask } from "@/lib/load-agents";
import { isProductId } from "@/lib/shipping-evidence";

export const dynamic = "force-dynamic";

export default async function AgentTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isProductId(id)) {
    notFound();
  }

  const result = await loadAgentTask(id);
  if (!result.ok) {
    if (result.notFound) notFound();
    return (
      <Unavailable title="Task details are unavailable" message={result.message} />
    );
  }

  return <AgentTaskView task={result.task} />;
}
