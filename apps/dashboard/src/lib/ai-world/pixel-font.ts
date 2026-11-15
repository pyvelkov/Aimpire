import type { Rgb } from "./color";
import { PixelBuffer } from "./pixel-buffer";

const FONT: Record<string, readonly string[]> = {
  " ": ["000", "000", "000", "000", "000"],
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "110", "100", "110", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "101", "101", "101"],
  N: ["110", "101", "101", "101", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "011", "001"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "010", "010"],
  W: ["101", "101", "101", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
};

export function supportedGlyphs(): string[] {
  return Object.keys(FONT);
}

export function measureText(text: string, scale: number): { width: number; height: number } {
  const source = text.toUpperCase();

  if (source.length === 0 || scale <= 0) {
    return { width: 0, height: 0 };
  }

  const letter = 3 * scale;
  const gap = scale;

  return {
    width: source.length * letter + (source.length - 1) * gap,
    height: 5 * scale,
  };
}

export function drawText(
  buffer: PixelBuffer,
  text: string,
  x: number,
  y: number,
  color: Rgb,
  scale: number,
) {
  if (scale <= 0) {
    return;
  }

  let cursor = x;

  for (const character of text.toUpperCase()) {
    const glyph = FONT[character] ?? FONT[" "];

    if (character !== " ") {
      glyph.forEach((row, rowIndex) => {
        for (let column = 0; column < row.length; column += 1) {
          if (row[column] === "1") {
            buffer.fillRect(cursor + column * scale, y + rowIndex * scale, scale, scale, color);
          }
        }
      });
    }

    cursor += 3 * scale + scale;
  }
}
