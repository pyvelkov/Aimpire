import { DEPARTMENT_IDS, type DepartmentId } from "./types";

export type LiveTaskRef = {
  id: string;
  title: string;
};

export type LiveLatestTask = LiveTaskRef & {
  status: string;
  at: string;
};

export type LiveDepartment = {
  department_id: DepartmentId;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  current_task: LiveTaskRef | null;
  latest_task: LiveLatestTask | null;
};

export type CompletionNotice = {
  departmentId: DepartmentId;
  newlyCompleted: number;
  label: string;
};

export function completionNotices(
  previous: readonly LiveDepartment[] | null,
  next: readonly LiveDepartment[],
): CompletionNotice[] {
  if (!previous) {
    return [];
  }

  const notices: CompletionNotice[] = [];

  for (const departmentId of DEPARTMENT_IDS) {
    const prior = previous.find((entry) => entry.department_id === departmentId);
    const department = next.find((entry) => entry.department_id === departmentId);
    if (!prior || !department) {
      continue;
    }
    const newlyCompleted = department.completed - prior.completed;
    if (newlyCompleted < 1) {
      continue;
    }
    notices.push({
      departmentId,
      newlyCompleted,
      label: newlyCompleted === 1 ? "Done" : `${newlyCompleted} done`,
    });
  }

  return notices;
}

export function departmentActivity(department: LiveDepartment): "Working" | "Queued" | "Failed" | "Idle" {
  if (department.running > 0) {
    return "Working";
  }
  if (department.queued > 0) {
    return "Queued";
  }
  if (department.failed > 0) {
    return "Failed";
  }
  return "Idle";
}

export function characterPace(
  department: LiveDepartment | null,
  reduceMotion: boolean,
): "still" | "working" | "idle" {
  if (reduceMotion) {
    return "still";
  }
  if (!department || department.running < 1) {
    return "idle";
  }
  return "working";
}
