import Phaser from "phaser";
import {
  frameScroll,
  homeCamera,
  panCamera,
  zoomAtPointer,
  type CameraView,
} from "./camera";
import { pixelBufferToCanvas } from "./canvas-texture";
import { paintOffice } from "./paint-office";
import { levelLabel, progressionFromCompletedCount } from "./progression";
import { characterPace, completionNotices } from "./presence";
import {
  characterBounds,
  containsPoint,
  pointerDistance,
  shouldSelectCharacter,
} from "./pointer";
import type { AiWorldLiveDepartment, AiWorldLiveSnapshot, AiWorldOptions, DepartmentId } from "./types";

const RESET_EVENT = "ai-world-reset-camera";
const STATE_EVENT = "ai-world-state";
const SELECT_EVENT = "ai-world-select";

type Pace = "still" | "working" | "idle";

type Actor = {
  departmentId: DepartmentId;
  sprite: Phaser.GameObjects.Image;
  feetX: number;
  feetY: number;
  pace: Pace;
  queueBadge: Phaser.GameObjects.Text;
  failedBadge: Phaser.GameObjects.Text;
  levelLabel: Phaser.GameObjects.Text;
  notice: Phaser.GameObjects.Text;
  noticeTimer: Phaser.Time.TimerEvent | null;
};

export class OfficeScene extends Phaser.Scene {
  private options: AiWorldOptions = {};
  private dragging = false;
  private press: { x: number; y: number } | null = null;
  private reduceMotion = false;
  private actors: Actor[] = [];
  private previousDepartments: readonly AiWorldLiveDepartment[] | null = null;

  constructor() {
    super({ key: "office" });
  }

  prepare(options: AiWorldOptions) {
    this.options = options;
  }

  create() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    const office = paintOffice(this.options);
    this.addNearestTexture("office-floor", office.background);
    this.add.image(0, 0, "office-floor").setOrigin(0, 0);
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    office.characters.forEach((character, index) => {
      const idleKey = `${character.visualId}-idle`;
      const blinkKey = `${character.visualId}-blink`;
      this.addNearestTexture(idleKey, character.frames[0]);
      this.addNearestTexture(blinkKey, character.frames[1]);

      const sprite = this.add.image(character.x, character.y, idleKey).setOrigin(0.5, 1);
      sprite.setDepth(10);
      sprite.setInteractive({ useHandCursor: true });
      const actor: Actor = {
        departmentId: character.departmentId,
        sprite,
        feetX: character.x,
        feetY: character.y,
        pace: "still",
        queueBadge: this.badge(character.x + 28, character.y - 33, "#d7e4f5"),
        failedBadge: this.badge(character.x - 28, character.y - 33, "#f0b089"),
        levelLabel: this.badge(character.x, character.y + 3, "#f6efe2").setOrigin(0.5, 0),
        notice: this.badge(character.x, character.y - 46, "#f6efe2"),
        noticeTimer: null,
      };
      this.actors.push(actor);
      this.setPace(actor, this.reduceMotion ? "still" : "idle", index);

      if (this.reduceMotion) {
        return;
      }

      this.time.addEvent({
        delay: 1900 + index * 240,
        loop: true,
        callback: () => {
          if (!sprite.active) {
            return;
          }

          sprite.setTexture(blinkKey);
          this.time.delayedCall(140, () => {
            if (sprite.active) {
              sprite.setTexture(idleKey);
            }
          });
        },
      });
    });

    const camera = this.cameras.main;
    camera.roundPixels = true;
    camera.setBackgroundColor("#1a2420");
    this.applyView(homeCamera(camera.width, camera.height));

    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
    this.game.events.on(RESET_EVENT, this.onReset);
    this.game.events.on(STATE_EVENT, this.onState);
  }

  private badge(x: number, y: number, color: string) {
    return this.add.text(x, y, "", {
      fontFamily: "Courier New, monospace",
      fontSize: "8px",
      color,
      backgroundColor: "#1c1915",
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 0.5).setDepth(20).setVisible(false);
  }

  private setPace(actor: Actor, pace: Pace, index: number) {
    if (actor.pace === pace) {
      return;
    }
    actor.pace = pace;
    this.tweens.killTweensOf(actor.sprite);
    actor.sprite.y = actor.feetY;
    if (pace === "still") {
      return;
    }
    this.tweens.add({
      targets: actor.sprite,
      y: actor.feetY - (pace === "working" ? 2 : 1),
      duration: (pace === "working" ? 380 : 1100) + index * 40,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private showNotice(actor: Actor, label: string) {
    actor.notice.setText(label).setVisible(true);
    actor.noticeTimer?.remove(false);
    actor.noticeTimer = this.time.delayedCall(4000, () => {
      if (actor.notice.active) {
        actor.notice.setVisible(false);
      }
    });
  }

  private readonly onState = (snapshot: AiWorldLiveSnapshot | null) => {
    const departments = snapshot?.departments ?? null;
    const notices = completionNotices(this.previousDepartments, departments ?? []);
    this.previousDepartments = departments;

    this.actors.forEach((actor, index) => {
      const department = departments?.find((entry) => entry.department_id === actor.departmentId) ?? null;
      this.setPace(actor, characterPace(department, this.reduceMotion), index);
      const queued = department?.queued ?? 0;
      const failed = department?.failed ?? 0;
      actor.queueBadge.setText(queued > 9 ? "9+" : String(queued)).setVisible(queued > 0);
      actor.failedBadge.setText("!").setVisible(failed > 0);
      if (department) {
        const progression = progressionFromCompletedCount(department.completed);
        actor.levelLabel.setText(levelLabel(progression.level)).setVisible(true);
      } else {
        actor.levelLabel.setVisible(false);
      }
      const notice = notices.find((entry) => entry.departmentId === actor.departmentId);
      if (notice) {
        this.showNotice(actor, notice.label);
      }
    });
  };

  private addNearestTexture(key: string, buffer: Parameters<typeof pixelBufferToCanvas>[0]) {
    const texture = this.textures.addCanvas(key, pixelBufferToCanvas(buffer));
    texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private currentView(): CameraView {
    const camera = this.cameras.main;
    return {
      zoom: camera.zoom,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY,
    };
  }

  private viewport() {
    const camera = this.cameras.main;
    return { width: camera.width, height: camera.height };
  }

  private applyView(view: CameraView) {
    const camera = this.cameras.main;
    camera.setZoom(view.zoom);
    camera.setScroll(view.scrollX, view.scrollY);
  }

  private readonly onWheel = (
    pointer: Phaser.Input.Pointer,
    _currentlyOver: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ) => {
    this.applyView(zoomAtPointer(
      this.currentView(),
      { x: pointer.x, y: pointer.y },
      deltaY,
      this.viewport(),
    ));
  };

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer) => {
    if (!pointer.leftButtonDown()) {
      return;
    }
    this.dragging = true;
    this.press = { x: pointer.x, y: pointer.y };
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer) => {
    const press = this.press;
    this.press = null;
    this.dragging = false;
    if (!press || !shouldSelectCharacter(pointerDistance(press, pointer))) {
      return;
    }
    const hit = this.actors.find((actor) => containsPoint(
      characterBounds(actor.feetX, actor.feetY),
      { x: pointer.worldX, y: pointer.worldY },
    ));
    this.game.events.emit(SELECT_EVENT, hit?.departmentId ?? null);
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer) => {
    if (!this.dragging || !pointer.isDown) {
      return;
    }

    const dx = pointer.x - pointer.prevPosition.x;
    const dy = pointer.y - pointer.prevPosition.y;

    if (dx === 0 && dy === 0) {
      return;
    }

    this.applyView(panCamera(this.currentView(), dx, dy, this.viewport()));
  };

  private readonly onResize = () => {
    const view = this.currentView();
    const scroll = frameScroll(
      view.scrollX,
      view.scrollY,
      view.zoom,
      this.viewport().width,
      this.viewport().height,
    );
    this.cameras.main.setScroll(scroll.scrollX, scroll.scrollY);
  };

  private readonly onReset = () => {
    const camera = this.cameras.main;
    this.dragging = false;
    this.applyView(homeCamera(camera.width, camera.height));
  };

  private readonly shutdown = () => {
    this.dragging = false;
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
    this.game?.events.off(RESET_EVENT, this.onReset);
    this.game?.events.off(STATE_EVENT, this.onState);
  };
}

export { RESET_EVENT, SELECT_EVENT, STATE_EVENT };
