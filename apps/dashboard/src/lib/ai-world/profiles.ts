import { z } from "zod";
import { departmentById } from "./departments";
import { DEPARTMENT_IDS, type DepartmentId } from "./types";

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const nullableTimestamp = timestamp.nullable();

const taskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]),
  status_label: z.string().min(1),
  created_at: nullableTimestamp,
  started_at: nullableTimestamp,
  completed_at: nullableTimestamp,
  last_activity_at: nullableTimestamp,
  error_message: z.string().nullable(),
}).strict();

const profileSchema = z.object({
  id: z.string().uuid(),
  agent_type: z.enum(DEPARTMENT_IDS),
  department: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string().min(1),
  responsibilities: z.string().min(1),
  specialization: z.string().min(1),
  avatar_id: z.string().min(1),
  created_at: timestamp,
  updated_at: timestamp,
  task_counts: z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    in_progress: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
  }).strict(),
  current_task: taskSchema.nullable(),
  recent_tasks: z.array(taskSchema).max(20),
  completed_tasks: z.array(taskSchema).max(20),
  failed_tasks: z.array(taskSchema).max(20),
}).strict().superRefine((profile, context) => {
  if (profile.department !== departmentById(profile.agent_type).label) {
    context.addIssue({ code: "custom", message: "Department label does not match the office" });
  }

  const counts = profile.task_counts;
  const sum = counts.pending + counts.in_progress + counts.completed + counts.failed + counts.cancelled;
  if (counts.total !== sum) {
    context.addIssue({ code: "custom", message: "Task total does not match the status counts" });
  }

  if (profile.current_task && profile.current_task.status !== "in_progress") {
    context.addIssue({ code: "custom", message: "The current task is not in progress" });
  }

  if (profile.completed_tasks.some((task) => task.status !== "completed")) {
    context.addIssue({ code: "custom", message: "Completed history contains another status" });
  }

  if (profile.failed_tasks.some((task) => task.status !== "failed")) {
    context.addIssue({ code: "custom", message: "Failed history contains another status" });
  }
});

const storedListSchema = z.object({
  success: z.literal(true),
  profiles: z.array(profileSchema).max(DEPARTMENT_IDS.length),
}).strip().superRefine((payload, context) => {
  const ids = payload.profiles.map((profile) => profile.agent_type);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Duplicate department profile" });
  }
});

const clientListSchema = z.object({
  profiles: z.array(profileSchema).max(DEPARTMENT_IDS.length),
}).strip().superRefine((payload, context) => {
  const ids = payload.profiles.map((profile) => profile.agent_type);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Duplicate department profile" });
  }
});

const storedProfileSchema = z.object({
  success: z.literal(true),
  profile: profileSchema,
}).strip();

const clientProfileSchema = z.object({
  profile: profileSchema,
}).strip();

export type AgentProfileTask = z.infer<typeof taskSchema>;
export type AgentProfile = z.infer<typeof profileSchema>;
export type AgentProfileAvailability = "loading" | "ready" | "missing" | "unavailable";

const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAgentProfileId(value: string): boolean {
  return PROFILE_ID.test(value);
}

export function parseStoredAgentProfileList(payload: unknown): AgentProfile[] | null {
  const parsed = storedListSchema.safeParse(payload);
  return parsed.success ? parsed.data.profiles : null;
}

export function parseAgentProfileList(payload: unknown): AgentProfile[] | null {
  const parsed = clientListSchema.safeParse(payload);
  return parsed.success ? parsed.data.profiles : null;
}

export function parseStoredAgentProfile(payload: unknown): AgentProfile | null {
  const parsed = storedProfileSchema.safeParse(payload);
  return parsed.success ? parsed.data.profile : null;
}

export function parseAgentProfile(payload: unknown): AgentProfile | null {
  const parsed = clientProfileSchema.safeParse(payload);
  return parsed.success ? parsed.data.profile : null;
}

export function profileForDepartment(
  profiles: readonly AgentProfile[],
  departmentId: DepartmentId,
): AgentProfile | null {
  return profiles.find((profile) => profile.agent_type === departmentId) ?? null;
}

export function agentProfileHistoryQuery(requestUrl: string): Record<string, string | undefined> {
  const raw = new URL(requestUrl, "http://127.0.0.1").searchParams.get("history_limit");
  if (!raw || !/^\d{1,2}$/.test(raw)) {
    return {};
  }
  const value = Number(raw);
  if (value < 1 || value > 20) {
    return {};
  }
  return { history_limit: String(value) };
}

export async function loadAgentProfiles(fetchImpl: typeof fetch = fetch): Promise<AgentProfile[]> {
  const response = await fetchImpl("/api/dashboard/agent-profiles", {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  const profiles = response.ok ? parseAgentProfileList(payload) : null;
  if (!profiles) {
    throw new Error("Agent profiles are unavailable");
  }
  return profiles;
}

export async function loadAgentProfile(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentProfile | null> {
  if (!isAgentProfileId(id)) {
    return null;
  }

  const response = await fetchImpl(`/api/dashboard/agent-profiles/${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (response.status === 404) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  const profile = response.ok ? parseAgentProfile(payload) : null;
  if (!profile || profile.id !== id) {
    throw new Error("Agent profile is unavailable");
  }
  return profile;
}
