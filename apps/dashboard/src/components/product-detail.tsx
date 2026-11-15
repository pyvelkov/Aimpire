import Link from "next/link";
import { approvalText, type DecisionReview } from "@/lib/approval";
import type { ProductDetail } from "@/lib/product-schema";
import { formatLabel, formatMarkets, formatMoney, formatPercent, formatScore, formatWhen } from "@/lib/presentation";
import { displayEvidenceLabel } from "@/lib/shipping-evidence";
import { RequestReviewForm } from "@/components/request-review-form";
import {
  DecisionApprovalBadge,
  EmptyState,
  StatusBadge,
  Surface,
  metricLabelClass,
  workflowTone,
} from "@/components/command/chrome";
import { DropshipMetrics } from "@/components/command/dropship-metrics";

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <Surface>
      <h2 className="text-lg font-semibold">{title}</h2>
      {detail ? <p className="mt-1 text-sm text-zinc-400">{detail}</p> : null}
      <div className="mt-4">{children}</div>
    </Surface>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-cyan-300 underline decoration-zinc-700 underline-offset-4 hover:text-cyan-200">
      {children}
    </a>
  );
}

export function ProductDetailView({
  detail,
  review = null,
}: {
  detail: ProductDetail;
  review?: DecisionReview | null;
}) {
  const { product, decision } = detail;
  const markets = ["CA", "US"] as const;
  const supplierCurrency = detail.listings[0]?.reported_currency || detail.listings[0]?.analyses[0]?.currency || "USD";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] sm:p-5">
          <div>
            <Link href="/products" className="text-sm text-cyan-300 underline-offset-4 hover:underline">
              All products
            </Link>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{product.name}</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {product.category || "No category"} · {formatMarkets(product.target_market)} · Updated {formatWhen(product.updated_at ?? product.created_at)}
            </p>
            <p className="mt-3 text-sm text-zinc-300">
              Supplier {product.supplier_name || "not recorded"}
            </p>
            {product.supplier_url ? (
              <p className="mt-2 text-sm">
                <ExternalLink href={product.supplier_url}>Supplier page</ExternalLink>
              </p>
            ) : null}
            {product.source_url ? (
              <p className="mt-1 text-sm">
                <ExternalLink href={product.source_url}>Source</ExternalLink>
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] sm:p-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={workflowTone(product.status)}>{formatLabel(product.status)}</StatusBadge>
            <StatusBadge tone={decision ? workflowTone(decision.recommendation) : "neutral"}>
              {decision?.recommendation_label ?? "No decision"}
            </StatusBadge>
            <DecisionApprovalBadge
              approved={decision?.approved ?? false}
              label={decision?.approval_label ?? "Not approved"}
              reviewStatus={review?.status}
            />
          </div>
          {product.description ? <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">{product.description}</p> : null}
          <p className="mt-3 text-sm text-zinc-400">
            Research status is {formatLabel(product.status)}. A recommendation is not an approval.
          </p>
          {product.preliminary_recommendation ? (
            <p className="mt-1 text-sm text-zinc-400">
              Preliminary evaluation: {formatLabel(product.preliminary_recommendation)}. This is not an approval.
            </p>
          ) : null}
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-zinc-950 px-3 py-2">
              <dt className={metricLabelClass}>Decision score</dt>
              <dd className="mt-1 tabular-nums text-lg font-semibold tracking-tight">{formatScore(decision?.decision_score ?? null)}</dd>
            </div>
            <div className="rounded-lg bg-zinc-950 px-3 py-2">
              <dt className={metricLabelClass}>Supplier cost</dt>
              <dd className="mt-1 tabular-nums text-lg font-semibold tracking-tight">
                {formatMoney(detail.listings[0]?.reported_price ?? null, supplierCurrency)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <Section title="Missing evidence" detail="Anything not verified stays visible here.">
        {detail.gaps.length === 0 ? (
          <EmptyState>No evidence gaps were recorded for this product.</EmptyState>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {detail.gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        )}
      </Section>

      <Section title="Product decision" detail="Latest saved decision from the decision engine.">
        {decision ? (
          <div className="space-y-4 text-sm">
            <p>Score {formatScore(decision.decision_score)} · {decision.recommendation_label} · {reviewStatusText(review, decision.approved, decision.approval_label)}</p>
            <EvidenceList title="Reasons" items={decision.reasons} />
            <EvidenceList title="Risks" items={decision.risks} />
            <EvidenceList title="Next actions" items={decision.next_actions} />
            <p className="text-zinc-400">Saved {formatWhen(decision.created_at)}</p>
            <ExistingReview review={review} decisionId={decision.id} />
          </div>
        ) : (
          <EmptyState>No product decision has been saved.</EmptyState>
        )}
      </Section>

      <Section title="Supplier discoveries">
        {detail.discoveries.length === 0 ? (
          <EmptyState>No supplier discoveries.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {detail.discoveries.map((discovery) => (
              <li key={discovery.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950 px-4 py-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{discovery.supplier_name}</p>
                    <p className="text-zinc-400">{discovery.platform || "Platform not recorded"} · {discovery.discovery_method || "Method not recorded"}</p>
                  </div>
                  <StatusBadge tone={discovery.confirmed ? "approved" : "pending"}>
                    {displayEvidenceLabel(discovery.verification_status, discovery.evidence_label)}
                  </StatusBadge>
                </div>
                {discovery.product_title ? <p className="mt-2">{discovery.product_title}</p> : null}
                <div className="mt-2 flex flex-wrap gap-3">
                  {discovery.supplier_url ? <ExternalLink href={discovery.supplier_url}>Supplier</ExternalLink> : null}
                  {discovery.product_url ? <ExternalLink href={discovery.product_url}>Product</ExternalLink> : null}
                  {discovery.evidence_url ? <ExternalLink href={discovery.evidence_url}>Evidence</ExternalLink> : null}
                </div>
                {discovery.evidence_notes ? <p className="mt-2 text-zinc-400">{discovery.evidence_notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
        {detail.discovery_runs.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-zinc-400">
            {detail.discovery_runs.map((run) => (
              <li key={run.id}>
                Discovery run {formatLabel(run.status)} · {formatWhen(run.created_at)}
                {run.extraction_error ? ` · ${run.extraction_error}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Extracted listings" detail="Listing verification status is shown separately from manual review.">
        {detail.listings.length === 0 ? (
          <EmptyState>No extracted supplier listings.</EmptyState>
        ) : (
          <div className="space-y-5">
            {detail.listings.map((listing) => (
              <article key={listing.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950 p-4">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-medium">{listing.product_title}</h3>
                      <p className="text-sm text-zinc-400">SKU {listing.sku}{listing.material ? ` · ${listing.material}` : ""}</p>
                    </div>
                    <StatusBadge tone={listing.confirmed ? "approved" : "pending"}>
                      {displayEvidenceLabel(listing.verification_status, listing.evidence_label)}
                    </StatusBadge>
                  </div>
                  <div className="space-y-4">
                    <p className="text-sm">
                      Reported price {formatMoney(listing.reported_price, listing.reported_currency || "USD")}
                      {listing.product_url ? <> · <ExternalLink href={listing.product_url}>Listing</ExternalLink></> : null}
                    </p>
                    {markets.map((market) => {
                      const analysis = listing.analyses.find((item) => item.market === market) ?? null;
                      const shipping = listing.verification
                        ? (market === "CA" ? listing.verification.shipping_ca_label : listing.verification.shipping_us_label)
                        : null;
                      return (
                        <div key={market}>
                          <p className="mb-2 text-sm font-medium">{market === "CA" ? "Canada" : "United States"}</p>
                          <DropshipMetrics
                            supplierCost={listing.reported_price}
                            supplierCurrency={listing.reported_currency || "USD"}
                            retail={analysis?.selling_price ?? null}
                            profit={analysis?.contribution_profit_after_ads ?? null}
                            margin={analysis?.contribution_margin_percent ?? null}
                            currency={analysis?.currency || listing.reported_currency || "USD"}
                            shipping={shipping}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4 border-t border-zinc-800 pt-4 text-sm">
                  {listing.price_evidence_text ? <p className="text-zinc-400">{listing.price_evidence_text}</p> : null}
                  {listing.missing_evidence.length > 0 ? (
                    <p>Recorded gaps: {listing.missing_evidence.join(", ")}</p>
                  ) : null}

                  <h4 className="text-sm font-semibold">Manual verification</h4>
                  {listing.verification ? (
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div><dt className="text-zinc-400">Review</dt><dd>{formatLabel(listing.verification.review_status)}</dd></div>
                      <div><dt className="text-zinc-400">SKU match</dt><dd>{listing.verification.sku_match_confirmed ? "Match recorded" : "Match not recorded"}</dd></div>
                      <div><dt className="text-zinc-400">Displayed price</dt><dd className="tabular-nums">{formatMoney(listing.verification.displayed_price, listing.verification.currency || "USD")}</dd></div>
                      <div><dt className="text-zinc-400">Variant</dt><dd>{listing.verification.variant_description || "Not recorded"}</dd></div>
                      <div><dt className="text-zinc-400">Canada shipping status</dt><dd>{listing.verification.shipping_ca_label}</dd></div>
                      <div><dt className="text-zinc-400">United States shipping status</dt><dd>{listing.verification.shipping_us_label}</dd></div>
                      <div><dt className="text-zinc-400">Food-contact documentation</dt><dd>{formatLabel(listing.verification.food_contact_documentation_status)}</dd></div>
                      <div><dt className="text-zinc-400">Evidence source</dt><dd>{listing.verification.evidence_source || "Not recorded"}</dd></div>
                    </dl>
                  ) : (
                    <p className="text-zinc-400">Manual verification missing.</p>
                  )}
                  {listing.verification?.evidence_notes ? <p className="text-zinc-400">{listing.verification.evidence_notes}</p> : null}

                  <h4 className="text-sm font-semibold">Canada and United States</h4>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {markets.map((market) => {
                      const marketName = market === "CA" ? "Canada" : "United States";
                      const quotes = listing.shipping_quotes.filter((quote) => quote.market === market);
                      const analyses = listing.analyses.filter((analysis) => analysis.market === market);
                      return (
                        <div key={market} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                          <p className="font-medium">{marketName}</p>
                          {quotes.length === 0 ? (
                            <p className="mt-2 text-zinc-400">No {marketName} shipping estimate has been saved.</p>
                          ) : quotes.map((quote) => (
                            <div key={quote.id} className="mt-2">
                              <p className="tabular-nums">{quote.shipping_method} · {formatMoney(quote.shipping_cost, quote.currency)}</p>
                              <p className="text-zinc-400">
                                {quote.estimated_delivery_min_days ?? "—"}–{quote.estimated_delivery_max_days ?? "—"} days
                                {quote.destination_region ? ` · ${quote.destination_region}` : ""}
                              </p>
                              <p className="mt-1">
                                <StatusBadge tone={quote.confirmed ? "approved" : "pending"}>
                                  {displayEvidenceLabel(quote.verification_status, quote.evidence_label)}
                                </StatusBadge>
                              </p>
                            </div>
                          ))}
                          {analyses.length === 0 ? (
                            <p className="mt-3 text-zinc-400">No saved {marketName} profitability analysis.</p>
                          ) : analyses.map((analysis) => (
                            <div key={analysis.id} className="mt-3 border-t border-zinc-800 pt-2">
                              <p>{formatLabel(analysis.analysis_status)} analysis · margin {formatPercent(analysis.contribution_margin_percent)}</p>
                              <p className="tabular-nums">After ads {formatMoney(analysis.contribution_profit_after_ads, analysis.currency)} · selling price {formatMoney(analysis.selling_price, analysis.currency)}</p>
                              <p>{approvalText(analysis.approved, analysis.approval_label)}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function reviewStatusText(
  review: DecisionReview | null,
  approved: boolean,
  label: string,
): string {
  if (review?.status === "approved") return "Review approved";
  if (review?.status === "pending") return "Review pending";
  if (review?.status === "rejected") return "Review rejected";
  return approvalText(approved, label);
}

function ExistingReview({
  review,
  decisionId,
}: {
  review: DecisionReview | null;
  decisionId: string;
}) {
  if (review && (review.status === "approved" || review.status === "pending")) {
    return (
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-zinc-300">
          {review.status === "approved"
            ? "This decision already has an approved review."
            : "A review request is already pending for this decision."}
        </p>
        <Link href={`/approvals/${review.id}`} className="mt-2 inline-block text-cyan-300 underline-offset-4 hover:underline">
          Open review
        </Link>
      </div>
    );
  }

  return (
    <div>
      {review?.status === "rejected" ? (
        <p className="text-zinc-400">
          The previous review was rejected.{" "}
          <Link href={`/approvals/${review.id}`} className="text-cyan-300 underline-offset-4 hover:underline">
            Open that review
          </Link>
        </p>
      ) : null}
      <RequestReviewForm decisionId={decisionId} />
    </div>
  );
}

function EvidenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      {items.length === 0 ? <p className="text-zinc-400">None recorded.</p> : (
        <ul className="mt-1 list-disc pl-5">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}
