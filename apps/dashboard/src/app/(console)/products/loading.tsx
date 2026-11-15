export default function LoadingProducts() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded-lg border border-zinc-800/80 bg-zinc-900/60" />
      <div className="h-64 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/60" />
      <p className="sr-only">Loading products</p>
    </div>
  );
}
