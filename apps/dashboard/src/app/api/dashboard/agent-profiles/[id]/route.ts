import { loadDashboardResource } from "@/lib/agent-api";
import {
  agentProfileHistoryQuery,
  isAgentProfileId,
  parseStoredAgentProfile,
} from "@/lib/ai-world/profiles";
import { assertOwnerIdentity } from "@/lib/auth";
import { DashboardAccessError, DashboardNotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isAgentProfileId(id)) {
    return Response.json({ error: "Record not found" }, { status: 404, headers: noStore });
  }

  try {
    const owner = await assertOwnerIdentity();
    const payload = await loadDashboardResource(`agent-profiles/${id}`, {
      authenticated: true,
      actorId: owner.id,
      query: agentProfileHistoryQuery(request.url),
    });
    const profile = parseStoredAgentProfile(payload);
    if (!profile || profile.id !== id) {
      return Response.json({ error: "Dashboard data is unavailable" }, { status: 502, headers: noStore });
    }

    return Response.json({ profile }, { headers: noStore });
  } catch (error) {
    if (error instanceof DashboardNotFoundError) {
      return Response.json({ error: "Record not found" }, { status: 404, headers: noStore });
    }

    if (error instanceof DashboardAccessError) {
      return Response.json({ error: error.message }, { status: error.status, headers: noStore });
    }

    return Response.json({ error: "Dashboard data is unavailable" }, { status: 502, headers: noStore });
  }
}
