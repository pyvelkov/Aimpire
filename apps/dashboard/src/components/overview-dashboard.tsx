import Link from "next/link";
import { approvalKpi, approvalText } from "@/lib/approval";
import type { DashboardPageData } from "@/lib/dashboard-schema";
import {
  formatLabel,
  formatMarkets,
  formatMoney,
  formatPercent,
  formatScore,
  formatWhen,
} from "@/lib/presentation";

function Card({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line">
      <h2 className="text-sm text-muted">{label}</h2>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "neutral" | "pine" | "clay";
}) {
  const tones = {
    neutral: "bg-paper text-ink",
    pine: "bg-pine-soft text-pine",
    clay: "bg-clay-soft text-clay",
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted">
      {children}
    </p>
  );
}

export function OverviewDashboard({ data }: { data: DashboardPageData }) {
  const { overview } = data;
  const approvals = approvalKpi(overview.approvals);
  const openTasks = overview.agent_tasks.by_status.pending
    + overview.agent_tasks.by_status.in_progress;

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          label="Product candidates"
          value={String(overview.product_candidates.count)}
          detail="Discovered products under review"
        />
        <Card
          label="Decision score"
          value={formatScore(overview.decision_score.latest)}
          detail="Latest saved decision"
        />
        <Card
          label="Approval status"
          value={approvals.value}
          detail={approvals.detail}
        />
        <Card
          label="Agent tasks"
          value={String(overview.agent_tasks.total)}
          detail={`${overview.agent_tasks.by_status.completed} completed · ${openTasks} open`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Product decisions</h2>
            <p className="text-sm text-muted">
              Recommendation and approval are separate. Ready for review is not approved.
            </p>
          </div>
          {data.decisions.length === 0 ? (
            <Empty>No product decisions have been saved yet.</Empty>
          ) : (
            <ul className="space-y-3">
              {data.decisions.map((decision) => (
                <li key={decision.id} className="rounded-xl border border-line px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-medium">
                        <Link href={`/products/${decision.candidate_id}`} className="underline decoration-line underline-offset-4 hover:decoration-ink">
                          {decision.product_name}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {formatMarkets(decision.target_market)} · Score {formatScore(decision.decision_score)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Pill tone={decision.recommendation === "hold" ? "clay" : "pine"}>
                        {decision.recommendation_label}
                      </Pill>
                      <Pill tone={decision.approved ? "pine" : "neutral"}>
                        {approvalText(decision.approved, decision.approval_label)}
                      </Pill>
                    </div>
                  </div>
                  {decision.reasons[0] ? (
                    <p className="mt-3 text-sm text-muted">{decision.reasons[0]}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <p className="mb-4 text-sm text-muted">Saved activity log entries.</p>
          {data.activity.length === 0 ? (
            <Empty>No activity has been recorded yet.</Empty>
          ) : (
            <ol className="space-y-3">
              {data.activity.map((entry) => (
                <li key={entry.id} className="border-b border-line pb-3 last:border-b-0">
                  <p className="text-sm font-medium">{entry.action || "Activity"}</p>
                  <p className="mt-1 text-sm text-muted">{entry.description || "No description"}</p>
                  <p className="mt-1 text-xs text-muted">
                    {[entry.agent_type, formatWhen(entry.created_at)].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
        <h2 className="text-lg font-semibold">Product candidates</h2>
        <p className="mb-4 text-sm text-muted">Candidate status describes research progress, not approval.</p>
        {data.candidates.length === 0 ? (
          <Empty>No product candidates yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Product candidates</caption>
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Product</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Markets</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((candidate) => (
                  <tr key={candidate.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 pr-3 font-medium">
                      <Link href={`/products/${candidate.id}`} className="underline decoration-line underline-offset-4 hover:decoration-ink">
                        {candidate.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{candidate.category || "—"}</td>
                    <td className="py-3 pr-3">{formatMarkets(candidate.target_market)}</td>
                    <td className="py-3 pr-3">{formatLabel(candidate.status)}</td>
                    <td className="py-3">{formatWhen(candidate.updated_at ?? candidate.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
          <h2 className="text-lg font-semibold">Agent tasks</h2>
          <p className="mb-4 text-sm text-muted">
            {overview.agent_tasks.by_status.failed} failed · {overview.agent_tasks.by_status.cancelled} cancelled
          </p>
          {data.tasks.length === 0 ? (
            <Empty>No agent tasks yet.</Empty>
          ) : (
            <ul className="space-y-3">
              {data.tasks.slice(0, 8).map((task) => (
                <li key={task.id} className="flex flex-col gap-1 border-b border-line pb-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted">{formatLabel(task.agent_type)}</p>
                  </div>
                  <Pill tone={task.status === "failed" ? "clay" : task.status === "completed" ? "pine" : "neutral"}>
                    {formatLabel(task.status)}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
          <h2 className="text-lg font-semibold">Profitability, CA and US</h2>
          <p className="mb-4 text-sm text-muted">Saved analyses stay unapproved until a person approves them.</p>
          {data.analyses.length === 0 ? (
            <Empty>No profitability analyses have been saved.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <caption className="sr-only">Saved profitability analyses</caption>
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 font-medium">Market</th>
                    <th className="py-2 pr-3 font-medium">Product</th>
                    <th className="py-2 pr-3 font-medium">Margin</th>
                    <th className="py-2 pr-3 font-medium">After ads</th>
                    <th className="py-2 font-medium">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {data.analyses.map((analysis) => (
                    <tr key={analysis.id} className="border-b border-line last:border-b-0">
                      <td className="py-3 pr-3 font-medium">{analysis.market}</td>
                      <td className="py-3 pr-3">{analysis.product_name || analysis.product_title || "Unknown product"}</td>
                      <td className="py-3 pr-3">{formatPercent(analysis.contribution_margin_percent)}</td>
                      <td className="py-3 pr-3">{formatMoney(analysis.contribution_profit_after_ads, analysis.currency)}</td>
                      <td className="py-3">{approvalText(analysis.approved, analysis.approval_label)}</td>
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
