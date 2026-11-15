import { z } from "zod";
import { DEPARTMENT_IDS } from "./types";

const taskRefSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
}).strict();

const latestTaskSchema = taskRefSchema.extend({
  status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]),
  at: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
}).strict();

const departmentSchema = z.object({
  department_id: z.enum(DEPARTMENT_IDS),
  queued: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  current_task: taskRefSchema.nullable(),
  latest_task: latestTaskSchema.nullable(),
}).strict();

const snapshotSchema = z.object({
  server_time: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  pending_product_reviews: z.number().int().nonnegative(),
  departments: z.array(departmentSchema).length(DEPARTMENT_IDS.length),
}).strict().superRefine((snapshot, context) => {
  const ids = snapshot.departments.map((department) => department.department_id).join(",");
  if (ids !== DEPARTMENT_IDS.join(",")) {
    context.addIssue({ code: "custom", message: "Department order does not match the office" });
  }
});

const responseSchema = z.object({
  success: z.literal(true),
  snapshot: snapshotSchema,
}).strip();

const clientSchema = z.object({
  snapshot: snapshotSchema,
}).strip();

export type AiWorldTaskRef = z.infer<typeof taskRefSchema>;
export type AiWorldLatestTask = z.infer<typeof latestTaskSchema>;
export type AiWorldDepartmentState = z.infer<typeof departmentSchema>;
export type AiWorldSnapshot = z.infer<typeof snapshotSchema>;

export type AiWorldConnection =
  | { kind: "loading" }
  | { kind: "live"; snapshot: AiWorldSnapshot; confirmedAt: string }
  | { kind: "stale"; snapshot: AiWorldSnapshot; confirmedAt: string }
  | { kind: "unavailable" };

export type AiWorldPollEvent =
  | { type: "success"; snapshot: AiWorldSnapshot }
  | { type: "failure" };

export function readAiWorldSnapshot(payload: unknown): AiWorldSnapshot | null {
  const parsed = responseSchema.safeParse(payload);
  return parsed.success ? parsed.data.snapshot : null;
}

export function readClientSnapshot(payload: unknown): AiWorldSnapshot | null {
  const parsed = clientSchema.safeParse(payload);
  return parsed.success ? parsed.data.snapshot : null;
}

export function reduceConnection(current: AiWorldConnection, event: AiWorldPollEvent): AiWorldConnection {
  if (event.type === "success") {
    return {
      kind: "live",
      snapshot: event.snapshot,
      confirmedAt: event.snapshot.server_time,
    };
  }

  if (current.kind === "live" || current.kind === "stale") {
    return {
      kind: "stale",
      snapshot: current.snapshot,
      confirmedAt: current.confirmedAt,
    };
  }

  return { kind: "unavailable" };
}

export function snapshotOf(connection: AiWorldConnection): AiWorldSnapshot | null {
  return connection.kind === "live" || connection.kind === "stale" ? connection.snapshot : null;
}
