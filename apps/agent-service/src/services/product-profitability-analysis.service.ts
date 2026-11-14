import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import {
  calculateExistingUnitEconomics,
} from "./profitability-calculator.adapter.js";

export const profitabilityAnalysisSchema = z.object({
  sku: z.string().trim().min(2),
  market: z.enum(["US", "CA"]),
  selling_price: z.number().positive(),
  estimated_acquisition_cost: z.number().nonnegative(),
  payment_fee_percent: z.number().min(0).max(100),
  payment_fee_fixed: z.number().nonnegative(),
  return_allowance_percent: z.number().min(0).max(100),
  packaging_cost: z.number().nonnegative().default(0),
  other_variable_cost: z.number().nonnegative(),
});

type Input = z.infer<typeof profitabilityAnalysisSchema>;

export class ProductProfitabilityAnalysisService {
  async analyze(input: Input) {
    const parsed = profitabilityAnalysisSchema.parse(input);

    const { data: listings, error: listingError } =
      await supabase
        .from("supplier_product_listings")
        .select("id, sku")
        .eq("sku", parsed.sku.toUpperCase());

    if (listingError) throw new Error(listingError.message);

    if (!listings || listings.length !== 1) {
      throw new Error(
        "Expected exactly one listing for the requested SKU"
      );
    }

    const listing = listings[0];

    const { data: verification, error: verificationError } =
      await supabase
        .from("supplier_listing_verifications")
        .select("*")
        .eq("listing_id", listing.id)
        .single();

    if (verificationError || !verification) {
      throw new Error("Manual product verification is missing");
    }

    if (
      verification.review_status !== "manually_reviewed" ||
      verification.sku_match_confirmed !== true ||
      verification.displayed_price === null ||
      verification.currency !== "USD"
    ) {
      throw new Error(
        "A manually reviewed USD product price is required"
      );
    }

    const { data: quotes, error: quotesError } =
      await supabase
        .from("supplier_shipping_quotes")
        .select("*")
        .eq("verification_id", verification.id)
        .eq("market", parsed.market)
        .eq("quantity", 1)
        .eq("currency", verification.currency)
        .eq("verification_status", "unverified");

    if (quotesError) throw new Error(quotesError.message);

    const matchingQuotes = (quotes ?? []).filter(
      (quote) =>
        quote.variant_description?.trim().toLowerCase() ===
        verification.variant_description?.trim().toLowerCase()
    );

    // Do not silently choose the cheapest or newest quote.
    if (matchingQuotes.length !== 1) {
      throw new Error(
        "Expected exactly one matching shipping quote; " +
        "explicit quote selection is required otherwise"
      );
    }

    const quote = matchingQuotes[0];

    const productCost = Number(verification.displayed_price);
    const shippingCost = Number(quote.shipping_cost);

    if (
      !Number.isFinite(productCost) ||
      !Number.isFinite(shippingCost)
    ) {
      throw new Error("Invalid supplier cost values");
    }

    const calculatorInput = {
      currency: "USD" as const,
      market: parsed.market,
      selling_price: parsed.selling_price,
      product_cost: productCost,
      shipping_cost: shippingCost,
      packaging_cost: parsed.packaging_cost,
      other_variable_cost: parsed.other_variable_cost,
      payment_fee_percent: parsed.payment_fee_percent,
      payment_fee_fixed: parsed.payment_fee_fixed,
      return_allowance_percent: parsed.return_allowance_percent,
      estimated_acquisition_cost:
        parsed.estimated_acquisition_cost,
    };

    const calculation =
      calculateExistingUnitEconomics(calculatorInput);

    const evidenceSnapshot = {
      sku: listing.sku,
      variant: verification.variant_description,
      product_url: verification.product_url,
      product_cost: productCost,
      product_price_review_status: verification.review_status,
      shipping_cost: shippingCost,
      shipping_method: quote.shipping_method,
      shipping_quote_status: quote.verification_status,
      shipping_evidence_source: quote.evidence_source,
      shipping_captured_at: quote.captured_at,
      quantity: quote.quantity,
      destination_region: quote.destination_region,
      destination_postal_code: quote.destination_postal_code,
      limitations: [
        "Supplier shipping estimate is unverified",
        "Destination-specific shipping cost may vary",
        "Taxes and duties are not included",
        "Product compliance documentation is incomplete",
        "Selling price and acquisition cost are assumptions",
      ],
    };

    const { data: saved, error: saveError } =
      await supabase
        .from("product_profitability_analyses")
        .insert({
          listing_id: listing.id,
          verification_id: verification.id,
          shipping_quote_id: quote.id,
          market: parsed.market,
          currency: "USD",
          assumptions: parsed,
          calculation,
          evidence_snapshot: evidenceSnapshot,
          analysis_status: "preliminary",
          approval_status: "not_approved",
          calculator_version: "1",
        })
        .select()
        .single();

    if (saveError) throw new Error(saveError.message);

    return {
      analysis_id: saved.id,
      sku: listing.sku,
      market: parsed.market,
      currency: "USD",
      analysis_status: "preliminary",
      approval_status: "not_approved",
      calculation,
      evidence: evidenceSnapshot,
    };
  }
}

export const productProfitabilityAnalysisService =
  new ProductProfitabilityAnalysisService();
