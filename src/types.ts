export interface Keypoint {
  x: number; // in source pixel space
  y: number;
  z?: number;
  visibility: number; // [0, 1]
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
  error_type: string;
  type: RuleType;
  comparator: ComparatorType;
  targetPhase: PhaseType;
  evaluation: IntervalType;
  feature?: string;
  // View-specific thresholds
  thresholds?: ViewThresholds;
  maxDiff?: ViewThresholds;
  maxStd?: ViewThresholds;
  // For symmetry rules
  feature_left?: string;
  feature_right?: string;
}

export interface ExerciseConfig {
  exercise_id: number;
  exercise_name: string;
  rules: RuleConfig[];
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
  errorType: string;
  passed: boolean;
  value: number;
  threshold: number;
  direction?: "low" | "high";
}
