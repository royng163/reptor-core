export type Platform = "web" | "ios" | "android";

export interface Keypoint {
  x: number; // in source pixel space
  y: number;
  z?: number;
  visibility?: number; // [0, 1]
  name?: string;
}

export interface PoseResult {
  keypoints: Keypoint[];
  keypoints3D?: Keypoint[];
  timestamp?: number;
}

export interface FrameInfo {
  width: number;
  height: number;
  timestamp?: number;
}
