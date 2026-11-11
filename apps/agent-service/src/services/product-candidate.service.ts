import { supabase } from "../lib/supabase.js";

export interface CandidateInput {
  name: string;
  description: string;
  category: string | null;
  sourceUrl: string;
  sourceTaskId: string;
  evidenceQuote: string;
  supportingSourceUrls: string[];
}

export class ProductCandidateService {
  async saveCandidates(candidates: CandidateInput[]) {
    const created = [];
    const duplicates: string[] = [];

    for (const candidate of candidates) {
      const { data, error } = await supabase
        .from("product_candidates")
        .insert({
          name: candidate.name,
          description: candidate.description,
          category: candidate.category,
          source_url: candidate.sourceUrl,
          target_market: ["CA", "US"],
          status: "discovered",
          research_data: {
            source_task_id: candidate.sourceTaskId,
            evidence_quote: candidate.evidenceQuote,
            supporting_source_urls:
              candidate.supportingSourceUrls,
            extraction_method: "gemini",
            evidence_status: "requires_validation",
            extracted_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        // PostgreSQL unique constraint violation
        if (error.code === "23505") {
          duplicates.push(candidate.name);

          // The database is the authority on uniqueness.
          // A duplicate must not be inserted under a new name
          // simply to bypass the constraint.
          continue;
        }

        throw new Error(
          `Failed to save candidate ${candidate.name}: ${error.message}`
        );
      }

      created.push(data);
    }

    return {
      created_count: created.length,
      duplicate_count: duplicates.length,
      duplicates,
      candidates: created,
    };
  }
}

export const productCandidateService =
  new ProductCandidateService();
