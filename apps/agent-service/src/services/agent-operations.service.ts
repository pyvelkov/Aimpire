export const AGENT_TYPES = [
  "research",
  "product",
  "marketing",
  "finance",
  "operations",
  "support",
] as const;

export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
] as const;

export type AgentTypeName = (typeof AGENT_TYPES)[number];
export type TaskStatusName = (typeof TASK_STATUSES)[number];

const SENSITIVE_KEY = /secret|password|token|api[_-]?key|service[_-]?role|authorization/i;

export type TaskListQuery = {
  search: string;
  agentType: AgentTypeName | null;
  status: TaskStatusName | null;
  page: number;
  pageSize: number;
};

export type TaskRow = Record<string, unknown>;

export interface AgentOperationsDb {
  countTasks(filters?: {
    status?: TaskStatusName;
    agentType?: AgentTypeName;
  }): Promise<number>;
  listTasks(query: TaskListQuery): Promise<{ total: number; rows: TaskRow[] }>;
  getTask(id: string): Promise<TaskRow | null>;
  listRuns(taskId: string): Promise<TaskRow[]>;
  listActivity(taskId: string): Promise<TaskRow[]>;
}

export class TaskNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super("Task not found");
    this.name = "TaskNotFoundError";
  }
}

export type DepartmentCount = {
  agent_type: AgentTypeName;
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
};

export type AgentOverview = {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  departments: DepartmentCount[];
};

export type TaskSummary = {
  id: string;
  title: string;
  description: string;
  agent_type: string;
  status: string;
  status_label: string;
  priority: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  error_message: string | null;
};

export type AgentRunView = {
  id: string;
  agent_type: string | null;
  task_id: string | null;
  status: string;
  status_label: string;
  model_provider: string | null;
  model_name: string | null;
  tokens_used: number | null;
  execution_time_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  input: unknown;
  output: unknown;
};

export type TaskActivityView = {
  id: string;
  agent_type: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  created_at: string;
};

export type TaskDetail = TaskSummary & {
  input: unknown;
  result: unknown;
  runs: AgentRunView[];
  activity: TaskActivityView[];
};

export function taskStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Queued";
    case "in_progress":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status.replaceAll("_", " ");
  }
}

export function sanitizeTaskSearch(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function taskPageRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10;
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

export function sanitizePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item));
  }
  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        continue;
      }
      cleaned[key] = sanitizePayload(child);
    }
    return cleaned;
  }
  if (typeof value === "string" && value.includes("sb_secret_")) {
    return "[redacted]";
  }
  return value;
}

function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clip(value: string | null, max = 2000): string | null {
  if (!value || value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function lastActivityAt(row: {
  created_at?: unknown;
  started_at?: unknown;
  completed_at?: unknown;
}): string | null {
  const stamps = [row.completed_at, row.started_at, row.created_at]
    .map((value) => nullableText(value))
    .filter((value): value is string => value != null && !Number.isNaN(Date.parse(value)));
  if (stamps.length === 0) {
    return null;
  }
  return stamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function toSummary(row: TaskRow, errorLimit = 240): TaskSummary {
  const status = text(row.status);
  return {
    id: text(row.id),
    title: text(row.title, "Untitled task"),
    description: text(row.description),
    agent_type: text(row.agent_type),
    status,
    status_label: taskStatusLabel(status),
    priority: toNumber(row.priority),
    created_at: text(row.created_at),
    started_at: nullableText(row.started_at),
    completed_at: nullableText(row.completed_at),
    last_activity_at: lastActivityAt(row),
    error_message: clip(nullableText(row.error_message), errorLimit),
  };
}

export class AgentOperationsService {
  constructor(private readonly db: AgentOperationsDb) {}

  async overview(): Promise<AgentOverview> {
    const [total, pending, running, completed, failed, cancelled, departments] = await Promise.all([
      this.db.countTasks(),
      this.db.countTasks({ status: "pending" }),
      this.db.countTasks({ status: "in_progress" }),
      this.db.countTasks({ status: "completed" }),
      this.db.countTasks({ status: "failed" }),
      this.db.countTasks({ status: "cancelled" }),
      Promise.all(AGENT_TYPES.map(async (agentType) => {
        const [departmentTotal, departmentPending, departmentRunning, departmentCompleted, departmentFailed, departmentCancelled] = await Promise.all([
          this.db.countTasks({ agentType }),
          this.db.countTasks({ agentType, status: "pending" }),
          this.db.countTasks({ agentType, status: "in_progress" }),
          this.db.countTasks({ agentType, status: "completed" }),
          this.db.countTasks({ agentType, status: "failed" }),
          this.db.countTasks({ agentType, status: "cancelled" }),
        ]);
        return {
          agent_type: agentType,
          total: departmentTotal,
          pending: departmentPending,
          running: departmentRunning,
          completed: departmentCompleted,
          failed: departmentFailed,
          cancelled: departmentCancelled,
        };
      })),
    ]);

    return {
      total,
      pending,
      running,
      completed,
      failed,
      cancelled,
      departments: departments.filter((department) => department.total > 0),
    };
  }

  async tasks(query: TaskListQuery): Promise<{ match_count: number; tasks: TaskSummary[] }> {
    const result = await this.db.listTasks({
      ...query,
      search: sanitizeTaskSearch(query.search),
    });
    return {
      match_count: result.total,
      tasks: result.rows.map((row) => toSummary(row)),
    };
  }

  async taskDetail(id: string): Promise<TaskDetail> {
    const row = await this.db.getTask(id);
    if (!row || text(row.id) !== id) {
      throw new TaskNotFoundError();
    }
    const [runs, activity] = await Promise.all([
      this.db.listRuns(id),
      this.db.listActivity(id),
    ]);
    return {
      ...toSummary(row, 2000),
      input: sanitizePayload(row.input ?? null),
      result: sanitizePayload(row.result ?? null),
      runs: runs.map((run) => {
        const status = text(run.status);
        return {
          id: text(run.id),
          agent_type: nullableText(run.agent_type),
          task_id: nullableText(run.task_id),
          status,
          status_label: taskStatusLabel(status),
          model_provider: nullableText(run.model_provider),
          model_name: nullableText(run.model_name),
          tokens_used: toNumber(run.tokens_used),
          execution_time_ms: toNumber(run.execution_time_ms),
          error_message: clip(nullableText(run.error_message)),
          started_at: nullableText(run.started_at),
          completed_at: nullableText(run.completed_at),
          input: sanitizePayload(run.input ?? null),
          output: sanitizePayload(run.output ?? null),
        };
      }),
      activity: activity.map((entry) => ({
        id: text(entry.id),
        agent_type: nullableText(entry.agent_type),
        action: text(entry.action),
        entity_type: nullableText(entry.entity_type),
        entity_id: nullableText(entry.entity_id),
        description: text(entry.description),
        created_at: text(entry.created_at),
      })),
    };
  }
}
