import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AGENT_TYPES,
  TASK_STATUSES,
  TaskNotFoundError,
  type AgentOverview,
  type TaskDetail,
  type TaskSummary,
} from "../services/agent-operations.service.js";

export type AgentOperationsApi = {
  overview(): Promise<AgentOverview>;
  tasks(query: {
    search: string;
    agentType: (typeof AGENT_TYPES)[number] | null;
    status: (typeof TASK_STATUSES)[number] | null;
    page: number;
    pageSize: number;
  }): Promise<{ match_count: number; tasks: TaskSummary[] }>;
  taskDetail(id: string): Promise<TaskDetail>;
};

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => value === "" || value == null ? undefined : value,
    z.enum(values).optional(),
  );

const listQuerySchema = z.object({
  search: z.string().max(80).optional().default(""),
  agent_type: optionalEnum(AGENT_TYPES),
  status: optionalEnum(TASK_STATUSES),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const idSchema = z.object({
  id: z.string().uuid(),
});

export function registerAgentOperationsRoutes(
  app: FastifyInstance,
  service: AgentOperationsApi,
): void {
  app.get("/dashboard/agents", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "Invalid task filters",
      });
    }

    try {
      const [overview, tasks] = await Promise.all([
        service.overview(),
        service.tasks({
          search: parsed.data.search,
          agentType: parsed.data.agent_type ?? null,
          status: parsed.data.status ?? null,
          page: parsed.data.page,
          pageSize: parsed.data.page_size,
        }),
      ]);
      return {
        success: true,
        overview,
        page: parsed.data.page,
        page_size: parsed.data.page_size,
        match_count: tasks.match_count,
        tasks: tasks.tasks,
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });

  app.get("/dashboard/agents/tasks/:id", async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: "Invalid task ID",
      });
    }

    try {
      return {
        success: true,
        task: await service.taskDetail(params.data.id),
      };
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        return reply.status(404).send({
          success: false,
          error: "Task not found",
        });
      }
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });
}
