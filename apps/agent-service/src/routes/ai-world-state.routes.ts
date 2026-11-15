import type { FastifyInstance } from "fastify";
import type { AiWorldSnapshot } from "../services/ai-world-state.service.js";

export type AiWorldStateApi = {
  snapshot(): Promise<AiWorldSnapshot>;
};

export function registerAiWorldStateRoutes(
  app: FastifyInstance,
  service: AiWorldStateApi,
): void {
  app.get("/dashboard/ai-world/state", async (request, reply) => {
    try {
      return {
        success: true,
        snapshot: await service.snapshot(),
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });
}
