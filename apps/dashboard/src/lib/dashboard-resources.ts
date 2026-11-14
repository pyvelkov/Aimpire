import { DashboardAccessError, DashboardNotFoundError, DashboardUpstreamError } from "./errors";
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
] as const;

export type DashboardResource = (typeof DASHBOARD_RESOURCES)[number];

const RESOURCE_SET = new Set<string>(DASHBOARD_RESOURCES);
const PRODUCT_ID = /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TASK_ID = /^agents\/tasks\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDashboardResource(
  resource: string,
): resource is DashboardResource | `products/${string}` | `agents/tasks/${string}` {
  return RESOURCE_SET.has(resource) || PRODUCT_ID.test(resource) || TASK_ID.test(resource);
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

  try {
    response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "x-aimpire-internal-secret": options.secret,
      },
    });
  } catch {
    throw new DashboardUpstreamError("The agent service is unavailable");
  }

  const payload = await response.json().catch(() => null);
  if (response.status === 404) {
    throw new DashboardNotFoundError("Record not found");
  }
  const cleaned = stripSensitive(payload, [options.secret]);

  if (!response.ok || !cleaned || typeof cleaned !== "object") {
    throw new DashboardUpstreamError("The agent service could not load dashboard data");
  }

  return cleaned;
}
