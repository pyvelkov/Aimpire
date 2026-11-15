"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-5 text-rose-300">
      <h2 className="text-lg font-semibold text-rose-200">The dashboard could not load</h2>
      <p className="mt-2 text-sm">Operational data is unavailable. No records were changed.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg border border-zinc-700/60 bg-zinc-800/80 px-3 py-1.5 text-sm text-zinc-100 hover:border-zinc-600"
      >
        Try again
      </button>
    </section>
  );
}
