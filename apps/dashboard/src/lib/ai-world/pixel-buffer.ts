import type { Rgb } from "./color";

export class PixelBuffer {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error("PixelBuffer size must be a positive integer");
    }

    this.data = new Uint8ClampedArray(width * height * 4);
  }

  set(x: number, y: number, color: Rgb, alpha = 255) {
    const px = x | 0;
    const py = y | 0;

    if (px < 0 || py < 0 || px >= this.width || py >= this.height) {
      return;
    }

    const index = (py * this.width + px) * 4;
    this.data[index] = color.r;
    this.data[index + 1] = color.g;
    this.data[index + 2] = color.b;
    this.data[index + 3] = alpha;
  }

  get(x: number, y: number): { r: number; g: number; b: number; a: number } | null {
    const px = x | 0;
    const py = y | 0;

    if (px < 0 || py < 0 || px >= this.width || py >= this.height) {
      return null;
    }

    const index = (py * this.width + px) * 4;

    return {
      r: this.data[index],
      g: this.data[index + 1],
      b: this.data[index + 2],
      a: this.data[index + 3],
    };
  }

  fillRect(x: number, y: number, width: number, height: number, color: Rgb, alpha = 255) {
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.width, (x | 0) + (width | 0));
    const y1 = Math.min(this.height, (y | 0) + (height | 0));

    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        this.set(px, py, color, alpha);
      }
    }
  }

  countOpaque(): number {
    let count = 0;

    for (let index = 3; index < this.data.length; index += 4) {
      if (this.data[index] > 0) {
        count += 1;
      }
    }

    return count;
  }
}
