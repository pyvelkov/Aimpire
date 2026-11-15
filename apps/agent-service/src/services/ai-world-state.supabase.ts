import { supabase } from "../lib/supabase.js";
import { PRODUCT_REVIEW_ACTION } from "./approval-workflow.service.js";
import { DashboardDataError } from "./dashboard-read.service.js";
import type {
  AiWorldStateDb,
  AiWorldTaskRow,
} from "./ai-world-state.service.js";
import type { AgentTypeName, TaskStatusName } from "./agent-operations.service.js";

type QueryError = { message: string } | null;

type QueryResult = {
  data: unknown;
  error: QueryError;
  count: number | null;
};

type Query = {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => Query;
  eq: (column: string, value: string) => Query;
  order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => Query;
  limit: (count: number) => Query;
  then: PromiseLike<QueryResult>["then"];
};

type SupabaseLike = {
  from: (table: string) => Query;
};

const TASK_COLUMNS = "id, title, agent_type, status, created_at, started_at, completed_at";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asTask(data: unknown): AiWorldTaskRow | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const row = data[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DashboardDataError("Failed to load agent_tasks");
  }
  const record = row as Record<string, unknown>;
  const id = text(record.id);
  if (!id) {
    return null;
  }
  return {
    id,
    title: text(record.title) ?? "",
    agent_type: text(record.agent_type) ?? "",
    status: text(record.status) ?? "",
    created_at: text(record.created_at),
    started_at: text(record.started_at),
    completed_at: text(record.completed_at),
  };
}

export function createSupabaseAiWorldStateDb(
  client: SupabaseLike = supabase as unknown as SupabaseLike,
): AiWorldStateDb {
  return {
    async countTasks(agentType: AgentTypeName, status: TaskStatusName) {
      const { error, count } = await client
        .from("agent_tasks")
        .select("id", { count: "exact", head: true })
        .eq("agent_type", agentType)
        .eq("status", status);
      if (error || count == null) {
        throw new DashboardDataError(`Failed to count agent_tasks${error ? `: ${error.message}` : ""}`);
      }
      return count;
    },

    async latestBy(agentType, column) {
      const { data, error } = await client
        .from("agent_tasks")
        .select(TASK_COLUMNS)
        .eq("agent_type", agentType)
        .order(column, { ascending: false, nullsFirst: false })
        .limit(1);
      if (error) {
        throw new DashboardDataError(`Failed to load agent_tasks: ${error.message}`);
      }
      return asTask(data);
    },

    async currentRunningTask(agentType) {
      const { data, error } = await client
        .from("agent_tasks")
        .select(TASK_COLUMNS)
        .eq("agent_type", agentType)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (error) {
        throw new DashboardDataError(`Failed to load agent_tasks: ${error.message}`);
      }
      return asTask(data);
    },

    async countPendingProductReviews() {
      const { error, count } = await client
        .from("approval_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("requested_action", PRODUCT_REVIEW_ACTION);
      if (error || count == null) {
        throw new DashboardDataError(`Failed to count approval_requests${error ? `: ${error.message}` : ""}`);
      }
      return count;
    },
  };
}
