import Link from "next/link";
import { approvalKpi, approvalText, type DecisionReview } from "@/lib/approval";
import type { AnalysisRow, DashboardPageData } from "@/lib/dashboard-schema";
import {
  formatLabel,
  formatMarkets,
  formatMoney,
  formatPercent,
  formatScore,
  formatWhen,
} from "@/lib/presentation";
import { displayTaskStatus } from "@/lib/task-status";
import { BentoGrid } from "@/components/ui/bento-grid";
import { BorderBeam } from "@/components/ui/border-beam";
import {
  DecisionApprovalBadge,
  EmptyState,
  MetricFigure,
  StatusBadge,
  approvalTone,
  marginTone,
  metricLabelClass,
  surfaceClass,
  workflowTone,
} from "@/components/command/chrome";
import { MetricChart } from "@/components/command/metric-chart";
import { cn } from "@/lib/utils";

function average(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (finite.length === 0) {
    return null;
  }
  return finite.reduce((total, value) => total + value, 0) / finite.length;
}

function profitSummary(analyses: AnalysisRow[]): { value: number | null; detail: string; currency: string } {
  const currencies = [...new Set(analyses.map((analysis) => analysis.currency).filter(Boolean))];
  if (currencies.length !== 1) {
    return {
      value: null,
      currency: "USD",
      detail: currencies.length === 0
        ? "No saved profitability analyses yet"
        : "Saved analyses use more than one currency, so they stay on the chart",
    };
  }
  return {
    value: average(analyses.map((analysis) => analysis.contribution_profit_after_ads)),
    currency: currencies[0] ?? "USD",
    detail: "Average contribution profit after ads across saved analyses",
  };
}

export function OverviewDashboard({
  data,
  reviewsByDecision = {},
}: {
  data: DashboardPageData;
  reviewsByDecision?: Record<string, DecisionReview>;
}) {
  const { overview } = data;
  const approvals = approvalKpi(overview.approvals);
  const openTasks = overview.agent_tasks.by_status.pending
    + overview.agent_tasks.by_status.in_progress;
  const profit = profitSummary(data.analyses);
  const margin = average(data.analyses.map((analysis) => analysis.contribution_margin_percent));
  const scorePoints = data.decisions.flatMap((decision) => (
    decision.decision_score == null
      ? []
      : [{ label: decision.product_name, value: decision.decision_score, display: formatScore(decision.decision_score) }]
  ));
  const profitPoints = data.analyses.flatMap((analysis) => (
    analysis.contribution_profit_after_ads == null
      ? []
      : [{
        label: `${analysis.market} · ${analysis.product_name || analysis.product_title || "Unknown product"}`,
        value: analysis.contribution_profit_after_ads,
        display: formatMoney(analysis.contribution_profit_after_ads, analysis.currency),
      }]
  ));
  const taskPoints = overview.agent_tasks.total === 0 ? [] : [
    { label: "Queued", value: overview.agent_tasks.by_status.pending, display: String(overview.agent_tasks.by_status.pending) },
    { label: "Running", value: overview.agent_tasks.by_status.in_progress, display: String(overview.agent_tasks.by_status.in_progress) },
    { label: "Completed", value: overview.agent_tasks.by_status.completed, display: String(overview.agent_tasks.by_status.completed) },
    { label: "Failed", value: overview.agent_tasks.by_status.failed, display: String(overview.agent_tasks.by_status.failed) },
    { label: "Cancelled", value: overview.agent_tasks.by_status.cancelled, display: String(overview.agent_tasks.by_status.cancelled) },
  ];

  return (
    <div className="space-y-6">
      <BentoGrid>
        <MetricFigure
          label="Product candidates"
          value={overview.product_candidates.count}
          detail="Discovered products under review"
        />
        <MetricFigure
          label="Decision score"
          value={overview.decision_score.latest}
          detail="Latest saved decision"
        />
        <MetricFigure
          label="Pending review"
          value={overview.approvals.ready_for_review_count}
          detail="Ready for review is not an approval"
        />
        <MetricFigure
          label="Approved"
          value={overview.approvals.approved_count}
          detail={approvals.detail}
        />
        <MetricFigure
          label="Avg. profit after ads"
          value={profit.value}
          decimalPlaces={2}
          detail={profit.detail}
        />
        <MetricFigure
          label="Avg. margin"
          value={margin}
          decimalPlaces={1}
          detail="Average contribution margin from saved analyses"
        />
        <MetricFigure
          label="Agent tasks"
          value={overview.agent_tasks.total}
          detail={`${overview.agent_tasks.by_status.completed} completed · ${openTasks} open`}
        />
      </BentoGrid>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={cn(surfaceClass, "relative overflow-hidden p-4 sm:p-5")}>
          <BorderBeam size={140} duration={9} colorFrom="#22d3ee" colorTo="#a78bfa" />
          <h2 className="text-lg font-semibold">Decision scores</h2>
          <p className="mb-4 text-sm text-zinc-400">Saved scores on a 100-point scale.</p>
          <MetricChart
            points={scorePoints}
            stroke="violet"
            empty="No scored product decisions have been saved yet."
          />
        </div>
        <div className={cn(surfaceClass, "p-4 sm:p-5")}>
          <h2 className="text-lg font-semibold">Profit after ads</h2>
          <p className="mb-4 text-sm text-zinc-400">
            Contribution profit from saved analyses. Store revenue and ROAS are not in these records.
          </p>
          <MetricChart
            points={profitPoints}
            stroke="emerald"
            empty="No profitability analyses have been saved."
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className={cn(surfaceClass, "p-4 sm:p-5")}>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Product decisions</h2>
            <p className="text-sm text-zinc-400">
              Recommendation and approval are separate. Ready for review is not approved.
            </p>
          </div>
          {data.decisions.length === 0 ? (
            <EmptyState>No product decisions have been saved yet.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {data.decisions.map((decision) => (
                <li key={decision.id} className="rounded-xl border border-zinc-800/80 px-4 py-3 transition-colors duration-200 hover:border-zinc-700">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-medium">
                        <Link href={`/products/${decision.candidate_id}`} className="underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-300">
                          {decision.product_name}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        {formatMarkets(decision.target_market)} · Score {formatScore(decision.decision_score)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={workflowTone(decision.recommendation)}>
                        {decision.recommendation_label}
                      </StatusBadge>
                      <DecisionApprovalBadge
                        approved={decision.approved}
                        label={decision.approval_label}
                        reviewStatus={reviewsByDecision[decision.id]?.status}
                      />
                    </div>
                  </div>
                  {decision.reasons[0] ? (
                    <p className="mt-3 text-sm text-zinc-400">{decision.reasons[0]}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn(surfaceClass, "p-4 sm:p-5")}>
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <p className="mb-4 text-sm text-zinc-400">Saved activity log entries.</p>
          {data.activity.length === 0 ? (
            <EmptyState>No activity has been recorded yet.</EmptyState>
          ) : (
            <ol className="space-y-3">
              {data.activity.map((entry) => (
                <li key={entry.id} className="border-b border-zinc-800/80 pb-3 last:border-b-0">
                  <p className="text-sm font-medium">{entry.action || "Activity"}</p>
                  <p className="mt-1 text-sm text-zinc-400">{entry.description || "No description"}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {[entry.agent_type, formatWhen(entry.created_at)].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className={cn(surfaceClass, "p-4 sm:p-5")}>
        <h2 className="text-lg font-semibold">Product candidates</h2>
        <p className="mb-4 text-sm text-zinc-400">Candidate status describes research progress, not approval.</p>
        {data.candidates.length === 0 ? (
          <EmptyState>No product candidates yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Product candidates</caption>
              <thead>
                <tr className="border-b border-zinc-800">
                  {["Product", "Category", "Markets", "Status", "Updated"].map((heading) => (
                    <th key={heading} className={cn(metricLabelClass, "py-2 pr-3 text-left font-medium")}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((candidate) => (
                  <tr key={candidate.id} className="border-b border-zinc-800/80 last:border-b-0">
                    <td className="py-3 pr-3 font-medium">
                      <Link href={`/products/${candidate.id}`} className="underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-300">
                        {candidate.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{candidate.category || "—"}</td>
                    <td className="py-3 pr-3">{formatMarkets(candidate.target_market)}</td>
                    <td className="py-3 pr-3">
                      <StatusBadge tone={workflowTone(candidate.status)}>{formatLabel(candidate.status)}</StatusBadge>
                    </td>
                    <td className="py-3 tabular-nums text-zinc-400">{formatWhen(candidate.updated_at ?? candidate.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={cn(surfaceClass, "p-4 sm:p-5")}>
          <h2 className="text-lg font-semibold">Agent tasks</h2>
          <p className="mb-4 text-sm text-zinc-400">
            {overview.agent_tasks.by_status.failed} failed · {overview.agent_tasks.by_status.cancelled} cancelled
          </p>
          <MetricChart
            variant="bar"
            points={taskPoints}
            stroke="cyan"
            empty="No agent tasks yet."
          />
          {data.tasks.length === 0 ? null : (
            <ul className="mt-5 space-y-3">
              {data.tasks.slice(0, 8).map((task) => (
                <li key={task.id} className="flex flex-col gap-1 border-b border-zinc-800/80 pb-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      <Link href={`/agents/tasks/${task.id}`} className="underline decoration-zinc-700 underline-offset-4 hover:decoration-zinc-300">
                        {task.title}
                      </Link>
                    </p>
                    <p className="text-xs text-zinc-500">{formatLabel(task.agent_type)}</p>
                  </div>
                  <StatusBadge tone={workflowTone(task.status)}>
                    {displayTaskStatus(task.status, formatLabel(task.status))}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn(surfaceClass, "p-4 sm:p-5")}>
          <h2 className="text-lg font-semibold">Profitability, CA and US</h2>
          <p className="mb-4 text-sm text-zinc-400">Saved analyses stay unapproved until a person approves them.</p>
          {data.analyses.length === 0 ? (
            <EmptyState>No profitability analyses have been saved.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <caption className="sr-only">Saved profitability analyses</caption>
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Market", "Product", "Margin", "After ads", "Approval"].map((heading) => (
                      <th key={heading} className={cn(metricLabelClass, "py-2 pr-3 text-left font-medium")}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.analyses.map((analysis) => (
                    <tr key={analysis.id} className="border-b border-zinc-800/80 last:border-b-0">
                      <td className="py-3 pr-3 font-medium">{analysis.market}</td>
                      <td className="py-3 pr-3">{analysis.product_name || analysis.product_title || "Unknown product"}</td>
                      <td className="py-3 pr-3">
                        <StatusBadge tone={marginTone(analysis.contribution_margin_percent)}>
                          {formatPercent(analysis.contribution_margin_percent)}
                        </StatusBadge>
                      </td>
                      <td className="py-3 pr-3 tabular-nums">{formatMoney(analysis.contribution_profit_after_ads, analysis.currency)}</td>
                      <td className="py-3">
                        <StatusBadge tone={approvalTone(analysis.approved)}>
                          {approvalText(analysis.approved, analysis.approval_label)}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
