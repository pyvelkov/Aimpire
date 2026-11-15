import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  frameScroll,
  homeCamera,
  homeZoom,
  panCamera,
  stepZoom,
  visibleTopLeft,
  zoomAtPointer,
} from "./camera";
import { paintCharacter } from "./characters";
import { hex } from "./color";
import { DEPARTMENTS, resolveVisualAgents } from "./departments";
import { createGameLifecycle } from "./lifecycle";
import {
  buildOfficeLayout,
  containsPoint,
  containsRect,
  intersects,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./layout";
import { floorPixel, paintOffice } from "./paint-office";
import { drawText, measureText, supportedGlyphs } from "./pixel-font";
import { PixelBuffer } from "./pixel-buffer";
import { DEPARTMENT_IDS, type DepartmentId } from "./types";

function differingBytes(left: Uint8ClampedArray, right: Uint8ClampedArray): number {
  let count = 0;
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      count += 1;
    }
  }

  return count + Math.abs(left.length - right.length);
}

function checksum(data: Uint8ClampedArray): number {
  let hash = 0;

  for (let index = 0; index < data.length; index += 16) {
    hash = (hash + data[index] * (index + 1)) % 1000000007;
  }

  return hash;
}

describe("headquarters layout", () => {
  it("places six distinct departments inside the building", () => {
    const layout = buildOfficeLayout();

    assert.deepEqual(layout.rooms.map((room) => room.id), [...DEPARTMENT_IDS]);
    assert.equal(layout.world.width, WORLD_WIDTH);
    assert.equal(layout.world.height, WORLD_HEIGHT);
    assert.equal(new Set(layout.rooms.map((room) => room.agent.visualId)).size, 6);

    const world = { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT };

    for (let index = 0; index < layout.rooms.length; index += 1) {
      const room = layout.rooms[index];
      assert.equal(containsRect(world, room.rect), true);
      assert.equal(containsRect(room.rect, room.sign), true);
      assert.equal(containsRect(room.rect, room.desk), true);
      assert.equal(containsPoint(room.rect, room.agent.x, room.agent.y - 1), true);
      assert.equal(intersects(room.rect, layout.hall), false);

      for (const other of layout.rooms.slice(index + 1)) {
        assert.equal(intersects(room.rect, other.rect), false);
      }
    }
  });
});

describe("visual cast", () => {
  it("keeps the default roster free of task state", () => {
    const agents = resolveVisualAgents();

    assert.equal(agents.length, 6);

    for (const agent of agents) {
      assert.equal(agent.agentId, undefined);
      assert.equal("task" in agent, false);
      assert.equal("progress" in agent, false);
      assert.equal("status" in agent, false);
      assert.equal(agent.displayName.length > 0, true);
    }
  });

  it("accepts identity overrides and ignores blank names", () => {
    const agents = resolveVisualAgents([
      { departmentId: "finance", displayName: "  Ada  ", agentId: " agent-1 " },
      { departmentId: "research", displayName: "   " },
      { departmentId: "nope" as DepartmentId, displayName: "Ghost" },
    ]);

    assert.equal(agents.find((agent) => agent.departmentId === "finance")?.displayName, "Ada");
    assert.equal(agents.find((agent) => agent.departmentId === "finance")?.agentId, "agent-1");
    assert.equal(agents.find((agent) => agent.departmentId === "research")?.displayName, "Nova");
    assert.equal(agents.length, 6);
  });

  it("gives every character a visible blink frame", () => {
    const hashes = DEPARTMENTS.map((department) => {
      const idle = paintCharacter(department.agent, 0);
      const blink = paintCharacter(department.agent, 1);
      assert.ok(idle.countOpaque() > 40);
      assert.ok(differingBytes(idle.data, blink.data) > 0);
      return checksum(idle.data);
    });

    assert.equal(new Set(hashes).size, DEPARTMENTS.length);
  });
});

describe("office painting", () => {
  it("fills the map and keeps each department floor", () => {
    const painted = paintOffice();

    assert.equal(painted.background.width, WORLD_WIDTH);
    assert.equal(painted.background.height, WORLD_HEIGHT);
    assert.equal(painted.background.countOpaque(), WORLD_WIDTH * WORLD_HEIGHT);
    assert.equal(painted.characters.length, 6);

    for (const room of painted.layout.rooms) {
      const department = DEPARTMENTS.find((entry) => entry.id === room.id);
      assert.ok(department);
      const x = room.rect.x + 3;
      const y = room.rect.y + 3;
      const sample = painted.background.get(x, y);
      const expected = floorPixel(x, y, hex(department.floor), hex(department.floorAlt));
      assert.deepEqual(sample && { r: sample.r, g: sample.g, b: sample.b }, expected);

      const doorX = room.rect.x + Math.round(room.rect.width / 2);
      const doorY = room.rect.y < painted.layout.hall.y
        ? room.rect.y + room.rect.height + 3
        : painted.layout.hall.y + painted.layout.hall.height + 3;
      const doorway = painted.background.get(doorX, doorY);
      assert.deepEqual(doorway && { r: doorway.r, g: doorway.g, b: doorway.b }, hex("#3a322c"));
    }

    const renamed = paintOffice({
      roster: [{ departmentId: "support", displayName: "Nia" }],
    });
    assert.equal(renamed.characters.find((character) => character.departmentId === "support")?.displayName, "Nia");
    assert.doesNotThrow(() => paintOffice({
      roster: [{ departmentId: "marketing", displayName: "Campaign Lead With A Very Long Name" }],
    }));
  });
});

describe("camera", () => {
  it("zooms in integer steps and keeps the pointer anchored", () => {
    assert.equal(stepZoom(2, 120), 1);
    assert.equal(stepZoom(2, -120), 3);
    assert.equal(stepZoom(1, 120), 1);
    assert.equal(stepZoom(4, -120), 4);
    assert.equal(homeZoom(1100, 680), 2);
    assert.equal(homeZoom(400, 420), 1);

    const view = { width: 900, height: 700 };
    const before = homeCamera(view.width, view.height);
    const pointer = { x: 120, y: 80 };
    const origin = visibleTopLeft(before, view);
    const worldX = origin.x + pointer.x / before.zoom;
    const worldY = origin.y + pointer.y / before.zoom;
    const after = zoomAtPointer(before, pointer, -100, view);
    const anchored = visibleTopLeft(after, view);

    assert.equal(after.zoom, before.zoom + 1);
    assert.ok(Math.abs(anchored.x + pointer.x / after.zoom - worldX) <= 1);
    assert.ok(Math.abs(anchored.y + pointer.y / after.zoom - worldY) <= 1);
  });

  it("can pan to every edge after zooming in", () => {
    const view = { width: 800, height: 600 };
    let camera = homeCamera(view.width, view.height);
    assert.equal(camera.zoom, 2);

    for (let step = 0; step < 40; step += 1) {
      camera = panCamera(camera, 50, 50, view);
    }

    const topLeft = visibleTopLeft(camera, view);
    assert.ok(topLeft.x <= 1);
    assert.ok(topLeft.y <= 1);

    for (let step = 0; step < 40; step += 1) {
      camera = panCamera(camera, -50, -50, view);
    }

    const bottomRight = visibleTopLeft(camera, view);
    const visibleWidth = view.width / camera.zoom;
    const visibleHeight = view.height / camera.zoom;
    assert.ok(Math.abs(bottomRight.x - (WORLD_WIDTH - visibleWidth)) <= 1);
    assert.ok(Math.abs(bottomRight.y - (WORLD_HEIGHT - visibleHeight)) <= 1);
    assert.ok(camera.scrollX < 0);
    assert.ok(camera.scrollY < 0);
  });

  it("frames the full office", () => {
    const home = homeCamera(1100, 680);
    const origin = visibleTopLeft(home, { width: 1100, height: 680 });
    assert.equal(home.zoom, 2);
    assert.equal(Number.isInteger(home.scrollX), true);
    assert.equal(Number.isInteger(home.scrollY), true);
    assert.ok(origin.x < 80);
    assert.ok(origin.y < 40);

    const wide = frameScroll(0, 0, 1, 2000, 1600);
    assert.equal(wide.scrollX, Math.round((WORLD_WIDTH - 2000) / 2));
    assert.equal(wide.scrollY, Math.round((WORLD_HEIGHT - 1600) / 2));
  });
});

describe("game lifecycle", () => {
  it("destroys a game that resolves after unmount and never twice", () => {
    const lifecycle = createGameLifecycle();
    let destroyed = 0;
    const game = {
      destroy() {
        destroyed += 1;
      },
    };

    assert.equal(lifecycle.attach(game), game);
    lifecycle.dispose();
    lifecycle.dispose();
    assert.equal(destroyed, 1);
    assert.equal(lifecycle.attach({ destroy() { destroyed += 1; } }), null);
    assert.equal(destroyed, 2);
  });

  it("replaces an older instance", () => {
    const lifecycle = createGameLifecycle();
    let first = 0;
    let second = 0;

    lifecycle.attach({ destroy() { first += 1; } });
    lifecycle.attach({ destroy() { second += 1; } });
    assert.equal(first, 1);
    assert.equal(second, 0);
    lifecycle.dispose();
    assert.equal(second, 1);
  });
});

describe("pixel font", () => {
  it("draws uppercase glyphs on a 3 by 5 grid", () => {
    assert.equal(supportedGlyphs().length, 27);
    assert.deepEqual(measureText("A", 1), { width: 3, height: 5 });
    assert.deepEqual(measureText("HI", 2), { width: 14, height: 10 });

    const buffer = new PixelBuffer(8, 8);
    drawText(buffer, "A", 0, 0, hex("#ffffff"), 1);
    assert.equal(buffer.get(1, 0)?.a, 255);
    assert.equal(buffer.get(0, 0)?.a, 0);
  });
});

describe("AI World integration boundaries", () => {
  it("boots Phaser only in the browser and tears the scene down", () => {
    const read = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    const mountSource = read("./mount-ai-world.ts");
    const sceneSource = read("./office-scene.ts");
    const stageSource = read("../../components/ai-world/ai-world-stage.tsx");
    const canvasSource = read("../../components/ai-world/ai-world-canvas.tsx");
    const pageSource = read("../../app/(console)/ai-world/page.tsx");
    const navSource = read("../../components/console-nav.tsx");
    const redirectSource = read("../../app/(console)/world/page.tsx");

    assert.match(mountSource, /typeof window === "undefined"/);
    assert.match(mountSource, /destroy\(true\)/);
    assert.match(sceneSource, /Scenes\.Events\.SHUTDOWN/);
    assert.match(sceneSource, /removeAllEvents/);
    assert.match(sceneSource, /\.off\(/);
    assert.match(stageSource, /createGameLifecycle/);
    assert.match(stageSource, /import\("@\/lib\/ai-world\/mount-ai-world"\)/);
    assert.match(canvasSource, /ssr:\s*false/);
    assert.match(pageSource, /AiWorldScreen/);
    assert.doesNotMatch(pageSource, /phaser/i);
    assert.match(navSource, /href: "\/ai-world"/);
    assert.match(redirectSource, /redirect\("\/ai-world"\)/);
    assert.equal(existsSync(fileURLToPath(new URL("../../components/stage-page.tsx", import.meta.url))), false);
  });
});
