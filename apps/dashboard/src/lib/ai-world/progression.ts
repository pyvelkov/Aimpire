export const XP_PER_COMPLETED_TASK = 25;
export const XP_PER_LEVEL = 100;

export const ACHIEVEMENT_MILESTONES = [
  { id: "first_completed_task", label: "First completed task", required_completed: 1 },
  { id: "five_completed_tasks", label: "Five completed tasks", required_completed: 5 },
  { id: "ten_completed_tasks", label: "Ten completed tasks", required_completed: 10 },
] as const;

export type AchievementId = (typeof ACHIEVEMENT_MILESTONES)[number]["id"];

export type AgentAchievement = {
  id: AchievementId;
  label: string;
  earned: boolean;
  required_completed: number;
};

export type AgentProgression = {
  total_xp: number;
  level: number;
  xp_toward_next_level: number;
  xp_required_for_next_level: number;
  completed_task_count: number;
  achievements: AgentAchievement[];
};

/** Same rule as the agent service: one completed task row is 25 XP, and 100 XP advances a level. */
export function progressionFromCompletedCount(completed: number): AgentProgression {
  if (!Number.isInteger(completed) || completed < 0) {
    throw new Error("Completed task count must be a non-negative integer");
  }

  const totalXp = completed * XP_PER_COMPLETED_TASK;
  return {
    total_xp: totalXp,
    level: Math.floor(totalXp / XP_PER_LEVEL) + 1,
    xp_toward_next_level: totalXp % XP_PER_LEVEL,
    xp_required_for_next_level: XP_PER_LEVEL,
    completed_task_count: completed,
    achievements: ACHIEVEMENT_MILESTONES.map((milestone) => ({
      id: milestone.id,
      label: milestone.label,
      earned: completed >= milestone.required_completed,
      required_completed: milestone.required_completed,
    })),
  };
}

export function levelLabel(level: number): string {
  return `Lv ${level}`;
}
