export default function LoadingApproval() {
  return (
    <div aria-busy="true" className="h-56 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/60">
      <p className="sr-only">Loading review</p>
    </div>
  );
}
