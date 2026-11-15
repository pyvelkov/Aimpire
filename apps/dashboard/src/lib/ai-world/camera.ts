import { WORLD_HEIGHT, WORLD_WIDTH } from "./layout";

export const ZOOM_STEPS = [1, 2, 3, 4] as const;

export type CameraView = {
  zoom: number;
  scrollX: number;
  scrollY: number;
};

export type Viewport = {
  width: number;
  height: number;
};

export type PointerPoint = {
  x: number;
  y: number;
};

function nearestZoomIndex(current: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  ZOOM_STEPS.forEach((step, index) => {
    const distance = Math.abs(step - current);

    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });

  return best;
}

export function stepZoom(current: number, deltaY: number): number {
  const index = nearestZoomIndex(current);

  if (deltaY === 0) {
    return ZOOM_STEPS[index];
  }

  const direction = deltaY > 0 ? -1 : 1;
  const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction));
  return ZOOM_STEPS[next];
}

export function homeZoom(viewWidth: number, viewHeight: number): number {
  if (viewWidth <= 0 || viewHeight <= 0) {
    return 1;
  }

  const fit = Math.min(viewWidth / WORLD_WIDTH, viewHeight / WORLD_HEIGHT);
  const fitting = ZOOM_STEPS.filter((step) => step <= fit + 0.02);

  if (fitting.length === 0) {
    return 1;
  }

  const largest = fitting[fitting.length - 1];
  const next = ZOOM_STEPS[ZOOM_STEPS.indexOf(largest) + 1];

  if (next && fit >= largest * 1.45) {
    return next;
  }

  return largest;
}

function visibleSize(zoom: number, view: Viewport): Viewport {
  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    width: view.width / safeZoom,
    height: view.height / safeZoom,
  };
}

/**
 * Phaser keeps `scrollX/scrollY` at the top-left only while zoom is 1.
 * The rendered view is centered on `scroll + viewport / 2`, then scaled.
 */
export function visibleTopLeft(camera: CameraView, view: Viewport): PointerPoint {
  const visible = visibleSize(camera.zoom, view);
  return {
    x: camera.scrollX + view.width / 2 - visible.width / 2,
    y: camera.scrollY + view.height / 2 - visible.height / 2,
  };
}

function scrollForTopLeft(x: number, y: number, zoom: number, view: Viewport): CameraView {
  const visible = visibleSize(zoom, view);
  return {
    zoom,
    scrollX: Math.round(x - view.width / 2 + visible.width / 2),
    scrollY: Math.round(y - view.height / 2 + visible.height / 2),
  };
}

function clampTopLeft(x: number, y: number, zoom: number, view: Viewport): PointerPoint {
  const visible = visibleSize(zoom, view);
  return {
    x: visible.width >= WORLD_WIDTH
      ? (WORLD_WIDTH - visible.width) / 2
      : Math.min(WORLD_WIDTH - visible.width, Math.max(0, x)),
    y: visible.height >= WORLD_HEIGHT
      ? (WORLD_HEIGHT - visible.height) / 2
      : Math.min(WORLD_HEIGHT - visible.height, Math.max(0, y)),
  };
}

export function frameScroll(
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewWidth: number,
  viewHeight: number,
): { scrollX: number; scrollY: number } {
  const view = { width: viewWidth, height: viewHeight };
  const origin = visibleTopLeft({ zoom, scrollX, scrollY }, view);
  const clamped = clampTopLeft(origin.x, origin.y, zoom, view);
  const next = scrollForTopLeft(clamped.x, clamped.y, zoom, view);
  return { scrollX: next.scrollX, scrollY: next.scrollY };
}

export function homeCamera(viewWidth: number, viewHeight: number): CameraView {
  const zoom = homeZoom(viewWidth, viewHeight);
  const visibleWidth = viewWidth / zoom;
  const visibleHeight = viewHeight / zoom;

  return {
    zoom,
    ...frameScroll(
      (WORLD_WIDTH - visibleWidth) / 2,
      (WORLD_HEIGHT - visibleHeight) / 2,
      zoom,
      viewWidth,
      viewHeight,
    ),
  };
}

export function panCamera(camera: CameraView, dx: number, dy: number, view: Viewport): CameraView {
  const origin = visibleTopLeft(camera, view);
  const next = clampTopLeft(
    origin.x - dx / camera.zoom,
    origin.y - dy / camera.zoom,
    camera.zoom,
    view,
  );
  return scrollForTopLeft(next.x, next.y, camera.zoom, view);
}

export function zoomAtPointer(
  camera: CameraView,
  pointer: PointerPoint,
  deltaY: number,
  view: Viewport,
): CameraView {
  const zoom = stepZoom(camera.zoom, deltaY);
  const origin = visibleTopLeft(camera, view);
  const worldX = origin.x + pointer.x / camera.zoom;
  const worldY = origin.y + pointer.y / camera.zoom;
  const next = clampTopLeft(
    worldX - pointer.x / zoom,
    worldY - pointer.y / zoom,
    zoom,
    view,
  );
  return scrollForTopLeft(next.x, next.y, zoom, view);
}
