import { DEPARTMENTS } from "@/lib/ai-world/departments";

export function AiWorldLegend() {
  return (
    <section aria-label="Department legend" className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
      <h3 className="text-lg font-semibold tracking-tight">Departments</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        A queued mark is pending work. A faster pose appears only while a task is in progress.
        A warning is a failed task. “Done” appears only when a task finishes while this page is open.
        Nothing here starts, retries, or completes work.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEPARTMENTS.map((department) => (
          <li key={department.id} className="flex gap-3 rounded-xl bg-paper px-3 py-3 ring-1 ring-line">
            <span
              className="mt-0.5 h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: department.floor, boxShadow: `inset 0 0 0 2px ${department.accent}` }}
              aria-hidden="true"
            />
            <span>
              <span className="block text-sm font-semibold">{department.label}</span>
              <span className="mt-0.5 block text-sm text-ink">{department.agent.displayName}</span>
              <span className="mt-1 block text-sm leading-5 text-muted">{department.summary}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
