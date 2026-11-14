import Link from "next/link";
import { agentsPageHref, displayTaskStatus } from "@/lib/task-status";
import type { AgentOperations } from "@/lib/agent-schema";
import { formatLabel, formatWhen } from "@/lib/presentation";

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

function Card({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line">
      <h2 className="text-sm text-muted">{label}</h2>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  );
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
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Agents</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Queued tasks are waiting. Running tasks are in progress. This view cannot start, retry, or cancel work.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card label="Total tasks" value={String(data.overview.total)} detail="Saved agent tasks" />
        <Card label="Queued" value={String(data.overview.pending)} detail="Pending, not running" />
        <Card label="Running" value={String(data.overview.running)} detail="Status in progress" />
        <Card label="Completed" value={String(data.overview.completed)} detail="Finished tasks" />
        <Card label="Failed" value={String(data.overview.failed)} detail={`${data.overview.cancelled} cancelled`} />
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
        <h2 className="text-lg font-semibold">Departments</h2>
        {data.overview.departments.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No department has a saved task.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.overview.departments.map((department) => (
              <li key={department.agent_type} className="rounded-xl border border-line px-3 py-3 text-sm">
                <p className="font-medium">{formatLabel(department.agent_type)}</p>
                <p className="mt-1 text-muted">
                  {department.total} total · {department.pending} queued · {department.running} running
                </p>
                <p className="text-muted">{department.completed} completed · {department.failed} failed</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
        <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium" htmlFor="task-search">
            Search
            <input
              id="task-search"
              name="q"
              defaultValue={filters.q}
              placeholder="Title or description"
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal outline-none ring-pine focus:ring-2"
            />
          </label>
          <label className="text-sm font-medium" htmlFor="task-agent">
            Department
            <select id="task-agent" name="agent" defaultValue={filters.agent} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal">
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department} value={department}>{formatLabel(department)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="task-status">
            Status
            <select id="task-status" name="status" defaultValue={filters.status} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal">
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-xl bg-ink px-3 py-2 text-sm font-medium text-card">
              Apply filters
            </button>
          </div>
        </form>

        {data.tasks.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted">
            {filtersActive ? "No tasks match these filters." : "No agent tasks have been recorded."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <caption className="sr-only">Agent tasks</caption>
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Task</th>
                  <th className="py-2 pr-3 font-medium">Department</th>
                  <th className="py-2 pr-3 font-medium">Priority</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                  <th className="py-2 pr-3 font-medium">Last activity</th>
                  <th className="py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {data.tasks.map((task) => (
                  <tr key={task.id} className="border-b border-line align-top last:border-b-0">
                    <td className="py-3 pr-3">
                      <Link href={`/agents/tasks/${task.id}`} className="font-medium underline decoration-line underline-offset-4 hover:decoration-ink">
                        {task.title}
                      </Link>
                      <p className="mt-1 max-w-md text-muted">{task.description}</p>
                    </td>
                    <td className="py-3 pr-3">{formatLabel(task.agent_type)}</td>
                    <td className="py-3 pr-3">{task.priority ?? "—"}</td>
                    <td className="py-3 pr-3">{displayTaskStatus(task.status, task.status_label)}</td>
                    <td className="py-3 pr-3">{formatWhen(task.created_at)}</td>
                    <td className="py-3 pr-3">{formatWhen(task.last_activity_at)}</td>
                    <td className="py-3">{task.error_message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted">
            {data.match_count} matching {data.match_count === 1 ? "task" : "tasks"} · page {data.page} of {pageCount}
          </p>
          <div className="flex gap-3">
            {data.page > 1 ? (
              <Link className="text-pine underline-offset-4 hover:underline" href={agentsPageHref({ ...filters, page: data.page - 1 })}>
                Previous
              </Link>
            ) : null}
            {data.page < pageCount ? (
              <Link className="text-pine underline-offset-4 hover:underline" href={agentsPageHref({ ...filters, page: data.page + 1 })}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
