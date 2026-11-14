import Link from "next/link";
import type { TaskDetail } from "@/lib/agent-schema";
import { formatLabel, formatWhen } from "@/lib/presentation";
import { displayTaskStatus } from "@/lib/task-status";

function JsonBlock({ value }: { value: unknown }) {
  if (value == null) {
    return <p className="text-sm text-muted">Nothing has been saved.</p>;
  }
  return (
    <pre className="overflow-x-auto rounded-xl bg-paper p-3 text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AgentTaskView({ task }: { task: TaskDetail }) {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/agents" className="text-sm text-pine underline-offset-4 hover:underline">
          All tasks
        </Link>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">{task.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6">{task.description}</p>
        <p className="mt-3 text-sm text-muted">
          {formatLabel(task.agent_type)} · priority {task.priority ?? "—"} · {displayTaskStatus(task.status, task.status_label)}
        </p>
        <p className="mt-1 text-sm text-muted">
          Created {formatWhen(task.created_at)} · started {formatWhen(task.started_at)} · completed {formatWhen(task.completed_at)}
        </p>
        <p className="mt-1 text-sm text-muted">
          Last activity {formatWhen(task.last_activity_at)}. There is no separate updated timestamp.
        </p>
      </div>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
        <h3 className="text-lg font-semibold">Error</h3>
        <p className="mt-3 text-sm">{task.error_message || "No error has been recorded."}</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
          <h3 className="text-lg font-semibold">Task input</h3>
          <div className="mt-3"><JsonBlock value={task.input} /></div>
        </div>
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
          <h3 className="text-lg font-semibold">Task result</h3>
          <div className="mt-3">
            {task.result == null ? <p className="text-sm text-muted">No result has been saved.</p> : <JsonBlock value={task.result} />}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
        <h3 className="text-lg font-semibold">Agent runs</h3>
        {task.runs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No agent runs have been recorded for this task.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {task.runs.map((run) => (
              <li key={run.id} className="rounded-xl border border-line px-3 py-3 text-sm">
                <p className="font-medium">{displayTaskStatus(run.status, run.status_label)} · {formatLabel(run.agent_type || "unknown")}</p>
                <p className="text-muted">
                  {run.model_provider || "Provider not recorded"} {run.model_name || ""} · {run.execution_time_ms ?? "—"} ms · {run.tokens_used ?? "—"} tokens
                </p>
                <p className="text-muted">Started {formatWhen(run.started_at)} · completed {formatWhen(run.completed_at)}</p>
                {run.error_message ? <p className="mt-2">{run.error_message}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
        <h3 className="text-lg font-semibold">Activity</h3>
        {task.activity.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No activity logs reference this task.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {task.activity.map((entry) => (
              <li key={entry.id} className="border-b border-line pb-3 text-sm last:border-b-0">
                <p className="font-medium">{entry.action || "Activity"}</p>
                <p className="text-muted">{entry.description || "No description"}</p>
                <p className="text-xs text-muted">{[entry.agent_type, entry.entity_type, formatWhen(entry.created_at)].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
