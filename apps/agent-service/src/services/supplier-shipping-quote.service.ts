import { z } from "zod";
import { supabase } from "../lib/supabase.js";

const percent = z.number().int().min(0).max(100);

export const shippingQuoteSchema = z.object({
  verification_id: z.string().uuid(),
  market: z.enum(["CA", "US"]),
  destination_region: z.string().trim().min(1).nullable(),
  destination_postal_code: z.string().trim().min(1).nullable(),

  quantity: z.number().int().positive(),
  variant_description: z.string().trim().min(1),
  shipping_method: z.string().trim().min(1),

  shipping_cost: z.number().finite().nonnegative(),
  currency: z.enum(["USD", "CAD"]),

  estimated_delivery_min_days: z.number().int().min(0),
  estimated_delivery_max_days: z.number().int().min(0),
  delivery_estimate_percent: percent,

  processing_min_days: z.number().int().min(0),
  processing_max_days: z.number().int().min(0),
  processing_estimate_percent: percent,

  evidence_source: z.literal("manual_screenshot"),
  evidence_reference: z.string().nullable(),
  evidence_notes: z.string().trim().min(1),
}).superRefine((data, ctx) => {
  if (
    data.estimated_delivery_max_days <
    data.estimated_delivery_min_days
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["estimated_delivery_max_days"],
      message: "Delivery maximum must be >= minimum",
    });
  }

  if (
    data.processing_max_days <
    data.processing_min_days
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["processing_max_days"],
      message: "Processing maximum must be >= minimum",
    });
  }

  if (data.shipping_cost > 1000) {
    ctx.addIssue({
      code: "custom",
      path: ["shipping_cost"],
      message: "Unusually high shipping cost; review manually",
    });
  }
});

export type ShippingQuoteInput = z.infer<
  typeof shippingQuoteSchema
>;

export class SupplierShippingQuoteService {
  async save(input: ShippingQuoteInput) {
    const parsed = shippingQuoteSchema.parse(input);

    // Check the associated manually reviewed listing.
    const { data: verification, error: verificationError } =
      await supabase
        .from("supplier_listing_verifications")
        .select(
          "id, review_status, sku_match_confirmed, variant_description"
        )
        .eq("id", parsed.verification_id)
        .single();

    if (verificationError || !verification) {
      throw new Error("Listing verification not found");
    }

    if (
      verification.review_status !== "manually_reviewed" ||
      verification.sku_match_confirmed !== true
    ) {
      throw new Error(
        "Listing must be manually reviewed with matching SKU"
      );
    }

    if (
      verification.variant_description?.trim().toLowerCase() !==
      parsed.variant_description.toLowerCase()
    ) {
      throw new Error(
        "Shipping quote variant does not match listing verification"
      );
    }

    // Never overwrite an existing evidence snapshot.
    const { data: existing, error: lookupError } =
      await supabase
        .from("supplier_shipping_quotes")
        .select("*")
        .eq("verification_id", parsed.verification_id)
        .eq("market", parsed.market)
        .eq("quantity", parsed.quantity)
        .eq("variant_description", parsed.variant_description)
        .eq("shipping_method", parsed.shipping_method)
        .maybeSingle();

    if (lookupError) {
      throw new Error(lookupError.message);
    }

    if (existing) {
      return {
        cached: true,
        quote: existing,
      };
    }

    const { data: saved, error: saveError } =
      await supabase
        .from("supplier_shipping_quotes")
        .insert({
          ...parsed,
          verification_status: "unverified",
        })
        .select("*")
        .single();

    if (saveError) {
      // A concurrent request may have inserted the same quote.
      if (saveError.code === "23505") {
        const { data: cached, error: cacheError } =
          await supabase
            .from("supplier_shipping_quotes")
            .select("*")
            .eq("verification_id", parsed.verification_id)
            .eq("market", parsed.market)
            .eq("quantity", parsed.quantity)
            .eq("variant_description", parsed.variant_description)
            .eq("shipping_method", parsed.shipping_method)
            .single();

        if (cacheError || !cached) {
          throw new Error(
            "Existing shipping quote could not be retrieved"
          );
        }

        return {
          cached: true,
          quote: cached,
        };
      }

      throw new Error(saveError.message);
    }

    return {
      cached: false,
      quote: saved,
    };
  }

  async getByVerification(verificationId: string) {
    const { data, error } = await supabase
      .from("supplier_shipping_quotes")
      .select("*")
      .eq("verification_id", verificationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  }
}

export const supplierShippingQuoteService =
  new SupplierShippingQuoteService();
