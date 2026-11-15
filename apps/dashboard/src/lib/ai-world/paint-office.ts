import { hex, mix, shade, type Rgb } from "./color";
import { paintCharacter } from "./characters";
import { departmentById } from "./departments";
import { drawText, measureText } from "./pixel-font";
import {
  buildOfficeLayout,
  ROOM_METRICS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type OfficeLayout,
  type Rect,
  type RoomLayout,
} from "./layout";
import { PixelBuffer } from "./pixel-buffer";
import type { AiWorldOptions, DepartmentId } from "./types";

const GRASS = hex("#1a2420");
const GRASS_TUFT = hex("#24352c");
const BRICK = hex("#4a342c");
const MORTAR = hex("#2e211c");
const HALL = hex("#3a322c");
const HALL_ALT = hex("#453c34");
const WOOD = hex("#6d4c34");
const WOOD_DARK = hex("#5a3d28");
const INK = hex("#1c1915");
const PAPER = hex("#f6efe2");
const CREAM = hex("#f3e2c4");

export type PaintedCharacter = {
  visualId: string;
  departmentId: DepartmentId;
  displayName: string;
  x: number;
  y: number;
  frames: [PixelBuffer, PixelBuffer];
};

export type PaintedOffice = {
  layout: OfficeLayout;
  background: PixelBuffer;
  characters: PaintedCharacter[];
};

export function floorPixel(x: number, y: number, base: Rgb, alt: Rgb): Rgb {
  if (y % 8 === 0) {
    return shade(base, -0.14);
  }

  const noise = (x * 17 + y * 31) % 11;

  if (noise === 0) {
    return shade(base, 0.1);
  }

  if (noise === 1) {
    return alt;
  }

  return base;
}

function bevel(buffer: PixelBuffer, x: number, y: number, width: number, height: number, color: Rgb) {
  buffer.fillRect(x, y, width, height, color);
  buffer.fillRect(x, y, width, 1, shade(color, 0.24));
  buffer.fillRect(x, y, 1, height, shade(color, 0.12));
  buffer.fillRect(x, y + height - 1, width, 1, shade(color, -0.28));
  buffer.fillRect(x + width - 1, y, 1, height, shade(color, -0.18));
}

function paintCourtyard(buffer: PixelBuffer) {
  const shellRight = WORLD_WIDTH - 16;
  const shellBottom = WORLD_HEIGHT - 16;

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const inside = x >= 16 && x < shellRight && y >= 16 && y < shellBottom;

      if (inside) {
        continue;
      }

      const tuft = (x * 13 + y * 7) % 17 === 0;
      buffer.set(x, y, tuft ? GRASS_TUFT : GRASS);
    }
  }
}

function paintBrick(buffer: PixelBuffer) {
  const x0 = 16;
  const y0 = 16;
  const x1 = WORLD_WIDTH - 16;
  const y1 = WORLD_HEIGHT - 16;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const row = Math.floor((y - y0) / 8);
      const offset = row % 2 === 0 ? 0 : 4;
      const mortar = y % 8 === 0 || (x + offset) % 8 === 0;
      buffer.set(x, y, mortar ? MORTAR : BRICK);
    }
  }
}

function paintFloor(buffer: PixelBuffer, rect: Rect, base: Rgb, alt: Rgb) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      buffer.set(x, y, floorPixel(x, y, base, alt));
    }
  }
}

function lightPool(buffer: PixelBuffer, cx: number, cy: number, rx: number, ry: number, tint: Rgb) {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const x1 = Math.min(buffer.width, Math.ceil(cx + rx));
  const y1 = Math.min(buffer.height, Math.ceil(cy + ry));

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;

      if (nx * nx + ny * ny > 1) {
        continue;
      }

      const current = buffer.get(x, y);

      if (!current || current.a === 0) {
        continue;
      }

      buffer.set(x, y, mix(current, tint, 0.16));
    }
  }
}

function paintLabel(
  buffer: PixelBuffer,
  centerX: number,
  top: number,
  text: string,
  scale: number,
  plate: Rgb,
  ink: Rgb,
) {
  const measured = measureText(text, scale);
  const padX = scale + 1;
  const padY = scale;
  const width = measured.width + padX * 2;
  const height = measured.height + padY * 2;
  const x = Math.round(centerX - width / 2);

  bevel(buffer, x, top, width, height, plate);
  drawText(buffer, text, x + padX + 1, top + padY + 1, shade(plate, -0.45), scale);
  drawText(buffer, text, x + padX, top + padY, ink, scale);
}

function paintPlant(buffer: PixelBuffer, x: number, y: number) {
  buffer.fillRect(x + 4, y + 12, 6, 5, hex("#8a4b32"));
  buffer.fillRect(x + 5, y + 16, 4, 2, hex("#5c331f"));
  buffer.fillRect(x + 1, y + 5, 12, 8, hex("#2f7d4a"));
  buffer.fillRect(x + 3, y + 2, 8, 5, hex("#3f9a5c"));
  buffer.fillRect(x + 4, y + 7, 3, 2, hex("#1e5a34"));
}

function paintDesk(buffer: PixelBuffer, desk: Rect, accent: Rgb) {
  bevel(buffer, desk.x, desk.y, desk.width, desk.height, WOOD);
  buffer.fillRect(desk.x + 2, desk.y + 2, desk.width - 4, 1, shade(WOOD, 0.18));
  const screenX = desk.x + Math.round(desk.width / 2) - 8;
  bevel(buffer, screenX, desk.y + 2, 16, 9, INK);
  buffer.fillRect(screenX + 2, desk.y + 4, 12, 5, accent);
  buffer.fillRect(screenX + 7, desk.y + 11, 2, 2, WOOD_DARK);
  buffer.fillRect(desk.x + 4, desk.y + desk.height - 4, 12, 2, hex("#2c2824"));
  buffer.fillRect(desk.x + desk.width - 8, desk.y + 4, 4, 5, PAPER);
  buffer.fillRect(desk.x + desk.width - 5, desk.y + 5, 2, 2, shade(accent, 0.2));
}

function paintChair(buffer: PixelBuffer, centerX: number, feetY: number) {
  const wood = hex("#6a432c");
  buffer.fillRect(centerX - 12, feetY - 20, 3, 14, wood);
  buffer.fillRect(centerX + 9, feetY - 20, 3, 14, shade(wood, -0.12));
  buffer.fillRect(centerX - 12, feetY - 8, 24, 4, shade(wood, 0.08));
}

function paintShelf(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y, 34, 24, WOOD_DARK);
  const books = ["#8d3d4a", "#d4c07a", "#3d6b8d", "#6a8f4e", "#c46b3a", "#3d3d6b", "#d27a4a"];
  let cursor = x + 2;

  for (const color of books) {
    buffer.fillRect(cursor, y + 3, 3, 18, hex(color));
    buffer.fillRect(cursor, y + 3, 3, 1, shade(hex(color), 0.25));
    cursor += 4;
  }
}

function paintFlaskBench(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y + 14, 30, 10, WOOD);
  buffer.fillRect(x + 11, y + 2, 8, 4, hex("#d7f4f6"));
  buffer.fillRect(x + 13, y + 6, 4, 6, hex("#7fd0c8"));
  buffer.fillRect(x + 9, y + 11, 12, 3, hex("#c5ebe8"));
  buffer.fillRect(x + 14, y + 7, 1, 3, hex("#f7fffe"));
}

function paintStickyBoard(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y, 32, 24, hex("#6a5438"));
  buffer.fillRect(x + 2, y + 2, 28, 20, hex("#c4a574"));
  buffer.fillRect(x + 4, y + 4, 10, 8, hex("#f2d56b"));
  buffer.fillRect(x + 16, y + 4, 10, 8, hex("#f09ab8"));
  buffer.fillRect(x + 8, y + 13, 12, 7, hex("#8ec5ff"));
}

function paintBlocks(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y + 10, 28, 8, WOOD);
  bevel(buffer, x + 3, y + 4, 8, 8, hex("#e25b84"));
  bevel(buffer, x + 12, y + 2, 8, 10, hex("#8ec5ff"));
  bevel(buffer, x + 18, y + 6, 7, 6, hex("#e2b15a"));
}

function paintMoodboard(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y, 34, 26, hex("#6a3a48"));
  buffer.fillRect(x + 2, y + 2, 30, 22, hex("#d7b08a"));
  buffer.fillRect(x + 4, y + 4, 12, 8, hex("#f09ab8"));
  buffer.fillRect(x + 18, y + 4, 10, 6, hex("#f2d56b"));
  buffer.fillRect(x + 6, y + 14, 10, 7, hex("#8ec5ff"));
  buffer.fillRect(x + 18, y + 12, 10, 8, hex("#f6efe2"));
}

function paintSwatches(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y + 8, 22, 16, INK);
  const swatches = ["#e25b84", "#f2d56b", "#8ec5ff", "#7fd0c8"];
  swatches.forEach((color, index) => {
    buffer.fillRect(x + 3 + (index % 2) * 9, y + 11 + Math.floor(index / 2) * 6, 7, 4, hex(color));
  });
}

function paintSafe(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y, 24, 28, hex("#5d666e"));
  buffer.fillRect(x + 7, y + 8, 10, 10, hex("#d4b15a"));
  buffer.fillRect(x + 10, y + 11, 4, 4, hex("#3a3120"));
  buffer.fillRect(x + 4, y + 22, 16, 2, shade(hex("#5d666e"), 0.2));
}

function paintCabinet(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y, 20, 28, hex("#6a5438"));
  buffer.fillRect(x + 3, y + 3, 14, 6, shade(WOOD, 0.08));
  buffer.fillRect(x + 3, y + 11, 14, 6, shade(WOOD, 0.02));
  buffer.fillRect(x + 3, y + 19, 14, 6, shade(WOOD, -0.08));
  buffer.set(x + 15, y + 6, hex("#e2b15a"));
  buffer.set(x + 15, y + 14, hex("#e2b15a"));
  buffer.set(x + 15, y + 22, hex("#e2b15a"));
}

function paintRack(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y, 18, 34, hex("#23282e"));

  for (let index = 0; index < 4; index += 1) {
    buffer.fillRect(x + 2, y + 3 + index * 8, 14, 5, hex("#343b44"));
    buffer.fillRect(x + 4, y + 5 + index * 8, 2, 2, hex("#7dcea0"));
    buffer.fillRect(x + 8, y + 5 + index * 8, 2, 2, hex("#e2b15a"));
  }
}

function paintClipboard(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y, 18, 24, CREAM);
  buffer.fillRect(x + 5, y - 1, 8, 3, hex("#8a8f96"));
  buffer.fillRect(x + 3, y + 6, 12, 1, hex("#8a7a62"));
  buffer.fillRect(x + 3, y + 10, 12, 1, hex("#8a7a62"));
  buffer.fillRect(x + 3, y + 14, 9, 1, hex("#8a7a62"));
}

function paintTicketBoard(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y, 34, 24, WOOD_DARK);
  buffer.fillRect(x + 2, y + 2, 30, 20, hex("#c4a574"));
  buffer.fillRect(x + 4, y + 4, 8, 7, PAPER);
  buffer.fillRect(x + 14, y + 5, 8, 7, hex("#f3d2dc"));
  buffer.fillRect(x + 8, y + 13, 8, 6, hex("#d5e8f6"));
  buffer.fillRect(x + 20, y + 12, 8, 7, hex("#f2d56b"));
}

function paintWaitingChairs(buffer: PixelBuffer, x: number, y: number) {
  bevel(buffer, x, y + 8, 28, 8, hex("#2f8f8a"));
  buffer.fillRect(x + 2, y + 2, 6, 8, hex("#245f5c"));
  buffer.fillRect(x + 16, y + 2, 6, 8, hex("#245f5c"));
  buffer.fillRect(x + 4, y + 16, 2, 4, WOOD_DARK);
  buffer.fillRect(x + 18, y + 16, 2, 4, WOOD_DARK);
}

function paintRoomProps(buffer: PixelBuffer, room: RoomLayout) {
  const left = room.rect.x + 8;
  const right = room.rect.x + room.rect.width - 40;
  const top = room.rect.y + ROOM_METRICS.propOffsetY;

  switch (room.id) {
    case "research":
      paintShelf(buffer, left, top);
      paintFlaskBench(buffer, right - 2, top);
      break;
    case "product":
      paintStickyBoard(buffer, left, top);
      paintBlocks(buffer, right, top + 4);
      break;
    case "marketing":
      paintMoodboard(buffer, left, top - 2);
      paintSwatches(buffer, right + 8, top);
      break;
    case "finance":
      paintSafe(buffer, left, top);
      paintCabinet(buffer, right + 8, top);
      break;
    case "operations":
      paintRack(buffer, left + 4, top);
      paintClipboard(buffer, right + 10, top);
      break;
    case "support":
      paintTicketBoard(buffer, left, top);
      paintWaitingChairs(buffer, right, top);
      break;
    default:
      break;
  }
}

function paintOpening(
  buffer: PixelBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  floor: Rgb,
  tall: boolean,
) {
  const jamb = hex("#241812");
  const sill = hex("#8a6a52");
  buffer.fillRect(x, y, width, height, floor);

  if (tall) {
    buffer.fillRect(x, y, width, 1, jamb);
    buffer.fillRect(x, y + height - 1, width, 1, sill);
    return;
  }

  buffer.fillRect(x, y, 1, height, jamb);
  buffer.fillRect(x + width - 1, y, 1, height, jamb);
  buffer.fillRect(x + 2, y + height - 1, width - 4, 1, sill);
}

function paintWindow(buffer: PixelBuffer, x: number, y: number) {
  buffer.fillRect(x, y, 28, 4, hex("#9fd7e8"));
  buffer.fillRect(x, y, 28, 1, hex("#e7f8ff"));
  buffer.fillRect(x + 13, y, 1, 4, WOOD_DARK);
}

function paintTree(buffer: PixelBuffer, x: number, y: number) {
  buffer.fillRect(x + 5, y + 10, 4, 6, WOOD_DARK);
  buffer.fillRect(x + 2, y + 4, 10, 8, hex("#2f6b45"));
  buffer.fillRect(x + 4, y + 2, 6, 4, hex("#3c8a56"));
  buffer.fillRect(x + 3, y + 6, 3, 2, hex("#214c32"));
}

function paintHall(buffer: PixelBuffer, hall: Rect) {
  paintFloor(buffer, hall, HALL, HALL_ALT);
  const rugWidth = 96;
  const rugHeight = 28;
  const rugX = hall.x + Math.round((hall.width - rugWidth) / 2);
  const rugY = hall.y + 14;
  bevel(buffer, rugX, rugY, rugWidth, rugHeight, hex("#5c4636"));
  buffer.fillRect(rugX + 3, rugY + 3, rugWidth - 6, rugHeight - 6, hex("#6d543f"));
  const title = measureText("AIMPIRE", 2);
  drawText(
    buffer,
    "AIMPIRE",
    rugX + Math.round((rugWidth - title.width) / 2),
    rugY + 8,
    PAPER,
    2,
  );
  paintPlant(buffer, hall.x + 10, hall.y + 16);
  paintPlant(buffer, hall.x + hall.width - 24, hall.y + 16);
}

function paintRoom(buffer: PixelBuffer, room: RoomLayout) {
  const department = departmentById(room.id);
  const floor = hex(department.floor);
  const floorAlt = hex(department.floorAlt);
  const accent = hex(department.accent);

  paintFloor(buffer, room.rect, floor, floorAlt);
  lightPool(
    buffer,
    room.rect.x + room.rect.width / 2,
    room.rect.y + room.rect.height / 2,
    30,
    18,
    accent,
  );
  buffer.fillRect(
    room.rect.x,
    room.rect.y + room.rect.height - 1,
    room.rect.width,
    1,
    shade(floor, -0.22),
  );
  paintChair(buffer, room.agent.x, room.agent.y);
  buffer.fillRect(room.agent.x - 14, room.agent.y - 6, 28, 8, shade(accent, -0.45));
  paintRoomProps(buffer, room);
  paintDesk(buffer, room.desk, accent);
  paintLabel(buffer, room.rect.x + room.rect.width / 2, room.sign.y, room.sign.text, 2, WOOD_DARK, PAPER);
  const nameScale = measureText(room.agent.displayName, 2).width > room.rect.width - 16 ? 1 : 2;
  paintLabel(
    buffer,
    room.agent.x,
    room.rect.y + ROOM_METRICS.nameOffsetY,
    room.agent.displayName,
    nameScale,
    INK,
    PAPER,
  );
}

export function paintOffice(options: AiWorldOptions = {}): PaintedOffice {
  const layout = buildOfficeLayout(options);
  const background = new PixelBuffer(WORLD_WIDTH, WORLD_HEIGHT);

  paintCourtyard(background);
  paintBrick(background);
  layout.rooms.forEach((room) => paintRoom(background, room));
  paintHall(background, layout.hall);

  layout.rooms.forEach((room) => {
    const doorX = room.rect.x + Math.round(room.rect.width / 2) - 16;
    const doorY = room.rect.y < layout.hall.y ? room.rect.y + room.rect.height : layout.hall.y + layout.hall.height;
    paintOpening(background, doorX, doorY, 32, 8, HALL, false);
    const windowY = room.rect.y < layout.hall.y ? 18 : WORLD_HEIGHT - 22;
    paintWindow(background, room.rect.x + Math.round(room.rect.width / 2) - 14, windowY);
  });

  paintOpening(background, 16, layout.hall.y + 12, 8, 32, HALL, true);
  background.fillRect(0, layout.hall.y + 16, 16, 24, hex("#3c463f"));
  background.fillRect(0, layout.hall.y + 26, 16, 2, hex("#4a554c"));
  paintTree(background, 4, 40);
  paintTree(background, WORLD_WIDTH - 28, 36);
  paintTree(background, WORLD_WIDTH - 32, WORLD_HEIGHT - 40);
  paintTree(background, 8, WORLD_HEIGHT - 48);

  const characters = layout.rooms.map((room) => {
    const department = departmentById(room.id);

    return {
      visualId: room.agent.visualId,
      departmentId: room.id,
      displayName: room.agent.displayName,
      x: room.agent.x,
      y: room.agent.y,
      frames: [
        paintCharacter(department.agent, 0),
        paintCharacter(department.agent, 1),
      ] as [PixelBuffer, PixelBuffer],
    };
  });

  return { layout, background, characters };
}
