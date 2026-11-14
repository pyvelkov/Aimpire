import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isLoopbackAddress } from "../security/loopback.js";
import { supabase } from "../lib/supabase.js";
import {
  DEFAULT_DECISION_THRESHOLDS,
  ENGINE_VERSION,
  evaluateProductDecision,
  type CandidateRecord,
  type DecisionEvidence,
  type DecisionThresholds,
  type ListingRecord,
  type ProfitabilityAnalysisRecord,
  type ShippingQuoteRecord,
  type VerificationRecord,
} from "./product-decision.engine.js";

export const productDecisionSchema = z.object({
  sku: z.string().trim().min(2),
});

export class ProductDecisionRequestError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "ProductDecisionRequestError";
  }
}

export class ProductDecisionDataError extends Error {
  readonly statusCode = 500;

  constructor(message: string) {
    super(message);
    this.name = "ProductDecisionDataError";
  }
}

export type ProductDecisionResponse = {
  decision_id: string;
  sku: string;
  recommendation: "investigate_further" | "hold" | "ready_for_review";
  decision_status: "proposed";
  approval_status: "not_approved";
  decision_score: number;
  reasons: string[];
  risks: string[];
  next_actions: string[];
  evidence_snapshot: Record<string, unknown>;
  engine_version: string;
};

type QueryError = { message: string } | null;

type QueryResult = {
  data: unknown;
  error: QueryError;
};

type DecisionQuery = {
  select: (columns?: string) => DecisionQuery;
  eq: (column: string, value: unknown) => DecisionQuery;
  insert: (row: Record<string, unknown>) => DecisionQuery;
  single: () => Promise<QueryResult>;
  then: PromiseLike<QueryResult>["then"];
};

export type ProductDecisionDb = {
  from: (table: string) => DecisionQuery;
};

type Row = Record<string, unknown>;

export function isLocalDecisionRequest(
  ip: string | undefined | null,
): boolean {
  return isLoopbackAddress(ip);
}

export function readDecisionThresholds(
  env: NodeJS.ProcessEnv = process.env,
): DecisionThresholds {
  return {
    minimum_contribution_profit_after_ads: parseThreshold(
      env.PRODUCT_DECISION_MIN_CONTRIBUTION_AFTER_ADS,
      DEFAULT_DECISION_THRESHOLDS.minimum_contribution_profit_after_ads,
      "PRODUCT_DECISION_MIN_CONTRIBUTION_AFTER_ADS",
    ),
    minimum_contribution_margin_percent: parseThreshold(
      env.PRODUCT_DECISION_MIN_MARGIN_PERCENT,
      DEFAULT_DECISION_THRESHOLDS.minimum_contribution_margin_percent,
      "PRODUCT_DECISION_MIN_MARGIN_PERCENT",
    ),
  };
}

export class ProductDecisionService {
  constructor(
    private readonly db: ProductDecisionDb = supabase as unknown as ProductDecisionDb,
  ) {}

  async decide(
    sku: string,
    thresholds = readDecisionThresholds(),
  ): Promise<ProductDecisionResponse> {
    if (typeof sku !== "string" || sku.trim().length < 2) {
      throw new ProductDecisionRequestError("Invalid SKU");
    }

    const normalized = sku.trim().toUpperCase();
    const listing = await this.loadListing(normalized);
    const candidate = await this.loadCandidate(listing.candidate_id);
    const verifications = await this.loadVerifications(listing.id);
    const quotes = verifications.length === 1
      ? await this.loadQuotes(verifications[0].id)
      : [];
    const analyses = await this.loadAnalyses(listing.id);
    const evidence: DecisionEvidence = {
      listing,
      candidate,
      verifications,
      quotes,
      analyses,
    };
    const decision = evaluateProductDecision(
      evidence,
      thresholds,
    );

    const saved = await this.insertDecision(
      listing,
      candidate,
      decision,
    );

    return saved;
  }

  private async loadListing(sku: string): Promise<ListingRecord> {
    const rows = await this.loadRows(
      "supplier_product_listings",
      "id, sku, candidate_id, product_title, verification_status",
      "sku",
      sku,
    );

    if (rows.length === 0) {
      throw new ProductDecisionRequestError("Invalid SKU");
    }

    if (rows.length > 1) {
      throw new ProductDecisionRequestError(
        "Ambiguous SKU: expected exactly one supplier listing",
      );
    }

    const listing = asListing(rows[0]);

    if (listing.sku !== sku) {
      throw new ProductDecisionDataError(
        "Supplier listing SKU did not match the requested SKU",
      );
    }

    return listing;
  }

  private async loadCandidate(
    candidateId: string,
  ): Promise<CandidateRecord> {
    const rows = await this.loadRows(
      "product_candidates",
      "id, name, category, status",
      "id",
      candidateId,
    );

    if (rows.length !== 1) {
      throw new ProductDecisionDataError(
        "Product candidate record could not be resolved for the supplier listing",
      );
    }

    const candidate = asCandidate(rows[0]);

    if (candidate.id !== candidateId) {
      throw new ProductDecisionDataError(
        "Product candidate did not match the supplier listing",
      );
    }

    return candidate;
  }

  private async loadVerifications(
    listingId: string,
  ): Promise<VerificationRecord[]> {
    const rows = await this.loadRows(
      "supplier_listing_verifications",
      [
        "id",
        "listing_id",
        "product_url",
        "sku_match_confirmed",
        "displayed_price",
        "currency",
        "variant_description",
        "shipping_ca_status",
        "shipping_us_status",
        "food_contact_documentation_status",
        "review_status",
      ].join(", "),
      "listing_id",
      listingId,
    );

    return rows.map((row) => {
      const verification = asVerification(row);

      if (verification.listing_id !== listingId) {
        throw new ProductDecisionDataError(
          "Supplier verification did not match the supplier listing",
        );
      }

      return verification;
    });
  }

  private async loadQuotes(
    verificationId: string,
  ): Promise<ShippingQuoteRecord[]> {
    const rows = await this.loadRows(
      "supplier_shipping_quotes",
      [
        "id",
        "verification_id",
        "market",
        "destination_region",
        "destination_postal_code",
        "quantity",
        "variant_description",
        "shipping_method",
        "shipping_cost",
        "currency",
        "evidence_source",
        "verification_status",
        "captured_at",
      ].join(", "),
      "verification_id",
      verificationId,
    );

    return rows.map((row) => {
      const quote = asQuote(row);

      if (quote.verification_id !== verificationId) {
        throw new ProductDecisionDataError(
          "Shipping quote did not match the supplier verification",
        );
      }

      return quote;
    });
  }

  private async loadAnalyses(
    listingId: string,
  ): Promise<ProfitabilityAnalysisRecord[]> {
    const rows = await this.loadRows(
      "product_profitability_analyses",
      [
        "id",
        "listing_id",
        "verification_id",
        "shipping_quote_id",
        "market",
        "currency",
        "assumptions",
        "calculation",
        "evidence_snapshot",
        "analysis_status",
        "approval_status",
        "calculator_version",
        "created_at",
      ].join(", "),
      "listing_id",
      listingId,
    );

    return rows.map((row) => {
      const analysis = asAnalysis(row);

      if (analysis.listing_id !== listingId) {
        throw new ProductDecisionDataError(
          "Profitability analysis did not match the supplier listing",
        );
      }

      return analysis;
    });
  }

  private async insertDecision(
    listing: ListingRecord,
    candidate: CandidateRecord,
    decision: ReturnType<typeof evaluateProductDecision>,
  ): Promise<ProductDecisionResponse> {
    const payload = {
      candidate_id: candidate.id,
      listing_id: listing.id,
      recommendation: decision.recommendation,
      decision_status: "proposed" as const,
      approval_status: "not_approved" as const,
      decision_score: decision.decision_score,
      reasons: decision.reasons,
      risks: decision.risks,
      next_actions: decision.next_actions,
      evidence_snapshot: decision.evidence_snapshot,
      engine_version: ENGINE_VERSION,
    };
    const { data, error } = await this.db
      .from("product_decisions")
      .insert(payload)
      .select(
        [
          "id",
          "recommendation",
          "decision_status",
          "approval_status",
          "decision_score",
          "reasons",
          "risks",
          "next_actions",
          "evidence_snapshot",
          "engine_version",
        ].join(", "),
      )
      .single();

    if (error) {
      throw new ProductDecisionDataError(
        `Failed to save product decision: ${error.message}`,
      );
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new ProductDecisionDataError(
        "Failed to save product decision: database returned no row",
      );
    }

    return asSavedDecision(
      data as unknown as Row,
      listing.sku,
      decision,
    );
  }

  private async loadRows(
    table: string,
    columns: string,
    column: string,
    value: string,
  ): Promise<Row[]> {
    const { data, error } = await this.db
      .from(table)
      .select(columns)
      .eq(column, value);

    if (error) {
      throw new ProductDecisionDataError(
        `Failed to load ${table}: ${error.message}`,
      );
    }

    if (!Array.isArray(data)) {
      throw new ProductDecisionDataError(
        `Failed to load ${table}: database returned no row set`,
      );
    }

    return data.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new ProductDecisionDataError(
          `Failed to load ${table}: database returned a row that is not an object`,
        );
      }

      return row as Row;
    });
  }
}

export function registerProductDecisionRoute(
  app: FastifyInstance,
  service: Pick<ProductDecisionService, "decide"> = productDecisionService,
) {
  app.post(
    "/agents/product/decide",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isLocalDecisionRequest(request.ip)) {
        return reply.status(403).send({
          success: false,
          error: "Product decision is available only from localhost",
        });
      }

      const parsed = productDecisionSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "Invalid SKU",
          details: parsed.error.issues,
        });
      }

      try {
        const decision = await service.decide(parsed.data.sku);

        return {
          success: true,
          ...decision,
        };
      } catch (error) {
        if (error instanceof ProductDecisionRequestError) {
          return reply.status(400).send({
            success: false,
            error: error.message,
          });
        }

        request.log.error(error);

        return reply.status(500).send({
          success: false,
          error: error instanceof Error
            ? error.message
            : "Product decision failed",
        });
      }
    },
  );
}

function parseThreshold(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new ProductDecisionDataError(
      `Invalid profitability threshold ${name}`,
    );
  }

  return parsed;
}

function asListing(row: Row): ListingRecord {
  return {
    id: requiredString(row, "id", "supplier_product_listings"),
    sku: requiredString(row, "sku", "supplier_product_listings"),
    candidate_id: requiredString(
      row,
      "candidate_id",
      "supplier_product_listings",
    ),
    product_title: requiredString(
      row,
      "product_title",
      "supplier_product_listings",
    ),
    verification_status: requiredString(
      row,
      "verification_status",
      "supplier_product_listings",
    ),
  };
}

function asCandidate(row: Row): CandidateRecord {
  return {
    id: requiredString(row, "id", "product_candidates"),
    name: requiredString(row, "name", "product_candidates"),
    category: nullableString(row, "category", "product_candidates"),
    status: requiredString(row, "status", "product_candidates"),
  };
}

function asVerification(row: Row): VerificationRecord {
  const table = "supplier_listing_verifications";

  if (typeof row.sku_match_confirmed !== "boolean") {
    throw new ProductDecisionDataError(
      `Failed to load ${table}: column sku_match_confirmed was missing`,
    );
  }

  return {
    id: requiredString(row, "id", table),
    listing_id: requiredString(row, "listing_id", table),
    product_url: nullableString(row, "product_url", table),
    sku_match_confirmed: row.sku_match_confirmed,
    displayed_price: nullableNumber(row, "displayed_price", table),
    currency: nullableString(row, "currency", table),
    variant_description: nullableString(
      row,
      "variant_description",
      table,
    ),
    shipping_ca_status: requiredString(
      row,
      "shipping_ca_status",
      table,
    ),
    shipping_us_status: requiredString(
      row,
      "shipping_us_status",
      table,
    ),
    food_contact_documentation_status: requiredString(
      row,
      "food_contact_documentation_status",
      table,
    ),
    review_status: requiredString(row, "review_status", table),
  };
}

function asQuote(row: Row): ShippingQuoteRecord {
  const table = "supplier_shipping_quotes";

  return {
    id: requiredString(row, "id", table),
    verification_id: requiredString(row, "verification_id", table),
    market: requiredString(row, "market", table),
    destination_region: nullableString(
      row,
      "destination_region",
      table,
    ),
    destination_postal_code: nullableString(
      row,
      "destination_postal_code",
      table,
    ),
    quantity: nullableNumber(row, "quantity", table),
    variant_description: nullableString(
      row,
      "variant_description",
      table,
    ),
    shipping_method: nullableString(row, "shipping_method", table),
    shipping_cost: nullableNumber(row, "shipping_cost", table),
    currency: nullableString(row, "currency", table),
    evidence_source: nullableString(row, "evidence_source", table),
    verification_status: nullableString(
      row,
      "verification_status",
      table,
    ),
    captured_at: nullableString(row, "captured_at", table),
  };
}

function asAnalysis(row: Row): ProfitabilityAnalysisRecord {
  const table = "product_profitability_analyses";

  if (!Object.prototype.hasOwnProperty.call(row, "calculation")) {
    throw new ProductDecisionDataError(
      `Failed to load ${table}: column calculation was missing`,
    );
  }

  if (!Object.prototype.hasOwnProperty.call(row, "evidence_snapshot")) {
    throw new ProductDecisionDataError(
      `Failed to load ${table}: column evidence_snapshot was missing`,
    );
  }

  if (!Object.prototype.hasOwnProperty.call(row, "assumptions")) {
    throw new ProductDecisionDataError(
      `Failed to load ${table}: column assumptions was missing`,
    );
  }

  return {
    id: requiredString(row, "id", table),
    listing_id: requiredString(row, "listing_id", table),
    verification_id: requiredString(row, "verification_id", table),
    shipping_quote_id: requiredString(
      row,
      "shipping_quote_id",
      table,
    ),
    market: requiredString(row, "market", table),
    currency: nullableString(row, "currency", table),
    assumptions: row.assumptions,
    calculation: row.calculation,
    evidence_snapshot: row.evidence_snapshot,
    analysis_status: nullableString(row, "analysis_status", table),
    approval_status: nullableString(row, "approval_status", table),
    calculator_version: nullableString(
      row,
      "calculator_version",
      table,
    ),
    created_at: requiredString(row, "created_at", table),
  };
}

function asSavedDecision(
  row: Row,
  sku: string,
  decision: ReturnType<typeof evaluateProductDecision>,
): ProductDecisionResponse {
  const recommendation = requiredString(
    row,
    "recommendation",
    "product_decisions",
  );
  const decisionStatus = requiredString(
    row,
    "decision_status",
    "product_decisions",
  );
  const approvalStatus = requiredString(
    row,
    "approval_status",
    "product_decisions",
  );
  const score = finiteNumber(row.decision_score);

  if (
    recommendation !== decision.recommendation ||
    decisionStatus !== "proposed" ||
    approvalStatus !== "not_approved" ||
    score !== decision.decision_score ||
    !sameJson(row.reasons, decision.reasons) ||
    !sameJson(row.risks, decision.risks) ||
    !sameJson(row.next_actions, decision.next_actions)
  ) {
    throw new ProductDecisionDataError(
      "Saved product decision did not match the engine result",
    );
  }

  const snapshot = row.evidence_snapshot;

  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot)
  ) {
    throw new ProductDecisionDataError(
      "Saved product decision is missing its evidence snapshot",
    );
  }

  return {
    decision_id: requiredString(row, "id", "product_decisions"),
    sku,
    recommendation: decision.recommendation,
    decision_status: "proposed",
    approval_status: "not_approved",
    decision_score: score,
    reasons: decision.reasons,
    risks: decision.risks,
    next_actions: decision.next_actions,
    evidence_snapshot: snapshot as Record<string, unknown>,
    engine_version: requiredString(
      row,
      "engine_version",
      "product_decisions",
    ),
  };
}

function requiredString(
  row: Row,
  field: string,
  table: string,
): string {
  const value = row[field];

  if (typeof value !== "string" || value.trim() === "") {
    throw new ProductDecisionDataError(
      `Failed to load ${table}: column ${field} was missing`,
    );
  }

  return value;
}

function nullableString(
  row: Row,
  field: string,
  table: string,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(row, field)) {
    throw new ProductDecisionDataError(
      `Failed to load ${table}: column ${field} was missing`,
    );
  }

  const value = row[field];

  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ProductDecisionDataError(
      `Failed to load ${table}: column ${field} was not text`,
    );
  }

  return value;
}

function nullableNumber(
  row: Row,
  field: string,
  table: string,
): number | string | null {
  if (!Object.prototype.hasOwnProperty.call(row, field)) {
    throw new ProductDecisionDataError(
      `Failed to load ${table}: column ${field} was missing`,
    );
  }

  const value = row[field];

  if (value == null) {
    return null;
  }

  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  throw new ProductDecisionDataError(
    `Failed to load ${table}: column ${field} was not numeric`,
  );
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export const productDecisionService = new ProductDecisionService();
