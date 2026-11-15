/**
 * Visual model for the headquarters map.
 * Live task counts arrive through `AiWorldLiveSnapshot` and update the
 * existing scene. They are not a roster of invented activity.
 */

export const DEPARTMENT_IDS = [
  "research",
  "product",
  "marketing",
  "finance",
  "operations",
  "support",
] as const;

export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export type HairStyle = "short" | "bob" | "bun" | "part" | "cap" | "beret";

export type CharacterProp = "goggles" | "glasses" | "visor" | "headset" | "beret" | "none";

export type CharacterSpec = {
  visualId: string;
  displayName: string;
  hair: string;
  hairStyle: HairStyle;
  skin: string;
  shirt: string;
  outer: string;
  pants: string;
  shoes: string;
  prop: CharacterProp;
};

export type DepartmentDefinition = {
  id: DepartmentId;
  label: string;
  sign: string;
  summary: string;
  floor: string;
  floorAlt: string;
  accent: string;
  agent: CharacterSpec;
};

/** Identity-only link for a future live roster. No task fields. */
export type AiWorldRosterEntry = {
  departmentId: DepartmentId;
  displayName: string;
  agentId?: string;
};

export type AiWorldOptions = {
  roster?: readonly AiWorldRosterEntry[];
};

export type VisualAgent = {
  visualId: string;
  departmentId: DepartmentId;
  displayName: string;
  agentId?: string;
  character: CharacterSpec;
};

export type AiWorldLiveDepartment = {
  department_id: DepartmentId;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  current_task: { id: string; title: string } | null;
  latest_task: { id: string; title: string; status: string; at: string } | null;
};

export type AiWorldLiveSnapshot = {
  server_time: string;
  pending_product_reviews: number;
  departments: readonly AiWorldLiveDepartment[];
};

export type AiWorldHandle = {
  resetCamera: () => void;
  resize: () => void;
  destroy: () => void;
  applyState: (snapshot: AiWorldLiveSnapshot | null) => void;
  setSelectListener: (listener: ((departmentId: DepartmentId | null) => void) | null) => void;
};
