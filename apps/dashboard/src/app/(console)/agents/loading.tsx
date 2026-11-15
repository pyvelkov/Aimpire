export default function LoadingAgents() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded-lg border border-zinc-800/80 bg-zinc-900/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Total", "Queued", "Running", "Completed", "Failed"].map((label) => (
          <div key={label} className="h-28 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/60" />
        ))}
      </div>
      <p className="sr-only">Loading agent tasks</p>
    </div>
  );
}
