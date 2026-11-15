import type { DepartmentDefinition, DepartmentId, VisualAgent, AiWorldRosterEntry } from "./types";
import { DEPARTMENT_IDS } from "./types";

export const DEPARTMENTS: readonly DepartmentDefinition[] = [
  {
    id: "research",
    label: "Research",
    sign: "RESEARCH",
    summary: "Lab bench, shelves, and a reading desk.",
    floor: "#243044",
    floorAlt: "#2c3b56",
    accent: "#8ec5ff",
    agent: {
      visualId: "nova",
      displayName: "Nova",
      hair: "#1b2430",
      hairStyle: "bun",
      skin: "#f0c7a4",
      shirt: "#7fd0c8",
      outer: "#f4f1ea",
      pants: "#2d3a4e",
      shoes: "#1c1915",
      prop: "goggles",
    },
  },
  {
    id: "product",
    label: "Product",
    sign: "PRODUCT",
    summary: "Workstations, sketches, and a prototype table.",
    floor: "#3c342c",
    floorAlt: "#463c32",
    accent: "#e2b15a",
    agent: {
      visualId: "quinn",
      displayName: "Quinn",
      hair: "#4a3428",
      hairStyle: "part",
      skin: "#e0b08a",
      shirt: "#8eb0d8",
      outer: "#243656",
      pants: "#2a3140",
      shoes: "#1c1915",
      prop: "glasses",
    },
  },
  {
    id: "marketing",
    label: "Marketing",
    sign: "MARKETING",
    summary: "A campaign board, swatches, and a bright desk.",
    floor: "#3d2434",
    floorAlt: "#4a2c3e",
    accent: "#f09ab8",
    agent: {
      visualId: "rio",
      displayName: "Rio",
      hair: "#1a1a1a",
      hairStyle: "bob",
      skin: "#8d5a3c",
      shirt: "#f6efe2",
      outer: "#e25b84",
      pants: "#3a2430",
      shoes: "#1c1915",
      prop: "beret",
    },
  },
  {
    id: "finance",
    label: "Finance",
    sign: "FINANCE",
    summary: "Ledgers, cabinets, and a locked safe.",
    floor: "#1e332b",
    floorAlt: "#274438",
    accent: "#8dcea8",
    agent: {
      visualId: "jules",
      displayName: "Jules",
      hair: "#c4a574",
      hairStyle: "short",
      skin: "#f3d0b0",
      shirt: "#f7f3ea",
      outer: "#1f6b45",
      pants: "#243028",
      shoes: "#3a2a1c",
      prop: "visor",
    },
  },
  {
    id: "operations",
    label: "Operations",
    sign: "OPERATIONS",
    summary: "Racks, floor marks, and a routing desk.",
    floor: "#2c333c",
    floorAlt: "#363e48",
    accent: "#f0a05a",
    agent: {
      visualId: "sage",
      displayName: "Sage",
      hair: "#3d4654",
      hairStyle: "cap",
      skin: "#c68642",
      shirt: "#2c333a",
      outer: "#e07a2f",
      pants: "#34302c",
      shoes: "#1c1915",
      prop: "headset",
    },
  },
  {
    id: "support",
    label: "Support",
    sign: "SUPPORT",
    summary: "A help desk, waiting chairs, and a ticket board.",
    floor: "#24383a",
    floorAlt: "#2c4446",
    accent: "#7fd0c8",
    agent: {
      visualId: "wynn",
      displayName: "Wynn",
      hair: "#5b3a6e",
      hairStyle: "bob",
      skin: "#f0c7a4",
      shirt: "#f4efe6",
      outer: "#2f8f8a",
      pants: "#24343a",
      shoes: "#1c1915",
      prop: "headset",
    },
  },
];

const DEPARTMENT_ID_SET = new Set<string>(DEPARTMENT_IDS);

export function isDepartmentId(value: string): value is DepartmentId {
  return DEPARTMENT_ID_SET.has(value);
}

export function departmentById(id: DepartmentId): DepartmentDefinition {
  const department = DEPARTMENTS.find((entry) => entry.id === id);

  if (!department) {
    throw new Error(`Unknown department ${id}`);
  }

  return department;
}

/**
 * Maps an optional future roster onto the six visual characters.
 * Blank names and unknown departments fall back to the painted cast.
 */
export function resolveVisualAgents(roster?: readonly AiWorldRosterEntry[]): VisualAgent[] {
  return DEPARTMENTS.map((department) => {
    const entry = roster?.find((item) => item.departmentId === department.id);
    const rawName = entry?.displayName;
    const displayName = typeof rawName === "string" && rawName.trim()
      ? rawName.trim()
      : department.agent.displayName;
    const agentId = typeof entry?.agentId === "string" && entry.agentId.trim()
      ? entry.agentId.trim()
      : undefined;

    return {
      visualId: department.agent.visualId,
      departmentId: department.id,
      displayName,
      ...(agentId ? { agentId } : {}),
      character: department.agent,
    };
  });
}
