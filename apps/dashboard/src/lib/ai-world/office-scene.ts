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
import type { AiWorldOptions } from "./types";

const RESET_EVENT = "ai-world-reset-camera";

export class OfficeScene extends Phaser.Scene {
  private options: AiWorldOptions = {};
  private dragging = false;

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

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    office.characters.forEach((character, index) => {
      const idleKey = `${character.visualId}-idle`;
      const blinkKey = `${character.visualId}-blink`;
      this.addNearestTexture(idleKey, character.frames[0]);
      this.addNearestTexture(blinkKey, character.frames[1]);

      const sprite = this.add.image(character.x, character.y, idleKey).setOrigin(0.5, 1);
      sprite.setDepth(10);

      if (reduceMotion) {
        return;
      }

      this.tweens.add({
        targets: sprite,
        y: character.y - 1,
        duration: 1100 + index * 90,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

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
  }

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
    if (pointer.leftButtonDown()) {
      this.dragging = true;
    }
  };

  private readonly onPointerUp = () => {
    this.dragging = false;
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
  };
}

export { RESET_EVENT };
