import { loadDashboardResource } from "@/lib/agent-api";
import { agentProfileHistoryQuery, parseStoredAgentProfileList } from "@/lib/ai-world/profiles";
import { assertOwnerIdentity } from "@/lib/auth";
import { DashboardAccessError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

export async function GET(request: Request) {
  try {
    const owner = await assertOwnerIdentity();
    const payload = await loadDashboardResource("agent-profiles", {
      authenticated: true,
      actorId: owner.id,
      query: agentProfileHistoryQuery(request.url),
    });
    const profiles = parseStoredAgentProfileList(payload);
    if (!profiles) {
      return Response.json({ error: "Dashboard data is unavailable" }, { status: 502, headers: noStore });
    }

    return Response.json({ profiles }, { headers: noStore });
  } catch (error) {
    if (error instanceof DashboardAccessError) {
      return Response.json({ error: error.message }, { status: error.status, headers: noStore });
    }

    return Response.json({ error: "Dashboard data is unavailable" }, { status: 502, headers: noStore });
  }
}
