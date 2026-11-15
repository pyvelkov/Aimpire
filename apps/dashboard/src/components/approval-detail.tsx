import Link from "next/link";
import type { ApprovalDetail } from "@/lib/approval-schema";
import { formatLabel, formatWhen } from "@/lib/presentation";
import { ApprovalActions } from "@/components/approval-actions";
import { EmptyState, StatusBadge, Surface, workflowTone } from "@/components/command/chrome";
import { DropshipMetrics, readMarketMetrics } from "@/components/command/dropship-metrics";

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function summaryNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function ApprovalDetailView({ approval }: { approval: ApprovalDetail }) {
  const summary = approval.decision_summary;
  const risks = stringList(summary.risks);
  const reasons = stringList(summary.reasons);
  const productName = typeof summary.product_name === "string" ? summary.product_name : "Product review";
  const markets = readMarketMetrics(approval.evidence_snapshot ?? {});
  const score = summaryNumber(summary.decision_score);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-4">
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] sm:p-5">
          <div>
            <Link href="/approvals" className="text-sm text-cyan-300 underline-offset-4 hover:underline">All reviews</Link>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{productName}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge tone={workflowTone(approval.status)}>{formatLabel(approval.status)}</StatusBadge>
              <StatusBadge tone={workflowTone(String(summary.recommendation ?? ""))}>
                {formatLabel(String(summary.recommendation ?? "no recommendation"))}
              </StatusBadge>
            </div>
            <p className="mt-3 text-sm text-zinc-400">Requested {formatWhen(approval.created_at)}</p>
            <p className="mt-3 text-sm tabular-nums text-zinc-300">
              Score {score == null ? "—" : score} · decision status {formatLabel(String(summary.decision_status ?? ""))}
            </p>
          </div>
        </section>

        <Surface>
          <h3 className="text-lg font-semibold">Dropshipping metrics</h3>
          <p className="mt-1 text-sm text-zinc-400">Read from the evidence captured with this request.</p>
          {markets.length === 0 ? (
            <div className="mt-4"><EmptyState>No supplier cost, retail price, or margin was stored on this request.</EmptyState></div>
          ) : (
            <div className="mt-4 space-y-4">
              {markets.map((market) => (
                <div key={market.market}>
                  <p className="mb-2 text-sm font-medium">{market.market}</p>
                  <DropshipMetrics
                    supplierCost={market.supplierCost}
                    supplierCurrency={market.currency}
                    retail={market.retail}
                    profit={market.profit}
                    margin={market.margin}
                    currency={market.currency}
                    shipping={market.shipping}
                  />
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>

      <div className="space-y-4">
        <Surface>
          <h3 className="text-lg font-semibold">Scope</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6">{approval.scope.authorizes}</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-zinc-400">
            {approval.scope.does_not_authorize.map((item) => <li key={item}>Does not authorize {item.toLowerCase()}</li>)}
          </ul>
          <p className="mt-4 text-sm">
            <Link className="text-cyan-300 underline-offset-4 hover:underline" href={`/products/${approval.candidate_id}`}>
              Open product
            </Link>
          </p>
        </Surface>

        <Surface>
          <h3 className="text-lg font-semibold">Source decision</h3>
          <h4 className="mt-4 text-sm font-medium">Risks</h4>
          {risks.length === 0 ? <p className="text-sm text-zinc-400">No risks were saved in the summary.</p> : (
            <ul className="mt-1 list-disc pl-5 text-sm">{risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          )}
          <h4 className="mt-4 text-sm font-medium">Reasons</h4>
          {reasons.length === 0 ? <p className="text-sm text-zinc-400">No reasons were saved in the summary.</p> : (
            <ul className="mt-1 list-disc pl-5 text-sm">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          )}
        </Surface>

        <Surface>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              Evidence captured with this request
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 group-open:hidden">Show</span>
              <span className="hidden text-xs font-medium uppercase tracking-wider text-zinc-400 group-open:inline">Hide</span>
            </summary>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-300">
              {JSON.stringify(approval.evidence_snapshot ?? {}, null, 2)}
            </pre>
          </details>
        </Surface>

        {approval.status === "pending" ? (
          <Surface>
            <h3 className="text-lg font-semibold">Record your review</h3>
            <div className="mt-3"><ApprovalActions requestId={approval.id} /></div>
          </Surface>
        ) : (
          <Surface>
            <h3 className="text-lg font-semibold">Resolution</h3>
            <p className="mt-3 text-sm">Resolved {formatWhen(approval.resolved_at)}. {approval.reviewer_notes || "No reviewer notes."}</p>
          </Surface>
        )}

        <Surface>
          <h3 className="text-lg font-semibold">Audit events</h3>
          {approval.events.length === 0 ? <p className="mt-3 text-sm text-zinc-400">No audit events have been recorded.</p> : (
            <ul className="mt-3 space-y-3 text-sm">
              {approval.events.map((event) => (
                <li key={event.id} className="border-b border-zinc-800 pb-3 last:border-b-0">
                  <p className="font-medium">{formatLabel(event.event_type)}</p>
                  <p className="text-zinc-400">{event.previous_status || "none"} → {event.new_status || "none"} · {formatWhen(event.created_at)}</p>
                  {event.notes ? <p>{event.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>
    </div>
  );
}
