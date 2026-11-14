import { DashboardAccessError, DashboardUpstreamError } from "./errors";
import { isDashboardResource } from "./dashboard-resources";
import { stripSensitive } from "./sensitive";

export async function handleDashboardRequest(input: {
  resource: string | undefined;
  authorize: () => Promise<void>;
  load: (resource: string) => Promise<unknown>;
  secrets?: string[];
}): Promise<{ status: number; body: unknown }> {
  const resource = input.resource ?? "";

  if (!isDashboardResource(resource)) {
    return { status: 404, body: { error: "Not found" } };
  }

  try {
    await input.authorize();
    const body = stripSensitive(await input.load(resource), input.secrets ?? []);
    return { status: 200, body };
  } catch (error) {
    if (error instanceof DashboardAccessError) {
      return { status: error.status, body: { error: error.message } };
    }

    if (error instanceof DashboardUpstreamError) {
      return {
        status: error.status,
        body: { error: "Dashboard data is unavailable" },
      };
    }

    return { status: 502, body: { error: "Dashboard data is unavailable" } };
  }
}
