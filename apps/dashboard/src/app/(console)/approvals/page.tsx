import Link from "next/link";
import { loadApprovals } from "@/lib/load-approvals";
import { formatLabel, formatWhen } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const result = await loadApprovals();
  if (!result.ok) {
    return (
      <section className="rounded-2xl bg-danger-soft p-5 text-danger ring-1 ring-danger/20">
        <h2 className="text-lg font-semibold">Approvals are unavailable</h2>
        <p className="mt-2 text-sm">{result.message}</p>
      </section>
    );
  }

  const pending = result.approvals.filter((approval) => approval.status === "pending");
  const history = result.approvals.filter((approval) => approval.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Approvals</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          A product review records that you looked at a saved decision. It does not approve the product for sale, store publishing, purchasing, advertising, or agent execution.
        </p>
      </div>
      <ApprovalGroup title="Pending" empty="No review requests are pending." approvals={pending} />
      <ApprovalGroup title="History" empty="No reviews have been resolved." approvals={history} />
    </div>
  );
}

function ApprovalGroup({
  title,
  empty,
  approvals,
}: {
  title: string;
  empty: string;
  approvals: Array<{
    id: string;
    status: string;
    created_at: string;
    candidate_id: string;
    decision_summary: Record<string, unknown>;
  }>;
}) {
  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      {approvals.length === 0 ? <p className="mt-3 text-sm text-muted">{empty}</p> : (
        <ul className="mt-4 space-y-3">
          {approvals.map((approval) => (
            <li key={approval.id} className="rounded-xl border border-line px-4 py-3 text-sm">
              <Link href={`/approvals/${approval.id}`} className="font-medium underline decoration-line underline-offset-4 hover:decoration-ink">
                {typeof approval.decision_summary.product_name === "string" ? approval.decision_summary.product_name : "Product review"}
              </Link>
              <p className="mt-1 text-muted">
                {formatLabel(approval.status)} · {formatWhen(approval.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
