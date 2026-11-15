import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ApprovalWorkflowError,
  ApprovalWorkflowService,
  PRODUCT_REVIEW_SCOPE,
  describeDatabaseFailure,
  isSupersededDecision,
  type ApprovalDb,
  type ApprovalRow,
  type WorkflowResult,
} from "./approval-workflow.service.js";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const DECISION = "33333333-3333-4333-8333-333333333333";
const CANDIDATE = "44444444-4444-4444-8444-444444444444";

const OLD_DECISION = "55555555-5555-4555-8555-555555555555";

function memoryDb(options?: { failResolve?: boolean }) {
  const requests: ApprovalRow[] = [];
  const events: ApprovalRow[] = [];
  const decisions = [
    {
      id: DECISION,
      created_at: "2026-11-14T19:00:00.000Z",
      approval_status: "not_approved",
    },
    {
      id: OLD_DECISION,
      created_at: "2026-11-14T18:00:00.000Z",
      approval_status: "not_approved",
    },
  ];
  const state = {
    evidenceChanged: false,
    requests,
    events,
    decisions,
    db: null as unknown as ApprovalDb,
  };
  let tail = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };

  const db: ApprovalDb = {
    async listRequests() {
      return [...requests];
    },
    async getRequest(id) {
      return requests.find((row) => row.id === id) ?? null;
    },
    async listEvents(requestId) {
      return events.filter((event) => event.approval_request_id === requestId);
    },
    async createRequest(decisionId, actorId, notes): Promise<WorkflowResult> {
      if (actorId !== ACTOR) return { ok: false, code: "unauthorized_reviewer" };
      return exclusive(async () => {
        const decision = decisions.find((item) => item.id === decisionId);
        if (!decision) return { ok: false, code: "decision_not_found" };
        if (isSupersededDecision(decision, decisions)) {
          return { ok: false, code: "superseded_decision" };
        }
        if (requests.some((row) => row.source_decision_id === decisionId && (row.status === "pending" || row.status === "approved"))) {
          return { ok: false, code: "duplicate_request" };
        }
        const id = `request-${requests.length + 1}`;
        requests.push({
          id,
          candidate_id: CANDIDATE,
          source_decision_id: decisionId,
          requested_action: "product_review",
          status: "pending",
          evidence_snapshot: { api_key: "hidden", quote: "saved" },
          decision_summary: { recommendation: "investigate_further", risks: ["Shipping is unverified"] },
          decision_fingerprint: "stable",
          created_at: "2026-11-14T18:00:00.000Z",
          resolved_at: null,
          requested_by: actorId,
          reviewer_id: null,
          reviewer_notes: null,
        });
        events.push({
          id: `event-${events.length + 1}`,
          approval_request_id: id,
          event_type: "created",
          actor_id: actorId,
          previous_status: null,
          new_status: "pending",
          notes,
          created_at: "2026-11-14T18:00:00.000Z",
        });
        return { ok: true, requestId: id, status: "pending" };
      });
    },
    async resolveRequest(requestId, actorId, decision, notes): Promise<WorkflowResult> {
      if (actorId !== ACTOR) return { ok: false, code: "unauthorized_reviewer" };
      return exclusive(async () => {
        const request = requests.find((row) => row.id === requestId);
        if (!request) return { ok: false, code: "not_found" };
        if (request.status !== "pending") {
          events.push({
            id: `event-${events.length + 1}`,
            approval_request_id: requestId,
            event_type: "duplicate_submission",
            actor_id: actorId,
            previous_status: request.status,
            new_status: request.status,
            notes,
            created_at: "2026-11-14T18:05:00.000Z",
          });
          return { ok: false, code: "not_pending" };
        }
        if (state.evidenceChanged) {
          events.push({
            id: `event-${events.length + 1}`,
            approval_request_id: requestId,
            event_type: "stale_evidence",
            actor_id: actorId,
            previous_status: "pending",
            new_status: "pending",
            notes,
            created_at: "2026-11-14T18:05:00.000Z",
          });
          return { ok: false, code: "stale_evidence" };
        }
        if (options?.failResolve) {
          throw new Error("database password=sb_secret_should_not_leak");
        }
        request.status = decision;
        request.resolved_at = "2026-11-14T18:06:00.000Z";
        request.reviewer_id = actorId;
        request.reviewer_notes = notes;
        events.push({
          id: `event-${events.length + 1}`,
          approval_request_id: requestId,
          event_type: decision,
          actor_id: actorId,
          previous_status: "pending",
          new_status: decision,
          notes,
          created_at: "2026-11-14T18:06:00.000Z",
        });
        return { ok: true, requestId, status: decision };
      });
    },
  };
  state.db = db;
  return state;
}

describe("approval workflow", () => {
  it("creates a pending review and approves it with one audit transition", async () => {
    const state = memoryDb();
    const service = new ApprovalWorkflowService(state.db);
    const created = await service.create(DECISION, ACTOR, "Please review");
    const approved = await service.resolve(created.id, ACTOR, "approved", "Reviewed");

    assert.equal(created.status, "pending");
    assert.equal(created.requested_action, "product_review");
    assert.equal(approved.status, "approved");
    assert.equal(approved.reviewer_id, ACTOR);
    assert.equal(approved.events.at(-1)?.event_type, "approved");
    assert.equal(approved.events.at(-1)?.previous_status, "pending");
    assert.equal(approved.events.at(-1)?.new_status, "approved");
    assert.equal(state.decisions[0]?.approval_status, "not_approved");
    assert.deepEqual(approved.scope.does_not_authorize, PRODUCT_REVIEW_SCOPE.does_not_authorize);
    assert.equal(JSON.stringify(approved.evidence_snapshot).includes("api_key"), false);
  });

  it("rejects a second request and a second approval without changing the product decision", async () => {
    const state = memoryDb();
    const service = new ApprovalWorkflowService(state.db);
    const created = await service.create(DECISION, ACTOR, null);
    await assert.rejects(() => service.create(DECISION, ACTOR, null), (error: unknown) => {
      return error instanceof ApprovalWorkflowError && error.code === "duplicate_request";
    });
    await service.resolve(created.id, ACTOR, "rejected", null);
    await assert.rejects(() => service.resolve(created.id, ACTOR, "approved", null), (error: unknown) => {
      return error instanceof ApprovalWorkflowError && error.code === "not_pending";
    });
    assert.equal(state.requests.find((row) => row.id === created.id)?.status, "rejected");
    assert.equal(state.events.at(-1)?.event_type, "duplicate_submission");
    assert.equal(state.decisions[0]?.approval_status, "not_approved");
  });

  it("rejects an unauthorized actor, a superseded decision, stale supplier evidence, and a concurrent second resolution", async () => {
    const state = memoryDb();
    const service = new ApprovalWorkflowService(state.db);
    await assert.rejects(
      () => service.create(DECISION, "22222222-2222-4222-8222-222222222222", null),
      (error: unknown) => error instanceof ApprovalWorkflowError && error.code === "unauthorized_reviewer",
    );
    await assert.rejects(
      () => service.create(OLD_DECISION, ACTOR, null),
      (error: unknown) => error instanceof ApprovalWorkflowError && error.code === "superseded_decision",
    );

    const created = await service.create(DECISION, ACTOR, null);
    state.evidenceChanged = true;
    await assert.rejects(
      () => service.resolve(created.id, ACTOR, "approved", null),
      (error: unknown) => error instanceof ApprovalWorkflowError && error.code === "stale_evidence",
    );
    assert.equal(state.requests[0]?.status, "pending");

    state.evidenceChanged = false;
    const settled = await Promise.allSettled([
      service.resolve(created.id, ACTOR, "approved", null),
      service.resolve(created.id, ACTOR, "approved", null),
    ]);
    const approved = settled.filter((result) => result.status === "fulfilled");
    assert.equal(approved.length, 1);
    assert.equal(state.events.filter((event) => event.event_type === "approved").length, 1);
    assert.equal(state.events.some((event) => event.event_type === "duplicate_submission"), true);
    assert.equal(state.decisions[0]?.approval_status, "not_approved");
  });

  it("breaks identical timestamps by id and allows another request after rejection", async () => {
    const tiedAt = "2026-11-14T18:00:00.000Z";
    const lower = { id: "11111111-1111-4111-8111-111111111111", created_at: tiedAt };
    const higher = { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", created_at: tiedAt };
    assert.equal(isSupersededDecision(lower, [lower, higher]), true);
    assert.equal(isSupersededDecision(higher, [lower, higher]), false);

    const state = memoryDb();
    const service = new ApprovalWorkflowService(state.db);
    const created = await service.create(DECISION, ACTOR, null);
    await assert.rejects(
      () => service.resolve(created.id, "22222222-2222-4222-8222-222222222222", "rejected", null),
      (error: unknown) => error instanceof ApprovalWorkflowError && error.code === "unauthorized_reviewer",
    );
    assert.equal(state.requests[0]?.status, "pending");
    await service.resolve(created.id, ACTOR, "rejected", "Not this version");
    const again = await service.create(DECISION, ACTOR, null);
    assert.equal(again.status, "pending");
    assert.notEqual(again.id, created.id);
    await assert.rejects(
      () => service.create(DECISION, ACTOR, null),
      (error: unknown) => error instanceof ApprovalWorkflowError && error.code === "duplicate_request",
    );
  });

  it("does not persist a resolution when the database write fails", async () => {
    const state = memoryDb({ failResolve: true });
    const service = new ApprovalWorkflowService(state.db);
    const created = await service.create(DECISION, ACTOR, null);
    await assert.rejects(() => service.resolve(created.id, ACTOR, "approved", null));
    assert.equal(state.requests[0]?.status, "pending");
    assert.equal(state.events.some((event) => event.event_type === "approved"), false);
  });
});

describe("approval migration", () => {
  it("enables RLS, keeps events append-only, and does not publish or purchase", () => {
    const sql = readFileSync(
      new URL("../../../../supabase/migrations/20261114180000_approval_workflow.sql", import.meta.url),
      "utf8",
    );
    assert.match(sql, /private\.dashboard_owner/);
    assert.match(sql, /dashboard_actor_is_owner/);
    assert.match(sql, /revoke all on schema private from public/);
    assert.match(sql, /revoke all on schema private from anon, authenticated/);
    assert.match(sql, /force row level security/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /approval_events is append-only/);
    assert.match(sql, /for update/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /\(newer\.created_at, newer\.id\) > \(decision\.created_at, decision\.id\)/);
    assert.match(sql, /dashboard_owner_postgres_access/);
    assert.match(sql, /owner to postgres/);
    assert.match(sql, /where status in \('pending', 'approved'\)/);
    assert.match(sql, /snapshot_verification_id uuid/);
    assert.match(sql, /q\.verification_id = snapshot_verification_id/);
    assert.doesNotMatch(sql, /where verification_id is not null/);
    const fix = readFileSync(
      new URL("../../../../supabase/migrations/20261115044500_fix_evidence_anchor_variable.sql", import.meta.url),
      "utf8",
    );
    assert.match(fix, /create or replace function public\.approval_evidence_anchor/);
    assert.match(fix, /q\.verification_id = snapshot_verification_id/);
    assert.doesNotMatch(fix, /where verification_id is not null/);
    assert.doesNotMatch(fix, /update public\.product_decisions/i);
    const databaseFailure = describeDatabaseFailure("create approval request", {
      code: "42702",
      message: "column reference verification_id is ambiguous sb_secret_hidden 11111111-1111-4111-8111-111111111111",
    });
    assert.equal(databaseFailure.includes("sb_secret_"), false);
    assert.equal(databaseFailure.includes("11111111-1111-4111-8111-111111111111"), false);
    assert.match(databaseFailure, /42702/);
    assert.match(
      describeDatabaseFailure("create approval request", {
        code: "42702",
        message: "column reference verification_id is ambiguous",
      }),
      /42702/,
    );
    assert.match(sql, /get diagnostics updated_count = row_count/);
    assert.match(sql, /create policy dashboard_owner_postgres_access[\s\S]*?to postgres/);
    assert.doesNotMatch(sql, /create policy[^;]*to (anon|authenticated|public)\b/i);
    assert.doesNotMatch(sql, /grant [^;]* to (anon|authenticated|public)\b/i);
    assert.match(sql, /update public.approval_requests/);
    assert.match(sql, /insert into public.approval_events/);
    assert.doesNotMatch(sql, /update public.product_decisions/i);
    assert.doesNotMatch(sql, /shopify/i);
    assert.match(sql, /requested_action = 'product_review'/);
  });
});
