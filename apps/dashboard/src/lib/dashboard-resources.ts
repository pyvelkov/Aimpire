import { DashboardAccessError, DashboardUpstreamError } from "./errors";
import { stripSensitive } from "./sensitive";

export const DASHBOARD_RESOURCES = [
  "overview",
  "product-candidates",
  "product-decisions",
  "agent-tasks",
  "activity",
  "profitability-analyses",
] as const;

export type DashboardResource = (typeof DASHBOARD_RESOURCES)[number];

const RESOURCE_SET = new Set<string>(DASHBOARD_RESOURCES);

export function isDashboardResource(resource: string): resource is DashboardResource {
  return RESOURCE_SET.has(resource);
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
  const cleaned = stripSensitive(payload, [options.secret]);

  if (!response.ok || !cleaned || typeof cleaned !== "object") {
    throw new DashboardUpstreamError("The agent service could not load dashboard data");
  }

  return cleaned;
}
