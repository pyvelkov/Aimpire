import Link from "next/link";
import type { TaskDetail } from "@/lib/agent-schema";
import { formatLabel, formatWhen } from "@/lib/presentation";
import { displayTaskStatus } from "@/lib/task-status";
import { StatusBadge, Surface, workflowTone } from "@/components/command/chrome";

function JsonBlock({ value }: { value: unknown }) {
  if (value == null) {
    return <p className="text-sm text-zinc-400">Nothing has been saved.</p>;
  }
  return (
    <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AgentTaskView({ task }: { task: TaskDetail }) {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/agents" className="text-sm text-cyan-300 underline-offset-4 hover:underline">
          All tasks
        </Link>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">{task.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">{task.description}</p>
        <div className="mt-3">
          <StatusBadge tone={workflowTone(task.status)}>
            {displayTaskStatus(task.status, task.status_label)}
          </StatusBadge>
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          {formatLabel(task.agent_type)} · priority {task.priority ?? "—"}
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          Created {formatWhen(task.created_at)} · started {formatWhen(task.started_at)} · completed {formatWhen(task.completed_at)}
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          Last activity {formatWhen(task.last_activity_at)}. There is no separate updated timestamp.
        </p>
      </div>

      <Surface>
        <h3 className="text-lg font-semibold">Error</h3>
        <p className="mt-3 text-sm">{task.error_message || "No error has been recorded."}</p>
      </Surface>

      <section className="grid gap-4 lg:grid-cols-2">
        <Surface>
          <h3 className="text-lg font-semibold">Task input</h3>
          <div className="mt-3"><JsonBlock value={task.input} /></div>
        </Surface>
        <Surface>
          <h3 className="text-lg font-semibold">Task result</h3>
          <div className="mt-3">
            {task.result == null ? <p className="text-sm text-zinc-400">No result has been saved.</p> : <JsonBlock value={task.result} />}
          </div>
        </Surface>
      </section>

      <Surface>
        <h3 className="text-lg font-semibold">Agent runs</h3>
        {task.runs.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No agent runs have been recorded for this task.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {task.runs.map((run) => (
              <li key={run.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950 px-3 py-3 text-sm">
                <p className="font-medium">{displayTaskStatus(run.status, run.status_label)} · {formatLabel(run.agent_type || "unknown")}</p>
                <p className="tabular-nums text-zinc-400">
                  {run.model_provider || "Provider not recorded"} {run.model_name || ""} · {run.execution_time_ms ?? "—"} ms · {run.tokens_used ?? "—"} tokens
                </p>
                <p className="text-zinc-400">Started {formatWhen(run.started_at)} · completed {formatWhen(run.completed_at)}</p>
                {run.error_message ? <p className="mt-2">{run.error_message}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Surface>
        <h3 className="text-lg font-semibold">Activity</h3>
        {task.activity.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No activity logs reference this task.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {task.activity.map((entry) => (
              <li key={entry.id} className="border-b border-zinc-800 pb-3 text-sm last:border-b-0">
                <p className="font-medium">{entry.action || "Activity"}</p>
                <p className="text-zinc-400">{entry.description || "No description"}</p>
                <p className="text-xs text-zinc-500">{[entry.agent_type, entry.entity_type, formatWhen(entry.created_at)].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
