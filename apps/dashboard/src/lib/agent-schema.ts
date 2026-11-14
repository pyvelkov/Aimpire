import { z } from "zod";
import { DashboardUpstreamError } from "./errors";

const departmentSchema = z.object({
  agent_type: z.string(),
  total: z.number(),
  pending: z.number(),
  running: z.number(),
  completed: z.number(),
  failed: z.number(),
  cancelled: z.number(),
});

const taskSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  agent_type: z.string(),
  status: z.string(),
  status_label: z.string(),
  priority: z.number().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  last_activity_at: z.string().nullable(),
  error_message: z.string().nullable(),
});

export const agentOperationsSchema = z.object({
  success: z.literal(true),
  overview: z.object({
    total: z.number(),
    pending: z.number(),
    running: z.number(),
    completed: z.number(),
    failed: z.number(),
    cancelled: z.number(),
    departments: z.array(departmentSchema),
  }),
  page: z.number(),
  page_size: z.number(),
  match_count: z.number(),
  tasks: z.array(taskSummarySchema),
});

export const taskDetailSchema = z.object({
  success: z.literal(true),
  task: taskSummarySchema.extend({
    input: z.unknown(),
    result: z.unknown(),
    runs: z.array(z.object({
      id: z.string(),
      agent_type: z.string().nullable(),
      task_id: z.string().nullable(),
      status: z.string(),
      status_label: z.string(),
      model_provider: z.string().nullable(),
      model_name: z.string().nullable(),
      tokens_used: z.number().nullable(),
      execution_time_ms: z.number().nullable(),
      error_message: z.string().nullable(),
      started_at: z.string().nullable(),
      completed_at: z.string().nullable(),
      input: z.unknown(),
      output: z.unknown(),
    })),
    activity: z.array(z.object({
      id: z.string(),
      agent_type: z.string().nullable(),
      action: z.string(),
      entity_type: z.string().nullable(),
      entity_id: z.string().nullable(),
      description: z.string(),
      created_at: z.string(),
    })),
  }),
});

export type AgentOperations = z.infer<typeof agentOperationsSchema>;
export type TaskDetail = z.infer<typeof taskDetailSchema>["task"];

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new DashboardUpstreamError("The agent service returned an unexpected response");
  }
  return parsed.data;
}

export function parseAgentOperations(payload: unknown): AgentOperations {
  return parse(agentOperationsSchema, payload);
}

export function parseTaskDetail(payload: unknown): TaskDetail {
  return parse(taskDetailSchema, payload).task;
}
