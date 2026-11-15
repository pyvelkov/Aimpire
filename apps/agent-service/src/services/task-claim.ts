import { AGENT_TYPES } from "./agent-operations.service.js";
import { claimSafetyRefusal, type GuardApproval } from "./task-claim-guards.js";
import {
  evaluateExecutionPolicy,
  type ExecutionPolicy,
} from "./task-execution-policy.js";

export const MIN_CLAIM_LEASE_SECONDS = 30;
export const MAX_CLAIM_LEASE_SECONDS = 900;

export type ClaimableTask = {
  id: string;
  agent_type: string;
  status: string;
  title: string;
  description: string;
  input: Record<string, unknown>;
  started_at: string | null;
  result: unknown;
  error_message: string | null;
  claim_token: string | null;
  lease_expires_at: string | null;
};

export type TaskClaimResult = {
  outcome: string;
  task_id: string | null;
  claim_token: string | null;
  lease_expires_at: string | null;
};

const SUPPORTED = new Set<string>(AGENT_TYPES);

export function applyExactClaim(
  tasks: ReadonlyMap<string, ClaimableTask>,
  policies: ReadonlyMap<string, ExecutionPolicy>,
    request: {
    taskId: string;
    agentType: string;
    leaseSeconds: number;
    now: number;
    token: string;
    approvals?: ReadonlyMap<string, GuardApproval>;
  },
): { result: TaskClaimResult; task: ClaimableTask | null } {
  const refused = (outcome: string, taskId: string | null = request.taskId): TaskClaimResult => ({
    outcome,
    task_id: taskId,
    claim_token: null,
    lease_expires_at: null,
  });

  if (!Number.isInteger(request.leaseSeconds)
    || request.leaseSeconds < MIN_CLAIM_LEASE_SECONDS
    || request.leaseSeconds > MAX_CLAIM_LEASE_SECONDS) {
    return { result: refused("invalid_lease"), task: null };
  }
  if (!SUPPORTED.has(request.agentType)) {
    return { result: refused("unsupported_agent_type"), task: null };
  }

  const current = tasks.get(request.taskId);
  if (!current) return { result: refused("not_found"), task: null };
  if (current.agent_type !== request.agentType) {
    return { result: refused("agent_type_mismatch", current.id), task: null };
  }
  if (current.status === "failed") {
    return { result: refused("failed_not_retried", current.id), task: null };
  }
  if (current.status === "in_progress" && leaseExpired(current, request.now)) {
    return { result: refused("lease_expired", current.id), task: null };
  }
  if (current.status === "in_progress" || current.started_at) {
    return { result: refused("already_claimed", current.id), task: null };
  }
  if (current.status !== "pending") {
    return { result: refused("not_pending", current.id), task: null };
  }

  const safety = claimSafetyRefusal(current, tasks, request.approvals ?? new Map());
  if (safety) return { result: refused(safety, current.id), task: null };

  const policyReasons = evaluateExecutionPolicy(policies.get(current.id) ?? null);
  if (policyReasons.includes("unknown_capability")) {
    return { result: refused("unknown_capability", current.id), task: null };
  }
  if (policyReasons.length > 0) {
    return { result: refused(policyReasons[0] ?? "execution_policy_missing", current.id), task: null };
  }

  const leaseExpiresAt = new Date(request.now + request.leaseSeconds * 1000).toISOString();
  return {
    result: {
      outcome: "claimed",
      task_id: current.id,
      claim_token: request.token,
      lease_expires_at: leaseExpiresAt,
    },
    task: {
      ...current,
      status: "in_progress",
      started_at: current.started_at ?? new Date(request.now).toISOString(),
      claim_token: request.token,
      lease_expires_at: leaseExpiresAt,
      result: current.result,
      error_message: current.error_message,
    },
  };
}

export function leaseExpired(task: {
  status: string;
  lease_expires_at?: string | null;
}, now: number): boolean {
  if (task.status !== "in_progress" || !task.lease_expires_at) return false;
  const expires = Date.parse(task.lease_expires_at);
  return Number.isNaN(expires) || expires <= now;
}

export function settleClaim(
  task: ClaimableTask,
  request: {
    action: "complete" | "fail" | "renew";
    token: string | null;
    now: number;
    leaseSeconds?: number;
    result?: unknown;
    errorMessage?: string;
  },
): { result: TaskClaimResult; task: ClaimableTask } {
  const refused = (outcome: string): { result: TaskClaimResult; task: ClaimableTask } => ({
    result: {
      outcome,
      task_id: task.id,
      claim_token: null,
      lease_expires_at: null,
    },
    task,
  });

  if (!request.token || task.claim_token !== request.token) return refused("claim_token_mismatch");
  if (task.status !== "in_progress") return refused("not_in_progress");
  if (!task.lease_expires_at || leaseExpired(task, request.now)) return refused("lease_expired");

  if (request.action === "renew") {
    const leaseSeconds = request.leaseSeconds ?? 0;
    if (!Number.isInteger(leaseSeconds)
      || leaseSeconds < MIN_CLAIM_LEASE_SECONDS
      || leaseSeconds > MAX_CLAIM_LEASE_SECONDS) {
      return refused("invalid_lease");
    }
    const leaseExpiresAt = new Date(request.now + leaseSeconds * 1000).toISOString();
    return {
      result: {
        outcome: "renewed",
        task_id: task.id,
        claim_token: task.claim_token,
        lease_expires_at: leaseExpiresAt,
      },
      task: { ...task, lease_expires_at: leaseExpiresAt },
    };
  }

  if (request.action === "complete") {
    if (!request.result || typeof request.result !== "object" || Array.isArray(request.result)) {
      return refused("invalid_result");
    }
    if (task.result != null) return refused("result_already_present");
    return {
      result: { outcome: "completed", task_id: task.id, claim_token: null, lease_expires_at: null },
      task: {
        ...task,
        status: "completed",
        result: request.result,
        claim_token: null,
        lease_expires_at: null,
      },
    };
  }

  return {
    result: { outcome: "failed", task_id: task.id, claim_token: null, lease_expires_at: null },
    task: {
      ...task,
      status: "failed",
      error_message: request.errorMessage ?? "Task failed",
      claim_token: null,
      lease_expires_at: null,
    },
  };
}

export function leaseOccupiesSlot(task: {
  status: string;
  lease_expires_at?: string | null;
}, now: number): boolean {
  if (task.status !== "in_progress") return false;
  if (!task.lease_expires_at) return true;
  return !leaseExpired(task, now);
}
