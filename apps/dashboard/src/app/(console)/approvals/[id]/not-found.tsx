import Link from "next/link";

export default function ApprovalNotFound() {
  return (
    <section className="max-w-xl rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6">
      <h2 className="text-2xl font-semibold tracking-tight">Review not found</h2>
      <p className="mt-2 text-sm text-zinc-400">That approval request is not in the audit record.</p>
      <Link href="/approvals" className="mt-4 inline-block text-sm text-cyan-300 underline-offset-4 hover:underline">
        Back to approvals
      </Link>
    </section>
  );
}
