import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DEPARTMENT_IDS } from "./types";
import { createAiWorldPoller, AI_WORLD_POLL_INTERVAL_MS } from "./poll";
import { characterPace, completionNotices } from "./presence";
import {
  readAiWorldSnapshot,
  readClientSnapshot,
  reduceConnection,
  type AiWorldSnapshot,
} from "./snapshot";
import { containsPoint, characterBounds, shouldSelectCharacter } from "./pointer";

function snapshot(completed = 0, running = 0): AiWorldSnapshot {
  return {
    server_time: "2026-11-15T15:00:00.000Z",
    pending_product_reviews: 2,
    departments: DEPARTMENT_IDS.map((departmentId) => ({
      department_id: departmentId,
      queued: departmentId === "finance" ? 3 : 0,
      running: departmentId === "research" ? running : 0,
      completed: departmentId === "research" ? completed : 0,
      failed: departmentId === "support" ? 1 : 0,
      current_task: departmentId === "research" && running > 0
        ? { id: "11111111-1111-4111-8111-111111111111", title: "Read the new listing" }
        : null,
      latest_task: completed > 0
        ? {
          id: "22222222-2222-4222-8222-222222222222",
          title: "File the note",
          status: "completed" as const,
          at: "2026-11-15T14:50:00.000Z",
        }
        : null,
    })),
  };
}

describe("live headquarters state", () => {
  it("accepts a real snapshot and rejects fabricated shapes", () => {
    const body = { success: true as const, snapshot: snapshot(1, 1) };
    assert.equal(readAiWorldSnapshot(body)?.departments[0].running, 1);
    assert.equal(readAiWorldSnapshot(body)?.departments[0].queued, 0);
    assert.equal(readClientSnapshot({ snapshot: body.snapshot })?.pending_product_reviews, 2);
    assert.equal(readAiWorldSnapshot({ success: true, snapshot: { departments: [] } }), null);
    assert.equal(readAiWorldSnapshot({ success: true, snapshot: { ...body.snapshot, events: [{ kind: "completed" }] } }), null);
  });

  it("does not replay historical completions and reports a later transition", () => {
    const initial = snapshot(4, 0);
    assert.deepEqual(completionNotices(null, initial.departments), []);

    const next = snapshot(5, 0);
    const notices = completionNotices(initial.departments, next.departments);
    assert.equal(notices.length, 1);
    assert.equal(notices[0]?.departmentId, "research");
    assert.equal(notices[0]?.newlyCompleted, 1);

    const again = completionNotices(next.departments, next.departments);
    assert.deepEqual(again, []);
  });

  it("keeps a failed refresh stale instead of live", () => {
    const live = reduceConnection({ kind: "loading" }, { type: "success", snapshot: snapshot() });
    assert.equal(live.kind, "live");
    const stale = reduceConnection(live, { type: "failure" });
    assert.equal(stale.kind, "stale");
    if (stale.kind === "stale" && live.kind === "live") {
      assert.equal(stale.snapshot, live.snapshot);
      assert.equal(stale.confirmedAt, live.confirmedAt);
    }
    assert.equal(reduceConnection({ kind: "loading" }, { type: "failure" }).kind, "unavailable");
    assert.notEqual(stale.kind, "live");
  });

  it("works only while a task is in progress", () => {
    const idle = snapshot(0, 0).departments[0];
    const working = snapshot(0, 2).departments[0];
    assert.equal(characterPace(idle, false), "idle");
    assert.equal(characterPace(working, false), "working");
    assert.equal(characterPace(working, true), "still");
    assert.equal(working.running, 2);
    assert.equal(working.queued, 0);
  });

  it("stops polling and visibility listening on cleanup", async () => {
    const timers: Array<{ fn: () => void }> = [];
    let unsubscribed = false;
    let hidden = false;
    let loads = 0;
    const poller = createAiWorldPoller({
      intervalMs: AI_WORLD_POLL_INTERVAL_MS,
      isHidden: () => hidden,
      load: async () => {
        loads += 1;
        return snapshot();
      },
      onUpdate: () => undefined,
      setTimer: (fn) => {
        const timer = { fn };
        timers.push(timer);
        return timer;
      },
      clearTimer: (id) => {
        const index = timers.indexOf(id as { fn: () => void });
        if (index >= 0) timers.splice(index, 1);
      },
      subscribeVisibility: () => () => {
        unsubscribed = true;
      },
    });

    poller.start();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(loads, 1);
    assert.equal(timers.length, 1);
    assert.equal(AI_WORLD_POLL_INTERVAL_MS, 10_000);

    hidden = true;
    poller.stop();
    assert.equal(timers.length, 0);
    assert.equal(unsubscribed, true);
    timers.splice(0, timers.length);
    poller.start();
    await Promise.resolve();
    assert.equal(loads, 1);
    poller.stop();
  });

  it("selects a character only when the pointer did not drag", () => {
    const bounds = characterBounds(100, 140);
    assert.equal(containsPoint(bounds, { x: 100, y: 130 }), true);
    assert.equal(containsPoint(bounds, { x: 2, y: 2 }), false);
    assert.equal(shouldSelectCharacter(0), true);
    assert.equal(shouldSelectCharacter(24), false);
  });

  it("authorizes the owner id and does not recreate the game for a snapshot", () => {
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    const route = read("../../app/api/dashboard/ai-world/state/route.ts");
    const mount = read("./mount-ai-world.ts");
    const stage = read("../../components/ai-world/ai-world-stage.tsx");
    const live = read("../../components/ai-world/ai-world-live.tsx");

    assert.match(route, /assertOwnerIdentity/);
    assert.doesNotMatch(route, /INTERNAL_API_SECRET|SUPABASE_SECRET_KEY|service_role/);
    assert.equal(mount.match(/new Phaser\.Game/g)?.length, 1);
    assert.match(mount, /applyState/);
    assert.match(stage, /applyState/);
    assert.doesNotMatch(live, /new Phaser\.Game|startAiWorld/);
    assert.match(live, /createAiWorldPoller/);
    assert.doesNotMatch(live, /Math\.random|setInterval/);
  });
});
