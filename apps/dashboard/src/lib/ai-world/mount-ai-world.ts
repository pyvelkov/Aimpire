import Phaser from "phaser";
import { OfficeScene, RESET_EVENT, SELECT_EVENT, STATE_EVENT } from "./office-scene";
import type { AiWorldHandle, AiWorldLiveSnapshot, AiWorldOptions, DepartmentId } from "./types";

export async function startAiWorld(
  parent: HTMLElement,
  options: AiWorldOptions = {},
): Promise<AiWorldHandle> {
  if (typeof window === "undefined") {
    throw new Error("AI World can only start in the browser");
  }

  const scene = new OfficeScene();
  scene.prepare(options);

  const width = Math.max(1, Math.floor(parent.clientWidth));
  const height = Math.max(1, Math.floor(parent.clientHeight));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: "#1a2420",
    pixelArt: true,
    roundPixels: true,
    banner: false,
    autoFocus: false,
    disableContextMenu: true,
    audio: { noAudio: true },
    fps: { target: 30, limit: 30 },
    canvasStyle: "display:block; image-rendering:pixelated; image-rendering:crisp-edges;",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width,
      height,
    },
    input: {
      mouse: {
        preventDefaultWheel: true,
      },
    },
    render: {
      antialias: false,
      pixelArt: true,
      roundPixels: true,
    },
    scene,
  });

  let destroyed = false;
  let selectListener: ((departmentId: DepartmentId | null) => void) | null = null;
  const onSelect = (departmentId: DepartmentId | null) => {
    selectListener?.(departmentId);
  };
  game.events.on(SELECT_EVENT, onSelect);

  const destroy = () => {
    if (destroyed) {
      return;
    }

    destroyed = true;
    selectListener = null;
    game.events.off(SELECT_EVENT, onSelect);

    try {
      game.destroy(true);
    } catch {
      // A frame can overlap navigation. The parent is cleared below either way.
    }

    parent.replaceChildren();
  };

  return {
    resetCamera() {
      if (!destroyed) {
        game.events.emit(RESET_EVENT);
      }
    },
    resize() {
      if (destroyed) {
        return;
      }

      const nextWidth = Math.floor(parent.clientWidth);
      const nextHeight = Math.floor(parent.clientHeight);

      if (nextWidth > 0 && nextHeight > 0) {
        game.scale.setParentSize(nextWidth, nextHeight);
      }
    },
    applyState(snapshot: AiWorldLiveSnapshot | null) {
      if (!destroyed) {
        game.events.emit(STATE_EVENT, snapshot);
      }
    },
    setSelectListener(listener) {
      selectListener = listener;
    },
    destroy,
  };
}
