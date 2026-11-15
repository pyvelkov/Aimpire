import Link from "next/link";

export default function ApprovalNotFound() {
  return (
    <section className="max-w-xl rounded-2xl bg-card p-6 shadow-sm ring-1 ring-line">
      <h2 className="text-2xl font-semibold tracking-tight">Review not found</h2>
      <p className="mt-2 text-sm text-muted">That approval request is not in the audit record.</p>
      <Link href="/approvals" className="mt-4 inline-block text-sm text-pine underline-offset-4 hover:underline">
        Back to approvals
      </Link>
    </section>
  );
}
