import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import {
  unitEconomicsService,
  unitEconomicsSchema,
} from "./unit-economics.service.js";

export const createSupplierQuoteSchema =
  unitEconomicsSchema.extend({
    candidate_id: z.string().uuid(),
    supplier_name: z.string().trim().min(2),
    supplier_url: z.string().url().optional(),
    notes: z.string().max(2000).optional(),
  });

export class SupplierQuoteService {
  async create(input: z.infer<typeof createSupplierQuoteSchema>) {
    const parsed = createSupplierQuoteSchema.parse(input);

    const { data: candidate, error: candidateError } =
      await supabase
        .from("product_candidates")
        .select("id, name")
        .eq("id", parsed.candidate_id)
        .single();

    if (candidateError || !candidate) {
      throw new Error("Product candidate not found");
    }

    const {
      candidate_id,
      supplier_name,
      supplier_url,
      notes,
      ...financialInput
    } = parsed;

    const { data, error } = await supabase
      .from("supplier_quotes")
      .insert({
        candidate_id,
        supplier_name,
        supplier_url: supplier_url ?? null,
        notes: notes ?? null,
        ...financialInput,
        verification_status: "unverified",
        source_type: "manual",
      })
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to save supplier quote: ${error.message}`
      );
    }

    return {
      quote: data,
      economics: unitEconomicsService.calculate(
        financialInput
      ),
    };
  }

  async getByCandidate(candidateId: string) {
    const { data, error } = await supabase
      .from("supplier_quotes")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Failed to retrieve quotes: ${error.message}`
      );
    }

    return (data ?? []).map((quote) => {
      const financialInput = unitEconomicsSchema.parse(
        quote
      );

      return {
        quote,
        economics: unitEconomicsService.calculate(
          financialInput
        ),
      };
    });
  }
}

export const supplierQuoteService =
  new SupplierQuoteService();
