import { z } from "zod";
import { DashboardUpstreamError } from "./errors";

const scopeSchema = z.object({
  authorizes: z.string(),
  does_not_authorize: z.array(z.string()),
});

const requestSchema = z.object({
  id: z.string(),
  candidate_id: z.string(),
  source_decision_id: z.string(),
  requested_action: z.literal("product_review"),
  status: z.string(),
  evidence_snapshot: z.record(z.string(), z.unknown()).optional().default({}),
  decision_summary: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
  requested_by: z.string(),
  reviewer_id: z.string().nullable(),
  reviewer_notes: z.string().nullable(),
  scope: scopeSchema,
});

export const approvalListSchema = z.object({
  success: z.literal(true),
  count: z.number(),
  approvals: z.array(requestSchema.omit({ evidence_snapshot: true })),
});

export const approvalDetailSchema = z.object({
  success: z.literal(true),
  approval: requestSchema.extend({
    events: z.array(z.object({
      id: z.string(),
      approval_request_id: z.string(),
      event_type: z.string(),
      actor_id: z.string(),
      previous_status: z.string().nullable(),
      new_status: z.string().nullable(),
      notes: z.string().nullable(),
      created_at: z.string(),
    })),
  }),
});

export type ApprovalRequest = z.infer<typeof requestSchema>;
export type ApprovalDetail = z.infer<typeof approvalDetailSchema>["approval"];

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new DashboardUpstreamError("The agent service returned an unexpected response");
  }
  return parsed.data;
}

export function parseApprovalList(payload: unknown): ApprovalRequest[] {
  return parse(approvalListSchema, payload).approvals as ApprovalRequest[];
}

export function parseApprovalDetail(payload: unknown): ApprovalDetail {
  return parse(approvalDetailSchema, payload).approval;
}
