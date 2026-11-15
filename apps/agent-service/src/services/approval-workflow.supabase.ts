import { supabase } from "../lib/supabase.js";
import { DashboardDataError } from "./dashboard-read.service.js";
import {
  describeDatabaseFailure,
  WORKFLOW_CODES,
  type ApprovalDb,
  type ApprovalRow,
  type WorkflowCode,
  type WorkflowResult,
} from "./approval-workflow.service.js";

type QueryError = { message: string } | null;
type QueryResult = { data: unknown; error: QueryError };
type Query = {
  select: (columns: string) => Query;
  eq: (column: string, value: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  limit: (count: number) => Query;
  then: PromiseLike<QueryResult>["then"];
};
type RpcClient = {
  from: (table: string) => Query;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: QueryError }>;
};

function asRows(data: unknown): ApprovalRow[] {
  if (!Array.isArray(data)) {
    throw new DashboardDataError("Failed to load approval records");
  }
  return data.filter((row): row is ApprovalRow => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function asResult(data: unknown): WorkflowResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new DashboardDataError("Approval workflow returned an unexpected result");
  }
  const row = data as Record<string, unknown>;
  if (row.ok === true && typeof row.request_id === "string" && typeof row.status === "string") {
    return { ok: true, requestId: row.request_id, status: row.status };
  }
  if (row.ok === false && typeof row.code === "string" && WORKFLOW_CODES.includes(row.code as WorkflowCode)) {
    return { ok: false, code: row.code as WorkflowCode };
  }
  throw new DashboardDataError("Approval workflow returned an unexpected result");
}

export function createSupabaseApprovalDb(
  client: RpcClient = supabase as unknown as RpcClient,
): ApprovalDb {
  return {
    async listRequests() {
      const { data, error } = await client
        .from("approval_requests")
        .select("id, candidate_id, source_decision_id, requested_action, status, decision_summary, created_at, resolved_at, requested_by, reviewer_id, reviewer_notes")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new DashboardDataError("Failed to load approval requests");
      return asRows(data);
    },
    async getRequest(id) {
      const { data, error } = await client
        .from("approval_requests")
        .select("id, candidate_id, source_decision_id, requested_action, status, evidence_snapshot, decision_summary, created_at, resolved_at, requested_by, reviewer_id, reviewer_notes")
        .eq("id", id)
        .limit(1);
      if (error) throw new DashboardDataError("Failed to load approval request");
      return asRows(data)[0] ?? null;
    },
    async listEvents(requestId) {
      const { data, error } = await client
        .from("approval_events")
        .select("id, approval_request_id, event_type, actor_id, previous_status, new_status, notes, created_at")
        .eq("approval_request_id", requestId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw new DashboardDataError("Failed to load approval events");
      return asRows(data);
    },
    async createRequest(decisionId, actorId, notes) {
      const { data, error } = await client.rpc("create_product_review_request", {
        p_decision_id: decisionId,
        p_actor_id: actorId,
        p_notes: notes,
      });
      if (error) throw new DashboardDataError(describeDatabaseFailure("create approval request", error));
      return asResult(data);
    },
    async resolveRequest(requestId, actorId, decision, notes) {
      const { data, error } = await client.rpc("resolve_approval_request", {
        p_request_id: requestId,
        p_actor_id: actorId,
        p_decision: decision,
        p_notes: notes,
      });
      if (error) throw new DashboardDataError(describeDatabaseFailure("resolve approval request", error));
      return asResult(data);
    },
  };
}
