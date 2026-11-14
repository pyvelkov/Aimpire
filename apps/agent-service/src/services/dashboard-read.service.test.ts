import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DashboardReadService,
  approvalLabel,
  isApproved,
  recommendationLabel,
  type DashboardReader,
  type Filter,
  type ListRequest,
  type Row,
} from "./dashboard-read.service.js";

function memoryReader(tables: Record<string, Row[]>): DashboardReader {
  return {
    async list(input: ListRequest) {
      let rows = [...(tables[input.table] ?? [])];

      for (const filter of input.filters ?? []) {
        rows = rows.filter((row) => String(row[filter.column]) === filter.value);
      }

      if (input.in) {
        const column = input.in.column;
        const allowed = new Set(input.in.values);
        rows = rows.filter((row) => allowed.has(String(row[column])));
      }

      if (input.orderBy) {
        const column = input.orderBy;
        rows.sort((left, right) => {
          const comparison = String(left[column] ?? "").localeCompare(
            String(right[column] ?? ""),
          );
          return input.ascending ? comparison : -comparison;
        });
      }

      return rows.slice(0, input.limit);
    },

    async count(table: string, filters?: Filter[]) {
      let rows = [...(tables[table] ?? [])];

      for (const filter of filters ?? []) {
        rows = rows.filter((row) => String(row[filter.column]) === filter.value);
      }

      return rows.length;
    },
  };
}

describe("dashboard read model", () => {
  it("does not treat ready_for_review as approval", () => {
    assert.equal(isApproved("ready_for_review"), false);
    assert.equal(isApproved("not_approved"), false);
    assert.equal(isApproved("approved"), true);
    assert.equal(approvalLabel("ready_for_review"), "Not approved");
    assert.equal(recommendationLabel("ready_for_review"), "Ready for review");
    assert.notEqual(recommendationLabel("ready_for_review"), approvalLabel("ready_for_review"));
  });

  it("returns empty collections when the tables have no rows", async () => {
    const service = new DashboardReadService(memoryReader({}));
    const overview = await service.overview();

    assert.equal(overview.product_candidates.count, 0);
    assert.equal(overview.decision_score.latest, null);
    assert.equal(overview.approvals.approved_count, 0);
    assert.equal(overview.approvals.ready_for_review_count, 0);
    assert.deepEqual(await service.productCandidates(), []);
    assert.deepEqual(await service.productDecisions(), []);
    assert.deepEqual(await service.agentTasks(), []);
    assert.deepEqual(await service.activity(), []);
    assert.deepEqual(await service.profitabilityAnalyses(), []);
  });

  it("counts only approval_status=approved and keeps recommendation separate", async () => {
    const service = new DashboardReadService(memoryReader({
      product_candidates: [
        {
          id: "candidate-1",
          name: "Slow Feeder Pet Bowls",
          category: "Pet supplies",
          status: "discovered",
          target_market: ["CA", "US"],
          created_at: "2026-11-14T12:00:00.000Z",
          updated_at: "2026-11-14T12:00:00.000Z",
        },
      ],
      product_decisions: [
        {
          id: "decision-1",
          candidate_id: "candidate-1",
          recommendation: "ready_for_review",
          decision_status: "proposed",
          approval_status: "not_approved",
          decision_score: 82,
          reasons: ["Evidence is complete"],
          risks: ["Approval has not been given"],
          next_actions: ["Wait for a human decision"],
          created_at: "2026-11-14T15:00:00.000Z",
        },
        {
          id: "decision-2",
          candidate_id: "missing-candidate",
          recommendation: "investigate_further",
          decision_status: "proposed",
          approval_status: "approved",
          decision_score: 40,
          reasons: [],
          risks: [],
          next_actions: [],
          created_at: "2026-11-14T14:00:00.000Z",
        },
      ],
      agent_tasks: [
        {
          id: "task-1",
          title: "Review demand",
          agent_type: "research",
          status: "completed",
          priority: 1,
          created_at: "2026-11-14T10:00:00.000Z",
          started_at: null,
          completed_at: "2026-11-14T11:00:00.000Z",
          error_message: null,
        },
      ],
    }));

    const overview = await service.overview();
    const decisions = await service.productDecisions();
    const ready = decisions.find((decision) => decision.id === "decision-1");

    assert.equal(overview.product_candidates.count, 1);
    assert.equal(overview.decision_score.latest, 82);
    assert.equal(overview.approvals.approved_count, 1);
    assert.equal(overview.approvals.not_approved_count, 1);
    assert.equal(overview.approvals.ready_for_review_count, 1);
    assert.equal(overview.agent_tasks.by_status.completed, 1);
    assert.ok(ready);
    assert.equal(ready?.recommendation_label, "Ready for review");
    assert.equal(ready?.approval_label, "Not approved");
    assert.equal(ready?.approved, false);
    assert.equal(ready?.product_name, "Slow Feeder Pet Bowls");
    assert.deepEqual(ready?.target_market, ["CA", "US"]);
    assert.equal(decisions[1]?.product_name, "Unknown product");
    assert.equal(decisions[1]?.approved, true);
  });

  it("summarizes saved CA and US profitability without treating it as approval", async () => {
    const service = new DashboardReadService(memoryReader({
      product_profitability_analyses: [
        {
          id: "analysis-ca",
          listing_id: "listing-1",
          market: "CA",
          currency: "USD",
          analysis_status: "preliminary",
          approval_status: "not_approved",
          calculation: {
            selling_price: "25",
            contribution_margin_percent: 40,
            contribution_profit_after_ads: 4.5,
            contribution_profit_before_ads: 10,
          },
          created_at: "2026-11-14T15:00:00.000Z",
        },
        {
          id: "analysis-us",
          listing_id: "listing-1",
          market: "US",
          currency: "USD",
          analysis_status: "preliminary",
          approval_status: "not_approved",
          calculation: {
            selling_price: 25,
            contribution_margin_percent: 43.86,
            contribution_profit_after_ads: 4.97,
            contribution_profit_before_ads: 10.97,
          },
          created_at: "2026-11-14T15:01:00.000Z",
        },
      ],
      supplier_product_listings: [
        {
          id: "listing-1",
          sku: "BOWL-1",
          product_title: "Puzzle bowl",
          candidate_id: "candidate-1",
        },
      ],
      product_candidates: [
        { id: "candidate-1", name: "Slow Feeder Pet Bowls" },
      ],
    }));

    const analyses = await service.profitabilityAnalyses();

    assert.deepEqual(
      analyses.map((analysis) => analysis.market),
      ["US", "CA"],
    );
    assert.equal(analyses[0]?.selling_price, 25);
    assert.equal(analyses[1]?.selling_price, 25);
    assert.equal(analyses[0]?.approved, false);
    assert.equal(analyses[0]?.approval_label, "Not approved");
    assert.equal(analyses[0]?.product_name, "Slow Feeder Pet Bowls");
    assert.equal(analyses[0]?.sku, "BOWL-1");
  });

  it("omits task result payloads and truncates error text", async () => {
    const service = new DashboardReadService(memoryReader({
      agent_tasks: [
        {
          id: "task-1",
          title: "Research",
          agent_type: "research",
          status: "failed",
          priority: 2,
          created_at: "2026-11-14T10:00:00.000Z",
          started_at: null,
          completed_at: null,
          error_message: "x".repeat(250),
          result: { secret: "do-not-return" },
          input: { api_key: "do-not-return" },
        },
      ],
    }));

    const [task] = await service.agentTasks();
    const serialized = JSON.stringify(task);

    assert.equal(task?.error_message?.length, 200);
    assert.equal(serialized.includes("do-not-return"), false);
    assert.equal(serialized.includes("api_key"), false);
  });
});
