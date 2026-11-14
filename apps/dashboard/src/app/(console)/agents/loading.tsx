export default function LoadingAgents() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-card ring-1 ring-line" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {["Total", "Queued", "Running", "Completed", "Failed"].map((label) => (
          <div key={label} className="h-28 animate-pulse rounded-2xl bg-card ring-1 ring-line" />
        ))}
      </div>
      <p className="sr-only">Loading agent tasks</p>
    </div>
  );
}
