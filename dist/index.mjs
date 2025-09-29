// src/preprocess.ts
function computeLetterbox(srcW, srcH, inputSize) {
  const s = Math.min(inputSize / srcW, inputSize / srcH);
  const newW = Math.round(srcW * s);
  const newH = Math.round(srcH * s);
  const dx = Math.floor((inputSize - newW) / 2);
  const dy = Math.floor((inputSize - newH) / 2);
  return { inputSize, scale: s, dx, dy, resized: { width: newW, height: newH } };
}
function mapFromLetterbox(x, y, srcW, srcH, p, normalized = false) {
  const px = normalized ? x * p.inputSize : x;
  const py = normalized ? y * p.inputSize : y;
  const ox = Math.max(0, Math.min(srcW, (px - p.dx) / p.scale));
  const oy = Math.max(0, Math.min(srcH, (py - p.dy) / p.scale));
  return { x: ox, y: oy };
}
function normalizeUint8ToFloat32(src, mean = [0, 0, 0], std = [1, 1, 1]) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    out[i] = (src[i] / 255 - mean[0]) / std[0];
    out[i + 1] = (src[i + 1] / 255 - mean[1]) / std[1];
    out[i + 2] = (src[i + 2] / 255 - mean[2]) / std[2];
  }
  return out;
}

// src/metrics.ts
function pck(pred, gt, bboxDiagPixels, alpha = 0.1) {
  const n = Math.min(pred.length, gt.length);
  if (n === 0 || bboxDiagPixels <= 0) return 0;
  const thr = alpha * bboxDiagPixels;
  let correct = 0;
  for (let i = 0; i < n; i++) {
    const dx = pred[i].x - gt[i].x;
    const dy = pred[i].y - gt[i].y;
    if (Math.hypot(dx, dy) <= thr) correct++;
  }
  return correct / n;
}

export { computeLetterbox, mapFromLetterbox, normalizeUint8ToFloat32, pck };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map