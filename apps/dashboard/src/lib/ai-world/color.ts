export type Rgb = {
  r: number;
  g: number;
  b: number;
};

function channel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function hex(value: string): Rgb {
  const normalized = value.replace("#", "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid color ${value}`);
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  const ratio = Math.max(0, Math.min(1, amount));

  return {
    r: channel(from.r + (to.r - from.r) * ratio),
    g: channel(from.g + (to.g - from.g) * ratio),
    b: channel(from.b + (to.b - from.b) * ratio),
  };
}

export function shade(color: Rgb, amount: number): Rgb {
  const target = amount < 0 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  return mix(color, target, Math.abs(amount));
}
