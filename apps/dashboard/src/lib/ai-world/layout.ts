import { DEPARTMENTS, resolveVisualAgents } from "./departments";
import { measureText } from "./pixel-font";
import type { AiWorldOptions, DepartmentId } from "./types";

export const COURTYARD = 16;
export const WALL = 8;
export const ROOM_WIDTH = 136;
export const ROOM_HEIGHT = 112;
export const HALL_HEIGHT = 56;

export const WORLD_WIDTH = COURTYARD * 2 + WALL * 4 + ROOM_WIDTH * 3;
export const WORLD_HEIGHT = COURTYARD * 2 + WALL * 4 + ROOM_HEIGHT * 2 + HALL_HEIGHT;

export const ROOM_METRICS = {
  signOffsetY: 4,
  propOffsetY: 22,
  deskOffsetY: 46,
  deskWidth: 44,
  deskHeight: 16,
  nameOffsetY: 64,
  feetOffsetY: 104,
} as const;

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RoomLayout = {
  id: DepartmentId;
  label: string;
  summary: string;
  rect: Rect;
  sign: Rect & { text: string };
  desk: Rect;
  agent: {
    visualId: string;
    displayName: string;
    agentId?: string;
    x: number;
    y: number;
  };
};

export type OfficeLayout = {
  world: { width: number; height: number };
  hall: Rect;
  rooms: RoomLayout[];
};

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

export function buildOfficeLayout(options: AiWorldOptions = {}): OfficeLayout {
  const agents = resolveVisualAgents(options.roster);
  const hall: Rect = {
    x: COURTYARD + WALL,
    y: COURTYARD + WALL + ROOM_HEIGHT + WALL,
    width: ROOM_WIDTH * 3 + WALL * 2,
    height: HALL_HEIGHT,
  };

  const rooms = agents.map((agent, index) => {
    const department = DEPARTMENTS[index];
    const column = index % 3;
    const row = index < 3 ? 0 : 1;
    const rect: Rect = {
      x: COURTYARD + WALL + column * (ROOM_WIDTH + WALL),
      y: row === 0
        ? COURTYARD + WALL
        : COURTYARD + WALL + ROOM_HEIGHT + WALL + HALL_HEIGHT + WALL,
      width: ROOM_WIDTH,
      height: ROOM_HEIGHT,
    };
    const textSize = measureText(department.sign, 2);
    const sign: Rect & { text: string } = {
      text: department.sign,
      x: rect.x + Math.round((rect.width - (textSize.width + 8)) / 2),
      y: rect.y + ROOM_METRICS.signOffsetY,
      width: textSize.width + 8,
      height: textSize.height + 6,
    };

    return {
      id: department.id,
      label: department.label,
      summary: department.summary,
      rect,
      sign,
      desk: {
        x: rect.x + Math.round((rect.width - ROOM_METRICS.deskWidth) / 2),
        y: rect.y + ROOM_METRICS.deskOffsetY,
        width: ROOM_METRICS.deskWidth,
        height: ROOM_METRICS.deskHeight,
      },
      agent: {
        visualId: agent.visualId,
        displayName: agent.displayName,
        ...(agent.agentId ? { agentId: agent.agentId } : {}),
        x: rect.x + rect.width / 2,
        y: rect.y + ROOM_METRICS.feetOffsetY,
      },
    };
  });

  return {
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    hall,
    rooms,
  };
}
