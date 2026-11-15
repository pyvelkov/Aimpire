import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { readHeaderValue } from "../security/internal-auth.js";
import { ACTOR_ID_HEADER, resolveReviewer } from "../security/reviewer.js";
import {
  AGENT_PROFILE_HISTORY_DEFAULT,
  AGENT_PROFILE_HISTORY_MAX,
  ProfileNotFoundError,
  type AgentProfileView,
} from "../services/agent-profile.service.js";

export type AgentProfileApi = {
  list(historyLimit: number): Promise<AgentProfileView[]>;
  get(id: string, historyLimit: number): Promise<AgentProfileView>;
};

const historyQuerySchema = z.object({
  history_limit: z.coerce.number().int().min(1).max(AGENT_PROFILE_HISTORY_MAX).optional().default(AGENT_PROFILE_HISTORY_DEFAULT),
});

const idSchema = z.object({
  id: z.string().uuid(),
});

function requireOwner(request: FastifyRequest, reply: FastifyReply): boolean {
  const actor = resolveReviewer(readHeaderValue(request.headers[ACTOR_ID_HEADER]));
  if (!actor.ok) {
    reply.status(actor.status).send({ success: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerAgentProfileRoutes(
  app: FastifyInstance,
  service: AgentProfileApi,
): void {
  app.get("/dashboard/agent-profiles", async (request, reply) => {
    if (!requireOwner(request, reply)) {
      return;
    }

    const parsed = historyQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "Invalid profile request",
      });
    }

    try {
      return {
        success: true,
        profiles: await service.list(parsed.data.history_limit),
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });

  app.get("/dashboard/agent-profiles/:id", async (request, reply) => {
    if (!requireOwner(request, reply)) {
      return;
    }

    const params = idSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: "Invalid profile ID",
      });
    }

    const parsed = historyQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "Invalid profile request",
      });
    }

    try {
      return {
        success: true,
        profile: await service.get(params.data.id, parsed.data.history_limit),
      };
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return reply.status(404).send({
          success: false,
          error: "Profile not found",
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
