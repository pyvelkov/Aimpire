import { PixelBuffer } from "./pixel-buffer";

export function pixelBufferToCanvas(buffer: PixelBuffer): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("AI World could not create a canvas");
  }

  const pixels = new Uint8ClampedArray(buffer.width * buffer.height * 4);
  pixels.set(buffer.data);
  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(pixels, buffer.width, buffer.height), 0, 0);
  return canvas;
}
