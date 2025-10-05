'use strict';

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

exports.computeLetterbox = computeLetterbox;
exports.mapFromLetterbox = mapFromLetterbox;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map