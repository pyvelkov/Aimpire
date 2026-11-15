import {
  AGENT_TYPES,
  lastActivityAt,
  type AgentTypeName,
  type TaskStatusName,
} from "./agent-operations.service.js";
import { DashboardDataError } from "./dashboard-read.service.js";

export type AiWorldTaskRow = {
  id: string;
  title: string;
  agent_type: string;
  status: string;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export interface AiWorldStateDb {
  countTasks(agentType: AgentTypeName, status: TaskStatusName): Promise<number>;
  latestBy(agentType: AgentTypeName, column: "created_at" | "started_at" | "completed_at"): Promise<AiWorldTaskRow | null>;
  currentRunningTask(agentType: AgentTypeName): Promise<AiWorldTaskRow | null>;
  countPendingProductReviews(): Promise<number>;
}

export type AiWorldTaskRef = {
  id: string;
  title: string;
};

export type AiWorldLatestTask = AiWorldTaskRef & {
  status: string;
  at: string;
};

export type AiWorldDepartmentState = {
  department_id: AgentTypeName;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  current_task: AiWorldTaskRef | null;
  latest_task: AiWorldLatestTask | null;
};

export type AiWorldSnapshot = {
  server_time: string;
  pending_product_reviews: number;
  departments: AiWorldDepartmentState[];
};

function requireCount(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DashboardDataError(`Failed to count ${label}`);
  }
  return value;
}

function taskTitle(value: string): string {
  const trimmed = value.trim();
  const title = trimmed || "Untitled task";
  return title.length > 160 ? `${title.slice(0, 159)}…` : title;
}

export function pickLatestTask(rows: Array<AiWorldTaskRow | null>): AiWorldTaskRow | null {
  let best: AiWorldTaskRow | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    if (!row?.id) {
      continue;
    }
    const at = lastActivityAt(row);
    const time = at ? Date.parse(at) : Number.NaN;
    if (Number.isNaN(time)) {
      continue;
    }
    if (!best || time > bestAt || (time === bestAt && row.id > best.id)) {
      best = row;
      bestAt = time;
    }
  }

  return best;
}

function toLatest(row: AiWorldTaskRow | null, departmentId: AgentTypeName): AiWorldLatestTask | null {
  if (!row || row.agent_type !== departmentId) {
    return null;
  }
  const at = lastActivityAt(row);
  if (!at || !row.id) {
    return null;
  }
  return {
    id: row.id,
    title: taskTitle(row.title),
    status: row.status,
    at,
  };
}

function toCurrent(row: AiWorldTaskRow | null, departmentId: AgentTypeName, running: number): AiWorldTaskRef | null {
  if (running < 1 || !row || row.agent_type !== departmentId || row.status !== "in_progress" || !row.id) {
    return null;
  }
  return { id: row.id, title: taskTitle(row.title) };
}

export class AiWorldStateService {
  constructor(
    private readonly db: AiWorldStateDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async snapshot(): Promise<AiWorldSnapshot> {
    const [pendingProductReviews, departments] = await Promise.all([
      this.db.countPendingProductReviews().then((count) => requireCount(count, "approval_requests")),
      Promise.all(AGENT_TYPES.map((departmentId) => this.department(departmentId))),
    ]);

    return {
      server_time: this.now().toISOString(),
      pending_product_reviews: pendingProductReviews,
      departments,
    };
  }

  private async department(departmentId: AgentTypeName): Promise<AiWorldDepartmentState> {
    const [queued, running, completed, failed, created, started, finished, current] = await Promise.all([
      this.db.countTasks(departmentId, "pending").then((count) => requireCount(count, "agent_tasks")),
      this.db.countTasks(departmentId, "in_progress").then((count) => requireCount(count, "agent_tasks")),
      this.db.countTasks(departmentId, "completed").then((count) => requireCount(count, "agent_tasks")),
      this.db.countTasks(departmentId, "failed").then((count) => requireCount(count, "agent_tasks")),
      this.db.latestBy(departmentId, "created_at"),
      this.db.latestBy(departmentId, "started_at"),
      this.db.latestBy(departmentId, "completed_at"),
      this.db.currentRunningTask(departmentId),
    ]);

    return {
      department_id: departmentId,
      queued,
      running,
      completed,
      failed,
      current_task: toCurrent(current, departmentId, running),
      latest_task: toLatest(pickLatestTask([created, started, finished]), departmentId),
    };
  }
}
