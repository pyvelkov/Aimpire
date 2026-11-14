export type Row = Record<string, unknown>;

export type Filter = {
  column: string;
  value: string;
};

export type ListRequest = {
  table: string;
  columns: string;
  limit: number;
  orderBy?: string;
  ascending?: boolean;
  filters?: Filter[];
  in?: {
    column: string;
    values: string[];
  };
};

export interface DashboardReader {
  list(input: ListRequest): Promise<Row[]>;
  count(table: string, filters?: Filter[]): Promise<number>;
}

export class DashboardDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardDataError";
  }
}

const TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
] as const;

export function recommendationLabel(value: string): string {
  switch (value) {
    case "investigate_further":
      return "Investigate";
    case "hold":
      return "Hold";
    case "ready_for_review":
      return "Ready for review";
    default:
      return value.replaceAll("_", " ");
  }
}

export function isApproved(status: string): boolean {
  return status === "approved";
}

export function approvalLabel(status: string): "Approved" | "Not approved" {
  return isApproved(status) ? "Approved" : "Not approved";
}

function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function marketList(value: unknown): string[] {
  return stringArray(value);
}

function approvalFields(status: unknown) {
  const approvalStatus = text(status, "not_approved");
  return {
    approval_status: approvalStatus,
    approval_label: approvalLabel(approvalStatus),
    approved: isApproved(approvalStatus),
  };
}

export type ProductCandidateSummary = {
  id: string;
  name: string;
  category: string | null;
  status: string;
  target_market: string[];
  created_at: string;
  updated_at: string | null;
};

export type ProductDecisionSummary = {
  id: string;
  candidate_id: string;
  product_name: string;
  target_market: string[];
  candidate_status: string | null;
  recommendation: string;
  recommendation_label: string;
  decision_status: string;
  approval_status: string;
  approval_label: "Approved" | "Not approved";
  approved: boolean;
  decision_score: number | null;
  reasons: string[];
  risks: string[];
  next_actions: string[];
  created_at: string;
};

export type AgentTaskSummary = {
  id: string;
  title: string;
  agent_type: string;
  status: string;
  priority: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

export type ActivitySummary = {
  id: string;
  agent_type: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  created_at: string;
};

export type ProfitabilitySummary = {
  id: string;
  market: string;
  currency: string;
  analysis_status: string;
  approval_status: string;
  approval_label: "Approved" | "Not approved";
  approved: boolean;
  sku: string | null;
  product_title: string | null;
  product_name: string | null;
  selling_price: number | null;
  contribution_margin_percent: number | null;
  contribution_profit_before_ads: number | null;
  contribution_profit_after_ads: number | null;
  created_at: string;
};

export type DashboardOverview = {
  product_candidates: {
    count: number;
  };
  decision_score: {
    latest: number | null;
    scale: 100;
  };
  approvals: {
    approved_count: number;
    not_approved_count: number;
    ready_for_review_count: number;
  };
  agent_tasks: {
    total: number;
    by_status: Record<(typeof TASK_STATUSES)[number], number>;
  };
};

const LIST_LIMIT = 100;

export class DashboardReadService {
  constructor(private readonly reader: DashboardReader) {}

  async overview(): Promise<DashboardOverview> {
    const [
      candidateCount,
      approvedCount,
      decisionCount,
      readyForReviewCount,
      taskTotal,
      latestDecisions,
      taskCounts,
    ] = await Promise.all([
      this.reader.count("product_candidates"),
      this.reader.count("product_decisions", [
        { column: "approval_status", value: "approved" },
      ]),
      this.reader.count("product_decisions"),
      this.reader.count("product_decisions", [
        { column: "recommendation", value: "ready_for_review" },
      ]),
      this.reader.count("agent_tasks"),
      this.reader.list({
        table: "product_decisions",
        columns: "decision_score, created_at",
        limit: 1,
        orderBy: "created_at",
      }),
      Promise.all(
        TASK_STATUSES.map(async (status) => [
          status,
          await this.reader.count("agent_tasks", [
            { column: "status", value: status },
          ]),
        ] as const),
      ),
    ]);

    return {
      product_candidates: {
        count: candidateCount,
      },
      decision_score: {
        latest: toNumber(latestDecisions[0]?.decision_score),
        scale: 100,
      },
      approvals: {
        approved_count: approvedCount,
        not_approved_count: Math.max(0, decisionCount - approvedCount),
        ready_for_review_count: readyForReviewCount,
      },
      agent_tasks: {
        total: taskTotal,
        by_status: Object.fromEntries(taskCounts) as DashboardOverview["agent_tasks"]["by_status"],
      },
    };
  }

  async productCandidates(): Promise<ProductCandidateSummary[]> {
    const rows = await this.reader.list({
      table: "product_candidates",
      columns: "id, name, category, status, target_market, created_at, updated_at",
      limit: LIST_LIMIT,
      orderBy: "created_at",
    });

    return rows.map((row) => ({
      id: text(row.id),
      name: text(row.name, "Untitled product"),
      category: row.category == null ? null : text(row.category),
      status: text(row.status, "discovered"),
      target_market: marketList(row.target_market),
      created_at: text(row.created_at),
      updated_at: row.updated_at == null ? null : text(row.updated_at),
    }));
  }

  async productDecisions(): Promise<ProductDecisionSummary[]> {
    const decisions = await this.reader.list({
      table: "product_decisions",
      columns: [
        "id",
        "candidate_id",
        "recommendation",
        "decision_status",
        "approval_status",
        "decision_score",
        "reasons",
        "risks",
        "next_actions",
        "created_at",
      ].join(", "),
      limit: 50,
      orderBy: "created_at",
    });
    const candidateIds = decisions.map((row) => text(row.candidate_id)).filter(Boolean);
    const candidates = candidateIds.length === 0
      ? []
      : await this.reader.list({
        table: "product_candidates",
        columns: "id, name, status, target_market",
        limit: candidateIds.length,
        in: { column: "id", values: candidateIds },
      });
    const byId = new Map(candidates.map((row) => [text(row.id), row]));

    return decisions.map((row) => {
      const candidate = byId.get(text(row.candidate_id));
      const recommendation = text(row.recommendation);
      return {
        id: text(row.id),
        candidate_id: text(row.candidate_id),
        product_name: candidate ? text(candidate.name, "Unknown product") : "Unknown product",
        target_market: marketList(candidate?.target_market),
        candidate_status: candidate ? text(candidate.status) : null,
        recommendation,
        recommendation_label: recommendationLabel(recommendation),
        decision_status: text(row.decision_status, "proposed"),
        ...approvalFields(row.approval_status),
        decision_score: toNumber(row.decision_score),
        reasons: stringArray(row.reasons),
        risks: stringArray(row.risks),
        next_actions: stringArray(row.next_actions),
        created_at: text(row.created_at),
      };
    });
  }

  async agentTasks(): Promise<AgentTaskSummary[]> {
    const rows = await this.reader.list({
      table: "agent_tasks",
      columns: "id, title, agent_type, status, priority, created_at, started_at, completed_at, error_message",
      limit: LIST_LIMIT,
      orderBy: "created_at",
    });

    return rows.map((row) => ({
      id: text(row.id),
      title: text(row.title, "Untitled task"),
      agent_type: text(row.agent_type),
      status: text(row.status),
      priority: toNumber(row.priority),
      created_at: text(row.created_at),
      started_at: row.started_at == null ? null : text(row.started_at),
      completed_at: row.completed_at == null ? null : text(row.completed_at),
      error_message: truncate(row.error_message),
    }));
  }

  async activity(): Promise<ActivitySummary[]> {
    const rows = await this.reader.list({
      table: "activity_logs",
      columns: "id, agent_type, action, entity_type, entity_id, description, created_at",
      limit: 40,
      orderBy: "created_at",
    });

    return rows.map((row) => ({
      id: text(row.id),
      agent_type: row.agent_type == null ? null : text(row.agent_type),
      action: text(row.action),
      entity_type: row.entity_type == null ? null : text(row.entity_type),
      entity_id: row.entity_id == null ? null : text(row.entity_id),
      description: text(row.description),
      created_at: text(row.created_at),
    }));
  }

  async profitabilityAnalyses(): Promise<ProfitabilitySummary[]> {
    const analyses = await this.reader.list({
      table: "product_profitability_analyses",
      columns: "id, listing_id, market, currency, analysis_status, approval_status, calculation, created_at",
      limit: 50,
      orderBy: "created_at",
    });
    const listingIds = analyses.map((row) => text(row.listing_id)).filter(Boolean);
    const listings = listingIds.length === 0
      ? []
      : await this.reader.list({
        table: "supplier_product_listings",
        columns: "id, sku, product_title, candidate_id",
        limit: listingIds.length,
        in: { column: "id", values: listingIds },
      });
    const candidateIds = listings.map((row) => text(row.candidate_id)).filter(Boolean);
    const candidates = candidateIds.length === 0
      ? []
      : await this.reader.list({
        table: "product_candidates",
        columns: "id, name",
        limit: candidateIds.length,
        in: { column: "id", values: candidateIds },
      });
    const listingsById = new Map(listings.map((row) => [text(row.id), row]));
    const candidatesById = new Map(candidates.map((row) => [text(row.id), row]));

    return analyses.map((row) => {
      const listing = listingsById.get(text(row.listing_id));
      const candidate = listing
        ? candidatesById.get(text(listing.candidate_id))
        : undefined;
      const calculation = row.calculation && typeof row.calculation === "object"
        ? row.calculation as Row
        : {};

      return {
        id: text(row.id),
        market: text(row.market),
        currency: text(row.currency),
        analysis_status: text(row.analysis_status, "preliminary"),
        ...approvalFields(row.approval_status),
        sku: listing ? text(listing.sku) : null,
        product_title: listing ? text(listing.product_title) : null,
        product_name: candidate ? text(candidate.name) : null,
        selling_price: toNumber(calculation.selling_price),
        contribution_margin_percent: toNumber(calculation.contribution_margin_percent),
        contribution_profit_before_ads: toNumber(
          calculation.contribution_profit_before_ads,
        ),
        contribution_profit_after_ads: toNumber(
          calculation.contribution_profit_after_ads,
        ),
        created_at: text(row.created_at),
      };
    });
  }
}

function truncate(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const message = text(value);
  if (!message) {
    return null;
  }

  return message.length > 200 ? `${message.slice(0, 197)}...` : message;
}
