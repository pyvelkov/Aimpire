import { supabase } from "../lib/supabase.js";
import { DashboardDataError } from "./dashboard-read.service.js";
import {
  sanitizeTaskSearch,
  taskPageRange,
  type AgentOperationsDb,
  type AgentTypeName,
  type TaskListQuery,
  type TaskRow,
  type TaskStatusName,
} from "./agent-operations.service.js";

type QueryError = { message: string } | null;

type QueryResult = {
  data: unknown;
  error: QueryError;
  count: number | null;
};

type Query = {
  select: (
    columns: string,
    options?: { count?: "exact"; head?: boolean },
  ) => Query;
  eq: (column: string, value: string) => Query;
  or: (filters: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (from: number, to: number) => Promise<QueryResult>;
  then: PromiseLike<QueryResult>["then"];
};

type SupabaseLike = {
  from: (table: string) => Query;
};

function asRows(table: string, data: unknown): TaskRow[] {
  if (!Array.isArray(data)) {
    throw new DashboardDataError(`Failed to load ${table}`);
  }
  return data.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new DashboardDataError(`Failed to load ${table}`);
    }
    return row as TaskRow;
  });
}

function applyTaskFilters(
  query: Query,
  filters?: { status?: TaskStatusName; agentType?: AgentTypeName },
): Query {
  let next = query;
  if (filters?.status) {
    next = next.eq("status", filters.status);
  }
  if (filters?.agentType) {
    next = next.eq("agent_type", filters.agentType);
  }
  return next;
}

export function createSupabaseAgentOperationsDb(
  client: SupabaseLike = supabase as unknown as SupabaseLike,
): AgentOperationsDb {
  return {
    async countTasks(filters) {
      let query = client
        .from("agent_tasks")
        .select("id", { count: "exact", head: true });
      query = applyTaskFilters(query, filters);
      const { error, count } = await query;
      if (error || count == null) {
        throw new DashboardDataError(
          `Failed to count agent_tasks${error ? `: ${error.message}` : ""}`,
        );
      }
      return count;
    },

    async listTasks(query: TaskListQuery) {
      let request = client
        .from("agent_tasks")
        .select(
          "id, title, description, agent_type, status, priority, created_at, started_at, completed_at, error_message",
          { count: "exact" },
        );
      request = applyTaskFilters(request, {
        status: query.status ?? undefined,
        agentType: query.agentType ?? undefined,
      });
      const search = sanitizeTaskSearch(query.search);
      if (search) {
        request = request.or(
          `title.ilike."%${search}%",description.ilike."%${search}%"`,
        );
      }
      const { from, to } = taskPageRange(query.page, query.pageSize);
      const { data, error, count } = await request
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error || count == null) {
        throw new DashboardDataError(
          `Failed to load agent_tasks${error ? `: ${error.message}` : ""}`,
        );
      }
      return { total: count, rows: asRows("agent_tasks", data) };
    },

    async getTask(id: string) {
      const { data, error } = await client
        .from("agent_tasks")
        .select("id, title, description, agent_type, status, priority, input, result, error_message, created_at, started_at, completed_at")
        .eq("id", id);
      if (error) {
        throw new DashboardDataError(`Failed to load agent_tasks: ${error.message}`);
      }
      const rows = asRows("agent_tasks", data);
      return rows[0] ?? null;
    },

    async listRuns(taskId: string) {
      const { data, error } = await client
        .from("agent_runs")
        .select("id, agent_type, task_id, status, model_provider, model_name, input, output, tokens_used, execution_time_ms, error_message, started_at, completed_at")
        .eq("task_id", taskId)
        .order("started_at", { ascending: false });
      if (error) {
        throw new DashboardDataError(`Failed to load agent_runs: ${error.message}`);
      }
      return asRows("agent_runs", data);
    },

    async listActivity(taskId: string) {
      const { data, error } = await client
        .from("activity_logs")
        .select("id, agent_type, action, entity_type, entity_id, description, created_at")
        .eq("entity_id", taskId)
        .order("created_at", { ascending: false });
      if (error) {
        throw new DashboardDataError(`Failed to load activity_logs: ${error.message}`);
      }
      return asRows("activity_logs", data);
    },
  };
}
