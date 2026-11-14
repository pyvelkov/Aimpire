import "server-only";
import { redirect } from "next/navigation";
import { parseAgentOperations, parseTaskDetail, type AgentOperations, type TaskDetail } from "./agent-schema";
import { loadDashboardResource } from "./agent-api";
import { DashboardAccessError, DashboardNotFoundError } from "./errors";

export type AgentListResult =
  | { ok: true; data: AgentOperations }
  | { ok: false; message: string };

export type AgentTaskResult =
  | { ok: true; task: TaskDetail }
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; message: string };

function redirectForAccess(error: DashboardAccessError): never {
  if (error.status === 403) redirect("/login?error=owner");
  if (error.status === 503) redirect("/login?error=config");
  redirect("/login");
}

export async function loadAgentOperations(query: {
  q?: string;
  agent?: string;
  status?: string;
  page?: string;
}): Promise<AgentListResult> {
  try {
    const payload = await loadDashboardResource("agents", {
      query: {
        search: query.q,
        agent_type: query.agent,
        status: query.status,
        page: query.page,
      },
    });
    return { ok: true, data: parseAgentOperations(payload) };
  } catch (error) {
    if (error instanceof DashboardAccessError) {
      redirectForAccess(error);
    }
    return {
      ok: false,
      message: "Agent tasks are unavailable. No tasks were changed.",
    };
  }
}

export async function loadAgentTask(id: string): Promise<AgentTaskResult> {
  try {
    const payload = await loadDashboardResource(`agents/tasks/${id}`);
    return { ok: true, task: parseTaskDetail(payload) };
  } catch (error) {
    if (error instanceof DashboardNotFoundError) {
      return { ok: false, notFound: true };
    }
    if (error instanceof DashboardAccessError) {
      redirectForAccess(error);
    }
    return {
      ok: false,
      notFound: false,
      message: "This task record is unavailable. No tasks were changed.",
    };
  }
}
