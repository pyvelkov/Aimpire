import { supabase } from "../lib/supabase.js";
import { DashboardDataError } from "./dashboard-read.service.js";
import {
  AGENT_PROFILE_HISTORY_MAX,
  type AgentProfileDb,
  type AgentProfileRow,
  type ProfileTaskRow,
} from "./agent-profile.service.js";
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

const PROFILE_COLUMNS = "id, agent_type, display_name, description, responsibilities, specialization, avatar_id, created_at, updated_at";
const TASK_COLUMNS = "id, title, agent_type, status, created_at, started_at, completed_at, error_message";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asRecord(table: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DashboardDataError(`Failed to load ${table}`);
  }
  return value as Record<string, unknown>;
}

function asProfiles(data: unknown): AgentProfileRow[] {
  if (data == null) {
    return [];
  }
  if (!Array.isArray(data)) {
    throw new DashboardDataError("Failed to load agent_profiles");
  }
  return data.map((row) => {
    const record = asRecord("agent_profiles", row);
    return {
      id: text(record.id) ?? "",
      agent_type: text(record.agent_type) ?? "",
      display_name: text(record.display_name) ?? "",
      description: text(record.description) ?? "",
      responsibilities: text(record.responsibilities) ?? "",
      specialization: text(record.specialization) ?? "",
      avatar_id: text(record.avatar_id) ?? "",
      created_at: text(record.created_at),
      updated_at: text(record.updated_at),
    };
  });
}

function asTasks(data: unknown): ProfileTaskRow[] {
  if (data == null) {
    return [];
  }
  if (!Array.isArray(data)) {
    throw new DashboardDataError("Failed to load agent_tasks");
  }
  return data.map((row) => {
    const record = asRecord("agent_tasks", row);
    return {
      id: text(record.id) ?? "",
      title: text(record.title) ?? "",
      agent_type: text(record.agent_type) ?? "",
      status: text(record.status) ?? "",
      created_at: text(record.created_at),
      started_at: text(record.started_at),
      completed_at: text(record.completed_at),
      error_message: text(record.error_message),
    };
  });
}

function requireLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > AGENT_PROFILE_HISTORY_MAX) {
    throw new DashboardDataError("Failed to load agent_tasks");
  }
  return limit;
}

export function createSupabaseAgentProfileDb(
  client: SupabaseLike = supabase as unknown as SupabaseLike,
): AgentProfileDb {
  return {
    async listProfiles() {
      const { data, error } = await client
        .from("agent_profiles")
        .select(PROFILE_COLUMNS)
        .order("agent_type", { ascending: true })
        .limit(20);
      if (error) {
        throw new DashboardDataError(`Failed to load agent_profiles: ${error.message}`);
      }
      return asProfiles(data);
    },

    async getProfile(id) {
      const { data, error } = await client
        .from("agent_profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", id)
        .limit(1);
      if (error) {
        throw new DashboardDataError(`Failed to load agent_profiles: ${error.message}`);
      }
      return asProfiles(data)[0] ?? null;
    },

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

    async listTasks(agentType, status, limit) {
      const bounded = requireLimit(limit);
      const orderColumn = status === "completed" || status === "failed" || status === "cancelled"
        ? "completed_at"
        : status === "in_progress"
          ? "started_at"
          : "created_at";
      const { data, error } = await client
        .from("agent_tasks")
        .select(TASK_COLUMNS)
        .eq("agent_type", agentType)
        .eq("status", status)
        .order(orderColumn, { ascending: false, nullsFirst: false })
        .limit(bounded);
      if (error) {
        throw new DashboardDataError(`Failed to load agent_tasks: ${error.message}`);
      }
      return asTasks(data);
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
      return asTasks(data)[0] ?? null;
    },
  };
}
