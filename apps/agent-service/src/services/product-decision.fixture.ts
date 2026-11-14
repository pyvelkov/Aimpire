import type { DecisionEvidence } from "./product-decision.engine.js";

const limitations = [
  "Supplier shipping estimate is unverified",
  "Destination-specific shipping cost may vary",
  "Taxes and duties are not included",
  "Product compliance documentation is incomplete",
  "Selling price and acquisition cost are assumptions",
];

export function currentSkuEvidence(): DecisionEvidence {
  const listing = {
    id: "4b755dae-4431-46f2-9a5b-ba5fd770a7be",
    sku: "CJMY202610501AZ",
    candidate_id: "73e6e4bd-41d8-497f-9c65-5a5d249ce329",
    product_title:
      "4 Layers Slow Feeder Puzzle Dog Bowls Assemble Slow Eating Bowl For Dogs Non-slip Interactive Dog Puzzle Game Slow Bowl Pet Products",
    verification_status: "unverified",
  };
  const candidate = {
    id: "73e6e4bd-41d8-497f-9c65-5a5d249ce329",
    name: "Slow Feeder Pet Bowls",
    category: "Pet supplies",
    status: "discovered",
  };
  const verification = {
    id: "e5c30a08-2e7b-4eed-a991-cf421c9903ca",
    listing_id: listing.id,
    product_url:
      "https://cjdropshipping.com/product/4-layers-slow-feeder-puzzle-dog-bowls-assemble-slow-eating-bowl-for-dogs-non-slip-interactive-dog-puzzle-game-slow-bowl-pet-products-p-1785950682676211712.html",
    sku_match_confirmed: true,
    displayed_price: 2,
    currency: "USD",
    variant_description: "Blue",
    shipping_ca_status: "unknown",
    shipping_us_status: "unknown",
    food_contact_documentation_status: "not_provided",
    review_status: "manually_reviewed",
  };
  const caQuote = {
    id: "898eae48-f3bc-403b-a990-198119d92352",
    verification_id: verification.id,
    market: "CA",
    destination_region: null,
    destination_postal_code: null,
    quantity: 1,
    variant_description: "Blue",
    shipping_method: "CJPacket Ordinary",
    shipping_cost: 8.61,
    currency: "USD",
    evidence_source: "manual_screenshot",
    verification_status: "unverified",
    captured_at: "2026-11-14T14:26:23.702473+00:00",
  };
  const usQuote = {
    id: "0118fef5-e965-4a86-b9f7-934796f89431",
    verification_id: verification.id,
    market: "US",
    destination_region: null,
    destination_postal_code: null,
    quantity: 1,
    variant_description: "Blue",
    shipping_method: "LuWei Ordinary US",
    shipping_cost: 10.26,
    currency: "USD",
    evidence_source: "manual_screenshot",
    verification_status: "unverified",
    captured_at: "2026-11-14T14:26:21.282695+00:00",
  };

  return {
    listing,
    candidate,
    verifications: [verification],
    quotes: [caQuote, usQuote],
    analyses: [
      {
        id: "d15a47e2-abc7-4e6f-a9b1-6386b455d5f8",
        listing_id: listing.id,
        verification_id: verification.id,
        shipping_quote_id: caQuote.id,
        market: "CA",
        currency: "USD",
        assumptions: {
          sku: listing.sku,
          market: "CA",
          selling_price: 25,
          estimated_acquisition_cost: 6,
        },
        calculation: {
          market: "CA",
          currency: "USD",
          payment_fees: 1.03,
          selling_price: 25,
          variable_costs: 12.39,
          returns_allowance: 0.75,
          profitable_before_ads: true,
          estimated_acquisition_cost: 6,
          break_even_acquisition_cost: 12.62,
          contribution_margin_percent: 50.46,
          contribution_profit_after_ads: 6.62,
          contribution_profit_before_ads: 12.62,
        },
        evidence_snapshot: evidenceSnapshot(
          listing.sku,
          verification,
          caQuote,
          limitations,
        ),
        analysis_status: "preliminary",
        approval_status: "not_approved",
        calculator_version: "1",
        created_at: "2026-11-14T15:14:12.407148+00:00",
      },
      {
        id: "7b3cef38-c563-468a-87c7-14efd393b4e3",
        listing_id: listing.id,
        verification_id: verification.id,
        shipping_quote_id: usQuote.id,
        market: "US",
        currency: "USD",
        assumptions: {
          sku: listing.sku,
          market: "US",
          selling_price: 25,
          estimated_acquisition_cost: 6,
        },
        calculation: {
          market: "US",
          currency: "USD",
          payment_fees: 1.03,
          selling_price: 25,
          variable_costs: 14.04,
          returns_allowance: 0.75,
          profitable_before_ads: true,
          estimated_acquisition_cost: 6,
          break_even_acquisition_cost: 10.97,
          contribution_margin_percent: 43.86,
          contribution_profit_after_ads: 4.97,
          contribution_profit_before_ads: 10.97,
        },
        evidence_snapshot: evidenceSnapshot(
          listing.sku,
          verification,
          usQuote,
          limitations,
        ),
        analysis_status: "preliminary",
        approval_status: "not_approved",
        calculator_version: "1",
        created_at: "2026-11-14T15:08:43.084013+00:00",
      },
    ],
  };
}

export function evidenceSnapshot(
  sku: string,
  verification: DecisionEvidence["verifications"][number],
  quote: DecisionEvidence["quotes"][number],
  limitationLines: string[],
) {
  return {
    sku,
    variant: verification.variant_description,
    quantity: quote.quantity,
    limitations: limitationLines,
    product_url: verification.product_url,
    product_cost: verification.displayed_price,
    shipping_cost: quote.shipping_cost,
    shipping_method: quote.shipping_method,
    destination_region: quote.destination_region,
    shipping_captured_at: quote.captured_at,
    shipping_quote_status: quote.verification_status,
    destination_postal_code: quote.destination_postal_code,
    shipping_evidence_source: quote.evidence_source,
    product_price_review_status: verification.review_status,
  };
}
