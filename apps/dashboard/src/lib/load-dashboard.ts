import "server-only";
import { redirect } from "next/navigation";
import { loadDashboardResource } from "./agent-api";
import { assertOwner } from "./auth";
import { parseDashboardPayloads, type DashboardPageData } from "./dashboard-schema";
import { DashboardAccessError } from "./errors";

export type DashboardLoadResult =
  | { ok: true; data: DashboardPageData }
  | { ok: false; message: string };

export async function loadDashboardPage(): Promise<DashboardLoadResult> {
  try {
    await assertOwner();
    const [overview, candidates, decisions, tasks, activity, analyses] = await Promise.all([
      loadDashboardResource("overview", { authenticated: true }),
      loadDashboardResource("product-candidates", { authenticated: true }),
      loadDashboardResource("product-decisions", { authenticated: true }),
      loadDashboardResource("agent-tasks", { authenticated: true }),
      loadDashboardResource("activity", { authenticated: true }),
      loadDashboardResource("profitability-analyses", { authenticated: true }),
    ]);

    return {
      ok: true,
      data: parseDashboardPayloads({
        overview,
        candidates,
        decisions,
        tasks,
        activity,
        analyses,
      }),
    };
  } catch (error) {
    if (error instanceof DashboardAccessError) {
      if (error.status === 403) {
        redirect("/login?error=owner");
      }

      if (error.status === 503) {
        redirect("/login?error=config");
      }

      redirect("/login");
    }

    return {
      ok: false,
      message: "Operational data is unavailable. No records were changed.",
    };
  }
}
