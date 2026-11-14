import "server-only";
import { assertOwner } from "./auth";
import { requestDashboardResource } from "./dashboard-resources";

export async function loadDashboardResource(
  resource: string,
  options?: {
    authenticated?: boolean;
    query?: Record<string, string | undefined>;
  },
): Promise<unknown> {
  if (!options?.authenticated) {
    await assertOwner();
  }

  return requestDashboardResource(resource, {
    baseUrl: process.env.AGENT_SERVICE_URL ?? "http://127.0.0.1:3000",
    secret: process.env.INTERNAL_API_SECRET ?? "",
    query: options?.query,
  });
}
