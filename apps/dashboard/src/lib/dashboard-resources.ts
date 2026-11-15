import { DashboardAccessError, DashboardNotFoundError, DashboardUpstreamError, DashboardWorkflowError } from "./errors";
import { stripSensitive } from "./sensitive";

export const DASHBOARD_RESOURCES = [
  "overview",
  "product-candidates",
  "product-decisions",
  "agent-tasks",
  "activity",
  "profitability-analyses",
  "products",
  "agents",
  "approvals",
  "ai-world/state",
  "agent-profiles",
] as const;

export type DashboardResource = (typeof DASHBOARD_RESOURCES)[number];

const RESOURCE_SET = new Set<string>(DASHBOARD_RESOURCES);
const PRODUCT_ID = /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TASK_ID = /^agents\/tasks\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVAL_ID = /^approvals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVAL_ACTION = /^approvals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(approve|reject)$/i;
const PROFILE_ID = /^agent-profiles\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDashboardResource(
  resource: string,
): resource is DashboardResource | `products/${string}` | `agents/tasks/${string}` | `approvals/${string}` | `agent-profiles/${string}` | "ai-world/state" {
  return RESOURCE_SET.has(resource)
    || PRODUCT_ID.test(resource)
    || TASK_ID.test(resource)
    || resource === "approvals"
    || APPROVAL_ID.test(resource)
    || APPROVAL_ACTION.test(resource)
    || PROFILE_ID.test(resource);
}

export function dashboardRequestUrl(baseUrl: string, resource: string): string {
  if (!isDashboardResource(resource)) {
    throw new DashboardUpstreamError("Unknown dashboard resource");
  }

  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`dashboard/${resource}`, base).toString();
}

export async function requestDashboardResource(
  resource: string,
  options: {
    baseUrl: string;
    secret: string;
    fetchImpl?: typeof fetch;
    query?: Record<string, string | undefined>;
    method?: "GET" | "POST";
    body?: unknown;
    actorId?: string;
  },
): Promise<unknown> {
  if (!options.secret) {
    throw new DashboardAccessError(503, "Dashboard data access is not configured");
  }

  const urlObject = new URL(dashboardRequestUrl(options.baseUrl, resource));
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value) {
      urlObject.searchParams.set(key, value);
    }
  }
  const url = urlObject.toString();

  if (url.includes(options.secret)) {
    throw new DashboardUpstreamError("Dashboard data is unavailable");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;

  const headers: Record<string, string> = {
    accept: "application/json",
    "x-aimpire-internal-secret": options.secret,
  };
  if (options.actorId) {
    headers["x-aimpire-actor-id"] = options.actorId;
  }
  if ((options.method ?? "GET") === "POST") {
    headers["content-type"] = "application/json";
  }

  try {
    response = await fetchImpl(url, {
      method: options.method ?? "GET",
      cache: "no-store",
      headers,
      body: (options.method ?? "GET") === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
    });
  } catch {
    throw new DashboardUpstreamError("The agent service is unavailable");
  }

  const payload = await response.json().catch(() => null);
  const workflow = workflowFailure(response.status, payload);
  if (workflow) {
    throw workflow;
  }
  if (response.status === 404) {
    throw new DashboardNotFoundError("Record not found");
  }
  if (response.status === 401) {
    throw new DashboardAccessError(401, "Authentication required");
  }
  if (response.status === 403 || response.status === 503) {
    throw new DashboardAccessError(
      response.status,
      response.status === 503
        ? "Dashboard authentication is not configured"
        : "This dashboard is limited to the Aimpire owner",
    );
  }
  const cleaned = stripSensitive(payload, [options.secret]);
  if (response.status === 400 || response.status === 409) {
    const code = cleaned && typeof cleaned === "object" && "error" in cleaned
      ? String((cleaned as { error?: unknown }).error)
      : "invalid_action";
    throw new DashboardWorkflowError(response.status, workflowMessage(code));
  }

  if (!response.ok || !cleaned || typeof cleaned !== "object") {
    throw new DashboardUpstreamError("The agent service could not load dashboard data");
  }

  return cleaned;
}

const WORKFLOW_MESSAGE: Record<string, string> = {
  duplicate_request: "A review request already exists for this decision.",
  not_pending: "This request is no longer pending.",
  stale_evidence: "The supplier evidence or source decision changed. This review was not recorded.",
  superseded_decision: "A newer decision exists for this product. Request a review of that decision.",
  decision_not_found: "That decision was not found.",
  unauthorized_reviewer: "This dashboard is limited to the Aimpire owner",
  invalid_action: "The review could not be recorded.",
};

function workflowFailure(status: number, payload: unknown): DashboardWorkflowError | null {
  if (status !== 400 && status !== 403 && status !== 404 && status !== 409) return null;
  if (!payload || typeof payload !== "object" || !("error" in payload)) return null;
  const code = (payload as { error?: unknown }).error;
  if (typeof code !== "string" || !(code in WORKFLOW_MESSAGE)) return null;
  const workflowStatus = status === 403 || status === 404 || status === 409 ? status : 400;
  return new DashboardWorkflowError(workflowStatus, WORKFLOW_MESSAGE[code]);
}

function workflowMessage(code: string): string {
  return WORKFLOW_MESSAGE[code] ?? "The review could not be recorded.";
}
