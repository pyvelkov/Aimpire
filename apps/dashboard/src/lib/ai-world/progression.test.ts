import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { levelLabel, progressionFromCompletedCount } from "./progression";

describe("office progression", () => {
  it("uses the same completed-task boundaries as the agent service", () => {
    assert.equal(levelLabel(1), "Lv 1");
    assert.deepEqual(
      [0, 1, 3, 4, 5, 8, 10].map((completed) => {
        const progression = progressionFromCompletedCount(completed);
        return [progression.total_xp, progression.level, progression.xp_toward_next_level];
      }),
      [
        [0, 1, 0],
        [25, 1, 25],
        [75, 1, 75],
        [100, 2, 0],
        [125, 2, 25],
        [200, 3, 0],
        [250, 3, 50],
      ],
    );
    assert.equal(progressionFromCompletedCount(0).achievements.every((achievement) => !achievement.earned), true);
    assert.deepEqual(progressionFromCompletedCount(10).achievements.map((achievement) => achievement.earned), [true, true, true]);
    assert.throws(() => progressionFromCompletedCount(-1));
  });
});
