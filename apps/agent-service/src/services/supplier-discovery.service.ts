import { z } from "zod";
import { supabase } from "../lib/supabase.js";

const urlSchema = z.string().url().refine(
  (value) => {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol);
  },
  "URL must use HTTP or HTTPS"
);

export const createSupplierDiscoverySchema = z.object({
  candidate_id: z.string().uuid(),
  supplier_name: z.string().trim().min(2),
  supplier_url: urlSchema,
  product_url: urlSchema.optional(),
  platform: z.string().trim().max(100).optional(),
  evidence_url: urlSchema,
  evidence_notes: z.string().max(3000).optional(),
});

export class SupplierDiscoveryService {
  async create(
    input: z.infer<typeof createSupplierDiscoverySchema>
  ) {
    const parsed = createSupplierDiscoverySchema.parse(input);

    const { data: candidate, error: candidateError } =
      await supabase
        .from("product_candidates")
        .select("id")
        .eq("id", parsed.candidate_id)
        .single();

    if (candidateError || !candidate) {
      throw new Error("Product candidate not found");
    }

    const { data, error } = await supabase
      .from("supplier_discoveries")
      .insert({
        ...parsed,
        discovery_method: "manual",
        verification_status: "unverified",
      })
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to save discovery: ${error.message}`
      );
    }

    return data;
  }

  async getByCandidate(candidateId: string) {
    const { data, error } = await supabase
      .from("supplier_discoveries")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Failed to retrieve discoveries: ${error.message}`
      );
    }

    return data ?? [];
  }
}

export const supplierDiscoveryService =
  new SupplierDiscoveryService();
