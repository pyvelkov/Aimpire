/**
 * Deterministic product decision engine for Aimpire stage 5.5.4.
 *
 * The engine reads saved profitability calculations. It does not call the
 * unit-economics calculator, Gemini, or any other model.
 *
 * Recommendation precedence:
 * 1. Current analyses with negative contribution after advertising in both
 *    CA and US recommend hold. Missing evidence is still reported.
 * 2. Any missing, unverified, ambiguous, stale, or unvalidated mandatory
 *    evidence recommends investigate_further.
 * 3. ready_for_review requires complete mandatory evidence, current
 *    analyses, explicit validation of selling price and acquisition cost,
 *    and saved results above the configured thresholds.
 * 4. Complete evidence that does not clear those thresholds recommends hold.
 *
 * Unknown values are never treated as zero or as verified.
 * Two analyses that both match the current evidence and disagree are
 * ambiguous; the newer one is not selected.
 * Approval is never granted by this engine.
 */

export const ENGINE_VERSION = "1.0";

export const MARKETS = ["CA", "US"] as const;

export type MarketCode = (typeof MARKETS)[number];

export const DEFAULT_DECISION_THRESHOLDS = {
  minimum_contribution_profit_after_ads: 0,
  minimum_contribution_margin_percent: 0,
} as const;

export type DecisionThresholds = {
  minimum_contribution_profit_after_ads: number;
  minimum_contribution_margin_percent: number;
};

export const SCORING_RUBRIC = [
  {
    id: "unique_listing",
    points: 4,
    description:
      "The request resolved to exactly one supplier listing",
  },
  {
    id: "candidate_linked",
    points: 4,
    description:
      "That listing is linked to exactly one product candidate",
  },
  {
    id: "product_verification",
    points: 12,
    description:
      "Manual review confirms the SKU, URL, variant, currency, and a numeric displayed price",
  },
  {
    id: "food_contact_documentation",
    points: 12,
    description:
      "Food-contact documentation status is provided, verified, or documented",
  },
  {
    id: "shipping_quote_CA",
    points: 4,
    description:
      "Canada has exactly one quantity-1 quote for the verified variant and currency",
  },
  {
    id: "shipping_quote_US",
    points: 4,
    description:
      "The United States has exactly one quantity-1 quote for the verified variant and currency",
  },
  {
    id: "shipping_verified_CA",
    points: 6,
    description:
      "The Canada quote verification_status is verified and shipping_ca_status is verified",
  },
  {
    id: "shipping_verified_US",
    points: 6,
    description:
      "The US quote verification_status is verified and shipping_us_status is verified",
  },
  {
    id: "destination_CA",
    points: 4,
    description:
      "The Canada quote has both a destination region and a postal code",
  },
  {
    id: "destination_US",
    points: 4,
    description:
      "The US quote has both a destination region and a postal code",
  },
  {
    id: "taxes_and_duties",
    points: 8,
    description:
      "Every current analysis explicitly says taxes and duties are included",
  },
  {
    id: "current_analysis_CA",
    points: 5,
    description:
      "The latest Canada analysis matches the current listing, verification, market, and shipping quote",
  },
  {
    id: "current_analysis_US",
    points: 5,
    description:
      "The latest US analysis matches the current listing, verification, market, and shipping quote",
  },
  {
    id: "price_and_acquisition_validated",
    points: 10,
    description:
      "Current analyses explicitly validate the selling price and acquisition cost and are not preliminary",
  },
  {
    id: "positive_contribution_CA",
    points: 6,
    description:
      "Saved Canada contribution_profit_after_ads is above the configured minimum",
  },
  {
    id: "positive_contribution_US",
    points: 6,
    description:
      "Saved US contribution_profit_after_ads is above the configured minimum",
  },
] as const;

export type ScoreRuleId = (typeof SCORING_RUBRIC)[number]["id"];

const FOOD_CONTACT_COMPLETE = new Set([
  "provided",
  "verified",
  "documented",
]);

const SCORE_NOTE =
  "decision_score sums the rubric above. It measures resolved evidence and whether the saved contribution clears the configured threshold. It does not approve the product, change supplier verification, or replace the saved calculation.";

export type ListingRecord = {
  id: string;
  sku: string;
  candidate_id: string;
  product_title: string;
  verification_status: string;
};

export type CandidateRecord = {
  id: string;
  name: string;
  category: string | null;
  status: string;
};

export type VerificationRecord = {
  id: string;
  listing_id: string;
  product_url: string | null;
  sku_match_confirmed: boolean;
  displayed_price: number | string | null;
  currency: string | null;
  variant_description: string | null;
  shipping_ca_status: string;
  shipping_us_status: string;
  food_contact_documentation_status: string;
  review_status: string;
};

export type ShippingQuoteRecord = {
  id: string;
  verification_id: string;
  market: string;
  destination_region: string | null;
  destination_postal_code: string | null;
  quantity: number | string | null;
  variant_description: string | null;
  shipping_method: string | null;
  shipping_cost: number | string | null;
  currency: string | null;
  evidence_source: string | null;
  verification_status: string | null;
  captured_at: string | null;
};

export type ProfitabilityAnalysisRecord = {
  id: string;
  listing_id: string;
  verification_id: string;
  shipping_quote_id: string;
  market: string;
  currency: string | null;
  assumptions: unknown;
  calculation: unknown;
  evidence_snapshot: unknown;
  analysis_status: string | null;
  approval_status: string | null;
  calculator_version: string | null;
  created_at: string;
};

export type DecisionEvidence = {
  listing: ListingRecord;
  candidate: CandidateRecord;
  verifications: VerificationRecord[];
  quotes: ShippingQuoteRecord[];
  analyses: ProfitabilityAnalysisRecord[];
};

export type ProductDecision = {
  recommendation:
    | "investigate_further"
    | "hold"
    | "ready_for_review";
  decision_status: "proposed";
  approval_status: "not_approved";
  decision_score: number;
  reasons: string[];
  risks: string[];
  next_actions: string[];
  evidence_snapshot: DecisionEvidenceSnapshot;
  engine_version: typeof ENGINE_VERSION;
};

type VerificationState =
  | "missing"
  | "ambiguous"
  | "incomplete"
  | "complete";

type QuoteState =
  | "missing"
  | "ambiguous"
  | "unverified"
  | "verified";

type AnalysisState =
  | "missing"
  | "ambiguous"
  | "stale"
  | "current";

type MarketAssessment = {
  market: MarketCode;
  quote: ShippingQuoteRecord | null;
  quoteState: QuoteState;
  destinationState: "present" | "missing" | "unknown";
  analysis: ProfitabilityAnalysisRecord | null;
  analysisState: AnalysisState;
  stalenessReasons: string[];
  usedForDecision: boolean;
  contributionAfterAds: number | null;
  contributionMarginPercent: number | null;
  currency: string | null;
  shippingMarketStatus: string | null;
  acquisition: "validated" | "unvalidated" | "unknown";
  sellingPrice: "validated" | "unvalidated" | "unknown";
  taxes: "included" | "missing" | "unknown";
};

export type DecisionEvidenceSnapshot = {
  stage: "5.5.4";
  engine_version: typeof ENGINE_VERSION;
  sku: string;
  listing_id: string;
  candidate_id: string;
  candidate_status: string;
  listing_verification_status: string;
  verification_id: string | null;
  verification_state: VerificationState;
  food_contact_documentation_status: string | null;
  thresholds: DecisionThresholds;
  scoring_rubric: typeof SCORING_RUBRIC;
  score_breakdown: Array<{
    id: ScoreRuleId;
    points: number;
    awarded: number;
    description: string;
  }>;
  score_note: string;
  recommendation_rule: string;
  mutates_existing_records: false;
  markets: Record<MarketCode, MarketSnapshot>;
};

type MarketSnapshot = {
  market: MarketCode;
  quote_id: string | null;
  quote_state: QuoteState;
  quote_verification_status: string | null;
  shipping_market_status: string | null;
  destination_region: string | null;
  destination_postal_code: string | null;
  destination_state: MarketAssessment["destinationState"];
  analysis_id: string | null;
  analysis_state: AnalysisState;
  analysis_status: string | null;
  observed_analysis_approval_status: string | null;
  calculator_version: string | null;
  staleness_reasons: string[];
  used_for_decision: boolean;
  contribution_profit_after_ads: number | null;
  contribution_margin_percent: number | null;
  calculation: unknown;
};

type VerificationAssessment = {
  state: VerificationState;
  record: VerificationRecord | null;
};

export function evaluateProductDecision(
  evidence: DecisionEvidence,
  thresholds: DecisionThresholds = DEFAULT_DECISION_THRESHOLDS,
): ProductDecision {
  if (
    !Number.isFinite(
      thresholds.minimum_contribution_profit_after_ads,
    ) ||
    !Number.isFinite(
      thresholds.minimum_contribution_margin_percent,
    )
  ) {
    throw new Error(
      "Decision thresholds must be finite numbers",
    );
  }

  const verification = assessVerification(
    evidence.verifications,
  );
  const markets = MARKETS.map((market) =>
    assessMarket(
      evidence,
      verification.record,
      market,
    ),
  );
  const foodContact = foodContactState(
    verification.record,
  );
  const mandatoryComplete = isMandatoryComplete(
    verification.state,
    foodContact,
    markets,
  );
  const bothCurrent = markets.every(
    (market) => market.usedForDecision,
  );
  const bothNegative =
    bothCurrent &&
    markets.every(
      (market) =>
        market.contributionAfterAds != null &&
        market.contributionAfterAds < 0,
    );
  const meetsThresholds =
    bothCurrent &&
    markets.every(
      (market) =>
        market.contributionAfterAds != null &&
        market.contributionMarginPercent != null &&
        market.contributionAfterAds >
          thresholds.minimum_contribution_profit_after_ads &&
        market.contributionMarginPercent >
          thresholds.minimum_contribution_margin_percent,
    );

  let recommendation: ProductDecision["recommendation"];
  let recommendationRule: string;

  if (bothNegative) {
    recommendation = "hold";
    recommendationRule =
      "negative_contribution_after_ads_both_markets";
  } else if (!mandatoryComplete) {
    recommendation = "investigate_further";
    recommendationRule = "missing_or_unverified_evidence";
  } else if (meetsThresholds) {
    recommendation = "ready_for_review";
    recommendationRule = "profitability_threshold_met";
  } else {
    recommendation = "hold";
    recommendationRule = "profitability_threshold_not_met";
  }

  const awarded = scoreEvidence(
    evidence,
    verification.state,
    foodContact,
    markets,
    thresholds,
  );
  const decisionScore = SCORING_RUBRIC.reduce(
    (total, rule) => total + awarded[rule.id],
    0,
  );
  const narrative = buildNarrative(
    evidence,
    verification,
    foodContact,
    markets,
    recommendation,
  );

  return {
    recommendation,
    decision_status: "proposed",
    approval_status: "not_approved",
    decision_score: decisionScore,
    reasons: narrative.reasons,
    risks: narrative.risks,
    next_actions: narrative.nextActions,
    engine_version: ENGINE_VERSION,
    evidence_snapshot: {
      stage: "5.5.4",
      engine_version: ENGINE_VERSION,
      sku: evidence.listing.sku,
      listing_id: evidence.listing.id,
      candidate_id: evidence.candidate.id,
      candidate_status: evidence.candidate.status,
      listing_verification_status:
        evidence.listing.verification_status,
      verification_id: verification.record?.id ?? null,
      verification_state: verification.state,
      food_contact_documentation_status:
        verification.record
          ?.food_contact_documentation_status ?? null,
      thresholds: {
        minimum_contribution_profit_after_ads:
          thresholds.minimum_contribution_profit_after_ads,
        minimum_contribution_margin_percent:
          thresholds.minimum_contribution_margin_percent,
      },
      scoring_rubric: SCORING_RUBRIC,
      score_breakdown: SCORING_RUBRIC.map((rule) => ({
        id: rule.id,
        points: rule.points,
        awarded: awarded[rule.id],
        description: rule.description,
      })),
      score_note: SCORE_NOTE,
      recommendation_rule: recommendationRule,
      mutates_existing_records: false,
      markets: {
        CA: marketSnapshot(markets[0]),
        US: marketSnapshot(markets[1]),
      },
    },
  };
}

function assessVerification(
  records: VerificationRecord[],
): VerificationAssessment {
  if (records.length === 0) {
    return { state: "missing", record: null };
  }

  if (records.length > 1) {
    return { state: "ambiguous", record: null };
  }

  const record = records[0];

  return {
    state: isCompleteVerification(record)
      ? "complete"
      : "incomplete",
    record,
  };
}

function isCompleteVerification(
  record: VerificationRecord,
): boolean {
  return (
    record.review_status === "manually_reviewed" &&
    record.sku_match_confirmed === true &&
    finiteNumber(record.displayed_price) != null &&
    presentText(record.currency) &&
    presentText(record.product_url) &&
    presentText(record.variant_description)
  );
}

function assessMarket(
  evidence: DecisionEvidence,
  verification: VerificationRecord | null,
  market: MarketCode,
): MarketAssessment {
  const empty: MarketAssessment = {
    market,
    quote: null,
    quoteState: "missing",
    destinationState: "unknown",
    analysis: null,
    analysisState: "missing",
    stalenessReasons: [],
    usedForDecision: false,
    contributionAfterAds: null,
    contributionMarginPercent: null,
    currency: null,
    shippingMarketStatus: verification
      ? market === "CA"
        ? verification.shipping_ca_status
        : verification.shipping_us_status
      : null,
    acquisition: "unknown",
    sellingPrice: "unknown",
    taxes: "unknown",
  };

  if (!verification) {
    const hasAnalysis = evidence.analyses.some(
      (analysis) => analysis.market === market,
    );

    return {
      ...empty,
      analysisState: hasAnalysis ? "stale" : "missing",
      stalenessReasons: hasAnalysis
        ? [
            "No unique supplier verification is available to validate the profitability analysis",
          ]
        : [],
    };
  }

  const matchingQuotes = evidence.quotes.filter((quote) =>
    quoteMatches(quote, verification, market),
  );
  const marketAnalyses = evidence.analyses.filter(
    (analysis) => analysis.market === market,
  );
  const selected = selectLatest(marketAnalyses);

  if (matchingQuotes.length !== 1) {
    const quoteState: QuoteState =
      matchingQuotes.length === 0 ? "missing" : "ambiguous";

    return {
      ...empty,
      quoteState,
      destinationState: "unknown",
      analysis: null,
      analysisState:
        selected.state === "missing" ? "missing" : "stale",
      stalenessReasons:
        selected.state === "missing"
          ? []
          : [
              quoteState === "missing"
                ? "No unique shipping quote is available to validate the profitability analysis"
                : "Multiple shipping quotes match; no profitability analysis was treated as current",
            ],
    };
  }

  const quote = matchingQuotes[0];
  const destinationState = hasDestination(quote)
    ? "present"
    : "missing";
  const quoteState = isVerifiedShipping(
    quote,
    verification,
    market,
  )
    ? "verified"
    : "unverified";

  if (selected.state === "missing") {
    return {
      ...empty,
      quote,
      quoteState,
      destinationState,
      analysisState: "missing",
    };
  }

  if (selected.state === "ambiguous") {
    return {
      ...empty,
      quote,
      quoteState,
      destinationState,
      analysisState: "ambiguous",
      stalenessReasons: [selected.reason],
    };
  }

  const stalenessReasons = stalenessOf(
    selected.analysis,
    evidence.listing,
    verification,
    quote,
    market,
  );
  const currentMatchesDisagree = marketAnalyses.some((analysis) =>
    analysis.id !== selected.analysis.id &&
    stalenessOf(
      analysis,
      evidence.listing,
      verification,
      quote,
      market,
    ).length === 0 &&
    !sameJson(analysis.calculation, selected.analysis.calculation)
  );

  if (stalenessReasons.length === 0 && currentMatchesDisagree) {
    return {
      ...empty,
      quote,
      quoteState,
      destinationState,
      analysisState: "ambiguous",
      stalenessReasons: [
        "Multiple profitability analyses match the current evidence and disagree",
      ],
    };
  }

  const current = stalenessReasons.length === 0;
  const limitations = current
    ? limitationLines(selected.analysis.evidence_snapshot)
    : [];
  const contributionAfterAds = current
    ? savedNumber(
        selected.analysis.calculation,
        "contribution_profit_after_ads",
      )
    : null;
  const contributionMarginPercent = current
    ? savedNumber(
        selected.analysis.calculation,
        "contribution_margin_percent",
      )
    : null;

  return {
    ...empty,
    quote,
    quoteState,
    destinationState,
    analysis: selected.analysis,
    analysisState: current ? "current" : "stale",
    stalenessReasons,
    usedForDecision: current,
    contributionAfterAds,
    contributionMarginPercent,
    currency: current
      ? selected.analysis.currency
      : null,
    acquisition: current
      ? classifyAcquisition(
          selected.analysis,
          limitations,
          savedNumber(
            selected.analysis.calculation,
            "estimated_acquisition_cost",
          ),
        )
      : "unknown",
    sellingPrice: current
      ? classifySellingPrice(
          selected.analysis,
          limitations,
        )
      : "unknown",
    taxes: current
      ? classifyTaxes(limitations)
      : "unknown",
  };
}

function quoteMatches(
  quote: ShippingQuoteRecord,
  verification: VerificationRecord,
  market: MarketCode,
): boolean {
  if (quote.verification_id !== verification.id) {
    return false;
  }

  if (quote.market !== market) {
    return false;
  }

  if (finiteNumber(quote.quantity) !== 1) {
    return false;
  }

  if (
    !presentText(verification.currency) ||
    quote.currency !== verification.currency
  ) {
    return false;
  }

  const quoteVariant = normalizedVariant(
    quote.variant_description,
  );
  const verificationVariant = normalizedVariant(
    verification.variant_description,
  );

  return (
    quoteVariant != null &&
    verificationVariant != null &&
    quoteVariant === verificationVariant
  );
}

function isVerifiedShipping(
  quote: ShippingQuoteRecord,
  verification: VerificationRecord,
  market: MarketCode,
): boolean {
  const marketStatus =
    market === "CA"
      ? verification.shipping_ca_status
      : verification.shipping_us_status;

  return (
    quote.verification_status === "verified" &&
    marketStatus === "verified"
  );
}

function hasDestination(quote: ShippingQuoteRecord): boolean {
  return (
    presentText(quote.destination_region) &&
    presentText(quote.destination_postal_code)
  );
}

function selectLatest(
  analyses: ProfitabilityAnalysisRecord[],
):
  | { state: "missing" }
  | { state: "ambiguous"; reason: string }
  | {
      state: "selected";
      analysis: ProfitabilityAnalysisRecord;
    } {
  if (analyses.length === 0) {
    return { state: "missing" };
  }

  const times = analyses.map((analysis) =>
    Date.parse(analysis.created_at),
  );

  if (times.some((time) => !Number.isFinite(time))) {
    return {
      state: "ambiguous",
      reason:
        "A profitability analysis has an unreadable created_at",
    };
  }

  const latest = Math.max(...times);
  const chosen = analyses.filter(
    (analysis) => Date.parse(analysis.created_at) === latest,
  );

  if (chosen.length !== 1) {
    return {
      state: "ambiguous",
      reason:
        "Multiple profitability analyses share the latest timestamp",
    };
  }

  return {
    state: "selected",
    analysis: chosen[0],
  };
}

function stalenessOf(
  analysis: ProfitabilityAnalysisRecord,
  listing: ListingRecord,
  verification: VerificationRecord,
  quote: ShippingQuoteRecord,
  market: MarketCode,
): string[] {
  const reasons: string[] = [];
  const snapshot = snapshotRecord(
    analysis.evidence_snapshot,
  );
  const calculation = snapshotRecord(analysis.calculation);

  if (analysis.listing_id !== listing.id) {
    reasons.push(
      "Analysis listing_id does not match the supplier listing",
    );
  }

  if (analysis.verification_id !== verification.id) {
    reasons.push(
      "Analysis verification_id does not match the supplier verification",
    );
  }

  if (analysis.market !== market) {
    reasons.push("Analysis market does not match");
  }

  if (analysis.shipping_quote_id !== quote.id) {
    reasons.push(
      "Analysis shipping_quote_id does not match the current shipping quote",
    );
  }

  if (
    !presentText(analysis.currency) ||
    analysis.currency !== quote.currency ||
    analysis.currency !== verification.currency
  ) {
    reasons.push(
      "Analysis currency does not match the verification and shipping quote",
    );
  }

  if (!snapshot) {
    reasons.push(
      "Profitability evidence snapshot is missing or not an object",
    );
  } else {
    compareSnapshot(
      reasons,
      snapshot,
      listing,
      verification,
      quote,
    );
  }

  if (!calculation) {
    reasons.push(
      "Saved calculation is missing or not an object",
    );
  } else {
    if (calculation.market !== market) {
      reasons.push(
        "Saved calculation market does not match",
      );
    }

    if (calculation.currency !== quote.currency) {
      reasons.push(
        "Saved calculation currency does not match the shipping quote",
      );
    }
  }

  return reasons;
}

function compareSnapshot(
  reasons: string[],
  snapshot: Record<string, unknown>,
  listing: ListingRecord,
  verification: VerificationRecord,
  quote: ShippingQuoteRecord,
) {
  requireSnapshot(reasons, snapshot, "sku", () =>
    snapshot.sku === listing.sku,
  );
  requireSnapshot(reasons, snapshot, "variant", () =>
    sameVariant(
      snapshot.variant,
      verification.variant_description,
    ),
  );
  requireSnapshot(reasons, snapshot, "product_url", () =>
    sameNullableText(
      snapshot.product_url,
      verification.product_url,
    ),
  );
  requireSnapshot(reasons, snapshot, "product_cost", () =>
    sameNumber(
      snapshot.product_cost,
      verification.displayed_price,
    ),
  );
  requireSnapshot(
    reasons,
    snapshot,
    "product_price_review_status",
    () =>
      sameNullableText(
        snapshot.product_price_review_status,
        verification.review_status,
      ),
  );
  requireSnapshot(reasons, snapshot, "shipping_cost", () =>
    sameNumber(snapshot.shipping_cost, quote.shipping_cost),
  );
  requireSnapshot(reasons, snapshot, "shipping_method", () =>
    sameNullableText(
      snapshot.shipping_method,
      quote.shipping_method,
    ),
  );
  requireSnapshot(
    reasons,
    snapshot,
    "shipping_quote_status",
    () =>
      sameNullableText(
        snapshot.shipping_quote_status,
        quote.verification_status,
      ),
  );
  requireSnapshot(
    reasons,
    snapshot,
    "shipping_evidence_source",
    () =>
      sameNullableText(
        snapshot.shipping_evidence_source,
        quote.evidence_source,
      ),
  );
  requireSnapshot(
    reasons,
    snapshot,
    "shipping_captured_at",
    () =>
      sameTimestamp(
        snapshot.shipping_captured_at,
        quote.captured_at,
      ),
  );
  requireSnapshot(reasons, snapshot, "quantity", () =>
    sameNumber(snapshot.quantity, quote.quantity),
  );
  requireSnapshot(
    reasons,
    snapshot,
    "destination_region",
    () =>
      sameNullableText(
        snapshot.destination_region,
        quote.destination_region,
      ),
  );
  requireSnapshot(
    reasons,
    snapshot,
    "destination_postal_code",
    () =>
      sameNullableText(
        snapshot.destination_postal_code,
        quote.destination_postal_code,
      ),
  );
}

function requireSnapshot(
  reasons: string[],
  snapshot: Record<string, unknown>,
  key: string,
  matches: () => boolean,
) {
  if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
    reasons.push(
      `Evidence snapshot is missing ${key}`,
    );
    return;
  }

  if (!matches()) {
    reasons.push(
      `Saved ${key} does not match the current evidence`,
    );
  }
}

function foodContactState(
  verification: VerificationRecord | null,
): "complete" | "missing" | "unknown" {
  if (!verification) {
    return "unknown";
  }

  return FOOD_CONTACT_COMPLETE.has(
    verification.food_contact_documentation_status,
  )
    ? "complete"
    : "missing";
}

function isMandatoryComplete(
  verificationState: VerificationState,
  foodContact: ReturnType<typeof foodContactState>,
  markets: MarketAssessment[],
): boolean {
  if (verificationState !== "complete") {
    return false;
  }

  if (foodContact !== "complete") {
    return false;
  }

  const currencies = markets
    .map((market) => market.currency)
    .filter(
      (currency): currency is string => currency != null,
    );

  if (new Set(currencies).size > 1) {
    return false;
  }

  return markets.every(
    (market) =>
      market.quoteState === "verified" &&
      market.destinationState === "present" &&
      market.usedForDecision &&
      market.contributionAfterAds != null &&
      market.contributionMarginPercent != null &&
      market.taxes === "included" &&
      market.acquisition === "validated" &&
      market.sellingPrice === "validated",
  );
}

function scoreEvidence(
  evidence: DecisionEvidence,
  verificationState: VerificationState,
  foodContact: ReturnType<typeof foodContactState>,
  markets: MarketAssessment[],
  thresholds: DecisionThresholds,
): Record<ScoreRuleId, number> {
  const byMarket = Object.fromEntries(
    markets.map((market) => [market.market, market]),
  ) as Record<MarketCode, MarketAssessment>;
  const priceValidated = markets.every(
    (market) =>
      market.acquisition === "validated" &&
      market.sellingPrice === "validated",
  );

  const awarded = {
    unique_listing: evidence.listing.id ? 4 : 0,
    candidate_linked: evidence.candidate.id ? 4 : 0,
    product_verification:
      verificationState === "complete" ? 12 : 0,
    food_contact_documentation:
      foodContact === "complete" ? 12 : 0,
    shipping_quote_CA:
      byMarket.CA.quoteState === "missing" ||
      byMarket.CA.quoteState === "ambiguous"
        ? 0
        : 4,
    shipping_quote_US:
      byMarket.US.quoteState === "missing" ||
      byMarket.US.quoteState === "ambiguous"
        ? 0
        : 4,
    shipping_verified_CA:
      byMarket.CA.quoteState === "verified" ? 6 : 0,
    shipping_verified_US:
      byMarket.US.quoteState === "verified" ? 6 : 0,
    destination_CA:
      byMarket.CA.destinationState === "present" ? 4 : 0,
    destination_US:
      byMarket.US.destinationState === "present" ? 4 : 0,
    taxes_and_duties: markets.every(
      (market) => market.taxes === "included",
    )
      ? 8
      : 0,
    current_analysis_CA: byMarket.CA.usedForDecision
      ? 5
      : 0,
    current_analysis_US: byMarket.US.usedForDecision
      ? 5
      : 0,
    price_and_acquisition_validated: priceValidated
      ? 10
      : 0,
    positive_contribution_CA: aboveProfitFloor(
      byMarket.CA,
      thresholds,
    )
      ? 6
      : 0,
    positive_contribution_US: aboveProfitFloor(
      byMarket.US,
      thresholds,
    )
      ? 6
      : 0,
  } satisfies Record<ScoreRuleId, number>;

  return awarded;
}

function aboveProfitFloor(
  market: MarketAssessment,
  thresholds: DecisionThresholds,
): boolean {
  return (
    market.usedForDecision &&
    market.contributionAfterAds != null &&
    market.contributionAfterAds >
      thresholds.minimum_contribution_profit_after_ads
  );
}

function buildNarrative(
  evidence: DecisionEvidence,
  verification: VerificationAssessment,
  foodContact: ReturnType<typeof foodContactState>,
  markets: MarketAssessment[],
  recommendation: ProductDecision["recommendation"],
) {
  const reasons: string[] = [];
  const risks: string[] = [];
  const nextActions: string[] = [];
  const petFeeding = isPetFeedingProduct(
    evidence.listing,
    evidence.candidate,
  );

  const economics = economicsReason(markets);
  push(reasons, economics);

  if (verification.state === "missing") {
    const text = "Product verification is missing";
    push(reasons, text);
    push(risks, text);
    push(nextActions, "Complete manual product verification");
  } else if (verification.state === "ambiguous") {
    const text =
      "Product verification is ambiguous, so none was selected";
    push(reasons, text);
    push(risks, text);
    push(
      nextActions,
      "Resolve conflicting product verifications",
    );
  } else if (verification.state === "incomplete") {
    const text = "Product verification is incomplete";
    push(reasons, text);
    push(risks, text);
    push(nextActions, "Complete manual product verification");
  }

  const shipping = groupedMarketReason(
    markets,
    (market) => market.quoteState !== "verified",
    (affected) =>
      `Shipping evidence is ${shippingProblem(affected)} for ${marketList(affected)}`,
  );
  push(reasons, shipping);
  push(risks, shipping);
  if (shipping) {
    push(nextActions, "Verify supplier shipping costs");
  }

  if (foodContact !== "complete") {
    const text = petFeeding
      ? "Food-contact documentation is missing for this pet-feeding product"
      : "Food-contact documentation is missing";
    push(reasons, text);
    push(risks, text);
    push(
      nextActions,
      "Obtain food-contact compliance documentation",
    );
  }

  const destination = groupedMarketReason(
    markets,
    (market) => market.destinationState !== "present",
    (affected) =>
      affected.every(
        (market) => market.destinationState === "missing",
      )
        ? `Destination-specific shipping details are missing for ${marketList(affected)}`
        : `Destination-specific shipping details are unresolved for ${marketList(affected)}`,
  );
  push(reasons, destination);
  push(risks, destination);

  const taxes = taxReason(markets);
  push(reasons, taxes);
  push(risks, taxes);
  if (destination || taxes) {
    push(
      nextActions,
      "Record destination-specific shipping, taxes, and duties",
    );
  }

  const acquisition = acquisitionReason(markets);
  push(reasons, acquisition);
  push(risks, acquisition);

  const sellingPrice = sellingPriceReason(markets);
  push(reasons, sellingPrice);
  push(risks, sellingPrice);
  if (acquisition || sellingPrice) {
    push(
      nextActions,
      "Validate acquisition cost assumptions",
    );
  }

  const analysisProblem = analysisReason(markets);
  push(reasons, analysisProblem);
  push(risks, analysisProblem);
  if (analysisProblem) {
    push(
      nextActions,
      "Rerun profitability analysis against the current supplier evidence",
    );
  }

  const currencies = new Set(
    markets
      .map((market) => market.currency)
      .filter(
        (currency): currency is string => currency != null,
      ),
  );

  if (currencies.size > 1) {
    const text =
      "Saved analyses use different currencies and were not converted";
    push(reasons, text);
    push(risks, text);
  }

  if (
    recommendation === "hold" &&
    markets.every(
      (market) =>
        market.contributionAfterAds != null &&
        market.contributionAfterAds < 0,
    )
  ) {
    push(
      nextActions,
      "Do not purchase inventory, publish the product, or spend advertising while saved contribution is negative",
    );
  }

  if (recommendation === "ready_for_review") {
    push(
      reasons,
      "Mandatory supplier evidence is complete and saved contribution clears the profitability threshold",
    );
    push(
      nextActions,
      "A person must review this proposal before any approval",
    );
  } else if (
    recommendation === "hold" &&
    !markets.every(
      (market) =>
        market.contributionAfterAds != null &&
        market.contributionAfterAds < 0,
    )
  ) {
    push(
      reasons,
      "Saved contribution does not meet the configured profitability threshold",
    );
  }

  if (risks.length === 0 && recommendation !== "ready_for_review") {
    push(
      risks,
      "The proposal is not an approval",
    );
  }

  return { reasons, risks, nextActions };
}

function economicsReason(
  markets: MarketAssessment[],
): string | null {
  const current = markets.filter(
    (market) => market.usedForDecision,
  );

  if (
    current.length === markets.length &&
    current.every(
      (market) =>
        market.contributionAfterAds != null &&
        market.contributionAfterAds < 0,
    )
  ) {
    return `Negative contribution after advertising in ${marketList(current)} (${formatContributions(current)})`;
  }

  const positive = current.filter(
    (market) =>
      market.contributionAfterAds != null &&
      market.contributionAfterAds > 0,
  );

  if (positive.length === 0) {
    return null;
  }

  const preliminary = positive.some(
    (market) =>
      market.analysis?.analysis_status === "preliminary" ||
      market.acquisition !== "validated" ||
      market.sellingPrice !== "validated",
  );

  const label = preliminary
    ? "Positive preliminary unit economics"
    : "Positive unit economics";

  return `${label} in ${marketList(positive)} (${formatContributions(positive)})`;
}

function formatContributions(
  markets: MarketAssessment[],
): string {
  return markets
    .map(
      (market) =>
        `${market.market} contribution_profit_after_ads ${formatSavedNumber(market.contributionAfterAds)}`,
    )
    .join(", ");
}

function formatSavedNumber(value: number | null): string {
  if (value == null) {
    return "unknown";
  }

  return String(value);
}

function shippingProblem(markets: MarketAssessment[]): string {
  const states = new Set(
    markets.map((market) => market.quoteState),
  );

  if (states.size === 1) {
    const state = markets[0]?.quoteState;
    if (state === "missing") return "missing";
    if (state === "ambiguous") return "ambiguous";
    return "unverified";
  }

  return "incomplete";
}

function taxReason(
  markets: MarketAssessment[],
): string | null {
  const affected = markets.filter(
    (market) => market.taxes !== "included",
  );

  if (affected.length === 0) {
    return null;
  }

  if (affected.every((market) => market.taxes === "missing")) {
    return "Taxes and duties are not included";
  }

  return "Taxes and duties are not established";
}

function acquisitionReason(
  markets: MarketAssessment[],
): string | null {
  const current = markets.filter(
    (market) => market.usedForDecision,
  );

  if (
    current.length === 0 ||
    current.some((market) => market.acquisition === "unknown")
  ) {
    return "Advertising acquisition costs are missing";
  }

  if (
    current.some(
      (market) => market.acquisition === "unvalidated",
    )
  ) {
    return "Advertising acquisition costs are unvalidated assumptions";
  }

  return null;
}

function sellingPriceReason(
  markets: MarketAssessment[],
): string | null {
  const current = markets.filter(
    (market) => market.usedForDecision,
  );

  if (current.length === 0) {
    return null;
  }

  if (
    current.some(
      (market) =>
        market.sellingPrice === "unknown" ||
        market.sellingPrice === "unvalidated",
    )
  ) {
    return "Selling price is an unvalidated assumption";
  }

  return null;
}

function analysisReason(
  markets: MarketAssessment[],
): string | null {
  const affected = markets.filter(
    (market) => market.analysisState !== "current",
  );

  if (affected.length === 0) {
    return null;
  }

  return affected
    .map((market) => {
      if (market.analysisState === "missing") {
        return `${market.market} profitability analysis is missing`;
      }

      if (market.analysisState === "ambiguous") {
        return `${market.market} profitability analysis is ambiguous, so none was selected`;
      }

      return `${market.market} profitability analysis is stale and was not treated as current`;
    })
    .join("; ");
}

function groupedMarketReason(
  markets: MarketAssessment[],
  include: (market: MarketAssessment) => boolean,
  format: (markets: MarketAssessment[]) => string,
): string | null {
  const affected = markets.filter(include);

  if (affected.length === 0) {
    return null;
  }

  return format(affected);
}

function marketList(markets: MarketAssessment[]): string {
  return markets.map((market) => market.market).join(" and ");
}

function isPetFeedingProduct(
  listing: ListingRecord,
  candidate: CandidateRecord,
): boolean {
  const text =
    `${listing.product_title} ${candidate.name} ${candidate.category ?? ""}`.toLowerCase();

  return /pet|dog|cat|feeder|bowl/.test(text);
}

function classifyAcquisition(
  analysis: ProfitabilityAnalysisRecord,
  limitations: string[],
  estimated: number | null,
): "validated" | "unvalidated" | "unknown" {
  if (estimated == null) {
    return "unknown";
  }

  const assumed = limitationMeans(
    limitations,
    "acquisition cost are assumptions",
    "acquisition cost is an assumption",
    "acquisition costs are assumptions",
  );
  const validated = limitationMeans(
    limitations,
    "acquisition cost is validated",
  );

  if (
    analysis.analysis_status === "preliminary" ||
    assumed ||
    (assumed && validated)
  ) {
    return "unvalidated";
  }

  return validated ? "validated" : "unknown";
}

function classifySellingPrice(
  analysis: ProfitabilityAnalysisRecord,
  limitations: string[],
): "validated" | "unvalidated" | "unknown" {
  const assumed = limitationMeans(
    limitations,
    "selling price and acquisition cost are assumptions",
    "selling price is an assumption",
    "selling price is assumed",
  );
  const validated = limitationMeans(
    limitations,
    "selling price is validated",
  );

  if (analysis.analysis_status === "preliminary" || assumed) {
    return "unvalidated";
  }

  return validated ? "validated" : "unknown";
}

function classifyTaxes(
  limitations: string[],
): "included" | "missing" | "unknown" {
  if (
    limitationMeans(
      limitations,
      "taxes and duties are not included",
    )
  ) {
    return "missing";
  }

  if (
    limitationMeans(
      limitations,
      "taxes and duties are included",
    )
  ) {
    return "included";
  }

  return "unknown";
}

function limitationMeans(
  limitations: string[],
  ...phrases: string[]
): boolean {
  const lines = limitations.map((line) => line.toLowerCase());

  return phrases.some((phrase) =>
    lines.some((line) => line.includes(phrase)),
  );
}

function limitationLines(snapshot: unknown): string[] {
  const record = snapshotRecord(snapshot);

  if (!record || !Array.isArray(record.limitations)) {
    return [];
  }

  return record.limitations.filter(
    (line): line is string => typeof line === "string",
  );
}

function marketSnapshot(
  market: MarketAssessment,
): MarketSnapshot {
  return {
    market: market.market,
    quote_id: market.quote?.id ?? null,
    quote_state: market.quoteState,
    quote_verification_status:
      market.quote?.verification_status ?? null,
    shipping_market_status: market.shippingMarketStatus,
    destination_region:
      market.quote?.destination_region ?? null,
    destination_postal_code:
      market.quote?.destination_postal_code ?? null,
    destination_state: market.destinationState,
    analysis_id: market.analysis?.id ?? null,
    analysis_state: market.analysisState,
    analysis_status:
      market.analysis?.analysis_status ?? null,
    observed_analysis_approval_status:
      market.analysis?.approval_status ?? null,
    calculator_version:
      market.analysis?.calculator_version ?? null,
    staleness_reasons: market.stalenessReasons,
    used_for_decision: market.usedForDecision,
    contribution_profit_after_ads:
      market.contributionAfterAds,
    contribution_margin_percent:
      market.contributionMarginPercent,
    calculation: market.analysis
      ? cloneJson(market.analysis.calculation)
      : null,
  };
}

function savedNumber(
  calculation: unknown,
  field: string,
): number | null {
  const record = snapshotRecord(calculation);

  if (!record || !Object.prototype.hasOwnProperty.call(
    record,
    field,
  )) {
    return null;
  }

  return finiteNumber(record[field]);
}

function snapshotRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sameNumber(left: unknown, right: unknown): boolean {
  const a = finiteNumber(left);
  const b = finiteNumber(right);

  return a != null && b != null && a === b;
}

function presentText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sameNullableText(
  left: unknown,
  right: unknown,
): boolean {
  if (left == null && right == null) {
    return true;
  }

  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left === right
  );
}

function sameVariant(left: unknown, right: unknown): boolean {
  return (
    normalizedVariant(left) != null &&
    normalizedVariant(left) === normalizedVariant(right)
  );
}

function normalizedVariant(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : null;
}

function sameTimestamp(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const a = Date.parse(left);
  const b = Date.parse(right);

  if (Number.isFinite(a) && Number.isFinite(b)) {
    return a === b;
  }

  return left === right;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function push(target: string[], value: string | null) {
  if (value && !target.includes(value)) {
    target.push(value);
  }
}
