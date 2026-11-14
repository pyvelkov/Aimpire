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
] as const;

export type DashboardResource = (typeof DASHBOARD_RESOURCES)[number];

const RESOURCE_SET = new Set<string>(DASHBOARD_RESOURCES);
const PRODUCT_ID = /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDashboardResource(resource: string): resource is DashboardResource | `products/${string}` {
  return RESOURCE_SET.has(resource) || PRODUCT_ID.test(resource);
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
  },
): Promise<unknown> {
  if (!options.secret) {
    throw new DashboardAccessError(503, "Dashboard data access is not configured");
  }

  const url = dashboardRequestUrl(options.baseUrl, resource);

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
