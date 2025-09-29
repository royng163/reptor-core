export interface LetterboxParams {
  inputSize: number;       // model square input (e.g., 256/384/640)
  scale: number;           // scale applied to src -> resized
  dx: number;              // left padding in pixels in model input space
  dy: number;              // top padding in pixels in model input space
  resized: { width: number; height: number };
}

/**
 * Compute centered letterbox to fit src into a square inputSize.
 * Returns scale and padding for accurate coordinate unprojection.
 */
export function computeLetterbox(srcW: number, srcH: number, inputSize: number): LetterboxParams {
  const s = Math.min(inputSize / srcW, inputSize / srcH);
  const newW = Math.round(srcW * s);
  const newH = Math.round(srcH * s);
  const dx = Math.floor((inputSize - newW) / 2);
  const dy = Math.floor((inputSize - newH) / 2);
  return { inputSize, scale: s, dx, dy, resized: { width: newW, height: newH } };
}

/**
 * Map point from model input space back to original source pixel space.
 * If model outputs normalized coords [0..1], set normalized=true.
 */
export function mapFromLetterbox(
  x: number,
  y: number,
  srcW: number,
  srcH: number,
  p: LetterboxParams,
  normalized = false
): { x: number; y: number } {
  const px = normalized ? x * p.inputSize : x;
  const py = normalized ? y * p.inputSize : y;
  const ox = Math.max(0, Math.min(srcW, (px - p.dx) / p.scale));
  const oy = Math.max(0, Math.min(srcH, (py - p.dy) / p.scale));
  return { x: ox, y: oy };
}

/**
 * Per-channel mean/std normalization into Float32Array.
 * Assumes packed RGB byte data (no alpha).
 */
export function normalizeUint8ToFloat32(
  src: Uint8Array,
  mean: [number, number, number] = [0, 0, 0],
  std: [number, number, number] = [1, 1, 1]
): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    out[i] = (src[i] / 255 - mean[0]) / std[0];
    out[i + 1] = (src[i + 1] / 255 - mean[1]) / std[1];
    out[i + 2] = (src[i + 2] / 255 - mean[2]) / std[2];
  }
  return out;
}