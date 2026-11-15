import Link from "next/link";
import { agentsPageHref, displayTaskStatus } from "@/lib/task-status";
import type { AgentOperations } from "@/lib/agent-schema";
import { formatLabel, formatWhen } from "@/lib/presentation";
import { BentoGrid } from "@/components/ui/bento-grid";
import {
  EmptyState,
  MetricFigure,
  PageIntro,
  StatusBadge,
  fieldClass,
  metricLabelClass,
  surfaceClass,
  workflowTone,
} from "@/components/command/chrome";
import { cn } from "@/lib/utils";

const departments = ["research", "product", "marketing", "finance", "operations", "support"];
const statuses = [
  { value: "pending", label: "Queued" },
  { value: "in_progress", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function readAgentFilters(params: {
  q?: string | string[];
  agent?: string | string[];
  status?: string | string[];
  page?: string | string[];
}) {
  const pageNumber = Number(one(params.page));
  return {
    q: one(params.q),
    agent: one(params.agent),
    status: one(params.status),
    page: Number.isFinite(pageNumber) && pageNumber > 1 ? String(pageNumber) : undefined,
    pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };
}

export function AgentOperationsView({
  data,
  filters,
}: {
  data: AgentOperations;
  filters: ReturnType<typeof readAgentFilters>;
}) {
  const pageCount = Math.max(1, Math.ceil(data.match_count / data.page_size));
  const filtersActive = Boolean(filters.q || filters.agent || filters.status);

  return (
    <div className="space-y-6">
      <PageIntro title="Agents">
        Queued tasks are waiting. Running tasks are in progress. This view cannot start, retry, or cancel work.
      </PageIntro>

      <BentoGrid className="xl:grid-cols-5">
        <MetricFigure label="Total tasks" value={data.overview.total} detail="Saved agent tasks" />
        <MetricFigure label="Queued" value={data.overview.pending} detail="Pending, not running" />
        <MetricFigure label="Running" value={data.overview.running} detail="Status in progress" />
        <MetricFigure label="Completed" value={data.overview.completed} detail="Finished tasks" />
        <MetricFigure label="Failed" value={data.overview.failed} detail={`${data.overview.cancelled} cancelled`} />
      </BentoGrid>

      <section className={cn(surfaceClass, "p-4 sm:p-5")}>
        <h2 className="text-lg font-semibold">Departments</h2>
        {data.overview.departments.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No department has a saved task.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.overview.departments.map((department) => (
              <li key={department.agent_type} className="rounded-xl border border-zinc-800/80 bg-zinc-950 px-3 py-3 text-sm">
                <p className="font-medium">{formatLabel(department.agent_type)}</p>
                <p className="mt-1 tabular-nums text-zinc-400">
                  {department.total} total · {department.pending} queued · {department.running} running
                </p>
                <p className="tabular-nums text-zinc-400">{department.completed} completed · {department.failed} failed</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(surfaceClass, "p-4 sm:p-5")}>
        <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium" htmlFor="task-search">
            Search
            <input
              id="task-search"
              name="q"
              defaultValue={filters.q}
              placeholder="Title or description"
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="task-agent">
            Department
            <select id="task-agent" name="agent" defaultValue={filters.agent} className={fieldClass}>
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department} value={department}>{formatLabel(department)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="task-status">
            Status
            <select id="task-status" name="status" defaultValue={filters.status} className={fieldClass}>
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-white">
              Apply filters
            </button>
          </div>
        </form>

        {data.tasks.length === 0 ? (
          <div className="mt-4">
            <EmptyState>
              {filtersActive ? "No tasks match these filters." : "No agent tasks have been recorded."}
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <caption className="sr-only">Agent tasks</caption>
              <thead>
                <tr className="border-b border-zinc-800">
                  {["Task", "Department", "Priority", "Status", "Created", "Last activity", "Error"].map((heading) => (
                    <th key={heading} className={cn(metricLabelClass, "py-2 pr-3 text-left font-medium")}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tasks.map((task) => (
                  <tr key={task.id} className="border-b border-zinc-800/80 align-top last:border-b-0">
                    <td className="py-3 pr-3">
                      <Link href={`/agents/tasks/${task.id}`} className="font-medium underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-300">
                        {task.title}
                      </Link>
                      <p className="mt-1 max-w-md text-zinc-400">{task.description}</p>
                    </td>
                    <td className="py-3 pr-3">{formatLabel(task.agent_type)}</td>
                    <td className="py-3 pr-3 tabular-nums">{task.priority ?? "—"}</td>
                    <td className="py-3 pr-3">
                      <StatusBadge tone={workflowTone(task.status)}>
                        {displayTaskStatus(task.status, task.status_label)}
                      </StatusBadge>
                    </td>
                    <td className="py-3 pr-3 tabular-nums text-zinc-400">{formatWhen(task.created_at)}</td>
                    <td className="py-3 pr-3 tabular-nums text-zinc-400">{formatWhen(task.last_activity_at)}</td>
                    <td className="py-3">{task.error_message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-zinc-400">
            {data.match_count} matching {data.match_count === 1 ? "task" : "tasks"} · page {data.page} of {pageCount}
          </p>
          <div className="flex gap-3">
            {data.page > 1 ? (
              <Link className="text-cyan-300 underline-offset-4 hover:underline" href={agentsPageHref({ ...filters, page: data.page - 1 })}>
                Previous
              </Link>
            ) : null}
            {data.page < pageCount ? (
              <Link className="text-cyan-300 underline-offset-4 hover:underline" href={agentsPageHref({ ...filters, page: data.page + 1 })}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
