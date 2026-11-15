import Link from "next/link";
import type { ApprovalDetail } from "@/lib/approval-schema";
import { formatLabel, formatWhen } from "@/lib/presentation";
import { ApprovalActions } from "@/components/approval-actions";

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function ApprovalDetailView({ approval }: { approval: ApprovalDetail }) {
  const summary = approval.decision_summary;
  const risks = stringList(summary.risks);
  const reasons = stringList(summary.reasons);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/approvals" className="text-sm text-pine underline-offset-4 hover:underline">All reviews</Link>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          {typeof summary.product_name === "string" ? summary.product_name : "Product review"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {formatLabel(approval.status)} · {formatLabel(String(summary.recommendation ?? "no recommendation"))} · requested {formatWhen(approval.created_at)}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6">{approval.scope.authorizes}</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted">
          {approval.scope.does_not_authorize.map((item) => <li key={item}>Does not authorize {item.toLowerCase()}</li>)}
        </ul>
      </div>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
        <h3 className="text-lg font-semibold">Source decision</h3>
        <p className="mt-3 text-sm">
          <Link className="text-pine underline-offset-4 hover:underline" href={`/products/${approval.candidate_id}`}>
            Open product
          </Link>
        </p>
        <p className="mt-3 text-sm">Score {String(summary.decision_score ?? "—")} · decision status {formatLabel(String(summary.decision_status ?? ""))}</p>
        <h4 className="mt-4 text-sm font-medium">Risks</h4>
        {risks.length === 0 ? <p className="text-sm text-muted">No risks were saved in the summary.</p> : (
          <ul className="mt-1 list-disc pl-5 text-sm">{risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
        )}
        <h4 className="mt-4 text-sm font-medium">Reasons</h4>
        {reasons.length === 0 ? <p className="text-sm text-muted">No reasons were saved in the summary.</p> : (
          <ul className="mt-1 list-disc pl-5 text-sm">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
        <h3 className="text-lg font-semibold">Evidence captured with this request</h3>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-paper p-3 text-xs leading-5">
          {JSON.stringify(approval.evidence_snapshot ?? {}, null, 2)}
        </pre>
      </section>

      {approval.status === "pending" ? (
        <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
          <h3 className="text-lg font-semibold">Record your review</h3>
          <div className="mt-3"><ApprovalActions requestId={approval.id} /></div>
        </section>
      ) : (
        <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
          <h3 className="text-lg font-semibold">Resolution</h3>
          <p className="mt-3 text-sm">Resolved {formatWhen(approval.resolved_at)}. {approval.reviewer_notes || "No reviewer notes."}</p>
        </section>
      )}

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
        <h3 className="text-lg font-semibold">Audit events</h3>
        {approval.events.length === 0 ? <p className="mt-3 text-sm text-muted">No audit events have been recorded.</p> : (
          <ul className="mt-3 space-y-3 text-sm">
            {approval.events.map((event) => (
              <li key={event.id} className="border-b border-line pb-3 last:border-b-0">
                <p className="font-medium">{formatLabel(event.event_type)}</p>
                <p className="text-muted">{event.previous_status || "none"} → {event.new_status || "none"} · {formatWhen(event.created_at)}</p>
                {event.notes ? <p>{event.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
