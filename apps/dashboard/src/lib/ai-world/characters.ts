import { hex, shade } from "./color";
import { PixelBuffer } from "./pixel-buffer";
import type { CharacterSpec } from "./types";

export const CHARACTER_WIDTH = 16;
export const CHARACTER_HEIGHT = 24;

const INK = hex("#1c1915");
const HIGHLIGHT = hex("#f7f4ef");

function paintHair(buffer: PixelBuffer, spec: CharacterSpec) {
  const hair = hex(spec.hair);
  const dark = shade(hair, -0.22);
  const light = shade(hair, 0.16);

  switch (spec.hairStyle) {
    case "short":
      buffer.fillRect(4, 1, 8, 3, hair);
      buffer.fillRect(4, 4, 1, 2, dark);
      buffer.fillRect(11, 4, 1, 2, dark);
      break;
    case "bob":
      buffer.fillRect(3, 1, 10, 3, hair);
      buffer.fillRect(3, 4, 2, 6, hair);
      buffer.fillRect(11, 4, 2, 6, dark);
      break;
    case "bun":
      buffer.fillRect(4, 2, 8, 2, hair);
      buffer.fillRect(6, 0, 4, 3, dark);
      buffer.set(7, 1, light);
      break;
    case "part":
      buffer.fillRect(4, 1, 8, 3, hair);
      buffer.fillRect(4, 4, 2, 2, dark);
      buffer.fillRect(8, 3, 1, 2, light);
      break;
    case "cap":
      buffer.fillRect(3, 0, 10, 3, hair);
      buffer.fillRect(2, 3, 12, 1, dark);
      buffer.fillRect(6, 1, 2, 1, light);
      break;
    case "beret":
      buffer.fillRect(4, 0, 8, 3, hair);
      buffer.fillRect(3, 2, 10, 2, dark);
      buffer.set(11, 0, light);
      break;
    default:
      break;
  }
}

function paintProp(buffer: PixelBuffer, spec: CharacterSpec) {
  switch (spec.prop) {
    case "goggles":
      buffer.fillRect(4, 5, 8, 1, hex("#49c2c2"));
      buffer.fillRect(4, 7, 3, 1, hex("#49c2c2"));
      buffer.fillRect(9, 7, 3, 1, hex("#49c2c2"));
      buffer.set(4, 6, hex("#49c2c2"));
      buffer.set(6, 6, hex("#49c2c2"));
      buffer.set(9, 6, hex("#49c2c2"));
      buffer.set(11, 6, hex("#49c2c2"));
      break;
    case "glasses":
      buffer.fillRect(4, 5, 3, 1, INK);
      buffer.fillRect(9, 5, 3, 1, INK);
      buffer.fillRect(4, 7, 3, 1, INK);
      buffer.fillRect(9, 7, 3, 1, INK);
      buffer.set(4, 6, INK);
      buffer.set(6, 6, INK);
      buffer.set(7, 6, INK);
      buffer.set(8, 6, INK);
      buffer.set(9, 6, INK);
      buffer.set(11, 6, INK);
      break;
    case "visor":
      buffer.fillRect(3, 5, 10, 1, hex("#e6c56e"));
      buffer.fillRect(2, 6, 1, 1, hex("#b8892e"));
      buffer.fillRect(13, 6, 1, 1, hex("#b8892e"));
      break;
    case "headset":
      buffer.fillRect(3, 2, 10, 1, INK);
      buffer.fillRect(3, 3, 1, 5, INK);
      buffer.fillRect(12, 3, 1, 4, INK);
      buffer.fillRect(13, 6, 2, 2, hex("#8fd0c8"));
      break;
    case "beret":
      buffer.fillRect(5, 0, 6, 2, hex("#1a1a1a"));
      buffer.set(10, 0, hex("#f2c14e"));
      break;
    default:
      break;
  }
}

function paintEyes(buffer: PixelBuffer, spec: CharacterSpec, frame: 0 | 1) {
  const skin = hex(spec.skin);

  if (frame === 1) {
    buffer.fillRect(5, 6, 2, 1, shade(skin, -0.35));
    buffer.fillRect(9, 6, 2, 1, shade(skin, -0.35));
    return;
  }

  buffer.fillRect(5, 6, 2, 1, INK);
  buffer.fillRect(9, 6, 2, 1, INK);
  buffer.set(5, 6, HIGHLIGHT);
  buffer.set(9, 6, HIGHLIGHT);
}

/** Procedural seated character. Frame 1 is a blink; the pose itself does not encode work. */
export function paintCharacter(spec: CharacterSpec, frame: 0 | 1): PixelBuffer {
  const buffer = new PixelBuffer(CHARACTER_WIDTH, CHARACTER_HEIGHT);
  const skin = hex(spec.skin);
  const shirt = hex(spec.shirt);
  const outer = hex(spec.outer);
  const pants = hex(spec.pants);
  const shoes = hex(spec.shoes);

  buffer.fillRect(3, 22, 10, 2, { r: 0, g: 0, b: 0 }, 80);
  buffer.fillRect(3, 20, 4, 2, shoes);
  buffer.fillRect(9, 20, 4, 2, shoes);
  buffer.fillRect(4, 16, 3, 4, pants);
  buffer.fillRect(9, 16, 3, 4, pants);
  buffer.fillRect(4, 10, 8, 7, outer);
  buffer.fillRect(6, 11, 4, 5, shirt);
  buffer.fillRect(4, 10, 1, 7, shade(outer, -0.24));
  buffer.fillRect(1, 12, 2, 5, outer);
  buffer.fillRect(13, 12, 2, 5, outer);
  buffer.fillRect(1, 16, 2, 2, skin);
  buffer.fillRect(13, 16, 2, 2, skin);
  buffer.fillRect(6, 9, 4, 2, skin);
  buffer.fillRect(4, 3, 8, 7, skin);
  buffer.set(7, 8, shade(skin, -0.25));

  paintHair(buffer, spec);
  paintProp(buffer, spec);
  paintEyes(buffer, spec, frame);

  return buffer;
}
