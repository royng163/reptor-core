import { ExerciseConfig, RepAggregates, PhaseAggregates, Feedback, ViewType, RuleConfig } from "../types";

export interface FrameData {
  knee_flexion: number;
  knee_flexion_left: number;
  knee_flexion_right: number;
  trunk_angle: number;
  stance_width: number;
  [key: string]: number;
}

export class RuleEngine {
  private currentView: ViewType = "front";

  // Buffer for frame-level stability calculations
  private frameBuffer: { [feature: string]: number[] } = {};
  private frameFeedbacks: Feedback[] = [];

  // Debouncing for frame-level errors
  private errorCounts: { [ruleId: string]: number } = {};
  private passCounts: { [ruleId: string]: number } = {};
  private activeErrors: { [ruleId: string]: boolean } = {};

  // Configuration for debouncing
  private readonly ERROR_TRIGGER_FRAMES = 5; // Consecutive error frames to trigger
  private readonly ERROR_CLEAR_FRAMES = 10; // Consecutive pass frames to clear

  // Tolerance percentage for "mean" comparator (e.g., 0.2 = 20% deviation allowed)
  private readonly MEAN_TOLERANCE = 0.2;

  constructor(private config: ExerciseConfig) {}

  /**
   * Sets the current camera view for threshold selection.
   */
  setView(view: ViewType): void {
    this.currentView = view;
  }

  /**
   * Gets the current camera view.
   */
  getView(): ViewType {
    return this.currentView;
  }

  /**
   * Gets the threshold for a rule based on the current view.
   */
  private getThreshold(rule: RuleConfig): number | undefined {
    if (rule.type === "range") {
      return rule.thresholds?.[this.currentView];
    } else if (rule.type === "symmetry") {
      return rule.maxDiff?.[this.currentView];
    } else if (rule.type === "stability") {
      return rule.maxStd?.[this.currentView];
    }
    return undefined;
  }

  /**
   * Calculates standard deviation of an array of numbers.
   */
  private calcStd(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Evaluates if a value passes the rule based on comparator and threshold.
   */
  private evaluateComparator(
    rule: RuleConfig,
    value: number,
    threshold: number
  ): { passed: boolean; direction?: "low" | "high" } {
    switch (rule.comparator) {
      case "min":
        // For "min" comparator, value should be <= threshold (e.g., depth check)
        return { passed: value <= threshold };
      case "max":
        // For "max" comparator, value should be <= threshold (e.g., lockout, forward lean)
        return { passed: value <= threshold };
      case "mean":
        // For "mean" comparator, allow some tolerance around the threshold
        const lowerBound = threshold * (1 - this.MEAN_TOLERANCE);
        const upperBound = threshold * (1 + this.MEAN_TOLERANCE);
        if (value < lowerBound) {
          return { passed: false, direction: "low" };
        } else if (value > upperBound) {
          return { passed: false, direction: "high" };
        }
        return { passed: true };
      case "std":
        // For "std" comparator, standard deviation should be <= threshold
        return { passed: value <= threshold };
      default:
        return { passed: true };
    }
  }

  /**
   * Updates debounce counters and returns debounced pass/fail state.
   */
  private updateDebounce(ruleId: string, instantPassed: boolean): boolean {
    // Initialize counters if needed
    if (this.errorCounts[ruleId] === undefined) {
      this.errorCounts[ruleId] = 0;
      this.passCounts[ruleId] = 0;
      this.activeErrors[ruleId] = false;
    }

    if (instantPassed) {
      // Reset error count, increment pass count
      this.errorCounts[ruleId] = 0;
      this.passCounts[ruleId]++;

      // Clear active error after enough consecutive passes
      if (this.activeErrors[ruleId] && this.passCounts[ruleId] >= this.ERROR_CLEAR_FRAMES) {
        this.activeErrors[ruleId] = false;
      }
    } else {
      // Reset pass count, increment error count
      this.passCounts[ruleId] = 0;
      this.errorCounts[ruleId]++;

      // Trigger error after enough consecutive failures
      if (this.errorCounts[ruleId] >= this.ERROR_TRIGGER_FRAMES) {
        this.activeErrors[ruleId] = true;
      }
    }

    // Return debounced state: error is active only after debounce threshold
    return !this.activeErrors[ruleId];
  }

  /**
   * Evaluate frame-level rules for instant feedback.
   * Call this every frame during exercise.
   */
  evaluateFrame(frameData: FrameData, currentPhase: string): Feedback[] {
    const feedbacks: Feedback[] = [];

    for (const rule of this.config.rules) {
      // Only process frame-level rules
      if (rule.evaluation !== "FRAME") continue;

      // Skip if not in target phase (if specified)
      if (rule.targetPhase && rule.targetPhase !== currentPhase && rule.targetPhase !== "IDLE") {
        // Also update debounce to clear errors when not in target phase
        this.updateDebounce(rule.id, true);
        continue;
      }

      const threshold = this.getThreshold(rule);
      if (threshold === undefined) continue;

      let measuredValue: number;
      let evalResult: { passed: boolean; direction?: "low" | "high" };

      if (rule.type === "symmetry") {
        // Symmetry check: compare left vs right
        const left = frameData[rule.feature_left!] ?? NaN;
        const right = frameData[rule.feature_right!] ?? NaN;
        measuredValue = Math.abs(left - right);
        evalResult = this.evaluateComparator(rule, measuredValue, threshold);
      } else if (rule.type === "stability") {
        // Stability check: accumulate values and check std dev
        const feature = rule.feature!;
        const value = frameData[feature] ?? NaN;

        if (!isNaN(value)) {
          if (!this.frameBuffer[feature]) {
            this.frameBuffer[feature] = [];
          }
          this.frameBuffer[feature].push(value);

          // Only evaluate if we have enough samples
          if (this.frameBuffer[feature].length >= 10) {
            measuredValue = this.calcStd(this.frameBuffer[feature]);
            evalResult = this.evaluateComparator(rule, measuredValue, threshold);
          } else {
            // Not enough data yet
            continue;
          }
        } else {
          continue;
        }
      } else if (rule.type === "range") {
        // Range check: instant value comparison
        measuredValue = frameData[rule.feature!] ?? NaN;
        if (isNaN(measuredValue)) continue;
        evalResult = this.evaluateComparator(rule, measuredValue, threshold);
      } else {
        continue;
      }

      // Apply debouncing
      const debouncedPassed = this.updateDebounce(rule.id, evalResult.passed);

      feedbacks.push({
        ruleId: rule.id,
        errorType: rule.error_type,
        passed: debouncedPassed,
        value: measuredValue,
        threshold,
        direction: evalResult.direction,
      });
    }

    // Store for final rep evaluation
    this.frameFeedbacks = feedbacks;
    return feedbacks;
  }

  /**
   * Gets the measured value for a rule from the appropriate data source.
   */
  private getMeasuredValue(rule: RuleConfig, repData: RepAggregates, phaseData?: PhaseAggregates): number {
    if (rule.evaluation === "PHASE" && phaseData) {
      const phaseValues = phaseData[rule.targetPhase!];
      if (!phaseValues) return NaN;

      if (rule.type === "symmetry") {
        const left = phaseValues[rule.feature_left!] ?? NaN;
        const right = phaseValues[rule.feature_right!] ?? NaN;
        return left - right;
      }

      // Get the appropriate aggregated value based on comparator
      const feature = rule.feature!;
      if (rule.comparator === "min") {
        return phaseValues[`${feature}_min`] ?? phaseValues[feature] ?? NaN;
      } else if (rule.comparator === "max") {
        return phaseValues[`${feature}_max`] ?? phaseValues[feature] ?? NaN;
      } else if (rule.comparator === "mean") {
        return phaseValues[`${feature}_mean`] ?? phaseValues[feature] ?? NaN;
      } else if (rule.comparator === "std") {
        return phaseValues[`${feature}_std`] ?? NaN;
      }

      return phaseValues[feature] ?? NaN;
    }

    // rep-level evaluation
    if (rule.type === "symmetry") {
      const left = repData[rule.feature_left!] ?? NaN;
      const right = repData[rule.feature_right!] ?? NaN;
      return left - right;
    }

    const feature = rule.feature!;
    if (rule.comparator === "min") {
      return repData[`${feature}_min`] ?? repData[feature] ?? NaN;
    } else if (rule.comparator === "max") {
      return repData[`${feature}_max`] ?? repData[feature] ?? NaN;
    } else if (rule.comparator === "mean") {
      return repData[`${feature}_mean`] ?? repData[feature] ?? NaN;
    } else if (rule.comparator === "std") {
      return repData[`${feature}_std`] ?? NaN;
    }

    return repData[feature] ?? NaN;
  }

  /**
   * Evaluate rules using both rep-level and phase-level aggregates.
   */
  evaluateWithPhases(repData: RepAggregates, phaseData?: PhaseAggregates): Feedback[] {
    const feedbacks: Feedback[] = [];

    for (const rule of this.config.rules) {
      const threshold = this.getThreshold(rule);

      // Skip rule if no threshold for current view
      if (threshold === undefined) {
        continue;
      }

      // Handle frame-level rules from accumulated data
      if (rule.evaluation === "FRAME") {
        const frameFeedback = this.frameFeedbacks.find((f) => f.ruleId === rule.id);
        if (frameFeedback) {
          feedbacks.push(frameFeedback);
        }
        continue;
      }

      // Skip phase-evaluation rules if no phase data provided
      if (rule.evaluation === "PHASE" && !phaseData) {
        continue;
      }

      const measuredValue = this.getMeasuredValue(rule, repData, phaseData);

      // Skip if value couldn't be calculated
      if (isNaN(measuredValue)) {
        continue;
      }

      // For symmetry rules, compare absolute difference
      const valueToCompare = rule.type === "symmetry" ? Math.abs(measuredValue) : measuredValue;

      const evalResult = this.evaluateComparator(rule, valueToCompare, threshold);

      feedbacks.push({
        ruleId: rule.id,
        errorType: rule.error_type,
        passed: evalResult.passed,
        value: measuredValue,
        threshold,
        direction: evalResult.direction,
      });
    }

    return feedbacks;
  }

  /**
   * Resets frame-level buffers. Call this at the start of each rep.
   */
  reset(): void {
    this.frameBuffer = {};
    this.frameFeedbacks = [];
    // Keep debounce state across reps for continuous feedback
  }

  /**
   * Full reset including debounce state. Call when starting a new exercise session.
   */
  fullReset(): void {
    this.frameBuffer = {};
    this.frameFeedbacks = [];
    this.errorCounts = {};
    this.passCounts = {};
    this.activeErrors = {};
  }
}
