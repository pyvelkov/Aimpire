/**
 * Visual model for the headquarters map.
 *
 * Stage 6.3.2 can pass real agent identities through `AiWorldOptions.roster`.
 * That roster is names and ids only. Task progress, execution, scheduling,
 * and approvals stay outside this view until a later stage feeds live state.
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

export type AiWorldHandle = {
  resetCamera: () => void;
  resize: () => void;
  destroy: () => void;
};
