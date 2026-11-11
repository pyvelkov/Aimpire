import { z } from "zod";
import { supabase } from "../lib/supabase.js";

export const agentTypeSchema = z.enum([
  "research",
  "product",
  "marketing",
  "finance",
  "operations",
  "support",
]);

export const taskSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),

  agent_type: agentTypeSchema,

  priority: z.number().int().min(1).max(5),

  input: z.record(z.string(), z.unknown()),
});

export const taskListSchema = z.array(taskSchema).min(1).max(8);

export type CreateTaskInput = z.infer<typeof taskSchema>;
export type AgentType = z.infer<typeof agentTypeSchema>;

export const taskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
]);

export type TaskStatus = z.infer<typeof taskStatusSchema>;

export class TaskService {
  async createTasks(tasks: CreateTaskInput[]) {
    const { data, error } = await supabase
      .from("agent_tasks")
      .insert(
        tasks.map((task) => ({
          ...task,
          status: "pending",
        }))
      )
      .select();

    if (error) {
      throw new Error(`Failed to create tasks: ${error.message}`);
    }

    return data ?? [];
  }

  async getPendingTasks(
    agentType?: AgentType,
    limit = 10
  ) {
    let query = supabase
      .from("agent_tasks")
      .select("*")
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (agentType) {
      query = query.eq("agent_type", agentType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to retrieve tasks: ${error.message}`);
    }

    return data ?? [];
  }

  async claimNextTask(agentType?: AgentType) {
    const { data, error } = await supabase.rpc(
      "claim_next_agent_task",
      {
        p_agent_type: agentType ?? null,
      }
    );

    if (error) {
      throw new Error(
        `Failed to claim next task: ${error.message}`
      );
    }

    return data?.[0] ?? null;
  }

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    errorMessage?: string
  ) {
    const updates: Record<string, unknown> = {
      status,
    };

    if (status === "in_progress") {
      updates.started_at = new Date().toISOString();
    }

    if (status === "completed" || status === "failed") {
      updates.completed_at = new Date().toISOString();
    }

    if (status === "failed") {
      updates.error_message = errorMessage ?? "Unknown error";
    }

    if (status !== "failed" && errorMessage) {
      updates.error_message = errorMessage;
    }

    const { data, error } = await supabase
      .from("agent_tasks")
      .update(updates)
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update task: ${error.message}`);
    }

    return data;
  }
}

export const taskService = new TaskService();
