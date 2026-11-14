import { supabase } from "../lib/supabase.js";

type ClaimStatus =
  | "claimed"
  | "cached"
  | "in_progress"
  | "retry_required"
  | "not_found";

type ClaimResult = {
  claim_status: ClaimStatus;
  claim_token: string | null;
};

export class SupplierExtractionLockService {
  async claim(runId: string, retryFailed = false) {
    const { data, error } = await supabase.rpc(
      "claim_supplier_extraction",
      {
        p_run_id: runId,
        p_retry_failed: retryFailed,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    const result = (data as ClaimResult[])[0];

    if (!result) {
      throw new Error("Extraction claim returned no result");
    }

    return result;
  }

  async finish(
    runId: string,
    token: string,
    result: unknown,
    errorMessage: string | null = null
  ) {
    const { data, error } = await supabase.rpc(
      "finish_supplier_extraction",
      {
        p_run_id: runId,
        p_token: token,
        p_result: result,
        p_error: errorMessage,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return data === true;
  }

  async getRun(runId: string) {
    const { data, error } = await supabase
      .from("supplier_discovery_runs")
      .select(
        "id, status, extraction_result, extraction_error"
      )
      .eq("id", runId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}

export const supplierExtractionLockService =
  new SupplierExtractionLockService();
