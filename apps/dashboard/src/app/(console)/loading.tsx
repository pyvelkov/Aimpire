export default function LoadingOverview() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-live="polite">
      {["Candidates", "Decision score", "Approval", "Tasks"].map((label) => (
        <div key={label} className="h-32 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/60" />
      ))}
      <p className="sr-only">Loading operational data</p>
    </div>
  );
}
