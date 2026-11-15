import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  XP_PER_COMPLETED_TASK,
  XP_PER_LEVEL,
  progressionFromCompletedCount,
} from "./agent-progression.js";

describe("agent progression", () => {
  it("awards 25 XP only for each completed task and starts at level 1", () => {
    const empty = progressionFromCompletedCount(0);
    assert.equal(empty.total_xp, 0);
    assert.equal(empty.level, 1);
    assert.equal(empty.xp_toward_next_level, 0);
    assert.equal(empty.xp_required_for_next_level, XP_PER_LEVEL);
    assert.equal(empty.completed_task_count, 0);
    assert.equal(empty.achievements.every((achievement) => achievement.earned === false), true);

    const one = progressionFromCompletedCount(1);
    assert.equal(one.total_xp, XP_PER_COMPLETED_TASK);
    assert.equal(one.level, 1);
    assert.equal(one.xp_toward_next_level, 25);
    assert.equal(one.achievements[0]?.earned, true);
    assert.equal(one.achievements[1]?.earned, false);
    assert.equal(one.achievements[2]?.earned, false);
  });

  it("crosses level boundaries on exact multiples of 100 XP", () => {
    const before = progressionFromCompletedCount(3);
    const exact = progressionFromCompletedCount(4);
    const after = progressionFromCompletedCount(5);
    const ten = progressionFromCompletedCount(10);

    assert.deepEqual([before.total_xp, before.level, before.xp_toward_next_level], [75, 1, 75]);
    assert.deepEqual([exact.total_xp, exact.level, exact.xp_toward_next_level], [100, 2, 0]);
    assert.deepEqual([after.total_xp, after.level, after.xp_toward_next_level], [125, 2, 25]);
    assert.equal(ten.level, 3);
    assert.equal(ten.xp_toward_next_level, 50);
    assert.deepEqual(ten.achievements.map((achievement) => achievement.earned), [true, true, true]);
    assert.equal(progressionFromCompletedCount(8).level, 3);
    assert.equal(progressionFromCompletedCount(8).xp_toward_next_level, 0);
  });

  it("rebuilds the same progression from the same completed count", () => {
    const first = progressionFromCompletedCount(6);
    const again = progressionFromCompletedCount(6);
    assert.deepEqual(first, again);
    assert.equal(first.completed_task_count, 6);
    assert.equal(first.achievements.filter((achievement) => achievement.earned).length, 2);
  });

  it("does not read a stored balance or award XP from the clock", () => {
    const source = readFileSync(new URL("./agent-progression.ts", import.meta.url), "utf8");
    const profile = readFileSync(new URL("./agent-profile.supabase.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /insert|update|agent_xp|experience_points|Date\.now|setInterval/i);
    assert.doesNotMatch(profile, /agent_xp|experience_points|\.insert\(|\.update\(/);
    assert.match(profile, /\.eq\("status", status\)/);
  });
});
