import { PRODUCT_REVIEW_ACTION } from "./approval-workflow.service.js";
import { productReviewAuthorizesExecution } from "./task-execution-policy.js";

const DEPENDENCY_KEYS = ["depends_on", "dependencies", "blocked_by", "prerequisite_task_ids"] as const;
const APPROVAL_ID_KEYS = ["approval_request_id", "approval_id"] as const;
const ACTION_FLAGS = {
  purchase: "purchasing",
  publish: "publishing",
  advertise: "advertising",
  place_order: "purchasing",
  launch_campaign: "advertising",
  spend: "advertising",
} as const;

const CONSEQUENTIAL_RULES: Array<{ action: string; pattern: RegExp }> = [
  {
    action: "purchasing",
    pattern: /\b(purchase|purchasing|buy|buying|checkout|place an order|order inventory|pay the supplier|pay supplier)\b/i,
  },
  {
    action: "advertising",
    pattern: /\b(launch|start|run|create|buy|place|spend)\b(?:\s+\w+){0,4}\s+\b(ad|ads|advertisement|advertising|campaign)s?\b/i,
  },
  {
    action: "advertising",
    pattern: /\b(ad spend|advertising spend|spend on ads|boost post)\b/i,
  },
  {
    action: "advertising",
    pattern: /\badvertising\b/i,
  },
  {
    action: "publishing",
    pattern: /\b(publish|publishing|unpublish|shopify|go live)\b/i,
  },
  {
    action: "external_write",
    pattern: /\b(refund customers|charge the customer|send (an )?email|email customers|post to (instagram|facebook|tiktok|the store))\b/i,
  },
];

export type GuardTask = {
  id: string;
  title: string;
  description: string;
  input: Record<string, unknown>;
};

export type GuardApproval = {
  status: string;
  requested_action: string;
};

export function consequentialAction(task: GuardTask): string | null {
  const input = task.input ?? {};
  for (const [flag, action] of Object.entries(ACTION_FLAGS)) {
    if (input[flag] === true) return action;
  }
  const requested = input.action ?? input.requested_action;
  if (typeof requested === "string" && requested.trim()) {
    const probe = evaluateText(requested);
    if (probe) return probe;
  }
  let encoded = "";
  try {
    encoded = JSON.stringify(input);
  } catch {
    return "external_write";
  }
  return evaluateText([task.title, task.description, encoded].join("\n"));
}

const DEPENDENCY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dependencyIds(task: GuardTask): string[] {
  const parsed = parseDependencyIds(task.input);
  return parsed.ids;
}

export function dependencyLockOrder(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

export function dependencyRefusal(
  task: GuardTask,
  tasksById: ReadonlyMap<string, { status: string; input?: Record<string, unknown> }>,
): string | null {
  const seen = new Set<string>();

  function walk(id: string, input: Record<string, unknown> | undefined, stack: string[]): string | null {
    const parsed = parseDependencyIds(input);
    if (parsed.reason) return parsed.reason;
    for (const dependencyId of parsed.ids) {
      if (dependencyId === id || stack.includes(dependencyId)) return "dependency_cycle";
      if (seen.has(dependencyId)) continue;
      const row = tasksById.get(dependencyId);
      if (!row || row.status !== "completed") return "dependency_unsatisfied";
      seen.add(dependencyId);
      const nested = walk(dependencyId, row.input, [...stack, dependencyId]);
      if (nested) return nested;
    }
    return null;
  }

  return walk(task.id, task.input, [task.id]);
}

function parseDependencyIds(input: Record<string, unknown> | undefined): { ids: string[]; reason: string | null } {
  if (!input) return { ids: [], reason: null };
  const ids: string[] = [];
  for (const key of DEPENDENCY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (!Array.isArray(value)) return { ids: [], reason: "dependency_unsatisfied" };
    for (const entry of value) {
      if (typeof entry !== "string" || !DEPENDENCY_UUID.test(entry.trim())) {
        return { ids: [], reason: "dependency_unsatisfied" };
      }
      ids.push(entry.trim());
    }
  }
  return { ids, reason: null };
}

export function approvalRequestId(input: Record<string, unknown> | undefined): string | null {
  for (const key of APPROVAL_ID_KEYS) {
    const value = input?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function approvalDecision(
  task: GuardTask,
  approvalsById: ReadonlyMap<string, GuardApproval>,
): string | null {
  const input = task.input ?? {};
  const requires = input.requires_approval === true || input.approval_required === true;
  const status = typeof input.approval_status === "string" ? input.approval_status.trim().toLowerCase() : "";
  const requestId = approvalRequestId(input);

  if (status && status !== "approved") return "approval_unresolved";

  if (requestId) {
    const approval = approvalsById.get(requestId);
    if (!approval || approval.status !== "approved") return "approval_unresolved";
    if (approval.requested_action === PRODUCT_REVIEW_ACTION || requires) {
      return productReviewAuthorizesExecution(approval.requested_action)
        ? null
        : "approval_does_not_authorize_execution";
    }
  }

  if (requires) return "approval_unresolved";
  return null;
}

export function claimSafetyRefusal(
  task: GuardTask,
  tasksById: ReadonlyMap<string, { status: string }>,
  approvalsById: ReadonlyMap<string, GuardApproval>,
): string | null {
  const action = consequentialAction(task);
  if (action) return `externally_consequential:${action}`;
  const approval = approvalDecision(task, approvalsById);
  if (approval) return approval;
  return dependencyRefusal(task, tasksById);
}

function evaluateText(text: string): string | null {
  for (const rule of CONSEQUENTIAL_RULES) {
    if (rule.pattern.test(text)) return rule.action;
  }
  return null;
}
