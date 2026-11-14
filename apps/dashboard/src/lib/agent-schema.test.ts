import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentsPageHref, displayTaskStatus } from "./task-status";
import { parseAgentOperations, parseTaskDetail } from "./agent-schema";

describe("agent task presentation", () => {
  it("does not display a queued task as running", () => {
    assert.equal(displayTaskStatus("pending", "Running"), "Queued");
    assert.equal(displayTaskStatus("in_progress", "Queued"), "Running");
    assert.equal(displayTaskStatus("failed", "Failed"), "Failed");
    assert.equal(agentsPageHref({ q: "bowl", agent: "research", status: "pending", page: 2 }), "/agents?q=bowl&agent=research&status=pending&page=2");
    assert.equal(agentsPageHref({}).includes("secret"), false);
  });

  it("parses an empty execution history", () => {
    const operations = parseAgentOperations({
      success: true,
      overview: {
        total: 1,
        pending: 1,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        departments: [{
          agent_type: "research",
          total: 1,
          pending: 1,
          running: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        }],
      },
      page: 1,
      page_size: 10,
      match_count: 1,
      tasks: [{
        id: "11111111-1111-4111-8111-111111111111",
        title: "Identify trending products",
        description: "Research",
        agent_type: "research",
        status: "pending",
        status_label: "Queued",
        priority: 1,
        created_at: "2026-11-14T10:00:00.000Z",
        started_at: null,
        completed_at: null,
        last_activity_at: "2026-11-14T10:00:00.000Z",
        error_message: null,
      }],
    });
    const detail = parseTaskDetail({
      success: true,
      task: {
        ...operations.tasks[0],
        input: { goal: "find products" },
        result: null,
        runs: [],
        activity: [],
        api_key: "hidden",
      },
    });

    assert.equal(operations.overview.pending, 1);
    assert.equal(operations.overview.running, 0);
    assert.equal(operations.tasks[0]?.status_label, "Queued");
    assert.deepEqual(detail.runs, []);
    assert.deepEqual(detail.activity, []);
    assert.equal(JSON.stringify(detail).includes("hidden"), false);
  });
});
