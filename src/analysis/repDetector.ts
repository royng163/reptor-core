import { ExerciseId, PhaseType } from "../types";

export const EXERCISE_IDS: ExerciseId[] = ["squat", "bicep_curl", "shoulder_press", "bench_press", "lat_pulldown"];

export class RepDetector {
  private readonly exerciseId: ExerciseId;
  private state: PhaseType = "IDLE";
  private valueHistory: number[] = [];
  private readonly historySize = 10;
  private readonly minRepFrames = 10;
  private pendingStart: number | null = null;
  private startValue: number | null = null;

  constructor(exerciseId: ExerciseId) {
    if (!EXERCISE_IDS.includes(exerciseId)) {
      throw new Error(`Unsupported exercise_id: ${exerciseId}`);
    }
    this.exerciseId = exerciseId;
  }

  /**
   * Extracts the primary value for rep detection based on exercise type.
   * Returns the angle value used to detect reps.
   */
  private getPrimaryValue(features: {
    knee_flexion_left?: number;
    knee_flexion_right?: number;
    elbow_flexion_left?: number;
    elbow_flexion_right?: number;
  }): number | null {
    if (this.exerciseId === "squat") {
      const left = features.knee_flexion_left;
      const right = features.knee_flexion_right;
      if (left == null || right == null) return null;
      return 0.5 * (left + right);
    }
    // bicep_curl, shoulder_press, bench_press, lat_pulldown all use elbow flexion
    const left = features.elbow_flexion_left;
    const right = features.elbow_flexion_right;
    if (left == null || right == null) return null;
    return 0.5 * (left + right);
  }

  /**
   * Get threshold for this exercise
   */
  private getThreshold(): number {
    switch (this.exerciseId) {
      case "squat":
        return 5;
      case "bicep_curl":
        return 10;
      case "shoulder_press":
        return 6;
      case "bench_press":
        return 5;
      case "lat_pulldown":
        return 6;
      default:
        return 5;
    }
  }

  /**
   * Get completion tolerance to consider "back to start"
   */
  private getCompletionTolerance(): number {
    return this.getThreshold() * 3;
  }

  /**
   * Gets average of most recent N frames.
   */
  private getRecentAverage(n: number): number {
    const recent = this.valueHistory.slice(-n);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  /**
   * Gets average of frames before the most recent N frames.
   */
  private getOlderAverage(n: number): number {
    const older = this.valueHistory.slice(0, -n);
    if (older.length === 0) return this.valueHistory[0];
    return older.reduce((a, b) => a + b, 0) / older.length;
  }

  /**
   * Detects the current phase based on primary value.
   * @param features - Frame features with flexion angles
   * @param frameIdx - Current frame index
   */
  detect(
    features: {
      knee_flexion_left?: number;
      knee_flexion_right?: number;
      elbow_flexion_left?: number;
      elbow_flexion_right?: number;
    },
    frameIdx: number,
  ): {
    state: PhaseType;
    isRepFinished: boolean;
    velocity: number;
  } {
    let isRepFinished = false;
    const value = this.getPrimaryValue(features);

    if (value == null) {
      return {
        state: this.state,
        isRepFinished,
        velocity: 0,
      };
    }

    this.valueHistory.push(value);
    if (this.valueHistory.length > this.historySize) {
      this.valueHistory.shift();
    }

    // Need enough history to calculate movement
    if (this.valueHistory.length < 3) {
      return { state: this.state, isRepFinished, velocity: 0 };
    }

    // Calculate smoothed velocity
    const recentAvg = this.getRecentAverage(3);
    const olderAvg = this.getOlderAverage(3);
    const velocity = recentAvg - olderAvg;
    const threshold = this.getThreshold();

    // Determine velocity direction based on exercise type
    const isConcentricDownwardExercise =
      this.exerciseId === "squat" || this.exerciseId === "bicep_curl" || this.exerciseId === "lat_pulldown";

    switch (this.state) {
      case "IDLE":
        if (isConcentricDownwardExercise) {
          if (velocity < -threshold) {
            this.state = "CONCENTRIC";
            this.pendingStart = frameIdx;
            this.startValue = this.valueHistory[this.valueHistory.length - 3]; // Slightly older value as start
          }
        } else {
          if (velocity > threshold) {
            this.state = "CONCENTRIC";
            this.pendingStart = frameIdx;
            this.startValue = this.valueHistory[this.valueHistory.length - 3];
          }
        }
        break;

      case "CONCENTRIC":
        // Transition to eccentric based on exercise type
        if (isConcentricDownwardExercise) {
          if (velocity > threshold) {
            this.state = "ECCENTRIC";
          }
        } else {
          if (-velocity > threshold) {
            this.state = "ECCENTRIC";
          }
        }
        break;

      case "ECCENTRIC":
        // Check for rep completion
        if (Math.abs(velocity) < threshold / 3 && this.startValue != null) {
          if (Math.abs(value - this.startValue) < this.getCompletionTolerance()) {
            // Check minimum rep frames
            if (this.pendingStart != null && frameIdx - this.pendingStart >= this.minRepFrames) {
              isRepFinished = true;
            }
            this.state = "IDLE";
            this.pendingStart = null;
            this.startValue = null;
          }
        } else if (velocity > threshold) {
          // Started going back down - restart concentric
          this.state = "CONCENTRIC";
          this.startValue = this.valueHistory[this.valueHistory.length - 3];
        }
        break;
    }

    return { state: this.state, isRepFinished, velocity };
  }

  /**
   * Gets the current state.
   */
  getState(): PhaseType {
    return this.state;
  }

  /**
   * Resets the detector for a new set.
   */
  reset(): void {
    this.state = "IDLE";
    this.valueHistory = [];
    this.pendingStart = null;
    this.startValue = null;
  }
}
