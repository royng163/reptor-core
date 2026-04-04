export interface Keypoint {
  x: number; // in source pixel space
  y: number;
  z?: number;
  visibility: number; // [0, 1]
  presence?: number; // [0, 1]
  name?: string;
}

export interface PoseResult {
  keypoints: Keypoint[];
  keypoints3D?: Keypoint[];
  timestamp: number;
}

export interface FrameKeypoints {
  hip_left: { x: number; y: number };
  hip_right: { x: number; y: number };
  ankle_left: { x: number; y: number };
  ankle_right: { x: number; y: number };
}

export type ErrorType =
  | "INSUFFICIENT_RANGE"
  | "BAD_ALIGNMENT"
  | "BAD_SETUP"
  | "ASYMMETRY"
  | "INSTABILITY"
  | "MOMENTUM_CHEAT"
  | "BAD_TEMPO";

export type RuleType = "range" | "alignment" | "symmetry" | "stability" | "tempo" | "duration";
export type ViewType = "front" | "side" | "45_degree";
export type ComparatorType = "ABOVE" | "BELOW" | "MEAN" | "STD" | "SUM";
export type PhaseType = "CONCENTRIC" | "ECCENTRIC" | "IDLE";
export type IntervalType = "FRAME" | "PHASE" | "REP";

export interface ViewThresholds {
  front?: number;
  side?: number;
  "45_degree"?: number;
}

export interface RuleConfig {
  id: string;
  error_type: ErrorType;
  template: RuleType;
  comparator?: ComparatorType;
  phases?: PhaseType[];
  interval: IntervalType;
  views: ViewType[];
  description?: string;
  weight?: number;
  feature?: string;
  feature_left?: string;
  feature_right?: string;
  thresholds?: ViewThresholds;
}

export interface ExerciseConfig {
  exercise_id: number;
  exercise_name: string;
  rules: RuleConfig[];
}

export interface RuleEngineOptions {
  view?: ViewType;
  thresholds?: ViewThresholds;
  errorTriggerFrames?: number;
  errorClearFrames?: number;
  meanTolerance?: number;
}

// Data accumulated over a single rep, keyed by feature name
export interface RepAggregates {
  [key: string]: number;
}

// Data accumulated per phase, keyed by phase then feature name
export interface PhaseAggregates {
  CONCENTRIC: { [key: string]: number };
  ECCENTRIC: { [key: string]: number };
  IDLE: { [key: string]: number };
}

export interface Feedback {
  ruleId: string;
  errorType: ErrorType;
  passed: boolean;
  value: number;
  threshold: number;
  direction?: "low" | "high";
  weight?: number;
}

export interface FrameData {
  knee_flexion: number;
  knee_flexion_left: number;
  knee_flexion_right: number;
  trunk_angle: number;
  stance_width: number;
  [key: string]: number;
}
