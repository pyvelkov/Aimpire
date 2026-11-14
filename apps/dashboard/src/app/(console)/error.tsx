"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-2xl bg-danger-soft p-5 text-danger ring-1 ring-danger/20">
      <h2 className="text-lg font-semibold">The dashboard could not load</h2>
      <p className="mt-2 text-sm">Operational data is unavailable. No records were changed.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-full bg-card px-3 py-1.5 text-sm text-ink ring-1 ring-line"
      >
        Try again
      </button>
    </section>
  );
}
