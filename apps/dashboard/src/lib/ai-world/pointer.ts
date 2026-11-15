export function pointerDistance(
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export const SELECT_DRAG_THRESHOLD = 5;

export function shouldSelectCharacter(distance: number): boolean {
  return distance < SELECT_DRAG_THRESHOLD;
}

export function characterBounds(feetX: number, feetY: number, width = 16, height = 24) {
  return {
    x: feetX - width / 2,
    y: feetY - height,
    width,
    height,
  };
}

export function containsPoint(
  bounds: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
): boolean {
  return point.x >= bounds.x
    && point.y >= bounds.y
    && point.x <= bounds.x + bounds.width
    && point.y <= bounds.y + bounds.height;
}
