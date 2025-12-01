import { RepAggregates, PhaseAggregates, PhaseType } from "../types";

export class FeatureAggregator {
  private currentPhase: PhaseType = "IDLE";

  // Rep-level aggregates
  private repData: { [key: string]: number[] } = {};

  // Phase-level aggregates
  private phaseData: {
    IDLE: { [key: string]: number[] };
    DESCENDING: { [key: string]: number[] };
    ASCENDING: { [key: string]: number[] };
  } = {
    IDLE: {},
    DESCENDING: {},
    ASCENDING: {},
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
   * Convenience method to record common squat features.
   */
  processFrame(kneeFlexionLeft: number, kneeFlexionRight: number, trunkAngle: number, stanceWidth: number): void {
    const kneeFlexion = (kneeFlexionLeft + kneeFlexionRight) / 2;

    this.recordFeature("knee_flexion", kneeFlexion);
    this.recordFeature("knee_flexion_left", kneeFlexionLeft);
    this.recordFeature("knee_flexion_right", kneeFlexionRight);
    this.recordFeature("trunk_angle", trunkAngle);
    this.recordFeature("stance_width", stanceWidth);
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
      DESCENDING: {},
      ASCENDING: {},
    };

    for (const phase of ["IDLE", "DESCENDING", "ASCENDING"] as PhaseType[]) {
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
      DESCENDING: {},
      ASCENDING: {},
    };
  }
}
