export const PRODUCT_REVIEW_ACTION = "product_review" as const;

export const PRODUCT_REVIEW_SCOPE = {
  authorizes: "Records that the owner reviewed this product decision.",
  does_not_authorize: [
    "Selling the product",
    "Store publishing",
    "Inventory purchasing",
    "Advertising spending",
    "Autonomous agent execution",
  ],
} as const;

export const WORKFLOW_CODES = [
  "duplicate_request",
  "not_pending",
  "stale_evidence",
  "superseded_decision",
  "decision_not_found",
  "unauthorized_reviewer",
  "invalid_action",
  "not_found",
] as const;

export type WorkflowCode = (typeof WORKFLOW_CODES)[number];

export type WorkflowResult =
  | { ok: true; requestId: string; status: string }
  | { ok: false; code: WorkflowCode };

export type ApprovalRow = Record<string, unknown>;

export interface ApprovalDb {
  listRequests(): Promise<ApprovalRow[]>;
  getRequest(id: string): Promise<ApprovalRow | null>;
  listEvents(requestId: string): Promise<ApprovalRow[]>;
  createRequest(decisionId: string, actorId: string, notes: string | null): Promise<WorkflowResult>;
  resolveRequest(
    requestId: string,
    actorId: string,
    decision: "approved" | "rejected",
    notes: string | null,
  ): Promise<WorkflowResult>;
}

export class ApprovalWorkflowError extends Error {
  readonly statusCode: number;
  readonly code: WorkflowCode;

  constructor(statusCode: number, code: WorkflowCode) {
    super(code);
    this.name = "ApprovalWorkflowError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const SENSITIVE_KEY = /secret|password|token|api[_-]?key|service[_-]?role|authorization/i;

export function sanitizeWorkflowValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.includes("sb_secret_") ? "[redacted]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeWorkflowValue(item));
  }
  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      cleaned[key] = sanitizeWorkflowValue(child);
    }
    return cleaned;
  }
  return value;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitizeWorkflowValue(value) as Record<string, unknown>;
}

export type ApprovalRequestView = {
  id: string;
  candidate_id: string;
  source_decision_id: string;
  requested_action: typeof PRODUCT_REVIEW_ACTION;
  status: string;
  evidence_snapshot: Record<string, unknown>;
  decision_summary: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  requested_by: string;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  scope: typeof PRODUCT_REVIEW_SCOPE;
};

export type ApprovalEventView = {
  id: string;
  approval_request_id: string;
  event_type: string;
  actor_id: string;
  previous_status: string | null;
  new_status: string | null;
  notes: string | null;
  created_at: string;
};

export type ApprovalDetail = ApprovalRequestView & {
  events: ApprovalEventView[];
};

function toRequest(row: ApprovalRow): ApprovalRequestView {
  return {
    id: text(row.id),
    candidate_id: text(row.candidate_id),
    source_decision_id: text(row.source_decision_id),
    requested_action: PRODUCT_REVIEW_ACTION,
    status: text(row.status),
    evidence_snapshot: asObject(row.evidence_snapshot),
    decision_summary: asObject(row.decision_summary),
    created_at: text(row.created_at),
    resolved_at: nullableText(row.resolved_at),
    requested_by: text(row.requested_by),
    reviewer_id: nullableText(row.reviewer_id),
    reviewer_notes: nullableText(row.reviewer_notes),
    scope: PRODUCT_REVIEW_SCOPE,
  };
}

function toEvent(row: ApprovalRow): ApprovalEventView {
  return {
    id: text(row.id),
    approval_request_id: text(row.approval_request_id),
    event_type: text(row.event_type),
    actor_id: text(row.actor_id),
    previous_status: nullableText(row.previous_status),
    new_status: nullableText(row.new_status),
    notes: nullableText(row.notes),
    created_at: text(row.created_at),
  };
}

export function isSupersededDecision(
  decision: { id: string; created_at: string },
  others: { id: string; created_at: string }[],
): boolean {
  return others.some((other) =>
    other.id !== decision.id &&
    (
      other.created_at > decision.created_at ||
      (other.created_at === decision.created_at && other.id > decision.id)
    ),
  );
}

export function describeDatabaseFailure(
  action: string,
  error: { code?: string; message?: string },
): string {
  const code = error.code && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : "unknown";
  const message = String(error.message ?? "")
    .replace(/sb_secret_\S+/g, "[redacted]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[uuid]");
  return `Failed to ${action} (${code}): ${message}`;
}

export function workflowStatus(code: WorkflowCode): number {
  if (code === "decision_not_found" || code === "not_found") return 404;
  if (code === "unauthorized_reviewer") return 403;
  if (code === "invalid_action") return 400;
  return 409;
}

export class ApprovalWorkflowService {
  constructor(private readonly db: ApprovalDb) {}

  async list(): Promise<ApprovalRequestView[]> {
    const rows = await this.db.listRequests();
    return rows.map((row) => toRequest(row));
  }

  async detail(id: string): Promise<ApprovalDetail> {
    const row = await this.db.getRequest(id);
    if (!row || text(row.id) !== id) {
      throw new ApprovalWorkflowError(404, "not_found");
    }
    const events = await this.db.listEvents(id);
    return { ...toRequest(row), events: events.map((event) => toEvent(event)) };
  }

  async create(decisionId: string, actorId: string, notes: string | null): Promise<ApprovalRequestView> {
    const result = await this.db.createRequest(decisionId, actorId, notes);
    if (!result.ok) {
      throw new ApprovalWorkflowError(workflowStatus(result.code), result.code);
    }
    return this.detail(result.requestId);
  }

  async resolve(
    requestId: string,
    actorId: string,
    decision: "approved" | "rejected",
    notes: string | null,
  ): Promise<ApprovalDetail> {
    const result = await this.db.resolveRequest(requestId, actorId, decision, notes);
    if (!result.ok) {
      throw new ApprovalWorkflowError(workflowStatus(result.code), result.code);
    }
    return this.detail(requestId);
  }
}
