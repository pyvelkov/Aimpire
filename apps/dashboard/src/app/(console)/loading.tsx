export default function LoadingOverview() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-live="polite">
      {["Candidates", "Decision score", "Approval", "Tasks"].map((label) => (
        <div key={label} className="h-32 animate-pulse rounded-2xl bg-card ring-1 ring-line" />
      ))}
      <p className="sr-only">Loading operational data</p>
    </div>
  );
}
