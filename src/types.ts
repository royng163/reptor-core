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

export type RuleType = "range" | "symmetry" | "stability";

export type ViewType = "front" | "side";

export type ComparatorType = "min" | "max" | "mean" | "std";

export type PhaseType = "IDLE" | "DESCENDING" | "ASCENDING";

export type EvaluationType = "PHASE" | "REP" | "FRAME";

export interface ViewThresholds {
  front?: number;
  side?: number;
}

export interface RuleConfig {
  id: string;
  error_type: string;
  type: RuleType;
  comparator: ComparatorType;
  targetPhase: PhaseType;
  evaluation: EvaluationType;
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
  IDLE: { [key: string]: number };
  DESCENDING: { [key: string]: number };
  ASCENDING: { [key: string]: number };
}

export interface Feedback {
  ruleId: string;
  errorType: string;
  passed: boolean;
  value: number;
  threshold: number;
  direction?: "low" | "high";
}
