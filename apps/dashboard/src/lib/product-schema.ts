import { z } from "zod";
import { DashboardUpstreamError } from "./errors";

const approvalLabel = z.enum(["Approved", "Not approved"]);

const decisionSchema = z.object({
  id: z.string(),
  recommendation: z.string(),
  recommendation_label: z.string(),
  decision_status: z.string(),
  approval_status: z.string(),
  approval_label: approvalLabel,
  approved: z.boolean(),
  decision_score: z.number().nullable(),
  created_at: z.string(),
});

export const managedProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  status: z.string(),
  target_market: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  latest_decision: decisionSchema.nullable(),
});

export const productListSchema = z.object({
  success: z.literal(true),
  count: z.number(),
  products: z.array(managedProductSchema),
});

const evidenceSchema = z.object({
  verification_status: z.string(),
  evidence_label: z.string(),
  confirmed: z.boolean(),
});

export const productDetailSchema = z.object({
  success: z.literal(true),
  product: z.object({
    product: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      category: z.string().nullable(),
      status: z.string(),
      target_market: z.array(z.string()),
      source_url: z.string().nullable(),
      supplier_name: z.string().nullable(),
      supplier_url: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string().nullable(),
      preliminary_recommendation: z.string().nullable(),
    }),
    discoveries: z.array(evidenceSchema.extend({
      id: z.string(),
      supplier_name: z.string(),
      supplier_url: z.string().nullable(),
      product_url: z.string().nullable(),
      product_title: z.string().nullable(),
      platform: z.string().nullable(),
      evidence_url: z.string().nullable(),
      evidence_notes: z.string().nullable(),
      discovery_method: z.string().nullable(),
      created_at: z.string(),
    })),
    discovery_runs: z.array(z.object({
      id: z.string(),
      status: z.string(),
      created_at: z.string(),
      extraction_error: z.string().nullable(),
    })),
    listings: z.array(z.object({
      id: z.string(),
      sku: z.string(),
      product_title: z.string(),
      product_url: z.string().nullable(),
      material: z.string().nullable(),
      reported_price: z.number().nullable(),
      reported_currency: z.string().nullable(),
      verification_status: z.string(),
      evidence_label: z.string(),
      confirmed: z.boolean(),
      price_evidence_text: z.string().nullable(),
      missing_evidence: z.array(z.string()),
      verification: z.object({
        id: z.string(),
        review_status: z.string(),
        sku_match_confirmed: z.boolean(),
        displayed_price: z.number().nullable(),
        currency: z.string().nullable(),
        variant_description: z.string().nullable(),
        material_description: z.string().nullable(),
        listed_weight_grams: z.number().nullable(),
        shipping_ca_status: z.string(),
        shipping_ca_label: z.string(),
        shipping_us_status: z.string(),
        shipping_us_label: z.string(),
        food_contact_documentation_status: z.string(),
        evidence_source: z.string().nullable(),
        evidence_notes: z.string().nullable(),
        checked_at: z.string().nullable(),
      }).nullable(),
      shipping_quotes: z.array(evidenceSchema.extend({
        id: z.string(),
        market: z.string(),
        shipping_method: z.string(),
        shipping_cost: z.number().nullable(),
        currency: z.string(),
        destination_region: z.string().nullable(),
        estimated_delivery_min_days: z.number().nullable(),
        estimated_delivery_max_days: z.number().nullable(),
        evidence_notes: z.string().nullable(),
        created_at: z.string(),
      })),
      analyses: z.array(z.object({
        id: z.string(),
        market: z.string(),
        currency: z.string(),
        analysis_status: z.string(),
        approval_status: z.string(),
        approval_label: approvalLabel,
        approved: z.boolean(),
        selling_price: z.number().nullable(),
        contribution_margin_percent: z.number().nullable(),
        contribution_profit_after_ads: z.number().nullable(),
        created_at: z.string(),
      })),
    })),
    listing_research_runs: z.array(z.object({
      id: z.string(),
      status: z.string(),
      extraction_status: z.string().nullable(),
      extraction_error: z.string().nullable(),
      created_at: z.string(),
    })),
    decision: decisionSchema.extend({
      listing_id: z.string().nullable(),
      reasons: z.array(z.string()),
      risks: z.array(z.string()),
      next_actions: z.array(z.string()),
      engine_version: z.string().nullable(),
    }).nullable(),
    gaps: z.array(z.string()),
  }),
});

export type ManagedProduct = z.infer<typeof managedProductSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>["product"];

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new DashboardUpstreamError("The agent service returned an unexpected response");
  }
  return parsed.data;
}

export function parseProductList(payload: unknown): ManagedProduct[] {
  return parse(productListSchema, payload).products;
}

export function parseProductDetail(payload: unknown): ProductDetail {
  return parse(productDetailSchema, payload).product;
}
