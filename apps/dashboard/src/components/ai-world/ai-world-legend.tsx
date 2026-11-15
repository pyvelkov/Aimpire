import { DEPARTMENTS } from "@/lib/ai-world/departments";

export function AiWorldLegend() {
  return (
    <section aria-label="Department legend" className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:p-5">
      <h3 className="text-lg font-semibold tracking-tight text-zinc-100">Departments</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
        A queued mark is pending work. A faster pose appears only while a task is in progress.
        A warning is a failed task. “Done” appears only when a task finishes while this page is open.
        Nothing here starts, retries, or completes work.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEPARTMENTS.map((department) => (
          <li key={department.id} className="flex gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950 px-3 py-3">
            <span
              className="mt-0.5 h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: department.floor, boxShadow: `inset 0 0 0 2px ${department.accent}` }}
              aria-hidden="true"
            />
            <span>
              <span className="block text-sm font-semibold">{department.label}</span>
              <span className="mt-0.5 block text-sm text-zinc-100">{department.agent.displayName}</span>
              <span className="mt-1 block text-sm leading-5 text-zinc-400">{department.summary}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
