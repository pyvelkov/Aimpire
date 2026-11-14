import {
  approvalLabel,
  isApproved,
  recommendationLabel,
  type DashboardReader,
  type Row,
} from "./dashboard-read.service.js";

export class ProductNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super("Product not found");
    this.name = "ProductNotFoundError";
  }
}

export type DecisionView = {
  id: string;
  recommendation: string;
  recommendation_label: string;
  decision_status: string;
  approval_status: string;
  approval_label: "Approved" | "Not approved";
  approved: boolean;
  decision_score: number | null;
  created_at: string;
};

export type ManagedProduct = {
  id: string;
  name: string;
  category: string | null;
  status: string;
  target_market: string[];
  created_at: string;
  updated_at: string | null;
  latest_decision: DecisionView | null;
};

export type ShippingEvidence = {
  verification_status: string;
  evidence_label: string;
  confirmed: boolean;
};

export type ProductDetail = {
  product: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    status: string;
    target_market: string[];
    source_url: string | null;
    supplier_name: string | null;
    supplier_url: string | null;
    created_at: string;
    updated_at: string | null;
    preliminary_recommendation: string | null;
  };
  discoveries: Array<{
    id: string;
    supplier_name: string;
    supplier_url: string | null;
    product_url: string | null;
    product_title: string | null;
    platform: string | null;
    verification_status: string;
    evidence_label: string;
    confirmed: boolean;
    evidence_url: string | null;
    evidence_notes: string | null;
    discovery_method: string | null;
    created_at: string;
  }>;
  discovery_runs: Array<{
    id: string;
    status: string;
    created_at: string;
    extraction_error: string | null;
  }>;
  listings: Array<{
    id: string;
    sku: string;
    product_title: string;
    product_url: string | null;
    material: string | null;
    reported_price: number | null;
    reported_currency: string | null;
    verification_status: string;
    evidence_label: string;
    confirmed: boolean;
    price_evidence_text: string | null;
    missing_evidence: string[];
    verification: null | {
      id: string;
      review_status: string;
      sku_match_confirmed: boolean;
      displayed_price: number | null;
      currency: string | null;
      variant_description: string | null;
      material_description: string | null;
      listed_weight_grams: number | null;
      shipping_ca_status: string;
      shipping_ca_label: string;
      shipping_us_status: string;
      shipping_us_label: string;
      food_contact_documentation_status: string;
      evidence_source: string | null;
      evidence_notes: string | null;
      checked_at: string | null;
    };
    shipping_quotes: Array<ShippingEvidence & {
      id: string;
      market: string;
      shipping_method: string;
      shipping_cost: number | null;
      currency: string;
      destination_region: string | null;
      estimated_delivery_min_days: number | null;
      estimated_delivery_max_days: number | null;
      evidence_notes: string | null;
      created_at: string;
    }>;
    analyses: Array<{
      id: string;
      market: string;
      currency: string;
      analysis_status: string;
      approval_status: string;
      approval_label: "Approved" | "Not approved";
      approved: boolean;
      selling_price: number | null;
      contribution_margin_percent: number | null;
      contribution_profit_after_ads: number | null;
      created_at: string;
    }>;
  }>;
  listing_research_runs: Array<{
    id: string;
    status: string;
    extraction_status: string | null;
    extraction_error: string | null;
    created_at: string;
  }>;
  decision: null | (DecisionView & {
    listing_id: string | null;
    reasons: string[];
    risks: string[];
    next_actions: string[];
    engine_version: string | null;
  });
  gaps: string[];
};

export function quoteEvidence(status: unknown): ShippingEvidence {
  const verificationStatus = typeof status === "string" && status.trim()
    ? status.trim()
    : "unverified";
  const confirmed = verificationStatus === "verified";
  return {
    verification_status: verificationStatus,
    evidence_label: confirmed ? "Verified" : "Unverified — not confirmed",
    confirmed,
  };
}

export function marketShippingLabel(status: unknown): string {
  const value = typeof status === "string" && status.trim() ? status.trim() : "unknown";
  if (value === "verified") {
    return "Verified";
  }
  if (value === "unknown") {
    return "Unknown — not verified";
  }
  if (value === "unverified") {
    return "Unverified — not confirmed";
  }
  return `${value.replaceAll("_", " ")} — not verified`;
}

function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clip(value: string | null, max = 400): string | null {
  if (!value || value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function decisionCore(row: Row): DecisionView {
  const recommendation = text(row.recommendation);
  const approvalStatus = text(row.approval_status, "not_approved");
  return {
    id: text(row.id),
    recommendation,
    recommendation_label: recommendationLabel(recommendation),
    decision_status: text(row.decision_status, "proposed"),
    approval_status: approvalStatus,
    approval_label: approvalLabel(approvalStatus),
    approved: isApproved(approvalStatus),
    decision_score: toNumber(row.decision_score),
    created_at: text(row.created_at),
  };
}

function preliminaryRecommendation(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return nullableText((value as Row).recommendation);
}

export class ProductManagementService {
  constructor(private readonly reader: DashboardReader) {}

  async products(): Promise<ManagedProduct[]> {
    const [candidates, decisions] = await Promise.all([
      this.reader.list({
        table: "product_candidates",
        columns: "id, name, category, status, target_market, created_at, updated_at",
        limit: 200,
        orderBy: "updated_at",
      }),
      this.reader.list({
        table: "product_decisions",
        columns: "id, candidate_id, recommendation, decision_status, approval_status, decision_score, created_at",
        limit: 200,
        orderBy: "created_at",
      }),
    ]);
    const latest = new Map<string, Row>();
    for (const decision of decisions) {
      const candidateId = text(decision.candidate_id);
      if (candidateId && !latest.has(candidateId)) {
        latest.set(candidateId, decision);
      }
    }

    return candidates.map((row) => ({
      id: text(row.id),
      name: text(row.name, "Untitled product"),
      category: nullableText(row.category),
      status: text(row.status, "discovered"),
      target_market: stringList(row.target_market),
      created_at: text(row.created_at),
      updated_at: nullableText(row.updated_at),
      latest_decision: latest.has(text(row.id))
        ? decisionCore(latest.get(text(row.id)) as Row)
        : null,
    }));
  }

  async productDetail(id: string): Promise<ProductDetail> {
    const candidates = await this.reader.list({
      table: "product_candidates",
      columns: "id, name, description, category, status, target_market, source_url, supplier_name, supplier_url, evaluation_data, created_at, updated_at",
      limit: 1,
      filters: [{ column: "id", value: id }],
    });
    const candidate = candidates[0];
    if (!candidate || text(candidate.id) !== id) {
      throw new ProductNotFoundError();
    }

    const [discoveries, discoveryRuns, listings, researchRuns, decisions] = await Promise.all([
      this.reader.list({
        table: "supplier_discoveries",
        columns: "id, supplier_name, supplier_url, product_url, product_title, platform, verification_status, evidence_url, evidence_notes, discovery_method, created_at",
        limit: 50,
        orderBy: "created_at",
        filters: [{ column: "candidate_id", value: id }],
      }),
      this.reader.list({
        table: "supplier_discovery_runs",
        columns: "id, status, created_at, extraction_error",
        limit: 20,
        orderBy: "created_at",
        filters: [{ column: "candidate_id", value: id }],
      }),
      this.reader.list({
        table: "supplier_product_listings",
        columns: "id, sku, product_title, product_url, material, reported_price, reported_currency, verification_status, price_evidence_text, missing_evidence, created_at",
        limit: 50,
        orderBy: "created_at",
        filters: [{ column: "candidate_id", value: id }],
      }),
      this.reader.list({
        table: "supplier_listing_research_runs",
        columns: "id, status, extraction_status, extraction_error, created_at",
        limit: 20,
        orderBy: "created_at",
        filters: [{ column: "candidate_id", value: id }],
      }),
      this.reader.list({
        table: "product_decisions",
        columns: "id, listing_id, recommendation, decision_status, approval_status, decision_score, reasons, risks, next_actions, engine_version, created_at",
        limit: 20,
        orderBy: "created_at",
        filters: [{ column: "candidate_id", value: id }],
      }),
    ]);

    const listingIds = listings.map((row) => text(row.id)).filter(Boolean);
    const verifications = listingIds.length === 0
      ? []
      : await this.reader.list({
        table: "supplier_listing_verifications",
        columns: "id, listing_id, review_status, sku_match_confirmed, displayed_price, currency, variant_description, material_description, listed_weight_grams, shipping_ca_status, shipping_us_status, food_contact_documentation_status, evidence_source, evidence_notes, checked_at, updated_at",
        limit: listingIds.length * 3,
        in: { column: "listing_id", values: listingIds },
      });
    const verificationIds = verifications.map((row) => text(row.id)).filter(Boolean);
    const [quotes, analyses] = await Promise.all([
      verificationIds.length === 0
        ? Promise.resolve([] as Row[])
        : this.reader.list({
          table: "supplier_shipping_quotes",
          columns: "id, verification_id, market, verification_status, shipping_method, shipping_cost, currency, destination_region, estimated_delivery_min_days, estimated_delivery_max_days, evidence_notes, created_at",
          limit: 50,
          orderBy: "created_at",
          in: { column: "verification_id", values: verificationIds },
        }),
      listingIds.length === 0
        ? Promise.resolve([] as Row[])
        : this.reader.list({
          table: "product_profitability_analyses",
          columns: "id, listing_id, market, currency, analysis_status, approval_status, calculation, created_at",
          limit: 50,
          orderBy: "created_at",
          in: { column: "listing_id", values: listingIds },
        }),
    ]);

    const verificationByListing = new Map<string, Row>();
    for (const verification of verifications) {
      const listingId = text(verification.listing_id);
      const current = verificationByListing.get(listingId);
      if (!current || text(verification.updated_at) > text(current.updated_at)) {
        verificationByListing.set(listingId, verification);
      }
    }

    const detailListings = listings.map((row) => {
      const verification = verificationByListing.get(text(row.id)) ?? null;
      const verificationId = verification ? text(verification.id) : "";
      const listingQuotes = quotes
        .filter((quote) => text(quote.verification_id) === verificationId)
        .map((quote) => ({
          id: text(quote.id),
          market: text(quote.market),
          ...quoteEvidence(quote.verification_status),
          shipping_method: text(quote.shipping_method, "Unspecified method"),
          shipping_cost: toNumber(quote.shipping_cost),
          currency: text(quote.currency, "USD"),
          destination_region: nullableText(quote.destination_region),
          estimated_delivery_min_days: toNumber(quote.estimated_delivery_min_days),
          estimated_delivery_max_days: toNumber(quote.estimated_delivery_max_days),
          evidence_notes: clip(nullableText(quote.evidence_notes)),
          created_at: text(quote.created_at),
        }));
      const listingAnalyses = analyses
        .filter((analysis) => text(analysis.listing_id) === text(row.id))
        .map((analysis) => {
          const calculation = analysis.calculation && typeof analysis.calculation === "object"
            ? analysis.calculation as Row
            : {};
          const approvalStatus = text(analysis.approval_status, "not_approved");
          return {
            id: text(analysis.id),
            market: text(analysis.market),
            currency: text(analysis.currency, "USD"),
            analysis_status: text(analysis.analysis_status, "preliminary"),
            approval_status: approvalStatus,
            approval_label: approvalLabel(approvalStatus),
            approved: isApproved(approvalStatus),
            selling_price: toNumber(calculation.selling_price),
            contribution_margin_percent: toNumber(calculation.contribution_margin_percent),
            contribution_profit_after_ads: toNumber(calculation.contribution_profit_after_ads),
            created_at: text(analysis.created_at),
          };
        });
      const listingEvidence = quoteEvidence(row.verification_status);
      const caStatus = text(verification?.shipping_ca_status, "unknown");
      const usStatus = text(verification?.shipping_us_status, "unknown");

      return {
        id: text(row.id),
        sku: text(row.sku, "Unknown SKU"),
        product_title: text(row.product_title, "Untitled listing"),
        product_url: nullableText(row.product_url),
        material: nullableText(row.material),
        reported_price: toNumber(row.reported_price),
        reported_currency: nullableText(row.reported_currency),
        verification_status: listingEvidence.verification_status,
        evidence_label: listingEvidence.evidence_label,
        confirmed: listingEvidence.confirmed,
        price_evidence_text: clip(nullableText(row.price_evidence_text)),
        missing_evidence: stringList(row.missing_evidence),
        verification: verification
          ? {
            id: text(verification.id),
            review_status: text(verification.review_status, "not_recorded"),
            sku_match_confirmed: verification.sku_match_confirmed === true,
            displayed_price: toNumber(verification.displayed_price),
            currency: nullableText(verification.currency),
            variant_description: nullableText(verification.variant_description),
            material_description: nullableText(verification.material_description),
            listed_weight_grams: toNumber(verification.listed_weight_grams),
            shipping_ca_status: caStatus,
            shipping_ca_label: marketShippingLabel(caStatus),
            shipping_us_status: usStatus,
            shipping_us_label: marketShippingLabel(usStatus),
            food_contact_documentation_status: text(
              verification.food_contact_documentation_status,
              "not_recorded",
            ),
            evidence_source: nullableText(verification.evidence_source),
            evidence_notes: clip(nullableText(verification.evidence_notes)),
            checked_at: nullableText(verification.checked_at),
          }
          : null,
        shipping_quotes: listingQuotes,
        analyses: listingAnalyses,
      };
    });

    const latestDecision = decisions[0];
    const decision = latestDecision
      ? {
        ...decisionCore(latestDecision),
        listing_id: nullableText(latestDecision.listing_id),
        reasons: stringList(latestDecision.reasons),
        risks: stringList(latestDecision.risks),
        next_actions: stringList(latestDecision.next_actions),
        engine_version: nullableText(latestDecision.engine_version),
      }
      : null;

    const detail: ProductDetail = {
      product: {
        id: text(candidate.id),
        name: text(candidate.name, "Untitled product"),
        description: clip(nullableText(candidate.description), 1200),
        category: nullableText(candidate.category),
        status: text(candidate.status, "discovered"),
        target_market: stringList(candidate.target_market),
        source_url: nullableText(candidate.source_url),
        supplier_name: nullableText(candidate.supplier_name),
        supplier_url: nullableText(candidate.supplier_url),
        created_at: text(candidate.created_at),
        updated_at: nullableText(candidate.updated_at),
        preliminary_recommendation: preliminaryRecommendation(candidate.evaluation_data),
      },
      discoveries: discoveries.map((row) => {
        const evidence = quoteEvidence(row.verification_status);
        return {
          id: text(row.id),
          supplier_name: text(row.supplier_name, "Unnamed supplier"),
          supplier_url: nullableText(row.supplier_url),
          product_url: nullableText(row.product_url),
          product_title: nullableText(row.product_title),
          platform: nullableText(row.platform),
          verification_status: evidence.verification_status,
          evidence_label: evidence.evidence_label,
          confirmed: evidence.confirmed,
          evidence_url: nullableText(row.evidence_url),
          evidence_notes: clip(nullableText(row.evidence_notes)),
          discovery_method: nullableText(row.discovery_method),
          created_at: text(row.created_at),
        };
      }),
      discovery_runs: discoveryRuns.map((row) => ({
        id: text(row.id),
        status: text(row.status, "unknown"),
        created_at: text(row.created_at),
        extraction_error: clip(nullableText(row.extraction_error)),
      })),
      listings: detailListings,
      listing_research_runs: researchRuns.map((row) => ({
        id: text(row.id),
        status: text(row.status, "unknown"),
        extraction_status: nullableText(row.extraction_status),
        extraction_error: clip(nullableText(row.extraction_error)),
        created_at: text(row.created_at),
      })),
      decision,
      gaps: [],
    };
    detail.gaps = evidenceGaps(detail);
    return detail;
  }
}

function evidenceGaps(detail: ProductDetail): string[] {
  const gaps: string[] = [];
  if (detail.discoveries.length === 0) {
    gaps.push("No supplier discoveries");
  }
  if (detail.listings.length === 0) {
    gaps.push("No extracted supplier listings");
    gaps.push("No Canada shipping estimate");
    gaps.push("No United States shipping estimate");
    gaps.push("No saved Canada profitability analysis");
    gaps.push("No saved United States profitability analysis");
  }

  for (const listing of detail.listings) {
    const sku = listing.sku;
    if (!listing.verification) {
      gaps.push(`Manual verification missing for ${sku}`);
    } else {
      if (listing.verification.shipping_ca_status !== "verified") {
        gaps.push(`Canada shipping status for ${sku} is ${listing.verification.shipping_ca_status}, not verified`);
      }
      if (listing.verification.shipping_us_status !== "verified") {
        gaps.push(`United States shipping status for ${sku} is ${listing.verification.shipping_us_status}, not verified`);
      }
    }
    for (const market of ["CA", "US"] as const) {
      const marketName = market === "CA" ? "Canada" : "United States";
      const quotes = listing.shipping_quotes.filter((quote) => quote.market === market);
      const analyses = listing.analyses.filter((analysis) => analysis.market === market);
      if (quotes.length === 0) {
        gaps.push(`No ${marketName} shipping estimate for ${sku}`);
      }
      for (const quote of quotes) {
        if (!quote.confirmed) {
          gaps.push(`${marketName} shipping estimate for ${sku} is ${quote.verification_status}, not confirmed`);
        }
      }
      if (analyses.length === 0) {
        gaps.push(`No saved ${marketName} profitability analysis for ${sku}`);
      }
    }
  }

  if (!detail.decision) {
    gaps.push("No product decision has been saved");
  }
  return gaps;
}
