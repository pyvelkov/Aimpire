import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AgentOperationsService,
  TaskNotFoundError,
  lastActivityAt,
  sanitizePayload,
  sanitizeTaskSearch,
  taskPageRange,
  taskStatusLabel,
  type AgentOperationsDb,
  type AgentTypeName,
  type TaskListQuery,
  type TaskRow,
  type TaskStatusName,
} from "./agent-operations.service.js";

function memoryDb(rows: TaskRow[], runs: TaskRow[] = [], activity: TaskRow[] = []): AgentOperationsDb {
  const matches = (row: TaskRow, filters?: { status?: TaskStatusName; agentType?: AgentTypeName }) => {
    if (filters?.status && row.status !== filters.status) return false;
    if (filters?.agentType && row.agent_type !== filters.agentType) return false;
    return true;
  };

  return {
    async countTasks(filters) {
      return rows.filter((row) => matches(row, filters)).length;
    },
    async listTasks(query: TaskListQuery) {
      const search = query.search.toLowerCase();
      const filtered = rows.filter((row) => {
        if (!matches(row, {
          status: query.status ?? undefined,
          agentType: query.agentType ?? undefined,
        })) {
          return false;
        }
        if (!search) return true;
        return `${row.title ?? ""} ${row.description ?? ""}`.toLowerCase().includes(search);
      });
      const { from, to } = taskPageRange(query.page, query.pageSize);
      return { total: filtered.length, rows: filtered.slice(from, to + 1) };
    },
    async getTask(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async listRuns(taskId) {
      return runs.filter((run) => run.task_id === taskId);
    },
    async listActivity(taskId) {
      return activity.filter((entry) => entry.entity_id === taskId);
    },
  };
}

const tasks: TaskRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Identify trending products",
    description: "Research Canada and the United States",
    agent_type: "research",
    status: "pending",
    priority: 1,
    input: { goal: "find products", api_key: "hidden" },
    result: null,
    error_message: null,
    created_at: "2026-11-14T10:00:00.000Z",
    started_at: null,
    completed_at: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Model unit economics",
    description: "Finance review",
    agent_type: "finance",
    status: "in_progress",
    priority: 2,
    input: {},
    result: null,
    error_message: null,
    created_at: "2026-11-14T11:00:00.000Z",
    started_at: "2026-11-14T11:05:00.000Z",
    completed_at: null,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Failed research pass",
    description: "Grounding failed",
    agent_type: "research",
    status: "failed",
    priority: 3,
    input: {},
    result: { summary: "stopped", sb_secret_note: "sb_secret_should_not_pass" },
    error_message: "Provider timeout",
    created_at: "2026-11-14T09:00:00.000Z",
    started_at: "2026-11-14T09:05:00.000Z",
    completed_at: "2026-11-14T09:06:00.000Z",
  },
];

describe("agent task operations", () => {
  it("labels queued work separately from a running task", () => {
    assert.equal(taskStatusLabel("pending"), "Queued");
    assert.equal(taskStatusLabel("in_progress"), "Running");
    assert.notEqual(taskStatusLabel("pending"), "Running");
    assert.equal(sanitizeTaskSearch("dog, (bowl)%"), "dog bowl");
    assert.deepEqual(taskPageRange(2, 10), { from: 10, to: 19 });
    assert.equal(lastActivityAt({
      created_at: "2026-11-14T09:00:00.000Z",
      started_at: "2026-11-14T09:05:00.000Z",
      completed_at: "2026-11-14T09:06:00.000Z",
    }), "2026-11-14T09:06:00.000Z");
  });

  it("filters, searches, and paginates without treating queued tasks as running", async () => {
    const service = new AgentOperationsService(memoryDb(tasks));
    const overview = await service.overview();
    const queued = await service.tasks({
      search: "canada",
      agentType: "research",
      status: "pending",
      page: 1,
      pageSize: 1,
    });
    const secondPage = await service.tasks({
      search: "",
      agentType: null,
      status: null,
      page: 2,
      pageSize: 2,
    });

    assert.equal(overview.total, 3);
    assert.equal(overview.pending, 1);
    assert.equal(overview.running, 1);
    assert.equal(overview.failed, 1);
    assert.equal(overview.completed, 0);
    assert.equal(queued.match_count, 1);
    assert.equal(queued.tasks[0]?.status_label, "Queued");
    assert.equal(queued.tasks[0]?.status, "pending");
    assert.equal(secondPage.match_count, 3);
    assert.equal(secondPage.tasks.length, 1);
  });

  it("returns an empty execution history instead of inventing runs", async () => {
    const service = new AgentOperationsService(memoryDb(tasks));
    const detail = await service.taskDetail("11111111-1111-4111-8111-111111111111");

    assert.deepEqual(detail.runs, []);
    assert.deepEqual(detail.activity, []);
    assert.equal(detail.status_label, "Queued");
    assert.deepEqual(detail.input, { goal: "find products" });
    assert.equal(JSON.stringify(detail).includes("api_key"), false);
  });

  it("strips sensitive result fields and reports a missing task", async () => {
    const service = new AgentOperationsService(memoryDb(tasks));
    const failed = await service.taskDetail("33333333-3333-4333-8333-333333333333");
    assert.equal(JSON.stringify(failed.result).includes("sb_secret_"), false);
    assert.deepEqual(sanitizePayload({ password: "x", note: "ok" }), { note: "ok" });
    await assert.rejects(
      () => service.taskDetail("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      TaskNotFoundError,
    );
  });
});
