export default function LoadingApproval() {
  return (
    <div aria-busy="true" className="h-56 animate-pulse rounded-2xl bg-card ring-1 ring-line">
      <p className="sr-only">Loading review</p>
    </div>
  );
}
