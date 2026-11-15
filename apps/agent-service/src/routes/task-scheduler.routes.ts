import type { FastifyInstance } from "fastify";

export type SchedulerStatusApi = {
  status(): unknown;
};

export function registerSchedulerRoutes(
  app: FastifyInstance,
  scheduler: SchedulerStatusApi,
): void {
  app.get("/dashboard/scheduler", async (request, reply) => {
    try {
      return {
        success: true,
        scheduler: scheduler.status(),
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load scheduler status",
      });
    }
  });
}
