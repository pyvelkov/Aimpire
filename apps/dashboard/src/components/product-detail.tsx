import Link from "next/link";
import { approvalText } from "@/lib/approval";
import type { ProductDetail } from "@/lib/product-schema";
import { formatLabel, formatMarkets, formatMoney, formatPercent, formatScore, formatWhen } from "@/lib/presentation";
import { displayEvidenceLabel } from "@/lib/shipping-evidence";
import { RequestReviewForm } from "@/components/request-review-form";

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
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {detail ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-4 py-5 text-sm text-muted">
      {children}
    </p>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "neutral" | "pine" | "clay" }) {
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

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4">
      {children}
    </a>
  );
}

export function ProductDetailView({ detail }: { detail: ProductDetail }) {
  const { product, decision } = detail;
  const markets = ["CA", "US"] as const;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/products" className="text-sm text-pine underline-offset-4 hover:underline">
          All products
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{product.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {product.category || "No category"} · {formatMarkets(product.target_market)} · Updated {formatWhen(product.updated_at ?? product.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone="neutral">{formatLabel(product.status)}</Pill>
            <Pill tone={decision?.recommendation === "hold" ? "clay" : "pine"}>
              {decision?.recommendation_label ?? "No decision"}
            </Pill>
            <Pill tone={decision?.approved ? "pine" : "neutral"}>
              {decision ? approvalText(decision.approved, decision.approval_label) : "Not approved"}
            </Pill>
          </div>
        </div>
        {product.description ? <p className="mt-4 max-w-3xl text-sm leading-6">{product.description}</p> : null}
        <p className="mt-3 text-sm text-muted">
          Research status is {formatLabel(product.status)}. A recommendation is not an approval.
        </p>
        {product.preliminary_recommendation ? (
          <p className="mt-1 text-sm text-muted">
            Preliminary evaluation: {formatLabel(product.preliminary_recommendation)}. This is not an approval.
          </p>
        ) : null}
      </div>

      <Section title="Missing evidence" detail="Anything not verified stays visible here.">
        {detail.gaps.length === 0 ? (
          <Empty>No evidence gaps were recorded for this product.</Empty>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {detail.gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        )}
      </Section>

      <Section title="Product decision" detail="Latest saved decision from the decision engine.">
        {decision ? (
          <div className="space-y-4 text-sm">
            <p>Score {formatScore(decision.decision_score)} · {decision.recommendation_label} · {approvalText(decision.approved, decision.approval_label)}</p>
            <EvidenceList title="Reasons" items={decision.reasons} />
            <EvidenceList title="Risks" items={decision.risks} />
            <EvidenceList title="Next actions" items={decision.next_actions} />
            <p className="text-muted">Saved {formatWhen(decision.created_at)}</p>
            <RequestReviewForm decisionId={decision.id} />
          </div>
        ) : (
          <Empty>No product decision has been saved.</Empty>
        )}
      </Section>

      <Section title="Supplier discoveries">
        {detail.discoveries.length === 0 ? (
          <Empty>No supplier discoveries.</Empty>
        ) : (
          <ul className="space-y-3">
            {detail.discoveries.map((discovery) => (
              <li key={discovery.id} className="rounded-xl border border-line px-4 py-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{discovery.supplier_name}</p>
                    <p className="text-muted">{discovery.platform || "Platform not recorded"} · {discovery.discovery_method || "Method not recorded"}</p>
                  </div>
                  <Pill tone={discovery.confirmed ? "pine" : "clay"}>
                    {displayEvidenceLabel(discovery.verification_status, discovery.evidence_label)}
                  </Pill>
                </div>
                {discovery.product_title ? <p className="mt-2">{discovery.product_title}</p> : null}
                <div className="mt-2 flex flex-wrap gap-3 text-pine">
                  {discovery.supplier_url ? <ExternalLink href={discovery.supplier_url}>Supplier</ExternalLink> : null}
                  {discovery.product_url ? <ExternalLink href={discovery.product_url}>Product</ExternalLink> : null}
                  {discovery.evidence_url ? <ExternalLink href={discovery.evidence_url}>Evidence</ExternalLink> : null}
                </div>
                {discovery.evidence_notes ? <p className="mt-2 text-muted">{discovery.evidence_notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
        {detail.discovery_runs.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-muted">
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
          <Empty>No extracted supplier listings.</Empty>
        ) : (
          <div className="space-y-5">
            {detail.listings.map((listing) => (
              <article key={listing.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-medium">{listing.product_title}</h3>
                    <p className="text-sm text-muted">SKU {listing.sku}{listing.material ? ` · ${listing.material}` : ""}</p>
                  </div>
                  <Pill tone={listing.confirmed ? "pine" : "clay"}>
                    {displayEvidenceLabel(listing.verification_status, listing.evidence_label)}
                  </Pill>
                </div>
                <p className="mt-2 text-sm">
                  Reported price {formatMoney(listing.reported_price, listing.reported_currency || "USD")}
                  {listing.product_url ? <> · <ExternalLink href={listing.product_url}>Listing</ExternalLink></> : null}
                </p>
                {listing.price_evidence_text ? <p className="mt-2 text-sm text-muted">{listing.price_evidence_text}</p> : null}
                {listing.missing_evidence.length > 0 ? (
                  <p className="mt-2 text-sm">Recorded gaps: {listing.missing_evidence.join(", ")}</p>
                ) : null}

                <h4 className="mt-4 text-sm font-semibold">Manual verification</h4>
                {listing.verification ? (
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted">Review</dt><dd>{formatLabel(listing.verification.review_status)}</dd></div>
                    <div><dt className="text-muted">SKU match</dt><dd>{listing.verification.sku_match_confirmed ? "Match recorded" : "Match not recorded"}</dd></div>
                    <div><dt className="text-muted">Displayed price</dt><dd>{formatMoney(listing.verification.displayed_price, listing.verification.currency || "USD")}</dd></div>
                    <div><dt className="text-muted">Variant</dt><dd>{listing.verification.variant_description || "Not recorded"}</dd></div>
                    <div><dt className="text-muted">Canada shipping status</dt><dd>{listing.verification.shipping_ca_label}</dd></div>
                    <div><dt className="text-muted">United States shipping status</dt><dd>{listing.verification.shipping_us_label}</dd></div>
                    <div><dt className="text-muted">Food-contact documentation</dt><dd>{formatLabel(listing.verification.food_contact_documentation_status)}</dd></div>
                    <div><dt className="text-muted">Evidence source</dt><dd>{listing.verification.evidence_source || "Not recorded"}</dd></div>
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-muted">Manual verification missing.</p>
                )}
                {listing.verification?.evidence_notes ? <p className="mt-2 text-sm text-muted">{listing.verification.evidence_notes}</p> : null}

                <h4 className="mt-4 text-sm font-semibold">Canada and United States</h4>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {markets.map((market) => {
                    const marketName = market === "CA" ? "Canada" : "United States";
                    const quotes = listing.shipping_quotes.filter((quote) => quote.market === market);
                    const analyses = listing.analyses.filter((analysis) => analysis.market === market);
                    return (
                      <div key={market} className="rounded-xl bg-paper p-3 text-sm">
                        <p className="font-medium">{marketName}</p>
                        {quotes.length === 0 ? (
                          <p className="mt-2 text-muted">No {marketName} shipping estimate has been saved.</p>
                        ) : quotes.map((quote) => (
                          <div key={quote.id} className="mt-2">
                            <p>{quote.shipping_method} · {formatMoney(quote.shipping_cost, quote.currency)}</p>
                            <p className="text-muted">
                              {quote.estimated_delivery_min_days ?? "—"}–{quote.estimated_delivery_max_days ?? "—"} days
                              {quote.destination_region ? ` · ${quote.destination_region}` : ""}
                            </p>
                            <p className="mt-1 font-medium">
                              {displayEvidenceLabel(quote.verification_status, quote.evidence_label)}
                            </p>
                          </div>
                        ))}
                        {analyses.length === 0 ? (
                          <p className="mt-3 text-muted">No saved {marketName} profitability analysis.</p>
                        ) : analyses.map((analysis) => (
                          <div key={analysis.id} className="mt-3 border-t border-line pt-2">
                            <p>{formatLabel(analysis.analysis_status)} analysis · margin {formatPercent(analysis.contribution_margin_percent)}</p>
                            <p>After ads {formatMoney(analysis.contribution_profit_after_ads, analysis.currency)} · selling price {formatMoney(analysis.selling_price, analysis.currency)}</p>
                            <p>{approvalText(analysis.approved, analysis.approval_label)}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function EvidenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      {items.length === 0 ? <p className="text-muted">None recorded.</p> : (
        <ul className="mt-1 list-disc pl-5">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}
