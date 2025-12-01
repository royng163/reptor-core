import { Keypoint } from "../types";

/**
 * Checks if a keypoint is valid (not null/undefined and has x, y coordinates).
 */
export function isValidKeypoint(keypoint: Keypoint | undefined | null): keypoint is Keypoint {
  return (
    keypoint !== undefined && keypoint !== null && typeof keypoint.x === "number" && typeof keypoint.y === "number"
  );
}

/**
 * Calculates the 2D angle (in degrees) at point B formed by points A-B-C.
 * Returns the interior angle at the middle point (B).
 * Returns NaN if any keypoint is invalid.
 */
export function calculateAngle(a: Keypoint | undefined, b: Keypoint | undefined, c: Keypoint | undefined): number {
  if (!isValidKeypoint(a) || !isValidKeypoint(b) || !isValidKeypoint(c)) {
    return NaN;
  }

  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };

  const dotProduct = ba.x * bc.x + ba.y * bc.y;
  const magnitudeBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magnitudeBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);

  if (magnitudeBA === 0 || magnitudeBC === 0) {
    return 0;
  }

  const cosAngle = Math.max(-1, Math.min(1, dotProduct / (magnitudeBA * magnitudeBC)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

/**
 * Calculates the 3D angle (in degrees) at point B formed by points A-B-C.
 * Falls back to 2D if z coordinates are not available.
 * Returns NaN if any keypoint is invalid.
 */
export function calculateAngle3D(a: Keypoint | undefined, b: Keypoint | undefined, c: Keypoint | undefined): number {
  if (!isValidKeypoint(a) || !isValidKeypoint(b) || !isValidKeypoint(c)) {
    return NaN;
  }

  if (a.z === undefined || b.z === undefined || c.z === undefined) {
    return calculateAngle(a, b, c);
  }

  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };

  const dotProduct = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magnitudeBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
  const magnitudeBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);

  if (magnitudeBA === 0 || magnitudeBC === 0) {
    return 0;
  }

  const cosAngle = Math.max(-1, Math.min(1, dotProduct / (magnitudeBA * magnitudeBC)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

/**
 * Returns the midpoint between two keypoints.
 */
export function midpoint(a: Keypoint, b: Keypoint): Keypoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: a.z !== undefined && b.z !== undefined ? (a.z + b.z) / 2 : undefined,
    visibility:
      a.visibility !== undefined && b.visibility !== undefined ? (a.visibility + b.visibility) / 2 : undefined,
  };
}
