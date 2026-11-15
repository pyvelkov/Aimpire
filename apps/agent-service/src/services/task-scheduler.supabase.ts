import { supabase } from "../lib/supabase.js";
import { SCHEDULER_CLAIMS_PERMITTED } from "./task-scheduler.config.js";
import { leaseOccupiesSlot, type TaskClaimResult } from "./task-claim.js";
import { TaskScheduler, type SchedulerLogger, type SchedulerStore } from "./task-scheduler.service.js";
import { loadSchedulerConfig } from "./task-scheduler.config.js";
import type { ExecutionPolicy } from "./task-execution-policy.js";
import type { SchedulerApproval, SchedulerTask } from "./task-scheduler.eligibility.js";

const TASK_COLUMNS = "id, title, description, agent_type, status, priority, input, created_at, started_at, completed_at";

type QueryError = { message: string; code?: string } | null;

export class SchedulerClaimsDisabledError extends Error {
  constructor() {
    super("Scheduler claims are disabled in stage 7.2.1");
    this.name = "SchedulerClaimsDisabledError";
  }
}

export function createSupabaseSchedulerStore(): SchedulerStore {
  return {
    async listPending() {
      const { data, error } = await supabase
        .from("agent_tasks")
        .select(TASK_COLUMNS)
        .eq("status", "pending")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw readError("agent_tasks", error);
      return asTasks(data);
    },

    async countInProgress() {
      const extended = await supabase
        .from("agent_tasks")
        .select("lease_expires_at")
        .eq("status", "in_progress");
      if (extended.error && schemaMissing(extended.error)) {
        const fallback = await supabase
          .from("agent_tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_progress");
        if (fallback.error || fallback.count == null) throw readError("agent_tasks", fallback.error);
        return fallback.count;
      }
      if (extended.error) throw readError("agent_tasks", extended.error);
      const now = Date.now();
      return asLeaseRows(extended.data).filter((row) => leaseOccupiesSlot({
        status: "in_progress",
        lease_expires_at: row.lease_expires_at,
      }, now)).length;
    },

    async loadTasks(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("agent_tasks")
        .select(TASK_COLUMNS)
        .in("id", ids);
      if (error) throw readError("agent_tasks", error);
      return asTasks(data);
    },

    async loadApprovals(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("approval_requests")
        .select("id, status, requested_action")
        .in("id", ids);
      if (error) throw readError("approval_requests", error);
      return asApprovals(data);
    },

    async loadExecutionPolicies(taskIds) {
      if (taskIds.length === 0) return { available: true, policies: [] };
      const { data, error } = await supabase.rpc("read_agent_task_execution_policies", {
        p_task_ids: taskIds,
      });
      if (error && schemaMissing(error)) return { available: false, policies: [] };
      if (error) throw readError("agent_task_execution_policies", error);
      return { available: true, policies: asPolicies(data) };
    },

    async claimTaskById(taskId, agentType, leaseSeconds): Promise<TaskClaimResult> {
      if (!SCHEDULER_CLAIMS_PERMITTED) {
        throw new SchedulerClaimsDisabledError();
      }
      const { data, error } = await supabase.rpc("claim_agent_task_by_id", {
        p_task_id: taskId,
        p_agent_type: agentType,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw readError("claim_agent_task_by_id", error);
      return asClaimResult(data);
    },
  };
}

export function createAgentScheduler(logger: SchedulerLogger): TaskScheduler {
  return new TaskScheduler({
    config: loadSchedulerConfig(process.env),
    store: createSupabaseSchedulerStore(),
    permitClaims: false,
    logger,
  });
}

function readError(table: string, error: QueryError): Error {
  return new Error(`Failed to read ${table}${error ? `: ${error.message}` : ""}`);
}

function asTasks(data: unknown): SchedulerTask[] {
  if (!Array.isArray(data)) throw new Error("Failed to read agent_tasks");
  return data.map((row) => asTask(row));
}

function asTask(row: unknown): SchedulerTask {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Failed to read agent_tasks");
  }
  const record = row as Record<string, unknown>;
  const input = record.input;
  return {
    id: text(record.id),
    title: text(record.title),
    description: text(record.description),
    agent_type: text(record.agent_type),
    status: text(record.status),
    priority: typeof record.priority === "number" ? record.priority : 3,
    input: input && typeof input === "object" && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {},
    created_at: text(record.created_at),
    started_at: nullableText(record.started_at),
    completed_at: nullableText(record.completed_at),
  };
}

function asApprovals(data: unknown): SchedulerApproval[] {
  if (!Array.isArray(data)) throw new Error("Failed to read approval_requests");
  return data.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Failed to read approval_requests");
    }
    const record = row as Record<string, unknown>;
    return {
      id: text(record.id),
      status: text(record.status),
      requested_action: text(record.requested_action),
    };
  });
}

function schemaMissing(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? "";
  if (code === "42703" || code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205") {
    return true;
  }
  return /does not exist|schema cache|could not find the function/i.test(error.message ?? "");
}

function asLeaseRows(data: unknown): Array<{ lease_expires_at: string | null }> {
  if (!Array.isArray(data)) throw new Error("Failed to read agent_tasks");
  return data.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Failed to read agent_tasks");
    }
    return { lease_expires_at: nullableText((row as { lease_expires_at?: unknown }).lease_expires_at) };
  });
}

function asPolicies(data: unknown): ExecutionPolicy[] {
  if (!Array.isArray(data)) throw new Error("Failed to read agent_task_execution_policies");
  return data.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Failed to read agent_task_execution_policies");
    }
    const record = row as { task_id?: unknown; capabilities?: unknown };
    const capabilities = Array.isArray(record.capabilities)
      ? record.capabilities.filter((item): item is string => typeof item === "string")
      : [];
    return { taskId: text(record.task_id), capabilities };
  });
}

function asClaimResult(data: unknown): TaskClaimResult {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Failed to read claim_agent_task_by_id");
  }
  const record = row as {
    outcome?: unknown;
    task_id?: unknown;
    claim_token?: unknown;
    lease_expires_at?: unknown;
  };
  return {
    outcome: text(record.outcome) || "not_found",
    task_id: nullableText(record.task_id),
    claim_token: nullableText(record.claim_token),
    lease_expires_at: nullableText(record.lease_expires_at),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
