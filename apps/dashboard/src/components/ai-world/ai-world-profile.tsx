"use client";

import Link from "next/link";
import { departmentById } from "@/lib/ai-world/departments";
import { departmentActivity } from "@/lib/ai-world/presence";
import type { AgentProfile, AgentProfileAvailability, AgentProfileTask } from "@/lib/ai-world/profiles";
import { snapshotOf, type AiWorldConnection } from "@/lib/ai-world/snapshot";
import type { DepartmentId } from "@/lib/ai-world/types";
import { formatWhen } from "@/lib/presentation";
import { agentsPageHref } from "@/lib/task-status";

function TaskLinks({ tasks, empty }: { tasks: readonly AgentProfileTask[]; empty: string }) {
  if (tasks.length === 0) {
    return <p className="text-muted">{empty}</p>;
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li key={task.id}>
          <Link href={`/agents/tasks/${task.id}`} className="font-medium text-pine hover:underline">
            {task.title}
          </Link>
          <p className="text-muted">
            {task.status_label}
            {task.last_activity_at ? ` · ${formatWhen(task.last_activity_at)}` : ""}
          </p>
          {task.error_message ? <p className="text-xs text-clay">{task.error_message}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Progression({ profile }: { profile: AgentProfile }) {
  const progression = profile.progression;
  const width = Math.round((progression.xp_toward_next_level / progression.xp_required_for_next_level) * 100);

  return (
    <section className="mt-3" aria-label={`Level ${progression.level}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-medium">Level {progression.level}</h4>
        <p className="text-muted">{progression.total_xp} XP</p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-paper ring-1 ring-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progression.xp_required_for_next_level}
        aria-valuenow={progression.xp_toward_next_level}
        aria-label={`${progression.xp_toward_next_level} of ${progression.xp_required_for_next_level} XP toward the next level`}
      >
        <div className="h-full bg-pine" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 text-muted">
        {progression.xp_toward_next_level} / {progression.xp_required_for_next_level} XP toward the next level
      </p>
      <p className="mt-2 text-muted">{progression.completed_task_count} completed tasks</p>
      <ul className="mt-2 space-y-1">
        {progression.achievements.map((achievement) => (
          <li key={achievement.id} className={achievement.earned ? "text-ink" : "text-muted"}>
            {achievement.earned ? "Earned" : "Not earned"} · {achievement.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AiWorldProfile({
  departmentId,
  connection,
  profile,
  profileState,
  onClose,
}: {
  departmentId: DepartmentId;
  connection: AiWorldConnection;
  profile: AgentProfile | null;
  profileState: AgentProfileAvailability;
  onClose: () => void;
}) {
  const painted = departmentById(departmentId);
  const snapshot = snapshotOf(connection);
  const live = snapshot?.departments.find((entry) => entry.department_id === departmentId) ?? null;
  const stale = connection.kind === "stale";
  const name = profile?.display_name ?? painted.agent.displayName;
  const department = profile?.department ?? painted.label;
  const running = live ? live.current_task : null;

  return (
    <aside className="absolute right-3 bottom-14 z-20 max-h-[70%] w-80 overflow-y-auto rounded-2xl bg-card p-4 text-sm shadow-sm ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{name}</h3>
          <p className="text-muted">{department}</p>
        </div>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink">
          Close
        </button>
      </div>

      {profile ? (
        <div className="mt-3 space-y-2">
          <p>{profile.specialization}</p>
          <p className="text-muted">{profile.description}</p>
          <p className="text-muted">{profile.responsibilities}</p>
          <p className="text-xs text-muted">Sprite {profile.avatar_id}</p>
          <Progression profile={profile} />
        </div>
      ) : (
        <p className="mt-3 text-muted">
          {profileState === "loading"
            ? "Loading the saved profile…"
            : profileState === "unavailable"
              ? "The saved profile is unavailable."
              : "No profile record is saved for this character."}
        </p>
      )}

      <div className="mt-4">
        <h4 className="font-medium">Current state</h4>
        {live ? (
          <>
            <p className="mt-1">{departmentActivity(live)}</p>
            {stale ? <p className="mt-1 text-clay">These counts are not live.</p> : null}
            <p className="mt-2 text-muted">
              {running ? (
                <>
                  Running:{" "}
                  <Link href={`/agents/tasks/${running.id}`} className="font-medium text-pine hover:underline">
                    {running.title}
                  </Link>
                </>
              ) : (
                "No task is in progress."
              )}
            </p>
          </>
        ) : (
          <p className="mt-1 text-muted">Task counts are not available yet.</p>
        )}
      </div>

      {profile ? (
        <>
          <h4 className="mt-4 font-medium">Saved tasks</h4>
          <p className="mt-2 text-muted">
            {profile.current_task ? (
              <>
                In progress:{" "}
                <Link href={`/agents/tasks/${profile.current_task.id}`} className="font-medium text-pine hover:underline">
                  {profile.current_task.title}
                </Link>
              </>
            ) : (
              "No saved task is in progress."
            )}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-muted">
            <div>Queued <span className="block text-ink">{profile.task_counts.pending}</span></div>
            <div>Running <span className="block text-ink">{profile.task_counts.in_progress}</span></div>
            <div>Completed <span className="block text-ink">{profile.task_counts.completed}</span></div>
            <div>Failed <span className="block text-ink">{profile.task_counts.failed}</span></div>
            <div>Cancelled <span className="block text-ink">{profile.task_counts.cancelled}</span></div>
            <div>Total <span className="block text-ink">{profile.task_counts.total}</span></div>
          </dl>
          <section className="mt-4">
            <h4 className="font-medium">Recent tasks</h4>
            <div className="mt-2">
              <TaskLinks tasks={profile.recent_tasks} empty="None recorded." />
            </div>
          </section>
          <section className="mt-4">
            <h4 className="font-medium">Completed</h4>
            <div className="mt-2">
              <TaskLinks tasks={profile.completed_tasks} empty="None recorded." />
            </div>
          </section>
          <section className="mt-4">
            <h4 className="font-medium">Failed</h4>
            <div className="mt-2">
              <TaskLinks tasks={profile.failed_tasks} empty="None recorded." />
            </div>
          </section>
        </>
      ) : live ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-muted">
          <div>Queued <span className="block text-ink">{live.queued}</span></div>
          <div>Running <span className="block text-ink">{live.running}</span></div>
          <div>Completed <span className="block text-ink">{live.completed}</span></div>
          <div>Failed <span className="block text-ink">{live.failed}</span></div>
        </dl>
      ) : null}

      <Link href={agentsPageHref({ agent: departmentId })} className="mt-4 inline-block font-medium text-pine">
        View department tasks
      </Link>
    </aside>
  );
}
