import { loadDashboardResource } from "@/lib/agent-api";
import { assertOwnerIdentity } from "@/lib/auth";
import { readAiWorldSnapshot } from "@/lib/ai-world/snapshot";
import { DashboardAccessError, DashboardUpstreamError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

export async function GET() {
  try {
    await assertOwnerIdentity();
    const payload = await loadDashboardResource("ai-world/state", { authenticated: true });
    const snapshot = readAiWorldSnapshot(payload);

    if (!snapshot) {
      return Response.json({ error: "Dashboard data is unavailable" }, { status: 502, headers: noStore });
    }

    return Response.json({ snapshot }, { headers: noStore });
  } catch (error) {
    if (error instanceof DashboardAccessError) {
      return Response.json({ error: error.message }, { status: error.status, headers: noStore });
    }

    if (error instanceof DashboardUpstreamError) {
      return Response.json({ error: "Dashboard data is unavailable" }, { status: 502, headers: noStore });
    }

    return Response.json({ error: "Dashboard data is unavailable" }, { status: 502, headers: noStore });
  }
}
