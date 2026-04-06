import { Keypoint, RepAggregates, PhaseAggregates, PhaseType, FrameData, ExerciseId } from "../types";
import { calculateAngle } from "../utils/geometry";

const EXERCISE_FEATURES: Record<ExerciseId, string[]> = {
  squat: [
    "knee_flexion_left",
    "knee_flexion_right",
    "knee_joint_center_x_offset",
    "stance_width_normalized",
    "stance_width",
    "trunk_angle",
    "hip_flexion_symmetry",
  ],
  bicep_curl: ["elbow_flexion_left", "elbow_flexion_right", "elbow_to_shoulder_y_left", "torso_tilt"],
  shoulder_press: [
    "elbow_flexion_left",
    "elbow_flexion_right",
    "wrist_to_shoulder_y_left",
    "wrist_to_shoulder_y_right",
    "trunk_angle",
  ],
  bench_press: [
    "elbow_flexion_left",
    "elbow_flexion_right",
    "wrist_to_shoulder_y_left",
    "wrist_to_shoulder_y_right",
    "trunk_angle",
  ],
  lat_pulldown: ["wrist_to_shoulder_y_left", "wrist_to_shoulder_y_right", "torso_tilt"],
};

export class FeatureAggregator {
  private currentPhase: PhaseType = "IDLE";

  // Rep-level aggregates
  private repData: { [key: string]: number[] } = {};

  // Phase-level aggregates
  private phaseData: {
    IDLE: { [key: string]: number[] };
    CONCENTRIC: { [key: string]: number[] };
    ECCENTRIC: { [key: string]: number[] };
  } = {
    IDLE: {},
    CONCENTRIC: {},
    ECCENTRIC: {},
  };

  /**
   * Sets the current phase for aggregation.
   */
  setPhase(phase: PhaseType): void {
    this.currentPhase = phase;
  }

  /**
   * Records a feature value for the current frame.
   * Automatically aggregates at both rep and phase level.
   */
  recordFeature(featureName: string, value: number): void {
    if (isNaN(value)) return;

    // Rep-level
    if (!this.repData[featureName]) {
      this.repData[featureName] = [];
    }
    this.repData[featureName].push(value);

    // Phase-level
    if (!this.phaseData[this.currentPhase][featureName]) {
      this.phaseData[this.currentPhase][featureName] = [];
    }
    this.phaseData[this.currentPhase][featureName].push(value);
  }

  /**
   * Calculates min value from an array.
   */
  private calcMin(values: number[]): number {
    return values.length > 0 ? Math.min(...values) : NaN;
  }

  /**
   * Calculates max value from an array.
   */
  private calcMax(values: number[]): number {
    return values.length > 0 ? Math.max(...values) : NaN;
  }

  /**
   * Calculates mean value from an array.
   */
  private calcMean(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  }

  /**
   * Calculates standard deviation from an array.
   */
  private calcStd(values: number[]): number {
    if (values.length === 0) return NaN;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Gets rep-level aggregates with all comparator types.
   */
  getRepAggregates(): RepAggregates {
    const result: RepAggregates = {};

    for (const [feature, values] of Object.entries(this.repData)) {
      result[`${feature}_min`] = this.calcMin(values);
      result[`${feature}_max`] = this.calcMax(values);
      result[`${feature}_mean`] = this.calcMean(values);
      result[`${feature}_std`] = this.calcStd(values);
      // Also include raw feature name with mean for convenience
      result[feature] = values.reduce((a, b) => a + b, 0) / values.length;
    }

    return result;
  }

  /**
   * Gets phase-level aggregates with all comparator types.
   */
  getPhaseAggregates(): PhaseAggregates {
    const result: PhaseAggregates = {
      IDLE: {},
      CONCENTRIC: {},
      ECCENTRIC: {},
    };

    for (const phase of ["IDLE", "CONCENTRIC", "ECCENTRIC"] as const) {
      for (const [feature, values] of Object.entries(this.phaseData[phase])) {
        result[phase][`${feature}_min`] = this.calcMin(values);
        result[phase][`${feature}_max`] = this.calcMax(values);
        result[phase][`${feature}_mean`] = this.calcMean(values);
        result[phase][`${feature}_std`] = this.calcStd(values);
        result[phase][feature] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
      }
    }

    return result;
  }

  /**
   * Resets all aggregated data for a new rep.
   */
  reset(): void {
    this.currentPhase = "IDLE";
    this.repData = {};
    this.phaseData = {
      IDLE: {},
      CONCENTRIC: {},
      ECCENTRIC: {},
    };
  }

  /**
   * Extracts features from keypoints for a given exercise and records them.
   */
  extractFeatures(keypoints: Map<string, Keypoint>, exerciseId: ExerciseId): FrameData {
    const lk = keypoints.get("left_knee");
    const rk = keypoints.get("right_knee");
    const lh = keypoints.get("left_hip");
    const rh = keypoints.get("right_hip");
    const la = keypoints.get("left_ankle");
    const ra = keypoints.get("right_ankle");
    const ls = keypoints.get("left_shoulder");
    const rs = keypoints.get("right_shoulder");
    const le = keypoints.get("left_elbow");
    const re = keypoints.get("right_elbow");
    const lw = keypoints.get("left_wrist");
    const rw = keypoints.get("right_wrist");

    const kneeFlexionLeft = calculateAngle(lh, lk, la);
    const kneeFlexionRight = calculateAngle(rh, rk, ra);
    const kneeFlexion = (kneeFlexionLeft + kneeFlexionRight) / 2;

    const elbowFlexionLeft = calculateAngle(ls, le, lw);
    const elbowFlexionRight = calculateAngle(rs, re, rw);

    const trunkAngleLeft = calculateAngle(lh, ls, undefined);
    const trunkAngleRight = calculateAngle(rh, rs, undefined);
    const trunkAngle = (trunkAngleLeft + trunkAngleRight) / 2;

    const hipWidth = Math.abs((rh?.x ?? 0) - (lh?.x ?? 0));
    const stanceWidth = Math.abs((ra?.x ?? 0) - (la?.x ?? 0));
    const stanceWidthNormalized = hipWidth > 0 ? stanceWidth / hipWidth : NaN;

    const kneeJointCenterXOffset = Math.abs((lk?.x ?? 0) - (rk?.x ?? 0));
    const hipFlexionSymmetry = Math.abs((lh?.y ?? 0) - (rh?.y ?? 0));
    const elbowToShoulderYLeft = (le?.y ?? 0) - (ls?.y ?? 0);
    const wristToShoulderYLeft = (lw?.y ?? 0) - (ls?.y ?? 0);
    const wristToShoulderYRight = (rw?.y ?? 0) - (rs?.y ?? 0);
    const shoulderCenterX = ((ls?.x ?? 0) + (rs?.x ?? 0)) / 2;
    const hipCenterX = ((lh?.x ?? 0) + (rh?.x ?? 0)) / 2;
    const torsoTilt = Math.abs(shoulderCenterX - hipCenterX);

    const frameData: FrameData = {
      knee_flexion: kneeFlexion,
      knee_flexion_left: kneeFlexionLeft,
      knee_flexion_right: kneeFlexionRight,
      elbow_flexion_left: elbowFlexionLeft,
      elbow_flexion_right: elbowFlexionRight,
      knee_joint_center_x_offset: kneeJointCenterXOffset,
      stance_width_normalized: stanceWidthNormalized,
      stance_width: stanceWidth,
      trunk_angle: trunkAngle,
      hip_flexion_symmetry: hipFlexionSymmetry,
      elbow_to_shoulder_y_left: elbowToShoulderYLeft,
      torso_tilt: torsoTilt,
      wrist_to_shoulder_y_left: wristToShoulderYLeft,
      wrist_to_shoulder_y_right: wristToShoulderYRight,
    };

    const supportedFeatures = EXERCISE_FEATURES[exerciseId];
    if (supportedFeatures) {
      for (const feature of supportedFeatures) {
        const value = frameData[feature];
        if (value !== undefined) {
          this.recordFeature(feature, value);
        }
      }
    }

    return frameData;
  }
}
