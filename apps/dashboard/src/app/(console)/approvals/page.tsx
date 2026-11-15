import Link from "next/link";
import { loadApprovals } from "@/lib/load-approvals";
import { formatLabel, formatWhen } from "@/lib/presentation";
import { cn } from "@/lib/utils";
import { PageIntro, StatusBadge, Unavailable, surfaceClass, workflowTone } from "@/components/command/chrome";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const result = await loadApprovals();
  if (!result.ok) {
    return <Unavailable title="Approvals are unavailable" message={result.message} />;
  }

  const pending = result.approvals.filter((approval) => approval.status === "pending");
  const history = result.approvals.filter((approval) => approval.status !== "pending");

  return (
    <div className="space-y-6">
      <PageIntro title="Approvals">
        A product review records that you looked at a saved decision. It does not approve the product for sale, store publishing, purchasing, advertising, or agent execution.
      </PageIntro>
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
    <section>
      <h3 className="text-lg font-semibold">{title}</h3>
      {approvals.length === 0 ? <p className="mt-3 text-sm text-zinc-400">{empty}</p> : (
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {approvals.map((approval) => {
            const name = typeof approval.decision_summary.product_name === "string"
              ? approval.decision_summary.product_name
              : "Product review";
            const recommendation = typeof approval.decision_summary.recommendation === "string"
              ? approval.decision_summary.recommendation
              : "";
            const score = typeof approval.decision_summary.decision_score === "number"
              ? approval.decision_summary.decision_score
              : null;
            return (
              <li key={approval.id} className={cn(surfaceClass, "p-4")}>
                <Link href={`/approvals/${approval.id}`} className="block space-y-3">
                    <h4 className="font-medium text-zinc-100">{name}</h4>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={workflowTone(approval.status)}>{formatLabel(approval.status)}</StatusBadge>
                      {recommendation ? (
                        <StatusBadge tone={workflowTone(recommendation)}>{formatLabel(recommendation)}</StatusBadge>
                      ) : null}
                    </div>
                    <p className="text-sm tabular-nums text-zinc-400">
                      Score {score == null ? "—" : score} · {formatWhen(approval.created_at)}
                    </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
