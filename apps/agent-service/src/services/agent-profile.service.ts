import {
  AGENT_TYPES,
  lastActivityAt,
  taskStatusLabel,
  type AgentTypeName,
  type TaskStatusName,
} from "./agent-operations.service.js";
import { DashboardDataError } from "./dashboard-read.service.js";
import {
  progressionFromCompletedCount,
  type AgentProgression,
} from "./agent-progression.js";

export const AGENT_PROFILE_HISTORY_DEFAULT = 8;
export const AGENT_PROFILE_HISTORY_MAX = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEPARTMENT_LABEL: Record<AgentTypeName, string> = {
  research: "Research",
  product: "Product",
  marketing: "Marketing",
  finance: "Finance",
  operations: "Operations",
  support: "Support",
};

export type AgentProfileRow = {
  id: string;
  agent_type: string;
  display_name: string;
  description: string;
  responsibilities: string;
  specialization: string;
  avatar_id: string;
  created_at: string | null;
  updated_at: string | null;
};

export type ProfileTaskRow = {
  id: string;
  title: string;
  agent_type: string;
  status: string;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

export interface AgentProfileDb {
  listProfiles(): Promise<AgentProfileRow[]>;
  getProfile(id: string): Promise<AgentProfileRow | null>;
  countTasks(agentType: AgentTypeName, status: TaskStatusName): Promise<number>;
  listTasks(agentType: AgentTypeName, status: TaskStatusName, limit: number): Promise<ProfileTaskRow[]>;
  currentRunningTask(agentType: AgentTypeName): Promise<ProfileTaskRow | null>;
}

export class ProfileNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super("Profile not found");
    this.name = "ProfileNotFoundError";
  }
}

export type ProfileTaskCounts = {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
  cancelled: number;
};

export type ProfileTaskView = {
  id: string;
  title: string;
  status: TaskStatusName;
  status_label: string;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  error_message: string | null;
};

/**
 * Identity for one department, plus task rows and progression derived from them.
 */
export type AgentProfileView = {
  id: string;
  agent_type: AgentTypeName;
  department: string;
  display_name: string;
  description: string;
  responsibilities: string;
  specialization: string;
  avatar_id: string;
  created_at: string;
  updated_at: string;
  task_counts: ProfileTaskCounts;
  progression: AgentProgression;
  current_task: ProfileTaskView | null;
  recent_tasks: ProfileTaskView[];
  completed_tasks: ProfileTaskView[];
  failed_tasks: ProfileTaskView[];
};

type NormalizedProfile = {
  id: string;
  agent_type: AgentTypeName;
  display_name: string;
  description: string;
  responsibilities: string;
  specialization: string;
  avatar_id: string;
  created_at: string;
  updated_at: string;
};

export function clampHistoryLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || value == null || value < 1) {
    return AGENT_PROFILE_HISTORY_DEFAULT;
  }
  return Math.min(value, AGENT_PROFILE_HISTORY_MAX);
}

function isAgentType(value: string): value is AgentTypeName {
  return (AGENT_TYPES as readonly string[]).includes(value);
}

function isTaskStatus(value: string): value is TaskStatusName {
  return value === "pending"
    || value === "in_progress"
    || value === "completed"
    || value === "failed"
    || value === "cancelled";
}

function requiredText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function timestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed && !Number.isNaN(Date.parse(trimmed)) ? trimmed : null;
}

function clip(value: string | null, max = 240): string | null {
  if (!value) {
    return null;
  }
  if (value.includes("sb_secret_")) {
    return "[redacted]";
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function taskTitle(value: string): string {
  const trimmed = value.trim();
  const title = trimmed || "Untitled task";
  return title.length > 160 ? `${title.slice(0, 159)}…` : title;
}

function requireCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DashboardDataError("Failed to count agent_tasks");
  }
  return value;
}

function readProfile(row: AgentProfileRow): { ok: true; profile: NormalizedProfile } | { ok: false; reason: "skip" | "invalid" } {
  if (!isAgentType(row.agent_type)) {
    return { ok: false, reason: "skip" };
  }

  const displayName = requiredText(row.display_name);
  const description = requiredText(row.description);
  const responsibilities = requiredText(row.responsibilities);
  const specialization = requiredText(row.specialization);
  const avatarId = requiredText(row.avatar_id);
  const createdAt = timestamp(row.created_at);
  const updatedAt = timestamp(row.updated_at);

  if (!UUID.test(row.id) || !displayName || !description || !responsibilities || !specialization || !avatarId || !createdAt || !updatedAt) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    profile: {
      id: row.id,
      agent_type: row.agent_type,
      display_name: displayName,
      description,
      responsibilities,
      specialization,
      avatar_id: avatarId,
      created_at: createdAt,
      updated_at: updatedAt,
    },
  };
}

function readTask(row: ProfileTaskRow, agentType: AgentTypeName): ProfileTaskView | null {
  if (row.agent_type !== agentType || !UUID.test(row.id) || !isTaskStatus(row.status)) {
    return null;
  }

  return {
    id: row.id,
    title: taskTitle(row.title),
    status: row.status,
    status_label: taskStatusLabel(row.status),
    created_at: timestamp(row.created_at),
    started_at: timestamp(row.started_at),
    completed_at: timestamp(row.completed_at),
    last_activity_at: lastActivityAt(row),
    error_message: clip(requiredText(row.error_message ?? "")),
  };
}

function byActivity(left: ProfileTaskView, right: ProfileTaskView): number {
  const leftTime = left.last_activity_at ? Date.parse(left.last_activity_at) : Number.NEGATIVE_INFINITY;
  const rightTime = right.last_activity_at ? Date.parse(right.last_activity_at) : Number.NEGATIVE_INFINITY;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return right.id > left.id ? 1 : right.id < left.id ? -1 : 0;
}

function bounded(tasks: ProfileTaskView[], limit: number, status?: TaskStatusName): ProfileTaskView[] {
  const seen = new Set<string>();
  const filtered: ProfileTaskView[] = [];

  for (const task of tasks) {
    if ((status && task.status !== status) || seen.has(task.id)) {
      continue;
    }
    seen.add(task.id);
    filtered.push(task);
  }

  return filtered.sort(byActivity).slice(0, limit);
}

export class AgentProfileService {
  constructor(private readonly db: AgentProfileDb) {}

  async list(historyLimit?: number): Promise<AgentProfileView[]> {
    const limit = clampHistoryLimit(historyLimit);
    const indexed = this.indexProfiles(await this.db.listProfiles());
    const views: AgentProfileView[] = [];

    for (const agentType of AGENT_TYPES) {
      const profile = indexed.get(agentType);
      if (!profile) {
        continue;
      }
      views.push(await this.assemble(profile, limit));
    }

    return views;
  }

  async get(id: string, historyLimit?: number): Promise<AgentProfileView> {
    const row = await this.db.getProfile(id);
    if (!row || row.id.toLowerCase() !== id.toLowerCase()) {
      throw new ProfileNotFoundError();
    }

    const read = readProfile(row);
    if (!read.ok) {
      if (read.reason === "skip") {
        throw new ProfileNotFoundError();
      }
      throw new DashboardDataError("Failed to load agent_profiles");
    }

    return this.assemble(read.profile, clampHistoryLimit(historyLimit));
  }

  private indexProfiles(rows: AgentProfileRow[]): Map<AgentTypeName, NormalizedProfile> {
    const indexed = new Map<AgentTypeName, NormalizedProfile>();

    for (const row of rows) {
      const read = readProfile(row);
      if (!read.ok) {
        if (read.reason === "invalid") {
          throw new DashboardDataError("Failed to load agent_profiles");
        }
        continue;
      }
      if (indexed.has(read.profile.agent_type)) {
        throw new DashboardDataError("Failed to load agent_profiles");
      }
      indexed.set(read.profile.agent_type, read.profile);
    }

    return indexed;
  }

  private async assemble(profile: NormalizedProfile, limit: number): Promise<AgentProfileView> {
    const agentType = profile.agent_type;
    const [pending, running, completed, failed, cancelled, current, pendingRows, runningRows, completedRows, failedRows, cancelledRows] = await Promise.all([
      this.db.countTasks(agentType, "pending").then(requireCount),
      this.db.countTasks(agentType, "in_progress").then(requireCount),
      this.db.countTasks(agentType, "completed").then(requireCount),
      this.db.countTasks(agentType, "failed").then(requireCount),
      this.db.countTasks(agentType, "cancelled").then(requireCount),
      this.db.currentRunningTask(agentType),
      this.db.listTasks(agentType, "pending", limit),
      this.db.listTasks(agentType, "in_progress", limit),
      this.db.listTasks(agentType, "completed", limit),
      this.db.listTasks(agentType, "failed", limit),
      this.db.listTasks(agentType, "cancelled", limit),
    ]);

    const mapRows = (rows: ProfileTaskRow[]) => rows
      .map((row) => readTask(row, agentType))
      .filter((task): task is ProfileTaskView => task != null);

    const completedTasks = bounded(mapRows(completedRows), limit, "completed");
    const failedTasks = bounded(mapRows(failedRows), limit, "failed");
    const recent = bounded([
      ...mapRows(pendingRows),
      ...mapRows(runningRows),
      ...completedTasks,
      ...failedTasks,
      ...mapRows(cancelledRows),
    ], limit);
    const currentTask = running > 0 && current ? readTask(current, agentType) : null;

    return {
      id: profile.id,
      agent_type: agentType,
      department: DEPARTMENT_LABEL[agentType],
      display_name: profile.display_name,
      description: profile.description,
      responsibilities: profile.responsibilities,
      specialization: profile.specialization,
      avatar_id: profile.avatar_id,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      task_counts: {
        total: pending + running + completed + failed + cancelled,
        pending,
        in_progress: running,
        completed,
        failed,
        cancelled,
      },
      progression: progressionFromCompletedCount(completed),
      current_task: currentTask && currentTask.status === "in_progress" ? currentTask : null,
      recent_tasks: recent,
      completed_tasks: completedTasks,
      failed_tasks: failedTasks,
    };
  }
}
