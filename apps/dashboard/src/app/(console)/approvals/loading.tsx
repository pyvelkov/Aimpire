export default function LoadingApprovals() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-card ring-1 ring-line" />
      <div className="h-40 animate-pulse rounded-2xl bg-card ring-1 ring-line" />
      <p className="sr-only">Loading approval requests</p>
    </div>
  );
}
