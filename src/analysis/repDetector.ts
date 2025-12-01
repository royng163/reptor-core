import { PhaseType } from "../types";

export class RepDetector {
  private state: PhaseType = "IDLE";
  private hipYHistory: number[] = [];

  // Thresholds for vertical movement detection (in pixels)
  private readonly MOVEMENT_THRESHOLD = 7; // Minimum movement to detect phase change
  private readonly HISTORY_SIZE = 10; // Frames to average for smoothing

  /**
   * Detects the current phase based on hip vertical position.
   * @param hipY - The Y coordinate of the hip (midpoint of left and right hip)
   */
  detect(hipY: number): {
    state: PhaseType;
    isRepFinished: boolean;
    velocity: number;
  } {
    let isRepFinished = false;

    this.hipYHistory.push(hipY);
    if (this.hipYHistory.length > this.HISTORY_SIZE) {
      this.hipYHistory.shift();
    }

    // Guard against NaN or undefined hipY
    if (isNaN(hipY) || hipY === undefined) {
      return {
        state: this.state,
        isRepFinished,
        velocity: 0,
      };
    }

    // Need enough history to calculate movement
    if (this.hipYHistory.length < 3) {
      return { state: this.state, isRepFinished, velocity: 0 };
    }

    // Calculate smoothed velocity (positive = moving down, negative = moving up)
    const recentAvg = this.getRecentAverage(3);
    const olderAvg = this.getOlderAverage(3);
    const velocity = recentAvg - olderAvg;

    switch (this.state) {
      case "IDLE":
        // If hip moves down significantly, start descending
        if (velocity > this.MOVEMENT_THRESHOLD) {
          this.state = "DESCENDING";
        }
        break;

      case "DESCENDING":
        // If hip starts moving up, switch to ascending
        if (velocity < -this.MOVEMENT_THRESHOLD) {
          this.state = "ASCENDING";
        }
        break;

      case "ASCENDING":
        // If hip reaches near starting position or stops moving up
        if (velocity > this.MOVEMENT_THRESHOLD) {
          // Started going back down
          this.state = "DESCENDING";
        } else if (Math.abs(velocity) < this.MOVEMENT_THRESHOLD / 2) {
          // Stopped moving - rep complete
          const startY = this.hipYHistory[0];
          const currentY = hipY;
          // Check if returned to approximately starting position
          if (Math.abs(currentY - startY) < this.MOVEMENT_THRESHOLD * 2) {
            this.state = "IDLE";
            isRepFinished = true;
          }
        }
        break;
    }

    return { state: this.state, isRepFinished, velocity };
  }

  /**
   * Gets average of most recent N frames.
   */
  private getRecentAverage(n: number): number {
    const recent = this.hipYHistory.slice(-n);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  /**
   * Gets average of frames before the most recent N frames.
   */
  private getOlderAverage(n: number): number {
    const older = this.hipYHistory.slice(0, -n);
    if (older.length === 0) return this.hipYHistory[0];
    return older.reduce((a, b) => a + b, 0) / older.length;
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
    this.hipYHistory = [];
  }
}
