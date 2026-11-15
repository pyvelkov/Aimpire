import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { readHeaderValue } from "../security/internal-auth.js";
import { ACTOR_ID_HEADER, resolveReviewer } from "../security/reviewer.js";
import {
  ApprovalWorkflowError,
  type ApprovalDetail,
  type ApprovalRequestView,
} from "../services/approval-workflow.service.js";

export type ApprovalWorkflowApi = {
  list(): Promise<ApprovalRequestView[]>;
  detail(id: string): Promise<ApprovalDetail>;
  create(decisionId: string, actorId: string, notes: string | null): Promise<ApprovalRequestView>;
  resolve(
    requestId: string,
    actorId: string,
    decision: "approved" | "rejected",
    notes: string | null,
  ): Promise<ApprovalDetail>;
};

const idSchema = z.object({ id: z.string().uuid() });
const notesSchema = z.string().trim().max(2000).optional();
const createSchema = z.object({
  decision_id: z.string().uuid(),
  notes: notesSchema,
});
const resolveSchema = z.object({
  notes: notesSchema,
});

function actorFromRequest(request: FastifyRequest) {
  return resolveReviewer(readHeaderValue(request.headers[ACTOR_ID_HEADER]));
}

function sendWorkflowError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof ApprovalWorkflowError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: error.code,
    });
  }
  return reply.status(500).send({
    success: false,
    error: "Failed to load dashboard data",
  });
}

export function registerApprovalRoutes(
  app: FastifyInstance,
  service: ApprovalWorkflowApi,
): void {
  app.get("/dashboard/approvals", async (request, reply) => {
    const actor = actorFromRequest(request);
    if (!actor.ok) {
      return reply.status(actor.status).send({ success: false, error: "Unauthorized" });
    }
    try {
      const approvals = await service.list();
      return { success: true, count: approvals.length, approvals };
    } catch (error) {
      request.log.error(error);
      return sendWorkflowError(reply, error);
    }
  });

  app.get("/dashboard/approvals/:id", async (request, reply) => {
    const actor = actorFromRequest(request);
    if (!actor.ok) {
      return reply.status(actor.status).send({ success: false, error: "Unauthorized" });
    }
    const params = idSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: "invalid_action" });
    }
    try {
      return { success: true, approval: await service.detail(params.data.id) };
    } catch (error) {
      request.log.error(error);
      return sendWorkflowError(reply, error);
    }
  });

  app.post("/dashboard/approvals", async (request, reply) => {
    const actor = actorFromRequest(request);
    if (!actor.ok) {
      return reply.status(actor.status).send({ success: false, error: "Unauthorized" });
    }
    const body = createSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ success: false, error: "invalid_action" });
    }
    try {
      const approval = await service.create(
        body.data.decision_id,
        actor.actorId,
        body.data.notes ?? null,
      );
      return reply.status(201).send({ success: true, approval });
    } catch (error) {
      request.log.error(error);
      return sendWorkflowError(reply, error);
    }
  });

  app.post("/dashboard/approvals/:id/approve", async (request, reply) => {
    return resolveRoute(request, reply, service, "approved");
  });

  app.post("/dashboard/approvals/:id/reject", async (request, reply) => {
    return resolveRoute(request, reply, service, "rejected");
  });
}

async function resolveRoute(
  request: FastifyRequest,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  service: ApprovalWorkflowApi,
  decision: "approved" | "rejected",
) {
  const actor = actorFromRequest(request);
  if (!actor.ok) {
    return reply.status(actor.status).send({ success: false, error: "Unauthorized" });
  }
  const params = idSchema.safeParse(request.params);
  const body = resolveSchema.safeParse(request.body ?? {});
  if (!params.success || !body.success) {
    return reply.status(400).send({ success: false, error: "invalid_action" });
  }
  try {
    const approval = await service.resolve(
      params.data.id,
      actor.actorId,
      decision,
      body.data.notes ?? null,
    );
    return { success: true, approval };
  } catch (error) {
    request.log.error(error);
    return sendWorkflowError(reply, error);
  }
}
