import type { FastifyInstance } from "fastify";
import type {
  ActivitySummary,
  AgentTaskSummary,
  DashboardOverview,
  ProductCandidateSummary,
  ProductDecisionSummary,
  ProfitabilitySummary,
} from "../services/dashboard-read.service.js";

export type DashboardReadApi = {
  overview(): Promise<DashboardOverview>;
  productCandidates(): Promise<ProductCandidateSummary[]>;
  productDecisions(): Promise<ProductDecisionSummary[]>;
  agentTasks(): Promise<AgentTaskSummary[]>;
  activity(): Promise<ActivitySummary[]>;
  profitabilityAnalyses(): Promise<ProfitabilitySummary[]>;
};

export function registerDashboardRoutes(
  app: FastifyInstance,
  service: DashboardReadApi,
): void {
  app.get("/dashboard/overview", async (request, reply) => {
    try {
      return {
        success: true,
        overview: await service.overview(),
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });

  app.get("/dashboard/product-candidates", async (request, reply) => {
    try {
      const candidates = await service.productCandidates();
      return {
        success: true,
        count: candidates.length,
        candidates,
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });

  app.get("/dashboard/product-decisions", async (request, reply) => {
    try {
      const decisions = await service.productDecisions();
      return {
        success: true,
        count: decisions.length,
        decisions,
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });

  app.get("/dashboard/agent-tasks", async (request, reply) => {
    try {
      const tasks = await service.agentTasks();
      return {
        success: true,
        count: tasks.length,
        tasks,
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });

  app.get("/dashboard/activity", async (request, reply) => {
    try {
      const activity = await service.activity();
      return {
        success: true,
        count: activity.length,
        activity,
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });

  app.get("/dashboard/profitability-analyses", async (request, reply) => {
    try {
      const analyses = await service.profitabilityAnalyses();
      return {
        success: true,
        count: analyses.length,
        analyses,
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
