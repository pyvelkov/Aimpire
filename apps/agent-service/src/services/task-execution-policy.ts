import { PRODUCT_REVIEW_ACTION } from "./approval-workflow.service.js";

export const AUTONOMOUS_CAPABILITIES = ["research_read", "database_read"] as const;

export const BLOCKED_CAPABILITIES = [
  "database_write_internal",
  "supplier_external_read",
  "customer_communication",
  "storefront_publish",
  "supplier_purchase",
  "advertising_spend",
] as const;

export const ACTION_SPECIFIC_CAPABILITIES = [
  "customer_communication",
  "storefront_publish",
  "supplier_purchase",
  "advertising_spend",
] as const;

export const KNOWN_CAPABILITIES = [
  ...AUTONOMOUS_CAPABILITIES,
  ...BLOCKED_CAPABILITIES,
] as const;

export type AutonomousCapability = (typeof AUTONOMOUS_CAPABILITIES)[number];
export type KnownCapability = (typeof KNOWN_CAPABILITIES)[number];

export type ExecutionPolicy = {
  taskId: string;
  capabilities: readonly string[];
};

const KNOWN = new Set<string>(KNOWN_CAPABILITIES);
const AUTONOMOUS = new Set<string>(AUTONOMOUS_CAPABILITIES);
const ACTION_SPECIFIC = new Set<string>(ACTION_SPECIFIC_CAPABILITIES);

export function evaluateExecutionPolicy(policy: ExecutionPolicy | null): string[] {
  if (!policy || policy.capabilities.length === 0) {
    return ["execution_policy_missing"];
  }

  const reasons: string[] = [];
  let unknown = false;
  let rejected = false;
  let needsActionApproval = false;

  for (const capability of policy.capabilities) {
    if (!KNOWN.has(capability)) {
      unknown = true;
      continue;
    }
    if (!AUTONOMOUS.has(capability)) {
      rejected = true;
      if (ACTION_SPECIFIC.has(capability)) needsActionApproval = true;
    }
  }

  if (unknown) reasons.push("unknown_capability");
  if (rejected) reasons.push("execution_policy_rejected");
  if (needsActionApproval) reasons.push("approval_scope_missing");
  return reasons;
}

export function productReviewAuthorizesExecution(requestedAction: string | null): boolean {
  if (requestedAction === PRODUCT_REVIEW_ACTION) return false;
  return false;
}
