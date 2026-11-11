import { agentRegistry } from "../agents/agent.registry.js";
import { taskService } from "./task.service.js";
import type { AgentType } from "./task.service.js";
import type { AgentTask } from "../agents/types.js";

export class AgentExecutionService {
  async executeNext(agentType: AgentType) {
    // Never claim a task without an available agent.
    if (!agentRegistry.has(agentType)) {
      throw new Error(
        `Department agent is not available: ${agentType}`
      );
    }

    const task = await taskService.claimNextTask(agentType);

    if (!task) {
      return {
        executed: false,
        message: "No pending tasks available",
      };
    }

    try {
      const agent = agentRegistry.get(agentType);

      const result = await agent.execute(task as AgentTask);

      // Persist the result before marking it completed.
      // A task should not be completed if its result
      // could not be saved.
      const { supabase } = await import("../lib/supabase.js");

      const { error } = await supabase
        .from("agent_tasks")
        .update({
          result,
          status: "completed",
          completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", task.id)
        .eq("status", "in_progress");

      if (error) {
        throw new Error(
          `Failed to save task result: ${error.message}`
        );
      }

      return {
        executed: true,
        task_id: task.id,
        agent: agentType,
        status: "completed",
        result,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown execution error";

      await taskService.updateTaskStatus(
        task.id,
        "failed",
        message
      );

      throw error;
    }
  }
}

export const agentExecutionService =
  new AgentExecutionService();
