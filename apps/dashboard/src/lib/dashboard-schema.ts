import { z } from "zod";
import { DashboardUpstreamError } from "./errors";

const approvalLabel = z.enum(["Approved", "Not approved"]);

export const overviewSchema = z.object({
  success: z.literal(true),
  overview: z.object({
    product_candidates: z.object({
      count: z.number(),
    }),
    decision_score: z.object({
      latest: z.number().nullable(),
      scale: z.literal(100),
    }),
    approvals: z.object({
      approved_count: z.number(),
      not_approved_count: z.number(),
      ready_for_review_count: z.number(),
    }),
    agent_tasks: z.object({
      total: z.number(),
      by_status: z.object({
        pending: z.number(),
        in_progress: z.number(),
        completed: z.number(),
        failed: z.number(),
        cancelled: z.number(),
      }),
    }),
  }),
});

export const candidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  status: z.string(),
  target_market: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});

export const candidatesSchema = z.object({
  success: z.literal(true),
  count: z.number(),
  candidates: z.array(candidateSchema),
});

export const decisionSchema = z.object({
  id: z.string(),
  candidate_id: z.string(),
  product_name: z.string(),
  target_market: z.array(z.string()),
  candidate_status: z.string().nullable(),
  recommendation: z.string(),
  recommendation_label: z.string(),
  decision_status: z.string(),
  approval_status: z.string(),
  approval_label: approvalLabel,
  approved: z.boolean(),
  decision_score: z.number().nullable(),
  reasons: z.array(z.string()),
  risks: z.array(z.string()),
  next_actions: z.array(z.string()),
  created_at: z.string(),
});

export const decisionsSchema = z.object({
  success: z.literal(true),
  count: z.number(),
  decisions: z.array(decisionSchema),
});

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  agent_type: z.string(),
  status: z.string(),
  priority: z.number().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  error_message: z.string().nullable(),
});

export const tasksSchema = z.object({
  success: z.literal(true),
  count: z.number(),
  tasks: z.array(taskSchema),
});

export const activitySchema = z.object({
  success: z.literal(true),
  count: z.number(),
  activity: z.array(z.object({
    id: z.string(),
    agent_type: z.string().nullable(),
    action: z.string(),
    entity_type: z.string().nullable(),
    entity_id: z.string().nullable(),
    description: z.string(),
    created_at: z.string(),
  })),
});

export const analysesSchema = z.object({
  success: z.literal(true),
  count: z.number(),
  analyses: z.array(z.object({
    id: z.string(),
    market: z.string(),
    currency: z.string(),
    analysis_status: z.string(),
    approval_status: z.string(),
    approval_label: approvalLabel,
    approved: z.boolean(),
    sku: z.string().nullable(),
    product_title: z.string().nullable(),
    product_name: z.string().nullable(),
    selling_price: z.number().nullable(),
    contribution_margin_percent: z.number().nullable(),
    contribution_profit_before_ads: z.number().nullable(),
    contribution_profit_after_ads: z.number().nullable(),
    created_at: z.string(),
  })),
});

export type OverviewData = z.infer<typeof overviewSchema>["overview"];
export type CandidateRow = z.infer<typeof candidateSchema>;
export type DecisionRow = z.infer<typeof decisionSchema>;
export type TaskRow = z.infer<typeof taskSchema>;
export type ActivityRow = z.infer<typeof activitySchema>["activity"][number];
export type AnalysisRow = z.infer<typeof analysesSchema>["analyses"][number];

export type DashboardPageData = {
  overview: OverviewData;
  candidates: CandidateRow[];
  decisions: DecisionRow[];
  tasks: TaskRow[];
  activity: ActivityRow[];
  analyses: AnalysisRow[];
};

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new DashboardUpstreamError("The agent service returned an unexpected response");
  }

  return parsed.data;
}

export function parseDashboardPayloads(payloads: {
  overview: unknown;
  candidates: unknown;
  decisions: unknown;
  tasks: unknown;
  activity: unknown;
  analyses: unknown;
}): DashboardPageData {
  return {
    overview: parse(overviewSchema, payloads.overview).overview,
    candidates: parse(candidatesSchema, payloads.candidates).candidates,
    decisions: parse(decisionsSchema, payloads.decisions).decisions,
    tasks: parse(tasksSchema, payloads.tasks).tasks,
    activity: parse(activitySchema, payloads.activity).activity,
    analyses: parse(analysesSchema, payloads.analyses).analyses,
  };
}
