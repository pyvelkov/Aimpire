import { handleDashboardRequest } from "../../../../lib/dashboard-handler";
import { loadDashboardResource } from "../../../../lib/agent-api";
import { assertOwner } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource } = await context.params;
  const result = await handleDashboardRequest({
    resource,
    authorize: async () => {
      await assertOwner();
    },
    load: loadDashboardResource,
    secrets: [process.env.INTERNAL_API_SECRET ?? ""].filter(Boolean),
  });

  return Response.json(result.body, {
    status: result.status,
    headers: { "cache-control": "no-store" },
  });
}
