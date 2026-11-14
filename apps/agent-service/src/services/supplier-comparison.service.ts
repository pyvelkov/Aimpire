import { z } from "zod";
import { supplierQuoteService } from "./supplier-quote.service.js";

export const supplierComparisonSchema = z.object({
  candidate_id: z.string().uuid(),
  market: z.enum(["CA", "US"]),
  currency: z.enum(["CAD", "USD"]),
});

export class SupplierComparisonService {
  async compare(
    input: z.infer<typeof supplierComparisonSchema>
  ) {
    const parsed = supplierComparisonSchema.parse(input);

    const allQuotes =
      await supplierQuoteService.getByCandidate(
        parsed.candidate_id
      );

    // Compare only matching market and currency.
    // Never compare CAD and USD without conversion.
    const matching = allQuotes.filter(
      ({ quote }) =>
        quote.market === parsed.market &&
        quote.currency === parsed.currency
    );

    const verified = matching.filter(
      ({ quote }) =>
        quote.verification_status === "verified"
    );

    const unverified = matching.filter(
      ({ quote }) =>
        quote.verification_status === "unverified"
    );

    const expired = matching.filter(
      ({ quote }) =>
        quote.verification_status === "expired"
    );

    const rank = (
      quotes: typeof matching
    ) =>
      [...quotes].sort(
        (a, b) =>
          b.economics.contribution_profit_before_ads -
          a.economics.contribution_profit_before_ads
      );

    const rankedVerified = rank(verified);
    const rankedUnverified = rank(unverified);

    return {
      candidate_id: parsed.candidate_id,
      market: parsed.market,
      currency: parsed.currency,
      total_matching_quotes: matching.length,

      verified_count: verified.length,
      unverified_count: unverified.length,
      expired_count: expired.length,

      // Only verified quotes qualify for selection.
      best_verified_quote:
        rankedVerified[0] ?? null,

      verified_quotes: rankedVerified,

      // For inspection, not supplier approval.
      unverified_quotes: rankedUnverified,

      recommendation_status:
        verified.length === 0
          ? "insufficient_verified_quotes"
          : "financial_comparison_available",

      disclaimer:
        "Financial ranking excludes supplier reliability, " +
        "product quality, regulatory compliance, " +
        "delivery performance and fixed overhead. " +
        "Verification must be supported by actual evidence.",
    };
  }
}

export const supplierComparisonService =
  new SupplierComparisonService();
