import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AGENT_TYPES } from "./agent-operations.service.js";
import {
  AiWorldStateService,
  pickLatestTask,
  type AiWorldStateDb,
  type AiWorldTaskRow,
} from "./ai-world-state.service.js";

const NOW = new Date("2026-11-15T15:00:00.000Z");

function row(overrides: Partial<AiWorldTaskRow> & Pick<AiWorldTaskRow, "id" | "status">): AiWorldTaskRow {
  return {
    title: overrides.title ?? overrides.id,
    agent_type: overrides.agent_type ?? "research",
    created_at: overrides.created_at ?? "2026-11-15T12:00:00.000Z",
    started_at: overrides.started_at ?? null,
    completed_at: overrides.completed_at ?? null,
    ...overrides,
  };
}

function emptyDb(overrides: Partial<AiWorldStateDb> = {}): AiWorldStateDb & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async countTasks(agentType, status) {
      calls.push(`count:${agentType}:${status}`);
      return 0;
    },
    async latestBy() {
      return null;
    },
    async currentRunningTask() {
      return null;
    },
    async countPendingProductReviews() {
      return 0;
    },
    ...overrides,
  };
}

describe("AI World snapshot", () => {
  it("maps only the six departments and keeps queued separate from running", async () => {
    const counts: Record<string, number> = {
      "research:pending": 4,
      "research:in_progress": 0,
      "product:pending": 0,
      "product:in_progress": 1,
    };
    const db = emptyDb({
      async countTasks(agentType, status) {
        return counts[`${agentType}:${status}`] ?? 0;
      },
      async currentRunningTask(agentType) {
        if (agentType !== "product") return null;
        return row({
          id: "22222222-2222-4222-8222-222222222222",
          agent_type: "product",
          status: "in_progress",
          title: "Compare suppliers",
          started_at: "2026-11-15T14:00:00.000Z",
        });
      },
      async countPendingProductReviews() {
        return 3;
      },
    });

    const snapshot = await new AiWorldStateService(db, () => NOW).snapshot();

    assert.deepEqual(snapshot.departments.map((department) => department.department_id), [...AGENT_TYPES]);
    assert.equal(snapshot.departments.find((department) => department.department_id === "research")?.queued, 4);
    assert.equal(snapshot.departments.find((department) => department.department_id === "research")?.running, 0);
    assert.equal(snapshot.departments.find((department) => department.department_id === "product")?.running, 1);
    assert.equal(snapshot.departments.find((department) => department.department_id === "product")?.current_task?.title, "Compare suppliers");
    assert.equal(snapshot.departments.find((department) => department.department_id === "research")?.current_task, null);
    assert.equal(snapshot.pending_product_reviews, 3);
    assert.equal(snapshot.server_time, NOW.toISOString());
    assert.equal(JSON.stringify(snapshot).includes("ceo"), false);
  });

  it("reports every running task while naming only the latest one", async () => {
    const db = emptyDb({
      async countTasks(agentType, status) {
        return agentType === "operations" && status === "in_progress" ? 2 : 0;
      },
      async currentRunningTask() {
        return row({
          id: "33333333-3333-4333-8333-333333333333",
          agent_type: "operations",
          status: "in_progress",
          title: "Route the later shipment",
          started_at: "2026-11-15T14:30:00.000Z",
        });
      },
    });

    const operations = (await new AiWorldStateService(db, () => NOW).snapshot())
      .departments.find((department) => department.department_id === "operations");

    assert.equal(operations?.running, 2);
    assert.equal(operations?.queued, 0);
    assert.equal(operations?.current_task?.id, "33333333-3333-4333-8333-333333333333");
  });

  it("returns an empty history without inventing a task", async () => {
    const snapshot = await new AiWorldStateService(emptyDb(), () => NOW).snapshot();

    for (const department of snapshot.departments) {
      assert.equal(department.queued, 0);
      assert.equal(department.running, 0);
      assert.equal(department.completed, 0);
      assert.equal(department.failed, 0);
      assert.equal(department.current_task, null);
      assert.equal(department.latest_task, null);
    }
    assert.equal(snapshot.pending_product_reviews, 0);
  });

  it("picks the latest real activity instead of the newest created row", () => {
    const created = row({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "pending",
      created_at: "2026-11-15T13:00:00.000Z",
    });
    const finished = row({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "completed",
      title: "File the ledger",
      created_at: "2026-11-14T09:00:00.000Z",
      completed_at: "2026-11-15T14:45:00.000Z",
    });

    const latest = pickLatestTask([created, finished, null]);
    assert.equal(latest?.id, finished.id);
    assert.equal(latest?.status, "completed");
  });

  it("does not read run or activity tables", () => {
    const source = readFileSync(new URL("./ai-world-state.supabase.ts", import.meta.url), "utf8");
    assert.equal(source.includes("agent_runs"), false);
    assert.equal(source.includes("activity_logs"), false);
    assert.match(source, /\.limit\(1\)/);
    assert.equal(source.includes("cancelled"), false);
  });
});
