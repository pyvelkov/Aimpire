import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  currentSkuEvidence,
  evidenceSnapshot,
} from "./product-decision.fixture.js";
import {
  SCORING_RUBRIC,
  evaluateProductDecision,
  type DecisionEvidence,
  type MarketCode,
} from "./product-decision.engine.js";

const validatedLimitations = [
  "Selling price is validated",
  "Acquisition cost is validated",
  "Taxes and duties are included",
];

describe("product decision rubric", () => {
  it("documents a deterministic rubric that sums to 100", () => {
    const total = SCORING_RUBRIC.reduce(
      (sum, rule) => sum + rule.points,
      0,
    );

    assert.equal(total, 100);
    assert.equal(new Set(SCORING_RUBRIC.map((rule) => rule.id)).size, SCORING_RUBRIC.length);
  });
});

describe("current SKU CJMY202610501AZ", () => {
  it("recommends investigate_further and does not approve the product", () => {
    const evidence = currentSkuEvidence();
    const originalUs = structuredClone(
      evidence.analyses.find((analysis) => analysis.market === "US")
        ?.calculation,
    );
    const decision = evaluateProductDecision(evidence);
    const text = decision.reasons.join(" ");

    assert.equal(decision.recommendation, "investigate_further");
    assert.equal(decision.decision_status, "proposed");
    assert.equal(decision.approval_status, "not_approved");
    assert.equal(decision.engine_version, "1.0");
    assert.equal(decision.decision_score, 50);
    assert.match(text, /positive preliminary unit economics/i);
    assert.match(text, /shipping evidence is unverified/i);
    assert.match(text, /food-contact documentation is missing/i);
    assert.match(text, /acquisition costs are unvalidated assumptions/i);
    assert.match(decision.risks.join(" "), /taxes and duties are not included/i);
    assert.match(
      decision.risks.join(" "),
      /destination-specific shipping details are missing/i,
    );
    assert.match(decision.next_actions.join(" "), /verify supplier shipping costs/i);
    assert.match(
      decision.next_actions.join(" "),
      /food-contact compliance documentation/i,
    );
    assert.match(
      decision.next_actions.join(" "),
      /validate acquisition cost assumptions/i,
    );
    assert.equal(
      decision.evidence_snapshot.markets.US.analysis_id,
      "7b3cef38-c563-468a-87c7-14efd393b4e3",
    );
    assert.equal(
      decision.evidence_snapshot.markets.CA.analysis_id,
      "d15a47e2-abc7-4e6f-a9b1-6386b455d5f8",
    );
    assert.equal(
      decision.evidence_snapshot.markets.US.contribution_profit_after_ads,
      4.97,
    );
    assert.equal(
      decision.evidence_snapshot.markets.CA.contribution_profit_after_ads,
      6.62,
    );
    assert.deepEqual(
      decision.evidence_snapshot.markets.US.calculation,
      originalUs,
    );
    assert.equal(
      decision.evidence_snapshot.listing_verification_status,
      "unverified",
    );
    assert.equal(decision.evidence_snapshot.candidate_status, "discovered");
    assert.equal(
      decision.evidence_snapshot.markets.US.observed_analysis_approval_status,
      "not_approved",
    );
    assert.equal(decision.evidence_snapshot.mutates_existing_records, false);
    assert.deepEqual(awardedIds(decision), [
      "unique_listing",
      "candidate_linked",
      "product_verification",
      "shipping_quote_CA",
      "shipping_quote_US",
      "current_analysis_CA",
      "current_analysis_US",
      "positive_contribution_CA",
      "positive_contribution_US",
    ]);
  });
});

describe("decision rules", () => {
  it("recommends hold when both current analyses are negative after advertising", () => {
    const evidence = currentSkuEvidence();
    setContributions(evidence, { CA: -1.25, US: -0.4 });
    const us = calculationOf(evidence, "US");
    us.profitable_before_ads = true;
    us.contribution_profit_before_ads = 10.97;

    const decision = evaluateProductDecision(evidence);

    assert.equal(decision.recommendation, "hold");
    assert.equal(decision.approval_status, "not_approved");
    assert.equal(
      decision.evidence_snapshot.recommendation_rule,
      "negative_contribution_after_ads_both_markets",
    );
    assert.match(
      decision.reasons.join(" "),
      /negative contribution after advertising/i,
    );
    assert.equal(
      decision.evidence_snapshot.markets.US.contribution_profit_after_ads,
      -0.4,
    );
    assert.match(decision.risks.join(" "), /food-contact/i);
  });

  it("does not hold on negative figures once the saved analysis is stale", () => {
    const evidence = currentSkuEvidence();
    setContributions(evidence, { CA: -3, US: -4 });
    const usQuote = evidence.quotes.find((quote) => quote.market === "US");
    assert.ok(usQuote);
    usQuote.shipping_cost = 11;

    const decision = evaluateProductDecision(evidence);
    const us = decision.evidence_snapshot.markets.US;

    assert.equal(decision.recommendation, "investigate_further");
    assert.equal(us.used_for_decision, false);
    assert.equal(us.contribution_profit_after_ads, null);
    assert.match(us.staleness_reasons.join(" "), /shipping_cost/i);
    const saved = us.calculation as {
      contribution_profit_after_ads: number;
    };
    assert.equal(saved.contribution_profit_after_ads, -4);
  });

  it("never recommends ready_for_review while mandatory evidence is missing", () => {
    const complete = readyEvidence();
    assert.equal(
      evaluateProductDecision(complete).recommendation,
      "ready_for_review",
    );

    const gaps: Array<[string, (evidence: DecisionEvidence) => void]> = [
      ["missing verification", (evidence) => {
        evidence.verifications = [];
      }],
      ["ambiguous verification", (evidence) => {
        evidence.verifications.push({
          ...evidence.verifications[0],
          id: "second-verification",
        });
      }],
      ["incomplete verification", (evidence) => {
        evidence.verifications[0].sku_match_confirmed = false;
      }],
      ["missing food-contact documentation", (evidence) => {
        evidence.verifications[0].food_contact_documentation_status =
          "not_provided";
      }],
      ["unknown food-contact status", (evidence) => {
        evidence.verifications[0].food_contact_documentation_status =
          "unknown";
      }],
      ["unverified shipping quote", (evidence) => {
        evidence.quotes[0].verification_status = "unverified";
      }],
      ["unknown shipping market status", (evidence) => {
        evidence.verifications[0].shipping_us_status = "unknown";
      }],
      ["missing destination", (evidence) => {
        evidence.quotes[0].destination_postal_code = null;
        alignAnalyses(evidence);
      }],
      ["taxes not included", (evidence) => {
        replaceLimitations(evidence, [
          "Selling price is validated",
          "Acquisition cost is validated",
          "Taxes and duties are not included",
        ]);
      }],
      ["taxes not mentioned", (evidence) => {
        replaceLimitations(evidence, [
          "Selling price is validated",
          "Acquisition cost is validated",
        ]);
      }],
      ["acquisition cost is only an assumption", (evidence) => {
        replaceLimitations(evidence, [
          "Selling price is validated",
          "Selling price and acquisition cost are assumptions",
          "Taxes and duties are included",
        ]);
      }],
      ["acquisition cost is not explicitly validated", (evidence) => {
        replaceLimitations(evidence, [
          "Selling price is validated",
          "Taxes and duties are included",
        ]);
      }],
      ["preliminary analysis", (evidence) => {
        for (const analysis of evidence.analyses) {
          analysis.analysis_status = "preliminary";
        }
      }],
      ["missing analysis", (evidence) => {
        evidence.analyses = evidence.analyses.filter(
          (analysis) => analysis.market !== "US",
        );
      }],
      ["stale analysis", (evidence) => {
        evidence.quotes[1].shipping_cost = 99;
      }],
      ["ambiguous shipping quotes", (evidence) => {
        evidence.quotes.push({
          ...evidence.quotes[1],
          id: "second-us-quote",
        });
      }],
      ["null contribution is not zero", (evidence) => {
        for (const analysis of evidence.analyses) {
          const calculation = analysis.calculation as {
            contribution_profit_after_ads: number | null;
          };
          calculation.contribution_profit_after_ads = null;
        }
      }],
    ];

    for (const [name, applyGap] of gaps) {
      const evidence = readyEvidence();
      applyGap(evidence);
      const decision = evaluateProductDecision(evidence);

      assert.notEqual(
        decision.recommendation,
        "ready_for_review",
        name,
      );
      assert.equal(decision.approval_status, "not_approved", name);
    }
  });

  it("does not treat positive economics as approval", () => {
    const incomplete = currentSkuEvidence();
    const incompleteDecision = evaluateProductDecision(incomplete);

    assert.equal(incompleteDecision.recommendation, "investigate_further");
    assert.equal(incompleteDecision.approval_status, "not_approved");
    assert.match(
      incompleteDecision.reasons.join(" "),
      /positive preliminary unit economics/i,
    );

    const complete = evaluateProductDecision(readyEvidence());

    assert.equal(complete.recommendation, "ready_for_review");
    assert.equal(complete.decision_status, "proposed");
    assert.equal(complete.approval_status, "not_approved");
    assert.equal(complete.evidence_snapshot.mutates_existing_records, false);

    const belowThreshold = evaluateProductDecision(readyEvidence(), {
      minimum_contribution_profit_after_ads: 100,
      minimum_contribution_margin_percent: 0,
    });

    assert.equal(belowThreshold.recommendation, "hold");
    assert.equal(belowThreshold.approval_status, "not_approved");
  });

  it("preserves saved calculator fields and precision", () => {
    const evidence = currentSkuEvidence();
    const us = calculationOf(evidence, "US");
    us.contribution_profit_after_ads = 4.971;
    us.custom_trace = "keep-me";
    Object.freeze(us);

    const decision = evaluateProductDecision(evidence);
    const saved = decision.evidence_snapshot.markets.US.calculation as {
      contribution_profit_after_ads: number;
      custom_trace: string;
    };

    assert.equal(saved.contribution_profit_after_ads, 4.971);
    assert.equal(saved.custom_trace, "keep-me");
    assert.equal(
      decision.evidence_snapshot.markets.US.contribution_profit_after_ads,
      4.971,
    );
  });

  it("does not choose between conflicting analyses or quotes", () => {
    const tied = currentSkuEvidence();
    const us = tied.analyses.find((analysis) => analysis.market === "US");
    assert.ok(us);
    tied.analyses.push({
      ...structuredClone(us),
      id: "second-us-analysis",
      created_at: us.created_at,
      calculation: {
        ...(us.calculation as Record<string, unknown>),
        contribution_profit_after_ads: -20,
      },
    });

    const tiedDecision = evaluateProductDecision(tied);

    assert.equal(tiedDecision.recommendation, "investigate_further");
    assert.equal(tiedDecision.evidence_snapshot.markets.US.analysis_id, null);
    assert.match(
      tiedDecision.reasons.join(" "),
      /US profitability analysis is ambiguous/i,
    );

    const conflictingQuotes = currentSkuEvidence();
    setContributions(conflictingQuotes, { CA: -5, US: -5 });
    const existing = conflictingQuotes.quotes.find(
      (quote) => quote.market === "US",
    );
    assert.ok(existing);
    conflictingQuotes.quotes.push({
      ...existing,
      id: "another-us-quote",
      shipping_cost: 1,
    });

    const quoteDecision = evaluateProductDecision(conflictingQuotes);

    assert.notEqual(quoteDecision.recommendation, "hold");
    assert.equal(
      quoteDecision.evidence_snapshot.markets.US.quote_id,
      null,
    );
    assert.equal(
      quoteDecision.evidence_snapshot.markets.US.used_for_decision,
      false,
    );
  });

  it("treats a null saved contribution as unknown rather than zero", () => {
    const evidence = currentSkuEvidence();

    for (const analysis of evidence.analyses) {
      const calculation = analysis.calculation as {
        contribution_profit_after_ads: number | null;
      };
      calculation.contribution_profit_after_ads = null;
    }

    const decision = evaluateProductDecision(evidence);

    assert.equal(decision.recommendation, "investigate_further");
    assert.equal(
      decision.evidence_snapshot.markets.CA.contribution_profit_after_ads,
      null,
    );
    assert.doesNotMatch(
      decision.reasons.join(" "),
      /negative contribution/i,
    );
  });

  it("returns the same proposed, unapproved decision for the same evidence", () => {
    const first = evaluateProductDecision(currentSkuEvidence());
    const second = evaluateProductDecision(currentSkuEvidence());

    assert.equal(first.recommendation, second.recommendation);
    assert.equal(first.approval_status, "not_approved");
    assert.equal(second.approval_status, "not_approved");
    assert.equal(first.decision_status, "proposed");
    assert.deepEqual(first.reasons, second.reasons);
  });
});

describe("decision engine boundaries", () => {
  it("does not import the profitability calculator or an AI client", () => {
    const engine = readFileSync(
      fileURLToPath(new URL("./product-decision.engine.ts", import.meta.url)),
      "utf8",
    );
    const service = readFileSync(
      fileURLToPath(new URL("./product-decision.service.ts", import.meta.url)),
      "utf8",
    );

    for (const source of [engine, service]) {
      assert.doesNotMatch(source, /from ["'][^"']*unit-economics/);
      assert.doesNotMatch(source, /from ["'][^"']*gemini/);
      assert.doesNotMatch(source, /calculateExistingUnitEconomics/);
      assert.doesNotMatch(source, /GoogleGenAI/);
      assert.doesNotMatch(source, /shopify/i);
    }
  });
});

function readyEvidence(): DecisionEvidence {
  const evidence = currentSkuEvidence();
  const verification = evidence.verifications[0];
  verification.food_contact_documentation_status = "documented";
  verification.shipping_ca_status = "verified";
  verification.shipping_us_status = "verified";

  for (const quote of evidence.quotes) {
    quote.verification_status = "verified";
    quote.destination_region = quote.market === "CA"
      ? "Ontario"
      : "California";
    quote.destination_postal_code = quote.market === "CA"
      ? "M5V 2T6"
      : "94105";
  }

  for (const analysis of evidence.analyses) {
    analysis.analysis_status = "validated";
  }

  replaceLimitations(evidence, validatedLimitations);
  return evidence;
}

function replaceLimitations(
  evidence: DecisionEvidence,
  limitations: string[],
) {
  alignAnalyses(evidence, limitations);
}

function alignAnalyses(
  evidence: DecisionEvidence,
  limitations = validatedLimitations,
) {
  const verification = evidence.verifications[0];

  for (const analysis of evidence.analyses) {
    const quote = evidence.quotes.find(
      (item) => item.id === analysis.shipping_quote_id,
    );

    if (!quote || !verification) {
      continue;
    }

    analysis.evidence_snapshot = evidenceSnapshot(
      evidence.listing.sku,
      verification,
      quote,
      limitations,
    );
    const calculation = analysis.calculation as Record<string, unknown>;
    calculation.market = analysis.market;
    calculation.currency = quote.currency;
    analysis.currency = quote.currency;
  }
}

function setContributions(
  evidence: DecisionEvidence,
  values: Record<MarketCode, number>,
) {
  for (const analysis of evidence.analyses) {
    const market = analysis.market as MarketCode;
    const calculation = analysis.calculation as {
      contribution_profit_after_ads: number;
    };
    calculation.contribution_profit_after_ads = values[market];
  }
}

function calculationOf(
  evidence: DecisionEvidence,
  market: MarketCode,
): Record<string, unknown> {
  const analysis = evidence.analyses.find(
    (item) => item.market === market,
  );

  assert.ok(analysis);
  return analysis.calculation as Record<string, unknown>;
}

function awardedIds(decision: ReturnType<typeof evaluateProductDecision>) {
  return decision.evidence_snapshot.score_breakdown
    .filter((rule) => rule.awarded === rule.points)
    .map((rule) => rule.id);
}
