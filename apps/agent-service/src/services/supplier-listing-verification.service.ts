import { z } from "zod";
import { supabase } from "../lib/supabase.js";

export const verifyListingSchema = z.object({
  sku: z.string().min(2),
  product_url: z.string().url(),
  sku_match_confirmed: z.boolean(),
  displayed_price: z.number().nonnegative().nullable(),
  currency: z.enum(["USD", "CAD"]).nullable(),
  variant_description: z.string().nullable(),
  material_description: z.string().nullable(),
  listed_weight_grams: z.number().positive().nullable(),
  evidence_notes: z.string().optional(),
});

export class SupplierListingVerificationService {
  async save(input: z.infer<typeof verifyListingSchema>) {
    const parsed = verifyListingSchema.parse(input);

    const url = new URL(parsed.product_url);
    const host = url.hostname.toLowerCase();

    if (
      url.protocol !== "https:" ||
      host !== "cjdropshipping.com" ||
      !url.pathname.startsWith("/product/")
    ) {
      throw new Error(
        "Expected an HTTPS CJdropshipping product URL"
      );
    }

    if (
      parsed.displayed_price !== null &&
      parsed.currency === null
    ) {
      throw new Error("Currency required for a price");
    }

    const { data: listing, error: listingError } =
      await supabase
        .from("supplier_product_listings")
        .select("id, sku")
        .eq("sku", parsed.sku.toUpperCase())
        .limit(2);

    if (listingError) {
      throw new Error(listingError.message);
    }

    if (!listing || listing.length !== 1) {
      throw new Error(
        "Expected exactly one matching product listing"
      );
    }

    const { data, error } = await supabase
      .from("supplier_listing_verifications")
      .upsert(
        {
          listing_id: listing[0].id,
          product_url: parsed.product_url,
          sku_match_confirmed:
            parsed.sku_match_confirmed,
          displayed_price: parsed.displayed_price,
          currency: parsed.currency,
          variant_description:
            parsed.variant_description,
          material_description:
            parsed.material_description,
          listed_weight_grams:
            parsed.listed_weight_grams,
          evidence_source: "manual",
          evidence_notes: parsed.evidence_notes ?? null,
          review_status: "manually_reviewed",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "listing_id" }
      )
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}

export const supplierListingVerificationService =
  new SupplierListingVerificationService();
