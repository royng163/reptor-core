import type { Keypoint } from './types';

/**
 * Percentage of Correct Keypoints relative to bbox diagonal threshold.
 */
export function pck(
  pred: Keypoint[],
  gt: Keypoint[],
  bboxDiagPixels: number,
  alpha = 0.1
): number {
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